"""The light rig and its three passes (ART-DIRECTION §3).
  day   sun from the west-south-west (compass 250, the camera's left) at 35°, sky fill; nothing glows
  dusk  the blue hour: a cool dim sky, the sun grazing at 3°; nothing glows (the base picture)
  glow  emission and lamps alone, on black: the page adds it over dusk, faded by wealth (spec RULE-2)
Dusk and glow share one exposure, so dusk + glow at full opacity is the lit picture."""
import math
import os

import bpy
from mathutils import Vector

from . import core

R = {}
# the blue hour's sky fill: 0.6 (was 0.42), so the plate's apron and place grass at dusk measure within ~15 % of
# look.html's dusk (AM-7; measure.py: 0.60 gave 0.92/1.01 of look, 0.65 0.96/1.08 but the land at the frame's
# bottom edge 1.20, 0.75 gave 1.03/1.18). COLONY_DUSK_BG overrides
# it for calibration runs only
DUSK_BG = float(os.environ.get("COLONY_DUSK_BG", "0.6"))
# the blue hour's warm fill: a low warm light from behind the camera, the colony's own lamps and windows spilling on
# the faces we see, so facades read bright and warm at dusk as in look.html's lit still (AM-7 check 5). Low (12 deg),
# and linked off the ground. COLONY_DUSK_FILL overrides it for calibration runs only
DUSK_FILL = float(os.environ.get("COLONY_DUSK_FILL", "2.4"))


def rig():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    wn = world.node_tree
    env = core.node(wn, "ShaderNodeTexEnvironment", image=bpy.data.images.load(os.path.join(core.A, "sky_2k.hdr")))
    emap = core.node(wn, "ShaderNodeMapping")
    emap.inputs["Rotation"].default_value = (0, 0, math.pi)  # the HDRI's sun behind the camera, so water mirrors open sky
    core.link(wn, core.node(wn, "ShaderNodeTexCoord").outputs["Generated"], emap.inputs["Vector"])
    core.link(wn, emap.outputs[0], env.inputs["Vector"])
    # the HDRI's own sun (71k) is clamped out, so the sun lamp alone sets direction and shadow
    clamp = core.node(wn, "ShaderNodeVectorMath", operation="MINIMUM")
    clamp.inputs[1].default_value = (6, 6, 6)
    core.link(wn, env.outputs["Color"], clamp.inputs[0])
    tint = core.node(wn, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    core.sock(tint, "Factor", False, "VALUE").default_value = 1.0
    core.link(wn, clamp.outputs[0], core.sock(tint, "A", False, "RGBA"))
    bg = wn.nodes["Background"]
    core.link(wn, core.sock(tint, "Result", True, "RGBA"), bg.inputs["Color"])
    bpy.ops.object.light_add(type="SUN")
    sun = bpy.context.active_object
    bpy.ops.object.light_add(type="SUN")
    fill = bpy.context.active_object
    e, a = math.radians(12), math.radians(-45)  # from the camera's side (south-east), az ccw from east
    fill.rotation_euler = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e))).to_track_quat("Z", "Y").to_euler()
    fill.data.color = (1.0, 0.72, 0.45)
    fill.data.angle = math.radians(8)
    # no shadow: it stands for bounced light, and a 12 deg light's shadow would run ~28 m over a layer's catcher and
    # be painted over the buildings behind it (measured: the Hospital's darkened the hall's parapet)
    for attr in ("use_shadow",):
        if hasattr(fill.data, attr):
            setattr(fill.data, attr, False)
    if hasattr(fill.data, "cycles") and hasattr(fill.data.cycles, "cast_shadow"):
        fill.data.cycles.cast_shadow = False
    # and none on the ground (light linking): it must not lift the apron, the grass or a layer's own ground, which
    # are measured against look.html's dusk without it. Ground = any mesh under 0.35 m tall, and the terrain
    nofill = bpy.data.collections.new("no_fill")
    for o in list(scene.objects):
        if o.type == "MESH" and (o.dimensions.z < 0.35 or o.name.startswith(("terrain", "apron", "shadow_catcher"))):
            nofill.objects.link(o)
    fill.light_linking.receiver_collection = nofill
    for co in nofill.collection_objects:
        co.light_linking.link_state = "EXCLUDE"
    R.update(bg=bg, tint=core.sock(tint, "B", False, "RGBA"), sun=sun, fill=fill)


def set_sun(elev, az, energy, color, angle):
    """az counter-clockwise from east (+x): compass 250° is 200° here."""
    e, a = math.radians(elev), math.radians(az)
    s = Vector((math.cos(e) * math.cos(a), math.cos(e) * math.sin(a), math.sin(e)))
    sun = R["sun"]
    sun.rotation_euler = s.to_track_quat("Z", "Y").to_euler()
    sun.data.energy = energy
    sun.data.color = color
    sun.data.angle = math.radians(angle)


def apply(name):
    """day | dusk | glow, or lit: dusk with the glow on, for a whole-colony still rather than a layered picture."""
    scene = bpy.context.scene
    lit = name == "lit"
    glow = name == "glow"
    if name == "day":
        set_sun(35, 200, 5.0, (1.0, 0.89, 0.76), 2.5)
        R["bg"].inputs["Strength"].default_value = 1.0
        R["tint"].default_value = (1, 1, 1, 1)
        scene.view_settings.exposure = 0.3
    else:
        # blue hour, not sunset: a cool sky does the fill and the sun only grazes, so lit windows carry the picture
        set_sun(3, 200, 0.5, (1.0, 0.5, 0.3), 2.0)
        R["bg"].inputs["Strength"].default_value = 0.0 if glow else DUSK_BG
        R["tint"].default_value = (0.32, 0.48, 1.0, 1)
        scene.view_settings.exposure = 0.55
    R["sun"].hide_render = glow
    R["fill"].data.energy = DUSK_FILL
    R["fill"].hide_render = name in ("day", "glow")
    scene.render.film_transparent = not glow  # the glow layer is added on black; the others composite by alpha
    for s, v in core.GLOW:
        s.default_value = v if glow or lit else 0.0
    for L, e in core.LIGHTS:
        L.hide_render = not (glow or lit)
        L.data.energy = e
