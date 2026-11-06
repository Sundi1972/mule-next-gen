"""The Hospital in its RULE-1 stages: site, build1, standing, closed, damaged; each day / dusk / glow (closed: no glow).
Massing from layout.ts: 7.9 m square, two floors to 7 m. Accent: red crosses. buildMonths 2, so one build picture.
Run: blender -b -P hospital.py -- <out-dir> [samples=256] [stages=all] [lights=day,dusk,glow] [percent=100]"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import frame, kits  # noqa: E402
from lib.core import ZT, accent, bx, cyl, flat, glass_mat, mat  # noqa: E402

STAGES = ["site", "build1", "standing", "closed", "damaged"]
W = 7.9
FH = 3.05


def ambulance(x, y):
    """Parked beside the canopy, nose to the east; its blue light bar glows."""
    white = flat("ambulance_white", (0.88, 0.88, 0.86), 0.35)
    red = accent("ambulance_red", (0.8, 0.05, 0.04), rough=0.35)
    bx(x - 2.1, x + 1.2, y - 0.9, y + 0.9, ZT + 0.3, ZT + 2.3, white, 0.06, "ambulance_box")
    bx(x + 1.2, x + 2.1, y - 0.85, y + 0.85, ZT + 0.3, ZT + 1.55, white, 0.08, "ambulance_cab")
    bx(x + 1.25, x + 2.05, y - 0.86, y + 0.86, ZT + 1.1, ZT + 1.5, mat("dead_glass"), 0.02, "ambulance_windscreen")
    bx(x - 2.12, x + 2.12, y - 0.92, y + 0.92, ZT + 0.95, ZT + 1.2, red, 0.0, "ambulance_stripe")
    bx(x + 0.6, x + 1.15, y - 0.5, y + 0.5, ZT + 2.3, ZT + 2.42, accent("ambulance_lightbar", (0.1, 0.3, 1.0), glow=6.0), 0.01, "lightbar")
    for wx in (x - 1.4, x + 1.5):
        for wy in (y - 0.85, y + 0.85):
            bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.36, depth=0.25, location=(wx, wy, ZT + 0.36))
            o = bpy.context.active_object
            o.rotation_euler = (1.5708, 0, 0)
            o.data.materials.append(mat("tyre"))
            o.data.shade_smooth()


def build(stage):
    if stage == "site":
        kits.site(0, 0, W, W)
        return
    kits.slab()
    dead = stage in ("closed", "damaged")
    red = accent("hospital_red", (0.75, 0.04, 0.04) if stage != "closed" else (0.42, 0.2, 0.18), glow=0 if dead else 4.0)
    wall = mat("plaster") if stage != "closed" else kits.faded("hospital")
    # closed: dead glass; damaged: the glass stays but nobody is in, so only the ember glows
    gl = mat("dead_glass") if stage == "closed" else glass_mat("window_glass_empty", lit_share=0.0) if stage == "damaged" else None
    before = set(bpy.context.scene.objects)
    upto = 1 if stage == "build1" else None
    parts, top = kits.modern(0, 0, W, W, 2, FH, wall, "hospital", sp=1.25, top_extra=0.9, upto=upto, gl=gl)
    if stage == "build1":
        kits.scaffold(0, 0, W, W, 2 * FH + 0.6)
        kits.crane(5.0, 4.4, 11.0)
        kits.work_light(-5.0, -5.0, (0, 0))
        kits.work_light(5.0, -5.0, (1.5, 0))
        bx(-4.9, -3.3, -1.5, 0.3, ZT, ZT + 0.5, flat("pallet_blocks", (0.7, 0.68, 0.64), 0.8), 0.02, "blocks")  # a pallet of blocks
        return
    y0 = -W / 2
    kits.canopy(-1.4, y0, 3.6, 2.0, 2.9, red)
    zc = ZT + 2 * FH + 0.6  # red crosses on the parapet of the two faces the camera sees
    for (axis, fx, fy) in (("y", 0, y0 - 0.05), ("x", W / 2 + 0.05, 0)):
        for (a, b_) in ((0.6, 0.18), (0.18, 0.6)):
            if axis == "y":
                bx(fx - a, fx + a, fy - 0.06, fy, zc - b_, zc + b_, red, 0.005, "cross")
            else:
                bx(fx, fx + 0.06, fy - a, fy + a, zc - b_, zc + b_, red, 0.005, "cross")
    kits.rooftop(1.0, 1.2, top, [(0, 0, 2.6, 1.6, 0.9), (-2.4, -0.4, 1.2, 1.2, 0.6)])
    cyl("helipad", -1.6, -1.6, 1.3, top, top + 0.02, mat("darkmetal"), 40)
    for (a, b_, c, d) in ((-2.0, -1.85, -2.1, -1.1), (-1.35, -1.2, -2.1, -1.1), (-1.85, -1.35, -1.67, -1.53)):
        bx(a, b_, c, d, top + 0.02, top + 0.03, mat("whitemetal"), 0, "H")
    if stage == "standing":
        ambulance(1.6, -5.05)
    if stage == "closed":
        kits.boards(0, 0, W, W, ZT + 1.3, ZT + 2.95)
        kits.fence(-4.9, 2.2, y0 - 1.25)  # across the entrance, under the dead canopy
    if stage == "damaged":
        objs = set(bpy.context.scene.objects) - before
        kits.bite(objs, (W / 2, -W / 2, top - 0.2), 2.6)
        kits.rubble(3.6, -3.6, 1.5, [wall, mat("concrete")])
        kits.scorch(4.2, -2.4, 2.0)
        kits.ember(3.0, -3.0, top - 1.7)


if __name__ == "__main__":
    frame.run("hospital", STAGES, build)
