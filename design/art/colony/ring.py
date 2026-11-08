"""The whole colony as one still, for judging the look (not a shipped picture): every kind's own build() placed on
the grounds, a paved apron, walkway lamps, room-to-grow places, and the planet's terrain fading out at the frame edge.
Footprints follow real size (spec AM-2): the Stadium and the Spaceport cover 2 x 2 places, the rest 1 x 1.
  places (col, row) -> (x = 12 col, y = -12 row); hall (0,0), Park (1,0), Hospital (0,1), Observatory (1,1),
  Stadium cols -2..-1 rows 0..1 (to the west), Spaceport cols -1..0 rows -2..-1 (behind, so the rocket rises
  over the town), room to grow on the four places left. The real growth order is WS7's to rule.
Run: blender -b -P ring.py -- <out-dir> [samples=256] [views=day,dusk] [percent=100]
  -> <out-dir>/colony_day.png, colony_dusk.png (dusk = the blue hour with every light on), 1920 x 1080"""
import importlib
import math
import os
import random
import sys
import time

import bpy
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lib import core, frame, kits, light  # noqa: E402
from lib.core import ZT, bx, flat, link, load, math_, mesh_obj, mix, new_mat, node, place, recentre, worn  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else os.path.join(HERE, "out")
SAMPLES = int(argv[1]) if len(argv) > 1 else 256
VIEWS = argv[2].split(",") if len(argv) > 2 and argv[2] else ["day", "dusk"]
PCT = int(argv[3]) if len(argv) > 3 else 100
SL = core.SL
COLS, ROWS = range(-2, 2), range(-2, 2)
C = Vector((-6.0, 6.0))  # the grounds' centre: the middle of the 4 x 4 places
AP = 2.5  # the apron beyond the outer places
E = 2 * SL + AP  # apron half-size round C

# kind, its stage, the places it covers (col, row)
KINDS = [
    ("hall", "standing", [(0, 0)]),
    ("park", "standing", [(1, 0)]),
    ("hospital", "standing", [(0, 1)]),
    ("observatory", "standing", [(1, 1)]),
    ("stadium", "standing", [(-2, 0), (-1, 0), (-2, 1), (-1, 1)]),
    ("spaceport", "standing", [(-1, -2), (0, -2), (-1, -1), (0, -1)]),
]
T0 = time.time()


def centre(cells):
    return Vector((sum(SL * c for c, r in cells) / len(cells), sum(-SL * r for c, r in cells) / len(cells)))


def to_screen(x, y, z=0.0):
    """Screen metres for this camera: u to the right, v up."""
    return 0.7071 * (x + y), 0.3536 * (y - x) + 0.866 * z


def ground_mat(fade):
    """The planet's ground: two photo lawns, earth and pebbles mixed by noise. Fade thins it to transparent in a
    screen-space ellipse, so the colony sits in a vignette of land instead of black."""
    m, nt, b = new_mat("terrain" if fade else "rough_ground")
    P = node(nt, "ShaderNodeTexCoord").outputs["Object"]

    def img_at(path, size):
        mp = node(nt, "ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (1 / size, 1 / size, 1)
        link(nt, P, mp.inputs["Vector"])
        n = node(nt, "ShaderNodeTexImage", image=core.img(path))
        link(nt, mp.outputs[0], n.inputs["Vector"])
        return n.outputs["Color"]

    def nz(scale, lo, hi):
        n = node(nt, "ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = scale
        n.inputs["Detail"].default_value = 5
        link(nt, P, n.inputs["Vector"])
        mr = node(nt, "ShaderNodeMapRange")
        mr.inputs["From Min"].default_value = lo
        mr.inputs["From Max"].default_value = hi
        link(nt, n.outputs["Fac"], mr.inputs["Value"])
        return mr.outputs[0]

    g1 = img_at(os.path.join(core.T, "Grass001", "Grass001_1K-JPG_Color.jpg"), 2.2)
    g4 = img_at(os.path.join(core.T, "Grass004", "Grass004_1K-JPG_Color.jpg"), 1.7)
    peb = img_at(os.path.join(core.T, "clean_pebbles", "clean_pebbles_diff_1k.jpg"), 1.6)
    grass = mix(nt, nz(0.08, 0.4, 0.6), mix(nt, 1.0, g4, (0.72, 0.78, 0.55, 1), "MULTIPLY"), mix(nt, 1.0, g1, (0.95, 0.95, 0.85, 1), "MULTIPLY"))
    c = mix(nt, nz(0.12, 0.47, 0.6), grass, mix(nt, 1.0, peb, (0.62, 0.5, 0.38, 1), "MULTIPLY"))
    link(nt, c, b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.92
    if not fade:
        return m
    # the object is placed at the world origin, so Object coordinates are world coordinates
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, P, sep.inputs[0])
    uc, vc = FADE["centre"]
    u = math_(nt, "MULTIPLY", math_(nt, "SUBTRACT", math_(nt, "MULTIPLY", math_(nt, "ADD", sep.outputs["X"], sep.outputs["Y"]), 0.7071), uc), 1 / FADE["ru"])
    v = math_(nt, "MULTIPLY", math_(nt, "SUBTRACT", math_(nt, "MULTIPLY", math_(nt, "SUBTRACT", sep.outputs["Y"], sep.outputs["X"]), 0.3536), vc), 1 / FADE["rv"])
    rr = math_(nt, "SQRT", math_(nt, "ADD", math_(nt, "MULTIPLY", u, u), math_(nt, "MULTIPLY", v, v)))
    rr = math_(nt, "ADD", rr, math_(nt, "MULTIPLY", math_(nt, "SUBTRACT", nz(0.25, 0.0, 1.0), 0.5), 0.06))
    f = node(nt, "ShaderNodeMapRange")
    f.inputs["From Min"].default_value = 0.62
    f.inputs["From Max"].default_value = 1.0
    link(nt, rr, f.inputs["Value"])
    mx = node(nt, "ShaderNodeMixShader")
    link(nt, f.outputs[0], mx.inputs[0])
    link(nt, b.outputs[0], mx.inputs[1])
    link(nt, node(nt, "ShaderNodeBsdfTransparent").outputs[0], mx.inputs[2])
    link(nt, mx.outputs[0], nt.nodes["Material Output"].inputs["Surface"])
    return m


def room_to_grow(cx, cy, rocks):
    """A free place: rough ground with grass coming through, survey stakes at a future footprint, loose stones."""
    rng = random.Random(int(cx * 7 + cy * 13))
    kits.slab(cx, cy, top=None)
    bx(cx - 6 + core.RIM, cx + 6 - core.RIM, cy - 6 + core.RIM, cy + 6 - core.RIM, -0.02, ZT + 0.03, MEADOW, 0.004, "rough_ground")
    stake = flat("survey_stake", (0.95, 0.42, 0.06), 0.5)
    w = rng.uniform(5.5, 7.5)
    for (sx, sy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
        bx(cx + sx * w / 2 - 0.05, cx + sx * w / 2 + 0.05, cy + sy * w / 2 - 0.05, cy + sy * w / 2 + 0.05, ZT, ZT + 0.75, stake, 0.005, "stake")
    for k in range(4):
        s = rng.uniform(0.18, 0.35)
        place(rocks, (cx + rng.uniform(-4, 4), cy + rng.uniform(-4, 4)), z=ZT, rot=rng.uniform(0, 6), scale=(s, s, s * 0.7), sink=0.05)


def terrain_z(x, y):
    d = max(abs(x - C.x), abs(y - C.y))
    lift = max(0.0, (d - E - 1.0) / 14.0)
    return -0.97 + lift ** 1.4 * 1.6 * noise.noise(Vector((x * 0.045, y * 0.045, 0.3))) + lift ** 1.2 * 0.25 * noise.noise(Vector((x * 0.2, y * 0.2, 1.7)))


# ---------- build ----------

core.reset()
used = set()
for kind, stage, cells in KINDS:
    mod = importlib.import_module(kind)
    before = set(bpy.context.scene.objects)
    mod.build(stage)
    off = centre(cells)
    for o in set(bpy.context.scene.objects) - before:
        if o.parent is None:
            o.location.x += off.x
            o.location.y += off.y
    used.update(cells)
    print(f"COLONY ring t+{time.time() - T0:.0f}s {kind} at {tuple(off)}", flush=True)

# the camera: 1920 x 1080 at the shared angle, framing the apron and the rocket's tip
rocket_top = max((o.matrix_world @ Vector(c)).z for o in bpy.context.scene.objects if o.name.startswith("fairing_nose") for c in o.bound_box)
pts = [to_screen(C.x + sx * E, C.y + sy * E) for sx in (1, -1) for sy in (1, -1)] + [to_screen(*centre(KINDS[5][2]), rocket_top)]
u0, u1 = min(p[0] for p in pts), max(p[0] for p in pts)
v0, v1 = min(p[1] for p in pts), max(p[1] for p in pts)
span_v = (v1 - v0) * 1.08
width = max((u1 - u0) * 1.25, span_v * 1920 / 1080)
uc, vc = (u0 + u1) / 2, (v0 + v1) / 2 + 0.01 * span_v
fc = (to_screen(*C)[0], to_screen(*C)[1] + 3.0)
# the land has faded out by the frame's bottom edge and its sides, rather than being cut by them
FADE = {"centre": fc, "ru": width * 0.47, "rv": fc[1] - (vc - width * 1080 / 1920 / 2)}

MEADOW = ground_mat(False)
rocks = load("moon_rock_03")[0]
recentre(rocks)
for col in COLS:
    for row in ROWS:
        if (col, row) not in used:
            room_to_grow(SL * col, -SL * row, rocks)

# the apron round the places, worn paving a step down from the slabs; lamps on the walkways between places
apron = core.pbr("plaza_pavers", "square_concrete_pavers", 1.2, tint=(0.78, 0.79, 0.8))
worn(apron)
bx(C.x - E, C.x + E, C.y - E, C.y + E, -0.95, -0.62, apron, 0.02, "apron")
spots = []
for gx in (-18, -6, 6):
    for gy in (-6, 6, 18):
        inside = any(abs(gx - centre(c).x) < SL - 0.1 and abs(gy - centre(c).y) < SL - 0.1 for _, _, c in KINDS if len(c) == 4)
        if not inside:
            spots.append((gx, gy))
spots += [(x, C.y - E + 1.25) for x in (-18, -6, 6)] + [(C.x + E - 1.25, y) for y in (-6, 6, 18)]
for (x, y) in spots:
    kits.lamp(x, y, z0=-0.62)

# the planet round the colony: flat at the apron, rolling away beyond it, faded out toward the frame edge
n, size = 170, 260.0
tv, tf = [], []
for j in range(n + 1):
    for i in range(n + 1):
        x, y = C.x - size / 2 + size * i / n, C.y - size / 2 + size * j / n
        tv.append((x, y, terrain_z(x, y)))
for j in range(n):
    for i in range(n):
        a0 = j * (n + 1) + i
        tf.append((a0, a0 + 1, a0 + n + 2, a0 + n + 1))
mesh_obj("terrain", tv, tf, ground_mat(True), smooth=True)
tree = load("island_tree_01")[0]
recentre(tree)
th = core.mdims(tree).z
rng = random.Random(9)
placed, tries = 0, 0
while placed < 22 and tries < 4000:
    tries += 1
    x, y = C.x + rng.uniform(-70, 70), C.y + rng.uniform(-70, 70)
    if max(abs(x - C.x), abs(y - C.y)) < E + 2:
        continue
    u, v = to_screen(x, y)
    r = math.hypot((u - FADE["centre"][0]) / FADE["ru"], (v - FADE["centre"][1]) / FADE["rv"])
    if r > 0.85 or (v < FADE["centre"][1] and abs(u - FADE["centre"][0]) < E * 1.5):
        continue  # inside the fade, and never in front of the buildings
    s = rng.uniform(3.5, 6.5) / th
    place(tree, (x, y), z=terrain_z(x, y) - 0.08, rot=rng.uniform(0, 6.28), scale=(s, s, s))
    placed += 1
for k in range(70):
    x, y = C.x + rng.uniform(-65, 65), C.y + rng.uniform(-65, 65)
    u, v = to_screen(x, y)
    if max(abs(x - C.x), abs(y - C.y)) < E + 1 or math.hypot((u - FADE["centre"][0]) / FADE["ru"], (v - FADE["centre"][1]) / FADE["rv"]) > 0.8:
        continue
    s = rng.uniform(0.3, 1.0)
    place(rocks, (x, y), z=terrain_z(x, y), rot=rng.uniform(0, 6), scale=(s, s, s * 0.6), sink=0.1)
core.unlink(tree)
core.unlink(rocks)

# ---------- light, camera, render ----------

light.rig()
cam = frame.camera({"width": 1920, "height": 1080, "centre": [960, 540]}, target=(0, 0, 0))
cam.data.ortho_scale = width
# aim: the ground point whose screen position is (uc, vc)
x_plus_y, y_minus_x = uc / 0.7071, vc / 0.3536
tx, ty = (x_plus_y - y_minus_x) / 2, (x_plus_y + y_minus_x) / 2
cam.location = Vector((tx, ty, 0)) + frame.BACK_OFF
cam.data.shift_x = cam.data.shift_y = 0
frame.setup(SAMPLES, PCT, {"width": 1920, "height": 1080, "centre": [960, 540]})
print(f"COLONY ring t+{time.time() - T0:.0f}s built; rocket top {rocket_top:.1f} m; frame {width:.0f} m wide; "
      f"rocket tip at px {frame.where((*centre(KINDS[5][2]), rocket_top))}", flush=True)
os.makedirs(OUT, exist_ok=True)
for v in VIEWS:
    light.apply("day" if v == "day" else "lit")
    bpy.context.scene.render.filepath = os.path.join(OUT, f"colony_{v}.png")
    t1 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"COLONY render colony_{v} {time.time() - t1:.1f}s at {SAMPLES} samples", flush=True)
