"""地理参照公共函数：球面横轴墨卡托投影 + 美军 AMS 1:250,000 图幅的像素定位。

投影公式与游戏引擎 game/src/engine/projection.ts 完全一致（球面 TM，k0 = 1），
保证工具算出的坐标和游戏里显示的经纬度对得上。
"""
import math

R_KM = 6371.0


def tm_forward(lat, lon, lat0, lon0):
    """经纬度（度）→ 平面坐标 (x 东向 km, y 北向 km)。"""
    phi, dl, phi0 = math.radians(lat), math.radians(lon - lon0), math.radians(lat0)
    x = R_KM * math.atanh(math.sin(dl) * math.cos(phi))
    y = R_KM * (math.atan2(math.tan(phi), math.cos(dl)) - phi0)
    return x, y


def tm_inverse(x, y, lat0, lon0):
    d = y / R_KM + math.radians(lat0)
    lat = math.asin(math.sin(d) / math.cosh(x / R_KM))
    lon = lon0 + math.degrees(math.atan2(math.sinh(x / R_KM), math.cos(d)))
    return math.degrees(lat), lon


# 图幅角点：在德州大学 PCL 图书馆 JPEG 版本上人工量取的内图廓角点像素坐标。
# 来源：U.S. Army Map Service, Series N501, Eastern Europe 1:250,000（公有领域）
SHEETS = {
    'nm37-1': {
        'title': 'NM 37-1 Kursk (AMS N501, Edition 2-AMS)',
        'url': 'http://maps.lib.utexas.edu/maps/ams/eastern_europe/txu-oclc-6519747-nm37-1.jpg',
        'lat': (51.0, 52.0), 'lon': (36.0, 38.0),
        # (lat, lon) → (px, py)
        'gcp': [((52.0, 36.0), (389.3, 248.0)), ((52.0, 38.0), (4726.0, 251.3)),
                ((51.0, 36.0), (369.3, 3746.0)), ((51.0, 38.0), (4788.3, 3739.3))],
    },
    'nm37-4': {
        'title': 'NM 37-4 Belgorod (AMS N501, Edition 2-AMS; compiled 1948 from German GS 1:300,000, 1943)',
        'url': 'http://maps.lib.utexas.edu/maps/ams/eastern_europe/txu-oclc-6519747-nm37-4.jpg',
        'lat': (50.0, 51.0), 'lon': (36.0, 38.0),
        'gcp': [((51.0, 36.0), (520.3, 245.7)), ((51.0, 38.0), (4931.0, 243.3)),
                ((50.0, 36.0), (471.3, 3738.0)), ((50.0, 38.0), (4976.0, 3738.0))],
    },
}

# AMS N501 图幅采用 UTM 37 带（中央经线 39°E）的横轴墨卡托投影
SHEET_LON0 = 39.0


def fit_affine(src, dst):
    """最小二乘拟合 dst = A·[x, y, 1]，返回 (ax, bx, cx, ay, by, cy) 与最大残差。"""
    import numpy as np
    S = np.array([[x, y, 1.0] for x, y in src])
    D = np.array(dst)
    cx, *_ = np.linalg.lstsq(S, D[:, 0], rcond=None)
    cy, *_ = np.linalg.lstsq(S, D[:, 1], rcond=None)
    res = np.hypot(S @ cx - D[:, 0], S @ cy - D[:, 1])
    return (*cx, *cy), float(res.max())


def sheet_transform(name):
    """返回函数 (lat, lon) → 图幅像素 (px, py)，以及拟合残差（像素）。"""
    sh = SHEETS[name]
    lat0 = sum(sh['lat']) / 2
    src = [tm_forward(la, lo, lat0, SHEET_LON0) for (la, lo), _ in sh['gcp']]
    dst = [p for _, p in sh['gcp']]
    (ax, bx, cx, ay, by, cy), res = fit_affine(src, dst)

    def f(lat, lon):
        x, y = tm_forward(lat, lon, lat0, SHEET_LON0)
        return ax * x + bx * y + cx, ay * x + by * y + cy
    return f, res
