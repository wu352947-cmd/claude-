# 译幕 · 实时双语字幕（安卓平板）

把 **任何 App**（YouTube、Instagram、TikTok、浏览器……）里正在播放的英文语音，变成浮在屏幕上的中英双语字幕。视频有没有字幕都能用。

## 工作原理

两种字幕模式（主页「字幕模式」切换）：

**稳定模式（默认）**：像电视字幕，每条字幕出现时就是最终译文，不再改动。

```
其他 App 播放的声音 → 本地流式语音识别（sherpa-onnx，离线）
   │  本地断句：说话人停顿 0.2~0.4 秒、且没停在 and/the/to/you 这类没说完的词上，就切出一段
   ▼
DeepSeek 流式翻译一段：第 1 行中文一写完就上屏；第 3 行 REST 把末尾没说完的词退回，并入下一段
   ▼
上屏节奏：每条至少停留到能读完（约每秒 7 字），积压时缩短停留追上进度；网络失败用本地模型顶上
```

用真实录音模拟：每条 8~11 个词，说话人停下后 0.2~0.4 秒切出，加上翻译，约 1 秒上屏。

**极速模式**：边说边出 ML Kit 灰色草稿，DeepSeek 按分句锁定、前缀续写逐步补全。最快，但字幕会变化。

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
- 灰色草稿质量一般，白色正式译文会随后替换；本地草稿语言包首次下载需要开 VPN。

## 代码结构

| 文件 | 作用 |
|---|---|
| `MainActivity.kt` | 主页：设置步骤、开始/停止、字幕记录 |
| `CaptureService.kt` | 前台服务：捕获声音 → 识别 → 翻译 |
| `AsrEngine.kt` | 本地流式语音识别与断句 |
| `Translator.kt` | DeepSeek 翻译与续写（提示词在这里调） |
| `StablePipeline.kt` | 稳定模式：断句、翻译、上屏节奏 |
| `TranslationPipeline.kt` | 极速模式：草稿 / 分句锁定 / 续写 |
| `LocalTranslator.kt` | ML Kit 本地翻译（备用 / 草稿） |
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

`userscript/yimu-web.user.js` 是一个 Tampermonkey 脚本，核心代码在 `userscript/core.js`：

1. Edge → 菜单 → 扩展 → 安装 Tampermonkey；
2. 在 Edge 打开 https://raw.githubusercontent.com/wu352947-cmd/claude-/claude/tender-lamport-vb8i8b/subtitle-app/userscript/yimu-web.user.js ，点「安装」；
3. 打开任意英文网页，点右下角「译」，填入 DeepSeek API Key。

修改 `core.js` 后运行 `userscript/build.sh` 重新生成脚本。
