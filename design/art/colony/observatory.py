"""The Observatory, every RULE-1 stage (buildMonths 2: site, build1, standing, closed, damaged). Ported from
spike-park/colony.py. Massing from layout.ts: 6.7 m square, 5.5 m, plus a dome with a slot and a telescope.
Accent: crystite violet, the slot light.
Run: blender -b -P observatory.py -- <out-dir> [samples=256] [stages=all] [lights=day,dusk,glow] [percent=100]"""
import math
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import frame, kits, props  # noqa: E402
from lib.core import ZT, accent, bx, coll, cyl, flat, glass_mat, light, mat  # noqa: E402
from lib.props import ATL, CZ, LND, MTM, kit, site_props  # noqa: E402

STAGES = ["site", "build1", "standing", "closed", "damaged"]
W = 6.7
R = 2.5  # dome radius


def hemisphere(name, r, top, m):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=r, location=(0, 0, top + 0.7))
    o = bpy.context.active_object
    o.name = name
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context="VERTS")
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.append(m)
    o.data.shade_smooth()
    o.modifiers.new("shell", "SOLIDIFY").thickness = 0.08
    return o


def slot_cutter(top):
    """The slot: a box from the crown down the south-east side, so the telescope reads from this camera."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(1.0, -1.0, top + 0.7 + 1.9))
    cut = bpy.context.active_object
    cut.name = "slot_cutter"
    cut.scale = (0.7, 3.2, 2.2)
    cut.rotation_euler = (math.radians(-30), 0, math.radians(45))
    cut.hide_render = True
    cut.display_type = "WIRE"
    return cut


def boolean(o, cut, op):
    bo = o.modifiers.new("slot", "BOOLEAN")
    bo.object = cut
    bo.operation = op
    bo.solver = "EXACT"


def dome_shell(top, white, slot=True):
    """The dome on its drum. Open: the slot cut out. Shut: the dome whole, the slot's shutter a darker band over it."""
    dome = hemisphere("dome", R, top, white)
    cut = slot_cutter(top)
    if slot:
        boolean(dome, cut, "DIFFERENCE")
    else:
        boolean(hemisphere("shutter", R + 0.03, top, mat("darkmetal")), cut, "INTERSECT")
    return dome


def ribs(top, m):
    """build1: the dome as a bare cage, meridian ribs and two rings on the finished drum."""
    for k in range(12):
        a = 2 * math.pi * k / 12
        cu = bpy.data.curves.new("rib", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 0.05
        sp = cu.splines.new("POLY")
        sp.points.add(12)
        for i, pt in enumerate(sp.points):
            t = (math.pi / 2) * i / 12
            pt.co = (R * math.cos(t) * math.cos(a), R * math.cos(t) * math.sin(a), top + 0.7 + R * math.sin(t), 1)
        o = bpy.data.objects.new("rib", cu)
        coll().objects.link(o)
        cu.materials.append(m)
    for t in (math.radians(30), math.radians(58)):
        bpy.ops.mesh.primitive_torus_add(major_radius=R * math.cos(t), minor_radius=0.045, major_segments=64, minor_segments=8,
                                         location=(0, 0, top + 0.7 + R * math.sin(t)))
        o = bpy.context.active_object
        o.name = "rib_ring"
        o.data.materials.append(m)


def telescope(top, dark):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.32, depth=3.0, location=(0.45, -0.45, top + 1.9))
    tel = bpy.context.active_object
    tel.name = "telescope"
    tel.rotation_euler = (math.radians(-40), 0, math.radians(45))
    tel.data.materials.append(dark)
    tel.data.shade_smooth()
    cyl("telescope_mount", 0, 0, 0.35, top + 0.7, top + 1.4, dark, 20)
    return tel


def build(stage):
    """site: the shared site kit. build1: the block up, the drum on, the dome a bare cage of ribs, scaffold and crane.
    standing: the dome, the slot open on the telescope, the violet light spilling out. closed: faded, dead glass,
    the slot shut, the entrance boarded and fenced. damaged: a bite out of the dome's near side, the telescope
    showing through the break, rubble down the block and on the forecourt, a burn, an ember."""
    if stage == "site":
        kits.site(0, 0, 7.9, 7.9, heaps=not props.on())  # with kits, the sand mound (dress)
        return
    kits.slab()
    b1, closed, damaged = stage == "build1", stage == "closed", stage == "damaged"
    lit = stage == "standing"
    violet = accent("observatory_violet", (0.42, 0.2, 0.75) if not closed else (0.3, 0.24, 0.36), glow=2.5 if lit else 0, emit=(0.62, 0.35, 1.0))
    white, dark = mat("whitemetal") if not closed else kits.faded("dome", (0.66, 0.65, 0.63)), mat("darkmetal")
    wall = mat("concrete") if not closed else kits.faded("observatory")
    gl = mat("dead_glass") if closed else glass_mat("window_glass_empty", lit_share=0.0) if damaged else None
    before = set(bpy.context.scene.objects)
    parts, top = kits.modern(0, 0, W, W, 1, 4.6, wall, "observatory", sp=1.6, top_extra=0.9, gl=gl)
    kits.canopy(0, -3.35, 2.8, 1.6, 2.9, violet)
    cyl("drum", 0, 0, 2.55, top - 0.05, top + 0.7, white, 64)
    if b1:
        cyl("dome_band", 0, 0, 2.6, top + 0.55, top + 0.75, mat("concrete"), 64)
        ribs(top, mat("frame"))
        cyl("telescope_mount", 0, 0, 0.35, top + 0.7, top + 1.4, dark, 20)
        kits.scaffold(0, 0, W, W, top + 0.8)
        kits.crane(4.6, 4.6, 12.0)
        kits.work_light(-4.6, -4.6, (0, 0))
        return
    cyl("dome_band", 0, 0, 2.6, top + 0.55, top + 0.75, violet, 64)
    dome = dome_shell(top, white, slot=not closed)
    if not closed:
        telescope(top, dark)
    if lit:
        light("POINT", (0.3, -0.3, top + 1.2), 60, (0.62, 0.4, 1.0), 0.5)  # violet light spilling from the slot
    kits.rooftop(-2.6, 2.4, top, [(0, 0, 1.0, 0.8, 0.6)])
    if closed:
        kits.boards(0, 0, W, W, ZT + 1.7, ZT + 4.2)
        kits.fence(-1.8, 1.8, -5.15)  # across the entrance, under the dead canopy
    if damaged:
        objs = (set(bpy.context.scene.objects) - before) | {dome}
        kits.bite(objs, (1.6, -1.6, top + 1.9), 1.5, seed=1.3)  # the dome's near side, the side facing the camera
        kits.rubble(2.6, -2.6, 1.0, [white, wall], n=14, seed=6)  # fallen dome panels round the near corner
        kits.scorch(2.8, -4.4, 1.3)
        kits.ember(1.0, -1.0, top + 1.0, r=0.3)


def dress(stage):
    """Kit dressing (KITS_DIR set): site gear; building materials in front while it rises; shrubs either side of the
    entrance and cypresses at the corners once it stands; sci-fi rubble under the break when damaged."""
    if stage == "site":
        site_props()
    elif stage == "build1":
        kit([(CZ, "KB3D_CSZ_PropConcreteMixer_A", (-3.0, -4.6), 0.0), (CZ, "KB3D_CSZ_PropBrickPallet_B", (2.6, -4.6), 0.0),
             (CZ, "KB3D_CSZ_PropCementBagPallet_A", (4.1, -4.4), 0.3), (CZ, "KB3D_CSZ_PropWheelbarrow_A", (1.6, -4.7), 1.2)])
    else:
        kit([(LND, "KB3D_LND_PropShrub_E" if k % 2 else "KB3D_LND_PropShrub_C", (x, -4.3), k) for k, x in enumerate((-3.6, -2.5, 2.5, 3.6))]
            + [(ATL, "KB3D_ATL_VegCypressTree_A", (-4.7, 4.7), 0.0), (ATL, "KB3D_ATL_VegCypressTree_A", (4.7, 4.7), 1.0)])
        if stage == "damaged":
            kit([(MTM, "KB3D_MTM_PropRubble_A", (3.6, -3.0), 0.785)])


if __name__ == "__main__":
    frame.run("observatory", STAGES, build, dress=dress)
