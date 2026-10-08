"""红军总参谋部 1:100,000 地形图（1940–41 年印刷）：图幅定位与重投影。

用于和美军 AMS 1:250,000 图交叉核对地形。来源：Indiana University Libraries,
Russian Military Topographic Maps collection（经 Big Ten Academic Alliance Geoportal 检索，IIIF 下载），公有领域。

图幅角点是在 5000 像素宽的 IIIF 版本上人工量取的内图廓角点。
M-37-50（别尔哥罗德）扫描件左缘和上缘被裁掉，只有右侧两个角点，用相似变换（平移+旋转+等比缩放）定位。
"""
import math

import numpy as np

import georef

# 苏联 1:100,000 图采用高斯-克吕格投影；M-37 位于第 7 带，中央经线 39°E。
SHEET_LON0 = 39.0

SHEETS = {
    'M-37-15': {
        'title': 'M-37-15 Тим (Tim), 1940/1941', 'record': 'VAC9619-003379', 'source': 'SRC-0104',
        'iiif': 'https://iiif.uits.iu.edu/iiif/2/vd66x939v%2Ffiles%2Fd8156bca-1783-4285-87f0-3446ba3c43ba%2Ffcr:versions%2Fversion1',
        'lat': (51 + 20 / 60, 51 + 40 / 60), 'lon': (37.0, 37.5),
        'gcp': [((51 + 40 / 60, 37.0), (351, 534)), ((51 + 40 / 60, 37.5), (4600, 494)),
                ((51 + 20 / 60, 37.0), (370, 5092)), ((51 + 20 / 60, 37.5), (4642, 5057))],
    },
    'M-37-27': {
        'title': 'M-37-27 Скородное (Skorodnoye), 1940', 'record': 'VAC9619-003381', 'source': 'SRC-0105',
        'iiif': 'https://iiif.uits.iu.edu/iiif/2/3b592k40c%2Ffiles%2F8a82a8a1-926f-4300-a649-6894ee79db91%2Ffcr:versions%2Fversion1',
        'lat': (51.0, 51 + 20 / 60), 'lon': (37.0, 37.5),
        'gcp': [((51 + 20 / 60, 37.0), (411, 445)), ((51 + 20 / 60, 37.5), (4626, 432)),
                ((51.0, 37.0), (406, 4931)), ((51.0, 37.5), (4649, 4919))],
    },
    'M-37-50': {
        'title': 'M-37-50 Белгород (Belgorod), 1941', 'record': 'VAC9619-003043', 'source': 'SRC-0106',
        'iiif': 'https://iiif.uits.iu.edu/iiif/2/t722jn20z%2Ffiles%2F24c4e148-ec95-41b4-896c-5372c4d4689b%2Ffcr:versions%2Fversion1',
        'lat': (50 + 20 / 60, 50 + 40 / 60), 'lon': (36.5, 37.0),
        'gcp': [((50 + 40 / 60, 37.0), (4775, 117)), ((50 + 20 / 60, 37.0), (4743, 5031))],
    },
    'M-37-51': {
        'title': 'M-37-51 Больше-Троицкое (Bolshetroitskoye), 1940', 'record': 'VAC9619-003387', 'source': 'SRC-0107',
        'iiif': 'https://iiif.uits.iu.edu/iiif/2/3t9472723%2Ffiles%2F25b61f1b-3821-42ad-bea3-c864fccb15f1%2Ffcr:versions%2Fversion1',
        'lat': (50 + 20 / 60, 50 + 40 / 60), 'lon': (37.0, 37.5),
        'gcp': [((50 + 40 / 60, 37.0), (334, 461)), ((50 + 40 / 60, 37.5), (4711, 472)),
                ((50 + 20 / 60, 37.0), (307, 5043)), ((50 + 20 / 60, 37.5), (4719, 5053))],
    },
}

DOWNLOAD_WIDTH = 5000  # 角点按这个宽度量取


def _homography(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    _, _, vt = np.linalg.svd(np.array(A, float))
    return vt[-1].reshape(3, 3) / vt[-1][-1]


def _similarity(src, dst):
    """两点相似变换。图像 y 向下、TM 的 y 向北，先把 y 取反（相似变换本身不含镜像）。"""
    (x0, y0), (x1, y1) = [(x, -y) for x, y in src]
    (u0, v0), (u1, v1) = dst
    a = complex(u1 - u0, v1 - v0) / complex(x1 - x0, y1 - y0)
    b = complex(u0, v0) - a * complex(x0, y0)
    return np.array([[a.real, a.imag, b.real], [a.imag, -a.real, b.imag], [0, 0, 1]])


def sheet_matrix(name):
    """3×3 矩阵：TM39 坐标 (x 东, y 北, km；纬度原点取图幅中纬度) → 图幅像素。"""
    sh = SHEETS[name]
    lat0 = sum(sh['lat']) / 2
    src = [georef.tm_forward(la, lo, lat0, SHEET_LON0) for (la, lo), _ in sh['gcp']]
    dst = [p for _, p in sh['gcp']]
    return _homography(src, dst) if len(src) == 4 else _similarity(src, dst)


def latlon_to_pixel(name, LAT, LON):
    """经纬度数组 → 图幅像素 (PX, PY)。"""
    sh = SHEETS[name]
    lat0 = math.radians(sum(sh['lat']) / 2)
    phi, dl = np.radians(LAT), np.radians(LON - SHEET_LON0)
    X = georef.R_KM * np.arctanh(np.sin(dl) * np.cos(phi))
    Y = georef.R_KM * (np.arctan2(np.tan(phi), np.cos(dl)) - lat0)
    M = sheet_matrix(name)
    w = M[2, 0] * X + M[2, 1] * Y + M[2, 2]
    return (M[0, 0] * X + M[0, 1] * Y + M[0, 2]) / w, (M[1, 0] * X + M[1, 1] * Y + M[1, 2]) / w
