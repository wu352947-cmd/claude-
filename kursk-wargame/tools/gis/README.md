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

**注意：** 重新运行会**覆盖** `south.hexes.json`。等地图编辑器上线、开始人工核对后，这个脚本只能用来重建参考底图，不能再覆盖人工数据（届时会加保护）。

## 图幅定位精度

角点是在德州大学 PCL 的 JPEG 扫描件上人工量取的。四角拟合残差：别尔哥罗德图幅 1 像素，库尔斯克图幅 4 像素（约 0.05–0.2 km，不到一格的 1/15）。用别尔哥罗德、奥博扬、普罗霍罗夫卡三地的公认坐标核对，误差在约 1 km 以内。

## 待补图幅

地图西缘 35°51′–36°00′E 需要 NM 36-3、NM 36-6 两幅（同一系列，PCL 有）。
