"""The one camera every picture shares (ART-DIRECTION §2), the render settings, and the run loop of a kind script.
Orthographic 2:1 dimetric from the south-east, 21 m across 1600 px, the place's centre at pixel (800, 1000), so a
picture composites by position alone and there is ~15 m of height room above the centre."""
import math
import os
import sys
import time

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

from . import core, light, props

W = H = 1600
ORTHO = 21.0
PX_PER_M = W / ORTHO  # one scale for every picture, whatever its frame
CENTRE = (800, 1000)
PLACE_PX = round(core.SL * math.sqrt(2) * PX_PER_M)  # 1293
DEFAULT = {"width": W, "height": H, "centre": list(CENTRE)}
LIGHTS_ALL = ("day", "dusk", "glow")
# the camera stands well back along its line of sight: an orthographic view does not change with distance, but
# anything between the camera and its target's plane would be clipped (34 m back cut a 48 m colony in half)
BACK_OFF = Vector((20, -20, 20 * math.tan(math.radians(30)) * math.sqrt(2))) * 5


def camera(fr=None, target=(0.0, 0.0, 0.0)):
    """The shared camera. fr: a kind's frame (width, height, centre in px); a bigger frame keeps the scale and puts
    the footprint's centre (target) at its centre pixel, so a 2 x 2 kind is 3200 wide and composites like the rest."""
    fr = fr or DEFAULT
    w, h = fr["width"], fr["height"]
    bpy.ops.object.camera_add(location=Vector(target) + BACK_OFF)
    cam = bpy.context.active_object
    cam.data.type = "ORTHO"
    cam.data.sensor_fit = "AUTO"
    cam.data.ortho_scale = max(w, h) / PX_PER_M
    cam.rotation_euler = (math.radians(60), 0, math.radians(45))
    # shift is in units of the frame's larger side: the view moves so the target lands on the centre pixel
    cam.data.shift_x = (w / 2 - fr["centre"][0]) / max(w, h)
    cam.data.shift_y = (fr["centre"][1] - h / 2) / max(w, h)
    cam.data.clip_end = 1000
    bpy.context.scene.camera = cam
    return cam


def where(p):
    """Pixel (x from the left, y from the top) of a world point, to check the frame."""
    scene = bpy.context.scene
    bpy.context.view_layer.update()
    v = world_to_camera_view(scene, scene.camera, Vector(p))
    w, h = scene.render.resolution_x, scene.render.resolution_y
    return round(v.x * w, 1), round((1 - v.y) * h, 1)


def shadow_catcher(places=1):
    """A ground ring at z = 0 from inside the place's rim to one place beyond it all round: it renders transparent
    except for the shadows falling on it, so the picture lays its cast shadow over the plate's edge and neighbours."""
    h = core.SL * (places + 2) / 2
    i = core.HALF * places - core.RIM  # open over the place's own ground, which may sink below z = 0 (the pond)
    v = [(-h, -h, 0), (h, -h, 0), (h, h, 0), (-h, h, 0), (-i, -i, 0), (i, -i, 0), (i, i, 0), (-i, i, 0)]
    f = [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    o = core.mesh_obj("shadow_catcher", v, f, core.flat("catcher", (0.5, 0.5, 0.5), 0.9))
    o.is_shadow_catcher = True
    return o


def setup(samples, pct=100, fr=None):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = True
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles.transparent_max_bounces = 64  # stacked leaf cards need many, or a canopy turns black
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    fr = fr or DEFAULT
    scene.render.resolution_x, scene.render.resolution_y = fr["width"], fr["height"]
    scene.render.resolution_percentage = pct
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.view_transform = "AgX"
    for look in ("AgX - Medium High Contrast", "Medium High Contrast"):
        try:
            scene.view_settings.look = look
            break
        except TypeError:
            pass
    try:
        scene.cycles_curves.shape = "RIBBONS"
    except AttributeError:
        pass


def run(kind, stages, build, glowless=("closed",), fr=None, dress=None):
    """blender -b -P <kind>.py -- <out-dir> [samples=256] [stages=all] [lights=day,dusk,glow] [percent=100]
    Writes <out-dir>/<kind>/<stage>-<light>.png. Each stage is built in a fresh scene. fr: the kind's frame if it
    is not the default 1600 x 1600 (publish.sh copies it into the manifest)."""
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    out = argv[0] if argv else os.path.join(core.ROOT, "out")
    samples = int(argv[1]) if len(argv) > 1 else 256
    want = argv[2].split(",") if len(argv) > 2 and argv[2] not in ("", "all") else list(stages)
    lights = argv[3].split(",") if len(argv) > 3 and argv[3] else list(LIGHTS_ALL)
    pct = int(argv[4]) if len(argv) > 4 else 100
    if core.FLUSH:  # flush layers for the grounds plate (no raised slab, a shadow catcher round the place)
        out = os.path.join(out, "flush")
        # the day sun (35 deg, from the WSW) throws a 10 m building's shadow ~14 m east-north-east, off the right of a
        # 1600 frame: widen to the right only, same centre pixel and scale, so the shadow comes along whole
        fr = dict(fr or DEFAULT)
        fr["width"] += 800 * fr.get("places", 1)
    if props.on():  # kit-dressed pictures go to out/kit; publish.sh ships them only with SRC=out/kit (spec AM-5)
        out = os.path.join(out, "kit")
        print(f"COLONY KITS_DIR is set: kit props ON, writing to {out}", flush=True)
    os.makedirs(os.path.join(out, kind), exist_ok=True)
    for stage in want:
        t0 = time.time()
        core.reset()
        props.reset()
        build(stage)
        if dress and props.on():
            dress(stage)
        if core.FLUSH:
            shadow_catcher((fr or DEFAULT).get("places", 1))
        light.rig()
        camera(fr)
        setup(samples, pct, fr)
        print(f"COLONY {kind}/{stage} built in {time.time() - t0:.0f}s; centre at px {where((0, 0, 0))}", flush=True)
        for l in lights:
            if l == "glow" and stage in glowless:
                continue  # dark is the point: the manifest gives this stage no glow layer
            light.apply(l)
            path = os.path.join(out, kind, f"{stage}-{l}.png")
            bpy.context.scene.render.filepath = path
            t1 = time.time()
            bpy.ops.render.render(write_still=True)
            print(f"COLONY render {kind}/{stage}-{l} {time.time() - t1:.1f}s at {samples} samples", flush=True)
