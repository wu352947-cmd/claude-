package com.yimu.subtitle

import android.content.Context
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * 极速模式：识别结果 → 中文字幕的调度。所有方法都在主线程调用。
 *
 * 字幕按"句"组织（一行 = 一句话，可能跨越说话人的好几次停顿）：
 *
 * 1. 每次都把这句话目前听到的全部英文交给 DeepSeek，并把已经锁定的中文作为开头让它续写；
 * 2. 它新写出的中文里，到最后一个标点（，。？！）为止的部分是完整的分句，锁定后不再改动；
 *    标点后面那半句可能还没说完，下次请求时允许重翻——所以屏幕上会变的只有最后半句，
 *    而且不会出现"按词数硬拼"造成的病句；
 * 3. 说话人停顿后接着说，如果上一段中文还没以「。？！」结尾，就接在同一行后面继续翻，
 *    不会把一句话切成两行；
 * 4. 这句话刚开始、DeepSeek 还没返回时，先显示本地小模型的灰色草稿。
 */
class TranslationPipeline(private val ctx: Context, private val scope: CoroutineScope) : SubtitlePipeline {

    private val translator = Translator { Prefs.apiKey(ctx) }
    private val main = Handler(Looper.getMainLooper())
    private var nextId = 1L
    private var lastWordAt = 0L
    private var failStreak = 0

    /** DeepSeek 的续写接口万一不可用，就退回到"每次整句重翻"。 */
    private var prefixOk = true

    /** 正在构建的一行字幕（一句话）。 */
    private class Seg(val id: Long) {
        /** 已经说完的几段英文（不含正在说的这段）。 */
        val doneWords = mutableListOf<String>()
        /** 锁定的中文（完整分句），不再改动。 */
        var locked = ""
        /** 最后半句的中文，下次请求可能重翻。 */
        var tail = ""
        /** 已经发给 DeepSeek 的英文词数。 */
        var sentWords = 0
        var job: Job? = null
        /** 当前请求进行中又有新内容：请求结束后再发一次。 */
        var pendingFinal = false
        var pendingWords = 0
        var closed = false
        var localDraft = ""
    }

    private var seg: Seg? = null
    private var words: List<String> = emptyList()
    private var prevWords: List<String> = emptyList()

    override fun start() {
        scope.launch { translator.warmUp() }
        LocalTranslator.check()
    }

    // ---------- 识别事件 ----------

    override fun onPartial(p: String) {
        val now = System.currentTimeMillis()
        prevWords = words
        words = split(p)
        SubtitleBus.update { it.copy(partial = p, updatedAt = now) }
        if (p.isEmpty()) return
        lastWordAt = now
        val s = currentSeg()
        cancelCloseTimer()
        refreshDraft(s)
        run {
            // 一口气说很长不停顿：确定下来的新词每多 8 个就翻一次
            val stable = s.doneWords.size + stableCount()
            if (stable - s.sentWords >= 8) request(s, stable, final = false)
        }
    }

    override fun onPause(p: String, long: Boolean) {
        words = split(p)
        val s = seg ?: return
        if (s.closed) return
        val total = s.doneWords.size + words.size
        if (long) {
            if (total > s.sentWords) request(s, total, final = false)
        } else {
            // 短停顿：最后一个词可能还没识别完，不算它
            val stable = total - 1
            if (stable - s.sentWords >= 3) request(s, stable, final = false)
        }
    }

    override fun onFinal(raw: String) {
        val finalWords = split(raw)
        words = emptyList()
        prevWords = emptyList()
        SubtitleBus.update { it.copy(partial = "") }
        val s = seg ?: return
        // 过滤掉 "UH"、"OH" 这类单个语气词
        if (raw.length >= 3) s.doneWords += finalWords
        SubtitleBus.patchLine(s.id) { it.copy(raw = s.doneWords.joinToString(" ")) }
        if (s.doneWords.isEmpty()) {
            dropSeg(s)
            return
        }
        request(s, s.doneWords.size, final = true)
        // 一段时间没人说话，这句就收尾（锁定最后半句）
        scheduleClose(s)
    }

    // ---------- 行（句子）管理 ----------

    private fun currentSeg(): Seg {
        val s = seg
        if (s != null && !s.closed) {
            // 已经很长了，即使没有句号也换行，避免一行太长
            if (s.locked.length + s.tail.length < MAX_LINE_CHARS && s.doneWords.size < MAX_LINE_WORDS) return s
            close(s)
        }
        val n = Seg(nextId++)
        seg = n
        SubtitleBus.addLine(Line(id = n.id, raw = "", spokenAt = System.currentTimeMillis()))
        return n
    }

    private fun dropSeg(s: Seg) {
        s.job?.cancel()
        s.closed = true
        if (seg === s) seg = null
        SubtitleBus.update { st -> st.copy(lines = st.lines.filterNot { it.id == s.id }) }
    }

    private fun close(s: Seg) {
        if (s.closed) return
        s.closed = true
        if (seg === s) seg = null
        s.locked += s.tail
        s.tail = ""
        SubtitleBus.patchLine(s.id) { it.copy(zh = s.locked.ifEmpty { it.zh }, done = true, tail = null) }
    }

    private var closeTimer: Runnable? = null

    private fun scheduleClose(s: Seg) {
        cancelCloseTimer()
        val r = Runnable {
            if (s.job?.isActive == true) scheduleClose(s) else close(s)
        }
        closeTimer = r
        main.postDelayed(r, CLOSE_AFTER_MS)
    }

    private fun cancelCloseTimer() {
        closeTimer?.let { main.removeCallbacks(it) }
        closeTimer = null
    }

    // ---------- 翻译请求 ----------

    private fun englishUpTo(s: Seg, count: Int): String {
        val all = s.doneWords + words
        return all.take(count.coerceAtMost(all.size)).joinToString(" ")
    }

    private fun request(s: Seg, count: Int, final: Boolean) {
        if (s.job?.isActive == true) {
            // 同一行同时只发一个请求；结束后用最新内容再发
            s.pendingWords = maxOf(s.pendingWords, count)
            s.pendingFinal = s.pendingFinal || final
            return
        }
        val english = englishUpTo(s, count)
        if (english.isBlank()) return
        s.sentWords = maxOf(s.sentWords, count)
        val prefix = if (prefixOk) s.locked else ""
        val previous = context(s.id)
        s.job = scope.launch {
            var ok = false
            var attempt = 0
            while (!ok) {
                try {
                    val cont = translator.continueTranslation(english, prefix, previous) { partial ->
                        apply(s, prefix, partial, final = false)
                    }
                    apply(s, prefix, cont, final = final, done = true)
                    ok = true
                    failStreak = 0
                    clearNoticeIfOk()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Translator.TranslateException) {
                    if (prefix.isNotEmpty() && e.code in 400..499 && e.code !in listOf(401, 402, 429)) {
                        prefixOk = false
                    }
                    attempt++
                    if (e.retryable && attempt < 3 && final) {
                        delay(400L * attempt)
                        continue
                    }
                    onFailure(s, e)
                    break
                }
            }
            // 请求期间又有新内容
            if (s.pendingWords > 0 && !s.closed) {
                val c = s.pendingWords
                val f = s.pendingFinal
                s.pendingWords = 0
                s.pendingFinal = false
                if (c > s.sentWords || f) request(s, maxOf(c, s.sentWords), f)
            }
        }
    }

    /**
     * 把 DeepSeek 的输出写进这一行：[cont] 是接在 [prefix] 后面新写的中文。
     * 结束时，到最后一个标点为止的部分锁定；剩下的半句留作"可重翻"。
     */
    private fun apply(s: Seg, prefix: String, cont: String, final: Boolean, done: Boolean = false) {
        if (s.closed && !done) return
        // 续写接口不可用时 prefix 为空，cont 就是整句的新译文，直接替换
        val base = prefix
        if (done) {
            val cut = lastClauseEnd(cont)
            if (final || cut == cont.length) {
                s.locked = base + cont
                s.tail = ""
            } else {
                s.locked = base + cont.substring(0, cut)
                s.tail = cont.substring(cut)
            }
        } else {
            s.tail = cont
        }
        val now = System.currentTimeMillis()
        val zh = (if (done) s.locked else base) + s.tail
        SubtitleBus.patchLine(s.id) { l ->
            l.copy(
                zh = zh.ifEmpty { l.zh },
                tail = if (zh.isNotEmpty()) null else l.tail,
                latencyMs = if (done && final) latency(now, lastWordAt) else l.latencyMs,
            )
        }
        SubtitleBus.update { it.copy(updatedAt = now) }
        // 一句话已经结束（句号/问号/叹号），这一行就收尾，下一段话另起一行
        if (done && final && endsSentence(s.locked)) close(s)
    }

    private fun onFailure(s: Seg, e: Translator.TranslateException) {
        failStreak++
        SubtitleBus.patchLine(s.id) { l ->
            if (l.zh != null || l.tail != null) l else l.copy(error = if (e.retryable) "网络不稳，这句没翻译出来" else e.message)
        }
        if (failStreak >= 2) {
            SubtitleBus.update {
                it.copy(notice = "翻译连接不稳定。如果开着 VPN，建议把 deepseek.com 设为直连（国内服务，直连更快更稳）")
            }
        }
    }

    private fun clearNoticeIfOk() {
        if (SubtitleBus.state.value.notice?.startsWith("翻译连接") == true) SubtitleBus.update { it.copy(notice = null) }
    }

    // ---------- 本地草稿 ----------

    /** DeepSeek 还没给出这一行的任何中文时，先用本地小模型显示灰色草稿。 */
    private fun refreshDraft(s: Seg) {
        if (s.locked.isNotEmpty() || s.tail.isNotEmpty()) return
        val text = englishUpTo(s, Int.MAX_VALUE)
        LocalTranslator.translate(text) { zh ->
            if (s.locked.isEmpty() && s.tail.isEmpty() && !s.closed) {
                s.localDraft = zh
                SubtitleBus.patchLine(s.id) { it.copy(tail = zh.ifEmpty { null }) }
                SubtitleBus.update { it.copy(updatedAt = System.currentTimeMillis()) }
            }
        }
    }

    // ---------- 小工具 ----------

    private fun stableCount(): Int {
        var n = 0
        while (n < prevWords.size && n < words.size && prevWords[n] == words[n]) n++
        return minOf(n, words.size - 1).coerceAtLeast(0)
    }

    private fun context(currentId: Long): List<String> =
        SubtitleBus.state.value.lines.filter { it.id != currentId && it.raw.isNotEmpty() }
            .takeLast(2).map { it.englishForDisplay }

    private fun latency(shownAt: Long, spokenAt: Long) = if (spokenAt == 0L) 0L else (shownAt - spokenAt).coerceAtLeast(0)

    private fun split(s: String) = s.trim().split(' ').filter { it.isNotEmpty() }

    companion object {
        private const val CLOSE_AFTER_MS = 1800L
        private const val MAX_LINE_CHARS = 46
        private const val MAX_LINE_WORDS = 40
        private const val CLAUSE_MARKS = "，。？！；：…,.?!;"
        private const val SENTENCE_MARKS = "。？！…?!."

        /** 最后一个分句标点之后的位置；没有标点时返回 0。 */
        fun lastClauseEnd(s: String): Int {
            for (i in s.length - 1 downTo 0) if (CLAUSE_MARKS.indexOf(s[i]) >= 0) return i + 1
            return 0
        }

        fun endsSentence(s: String): Boolean {
            val t = s.trimEnd('”', '"', '』', '」', ' ')
            return t.isNotEmpty() && SENTENCE_MARKS.indexOf(t.last()) >= 0
        }
    }
}
