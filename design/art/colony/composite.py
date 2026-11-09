"""Composite the grounds the way the game will lay them: a grounds plate, its glow screened over it at dusk, then
the flush building layers far to near (centre col + row), each placed by the offset of its footprint's centre from
the hall's pixel and anchored on its own frame's centre (frame.json beside its renders); at dusk each layer's glow
is laid right after it, so a nearer building still covers a farther one's light. Then side by side with look.html.
Places are RULE-32b grid places on the 5 x 5 grounds (x right, y down, the hall at (2, 2)); w is 1 or 2.
Run: blender -b -P composite.py -- <src> <look-dir> <plate> <out-dir> <tag> kind:stage:x:y:w [...]
  reads  <src>/<plate>-{day,dusk,glow}.png and <plate>.json, <src>/<kind>/<stage>-{day,dusk,glow}.png and frame.json,
         <look-dir>/colony_{day,dusk}.png (look.html's colony stills, decoded)
  writes <out-dir>/<plate>-<tag>-{day,dusk}.png (full res) and <plate>-<tag>-1280-{day,dusk}.png (ours at
         1280 x 720 | look.html at 1280 x 720); with STILLS=1 also -1920-* and ours alone (-<W>-<light>-ours.png)"""
import json
import math
import os
import sys

import bpy
import numpy as np

a = sys.argv[sys.argv.index("--") + 1 :]
SRC, RING, PLATE, OUT, TAG = a[0], a[1], a[2], a[3], a[4]
SPECS = [s.split(":") for s in a[5:]]
meta = json.load(open(os.path.join(SRC, f"{PLATE}.json")))
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


ADD = os.environ.get("GLOW_BLEND", "screen") == "add"  # add = CSS plus-lighter (what light does); screen = the page today
# WEALTH=<n>: each glow at the page's opacity (packages/ui live.ts glowOpacity, RULE-2): stage share x (0.25 + 0.75 x
# min(wealth / 4000, 1)); the month-12 fixture has wealth 2000, so 0.625 for standing. Unset: every glow at full
WEALTH = os.environ.get("WEALTH")
STAGE_GLOW = {"standing": 1.0, "build1": 0.5, "build2": 0.5, "damaged": 0.6, "site": 0.3, "closed": 0.0}


def glow_opacity(stage):
    if WEALTH is None:
        return 1.0
    return STAGE_GLOW[stage] * (0.25 + 0.75 * min(float(WEALTH) / 4000, 1.0))


def screen(dst, src, x, y, k=1.0):
    """The glow layer (light on black) laid over: added (plus-lighter), or screen as the look page does today."""
    h, w = src.shape[:2]
    H, W = dst.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, W), min(y + h, H)
    if x0 >= x1 or y0 >= y1:
        return
    s = src[y0 - y : y1 - y, x0 - x : x1 - x, :3] * k  # CSS opacity on a screen layer over black: the light times k
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


layers = []
for kind, stage, x, y, w in SPECS:
    x, y, w = int(x), int(y), int(w)
    gx, gy = x + (w - 1) / 2, y + (w - 1) / 2  # the footprint's centre, in places
    layers.append((gx + gy, gx, kind, stage, gx, gy))
layers.sort()
os.makedirs(OUT, exist_ok=True)
for li in os.environ.get("COMPOSITE_LIGHTS", "day,dusk").split(","):  # COMPOSITE_LIGHTS=dusk for a quick check
    canvas = load(os.path.join(SRC, f"{PLATE}-{li}.png"))
    if li == "dusk":
        screen(canvas, load(os.path.join(SRC, f"{PLATE}-glow.png")), 0, 0, glow_opacity("standing"))
    for _, _, kind, stage, gx, gy in layers:
        fr = json.load(open(os.path.join(SRC, kind, "frame.json")))
        dc, dr = gx - 2, gy - 2
        cx, cy = HX + SX * (dc - dr), HY + SY * (dc + dr)  # the footprint centre's pixel on the plate
        x0, y0 = round(cx - fr["centre"][0]), round(cy - fr["centre"][1])
        base = os.path.join(SRC, kind, stage)
        over(canvas, load(f"{base}-{li}.png"), x0, y0)
        if li == "dusk" and os.path.exists(f"{base}-glow.png"):
            screen(canvas, load(f"{base}-glow.png"), x0, y0, glow_opacity(stage))
        print(f"COLONY {li}: {kind}/{stage} at ({gx}, {gy}), centre px ({cx:.1f}, {cy:.1f})", flush=True)
    save(canvas, os.path.join(OUT, f"{PLATE}-{TAG}-{li}.png"))
    ring = load(os.path.join(RING, f"colony_{li}.png"))
    for W in (1280, 1920) if os.environ.get("STILLS") else (1280,):  # STILLS=1: the TV stills, alone and beside look
        H = W * 9 // 16
        small = flatten(shrink(canvas, canvas.shape[1] / W))[:H]
        rs = flatten(shrink(ring, ring.shape[1] / W))[:H]
        gap = np.ones((H, 16, 4), np.float32)
        gap[..., :3] = 0.5
        save(np.concatenate([small, gap, rs], 1), os.path.join(OUT, f"{PLATE}-{TAG}-{W}-{li}.png"))
        if os.environ.get("STILLS"):
            save(small, os.path.join(OUT, f"{PLATE}-{TAG}-{W}-{li}-ours.png"))
