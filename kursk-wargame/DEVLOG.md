# 开发日志

每完成一轮记一行：日期 · 做了什么 · 做了哪些决定。

| 日期 | 冲刺 | 内容 | 决定 |
|---|---|---|---|
| 2026-10-08 | 0 | 搭建 `game/`：Vite + TypeScript + PixiJS 8 + Vitest + Zod；开场页 "Hello Kursk"；确定性随机数 `rng.ts`；`data/game.json` + 数据模式；GitHub Pages 自动部署 | 原型阶段界面用原生 DOM，暂不引入 React；引擎纯净性由自动测试强制检查（禁止 PixiJS/DOM/Math.random/Date.now）；随机数用 mulberry32，状态为一个整数，可存档 |
