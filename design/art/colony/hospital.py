"""The Hospital in its RULE-1 stages: site, build1, standing, closed, damaged; each day / dusk / glow (closed: no glow).
Massing from layout.ts: 7.9 m square, 7 m: a two-floor main block behind a one-storey emergency wing with a drive-in
ambulance bay. Accent: red crosses on lit panels, the bay's fascia. buildMonths 2, so one build picture.
Run: blender -b -P hospital.py -- <out-dir> [samples=256] [stages=all] [lights=day,dusk,glow] [percent=100]"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import frame, kits, props  # noqa: E402
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


# the main block (two floors, 7 m) stands at the back; a one-storey emergency wing fronts it, so the Hospital steps
# down toward the camera and its ambulance bay, instead of reading as a plain cube
MAIN_Y0, WING_H = -1.55, 3.2


def cross_panel(x, y, facing, z, red, size=1.5, lit=True):
    """A white square panel with a red cross on a face; facing 'y' = the south face, 'x' = the east face."""
    panel = accent("cross_panel", (0.92, 0.93, 0.94), glow=1.2 if lit else 0, rough=0.35, emit=(1.0, 0.98, 0.95))
    h, a, b_ = size / 2, size * 0.36, size * 0.11
    if facing == "y":
        bx(x - h, x + h, y - 0.08, y, z - h, z + h, panel, 0.01, "cross_panel")
        for (u, v) in ((a, b_), (b_, a)):
            bx(x - u, x + u, y - 0.11, y - 0.08, z - v, z + v, red, 0.003, "cross")
    else:
        bx(x, x + 0.08, y - h, y + h, z - h, z + h, panel, 0.01, "cross_panel")
        for (u, v) in ((a, b_), (b_, a)):
            bx(x + 0.08, x + 0.11, y - u, y + u, z - v, z + v, red, 0.003, "cross")


def sunshades(z0, z1, wall_y, wall_x, white):
    """Two white fins across the upper floor's glass on the south and east faces."""
    for z in (z0 + (z1 - z0) * 0.38, z0 + (z1 - z0) * 0.78):
        bx(-W / 2, W / 2, wall_y - 0.4, wall_y, z, z + 0.06, white, 0.005, "sunshade")
        bx(wall_x, wall_x + 0.4, MAIN_Y0, W / 2, z, z + 0.06, white, 0.005, "sunshade")


def dress_site():
    """Kit props on the site (KITS_DIR set: local looks only): a sand mound, mixer, pallets, a barrow, a generator."""
    z = "kb3d_constructionzone"
    for (name, at, rot) in (("PropSandMound_A", (-2.0, 1.8), 0.4), ("PropConcreteMixer_A", (1.4, -2.4), 0.0),
                            ("PropBrickPallet_B", (2.5, 0.0), 0.0), ("PropCementBagPallet_A", (2.5, 1.6), 0.2),
                            ("PropWheelbarrow_A", (0.0, -0.8), 0.7), ("PropPortaPotty_A", (4.7, 4.7), 0.0),
                            ("PropPowerGenerator_B", (-3.0, -4.6), 0.0), ("PropCableSpool_A", (-4.6, 2.6), 1.57)):
        props.place(z, "KB3D_CSZ_" + name, at, rot)


def build(stage):
    """site: the shared site kit. build1: the main block's ground floor up, the floor above and the wing a bare frame,
    scaffold, crane. standing: main block, emergency wing, ambulance bay. closed: faded, dead glass, boarded, the bay
    fenced off. damaged: a bite out of the main block's near corner, rubble on the wing roof and the bay, an ember."""
    if stage == "site":
        kits.site(0, 0, W, W, heaps=not props.on())
        if props.on():
            dress_site()
        return
    kits.slab()
    b1, closed, damaged = stage == "build1", stage == "closed", stage == "damaged"
    lit = stage == "standing"
    red = accent("hospital_red", (0.75, 0.04, 0.04) if not closed else (0.42, 0.2, 0.18), glow=4.0 if lit else 0)
    wall = mat("plaster") if not closed else kits.faded("hospital")
    white = mat("whitemetal")
    # closed: dead glass; damaged: the glass stays but nobody is in, so only the ember glows
    gl = mat("dead_glass") if closed else glass_mat("window_glass_empty", lit_share=0.0) if damaged else None
    before = set(bpy.context.scene.objects)
    d_main = W / 2 - MAIN_Y0
    cy_main = (W / 2 + MAIN_Y0) / 2
    parts, top = kits.modern(0, cy_main, W, d_main, 2, FH, wall, "hospital", sp=1.25, top_extra=0.9, upto=1 if b1 else None, gl=gl)
    d_wing = MAIN_Y0 - (-W / 2) + 0.05
    kits.modern(0, -W / 2 + d_wing / 2, W, d_wing, 1, WING_H - 0.4, wall, "wing", sp=0.9, top_extra=0.5, upto=0 if b1 else None, gl=gl)
    if b1:
        kits.scaffold(0, cy_main, W, d_main, 2 * FH + 0.6)
        kits.crane(5.0, 4.4, 11.0)
        kits.work_light(-5.0, -5.0, (0, 0))
        kits.work_light(5.0, -5.0, (1.5, 0))
        bx(-4.9, -3.3, -5.3, -4.5, ZT, ZT + 0.5, flat("pallet_blocks", (0.7, 0.68, 0.64), 0.8), 0.02, "blocks")
        return

    # a glazed stair core on the east face, rising past the parapet
    # the core's glass is a lighter blue-grey than the windows: as dark glass it read as a black slab; it lights in glow
    core_m = accent("stair_glass", (0.3, 0.42, 0.5) if not closed else (0.12, 0.13, 0.14), glow=1.6 if lit else 0, rough=0.12, emit=(1.0, 0.85, 0.6))
    bx(W / 2 - 0.05, W / 2 + 0.6, 1.9, 3.3, ZT, top + 0.9, wall, 0.02, "stair_core")
    bx(W / 2 + 0.58, W / 2 + 0.64, 2.05, 3.15, ZT + 0.6, top + 0.5, core_m, 0, "stair_glass")
    for z in [ZT + 0.6 + k * 1.15 for k in range(7)]:
        bx(W / 2 + 0.6, W / 2 + 0.67, 2.05, 3.15, z, z + 0.06, mat("frame"), 0, "stair_transom")
    sunshades(ZT + FH + 1.25, ZT + 2 * FH, MAIN_Y0, W / 2, white)

    # the ambulance bay: a wide canopy on two columns across the wing's front, red fascia, a lit sign
    y0 = -W / 2
    kits.canopy(-0.4, y0, 6.4, 1.55, 2.75, red)
    sign = accent("emergency_sign", (0.95, 0.95, 0.95), glow=3.0 if lit else 0, emit=(1.0, 0.25, 0.2), rough=0.3)
    bx(-2.9, 0.6, y0 - 1.6, y0 - 1.57, 2.82, 3.05, sign, 0, "emergency_sign")
    paint = flat("bay_paint", (0.9, 0.72, 0.08), 0.6)
    for k in range(7):  # a hatched yellow bay under the canopy
        x = -3.3 + k * 0.9
        bx(x, x + 0.12, y0 - 1.5, y0 - 0.15, ZT, ZT + 0.004, paint, 0, "bay_line")
    for x in (-3.9, 3.0):
        cyl("bollard", x, y0 - 1.45, 0.08, ZT, ZT + 0.9, red if not closed else mat("darkmetal"), 12)

    # crosses on lit panels: the main block's south and east parapets, the wing's east end
    zc = ZT + 2 * FH + 0.55
    cross_panel(1.4, MAIN_Y0 - 0.02, "y", zc, red, 1.5, lit)
    cross_panel(W / 2 + 0.02, 0.4, "x", zc, red, 1.5, lit)
    cross_panel(W / 2 + 0.02, -2.75, "x", WING_H - 0.6, red, 1.0, lit)

    # roof: a helipad on the main block, plant behind it, a terrace rail on the wing
    hx, hy = -1.3, 1.6
    cyl("helipad", hx, hy, 1.45, top, top + 0.02, mat("darkmetal"), 48)
    cyl("helipad_ring", hx, hy, 1.3, top + 0.02, top + 0.025, accent("helipad_ring", (0.85, 0.85, 0.82), glow=1.5 if lit else 0, emit=(0.6, 0.9, 1.0)), 48)
    cyl("helipad_inner", hx, hy, 1.22, top + 0.025, top + 0.03, mat("darkmetal"), 48)
    for (a, b_, c, d) in ((-0.4, -0.25, -0.5, 0.5), (0.25, 0.4, -0.5, 0.5), (-0.25, 0.25, -0.07, 0.07)):
        bx(hx + a, hx + b_, hy + c, hy + d, top + 0.03, top + 0.04, white, 0, "H")
    kits.rooftop(2.2, 2.3, top, [(0, 0, 2.2, 1.4, 0.9), (0, -1.9, 1.2, 1.0, 0.6)])
    wt = ZT + WING_H - 0.4 + 0.32
    for x in (-3.8, 3.8):
        cyl("rail_post", x, -W / 2 + 0.25, 0.03, wt, wt + 0.9, white, 8)
    bx(-3.85, 3.85, -W / 2 + 0.22, -W / 2 + 0.28, wt + 0.85, wt + 0.9, white, 0, "rail")

    if lit:
        ambulance(-0.6, y0 - 0.9)
    if closed:
        kits.boards(0, -W / 2 + d_wing / 2, W, d_wing, ZT + 0.95, ZT + 2.75)
        kits.fence(-4.9, 3.5, y0 - 1.75)  # across the bay, under the dead canopy
    if damaged:
        objs = set(bpy.context.scene.objects) - before
        kits.bite(objs, (W / 2, MAIN_Y0, top - 0.3), 2.5)
        kits.rubble(2.6, -2.6, 1.3, [wall, mat("concrete")], n=22, seed=4)  # on the wing roof and the bay
        for o in [o for o in bpy.context.scene.objects if o.name.startswith("rubble")]:
            if o.location.y > -W / 2:
                o.location.z += WING_H - 0.1
        kits.scorch(3.4, -4.8, 1.5)
        kits.ember(3.0, MAIN_Y0 + 0.9, top - 1.6)


if __name__ == "__main__":
    frame.run("hospital", STAGES, build)
