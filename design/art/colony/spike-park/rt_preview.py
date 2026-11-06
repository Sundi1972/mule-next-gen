"""
A rasterised look at out/park_rt.glb from the grounds camera: EEVEE stands in for a phone's WebGL renderer,
so the real-time trade-offs (card trees, baked ground, decimated plants) can be judged before the page exists.
Run: blender -b -P rt_preview.py -- <spike-dir> [day|dusk]  -> out/park_rt_preview_<view>.png
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
DIR = argv[0]
VIEW = argv[1] if len(argv) > 1 else "day"
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=os.path.join(DIR, "out", "park_rt.glb"))

world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
nt = world.node_tree
env = nt.nodes.new("ShaderNodeTexEnvironment")
env.image = bpy.data.images.load(os.path.join(DIR, "assets", "sky_2k.hdr"))
emap = nt.nodes.new("ShaderNodeMapping")
emap.inputs["Rotation"].default_value = (0, 0, math.pi)
nt.links.new(nt.nodes.new("ShaderNodeTexCoord").outputs["Generated"], emap.inputs["Vector"])
nt.links.new(emap.outputs[0], env.inputs["Vector"])
clamp = nt.nodes.new("ShaderNodeVectorMath")
clamp.operation = "MINIMUM"
clamp.inputs[1].default_value = (6, 6, 6)
nt.links.new(env.outputs["Color"], clamp.inputs[0])
nt.links.new(clamp.outputs[0], nt.nodes["Background"].inputs["Color"])

elev, az, energy, color, strength, emit = (35, 200, 5.0, (1.0, 0.89, 0.76), 1.0, 0.0) if VIEW == "day" else (5, 200, 2.6, (1.0, 0.42, 0.16), 0.09, 6.0)
nt.nodes["Background"].inputs["Strength"].default_value = strength
bpy.ops.object.light_add(type="SUN")
sun = bpy.context.active_object
s = Vector((math.cos(math.radians(elev)) * math.cos(math.radians(az)), math.cos(math.radians(elev)) * math.sin(math.radians(az)), math.sin(math.radians(elev))))
sun.rotation_euler = s.to_track_quat("Z", "Y").to_euler()
sun.data.energy = energy
sun.data.color = color
sun.data.angle = math.radians(2.5)
m = bpy.data.materials.get("lamp_globe")
if m:
    m.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = emit

if VIEW == "dusk":  # the glb carries no lights; the page adds one per globe, as here
    spec = json.load(open(os.path.join(DIR, "park-spec.json")))
    for x, y in spec["lamps"]["at"]:
        bpy.ops.object.light_add(type="POINT", location=(x, y, spec["lamps"]["height"] - 0.16))
        bpy.context.active_object.data.energy = 70
        bpy.context.active_object.data.color = (1.0, 0.66, 0.36)
        bpy.context.active_object.data.shadow_soft_size = 0.13

bpy.ops.object.camera_add(location=(20, -20, 20 * math.tan(math.radians(30)) * math.sqrt(2)))
cam = bpy.context.active_object
cam.data.type = "ORTHO"
cam.data.ortho_scale = 12 * 1.75
cam.rotation_euler = (math.radians(60), 0, math.radians(45))
scene.camera = cam

scene.render.engine = "BLENDER_EEVEE"
scene.eevee.taa_render_samples = 32
scene.render.film_transparent = True
scene.render.resolution_x, scene.render.resolution_y = 1600, 1200
scene.view_settings.view_transform = "AgX"
scene.view_settings.exposure = 0.3 if VIEW == "day" else 0.6
scene.render.filepath = os.path.join(DIR, "out", f"park_rt_preview_{VIEW}.png")
bpy.ops.render.render(write_still=True)
print("SPIKE preview", scene.render.filepath, flush=True)
