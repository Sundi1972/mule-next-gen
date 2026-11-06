"""
The quality spike's Park (park-spec.json), built in Blender from CC0 parts, then
  rendered with Cycles from the grounds' isometric angle, day and dusk -> out/park_day.png, out/park_dusk.png
  rebuilt for a phone and exported                                      -> out/park_rt.glb
Run: blender -b -P park.py -- <spike-dir> [samples=128] [views=day,dusk] [percent=100] [rt=1]
Metres; x east, y north, z up; one grounds place is a 12 m square.
"""
import json
import math
import os
import random
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector, noise

argv = sys.argv[sys.argv.index("--") + 1 :]
DIR = argv[0]
SAMPLES = int(argv[1]) if len(argv) > 1 else 128
VIEWS = argv[2].split(",") if len(argv) > 2 and argv[2] else ["day", "dusk"]
PCT = int(argv[3]) if len(argv) > 3 else 100
RT = (argv[4] != "0") if len(argv) > 4 else True
A = os.path.join(DIR, "assets")
T = os.path.join(A, "tex")
OUT = os.path.join(DIR, "out")
SPEC = json.load(open(os.path.join(DIR, "park-spec.json")))
TILE = SPEC["tile"]
HALF = TILE / 2
RIM = SPEC["slab"]["rim"]
INNER = HALF - RIM
PW = SPEC["paths"]["width"] / 2
PLAZA = SPEC["plaza"]["radius"]
POND = SPEC["pond"]
BED = SPEC["flowerBed"]
RIM_TOP = 0.05  # the paved rim stands a kerb's height above the lawn, so the lawn reads as set in
random.seed(7)
T0 = time.time()


def stamp(what):
    print(f"SPIKE t+{time.time() - T0:.0f}s {what}", flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection


# ---------- node helpers ----------

def node(nt, kind, **props):
    n = nt.nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def sock(n, name, out=True, kind=None):
    """Socket by name; Mix nodes repeat names per data type, so match the type too."""
    ss = n.outputs if out else n.inputs
    for s in ss:
        if s.name == name and s.enabled and (kind is None or s.type == kind):
            return s
    raise KeyError(f"{n.bl_idname}.{name}")


def link(nt, a, b):
    nt.links.new(a, b)


def feed(nt, s, v):
    if isinstance(v, bpy.types.NodeSocket):
        link(nt, v, s)
    else:
        s.default_value = v


def math_(nt, op, a, b=0.0, clamp=False):
    n = node(nt, "ShaderNodeMath", operation=op, use_clamp=clamp)
    feed(nt, n.inputs[0], a)
    feed(nt, n.inputs[1], b)
    return n.outputs[0]


def mix(nt, fac, a, b, blend="MIX"):
    n = node(nt, "ShaderNodeMix", data_type="RGBA", blend_type=blend)
    feed(nt, sock(n, "Factor", False, "VALUE"), fac)
    feed(nt, sock(n, "A", False, "RGBA"), a)
    feed(nt, sock(n, "B", False, "RGBA"), b)
    return sock(n, "Result", True, "RGBA")


IMAGES = {}


def img(path, data=False):
    if path not in IMAGES:
        im = bpy.data.images.load(path)
        if data:
            im.colorspace_settings.name = "Non-Color"
        IMAGES[path] = im
    return IMAGES[path]


def tex(nt, path, vec, data=False):
    n = node(nt, "ShaderNodeTexImage", image=img(path, data))
    link(nt, vec, n.inputs["Vector"])
    return n


def new_mat(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    return m, nt, nt.nodes["Principled BSDF"]


def uv_map(nt, size, rot=0.0):
    tc = node(nt, "ShaderNodeTexCoord")
    mp = node(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / size, 1 / size, 1)
    mp.inputs["Rotation"].default_value = (0, 0, rot)
    link(nt, tc.outputs["UV"], mp.inputs["Vector"])
    return mp.outputs["Vector"]


def pbr(name, folder, size, tint=(1, 1, 1), nstr=1.0, rough_add=0.0):
    """A Poly Haven texture set on world-metre UVs (see box_uv), so it scales right on any object."""
    m, nt, b = new_mat(name)
    d = os.path.join(T, folder)
    v = uv_map(nt, size)
    col = tex(nt, os.path.join(d, f"{folder}_diff_1k.jpg"), v).outputs["Color"]
    link(nt, mix(nt, 1.0, col, (*tint, 1), "MULTIPLY"), b.inputs["Base Color"])
    arm = tex(nt, os.path.join(d, f"{folder}_arm_1k.jpg"), v, True)
    sep = node(nt, "ShaderNodeSeparateColor")
    link(nt, arm.outputs["Color"], sep.inputs["Color"])
    link(nt, math_(nt, "ADD", sep.outputs[1], rough_add, True), b.inputs["Roughness"])
    nm = node(nt, "ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = nstr
    link(nt, tex(nt, os.path.join(d, f"{folder}_nor_gl_1k.jpg"), v, True).outputs["Color"], nm.inputs["Color"])
    link(nt, nm.outputs["Normal"], b.inputs["Normal"])
    return m


def shadow_see_through(nt, b):
    """Let shadow rays pass (and only them): sunlight reaches the pond bed, lamplight leaves the globe, no caustic noise."""
    out = nt.nodes["Material Output"]
    lp = node(nt, "ShaderNodeLightPath")
    tr = node(nt, "ShaderNodeBsdfTransparent")
    mx = node(nt, "ShaderNodeMixShader")
    link(nt, lp.outputs["Is Shadow Ray"], mx.inputs[0])
    link(nt, b.outputs[0], mx.inputs[1])
    link(nt, tr.outputs[0], mx.inputs[2])
    link(nt, mx.outputs[0], out.inputs["Surface"])


# ---------- mesh helpers ----------

def mesh_obj(name, verts, faces, mat=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    if mat:
        me.materials.append(mat)
    if smooth:
        me.shade_smooth()
    return o


def box_uv(o, rot=0.0):
    """UVs in world metres, projected along each face's main axis, so tiled textures keep one scale everywhere."""
    me = o.data
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.verify()
    mw = o.matrix_world
    c, s = math.cos(rot), math.sin(rot)
    for f in bm.faces:
        n = mw.to_3x3() @ f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            p = mw @ l.vert.co
            u, v = [(p.y, p.z), (p.x, p.z), (p.x, p.y)][ax]
            l[uv].uv = (c * u - s * v, s * u + c * v)
    bm.to_mesh(me)
    bm.free()


def block(name, x0, x1, y0, y1, z0, z1, mat, bevel=0.02):
    v = [(x, y, z) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    f = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    o = mesh_obj(name, v, f, mat)
    box_uv(o)
    if bevel:
        bv = o.modifiers.new("bevel", "BEVEL")
        bv.width = bevel
        bv.segments = 2
    return o


def load(asset):
    """Import a Poly Haven glTF once; returns its mesh objects (templates to copy)."""
    folder = os.path.join(A, asset)
    gltf = next(f for f in os.listdir(folder) if f.endswith(".gltf"))
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(folder, gltf))
    new = [o for o in bpy.data.objects if o not in before]
    bpy.context.view_layer.update()
    meshes = [o for o in new if o.type == "MESH"]
    for o in meshes:
        # bake the file's node transforms into the mesh: copies then scale from 1, not from the file's 0.01 or 100
        mw = o.matrix_world.copy()
        o.parent = None
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
        o.rotation_mode = "XYZ"  # glTF imports in quaternions, which would silently ignore rotation_euler
    for o in [o for o in new if o.type != "MESH"]:
        bpy.data.objects.remove(o)
    return meshes


def bounds(objs):
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


def place(tpl, at, z=0.0, rot=0.0, scale=(1, 1, 1), sink=0.0, extra_rot=(0, 0)):
    """A linked copy of a template, standing on z (its lowest point at z - sink), centred on `at`."""
    o = tpl.copy()
    coll.objects.link(o)
    o.matrix_world = Matrix.Identity(4)
    o.rotation_euler = Euler((extra_rot[0], extra_rot[1], rot))
    o.scale = scale
    lo, hi = bounds([o])
    o.location = (at[0] - (lo.x + hi.x) / 2, at[1] - (lo.y + hi.y) / 2, z - lo.z - sink)
    return o


def recentre(o):
    """Move a mesh's origin to the centre of its footprint at its lowest point, so place() can stand it anywhere."""
    me = o.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    off = np.array([(co[:, 0].min() + co[:, 0].max()) / 2, (co[:, 1].min() + co[:, 1].max()) / 2, co[:, 2].min()])
    me.vertices.foreach_set("co", (co - off).ravel())
    me.update()
    o.location = (0, 0, 0)


def mdims(o):
    co = np.empty(len(o.data.vertices) * 3)
    o.data.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    return Vector(np.ptp(co, 0).tolist())


def unlink(o):
    for c in o.users_collection:
        c.objects.unlink(o)


# ---------- layout geometry (shared by mesh, hair and shader) ----------

def gravel_d(x, y):
    """Signed distance to the gravel: plaza disc plus the four spokes (a cross the path width wide)."""
    return min(math.hypot(x, y) - PLAZA, min(abs(x), abs(y)) - PW)


def pond_edge(t):
    """The kidney's edge radius at local angle t. Local u runs along the NW-SE diagonal, v toward the NE corner;
    the hollow is a bite out of the -v side, the side facing the plaza, deep enough for the NE lamp to stand in it."""
    rx, ry = POND["rx"], POND["ry"]
    e = 1 / math.hypot(math.cos(t) / rx, math.sin(t) / ry)
    d = (t + math.pi / 2 + math.pi) % (2 * math.pi) - math.pi
    return e - 0.75 * math.exp(-((d / 0.55) ** 2))


def pond_xy(t, r):
    """World point at local angle t, r times the edge radius out from the pond centre."""
    (cx, cy) = POND["center"]
    q = pond_edge(t) * r
    u, v = q * math.cos(t), q * math.sin(t)
    return cx + (u + v) / math.sqrt(2), cy + (v - u) / math.sqrt(2)


def pond_r(x, y):
    (cx, cy) = POND["center"]
    dx, dy = x - cx, y - cy
    u, v = (dx - dy) / math.sqrt(2), (dx + dy) / math.sqrt(2)
    return math.hypot(u, v) / pond_edge(math.atan2(v, u))


def bed_r(x, y):
    return math.hypot(x - BED["center"][0], y - BED["center"][1])


# ---------- materials ----------

stone = pbr("rim_paving", "sandstone_blocks_08", 2.2, tint=(0.93, 0.93, 0.92))
kerb_stone = pbr("kerb_stone", "sandstone_blocks_08", 1.4, tint=(0.85, 0.84, 0.82))
plinth_stone = pbr("plinth_stone", "sandstone_blocks_08", 3.0, tint=(0.72, 0.72, 0.74), rough_add=-0.1)
pebble_bed = pbr("pond_bed", "clean_pebbles", 1.2, tint=(0.8, 0.78, 0.72))
rock_mat = None  # the pond stones reuse the meteorite's scan textures, set once it is loaded


def grass_color(nt, P):
    """Two photo lawns blended by a slow noise, patchy brightness, faint mowing stripes: a lawn, not a flat colour."""
    m1 = node(nt, "ShaderNodeMapping")
    m1.inputs["Scale"].default_value = (1 / 1.5, 1 / 1.5, 1)
    link(nt, P, m1.inputs["Vector"])
    m2 = node(nt, "ShaderNodeMapping")
    m2.inputs["Scale"].default_value = (1 / 1.9, 1 / 1.9, 1)
    m2.inputs["Rotation"].default_value = (0, 0, 0.7)
    link(nt, P, m2.inputs["Vector"])
    g4 = tex(nt, os.path.join(T, "Grass004", "Grass004_1K-JPG_Color.jpg"), m1.outputs[0]).outputs["Color"]
    g1 = tex(nt, os.path.join(T, "Grass001", "Grass001_1K-JPG_Color.jpg"), m2.outputs[0]).outputs["Color"]
    nz = node(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 0.35
    nz.inputs["Detail"].default_value = 3
    link(nt, P, nz.inputs["Vector"])
    ramp = node(nt, "ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.38
    ramp.inputs["From Max"].default_value = 0.62
    link(nt, nz.outputs["Fac"], ramp.inputs["Value"])
    c = mix(nt, ramp.outputs[0], g4, g1)
    nz2 = node(nt, "ShaderNodeTexNoise")
    nz2.inputs["Scale"].default_value = 1.1
    link(nt, P, nz2.inputs["Vector"])
    br = node(nt, "ShaderNodeMapRange")
    br.inputs["To Min"].default_value = 0.82
    br.inputs["To Max"].default_value = 1.12
    link(nt, nz2.outputs["Fac"], br.inputs["Value"])
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, P, sep.inputs[0])
    stripe = math_(nt, "SIGN", math_(nt, "SINE", math_(nt, "MULTIPLY", sep.outputs["X"], math.pi / 1.1)))
    k = math_(nt, "ADD", math_(nt, "MULTIPLY", stripe, 0.045), 1.0)
    k = math_(nt, "MULTIPLY", k, br.outputs[0])
    kk = node(nt, "ShaderNodeCombineColor")
    for i in range(3):
        link(nt, k, kk.inputs[i])
    return mix(nt, 1.0, c, kk.outputs[0], "MULTIPLY")


def ground_mat():
    m, nt, b = new_mat("ground")
    P = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    lt_ = node(nt, "ShaderNodeRGB")
    lt_.name = "lawn_tint"  # (1,1,1) for Cycles, where hair blades cover the ground; the real-time bake darkens it to match
    lt_.outputs[0].default_value = (1, 1, 1, 1)
    grass = mix(nt, 1.0, grass_color(nt, P), lt_.outputs[0], "MULTIPLY")
    gm = node(nt, "ShaderNodeMapping")
    gm.inputs["Scale"].default_value = (0.5, 0.5, 1)
    link(nt, P, gm.inputs["Vector"])
    gd = os.path.join(T, "gravel_floor_02")
    gcol = tex(nt, os.path.join(gd, "gravel_floor_02_diff_1k.jpg"), gm.outputs[0]).outputs["Color"]
    gcol = mix(nt, 1.0, gcol, (1.08, 1.05, 1.0, 1), "MULTIPLY")
    garm = node(nt, "ShaderNodeSeparateColor")
    link(nt, tex(nt, os.path.join(gd, "gravel_floor_02_arm_1k.jpg"), gm.outputs[0], True).outputs[0], garm.inputs[0])
    # gravel mask, the same signed distance as gravel_d() plus a ragged noise edge
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, P, sep.inputs[0])
    ax, ay = math_(nt, "ABSOLUTE", sep.outputs["X"]), math_(nt, "ABSOLUTE", sep.outputs["Y"])
    cross = math_(nt, "SUBTRACT", math_(nt, "MINIMUM", ax, ay), PW)
    cxy = node(nt, "ShaderNodeCombineXYZ")
    link(nt, sep.outputs["X"], cxy.inputs["X"])
    link(nt, sep.outputs["Y"], cxy.inputs["Y"])
    ln = node(nt, "ShaderNodeVectorMath", operation="LENGTH")
    link(nt, cxy.outputs[0], ln.inputs[0])
    plaza = math_(nt, "SUBTRACT", ln.outputs["Value"], PLAZA)
    d = math_(nt, "MINIMUM", cross, plaza)
    en = node(nt, "ShaderNodeTexNoise")
    en.inputs["Scale"].default_value = 7.0
    en.inputs["Detail"].default_value = 5
    link(nt, P, en.inputs["Vector"])
    d = math_(nt, "ADD", d, math_(nt, "MULTIPLY", math_(nt, "SUBTRACT", en.outputs["Fac"], 0.5), 0.09))
    mr = node(nt, "ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = -0.015
    mr.inputs["From Max"].default_value = 0.015
    mr.inputs["To Min"].default_value = 1.0
    mr.inputs["To Max"].default_value = 0.0
    link(nt, d, mr.inputs["Value"])
    mask = mr.outputs[0]
    link(nt, mix(nt, mask, grass, gcol), b.inputs["Base Color"])
    link(nt, math_(nt, "ADD", math_(nt, "MULTIPLY", mask, math_(nt, "SUBTRACT", garm.outputs[1], 0.85)), 0.85), b.inputs["Roughness"])
    gn = node(nt, "ShaderNodeNormalMap")
    link(nt, tex(nt, os.path.join(gd, "gravel_floor_02_nor_gl_1k.jpg"), gm.outputs[0], True).outputs[0], gn.inputs["Color"])
    ln_ = node(nt, "ShaderNodeNormalMap")
    gm2 = node(nt, "ShaderNodeMapping")
    gm2.inputs["Scale"].default_value = (1 / 1.5, 1 / 1.5, 1)
    link(nt, P, gm2.inputs["Vector"])
    link(nt, tex(nt, os.path.join(T, "Grass004", "Grass004_1K-JPG_NormalGL.jpg"), gm2.outputs[0], True).outputs[0], ln_.inputs["Color"])
    nmix = node(nt, "ShaderNodeMix", data_type="VECTOR")
    link(nt, mask, sock(nmix, "Factor", False, "VALUE"))
    link(nt, ln_.outputs[0], sock(nmix, "A", False, "VECTOR"))
    link(nt, gn.outputs[0], sock(nmix, "B", False, "VECTOR"))
    link(nt, sock(nmix, "Result", True, "VECTOR"), b.inputs["Normal"])
    return m


def hair_mat():
    m, nt, b = new_mat("grass_blades")
    P = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    hi = node(nt, "ShaderNodeHairInfo")
    tip = node(nt, "ShaderNodeMapRange")
    tip.inputs["To Min"].default_value = 0.7
    tip.inputs["To Max"].default_value = 1.3
    link(nt, hi.outputs["Intercept"], tip.inputs["Value"])
    g = mix(nt, 1.0, grass_color(nt, P), (1.0, 1.04, 0.92, 1), "MULTIPLY")
    t3 = node(nt, "ShaderNodeCombineColor")
    for i in range(3):
        link(nt, tip.outputs[0], t3.inputs[i])
    link(nt, mix(nt, 1.0, g, t3.outputs[0], "MULTIPLY"), b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.55
    b.inputs["Subsurface Weight"].default_value = 0.0
    return m


def soil_mat():
    m, nt, b = new_mat("soil")
    nz = node(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 40
    nz.inputs["Detail"].default_value = 6
    r = node(nt, "ShaderNodeValToRGB")
    r.color_ramp.elements[0].color = (0.035, 0.022, 0.014, 1)
    r.color_ramp.elements[1].color = (0.11, 0.075, 0.05, 1)
    link(nt, nz.outputs["Fac"], r.inputs["Fac"])
    link(nt, r.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.95
    bp = node(nt, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.6
    link(nt, nz.outputs["Fac"], bp.inputs["Height"])
    link(nt, bp.outputs["Normal"], b.inputs["Normal"])
    return m


def water_mat():
    m, nt, b = new_mat("water")
    b.inputs["Base Color"].default_value = (1, 1, 1, 1)
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["IOR"].default_value = 1.333
    b.inputs["Roughness"].default_value = 0.02
    nz = node(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 3.5
    nz.inputs["Detail"].default_value = 4
    bp = node(nt, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.08
    link(nt, nz.outputs["Fac"], bp.inputs["Height"])
    link(nt, bp.outputs["Normal"], b.inputs["Normal"])
    shadow_see_through(nt, b)
    ab = node(nt, "ShaderNodeVolumeAbsorption")
    ab.inputs["Color"].default_value = (0.42, 0.62, 0.55, 1)
    ab.inputs["Density"].default_value = 6.0
    # absorption only: adding volume scatter overflows Cycles' 64-closure limit and it silently drops closures
    link(nt, ab.outputs[0], nt.nodes["Material Output"].inputs["Volume"])
    return m


def metal_mat():
    m, nt, b = new_mat("lamp_post")
    b.inputs["Base Color"].default_value = (0.03, 0.032, 0.035, 1)
    b.inputs["Metallic"].default_value = 0.85
    b.inputs["Roughness"].default_value = 0.38
    return m


def globe_mat():
    m, nt, b = new_mat("lamp_globe")
    b.inputs["Base Color"].default_value = (0.95, 0.92, 0.85, 1)
    b.inputs["Roughness"].default_value = 0.25
    b.inputs["Transmission Weight"].default_value = 0.5
    b.inputs["Emission Color"].default_value = (1.0, 0.5, 0.2, 1)
    b.inputs["Emission Strength"].default_value = 0.0
    # lit, the globe is pure emission: as a lit surface it would also catch its own point light 16 cm away and burn white
    em = node(nt, "ShaderNodeEmission")
    em.name = "glow"
    em.inputs["Color"].default_value = (1.0, 0.55, 0.24, 1)
    mx = node(nt, "ShaderNodeMixShader")
    mx.name = "lit"
    mx.inputs[0].default_value = 0.0
    link(nt, b.outputs[0], mx.inputs[1])
    link(nt, em.outputs[0], mx.inputs[2])
    shadow_see_through(nt, mx)
    return m


ground = ground_mat()
grass_blades = hair_mat()
soil = soil_mat()
water = water_mat()
metal = metal_mat()
globe = globe_mat()

# ---------- the slab: a paved rim (cut by the four paths) and stone sides ----------

ZB = -SPEC["slab"]["thickness"]
for y0, y1 in [(INNER, HALF), (-HALF, -INNER)]:  # north and south strips run the full width
    block("rim", -HALF, -PW, y0, y1, ZB, RIM_TOP, stone)
    block("rim", PW, HALF, y0, y1, ZB, RIM_TOP, stone)
    block("rim_gap", -PW, PW, y0, y1, ZB, -0.004, stone, bevel=0)  # the gravel runs out to the edge here
for x0, x1 in [(INNER, HALF), (-HALF, -INNER)]:  # east and west strips sit between them
    block("rim", x0, x1, -INNER, -PW, ZB, RIM_TOP, stone)
    block("rim", x0, x1, PW, INNER, ZB, RIM_TOP, stone)
    block("rim_gap", x0, x1, -PW, PW, ZB, -0.004, stone, bevel=0)

# ---------- the ground: one fine grid, lawn and gravel told apart by the shader ----------

N = 240
step = TILE / N


def keep_face(cx, cy):
    if (abs(cx) > INNER or abs(cy) > INNER) and min(abs(cx), abs(cy)) > PW:
        return False  # under the raised rim
    if pond_r(cx, cy) < 1.03:
        return False
    if bed_r(cx, cy) < BED["radius"] + 0.06:
        return False
    return True


vid = {}
verts, faces = [], []


def vi(i, j):
    if (i, j) not in vid:
        vid[(i, j)] = len(verts)
        verts.append((-HALF + i * step, -HALF + j * step, 0.0))
    return vid[(i, j)]


for j in range(N):
    for i in range(N):
        cx, cy = -HALF + (i + 0.5) * step, -HALF + (j + 0.5) * step
        if keep_face(cx, cy):
            faces.append((vi(i, j), vi(i + 1, j), vi(i + 1, j + 1), vi(i, j + 1)))
lawn = mesh_obj("ground", verts, faces, ground)
lawn.data.materials.append(grass_blades)
uvl = lawn.data.uv_layers.new(name="UVMap")
for l in lawn.data.loops:
    x, y, _ = lawn.data.vertices[l.vertex_index].co
    uvl.data[l.index].uv = ((x + HALF) / TILE, (y + HALF) / TILE)

# grass blades: density 1 on lawn, 0 on gravel, near the pond and inside the rim
vg = lawn.vertex_groups.new(name="grass")
for v in lawn.data.vertices:
    x, y, _ = v.co
    w = max(0.0, min(1.0, (gravel_d(x, y) - 0.01) / 0.05))
    if abs(x) > INNER - 0.02 or abs(y) > INNER - 0.02 or pond_r(x, y) < 1.08 or bed_r(x, y) < BED["radius"] + 0.1:
        w = 0.0
    vg.add([v.index], w, "REPLACE")

lawn.modifiers.new("grass", "PARTICLE_SYSTEM")
ps = lawn.particle_systems[0]
ps.vertex_group_density = "grass"
ps.seed = 3
pset = ps.settings
pset.type = "HAIR"
pset.count = 30000
pset.hair_length = 0.065
pset.hair_step = 3
pset.render_step = 2
pset.use_advanced_hair = True
pset.factor_random = 0.025
pset.child_type = "INTERPOLATED"
pset.rendered_child_count = 14
pset.child_percent = 1
pset.child_length_threshold = 0.45
pset.roughness_endpoint = 0.012
pset.roughness_end_shape = 1.0
pset.roughness_1 = 0.004
pset.radius_scale = 0.0018
pset.root_radius = 1.0
pset.tip_radius = 0.15
pset.material_slot = "grass_blades"
try:
    scene.cycles_curves.shape = "RIBBONS"
except AttributeError:
    pass

# ---------- plaza monument: a meteorite stood on end on a round plinth ----------

mo = SPEC["monument"]
pl = mo["plinth"]
seg = 72
pv = [(pl["radius"] * math.cos(2 * math.pi * k / seg), pl["radius"] * math.sin(2 * math.pi * k / seg), z) for z in (-0.05, pl["height"]) for k in range(seg)]
pf = [tuple(range(seg))[::-1], tuple(range(seg, 2 * seg))] + [(k, (k + 1) % seg, seg + (k + 1) % seg, seg + k) for k in range(seg)]
plinth = mesh_obj("plinth", pv, pf, plinth_stone)
box_uv(plinth)
bv = plinth.modifiers.new("bevel", "BEVEL")
bv.width = 0.03
bv.segments = 3
bv.limit_method = "ANGLE"
plinth.data.shade_smooth()
plinth.modifiers.new("wn", "WEIGHTED_NORMAL").keep_sharp = True

rock_tpl = load(mo["asset"])[0]
lo, hi = bounds([rock_tpl])
long_axis = max(range(3), key=lambda i: hi[i] - lo[i])
s = mo["height"] / (hi[long_axis] - lo[long_axis])
# stood on its longest axis: a meteorite on end reads as a monument, lying flat it reads as a boulder
rock = place(rock_tpl, mo["center"], z=pl["height"], rot=0.6, scale=(s, s, s), sink=0.04, extra_rot=(0, math.pi / 2 if long_axis == 0 else 0))
unlink(rock_tpl)
lo, hi = bounds([rock])
print("SPIKE monument rock size", tuple(round(v, 2) for v in (hi - lo)), flush=True)

rock_mat = rock_tpl.data.materials[0].copy()
rock_mat.name = "pond_stone"
# the scan textures on world-metre UVs, lightened toward a river stone
for n in rock_mat.node_tree.nodes:
    if n.bl_idname == "ShaderNodeTexImage":
        mp = node(rock_mat.node_tree, "ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (1 / 0.45, 1 / 0.45, 1)
        tc = node(rock_mat.node_tree, "ShaderNodeTexCoord")
        link(rock_mat.node_tree, tc.outputs["UV"], mp.inputs["Vector"])
        link(rock_mat.node_tree, mp.outputs[0], n.inputs["Vector"])
rb = rock_mat.node_tree.nodes["Principled BSDF"]
src = rb.inputs["Base Color"].links[0].from_socket
link(rock_mat.node_tree, mix(rock_mat.node_tree, 1.0, src, (1.6, 1.5, 1.35, 1), "MULTIPLY"), rb.inputs["Base Color"])
# the monument itself darkened to a meteorite's iron-black crust, so it reads against the pale plinth
mm = rock.data.materials[0]
mb = mm.node_tree.nodes["Principled BSDF"]
link(mm.node_tree, mix(mm.node_tree, 1.0, mb.inputs["Base Color"].links[0].from_socket, (0.42, 0.38, 0.35, 1), "MULTIPLY"), mb.inputs["Base Color"])

# ---------- the pond: a stone-ringed bowl, pebbles under clear water ----------

DEPTH, WATER_Z = 0.42, -0.07
rings = [0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.82, 0.9, 0.96, 1.0, 1.1]
segs = 96
bv_, bf = [], []
for r in rings:
    z = -DEPTH * (1 - min(r, 1.0) ** 2.2)
    for k in range(segs):
        a = 2 * math.pi * k / segs
        bv_.append((*pond_xy(a, r), z))
for ri in range(len(rings) - 1):
    for k in range(segs):
        a, b2 = ri * segs + k, ri * segs + (k + 1) % segs
        bf.append((a, b2, b2 + segs, a + segs))
bowl = mesh_obj("pond_bowl", bv_, bf, pebble_bed, smooth=True)
box_uv(bowl)

wv = [(*pond_xy(2 * math.pi * k / segs, 1.0), z) for z in (-DEPTH - 0.05, WATER_Z) for k in range(segs)]
wf = [tuple(range(segs))[::-1], tuple(range(segs, 2 * segs))] + [(k, (k + 1) % segs, segs + (k + 1) % segs, segs + k) for k in range(segs)]
water_obj = mesh_obj("water", wv, wf, water)


def pebble(name, a, b, c, seed):
    """A rounded field stone: an icosphere squashed to a b c, its surface lumped by noise."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    off = Vector((seed * 7.1, seed * 3.3, seed * 1.7))
    for v in bm.verts:
        p = v.co.copy()
        v.co = Vector((p.x * a, p.y * b, p.z * c)) * (1 + 0.12 * noise.noise(p * 1.4 + off))
        if v.co.z < -c * 0.35:
            v.co.z = -c * 0.35  # a flat base, so it sits rather than balances
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    coll.objects.link(o)
    me.materials.append(rock_mat)
    me.shade_smooth()
    return o


stones = []
# stones spaced by arc length, so the hollow is not crowded and the long sides not gappy
ring = [pond_xy(2 * math.pi * k / 720, 1.04) for k in range(721)]
arc = [0.0]
for p0, p1 in zip(ring, ring[1:]):
    arc.append(arc[-1] + math.dist(p0, p1))
n_st = round(arc[-1] / 0.31)
for k in range(n_st):
    target = arc[-1] * (k + random.uniform(-0.12, 0.12)) / n_st % arc[-1]
    i = next(i for i, L in enumerate(arc) if L >= target)
    i = max(1, min(i, 719))
    (x0, y0), (x1, y1) = ring[i - 1], ring[i + 1]
    x, y = pond_xy(2 * math.pi * i / 720, 1.04 + random.uniform(-0.02, 0.03))
    tang = math.atan2(y1 - y0, x1 - x0)
    sa = random.uniform(0.17, 0.24)
    o = pebble("pond_stone", sa, sa * random.uniform(0.7, 0.85), sa * random.uniform(0.5, 0.65), k)
    o.location = (x, y, random.uniform(-0.02, 0.01))
    o.rotation_euler = (random.uniform(-0.1, 0.1), random.uniform(-0.1, 0.1), tang + random.uniform(-0.3, 0.3))
    bpy.context.view_layer.update()
    box_uv(o)
    o.modifiers.new("smooth", "SUBSURF").levels = 1
    stones.append(o)

# ---------- the flower bed: kerb ring, dark soil, gazanias packed full ----------

bcx, bcy = BED["center"]
br_ = BED["radius"]
kv = []
segs = 96
for (r, z) in [(br_, -0.05), (br_ + 0.14, -0.05), (br_ + 0.14, 0.11), (br_, 0.11)]:
    for k in range(segs):
        a = 2 * math.pi * k / segs
        kv.append((bcx + r * math.cos(a), bcy + r * math.sin(a), z))
kf = []
for q in range(4):
    for k in range(segs):
        a0, a1 = q * segs + k, q * segs + (k + 1) % segs
        b0, b1 = ((q + 1) % 4) * segs + k, ((q + 1) % 4) * segs + (k + 1) % segs
        kf.append((a0, b0, b1, a1))
kerb = mesh_obj("bed_kerb", kv, kf, kerb_stone)
box_uv(kerb)
bv = kerb.modifiers.new("bevel", "BEVEL")
bv.width = 0.02
bv.segments = 2
bv.limit_method = "ANGLE"

sv = [(bcx, bcy, 0.04)] + [(bcx + (br_ + 0.01) * math.cos(2 * math.pi * k / segs), bcy + (br_ + 0.01) * math.sin(2 * math.pi * k / segs), 0.03) for k in range(segs)]
sf = [(0, 1 + k, 1 + (k + 1) % segs) for k in range(segs)]
bed_soil = mesh_obj("bed_soil", sv, sf, soil)

flower_tpls = load(BED["asset"])
for o in flower_tpls:
    recentre(o)
flower_tpls.sort(key=lambda o: len(o.data.polygons))
lush = flower_tpls[3:]  # the variants with open flowers; the first three are mostly leaf
flowers = []
sp = 0.17
for row in range(-10, 11):
    for col in range(-10, 11):
        x = col * sp + (row % 2) * sp / 2 + random.uniform(-0.04, 0.04)
        y = row * sp * 0.866 + random.uniform(-0.04, 0.04)
        if math.hypot(x, y) > br_ - 0.1:
            continue
        t = random.choice(lush if random.random() < 0.8 else flower_tpls)
        s = random.uniform(1.9, 2.4)
        flowers.append(place(t, (bcx + x, bcy + y), z=0.035, rot=random.uniform(0, 6.28), scale=(s, s, s), sink=0.01))
for o in flower_tpls:
    unlink(o)

# ---------- trees ----------

tree_tpl = load("island_tree_01")[0]
recentre(tree_tpl)
lo, hi = bounds([tree_tpl])
trees = []
for t in SPEC["trees"]:
    s = t["height"] / (hi.z - lo.z)
    o = tree_tpl.copy()
    coll.objects.link(o)
    o.scale = (s, s, s)
    o.rotation_euler = (0, 0, t.get("rotate", 0.0))
    o.location = (t["at"][0], t["at"][1], -0.02 * s)
    trees.append(o)
unlink(tree_tpl)

# ---------- hedge: shrub_01 split into its variants, six bushes per spot ----------

shrub_src = load(SPEC["hedge"]["asset"])[0]
me = shrub_src.data
co = np.empty(len(me.vertices) * 3)
me.vertices.foreach_get("co", co)
xs = np.sort(co.reshape(-1, 3)[:, 0])
cuts = [(xs[i] + xs[i + 1]) / 2 for i in np.where(np.diff(xs) > 0.03)[0]]
edges_ = [-1e9] + cuts + [1e9]
shrubs = []
for k in range(len(edges_) - 1):
    o = shrub_src.copy()
    o.data = shrub_src.data.copy()
    coll.objects.link(o)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not (edges_[k] < f.calc_center_median().x < edges_[k + 1])], context="FACES")
    bm.to_mesh(o.data)
    bm.free()
    if len(o.data.polygons) > 200:
        recentre(o)
        shrubs.append(o)
    else:
        bpy.data.objects.remove(o)
unlink(shrub_src)
print("SPIKE shrub variants:", [(len(o.data.polygons), tuple(round(d, 2) for d in mdims(o))) for o in shrubs], flush=True)

hedge = []
H = SPEC["hedge"]["height"]
spots = []
ts = [INNER - 0.55 - k * SPEC["hedge"]["spacing"] for k in range(9)]
ts = [t for t in ts if t > PW + 0.55] + [-t for t in ts if t > PW + 0.55]
for t in ts:
    spots.append((t, INNER - 0.42))  # north row
for t in ts:
    if t < INNER - 0.6:
        spots.append((-(INNER - 0.42), t))  # west row, its north end shared with the north row
big = sorted(shrubs, key=lambda o: -len(o.data.polygons))[:3]  # the full bushes; the rest are seedlings
for i, (x, y) in enumerate(spots):
    along_x = abs(y) > abs(x)
    # the asset is a 20-40 cm bush: six per spot, scaled to the hedge height, packed in two staggered rows so they read as one hedge
    pack = [(-0.36, -0.13), (0.0, -0.15), (0.36, -0.11), (-0.2, 0.12), (0.18, 0.13), (0.5, 0.1)]
    for j, (a, b) in enumerate(pack if i % 2 else [(-a, -b) for a, b in pack]):
        t = big[(i + j) % len(big)]
        d = mdims(t)
        s = H / d.z * random.uniform(0.85, 1.05)
        rot = random.uniform(0, 2 * math.pi)
        px, py = (x + a, y + b) if along_x else (x + b, y + a)
        hedge.append(place(t, (px, py), rot=rot, scale=(s * 1.2, s * 1.2, s)))
for o in shrubs:
    unlink(o)

# ---------- foliage lets light through: the scene is back-lit, so leaves must glow, not go black ----------

UNDO = []


def translucent(m, amount, bright):
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    out = nt.nodes["Material Output"]
    col = b.inputs["Base Color"].links[0].from_socket
    alpha = b.inputs["Alpha"].links[0].from_socket if b.inputs["Alpha"].is_linked else None
    tl = node(nt, "ShaderNodeBsdfTranslucent")
    lit = mix(nt, 1.0, col, (bright, bright, bright, 1), "MULTIPLY")
    link(nt, lit, b.inputs["Base Color"])
    link(nt, mix(nt, 1.0, lit, (0.9, 1.0, 0.55, 1), "MULTIPLY"), tl.inputs["Color"])
    m1 = node(nt, "ShaderNodeMixShader")
    m1.inputs[0].default_value = amount
    link(nt, b.outputs[0], m1.inputs[1])
    link(nt, tl.outputs[0], m1.inputs[2])
    last = m1.outputs[0]
    if alpha:
        m2 = node(nt, "ShaderNodeMixShader")
        link(nt, alpha, m2.inputs[0])
        link(nt, node(nt, "ShaderNodeBsdfTransparent").outputs[0], m2.inputs[1])
        link(nt, last, m2.inputs[2])
        last = m2.outputs[0]
    link(nt, last, out.inputs["Surface"])
    UNDO.append(lambda: (link(nt, b.outputs[0], out.inputs["Surface"]), link(nt, col, b.inputs["Base Color"])))


for mname, amount, bright in (("island_tree_01_leaves", 0.35, 1.25), ("shrub_01", 0.3, 1.1), ("flower_gazania", 0.2, 1.15)):
    translucent(bpy.data.materials[mname], amount, bright)

# ---------- benches, facing the plaza ----------

bench_tpl = load("painted_wooden_bench")[0]
recentre(bench_tpl)
blen = mdims(bench_tpl).x
benches = []
for b in SPEC["benches"]:
    dx, dy = -b["at"][0], -b["at"][1]
    rot = math.atan2(dx, -dy)  # the asset's seat faces -y
    # the asset is a hall settle (seat 0.65 m): stretched to a 1.8 m park bench and lowered to a 0.49 m seat
    benches.append(place(bench_tpl, b["at"], rot=rot, scale=(1.8 / blen, 1.0, 0.75)))
unlink(bench_tpl)

# ---------- lamps ----------

LH = SPEC["lamps"]["height"]
GR = 0.16
lamp_parts, globes, lamp_lights = [], [], []


def cyl(name, x, y, r, z0, z1, mat, seg=24):
    v = [(x + r * math.cos(2 * math.pi * k / seg), y + r * math.sin(2 * math.pi * k / seg), z) for z in (z0, z1) for k in range(seg)]
    f = [tuple(range(seg))[::-1], tuple(range(seg, 2 * seg))] + [(k, (k + 1) % seg, seg + (k + 1) % seg, seg + k) for k in range(seg)]
    o = mesh_obj(name, v, f, mat)
    bv = o.modifiers.new("bevel", "BEVEL")
    bv.width = min(0.008, r * 0.3)
    bv.segments = 2
    bv.limit_method = "ANGLE"
    o.data.shade_smooth()
    o.modifiers.new("wn", "WEIGHTED_NORMAL").keep_sharp = True
    return o


for (x, y) in SPEC["lamps"]["at"]:
    lamp_parts += [
        cyl("lamp_base", x, y, 0.085, -0.02, 0.22, metal),
        cyl("lamp_post", x, y, 0.032, 0.2, LH - 2 * GR - 0.02, metal, 16),
        cyl("lamp_collar", x, y, 0.07, LH - 2 * GR - 0.05, LH - 2 * GR + 0.01, metal),
        cyl("lamp_cap", x, y, 0.05, LH - 0.02, LH + 0.03, metal),
    ]
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=GR, location=(x, y, LH - GR))
    g = bpy.context.active_object
    g.name = "lamp_globe"
    g.data.materials.append(globe)
    g.data.shade_smooth()
    globes.append(g)
    bpy.ops.object.light_add(type="POINT", location=(x, y, LH - GR))
    L = bpy.context.active_object
    L.data.shadow_soft_size = GR * 0.8
    L.data.color = (1.0, 0.66, 0.36)
    lamp_lights.append(L)

# ---------- light and camera ----------

world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
wn = world.node_tree
env = node(wn, "ShaderNodeTexEnvironment", image=bpy.data.images.load(os.path.join(A, "sky_2k.hdr")))
# turned so the HDRI's sun sits behind the camera: the pond then mirrors open sky, not the glare round a sun it does not cast
emap = node(wn, "ShaderNodeMapping")
emap.inputs["Rotation"].default_value = (0, 0, math.pi)
link(wn, node(wn, "ShaderNodeTexCoord").outputs["Generated"], emap.inputs["Vector"])
link(wn, emap.outputs[0], env.inputs["Vector"])
# the HDRI's own sun (71k) is clamped out so the sun lamp alone sets direction and shadow
clamp = node(wn, "ShaderNodeVectorMath", operation="MINIMUM")
clamp.inputs[1].default_value = (6, 6, 6)
link(wn, env.outputs["Color"], clamp.inputs[0])
tint = node(wn, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
sock(tint, "Factor", False, "VALUE").default_value = 1.0
link(wn, clamp.outputs[0], sock(tint, "A", False, "RGBA"))
bg = wn.nodes["Background"]
link(wn, sock(tint, "Result", True, "RGBA"), bg.inputs["Color"])

bpy.ops.object.light_add(type="SUN")
sun = bpy.context.active_object


def set_sun(elev, az, energy, color, angle):
    s = Vector((math.cos(math.radians(elev)) * math.cos(math.radians(az)), math.cos(math.radians(elev)) * math.sin(math.radians(az)), math.sin(math.radians(elev))))
    sun.rotation_euler = s.to_track_quat("Z", "Y").to_euler()
    sun.data.energy = energy
    sun.data.color = color
    sun.data.angle = math.radians(angle)


bpy.ops.object.camera_add(location=(20, -20, 20 * math.tan(math.radians(30)) * math.sqrt(2)))
cam = bpy.context.active_object
cam.data.type = "ORTHO"
cam.data.ortho_scale = TILE * 1.75
cam.rotation_euler = (math.radians(60), 0, math.radians(45))
cam.data.clip_end = 200
scene.camera = cam


def view(name):
    gb = globe.node_tree.nodes["Principled BSDF"]
    if name == "day":
        # west-south-west (compass 250), the camera's left: lights the near-left faces and throws shadows back-right, like the SVG mock
        set_sun(35, 200, 5.0, (1.0, 0.89, 0.76), 2.5)
        bg.inputs["Strength"].default_value = 1.0
        sock(tint, "B", False, "RGBA").default_value = (1, 1, 1, 1)
        globe.node_tree.nodes["lit"].inputs[0].default_value = 0.0
        for L in lamp_lights:
            L.hide_render = True
        scene.view_settings.exposure = 0.3
    else:
        set_sun(5, 200, 2.6, (1.0, 0.42, 0.16), 1.5)
        bg.inputs["Strength"].default_value = 0.09
        sock(tint, "B", False, "RGBA").default_value = (0.55, 0.62, 1.0, 1)
        globe.node_tree.nodes["lit"].inputs[0].default_value = 1.0
        globe.node_tree.nodes["glow"].inputs["Strength"].default_value = 5.0
        for L in lamp_lights:
            L.hide_render = False
            L.data.energy = 70
        scene.view_settings.exposure = 0.6


# ---------- counts ----------

def tris(objs):
    deps = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in objs:
        if o.type == "MESH":
            e = o.evaluated_get(deps)
            m = e.to_mesh()
            n += sum(len(p.vertices) - 2 for p in m.polygons)
            e.to_mesh_clear()
    return n


meshes = [o for o in scene.objects if o.type == "MESH"]
print(f"SPIKE tris full scene (no grass blades): {tris(meshes)}; one tree: {tris(trees[:1])}; hedge: {tris(hedge)}; flowers: {tris(flowers)} ({len(flowers)} plants)", flush=True)

# ---------- render ----------

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
scene.cycles.transparent_max_bounces = 64  # stacked leaf cards need many, or the canopy turns black
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.render.film_transparent = True
scene.render.resolution_x = 1600
scene.render.resolution_y = 1200
scene.render.resolution_percentage = PCT
scene.view_settings.view_transform = "AgX"
for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
    try:
        scene.view_settings.look = look
        break
    except TypeError:
        pass

for v in VIEWS:
    view(v)
    scene.render.filepath = os.path.join(OUT, f"park_{v}.png")
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"SPIKE render {v} seconds: {time.time() - t0:.1f} at {SAMPLES} samples, {PCT}%", flush=True)

if not RT:
    sys.exit(0)

# =================== the real-time version ===================
# Same layout; what a phone cannot draw is replaced: hair grass and shader masks by a baked ground texture,
# the scanned tree and hedge by one textured card per leaf, the flower bed by a top-down render, the volume water by a surface.

view("dusk")  # lamps exported lit; the page dims them for day
for u in UNDO:
    u()
lawn.modifiers.remove(lawn.modifiers["grass"])
lawn.data.materials.pop(index=1)

stamp("rt start")
# bake the ground's albedo and normals into 1k maps on its 0..1 UVs
bake_dir = os.path.join(A, "baked")
os.makedirs(bake_dir, exist_ok=True)
nt = ground.node_tree
nt.nodes["lawn_tint"].outputs[0].default_value = (0.8, 0.86, 0.68, 1)
bake_imgs = {}
for kind in ("DIFFUSE", "NORMAL"):
    im = bpy.data.images.new(f"ground_{kind.lower()}", 1024, 1024)
    if kind == "NORMAL":
        im.colorspace_settings.name = "Non-Color"
    n = node(nt, "ShaderNodeTexImage", image=im)
    nt.nodes.active = n
    for o in scene.objects:
        o.select_set(False)
    lawn.select_set(True)
    bpy.context.view_layer.objects.active = lawn
    scene.cycles.samples = 16
    bpy.ops.object.bake(type=kind, pass_filter={"COLOR"} if kind == "DIFFUSE" else set(), margin=8, use_clear=True)
    im.filepath_raw = os.path.join(bake_dir, f"ground_{kind.lower()}.jpg")
    im.file_format = "JPEG"
    im.save()
    bake_imgs[kind] = im
    nt.nodes.remove(n)

stamp("ground baked")
rt_ground, gnt, gb = new_mat("ground_rt")
uvn = node(gnt, "ShaderNodeTexCoord").outputs["UV"]
link(gnt, tex(gnt, bake_imgs["DIFFUSE"].filepath_raw, uvn).outputs["Color"], gb.inputs["Base Color"])
gnm = node(gnt, "ShaderNodeNormalMap")
link(gnt, tex(gnt, bake_imgs["NORMAL"].filepath_raw, uvn, True).outputs["Color"], gnm.inputs["Color"])
link(gnt, gnm.outputs[0], gb.inputs["Normal"])
gb.inputs["Roughness"].default_value = 0.9
lawn.data.materials[0] = rt_ground
dis = lawn.modifiers.new("flat", "DECIMATE")
dis.decimate_type = "DISSOLVE"  # the flat ground collapses to its outline: thousands of quads become a few hundred triangles
dis.angle_limit = math.radians(1)

# water: a surface the page can give a reflector material
wm, wnt, wbsdf = new_mat("water_rt")
wbsdf.inputs["Base Color"].default_value = (0.02, 0.06, 0.065, 1)
wbsdf.inputs["Roughness"].default_value = 0.08
wbsdf.inputs["Specular IOR Level"].default_value = 0.3  # an env map alone (no local reflections) makes full-strength water read white
water_obj.data.materials[0] = wm
bm = bmesh.new()
bm.from_mesh(water_obj.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.normal.z < 0.9], context="FACES")
bm.to_mesh(water_obj.data)
bm.free()

stamp("before bed bake")
# the flower bed: its packed gazanias baked top-down onto the soil disc, so a few 3D plants on top read as a full bed
bed_soil.data.uv_layers.new(name="UVMap")
R = br_ + 0.01
for l in bed_soil.data.loops:
    x, y, _ = bed_soil.data.vertices[l.vertex_index].co
    bed_soil.data.uv_layers[0].data[l.index].uv = ((x - bcx) / (2 * R) + 0.5, (y - bcy) / (2 * R) + 0.5)
# a top-down render under a plain white sky: albedo with soft occlusion, neither day nor dusk light baked in
# (a selected-to-active bake does the same in 6 minutes; this takes seconds)
keep_vis = set(flowers + [bed_soil])
hidden = [o for o in scene.objects if o not in keep_vis and not o.hide_render]
for o in hidden:
    o.hide_render = True
white = bpy.data.worlds.new("white")
white.use_nodes = True
white.node_tree.nodes["Background"].inputs["Color"].default_value = (1, 1, 1, 1)
saved = (scene.world, scene.camera, scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure,
         scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage, scene.render.film_transparent, scene.cycles.samples)
scene.world = white
bpy.ops.object.camera_add(location=(bcx, bcy, 5))
top = bpy.context.active_object
top.data.type = "ORTHO"
top.data.ortho_scale = 2 * R
scene.camera = top
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0
scene.render.resolution_x = scene.render.resolution_y = 1024
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.cycles.samples = 64
bed_path = os.path.join(bake_dir, "flower_bed.jpg")
scene.render.image_settings.file_format = "JPEG"
scene.render.filepath = bed_path
bpy.ops.render.render(write_still=True)
scene.render.image_settings.file_format = "PNG"
(scene.world, scene.camera, scene.view_settings.view_transform, scene.view_settings.look, scene.view_settings.exposure,
 scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage, scene.render.film_transparent, scene.cycles.samples) = saved
bpy.data.objects.remove(top)
for o in hidden:
    o.hide_render = False
bed_img = img(bed_path)
fb, fnt, fbsdf = new_mat("flower_bed_rt")
link(fnt, tex(fnt, bed_img.filepath_raw, node(fnt, "ShaderNodeTexCoord").outputs["UV"]).outputs["Color"], fbsdf.inputs["Base Color"])
fbsdf.inputs["Roughness"].default_value = 0.85
bed_soil.data.materials[0] = fb
# a third of the plants stay as 3D, the tallest, for the bed's silhouette
flowers.sort(key=lambda o: -o.scale.x)
for o in flowers[len(flowers) // 3 :]:
    bpy.data.objects.remove(o)
flowers = flowers[: len(flowers) // 3]

# globes: plain emissive, strength the page can scale for bloom
gbn = globe.node_tree.nodes["Principled BSDF"]
gbn.inputs["Emission Strength"].default_value = 6.0
gbn.inputs["Transmission Weight"].default_value = 0.0
globe.node_tree.links.new(gbn.outputs[0], globe.node_tree.nodes["Material Output"].inputs["Surface"])

for o in stones:
    o.modifiers.clear()


def components(me, polys_mask):
    """Connected parts of the masked polygons (leaf cards), by label propagation over shared vertices."""
    nv = len(me.vertices)
    ls = np.empty(len(me.polygons), np.int64)
    lt = np.empty(len(me.polygons), np.int64)
    me.polygons.foreach_get("loop_start", ls)
    me.polygons.foreach_get("loop_total", lt)
    lv = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get("vertex_index", lv)
    pidx = np.where(polys_mask)[0]
    a_, b_ = [], []
    for k in range(lt.max()):
        sel = pidx[lt[pidx] > k]
        a_.append(lv[ls[sel] + k])
        b_.append(lv[ls[sel] + (k + 1) % lt[sel]])
    a_, b_ = np.concatenate(a_), np.concatenate(b_)
    lab = np.arange(nv)
    while True:
        m = np.minimum(lab[a_], lab[b_])
        old = lab.copy()
        np.minimum.at(lab, a_, m)
        np.minimum.at(lab, b_, m)
        for _ in range(4):
            lab = lab[lab]
        if np.array_equal(lab, old):
            break
    return lab, ls, lt, lv


def cards_lod(src, mat_index, keep, grow, rng, centre):
    """One quad per kept leaf card: fit the card's UV->3D affine map and draw its UV box flat. 24 triangles become 2."""
    me = src.data
    mi = np.empty(len(me.polygons), np.int64)
    me.polygons.foreach_get("material_index", mi)
    lab, ls, lt, lv = components(me, mi == mat_index)
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    uv = np.empty(len(me.loops) * 2)
    me.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    loops = np.concatenate([np.arange(ls[p], ls[p] + lt[p]) for p in np.where(mi == mat_index)[0]])
    part = lab[lv[loops]]
    order = np.argsort(part, kind="stable")
    loops, part = loops[order], part[order]
    starts = np.r_[0, np.where(np.diff(part))[0] + 1, len(part)]
    V, F, UV, NR = [], [], [], []
    for i in range(len(starts) - 1):
        if rng.random() > keep:
            continue
        L = loops[starts[i] : starts[i + 1]]
        P = co[lv[L]]
        U = uv[L]
        M = np.c_[U, np.ones(len(U))]
        X, *_ = np.linalg.lstsq(M, P, rcond=None)
        (u0, v0), (u1, v1) = U.min(0), U.max(0)
        q = np.array([[u0, v0, 1], [u1, v0, 1], [u1, v1, 1], [u0, v1, 1]]) @ X
        c = P.mean(0)
        q = c + (q - c) * grow
        n = np.cross(q[1] - q[0], q[3] - q[0])
        n /= np.linalg.norm(n) + 1e-9
        out = c - centre
        out /= np.linalg.norm(out) + 1e-9
        if n @ out < 0:
            n = -n
        nn = 0.35 * n + 0.65 * out  # canopy-shaped normals: the crown shades as one soft mass, not 10k flat cards
        nn /= np.linalg.norm(nn)
        base = len(V)
        V += q.tolist()
        F.append((base, base + 1, base + 2, base + 3))
        UV += [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
        NR += [nn] * 4
    return V, F, UV, NR


def tree_lod(src):
    rng = random.Random(11)
    me = src.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    centre = np.array([0, 0, co[:, 2].max() * 0.62])
    mats = [m.name for m in me.materials]
    parts = []
    # trunk: plain decimation, it is solid geometry
    trunk = src.copy()
    trunk.data = me.copy()
    coll.objects.link(trunk)
    bm = bmesh.new()
    bm.from_mesh(trunk.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != mats.index("island_tree_01")], context="FACES")
    bm.to_mesh(trunk.data)
    bm.free()
    d = trunk.modifiers.new("dec", "DECIMATE")
    d.ratio = 0.2
    parts.append(trunk)
    # twigs (the branches material, 500k triangles of 5 cm sticks) are dropped: solid sticks cannot become cards, and leaves hide them
    for name, keep, grow in (("island_tree_01_leaves", 0.22, 1.8),):
        V, F, UV, NR = cards_lod(src, mats.index(name), keep, grow, rng, centre)
        o = mesh_obj(name + "_rt", V, F, bpy.data.materials[name])
        uvl = o.data.uv_layers.new(name="UVMap")
        uvl.data.foreach_set("uv", np.array([UV[l.vertex_index] for l in o.data.loops]).ravel())
        o.data.normals_split_custom_set_from_vertices(NR)
        parts.append(o)
    for p in parts:
        p.matrix_world = Matrix.Identity(4)
    return parts


t0 = time.time()
lod_parts = tree_lod(trees[0])
print(f"SPIKE tree LOD built in {time.time() - t0:.1f}s", flush=True)
# leaves: alpha test (MASK) for real time; sorted blending of 10k cards is wrong and slow
for mname in ("island_tree_01_leaves", "island_tree_01_branches", "island_tree_01", "shrub_01", "flower_gazania"):
    m = bpy.data.materials.get(mname)
    if not m:
        continue
    b = m.node_tree.nodes.get("Principled BSDF")
    if b and b.inputs["Alpha"].is_linked:
        src = b.inputs["Alpha"].links[0].from_socket
        rnd = math_(m.node_tree, "ROUND", src)
        link(m.node_tree, rnd, b.inputs["Alpha"])
    m.use_backface_culling = False
for t in trees:
    for p in lod_parts:
        o = p.copy()
        coll.objects.link(o)
        o.matrix_world = t.matrix_world
    bpy.data.objects.remove(t)
for p in lod_parts:
    bpy.data.objects.remove(p)

stamp("tree lod done")
# hedge: every other bush dropped (the rest grown to close the gap), each bush mesh redrawn as one card per leaf
for i, o in enumerate(list(hedge)):
    if i % 2:
        bpy.data.objects.remove(o)
    else:
        o.scale = (o.scale.x * 1.25, o.scale.y * 1.25, o.scale.z)
hedge = [o for i, o in enumerate(hedge) if i % 2 == 0]
rng = random.Random(5)
for me_ in {o.data for o in hedge}:
    co = np.empty(len(me_.vertices) * 3)
    me_.vertices.foreach_get("co", co)
    h = co.reshape(-1, 3)[:, 2].max()
    holder = bpy.data.objects.new("shrub_src", me_)
    V, F, UV, NR = cards_lod(holder, 0, 0.36, 1.6, rng, np.array([0, 0, h * 0.45]))
    o = mesh_obj("shrub_01_rt", V, F, me_.materials[0])
    uvl = o.data.uv_layers.new(name="UVMap")
    uvl.data.foreach_set("uv", np.array([UV[l.vertex_index] for l in o.data.loops]).ravel())
    o.data.normals_split_custom_set_from_vertices(NR)
    for h_ in hedge:
        if h_.data == me_:
            h_.data = o.data
    bpy.data.objects.remove(o)
    bpy.data.objects.remove(holder)

stamp("hedge cards done")
# flowers: plain decimation; at 25 px a plant only needs its silhouette and colour
for me_ in {o.data for o in flowers}:
    holder = bpy.data.objects.new("dec_holder", me_)
    coll.objects.link(holder)
    d = holder.modifiers.new("dec", "DECIMATE")
    d.ratio = 0.15
    bpy.context.view_layer.update()
    newme = bpy.data.meshes.new_from_object(holder.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    for o in flowers:
        if o.data == me_:
            o.data = newme
    bpy.data.objects.remove(holder)


stamp("flowers decimated")
def slim(mname, size=512, normal=True):
    """Phone textures: roughness/metal maps dropped (constants instead), normals only where they carry the shape, small images."""
    m = bpy.data.materials.get(mname)
    if not m:
        return
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    for k, v in (("Roughness", 0.8), ("Metallic", 0.0)):
        for l in list(b.inputs[k].links):
            nt.links.remove(l)
        b.inputs[k].default_value = v
    if not normal:
        for l in list(b.inputs["Normal"].links):
            nt.links.remove(l)
    for n in nt.nodes:
        if n.bl_idname == "ShaderNodeTexImage" and n.image and n.outputs[0].is_linked and max(n.image.size) > size:
            n.image.scale(size, size)


for mname, size, normal in (
    ("rim_paving", 1024, True), ("kerb_stone", 1024, True), ("plinth_stone", 1024, True),
    ("pond_bed", 512, False), ("pond_stone", 512, True), ("moon_rock_03", 512, True),
    ("island_tree_01", 512, True), ("island_tree_01_branches", 512, False), ("island_tree_01_leaves", 1024, False),
    ("shrub_01", 512, False), ("flower_gazania", 512, False), ("painted_wooden_bench", 512, False),
):
    slim(mname, size, normal)
for im in bpy.data.images:  # every exported texture at 512 or less: on a phone the whole park is ~600 px wide
    if im.size[0] and max(im.size) > 512 and im.type == "IMAGE":
        im.scale(512, 512)

# one draw call per material per group: merge every copy into a few meshes (the budget counts drawn triangles anyway)
GROUPS = [
    ("rim", ("rim",)), ("ground", ("ground",)), ("plinth", ("plinth",)), ("pond_bowl", ("pond_bowl",)), ("water", ("water",)),
    ("pond_stones", ("pond_stone",)), ("flower_bed", ("bed_kerb", "bed_soil", "flower_gazania")), ("trees", ("island_tree",)),
    ("hedge", ("shrub_01",)), ("benches", ("painted_wooden_bench",)), ("lamp_posts", ("lamp_base", "lamp_post", "lamp_collar", "lamp_cap")),
    ("lamp_globes", ("lamp_globe",)), ("monument", ("moon_rock",)),
]
deps = bpy.context.evaluated_depsgraph_get()
flat = {}
for o in list(scene.objects):
    if o.type != "MESH":
        continue
    g = next((g for g, pre in GROUPS if o.name.startswith(pre)), None)
    if g is None:
        print("SPIKE ungrouped object", o.name, flush=True)
        g = "misc"
    me_ = bpy.data.meshes.new_from_object(o.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
    me_.transform(o.matrix_world)
    while len(me_.uv_layers) > 1:  # join merges UV maps by name; one map, one name, or a part's UVs land in a map nobody reads
        me_.uv_layers.remove(me_.uv_layers[-1])
    if me_.uv_layers:
        me_.uv_layers[0].name = "UVMap"
    n = bpy.data.objects.new(g, me_)
    coll.objects.link(n)
    flat.setdefault(g, []).append(n)
    bpy.data.objects.remove(o)
for g, objs in flat.items():
    for o in scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    bpy.context.view_layer.objects.active.name = g
lawn = scene.objects["ground"]
hedge, flowers = [scene.objects["hedge"]], []
for o in scene.objects:  # the gazania scan carries 3 colour layers and a 2nd UV map nothing reads: 1 MB of dead weight
    if o.type == "MESH":
        for c in list(o.data.color_attributes):
            o.data.color_attributes.remove(c)
        while len(o.data.uv_layers) > 1:
            o.data.uv_layers.remove(o.data.uv_layers[-1])

stamp("slimmed")
for o in [o for o in scene.objects if o.type in ("LIGHT", "CAMERA")]:
    bpy.data.objects.remove(o)

meshes = [o for o in scene.objects if o.type == "MESH"]
print(f"SPIKE rt tris drawn: {tris(meshes)}; " + "; ".join(f"{o.name} {tris([o])} ({len(o.data.materials)} mat)" for o in sorted(meshes, key=lambda o: o.name)), flush=True)
glb = os.path.join(OUT, "park_rt.glb")
bpy.ops.export_scene.gltf(
    filepath=glb,
    export_format="GLB",
    export_apply=True,
    export_image_format="AUTO",  # JPEG stays JPEG; the leaf textures keep their alpha as PNG
    export_jpeg_quality=80,
    export_cameras=False,
    export_lights=False,
)
print(f"SPIKE exported {glb}: {os.path.getsize(glb) / 1e6:.2f} MB", flush=True)
