"""Third-party kit props (KitBash3D) for LOCAL look renders only, until Heiko rules on the licence (spec AM-5).
  - The kits are read from $KITS_DIR (a folder of <kit>/<version>/Models/<name>/<name>.usd). Unset: no props at
    all, so every committed or published picture is kit-free by default. No path to a kit lives in this repo.
  - Kit files are read in place; nothing is copied, written or saved next to them.
  - With props on, frame.run() writes to out/kit-look/ instead of out/, which publish.sh never reads.
Each model is imported once into a hidden collection and placed as collection instances."""
import glob
import os

import bpy
from mathutils import Vector

from . import core

KITS = os.environ.get("KITS_DIR", "")
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
    if t:
        nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    for kind, sock in (("metallic", "Metallic"), ("roughness", "Roughness")):
        t = tex(kind, True)
        if t:
            nt.links.new(t.outputs["Color"], b.inputs[sock])
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


def place(kit, name, at, rot=0.0, z=core.ZT, scale=1.0):
    """An instance of a kit model, its footprint centred on `at`, standing on z, turned by rot (radians)."""
    if not on():
        return None
    c, size = template(kit, name)
    e = bpy.data.objects.new(f"kit_{name}", None)
    e.instance_type = "COLLECTION"
    e.instance_collection = c
    e.location = (at[0], at[1], z)
    e.rotation_euler = (0, 0, rot)
    e.scale = (scale, scale, scale)
    core.coll().objects.link(e)
    return e
