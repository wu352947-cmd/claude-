# 数·途

定制化数学高考刷题应用。设计思路见 [ARCHITECTURE.md](ARCHITECTURE.md)。

现在能做的事：

| 页面 | 内容 |
|---|---|
| 今日 | 到期错题 + 按「卷面分值 × 薄弱程度」挑的新题，每道题附推荐理由；一键开始，逐题做 |
| 做题 | 公式渲染、计时（超时变红）、分级提示、「有把握 / 不踏实 / 蒙的」；单选、多选（新高考部分得分）、填空（数学等价判分）、解答题（对照得分点自评） |
| 结果 | 正确答案与解答、各知识点掌握度变化、下次复习时间；做错时选错因、写一句反思 |
| 错题本 | 到期 / 全部 / 已毕业；FSRS 安排复习，连续 3 次做对且间隔超过 30 天就「毕业」 |
| 题库 | 按模块、题型、关键词筛选 |
| 录题 | 网页表单录入，实时预览公式，保存成 YAML 文件 |
| 看板 | 各模块与知识点的把握（按卷面分值加权）、近 30 天失分按错因分布 |

还没做的（见 ARCHITECTURE.md §10）：拍照录题、AI 讲解、变式题生成、模考组卷、预测分、离线 PWA。

## 运行

需要 [uv](https://docs.astral.sh/uv/)（会自动装好合适版本的 Python）和 Node.js 22+。Windows、macOS、Linux 都可以。

```bash
# 1. 构建前端（只在前端代码有改动时需要）
cd web
npm install
npm run build

# 2. 启动后端（同时提供网页）
cd ../server
uv sync
uv run uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000
```

电脑上打开 <http://localhost:8000>。手机和电脑连同一个 Wi-Fi 时，手机打开 `http://电脑的局域网IP:8000`，再「添加到主屏幕」。

**不要把服务直接暴露到公网。** 如果需要在外面访问，启动时设置口令：

```bash
APP_TOKEN=换成一串随机字符 uv run uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000
```

第一次用 `http://地址:8000/?token=那串字符` 打开，浏览器会记住。

### 开发

```bash
cd server && uv run uvicorn app.main:create_app --factory --reload   # 后端，端口 8000
cd web && npm run dev                                                # 前端热更新，/api 自动转发到 8000
cd server && uv run pytest                                           # 后端测试
cd web && npm run typecheck                                          # 前端类型检查
```

## 录题

两种方式，结果一样，都是 `data/questions/` 下一个题目一个 YAML 文件：

- **网页「录题」**：适合手机上随手录错题，保存到 `data/questions/inbox/`。
- **直接写 YAML**：适合在电脑上批量录。格式照着 `data/questions/samples/` 里的 15 道示例题写；改完后在「看板」点「重新加载题库」。

几个要点：

- 公式用 `$...$`，独立成行的用 `$$...$$`。YAML 里含反斜杠的单行字符串用**单引号**包起来，多行内容用 `|`。
- `kps` 必须是 `data/knowledge_graph.yaml` 里已有的 id，可以写列表或带权重的字典。
- 填空题 `answer_kind`：`expr`（一个值）、`set`（多个值，如 `'-1, \sqrt{2}'`）、`interval`（区间，如 `'(2,+\infty)'`，单调区间可加 `loose_endpoints: true` 不区分开闭）、`equation`（方程，两边同乘常数算同一个）。
- 解答题写 `parts`（每问分值、答案、得分点 `rubric`）和完整的 `solution`。
- 文件有错时这道题会被跳过，「今日」和「看板」会提示是哪个文件、错在哪。

学生作答时，`√3/2`、`sqrt(3)/2`、`\frac{\sqrt3}{2}` 都能被识别为同一个答案；`0.866` 这样的近似值会判错。

## 配置

- `data/config.yaml`：每天推几道题、当前复习重点模块（推荐时优先）、FSRS 记忆保持率、掌握度参数、时区。
- `data/exam_blueprint.yaml`：试卷结构，决定各题型默认分值和建议用时。**先确认你所在省份用的是哪套卷。**
- `data/knowledge_graph.yaml`：知识点、前置关系、每个知识点在卷面上大约值多少分（初始值是估计，建议用近三年真题校准）。

## 数据

- 题库：`data/`，用 Git 管理。
- 作答记录、掌握度、错题本：`var/app.db`（SQLite，单个文件）。**定期把这个文件复制一份备份。**
- 全部作答数据也可以用 `GET /api/export` 导出成 JSON。

## 代码结构

```
data/                  题库与配置（YAML，唯一数据源，启动时同步进数据库）
server/app/
  core/grading.py      判分：多选部分得分、填空等价判定（SymPy）
  core/performance.py  作答 → 0–1 表现分
  core/mastery.py      知识点掌握度（Elo / IRT-1PL，含遗忘衰减）
  core/review.py       错题复习调度（FSRS）
  core/today.py        每日推荐
  core/stats.py        看板数据
  bank.py              YAML 校验、同步、写入
  api.py · main.py     接口与启动
server/tests/          判分、算法、题库校验、接口全流程测试
web/src/               React 前端（KaTeX 渲染公式）
```

示例题均为原创，仅用于演示格式，换成你自己的题即可。
