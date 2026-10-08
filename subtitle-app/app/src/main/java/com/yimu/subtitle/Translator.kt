package com.yimu.subtitle

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/** 用 DeepSeek 把一句识别出的英文整理并翻译成中文字幕。 */
class Translator(private val apiKey: () -> String) {

    data class Result(val en: String, val zh: String)

    class TranslateException(message: String) : Exception(message)

    suspend fun translate(raw: String, previous: List<String>): Result = withContext(Dispatchers.IO) {
        val key = apiKey()
        if (key.isBlank()) throw TranslateException("还没有填写 DeepSeek API Key")

        val user = buildString {
            if (previous.isNotEmpty()) {
                append("上文（仅供理解，不要翻译）：\n")
                previous.forEach { append("- ").append(it).append('\n') }
                append('\n')
            }
            append("当前句：").append(raw)
        }
        val body = JSONObject()
            .put("model", "deepseek-chat")
            .put("temperature", 0.3)
            .put("max_tokens", 400)
            .put("response_format", JSONObject().put("type", "json_object"))
            .put(
                "messages",
                JSONArray()
                    .put(JSONObject().put("role", "system").put("content", SYSTEM_PROMPT))
                    .put(JSONObject().put("role", "user").put("content", user)),
            )

        val conn = (URL("https://api.deepseek.com/chat/completions").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 10_000
            readTimeout = 20_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Authorization", "Bearer $key")
        }
        try {
            conn.outputStream.use { it.write(body.toString().toByteArray()) }
            val code = conn.responseCode
            if (code != 200) {
                throw TranslateException(
                    when (code) {
                        401 -> "API Key 无效，请检查是否填写正确"
                        402 -> "DeepSeek 账户余额不足，请先充值"
                        429 -> "请求太频繁，稍后会自动恢复"
                        else -> "翻译服务出错（HTTP $code）"
                    },
                )
            }
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            val content = JSONObject(text)
                .getJSONArray("choices").getJSONObject(0)
                .getJSONObject("message").getString("content")
            val json = JSONObject(content.trim().removePrefix("```json").removeSuffix("```").trim())
            Result(
                en = json.optString("en").ifBlank { prettify(raw) },
                zh = json.optString("zh").trim(),
            )
        } catch (e: TranslateException) {
            throw e
        } catch (e: java.io.IOException) {
            throw TranslateException("网络连接失败：${e.message ?: "请检查网络"}")
        } catch (e: org.json.JSONException) {
            throw TranslateException("翻译结果格式异常")
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        private val SYSTEM_PROMPT = """
            你是专业的视频字幕翻译，风格像优秀的中文字幕组。
            输入是语音识别得到的英文，全大写、没有标点，可能有个别识别错误。
            请结合上文完成两件事：
            1. en：纠正明显的识别错误，恢复正常大小写和标点，不要增删内容。
            2. zh：翻译成自然、口语化、简洁的简体中文字幕，不要翻译腔。人名、品牌、频道名保留英文。
            如果当前句只是语气词、噪音或无意义片段，zh 返回空字符串。
            只输出 JSON，格式：{"en": "...", "zh": "..."}
        """.trimIndent()
    }
}
