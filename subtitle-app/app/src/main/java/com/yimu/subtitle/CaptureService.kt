package com.yimu.subtitle

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioPlaybackCaptureConfiguration
import android.media.AudioRecord
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlin.math.sqrt

/**
 * 后台服务：捕获其他 App 正在播放的声音 → 本地识别英文 → DeepSeek 翻译 → 悬浮字幕。
 */
class CaptureService : Service() {

    private val main = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private var projection: MediaProjection? = null
    private var record: AudioRecord? = null
    private var worker: Thread? = null
    @Volatile private var running = false
    private var overlay: SubtitleOverlay? = null

    private lateinit var pipeline: TranslationPipeline

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        pipeline = TranslationPipeline(this, scope)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopEverything()
                return START_NOT_STICKY
            }
            ACTION_TOGGLE_MODE -> {
                Prefs.setZhOnly(this, !Prefs.zhOnly(this))
                overlay?.refresh()
                return START_NOT_STICKY
            }
            ACTION_START -> {
                if (running) return START_NOT_STICKY
                val resultCode = intent.getIntExtra(EXTRA_CODE, 0)
                val data: Intent? = if (Build.VERSION.SDK_INT >= 33) {
                    intent.getParcelableExtra(EXTRA_DATA, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION") intent.getParcelableExtra(EXTRA_DATA)
                }
                // 必须先变成前台服务，系统才允许拿到"捕获声音"的授权
                goForeground()
                if (data == null || !start(resultCode, data)) stopEverything()
            }
        }
        return START_NOT_STICKY
    }

    private fun goForeground() {
        val n = buildNotification()
        val projectionType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                startForeground(NOTIF_ID, n, projectionType or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
                return
            } catch (e: Exception) {
                Log.w(TAG, "microphone service type rejected", e)
            }
        }
        startForeground(NOTIF_ID, n, projectionType)
    }

    @SuppressLint("MissingPermission")
    private fun start(resultCode: Int, data: Intent): Boolean {
        val mpm = getSystemService(MediaProjectionManager::class.java)
        val mp = try {
            mpm.getMediaProjection(resultCode, data)
        } catch (e: Exception) {
            Log.e(TAG, "getMediaProjection", e)
            null
        } ?: return notice("没有获得屏幕声音授权，请重试")
        projection = mp
        mp.registerCallback(object : MediaProjection.Callback() {
            override fun onStop() {
                main.post { stopEverything() }
            }
        }, main)

        val capture = AudioPlaybackCaptureConfiguration.Builder(mp)
            .addMatchingUsage(AudioAttributes.USAGE_MEDIA)
            .addMatchingUsage(AudioAttributes.USAGE_GAME)
            .addMatchingUsage(AudioAttributes.USAGE_UNKNOWN)
            .build()

        // 优先直接按 16kHz 采集；个别机型不支持时退回 48kHz 再降采样
        var rate = AsrEngine.SAMPLE_RATE
        var rec = buildRecord(capture, rate)
        if (rec == null) {
            rate = 48_000
            rec = buildRecord(capture, rate)
        }
        if (rec == null) return notice("无法捕获系统声音（这台设备可能不支持）")
        record = rec

        overlay = SubtitleOverlay(this).also { it.show() }
        running = true
        SubtitleBus.update { it.copy(running = true, partial = "", liveZh = "", liveTail = "", level = 0f, notice = "正在加载识别模型…") }
        pipeline.start()

        worker = Thread({ captureLoop(rec, rate) }, "yimu-asr").apply { start() }
        return true
    }

    @SuppressLint("MissingPermission")
    private fun buildRecord(capture: AudioPlaybackCaptureConfiguration, rate: Int): AudioRecord? = try {
        val format = AudioFormat.Builder()
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setSampleRate(rate)
            .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
            .build()
        val min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        AudioRecord.Builder()
            .setAudioFormat(format)
            .setBufferSizeInBytes(maxOf(min, rate)) // 16 位单声道下约 0.5 秒缓冲
            .setAudioPlaybackCaptureConfig(capture)
            .build()
            .takeIf { it.state == AudioRecord.STATE_INITIALIZED }
    } catch (e: Exception) {
        Log.w(TAG, "AudioRecord at $rate failed", e)
        null
    }

    private fun captureLoop(rec: AudioRecord, rate: Int) {
        // 模型约 180 MB，放在后台线程加载，避免界面卡顿
        val engine = try {
            AsrEngine(this)
        } catch (e: Throwable) {
            Log.e(TAG, "asr", e)
            rec.release()
            main.post {
                notice("语音识别模型加载失败，请在主页重新下载模型")
                stopEverything()
            }
            return
        }
        SubtitleBus.update { it.copy(notice = null) }
        val factor = rate / AsrEngine.SAMPLE_RATE
        val buf = ShortArray(rate / 10) // 每次读 0.1 秒
        var lastLevelAt = 0L
        try {
            rec.startRecording()
            while (running) {
                val n = rec.read(buf, 0, buf.size)
                if (n <= 0) continue
                val out = FloatArray(n / factor)
                var sum = 0.0
                for (i in out.indices) {
                    var acc = 0f
                    for (k in 0 until factor) acc += buf[i * factor + k]
                    val v = acc / factor / 32768f
                    out[i] = v
                    sum += v * v
                }
                val now = System.currentTimeMillis()
                if (now - lastLevelAt > 120) {
                    lastLevelAt = now
                    val level = (sqrt(sum / out.size.coerceAtLeast(1)) * 6).toFloat().coerceIn(0f, 1f)
                    SubtitleBus.update { it.copy(level = level) }
                }
                engine.accept(
                    out,
                    onPartial = { p -> main.post { pipeline.onPartial(p) } },
                    onPause = { p, long -> main.post { pipeline.onPause(p, long) } },
                    onFinal = { t -> main.post { pipeline.onFinal(t) } },
                )
            }
        } catch (e: Throwable) {
            Log.e(TAG, "capture loop", e)
            main.post { notice("识别中断：${e.message}") }
        } finally {
            try { rec.stop() } catch (_: Exception) {}
            rec.release()
            engine.release()
        }
    }

    private fun notice(msg: String): Boolean {
        SubtitleBus.update { it.copy(notice = msg) }
        return false
    }

    private fun stopEverything() {
        running = false
        worker?.join(500)
        worker = null
        record = null
        overlay?.hide()
        overlay = null
        try { projection?.stop() } catch (_: Exception) {}
        projection = null
        SubtitleBus.update { it.copy(running = false, partial = "", liveZh = "", liveTail = "", level = 0f) }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        overlay?.onScreenChanged()
    }

    override fun onDestroy() {
        if (running) stopEverything()
        scope.cancel()
        super.onDestroy()
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL, "实时字幕", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "字幕运行时显示，可在这里停止"
                    setShowBadge(false)
                },
            )
        }
        val flags = PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        val stop = PendingIntent.getService(this, 1, Intent(this, CaptureService::class.java).setAction(ACTION_STOP), flags)
        val toggle = PendingIntent.getService(this, 2, Intent(this, CaptureService::class.java).setAction(ACTION_TOGGLE_MODE), flags)
        val open = PendingIntent.getActivity(this, 3, Intent(this, MainActivity::class.java), flags)
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("译幕正在生成字幕")
            .setContentText("轻点字幕条可切换 双语 / 仅中文，拖动可移动位置")
            .setContentIntent(open)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(null, "停止", stop).build())
            .addAction(Notification.Action.Builder(null, "双语 / 仅中文", toggle).build())
            .build()
    }

    companion object {
        private const val TAG = "YiMu"
        private const val CHANNEL = "live_subtitle"
        private const val NOTIF_ID = 7
        const val ACTION_START = "com.yimu.subtitle.START"
        const val ACTION_STOP = "com.yimu.subtitle.STOP"
        const val ACTION_TOGGLE_MODE = "com.yimu.subtitle.TOGGLE"
        const val EXTRA_CODE = "code"
        const val EXTRA_DATA = "data"

        fun start(c: Context, resultCode: Int, data: Intent) {
            c.startForegroundService(
                Intent(c, CaptureService::class.java)
                    .setAction(ACTION_START)
                    .putExtra(EXTRA_CODE, resultCode)
                    .putExtra(EXTRA_DATA, data),
            )
        }

        fun stop(c: Context) {
            c.startService(Intent(c, CaptureService::class.java).setAction(ACTION_STOP))
        }
    }
}
