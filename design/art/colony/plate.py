"""The grounds plate: the 5 x 5 grounds and the planet round them as ONE picture in the shared camera (lib/frame:
the same angle, px per metre and sun), so flush building layers (COLONY_FLUSH=1) composite onto it by pixel offset
alone and the whole reads like ring.py's colony still.
  places (col, row), 0..4, the hall at (2, 2) on the world origin; x = 12 (col - 2), y = -12 (row - 2), so a place
  step is (+-646.5, +-323.25) px and depth order is col + row (higher is nearer the camera).
  content: look.html's platform (every place a raised stone slab, its top at z = 0 where the flush layers lie, a
  worn apron sunk round the grounds), graded ground on every place (the building layers cover it), lamps on the
  outer apron and only their light at the inner crossings, ring.py's grass-and-dirt terrain fading out in a
  vignette, look.html's sparse olive trees on it and low kit shrubs (from $KITS_DIR when set). Tall things stay
  off the strip in front of the grounds, where the building layers, drawn over the plate, would cover them.
  extent: the grounds ColonyGrounds draws (RULE-4, the highest place in use): 3 (the hall's ring) or 5. Each extent
  has its own frame, vignette and tree belt just outside its ring; all share the camera and px per metre, so a
  building layer drops on any of them at the same offset from the hall's pixel.
Run: blender -b -P plate.py -- <out-dir> [samples=128] [lights=day,dusk,glow] [percent=100] [extent=5]
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
LIGHTS = argv[2].split(",") if len(argv) > 2 and argv[2] else ["day", "dusk", "glow"]
PCT = int(argv[3]) if len(argv) > 3 else 100
N = int(argv[4]) if len(argv) > 4 else 5

HALL = (N // 2, N // 2)  # the hall's place, in this extent's own grid
G = SL * N / 2  # the grounds' half-size: 18 m (3 x 3), 30 m (5 x 5)
AP = 2.5  # the apron beyond the outer places
E = G + AP
# framed the way ring.py frames look.html's colony, so the vignette falls off the same: 16:9, 1.463 x the grounds'
# screen width (ring: 109.65 m for its 74.95 m grounds and apron), the grounds' centre 66.9 % down (room above for the
# rocket), the land cut by the bottom edge. 76.19 px/m always; the hall is the grounds' centre here.
LOOK_W = 109.65
_w = round(1.463 * 2 * E * math.sqrt(2) * frame.PX_PER_M / 32) * 32
FR = {"width": _w, "height": _w * 9 // 16, "centre": [_w // 2, round(0.669 * _w * 9 / 16)]}  # 3: 6464 x 3636, 5: 10240 x 5760
BELT = 70.0  # trees across the whole oval, as ring.py (the fade and the front strip bound them)
SHRUBS, EDGE = (50, 40) if N == 3 else (80, 64)
PXM = frame.PX_PER_M
T0 = time.time()


def cell(c, r):
    return SL * (c - HALL[0]), -SL * (r - HALL[1])


def to_screen(x, y, z=0.0):
    """Screen metres for the shared camera, from the hall's centre: u to the right, v up."""
    return 0.7071 * (x + y), 0.3536 * (y - x) + 0.866 * z


U0, U1 = -FR["centre"][0] / PXM, (FR["width"] - FR["centre"][0]) / PXM
V0, V1 = -(FR["height"] - FR["centre"][1]) / PXM, FR["centre"][1] / PXM
# ring.py's fade: centred 3 m (scaled) above the grounds' centre, 0.47 of the frame wide, reaching the bottom edge
FC = (0.0, 3.0 * (U1 - U0) / LOOK_W)
FADE = {"centre": FC, "ru": (U1 - U0) * 0.47, "rv": FC[1] - V0}


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
    return -0.97 + lift ** 1.4 * 1.6 * noise.noise(Vector((x * 0.045, y * 0.045, 0.3))) + lift ** 1.2 * 0.25 * noise.noise(Vector((x * 0.2, y * 0.2, 1.7)))


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
# look.html's platform (ring.py): every place a raised stone slab, its top at z = 0 where the flush building layers
# lie; a worn paved apron sunk 0.62 m round the grounds; the planet's terrain below that.
APRON_TOP = -0.62

core.reset()
props.reset()
MEADOW = ground_mat(False)
apron = core.pbr("plaza_pavers", "square_concrete_pavers", 1.2, tint=(0.78, 0.79, 0.8))
worn(apron)
bx(-E, E, -E, E, -0.95, APRON_TOP, apron, 0.02, "apron")
rocks = load("moon_rock_03")[0]
recentre(rocks)
stake = flat("survey_stake", (0.95, 0.42, 0.06), 0.5)
for c in range(N):
    for r in range(N):
        cx, cy = cell(c, r)  # room to grow, as ring.py: rough ground with grass through it, stakes, loose stones
        kits.slab(cx, cy, top=None)
        bx(cx - 6 + RIM, cx + 6 - RIM, cy - 6 + RIM, cy + 6 - RIM, -0.02, ZT + 0.03, MEADOW, 0.004, "rough_ground")
        rng = random.Random(int(cx * 7 + cy * 13))
        w = rng.uniform(5.5, 7.5)
        for (sx, sy) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            bx(cx + sx * w / 2 - 0.05, cx + sx * w / 2 + 0.05, cy + sy * w / 2 - 0.05, cy + sy * w / 2 + 0.05, ZT, ZT + 0.75, stake, 0.005, "stake")
        for k in range(4):
            s = rng.uniform(0.18, 0.35)
            place(rocks, (cx + rng.uniform(-4, 4), cy + rng.uniform(-4, 4)), z=ZT, rot=rng.uniform(0, 6), scale=(s, s, s * 0.7), sink=0.05)

# lamps. Heads and posts only on the outer apron, where every walkway meets it: no place layer can cover them there.
# Each inner crossing is the near corner of the place behind it, whose building layer would cover a lamp head, so
# there the plate keeps only the lamp's warm pool (a light with no head; dusk and glow). Inner heads: a per-row front
# overlay in the compositor, a follow-up.
lines = [-G + SL * k for k in range(1, N)]
LAMP = float(os.environ.get("COLONY_PLATE_LAMP", "110"))  # W per lamp; env for calibration runs only
for t in lines:
    for (x, y) in ((t, -E + 1.25), (E - 1.25, t), (t, E - 1.25), (-E + 1.25, t)):
        kits.lamp(x, y, z0=APRON_TOP, energy=LAMP)
for x in lines:
    for y in lines:
        core.light("POINT", (x, y, 3.0 - 0.16), LAMP, (1.0, 0.66, 0.36), 0.13)

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

# trees: look.html's own sparse olive (the CC0 island tree ring.py uses; no kit has an olive) at its density,
# 22 in its 109.6 x 61.7 m frame, scaled to this frame's area; never on the strip in front of the grounds
rng = random.Random(9)
tree = load("island_tree_01")[0]
recentre(tree)
th = core.mdims(tree).z
want = round(22 * (FR["width"] * FR["height"]) / (PXM * PXM) / (109.65 * 61.7))
placed = 0
for _ in range(8000):
    if placed >= want:
        break
    x, y = rng.uniform(-80, 80), rng.uniform(-80, 80)
    if not (E + 2 < max(abs(x), abs(y)) < E + BELT) or fade_r(x, y) > 0.85 or in_front(x, y):
        continue
    s = rng.uniform(3.5, 6.5) / th
    place(tree, (x, y), z=terrain_z(x, y) - 0.08, rot=rng.uniform(0, 6.28), scale=(s, s, s))
    placed += 1
core.unlink(tree)
shrubs = 0
if props.on():  # keep the low kit shrubs, on the land and along the apron's outer edge
    for _ in range(6000):
        if shrubs >= SHRUBS:
            break
        x, y = rng.uniform(-80, 80), rng.uniform(-80, 80)
        if not (E + 1.5 < max(abs(x), abs(y)) < E + BELT) or fade_r(x, y) > 0.86:
            continue
        plant(KIT_SHRUBS[rng.randrange(len(KIT_SHRUBS))], (x, y), rng.uniform(0.5, 1.1), rng.uniform(0, 6.28), terrain_z(x, y) - 0.03)
        shrubs += 1
    for k in range(EDGE):
        t = (k + rng.uniform(-0.3, 0.3)) / EDGE
        side = int(t * 4)
        a = (t * 4 - side) * 2 * E - E
        x, y = [(a, -E + 0.5), (E - 0.5, a), (a, E - 0.5), (-E + 0.5, a)][side]
        plant(KIT_SHRUBS[rng.randrange(3)], (x, y), rng.uniform(0.4, 0.6), rng.uniform(0, 6.28), APRON_TOP)
print(f"COLONY plate: {placed} olive trees, {shrubs} kit shrubs, {EDGE if props.on() else 0} edge shrubs, "
      f"{4 * len(lines)} apron lamps, {len(lines) ** 2} inner light pools", flush=True)
for k in range(70):
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
    light.apply(li)  # day, dusk, glow: the same three passes as every building layer
    light.R["fill"].hide_render = True  # the dusk fill is the colony's light on its facades; the plate has none (it
    # turned the plinth's stone sides orange and lifted the land at the frame's bottom edge to 1.8 x look.html's)
    bpy.context.scene.render.filepath = os.path.join(OUT, f"plate{N}-{li}.png")
    t1 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"COLONY render plate{N}-{li} {time.time() - t1:.1f}s at {SAMPLES} samples", flush=True)
