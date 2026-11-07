"""Dusk patches (AM-7 check 5): mean luminance and RGB of facade and window patches on the Hospital and the hall,
and of free-place grass, ours (the month-12 composite) against look.html's colony still. The hall and the Hospital
stand at the same places relative to the hall in both, (0, 0) and (0, -12) m, so a patch is the same world points
in each, projected through each picture's own camera.
Run: blender -b -P patches.py -- <look.png> <ours.png> <plate.json>
Luminance is Rec. 709 on the display values, flattened on the look page's background."""
import json
import math
import sys

import bpy
import numpy as np

a = sys.argv[sys.argv.index("--") + 1 :]
meta = json.load(open(a[2]))
HX, HY, PXM = meta["hall"][0], meta["hall"][1], meta["px_per_m"]
RING_PXM = 1920 / 109.65
RING_HALL = (960.0, 540 + 14.67 * RING_PXM)
R2 = math.sqrt(0.5)
BG = np.array([0.027, 0.043, 0.07], np.float32)


def load(p):
    im = bpy.data.images.load(p)
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    img = px.reshape(h, w, 4)[::-1]
    return img[..., :3] * img[..., 3:] + BG * (1 - img[..., 3:])


def uv(x, y, z):
    return R2 * (x + y), R2 / 2 * (y - x) + 0.866 * z


def sample(img, hall, pxm, pts):
    rgb = np.array([img[int(hall[1] - uv(*p)[1] * pxm), int(hall[0] + uv(*p)[0] * pxm)] for p in pts])
    return rgb.mean(0)


def face_x(x, y0, y1, z0, z1, n=24):
    return [(x, y0 + (y1 - y0) * i / (n - 1), z0 + (z1 - z0) * j / (n - 1)) for i in range(n) for j in range(n)]


def face_y(y, x0, x1, z0, z1, n=24):
    return [(x0 + (x1 - x0) * i / (n - 1), y, z0 + (z1 - z0) * j / (n - 1)) for i in range(n) for j in range(n)]


HY_ = -12.0  # the Hospital's place centre
PATCHES = {
    "hospital facade (east wall, upper floor band)": face_x(3.96, HY_ - 0.8, HY_ + 1.4, 3.3, 4.1),
    "hospital window (east glass, upper floor)": face_x(3.68, HY_ - 0.5, HY_ + 1.2, 4.6, 5.8),
    "hall facade (south parapet wall)": face_y(-3.71, -2.5, 1.5, 4.25, 4.7),
    "hall window (south glass)": face_y(-3.43, -2.5, 1.5, 1.9, 3.6),
}
look, ours = load(a[0]), load(a[1])
for name, pts in PATCHES.items():
    lk = sample(look, RING_HALL, RING_PXM, pts)
    ou = sample(ours, (HX, HY), PXM, pts)
    ly, oy = (float(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) for c in (lk, ou))
    print(f"PATCH {name}: ours Y {oy:.4f} RGB {tuple(round(float(v), 3) for v in ou)}  look Y {ly:.4f} "
          f"RGB {tuple(round(float(v), 3) for v in lk)}  ours/look {oy / ly:.2f}", flush=True)
# grass on a free place: look.html's (12, 12) and ours (1, 3) of the month-12 grounds, (-12, -12) m
g = [(x, y, 0.05) for x in np.linspace(-4, 4, 20) for y in np.linspace(-4, 4, 20)]
lk = sample(look, RING_HALL, RING_PXM, [(12 + x, 12 + y, z) for x, y, z in g])
ou = sample(ours, (HX, HY), PXM, [(-12 + x, -12 + y, z) for x, y, z in g])
print(f"PATCH free-place grass: ours RGB {tuple(round(float(v), 3) for v in ou)}  look RGB "
      f"{tuple(round(float(v), 3) for v in lk)}", flush=True)
