package com.yimu.subtitle

import android.content.Context
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** 识别事件的接收方：稳定模式和极速模式各有一套实现。所有方法在主线程调用。 */
interface SubtitlePipeline {
    fun start()
    fun onPartial(p: String)
    fun onPause(p: String, long: Boolean)
    fun onFinal(raw: String)
}

/**
 * 稳定模式：像电视字幕一样，每条字幕出现时就是最终译文，之后不再改动。
 *
 * 速度与质量的平衡点：
 * 1. 本地断句（不用等网络）：说话人一停顿，就判断刚才这段话是不是一个完整的意思——
 *    停在 "and / the / to / you" 这类明显没说完的词上就继续等；
 * 2. DeepSeek 兜底：如果这段的末尾其实还没说完，它会把那几个词退回来（REST），
 *    并到下一段一起翻，所以字幕不会把一句话拆成两半；
 * 3. 流式输出，第一行（中文）一写完就上屏，不等后面纠正英文那一行；
 * 4. 节奏控制：每条字幕至少停留到能读完；来得太快就排队，积压时自动缩短停留时间追上进度；
 * 5. 网络失败时用本地小模型的译文顶上，不会空着。
 */
class StablePipeline(private val ctx: Context, private val scope: CoroutineScope) : SubtitlePipeline {

    private val translator = Translator { Prefs.apiKey(ctx) }
    private val main = Handler(Looper.getMainLooper())
    private var nextId = 1L
    private var failStreak = 0

    // ---- 识别侧 ----
    private var words: List<String> = emptyList()
    private var prevWords: List<String> = emptyList()
    /** 当前这段识别结果里，已经切出去翻译的词数。 */
    private var consumed = 0
    /** 已经切出去的最后几个词，用来在识别结果被修正后重新对齐，避免重复翻译或漏翻。 */
    private var consumedTail: List<String> = emptyList()
    private var lastWordAt = 0L

    // ---- 翻译侧（按顺序一段一段翻，上一段退回的词要并进下一段） ----
    private class Unit(val words: List<String>, val spokenAt: Long, val endOfTurn: Boolean)

    private val queue = ArrayDeque<Unit>()
    private var job: Job? = null
    private var carry: List<String> = emptyList()
    private var carrySpokenAt = 0L

    // ---- 显示侧 ----
    private val display = ArrayDeque<Line>()
    private var shownAt = 0L
    private var shownChars = 0

    override fun start() {
        scope.launch { translator.warmUp() }
        LocalTranslator.check()
    }

    // ---------- 断句 ----------

    override fun onPartial(p: String) {
        prevWords = words
        words = split(p)
        realign()
        val now = System.currentTimeMillis()
        SubtitleBus.update { it.copy(partial = p) }
        if (p.isEmpty()) return
        lastWordAt = now
        main.removeCallbacks(flushCarry)
        // 一口气说很长不停顿：确定下来的词攒够 22 个，就在最后一个能断开的地方切一段
        val stable = stableCount()
        if (stable - consumed >= 22) {
            val cut = lastGoodCut(stable - 3)
            cut(if (cut > consumed + 8) cut else stable, endOfTurn = false)
        }
    }

    override fun onPause(p: String, long: Boolean) {
        words = split(p)
        realign()
        val avail = words.size - consumed
        if (long) {
            // 0.4 秒停顿：多半是一个意思说完了
            if (avail >= 3 && goodEnd(words.last())) cut(words.size, endOfTurn = false)
            else if (avail >= 14) cut(words.size, endOfTurn = false) // 太长了也先翻，没说完的部分会被退回
        } else {
            // 0.2 秒停顿：最后一个词可能还没识别完，不算它；只有已经很长、且停在完整处才切。
            // 语速快的讲解里，换气式的短停顿常常在句子中间，切早了会把一句话拆成两半
            // 而且最后几个词最可能和后面的话连在一起（形容词 + 名词等），留 3 个词给下一段
            val end = words.size - 1
            if (end - consumed >= 14) {
                val c = lastGoodCut(end - 3)
                if (c >= consumed + 8) cut(c, endOfTurn = false)
            }
        }
    }

    override fun onFinal(raw: String) {
        words = split(raw)
        realign()
        if (words.size > consumed) cut(words.size, endOfTurn = true)
        words = emptyList()
        prevWords = emptyList()
        consumed = 0
        consumedTail = emptyList()
        SubtitleBus.update { it.copy(partial = "") }
    }

    private fun cut(end: Int, endOfTurn: Boolean) {
        val e = end.coerceAtMost(words.size)
        if (e <= consumed) return
        val part = words.subList(consumed, e).toList()
        consumed = e
        consumedTail = words.subList(maxOf(0, e - 3), e).toList()
        // 过滤掉单独的 "UH"、"OH" 之类
        if (part.size == 1 && part[0].length <= 2) return
        queue.addLast(Unit(part, lastWordAt, endOfTurn))
        sendNext()
    }

    /**
     * 识别模型会回头修正前面的词（多一个词、少一个词），按位置截取会重复翻译或漏翻。
     * 这里用"已切出去的最后几个词"在新结果里重新定位切点。
     */
    private fun realign() {
        if (consumed == 0 || consumedTail.isEmpty()) return
        val k = consumedTail.size
        if (consumed <= words.size && words.subList(consumed - k, consumed) == consumedTail) return
        for (d in listOf(1, -1, 2, -2, 3, -3, 4, -4)) {
            val p = consumed + d
            if (p >= k && p <= words.size && words.subList(p - k, p) == consumedTail) {
                consumed = p
                return
            }
        }
        consumed = consumed.coerceAtMost(words.size)
    }

    // ---------- 翻译 ----------

    private fun sendNext() {
        if (job?.isActive == true) return
        val next = queue.removeFirstOrNull() ?: return
        main.removeCallbacks(flushCarry)
        val unitWords = carry + next.words
        val spokenAt = next.spokenAt
        carry = emptyList()
        val english = unitWords.joinToString(" ")
        val previous = context()
        // 如果后面已经排着下一段，就允许把没说完的尾巴退回去并进下一段
        val allowRest = !next.endOfTurn || queue.isNotEmpty()

        job = scope.launch {
            var shown = false
            var lineId = 0L
            try {
                val out = translator.subtitleUnit(english, previous, allowRest) { zh, en ->
                    if (!shown && zh != null) {
                        shown = true
                        lineId = emit(zh, english, en, spokenAt)
                    } else if (shown && en != null) {
                        patchEnglish(lineId, en)
                    }
                }
                if (!shown) lineId = emit(out.zh, english, out.en, spokenAt) else out.en?.let { patchEnglish(lineId, it) }
                // 尾巴退回：只接受确实是这段英文末尾的几个词
                val rest = out.rest
                if (allowRest && rest.isNotEmpty() && rest.size < unitWords.size &&
                    unitWords.takeLast(rest.size).map { it.lowercase() } == rest.map { it.lowercase() }
                ) {
                    carry = unitWords.takeLast(rest.size)
                    carrySpokenAt = spokenAt
                }
                failStreak = 0
                clearNoticeIfOk()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Translator.TranslateException) {
                failStreak++
                fallback(english, spokenAt, e)
            }
            if (queue.isNotEmpty()) {
                sendNext()
            } else if (carry.isNotEmpty()) {
                // 退回的尾巴之后没人接着说：等一会儿还没有新内容就单独翻掉
                main.postDelayed(flushCarry, 1500)
            }
        }
    }

    private val flushCarry = Runnable {
        if (carry.isNotEmpty() && job?.isActive != true && queue.isEmpty()) {
            val c = carry
            carry = emptyList()
            queue.addLast(Unit(c, carrySpokenAt, endOfTurn = true))
            sendNext()
        }
    }

    /** 翻译失败：用本地小模型的译文顶上；本地也不可用时只显示英文。 */
    private fun fallback(english: String, spokenAt: Long, e: Translator.TranslateException) {
        if (failStreak >= 2) {
            SubtitleBus.update {
                it.copy(notice = "翻译连接不稳定。如果开着 VPN，建议把 deepseek.com 设为直连（国内服务，直连更快更稳）")
            }
        }
        if (LocalTranslator.ready) {
            LocalTranslator.translate(english) { zh -> emit(zh, english, null, spokenAt) }
        } else {
            emit(if (e.retryable) "" else e.message.orEmpty(), english, null, spokenAt)
        }
    }

    private fun clearNoticeIfOk() {
        if (SubtitleBus.state.value.notice?.startsWith("翻译连接") == true) SubtitleBus.update { it.copy(notice = null) }
    }

    // ---------- 上屏节奏 ----------

    /** 把一条译好的字幕放进显示队列，返回它的行号。 */
    private fun emit(zh: String, english: String, en: String?, spokenAt: Long): Long {
        val id = nextId++
        if (zh.isEmpty()) return id // 语气词、噪音，或翻译失败且没有本地兜底
        display.addLast(Line(id = id, raw = english, en = en, zh = zh, done = true, spokenAt = spokenAt))
        pump()
        return id
    }

    private fun patchEnglish(id: Long, en: String) {
        val waiting = display.indexOfFirst { it.id == id }
        if (waiting >= 0) display[waiting] = display[waiting].copy(en = en)
        else SubtitleBus.patchLine(id) { it.copy(en = en) }
    }

    private val pumpRunnable = Runnable { pump() }

    private fun pump() {
        main.removeCallbacks(pumpRunnable)
        val next = display.firstOrNull() ?: return
        val now = System.currentTimeMillis()
        // 中文阅读速度约每秒 7 字；积压时缩短停留，尽快追上说话进度
        val hold = if (display.size >= 2) 700L else (shownChars * 140L).coerceIn(1100L, 3200L)
        val wait = shownAt + hold - now
        if (shownAt != 0L && wait > 0) {
            main.postDelayed(pumpRunnable, wait)
            return
        }
        display.removeFirst()
        shownAt = now
        shownChars = next.zh?.length ?: 0
        SubtitleBus.addLine(next.copy(latencyMs = (now - next.spokenAt).coerceAtLeast(0)))
        if (display.isNotEmpty()) main.postDelayed(pumpRunnable, 700)
    }

    // ---------- 小工具 ----------

    private fun stableCount(): Int {
        var n = 0
        while (n < prevWords.size && n < words.size && prevWords[n] == words[n]) n++
        return minOf(n, words.size - 1).coerceAtLeast(0)
    }

    /** 在 [end] 之前找最后一个"可以断开"的位置（那里的词不是 and/the/to 这类没说完的词）。 */
    private fun lastGoodCut(end: Int): Int {
        for (i in end downTo consumed + 1) if (goodEnd(words[i - 1])) return i
        return end
    }

    private fun context(): List<String> = SubtitleBus.state.value.lines.takeLast(2).map { it.englishForDisplay }

    private fun split(s: String) = s.trim().split(' ').filter { it.isNotEmpty() }

    companion object {
        /** 停在这些词上，基本可以肯定话还没说完。 */
        private val CONTINUES = setOf(
            "AND", "OR", "BUT", "SO", "BECAUSE", "THE", "A", "AN", "TO", "OF", "IN", "ON", "AT", "FOR", "WITH",
            "FROM", "BY", "ABOUT", "INTO", "THAT", "WHICH", "WHO", "WHOSE", "IF", "WHEN", "WHILE", "AS", "THAN",
            "IS", "ARE", "WAS", "WERE", "BE", "BEEN", "AM", "I", "YOU", "WE", "THEY", "HE", "SHE", "MY", "YOUR",
            "OUR", "THEIR", "HIS", "HER", "ITS", "THIS", "THESE", "THOSE", "CAN", "COULD", "WILL", "WOULD",
            "SHOULD", "MAY", "MIGHT", "MUST", "DO", "DOES", "DID", "HAVE", "HAS", "HAD", "NOT", "VERY", "REALLY",
            "JUST", "LIKE", "UM", "UH", "GONNA", "WANNA", "LET'S", "THERE", "WHAT", "HOW", "WHY", "WHERE",
            "GET", "GOT", "GOING", "WANT", "NEED", "TRY", "KIND", "SORT", "MORE", "MOST", "SOME", "ANY", "EVERY",
            "I'M", "YOU'RE", "WE'RE", "THEY'RE", "IT'S", "THAT'S", "THERE'S", "I'LL", "I'VE", "DON'T", "CAN'T",
        )

        fun goodEnd(w: String) = w.uppercase() !in CONTINUES
    }
}
