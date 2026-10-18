# 地图工具（GIS）

把史料地图变成游戏地图数据的脚本。

| 文件 | 作用 |
|---|---|
| `georef.py` | 球面横轴墨卡托投影（与游戏引擎 `projection.ts` 公式一致）；美军 AMS 图幅的角点控制点 |
| `build_reference.py` | 下载 AMS 图幅 → 重投影拼接成参考底图 `game/public/ref/south-ams.jpg` → 自动提取林地草稿 `game/data/maps/south.hexes.json` |

```bash
pip install numpy scipy pillow
python build_reference.py <存放下载图幅的目录>
```

重新运行只会更新 `status = auto` 的林地草稿，人工录入或转录的记录（unverified / verified）一律保留。

`rkka.py` / `build_rkka.py`：红军总参谋部 1:100,000 图幅（Indiana University 藏，IIIF 下载）的角点定位、重投影为第二参考底图 `game/public/ref/south-rkka.jpg`，用于交叉核对。目前只有 M-37-15、-27、-50、-51 四幅。复查方法与结果见 `docs/reviews/`。

`sample_transcription.py`：风格样板区（普罗霍罗夫卡—捷捷列维诺）的河流、铁路、道路、居民点转录草稿，状态均为 unverified。

## 图幅定位精度

角点是在德州大学 PCL 的 JPEG 扫描件上人工量取的。四角拟合残差：别尔哥罗德图幅 1 像素，库尔斯克图幅 4 像素（约 0.05–0.2 km，不到一格的 1/15）。用别尔哥罗德、奥博扬、普罗霍罗夫卡三地的公认坐标核对，误差在约 1 km 以内。

## 待补图幅

地图西缘 35°51′–36°00′E 需要 NM 36-3、NM 36-6 两幅（同一系列，PCL 有）。
