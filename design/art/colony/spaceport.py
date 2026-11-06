"""The Spaceport on 2 x 2 places (spec AM-1, AM-2): a launch pad with a 36 m rocket, clearly the tallest thing on
the grounds and taller than its gantry. Standing only so far (PR-3 adds the other stages). Accent: safety orange.
  pad       a raised launch-concrete disc 15 m across with a flame trench, an orange ring of lit marks
  rocket    36 m: a white core (first stage 21 m, interstage, second stage, fairing) with two strap-on boosters,
            on a dark launch mount
  gantry    a 29 m orange lattice tower behind the rocket with three access arms, a beacon on top
  ground    two propellant spheres, a blockhouse with a lit control room, floodlights on the rocket, a rover, crates
Frame: 3200 x 3500, the footprint's centre at (1600, 2800) - the rocket needs ~34 m of height room.
Run: blender -b -P spaceport.py -- <out-dir> [samples=256] [stages=all] [lights=day,dusk,glow] [percent=100]"""
import math
import os
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import frame, kits  # noqa: E402
from lib.core import ZT, accent, box_uv, bx, cyl, flat, light, mat, mesh_obj  # noqa: E402

STAGES = ["standing"]
FRAME = {"width": 3200, "height": 3500, "centre": [1600, 2800], "places": 2}
PAD_R, PAD_H = 7.5, 0.8
ROCKET = 36.0


def cone(name, x, y, r0, r1, z0, h, m, seg=40):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r0, radius2=r1, depth=h, location=(x, y, z0 + h / 2))
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    o.data.shade_smooth()
    return o


def ogive(name, x, y, r, z0, h, m, seg=48, rings=14):
    """A rounded nose: radius falls off as sqrt(1 - t^2), so the tip is blunt like a real fairing."""
    v = [(x + r * math.sqrt(1 - (i / rings) ** 2) * math.cos(2 * math.pi * k / seg), y + r * math.sqrt(1 - (i / rings) ** 2) * math.sin(2 * math.pi * k / seg), z0 + h * i / rings)
         for i in range(rings) for k in range(seg)] + [(x, y, z0 + h)]
    f = [(i * seg + k, i * seg + (k + 1) % seg, (i + 1) * seg + (k + 1) % seg, (i + 1) * seg + k) for i in range(rings - 1) for k in range(seg)]
    f += [((rings - 1) * seg + k, (rings - 1) * seg + (k + 1) % seg, rings * seg) for k in range(seg)]
    return mesh_obj(name, v, f, m, smooth=True)


def lattice_tower(x, y, w, h, legs_m, brace_m):
    """Four legs, a ring every 2.5 m, X-braces on the two faces the camera sees (south and east)."""
    for (sx, sy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        bx(x + sx * w - 0.12, x + sx * w + 0.12, y + sy * w - 0.12, y + sy * w + 0.12, ZT, ZT + h, legs_m, 0.01, "tower_leg")
    lev = 0.0
    while lev < h - 0.5:
        z = ZT + lev
        for (a, b_, c, d) in ((x - w, x + w, y - w - 0.06, y - w + 0.06), (x - w, x + w, y + w - 0.06, y + w + 0.06),
                              (x - w - 0.06, x - w + 0.06, y - w, y + w), (x + w - 0.06, x + w + 0.06, y - w, y + w)):
            bx(a, b_, c, d, z, z + 0.14, legs_m, 0, "tower_ring")
        for (p0, p1) in (((x - w, y - w), (x + w, y - w)), ((x + w, y - w), (x + w, y + w))):
            for flip in (0, 1):
                a0 = Vector((*p0, z + (2.5 if flip else 0.1)))
                a1 = Vector((*p1, z + (0.1 if flip else 2.5)))
                dv = a1 - a0
                bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.05, depth=dv.length, location=(a0 + a1) / 2)
                br = bpy.context.active_object
                br.name = "tower_brace"
                br.rotation_euler = dv.to_track_quat("Z", "Y").to_euler()
                br.data.materials.append(brace_m)
        lev += 2.5


def build(stage):
    kits.slab(top="padmat", n=2)
    orange = accent("spaceport_orange", (0.95, 0.38, 0.04), rough=0.45)
    signal = accent("spaceport_signal", (0.95, 0.38, 0.04), glow=3.0)  # only the pad marks and beacon glow
    white = flat("rocket_white", (0.9, 0.9, 0.88), 0.32, 0.1)
    black = flat("rocket_black", (0.03, 0.03, 0.035), 0.4, 0.3)
    dark, concrete = mat("darkmetal"), mat("concrete")
    rng = random.Random(8)

    # the pad: a raised disc of launch concrete with a scorched centre, a flame trench toward the south-west
    seg = 96
    cyl("pad", 0, 0, PAD_R, ZT - 0.02, ZT + PAD_H, concrete, seg)
    pv = [(0, 0, ZT + PAD_H + 0.005)] + [(PAD_R * 0.985 * math.cos(2 * math.pi * k / seg), PAD_R * 0.985 * math.sin(2 * math.pi * k / seg), ZT + PAD_H + 0.005) for k in range(seg)]
    top = mesh_obj("pad_top", pv, [(0, 1 + k, 1 + (k + 1) % seg) for k in range(seg)], mat("padmat"))
    box_uv(top)
    cyl("scorch", 0, 0, 3.4, ZT + PAD_H + 0.006, ZT + PAD_H + 0.012, flat("pad_scorch", (0.07, 0.065, 0.06), 0.9), 48)
    trench = bx(-1.3, 1.3, -PAD_R - 0.3, -2.0, ZT + PAD_H - 0.6, ZT + PAD_H + 0.013, flat("trench", (0.035, 0.033, 0.03), 0.9), 0, "flame_trench")
    trench.rotation_euler = (0, 0, math.radians(-45))
    for k in range(40):
        a = 2 * math.pi * k / 40
        if k % 2 == 0:
            r0 = PAD_R - 0.5
            bx(r0 * math.cos(a) - 0.2, r0 * math.cos(a) + 0.2, r0 * math.sin(a) - 0.2, r0 * math.sin(a) + 0.2, ZT + PAD_H, ZT + PAD_H + 0.03, signal, 0, "pad_mark")

    # the launch mount: a dark table on four legs, hold-down arms round the core
    z_m = ZT + PAD_H
    for (sx, sy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        bx(sx * 2.4 - 0.35, sx * 2.4 + 0.35, sy * 2.4 - 0.35, sy * 2.4 + 0.35, z_m, z_m + 2.0, dark, 0.02, "mount_leg")
    bx(-3.0, 3.0, -3.0, 3.0, z_m + 2.0, z_m + 2.6, dark, 0.03, "mount_table")
    z0 = z_m + 2.6  # the rocket stands on the table

    # the rocket: 36 m from the engine skirt to the fairing tip; strap-on boosters along the screen's horizontal
    R = 1.6
    cyl("engine_skirt", 0, 0, R * 0.9, z0 - 1.2, z0, black, 40)
    s1, inter, s2, fair = 20.5, 1.5, 7.5, 6.5
    cyl("stage1", 0, 0, R, z0, z0 + s1, white, 48)
    cyl("stage1_band", 0, 0, R + 0.01, z0 + 1.0, z0 + 2.4, orange, 48)
    cyl("stage1_band_top", 0, 0, R + 0.01, z0 + s1 - 2.2, z0 + s1 - 1.6, orange, 48)
    cyl("interstage", 0, 0, R + 0.01, z0 + s1, z0 + s1 + inter, black, 48)
    cyl("stage2", 0, 0, R, z0 + s1 + inter, z0 + s1 + inter + s2, white, 48)
    zf = z0 + s1 + inter + s2
    cyl("fairing_base", 0, 0, R + 0.15, zf, zf + 2.5, white, 48)
    ogive("fairing_nose", 0, 0, R + 0.15, zf + 2.5, fair - 2.5, white)
    for k in range(4):  # grid fins under the interstage
        a = math.pi / 4 + k * math.pi / 2
        f = bx(R, R + 0.7, -0.35, 0.35, -0.05, 0.05, dark, 0.005, "grid_fin")
        f.location = (0, 0, z0 + s1 - 0.6)
        f.rotation_euler = (0, 0, a)
    for side in (-1, 1):  # boosters, side by side along the screen's horizontal (world x = y)
        bxx, byy = side * (R + 1.0) * 0.7071, side * (R + 1.0) * 0.7071
        rb = 1.0
        cyl("booster_skirt", bxx, byy, rb * 0.85, z0 - 1.0, z0, black, 32)
        cyl("booster", bxx, byy, rb, z0, z0 + 15.5, white, 32)
        cyl("booster_band", bxx, byy, rb + 0.01, z0 + 1.0, z0 + 2.0, orange, 32)
        ogive("booster_nose", bxx, byy, rb, z0 + 15.5, 3.0, white, 32, 10)
        for zz in (z0 + 3.0, z0 + 13.0):  # struts to the core
            bx(-0.15, 0.15, -0.15, 0.15, zz, zz + 0.3, dark, 0.01, "strut").location = (bxx * 0.55, byy * 0.55, 0)
    print(f"COLONY spaceport rocket {z0 - 1.2:.1f} .. {zf + fair:.1f} m ({zf + fair - (z0 - 1.2):.1f} m tall)", flush=True)

    # the gantry: behind the rocket (north-west), shorter than it, three access arms
    tx, ty = -3.4, 3.4
    th = 29.0
    lattice_tower(tx, ty, 1.5, th, orange, dark)
    bx(tx - 1.8, tx + 1.8, ty - 1.8, ty + 1.8, ZT + th, ZT + th + 0.3, dark, 0.02, "tower_top")
    cyl("lightning_mast", tx, ty, 0.08, ZT + th + 0.3, ZT + th + 3.5, dark, 8)
    cyl("beacon", tx, ty, 0.2, ZT + th + 3.5, ZT + th + 4.0, signal, 12)
    for (za, length) in ((z0 + 9.0, 3.4), (z0 + 19.0, 3.4), (zf + 0.8, 3.5)):
        arm = bx(0, length, -0.5, 0.5, 0, 0.7, dark, 0.02, "access_arm")
        arm.location = (tx + 1.0, ty - 1.0, za)
        arm.rotation_euler = (0, 0, math.radians(-45))

    # propellant spheres on legs, east of the pad; a blockhouse with a glass control room to the south
    for (sx, sy) in ((9.0, 1.5), (9.0, -2.6)):
        for (lx, ly) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            cyl("tank_leg", sx + lx * 1.2, sy + ly * 1.2, 0.12, ZT, ZT + 2.2, dark, 8)
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, radius=1.9, location=(sx, sy, ZT + 3.6))
        t_ = bpy.context.active_object
        t_.name = "tank"
        t_.data.materials.append(white)
        t_.data.shade_smooth()
    kits.modern(3.0, -9.0, 5.0, 3.0, 1, 3.0, concrete, "blockhouse", sp=1.0, top_extra=0.5)
    # floodlights round the pad, aimed up the rocket: at night it stands lit
    for a in (math.radians(-45), math.radians(-150), math.radians(60)):
        fx, fy = 10.0 * math.cos(a), 10.0 * math.sin(a)
        cyl("flood_pole", fx, fy, 0.08, ZT, ZT + 3.0, dark, 8)
        bx(fx - 0.3, fx + 0.3, fy - 0.3, fy + 0.3, ZT + 3.0, ZT + 3.4, accent("pad_flood", (0.9, 0.92, 0.95), glow=18.0, emit=(0.95, 0.97, 1.0)), 0.01, "flood_head")
        S = light("SPOT", (fx, fy, ZT + 3.2), 9000, (0.95, 0.96, 1.0), 0.3)
        d = Vector((0 - fx, 0 - fy, 18.0 - 3.2))
        S.rotation_euler = (-d).to_track_quat("Z", "Y").to_euler()
        S.data.spot_size = math.radians(24)
        S.data.spot_blend = 0.4
    # a rover and crates by the blockhouse
    rover = flat("rover_white", (0.82, 0.83, 0.85), 0.4)
    rx_, ry_ = -3.5, -9.5
    bx(rx_ - 1.6, rx_ + 1.6, ry_ - 0.95, ry_ + 0.95, ZT + 0.75, ZT + 1.5, rover, 0.08, "rover_body")
    bx(rx_ + 0.4, rx_ + 1.5, ry_ - 0.8, ry_ + 0.8, ZT + 1.5, ZT + 2.1, mat("glass"), 0.08, "rover_cabin")
    bx(rx_ - 1.62, rx_ + 1.62, ry_ - 0.97, ry_ + 0.97, ZT + 1.0, ZT + 1.15, orange, 0.0, "rover_stripe")
    for wx in (rx_ - 1.1, rx_, rx_ + 1.1):
        for wy in (ry_ - 1.05, ry_ + 1.05):
            bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.45, depth=0.35, location=(wx, wy, ZT + 0.45))
            w_ = bpy.context.active_object
            w_.rotation_euler = (math.pi / 2, 0, 0)
            w_.data.materials.append(mat("tyre"))
    crates = [flat("crate_grey", (0.42, 0.44, 0.46), 0.5, 0.3), orange, flat("crate_green", (0.2, 0.32, 0.22), 0.6)]
    for k, (dx, dy, dz) in enumerate([(0, 0, 0), (1.15, 0.1, 0), (0.55, 1.0, 0), (0.1, 0.05, 1.0), (2.3, -0.2, 0)]):
        sz = rng.uniform(0.85, 1.05)
        x, y = 7.0 + dx * 0.8, -8.5 + dy
        bx(x - sz / 2, x + sz / 2, y - sz / 2, y + sz / 2, ZT + dz, ZT + dz + sz * 0.9, crates[k % 3], 0.03, "crate")


if __name__ == "__main__":
    frame.run("spaceport", STAGES, build, fr=FRAME)
