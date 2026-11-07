"""The grounds plate: the 5 x 5 grounds and the planet round them as ONE picture in the shared camera (lib/frame:
the same angle, px per metre and sun), so flush building layers (COLONY_FLUSH=1) composite onto it by pixel offset
alone and the whole reads like ring.py's colony still.
  places (col, row), 0..4, the hall at (2, 2) on the world origin; x = 12 (col - 2), y = -12 (row - 2), so a place
  step is (+-646.5, +-323.25) px and depth order is col + row (higher is nearer the camera).
  content: a paved apron, every place's stone edge with graded ground inside (the building layers cover it),
  ring.py's grass-and-dirt terrain rolling away and fading out in a vignette, trees and shrubs on it (kit plants
  from $KITS_DIR when set, else the CC0 tree). Tall planting stays off the strip in front of the grounds, where
  the building layers, drawn over the plate, would wrongly cover it.
  extent: the grounds ColonyGrounds draws (RULE-4, the highest place in use): 3 (the hall's ring) or 5. Each extent
  has its own frame, vignette and tree belt just outside its ring; all share the camera and px per metre, so a
  building layer drops on any of them at the same offset from the hall's pixel.
Run: blender -b -P plate.py -- <out-dir> [samples=128] [lights=day,dusk] [percent=100] [extent=5]
  -> <out-dir>/plate<extent>-<light>.png and plate<extent>.json (frame, the hall's pixel, px per metre, place step)"""
import json
import math
import os
import random
import sys
import time

import bpy
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lib import core, frame, kits, light, props  # noqa: E402
from lib.core import RIM, SL, ZT, bx, flat, link, load, math_, mesh_obj, mix, new_mat, node, place, recentre, worn  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OUT = argv[0] if argv else os.path.join(HERE, "out", "proof")
SAMPLES = int(argv[1]) if len(argv) > 1 else 128
LIGHTS = argv[2].split(",") if len(argv) > 2 and argv[2] else ["day", "dusk"]
PCT = int(argv[3]) if len(argv) > 3 else 100
N = int(argv[4]) if len(argv) > 4 else 5

HALL = (N // 2, N // 2)  # the hall's place, in this extent's own grid
G = SL * N / 2  # the grounds' half-size: 18 m (3 x 3), 30 m (5 x 5)
AP = 2.5  # the apron beyond the outer places
E = G + AP
# per extent: 16:9, the hall's centre 52-60 % down so tall buildings at the back have room; 76.19 px/m always
FRAMES = {3: {"width": 6144, "height": 3456, "centre": [3072, 2074]},  # 80.6 x 45.4 m
          5: {"width": 8960, "height": 5040, "centre": [4480, 2640]}}  # 117.6 x 66.2 m
FR = FRAMES[N]
BELT = 16.0 if N == 3 else 30.0  # how far beyond the apron the trees go
TREES, SHRUBS, EDGE = (30, 70, 40) if N == 3 else (46, 110, 64)
PXM = frame.PX_PER_M
T0 = time.time()


def cell(c, r):
    return SL * (c - HALL[0]), -SL * (r - HALL[1])


def to_screen(x, y, z=0.0):
    """Screen metres for the shared camera, from the hall's centre: u to the right, v up."""
    return 0.7071 * (x + y), 0.3536 * (y - x) + 0.866 * z


U0, U1 = -FR["centre"][0] / PXM, (FR["width"] - FR["centre"][0]) / PXM
V0, V1 = -(FR["height"] - FR["centre"][1]) / PXM, FR["centre"][1] / PXM
FC = (0.0, (V0 + V1) / 2)
FADE = {"centre": FC, "ru": (U1 - U0) * 0.47, "rv": (V1 - V0) / 2}  # the land has faded out by the frame's edges


def ground_mat(fade):
    """ring.py's planet ground: two photo lawns, earth and pebbles mixed by noise; fade thins it to transparent in a
    screen-space ellipse, so the colony sits in a vignette of land."""
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


def terrain_z(x, y):
    d = max(abs(x), abs(y))
    lift = max(0.0, (d - E - 1.0) / 14.0)
    return -0.03 + lift ** 1.4 * 1.6 * noise.noise(Vector((x * 0.045, y * 0.045, 0.3))) + lift ** 1.2 * 0.25 * noise.noise(Vector((x * 0.2, y * 0.2, 1.7)))


def fade_r(x, y):
    u, v = to_screen(x, y)
    return math.hypot((u - FC[0]) / FADE["ru"], (v - FC[1]) / FADE["rv"])


def in_front(x, y):
    """On the strip in front of the grounds, where a tall plant would rise into the building layers."""
    u, v = to_screen(x, y)
    return v < 0 and abs(u) < E * 1.45 and (x - y) > 0


LND, ENC, AMC, WDC, SDM, NOF, AMP, ATL = ("kb3d_london", "kb3d_enchanted", "kb3d_americana", "kb3d_washingtondc", "KB3D_Stadiums",
                                          "kb3d_noirfuturism", "kb3d_amusementpark", "kb3d_atlantis")
KIT_TREES = [(LND, "KB3D_LND_PropTree_A"), (LND, "KB3D_LND_PropTree_B"), (LND, "KB3D_LND_PropTree_C"), (LND, "KB3D_LND_PropTree_D"),
             (SDM, "KB3D_SDM_PropTree_A"), (SDM, "KB3D_SDM_PropTree_B"), (SDM, "KB3D_SDM_PropTree_C"), (NOF, "KB3D_NOF_PropTree_A"),
             (AMP, "KB3D_AMP_PropTree_A"), (ENC, "KB3D_ENC_PropTree_A"), (WDC, "KB3D_WDC_PropBigTree_A"), (ATL, "KB3D_ATL_VegCypressTree_A")]
KIT_SHRUBS = [(LND, "KB3D_LND_PropShrub_A"), (LND, "KB3D_LND_PropShrub_C"), (LND, "KB3D_LND_PropShrub_E"), (ENC, "KB3D_ENC_PropShrub_A"),
              (ENC, "KB3D_ENC_PropShrub_B"), (ENC, "KB3D_ENC_PropShrub_C"), (ENC, "KB3D_ENC_PropShrub_D"), (AMC, "KB3D_AMC_PropFoliage_L"),
              (AMC, "KB3D_AMC_PropFoliage_N"), (WDC, "KB3D_WDC_PropFoliage_A")]


def plant(spec, at, h, rot, z):
    k, name = spec
    sz = props.size(k, name)
    props.place(k, name, at, rot, z=z, scale=h / sz.z)


# ---------- build ----------

core.reset()
props.reset()
MEADOW = ground_mat(False)
stone = core.mat("stone")
apron = core.pbr("plaza_pavers", "square_concrete_pavers", 1.2, tint=(0.78, 0.79, 0.8))
worn(apron)
bx(-E, E, -E, E, -0.3, 0.0, apron, 0.02, "apron")
rocks = load("moon_rock_03")[0]
recentre(rocks)
stake = flat("survey_stake", (0.95, 0.42, 0.06), 0.5)
for c in range(N):
    for r in range(N):
        cx, cy = cell(c, r)
        bx(cx - 6 + 0.03, cx + 6 - 0.03, cy - 6 + 0.03, cy + 6 - 0.03, -0.05, 0.012, stone, 0.01, "place_edge")
        bx(cx - 6 + RIM, cx + 6 - RIM, cy - 6 + RIM, cy + 6 - RIM, -0.05, ZT - 0.004, MEADOW, 0.004, "graded")
        rng = random.Random(c * 31 + r * 7)
        w = rng.uniform(5.5, 7.5)
        for (sx, sy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            bx(cx + sx * w / 2 - 0.05, cx + sx * w / 2 + 0.05, cy + sy * w / 2 - 0.05, cy + sy * w / 2 + 0.05, ZT, ZT + 0.75, stake, 0.005, "stake")
        for k in range(3):
            s = rng.uniform(0.18, 0.35)
            place(rocks, (cx + rng.uniform(-4, 4), cy + rng.uniform(-4, 4)), z=ZT, rot=rng.uniform(0, 6), scale=(s, s, s * 0.7), sink=0.05)

# walkway lamps round the apron, where every walkway between places meets it (as ring.py's front edges, on all four
# sides). Not at the crossings inside the grounds: each crossing is the near corner of the place behind it, so the
# building layer drawn over the plate would cover the lamp's head.
lines = [-G + SL * k for k in range(1, N)]
for t in lines:
    for (x, y) in ((t, -E + 1.25), (E - 1.25, t), (t, E - 1.25), (-E + 1.25, t)):
        kits.lamp(x, y, z0=0.0)

n, size = 200, 300.0
tv, tf = [], []
for j in range(n + 1):
    for i in range(n + 1):
        x, y = -size / 2 + size * i / n, -size / 2 + size * j / n
        tv.append((x, y, terrain_z(x, y)))
for j in range(n):
    for i in range(n):
        a0 = j * (n + 1) + i
        tf.append((a0, a0 + 1, a0 + n + 2, a0 + n + 1))
mesh_obj("terrain", tv, tf, ground_mat(True), smooth=True)

rng = random.Random(9)
if props.on():
    trees, shrubs = 0, 0
    for _ in range(9000):
        if trees >= TREES and shrubs >= SHRUBS:
            break
        x, y = rng.uniform(-80, 80), rng.uniform(-80, 80)
        if not (E + 1.5 < max(abs(x), abs(y)) < E + BELT) or fade_r(x, y) > 0.86:
            continue
        if not in_front(x, y) and trees < TREES and rng.random() < 0.45:
            plant(KIT_TREES[rng.randrange(len(KIT_TREES))], (x, y), rng.uniform(4.5, 8.5), rng.uniform(0, 6.28), terrain_z(x, y) - 0.05)
            trees += 1
        elif shrubs < SHRUBS:
            plant(KIT_SHRUBS[rng.randrange(len(KIT_SHRUBS))], (x, y), rng.uniform(0.6, 1.4), rng.uniform(0, 6.28), terrain_z(x, y) - 0.03)
            shrubs += 1
    # low planting along the apron's outer edge, between the grounds and the land
    for k in range(EDGE):
        t = (k + rng.uniform(-0.3, 0.3)) / EDGE
        side = int(t * 4)
        a = (t * 4 - side) * 2 * E - E
        x, y = [(a, -E + 0.7), (E - 0.7, a), (a, E - 0.7), (-E + 0.7, a)][side]
        plant(KIT_SHRUBS[rng.randrange(3)], (x, y), rng.uniform(0.45, 0.7), rng.uniform(0, 6.28), 0.0)
    print(f"COLONY plate kit plants: {trees} trees, {shrubs} shrubs, {EDGE} edge shrubs", flush=True)
else:
    tree = load("island_tree_01")[0]
    recentre(tree)
    th = core.mdims(tree).z
    placed = 0
    for _ in range(6000):
        if placed >= 40:
            break
        x, y = rng.uniform(-80, 80), rng.uniform(-80, 80)
        if not (E + 2 < max(abs(x), abs(y)) < E + BELT) or fade_r(x, y) > 0.85 or in_front(x, y):
            continue
        s = rng.uniform(3.5, 6.5) / th
        place(tree, (x, y), z=terrain_z(x, y) - 0.08, rot=rng.uniform(0, 6.28), scale=(s, s, s))
        placed += 1
    core.unlink(tree)
for k in range(90):
    x, y = rng.uniform(-75, 75), rng.uniform(-75, 75)
    if max(abs(x), abs(y)) < E + 1 or fade_r(x, y) > 0.8:
        continue
    s = rng.uniform(0.3, 1.0)
    place(rocks, (x, y), z=terrain_z(x, y), rot=rng.uniform(0, 6), scale=(s, s, s * 0.6), sink=0.1)
core.unlink(rocks)

# ---------- light, camera, render ----------

light.rig()
frame.camera(FR, target=(0, 0, 0))
frame.setup(SAMPLES, PCT, FR)
hall = frame.where((0, 0, 0))  # in full-resolution pixels, whatever PCT
meta = {"frame": FR, "hall": list(hall), "px_per_m": PXM, "place_step": [round(SL * math.sqrt(0.5) * PXM, 2), round(SL * math.sqrt(0.5) / 2 * PXM, 2)],
        "grid": {"places": N, "hall": list(HALL), "x": f"12 (col - {HALL[0]})", "y": f"-12 (row - {HALL[1]})", "depth": "col + row"}}
os.makedirs(OUT, exist_ok=True)
json.dump(meta, open(os.path.join(OUT, f"plate{N}.json"), "w"), indent=1)
print(f"COLONY plate built t+{time.time() - T0:.0f}s; hall centre at px {hall} (full resolution)", flush=True)
for li in LIGHTS:
    light.apply("lit" if li == "dusk" else li)  # the plate is the bottom layer: its dusk carries its own lamps lit
    bpy.context.scene.render.filepath = os.path.join(OUT, f"plate{N}-{li}.png")
    t1 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"COLONY render plate{N}-{li} {time.time() - t1:.1f}s at {SAMPLES} samples", flush=True)
