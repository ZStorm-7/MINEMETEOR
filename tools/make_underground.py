"""Generates public/underground.png (stone + Minecraft-style ore blocks over bedrock) and public/lava.png.
Pure Python (no dependencies):  python3 tools/make_underground.py"""
import random, zlib, struct
def png(path, w, h, px):
    raw = b''.join(b'\x00' + bytes(v for p in px[y*w:(y+1)*w] for v in p) for y in range(h))
    def chunk(t, d): c = struct.pack('>I', len(d)) + t + d; return c + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
hexrgb = lambda s: (int(s[1:3],16), int(s[3:5],16), int(s[5:7],16), 255)
random.seed(2026)
B = 16
STONE = [hexrgb(c) for c in ["#7d7d7d","#858585","#767676","#8b8b8b","#707070","#808080"]]
DIRT  = [hexrgb(c) for c in ["#866043","#7a5539","#8f6a4b","#6f4b30","#7d5a3c"]]
BED   = [hexrgb(c) for c in ["#1c1c1c","#2a2a2a","#3a3a3a","#141414","#4a4a4a","#555555"]]
def base(pal, specks=None, rate=.12):
    b = [[random.choice(pal) for _ in range(B)] for _ in range(B)]
    if specks:
        for y in range(B):
            for x in range(B):
                if random.random() < rate: b[y][x] = random.choice(specks)
    return b
def stone(): return base(STONE, [hexrgb("#5f5f5f"), hexrgb("#9a9a9a")], .14)
def dirt():  return base(DIRT, [hexrgb("#5b3b24"), hexrgb("#a07a5a")], .16)
def bedrock(): return base(BED)
ORES = {  # main, light, dark, spot-count, spot size
 'coal':    (["#1a1a1a","#262626","#101010"], "#4a4a4a", "#000000", 4, (3,3)),
 'iron':    (["#d8af93","#c8a084","#e2bca2"], "#f3d8c4", "#8a6a55", 6, (3,2)),
 'gold':    (["#fcee4b","#e8d12a","#f7e36a"], "#fffbb0", "#a8941a", 5, (3,2)),
 'redstone':(["#d62b2b","#e83a3a","#b81f1f"], "#ff8a8a", "#6e0f0f", 6, (2,3)),
 'lapis':   (["#2a4fd0","#3a63e0","#1f3da8"], "#8fb0ff", "#13246a", 5, (3,2)),
 'diamond': (["#4adbe6","#2cc4d3","#5decf5"], "#e8ffff", "#117a88", 5, (3,3)),
}
def ore(kind):
    """Minecraft-style ore block: stone with a handful of dense, solid gem clumps"""
    b = stone(); main, light, dark, n, (sw, sh) = ORES[kind]
    main = [hexrgb(c) for c in main]; light = hexrgb(light); dark = hexrgb(dark)
    used = set(); placed = 0; tries = 0
    while placed < min(n, 3) and tries < 300:
        tries += 1
        w, h = random.choice([(4, 4), (4, 3), (3, 4), (5, 3), (4, 4), (3, 3)])
        x0, y0 = random.randint(1, B-w-1), random.randint(1, B-h-1)
        cells = [(x0+dx, y0+dy) for dy in range(h) for dx in range(w)]
        if any((cx+ax, cy+ay) in used for cx, cy in cells for ax in (-1,0,1) for ay in (-1,0,1)): continue
        # knock one corner off so clumps look chunky, not perfectly square
        for corner in random.sample([(x0,y0),(x0+w-1,y0),(x0,y0+h-1),(x0+w-1,y0+h-1)], 1): cells.remove(corner)
        for (cx, cy) in cells: b[cy][cx] = random.choice(main); used.add((cx, cy))
        b[y0][x0+ (1 if (x0,y0) not in cells else 0)] = light      # highlight, top-left-ish
        b[y0+h-1][x0+w-1] = dark if (x0+w-1, y0+h-1) in cells else b[y0+h-1][x0+w-1]
        placed += 1
    return b

WB, HB = 24, 6
rows = []; types = []
for r in range(HB):
    row = []; trow = []
    for c in range(WB):
        kind = 'stone'
        if r == 0:
            d = random.random() < .55; t = dirt() if d else stone(); kind = 'dirt' if d else 'stone'
        elif r == HB-1: t = bedrock(); kind = 'bedrock'
        else:
            roll = random.random(); depth = r / (HB-1)
            kinds = [('coal',.16),('iron',.11),('redstone',.04+.08*depth),('gold',.03+.06*depth),('lapis',.04+.04*depth),('diamond',.05+.12*depth)]
            t = None; acc = 0
            for k, p in kinds:
                acc += p
                if roll < acc: t = ore(k); kind = k; break
            t = t or stone()
        row.append(t); trow.append(kind)
    rows.append(row); types.append(trow)
# guarantee a few diamond blocks in the visible middle rows
for (c, r) in [(2,2),(7,3),(11,2),(16,4),(21,3),(9,4)]:
    rows[r][c] = ore('diamond'); types[r][c] = 'diamond'
# lava pool blocks (drawn as dark scorched stone here; animated lava is overlaid by the page)
POOLS = [(4,4,2,1),(12,3,1,2),(19,4,3,1)]
for (c, r, w, h) in POOLS:
    for dy in range(h):
        for dx in range(w):
            rows[r+dy][c+dx] = base([hexrgb("#3a1a0a"), hexrgb("#4a210c"), hexrgb("#2a1208")]); types[r+dy][c+dx] = 'lava'
W, H = WB*B, HB*B
px = [(0,0,0,255)]*(W*H)
for r in range(HB):
    for c in range(WB):
        t = rows[r][c]
        for y in range(B):
            for x in range(B):
                px[(r*B+y)*W + c*B + x] = t[y][x]
png('public/underground.png', W, H, px)
import json
json.dump({'cols': WB, 'rows': HB, 'blocks': types}, open('public/underground.json', 'w'), separators=(',', ':'))   # block map for the page (mineable ores)

# seamless lava tile
LV = 16
n = [[random.random() for _ in range(LV)] for _ in range(LV)]
for _ in range(2):
    n = [[(n[y][x] + n[y][(x+1)%LV] + n[(y+1)%LV][x] + n[(y+1)%LV][(x+1)%LV] + n[y][(x-1)%LV]) / 5 for x in range(LV)] for y in range(LV)]
flat = sorted(v for row in n for v in row)
q = [flat[int(len(flat)*f)] for f in (.2,.45,.7,.9)]
LP = [hexrgb(c) for c in ["#c42200","#ff5a00","#ff8a00","#ffb400","#ffe36a"]]
def lv(v):
    for i, t in enumerate(q):
        if v < t: return LP[i]
    return LP[4]
png('public/lava.png', LV, LV, [lv(n[y][x]) for y in range(LV) for x in range(LV)])
print('ok', W, H)
