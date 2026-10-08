package com.yimu.subtitle

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.util.Patterns
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/**
 * 内置浏览器：打开英文网页自动整页翻译成中文（也可以切换双语 / 原文）。
 * 入口：译幕主页输入网址；其他浏览器里「分享 → 译幕网页」；或在链接打开方式里选译幕。
 */
class BrowserActivity : ComponentActivity() {

    private lateinit var web: WebView
    private val translator by lazy { Translator { Prefs.apiKey(this) } }
    private val script by lazy { assets.open("yimu-web.js").bufferedReader().use { it.readText() } }

    private var url by mutableStateOf("")
    private var showStart by mutableStateOf(true)
    private var progress by mutableFloatStateOf(0f)
    private var mode by mutableStateOf("zh")
    private var status by mutableStateOf<String?>(null)
    private var statusIsError by mutableStateOf(false)

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        mode = Prefs.webMode(this)

        web = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            settings.mediaPlaybackRequiresUserGesture = false
            // 12.7 寸大屏：请求电脑版网页，排版更舒服
            settings.userAgentString = settings.userAgentString.replace(" Mobile", "")
            addJavascriptInterface(Bridge(), "YiMuNative")
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val u = request.url
                    if (u.scheme == "http" || u.scheme == "https") return false
                    // intent://、market:// 之类交给系统打开
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, u)) }
                    return true
                }

                override fun onPageStarted(view: WebView, u: String, favicon: Bitmap?) {
                    this@BrowserActivity.url = u
                    this@BrowserActivity.status = null
                }

                override fun onPageCommitVisible(view: WebView, u: String) = inject()
                override fun onPageFinished(view: WebView, u: String) {
                    this@BrowserActivity.url = u
                    inject()
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView, newProgress: Int) {
                    this@BrowserActivity.progress = newProgress / 100f
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                when {
                    !showStart && web.canGoBack() -> web.goBack()
                    !showStart -> showStart = true
                    else -> finish()
                }
            }
        })

        setContent {
            YiMuBrowserTheme { BrowserScreen() }
        }
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val target = when (intent?.action) {
            Intent.ACTION_VIEW -> intent.dataString
            Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)?.let { extractUrl(it) }
            else -> intent?.getStringExtra(EXTRA_URL)
        }
        if (!target.isNullOrBlank()) open(target)
    }

    private fun open(input: String) {
        val u = toUrl(input)
        showStart = false
        url = u
        web.loadUrl(u)
    }

    private fun inject() {
        val m = JSONObject.quote(mode)
        web.evaluateJavascript("window.__yimuMode=$m;$script", null)
    }

    private fun setTranslateMode(m: String) {
        mode = m
        Prefs.setWebMode(this, m)
        web.evaluateJavascript("window.__yimu&&window.__yimu.setMode(${JSONObject.quote(m)})", null)
        if (m == "off") status = null
    }

    /** 网页脚本通过它请求翻译。注意：这里的方法在后台线程被调用。 */
    private inner class Bridge {
        @JavascriptInterface
        fun translate(id: Int, payload: String) {
            val p = JSONObject(payload)
            val title = p.optString("title")
            val arr = p.getJSONArray("items")
            val items = List(arr.length()) { arr.getString(it) }
            lifecycleScope.launch {
                try {
                    val cached = items.map { WebCache.get(it) }
                    val missing = items.filterIndexed { i, _ -> cached[i] == null }
                    val fresh = translator.translateBatch(title, missing)
                    missing.forEachIndexed { i, src -> WebCache.put(src, fresh[i]) }
                    var k = 0
                    val out = items.mapIndexed { i, _ -> cached[i] ?: fresh[k++] }
                    statusIsError = false
                    web.evaluateJavascript("window.__yimu&&window.__yimu.onResult($id,${JSONArray(out)})", null)
                } catch (e: Translator.TranslateException) {
                    statusIsError = true
                    status = if (e.retryable) "网络不稳定，稍后自动重试" else e.message
                    web.evaluateJavascript("window.__yimu&&window.__yimu.onError($id)", null)
                } catch (e: Exception) {
                    web.evaluateJavascript("window.__yimu&&window.__yimu.onError($id)", null)
                }
            }
        }

        @JavascriptInterface
        fun status(pending: Int, done: Int) {
            runOnUiThread {
                if (pending > 0) {
                    statusIsError = false
                    status = "正在翻译…"
                } else if (!statusIsError) {
                    status = null
                }
            }
        }
    }

    // ---------- 界面 ----------

    @Composable
    private fun BrowserScreen() {
        val c = browserColors()
        Box(Modifier.fillMaxSize().background(c.bg)) {
            Column(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
                TopBar(c)
                Box(Modifier.fillMaxWidth().height(2.dp)) {
                    if (!showStart && progress in 0.01f..0.99f) {
                        Box(Modifier.fillMaxWidth(progress).height(2.dp).background(c.accent))
                    }
                }
                Box(Modifier.weight(1f).fillMaxWidth()) {
                    AndroidView(factory = { web }, modifier = Modifier.fillMaxSize())
                    if (showStart) StartPage(c)
                    StatusPill(c, Modifier.align(Alignment.BottomCenter).padding(bottom = 24.dp))
                }
            }
        }
    }

    @Composable
    private fun TopBar(c: BrowserColors) {
        var editing by remember { mutableStateOf(false) }
        var text by remember { mutableStateOf("") }
        Row(
            Modifier.fillMaxWidth().background(c.bar).padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            IconButton("‹", c) { onBackPressedDispatcher.onBackPressed() }
            BasicTextField(
                value = if (editing) text else displayUrl(url),
                onValueChange = { text = it },
                singleLine = true,
                textStyle = TextStyle(color = c.text, fontSize = 15.sp),
                cursorBrush = SolidColor(c.accent),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                keyboardActions = KeyboardActions(onGo = {
                    if (text.isNotBlank()) open(text)
                    editing = false
                    web.requestFocus()
                }),
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(12.dp))
                    .background(c.field)
                    .padding(horizontal = 14.dp, vertical = 10.dp)
                    .onFocusChanged {
                        if (it.isFocused && !editing) {
                            editing = true
                            text = url
                        } else if (!it.isFocused) {
                            editing = false
                        }
                    },
                decorationBox = { inner ->
                    Box {
                        if (!editing && url.isEmpty()) Text("输入网址或搜索", color = c.muted, fontSize = 15.sp)
                        inner()
                    }
                },
            )
            ModeSwitch(c)
            IconButton("↻", c) { if (!showStart) web.reload() }
        }
    }

    @Composable
    private fun ModeSwitch(c: BrowserColors) {
        Row(
            Modifier.clip(RoundedCornerShape(12.dp)).background(c.field).padding(3.dp),
            horizontalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            listOf("off" to "原文", "dual" to "双语", "zh" to "中文").forEach { (key, label) ->
                val selected = mode == key
                Box(
                    Modifier
                        .clip(RoundedCornerShape(9.dp))
                        .background(if (selected) c.accent else Color.Transparent)
                        .clickable { setTranslateMode(key) }
                        .padding(horizontal = 14.dp, vertical = 7.dp),
                ) {
                    Text(
                        label, fontSize = 14.sp,
                        color = if (selected) Color.White else c.text,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
            }
        }
    }

    @Composable
    private fun IconButton(symbol: String, c: BrowserColors, onClick: () -> Unit) {
        Box(
            Modifier.size(40.dp).clip(CircleShape).clickable(onClick = onClick),
            contentAlignment = Alignment.Center,
        ) { Text(symbol, fontSize = 24.sp, color = c.text) }
    }

    @Composable
    private fun StatusPill(c: BrowserColors, modifier: Modifier) {
        AnimatedVisibility(status != null, modifier = modifier, enter = fadeIn(), exit = fadeOut()) {
            Text(
                status.orEmpty(),
                color = Color.White, fontSize = 14.sp,
                modifier = Modifier
                    .clip(CircleShape)
                    .background(if (statusIsError) Color(0xE6B3443B) else Color(0xE617153B))
                    .padding(horizontal = 18.dp, vertical = 9.dp),
            )
        }
    }

    @Composable
    private fun StartPage(c: BrowserColors) {
        var q by remember { mutableStateOf("") }
        Box(Modifier.fillMaxSize().background(c.bg), contentAlignment = Alignment.TopCenter) {
            Column(
                Modifier.widthIn(max = 640.dp).fillMaxWidth().padding(horizontal = 24.dp, vertical = 64.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                Text("译幕网页", fontSize = 30.sp, fontWeight = FontWeight.Bold, color = c.text)
                Text("打开英文网页，自动整页翻译成自然的中文", fontSize = 15.sp, color = c.muted)
                BasicTextField(
                    value = q,
                    onValueChange = { q = it },
                    singleLine = true,
                    textStyle = TextStyle(color = c.text, fontSize = 17.sp),
                    cursorBrush = SolidColor(c.accent),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go),
                    keyboardActions = KeyboardActions(onGo = { if (q.isNotBlank()) open(q) }),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(18.dp))
                        .background(c.bar)
                        .border(1.dp, c.line, RoundedCornerShape(18.dp))
                        .padding(horizontal = 20.dp, vertical = 16.dp),
                    decorationBox = { inner ->
                        Box {
                            if (q.isEmpty()) Text("粘贴网址，或输入要搜索的内容", color = c.muted, fontSize = 17.sp)
                            inner()
                        }
                    },
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    QUICK_LINKS.forEach { (name, link) ->
                        Text(
                            name, color = c.text, fontSize = 14.sp,
                            modifier = Modifier
                                .clip(CircleShape)
                                .background(c.bar)
                                .border(1.dp, c.line, CircleShape)
                                .clickable { open(link) }
                                .padding(horizontal = 16.dp, vertical = 9.dp),
                        )
                    }
                }
                Text(
                    "小技巧：在其他浏览器里点「分享 → 译幕网页」，就能把当前网页直接用译幕打开翻译。",
                    fontSize = 13.sp, color = c.muted,
                )
            }
        }
    }

    companion object {
        const val EXTRA_URL = "url"

        private val QUICK_LINKS = listOf(
            "Reddit" to "https://www.reddit.com",
            "Medium" to "https://medium.com",
            "BBC" to "https://www.bbc.com/news",
            "The Verge" to "https://www.theverge.com",
            "Hacker News" to "https://news.ycombinator.com",
            "Wikipedia" to "https://en.wikipedia.org",
        )

        fun start(c: Context, url: String? = null) {
            c.startActivity(Intent(c, BrowserActivity::class.java).apply { if (url != null) putExtra(EXTRA_URL, url) })
        }

        fun toUrl(input: String): String {
            val s = input.trim()
            return when {
                s.startsWith("http://") || s.startsWith("https://") -> s
                !s.contains(' ') && s.contains('.') && Patterns.WEB_URL.matcher(s).matches() -> "https://$s"
                else -> "https://www.google.com/search?q=" + Uri.encode(s)
            }
        }

        fun extractUrl(text: String): String? {
            val m = Patterns.WEB_URL.matcher(text)
            return if (m.find()) m.group() else text.takeIf { it.isNotBlank() }
        }

        fun displayUrl(u: String): String =
            u.removePrefix("https://").removePrefix("http://").removePrefix("www.").trimEnd('/')
    }
}

// ---------- 配色 ----------

private data class BrowserColors(
    val bg: Color, val bar: Color, val field: Color, val text: Color,
    val muted: Color, val accent: Color, val line: Color,
)

@Composable
private fun browserColors(): BrowserColors = if (isSystemInDarkTheme()) {
    BrowserColors(
        bg = Color(0xFF111114), bar = Color(0xFF1B1B21), field = Color(0xFF26262E), text = Color(0xFFF2F2F5),
        muted = Color(0xFF9A9AA6), accent = Color(0xFF7C7AF5), line = Color(0xFF2A2A32),
    )
} else {
    BrowserColors(
        bg = Color(0xFFF5F4F0), bar = Color.White, field = Color(0xFFF0EFEA), text = Color(0xFF1A1A1F),
        muted = Color(0xFF6E6E78), accent = Color(0xFF4B47D6), line = Color(0xFFE7E5DF),
    )
}

@Composable
private fun YiMuBrowserTheme(content: @Composable () -> Unit) {
    androidx.compose.material3.MaterialTheme(content = content)
}

/** 翻译过的段落记在内存里：返回上一页、重复出现的菜单不用再花钱翻。 */
object WebCache {
    private val map = object : LinkedHashMap<String, String>(512, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?) = size > 3000
    }

    @Synchronized fun get(k: String): String? = map[k]
    @Synchronized fun put(k: String, v: String) {
        map[k] = v
    }
}
