"""The Stadium on 2 x 2 places (spec AM-2): a real bowl that dwarfs the Hospital, in every RULE-1 stage
(site, build1, build2, standing, closed, damaged). Accent: teal stands, white floodlights.
  bowl      22 x 19 m, its main stand at the back (north-west) rising to 9.5 m under a roof, the near stand low (3.2 m)
            so the pitch shows from this camera; a glazed concourse band round the outside wall
  pitch     striped grass with lines and goals inside a running track
  lights    four 15 m floodlight masts at the corners, a scoreboard on the main stand
Run: blender -b -P stadium.py -- <out-dir> [samples=256] [stages=all] [lights=day,dusk,glow] [percent=100]"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import frame, kits, props  # noqa: E402
from lib.props import ATL, CZ, LND, MTM, WDC, kit, site_props  # noqa: E402,F401
from lib.core import T, ZT, accent, box_uv, bx, cyl, flat, glass_mat, light, link, mat, math_, mesh_obj, mix, new_mat, node  # noqa: E402

STAGES = ["site", "build1", "build2", "standing", "closed", "damaged"]  # buildMonths 3: two build pictures
FRAME = {"width": 3200, "height": 2600, "centre": [1600, 1900], "places": 2}
SEG = 128
RX, RY = 11.4, 10.2  # outer wall
IX, IY = 6.7, 5.5  # inner edge of the stands
PX, PY = 5.7, 4.5  # pitch
BACK = math.radians(135)  # the main stand faces the camera from the north-west
TIERS = 11
MASTS = [(-10.6, -10.6), (10.6, 10.6), (-11.4, 5.0), (-5.0, 11.4)]  # west and east sides, two behind the main stand



def top(t):
    """Height of the bowl's rim at angle t: 8 m at the main stand, 3 m at the near stand."""
    return 3.0 + 5.0 * ((1 + math.cos(t - BACK)) / 2) ** 1.3


def ell(rx, ry, t):
    return rx * math.cos(t), ry * math.sin(t)


def band(name, pts_a, pts_b, m):
    """A closed strip between two rings of points (each SEG long)."""
    v = pts_a + pts_b
    f = [(k, (k + 1) % SEG, SEG + (k + 1) % SEG, SEG + k) for k in range(SEG)]
    o = mesh_obj(name, v, f, m)
    box_uv(o)
    return o


def pitch_mat(dry=False):
    m, nt, b = new_mat("pitch")
    P = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    mp = node(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / 1.5, 1 / 1.5, 1)
    link(nt, P, mp.inputs["Vector"])
    im = node(nt, "ShaderNodeTexImage", image=bpy.data.images.load(os.path.join(T, "Grass004", "Grass004_1K-JPG_Color.jpg"), check_existing=True))
    link(nt, mp.outputs[0], im.inputs["Vector"])
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, P, sep.inputs[0])
    k = math_(nt, "ADD", math_(nt, "MULTIPLY", math_(nt, "SIGN", math_(nt, "SINE", math_(nt, "MULTIPLY", sep.outputs["X"], math.pi / 1.1))), 0.1), 0.88)
    kk = node(nt, "ShaderNodeCombineColor")
    for i in range(3):
        link(nt, k, kk.inputs[i])
    link(nt, mix(nt, 1.0, mix(nt, 1.0, im.outputs["Color"], (0.72, 0.95, 0.55, 1) if not dry else (0.95, 0.8, 0.45, 1), "MULTIPLY"), kk.outputs[0], "MULTIPLY"), b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.85
    return m


def build(stage):
    """site: the shared site kit on one 2 x 2 slab. build1 (1/3): the bowl's frame, its lower tiers in bare concrete,
    the pitch still earth, a crane. build2 (2/3): every tier, seats going in from the bottom, glass and cladding on,
    roof masts without the membrane, floodlight masts without heads. closed: faded, dark, fenced. damaged: a bite out
    of the near wall, a floodlight mast down, rubble and an ember."""
    if stage == "site":
        kits.site(0, 0, 20.0, 18.0, n=2, cabin_at=(6.0, 10.3), heaps=not props.on())  # with kits, the sand mound (dress)
        return
    b1, b2, closed, damaged = (stage == s for s in ("build1", "build2", "closed", "damaged"))
    building = b1 or b2
    kits.slab(top="earth" if building else "pavers", n=2)
    before = set(bpy.context.scene.objects)
    if closed:
        teal, teal2 = flat("stadium_teal_faded", (0.16, 0.24, 0.25), 0.75), flat("stadium_teal_faded_dark", (0.11, 0.16, 0.17), 0.75)
        clad = kits.faded("stadium", (0.42, 0.43, 0.44))
    else:
        teal = accent("stadium_teal", (0.02, 0.4, 0.45), rough=0.55)
        teal2 = accent("stadium_teal_dark", (0.01, 0.25, 0.29), rough=0.55)
        clad = mat("clad")
    white, dark, concrete = mat("whitemetal"), mat("darkmetal"), mat("concrete")
    lit = stage == "standing"  # only a standing stadium has its band, scoreboard and floodlights on
    stripe = accent("stadium_band", (0.02, 0.55, 0.6) if not closed else (0.15, 0.25, 0.26), glow=2.5 if lit else 0, emit=(0.2, 0.95, 1.0))
    glass = mat("glass") if lit else mat("dead_glass") if (closed or b2) else glass_mat("window_glass_empty", lit_share=0.0)
    ts = [2 * math.pi * k / SEG for k in range(SEG)]
    zp = ZT + 0.35
    ring = lambda rx, ry, zf: [(*ell(rx, ry, t), zf(t)) for t in ts]  # noqa: E731
    up = 0.45 if b1 else 1.0  # how far the bowl has risen

    # the outside wall: a glazed concourse band, a clad wall above it to the rim, a lit teal band under the lip
    band("concourse_base", ring(RX, RY, lambda t: ZT), ring(RX, RY, lambda t: ZT + 0.35), concrete)
    if not b1:
        band("concourse_glass", ring(RX - 0.25, RY - 0.25, lambda t: ZT), ring(RX - 0.25, RY - 0.25, lambda t: ZT + 2.6), glass)
        band("stadium_wall", ring(RX, RY, lambda t: ZT + 2.6), ring(RX, RY, lambda t: top(t) - 0.45), clad if not b2 else concrete)
        band("stadium_lip_top", ring(RX, RY, lambda t: top(t)), ring(RX - 0.4, RY - 0.4, lambda t: top(t)), white if not b2 else concrete)
    if not building:
        band("stadium_band", ring(RX + 0.01, RY + 0.01, lambda t: top(t) - 0.45), ring(RX + 0.01, RY + 0.01, lambda t: top(t) - 0.15), stripe)
        band("stadium_lip", ring(RX, RY, lambda t: top(t) - 0.15), ring(RX, RY, lambda t: top(t)), white)
        for k in range(0, SEG, 8):  # white fins up the wall, standing proud of the cladding
            t = ts[k]
            x, y = ell(RX + 0.12, RY + 0.12, t)
            f = bx(-0.09, 0.09, -0.16, 0.16, ZT + 2.6, top(t) - 0.45, white, 0.01, "fin")
            f.location = (x, y, 0)
            f.rotation_euler = (0, 0, math.atan2(y, x))
    for k in range(0, SEG, 4):  # concourse columns; while building, the bare frame rising to the bowl's height
        x, y = ell(RX, RY, ts[k])
        cyl("concourse_column", x, y, 0.1 if not b1 else 0.2, ZT, ZT + 2.6 if not b1 else ZT + (top(ts[k]) - ZT) * up, white if not b1 else concrete, 10)

    # the stands: stepped rings from the pitch side up to the rim, each tread a row of seats
    def zs(s_, t):
        return zp + 0.5 + (top(t) - 0.4 - zp - 0.5) * s_ / TIERS

    def rs(s_):
        f = s_ / TIERS
        return IX + (RX - 0.4 - IX) * f, IY + (RY - 0.4 - IY) * f

    for s_ in range(round(TIERS * up)):
        (ax, ay), (bx_, by) = rs(s_), rs(s_ + 1)
        band("riser", ring(ax, ay, lambda t: zs(s_, t)), ring(ax, ay, lambda t: zs(s_ + 1, t)), concrete)
        seats = (teal if s_ % 3 else teal2) if not building or (b2 and s_ < TIERS // 2) else concrete
        band("tread", ring(ax, ay, lambda t: zs(s_ + 1, t)), ring(bx_, by, lambda t: zs(s_ + 1, t)), seats)
    band("stand_front", ring(IX, IY, lambda t: zp), ring(IX, IY, lambda t: zs(0, t)), white if not building else concrete)

    # the track and the pitch (earth until build2 lays the turf)
    tv = [(0, 0, zp)] + ring(IX, IY, lambda t: zp)
    mesh_obj("track", tv, [(0, 1 + k, 1 + (k + 1) % SEG) for k in range(SEG)], flat("track", (0.5, 0.17, 0.1), 0.85) if not b1 else mat("earth"))
    pv = [(0, 0, zp + 0.01)] + ring(PX, PY, lambda t: zp + 0.01)
    mesh_obj("pitch", pv, [(0, 1 + k, 1 + (k + 1) % SEG) for k in range(SEG)], mat("earth") if b1 else pitch_mat(dry=closed))
    if not building:
        lw, z = 0.06, zp + 0.02
        hx, hy = PX * 0.74, PY * 0.74
        line = flat("pitch_line", (0.92, 0.93, 0.92), 0.6)
        for (a, b_, c, d) in ((-hx, hx, -hy, -hy + lw), (-hx, hx, hy - lw, hy), (-hx, -hx + lw, -hy, hy), (hx - lw, hx, -hy, hy), (-lw / 2, lw / 2, -hy, hy),
                              (-hx, -hx + 1.2, -1.4, -1.4 + lw), (-hx, -hx + 1.2, 1.4 - lw, 1.4), (-hx + 1.2 - lw, -hx + 1.2, -1.4, 1.4),
                              (hx - 1.2, hx, -1.4, -1.4 + lw), (hx - 1.2, hx, 1.4 - lw, 1.4), (hx - 1.2, hx - 1.2 + lw, -1.4, 1.4)):
            bx(a, b_, c, d, z, z + 0.008, line, 0, "pitch_line")
        for k in range(48):
            t = 2 * math.pi * k / 48
            bx(0.9 * math.cos(t) - 0.035, 0.9 * math.cos(t) + 0.035, 0.9 * math.sin(t) - 0.035, 0.9 * math.sin(t) + 0.035, z, z + 0.008, line, 0, "pitch_line")
        for sx in (-1, 1):  # goals
            gx = sx * hx
            for gy in (-0.75, 0.75):
                cyl("goal_post", gx, gy, 0.04, z, z + 0.8, line, 8)
            bx(gx - 0.04, gx + 0.04, -0.79, 0.79, z + 0.76, z + 0.84, line, 0, "goal_bar")

    # the main stand's roof: a white membrane cantilevered from the rim over the top rows, on dark masts
    roof_ts = [t for t in ts if math.cos(t - BACK) > 0.4]
    if not b1:
        for t in roof_ts[::6]:
            x, y = ell(RX, RY, t)
            cyl("roof_mast", x, y, 0.1, top(t), top(t) + 0.95, dark, 10)
    if not building:
        rv, rf = [], []
        for t in roof_ts:
            rv += [(*ell(RX + 0.1, RY + 0.1, t), top(t) + 0.9), (*ell(RX - 2.6, RY - 2.6, t), top(t) + 0.45)]
        for k in range(len(roof_ts) - 1):
            rf.append((2 * k, 2 * k + 2, 2 * k + 3, 2 * k + 1))
        roof = mesh_obj("roof", rv, rf, flat("roof_membrane_white", (0.9, 0.9, 0.88) if not closed else (0.6, 0.6, 0.58), 0.4))
        roof.modifiers.new("thick", "SOLIDIFY").thickness = 0.12
        t = BACK  # a scoreboard on the main stand's roof, facing the pitch and the camera
        x, y = ell(RX - 1.2, RY - 1.2, t)
        screen = accent("scoreboard", (0.04, 0.05, 0.06), glow=3.0 if lit else 0, emit=(0.4, 0.85, 1.0), rough=0.2)
        sb = bx(-2.0, 2.0, -0.12, 0.12, 0, 1.6, dark, 0.02, "scoreboard")
        sf = bx(-1.85, 1.85, -0.16, -0.12, 0.12, 1.48, screen, 0, "scoreboard_face")
        for o in (sb, sf):
            o.location = (x, y, top(t) + 0.9)
            o.rotation_euler = (0, 0, t - math.pi / 2)  # its face (local -y) toward the pitch and the camera

    # floodlights: four 15 m masts, two at the sides and two behind the main stand, heads tilted at the centre spot.
    # None stands in front: from this camera a front mast's pole would cut across the bowl.
    if not b1:
        for (mx, my) in MASTS:
            bx(mx - 0.5, mx + 0.5, my - 0.5, my + 0.5, ZT, ZT + 0.5, concrete, 0.02, "flood_foot")
            if damaged and (mx, my) == MASTS[0]:  # the west mast is down, lying along the south forecourt
                m_ = cyl("flood_mast", 0, 0, 0.16, 0, 15.0, dark, 12)
                m_.location = (mx, my, ZT + 0.5)
                m_.rotation_euler = (0, math.radians(88), math.radians(-4))
                continue
            cyl("flood_mast", mx, my, 0.16, ZT, 15.0, dark, 12)
            if b2:
                continue
            head = bx(-1.3, 1.3, -0.15, 0.15, -0.8, 0.8, dark, 0.02, "flood_head")
            face = bx(-1.2, 1.2, -0.2, -0.15, -0.72, 0.72, accent("flood_face", (0.9, 0.92, 0.95), glow=25.0 if lit else 0, emit=(0.92, 0.95, 1.0)), 0, "flood_face")
            d = Vector((-mx, -my, zp - 15.4))
            for o in (head, face):
                o.location = (mx, my, 15.4)
                o.rotation_mode = "QUATERNION"
                o.rotation_quaternion = Vector((0, -1, 0)).rotation_difference(d.normalized())
            if lit:
                S = light("SPOT", (mx, my, 15.4), 2500, (0.92, 0.95, 1.0), 0.5)
                S.rotation_euler = (-d).to_track_quat("Z", "Y").to_euler()
                S.data.spot_size = math.radians(60)
                S.data.spot_blend = 0.5

    if building:
        kits.crane(10.4, 10.4, 14.0, jib=12.0, counter=3.5)
        kits.work_light(-10.0, -10.0, (0, 0))
        kits.work_light(10.0, -10.0, (2, 0))
    if closed:
        kits.fence(-6.0, 6.0, -10.9, 2.0)
        kits.fence_y(11.0, -5.0, 5.0, 2.0)
    if damaged:
        a = math.radians(-50)
        bx_c = (*ell(RX, RY, a), 3.0)
        kits.bite(set(bpy.context.scene.objects) - before, bx_c, 3.6, seed=2.0)
        kits.rubble(bx_c[0] + 0.6, bx_c[1] - 0.8, 2.0, [clad, concrete], n=34, seed=6)
        kits.scorch(bx_c[0] - 1.5, bx_c[1] + 1.2, 2.4, z=zp + 0.03)
        kits.ember(bx_c[0] - 1.4, bx_c[1] + 1.2, 2.4, r=0.4, energy=90)


def dress(stage):
    """Kit dressing (KITS_DIR set), only where the bowl leaves room (its corners): site gear; a dumpster, pallets and a
    mixer while it rises; a tree behind the main stand and low planting at the front corner once it stands; rubble at
    the break when damaged. No tall planting at the front: it would cross the bowl from this camera."""
    if stage == "site":
        site_props(2)
    elif stage in ("build1", "build2"):
        kit([(CZ, "KB3D_CSZ_PropDumpster_B", (9.3, -9.3), 0.785), (CZ, "KB3D_CSZ_PropBrickPallet_B", (7.4, -10.6), 0.0),
             (CZ, "KB3D_CSZ_PropCementBagPallet_A", (5.8, -10.8), 0.2), (CZ, "KB3D_CSZ_PropConcreteMixer_A", (10.4, -6.6), 1.57),
             (CZ, "KB3D_CSZ_PropPowerGenerator_B", (-9.8, -8.2), 0.785)])
    else:
        kit([(LND, "KB3D_LND_PropTree_B", (-10.0, 10.0), 0.6), (WDC, "KB3D_WDC_PropFoliage_A", (9.6, -9.6), 0.0),
             (LND, "KB3D_LND_PropShrub_E", (7.6, -10.6), 0.3), (LND, "KB3D_LND_PropShrub_E", (10.6, -7.6), 1.3)])
        if stage == "damaged":
            kit([(MTM, "KB3D_MTM_PropRubble_A", (8.8, -9.2), 0.785), (MTM, "KB3D_MTM_PropRubble_A", (5.8, -9.8), 0.2)])


if __name__ == "__main__":
    frame.run("stadium", STAGES, build, fr=FRAME, dress=dress)
