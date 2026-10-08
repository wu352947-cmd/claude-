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
 * 三层设计，让中文尽量贴着说话出现，同时不乱跳：
 *
 * 1. 本地草稿（灰色，几十毫秒）：英文每变一次，平板上的小模型立刻翻出草稿；
 * 2. 分段定稿（白色）：识别结果连续两次一致的词才算"确定"。确定的英文每多出几个词，
 *    或说话人一停顿，就让 DeepSeek 把这部分翻成正式中文；
 * 3. 只往后长：后面每一段都用"续写"——把屏幕上已经定稿的中文交给 DeepSeek，让它只接着往下翻。
 *    已经显示的白色中文不会再被改写，读起来像同声传译。
 *
 * 一句话结束时，如果定稿已经覆盖了整句，字幕零等待直接完成；否则只续写剩下的一小段。
 */
class TranslationPipeline(private val ctx: Context, private val scope: CoroutineScope) {

    private val translator = Translator { Prefs.apiKey(ctx) }
    private val slots = Semaphore(4)
    private var nextId = 1L
    private var lastWordAt = 0L
    private var failStreak = 0

    /** DeepSeek 的续写接口万一不可用，就退回到"整句翻译"。 */
    private var prefixOk = true

    /** 正在说的这一句话。 */
    private class Utterance {
        var words: List<String> = emptyList()
        var prevWords: List<String> = emptyList()
        /** 已定稿的中文覆盖了前多少个英文词。 */
        var committedWords = 0
        var committedZh = ""
        /** 已经请求定稿到第几个词（包括正在翻译中的）。 */
        var requested = 0
        var job: Job? = null
        var tail = ""
        var whiteAt = 0L
        /** 这句话说完后对应的字幕行。 */
        var lineId: Long? = null
    }

    private var utt = Utterance()

    fun start() {
        scope.launch { translator.warmUp() }
        LocalTranslator.check()
    }

    fun onPartial(p: String) {
        val now = System.currentTimeMillis()
        val u = utt
        if (p.isNotEmpty()) lastWordAt = now
        u.prevWords = u.words
        u.words = split(p)
        SubtitleBus.update { it.copy(partial = p, updatedAt = now) }
        if (p.isEmpty()) return
        refreshTail(u)
        // 一口气说很长不停顿时：确定下来的词每多 8 个就定稿一段
        if (Prefs.fastMode(ctx)) {
            val stable = stableCount(u)
            if (stable - u.requested >= 8) commit(u, stable)
        }
    }

    /**
     * 说话人停顿。用真实录音模拟调出来的规则：
     * - 短停顿（0.2 秒）：最后一个词可能还没识别完，不算它；新确定的词够 5 个才定稿一段，
     *   段太短的话中文语序翻不自然，请求也太频繁；
     * - 长停顿（0.4 秒）：多半是一句话说完了，整段定稿，这样句末几乎零等待。
     */
    fun onPause(p: String, long: Boolean) {
        val u = utt
        u.words = split(p)
        if (!Prefs.fastMode(ctx)) return
        if (long) {
            if (u.words.size - u.requested >= 1) commit(u, u.words.size)
        } else if (u.words.size - 1 - u.requested >= 5) {
            commit(u, u.words.size - 1)
        }
    }

    fun onFinal(raw: String) {
        val u = utt
        utt = Utterance()
        SubtitleBus.update { it.copy(liveZh = "", liveTail = "") }

        // 过滤掉 "UH"、"OH" 这类单个语气词
        if (raw.length < 3) {
            u.job?.cancel()
            return
        }
        u.words = split(raw)
        val id = nextId++
        u.lineId = id
        val previous = context()
        SubtitleBus.addLine(
            Line(
                id = id,
                raw = raw,
                zh = u.committedZh.ifEmpty { null },
                tail = u.tail.ifEmpty { null },
                spokenAt = lastWordAt,
                latencyMs = if (u.whiteAt > 0) latency(u.whiteAt, lastWordAt) else null,
            ),
        )
        refreshTail(u)

        scope.launch {
            u.job?.join() // 正在定稿的那一段先完成（它会直接写进这一行）
            when {
                u.committedZh.isNotEmpty() && u.committedWords >= u.words.size -> {
                    // 定稿已经覆盖整句：零等待
                    SubtitleBus.patchLine(id) { it.copy(done = true, tail = null) }
                }
                u.committedZh.isEmpty() || !prefixOk -> translateWhole(id, raw, previous)
                else -> continueLine(id, u, raw, previous)
            }
        }
    }

    // ---------- 分段定稿 ----------

    private fun commit(u: Utterance, target: Int) {
        u.requested = maxOf(u.requested, target)
        if (u.job?.isActive == true) return // 当前这段翻完后会自动接着翻
        runCommit(u)
    }

    private fun runCommit(u: Utterance) {
        val target = u.requested.coerceAtMost(u.words.size)
        if (target <= u.committedWords) return
        val prefix = u.committedZh
        if (prefix.isNotEmpty() && !prefixOk) return
        val english = u.words.take(target).joinToString(" ")
        val previous = context()
        val before = u.committedWords
        u.job = scope.launch {
            try {
                var started = false
                val cont = slots.withPermit {
                    translator.continueTranslation(english, prefix, previous) { partial ->
                        if (!started && partial.isNotEmpty()) {
                            started = true
                            u.committedWords = target
                            refreshTail(u)
                        }
                        showWhite(u, prefix + partial)
                    }
                }
                u.committedZh = prefix + cont
                u.committedWords = target
                showWhite(u, u.committedZh)
                refreshTail(u)
                failStreak = 0
            } catch (e: CancellationException) {
                throw e
            } catch (e: Translator.TranslateException) {
                if (prefix.isNotEmpty() && e.code in 400..499 && e.code !in listOf(401, 402, 429)) prefixOk = false
                u.committedWords = before
                u.requested = before
                showWhite(u, prefix)
                refreshTail(u)
                return@launch
            }
            if (u.requested > u.committedWords && u.lineId == null) runCommit(u)
        }
    }

    private fun showWhite(u: Utterance, text: String) {
        val now = System.currentTimeMillis()
        if (u.whiteAt == 0L && text.isNotEmpty()) u.whiteAt = now
        val lineId = u.lineId
        if (lineId != null) {
            SubtitleBus.patchLine(lineId) { l ->
                l.copy(zh = text, latencyMs = l.latencyMs ?: if (text.isNotEmpty()) latency(now, l.spokenAt) else null)
            }
        } else if (u === utt) {
            SubtitleBus.update { it.copy(liveZh = text, updatedAt = now) }
        }
    }

    // ---------- 本地草稿 ----------

    private fun refreshTail(u: Utterance) {
        val rest = u.words.drop(u.committedWords).joinToString(" ")
        if (rest.isBlank()) {
            setTail(u, "")
            return
        }
        LocalTranslator.translate(rest) { zh ->
            // 草稿翻回来时，这部分可能已经被定稿了
            if (u.words.drop(u.committedWords).joinToString(" ").isNotBlank()) setTail(u, zh)
        }
    }

    private fun setTail(u: Utterance, zh: String) {
        u.tail = zh
        val lineId = u.lineId
        if (lineId != null) {
            SubtitleBus.patchLine(lineId) { if (it.done) it else it.copy(tail = zh.ifEmpty { null }) }
        } else if (u === utt) {
            SubtitleBus.update { it.copy(liveTail = zh, updatedAt = System.currentTimeMillis()) }
        }
    }

    // ---------- 一句话结束后的收尾 ----------

    /** 已经定稿了前半句：只续写剩下的部分。 */
    private suspend fun continueLine(id: Long, u: Utterance, raw: String, previous: List<String>) {
        val prefix = u.committedZh
        withRetry(id) {
            val cont = slots.withPermit {
                translator.continueTranslation(raw, prefix, previous) { partial -> showWhite(u, prefix + partial) }
            }
            SubtitleBus.patchLine(id) { it.copy(zh = prefix + cont, done = true, tail = null, error = null) }
        }
    }

    /** 整句翻译（关闭抢先翻译时，或这句话没来得及定稿）。 */
    private suspend fun translateWhole(id: Long, raw: String, previous: List<String>) {
        withRetry(id) {
            val out = slots.withPermit {
                translator.stream(raw, previous) { partial ->
                    // 白色译文追上灰色草稿的长度后再替换，避免字幕先变短再变长
                    val line = SubtitleBus.state.value.lines.firstOrNull { it.id == id }
                    if (line != null && partial.zh.length >= (line.tail?.length ?: 0) * 0.6) applyWhole(id, partial, false)
                }
            }
            applyWhole(id, out, true)
        }
    }

    private fun applyWhole(id: Long, out: Translator.Output, done: Boolean) {
        val now = System.currentTimeMillis()
        SubtitleBus.patchLine(id) { l ->
            l.copy(
                zh = out.zh,
                en = out.en ?: l.en,
                done = done,
                tail = if (done) null else l.tail,
                error = null,
                latencyMs = l.latencyMs ?: if (out.zh.isNotEmpty()) latency(now, l.spokenAt) else null,
            )
        }
    }

    /** 网络抖动时自动重试，不在字幕上报错；实在不行就只显示英文和本地草稿。 */
    private suspend fun withRetry(id: Long, block: suspend () -> Unit) {
        var attempt = 0
        while (true) {
            try {
                block()
                failStreak = 0
                if (SubtitleBus.state.value.notice?.startsWith("翻译连接") == true) {
                    SubtitleBus.update { it.copy(notice = null) }
                }
                return
            } catch (e: CancellationException) {
                throw e
            } catch (e: Translator.TranslateException) {
                attempt++
                if (e.retryable && attempt < 3) {
                    delay(400L * attempt)
                    continue
                }
                failStreak++
                SubtitleBus.patchLine(id) {
                    it.copy(error = if (it.tail != null || it.zh != null) null else if (e.retryable) "网络不稳，这句没翻译出来" else e.message, done = true)
                }
                if (failStreak >= 2) {
                    SubtitleBus.update {
                        it.copy(notice = "翻译连接不稳定。如果开着 VPN，建议把 deepseek.com 设为直连（国内服务，直连更快更稳）")
                    }
                }
                return
            }
        }
    }

    // ---------- 小工具 ----------

    /** 识别结果里"连续两次都一样"的前缀词数；最后一个词可能还没说完，不算。 */
    private fun stableCount(u: Utterance): Int {
        val a = u.prevWords
        val b = u.words
        var n = 0
        while (n < a.size && n < b.size && a[n] == b[n]) n++
        return minOf(n, b.size - 1).coerceAtLeast(0)
    }

    private fun context(): List<String> = SubtitleBus.state.value.lines.takeLast(3).map { it.englishForDisplay }

    private fun latency(shownAt: Long, spokenAt: Long) = if (spokenAt == 0L) 0L else (shownAt - spokenAt).coerceAtLeast(0)

    private fun split(s: String) = s.trim().split(' ').filter { it.isNotEmpty() }
}
