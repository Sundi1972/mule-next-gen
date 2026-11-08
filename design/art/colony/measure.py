"""Dusk exposure check: the mean luminance of the apron and of free-place grass in our plate (dusk with its glow
screened over it, as the page lays them) against the same world regions in look.html's colony still (ring.py's
camera: 109.65 m across 1920 px, the hall at (960, 796.9)).
Run: blender -b -P measure.py -- <look.png> <plate-dusk.png> <plate-glow.png|-> <plate.json> [percent=100]
Luminance is Rec. 709 on the display values (what the eye compares on the TV), 0..1."""
import json
import math
import sys

import bpy
import numpy as np

a = sys.argv[sys.argv.index("--") + 1 :]
LOOK, DUSK, GLOW, META = a[0], a[1], a[2], a[3]
K = (int(a[4]) if len(a) > 4 else 100) / 100
meta = json.load(open(META))
HX, HY = meta["hall"]
PXM = meta["px_per_m"]
RING_PXM, RING_HALL = 1920 / 109.65, (960.0, 540 + 14.67 * 1920 / 109.65)
R2 = math.sqrt(0.5)


def load(p):
    im = bpy.data.images.load(p)
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    return px.reshape(h, w, 4)[::-1]


def screen_uv(x, y, z):
    return R2 * (x + y), R2 / 2 * (y - x) + 0.866 * z


def lum(img, to_px, pts):
    vals = []
    for (x, y, z) in pts:
        u, v = screen_uv(x, y, z)
        px, py = to_px(u, v)
        c = img[int(py), int(px)]
        rgb = c[:3] * c[3]  # flattened on black, as the vignette's own background
        vals.append(0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2])
    return float(np.mean(vals))


def grid(x0, x1, y0, y1, z, n=30):
    return [(x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * j / (n - 1), z) for i in range(n) for j in range(n)]


look = load(LOOK)
ours = load(DUSK)
if GLOW != "-":
    g = load(GLOW)
    ours = ours.copy()
    ours[..., :3] = 1 - (1 - ours[..., :3] * ours[..., 3:]) * (1 - g[..., :3])
    ours[..., 3] = 1.0
look_px = lambda u, v: (RING_HALL[0] + u * RING_PXM, RING_HALL[1] - v * RING_PXM)  # noqa: E731
our_px = lambda u, v: ((HX + u * PXM) * K, (HY - v * PXM) * K)  # noqa: E731
# the apron's two front strips (sunk to -0.62); grass inside two free places, clear of the rim
look_apron = grid(18.7, 20.1, -14, 24, -0.62) + grid(-26, 14, -20.1, -18.7, -0.62)
look_grass = grid(8, 16, 8, 16, 0.05)  # (12, 24) lies in the rocket's shadow by day; (12, 12) is clear
G = meta["grid"]["places"] * 6.0
our_apron = grid(G + 0.7, G + 2.1, -G + 4, G - 4, -0.62) + grid(-G + 4, G - 4, -G - 2.1, -G - 0.7, -0.62)
our_grass = grid(8, 16, 8, 16, 0.05)  # the same place relative to the hall
for name, lp, op in (("apron", look_apron, our_apron), ("grass", look_grass, our_grass)):
    lv, ov = lum(look, look_px, lp), lum(ours, our_px, op)
    print(f"MEASURE {name}: look {lv:.4f}  ours {ov:.4f}  ours/look {ov / lv:.2f}", flush=True)
