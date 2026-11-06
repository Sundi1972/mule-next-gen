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
    R.update(bg=bg, tint=core.sock(tint, "B", False, "RGBA"), sun=bpy.context.active_object)


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
        R["bg"].inputs["Strength"].default_value = 0.0 if glow else 0.42
        R["tint"].default_value = (0.32, 0.48, 1.0, 1)
        scene.view_settings.exposure = 0.55
    R["sun"].hide_render = glow
    scene.render.film_transparent = not glow  # the glow layer is added on black; the others composite by alpha
    for s, v in core.GLOW:
        s.default_value = v if glow or lit else 0.0
    for L, e in core.LIGHTS:
        L.hide_render = not (glow or lit)
        L.data.energy = e
