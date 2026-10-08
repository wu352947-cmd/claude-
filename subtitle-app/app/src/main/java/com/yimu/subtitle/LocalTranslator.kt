package com.yimu.subtitle

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * 平板本地的英译中小模型（Google ML Kit，约 30 MB）。
 * 质量一般，但几十毫秒就能出结果，用来在 DeepSeek 译文到达之前先显示一版草稿。
 * 语言包第一次需要联网下载（建议开 VPN），之后完全离线。
 */
object LocalTranslator {

    sealed interface State {
        data object Unknown : State
        data object NotDownloaded : State
        data object Downloading : State
        data object Ready : State
        data class Failed(val message: String) : State
    }

    private val _state = MutableStateFlow<State>(State.Unknown)
    val state: StateFlow<State> = _state

    private val client by lazy {
        Translation.getClient(
            TranslatorOptions.Builder()
                .setSourceLanguage(TranslateLanguage.ENGLISH)
                .setTargetLanguage(TranslateLanguage.CHINESE)
                .build(),
        )
    }

    // 同一时间只翻一句；翻译期间来了新的半句，只保留最新的那一个
    private var busy = false
    private var queued: Pair<String, (String) -> Unit>? = null

    val ready: Boolean get() = _state.value == State.Ready

    /** 只检查语言包是否已下载，不会触发下载。 */
    fun check() {
        if (_state.value == State.Downloading) return
        try {
            val manager = RemoteModelManager.getInstance()
            val zh = TranslateRemoteModel.Builder(TranslateLanguage.CHINESE).build()
            manager.isModelDownloaded(zh).addOnSuccessListener { ok ->
                if (_state.value != State.Downloading) _state.value = if (ok) State.Ready else State.NotDownloaded
            }.addOnFailureListener {
                _state.value = State.Failed(it.message ?: "这台设备不支持本地翻译")
            }
        } catch (e: Throwable) {
            _state.value = State.Failed(e.message ?: "这台设备不支持本地翻译")
        }
    }

    fun download() {
        if (_state.value == State.Downloading || _state.value == State.Ready) return
        _state.value = State.Downloading
        try {
            client.downloadModelIfNeeded(DownloadConditions.Builder().build())
                .addOnSuccessListener { _state.value = State.Ready }
                .addOnFailureListener {
                    _state.value = State.Failed("下载失败：${it.message ?: "请打开 VPN 后重试"}")
                }
        } catch (e: Throwable) {
            _state.value = State.Failed(e.message ?: "这台设备不支持本地翻译")
        }
    }

    /** 主线程调用；结果也在主线程回调。语言包没准备好时直接忽略。 */
    fun translate(text: String, onResult: (String) -> Unit) {
        if (!ready || text.isBlank()) return
        if (busy) {
            queued = text to onResult
            return
        }
        busy = true
        client.translate(text.lowercase())
            .addOnSuccessListener { onResult(it.trim()) }
            .addOnCompleteListener {
                busy = false
                queued?.let { (t, cb) ->
                    queued = null
                    translate(t, cb)
                }
            }
    }
}
