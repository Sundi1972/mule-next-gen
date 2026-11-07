"""Third-party kit props (KitBash3D; licence confirmed by Heiko 7 Nov, spec AM-5): only our rendered pictures ship.
  - The kits are read from $KITS_DIR (a folder of <kit>/<version>/Models/<name>/<name>.usd). Unset: no props at
    all, the kit-free pictures. No path to a kit lives in this repo, and no kit file ever enters it.
  - Kit files are read in place; nothing is copied, written or saved next to them.
  - With props on, frame.run() writes to out/kit/ instead of out/. Shipping the kit set is the one flag
    SRC=out/kit on publish.sh (spec AM-5 addendum).
Each model is imported once into a hidden collection and placed as collection instances."""
import glob
import os

import bpy
from mathutils import Vector

from . import core

KITS = os.environ.get("KITS_DIR", "")
TINTS = {"SandPile": (0.55, 0.4, 0.28)}  # material-name fragment -> multiply on its base colour (or the colour, unmapped)
_TEMPLATES = {}


def on():
    return bool(KITS) and os.path.isdir(KITS)


def reset():
    _TEMPLATES.clear()


def _model(kit, name):
    hits = sorted(glob.glob(os.path.join(KITS, kit, "*", "Models", name, f"{name}.usd")))
    if not hits:
        raise FileNotFoundError(f"kit model {kit}/{name} not under $KITS_DIR")
    return hits[-1]  # the newest version folder


def _rebuild(m, tex_dir):
    """The kits ship MaterialX standard_surface shaders, which Blender's USD import leaves empty (they render black).
    Rebuild each as a Principled BSDF from the kit's own maps, read in place: <material>_basecolor/metallic/
    roughness/normal.png."""
    if m.get("kit_rebuilt"):
        return
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs[0], out.inputs["Surface"])
    base = m.name.split(".")[0]

    def tex(kind, data):
        f = os.path.join(tex_dir, f"{base}_{kind}.png")
        if not os.path.exists(f):
            return None
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(f, check_existing=True)
        if data:
            n.image.colorspace_settings.name = "Non-Color"
        return n

    t = tex("basecolor", False)
    tint = next((v for k, v in TINTS.items() if k in base), None)
    if not t and tint:  # the sand pile ships no colour map: Blender's default white reads as snow
        b.inputs["Base Color"].default_value = (tint[0] * 0.8, tint[1] * 0.8, tint[2] * 0.8, 1)
    if t:
        if tint:  # the kit's pale sand reads as snow under our light: pulled to our earth
            mx = nt.nodes.new("ShaderNodeMix")
            mx.data_type, mx.blend_type = "RGBA", "MULTIPLY"
            mx.inputs[0].default_value = 1.0
            nt.links.new(t.outputs["Color"], mx.inputs[6])
            mx.inputs[7].default_value = (*tint, 1)
            nt.links.new(mx.outputs[2], b.inputs["Base Color"])
        else:
            nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    for kind, sock in (("metallic", "Metallic"), ("roughness", "Roughness")):
        t = tex(kind, True)
        if t:
            nt.links.new(t.outputs["Color"], b.inputs[sock])
    t = tex("opacity", True)  # leaf atlases: cut-out cards
    if t:
        nt.links.new(t.outputs["Color"], b.inputs["Alpha"])
    t = tex("normal", True)
    if t:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    m["kit_rebuilt"] = True


def template(kit, name):
    """The model in its own collection, outside the scene; its instance offset is its footprint centre at its base."""
    key = (kit, name)
    if key in _TEMPLATES:
        return _TEMPLATES[key]
    before = set(bpy.data.objects)
    bpy.ops.wm.usd_import(filepath=_model(kit, name))
    new = [o for o in bpy.data.objects if o not in before]
    c = bpy.data.collections.new(f"kit_{name}")
    for o in new:
        for uc in list(o.users_collection):
            uc.objects.unlink(o)
        c.objects.link(o)
    tex_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(_model(kit, name)))), "Textures", "png4k")
    for o in new:
        if o.type == "MESH":
            for m in o.data.materials:
                if m:
                    _rebuild(m, tex_dir)
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(p) for o in new if o.type == "MESH" for p in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    c.instance_offset = ((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)
    size = hi - lo
    print(f"COLONY kit {name}: {size.x:.1f} x {size.y:.1f} x {size.z:.1f} m", flush=True)
    _TEMPLATES[key] = (c, size)
    return _TEMPLATES[key]


def materials(kit, name):
    """The materials of a kit model (to wilt a plant, say)."""
    c, _ = template(kit, name)
    return {m for o in c.all_objects if o.type == "MESH" for m in o.data.materials if m}


def size(kit, name):
    return template(kit, name)[1]


def place(kit, name, at, rot=0.0, z=core.ZT, scale=1.0, quat=None):
    """An instance of a kit model, its footprint centred on `at`, standing on z, turned by rot (radians) or by a
    quaternion about its footprint centre at its base (a tree pivots on its root)."""
    if not on():
        return None
    c, size = template(kit, name)
    e = bpy.data.objects.new(f"kit_{name}", None)
    e.instance_type = "COLLECTION"
    e.instance_collection = c
    e.location = (at[0], at[1], z)
    if quat is not None:
        e.rotation_mode = "QUATERNION"
        e.rotation_quaternion = quat
    else:
        e.rotation_euler = (0, 0, rot)
    e.scale = (scale, scale, scale)
    core.coll().objects.link(e)
    return e


CZ, LND, MTM, WDC, ATL = "kb3d_constructionzone", "kb3d_london", "kb3d_missiontominerva", "kb3d_washingtondc", "kb3d_atlantis"


def kit(spec):
    """Place a list of (kit, model, (x, y), rot) kit props; nothing when KITS_DIR is unset."""
    for (k, name, at, rot) in spec:
        place(k, name, at, rot)


def site_props(n=1):
    """Construction Zone gear on a site: an earth-tinted sand mound, mixer, pallets, barrow, generator, spool, toilet."""
    s = n
    kit([(CZ, "KB3D_CSZ_PropSandMound_A", (-2.0 * s, 1.8 * s), 0.4), (CZ, "KB3D_CSZ_PropConcreteMixer_A", (1.4 * s, -2.4 * s), 0.0),
         (CZ, "KB3D_CSZ_PropBrickPallet_B", (2.5 * s, 0.0), 0.0), (CZ, "KB3D_CSZ_PropCementBagPallet_A", (2.5 * s, 1.6), 0.2),
         (CZ, "KB3D_CSZ_PropWheelbarrow_A", (0.0, -0.8 * s), 0.7), (CZ, "KB3D_CSZ_PropPortaPotty_A", (4.7 * s, 4.7 * s if n == 1 else 9.0), 0.0),
         (CZ, "KB3D_CSZ_PropPowerGenerator_B", (-3.0 * s, -4.6 * s), 0.0), (CZ, "KB3D_CSZ_PropCableSpool_A", (-4.6 * s, 2.6 * s), 1.57)])
