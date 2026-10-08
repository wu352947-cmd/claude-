package com.yimu.subtitle

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * 离线英文语音识别模型（约 180 MB，只下载一次）。
 * 模型在 LibriSpeech + GigaSpeech（大量播客 / YouTube 语音）上训练，适合视频里的口语。
 */
object ModelManager {
    private const val MODEL = "sherpa-onnx-streaming-zipformer-en-2023-06-21"
    private val MIRRORS = listOf("https://hf-mirror.com", "https://huggingface.co")

    private data class ModelFile(val name: String, val size: Long)

    private val FILES = listOf(
        ModelFile("encoder-epoch-99-avg-1.int8.onnx", 187_823_992),
        ModelFile("decoder-epoch-99-avg-1.onnx", 2_092_566),
        ModelFile("joiner-epoch-99-avg-1.int8.onnx", 259_335),
        ModelFile("tokens.txt", 5_048),
    )
    private val TOTAL = FILES.sumOf { it.size }

    sealed interface DlState {
        data object Idle : DlState
        data class Downloading(val progress: Float) : DlState
        data object Done : DlState
        data class Failed(val message: String) : DlState
    }

    private val _state = MutableStateFlow<DlState>(DlState.Idle)
    val state: StateFlow<DlState> = _state

    private fun dir(c: Context) = File(c.filesDir, "model/$MODEL")
    fun encoder(c: Context) = File(dir(c), FILES[0].name).absolutePath
    fun decoder(c: Context) = File(dir(c), FILES[1].name).absolutePath
    fun joiner(c: Context) = File(dir(c), FILES[2].name).absolutePath
    fun tokens(c: Context) = File(dir(c), FILES[3].name).absolutePath

    fun isReady(c: Context): Boolean = FILES.all { File(dir(c), it.name).length() == it.size }

    fun refresh(c: Context) {
        if (_state.value !is DlState.Downloading) {
            _state.value = if (isReady(c)) DlState.Done else DlState.Idle
        }
    }

    /** 下载缺失的文件；断网后再点一次会从断点继续。 */
    suspend fun download(c: Context) = withContext(Dispatchers.IO) {
        if (_state.value is DlState.Downloading) return@withContext
        val d = dir(c).apply { mkdirs() }
        _state.value = DlState.Downloading(progress(d))
        try {
            for (f in FILES) {
                val target = File(d, f.name)
                if (target.length() == f.size) continue
                var lastError: Exception? = null
                for (mirror in MIRRORS) {
                    try {
                        fetch("$mirror/csukuangfj/$MODEL/resolve/main/${f.name}", target, f.size, d)
                        lastError = null
                        break
                    } catch (e: Exception) {
                        lastError = e
                    }
                }
                lastError?.let { throw it }
            }
            _state.value = DlState.Done
        } catch (e: Exception) {
            _state.value = DlState.Failed("下载中断：${e.message ?: e.javaClass.simpleName}。请检查网络后重试，会从断点继续。")
        }
    }

    private fun progress(d: File): Float {
        var have = 0L
        for (f in FILES) {
            val done = File(d, f.name)
            have += if (done.length() == f.size) f.size else File(d, f.name + ".part").length()
        }
        return (have.toFloat() / TOTAL).coerceIn(0f, 1f)
    }

    private fun fetch(url: String, target: File, size: Long, d: File) {
        val part = File(target.path + ".part")
        if (part.length() > size) part.delete()
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            instanceFollowRedirects = true
            if (part.length() > 0) setRequestProperty("Range", "bytes=${part.length()}-")
        }
        try {
            val code = conn.responseCode
            val append = when (code) {
                206 -> true
                200 -> false
                else -> throw IllegalStateException("HTTP $code")
            }
            var lastReport = 0L
            conn.inputStream.use { input ->
                FileOutputStream(part, append).use { out ->
                    val buf = ByteArray(256 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        val now = System.currentTimeMillis()
                        if (now - lastReport > 300) {
                            lastReport = now
                            _state.value = DlState.Downloading(progress(d))
                        }
                    }
                }
            }
        } finally {
            conn.disconnect()
        }
        if (part.length() != size) throw IllegalStateException("文件不完整")
        if (!part.renameTo(target)) throw IllegalStateException("无法保存文件")
    }
}
