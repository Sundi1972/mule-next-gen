"""The shared kits (ASSET-LIST "Shared pieces"): the place slab, the frontier-modern building block, roof plant,
canopies, lamps, and the stage kits every building derives its stages from:
  site     graded earth, stakes on a string outline, survey flags, spoil heaps, a cabin with a work lamp
  build    a bare concrete frame (modern(upto=…)), a tube-and-plank scaffold, a tower crane, work lights
  closed   dead glass and a faded facade (material swaps), boarded ground floor, a site fence
  damaged  a noisy boolean bite, rubble, a scorch mark, an ember (smoke is drawn live by the page)
Every function builds round a place centred on (cx, cy); the kind scripts use (0, 0)."""
import math
import random

import bmesh
import bpy
from mathutils import Vector, noise

from . import core
from .core import HALF, RIM, ZT, accent, box_uv, bx, cyl, flat, light, link, mat, math_, mesh_obj, mix, new_mat, node


def slab(cx=0.0, cy=0.0, top="pavers", n=1):
    """A grounds place, or n x n of them as one: sandstone sides and rim, paved inside (top=None leaves the inside
    to the caller)."""
    h = HALF * n
    if not core.FLUSH:  # flush: the plate draws the place's stone edge
        bx(cx - h, cx + h, cy - h, cy + h, -0.6, 0.0, mat("stone"), 0.02, "slab")
    if top:
        bx(cx - h + RIM, cx + h - RIM, cy - h + RIM, cy + h - RIM, -0.02, ZT, mat(top), 0.004, "forecourt")


def modern(cx, cy, w, d, floors, fh, wall, name, sp=1.2, inset=0.28, bay=1.4, top_extra=0.9, upto=None, gl=None, frame=None):
    """A frontier-modern block: per floor a solid spandrel band, then a recessed glass band with real mullions.
    upto (floors) leaves the floors above it as a bare concrete frame, for the build stage. frame: the mullions' and
    transoms' material, dark window frame by default."""
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2
    gl = gl or mat("glass")
    fr, concrete = frame or mat("frame"), mat("concrete")
    parts = []
    built = floors if upto is None else upto
    for i in range(floors):
        z = ZT + i * fh
        if i < built:
            parts.append(bx(x0, x1, y0, y1, z, z + sp, wall, 0.02, name))
            parts.append(bx(x0 + inset, x1 - inset, y0 + inset, y1 - inset, z + sp - 0.01, z + fh + 0.01, gl, 0, name + "_glass"))
            # mullions on all four faces, standing proud of the glass to the spandrel line
            for (ax, a0, a1, fixed, outward) in (("x", x0, x1, y0, -1), ("x", x0, x1, y1, 1), ("y", y0, y1, x0, -1), ("y", y0, y1, x1, 1)):
                n = max(2, round((a1 - a0) / bay))
                for k in range(n + 1):
                    t = a0 + 0.12 + (a1 - a0 - 0.24) * k / n
                    f0, f1 = fixed - outward * inset, fixed - outward * 0.03
                    if ax == "x":
                        parts.append(bx(t - 0.04, t + 0.04, f0, f1, z + sp, z + fh, fr, 0, name + "_mullion"))
                    else:
                        parts.append(bx(f0, f1, t - 0.04, t + 0.04, z + sp, z + fh, fr, 0, name + "_mullion"))
            zt_ = z + sp + (fh - sp) * 0.72  # transom
            parts.append(bx(x0 + inset - 0.02, x1 - inset + 0.02, y0 + inset - 0.02, y1 - inset + 0.02, zt_, zt_ + 0.06, fr, 0, name + "_transom"))
        else:
            parts.append(bx(x0, x1, y0, y1, z, z + 0.3, concrete, 0.01, name + "_floorslab"))
            for px in (x0 + 0.2, (x0 + x1) / 2, x1 - 0.2):
                for py in (y0 + 0.2, (y0 + y1) / 2, y1 - 0.2):
                    parts.append(bx(px - 0.18, px + 0.18, py - 0.18, py + 0.18, z + 0.3, z + fh, concrete, 0.01, name + "_column"))
    ztop = ZT + floors * fh
    if upto is None or upto >= floors:
        parts.append(bx(x0, x1, y0, y1, ztop, ztop + 0.25, wall, 0.02, name))  # roof slab edge
        for (a, b_, c, d_) in ((x0, x1, y0, y0 + 0.22), (x0, x1, y1 - 0.22, y1), (x0, x0 + 0.22, y0, y1), (x1 - 0.22, x1, y0, y1)):
            parts.append(bx(a, b_, c, d_, ztop + 0.25, ztop + top_extra, wall, 0.015, name + "_parapet"))
        parts.append(bx(x0 + 0.22, x1 - 0.22, y0 + 0.22, y1 - 0.22, ztop + 0.25, ztop + 0.32, mat("roofmem"), 0, name + "_roof"))
    else:
        parts.append(bx(x0, x1, y0, y1, ztop, ztop + 0.3, concrete, 0.01, name + "_floorslab"))
    return parts, ztop + 0.32


def rooftop(cx, cy, z, units):
    """Plant on the roof: boxes in metal plate with dark fan discs."""
    for (dx, dy, w, d, h) in units:
        bx(cx + dx - w / 2, cx + dx + w / 2, cy + dy - d / 2, cy + dy + d / 2, z, z + h, mat("roofplant"), 0.02, "roof_unit")
        for k in range(max(1, int(w // 0.9))):
            fx = cx + dx - w / 2 + 0.45 + k * 0.9
            if fx < cx + dx + w / 2 - 0.3:
                cyl("fan", fx, cy + dy, 0.3, z + h, z + h + 0.05, mat("darkmetal"), 20)


def canopy(cx, y_front, width, depth, z, edge, posts=True):
    """An entrance canopy on the south face: a thin cantilever slab, an accent fascia, two slim posts."""
    bx(cx - width / 2, cx + width / 2, y_front - depth, y_front, z, z + 0.14, mat("whitemetal"), 0.01, "canopy")
    bx(cx - width / 2, cx + width / 2, y_front - depth - 0.03, y_front - depth, z - 0.04, z + 0.2, edge, 0.005, "canopy_fascia")
    if posts:
        for px in (cx - width / 2 + 0.25, cx + width / 2 - 0.25):
            cyl("canopy_post", px, y_front - depth + 0.25, 0.05, ZT, z, mat("frame"), 12)


def lamp(x, y, h=3.0, z0=0.0, energy=110):
    """A walkway lamp: slim dark post, warm globe; it lights in the glow pass."""
    cyl("lamp_base", x, y, 0.08, z0 - 0.02, z0 + 0.22, mat("metal"))
    cyl("lamp_post", x, y, 0.035, z0 + 0.2, z0 + h - 0.32, mat("metal"), 16)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.16, location=(x, y, z0 + h - 0.16))
    g = bpy.context.active_object
    g.name = "lamp_globe"
    g.data.materials.append(mat("globe"))
    g.data.shade_smooth()
    light("POINT", (x, y, z0 + h - 0.16), energy, (1.0, 0.66, 0.36), 0.13)
    return g


def work_light(x, y, aim, h=2.6):
    """A site floodlight on a pole: a white emissive face and a cool spot aimed at `aim`."""
    cyl("worklight_pole", x, y, 0.035, ZT, ZT + h, mat("darkmetal"), 8)
    face = accent("worklight_face", (0.9, 0.92, 0.95), glow=18.0, emit=(0.95, 0.97, 1.0))
    bx(x - 0.18, x + 0.18, y - 0.18, y + 0.18, ZT + h, ZT + h + 0.28, face, 0.01, "worklight_head")
    L = light("SPOT", (x, y, ZT + h + 0.14), 260, (0.95, 0.97, 1.0), 0.15)
    d = Vector((aim[0] - x, aim[1] - y, ZT - (ZT + h)))
    L.rotation_euler = (-d).to_track_quat("Z", "Y").to_euler()
    L.data.spot_size = math.radians(85)
    L.data.spot_blend = 0.7


# ---------- site ----------

def cabin(x, y):
    """The site cabin, door facing the camera, its window lit warm in the glow pass."""
    bx(x - 1.4, x + 1.4, y - 0.6, y + 0.6, ZT, ZT + 2.4, flat("site_cabin", (0.85, 0.65, 0.1), 0.5), 0.02, "site_cabin")
    win = accent("cabin_window", (0.1, 0.12, 0.14), glow=3.0, rough=0.1, emit=(1.0, 0.7, 0.35))
    bx(x + 0.1, x + 1.0, y - 0.62, y - 0.6, ZT + 1.1, ZT + 1.8, win, 0, "cabin_window")
    light("POINT", (x + 0.55, y - 0.9, ZT + 1.5), 25, (1.0, 0.7, 0.35), 0.2)


def site(cx=0.0, cy=0.0, w=7.9, d=7.9, n=1, cabin_at=None, heaps=True):
    """Stage `site`: the slab's inside graded to earth, stakes on a string outline of the footprint, two survey
    flags, two spoil heaps, a cabin with its work lamp. n: places per side (a 2 x 2 kind's site is one slab)."""
    slab(cx, cy, top="earth", n=n)
    earth = mat("earth")
    wood = flat("stake_wood", (0.55, 0.4, 0.24), 0.8)
    string = flat("string", (0.95, 0.85, 0.2), 0.6)
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2
    pts = []
    k_ = 4 * n
    for t in [i / k_ for i in range(k_)]:
        pts += [(x0 + (x1 - x0) * t, y0), (x1, y0 + (y1 - y0) * t), (x1 - (x1 - x0) * t, y1), (x0, y1 - (y1 - y0) * t)]
    for (px, py) in pts:
        bx(px - 0.05, px + 0.05, py - 0.05, py + 0.05, ZT, ZT + 0.9, wood, 0.005, "stake")
    for (a, b_, c, d_) in ((x0, x1, y0, y0), (x1, x1, y0, y1), (x0, x1, y1, y1), (x0, x0, y0, y1)):
        bx(a - 0.02, b_ + 0.02, c - 0.02, d_ + 0.02, ZT + 0.75, ZT + 0.79, string, 0, "string")
    for (hx, hy, r) in ((cx - 3.6 * n, cy + 1.2 * n, 1.1 * n), (cx - 2.4 * n, cy + 3.3 * n, 0.8 * n)) if heaps else ():  # heaps at the back
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=r, location=(hx, hy, ZT))
        hp = bpy.context.active_object
        hp.name = "spoil_heap"
        hp.scale = (1, 1, 0.45)
        hp.data.materials.append(earth)
        hp.data.shade_smooth()
    cabin(*(cabin_at or (cx + 2.6, cy + 4.6)))
    red = flat("survey_flag", (0.85, 0.08, 0.05), 0.6)
    for (px, py) in ((x0, y0), (x1, y1)):
        cyl("survey_pole", px, py, 0.025, ZT, ZT + 1.6, mat("whitemetal"), 8)
        bx(px, px + 0.35, py - 0.005, py + 0.005, ZT + 1.3, ZT + 1.55, red, 0, "survey_flag")


# ---------- build ----------

def scaffold(cx, cy, w, d, h):
    """A tube-and-plank scaffold wrapped round the footprint, 0.9 m out, a lift every 2 m, netting on the top lift."""
    tube = flat("scaffold_tube", (0.6, 0.62, 0.64), 0.35, 0.9)
    plank = flat("scaffold_plank", (0.62, 0.48, 0.3), 0.8)
    netting = flat("scaffold_net", (0.1, 0.45, 0.25), 0.7)
    o_ = 0.9
    x0, x1, y0, y1 = cx - w / 2 - o_, cx + w / 2 + o_, cy - d / 2 - o_, cy + d / 2 + o_
    xs = [x0 + (x1 - x0) * k / 5 for k in range(6)]
    ys = [y0 + (y1 - y0) * k / 5 for k in range(6)]
    for x in xs:
        for y in (y0, y1):
            cyl("tube", x, y, 0.03, ZT, ZT + h, tube, 8)
    for y in ys[1:-1]:
        for x in (x0, x1):
            cyl("tube", x, y, 0.03, ZT, ZT + h, tube, 8)
    z = ZT + 2.0
    while z < ZT + h:
        for (a, b_, c, d_) in ((x0, x1, y0, y0), (x0, x1, y1, y1), (x0, x0, y0, y1), (x1, x1, y0, y1)):
            bx(a - 0.03, b_ + 0.03, c - 0.03, d_ + 0.03, z, z + 0.06, tube, 0, "ledger")
        for (a, b_, c, d_) in ((x0, x1, y0, y0 + 0.7), (x0, x1, y1 - 0.7, y1), (x0, x0 + 0.7, y0, y1), (x1 - 0.7, x1, y0, y1)):
            bx(a, b_, c, d_, z - 0.05, z, plank, 0, "plank")
        z += 2.0
    bx(x1 + 0.03, x1 + 0.05, y0, y1, ZT + h - 2.0, ZT + h, netting, 0, "netting")


def crane(x, y, h, jib=8.0, counter=2.5):
    """A tower crane: lattice mast, jib over the site (south-west), counter-jib with weights, cab, hook.
    Kept to h ≈ 11 m at the place's east corner so jib and peak stay inside the 1600 × 1600 frame."""
    yel = accent("crane_yellow", (0.95, 0.7, 0.05), rough=0.45)
    s = 0.6
    for (sx, sy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        bx(x + sx * s / 2 - 0.05, x + sx * s / 2 + 0.05, y + sy * s / 2 - 0.05, y + sy * s / 2 + 0.05, ZT, ZT + h, yel, 0, "crane_leg")
    z = ZT + 0.8
    while z < ZT + h:
        bx(x - s / 2, x + s / 2, y - s / 2, y + s / 2, z, z + 0.06, yel, 0, "crane_ring")
        z += 0.8
    for (L, ang) in ((jib, 225), (counter, 45)):
        j = bx(0, L, -0.25, 0.25, 0, 0.45, yel, 0.005, "crane_jib")
        j.location = (x, y, ZT + h)
        j.rotation_euler = (0, 0, math.radians(ang))
    cw = bx(counter - 1.0, counter - 0.1, -0.45, 0.45, -0.9, 0.0, mat("concrete"), 0.01, "counterweight")
    cw.location = (x, y, ZT + h)
    cw.rotation_euler = (0, 0, math.radians(45))
    bx(x - 0.5, x + 0.5, y - 0.9, y - 0.3, ZT + h - 1.0, ZT + h, yel, 0.01, "crane_cab")
    bx(x - 0.15, x + 0.15, y - 0.15, y + 0.15, ZT + h + 0.45, ZT + h + 1.8, yel, 0, "crane_peak")
    hx, hy = x - 5.0 * 0.707, y - 5.0 * 0.707
    cyl("hook_line", hx, hy, 0.015, ZT + h - 4.0, ZT + h, mat("darkmetal"), 6)
    bx(hx - 0.12, hx + 0.12, hy - 0.12, hy + 0.12, ZT + h - 4.3, ZT + h - 4.0, mat("darkmetal"), 0.01, "hook")
    beacon = accent("crane_beacon", (1.0, 0.25, 0.05), glow=8.0)
    cyl("crane_beacon", x, y, 0.08, ZT + h + 1.8, ZT + h + 1.95, beacon, 10)


# ---------- closed ----------

def faded(name, rgb=(0.6, 0.58, 0.54)):
    """The closed facade: the same panels, greyed and dulled."""
    from .core import panel_mat
    return panel_mat("facade_closed_" + name, rgb)


def fence_mat():
    """Welded mesh: a see-through grey panel; at TV size the wires themselves are below a pixel."""
    m, nt, b = new_mat("fence_mesh")
    b.inputs["Base Color"].default_value = (0.5, 0.53, 0.55, 1)
    b.inputs["Metallic"].default_value = 0.6
    b.inputs["Roughness"].default_value = 0.45
    mx = node(nt, "ShaderNodeMixShader")
    mx.inputs[0].default_value = 0.62
    link(nt, b.outputs[0], mx.inputs[1])
    link(nt, node(nt, "ShaderNodeBsdfTransparent").outputs[0], mx.inputs[2])
    link(nt, mx.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    return m


def bars_x(x0, x1, y, h, m):
    """A barred gate: vertical bars every 12 cm between a bottom and a top rail."""
    bx(x0, x1, y - 0.03, y + 0.03, ZT + 0.1, ZT + 0.16, m, 0, "gate_rail")
    n = max(2, round((x1 - x0) / 0.12))
    for k in range(n + 1):
        cyl("gate_bar", x0 + (x1 - x0) * k / n, y, 0.016, ZT + 0.1, ZT + h, m, 6)


def fence(x0, x1, y, h=1.8, bars=False):
    """A mesh site fence along y between x0 and x1, a post every 1.6 m, a top rail. bars: a barred gate instead."""
    f, post = fence_mat(), flat("fence_post", (0.42, 0.44, 0.46), 0.5, 0.6)
    if bars:
        post = flat("gate_iron", (0.035, 0.037, 0.04), 0.45, 0.7)
        bars_x(x0, x1, y, h, post)
    else:
        bx(x0, x1, y - 0.01, y + 0.01, ZT, ZT + h, f, 0, "fence")
    bx(x0, x1, y - 0.02, y + 0.02, ZT + h - 0.04, ZT + h, post, 0, "fence_rail")
    n = max(1, round((x1 - x0) / 1.6))
    for k in range(n + 1):
        cyl("fence_post", x0 + (x1 - x0) * k / n, y, 0.03, ZT, ZT + h + 0.05, post, 8)


def fence_y(x, y0, y1, h=1.8, bars=False):
    f, post = fence_mat(), flat("fence_post", (0.42, 0.44, 0.46), 0.5, 0.6)
    if bars:
        post = flat("gate_iron", (0.035, 0.037, 0.04), 0.45, 0.7)
        bx(x - 0.03, x + 0.03, y0, y1, ZT + 0.1, ZT + 0.16, post, 0, "gate_rail")
        n = max(2, round((y1 - y0) / 0.12))
        for k in range(n + 1):
            cyl("gate_bar", x, y0 + (y1 - y0) * k / n, 0.016, ZT + 0.1, ZT + h, post, 6)
    else:
        bx(x - 0.01, x + 0.01, y0, y1, ZT, ZT + h, f, 0, "fence")
    bx(x - 0.02, x + 0.02, y0, y1, ZT + h - 0.04, ZT + h, post, 0, "fence_rail")
    n = max(1, round((y1 - y0) / 1.6))
    for k in range(n + 1):
        cyl("fence_post", x, y0 + (y1 - y0) * k / n, 0.03, ZT, ZT + h + 0.05, post, 8)


def boards(cx, cy, w, d, z0, z1):
    """Plywood over the ground-floor glass of the two faces the camera sees (south and east)."""
    ply = flat("plywood", (0.5, 0.4, 0.27), 0.85)
    n = max(2, round(w / 1.5))
    for k in range(n):
        x = cx - w / 2 + 0.25 + k * (w - 0.5) / n
        bx(x, x + (w - 0.5) / n - 0.15, cy - d / 2 - 0.06, cy - d / 2 - 0.01, z0, z1, ply, 0.005, "board")
        y = cy - d / 2 + 0.25 + k * (d - 0.5) / n
        bx(cx + w / 2 + 0.01, cx + w / 2 + 0.06, y, y + (d - 0.5) / n - 0.15, z0, z1, ply, 0.005, "board")


# ---------- damaged ----------

def bite(objs, at, radius, seed=0.0):
    """Take a lumpy bite out of every mesh near `at`. The FLOAT solver: EXACT silently leaves bevelled boxes whole."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=radius, location=at)
    cut = bpy.context.active_object
    cut.name = "bite_cutter"
    off = Vector((seed, seed * 0.7, seed * 0.3))
    for v in cut.data.vertices:
        v.co *= 1 + 0.35 * noise.noise(v.co * 0.9 + off)
    cut.hide_render = True
    cut.display_type = "WIRE"
    bpy.context.view_layer.update()  # bound boxes of just-made objects are zero until evaluated
    c, r = Vector(at), radius * 1.4
    hit = 0
    for o in objs:
        if o.type != "MESH" or o is cut:
            continue
        bb = [o.matrix_world @ Vector(p) for p in o.bound_box]
        lo = Vector([min(p[i] for p in bb) for i in range(3)])
        hi = Vector([max(p[i] for p in bb) for i in range(3)])
        near = Vector([min(max(c[i], lo[i]), hi[i]) for i in range(3)])
        if (near - c).length < r:
            bo = o.modifiers.new("break", "BOOLEAN")
            bo.object = cut
            bo.operation = "DIFFERENCE"
            bo.solver = "FLOAT"
            hit += 1
    return cut, hit


def rubble(x, y, spread, mats, n=26, seed=4):
    rng = random.Random(seed)
    for k in range(n):
        r = rng.uniform(0.15, 0.45)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x + rng.uniform(-spread, spread), y + rng.uniform(-spread, spread), ZT + r * 0.3))
        c = bpy.context.active_object
        c.name = "rubble"
        c.scale = (r, r * rng.uniform(0.5, 1.0), r * rng.uniform(0.3, 0.7))
        c.rotation_euler = (rng.uniform(0, 3), rng.uniform(0, 3), rng.uniform(0, 3))
        c.data.materials.append(mats[k % len(mats)])


def scorch(x, y, r, z=ZT + 0.004, strong=False):
    """A burn mark on the ground: soot fading out raggedly from the centre. strong: an opaque black core with an ash
    ring, for a burn on grass, which hides a faint one."""
    m, nt, b = new_mat("scorch")
    b.inputs["Base Color"].default_value = (0.025, 0.022, 0.02, 1)
    b.inputs["Roughness"].default_value = 0.95
    tc = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    gr = node(nt, "ShaderNodeTexGradient", gradient_type="SPHERICAL")
    mp = node(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / r, 1 / r, 1 / r)
    link(nt, tc, mp.inputs["Vector"])
    link(nt, mp.outputs[0], gr.inputs["Vector"])
    nz = node(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 2.5
    nz.inputs["Detail"].default_value = 6
    link(nt, tc, nz.inputs["Vector"])
    k_ = (2.4, 0.6, 3.5) if strong else (1.6, 0.7, 2.5)
    a = math_(nt, "MULTIPLY", math_(nt, "SUBTRACT", math_(nt, "MULTIPLY", gr.outputs["Fac"], k_[0]), math_(nt, "MULTIPLY", nz.outputs["Fac"], k_[1])), k_[2], True)
    if strong:  # grey ash toward the edge, black at the heart
        ash = math_(nt, "MULTIPLY", gr.outputs["Fac"], 1.4, True)
        link(nt, mix(nt, ash, (0.055, 0.045, 0.035, 1), (0.01, 0.009, 0.008, 1)), b.inputs["Base Color"])
    tr = node(nt, "ShaderNodeBsdfTransparent")
    mx = node(nt, "ShaderNodeMixShader")
    link(nt, a, mx.inputs[0])
    link(nt, tr.outputs[0], mx.inputs[1])
    link(nt, b.outputs[0], mx.inputs[2])
    link(nt, mx.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    seg = 48
    o = mesh_obj("scorch", [(0, 0, 0)] + [(r * math.cos(2 * math.pi * k / seg), r * math.sin(2 * math.pi * k / seg), 0) for k in range(seg)],
                 [(0, 1 + k, 1 + (k + 1) % seg) for k in range(seg)], m)
    o.location = (x, y, z)
    return o


def ember(x, y, z, r=0.35, energy=60):
    """A hot glow inside the break, lighting the broken edges from within; glow pass only."""
    em = accent("ember", (0.12, 0.05, 0.02), glow=1.6, emit=(1.0, 0.3, 0.05))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=(x, y, z))
    e = bpy.context.active_object
    e.name = "ember"
    e.scale = (1, 1, 0.5)
    e.data.materials.append(em)
    light("POINT", (x, y, z + 0.4), energy, (1.0, 0.45, 0.15), 0.3)
