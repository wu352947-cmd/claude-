# 真题来源与许可

这个目录下的题目由 `server/tools/import_open_data.py` 从以下开源数据集转换而来。转换时整理了排版、拆分了选项和小问、自动标注了知识点和难度，并修正了个别答案（见 `server/tools/import_fixes.yaml`）。

| 数据集 | 内容 | 许可 |
|---|---|---|
| [GAOKAO-Bench](https://github.com/OpenLMLab/GAOKAO-Bench)（OpenLMLab） | 2010–2022 年全国卷选择、填空、解答题 | Apache-2.0（全文见 `LICENSE-Apache-2.0.txt`） |
| [GAOKAO-MM](https://github.com/OpenMOSS/GAOKAO-MM)（OpenMOSS） | 2010–2023 年带图选择题及配图 | Apache-2.0 |
| [gaokao_math_2026](https://huggingface.co/datasets/XHToken/gaokao_math_2026)（XHToken） | 2026 年新课标 I、II 卷及北京、上海、天津卷 | Apache-2.0 |
| [AGIEval](https://github.com/ruixiangcui/AGIEval)（Microsoft） | 2007–2022 年各地选择、填空题（含 2021–2022 新高考 I、II 卷） | MIT |

试题本身的著作权归原命题单位所有，这里仅供个人学习使用。

[GAOKAO-Bench-Updates](https://github.com/OpenLMLab/GAOKAO-Bench-Updates) 收录了 2023–2024 年的选择题，但仓库没有附许可文件。因此它的转换结果只写到本机的 `data/questions/gaokao-local/`（已被 `.gitignore` 忽略），不随代码分发。
