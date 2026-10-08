package com.yimu.subtitle

import android.content.Context
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

/**
 * 识别结果 → 中文字幕的调度。所有方法都在主线程调用。
 *
 * 降低延迟的关键是"抢先翻译"：不等一句话被判定说完（需要 0.7 秒静音），
 * 而是在说话人短暂停顿（0.2 秒）时就把已经听到的内容发去翻译。
 * 等这句话真正结束时，如果内容没变，就直接用已经翻好（或正在翻）的结果，
 * 中文几乎和说话同时出现。
 */
class TranslationPipeline(private val ctx: Context, private val scope: CoroutineScope) {

    private val translator = Translator { Prefs.apiKey(ctx) }
    private val slots = Semaphore(3)
    private var nextId = 1L
    private var lastWordAt = 0L
    private var failStreak = 0

    /** 针对"正在说的这句话"的一次抢先翻译。 */
    private inner class Draft(val src: String, val previous: List<String>) {
        var job: Job? = null
        var result: Translator.Output? = null
        var failed = false
        var shownAt = 0L
        /** 这句话说完后，被采用为正式译文的那一行。 */
        var lineId: Long? = null
    }

    private var draft: Draft? = null

    fun start() {
        scope.launch { translator.warmUp() }
    }

    fun onPartial(p: String) {
        val now = System.currentTimeMillis()
        if (p.isNotEmpty()) lastWordAt = now
        SubtitleBus.update { it.copy(partial = p, updatedAt = now) }
        // 一口气说很长不停顿时，每多出 5 个词也抢先翻一次
        val d = draft
        if (Prefs.fastMode(ctx) && p.isNotEmpty() && words(p) - (d?.let { words(it.src) } ?: 0) >= 5) {
            startDraft(p)
        }
    }

    fun onPause(p: String) {
        if (Prefs.fastMode(ctx) && p != draft?.src && words(p) >= 2) startDraft(p)
    }

    fun onFinal(raw: String) {
        val d = draft
        draft = null
        val placeholder = SubtitleBus.state.value.draftZh.ifEmpty { null }
        SubtitleBus.update { it.copy(draftZh = "") }

        // 过滤掉 "UH"、"OH" 这类单个语气词
        if (raw.length < 3) {
            d?.job?.cancel()
            return
        }
        val id = nextId++
        val previous = context()
        val base = Line(id = id, raw = raw, spokenAt = lastWordAt)

        if (d != null && d.src == raw && !d.failed) {
            val r = d.result
            if (r != null) {
                // 抢先翻译已经完成：直接用，零等待
                SubtitleBus.addLine(
                    base.copy(zh = r.zh, en = r.en, done = true, latencyMs = latency(d.shownAt, base.spokenAt)),
                )
            } else {
                // 还在翻译中：让它把结果直接写进这一行
                d.lineId = id
                val early = if (d.shownAt > 0) latency(d.shownAt, base.spokenAt) else null
                SubtitleBus.addLine(base.copy(placeholderZh = placeholder, latencyMs = early))
            }
            return
        }
        d?.job?.cancel()
        SubtitleBus.addLine(base.copy(placeholderZh = placeholder))
        translateLine(id, raw, previous)
    }

    private fun startDraft(src: String) {
        draft?.job?.cancel()
        val d = Draft(src, context())
        draft = d
        d.job = scope.launch {
            try {
                val out = slots.withPermit {
                    translator.stream(d.src, d.previous) { partial -> onDraftUpdate(d, partial, done = false) }
                }
                d.result = out
                onDraftUpdate(d, out, done = true)
                failStreak = 0
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                d.failed = true
                // 已被采用的抢先翻译失败了，就按普通方式（带重试）再翻一次
                d.lineId?.let { translateLine(it, d.src, d.previous) }
            }
        }
    }

    private fun onDraftUpdate(d: Draft, out: Translator.Output, done: Boolean) {
        val lineId = d.lineId
        if (lineId != null) {
            applyToLine(lineId, out, done)
            return
        }
        if (d !== draft) return
        // 正在说的时候：已有上一版抢先译文就等新版整句翻完再替换，避免字幕抖动；
        // 还没有任何译文时，边生成边显示
        val current = SubtitleBus.state.value.draftZh
        if (out.zh.isNotEmpty() && (done || current.isEmpty())) {
            if (d.shownAt == 0L) d.shownAt = System.currentTimeMillis()
            SubtitleBus.update { it.copy(draftZh = out.zh, updatedAt = System.currentTimeMillis()) }
        }
    }

    /** 正式翻译一行，网络抖动时自动重试，不在字幕上报错。 */
    private fun translateLine(id: Long, raw: String, previous: List<String>) {
        scope.launch {
            var attempt = 0
            while (true) {
                try {
                    val out = slots.withPermit {
                        translator.stream(raw, previous) { partial -> applyToLine(id, partial, done = false) }
                    }
                    applyToLine(id, out, done = true)
                    failStreak = 0
                    return@launch
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Translator.TranslateException) {
                    attempt++
                    if (e.retryable && attempt < 3) {
                        delay(400L * attempt)
                        continue
                    }
                    failStreak++
                    SubtitleBus.patchLine(id) { it.copy(error = if (e.retryable) "网络不稳，这句没翻译出来" else e.message) }
                    if (failStreak >= 2) {
                        SubtitleBus.update {
                            it.copy(notice = "翻译连接不稳定。如果开着 VPN，建议把 deepseek.com 设为直连（国内服务，直连更快更稳）")
                        }
                    }
                    return@launch
                }
            }
        }
    }

    private fun applyToLine(id: Long, out: Translator.Output, done: Boolean) {
        val now = System.currentTimeMillis()
        SubtitleBus.patchLine(id) { l ->
            l.copy(
                zh = out.zh,
                en = out.en ?: l.en,
                done = done,
                error = null,
                latencyMs = l.latencyMs ?: if (out.zh.isNotEmpty()) latency(now, l.spokenAt) else null,
            )
        }
        if (failStreak == 0 && SubtitleBus.state.value.notice?.startsWith("翻译连接") == true) {
            SubtitleBus.update { it.copy(notice = null) }
        }
    }

    private fun context(): List<String> = SubtitleBus.state.value.lines.takeLast(3).map { it.englishForDisplay }

    private fun latency(shownAt: Long, spokenAt: Long) = if (spokenAt == 0L) 0L else (shownAt - spokenAt).coerceAtLeast(0)

    private fun words(s: String) = if (s.isBlank()) 0 else s.trim().count { it == ' ' } + 1
}
