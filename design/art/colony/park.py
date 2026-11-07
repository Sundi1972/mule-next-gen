"""The Park (park-spec.json) in its RULE-1 stages: site, build1, standing, closed, damaged; each day / dusk / glow
(closed: no glow). Ported from spike-park/park.py, the approved look. buildMonths 1, so one build picture.
  site      the shared site kit
  build1    hardscape done (rim, gravel, plinth, kerbs), the lawn still earth, the pond dug dry, saplings, lamp posts
            without globes, turf on a pallet, a cabin and two work lights
  standing  the spike's Park
  closed    lawn and flowers dried out, the pond murky, gates across every path, lamps dark
  damaged   the smaller tree fallen across the bench, a scorched patch at its root, one lamp knocked askew; an ember
Run: blender -b -P park.py -- <out-dir> [samples=256] [stages=all] [lights=day,dusk,glow] [percent=100]
Metres; x east, y north, z up."""
import json
import math
import os
import random
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector, noise

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import frame, kits, props  # noqa: E402
from lib.core import (T, ZT, block, bounds, box_uv, bx, coll, cyl, flat, light, link, load, mat, math_, mdims,  # noqa: E402
                      mesh_obj, mix, new_mat, node, pbr, place, recentre, shadow_see_through, sock, tex, unlink)

STAGES = ["site", "build1", "standing", "closed", "damaged"]
SPEC = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "park-spec.json")))
TILE = SPEC["tile"]
HALF = TILE / 2
RIM = SPEC["slab"]["rim"]
INNER = HALF - RIM
PW = SPEC["paths"]["width"] / 2
PLAZA = SPEC["plaza"]["radius"]
POND = SPEC["pond"]
BED = SPEC["flowerBed"]
RIM_TOP = 0.05  # the paved rim stands a kerb's height above the lawn, so the lawn reads as set in
LH = SPEC["lamps"]["height"]
GR = 0.16
FALLEN = 1  # the 4.2 m tree, front left: in `damaged` it lies across the south path
SCORCH = (-1.3, -4.3, 1.9)  # x, y, r of the burn on open lawn in front of the fallen tree, where the camera sees it
HOLE = (-3.8, -3.75, 0.7)  # x, y, r of the hole the root mass tore out of the lawn
LND = "kb3d_london"
KIT_TREES = ["KB3D_LND_PropTree_B", "KB3D_LND_PropTree_C"]  # with KITS_DIR: London plane trees for the spec's two
KIT_SAPLING = "KB3D_LND_PropShrub_F"  # a 3.1 m upright shrub, scaled to a 1.9 m staked sapling
KIT_HEDGE = ["KB3D_LND_PropShrub_C", "KB3D_LND_PropShrub_E"]


# ---------- layout geometry (shared by mesh, hair and shader) ----------

def gravel_d(x, y):
    """Signed distance to the gravel: plaza disc plus the four spokes (a cross the path width wide)."""
    return min(math.hypot(x, y) - PLAZA, min(abs(x), abs(y)) - PW)


def pond_edge(t):
    """The kidney's edge radius at local angle t. Local u runs along the NW-SE diagonal, v toward the NE corner;
    the hollow is a bite out of the -v side, the side facing the plaza, deep enough for the NE lamp to stand in it."""
    rx, ry = POND["rx"], POND["ry"]
    e = 1 / math.hypot(math.cos(t) / rx, math.sin(t) / ry)
    d = (t + math.pi / 2 + math.pi) % (2 * math.pi) - math.pi
    return e - 0.75 * math.exp(-((d / 0.55) ** 2))


def pond_xy(t, r):
    (cx, cy) = POND["center"]
    q = pond_edge(t) * r
    u, v = q * math.cos(t), q * math.sin(t)
    return cx + (u + v) / math.sqrt(2), cy + (v - u) / math.sqrt(2)


def pond_r(x, y):
    (cx, cy) = POND["center"]
    dx, dy = x - cx, y - cy
    u, v = (dx - dy) / math.sqrt(2), (dx + dy) / math.sqrt(2)
    return math.hypot(u, v) / pond_edge(math.atan2(v, u))


def bed_r(x, y):
    return math.hypot(x - BED["center"][0], y - BED["center"][1])


# ---------- materials ----------

def burn_mask(nt, P, burn):
    """1 at the heart of a burn, 0 outside it, with a noise-ragged edge; from the shading point's distance in x, y."""
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, P, sep.inputs[0])
    dx, dy = math_(nt, "SUBTRACT", sep.outputs["X"], burn[0]), math_(nt, "SUBTRACT", sep.outputs["Y"], burn[1])
    d = math_(nt, "DIVIDE", math_(nt, "SQRT", math_(nt, "ADD", math_(nt, "MULTIPLY", dx, dx), math_(nt, "MULTIPLY", dy, dy))), burn[2])
    nz = node(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 1.6
    nz.inputs["Detail"].default_value = 6
    link(nt, P, nz.inputs["Vector"])
    d = math_(nt, "ADD", d, math_(nt, "MULTIPLY", math_(nt, "SUBTRACT", nz.outputs["Fac"], 0.5), 0.7))
    mr = node(nt, "ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.45
    mr.inputs["From Max"].default_value = 1.0
    mr.inputs["To Min"].default_value = 1.0
    mr.inputs["To Max"].default_value = 0.0
    link(nt, d, mr.inputs["Value"])
    return mr.outputs[0]


def grass_color(nt, P, state, burn=None):
    """Two photo lawns blended by a slow noise, patchy brightness, faint mowing stripes. Dry: toward straw.
    burn (x, y, r): the grass scorched brown toward the edge and black at the heart."""
    m1 = node(nt, "ShaderNodeMapping")
    m1.inputs["Scale"].default_value = (1 / 1.5, 1 / 1.5, 1)
    link(nt, P, m1.inputs["Vector"])
    m2 = node(nt, "ShaderNodeMapping")
    m2.inputs["Scale"].default_value = (1 / 1.9, 1 / 1.9, 1)
    m2.inputs["Rotation"].default_value = (0, 0, 0.7)
    link(nt, P, m2.inputs["Vector"])
    g4 = tex(nt, os.path.join(T, "Grass004", "Grass004_1K-JPG_Color.jpg"), m1.outputs[0]).outputs["Color"]
    g1 = tex(nt, os.path.join(T, "Grass001", "Grass001_1K-JPG_Color.jpg"), m2.outputs[0]).outputs["Color"]
    nz = node(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 0.35
    nz.inputs["Detail"].default_value = 3
    link(nt, P, nz.inputs["Vector"])
    ramp = node(nt, "ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.38
    ramp.inputs["From Max"].default_value = 0.62
    link(nt, nz.outputs["Fac"], ramp.inputs["Value"])
    c = mix(nt, ramp.outputs[0], g4, g1)
    nz2 = node(nt, "ShaderNodeTexNoise")
    nz2.inputs["Scale"].default_value = 1.1
    link(nt, P, nz2.inputs["Vector"])
    br = node(nt, "ShaderNodeMapRange")
    br.inputs["To Min"].default_value = 0.82
    br.inputs["To Max"].default_value = 1.12
    link(nt, nz2.outputs["Fac"], br.inputs["Value"])
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, P, sep.inputs[0])
    stripe = math_(nt, "SIGN", math_(nt, "SINE", math_(nt, "MULTIPLY", sep.outputs["X"], math.pi / 1.1)))
    k = math_(nt, "MULTIPLY", math_(nt, "ADD", math_(nt, "MULTIPLY", stripe, 0.045 if state == "green" else 0.0), 1.0), br.outputs[0])
    kk = node(nt, "ShaderNodeCombineColor")
    for i in range(3):
        link(nt, k, kk.inputs[i])
    c = mix(nt, 1.0, c, kk.outputs[0], "MULTIPLY")
    if state == "dry":  # unwatered for months: straw with green only in the damp patches
        c = mix(nt, math_(nt, "ADD", math_(nt, "MULTIPLY", ramp.outputs[0], 0.25), 0.62), c, (0.36, 0.29, 0.15, 1))
    if burn:
        k = burn_mask(nt, P, burn)
        c = mix(nt, math_(nt, "MINIMUM", math_(nt, "MULTIPLY", k, 2.5), 1.0), c, (0.13, 0.085, 0.04, 1))  # scorched brown
        c = mix(nt, math_(nt, "POWER", k, 0.6), c, (0.012, 0.011, 0.01, 1))  # charred black at the heart
    return c


def earth_color(nt, P):
    """Bare graded earth, the colony ground's: pebbles under a brown wash."""
    mp = node(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (1 / 1.6, 1 / 1.6, 1)
    link(nt, P, mp.inputs["Vector"])
    peb = tex(nt, os.path.join(T, "clean_pebbles", "clean_pebbles_diff_1k.jpg"), mp.outputs[0]).outputs["Color"]
    return mix(nt, 1.0, peb, (0.5, 0.38, 0.27, 1), "MULTIPLY")


def ground_mat(state, burn=None):
    m, nt, b = new_mat("ground")
    P = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    soil_or_grass = earth_color(nt, P) if state == "earth" else grass_color(nt, P, state, burn)
    gm = node(nt, "ShaderNodeMapping")
    gm.inputs["Scale"].default_value = (0.5, 0.5, 1)
    link(nt, P, gm.inputs["Vector"])
    gd = os.path.join(T, "gravel_floor_02")
    gcol = mix(nt, 1.0, tex(nt, os.path.join(gd, "gravel_floor_02_diff_1k.jpg"), gm.outputs[0]).outputs["Color"], (1.08, 1.05, 1.0, 1), "MULTIPLY")
    garm = node(nt, "ShaderNodeSeparateColor")
    link(nt, tex(nt, os.path.join(gd, "gravel_floor_02_arm_1k.jpg"), gm.outputs[0], True).outputs[0], garm.inputs[0])
    # gravel mask, the same signed distance as gravel_d() plus a ragged noise edge
    sep = node(nt, "ShaderNodeSeparateXYZ")
    link(nt, P, sep.inputs[0])
    ax, ay = math_(nt, "ABSOLUTE", sep.outputs["X"]), math_(nt, "ABSOLUTE", sep.outputs["Y"])
    cross = math_(nt, "SUBTRACT", math_(nt, "MINIMUM", ax, ay), PW)
    cxy = node(nt, "ShaderNodeCombineXYZ")
    link(nt, sep.outputs["X"], cxy.inputs["X"])
    link(nt, sep.outputs["Y"], cxy.inputs["Y"])
    ln = node(nt, "ShaderNodeVectorMath", operation="LENGTH")
    link(nt, cxy.outputs[0], ln.inputs[0])
    d = math_(nt, "MINIMUM", cross, math_(nt, "SUBTRACT", ln.outputs["Value"], PLAZA))
    en = node(nt, "ShaderNodeTexNoise")
    en.inputs["Scale"].default_value = 7.0
    en.inputs["Detail"].default_value = 5
    link(nt, P, en.inputs["Vector"])
    d = math_(nt, "ADD", d, math_(nt, "MULTIPLY", math_(nt, "SUBTRACT", en.outputs["Fac"], 0.5), 0.09))
    mr = node(nt, "ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = -0.015
    mr.inputs["From Max"].default_value = 0.015
    mr.inputs["To Min"].default_value = 1.0
    mr.inputs["To Max"].default_value = 0.0
    link(nt, d, mr.inputs["Value"])
    mask = mr.outputs[0]
    link(nt, mix(nt, mask, soil_or_grass, gcol), b.inputs["Base Color"])
    link(nt, math_(nt, "ADD", math_(nt, "MULTIPLY", mask, math_(nt, "SUBTRACT", garm.outputs[1], 0.85)), 0.85), b.inputs["Roughness"])
    gn = node(nt, "ShaderNodeNormalMap")
    link(nt, tex(nt, os.path.join(gd, "gravel_floor_02_nor_gl_1k.jpg"), gm.outputs[0], True).outputs[0], gn.inputs["Color"])
    ln_ = node(nt, "ShaderNodeNormalMap")
    gm2 = node(nt, "ShaderNodeMapping")
    gm2.inputs["Scale"].default_value = (1 / 1.5, 1 / 1.5, 1)
    link(nt, P, gm2.inputs["Vector"])
    link(nt, tex(nt, os.path.join(T, "Grass004", "Grass004_1K-JPG_NormalGL.jpg"), gm2.outputs[0], True).outputs[0], ln_.inputs["Color"])
    nmix = node(nt, "ShaderNodeMix", data_type="VECTOR")
    link(nt, mask, sock(nmix, "Factor", False, "VALUE"))
    link(nt, ln_.outputs[0], sock(nmix, "A", False, "VECTOR"))
    link(nt, gn.outputs[0], sock(nmix, "B", False, "VECTOR"))
    link(nt, sock(nmix, "Result", True, "VECTOR"), b.inputs["Normal"])
    return m


def hair_mat(state, burn=None):
    m, nt, b = new_mat("grass_blades")
    P = node(nt, "ShaderNodeTexCoord").outputs["Object"]
    hi = node(nt, "ShaderNodeHairInfo")
    tip = node(nt, "ShaderNodeMapRange")
    tip.inputs["To Min"].default_value = 0.7
    tip.inputs["To Max"].default_value = 1.3
    link(nt, hi.outputs["Intercept"], tip.inputs["Value"])
    g = mix(nt, 1.0, grass_color(nt, P, state, burn), (1.0, 1.04, 0.92, 1), "MULTIPLY")
    t3 = node(nt, "ShaderNodeCombineColor")
    for i in range(3):
        link(nt, tip.outputs[0], t3.inputs[i])
    link(nt, mix(nt, 1.0, g, t3.outputs[0], "MULTIPLY"), b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.55
    return m


def soil_mat():
    m, nt, b = new_mat("soil")
    nz = node(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 40
    nz.inputs["Detail"].default_value = 6
    r = node(nt, "ShaderNodeValToRGB")
    r.color_ramp.elements[0].color = (0.035, 0.022, 0.014, 1)
    r.color_ramp.elements[1].color = (0.11, 0.075, 0.05, 1)
    link(nt, nz.outputs["Fac"], r.inputs["Fac"])
    link(nt, r.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 0.95
    bp = node(nt, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.6
    link(nt, nz.outputs["Fac"], bp.inputs["Height"])
    link(nt, bp.outputs["Normal"], b.inputs["Normal"])
    return m


def water_mat(murky):
    m, nt, b = new_mat("water")
    b.inputs["Base Color"].default_value = (1, 1, 1, 1)
    b.inputs["Transmission Weight"].default_value = 1.0
    b.inputs["IOR"].default_value = 1.333
    b.inputs["Roughness"].default_value = 0.12 if murky else 0.02
    nz = node(nt, "ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = 3.5
    nz.inputs["Detail"].default_value = 4
    bp = node(nt, "ShaderNodeBump")
    bp.inputs["Strength"].default_value = 0.08
    link(nt, nz.outputs["Fac"], bp.inputs["Height"])
    link(nt, bp.outputs["Normal"], b.inputs["Normal"])
    shadow_see_through(nt, b)
    ab = node(nt, "ShaderNodeVolumeAbsorption")
    ab.inputs["Color"].default_value = (0.42, 0.36, 0.14, 1) if murky else (0.42, 0.62, 0.55, 1)
    ab.inputs["Density"].default_value = 14.0 if murky else 6.0
    # absorption only: adding volume scatter overflows Cycles' 64-closure limit and it silently drops closures
    link(nt, ab.outputs[0], nt.nodes["Material Output"].inputs["Volume"])
    return m


def translucent(m, amount, bright, tint=(0.9, 1.0, 0.55)):
    """Foliage lets light through: the scene is side-lit, so leaves must glow, not go black."""
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    out = nt.nodes["Material Output"]
    col = b.inputs["Base Color"].links[0].from_socket
    alpha = b.inputs["Alpha"].links[0].from_socket if b.inputs["Alpha"].is_linked else None
    tl = node(nt, "ShaderNodeBsdfTranslucent")
    lit = mix(nt, 1.0, col, (bright, bright, bright, 1), "MULTIPLY")
    link(nt, lit, b.inputs["Base Color"])
    link(nt, mix(nt, 1.0, lit, (*tint, 1), "MULTIPLY"), tl.inputs["Color"])
    m1 = node(nt, "ShaderNodeMixShader")
    m1.inputs[0].default_value = amount
    link(nt, b.outputs[0], m1.inputs[1])
    link(nt, tl.outputs[0], m1.inputs[2])
    last = m1.outputs[0]
    if alpha:
        m2 = node(nt, "ShaderNodeMixShader")
        link(nt, alpha, m2.inputs[0])
        link(nt, node(nt, "ShaderNodeBsdfTransparent").outputs[0], m2.inputs[1])
        link(nt, last, m2.inputs[2])
        last = m2.outputs[0]
    link(nt, last, out.inputs["Surface"])


def wilt(m, rgb):
    """Dried-out planting: the base colour pulled toward brown."""
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    src = b.inputs["Base Color"].links[0].from_socket
    link(nt, mix(nt, 0.75, src, mix(nt, 1.0, src, (*rgb, 1), "MULTIPLY")), b.inputs["Base Color"])


# ---------- the pieces ----------

def rim():
    """The slab: a paved rim cut by the four paths, stone sides."""
    stone = mat("stone")
    zb = -SPEC["slab"]["thickness"]
    for y0, y1 in [(INNER, HALF), (-HALF, -INNER)]:  # north and south strips run the full width
        block("rim", -HALF, -PW, y0, y1, zb, RIM_TOP, stone)
        block("rim", PW, HALF, y0, y1, zb, RIM_TOP, stone)
        block("rim_gap", -PW, PW, y0, y1, zb, -0.004, stone, bevel=0)  # the gravel runs out to the edge here
    for x0, x1 in [(INNER, HALF), (-HALF, -INNER)]:
        block("rim", x0, x1, -INNER, -PW, zb, RIM_TOP, stone)
        block("rim", x0, x1, PW, INNER, zb, RIM_TOP, stone)
        block("rim_gap", x0, x1, -PW, PW, zb, -0.004, stone, bevel=0)


def ground(state, grass, bald=None, hole=None):
    """One fine grid, lawn (or earth) and gravel told apart by the shader; hair grass where the lawn is.
    bald (x, y, r): a burn, scorching the lawn and blades and thinning them at its heart. hole (x, y, r): cut out."""
    n = 240
    step = TILE / n
    vid, verts, faces = {}, [], []

    def keep(cx, cy):
        if (abs(cx) > INNER or abs(cy) > INNER) and min(abs(cx), abs(cy)) > PW:
            return False  # under the raised rim
        if hole and math.hypot(cx - hole[0], cy - hole[1]) < hole[2]:
            return False
        return pond_r(cx, cy) >= 1.03 and bed_r(cx, cy) >= BED["radius"] + 0.06

    def vi(i, j):
        if (i, j) not in vid:
            vid[(i, j)] = len(verts)
            verts.append((-HALF + i * step, -HALF + j * step, 0.0))
        return vid[(i, j)]

    for j in range(n):
        for i in range(n):
            if keep(-HALF + (i + 0.5) * step, -HALF + (j + 0.5) * step):
                faces.append((vi(i, j), vi(i + 1, j), vi(i + 1, j + 1), vi(i, j + 1)))
    lawn = mesh_obj("ground", verts, faces, ground_mat(state, bald))
    uvl = lawn.data.uv_layers.new(name="UVMap")
    for l in lawn.data.loops:
        x, y, _ = lawn.data.vertices[l.vertex_index].co
        uvl.data[l.index].uv = ((x + HALF) / TILE, (y + HALF) / TILE)
    if not grass:
        return lawn
    lawn.data.materials.append(hair_mat(state, bald))
    vg = lawn.vertex_groups.new(name="grass")
    for v in lawn.data.vertices:
        x, y, _ = v.co
        w = max(0.0, min(1.0, (gravel_d(x, y) - 0.01) / 0.05))
        if abs(x) > INNER - 0.02 or abs(y) > INNER - 0.02 or pond_r(x, y) < 1.08 or bed_r(x, y) < BED["radius"] + 0.1:
            w = 0.0
        if bald:  # burnt off, with a ragged edge
            d = math.hypot(x - bald[0], y - bald[1]) / bald[2] + 0.25 * noise.noise(Vector((x * 1.7, y * 1.7, 0.5)))
            w *= max(0.0, min(1.0, (d - 0.3) / 0.3))  # the heart burnt to the soil; the rest stands, charred
        if hole and math.hypot(x - hole[0], y - hole[1]) < hole[2] + 0.15:
            w = 0.0
        vg.add([v.index], w, "REPLACE")
    lawn.modifiers.new("grass", "PARTICLE_SYSTEM")
    ps = lawn.particle_systems[0]
    ps.vertex_group_density = "grass"
    ps.seed = 3
    p = ps.settings
    p.type = "HAIR"
    p.count = 30000
    p.hair_length = 0.065
    p.hair_step = 3
    p.render_step = 2
    p.use_advanced_hair = True
    p.factor_random = 0.025
    p.child_type = "INTERPOLATED"
    p.rendered_child_count = 14
    p.child_percent = 1
    p.child_length_threshold = 0.45
    p.roughness_endpoint = 0.012
    p.roughness_end_shape = 1.0
    p.roughness_1 = 0.004
    p.radius_scale = 0.0018
    p.root_radius = 1.0
    p.tip_radius = 0.15
    p.material_slot = "grass_blades"
    return lawn


def monument(with_rock=True):
    """A meteorite stood on end on a round plinth. Returns the scan rock (the pond stones reuse its textures)."""
    mo = SPEC["monument"]
    pl = mo["plinth"]
    seg = 72
    pv = [(pl["radius"] * math.cos(2 * math.pi * k / seg), pl["radius"] * math.sin(2 * math.pi * k / seg), z) for z in (-0.05, pl["height"]) for k in range(seg)]
    pf = [tuple(range(seg))[::-1], tuple(range(seg, 2 * seg))] + [(k, (k + 1) % seg, seg + (k + 1) % seg, seg + k) for k in range(seg)]
    plinth = mesh_obj("plinth", pv, pf, pbr("plinth_stone", "sandstone_blocks_08", 3.0, tint=(0.72, 0.72, 0.74), rough_add=-0.1))
    box_uv(plinth)
    bv = plinth.modifiers.new("bevel", "BEVEL")
    bv.width = 0.03
    bv.segments = 3
    bv.limit_method = "ANGLE"
    plinth.data.shade_smooth()
    plinth.modifiers.new("wn", "WEIGHTED_NORMAL").keep_sharp = True
    tpl = load(mo["asset"])[0]
    rock_mat = tpl.data.materials[0].copy()
    rock_mat.name = "pond_stone"
    for n_ in rock_mat.node_tree.nodes:  # the scan textures on world-metre UVs, lightened toward a river stone
        if n_.bl_idname == "ShaderNodeTexImage":
            mp = node(rock_mat.node_tree, "ShaderNodeMapping")
            mp.inputs["Scale"].default_value = (1 / 0.45, 1 / 0.45, 1)
            link(rock_mat.node_tree, node(rock_mat.node_tree, "ShaderNodeTexCoord").outputs["UV"], mp.inputs["Vector"])
            link(rock_mat.node_tree, mp.outputs[0], n_.inputs["Vector"])
    rb = rock_mat.node_tree.nodes["Principled BSDF"]
    link(rock_mat.node_tree, mix(rock_mat.node_tree, 1.0, rb.inputs["Base Color"].links[0].from_socket, (1.6, 1.5, 1.35, 1), "MULTIPLY"), rb.inputs["Base Color"])
    if with_rock:
        lo, hi = bounds([tpl])
        ax = max(range(3), key=lambda i: hi[i] - lo[i])
        s = mo["height"] / (hi[ax] - lo[ax])
        # stood on its longest axis: a meteorite on end reads as a monument, lying flat as a boulder
        place(tpl, mo["center"], z=pl["height"], rot=0.6, scale=(s, s, s), sink=0.04, extra_rot=(0, math.pi / 2 if ax == 0 else 0))
        mm = tpl.data.materials[0]  # darkened to a meteorite's iron-black crust, so it reads against the pale plinth
        mb = mm.node_tree.nodes["Principled BSDF"]
        link(mm.node_tree, mix(mm.node_tree, 1.0, mb.inputs["Base Color"].links[0].from_socket, (0.42, 0.38, 0.35, 1), "MULTIPLY"), mb.inputs["Base Color"])
    unlink(tpl)
    return rock_mat


def pebble(name, a, b, c, seed, m):
    """A rounded field stone: an icosphere squashed to a b c, its surface lumped by noise."""
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    off = Vector((seed * 7.1, seed * 3.3, seed * 1.7))
    for v in bm.verts:
        p = v.co.copy()
        v.co = Vector((p.x * a, p.y * b, p.z * c)) * (1 + 0.12 * noise.noise(p * 1.4 + off))
        if v.co.z < -c * 0.35:
            v.co.z = -c * 0.35  # a flat base, so it sits rather than balances
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    coll().objects.link(o)
    me.materials.append(m)
    me.shade_smooth()
    return o


def pond(rock_mat, water=True, murky=False, stones_ringed=True):
    depth, wz = 0.42, -0.07
    rings = [0, 0.15, 0.3, 0.45, 0.6, 0.72, 0.82, 0.9, 0.96, 1.0, 1.1]
    segs = 96
    bv_, bf = [], []
    for r in rings:
        z = -depth * (1 - min(r, 1.0) ** 2.2)
        for k in range(segs):
            bv_.append((*pond_xy(2 * math.pi * k / segs, r), z))
    for ri in range(len(rings) - 1):
        for k in range(segs):
            a, b2 = ri * segs + k, ri * segs + (k + 1) % segs
            bf.append((a, b2, b2 + segs, a + segs))
    bowl = mesh_obj("pond_bowl", bv_, bf, pbr("pond_bed", "clean_pebbles", 1.2, tint=(0.8, 0.78, 0.72)), smooth=True)
    box_uv(bowl)
    if water:
        wv = [(*pond_xy(2 * math.pi * k / segs, 1.0), z) for z in (-depth - 0.05, wz) for k in range(segs)]
        wf = [tuple(range(segs))[::-1], tuple(range(segs, 2 * segs))] + [(k, (k + 1) % segs, segs + (k + 1) % segs, segs + k) for k in range(segs)]
        mesh_obj("water", wv, wf, water_mat(murky))
    rng = random.Random(7)
    if not stones_ringed:  # the edging stones wait in a heap beside the dry bowl
        for k in range(14):
            sa = rng.uniform(0.17, 0.24)
            o = pebble("pond_stone", sa, sa * 0.8, sa * 0.6, k, rock_mat)
            o.location = (1.2 + rng.uniform(-0.45, 0.45), 4.6 + rng.uniform(-0.3, 0.3), 0.08 + (k % 3) * 0.1)
            o.rotation_euler = (rng.uniform(0, 3), rng.uniform(0, 3), rng.uniform(0, 3))
            o.modifiers.new("smooth", "SUBSURF").levels = 1
        return
    # stones spaced by arc length, so the hollow is not crowded and the long sides not gappy
    ring = [pond_xy(2 * math.pi * k / 720, 1.04) for k in range(721)]
    arc = [0.0]
    for p0, p1 in zip(ring, ring[1:]):
        arc.append(arc[-1] + math.dist(p0, p1))
    n_st = round(arc[-1] / 0.31)
    for k in range(n_st):
        target = arc[-1] * (k + rng.uniform(-0.12, 0.12)) / n_st % arc[-1]
        i = max(1, min(next(i for i, L in enumerate(arc) if L >= target), 719))
        (x0, y0), (x1, y1) = ring[i - 1], ring[i + 1]
        x, y = pond_xy(2 * math.pi * i / 720, 1.04 + rng.uniform(-0.02, 0.03))
        sa = rng.uniform(0.17, 0.24)
        o = pebble("pond_stone", sa, sa * rng.uniform(0.7, 0.85), sa * rng.uniform(0.5, 0.65), k, rock_mat)
        o.location = (x, y, rng.uniform(-0.02, 0.01))
        o.rotation_euler = (rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), math.atan2(y1 - y0, x1 - x0) + rng.uniform(-0.3, 0.3))
        bpy.context.view_layer.update()
        box_uv(o)
        o.modifiers.new("smooth", "SUBSURF").levels = 1


def flower_bed(planted=True, wilted=False):
    bcx, bcy = BED["center"]
    br_ = BED["radius"]
    segs = 96
    kv = []
    for (r, z) in [(br_, -0.05), (br_ + 0.14, -0.05), (br_ + 0.14, 0.11), (br_, 0.11)]:
        for k in range(segs):
            a = 2 * math.pi * k / segs
            kv.append((bcx + r * math.cos(a), bcy + r * math.sin(a), z))
    kf = []
    for q in range(4):
        for k in range(segs):
            a0, a1 = q * segs + k, q * segs + (k + 1) % segs
            b0, b1 = ((q + 1) % 4) * segs + k, ((q + 1) % 4) * segs + (k + 1) % segs
            kf.append((a0, b0, b1, a1))
    kerb = mesh_obj("bed_kerb", kv, kf, pbr("kerb_stone", "sandstone_blocks_08", 1.4, tint=(0.85, 0.84, 0.82)))
    box_uv(kerb)
    bv = kerb.modifiers.new("bevel", "BEVEL")
    bv.width = 0.02
    bv.segments = 2
    bv.limit_method = "ANGLE"
    sv = [(bcx, bcy, 0.04)] + [(bcx + (br_ + 0.01) * math.cos(2 * math.pi * k / segs), bcy + (br_ + 0.01) * math.sin(2 * math.pi * k / segs), 0.03) for k in range(segs)]
    mesh_obj("bed_soil", sv, [(0, 1 + k, 1 + (k + 1) % segs) for k in range(segs)], soil_mat())
    if not planted:
        return
    tpls = load(BED["asset"])
    for o in tpls:
        recentre(o)
    tpls.sort(key=lambda o: len(o.data.polygons))
    lush = tpls[3:]  # the variants with open flowers; the first three are mostly leaf
    rng = random.Random(11)
    sp = 0.17
    for row in range(-10, 11):
        for col in range(-10, 11):
            x = col * sp + (row % 2) * sp / 2 + rng.uniform(-0.04, 0.04)
            y = row * sp * 0.866 + rng.uniform(-0.04, 0.04)
            if math.hypot(x, y) > br_ - 0.1:
                continue
            t = rng.choice(lush if rng.random() < 0.8 else tpls)
            s = rng.uniform(1.9, 2.4) * (0.75 if wilted else 1.0)
            place(t, (bcx + x, bcy + y), z=0.035, rot=rng.uniform(0, 6.28), scale=(s, s, s * (0.6 if wilted else 1.0)), sink=0.01)
    for o in tpls:
        unlink(o)
    m = bpy.data.materials["flower_gazania"]
    if wilted:
        wilt(m, (0.5, 0.33, 0.16))
    translucent(m, 0.2, 1.15)


def lump(name, at, size, m, seed, rough=0.35, sub=3):
    """An irregular clod: an icosphere scaled to size and pushed about by noise."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=1.0, location=at)
    o = bpy.context.active_object
    o.name = name
    off = Vector((seed * 3.1, seed * 1.7, seed * 0.9))
    for v in o.data.vertices:
        p = v.co.copy()
        v.co = Vector((p.x * size[0], p.y * size[1], p.z * size[2])) * (1 + rough * noise.noise(p * 1.8 + off) + 0.5 * rough * noise.noise(p * 4.5 + off))
    o.data.materials.append(m)
    o.data.shade_smooth()
    return o


def root_plate(x, y, fall):
    """The torn-up root mass: a ragged slab of dark soil stood up behind the trunk, a few bent, tapering roots
    trailing out of it, clods fallen round its foot, and the hole it tore in the lawn (HOLE, cut from the grid)."""
    back = Vector((-fall.x, -fall.y, 0)).normalized()
    side = Vector((-back.y, back.x, 0))
    soil = soil_mat()
    c = Vector((x, y, 0.0)) + back * 0.35
    mass = lump("root_mass", (c.x, c.y, 0.8), (0.32, 1.05, 0.85), soil, 1.0, 0.3, 4)
    mass.rotation_euler = (0, 0, math.atan2(back.y, back.x))  # its thin axis along the line of the fall
    roots = flat("roots", (0.12, 0.085, 0.055), 0.9)
    rng = random.Random(5)
    for k in range(9):
        a = math.pi * (0.1 + 0.8 * k / 8) + rng.uniform(-0.15, 0.15)  # round the upper rim, not the buried edge
        rim = (side * math.cos(a) + Vector((0, 0, 1)) * math.sin(a)).normalized()
        p0 = Vector((c.x, c.y, 0.8)) + rim * rng.uniform(0.65, 0.8) + back * 0.12
        L = rng.uniform(0.7, 1.3)
        # trailing out sideways and back from the rim, then drooping under their own weight: never sticking up
        out = (side * math.cos(a) * 1.0 + back * 0.7 + Vector((0, 0, 0.15))).normalized()
        p1 = p0 + out * L * 0.5
        p2 = p1 + (out + Vector((0, 0, -1.2))).normalized() * L * 0.5
        cu = bpy.data.curves.new("root", "CURVE")
        cu.dimensions = "3D"
        cu.bevel_depth = 0.045
        cu.bevel_resolution = 2
        sp = cu.splines.new("NURBS")
        sp.points.add(2)
        for pt, q, r in zip(sp.points, (p0, p1, p2), (1.0, 0.6, 0.12)):
            pt.co = (q.x, q.y, max(q.z, 0.03), 1)
            pt.radius = r  # tapering to a point
        sp.use_endpoint_u = True
        sp.order_u = 3
        o = bpy.data.objects.new("root", cu)
        coll().objects.link(o)
        cu.materials.append(roots)
    for k in range(7):  # clods at its foot
        q = c + side * rng.uniform(-1.0, 1.0) + back * rng.uniform(-0.3, 0.8)
        s_ = rng.uniform(0.12, 0.28)
        lump("clod", (q.x, q.y, s_ * 0.5), (s_, s_ * 0.9, s_ * 0.7), soil, k + 7, 0.4, 2)
    hx, hy, hr = HOLE  # the hole: a dark bowl under the cut in the lawn, a lip of thrown-up soil round it
    seg = 32
    ring = lambda r, z: [(hx + r * math.cos(2 * math.pi * i / seg), hy + r * math.sin(2 * math.pi * i / seg), z) for i in range(seg)]  # noqa: E731
    v = [(hx, hy, -0.4)] + ring(hr * 0.6, -0.3) + ring(hr + 0.02, 0.0)
    f = [(0, 1 + i, 1 + (i + 1) % seg) for i in range(seg)] + [(1 + i, 1 + seg + i, 1 + seg + (i + 1) % seg, 1 + (i + 1) % seg) for i in range(seg)]
    mesh_obj("root_hole", v, f, soil, smooth=True)
    for k in range(10):
        a = 2 * math.pi * k / 10 + rng.uniform(-0.2, 0.2)
        s_ = rng.uniform(0.12, 0.22)
        lump("hole_lip", (hx + (hr + 0.1) * math.cos(a), hy + (hr + 0.1) * math.sin(a), 0.02), (s_ * 1.4, s_, s_ * 0.5), soil, k + 20, 0.3, 2)


def leaves(kit, name):
    return [m for m in props.materials(kit, name) if "Bark" not in m.name]  # LindenBranch, LeafAtlas, AtlasLeafB, flowers


def kit_trees(state):
    """trees() with London kit trees: the same spots, heights, stakes, fall and root mass."""
    for i, t in enumerate(SPEC["trees"]):
        name = KIT_SAPLING if state == "build1" else KIT_TREES[i]
        h = 1.9 if state == "build1" else t["height"]
        s = h / props.size(LND, name).z
        if state == "build1":
            cyl("tree_stake", t["at"][0] + 0.18, t["at"][1], 0.025, 0.0, 1.4, flat("stake_wood", (0.55, 0.4, 0.24), 0.8), 8)
        if state == "damaged" and i == FALLEN:
            fall = Vector((1.0, 0.12, 0.2)).normalized()
            q = Vector((0, 0, 1)).rotation_difference(fall) @ Quaternion((0, 0, 1), t.get("rotate", 0.0))
            e = props.place(LND, name, t["at"], z=0.4, scale=s, quat=q)
            # the kit crown is a dense ball, which lying down still reads as a bush: slumped under its own weight,
            # squashed along whichever of its sideways axes now points up
            up = max((0, 1), key=lambda i: abs(q.to_matrix().col[i].z))
            e.scale[up] = s * 0.55
            root_plate(t["at"][0], t["at"][1], fall)
        else:
            props.place(LND, name, t["at"], t.get("rotate", 0.0), z=-0.02, scale=s)
        for m in leaves(LND, name):
            if state == "closed":
                wilt(m, (0.75, 0.55, 0.3))
            if not m.get("lit_through"):
                translucent(m, 0.3, 1.15)
                m["lit_through"] = True


def trees(state):
    """The spec's two trees. build1: saplings on stakes. damaged: the smaller one fallen toward the plaza."""
    if props.on():
        return kit_trees(state)
    tpl = load("island_tree_01")[0]
    recentre(tpl)
    lo, hi = bounds([tpl])
    for i, t in enumerate(SPEC["trees"]):
        h = 1.9 if state == "build1" else t["height"]
        s = h / (hi.z - lo.z)
        o = tpl.copy()
        coll().objects.link(o)
        o.scale = (s, s, s)
        o.rotation_euler = (0, 0, t.get("rotate", 0.0))
        o.location = (t["at"][0], t["at"][1], -0.02 * s)
        if state == "build1":
            cyl("tree_stake", t["at"][0] + 0.18, t["at"][1], 0.025, 0.0, 1.4, flat("stake_wood", (0.55, 0.4, 0.24), 0.8), 8)
        if state == "damaged" and i == FALLEN:
            # pivoted on its root and laid toward the north-east: the trunk crosses the bench, the crown the plaza's edge
            # fallen east across the south path, propped on its branches; its root plate then faces this camera
            # (a tree falling north-east shows the plate edge-on, as a spike)
            fall = Vector((1.0, 0.12, 0.2)).normalized()
            o.rotation_mode = "QUATERNION"
            o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(fall) @ Quaternion((0, 0, 1), t.get("rotate", 0.0))
            o.location = (t["at"][0], t["at"][1], 0.45)
            root_plate(t["at"][0], t["at"][1], fall)
    unlink(tpl)
    m = bpy.data.materials["island_tree_01_leaves"]
    if state == "closed":
        wilt(m, (0.75, 0.55, 0.3))
    translucent(m, 0.35, 1.25)


def hedge_spots():
    ts = [INNER - 0.55 - k * SPEC["hedge"]["spacing"] for k in range(9)]
    ts = [t for t in ts if t > PW + 0.55] + [-t for t in ts if t > PW + 0.55]
    return [(t, INNER - 0.42) for t in ts] + [(-(INNER - 0.42), t) for t in ts if t < INNER - 0.6]


def kit_hedge(dry=False):
    """hedge() with London kit shrubs: two per spot, staggered, cut to the hedge height."""
    rng = random.Random(5)
    H = SPEC["hedge"]["height"]
    for i, (x, y) in enumerate(hedge_spots()):
        along_x = abs(y) > abs(x)
        for j, (a, b) in enumerate(((-0.28, -0.08), (0.28, 0.08))):
            name = KIT_HEDGE[(i + j) % 2]
            s = H / props.size(LND, name).z * rng.uniform(0.85, 1.05)
            px, py = (x + a, y + b) if along_x else (x + b, y + a)
            props.place(LND, name, (px, py), rng.uniform(0, 2 * math.pi), scale=s)
    for name in KIT_HEDGE:
        for m in leaves(LND, name):
            if dry:
                wilt(m, (0.7, 0.55, 0.32))


def hedge(dry=False):
    if props.on():
        return kit_hedge(dry)
    src = load(SPEC["hedge"]["asset"])[0]
    me = src.data
    co = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    xs = np.sort(co.reshape(-1, 3)[:, 0])
    cuts = [(xs[i] + xs[i + 1]) / 2 for i in np.where(np.diff(xs) > 0.03)[0]]
    edges_ = [-1e9] + cuts + [1e9]
    shrubs = []
    for k in range(len(edges_) - 1):  # the asset holds several bushes side by side: split them
        o = src.copy()
        o.data = src.data.copy()
        coll().objects.link(o)
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not (edges_[k] < f.calc_center_median().x < edges_[k + 1])], context="FACES")
        bm.to_mesh(o.data)
        bm.free()
        if len(o.data.polygons) > 200:
            recentre(o)
            shrubs.append(o)
        else:
            bpy.data.objects.remove(o)
    unlink(src)
    rng = random.Random(5)
    H = SPEC["hedge"]["height"]
    spots = hedge_spots()
    big = sorted(shrubs, key=lambda o: -len(o.data.polygons))[:3]  # the full bushes; the rest are seedlings
    pack = [(-0.36, -0.13), (0.0, -0.15), (0.36, -0.11), (-0.2, 0.12), (0.18, 0.13), (0.5, 0.1)]
    for i, (x, y) in enumerate(spots):
        along_x = abs(y) > abs(x)
        # the asset is a 20-40 cm bush: six per spot, scaled to the hedge height, two staggered rows read as one hedge
        for j, (a, b) in enumerate(pack if i % 2 else [(-a, -b) for a, b in pack]):
            t = big[(i + j) % len(big)]
            s = H / mdims(t).z * rng.uniform(0.85, 1.05)
            px, py = (x + a, y + b) if along_x else (x + b, y + a)
            place(t, (px, py), rot=rng.uniform(0, 2 * math.pi), scale=(s * 1.2, s * 1.2, s))
    for o in shrubs:
        unlink(o)
    m = bpy.data.materials["shrub_01"]
    if dry:
        wilt(m, (0.7, 0.55, 0.32))
    translucent(m, 0.3, 1.1)


def benches():
    tpl = load("painted_wooden_bench")[0]
    recentre(tpl)
    blen = mdims(tpl).x
    for b in SPEC["benches"]:
        rot = math.atan2(-b["at"][0], b["at"][1])  # the asset's seat faces -y; turn it to the plaza
        # the asset is a hall settle (seat 0.65 m): stretched to a 1.8 m park bench and lowered to a 0.49 m seat
        place(tpl, b["at"], rot=rot, scale=(1.8 / blen, 1.0, 0.75))
    unlink(tpl)


def lamps(globes=True, broken=None):
    metal = mat("metal")
    for (x, y) in SPEC["lamps"]["at"]:
        tilt = broken is not None and (x, y) == tuple(broken)
        parts = [
            cyl("lamp_base", x, y, 0.085, -0.02, 0.22, metal),
            cyl("lamp_post", x, y, 0.032, 0.2, LH - 2 * GR - 0.02, metal, 16),
            cyl("lamp_collar", x, y, 0.07, LH - 2 * GR - 0.05, LH - 2 * GR + 0.01, metal),
        ]
        if tilt:  # knocked askew by the falling tree: post leaning, globe gone
            for o in parts[1:]:
                o.data.transform(Matrix.Translation((-x, -y, 0)))
                o.location = (x, y, 0.0)
                o.rotation_euler = (math.radians(14), math.radians(-22), 0)
            continue
        if not globes:
            continue
        parts.append(cyl("lamp_cap", x, y, 0.05, LH - 0.02, LH + 0.03, metal))
        bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=GR, location=(x, y, LH - GR))
        g = bpy.context.active_object
        g.name = "lamp_globe"
        g.data.materials.append(mat("globe"))
        g.data.shade_smooth()
        light("POINT", (x, y, LH - GR), 70, (1.0, 0.66, 0.36), GR * 0.8)


def turf_pallet(x, y):
    """Rolled turf waiting on a pallet: the lawn still to come."""
    bx(x - 0.6, x + 0.6, y - 0.5, y + 0.5, 0.0, 0.14, flat("pallet", (0.55, 0.42, 0.28), 0.8), 0.01, "pallet")
    turf = flat("turf_roll", (0.13, 0.2, 0.06), 0.85)
    for layer in range(3):
        for k in range(4 - layer):
            bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=0.14, depth=0.95, location=(x - 0.42 + k * 0.28 + layer * 0.14, y, 0.28 + layer * 0.24))
            r = bpy.context.active_object
            r.rotation_euler = (math.pi / 2, 0, 0)
            r.data.materials.append(turf)
            r.data.shade_smooth()


def gates():
    """Closed: a locked barred gate across each path where it meets the rim."""
    g = INNER + RIM / 2
    w = PW + 0.25
    kits.fence(-w, w, g, 1.4, bars=True)
    kits.fence(-w, w, -g, 1.4, bars=True)
    kits.fence_y(g, -w, w, 1.4, bars=True)
    kits.fence_y(-g, -w, w, 1.4, bars=True)


# ---------- the stages ----------

def build(stage):
    if stage == "site":
        kits.site(0, 0, 9.0, 9.0, heaps=not props.on())  # with kits, Construction Zone gear instead (dress)
        return
    rim()
    if stage == "build1":
        ground("earth", grass=False)
        rock_mat = monument(with_rock=False)
        pond(rock_mat, water=False, stones_ringed=False)
        flower_bed(planted=False)
        trees("build1")
        lamps(globes=False)
        turf_pallet(3.4, -4.4)
        kits.cabin(-3.0, 4.4)
        kits.work_light(-4.6, -4.6, (0, 0))
        kits.work_light(4.6, -1.0, (0, 0))
        return
    closed, damaged = stage == "closed", stage == "damaged"
    ground("dry" if closed else "green", grass=True, bald=SCORCH if damaged else None, hole=HOLE if damaged else None)
    rock_mat = monument()
    pond(rock_mat, murky=closed)
    flower_bed(wilted=closed)
    trees(stage)
    hedge(dry=closed)
    benches()
    lamps(globes=True, broken=(-2.2, -2.2) if damaged else None)
    if closed:
        gates()
    if damaged:
        kits.scorch(SCORCH[0], SCORCH[1], SCORCH[2], z=0.012, strong=True)
        kits.ember(SCORCH[0] + 0.3, SCORCH[1] - 0.2, 0.05, r=0.22, energy=35)


CZ = "kb3d_constructionzone"


def dress(stage):
    """Kit dressing beyond the plants (KITS_DIR set): site gear; a barrow and pallets while it is laid out."""
    if stage == "site":
        for name, at, rot in (("KB3D_CSZ_PropSandMound_A", (-2.0, 1.8), 0.4), ("KB3D_CSZ_PropWheelbarrow_A", (0.0, -0.8), 0.7),
                              ("KB3D_CSZ_PropBrickPallet_B", (2.5, 0.0), 0.0), ("KB3D_CSZ_PropPortaPotty_A", (4.7, 4.7), 0.0),
                              ("KB3D_CSZ_PropPowerGenerator_B", (-3.0, -4.6), 0.0), ("KB3D_CSZ_PropCableSpool_A", (-4.6, 2.6), 1.57)):
            props.place(CZ, name, at, rot)
    elif stage == "build1":
        props.place(CZ, "KB3D_CSZ_PropWheelbarrow_A", (1.2, -4.5), 1.2)
        props.place(CZ, "KB3D_CSZ_PropCementBagPallet_A", (4.6, 1.4), 0.0)


if __name__ == "__main__":
    frame.run("park", STAGES, build, dress=dress)
