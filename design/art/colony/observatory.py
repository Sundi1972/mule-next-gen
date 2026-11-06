"""The Observatory, standing only so far (its other stages come with PR-3). Ported from spike-park/colony.py.
Massing from layout.ts: 6.7 m square, 5.5 m, plus a dome with a slot and a telescope. Accent: crystite violet slot light.
Run: blender -b -P observatory.py -- <out-dir> [samples=256] [stages=all] [lights=day,dusk,glow] [percent=100]"""
import math
import os
import sys

import bmesh
import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import frame, kits  # noqa: E402
from lib.core import ZT, accent, cyl, light, mat  # noqa: E402

STAGES = ["standing"]


def build(stage):
    kits.slab()
    violet = accent("observatory_violet", (0.42, 0.2, 0.75), glow=2.5, emit=(0.62, 0.35, 1.0))
    white, dark = mat("whitemetal"), mat("darkmetal")
    parts, top = kits.modern(0, 0, 6.7, 6.7, 1, 4.6, mat("concrete"), "observatory", sp=1.6, top_extra=0.9)
    kits.canopy(0, -3.35, 2.8, 1.6, 2.9, violet)
    cyl("drum", 0, 0, 2.55, top - 0.05, top + 0.7, white, 64)
    cyl("dome_band", 0, 0, 2.6, top + 0.55, top + 0.75, violet, 64)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=2.5, location=(0, 0, top + 0.7))
    dome = bpy.context.active_object
    dome.name = "dome"
    bm = bmesh.new()
    bm.from_mesh(dome.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context="VERTS")
    bm.to_mesh(dome.data)
    bm.free()
    dome.data.materials.append(white)
    dome.data.shade_smooth()
    dome.modifiers.new("shell", "SOLIDIFY").thickness = 0.08
    # the slot: a box cut from the crown down the south-east side, so the telescope reads from this camera
    bpy.ops.mesh.primitive_cube_add(size=1, location=(1.0, -1.0, top + 0.7 + 1.9))
    cut = bpy.context.active_object
    cut.name = "slot_cutter"
    cut.scale = (0.7, 3.2, 2.2)
    cut.rotation_euler = (math.radians(-30), 0, math.radians(45))
    cut.hide_render = True
    cut.display_type = "WIRE"
    bo = dome.modifiers.new("slot", "BOOLEAN")
    bo.object = cut
    bo.operation = "DIFFERENCE"
    bo.solver = "EXACT"
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.32, depth=3.0, location=(0.45, -0.45, top + 1.9))
    tel = bpy.context.active_object
    tel.name = "telescope"
    tel.rotation_euler = (math.radians(-40), 0, math.radians(45))
    tel.data.materials.append(dark)
    tel.data.shade_smooth()
    cyl("telescope_mount", 0, 0, 0.35, top + 0.7, top + 1.4, dark, 20)
    light("POINT", (0.3, -0.3, top + 1.2), 60, (0.62, 0.4, 1.0), 0.5)  # violet light spilling from the slot
    kits.rooftop(-2.6, 2.4, top, [(0, 0, 1.0, 0.8, 0.6)])


if __name__ == "__main__":
    frame.run("observatory", STAGES, build)
