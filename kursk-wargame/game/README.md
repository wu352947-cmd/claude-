# 库尔斯克 1943 · 游戏代码

设计文档与开发约定见上一级目录：[`../README.md`](../README.md)、[`../CLAUDE.md`](../CLAUDE.md)。

| 目录 | 内容 |
|---|---|
| `src/engine/` | 规则引擎：纯 TypeScript、确定性，不碰画面 |
| `src/client/` | 画面与交互（PixiJS） |
| `data/` | 游戏数据（JSON），加载时用 Zod 校验 |
| `test/` | 自动化测试（Vitest） |

## 常用命令

```bash
npm install        # 第一次
npm run dev        # 本地开发，浏览器打开提示的地址
npm run check      # 类型检查 + 全部测试（提交前必须通过）
npm run build      # 打包到 dist/
```

推送到 GitHub 后，`.github/workflows/kursk-pages.yml` 自动测试、构建并部署到 GitHub Pages。
