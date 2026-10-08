package com.yimu.subtitle

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.TextUtils
import android.text.style.ForegroundColorSpan
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlin.math.abs

/**
 * 浮在所有 App 上方的双语字幕条。
 * 轻点：切换 双语 / 仅中文；拖动：移动位置（会记住）。
 */
class SubtitleOverlay(private val context: Context) {

    private val wm = context.getSystemService(WindowManager::class.java)
    private val main = Handler(Looper.getMainLooper())
    private val density = context.resources.displayMetrics.density
    private var job: Job? = null
    private var attached = false

    private fun dp(v: Float) = (v * density).toInt()

    private val zh = text(sizeSp = 22f, color = Color.WHITE, weight = 500).apply {
        setLineSpacing(0f, 1.15f)
    }
    private val en = text(sizeSp = 15f, color = Color.argb(200, 255, 255, 255), weight = 400).apply {
        setPadding(0, dp(4f), 0, 0)
    }
    private val live = text(sizeSp = 14f, color = Color.argb(140, 255, 255, 255), weight = 400).apply {
        setPadding(0, dp(6f), 0, 0)
        maxLines = 2
        ellipsize = TextUtils.TruncateAt.START
    }
    private val hint = text(sizeSp = 13f, color = Color.argb(170, 255, 255, 255), weight = 500)

    /** 上一句的中文，缩小变淡留在上方，读得慢也跟得上。 */
    private val prev = text(sizeSp = 15f, color = Color.argb(120, 255, 255, 255), weight = 400).apply {
        setPadding(0, 0, 0, dp(6f))
        maxLines = 2
        ellipsize = TextUtils.TruncateAt.START
    }

    private val card = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER_HORIZONTAL
        setPadding(dp(22f), dp(12f), dp(22f), dp(14f))
        background = GradientDrawable().apply {
            cornerRadius = dp(18f).toFloat()
            setColor(Color.argb(224, 14, 14, 20))
            setStroke(1, Color.argb(36, 255, 255, 255))
        }
        addView(hint)
        addView(prev)
        addView(zh)
        addView(en)
        addView(live)
    }

    private val params = WindowManager.LayoutParams(
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.WRAP_CONTENT,
        WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
        PixelFormat.TRANSLUCENT,
    ).apply {
        gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
        windowAnimations = android.R.style.Animation_Toast
        if (Build.VERSION.SDK_INT >= 30) fitInsetsTypes = 0
    }

    private fun text(sizeSp: Float, color: Int, weight: Int) = TextView(context).apply {
        setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
        setTextColor(color)
        gravity = Gravity.CENTER
        typeface = Typeface.create(Typeface.DEFAULT, weight, false)
        includeFontPadding = false
    }

    fun show() {
        if (attached) return
        params.x = Prefs.overlayX(context)
        params.y = Prefs.overlayY(context).takeIf { it >= 0 } ?: dp(96f)
        applyWidth()
        setupTouch()
        wm.addView(card, params)
        attached = true
        job = CoroutineScope(Dispatchers.Main).launch {
            SubtitleBus.state.collectLatest { render(it) }
        }
        main.postDelayed(idleTick, 1000)
    }

    fun hide() {
        job?.cancel()
        main.removeCallbacks(idleTick)
        if (attached) {
            try { wm.removeView(card) } catch (_: Exception) {}
            attached = false
        }
    }

    fun refresh() = render(SubtitleBus.state.value)

    fun onScreenChanged() {
        if (!attached) return
        applyWidth()
        wm.updateViewLayout(card, params)
    }

    /** 字幕条宽度：屏幕宽度的 70%，横竖屏切换时自动调整。 */
    private fun applyWidth() {
        val w = if (Build.VERSION.SDK_INT >= 30) {
            wm.currentWindowMetrics.bounds.width()
        } else {
            context.resources.displayMetrics.widthPixels
        }
        val width = (w * 0.7f).toInt()
        listOf(zh, en, live, hint, prev).forEach { it.maxWidth = width - dp(44f) }
    }

    // 一段时间没有新字幕，就收起成一个小胶囊，不挡画面
    private val idleTick = object : Runnable {
        override fun run() {
            refresh()
            main.postDelayed(this, 1000)
        }
    }

    private var lastShown = ""
    private var flashText = ""
    private var flashUntil = 0L

    private fun render(s: LiveState) {
        if (!attached) return
        val now = System.currentTimeMillis()
        val zhOnly = Prefs.zhOnly(context)
        val last = s.lines.lastOrNull()
        val speaking = s.partial.isNotEmpty()
        val idle = now - s.updatedAt > IDLE_MS && !speaking

        var white = ""
        var gray = ""
        var enText: String? = null
        var liveText: String? = null
        var prevText: String? = null
        var errorText: String? = null
        var hasMain = false

        if (speaking && (s.liveZh.isNotEmpty() || s.liveTail.isNotEmpty())) {
            // 正在说：白色是已定稿的中文，灰色是本地草稿
            white = s.liveZh
            gray = s.liveTail
            enText = prettify(s.partial)
            prevText = last?.let { lineZh(it) }
            hasMain = true
        } else if (last != null && !idle) {
            if (last.error != null) {
                errorText = last.error
            } else {
                white = last.zh.orEmpty()
                gray = if (last.done) "" else last.tail.orEmpty()
                if (white.isEmpty() && gray.isEmpty() && !last.done) white = "…"
            }
            enText = last.englishForDisplay
            if (speaking) liveText = prettify(s.partial)
            prevText = s.lines.getOrNull(s.lines.size - 2)?.let { lineZh(it) }
            hasMain = true
        } else if (speaking) {
            liveText = prettify(s.partial)
        }
        if (zhOnly) {
            enText = null
            liveText = null
        }

        val hintText = when {
            now < flashUntil -> flashText
            s.notice != null && (last == null || idle) -> s.notice
            hasMain || liveText != null -> null
            s.running && s.level < 0.002f -> "译幕 · 等待声音"
            else -> "译幕 · 正在聆听"
        }

        hint.show(hintText)
        prev.show(if (hasMain) prevText?.takeIf { it.isNotEmpty() } else null)
        en.show(enText)
        live.show(liveText)

        val shown = white + gray
        val showZh = errorText != null || shown.isNotEmpty()
        zh.visibility = if (showZh) View.VISIBLE else View.GONE
        if (errorText != null) {
            if (zh.text.toString() != errorText) {
                zh.text = errorText
                zh.setTextColor(Color.argb(170, 255, 190, 180))
                zh.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            }
            lastShown = ""
        } else if (shown.isNotEmpty() && (shown != lastShown || zh.text !is Spanned)) {
            val sb = SpannableStringBuilder(white)
            if (gray.isNotEmpty()) {
                val start = sb.length
                sb.append(gray)
                sb.setSpan(ForegroundColorSpan(Color.argb(140, 255, 255, 255)), start, sb.length, 0)
            }
            zh.setTextColor(Color.WHITE)
            zh.setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
            zh.text = sb
            // 只在换成新的一句时淡入；同一句逐字变长、草稿变正式时不闪
            val samePrefix = lastShown.length >= 2 && shown.length >= 2 && shown.take(2) == lastShown.take(2)
            if (!samePrefix && lastShown != "…") {
                zh.alpha = 0f
                zh.animate().alpha(1f).setDuration(140).start()
            }
            lastShown = shown
        }
    }

    private fun lineZh(l: Line): String? = when {
        !l.zh.isNullOrEmpty() -> l.zh
        !l.tail.isNullOrEmpty() -> l.tail
        else -> null
    }

    private fun TextView.show(value: String?) {
        visibility = if (value != null) View.VISIBLE else View.GONE
        if (value != null && text.toString() != value) text = value
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun setupTouch() {
        val slop = ViewConfiguration.get(context).scaledTouchSlop
        var downX = 0f
        var downY = 0f
        var startX = 0
        var startY = 0
        var dragging = false
        card.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY
                    startX = params.x; startY = params.y
                    dragging = false
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (!dragging && (abs(dx) > slop || abs(dy) > slop)) dragging = true
                    if (dragging) {
                        params.x = startX + dx.toInt()
                        params.y = (startY - dy.toInt()).coerceAtLeast(0)
                        wm.updateViewLayout(card, params)
                    }
                }
                MotionEvent.ACTION_UP -> {
                    if (dragging) {
                        Prefs.setOverlayPos(context, params.x, params.y)
                    } else {
                        Prefs.setZhOnly(context, !Prefs.zhOnly(context))
                        flash(if (Prefs.zhOnly(context)) "仅中文" else "双语")
                    }
                }
            }
            true
        }
    }

    private fun flash(msg: String) {
        flashText = msg
        flashUntil = System.currentTimeMillis() + 900
        refresh()
    }

    companion object {
        private const val IDLE_MS = 7_000L
    }
}
