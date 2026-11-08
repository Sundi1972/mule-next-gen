"""The walkway lamp at the grounds' inner crossings, as a sprite for the live layer (plan follow-up, spec AM-9).

The plate keeps lamp heads and posts to its outer apron: at an inner crossing a building layer drawn later would cover
a head baked into the plate. So the plate lights each inner crossing with a head-less pool, and the page draws this
lamp there in depth order, between the place behind the crossing and the one in front of it.

Rendered in the shared camera (lib/frame, 76.19 px per metre) and light rig (lib/light), the lamp kits.lamp builds for
the apron, standing on a solid shadow catcher. The glow pass is the globe alone: the plate already has the pool.
Run: blender -b -P lamp.py -- <out-dir> [samples=128] [cell=WxH, 320x288] [foot=X,Y, 24,216] (the shipped cell)
  -> <out-dir>/lamp/<day|dusk|glow>.png and <out-dir>/lamp/lamp.json (cell, foot pixel, px_per_m)."""
import json
import os
import sys

import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lib import core, frame, kits, light  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1 :]
OUT = os.path.join(a[0], "lamp")
SAMPLES = int(a[1]) if len(a) > 1 else 128
W, H = (int(v) for v in (a[2] if len(a) > 2 else "320x288").split("x"))
FX, FY = (int(v) for v in (a[3] if len(a) > 3 else "24,216").split(","))
CELL = {"width": W, "height": H, "centre": [FX, FY]}
# The plate's own apron lamps are 110 W (plate.py LAMP); the same lamp, so the same light.
LAMP = 110.0

core.reset()
kits.lamp(0.0, 0.0, z0=0.0, energy=LAMP)
catcher = core.mesh_obj("lamp_catcher", [(-8, -8, 0), (8, -8, 0), (8, 8, 0), (-8, 8, 0)], [(0, 1, 2, 3)], core.flat("catcher", (0.5, 0.5, 0.5), 0.9))
light.rig()
frame.camera(CELL)
frame.setup(SAMPLES, 100, CELL)
os.makedirs(OUT, exist_ok=True)
for name in frame.LIGHTS_ALL:
    light.apply(name)
    # by day and dusk the post's shadow falls on the plate; the glow pass is added over the plate's own pool, so it
    # carries the globe and the post it lights, never a second pool on the ground
    catcher.is_shadow_catcher = name != "glow"
    catcher.hide_render = name == "glow"
    bpy.context.scene.render.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print(f"COLONY render lamp/{name}", flush=True)
json.dump({"cell": CELL, "px_per_m": frame.PX_PER_M, "foot": [FX, FY], "height_m": 3.0}, open(os.path.join(OUT, "lamp.json"), "w"), indent=1)
print(f"COLONY lamp at foot {frame.where((0, 0, 0))}", flush=True)
