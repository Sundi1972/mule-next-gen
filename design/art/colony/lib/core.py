"""Plumbing shared by every colony picture: asset paths, node and mesh helpers, the shared materials, and the
registry of everything that glows. Lifted from spike-park/park.py and colony.py.
Each stage is built in a fresh scene (reset()), so nothing here may hold on to a datablock across stages."""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # design/art/colony
A = os.environ.get("COLONY_ASSETS") or os.path.join(ROOT, "assets")  # CC0, fetched by fetch.py, gitignored
T = os.path.join(A, "tex")
SL = 12.0  # one grounds place
HALF = SL / 2
RIM = 0.7  # the sandstone rim round every place
ZT = 0.02  # top of a place's paving

IMAGES, MATS = {}, {}
GLOW = []  # (socket, value): every emission input, set to value in the glow pass and 0 in day and dusk
LIGHTS = []  # (light, energy): lamps, work lights, embers; they only shine in the glow pass


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for d in (IMAGES, MATS):
        d.clear()
    GLOW.clear()
    LIGHTS.clear()


def coll():
    return bpy.context.scene.collection


# ---------- node helpers ----------

def node(nt, kind, **props):
    n = nt.nodes.new(kind)
    for k, v in props.items():
        setattr(n, k, v)
    return n


def sock(n, name, out=True, kind=None):
    """Socket by name; Mix nodes repeat names per data type, so match the type too."""
    for s in n.outputs if out else n.inputs:
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
    sep = node(nt, "ShaderNodeSeparateColor")
    link(nt, tex(nt, os.path.join(d, f"{folder}_arm_1k.jpg"), v, True).outputs["Color"], sep.inputs["Color"])
    link(nt, math_(nt, "ADD", sep.outputs[1], rough_add, True), b.inputs["Roughness"])
    nm = node(nt, "ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = nstr
    link(nt, tex(nt, os.path.join(d, f"{folder}_nor_gl_1k.jpg"), v, True).outputs["Color"], nm.inputs["Color"])
    link(nt, nm.outputs["Normal"], b.inputs["Normal"])
    return m


def shadow_see_through(nt, b):
    """Let shadow rays pass (and only them): sunlight reaches a pond bed, lamplight leaves its globe."""
    out = nt.nodes["Material Output"]
    lp = node(nt, "ShaderNodeLightPath")
    tr = node(nt, "ShaderNodeBsdfTransparent")
    mx = node(nt, "ShaderNodeMixShader")
    link(nt, lp.outputs["Is Shadow Ray"], mx.inputs[0])
    link(nt, b.outputs[0], mx.inputs[1])
    link(nt, tr.outputs[0], mx.inputs[2])
    link(nt, mx.outputs[0], out.inputs["Surface"])


def flat(name, rgb, rough=0.5, metal=0.0):
    m, nt, b = new_mat(name)
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def accent(name, rgb, glow=0.0, rough=0.4, emit=None):
    """The building's one accent colour; glow > 0 makes it a lit sign in the glow pass."""
    m, nt, b = new_mat(name)
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Emission Color"].default_value = (*(emit or rgb), 1)
    if glow:
        GLOW.append((b.inputs["Emission Strength"], glow))
    return m


def glass_mat(name, lit_share=0.72, strength=2.6):
    """Dark reflective glass. In the glow pass a share of the bays light warm, each bay and floor its own level,
    so a lit building reads as lived in rather than as a light box."""
    m, nt, b = new_mat(name)
    b.inputs["Base Color"].default_value = (0.09, 0.115, 0.14, 1)
    b.inputs["Roughness"].default_value = 0.07
    b.inputs["Emission Color"].default_value = (1.0, 0.64, 0.3, 1)
    cell = node(nt, "ShaderNodeVectorMath", operation="DIVIDE")
    cell.inputs[1].default_value = (1.4, 1.4, 3.0)
    link(nt, node(nt, "ShaderNodeTexCoord").outputs["Object"], cell.inputs[0])
    fl = node(nt, "ShaderNodeVectorMath", operation="FLOOR")
    link(nt, cell.outputs[0], fl.inputs[0])
    wn = node(nt, "ShaderNodeTexWhiteNoise", noise_dimensions="3D")
    link(nt, fl.outputs[0], wn.inputs["Vector"])
    lit = math_(nt, "LESS_THAN", wn.outputs["Value"], lit_share)
    level = math_(nt, "ADD", math_(nt, "MULTIPLY", wn.outputs["Value"], 0.8), 0.6)
    s = node(nt, "ShaderNodeValue")
    s.outputs[0].default_value = 0.0
    link(nt, math_(nt, "MULTIPLY", math_(nt, "MULTIPLY", lit, level), s.outputs[0]), b.inputs["Emission Strength"])
    GLOW.append((s.outputs[0], strength))
    return m


def panel_mat(name, rgb):
    """Clean rendered panels: a flat colour with the concrete-panel joints as relief only; grime reads as neglect."""
    m, nt, b = new_mat(name)
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = 0.6
    nm = node(nt, "ShaderNodeNormalMap")
    link(nt, tex(nt, os.path.join(T, "concrete_panels", "concrete_panels_nor_gl_1k.jpg"), uv_map(nt, 6.0), True).outputs["Color"], nm.inputs["Color"])
    link(nt, nm.outputs[0], b.inputs["Normal"])
    return m


def worn(m, scale=0.6, lo=0.72):
    """Wear on paving: a slow noise darkens and warms patches, so a forecourt is not one flat tone."""
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
    return m


def globe_mat():
    m, nt, b = new_mat("lamp_globe")
    b.inputs["Base Color"].default_value = (0.95, 0.92, 0.85, 1)
    b.inputs["Roughness"].default_value = 0.25
    b.inputs["Transmission Weight"].default_value = 0.5
    # lit, the globe is pure emission: as a lit surface it would also catch its own point light 16 cm away and burn white
    em = node(nt, "ShaderNodeEmission")
    em.inputs["Color"].default_value = (1.0, 0.55, 0.24, 1)
    em.inputs["Strength"].default_value = 5.0
    mx = node(nt, "ShaderNodeMixShader")
    mx.inputs[0].default_value = 0.0
    link(nt, b.outputs[0], mx.inputs[1])
    link(nt, em.outputs[0], mx.inputs[2])
    shadow_see_through(nt, mx)
    GLOW.append((mx.inputs[0], 1.0))
    return m


def earth_mat():
    m, nt, b = new_mat("earth")
    b.inputs["Base Color"].default_value = (0.2, 0.13, 0.08, 1)
    b.inputs["Roughness"].default_value = 0.95
    bp = node(nt, "ShaderNodeBump")
    nz = node(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 18
    link(nt, nz.outputs["Fac"], bp.inputs["Height"])
    link(nt, bp.outputs["Normal"], b.inputs["Normal"])
    return m


_FACTORIES = {
    "stone": lambda: pbr("rim_paving", "sandstone_blocks_08", 2.2, tint=(0.93, 0.93, 0.92)),
    "pavers": lambda: worn(pbr("forecourt_pavers", "square_concrete_pavers", 1.8, tint=(0.98, 1.0, 1.05)), 0.9, 0.82),
    "concrete": lambda: pbr("facade_concrete", "concrete_panels", 6.0, tint=(1.45, 1.45, 1.42)),
    "plaster": lambda: panel_mat("facade_white", (0.8, 0.81, 0.82)),
    "clad": lambda: pbr("metal_cladding", "box_profile_metal_sheet", 2.0, tint=(0.62, 0.64, 0.68)),
    "roofplant": lambda: pbr("roof_plant", "metal_plate_02", 1.5, tint=(0.8, 0.8, 0.82)),
    "padmat": lambda: pbr("launch_pad", "hangar_concrete_floor", 3.0, tint=(1.3, 1.3, 1.3)),
    "frame": lambda: flat("window_frame", (0.045, 0.05, 0.055), 0.35, 0.8),
    "roofmem": lambda: flat("roof_membrane", (0.23, 0.235, 0.24), 0.9),
    "whitemetal": lambda: flat("white_metal", (0.82, 0.83, 0.85), 0.28, 0.35),
    "darkmetal": lambda: flat("dark_metal", (0.06, 0.06, 0.065), 0.45, 0.7),
    "metal": lambda: flat("lamp_post", (0.03, 0.032, 0.035), 0.38, 0.85),
    "glass": lambda: glass_mat("window_glass"),
    "dead_glass": lambda: flat("glass_dead", (0.05, 0.055, 0.06), 0.35),
    "globe": globe_mat,
    "earth": earth_mat,
    "tyre": lambda: flat("tyre", (0.03, 0.03, 0.03), 0.8),
}


def mat(key):
    """A shared material, made once per scene."""
    if key not in MATS:
        MATS[key] = _FACTORIES[key]()
    return MATS[key]


def light(kind, at, energy, color, soft=0.1):
    """A lamp that shines only in the glow pass."""
    bpy.ops.object.light_add(type=kind, location=at)
    L = bpy.context.active_object
    L.data.energy = energy
    L.data.color = color
    L.data.shadow_soft_size = soft
    LIGHTS.append((L, energy))
    return L


# ---------- mesh helpers ----------

def mesh_obj(name, verts, faces, m=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    coll().objects.link(o)
    if m:
        me.materials.append(m)
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


def block(name, x0, x1, y0, y1, z0, z1, m, bevel=0.02):
    v = [(x, y, z) for z in (z0, z1) for y in (y0, y1) for x in (x0, x1)]
    f = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    o = mesh_obj(name, v, f, m)
    box_uv(o)
    if bevel:
        bv = o.modifiers.new("bevel", "BEVEL")
        bv.width = bevel
        bv.segments = 2
    return o


def bx(x0, x1, y0, y1, z0, z1, m, bevel=0.012, name="part"):
    return block(name, min(x0, x1), max(x0, x1), min(y0, y1), max(y0, y1), z0, z1, m, bevel)


def cyl(name, x, y, r, z0, z1, m, seg=24):
    v = [(x + r * math.cos(2 * math.pi * k / seg), y + r * math.sin(2 * math.pi * k / seg), z) for z in (z0, z1) for k in range(seg)]
    f = [tuple(range(seg))[::-1], tuple(range(seg, 2 * seg))] + [(k, (k + 1) % seg, seg + (k + 1) % seg, seg + k) for k in range(seg)]
    o = mesh_obj(name, v, f, m)
    bv = o.modifiers.new("bevel", "BEVEL")
    bv.width = min(0.008, r * 0.3)
    bv.segments = 2
    bv.limit_method = "ANGLE"
    o.data.shade_smooth()
    o.modifiers.new("wn", "WEIGHTED_NORMAL").keep_sharp = True
    return o


def load(asset):
    """Import a Poly Haven glTF; returns its mesh objects (templates to copy)."""
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
    bpy.context.view_layer.update()  # bound boxes of just-made objects are zero until evaluated
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    return Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)])


def place(tpl, at, z=0.0, rot=0.0, scale=(1, 1, 1), sink=0.0, extra_rot=(0, 0)):
    """A linked copy of a template, standing on z (its lowest point at z - sink), centred on `at`."""
    o = tpl.copy()
    coll().objects.link(o)
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
    return Vector(np.ptp(co.reshape(-1, 3), 0).tolist())


def unlink(o):
    for c in o.users_collection:
        c.objects.unlink(o)
