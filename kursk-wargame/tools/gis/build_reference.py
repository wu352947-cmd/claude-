"""生成南线地图的参考底图与林地草稿。

用法（在 kursk-wargame/tools/gis 下）：
    pip install numpy scipy pillow
    python build_reference.py <下载目录>

输入：data/maps/south.json（地图定义：投影、六角格网、范围）
输出：
    game/public/ref/south-ams.jpg      参考底图（已重投影到游戏坐标，编辑时叠加用）
    game/data/maps/south.hexes.json    林地草稿（status = "auto"，需人工确认）

美军 AMS 地图为美国政府出版物，属公有领域；扫描件来自德州大学 PCL 图书馆。
"""
import json, math, os, sys, urllib.request
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import georef

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '../../game'))
MAP_FILE = os.path.join(GAME, 'data/maps/south.json')
Image.MAX_IMAGE_PIXELS = None


def load_sheet(name, dl_dir):
    path = os.path.join(dl_dir, name + '.jpg')
    if not os.path.exists(path):
        print('下载', georef.SHEETS[name]['url'])
        urllib.request.urlretrieve(georef.SHEETS[name]['url'], path)
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float32)


def hex_centers(m):
    """与 game/src/engine/hex.ts 一致：平顶六角格、奇数列下移半格（odd-q）。"""
    R = m['hex']['acrossFlatsKm'] / math.sqrt(3)
    H = m['hex']['acrossFlatsKm']
    out = {}
    for c in range(m['hex']['cols']):
        for r in range(m['hex']['rows']):
            x = m['hex']['originKm'][0] + c * 1.5 * R
            y = m['hex']['originKm'][1] + r * H + (H / 2 if c % 2 else 0)
            out[(c, r)] = (x, y)
    return out, R


def pixel_to_hex(wx, wy, m):
    """世界坐标数组 → (col, row) 数组（立方坐标取整）。"""
    R = m['hex']['acrossFlatsKm'] / math.sqrt(3)
    x = (wx - m['hex']['originKm'][0]) / R
    y = (wy - m['hex']['originKm'][1]) / R
    q = 2 / 3 * x
    r = -1 / 3 * x + math.sqrt(3) / 3 * y
    s = -q - r
    rq, rr, rs = np.round(q), np.round(r), np.round(s)
    dq, dr, ds = abs(rq - q), abs(rr - r), abs(rs - s)
    m1 = (dq > dr) & (dq > ds)
    m2 = ~m1 & (dr > ds)
    rq = np.where(m1, -rr - rs, rq)
    rr = np.where(m2, -rq - rs, rr)
    col = rq.astype(int)
    row = (rr + (rq - (rq.astype(int) & 1)) / 2).astype(int)
    return col, row


def main(dl_dir):
    m = json.load(open(MAP_FILE, encoding='utf-8'))
    proj = m['projection']
    ref = m['reference']
    ppk = ref['pxPerKm']
    (bx0, by0, bx1, by1) = ref['boundsKm']
    W, H = int(round((bx1 - bx0) * ppk)), int(round((by1 - by0) * ppk))
    print('参考底图尺寸', W, H)

    # 每个输出像素的世界坐标 → 经纬度
    wx = bx0 + (np.arange(W) + 0.5) / ppk
    wy = by0 + (np.arange(H) + 0.5) / ppk
    WX, WY = np.meshgrid(wx, wy)
    lat0, lon0 = math.radians(proj['lat0']), proj['lon0']
    Rk = georef.R_KM
    D = -WY / Rk + lat0  # 世界 y 向下 = 北坐标取负
    LAT = np.degrees(np.arcsin(np.sin(D) / np.cosh(WX / Rk)))
    LON = lon0 + np.degrees(np.arctan2(np.sinh(WX / Rk), np.cos(D)))

    out = np.full((H, W, 3), 205.0, np.float32)  # 未覆盖区域：灰
    sheet_of = np.full((H, W), '', object)
    for name, sh in georef.SHEETS.items():
        inside = (LAT >= sh['lat'][0]) & (LAT < sh['lat'][1]) & (LON >= sh['lon'][0]) & (LON < sh['lon'][1])
        if not inside.any():
            continue
        img = load_sheet(name, dl_dir)
        f, res = georef.sheet_transform(name)
        print(name, '拟合残差（像素）', round(res, 2))
        # 向量化：同一仿射作用于 TM39 坐标
        sl0 = sum(sh['lat']) / 2
        phi, dl = np.radians(LAT[inside]), np.radians(LON[inside] - georef.SHEET_LON0)
        X = Rk * np.arctanh(np.sin(dl) * np.cos(phi))
        Y = Rk * (np.arctan2(np.tan(phi), np.cos(dl)) - math.radians(sl0))
        src = [georef.tm_forward(la, lo, sl0, georef.SHEET_LON0) for (la, lo), _ in sh['gcp']]
        (ax, bx, cx, ay, by, cy), _ = georef.fit_affine(src, [p for _, p in sh['gcp']])
        PX, PY = ax * X + bx * Y + cx, ay * X + by * Y + cy
        for ch in range(3):
            out[..., ch][inside] = ndi.map_coordinates(img[..., ch], [PY, PX], order=1)
        sheet_of[inside] = name

    os.makedirs(os.path.join(GAME, 'public/ref'), exist_ok=True)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(
        os.path.join(GAME, 'public', ref['image']), quality=82, optimize=True, progressive=True)

    # ---------- 林地草稿 ----------
    a = out / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    d = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    woods = np.zeros((H, W), bool)
    # 别尔哥罗德图幅：林地为饱和绿色
    woods |= (sheet_of == 'nm37-4') & (hue > 70) & (hue < 170) & (sat > 0.18) & (mx > 0.35)
    # 库尔斯克图幅：林地为浅绿色网点
    woods |= (sheet_of == 'nm37-1') & (hue > 80) & (hue < 170) & (sat > 0.07) & (mx > 0.6)
    woods = ndi.binary_opening(ndi.binary_closing(woods, iterations=3), iterations=2)

    col, row = pixel_to_hex(WX, WY, m)
    cols, rows = m['hex']['cols'], m['hex']['rows']
    valid = (col >= 0) & (col < cols) & (row >= 0) & (row < rows) & (sheet_of != '')
    idx = col * rows + row
    tot = np.bincount(idx[valid], minlength=cols * rows)
    wd = np.bincount(idx[valid & woods], minlength=cols * rows)
    hexes = {}
    for c in range(cols):
        for rr in range(rows):
            i = c * rows + rr
            if tot[i] > 0.6 * (3 * math.sqrt(3) / 2 * (m['hex']['acrossFlatsKm'] / math.sqrt(3)) ** 2 * ppk ** 2) and wd[i] / tot[i] >= 0.45:
                hexes[f'{c + 1:02d}{rr + 1:02d}'] = {
                    'terrain': 'woods', 'status': 'auto',
                    'note': f'自动提取：林地占比 {wd[i] / tot[i]:.0%}', 'sources': ['SRC-0101', 'SRC-0102']}
    path = os.path.join(GAME, 'data/maps/south.hexes.json')
    json.dump({'$comment': '只列非开阔地的格子。status: auto = 程序自动提取未核对；verified = 已人工核对。',
               'hexes': hexes}, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('林地草稿格数', len(hexes))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
