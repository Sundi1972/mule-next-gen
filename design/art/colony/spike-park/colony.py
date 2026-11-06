"""
The whole first ring of the grounds: 3x3 places of 12 m, the park from park.py at (1,0), five buildings, three bare slabs.
Place (col,row) sits at Blender (x = 12*col, y = -12*row). Building massing is from layout.ts.
Run: blender -b -P colony.py -- <spike-dir> [samples=256] [views=day,dusk] [percent=100] [what=colony|stages|rt]
  colony -> out/colony_day.png, out/colony_dusk.png      stages -> out/hospital_stages.png      rt -> out/colony_rt.glb
"""
import math
import os
import random
import sys
import time

import bmesh
import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
DIR = argv[0]
SAMPLES = int(argv[1]) if len(argv) > 1 else 256
VIEWS = argv[2].split(",") if len(argv) > 2 and argv[2] else ["day", "dusk"]
PCT = int(argv[3]) if len(argv) > 3 else 100
WHAT = argv[4] if len(argv) > 4 else "colony"
OUT = os.path.join(DIR, "out")
T0 = time.time()


class ParkBuilt(Exception):
    pass


# The park and every helper come from park.py, run up to its render step.
P = {"__name__": "park", "PARK_BUILT": ParkBuilt()}
park_src = os.path.join(DIR, "park.py")
sys.argv = [sys.argv[0], "--", DIR, str(SAMPLES), "day", str(PCT), "0"]
try:
    exec(compile(open(park_src).read(), park_src, "exec"), P)
except ParkBuilt:
    pass
for k in ("node", "sock", "link", "mix", "math_", "new_mat", "pbr", "box_uv", "block", "mesh_obj", "cyl", "view", "globe", "metal",
          "stone", "scene", "coll", "cam", "shadow_see_through", "load", "place", "recentre", "mdims", "unlink", "A", "T"):
    globals()[k] = P[k]
print(f"SPIKE t+{time.time() - T0:.0f}s park built", flush=True)
PARK_OBJS = set(scene.objects)
GROUP = {}  # object -> export group, so the glb has one mesh per building
random.seed(21)

SL = 12.0
H = SL / 2
RIM = 0.7
ZT = 0.02  # top of a building slab's pavers

# ---------- materials ----------

concrete = pbr("facade_concrete", "concrete_panels", 6.0, tint=(1.45, 1.45, 1.42))
def panel_mat(name, rgb):
    """Clean rendered panels: a flat colour, with only the concrete-panel joints as relief; grime reads as neglect."""
    m, nt, b = new_mat(name)
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = 0.6
    nm = node(nt, "ShaderNodeNormalMap")
    v = P["uv_map"](nt, 6.0)
    n = node(nt, "ShaderNodeTexImage", image=bpy.data.images.load(os.path.join(T, "concrete_panels", "concrete_panels_nor_gl_1k.jpg")))
    n.image.colorspace_settings.name = "Non-Color"
    link(nt, v, n.inputs["Vector"])
    link(nt, n.outputs["Color"], nm.inputs["Color"])
    link(nt, nm.outputs[0], b.inputs["Normal"])
    return m


plaster = panel_mat("facade_white", (0.8, 0.81, 0.82))
clad = pbr("metal_cladding", "box_profile_metal_sheet", 2.0, tint=(0.62, 0.64, 0.68))
roofplant = pbr("roof_plant", "metal_plate_02", 1.5, tint=(0.8, 0.8, 0.82))
pavers = pbr("forecourt_pavers", "square_concrete_pavers", 1.8, tint=(0.98, 1.0, 1.05))
apron_pavers = pbr("plaza_pavers", "square_concrete_pavers", 1.2, tint=(0.78, 0.79, 0.8))


def worn(m, scale=0.6, lo=0.72):
    """Wear on paving: a slow noise darkens and warms patches, so a plaza is not one flat tone."""
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    src = b.inputs["Base Color"].links[0].from_socket
    nz = node(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = scale
    nz.inputs["Detail"].default_value = 4
    link(nt, node(nt, "ShaderNodeTexCoord").outputs["Object"], nz.inputs["Vector"])
    r = node(nt, "ShaderNodeValToRGB")
    r.color_ramp.elements[0].position = 0.35
    r.color_ramp.elements[0].color = (lo, lo * 0.97, lo * 0.92, 1)
    r.color_ramp.elements[1].position = 0.65
    r.color_ramp.elements[1].color = (1.05, 1.05, 1.05, 1)
    link(nt, nz.outputs["Fac"], r.inputs["Fac"])
    link(nt, mix(nt, 1.0, src, r.outputs["Color"], "MULTIPLY"), b.inputs["Base Color"])


worn(apron_pavers)
worn(pavers, 0.9, 0.82)


def ground_mat(name, fade=False):
    """The planet's ground: two photo lawns, bare earth and pebbles mixed by noise. With fade, it thins to
    transparent toward the frame's edge (an ellipse in screen space), so the colony sits in a vignette of land."""
    m, nt, b = new_mat(name)
    Pc = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    def img_at(path, size, data=False):
        mp = node(nt, "ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (1 / size, 1 / size, 1)
        link(nt, Pc, mp.inputs["Vector"])
        n = node(nt, "ShaderNodeTexImage", image=bpy.data.images.load(path, check_existing=True))
        link(nt, mp.outputs[0], n.inputs["Vector"])
        return n.outputs["Color"]
    g1 = img_at(os.path.join(T, "Grass001", "Grass001_1K-JPG_Color.jpg"), 2.2)
    g4 = img_at(os.path.join(T, "Grass004", "Grass004_1K-JPG_Color.jpg"), 1.7)
    peb = img_at(os.path.join(T, "clean_pebbles", "clean_pebbles_diff_1k.jpg"), 1.6)
    def noise(scale, lo, hi):
        nz = node(nt, "ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = scale
        nz.inputs["Detail"].default_value = 5
        link(nt, Pc, nz.inputs["Vector"])
        mr = node(nt, "ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = lo
        mr.inputs["From Max"].default_value = hi
        link(nt, nz.outputs["Fac"], mr.inputs["Value"])
        return mr.outputs[0]
    grass = mix(nt, noise(0.08, 0.4, 0.6), mix(nt, 1.0, g4, (0.72, 0.78, 0.55, 1), "MULTIPLY"), mix(nt, 1.0, g1, (0.95, 0.95, 0.85, 1), "MULTIPLY"))
    earth = mix(nt, 1.0, peb, (0.62, 0.5, 0.38, 1), "MULTIPLY")
    c = mix(nt, noise(0.12, 0.47, 0.6), grass, earth)
    link(nt, c, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.92
    if not fade:
        return m
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, Pc, sep.inputs[0])
    u = math_(nt, "MULTIPLY", math_(nt, "ADD", sep.outputs["X"], sep.outputs["Y"]), 0.7071 / 30.0)
    v = math_(nt, "MULTIPLY", math_(nt, "SUBTRACT", sep.outputs["Y"], sep.outputs["X"]), 0.3536 / 17.0)
    rr = math_(nt, "SQRT", math_(nt, "ADD", math_(nt, "MULTIPLY", u, u), math_(nt, "MULTIPLY", v, v)))
    nz = noise(0.25, 0.0, 1.0)
    rr = math_(nt, "ADD", rr, math_(nt, "MULTIPLY", math_(nt, "SUBTRACT", nz, 0.5), 0.06))
    fadef = node(nt, "ShaderNodeMapRange")
    fadef.inputs["From Min"].default_value = 0.62
    fadef.inputs["From Max"].default_value = 1.0
    link(nt, rr, fadef.inputs["Value"])
    out = nt.nodes["Material Output"]
    mx = node(nt, "ShaderNodeMixShader")
    link(nt, fadef.outputs[0], mx.inputs[0])
    link(nt, b.outputs[0], mx.inputs[1])
    link(nt, node(nt, "ShaderNodeBsdfTransparent").outputs[0], mx.inputs[2])
    link(nt, mx.outputs[0], out.inputs["Surface"])
    return m


meadow = ground_mat("rough_ground")
terrain_mat = ground_mat("terrain", fade=True)
padmat = pbr("launch_pad", "hangar_concrete_floor", 3.0, tint=(1.3, 1.3, 1.3))


def flat(name, rgb, rough=0.5, metal=0.0):
    m, nt, b = new_mat(name)
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


frame = flat("window_frame", (0.045, 0.05, 0.055), 0.35, 0.8)
roofmem = flat("roof_membrane", (0.23, 0.235, 0.24), 0.9)
whitemetal = flat("white_metal", (0.82, 0.83, 0.85), 0.28, 0.35)
darkmetal = flat("dark_metal", (0.06, 0.06, 0.065), 0.45, 0.7)
GLOWS = []  # (material, emission strength at dusk)


def accent(name, rgb, glow=0.0, rough=0.4):
    """One accent colour per building; glow > 0 makes it a lit sign at dusk."""
    m, nt, b = new_mat(name)
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Emission Color"].default_value = (*rgb, 1)
    if glow:
        GLOWS.append((b, glow))
    return m


def glass_mat(name, lit_share=0.55):
    """Dark reflective glass; at dusk a random share of the bays light warm, one random per bay and floor."""
    m, nt, b = new_mat(name)
    b.inputs["Base Color"].default_value = (0.09, 0.115, 0.14, 1)
    b.inputs["Roughness"].default_value = 0.07
    b.inputs["Emission Color"].default_value = (1.0, 0.64, 0.3, 1)
    P_ = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    cell = node(nt, "ShaderNodeVectorMath", operation="DIVIDE")
    cell.inputs[1].default_value = (1.4, 1.4, 3.0)
    link(nt, P_, cell.inputs[0])
    fl = node(nt, "ShaderNodeVectorMath", operation="FLOOR")
    link(nt, cell.outputs[0], fl.inputs[0])
    wn = node(nt, "ShaderNodeTexWhiteNoise", noise_dimensions="3D")
    link(nt, fl.outputs[0], wn.inputs["Vector"])
    lit = math_(nt, "LESS_THAN", wn.outputs["Value"], lit_share)
    level = math_(nt, "ADD", math_(nt, "MULTIPLY", wn.outputs["Value"], 0.8), 0.6)
    strength = node(nt, "ShaderNodeValue")
    strength.name = "win"
    strength.outputs[0].default_value = 0.0
    link(nt, math_(nt, "MULTIPLY", math_(nt, "MULTIPLY", lit, level), strength.outputs[0]), b.inputs["Emission Strength"])
    WINDOWS.append(strength)
    return m


WINDOWS = []
glass = glass_mat("window_glass", lit_share=0.72)

# ---------- building kit ----------


def bx(x0, x1, y0, y1, z0, z1, mat, bevel=0.012, name="part"):
    return block(name, min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1), z0, z1, mat, bevel)


def slab(cx, cy, top=pavers):
    """A grounds place like the park's: sandstone rim and sides, paved inside."""
    bx(cx - H, cx + H, cy - H, cy + H, -0.6, 0.0, stone, 0.02, "slab")
    bx(cx - H + RIM, cx + H - RIM, cy - H + RIM, cy + H - RIM, -0.02, ZT, top, 0.004, "forecourt")


def modern(cx, cy, w, d, floors, fh, wall, name, sp=1.2, inset=0.28, bay=1.4, top_extra=0.9, upto=None, gl=None):
    """A frontier-modern block: per floor a solid spandrel band, then a recessed glass band with real mullions.
    upto (floors) leaves the rest as a bare concrete frame, for the construction stage."""
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2
    gl = gl or glass
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
                        parts.append(bx(t - 0.04, t + 0.04, f0, f1, z + sp, z + fh, frame, 0, name + "_mullion"))
                    else:
                        parts.append(bx(f0, f1, t - 0.04, t + 0.04, z + sp, z + fh, frame, 0, name + "_mullion"))
            # transom halfway up the glass band
            zt_ = z + sp + (fh - sp) * 0.72
            parts.append(bx(x0 + inset - 0.02, x1 - inset + 0.02, y0 + inset - 0.02, y1 - inset + 0.02, zt_, zt_ + 0.06, frame, 0, name + "_transom"))
        else:
            # bare frame: floor slab and corner/edge columns
            parts.append(bx(x0, x1, y0, y1, z, z + 0.3, concrete, 0.01, name + "_floorslab"))
            for px in (x0 + 0.2, (x0 + x1) / 2, x1 - 0.2):
                for py in (y0 + 0.2, (y0 + y1) / 2, y1 - 0.2):
                    parts.append(bx(px - 0.18, px + 0.18, py - 0.18, py + 0.18, z + 0.3, z + fh, concrete, 0.01, name + "_column"))
    ztop = ZT + floors * fh
    if upto is None or upto >= floors:
        parts.append(bx(x0, x1, y0, y1, ztop, ztop + 0.25, wall, 0.02, name))  # roof slab edge
        for (a, b_, c, d_) in ((x0, x1, y0, y0 + 0.22), (x0, x1, y1 - 0.22, y1), (x0, x0 + 0.22, y0, y1), (x1 - 0.22, x1, y0, y1)):
            parts.append(bx(a, b_, c, d_, ztop + 0.25, ztop + top_extra, wall, 0.015, name + "_parapet"))
        parts.append(bx(x0 + 0.22, x1 - 0.22, y0 + 0.22, y1 - 0.22, ztop + 0.25, ztop + 0.32, roofmem, 0, name + "_roof"))
    else:
        parts.append(bx(x0, x1, y0, y1, ztop, ztop + 0.3, concrete, 0.01, name + "_floorslab"))
    return parts, ztop + 0.32


def rooftop(cx, cy, z, units):
    """Plant on the roof: boxes in cladding with dark fan discs."""
    for (dx, dy, w, d, h) in units:
        bx(cx + dx - w / 2, cx + dx + w / 2, cy + dy - d / 2, cy + dy + d / 2, z, z + h, roofplant, 0.02, "roof_unit")
        for k in range(max(1, int(w // 0.9))):
            fx = cx + dx - w / 2 + 0.45 + k * 0.9
            if fx < cx + dx + w / 2 - 0.3:
                cyl("fan", fx, cy + dy, 0.3, z + h, z + h + 0.05, darkmetal, 20)


def canopy(cx, y_front, width, depth, z, mat_edge, posts=True):
    """An entrance canopy on the south face: thin cantilever slab, accent fascia, two slim posts."""
    bx(cx - width / 2, cx + width / 2, y_front - depth, y_front, z, z + 0.14, whitemetal, 0.01, "canopy")
    bx(cx - width / 2, cx + width / 2, y_front - depth - 0.03, y_front - depth, z - 0.04, z + 0.2, mat_edge, 0.005, "canopy_fascia")
    if posts:
        for px in (cx - width / 2 + 0.25, cx + width / 2 - 0.25):
            cyl("canopy_post", px, y_front - depth + 0.25, 0.05, ZT, z, frame, 12)


def lamp(x, y, h=3.0, z0=0.0):
    """A walkway lamp: the park's post and globe, with its own warm light."""
    cyl("lamp_base", x, y, 0.08, z0 - 0.02, z0 + 0.22, metal)
    cyl("lamp_post", x, y, 0.035, z0 + 0.2, z0 + h - 0.32, metal, 16)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=0.16, location=(x, y, z0 + h - 0.16))
    g = bpy.context.active_object
    g.name = "lamp_globe"
    g.data.materials.append(globe)
    g.data.shade_smooth()
    bpy.ops.object.light_add(type="POINT", location=(x, y, z0 + h - 0.16))
    L = bpy.context.active_object
    L.data.shadow_soft_size = 0.13
    L.data.color = (1.0, 0.66, 0.36)
    L.data.energy = 110
    LAMPS.append(L)


LAMPS, SPOTS, SKIRT = [], [], []

# ---------- the buildings ----------


def town_hall(cx, cy):
    blue = accent("hall_blue", (0.06, 0.22, 0.62), glow=3.0)
    gold = accent("hall_gold", (0.85, 0.62, 0.22), rough=0.3)
    parts, top = modern(cx, cy, 7.4, 7.4, 1, 4.1, concrete, "hall", sp=1.5, top_extra=0.9)
    # a civic front on the east face, the side the camera sees over the low park: a deep portico of slim columns
    x0 = cx + 3.7
    bx(x0 - 0.2, x0 + 2.0, cy - 3.9, cy + 3.9, 4.0, 4.35, concrete, 0.02, "portico")
    bx(x0 + 1.98, x0 + 2.04, cy - 3.9, cy + 3.9, 3.9, 4.45, blue, 0.005, "portico_band")
    for k in range(6):
        cyl("column", x0 + 1.75, cy - 3.4 + k * 1.36, 0.13, ZT, 4.0, whitemetal, 20)
    bx(x0, x0 + 2.3, cy - 3.9, cy + 3.9, ZT - 0.02, ZT + 0.12, plaster, 0.01, "steps")
    bx(x0 + 2.3, x0 + 2.6, cy - 3.9, cy + 3.9, ZT - 0.02, ZT + 0.06, plaster, 0.01, "steps")
    bx(x0 - 0.02, x0 + 0.02, cy - 1.0, cy + 1.0, 4.45, 5.1, gold, 0.005, "crest")  # a gold plaque on the parapet
    rooftop(cx - 1.2, cy + 1.0, top, [(0, 0, 2.2, 1.4, 0.8)])
    # the colony flag: pole at the south-east corner of the forecourt, cloth rippled by a sine
    fx, fy = cx + 4.6, cy - 4.6
    cyl("flagpole", fx, fy, 0.05, ZT, 9.0, whitemetal, 12)
    bpy.ops.mesh.primitive_plane_add(size=1)
    fl = bpy.context.active_object
    fl.name = "flag"
    me = fl.data
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=16, y_segments=8, size=0.5)
    for v in bm.verts:
        u = v.co.x + 0.5
        v.co = Vector((u * 1.8, 0.12 * math.sin(u * 7.0) * u, (v.co.y + 0.5) * 1.1))
    bm.to_mesh(me)
    bm.free()
    fl.location = (fx + 0.05, fy, 7.8)
    fl.rotation_euler = (0, 0, math.radians(20))
    me.materials.append(flat("flag_cloth", (0.06, 0.22, 0.62), 0.7))
    me.shade_smooth()


def hospital(cx, cy, stage="standing"):
    """Stages: site, building, standing, closed, damaged. Closed and damaged are the standing model with
    material swaps and added parts; only the site and the scaffold/crane are their own kit."""
    before = set(scene.objects)
    dead = stage in ("closed", "damaged")
    red = accent("hospital_red_" + stage, (0.75, 0.04, 0.04) if not dead else (0.42, 0.2, 0.18), glow=0 if dead else 4.0)
    if stage == "site":
        site_stakes(cx, cy, 7.9, 7.9)
        return
    wall = plaster if not dead else panel_mat("facade_" + stage, (0.6, 0.58, 0.54) if stage == "closed" else (0.42, 0.4, 0.37))
    gl = None if not dead else flat("glass_dead", (0.05, 0.055, 0.06), 0.35)
    upto = 1 if stage == "building" else None
    parts, top = modern(cx, cy, 7.9, 7.9, 2, 3.05, wall, "hospital", sp=1.25, top_extra=0.9, upto=upto, gl=gl)
    if stage == "building":
        scaffold(cx, cy, 7.9, 7.9, 2 * 3.05 + 0.6)
        crane(cx + 5.2, cy + 5.2, 14.0)
        return
    y0 = cy - 3.95
    canopy(cx - 1.4, y0, 3.6, 2.0, 2.9, red)
    # red crosses on the parapet of the two faces the camera sees
    zc = ZT + 2 * 3.05 + 0.6
    for (axis, fx, fy) in (("y", cx, y0 - 0.05), ("x", cx + 3.95 + 0.05, cy)):
        for (a, b_) in ((0.6, 0.18), (0.18, 0.6)):
            if axis == "y":
                bx(fx - a, fx + a, fy - 0.06, fy, zc - b_, zc + b_, red, 0.005, "cross")
            else:
                bx(fx, fx + 0.06, fy - a, fy + a, zc - b_, zc + b_, red, 0.005, "cross")
    rooftop(cx + 1.0, cy + 1.2, top, [(0, 0, 2.6, 1.6, 0.9), (-2.4, -0.4, 1.2, 1.2, 0.6)])
    cyl("helipad", cx - 1.6, cy - 1.6, 1.3, top, top + 0.02, darkmetal, 40)
    for (a, b_, c, d) in ((-2.0, -1.85, -2.1, -1.1), (-1.35, -1.2, -2.1, -1.1), (-1.85, -1.35, -1.67, -1.53)):
        bx(cx + a, cx + b_, cy + c, cy + d, top + 0.02, top + 0.03, whitemetal, 0, "H")
    if stage == "closed":
        # boarded ground floor, a site fence across the entrance
        ply = flat("plywood", (0.5, 0.4, 0.27), 0.85)
        for k in range(5):
            x = cx - 3.4 + k * 1.5
            bx(x, x + 1.2, y0 - 0.06, y0 - 0.01, ZT + 1.3, ZT + 2.95, ply, 0.005, "board")
            y = cy - 3.4 + k * 1.5
            bx(cx + 3.96, cx + 4.01, y, y + 1.2, ZT + 1.3, ZT + 2.95, ply, 0.005, "board")
        fence = flat("fence_mesh", (0.55, 0.57, 0.6), 0.5, 0.6)
        bx(cx - 4.6, cx + 2.0, y0 - 2.6, y0 - 2.57, ZT, ZT + 1.8, fence, 0, "fence")
        for k in range(5):
            cyl("fence_post", cx - 4.6 + k * 1.65, y0 - 2.58, 0.03, ZT, ZT + 1.85, fence, 8)
    if stage == "damaged":
        # a broken south-east corner: a lumpy cutter takes a bite out of every part it touches
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=2.6, location=(cx + 3.95, cy - 3.95, top - 0.2))
        cut = bpy.context.active_object
        for v in cut.data.vertices:
            v.co *= 1 + 0.35 * P["noise"].noise(v.co * 0.9)
        cut.hide_render = True
        cut.display_type = "WIRE"
        bpy.context.view_layer.update()  # bound boxes of just-made objects are zero until evaluated
        lo_ = Vector((cx + 3.95 - 3.0, cy - 3.95 - 3.0, top - 3.6))
        for o in set(scene.objects) - before - {cut}:
            if o.type != "MESH":
                continue
            bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
            if max(p.x for p in bb) > lo_.x and min(p.y for p in bb) < cy - 3.95 + 3.0 and max(p.z for p in bb) > lo_.z:
                bo = o.modifiers.new("break", "BOOLEAN")
                bo.object = cut
                bo.operation = "DIFFERENCE"
                bo.solver = "FLOAT"  # the exact solver silently leaves these bevelled boxes whole
        # rubble at the foot of the break
        rng = random.Random(4)
        for k in range(26):
            r = rng.uniform(0.15, 0.45)
            bpy.ops.mesh.primitive_cube_add(size=1, location=(cx + 3.6 + rng.uniform(-1.6, 1.4), cy - 3.6 + rng.uniform(-1.4, 1.6), ZT + r * 0.3))
            c = bpy.context.active_object
            c.name = "rubble"
            c.scale = (r, r * rng.uniform(0.5, 1.0), r * rng.uniform(0.3, 0.7))
            c.rotation_euler = (rng.uniform(0, 3), rng.uniform(0, 3), rng.uniform(0, 3))
            c.data.materials.append(wall if k % 3 else concrete)
        # smoke: an elongated volume over the break, noise-broken and fading with height
        bpy.ops.mesh.primitive_cube_add(size=1, location=(cx + 3.0, cy - 3.0, top + 3.6))
        sm = bpy.context.active_object
        sm.name = "smoke"
        sm.scale = (3.2, 3.2, 8.0)
        m, nt, b = new_mat("smoke")
        nt.nodes.remove(b)
        vol = node(nt, "ShaderNodeVolumePrincipled")
        vol.inputs["Color"].default_value = (0.16, 0.155, 0.15, 1)
        tc = node(nt, "ShaderNodeTexCoord").outputs["Object"]
        mp = node(nt, "ShaderNodeMapping")
        mp.inputs["Location"].default_value = (0.08, -0.08, 0.45)  # plume leans down-wind (east) as it climbs
        mp.inputs["Scale"].default_value = (1.7, 1.7, 1.0)
        link(nt, tc, mp.inputs["Vector"])
        gr = node(nt, "ShaderNodeTexGradient", gradient_type="SPHERICAL")
        link(nt, mp.outputs[0], gr.inputs["Vector"])
        nz = node(nt, "ShaderNodeTexNoise")
        nz.inputs["Scale"].default_value = 3.0
        nz.inputs["Detail"].default_value = 6
        link(nt, tc, nz.inputs["Vector"])
        dens = math_(nt, "MULTIPLY", math_(nt, "MULTIPLY", gr.outputs["Fac"], math_(nt, "POWER", nz.outputs["Fac"], 2.0)), 22.0)
        link(nt, dens, vol.inputs["Density"])
        link(nt, vol.outputs[0], nt.nodes["Material Output"].inputs["Volume"])
        sm.data.materials.append(m)
        # embers in the break: a small hot glow that lights the broken edges from inside
        ember = accent("ember", (1.0, 0.35, 0.06))
        ember.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 3.0
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.35, location=(cx + 3.0, cy - 3.0, top - 1.7))
        bpy.context.active_object.data.materials.append(ember)
        bpy.ops.object.light_add(type="POINT", location=(cx + 3.2, cy - 3.2, top - 1.2))
        bpy.context.active_object.data.energy = 120
        bpy.context.active_object.data.color = (1.0, 0.45, 0.15)


def observatory(cx, cy):
    blue = accent("observatory_blue", (0.1, 0.35, 0.75), glow=2.0)
    parts, top = modern(cx, cy, 6.7, 6.7, 1, 4.6, concrete, "observatory", sp=1.6, top_extra=0.9)
    canopy(cx, cy - 3.35, 2.8, 1.6, 2.9, blue)
    # drum and dome; the slot faces the camera so the telescope reads
    cyl("drum", cx, cy, 2.55, top - 0.05, top + 0.7, whitemetal, 64)
    cyl("dome_band", cx, cy, 2.6, top + 0.55, top + 0.75, blue, 64)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=2.5, location=(cx, cy, top + 0.7))
    dome = bpy.context.active_object
    dome.name = "dome"
    bm = bmesh.new()
    bm.from_mesh(dome.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -0.01], context="VERTS")
    bm.to_mesh(dome.data)
    bm.free()
    dome.data.materials.append(whitemetal)
    dome.data.shade_smooth()
    sol = dome.modifiers.new("shell", "SOLIDIFY")
    sol.thickness = 0.08
    # the slot: a box cut from the crown down the south-east side
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx + 1.0, cy - 1.0, top + 0.7 + 1.9))
    cut = bpy.context.active_object
    cut.scale = (0.7, 3.2, 2.2)
    cut.rotation_euler = (math.radians(-30), 0, math.radians(45))
    cut.hide_render = True
    cut.display_type = "WIRE"
    bo = dome.modifiers.new("slot", "BOOLEAN")
    bo.object = cut
    bo.operation = "DIFFERENCE"
    bo.solver = "EXACT"
    # telescope tube pointing up through the slot
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=0.32, depth=3.0, location=(cx + 0.45, cy - 0.45, top + 1.9))
    tel = bpy.context.active_object
    tel.name = "telescope"
    tel.rotation_euler = (math.radians(-40), 0, math.radians(45))
    tel.data.materials.append(darkmetal)
    tel.data.shade_smooth()
    cyl("telescope_mount", cx, cy, 0.35, top + 0.7, top + 1.4, darkmetal, 20)
    for k, (dx, dy) in enumerate([(-2.6, 2.4)]):
        rooftop(cx + dx, cy + dy, top, [(0, 0, 1.0, 0.8, 0.6)])


def stadium(cx, cy):
    teal = accent("stadium_teal", (0.02, 0.45, 0.5), rough=0.5)
    stripe = accent("stadium_band", (0.9, 0.45, 0.05), glow=2.5)
    rx, ry, HT = 5.15, 4.1, 2.6
    seg = 96

    def ring(r_x, r_y, z):
        return [(cx + r_x * math.cos(2 * math.pi * k / seg), cy + r_y * math.sin(2 * math.pi * k / seg), z) for k in range(seg)]

    def band(a, b_, mat, name):
        v = a + b_
        f = [(k, (k + 1) % seg, seg + (k + 1) % seg, seg + k) for k in range(seg)]
        o = mesh_obj(name, v, f, mat)
        box_uv(o)
        return o

    # outer wall in metal cladding, an orange band under its lip
    band(ring(rx, ry, ZT), ring(rx, ry, HT - 0.35), clad, "stadium_wall")
    band(ring(rx, ry, HT - 0.35), ring(rx, ry, HT), stripe, "stadium_band")
    band(ring(rx, ry, HT), ring(rx - 0.25, ry - 0.25, HT), whitemetal, "stadium_lip")
    # stepped seating down to the pitch
    steps = 6
    for s_ in range(steps):
        f0 = 1 - s_ / steps
        f1 = 1 - (s_ + 1) / steps
        ra, rb = 0.25 + (1.75) * (1 - f0), 0.25 + 1.75 * (1 - f1)
        z = HT - (s_ + 1) * (HT - 0.35) / steps
        band(ring(rx - ra, ry - ra, z + (HT - 0.35) / steps), ring(rx - ra, ry - ra, z), teal, "stand_riser")
        band(ring(rx - ra, ry - ra, z), ring(rx - rb, ry - rb, z), teal if s_ % 2 else whitemetal, "stand_tread")
    # pitch: lawn inside the lowest step, white lines as thin strips
    pr_x, pr_y = rx - 2.0, ry - 2.0
    pv = [(cx, cy, 0.3)] + ring(pr_x + 0.02, pr_y + 0.02, 0.3)
    pf = [(0, 1 + k, 1 + (k + 1) % seg) for k in range(seg)]
    pitch = mesh_obj("pitch", pv, pf, pitch_mat())
    lw = 0.05
    hx, hy = pr_x * 0.72, pr_y * 0.72
    for (a, b_, c, d) in ((-hx, hx, -hy, -hy + lw), (-hx, hx, hy - lw, hy), (-hx, -hx + lw, -hy, hy), (hx - lw, hx, -hy, hy), (-lw / 2, lw / 2, -hy, hy)):
        bx(cx + a, cx + b_, cy + c, cy + d, 0.3, 0.312, whitemetal, 0, "pitch_line")
    for k in range(40):
        a = 2 * math.pi * k / 40
        bx(cx + 0.55 * math.cos(a) - 0.03, cx + 0.55 * math.cos(a) + 0.03, cy + 0.55 * math.sin(a) - 0.03, cy + 0.55 * math.sin(a) + 0.03, 0.3, 0.312, whitemetal, 0, "pitch_line")
    # floodlights on four masts, heads tilted at the centre spot
    for (sx, sy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        mx, my = cx + sx * (rx - 0.2) * 0.8, cy + sy * (ry + 0.6) * 0.85
        cyl("flood_mast", mx, my, 0.09, ZT, 8.0, darkmetal, 12)
        head = bx(mx - 0.55, mx + 0.55, my - 0.08, my + 0.08, 7.8, 8.5, darkmetal, 0.01, "flood_head")
        face = bx(mx - 0.5, mx + 0.5, my - 0.1, my - 0.08, 7.85, 8.45, LIGHTFACE, 0, "flood_face")
        for o in (head, face):
            o.rotation_euler = (0, 0, 0)
        d = Vector((cx - mx, cy - my, 0.3 - 8.1))
        bpy.ops.object.light_add(type="SPOT", location=(mx, my, 8.1))
        S = bpy.context.active_object
        S.rotation_euler = (-d).to_track_quat("Z", "Y").to_euler()
        S.data.spot_size = math.radians(70)
        S.data.spot_blend = 0.6
        S.data.energy = 900
        S.data.color = (0.92, 0.95, 1.0)
        S.data.shadow_soft_size = 0.3
        SPOTS.append(S)


def pitch_mat():
    """The park's lawn photo with broad mowing stripes; the park's own ground shader would paint its gravel cross here."""
    m, nt, b = new_mat("pitch")
    Pc = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    mp = node(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / 1.5, 1 / 1.5, 1)
    link(nt, Pc, mp.inputs["Vector"])
    im = node(nt, "ShaderNodeTexImage", image=bpy.data.images.load(os.path.join(T, "Grass004", "Grass004_1K-JPG_Color.jpg")))
    link(nt, mp.outputs[0], im.inputs["Vector"])
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, Pc, sep.inputs[0])
    k = math_(nt, "ADD", math_(nt, "MULTIPLY", math_(nt, "SIGN", math_(nt, "SINE", math_(nt, "MULTIPLY", sep.outputs["X"], math.pi / 0.8))), 0.12), 0.85)
    kk = node(nt, "ShaderNodeCombineColor")
    for i in range(3):
        link(nt, k, kk.inputs[i])
    link(nt, mix(nt, 1.0, mix(nt, 1.0, im.outputs["Color"], (0.75, 0.95, 0.6, 1), "MULTIPLY"), kk.outputs[0], "MULTIPLY"), b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.85
    return m


def spaceport(cx, cy):
    orange = accent("spaceport_orange", (0.95, 0.38, 0.04))
    lit_orange = accent("spaceport_signal", (0.95, 0.38, 0.04), glow=3.0)  # only pad marks and beacon glow; a glowing tower reads as neon
    # the pad: a 9.6 m disc of launch concrete, a scorched centre, an orange ring
    seg = 96
    R = 4.8
    pv = [(cx, cy, ZT + 0.12)] + [(cx + R * math.cos(2 * math.pi * k / seg), cy + R * math.sin(2 * math.pi * k / seg), ZT + 0.12) for k in range(seg)]
    pf = [(0, 1 + k, 1 + (k + 1) % seg) for k in range(seg)]
    pad = mesh_obj("pad", pv, pf, padmat)
    box_uv(pad)
    cyl("pad_edge", cx, cy, R, ZT - 0.02, ZT + 0.12, concrete, 96)
    m, nt, b = new_mat("scorch")
    b.inputs["Base Color"].default_value = (0.11, 0.1, 0.095, 1)
    b.inputs["Roughness"].default_value = 0.9
    cyl("scorch", cx, cy, 1.0, ZT + 0.12, ZT + 0.125, m, 48)
    for k in range(48):
        a = 2 * math.pi * k / 48
        if k % 2 == 0:
            r0 = 4.35
            bx(cx + r0 * math.cos(a) - 0.12, cx + r0 * math.cos(a) + 0.12, cy + r0 * math.sin(a) - 0.12, cy + r0 * math.sin(a) + 0.12, ZT + 0.12, ZT + 0.135, lit_orange, 0, "pad_mark")
    # rocket: white body, orange band, black interstage, fins, engine bell; on a four-leg mount
    z0 = ZT + 0.12 + 0.7
    for (sx, sy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        bx(cx + sx * 0.75 - 0.08, cx + sx * 0.75 + 0.08, cy + sy * 0.75 - 0.08, cy + sy * 0.75 + 0.08, ZT + 0.12, z0, darkmetal, 0.01, "mount_leg")
    bx(cx - 0.85, cx + 0.85, cy - 0.85, cy + 0.85, z0 - 0.12, z0, darkmetal, 0.01, "mount_ring")
    cyl("engine_bell", cx, cy, 0.42, z0 - 0.5, z0, darkmetal, 24)
    cyl("rocket_body", cx, cy, 0.55, z0, z0 + 4.4, whitemetal, 40)
    cyl("rocket_band", cx, cy, 0.56, z0 + 1.0, z0 + 1.5, orange, 40)
    cyl("rocket_interstage", cx, cy, 0.56, z0 + 3.0, z0 + 3.25, darkmetal, 40)
    bpy.ops.mesh.primitive_cone_add(vertices=40, radius1=0.55, radius2=0.02, depth=1.6, location=(cx, cy, z0 + 4.4 + 0.8))
    nose = bpy.context.active_object
    nose.name = "rocket_nose"
    nose.data.materials.append(whitemetal)
    nose.data.shade_smooth()
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        f = bx(-0.03, 0.03, 0.5, 1.15, 0, 1.0, orange, 0.005, "fin")
        bm = bmesh.new()
        bm.from_mesh(f.data)
        for v in bm.verts:  # swept fin: top edge slides inward
            if v.co.z > 0.5 and v.co.y > 0.8:
                v.co.y -= 0.45
        bm.to_mesh(f.data)
        bm.free()
        f.modifiers.clear()
        f.location = (cx, cy, z0)
        f.rotation_euler = (0, 0, a)
    # service tower NW of the rocket (behind it from this camera), 10.8 m, with an access arm
    tx, ty = cx - 2.2, cy + 2.2
    th = 10.8
    w2 = 0.8
    for (sx, sy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        bx(tx + sx * w2 - 0.07, tx + sx * w2 + 0.07, ty + sy * w2 - 0.07, ty + sy * w2 + 0.07, ZT + 0.12, ZT + th, orange, 0.005, "tower_leg")
    lev = 0.0
    while lev < th - 0.2:
        z = ZT + 0.12 + lev
        bx(tx - w2, tx + w2, ty - w2 - 0.05, ty - w2 + 0.05, z, z + 0.1, darkmetal, 0, "tower_ring")
        bx(tx - w2, tx + w2, ty + w2 - 0.05, ty + w2 + 0.05, z, z + 0.1, darkmetal, 0, "tower_ring")
        bx(tx - w2 - 0.05, tx - w2 + 0.05, ty - w2, ty + w2, z, z + 0.1, darkmetal, 0, "tower_ring")
        bx(tx + w2 - 0.05, tx + w2 + 0.05, ty - w2, ty + w2, z, z + 0.1, darkmetal, 0, "tower_ring")
        # an X brace on the two faces the camera sees
        for (p0, p1) in (((tx - w2, ty - w2), (tx + w2, ty - w2)), ((tx + w2, ty - w2), (tx + w2, ty + w2))):
            for flip in (0, 1):
                a0 = Vector((*p0, z + (1.8 if flip else 0.1)))
                a1 = Vector((*p1, z + (0.1 if flip else 1.8)))
                mid, dv = (a0 + a1) / 2, a1 - a0
                bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.035, depth=dv.length, location=mid)
                br = bpy.context.active_object
                br.name = "tower_brace"
                br.rotation_euler = dv.to_track_quat("Z", "Y").to_euler()
                br.data.materials.append(darkmetal)
        lev += 1.8
    bx(tx - w2 - 0.2, tx + w2 + 0.2, ty - w2 - 0.2, ty + w2 + 0.2, ZT + th, ZT + th + 0.15, darkmetal, 0.01, "tower_top")
    cyl("beacon", tx, ty, 0.12, ZT + th + 0.15, ZT + th + 0.5, lit_orange, 12)
    # access arm across to the rocket's upper stage
    az_ = ZT + 0.12 + 0.7 + 3.6
    arm = bx(tx + 0.2, cx - 0.45, ty - 0.25, ty + 0.25, az_, az_ + 0.35, darkmetal, 0.01, "access_arm")
    arm.location = (0, 0, 0)
    # a low blockhouse with a glass control room
    modern(cx + 3.3, cy + 3.5, 3.0, 2.2, 1, 2.8, concrete, "blockhouse", sp=0.9, top_extra=0.5)


def room_to_grow(cx, cy):
    """A bare place: rough ground with grass coming through, a surveyor's stake at each corner of a future footprint."""
    rng = random.Random(int(cx * 7 + cy * 13))
    bx(cx - H + RIM, cx + H - RIM, cy - H + RIM, cy + H - RIM, ZT, ZT + 0.03, meadow, 0.004, "rough_ground")
    stake = flat("survey_stake", (0.95, 0.42, 0.06), 0.5)
    w = rng.uniform(5.5, 7.5)
    for (sx, sy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        px, py = cx + sx * w / 2, cy + sy * w / 2
        bx(px - 0.05, px + 0.05, py - 0.05, py + 0.05, ZT, ZT + 0.75, stake, 0.005, "stake")
    for k in range(4):  # a few loose rocks
        r = P["rock"].copy()
        coll.objects.link(r)
        sc = rng.uniform(0.18, 0.35) * P["rock"].scale.x
        r.scale = (sc, sc, sc * 0.7)
        r.rotation_euler = (rng.uniform(0, 0.4), rng.uniform(0, 3), rng.uniform(0, 6))
        r.location = (cx + rng.uniform(-4, 4), cy + rng.uniform(-4, 4), ZT - 0.05)


def site_stakes(cx, cy, w, d):
    """Stage 1: graded earth, a stake at every corner and every 2 m, string between them, two survey flags."""
    m, nt, b = new_mat("earth")
    b.inputs["Base Color"].default_value = (0.2, 0.13, 0.08, 1)
    b.inputs["Roughness"].default_value = 0.95
    bp = node(nt, "ShaderNodeBump")
    nz = node(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 18
    link(nt, nz.outputs["Fac"], bp.inputs["Height"])
    link(nt, bp.outputs["Normal"], b.inputs["Normal"])
    bx(cx - w / 2 - 1.0, cx + w / 2 + 1.0, cy - d / 2 - 1.0, cy + d / 2 + 1.0, ZT - 0.01, ZT + 0.03, m, 0.01, "earth")
    wood = flat("stake_wood", (0.55, 0.4, 0.24), 0.8)
    string = flat("string", (0.95, 0.85, 0.2), 0.6)
    pts = []
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2
    for t in [i / 4 for i in range(4)]:
        pts += [(x0 + (x1 - x0) * t, y0), (x1, y0 + (y1 - y0) * t), (x1 - (x1 - x0) * t, y1), (x0, y1 - (y1 - y0) * t)]
    for (px, py) in pts:
        bx(px - 0.05, px + 0.05, py - 0.05, py + 0.05, ZT, ZT + 0.9, wood, 0.005, "stake")
    for (a, b_, c, d_) in ((x0, x1, y0, y0), (x1, x1, y0, y1), (x0, x1, y1, y1), (x0, x0, y0, y1)):
        bx(a - 0.02, b_ + 0.02, c - 0.02, d_ + 0.02, ZT + 0.75, ZT + 0.79, string, 0, "string")
    for (hx, hy, r) in ((x1 + 0.2, y1 - 1.0, 1.1), (x1 - 0.8, y1 + 0.3, 0.8)):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, radius=r, location=(hx, hy, ZT))
        hp = bpy.context.active_object
        hp.name = "spoil_heap"
        hp.scale = (1, 1, 0.45)
        hp.data.materials.append(m)
        hp.data.shade_smooth()
    cab = flat("site_cabin", (0.85, 0.65, 0.1), 0.5)
    bx(x0 - 0.6, x0 + 2.2, y1 - 0.2, y1 + 1.0, ZT, ZT + 2.4, cab, 0.02, "site_cabin")
    red = flat("survey_flag", (0.85, 0.08, 0.05), 0.6)
    for (px, py) in ((x0, y0), (x1, y1)):
        cyl("survey_pole", px, py, 0.025, ZT, ZT + 1.6, whitemetal, 8)
        bx(px, px + 0.35, py - 0.005, py + 0.005, ZT + 1.3, ZT + 1.55, red, 0, "survey_flag")


def scaffold(cx, cy, w, d, h):
    """Stage 2: a tube-and-plank scaffold wrapped round the footprint, 0.9 m out, lifts every 2 m."""
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
    # green debris netting on the top lift of the east face
    bx(x1 + 0.03, x1 + 0.05, y0, y1, ZT + h - 2.0, ZT + h, netting, 0, "netting")


def crane(x, y, h):
    """A tower crane: lattice mast, jib over the site, counter-jib with weights, cab."""
    yel = accent("crane_yellow", (0.95, 0.7, 0.05), rough=0.45)
    s = 0.6
    for (sx, sy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        bx(x + sx * s / 2 - 0.05, x + sx * s / 2 + 0.05, y + sy * s / 2 - 0.05, y + sy * s / 2 + 0.05, ZT, ZT + h, yel, 0, "crane_leg")
    z = ZT + 0.8
    while z < ZT + h:
        bx(x - s / 2, x + s / 2, y - s / 2, y + s / 2, z, z + 0.06, yel, 0, "crane_ring")
        z += 0.8
    # jib toward the building (south-west), counter-jib the other way
    jl, cl = 9.0, 3.5
    for (L, sign) in ((jl, -1), (cl, 1)):
        j = bx(0, L, -0.25, 0.25, 0, 0.45, yel, 0.005, "crane_jib")
        j.location = (x, y, ZT + h)
        j.rotation_euler = (0, 0, math.radians(225 if sign < 0 else 45))
    cw = bx(cl - 1.2, cl - 0.2, -0.45, 0.45, -0.9, 0.0, concrete, 0.01, "counterweight")
    cw.location = (x, y, ZT + h)
    cw.rotation_euler = (0, 0, math.radians(45))
    bx(x - 0.5, x + 0.5, y - 0.9, y - 0.3, ZT + h - 1.0, ZT + h, yel, 0.01, "crane_cab")
    bx(x - 0.15, x + 0.15, y - 0.15, y + 0.15, ZT + h + 0.45, ZT + h + 2.2, yel, 0, "crane_peak")
    # hook line hanging over the site
    hx, hy = x - 5.5 * 0.707, y - 5.5 * 0.707
    cyl("hook_line", hx, hy, 0.015, ZT + h - 4.5, ZT + h, darkmetal, 6)
    bx(hx - 0.12, hx + 0.12, hy - 0.12, hy + 0.12, ZT + h - 4.8, ZT + h - 4.5, darkmetal, 0.01, "hook")


m, nt, b = new_mat("floodlight_face")
b.inputs["Base Color"].default_value = (0.9, 0.92, 0.95, 1)
b.inputs["Emission Color"].default_value = (0.92, 0.95, 1.0, 1)
GLOWS.append((b, 25.0))
LIGHTFACE = m

# ---------- views ----------


def colony_view(v):
    view(v)  # park.py's sun, sky, globe and park lamps
    dusk = v != "day"
    if dusk:  # blue hour, not sunset: a cool sky does the fill, the sun only grazes, so warm windows and lamps carry the picture
        P["bg"].inputs["Strength"].default_value = 0.42
        P["sock"](P["tint"], "B", False, "RGBA").default_value = (0.32, 0.48, 1.0, 1)
        P["set_sun"](3, 200, 0.5, (1.0, 0.5, 0.3), 2.0)
        scene.view_settings.exposure = 0.55
    for s in WINDOWS:
        s.outputs[0].default_value = 2.6 if dusk else 0.0
    for b, g in GLOWS:
        b.inputs["Emission Strength"].default_value = g if dusk else 0.0
    for L in LAMPS + SPOTS:
        L.hide_render = not dusk


def render_setup(res, pct):
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = "GPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles.transparent_max_bounces = 64
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.render.film_transparent = True
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = pct
    scene.view_settings.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            pass


def shoot(name):
    for v in VIEWS:
        colony_view(v)
        scene.render.filepath = os.path.join(OUT, f"{name}_{v}.png" if name != "hospital_stages" else "hospital_stages.png")
        t0 = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"SPIKE render {scene.render.filepath} {time.time() - t0:.1f}s at {SAMPLES} samples", flush=True)


def hide_park():
    for o in list(scene.objects):
        if o.type in ("MESH", "LIGHT") and o.type != "CAMERA" and not (o.type == "LIGHT" and o.data.type == "SUN"):
            bpy.data.objects.remove(o)
    P["lamp_lights"].clear()  # park.py's view() switches these


# ================= what to make =================

if WHAT == "stages":
    hide_park()
    # five places along the screen's horizontal (world x+y), each on its own slab
    step = 17.0
    for i, st in enumerate(["site", "building", "standing", "closed", "damaged"]):
        t = (i - 2) * step / math.sqrt(2)
        cx, cy = t, t
        slab(cx, cy)
        hospital(cx, cy, st)
        print(f"SPIKE t+{time.time() - T0:.0f}s stage {st}", flush=True)
    cam.data.ortho_scale = 5 * step + 4
    cam.location = Vector((20, -20, 20 * math.tan(math.radians(30)) * math.sqrt(2))) + Vector((0, 0, 0))
    cam.data.shift_y = 0.045  # the crane needs headroom
    render_setup((1920, 480), PCT)
    VIEWS = ["day"]
    shoot("hospital_stages")
    sys.exit(0)

# the park moves to its place (1,0); everything park.py built except camera and sun
for o in scene.objects:
    if o.type == "CAMERA" or (o.type == "LIGHT" and o.data.type == "SUN"):
        continue
    o.location.x += SL

builders = {(0, 0): town_hall, (0, 1): hospital, (1, 1): observatory, (-1, 0): stadium, (0, -1): spaceport}
for col in (-1, 0, 1):
    for row in (-1, 0, 1):
        if (col, row) == (1, 0):
            continue
        cx, cy = SL * col, -SL * row
        before = set(scene.objects)
        slab(cx, cy)
        for o in set(scene.objects) - before:
            GROUP[o] = "plaza"
        if (col, row) not in builders:
            room_to_grow(cx, cy)
        if (col, row) in builders:
            before = set(scene.objects)
            builders[(col, row)](cx, cy)
            for o in set(scene.objects) - before:
                GROUP[o] = builders[(col, row)].__name__
            print(f"SPIKE t+{time.time() - T0:.0f}s built {builders[(col, row)].__name__}", flush=True)

# the plaza round the ring: a lower paved apron with planters; lamps only on the walkways between places
AP = 2.5
E = 1.5 * SL
bx(-E - AP, E + AP, -E - AP, E + AP, -0.95, -0.62, apron_pavers, 0.02, "apron")
for (x, y) in [(sx * 6, sy * 6) for sx in (1, -1) for sy in (1, -1)] + [(6 * sx, 17.0 * sy) for sx in (1, -1) for sy in (1, -1)] + [(17.0 * sx, 6 * sy) for sx in (1, -1) for sy in (1, -1)]:
    lamp(x, y)
planter_box = flat("planter_concrete", (0.3, 0.3, 0.31), 0.8)
hedge_src = [o for o in P["hedge"]]
for i, (x, y) in enumerate([(t, -E - 1.25) for t in (-12, 0, 12)] + [(E + 1.25, t) for t in (-12, 0, 12)]):
    along = abs(y) > abs(x)
    w2, d2 = (1.6, 0.7) if along else (0.7, 1.6)
    if along:
        bx(x - w2, x + w2, y - d2 / 2 - 0.05, y + d2 / 2 + 0.05, -0.62, -0.1, planter_box, 0.03, "planter")
    else:
        bx(x - w2 / 2 - 0.05, x + w2 / 2 + 0.05, y - d2, y + d2, -0.62, -0.1, planter_box, 0.03, "planter")
    for k in range(5):
        h_ = hedge_src[(i * 5 + k) % len(hedge_src)].copy()
        coll.objects.link(h_)
        off = (k - 2) * 0.62
        h_.location = (x + (off if along else 0), y + (0 if along else off), -0.12)
        h_.scale = (h_.scale.x * 0.95, h_.scale.y * 0.95, h_.scale.z * 0.7)

# the planet round the colony: a terrain skirt, flat at the apron and rolling away, faded out at the frame's edge


def terrain_z(x, y):
    lift = max(0.0, (max(abs(x), abs(y)) - 23.5) / 14.0)
    return -0.97 + lift ** 1.4 * 1.6 * P["noise"].noise(Vector((x * 0.045, y * 0.045, 0.3))) + lift ** 1.2 * 0.25 * P["noise"].noise(Vector((x * 0.2, y * 0.2, 1.7)))


N_ = 140
size = 150.0
tv, tf = [], []
for j in range(N_ + 1):
    for i in range(N_ + 1):
        x, y = -size / 2 + size * i / N_, -size / 2 + size * j / N_
        tv.append((x, y, terrain_z(x, y)))
for j in range(N_):
    for i in range(N_):
        a0 = j * (N_ + 1) + i
        tf.append((a0, a0 + 1, a0 + N_ + 2, a0 + N_ + 1))
terrain = mesh_obj("terrain", tv, tf, terrain_mat, smooth=True)
rng = random.Random(9)
placed = 0
while placed < 16:
    x, y = rng.uniform(-48, 48), rng.uniform(-48, 48)
    if max(abs(x), abs(y)) < 26:
        continue
    u, v = 0.7071 * (x + y) / 30.0, 0.3536 * (y - x) / 17.0
    if math.hypot(u, v) > 0.85 or (x > 0 and y < 0 and math.hypot(u, v) < 0.6):
        continue  # inside the fade, and not standing in front of the buildings
    t = P["trees"][0].copy()
    coll.objects.link(t)
    s_ = rng.uniform(3.5, 6.0) / P["trees"][0].dimensions.z * P["trees"][0].scale.z
    t.scale = (s_, s_, s_)
    t.rotation_euler = (0, 0, rng.uniform(0, 6.28))
    t.location = (x, y, terrain_z(x, y) - 0.08)
    SKIRT.append(t)
    placed += 1
for k in range(60):
    x, y = rng.uniform(-45, 45), rng.uniform(-45, 45)
    if max(abs(x), abs(y)) < 24.5 or math.hypot(0.7071 * (x + y) / 30.0, 0.3536 * (y - x) / 17.0) > 0.8:
        continue
    r = P["rock"].copy()
    coll.objects.link(r)
    sc = rng.uniform(0.3, 1.0) * P["rock"].scale.x
    r.scale = (sc, sc, sc * 0.6)
    r.rotation_euler = (rng.uniform(0, 0.5), rng.uniform(1.2, 1.9), rng.uniform(0, 6))
    r.location = (x, y, terrain_z(x, y) - 0.1)
    SKIRT.append(r)

# ---------- props for life: an ambulance at the hospital canopy, a rover and crates at the spaceport ----------


def wheel(x, y, z, r, w, along_x):
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=r, depth=w, location=(x, y, z))
    o = bpy.context.active_object
    o.rotation_euler = (math.pi / 2, 0, 0) if along_x else (0, math.pi / 2, 0)
    o.data.materials.append(P["tyre"])
    o.data.shade_smooth()


P["tyre"] = flat("tyre", (0.03, 0.03, 0.03), 0.8)
amb_white = flat("ambulance_white", (0.88, 0.88, 0.86), 0.35)
amb_red = accent("ambulance_red", (0.8, 0.05, 0.04), rough=0.35)
ax_, ay_ = 1.6, -12.0 - 3.95 - 1.1  # beside the hospital canopy
bx(ax_ - 2.1, ax_ + 1.2, ay_ - 0.9, ay_ + 0.9, ZT + 0.3, ZT + 2.3, amb_white, 0.06, "ambulance_box")
bx(ax_ + 1.2, ax_ + 2.1, ay_ - 0.85, ay_ + 0.85, ZT + 0.3, ZT + 1.55, amb_white, 0.08, "ambulance_cab")
bx(ax_ + 1.25, ax_ + 2.05, ay_ - 0.86, ay_ + 0.86, ZT + 1.1, ZT + 1.5, glass, 0.02, "ambulance_windscreen")
bx(ax_ - 2.12, ax_ + 2.12, ay_ - 0.92, ay_ + 0.92, ZT + 0.95, ZT + 1.2, amb_red, 0.0, "ambulance_stripe")
bx(ax_ + 0.6, ax_ + 1.15, ay_ - 0.5, ay_ + 0.5, ZT + 2.3, ZT + 2.42, accent("ambulance_lightbar", (0.1, 0.3, 1.0), glow=6.0), 0.01, "lightbar")
for wx in (ax_ - 1.4, ax_ + 1.5):
    for wy in (ay_ - 0.85, ay_ + 0.85):
        wheel(wx, wy, ZT + 0.36, 0.36, 0.25, True)
rover_body = accent("rover_white", (0.82, 0.83, 0.85), rough=0.4)
rx_, ry_ = 3.6, 12.0 - 4.4  # south-east corner of the spaceport place, clear of the hall from this camera
bx(rx_ - 1.6, rx_ + 1.6, ry_ - 0.95, ry_ + 0.95, ZT + 0.75, ZT + 1.5, rover_body, 0.08, "rover_body")
bx(rx_ + 0.4, rx_ + 1.5, ry_ - 0.8, ry_ + 0.8, ZT + 1.5, ZT + 2.1, glass, 0.08, "rover_cabin")
bx(rx_ - 1.62, rx_ + 1.62, ry_ - 0.97, ry_ + 0.97, ZT + 1.0, ZT + 1.15, accent("rover_orange", (0.95, 0.38, 0.04)), 0.0, "rover_stripe")
cyl("rover_mast", rx_ - 1.1, ry_ + 0.5, 0.04, ZT + 1.5, ZT + 2.6, darkmetal, 8)
cyl("rover_dish", rx_ - 1.1, ry_ + 0.5, 0.3, ZT + 2.6, ZT + 2.66, whitemetal, 20)
for k, wx in enumerate((rx_ - 1.1, rx_, rx_ + 1.1)):
    for wy in (ry_ - 1.05, ry_ + 1.05):
        wheel(wx, wy, ZT + 0.45, 0.45, 0.35, True)
crate_mats = [flat("crate_grey", (0.42, 0.44, 0.46), 0.5, 0.3), accent("crate_orange", (0.9, 0.42, 0.06)), flat("crate_green", (0.2, 0.32, 0.22), 0.6)]
crng = random.Random(3)
for k, (dx, dy, dz) in enumerate([(0, 0, 0), (1.15, 0.1, 0), (0.55, 1.0, 0), (0.1, 0.05, 1.0), (2.3, -0.2, 0), (1.2, 1.05, 0)]):
    x, y = 4.0 + dx * 0.8, 9.8 + dy
    sz = crng.uniform(0.85, 1.05)
    c = bx(x - sz / 2, x + sz / 2, y - sz / 2, y + sz / 2, ZT + dz, ZT + dz + sz * 0.9, crate_mats[k % 3], 0.03, "crate")
FORECOURT_TREES = []
# a few of the park's trees on the forecourts, so the hard ring has some green (instances: free in Cycles)
for (x, y, h, r) in ((-4.3, 4.3, 4.6, 0.4), (-4.4, -16.4, 4.2, 1.7), (16.3, -16.2, 4.4, 2.9), (-16.6, -4.6, 4.0, 0.9), (-7.3, 4.6, 3.6, 2.2)):
    t = P["trees"][0].copy()
    coll.objects.link(t)
    s_ = h / P["trees"][0].dimensions.z * P["trees"][0].scale.z
    t.scale = (s_, s_, s_)
    t.rotation_euler = (0, 0, r)
    t.location = (x, y, ZT - 0.02)
    FORECOURT_TREES.append(t)
    cyl("tree_pit", x, y, 0.75, ZT - 0.01, ZT + 0.04, P["soil"], 32)

cam.data.ortho_scale = 2 * (E + 3.5) * math.sqrt(2) * 1.04
scene.camera = cam

if WHAT == "colony":
    render_setup((1920, 1080), PCT)
    shoot("colony")

if WHAT == "rt":
    # ======== the real-time colony: the park's own phone build, plus the ring's buildings merged per building ========
    colony_view("dusk")  # signs exported lit, like the park's globes; the page dims them by day
    for o in list(PARK_OBJS) + FORECOURT_TREES:  # forecourt trees: 1.6 M triangles each; the phone keeps only the park's two
        if o.name in scene.objects:
            bpy.data.objects.remove(o)
    for o in list(scene.objects):
        if o.type in ("LIGHT", "CAMERA") or o.name.startswith("tree_pit"):
            bpy.data.objects.remove(o)
    # per-bay random lighting is procedural and does not travel: the glass exports evenly lit at dusk strength,
    # like the signs and globes; the page scales window_glass's emissive down to 0 by day
    gnt = glass.node_tree
    gb = gnt.nodes["Principled BSDF"]
    for l in list(gb.inputs["Emission Strength"].links):
        gnt.links.remove(l)
    gb.inputs["Emission Strength"].default_value = 0.6
    gl_ = globe.node_tree
    gl_.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 6.0
    gl_.links.new(gl_.nodes["Principled BSDF"].outputs[0], gl_.nodes["Material Output"].inputs["Surface"])
    pm = bpy.data.materials["pitch"]
    pb = pm.node_tree.nodes["Principled BSDF"]
    for l in list(pb.inputs["Base Color"].links):
        pm.node_tree.links.remove(l)
    pb.inputs["Base Color"].default_value = (0.13, 0.3, 0.08, 1)
    for o in scene.objects:
        if o.type == "MESH" and o not in GROUP:
            GROUP[o] = "lamp_globes" if o.name.startswith("lamp_globe") else "plaza"
        elif o.type == "MESH" and o.name.startswith("lamp_globe"):
            GROUP[o] = "lamp_globes"
    deps = bpy.context.evaluated_depsgraph_get()
    flat_ = {}
    cutters = [o for o in scene.objects if o.type == "MESH" and o.hide_render]  # boolean cutters: evaluated with, never exported
    for o in list(scene.objects):
        if o.type != "MESH" or o in cutters:
            continue
        g = GROUP.get(o, "plaza")
        me_ = bpy.data.meshes.new_from_object(o.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
        me_.transform(o.matrix_world)
        while len(me_.uv_layers) > 1:
            me_.uv_layers.remove(me_.uv_layers[-1])
        if me_.uv_layers:
            me_.uv_layers[0].name = "UVMap"
        for c in list(me_.color_attributes):
            me_.color_attributes.remove(c)
        n = bpy.data.objects.new(g, me_)
        coll.objects.link(n)
        flat_.setdefault(g, []).append(n)
        bpy.data.objects.remove(o)
    for o in cutters:
        bpy.data.objects.remove(o)
    for g, objs in flat_.items():
        for o in scene.objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        bpy.context.view_layer.objects.active.name = g
    # the park: its phone build, moved to its place
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, "park_rt.glb"))
    for o in set(scene.objects) - before:
        if o.parent is None:
            o.location.x += SL
        o.name = "park_" + o.name
    for im in bpy.data.images:
        if im.size[0] and max(im.size) > 512 and im.type == "IMAGE":
            im.scale(512, 512)
    for mname in ("facade_concrete", "metal_cladding", "roof_plant", "forecourt_pavers", "plaza_pavers", "launch_pad"):
        m = bpy.data.materials.get(mname)
        if m:
            b = m.node_tree.nodes["Principled BSDF"]
            for k in ("Roughness", "Metallic"):
                for l in list(b.inputs[k].links):
                    m.node_tree.links.remove(l)
            b.inputs["Roughness"].default_value = 0.75
            b.inputs["Metallic"].default_value = 0.0
    meshes = [o for o in scene.objects if o.type == "MESH"]
    dc = sum(len(o.data.materials) or 1 for o in meshes)
    print(f"SPIKE colony rt tris drawn: {P['tris'](meshes)}; draw calls ~{dc}; " + "; ".join(f"{o.name} {P['tris']([o])}" for o in sorted(meshes, key=lambda o: o.name)), flush=True)
    glb = os.path.join(OUT, "colony_rt.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_apply=True, export_image_format="AUTO", export_jpeg_quality=80,
                              export_cameras=False, export_lights=False)
    print(f"SPIKE exported {glb}: {os.path.getsize(glb) / 1e6:.2f} MB", flush=True)
