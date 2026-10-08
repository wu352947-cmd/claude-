package com.yimu.subtitle

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionConfig
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    // 从系统设置页回来时刷新权限状态
    private var resumeTick by mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            YiMuTheme { HomeScreen(resumeTick) }
        }
    }

    override fun onResume() {
        super.onResume()
        ModelManager.refresh(this)
        resumeTick++
    }
}

// ---------- 配色 ----------

private data class Palette(
    val bg: Color, val card: Color, val text: Color, val muted: Color,
    val accent: Color, val accentSoft: Color, val ok: Color, val line: Color,
)

private val LightPalette = Palette(
    bg = Color(0xFFF5F4F0), card = Color.White, text = Color(0xFF1A1A1F), muted = Color(0xFF6E6E78),
    accent = Color(0xFF4B47D6), accentSoft = Color(0xFFECEBFF), ok = Color(0xFF1F9D6B), line = Color(0xFFE7E5DF),
)
private val DarkPalette = Palette(
    bg = Color(0xFF111114), card = Color(0xFF1B1B21), text = Color(0xFFF2F2F5), muted = Color(0xFF9A9AA6),
    accent = Color(0xFF8E8CFF), accentSoft = Color(0xFF26244A), ok = Color(0xFF4FD1A1), line = Color(0xFF2A2A32),
)

private var P = LightPalette

@Composable
private fun YiMuTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    P = if (dark) DarkPalette else LightPalette
    val scheme = if (dark) {
        darkColorScheme(primary = P.accent, background = P.bg, surface = P.card, onSurface = P.text)
    } else {
        lightColorScheme(primary = P.accent, background = P.bg, surface = P.card, onSurface = P.text)
    }
    MaterialTheme(colorScheme = scheme, content = content)
}

// ---------- 主页 ----------

@Composable
private fun HomeScreen(resumeTick: Int) {
    val ctx = LocalContext.current
    val live by SubtitleBus.state.collectAsState()
    val dl by ModelManager.state.collectAsState()
    val scope = rememberCoroutineScope()

    var key by remember { mutableStateOf(Prefs.apiKey(ctx)) }
    var savedKey by remember { mutableStateOf(Prefs.apiKey(ctx)) }
    var testResult by remember { mutableStateOf<String?>(null) }
    var testing by remember { mutableStateOf(false) }
    var permTick by remember { mutableIntStateOf(0) }

    val tick = resumeTick + permTick
    val hasAudio = remember(tick) {
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    }
    val hasNotif = remember(tick) {
        Build.VERSION.SDK_INT < 33 ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }
    val hasOverlay = remember(tick) { Settings.canDrawOverlays(ctx) }
    val modelReady = dl is ModelManager.DlState.Done

    val permLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { permTick++ }
    val projectionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val data = r.data
        if (r.resultCode == Activity.RESULT_OK && data != null) CaptureService.start(ctx, r.resultCode, data)
    }

    val missing = buildList {
        if (savedKey.isBlank()) add("填写 API Key")
        if (!modelReady) add("下载识别模型")
        if (!hasAudio) add("录音权限")
        if (!hasOverlay) add("悬浮窗权限")
    }

    Box(Modifier.fillMaxSize().background(P.bg), contentAlignment = Alignment.TopCenter) {
        Column(
            Modifier
                .safeDrawingPadding()
                .widthIn(max = 720.dp)
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Header()
            Preview()

            // 开始 / 停止
            Button(
                onClick = {
                    if (live.running) {
                        CaptureService.stop(ctx)
                    } else {
                        val mpm = ctx.getSystemService(MediaProjectionManager::class.java)
                        val intent = if (Build.VERSION.SDK_INT >= 34) {
                            mpm.createScreenCaptureIntent(MediaProjectionConfig.createConfigForDefaultDisplay())
                        } else {
                            mpm.createScreenCaptureIntent()
                        }
                        projectionLauncher.launch(intent)
                    }
                },
                enabled = live.running || missing.isEmpty(),
                modifier = Modifier.fillMaxWidth().height(58.dp),
                shape = RoundedCornerShape(18.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (live.running) P.text else P.accent,
                    contentColor = if (live.running) P.bg else Color.White,
                ),
            ) {
                Text(if (live.running) "停止字幕" else "开始实时字幕", fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
            }
            when {
                live.running -> RunningStatus(live.level)
                missing.isNotEmpty() -> Caption("还差：" + missing.joinToString("、"))
                else -> Caption("点击后选择「整个屏幕」，然后打开 YouTube / Instagram / TikTok 播放英文视频")
            }
            live.notice?.let { Caption(it, color = Color(0xFFD9534F)) }

            if (live.lines.isNotEmpty()) Transcript(live.lines)

            StepCard(1, "DeepSeek API Key", done = savedKey.isNotBlank()) {
                Caption("在 platform.deepseek.com 注册并充值少量余额（几块钱能用很久），进入 API Keys 创建一个，复制粘贴到这里。")
                OutlinedTextField(
                    value = key,
                    onValueChange = { key = it; testResult = null },
                    singleLine = true,
                    placeholder = { Text("sk-…") },
                    visualTransformation = PasswordVisualTransformation(),
                    shape = RoundedCornerShape(14.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = P.accent, unfocusedBorderColor = P.line,
                        focusedTextColor = P.text, unfocusedTextColor = P.text,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                    PrimarySmall("保存", enabled = key.isNotBlank() && key.trim() != savedKey) {
                        Prefs.setApiKey(ctx, key)
                        savedKey = Prefs.apiKey(ctx)
                    }
                    SecondarySmall(if (testing) "测试中…" else "测试翻译", enabled = savedKey.isNotBlank() && !testing) {
                        testing = true
                        testResult = null
                        scope.launch {
                            testResult = try {
                                val t0 = System.currentTimeMillis()
                                var first = 0L
                                val r = Translator { savedKey }.stream("THIS IS A QUICK TEST OF MY NEW SUBTITLE APP", emptyList()) {
                                    if (first == 0L && it.zh.isNotEmpty()) first = System.currentTimeMillis()
                                }
                                "✓ ${r.zh}（首字 %.1f 秒）".format(((if (first > 0) first else System.currentTimeMillis()) - t0) / 1000f)
                            } catch (e: Exception) {
                                "✗ ${e.message}"
                            }
                            testing = false
                        }
                    }
                }
                testResult?.let {
                    Text(it, color = if (it.startsWith("✓")) P.ok else Color(0xFFD9534F), fontSize = 14.sp)
                }
            }

            StepCard(2, "离线语音识别模型", done = modelReady) {
                when (val s = dl) {
                    is ModelManager.DlState.Done -> Caption("已就绪。识别在平板本地完成，不耗流量、不花钱。")
                    is ModelManager.DlState.Downloading -> {
                        Caption("正在下载… ${(s.progress * 100).toInt()}%（可以切到别的 App，别关掉这里）")
                        LinearProgressIndicator(
                            progress = { s.progress },
                            modifier = Modifier.fillMaxWidth().height(6.dp).clip(CircleShape),
                            color = P.accent, trackColor = P.accentSoft,
                        )
                    }
                    is ModelManager.DlState.Failed -> {
                        Caption(s.message, color = Color(0xFFD9534F))
                        PrimarySmall("继续下载") { scope.launch { ModelManager.download(ctx.applicationContext) } }
                    }
                    ModelManager.DlState.Idle -> {
                        Caption("英文语音识别模型约 180 MB，只需下载一次。建议连接 Wi-Fi。")
                        PrimarySmall("下载模型") { scope.launch { ModelManager.download(ctx.applicationContext) } }
                    }
                }
            }

            StepCard(3, "授权", done = hasAudio && hasOverlay && hasNotif) {
                PermissionRow(
                    "录音权限",
                    "系统规定：捕获视频里的声音也需要这个权限。本应用不会使用麦克风。",
                    granted = hasAudio,
                ) { permLauncher.launch(Manifest.permission.RECORD_AUDIO) }
                PermissionRow("悬浮窗", "让字幕浮在其他 App 上方", granted = hasOverlay) {
                    ctx.startActivity(
                        Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}")),
                    )
                }
                if (Build.VERSION.SDK_INT >= 33) {
                    PermissionRow("通知", "在通知栏显示「停止」按钮", granted = hasNotif) {
                        permLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }
            }

            LocalDraftCard()
            SpeedCard()
            Tips()
            Spacer(Modifier.height(12.dp))
        }
    }
}

// ---------- 组件 ----------

@Composable
private fun Header() {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
        Box(
            Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)).background(Color(0xFF17153B)),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(Modifier.width(26.dp).height(5.dp).clip(CircleShape).background(Color.White))
                Box(Modifier.width(16.dp).height(4.dp).clip(CircleShape).background(Color(0xFF8E8CFF)))
            }
        }
        Column {
            Text("译幕", fontSize = 30.sp, fontWeight = FontWeight.Bold, color = P.text)
            Text("任何 App 里的英文语音，都变成实时双语字幕", fontSize = 14.sp, color = P.muted)
        }
    }
}

@Composable
private fun Preview() {
    Box(
        Modifier
            .fillMaxWidth()
            .height(190.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF1E2A4A), Color(0xFF3B2D5C), Color(0xFF6A3A55)))),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Text(
            "预览", color = Color.White.copy(alpha = 0.55f), fontSize = 12.sp,
            modifier = Modifier.align(Alignment.TopStart).padding(16.dp),
        )
        Column(
            Modifier
                .padding(bottom = 22.dp, start = 20.dp, end = 20.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(Color(0xC40E0E14))
                .padding(horizontal = 22.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("说实话，这是我做过最难的决定之一。", color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
            Spacer(Modifier.height(4.dp))
            Text(
                "Honestly, this was one of the hardest decisions I've ever made.",
                color = Color.White.copy(alpha = 0.78f), fontSize = 13.sp, textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun RunningStatus(level: Float) {
    val animated by animateFloatAsState(level, label = "level")
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(P.ok))
            Text("字幕运行中", color = P.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
        }
        Box(Modifier.fillMaxWidth().height(6.dp).clip(CircleShape).background(P.accentSoft)) {
            Box(Modifier.fillMaxWidth(animated.coerceIn(0.02f, 1f)).height(6.dp).clip(CircleShape).background(P.accent))
        }
        Caption("上面的条会随视频声音跳动。如果播放时它一直不动，说明这个 App 禁止捕获声音。")
    }
}

@Composable
private fun Transcript(lines: List<Line>) {
    Card {
        Text("字幕记录", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = P.text)
        lines.takeLast(30).asReversed().forEach { l ->
            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                val zh = l.error ?: l.zh ?: l.tail
                if (!zh.isNullOrEmpty()) Text(zh, color = P.text, fontSize = 16.sp)
                Text(l.englishForDisplay, color = P.muted, fontSize = 13.sp)
                l.latencyMs?.let {
                    Text("说完后 %.1f 秒出正式中文".format(it / 1000f), color = P.muted.copy(alpha = 0.7f), fontSize = 11.sp)
                }
            }
        }
    }
}

@Composable
private fun StepCard(n: Int, title: String, done: Boolean, content: @Composable () -> Unit) {
    Card {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                Modifier.size(28.dp).clip(CircleShape).background(if (done) P.ok else P.accentSoft),
                contentAlignment = Alignment.Center,
            ) {
                Text(if (done) "✓" else "$n", color = if (done) Color.White else P.accent, fontSize = 14.sp, fontWeight = FontWeight.Bold)
            }
            Text(title, fontSize = 17.sp, fontWeight = FontWeight.SemiBold, color = P.text)
        }
        content()
    }
}

@Composable
private fun Card(content: @Composable () -> Unit) {
    Column(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(P.card).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) { content() }
}

@Composable
private fun PermissionRow(title: String, desc: String, granted: Boolean, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f).padding(end = 12.dp)) {
            Text(title, color = P.text, fontSize = 15.sp, fontWeight = FontWeight.Medium)
            Text(desc, color = P.muted, fontSize = 13.sp)
        }
        if (granted) {
            Text("已开启", color = P.ok, fontSize = 14.sp, fontWeight = FontWeight.Medium)
        } else {
            PrimarySmall("去开启", onClick = onClick)
        }
    }
}

@Composable
private fun SpeedCard() {
    val ctx = LocalContext.current
    var live by remember { mutableStateOf(Prefs.liveMode(ctx)) }
    Card {
        Text("字幕模式", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = P.text)
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(P.accentSoft).padding(3.dp),
            horizontalArrangement = Arrangement.spacedBy(3.dp),
        ) {
            listOf(false to "稳定模式（推荐）", true to "极速模式").forEach { (value, label) ->
                val selected = live == value
                Box(
                    Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (selected) P.accent else Color.Transparent)
                        .clickable { live = value; Prefs.setLiveMode(ctx, value) }
                        .padding(vertical = 10.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        label, fontSize = 14.sp,
                        color = if (selected) Color.White else P.text,
                        fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Normal,
                    )
                }
            }
        }
        Caption(
            if (live) "边说边出灰色草稿，译文逐步补全，最快但字幕会变化。"
            else "像电视字幕：每条字幕出现时就是最终译文，不再改动。按意思断句，节奏稳定，比说话晚约 1 秒。",
        )
        Caption("切换后，下次点「开始实时字幕」生效。", color = P.muted.copy(alpha = 0.7f))
    }
}

@Composable
private fun LocalDraftCard() {
    val ctx = LocalContext.current
    val st by LocalTranslator.state.collectAsState()
    LaunchedEffect(Unit) { LocalTranslator.check() }
    Card {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).padding(end = 12.dp)) {
                Text("本地备用翻译", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = P.text)
                Text(
                    "在平板上装一个离线小翻译模型（约 30 MB）：网络不稳时用它顶上，字幕不会空着；" +
                        "极速模式下还用它显示灰色草稿。首次下载需要开 VPN。",
                    color = P.muted, fontSize = 13.sp, lineHeight = 19.sp,
                )
                when (val x = st) {
                    is LocalTranslator.State.Failed -> Text(x.message, color = Color(0xFFD9534F), fontSize = 13.sp)
                    LocalTranslator.State.Downloading -> Text("正在下载…", color = P.accent, fontSize = 13.sp)
                    else -> {}
                }
            }
            when (st) {
                LocalTranslator.State.Ready -> Text("已就绪", color = P.ok, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                LocalTranslator.State.Downloading -> {}
                else -> PrimarySmall("下载") { LocalTranslator.download() }
            }
        }
    }
}

@Composable
private fun Tips() {
    Card {
        Text("使用小贴士", fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = P.text)
        listOf(
            "开始时系统会询问共享范围，请选择「整个屏幕」，否则可能听不到声音。",
            "轻点字幕条切换「双语 / 仅中文」，按住拖动可以移动位置。",
            "如果字幕条一直显示「等待声音」，说明这个 App 不允许捕获声音，可以试试用浏览器打开同一个视频。",
            "联想平板建议在 设置 → 应用 → 译幕 → 电池 中选择「允许后台运行」，避免字幕被系统关掉。",
            "语音识别在平板本地完成，不需要网络；翻译要连 DeepSeek，所以需要网络。",
            "开着 VPN 时，建议在 VPN 里把 deepseek.com 设为「直连」：它是国内服务，直连更快、更稳。",
        ).forEach { Text("•  $it", color = P.muted, fontSize = 14.sp, lineHeight = 21.sp) }
    }
}

@Composable
private fun Caption(text: String, color: Color = P.muted) {
    Text(text, color = color, fontSize = 14.sp, lineHeight = 20.sp)
}

@Composable
private fun PrimarySmall(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick, enabled = enabled, shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = P.accent, contentColor = Color.White),
    ) { Text(label, fontSize = 14.sp) }
}

@Composable
private fun SecondarySmall(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, enabled = enabled, shape = RoundedCornerShape(12.dp)) {
        Text(label, fontSize = 14.sp, color = P.accent)
    }
}
