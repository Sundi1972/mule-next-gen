"""The colonists' sheets in their colours (Heiko, 8 Nov: Astronaut A with a coloured suit), from walk.py's neutral sheets.

walk.py renders the suit panels and the trims neutral grey (COLONY_WALK_TINT) and a mask sheet: suit in red, trims
in green. Here each suit colour and each trim colour is laid through the mask, as a change of albedo in linear light,
so the rendered shading, highlights and shadow stay the render's own. One sheet per suit x trim x light, plus one
outline sheet (the figure's edge, white, without its shadow) for the ghost behind a building.
Run: blender -b --python-exit-code 1 -P tint.py -- <in dir with <name>-{day,dusk,mask}-sheet.png> <name> <out dir>
  -> <out>/<suit>-<trim>-<light>.png, <out>/outline.png"""
import os
import sys

import bpy
import numpy as np

a = sys.argv[sys.argv.index("--") + 1 :]
SRC, NAME, OUT = a[0], a[1], a[2]

# The suits: the four player colours (packages/ui theme.css, dark theme: the TV's), then the colony's two. The trims, helmet included,
# vary from colonist to colonist in place of hair: a warm white, a graphite, a sand.
# A colonist past the seated players' colours wears a colony suit, white or grey (Heiko, PM ruling 8 Nov).
SUITS = {"p1": "#ff7a45", "p2": "#4d9dff", "p3": "#3ddc84", "p4": "#ffd23f", "c1": "#e4e1d8", "c2": "#8a9099"}
TRIMS = {"white": "#ece8df", "graphite": "#6a717d", "sand": "#cdb48a"}
NEUTRAL = 0.62  # walk.py's neutral albedo
OUTLINE_PX = 4  # the outline's width at the full-resolution sheet


def to_linear(v):
    return np.where(v <= 0.04045, v / 12.92, ((v + 0.055) / 1.055) ** 2.4)


def to_srgb(v):
    v = np.clip(v, 0, 1)
    return np.where(v <= 0.0031308, v * 12.92, 1.055 * v ** (1 / 2.4) - 0.055)


def colour(hex_):
    return to_linear(np.array([int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5)]))


def load(path):
    im = bpy.data.images.load(path)
    w, h = im.size
    px = np.empty(w * h * 4, np.float32)
    im.pixels.foreach_get(px)
    bpy.data.images.remove(im)
    return px.reshape(h, w, 4)


def save(px, path):
    h, w = px.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=True)
    img.pixels.foreach_set(px.astype(np.float32).ravel())
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    bpy.data.images.remove(img)


mask = load(os.path.join(SRC, f"{NAME}-mask-sheet.png"))
suit_w, trim_w = mask[..., 0:1], mask[..., 1:2]
os.makedirs(OUT, exist_ok=True)
for light in ("day", "dusk"):
    sheet = load(os.path.join(SRC, f"{NAME}-{light}-sheet.png"))
    lin = to_linear(sheet[..., :3])
    for s, sc in SUITS.items():
        for t, tc in TRIMS.items():
            gain = 1 + suit_w * (colour(sc) / NEUTRAL - 1) + trim_w * (colour(tc) / NEUTRAL - 1)
            out = sheet.copy()
            out[..., :3] = to_srgb(lin * gain)
            save(out, os.path.join(OUT, f"{s}-{t}-{light}.png"))
    print(f"COLONY tint {NAME} {light}: {len(SUITS) * len(TRIMS)} sheets", flush=True)

# the outline: the figure's own alpha (the mask has no shadow catcher) grown by OUTLINE_PX, less the figure
body = mask[..., 3] > 0.5
grown = body.copy()
r = OUTLINE_PX
for dy in range(-r, r + 1):
    for dx in range(-r, r + 1):
        if dx * dx + dy * dy <= r * r:
            grown |= np.roll(np.roll(body, dy, 0), dx, 1)
ring = grown & ~body
outline = np.zeros_like(mask)
outline[..., :3] = 1.0
outline[..., 3] = ring
save(outline, os.path.join(OUT, "outline.png"))
print(f"COLONY tint {NAME}: outline, {int(ring.sum())} px", flush=True)
