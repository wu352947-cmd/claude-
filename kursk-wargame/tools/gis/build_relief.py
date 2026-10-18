"""生成地形明暗图（晕渲），叠在纸面上表现高地、河谷与冲沟。

数据：Copernicus DEM GLO-30（30 米，免费，需署名）。注意它是"表面模型"：
林地会显得略高；1985 年建成的别尔哥罗德水库等战后地物也包含在内——明暗图只作画面，
规则用的高地/冲沟以史料地图为准。

用法：
    pip install numpy scipy pillow rasterio
    python build_relief.py <存放 DEM 的目录>   # 缺的图块会自动下载
输出：game/public/ref/south-relief.jpg（白色 = 不变，越暗阴影越重，以"正片叠底"方式叠加）
"""
import json, math, os, sys, urllib.request
import numpy as np
import rasterio
from PIL import Image
from scipy import ndimage as ndi
import georef

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '../../game'))
URL = 'https://copernicus-dem-30m.s3.amazonaws.com/{n}/{n}.tif'


def tile(dem_dir, lat, lon):
    n = f'Copernicus_DSM_COG_10_N{lat:02d}_00_E{lon:03d}_00_DEM'
    path = os.path.join(dem_dir, n + '.tif')
    if not os.path.exists(path) or os.path.getsize(path) < 100000:
        print('下载', n)
        urllib.request.urlretrieve(URL.format(n=n), path)
    return path


def main(dem_dir):
    m = json.load(open(os.path.join(GAME, 'data/maps/south.json'), encoding='utf-8'))
    rel = m['relief']
    p = m['projection']
    ppk = rel['pxPerKm']
    bx0, by0, bx1, by1 = rel['boundsKm']
    W, H = int(round((bx1 - bx0) * ppk)), int(round((by1 - by0) * ppk))
    wx = bx0 + (np.arange(W) + 0.5) / ppk
    wy = by0 + (np.arange(H) + 0.5) / ppk
    WX, WY = np.meshgrid(wx, wy)
    Rk = georef.R_KM
    D = -WY / Rk + math.radians(p['lat0'])
    LAT = np.degrees(np.arcsin(np.sin(D) / np.cosh(WX / Rk)))
    LON = p['lon0'] + np.degrees(np.arctan2(np.sinh(WX / Rk), np.cos(D)))

    Z = np.full((H, W), np.nan, np.float32)
    for la in range(int(math.floor(LAT.min())), int(math.floor(LAT.max())) + 1):
        for lo in range(int(math.floor(LON.min())), int(math.floor(LON.max())) + 1):
            inside = (LAT >= la) & (LAT < la + 1) & (LON >= lo) & (LON < lo + 1)
            if not inside.any():
                continue
            with rasterio.open(tile(dem_dir, la, lo)) as ds:
                z = ds.read(1).astype(np.float32)
                inv = ~ds.transform
                cols, rows = inv * (LON[inside], LAT[inside])
                Z[inside] = ndi.map_coordinates(z, [rows - 0.5, cols - 0.5], order=1, mode='nearest')
    print('高程范围（米）', np.nanmin(Z), np.nanmax(Z))
    Z = np.nan_to_num(Z, nan=float(np.nanmean(Z)))
    Z = ndi.gaussian_filter(Z, 1.0)  # 去掉 30 米数据的颗粒噪声

    # 晕渲：西北方向光源，高度角 40°；地形平缓（起伏约 100 米），垂直夸张 4 倍
    cell = 1000.0 / ppk
    ex = 4.0
    dzdx = ndi.sobel(Z, axis=1) / (8 * cell) * ex
    dzdy = ndi.sobel(Z, axis=0) / (8 * cell) * ex
    az, alt = math.radians(315), math.radians(40)
    slope = np.arctan(np.hypot(dzdx, dzdy))
    aspect = np.arctan2(-dzdx, dzdy)
    hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect - math.pi / 2)
    flat = math.sin(alt)
    shade = np.clip((flat - hs) / flat, 0, 1)        # 只保留阴影面
    out = 1 - 0.38 * shade ** 0.9
    img = (np.clip(out, 0, 1) * 255).astype(np.uint8)
    os.makedirs(os.path.join(GAME, 'public/ref'), exist_ok=True)
    Image.fromarray(img, 'L').save(os.path.join(GAME, 'public', rel['image']), quality=86, optimize=True)
    print('输出', rel['image'], W, H)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
