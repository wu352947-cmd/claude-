"""风格样板区（普罗霍罗夫卡—捷捷列维诺一带）的人工转录草稿。

由 AI 在参考底图 game/public/ref/south-ams.jpg 上逐点读取像素坐标（底图像素，20 px/km），
本脚本换算为经纬度并写入地图数据。所有要素 status = unverified，需对照 1:100,000 苏军地形图核对。
河流走向、道路选取都是近似转录；冲沟在 1:250,000 图上无法辨认，未录入。

用法：python sample_transcription.py
"""
import json, math, os
import georef

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.normpath(os.path.join(HERE, '../../game'))
MAP = json.load(open(os.path.join(GAME, 'data/maps/south.json'), encoding='utf-8'))
P = MAP['projection']
B = MAP['reference']['boundsKm']
PPK = MAP['reference']['pxPerKm']


def ll(px, py):
    x, y = B[0] + px / PPK, B[1] + py / PPK
    lat, lon = georef.tm_inverse(x, -y, P['lat0'], P['lon0'])
    return [round(lat, 5), round(lon, 5)]


def src(pts):
    # 51°N 附近（底图 y≈935）为两张图幅的接缝：北为 NM 37-1，南为 NM 37-4
    return sorted({'SRC-0101' if py > 935 else 'SRC-0102' for _, py in pts})


LINES = [
    # id, kind, class, 名称, 点列（底图像素）
    ('psel', 'river', 'minor', '普肖尔河', [(1282, 703), (1262, 725), (1240, 745), (1215, 757), (1190, 770), (1165, 788), (1150, 805), (1128, 825), (1110, 845), (1095, 862), (1070, 872), (1045, 870), (1025, 858), (1008, 838), (1003, 815), (1000, 795), (985, 789), (960, 785), (945, 781), (930, 768), (912, 745), (897, 722), (885, 705)]),
    ('olshanka', 'stream', None, '', [(1050, 640), (1050, 700), (1040, 725), (1032, 750), (1022, 772), (1002, 793)]),
    ('stream-kochetovka', 'stream', None, '', [(942, 783), (930, 805), (918, 830), (905, 850)]),
    ('stream-pokrovka', 'stream', None, '', [(905, 1105), (897, 1160), (890, 1210), (882, 1280)]),
    ('stream-novoselovka', 'stream', None, '', [(1385, 1095), (1383, 1130), (1392, 1170), (1402, 1215), (1408, 1260)]),
    ('stream-podyarugi', 'stream', None, '', [(1500, 1150), (1460, 1155), (1430, 1165), (1405, 1180)]),
    ('rail-belgorod-kursk', 'railway', None, '别尔哥罗德—库尔斯克铁路', [(1345, 705), (1330, 750), (1315, 790), (1302, 830), (1290, 858), (1262, 878), (1235, 895), (1200, 915), (1160, 930), (1135, 945), (1120, 975), (1125, 1005), (1140, 1030), (1137, 1060), (1132, 1100), (1130, 1150), (1130, 1200), (1132, 1250), (1134, 1290)]),
    ('road-red-north', 'road', 'primary', '', [(1240, 640), (1290, 680), (1330, 690), (1365, 712), (1390, 740), (1410, 778), (1425, 815), (1440, 840), (1455, 848), (1500, 843)]),
    ('road-belgorod-oboyan', 'road', 'primary', '别尔哥罗德—奥博扬公路', [(895, 1300), (888, 1245), (878, 1195), (868, 1150)]),
    ('road-yakovlevo-teterevino', 'road', 'secondary', '', [(888, 1245), (930, 1252), (980, 1250), (1030, 1240), (1070, 1225), (1115, 1213), (1160, 1222), (1200, 1245)]),
    ('road-pokrovka-belenikhino', 'road', 'secondary', '', [(880, 1185), (905, 1135), (950, 1125), (1000, 1120), (1055, 1103), (1100, 1092), (1157, 1086)]),
    ('road-belenikhino-prokhorovka', 'road', 'secondary', '', [(1157, 1086), (1185, 1060), (1220, 1030), (1255, 1000), (1275, 985), (1272, 950), (1280, 900), (1290, 860)]),
    ('road-teterevino-prokhorovka', 'road', 'secondary', '', [(1100, 1030), (1130, 985), (1165, 955), (1200, 925), (1245, 895), (1290, 860)]),
    ('road-pravorot-vypolzovka', 'road', 'secondary', '', [(1275, 985), (1320, 1020), (1360, 1060), (1380, 1100), (1395, 1150), (1420, 1200), (1440, 1210)]),
    ('road-prokhorovka-west', 'road', 'secondary', '', [(1285, 855), (1230, 868), (1180, 880), (1140, 890), (1100, 897), (1065, 900), (1030, 900), (990, 888), (950, 875), (905, 870)]),
    ('road-prokhorovka-north', 'road', 'secondary', '', [(1285, 855), (1310, 845), (1330, 840), (1365, 810), (1395, 778), (1420, 745)]),
    # 土路（AMS 图上的双虚线）
    ('track-veselyy-prokhorovka', 'track', None, '', [(1030, 790), (1055, 805), (1080, 815), (1120, 812), (1155, 810), (1200, 830), (1245, 845), (1285, 855)]),
    ('track-kartashevka-olshanka', 'track', None, '', [(1025, 735), (1070, 732), (1110, 728), (1160, 725), (1220, 720)]),
    ('track-klyuchi-mikhaylovka', 'track', None, '', [(1000, 835), (1020, 850), (1060, 858), (1095, 862)]),
    ('track-mayachki-gresnoye', 'track', None, '', [(905, 1125), (925, 1070), (950, 1015), (975, 975), (995, 945), (1010, 920), (1030, 900)]),
    ('track-luchki-khteterevino', 'track', None, '', [(960, 1085), (1000, 1065), (1050, 1048), (1100, 1030), (1150, 1012), (1200, 1000), (1240, 990), (1285, 975)]),
    ('track-khteterevino-belenikhino', 'track', None, '', [(1100, 1030), (1125, 1055), (1157, 1086)]),
    ('track-teterevino-belenikhino', 'track', None, '', [(1115, 1213), (1125, 1170), (1140, 1125), (1157, 1086)]),
    ('track-belenikhino-volobuyevka', 'track', None, '', [(1157, 1086), (1168, 1135), (1180, 1190), (1200, 1245)]),
    ('track-zhilomostnoye-shakhovo', 'track', None, '', [(1278, 1062), (1305, 1085), (1330, 1110), (1310, 1160), (1290, 1200), (1282, 1215)]),
    ('track-novoselovka-ploskiy', 'track', None, '', [(1365, 1065), (1410, 1060), (1465, 1045), (1500, 1035)]),
    ('track-volobuyevka-ryndinka', 'track', None, '', [(1200, 1245), (1240, 1228), (1282, 1215), (1340, 1225), (1390, 1230), (1440, 1210)]),
    ('track-krasnoye-pravorot', 'track', None, '', [(1380, 955), (1335, 962), (1285, 975)]),
    ('track-yakovlevo-luchki', 'track', None, '', [(887, 1243), (930, 1225), (975, 1215), (1020, 1210)]),
]

SETTLEMENTS = [
    # 俄文转写（AMS 图上的拼法）, 类型, 底图像素
    ("Prokhorovka (st.) / Aleksandrovskiy", 'town', 1285, 855),
    ("Petrovka", 'village', 1155, 810), ("Oktyabr'skiy", 'village', 1180, 880), ("Andreyevka", 'village', 1100, 897),
    ("Vasil'yevka", 'village', 1075, 903), ("Kozlovka", 'village', 1030, 900), ("Mikhaylovka", 'village', 1095, 862),
    ("Polezhayev", 'village', 1080, 815), ("Klyuchi", 'village', 1020, 850), ("Krasnyy Oktyabr'", 'village', 950, 875),
    ("Veselyy", 'village', 1030, 790), ("Kartashevka", 'village', 1025, 735), ("Nizhnyaya Ol'shanka", 'village', 1045, 690),
    ("Vyshnyaya Ol'shanka", 'village', 1220, 720), ("Beregovoye", 'village', 1235, 770), ("Mordovka", 'village', 1330, 840),
    ("Khlamov", 'village', 1340, 878), ("Yamki", 'village', 1255, 905), ("Lutovo", 'village', 1240, 875), ("Grushki", 'village', 1320, 905),
    ("Malaya Psinka", 'village', 1320, 680), ("Skorovka", 'village', 1420, 745), ("Borisov", 'village', 1440, 820), ("Prizanachnoye", 'village', 1475, 850),
    ("Malyye Mayachki", 'village', 975, 975), ("Bol'shiye Mayachki", 'village', 905, 1125), ("Pokrovka", 'village', 890, 1185),
    ("Yakovlevo", 'village', 887, 1243), ("Luchki (S)", 'village', 1020, 1210), ("Luchki (N)", 'village', 960, 1085),
    ("Ozerovskiy", 'village', 1055, 1103), ("Khutor Teterevino", 'village', 1100, 1030), ("Teterevino", 'village', 1115, 1213),
    ("Belenikhino", 'village', 1157, 1086), ("Leski", 'village', 1168, 1135), ("Pravorot'", 'village', 1285, 975),
    ("Zhilomostnoye", 'village', 1278, 1062), ("Novoselovka", 'village', 1365, 1065), ("Plota", 'village', 1330, 1110),
    ("Shakhovo", 'village', 1282, 1215), ("Volobuyevka", 'village', 1200, 1245), ("Ryndinka", 'village', 1390, 1230),
    ("Vypolzovka", 'village', 1440, 1210), ("Ploskiy", 'village', 1465, 1045), ("Krasnoye", 'village', 1380, 955),
]


def hex_of(px, py):
    x, y = B[0] + px / PPK, B[1] + py / PPK
    R = MAP['hex']['acrossFlatsKm'] / math.sqrt(3)
    fx = (x - MAP['hex']['originKm'][0]) / R
    fy = (y - MAP['hex']['originKm'][1]) / R
    q = 2 / 3 * fx
    r = -1 / 3 * fx + math.sqrt(3) / 3 * fy
    s = -q - r
    rq, rr, rs = round(q), round(r), round(s)
    dq, dr, ds = abs(rq - q), abs(rr - r), abs(rs - s)
    if dq > dr and dq > ds:
        rq = -rr - rs
    elif dr > ds:
        rr = -rq - rs
    col = rq
    row = rr + (rq - (rq & 1)) // 2
    return f'{col + 1:02d}{row + 1:02d}'


def main():
    lines = [{'id': i, 'kind': k, **({'class': c} if c else {}), **({'name': {'zh': n}} if n else {}),
              'points': [ll(*p) for p in pts], 'status': 'unverified', 'sources': src(pts),
              'note': 'AI 从 AMS 1:25 万图上转录的近似走向'} for i, k, c, n, pts in LINES]
    json.dump({'$comment': '线状要素：河流、溪流、道路、铁路。点为 [纬度, 经度]。河流跨越的格边、道路连通的格子由程序推算。',
               'lines': lines}, open(os.path.join(GAME, 'data/maps/south.lines.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    path = os.path.join(GAME, 'data/maps/south.hexes.json')
    data = json.load(open(path, encoding='utf-8'))
    # 可重复运行：先清掉本脚本上次写入的记录
    data['hexes'] = {k: v for k, v in data['hexes'].items() if not v.get('note', '').startswith('AI 从 AMS 图转录')}
    rank = {'town': 2, 'village': 1}
    added = 0
    for name, kind, px, py in SETTLEMENTS:
        h = hex_of(px, py)
        cur = data['hexes'].get(h)
        if cur and cur['terrain'] in rank and rank[cur['terrain']] >= rank[kind]:
            if cur.get('note', '').startswith('AI 从 AMS 图转录'):
                cur['note'] += f'；{name}'
            continue
        data['hexes'][h] = {'terrain': kind, 'status': 'unverified', 'note': f'AI 从 AMS 图转录：{name}',
                            'sources': ['SRC-0101' if py > 935 else 'SRC-0102']}
        added += 1
    json.dump(data, open(path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('线状要素', len(lines), '居民点格', added)


if __name__ == '__main__':
    main()
