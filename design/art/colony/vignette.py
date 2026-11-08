"""Vignette check: luminance at the corners and mid-edges of the frame, ours against look.html's colony still, both
flattened on the look page's background (#070b12) as they are shown. Points are frame fractions, so any 16:9 size.
Run: blender -b -P vignette.py -- <ours.png> <look.png> [<ours-glow.png>]"""
import sys

import bpy
import numpy as np

a = sys.argv[sys.argv.index("--") + 1 :]
BG = np.array([0.027, 0.043, 0.07], np.float32)
PTS = {"TL": (0.03, 0.055), "T": (0.5, 0.055), "TR": (0.97, 0.055), "L": (0.03, 0.5), "R": (0.97, 0.5),
       "BL": (0.03, 0.945), "B": (0.5, 0.945), "BR": (0.97, 0.945)}


def load(p):
    im = bpy.data.images.load(p)
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    return px.reshape(h, w, 4)[::-1]


def flat(img, glow=None):
    rgb = img[..., :3] * img[..., 3:] + BG * (1 - img[..., 3:])
    if glow is not None:
        rgb = 1 - (1 - rgb) * (1 - glow[..., :3])
    return rgb


def y_at(rgb, fx, fy):
    h, w = rgb.shape[:2]
    r = max(2, int(0.019 * w))
    x, y = int(fx * w), int(fy * h)
    p = rgb[max(0, y - r) : y + r, max(0, x - r) : x + r]
    return float((0.2126 * p[..., 0] + 0.7152 * p[..., 1] + 0.0722 * p[..., 2]).mean())


ours = flat(load(a[0]), load(a[2]) if len(a) > 2 else None)
look = flat(load(a[1]))
for k, (fx, fy) in PTS.items():
    o, lk = y_at(ours, fx, fy), y_at(look, fx, fy)
    print(f"VIGNETTE {k:2s}: ours {o:.4f}  look {lk:.4f}  ours/look {o / lk:.2f}", flush=True)
