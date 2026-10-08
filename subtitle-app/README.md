# 译幕 · 实时双语字幕（安卓平板）

把 **任何 App**（YouTube、Instagram、TikTok、浏览器……）里正在播放的英文语音，变成浮在屏幕上的中英双语字幕。视频有没有字幕都能用。

## 工作原理

```
其他 App 播放的声音
   │  安卓「播放声音捕获」（需要用户授权共享屏幕）
   ▼
本地语音识别（sherpa-onnx 流式英文模型，平板离线运行，免费）
   │  说完一句（停顿 0.7 秒，或长句在换气处自动切分）
   ▼
DeepSeek 翻译（附带前 3 句做上下文，顺便纠正识别错误、补全标点）
   ▼
悬浮字幕条（轻点：双语 / 仅中文；拖动：移动位置）
```

## 安装和首次设置

1. 在平板上下载 `YiMu-x.y.z.apk` 并安装（需要允许"安装未知来源应用"）。
2. 打开「译幕」，按页面上的三步操作：
   - 填写 DeepSeek API Key（在 platform.deepseek.com 注册 → 充值 → API Keys → 创建）；
   - 下载离线识别模型（约 180 MB，只下载一次，优先使用国内镜像 hf-mirror.com）；
   - 授予录音、悬浮窗、通知权限。
3. 点「开始实时字幕」，系统询问共享范围时选「整个屏幕」。
4. 打开 YouTube / Instagram / TikTok 播放英文视频。

联想平板建议在「设置 → 应用 → 译幕 → 电池」里允许后台运行。

## 已知限制（v0.1）

- 少数 App 禁止捕获声音，这时字幕条会一直显示"等待声音"。
- 只识别英文；背景音乐很响时识别准确率会下降。
- 中文字幕比说话慢 1~2 秒（先识别完一句再翻译）。

## 代码结构

| 文件 | 作用 |
|---|---|
| `MainActivity.kt` | 主页：设置步骤、开始/停止、字幕记录 |
| `CaptureService.kt` | 前台服务：捕获声音 → 识别 → 翻译 |
| `AsrEngine.kt` | 本地流式语音识别与断句 |
| `Translator.kt` | DeepSeek 翻译（提示词在这里调） |
| `SubtitleOverlay.kt` | 悬浮字幕条的样式和手势 |
| `ModelManager.kt` | 识别模型下载（断点续传、镜像切换） |
| `SubtitleBus.kt` | 服务与界面之间共享的实时状态 |
| `Prefs.kt` | 本机设置 |

## 自己编译

需要 JDK 17+ 和 Android SDK（platform 36）。首次构建会自动下载 sherpa-onnx 库：

```
gradle assembleRelease
```

输出在 `app/build/outputs/apk/release/app-release.apk`。签名密钥在 `keystore/` 里（个人自用项目，固定签名，方便以后的新版本直接覆盖安装）。

## 在 Edge 浏览器里直接翻译网页（推荐）

`userscript/yimu-web.user.js` 是一个 Tampermonkey 脚本，和 App 内置浏览器用的是同一套整页翻译代码：

1. Edge → 菜单 → 扩展 → 安装 Tampermonkey；
2. 在 Edge 打开 https://raw.githubusercontent.com/wu352947-cmd/claude-/claude/tender-lamport-vb8i8b/subtitle-app/userscript/yimu-web.user.js ，点「安装」；
3. 打开任意英文网页，点右下角「译」，填入 DeepSeek API Key。

修改翻译核心 `app/src/main/assets/yimu-web.js` 后运行 `userscript/build.sh` 重新生成脚本。
