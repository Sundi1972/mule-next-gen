"""Spike: a rigged CC0 character's walk cycle as sprite frames for the grounds' live layer (PM, 8 Nov).

Rendered in the shared camera (lib/frame: 2:1 dimetric from the south-east, 76.19 px per metre) and light rig
(lib/light: day, or dusk with its warm fill), on a shadow catcher, so a frame drops onto the plate like a building layer.
The colonists walk the paths between places, which run along the grid's two axes, so four headings cover every leg.
Run: blender -b -P walk.py -- <out-dir> <model.glb|.fbx|.blend> <action substring> <name> [light=day] [frames=12]
  [height=1.75] [samples=32] [yaw0=0] [spin=1]
  -> <out-dir>/<name>-<light>-<heading>-<frame>.png and <out-dir>/<name>-<light>-sheet.png (rows: headings, columns:
  frames), and <name>-<light>.json (cell size, feet pixel, frames, headings)."""
import json
import math
import os
import sys

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
from lib import core, frame, light  # noqa: E402

a = sys.argv[sys.argv.index("--") + 1 :]
OUT, MODEL, ACTION, NAME = a[0], a[1], a[2], a[3]
LIGHT = a[4] if len(a) > 4 else "day"
FRAMES = int(a[5]) if len(a) > 5 else 12
HEIGHT = float(a[6]) if len(a) > 6 else 1.75
SAMPLES = int(a[7]) if len(a) > 7 else 32
YAW0 = float(a[8]) if len(a) > 8 else 0.0  # the model's own facing, so heading "+x" really walks along +x
SPIN = float(a[9]) if len(a) > 9 else 1.0  # -1 where a rig turns the other way about z (the Quaternius human's .blend)
# a cell 2.5 m wide and 2.9 m tall at the shared scale, the feet 0.35 m above its bottom edge
CELL = {"width": 192, "height": 224, "centre": [96, 197]}
# the grid's two axes both ways: +x runs down-right on screen, +y up-right (x = 12 (col - 2), y = -12 (row - 2))
HEADINGS = {"+x": 0.0, "+y": 90.0, "-x": 180.0, "-y": 270.0}

core.reset()
ext = os.path.splitext(MODEL)[1].lower()
before = set(bpy.data.objects)
if ext in (".glb", ".gltf"):
    bpy.ops.import_scene.gltf(filepath=MODEL)
elif ext == ".fbx":
    bpy.ops.import_scene.fbx(filepath=MODEL)
else:
    with bpy.data.libraries.load(MODEL) as (src, dst):
        dst.objects = src.objects
        dst.actions = src.actions
    for o in dst.objects:
        if o is not None:
            bpy.context.scene.collection.objects.link(o)
new = [o for o in bpy.data.objects if o not in before]
# a pack's textures often sit in a subfolder its file does not point at (the Quaternius human's Textures/): find each
# missing one by name under the model's own folder
for im in bpy.data.images:
    if im.source == "FILE" and not os.path.exists(bpy.path.abspath(im.filepath)):
        name = os.path.basename(bpy.path.abspath(im.filepath))
        for d, _, files in os.walk(os.path.dirname(os.path.dirname(MODEL)) if ext == ".blend" else os.path.dirname(MODEL)):
            if name in files:
                im.filepath = os.path.join(d, name)
                im.reload()
                break
arm = next(o for o in new if o.type == "ARMATURE")
meshes = [o for o in new if o.type == "MESH"]
for o in new:  # glTF imports may carry their own cameras or lights
    if o.type in ("CAMERA", "LIGHT"):
        bpy.data.objects.remove(o)
act = next(x for x in bpy.data.actions if ACTION.lower() in x.name.lower())
arm.animation_data_create()
arm.animation_data.action = act
for t in list(arm.animation_data.nla_tracks):
    arm.animation_data.nla_tracks.remove(t)
f0, f1 = (int(v) for v in act.frame_range)

# one root to turn and scale: everything imported hangs off it
root = bpy.data.objects.new("walker_root", None)
bpy.context.scene.collection.objects.link(root)
for o in new:
    if o.parent is None and o.name in bpy.data.objects:
        o.parent = root
scene = bpy.context.scene
scene.frame_set(f0)
bpy.context.view_layer.update()


def bounds():
    zs, xs, ys = [], [], []
    dg = bpy.context.evaluated_depsgraph_get()
    for m in meshes:
        e = m.evaluated_get(dg)
        for v in e.to_mesh().vertices:
            w = e.matrix_world @ v.co
            xs.append(w.x), ys.append(w.y), zs.append(w.z)
        e.to_mesh_clear()
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


x0, x1, y0, y1, z0, z1 = bounds()
s = HEIGHT / (z1 - z0)
root.scale = (s, s, s)
root.location = (-(x0 + x1) / 2 * s, -(y0 + y1) / 2 * s, -z0 * s)
print(f"COLONY walk: {NAME} action {act.name} frames {f0}-{f1}, model {z1 - z0:.2f} units tall -> {HEIGHT} m", flush=True)

frame.shadow_catcher()  # the contact shadow comes with the frame, as with a building layer
light.rig()
frame.camera(CELL)
frame.setup(SAMPLES, 100, CELL)
light.apply(LIGHT)
os.makedirs(OUT, exist_ok=True)
cells = []
for h, yaw in HEADINGS.items():
    root.rotation_euler = (0, 0, math.radians(SPIN * yaw + YAW0))
    row = []
    for k in range(FRAMES):
        f = f0 + (f1 - f0) * k / FRAMES
        scene.frame_set(int(f), subframe=f - int(f))
        p = os.path.join(OUT, f"{NAME}-{LIGHT}-{h}-{k:02d}.png")
        scene.render.filepath = p
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(p)
        px = np.empty(CELL["width"] * CELL["height"] * 4, np.float32)
        im.pixels.foreach_get(px)
        row.append(px.reshape(CELL["height"], CELL["width"], 4))
        bpy.data.images.remove(im)
    cells.append(np.concatenate(row, axis=1))
    print(f"COLONY render walk {NAME} {LIGHT} {h}: {FRAMES} frames", flush=True)
sheet = np.concatenate(cells[::-1], axis=0)  # pixels are bottom-up: reverse so the first heading is the top row
img = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0], alpha=True)
img.pixels.foreach_set(sheet.ravel())
img.filepath_raw = os.path.join(OUT, f"{NAME}-{LIGHT}-sheet.png")
img.file_format = "PNG"
img.save()
json.dump({"cell": CELL, "px_per_m": frame.PX_PER_M, "frames": FRAMES, "headings": list(HEADINGS), "seconds": (f1 - f0) / scene.render.fps,
           "height_m": HEIGHT, "model": os.path.basename(MODEL), "action": act.name}, open(os.path.join(OUT, f"{NAME}-{LIGHT}.json"), "w"), indent=1)
print(f"COLONY walk sheet {img.filepath_raw}", flush=True)
