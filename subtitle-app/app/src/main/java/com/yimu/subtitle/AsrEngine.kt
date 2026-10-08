package com.yimu.subtitle

import android.content.Context
import com.k2fsa.sherpa.onnx.EndpointConfig
import com.k2fsa.sherpa.onnx.EndpointRule
import com.k2fsa.sherpa.onnx.FeatureConfig
import com.k2fsa.sherpa.onnx.OnlineModelConfig
import com.k2fsa.sherpa.onnx.OnlineRecognizer
import com.k2fsa.sherpa.onnx.OnlineRecognizerConfig
import com.k2fsa.sherpa.onnx.OnlineTransducerModelConfig

/**
 * 本地流式英文语音识别：边听边出字，一句话说完（停顿）时给出整句。
 * 全部在平板上运行，不联网、不花钱。
 */
class AsrEngine(context: Context) {
    private val recognizer = OnlineRecognizer(
        assetManager = null,
        config = OnlineRecognizerConfig(
            featConfig = FeatureConfig(sampleRate = SAMPLE_RATE, featureDim = 80),
            modelConfig = OnlineModelConfig(
                transducer = OnlineTransducerModelConfig(
                    encoder = ModelManager.encoder(context),
                    decoder = ModelManager.decoder(context),
                    joiner = ModelManager.joiner(context),
                ),
                tokens = ModelManager.tokens(context),
                numThreads = 2,
            ),
            endpointConfig = EndpointConfig(
                rule1 = EndpointRule(false, 2.0f, 0.0f),
                // 说话后停顿 0.7 秒就算一句结束，字幕出得更快
                rule2 = EndpointRule(true, 0.7f, 0.0f),
                rule3 = EndpointRule(false, 0.0f, 12.0f),
            ),
            enableEndpoint = true,
            decodingMethod = "greedy_search",
        ),
    )
    private val stream = recognizer.createStream()
    private var lastPartial = ""
    private var stableChunks = 0

    /**
     * 送入一段 16kHz 单声道音频（每次约 0.1 秒）。
     * @param onPartial 正在说的半句（可能为空，表示清空）
     * @param onFinal 说完的一整句
     */
    fun accept(samples: FloatArray, onPartial: (String) -> Unit, onFinal: (String) -> Unit) {
        stream.acceptWaveform(samples, SAMPLE_RATE)
        while (recognizer.isReady(stream)) recognizer.decode(stream)
        val text = recognizer.getResult(stream).text.trim()
        // 视频里经常一口气说很长：超过一定字数后，趁说话人短暂换气（约 0.3 秒没有新词）先切一句，
        // 避免字幕太长看不过来，也不会把单词切断
        val words = if (text.isEmpty()) 0 else text.count { it == ' ' } + 1
        stableChunks = if (text == lastPartial) stableChunks + 1 else 0
        val tooLong = (words >= SOFT_MAX_WORDS && stableChunks >= 3) || words >= HARD_MAX_WORDS
        if (recognizer.isEndpoint(stream) || tooLong) {
            if (text.isNotEmpty()) onFinal(text)
            recognizer.reset(stream)
            stableChunks = 0
            if (lastPartial.isNotEmpty()) {
                lastPartial = ""
                onPartial("")
            }
        } else if (text != lastPartial) {
            lastPartial = text
            onPartial(text)
        }
    }

    fun release() {
        stream.release()
        recognizer.release()
    }

    companion object {
        const val SAMPLE_RATE = 16_000
        private const val SOFT_MAX_WORDS = 18
        private const val HARD_MAX_WORDS = 40
    }
}
