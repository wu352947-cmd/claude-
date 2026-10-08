"""把红军 1:100,000 图幅重投影到游戏地图坐标，生成第二参考底图，并逐格统计林地占比。

用法：python build_rkka.py <存放图幅的目录>
输出：
  game/public/ref/south-rkka.jpg     第二参考底图（与 AMS 参考底图同范围、同分辨率；未覆盖处为灰色）
  <目录>/rkka-woods.json              每格：覆盖率、林地占比（供交叉核对脚本使用）
"""
import json
import math
import os
import sys
import urllib.request

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

import georef
import rkka
from build_reference import GAME, MAP_FILE, pixel_to_hex

Image.MAX_IMAGE_PIXELS = None


def load(name, d):
    path = os.path.join(d, name + '.jpg')
    if not os.path.exists(path):
        url = f"{rkka.SHEETS[name]['iiif']}/full/{rkka.DOWNLOAD_WIDTH},/0/default.jpg"
        print('下载', url)
        urllib.request.urlretrieve(url, path)
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float32)


def woods_mask(img):
    """红军图林地：灰绿色面（色相 60–150°，饱和度低于纯绿，亮度中等）。"""
    a = img / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat = (mx - mn) / np.maximum(mx, 1e-6)
    m = (hue > 55) & (hue < 150) & (sat > 0.12) & (mx > 0.35) & (mx < 0.85)
    return ndi.binary_opening(ndi.binary_closing(m, iterations=4), iterations=3)


def main(d):
    m = json.load(open(MAP_FILE, encoding='utf-8'))
    proj, ref = m['projection'], m['reference']
    ppk = ref['pxPerKm']
    bx0, by0, bx1, by1 = ref['boundsKm']
    W, H = int(round((bx1 - bx0) * ppk)), int(round((by1 - by0) * ppk))
    WX, WY = np.meshgrid(bx0 + (np.arange(W) + 0.5) / ppk, by0 + (np.arange(H) + 0.5) / ppk)
    lat0, lon0, Rk = math.radians(proj['lat0']), proj['lon0'], georef.R_KM
    D = -WY / Rk + lat0
    LAT = np.degrees(np.arcsin(np.sin(D) / np.cosh(WX / Rk)))
    LON = lon0 + np.degrees(np.arctan2(np.sinh(WX / Rk), np.cos(D)))

    out = np.full((H, W, 3), 205.0, np.float32)
    covered = np.zeros((H, W), bool)
    woods = np.zeros((H, W), bool)
    for name, sh in rkka.SHEETS.items():
        inside = (LAT >= sh['lat'][0]) & (LAT < sh['lat'][1]) & (LON >= sh['lon'][0]) & (LON < sh['lon'][1])
        if not inside.any():
            continue
        img = load(name, d)
        PX, PY = rkka.latlon_to_pixel(name, LAT[inside], LON[inside])
        ok = (PX >= 0) & (PX < img.shape[1] - 1) & (PY >= 0) & (PY < img.shape[0] - 1)
        idx = np.flatnonzero(inside.ravel())[ok]
        flat = out.reshape(-1, 3)  # 连续数组的 reshape 是视图，可以直接写入
        for ch in range(3):
            flat[idx, ch] = ndi.map_coordinates(img[..., ch], [PY[ok], PX[ok]], order=1)
        covered.reshape(-1)[idx] = True
        wm = woods_mask(img)
        woods.reshape(-1)[idx] = ndi.map_coordinates(wm.astype(np.float32), [PY[ok], PX[ok]], order=0) > 0.5
        print(name, '覆盖像素', ok.sum())

    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(
        os.path.join(GAME, 'public/ref/south-rkka.jpg'), quality=82, optimize=True, progressive=True)

    col, row = pixel_to_hex(WX, WY, m)
    cols, rows = m['hex']['cols'], m['hex']['rows']
    valid = (col >= 0) & (col < cols) & (row >= 0) & (row < rows)
    idx = col * rows + row
    allpx = np.bincount(idx[valid], minlength=cols * rows)
    cov = np.bincount(idx[valid & covered], minlength=cols * rows)
    wd = np.bincount(idx[valid & covered & woods], minlength=cols * rows)
    res = {}
    for c in range(cols):
        for r in range(rows):
            i = c * rows + r
            if cov[i] > 0:
                res[f'{c + 1:02d}{r + 1:02d}'] = {'coverage': round(cov[i] / allpx[i], 3), 'woods': round(wd[i] / cov[i], 3)}
    json.dump(res, open(os.path.join(d, 'rkka-woods.json'), 'w'), indent=0)
    print('有覆盖的格子', len(res), '全覆盖（≥95%）', sum(1 for v in res.values() if v['coverage'] >= 0.95))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
