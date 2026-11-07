"""The town hall at the grounds' centre: one picture, keyed `standing` like every RULE-1 picture (spec §3; tiers are a
non-goal until WS7 rules them), day / dusk / glow.
Massing from layout.ts: 7.4 m square, 5 m tall, a flag. Accent: holo cyan banding and the colony flag.
Run: blender -b -P hall.py -- <out-dir> [samples=256] [stages=all] [lights=day,dusk,glow] [percent=100]"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import frame, kits, props  # noqa: E402
from lib.props import ATL, CZ, LND, MTM, WDC, kit, site_props  # noqa: E402,F401
from lib.core import ZT, accent, bx, cyl, flat, mat  # noqa: E402

STAGES = ["standing"]




def build(stage="standing"):
    kits.slab()
    cyan = accent("hall_cyan", (0.02, 0.42, 0.55), glow=3.0, emit=(0.1, 0.85, 1.0))
    gold = accent("hall_gold", (0.85, 0.62, 0.22), rough=0.3)
    concrete, plaster, white = mat("concrete"), mat("plaster"), mat("whitemetal")
    parts, top = kits.modern(0, 0, 7.4, 7.4, 1, 4.1, concrete, "hall", sp=1.5, top_extra=0.9)
    # a civic front on the east face, the side the camera sees: a deep portico of slim columns and broad steps
    x0 = 3.7
    bx(x0 - 0.2, x0 + 1.75, -3.6, 3.6, 4.0, 4.35, concrete, 0.02, "portico")
    bx(x0 + 1.73, x0 + 1.79, -3.6, 3.6, 3.9, 4.45, cyan, 0.005, "portico_band")
    for k in range(6):
        cyl("column", x0 + 1.5, -3.2 + k * 1.28, 0.13, ZT, 4.0, white, 20)
    bx(x0, x0 + 1.95, -3.6, 3.6, ZT - 0.02, ZT + 0.12, plaster, 0.01, "steps")
    bx(x0 + 1.95, x0 + 2.2, -3.6, 3.6, ZT - 0.02, ZT + 0.06, plaster, 0.01, "steps")
    bx(x0 - 0.02, x0 + 0.02, -1.0, 1.0, 4.45, 5.1, gold, 0.005, "crest")  # a gold plaque on the parapet
    # a cyan band under the parapet on the two faces the camera sees
    bx(-3.72, 3.72, -3.72, -3.68, top - 0.25, top - 0.12, cyan, 0, "band")
    bx(3.68, 3.72, -3.72, 3.72, top - 0.25, top - 0.12, cyan, 0, "band")
    if not props.on():
        kits.rooftop(-1.2, 1.0, top, [(0, 0, 2.2, 1.4, 0.8)])  # with kits, a solar array takes the roof (dress)
    # two lamps along the south forecourt
    for x in (-2.0, 2.0):
        kits.lamp(x, -4.8, energy=35)  # 110 W washed the whole slab orange in the glow layer
    # the colony flag at the forecourt's south-east corner, cloth rippled by a sine
    fx, fy = 4.7, -4.7
    cyl("flagpole", fx, fy, 0.05, ZT, 8.5, white, 12)
    me = bpy.data.meshes.new("flag")
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=16, y_segments=8, size=0.5)
    for v in bm.verts:
        u = v.co.x + 0.5
        v.co = Vector((u * 1.8, 0.12 * math.sin(u * 7.0) * u, (v.co.y + 0.5) * 1.1))
    bm.to_mesh(me)
    bm.free()
    fl = bpy.data.objects.new("flag", me)
    bpy.context.scene.collection.objects.link(fl)
    fl.location = (fx + 0.05, fy, 7.3)
    fl.rotation_euler = (0, 0, math.radians(20))
    me.materials.append(flat("flag_cloth", (0.02, 0.36, 0.5), 0.7))
    me.shade_smooth()


def dress(stage):
    """Kit dressing (KITS_DIR set): a solar array on the roof, cypresses at the back corners, a planter, shrubs
    along the south front. The hologram map (7.5 m) does not fit the 1.6 m forecourt, so it stays out."""
    props.place(MTM, "KB3D_MTM_PropSolarPanel_A", (-0.2, 0.2), 0.0, z=ZT + 4.1 + 0.32)  # on the roof membrane
    kit([(ATL, "KB3D_ATL_VegCypressTree_A", (-4.7, 4.7), 0.0),
         (ATL, "KB3D_ATL_VegCypressTree_A", (4.7, 4.7), 1.0), (LND, "KB3D_LND_PropPlanter_B", (-4.4, -4.75), 0.0)]
        + [(LND, "KB3D_LND_PropShrub_E" if k % 2 else "KB3D_LND_PropShrub_C", (x, -4.2), k) for k, x in enumerate((-3.0, -0.9, 0.9, 3.0))])


if __name__ == "__main__":
    frame.run("hall", STAGES, build, glowless=(), dress=dress)
