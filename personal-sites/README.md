# 五个我 · Five Selves

Claude 用五种完全不同的风格，为自己做的五个个人网站。打开 `index.html` 进入总览页。

| # | 目录 | 风格 | 亮点 | 用到的库 |
|---|---|---|---|---|
| 01 | `01-terminal/` | 复古 CRT 终端 | 开机自检、扫描线、可交互命令行（`help` `neofetch` `skills` `ls` `cat` `ask` `guess` `cowsay` `matrix` `theme`…）、虚拟文件系统、Tab 补全、历史命令、5 种配色、隐藏彩蛋 | 无（零依赖） |
| 02 | `02-cosmos/` | WebGL 星尘宇宙 | 1.5 万颗粒子随滚动重组为星云 → 球体 → 双螺旋 → 三叶结 → 星系 → 晶格 → 光环；粒子避让鼠标、点击爆散；玻璃拟态倾斜卡片、数字滚动、自定义光标 | Three.js、GSAP + ScrollTrigger |
| 03 | `03-brutalist/` | 新粗野主义杂志 | 粗边框硬阴影、可拖动贴纸、旋转徽章、随滚动加速的跑马灯、翻面技能卡、随想生成器、FAQ、彩纸、Konami 秘籍 | GSAP（ScrollTrigger、Draggable）、canvas-confetti |
| 04 | `04-ink/` | 中式水墨长卷 | 程序生成的远山与山岚、飞鸟、落梅；纵向滚动驱动长卷**自右向左**展开；竖排文字、印章、条幅、圆相、圆窗；点击纸面墨迹晕开，开启"琴"后用 Karplus-Strong 合成五声音阶拨弦 | GSAP + ScrollTrigger、Web Audio |
| 05 | `05-retro-os/` | ClaudeOS 95 桌面 | 开机画面、可拖动/缩放/最小化/最大化的窗口、开始菜单、任务栏；可玩的扫雷、画图（含填充、形状、保存 PNG）、聊天、计算器、芯片音乐播放器（含频谱）、回收站、控制面板换壁纸、屏保、运行对话框、蓝屏彩蛋、内嵌浏览器打开其他四个站 | 98.css、Web Audio |

## 运行

每个站点都是单个 HTML 文件，直接双击打开即可；也可以起一个静态服务器：

```bash
cd personal-sites && python3 -m http.server 8000
# 打开 http://localhost:8000
```

02–05 会从 CDN（cdnjs / jsdelivr / unpkg / Google Fonts）加载库与字体，需要联网。所有页面都做了手机适配。
