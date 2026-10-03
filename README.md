# 拾光手帐

日系与中式审美结合的个人手帐网站。每天一页，节气为序，月亮回信。

- **落地页** `/`：水墨晕染圆窗、节气罗盘、拾物板、诗笺、千里江山画卷、湖上心愿灯（可试玩，数据只存在本机）
- **手帐应用** `/app/`：注册登录后使用，数据存在服务器

## 功能

| 模块 | 内容 |
|---|---|
| 账号 | 手机号验证码登录（新号码自动建手帐）、手机号或用户名 + 密码登录、验证码找回密码、绑定手机号 |
| 今日 | 一天一页的纸张：日期、农历、节气与七十二候、月相、天气、心情、今日小问；正文用霞鹜文楷书写，自动保存。纸张按固定的 760 宽排版、整体缩放，**任何设备上文字换行与贴纸位置完全一致**；小屏幕点正文会打开全屏书写纸。左右滑动或方向键翻到前后一天 |
| 贴纸 | 花草 / 物件 / 天象 / 印章 / 和纸 / 邮票六类 26 枚手绘矢量贴纸，可拖动、旋转、缩放、撕掉（键盘方向键也能移动）；照片以拍立得形式贴上并“显影”，每页最多 4 张 |
| 仪式 | “封存这一页”盖下朱印；“请月亮回一封信”让 AI 读完这一页后写回信 |
| 手帐本 | 按月排列的书架缩略页，点开后 3D 翻页逐日阅读，可跳回编辑 |
| 画卷 | **我的千里江山**：一年的手帐画成一卷青绿山水。字数决定山势，心情为峰顶晕染，季节决定花、叶、雪；贴纸成树、照片成屋、封存有舟、回信有灯、满月有月；卷首题字与名章，今天之后留白“未完待续”。可拖动、悬停看摘要、点开当天，可导出整卷长图 |
| 信箱 | 月亮的回信与时光信。时光信可寄往一个月、半年、一年、三年后或任意日期，到期前无法拆开；拆信有揭火漆、信纸展开、逐段落墨的动画 |
| 仪式 | 新用户第一次进来，用聚光灯带着选心情、写一句、贴贴纸、盖第一枚印；今日页会飘出泛黄的“一年前的今天” |
| 设置 | 昵称、日 / 夜 / 跟随系统、安静模式、每日提醒（生成每天重复的日历事件，国内手机都能用）、让月亮记得最近的事（默认关闭）、绑定手机 / 设置密码、导出全部数据、注销账号 |
| 季节 | 全站强调色与飘落物随当前节气所在季节自动变化（春樱 · 夏萤 · 秋叶 · 冬雪） |

## 关怀与合规设计

- **心理危机兜底**：手帐或 AI 回信中出现自伤相关表述时，页面会温和提示全国统一心理援助热线 **12356**（国家卫健委，2025 年起全国开通）及 110 / 120；请求回信时如命中这类表述，**不调用模型**，直接返回一封固定的关怀信。关键词表在 `server/safety.js`，建议由专业人士定期复核。
- **AI 标识**：AI 回信在信纸底部注明“此信由 AI 生成”，符合《生成式人工智能服务管理暂行办法》对生成内容显著标识的要求。面向国内公众提供服务时，请选用已完成备案的模型。
- **个人信息**：默认仅本人可见；照片接口校验归属；支持导出与注销（《个人信息保护法》的查阅、复制、删除权）。`public/privacy.html` 与 `public/terms.html` 为**草稿模板**，上线前请法律专业人士审阅并填写运营主体。
- **境内可用**：页面不引用任何境外资源。字体（ZCOOL 小薇、马善政、Klee One、Cormorant Garamond、霞鹜文楷）全部自托管并按字符分片加载。
- **加密存储**：手帐正文与信件在数据库中以 AES-256-GCM 加密（`ENTRY_KEY`），数据库或备份泄露也读不出内容；旧数据启动时自动迁移。**密钥要与数据分开备份**，丢了密钥内容就无法恢复。
- **回信记忆**：默认关闭；开启后请求回信时附上最近 30 天至多 4 页、每页不超过 120 字的摘要，隐私政策已写明。
- **安全**：scrypt 密码哈希、会话令牌与短信验证码只存哈希、HttpOnly + SameSite Cookie、写请求校验自定义头防 CSRF、登录与注册限流、CSP 等安全响应头、上传文件魔数校验。

## 本地运行

需要 Node.js 22.13 或更高版本（使用内置的 `node:sqlite`，无需安装任何 npm 依赖）。

```bash
npm run dev        # AI 回信用模板信，短信验证码直接显示在页面上，打开 http://localhost:8080
npm test           # 接口测试
```

## 部署（以阿里云 / 腾讯云轻量服务器为例）

1. **域名与备案**：在云厂商完成域名实名与 ICP 备案，把备案号填进 `SITE_ICP`；网站上线后 30 日内到全国互联网安全管理服务平台办理公安联网备案。
2. **准备配置**：`cp .env.example .env`，按注释填写。
3. **启动**（任选其一）：
   ```bash
   # Docker
   docker build -t shiguang .
   docker run -d --name shiguang --restart=always -p 127.0.0.1:8080:8080 --env-file .env -v /srv/shiguang:/data shiguang

   # 或直接用 Node（配合 systemd / pm2）
   node --env-file=.env --no-warnings=ExperimentalWarning server/index.js
   ```
4. **HTTPS**：参考 `deploy/nginx.conf` 配置反向代理与证书（`COOKIE_SECURE=auto` 依赖反代传入 `X-Forwarded-Proto`）。
5. **备份**：`deploy/backup.sh` 每日备份数据库与照片，保留 30 天。数据全在 `DATA_DIR` 一个目录里。

单机 SQLite 足以支撑起步阶段（数万用户）。用户量上来后，可把 `server/db.js` 换成 PostgreSQL / MySQL，照片迁到对象存储（OSS / COS），限流换成 Redis。

## 开启手机号登录

在阿里云短信服务控制台申请**短信签名**和**验证码模板**（模板变量名用 `code`，例如“您的验证码为 ${code}，5 分钟内有效。”），审核通过后在 `.env` 填写：

```bash
SMS_PROVIDER=aliyun
ALIYUN_ACCESS_KEY_ID=...        # 建议用只授权了短信发送的 RAM 子账号
ALIYUN_ACCESS_KEY_SECRET=...
SMS_SIGN_NAME=拾光手帐
SMS_TEMPLATE_CODE=SMS_000000000
```

限制：同一号码 60 秒一次、每天 10 次；同一 IP 每小时 20 次；验证码 5 分钟有效，最多试 5 次。未配置时登录页只显示用户名密码方式。

## 开启 AI 回信

在 `.env` 设置 `AI_PROVIDER` 与密钥即可，重启后生效，无需改代码：

```bash
AI_PROVIDER=deepseek   AI_API_KEY=sk-...                      # DeepSeek
AI_PROVIDER=qwen       AI_API_KEY=sk-...                      # 通义千问（阿里云百炼）
AI_PROVIDER=openai-compatible AI_BASE_URL=https://... AI_MODEL=... AI_API_KEY=...
```

回信的人设与写作要求在 `server/ai.js` 的 `SYSTEM` 中。每位用户每天的回信上限由 `AI_DAILY_LIMIT` 控制（默认 3 封），同一天的手帐只回一封。

## 目录

```
server/           服务端：index.js（路由与静态文件）、db.js、auth.js、ai.js、safety.js、sms.js、crypto.js
public/           网站根目录
  index.html      落地页（由 src/journal.html 生成，勿直接修改）
  app/            手帐应用：index.html、app.css、js/（main、page、stickers、calendar、coach、views/today|book|scroll|letters|settings|auth）
  assets/         图片
  fonts/          自托管字体
src/journal.html  落地页源文件，同时也是在线展示版（Artifact）
tools/            build-landing.mjs（生成落地页）、fetch-fonts.mjs（下载并修补字体）
deploy/           nginx.conf、backup.sh
test/             接口测试
```

修改落地页后运行 `npm run build`。

## 素材与授权

- 照片来自 [Pexels](https://www.pexels.com)（Pexels License，可免费商用）；画卷为北宋王希孟《千里江山图》局部（公有领域，Wikimedia Commons）。长期运营建议逐步替换为原创插画，形成独有的品牌视觉。
- 霞鹜文楷：SIL Open Font License 1.1（见 `public/fonts/lxgw/OFL.txt`）；其余字体来自 Google Fonts，均为 OFL 授权。
- ZCOOL 小薇的“回”字字形有误（会渲染成实心方块），`tools/fetch-fonts.mjs` 会把它交给后备字体显示。
