package com.yimu.subtitle

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/** 一句字幕。raw 是语音识别的原文；en/zh 由翻译补全。 */
data class Line(
    val id: Long,
    val raw: String,
    val en: String? = null,
    val zh: String? = null,
    val error: String? = null,
) {
    val englishForDisplay: String get() = en ?: prettify(raw)
}

data class LiveState(
    val running: Boolean = false,
    /** 0..1，捕获到的声音大小。一直是 0 说明当前 App 不允许捕获声音。 */
    val level: Float = 0f,
    /** 正在说、还没说完的英文。 */
    val partial: String = "",
    val lines: List<Line> = emptyList(),
    val updatedAt: Long = 0L,
    val notice: String? = null,
)

/** 服务（后台识别）和界面（主页、悬浮字幕）之间共享的实时状态。 */
object SubtitleBus {
    private val _state = MutableStateFlow(LiveState())
    val state: StateFlow<LiveState> = _state

    private const val MAX_LINES = 80

    fun update(f: (LiveState) -> LiveState) = _state.update(f)

    fun addLine(line: Line) = _state.update {
        it.copy(lines = (it.lines + line).takeLast(MAX_LINES), updatedAt = System.currentTimeMillis())
    }

    fun patchLine(id: Long, f: (Line) -> Line) = _state.update { s ->
        s.copy(
            lines = s.lines.map { if (it.id == id) f(it) else it },
            updatedAt = System.currentTimeMillis(),
        )
    }
}

/** 识别结果是全大写、无标点的，先简单整理成句首大写，方便在翻译回来前阅读。 */
fun prettify(raw: String): String {
    val s = raw.trim().lowercase().replace(Regex("\\bi\\b"), "I")
    return s.replaceFirstChar { it.uppercase() }
}
