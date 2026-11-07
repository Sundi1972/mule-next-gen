"""Proof composite: the grounds plate, then flush building layers by pixel offset from the hall's centre, far to near
(col + row), the way the game will lay them; dusk adds each layer's glow (screen) right after its picture, so a
nearer building still covers a farther one's light. Then the same at ring.py's scale beside a crop of its render.
Places are given in the 5 x 5 grid (the hall at (2, 2)); every plate extent puts the hall on its own hall pixel.
Run: blender -b -P composite.py -- <proof-dir> <ring-dir> <plate> kind:col:row [kind:col:row ...]
  reads  <proof-dir>/<plate>-{day,dusk}.png and <plate>.json (plate3, plate5), the flush layers
         <proof-dir>/flush/kit/<kind>/standing-{day,dusk,glow}.png, <ring-dir>/colony_{day,dusk}.png
  writes <proof-dir>/<plate>-composite-{day,dusk}.png (full res), -tv.png (whole plate at ring scale),
         -compare-{day,dusk}.png (composite | ring.py, the same window round the hall, ring scale),
         -1280-{day,dusk}.png (the whole composite at 1280 x 720 | ring.py's still at 1280 x 720)"""
import json
import math
import os
import sys

import bpy
import numpy as np

a = sys.argv[sys.argv.index("--") + 1 :]
P, RING, PLATE, SPECS = a[0], a[1], a[2], [s.split(":") for s in a[3:]]
meta = json.load(open(os.path.join(P, f"{PLATE}.json")))
HX, HY = meta["hall"]
SX, SY = meta["place_step"]
PXM = meta["px_per_m"]
# ring.py's framing, from its own numbers: 109.65 m across 1920 px, the hall's centre at (960, 796.9)
RING_W_M = 109.65
RING_PXM = 1920 / RING_W_M
RING_HALL = (960.0, 540 + 14.67 * RING_PXM)
BG = np.array([0.027, 0.043, 0.07], np.float32)  # the look page's #070b12


def load(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    return px.reshape(h, w, 4)[::-1].copy()  # rows from the top


def save(arr, path):
    h, w = arr.shape[:2]
    im = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    im.pixels.foreach_set(np.ascontiguousarray(arr[::-1]).ravel())
    im.filepath_raw = path
    im.file_format = "PNG"
    im.save()
    bpy.data.images.remove(im)
    print(f"COLONY wrote {path} {w} x {h}", flush=True)


def over(dst, src, x, y):
    """Straight-alpha src over dst with its top-left at (x, y), clipped to dst."""
    h, w = src.shape[:2]
    H, W = dst.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
    if x0 >= x1 or y0 >= y1:
        return
    s = src[y0 - y : y1 - y, x0 - x : x1 - x]
    d = dst[y0:y1, x0:x1]
    sa, da = s[..., 3:], d[..., 3:]
    oa = sa + da * (1 - sa)
    rgb = (s[..., :3] * sa + d[..., :3] * da * (1 - sa)) / np.maximum(oa, 1e-6)
    dst[y0:y1, x0:x1] = np.concatenate([rgb, oa], 2)


ADD = os.environ.get("GLOW_BLEND", "add") == "add"  # add = CSS plus-lighter (what light does); screen = the page today


def screen(dst, src, x, y):
    """The glow layer (light on black) laid over: added (plus-lighter), or screen as the look page does today."""
    h, w = src.shape[:2]
    H, W = dst.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
    if x0 >= x1 or y0 >= y1:
        return
    s = src[y0 - y : y1 - y, x0 - x : x1 - x, :3]
    d = dst[y0:y1, x0:x1]
    d[..., :3] = np.minimum(1.0, d[..., :3] + s) if ADD else 1 - (1 - d[..., :3]) * (1 - s)
    d[..., 3:] = np.maximum(d[..., 3:], s.max(2, keepdims=True))


def flatten(arr):
    return np.concatenate([arr[..., :3] * arr[..., 3:] + BG * (1 - arr[..., 3:]), np.ones(arr.shape[:2] + (1,), np.float32)], 2)


def shrink(arr, f):
    """Area-average down by f (> 1): whole-number box first, then a light bilinear finish."""
    k = int(math.floor(f))
    h, w = arr.shape[:2]
    h2, w2 = h // k, w // k
    a = arr[: h2 * k, : w2 * k].reshape(h2, k, w2, k, 4).mean((1, 3))
    tw, th = round(w / f), round(h / f)
    ys, xs = np.linspace(0, h2 - 1, th), np.linspace(0, w2 - 1, tw)
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    y1, x1 = np.minimum(y0 + 1, h2 - 1), np.minimum(x0 + 1, w2 - 1)
    fy, fx = (ys - y0)[:, None, None], (xs - x0)[None, :, None]
    return (a[y0][:, x0] * (1 - fy) * (1 - fx) + a[y0][:, x1] * (1 - fy) * fx + a[y1][:, x0] * fy * (1 - fx) + a[y1][:, x1] * fy * fx).astype(np.float32)


layers = sorted(((k, int(c), int(r)) for k, c, r in SPECS), key=lambda t: (t[1] + t[2], t[1]))
for li in ("day", "dusk"):
    canvas = load(os.path.join(P, f"{PLATE}-{li}.png"))
    for kind, c, r in layers:
        dc, dr = c - 2, r - 2
        cx, cy = HX + SX * (dc - dr), HY + SY * (dc + dr)  # the place's centre pixel
        base = os.path.join(P, "flush", "kit", kind, "standing")
        pic = load(f"{base}-{li}.png")
        x, y = round(cx - 800), round(cy - 1000)
        over(canvas, pic, x, y)
        if li == "dusk" and os.path.exists(f"{base}-glow.png"):
            screen(canvas, load(f"{base}-glow.png"), x, y)
        print(f"COLONY {li}: {kind} at place ({c}, {r}), centre px ({cx:.1f}, {cy:.1f})", flush=True)
    save(canvas, os.path.join(P, f"{PLATE}-composite-{li}.png"))
    f = PXM / RING_PXM
    tv = shrink(canvas, f)
    save(flatten(tv), os.path.join(P, f"{PLATE}-composite-{li}-tv.png"))
    ring = load(os.path.join(RING, f"colony_{li}.png"))
    # the same window round the hall in both, in ring pixels (the ring's frame ends 283 px below its hall)
    up, down = 430, min(330, int(ring.shape[0] - RING_HALL[1]))
    hw = 560
    ttx, tty = HX / f, HY / f
    a_ = flatten(tv)[round(tty) - up : round(tty) + down, round(ttx) - hw : round(ttx) + hw]
    b_ = flatten(ring)[round(RING_HALL[1]) - up : round(RING_HALL[1]) + down, round(RING_HALL[0]) - hw : round(RING_HALL[0]) + hw]
    gap = np.ones((a_.shape[0], 16, 4), np.float32)
    gap[..., :3] = 0.5
    save(np.concatenate([a_, gap, b_], 1), os.path.join(P, f"{PLATE}-compare-{li}.png"))
    small = flatten(shrink(canvas, canvas.shape[1] / 1280))[:720]
    rs = flatten(shrink(ring, ring.shape[1] / 1280))[:720]
    gap = np.ones((720, 16, 4), np.float32)
    gap[..., :3] = 0.5
    save(np.concatenate([small, gap, rs], 1), os.path.join(P, f"{PLATE}-1280-{li}.png"))
