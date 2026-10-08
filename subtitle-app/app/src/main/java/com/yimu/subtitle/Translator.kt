package com.yimu.subtitle

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.job
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * 用 DeepSeek 把识别出的英文翻译成中文字幕。
 *
 * 为了让中文尽快出现：
 * - 流式输出：模型一边生成，字幕一边显示；
 * - 全程复用同一条加密连接（HTTP/2），省掉每句都重新握手的几百毫秒；
 * - 每次请求开头的说明文字完全相同，DeepSeek 能命中缓存，出字更快也更便宜；
 * - 「续写」模式：说话人还没说完时，把已经显示出来的中文当作开头，只接着往下翻，
 *   中文像同声传译一样往后长，已经显示的字不会再变。
 */
class Translator(private val apiKey: () -> String) {

    /** zh 为空字符串表示这句只是语气词或噪音；en 为 null 表示还没生成到第二行。 */
    data class Output(val zh: String, val en: String?)

    class TranslateException(message: String, val retryable: Boolean, val code: Int = 0) : Exception(message)

    /** 整句翻译：第一行中文，第二行纠正后的英文。[onUpdate] 在主线程上被反复调用。 */
    suspend fun stream(raw: String, previous: List<String>, onUpdate: (Output) -> Unit = {}): Output {
        val messages = JSONArray()
            .put(msg("system", SYSTEM_PROMPT))
            .put(msg("user", userText(previous, "当前句：$raw")))
        val text = streamChat(BASE, messages, stop = null) { onUpdate(parse(it)) }
        return parse(text)
    }

    /**
     * 续写翻译：[english] 是这句话目前已经确定的英文（可能还没说完），
     * [prefix] 是屏幕上已经显示的中文。返回值只包含新增的那一段中文。
     */
    suspend fun continueTranslation(
        english: String,
        prefix: String,
        previous: List<String>,
        onUpdate: (String) -> Unit = {},
    ): String {
        val messages = JSONArray()
            .put(msg("system", CONTINUE_PROMPT))
            .put(msg("user", userText(previous, "当前这句英文（可能还没说完）：$english")))
        val base = if (prefix.isEmpty()) BASE else BETA
        if (prefix.isNotEmpty()) {
            // DeepSeek 的「对话前缀续写」：模型从这段中文后面接着写
            messages.put(msg("assistant", prefix).put("prefix", true))
        }
        val text = streamChat(base, messages, stop = "\n") { onUpdate(cleanContinuation(it)) }
        return cleanContinuation(text)
    }

    /** 稳定模式的一条字幕：中文、纠正后的英文、末尾没说完要并到下一段的英文词。 */
    data class UnitOutput(val zh: String, val en: String?, val rest: List<String>)

    /**
     * 稳定模式：翻译一段意思完整的英文。第一行（中文）一写完就通过 [onLine] 交出去上屏，
     * 第二行（英文）写完再交一次。[allowRest] 为 true 时，允许模型把末尾没说完的几个词退回来。
     */
    suspend fun subtitleUnit(
        english: String,
        previous: List<String>,
        allowRest: Boolean,
        onLine: (zh: String?, en: String?) -> Unit,
    ): UnitOutput {
        val note = if (allowRest) "" else "\n（这是说话人停顿前的最后一段，第3行只写 REST:）"
        val messages = JSONArray()
            .put(msg("system", UNIT_PROMPT))
            .put(msg("user", userText(previous, "当前这段：$english$note")))
        var zhSent = false
        var enSent = false
        val text = streamChat(BASE, messages, stop = null) { acc ->
            val lines = acc.split('\n')
            if (!zhSent && lines.size >= 2) {
                zhSent = true
                onLine(cleanZh(lines[0]), null)
            }
            if (zhSent && !enSent && lines.size >= 3) {
                enSent = true
                onLine(null, lines[1].trim().ifEmpty { null })
            }
        }
        return parseUnit(text)
    }

    private fun userText(previous: List<String>, current: String) = buildString {
        if (previous.isNotEmpty()) {
            append("上文（仅供理解，不要翻译）：\n")
            previous.forEach { append("- ").append(it).append('\n') }
            append('\n')
        }
        append(current)
    }

    private fun msg(role: String, content: String) = JSONObject().put("role", role).put("content", content)

    /** 发送一次流式请求，返回生成的全部文字。[onText] 在主线程上收到目前为止的累计文字。 */
    private suspend fun streamChat(
        base: String,
        messages: JSONArray,
        stop: String?,
        onText: (String) -> Unit,
    ): String = withContext(Dispatchers.IO) {
        val key = apiKey()
        if (key.isBlank()) throw TranslateException("还没有填写 DeepSeek API Key", retryable = false)
        val body = JSONObject()
            .put("model", "deepseek-chat")
            .put("temperature", 0.3)
            .put("max_tokens", 300)
            .put("stream", true)
            .put("messages", messages)
        if (stop != null) body.put("stop", JSONArray().put(stop))
        val request = Request.Builder()
            .url("$base/chat/completions")
            .header("Authorization", "Bearer $key")
            .post(body.toString().toRequestBody(JSON))
            .build()

        val call = client.newCall(request)
        // 协程被取消（这句话已经过时）时，同步掐断网络请求
        val handle = coroutineContext.job.invokeOnCompletion { call.cancel() }
        try {
            call.execute().use { resp ->
                if (!resp.isSuccessful) {
                    throw when (resp.code) {
                        401 -> TranslateException("API Key 无效，请检查是否填写正确", retryable = false, code = 401)
                        402 -> TranslateException("DeepSeek 账户余额不足，请先充值", retryable = false, code = 402)
                        429 -> TranslateException("请求太频繁，稍后自动恢复", retryable = true, code = 429)
                        else -> TranslateException(
                            "翻译服务出错（HTTP ${resp.code}）", retryable = resp.code >= 500, code = resp.code,
                        )
                    }
                }
                val source = resp.body?.source() ?: throw TranslateException("翻译服务无响应", retryable = true)
                val text = StringBuilder()
                while (true) {
                    ensureActive()
                    val line = source.readUtf8Line() ?: break
                    if (!line.startsWith("data:")) continue
                    val data = line.substring(5).trim()
                    if (data == "[DONE]") break
                    val delta = JSONObject(data).optJSONArray("choices")?.optJSONObject(0)
                        ?.optJSONObject("delta")?.optString("content").orEmpty()
                    if (delta.isEmpty()) continue
                    text.append(delta)
                    val snapshot = text.toString()
                    withContext(Dispatchers.Main) { onText(snapshot) }
                }
                text.toString()
            }
        } catch (e: TranslateException) {
            throw e
        } catch (e: IOException) {
            ensureActive()
            throw TranslateException("网络不稳定", retryable = true)
        } catch (e: org.json.JSONException) {
            throw TranslateException("翻译结果格式异常", retryable = true)
        } finally {
            handle.dispose()
        }
    }

    /** 开始字幕时先连上服务器，第一句话就不用再等握手。 */
    suspend fun warmUp() = withContext(Dispatchers.IO) {
        val key = apiKey()
        if (key.isBlank()) return@withContext
        try {
            client.newCall(
                Request.Builder().url("$BASE/models").header("Authorization", "Bearer $key").build(),
            ).execute().close()
        } catch (_: IOException) {
        }
    }

    companion object {
        private const val BASE = "https://api.deepseek.com"
        private const val BETA = "https://api.deepseek.com/beta"
        private val JSON = "application/json".toMediaType()

        private val client = OkHttpClient.Builder()
            .connectTimeout(6, TimeUnit.SECONDS)
            .readTimeout(12, TimeUnit.SECONDS)
            .pingInterval(20, TimeUnit.SECONDS) // 保持连接不被 VPN / 路由器悄悄断开
            .retryOnConnectionFailure(true)
            .build()

        private val SYSTEM_PROMPT = """
            你是专业的视频字幕翻译，风格像优秀的中文字幕组。
            输入是语音识别得到的英文：全大写、没有标点，可能有个别识别错误，也可能只是一句话的前半部分。
            结合上文，严格只输出两行：
            第1行：简体中文字幕译文。自然、口语化、简洁，不要翻译腔；人名、品牌、频道名保留英文；
                  如果是半句话，就自然地翻译已有部分，不要补全；如果只是语气词或噪音，输出 -
            第2行：纠正识别错误、恢复大小写和标点后的英文原文，不增删内容。
            不要输出任何其他内容。
        """.trimIndent()

        private val CONTINUE_PROMPT = """
            你是同声传译字幕员，风格像优秀的中文字幕组。
            输入是语音识别得到的英文：全大写、没有标点，可能有个别识别错误，说话人可能还没说完。
            把它翻译成自然、口语化、简洁的简体中文字幕；人名、品牌、频道名保留英文。
            只翻译已经给出的英文，不要猜测或补全后面还没说的内容。
            如果已经有一部分译文，就紧接着往下写剩下的部分，不要重复已有的译文，也不要改写它。
            只输出一行中文译文，不要任何解释。如果只是语气词或噪音，输出 -
        """.trimIndent()

        private val UNIT_PROMPT = """
            你是专业的视频字幕翻译，风格像优秀的中文字幕组。
            输入是语音识别得到的一段英文：全大写、没有标点，可能有个别识别错误。上文只用来理解语境，不要翻译。
            语音识别经常把人名、产品名听成发音相近的普通词（例如把 AI 助手 Claude 听成 CLOUD 或 CLAWED），
            请结合上下文还原正确的名字，不要按字面翻译。
            严格只输出三行：
            第1行：这段英文的简体中文字幕。自然、口语化、简洁，读起来像中文母语者说的话，不要翻译腔；
                  人名、品牌、频道名保留英文；如果只是语气词或噪音，输出 -
            第2行：纠正识别错误、恢复大小写和标点后的英文。
            第3行：以 REST: 开头。如果这段英文的末尾几个词明显还没说完、单独翻译会让意思不完整，
                  就把这几个词原样照抄在 REST: 后面（最多 6 个词），并且第1行不要翻译它们；
                  如果意思是完整的，第3行只写 REST:
            不要输出任何其他内容。

            示例 1
            当前这段：YOU CAN GIVE IT FILES LIKE PDFS AND IMAGES AND IT
            你可以给它 PDF、图片之类的文件
            You can give it files like PDFs and images
            REST: AND IT

            示例 2
            当前这段：AND IT READS THEM AND WORKS WITH WHAT'S INSIDE
            它会读取这些文件，根据里面的内容来处理
            And it reads them and works with what's inside.
            REST:

            示例 3
            当前这段：SO WHAT I'M GOING TO DO IS PICK THE FILE FROM THE
            接下来我要选一个文件
            So what I'm going to do is pick the file
            REST: FROM THE
        """.trimIndent()

        private fun cleanZh(s: String): String = s.trim().let { if (it == "-" || it == "－") "" else it }

        fun parseUnit(text: String): UnitOutput {
            val lines = text.trim().split('\n').map { it.trim() }.filter { it.isNotEmpty() }
            val zh = cleanZh(lines.getOrNull(0).orEmpty())
            val en = lines.getOrNull(1)?.takeUnless { it.startsWith("REST", ignoreCase = true) }
            val restLine = lines.firstOrNull { it.startsWith("REST", ignoreCase = true) }.orEmpty()
            val rest = restLine.replaceFirst(Regex("^REST\\s*[:：]?", RegexOption.IGNORE_CASE), "")
                .trim().split(' ').map { it.trim(',', '.', '?', '!') }.filter { it.isNotEmpty() }
            return UnitOutput(zh, en, if (rest.size <= 6) rest else emptyList())
        }

        fun parse(text: CharSequence): Output {
            val s = text.toString().trimStart()
            val nl = s.indexOf('\n')
            val zh = (if (nl < 0) s else s.substring(0, nl)).trim().let { if (it == "-" || it == "－") "" else it }
            val en = if (nl < 0) null else s.substring(nl + 1).trim().ifEmpty { null }
            return Output(zh, en)
        }

        private fun cleanContinuation(text: String): String {
            val s = text.substringBefore('\n').trimEnd()
            return if (s.trim() == "-" || s.trim() == "－") "" else s
        }
    }
}
