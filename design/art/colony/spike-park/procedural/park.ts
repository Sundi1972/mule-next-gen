/**
 * Option (a) of the visual spike: the Park painted the world map's way (packages/ui/src/terrain/landscape.ts).
 * No image assets. Every point of the 12 m place is a height plus a material from the map's own noise, coloured
 * from the map's palette and lit with its ambient + diffuse, the sun from the grounds' west-south-west. The map is seen from straight
 * above, so it never needed depth; here the same height field is splatted as columns into the grounds' iso
 * camera with a z-buffer, and a second splat from the sun gives cast shadows. Tree crowns and lamp globes float,
 * which one height field cannot hold, so they are lumpy spheres (Worley crowns, as the map's forest) beside it;
 * trunks and limbs are chains of spheres, since a column can neither taper nor lean.
 *
 * Run (Node ≥ 23, types are stripped): node design/art/colony/spike-park/procedural/park.ts [ss]
 * `ss` is supersampling per axis (default 2). PARK_DEBUG=normals|walls swaps the colour for a diagnostic.
 */
import { cells, fbm, hash2, noise, ridged } from '../../../../../packages/ui/src/terrain/noise.ts';
import { writePng } from './png.ts';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

type RGB = [number, number, number];
type Theme = 'light' | 'dark';

// ---------------------------------------------------------------- palette (the map's, plus the park's few extras)

interface Palette {
  grass: RGB; grass2: RGB; meadow: RGB; forest: RGB; canopy: RGB;
  rock: RGB; rock2: RGB; basalt: RGB; ash: RGB; glint: RGB;
  shallow: RGB; deep: RGB; foam: RGB; bank: RGB; pad: RGB;
  bark: RGB; wood: RGB; metal: RGB; soil: RGB;
  petalA: RGB; petalB: RGB; petalC: RGB; eye: RGB; leaf: RGB;
  globe: RGB;
  ambient: number; diffuse: number; contour: RGB | null; clouds: number;
}

// Copied from landscape.ts (its palettes are not exported and packages/ is not ours to edit).
const LIGHT: Palette = {
  grass: [0.56, 0.73, 0.39], grass2: [0.47, 0.66, 0.33], meadow: [0.68, 0.78, 0.42],
  forest: [0.2, 0.42, 0.24], canopy: [0.36, 0.6, 0.31],
  rock: [0.58, 0.53, 0.49], rock2: [0.44, 0.41, 0.4],
  basalt: [0.3, 0.27, 0.27], ash: [0.45, 0.41, 0.4], glint: [0.85, 0.45, 1.0],
  shallow: [0.44, 0.77, 0.86], deep: [0.15, 0.44, 0.66], foam: [0.92, 0.97, 1], bank: [0.8, 0.74, 0.55],
  pad: [0.9, 0.91, 0.93],
  // The park's own, kept in the map's key: muted, slightly warm.
  bark: [0.4, 0.31, 0.24], wood: [0.66, 0.4, 0.25], metal: [0.22, 0.23, 0.25], soil: [0.36, 0.28, 0.2],
  petalA: [0.98, 0.56, 0.14], petalB: [0.99, 0.8, 0.24], petalC: [0.92, 0.33, 0.16], eye: [0.3, 0.17, 0.07],
  leaf: [0.4, 0.53, 0.38],
  globe: [0.98, 0.94, 0.84],
  ambient: 0.58, diffuse: 0.55, contour: null, clouds: 0.13,
};

/** The map's night: the same land, darker and cooler, with the hologram's contour lines. */
const DARK: Palette = {
  ...mapPalette(LIGHT, (c) => [c[0] * 0.34, c[1] * 0.4, c[2] * 0.48 + 0.03]),
  shallow: [0.05, 0.24, 0.32], deep: [0.02, 0.09, 0.16], foam: [0.3, 0.75, 0.9], glint: [0.85, 0.45, 1.0],
  globe: [1.0, 0.8, 0.5],
  ambient: 0.42, diffuse: 0.62, contour: [0.22, 0.88, 1], clouds: 0,
};

function mapPalette(p: Palette, f: (c: RGB) => RGB): Palette {
  const out = { ...p } as Record<string, unknown>;
  for (const [k, v] of Object.entries(p)) if (Array.isArray(v)) out[k] = f(v as RGB);
  return out as unknown as Palette;
}

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// ---------------------------------------------------------------- the design (park-spec.json, metres, x east, y north, z up)

const SEED = 7;
const DEBUG = process.env.PARK_DEBUG ?? '';
const HALF = 6;
const RIM = 0.7;
const SLAB_BOTTOM = -0.6;
const LAWN = -0.04;
const GRAVEL = -0.06;
const WATER = -0.1;
const PLINTH_TOP = GRAVEL + 0.35;
const PATH_HALF = 0.5;
const PLAZA_R = 1.6;
const POND = { x: 3.1, y: 3.1, rx: 1.9, ry: 1.4 };
const BED = { x: 3.1, y: -3.1, r: 1.3 };
const LAMPS: [number, number][] = [[2.2, 2.2], [-2.2, 2.2], [2.2, -2.2], [-2.2, -2.2]];
const LAMP_Z = 2.4;
const BENCHES: [number, number][] = [[-1.9, -1.2], [1.2, -1.9]];
const BENCH_HALF = 0.75;
const TREES = [
  { x: -3.1, y: 3.0, h: 5.5, seed: 11 },
  { x: -3.6, y: -2.8, h: 4.2, seed: 23 },
];
/** Hedge boxes [x0, x1, y0, y1]: inside the rim on the north and west, open where the paths run out. */
const HEDGE_W = 0.7;
const HEDGE_IN = HALF - RIM;
const HEDGES: [number, number, number, number][] = [
  [-HEDGE_IN, -0.8, HEDGE_IN - HEDGE_W, HEDGE_IN],
  [0.8, HEDGE_IN, HEDGE_IN - HEDGE_W, HEDGE_IN],
  [-HEDGE_IN, -HEDGE_IN + HEDGE_W, -HEDGE_IN, -0.8],
  [-HEDGE_IN, -HEDGE_IN + HEDGE_W, 0.8, HEDGE_IN],
];

// Material ids of the ground's height field.
const PAVE = 1, LAWN_M = 2, GRAVEL_M = 3, PLINTH = 4, ROCK = 5, WATER_M = 6, STONES = 7, HEDGE = 8, BED_M = 9;
const KERB = 10, BENCH = 11, POST = 12, BARK = 13;

// ---------------------------------------------------------------- floating parts: crowns, globes, caps

const FOLIAGE = 1, GLOBE = 2, CAP = 3, LIMB = 4;
interface Clump { x: number; y: number; z: number; r: number; amp: number; kind: number; group: number; tree: number }
const clumps: Clump[] = [];
/** Per tree: the crown's centre and radius, for shading and the trunk's height. */
const crowns: { x: number; y: number; z: number; R: number }[] = [];

for (let t = 0; t < TREES.length; t++) {
  const tr = TREES[t]!;
  const R = 0.33 * tr.h;
  const zc = tr.h - R * 0.98;
  crowns.push({ x: tr.x, y: tr.y, z: zc, R });
  const g = 1 + t;
  clumps.push({ x: tr.x, y: tr.y, z: zc, r: 0.64 * R, amp: 0.18, kind: FOLIAGE, group: g, tree: t });
  // Clumps on a shell, more above than below, so the crown reads as many crowns of leaves (the map's forest).
  const n = 11;
  for (let k = 0; k < n; k++) {
    const a = k * 2.39996 + hash2(k, t, tr.seed) * 0.6;
    const el = -0.45 + 1.35 * ((k + 0.5) / n) + (hash2(k, t, tr.seed + 1) - 0.5) * 0.3;
    const d = R * (0.5 + 0.1 * hash2(k, t, tr.seed + 2));
    clumps.push({
      x: tr.x + Math.cos(a) * Math.cos(el) * d,
      y: tr.y + Math.sin(a) * Math.cos(el) * d,
      z: zc + Math.sin(el) * d * 0.85,
      r: R * (0.4 + 0.14 * hash2(k, t, tr.seed + 3)),
      amp: 0.22, kind: FOLIAGE, group: g, tree: t,
    });
  }
  // Trunk and limbs: a column cannot taper or lean, so they are chains of spheres, thinning upwards.
  const rad = 0.06 + tr.h * 0.02;
  limb(tr.x, tr.y, LAWN, tr.x, tr.y, zc - R * 0.1, rad, rad * 0.6, g, t);
  const fork = zc - R * 0.55;
  for (let k = 0; k < 4; k++) {
    const a = k * 1.7 + tr.seed;
    const tx = tr.x + Math.cos(a) * R * 0.55, ty = tr.y + Math.sin(a) * R * 0.55, tz = zc + (hash2(k, t, tr.seed + 9) - 0.3) * R * 0.5;
    limb(tr.x, tr.y, fork + k * 0.15, tx, ty, tz, rad * 0.55, rad * 0.25, g, t);
  }
}

function limb(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, r0: number, r1: number, group: number, tree: number) {
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const n = Math.ceil(len / (Math.min(r0, r1) * 0.35));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    clumps.push({ x: lerp(x0, x1, t), y: lerp(y0, y1, t), z: lerp(z0, z1, t), r: lerp(r0, r1, t), amp: 0, kind: LIMB, group, tree });
  }
}
for (let i = 0; i < LAMPS.length; i++) {
  const [x, y] = LAMPS[i]!;
  clumps.push({ x, y, z: LAMP_Z, r: 0.15, amp: 0, kind: GLOBE, group: 10 + i, tree: -1 });
  clumps.push({ x, y, z: LAMP_Z + 0.15, r: 0.1, amp: 0, kind: CAP, group: 10 + i, tree: -1 });
}

/** The map's Worley `cells`, one dimension up: a crown is seen from the side as well as from above. */
function cells3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let best = 9;
  for (let k = -1; k <= 1; k++) {
    const zk = zi + k;
    for (let j = -1; j <= 1; j++) {
      const yk = (yi + j) * 7919 + zk * 104729;
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i + hash2(xi + i, yk, seed) - x;
        const cy = yi + j + hash2(xi + i, yk, seed + 7) - y;
        const cz = zk + hash2(xi + i, yk, seed + 11) - z;
        const d = cx * cx + cy * cy + cz * cz;
        if (d < best) best = d;
      }
    }
  }
  return Math.sqrt(best);
}

function rockBump(x: number, y: number, z: number): number {
  const crest = ridged((x - y) * 2.2 + z * 1.1, z * 2.6 + (x + y) * 0.7, SEED + 181, 3);
  const pit = smooth(0.0, 0.42, cells3(x * 7, y * 7, z * 7, SEED + 183));
  return crest * 0.55 + pit * 0.45;
}

function hedgeLeaf(x: number, y: number, z: number, seed: number): number {
  return 1 - smooth(0.05, 0.75, cells3(x * 7, y * 7, z * 7, seed));
}

/** Leafy relief of a crown at a point, 0..1: the map's forest formula on 3D cells, sprays of two sizes. */
function leafy(x: number, y: number, z: number, seed: number): number {
  // Big sprays shape the crown; small ones roughen each spray rather than standing out as bubbles.
  const big = 1 - smooth(0.05, 0.85, cells3(x * 1.9, y * 1.9, z * 1.9, seed));
  const small = 1 - smooth(0.05, 0.85, cells3(x * 5.5, y * 5.5, z * 5.5, seed + 3));
  return big * 0.75 + small * 0.25;
}

// ---------------------------------------------------------------- the ground: height + material + colour per point

/** cells() that also says which cell won, for per-stone and per-flower colour. */
let cellHash = 0;
function cellsId(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i + hash2(xi + i, yi + j, seed);
      const cy = yi + j + hash2(xi + i, yi + j, seed + 7);
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d < best) {
        best = d;
        cellHash = hash2(xi + i, yi + j, seed + 13);
      }
    }
  }
  return Math.sqrt(best);
}

function sdBox(x: number, y: number, b: [number, number, number, number]): number {
  const cx = (b[0] + b[1]) / 2, cy = (b[2] + b[3]) / 2;
  const qx = Math.abs(x - cx) - (b[1] - b[0]) / 2;
  const qy = Math.abs(y - cy) - (b[3] - b[2]) / 2;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

/** A bench's local frame: along its length, and towards the plaza. */
function benchLocal(x: number, y: number, b: [number, number]): [number, number] {
  const l = Math.hypot(b[0], b[1]);
  const fx = -b[0] / l, fy = -b[1] / l;
  const dx = x - b[0], dy = y - b[1];
  return [dx * -fy + dy * fx, dx * fx + dy * fy];
}

function pondQ(x: number, y: number): number {
  // Laid along the diagonal with its ends bent towards the plaza: the kidney's hollow holds the lamp at (2.2, 2.2),
  // which the spec's plain ellipse would put in the water.
  const u = (x - POND.x - (y - POND.y)) * Math.SQRT1_2, v = (x - POND.x + (y - POND.y)) * Math.SQRT1_2;
  const t = u / POND.rx;
  const dy = v + POND.ry * 0.42 * (t * t - 0.35);
  return Math.hypot(t, dy / (POND.ry * 0.86));
}

// Outputs of ground(), kept in module scope so the hot loop allocates nothing.
let gH = 0, gM = 0, gR = 0, gG = 0, gB = 0, gGlow = 0;
function set(c: RGB, k = 0) {
  gR = c[0] + k; gG = c[1] + k; gB = c[2] + k;
}
function mixTo(a: RGB, b: RGB, t: number, k = 0) {
  gR = a[0] + (b[0] - a[0]) * t + k; gG = a[1] + (b[1] - a[1]) * t + k; gB = a[2] + (b[2] - a[2]) * t + k;
}

function ground(x: number, y: number, p: Palette): void {
  const ax = Math.abs(x), ay = Math.abs(y);
  const e = HALF - Math.max(ax, ay);
  const grain = noise(x * 22, y * 22, SEED + 3) - 0.5;
  gGlow = 0;

  if (e < RIM) {
    // The paved rim: setts with joints, each its own shade, worn darker in patches; rounded outer edge.
    const sx = x / 0.36 + 0.5, sy = y / 0.36 + 0.5;
    const fx = sx - Math.floor(sx), fy = sy - Math.floor(sy);
    const joint = Math.min(fx, 1 - fx, fy, 1 - fy);
    const groove = 1 - smooth(0.02, 0.07, joint);
    const sett = hash2(Math.floor(sx), Math.floor(sy), SEED + 5) - 0.5;
    const worn = smooth(0.45, 0.75, fbm(x * 0.9, y * 0.9, SEED + 9, 3));
    gH = -0.006 * groove - 0.03 * (1 - smooth(0, 0.05, e));
    gM = PAVE;
    const stone = [lerp(p.pad[0], p.rock[0], 0.32), lerp(p.pad[1], p.rock[1], 0.32), lerp(p.pad[2], p.rock[2], 0.32)] as RGB;
    mixTo(stone, p.rock2, groove * 0.45 + worn * 0.12, sett * 0.07 + grain * 0.05);
    return;
  }

  // Lawn: the map's patchwork turned into mown stripes, with its grain.
  const patch = fbm(x * 0.35, y * 0.35, SEED + 11, 3);
  const stripe = Math.sin((x + 0.45) * Math.PI / 0.9) > 0 ? 1 : 0;
  const blades = noise(x * 70, y * 70, SEED + 17) - 0.5;
  gH = LAWN + (fbm(x * 1.3, y * 1.3, SEED + 19, 2) - 0.5) * 0.012 + blades * 0.002;
  gM = LAWN_M;
  {
    const base0 = lerp(p.grass[0], p.grass2[0], patch), base1 = lerp(p.grass[1], p.grass2[1], patch), base2 = lerp(p.grass[2], p.grass2[2], patch);
    const m = clamp01(fbm(x * 0.8, y * 0.8, SEED + 21, 3) - 0.4) * 0.8 + stripe * 0.22;
    gR = lerp(base0, p.meadow[0], m) + grain * 0.04 + blades * 0.05;
    gG = lerp(base1, p.meadow[1], m) + grain * 0.04 + blades * 0.05;
    gB = lerp(base2, p.meadow[2], m) + grain * 0.04 + blades * 0.05;
  }

  // Gravel cross and plaza; the lawn's edge wanders a little.
  const r0 = Math.hypot(x, y);
  const ragged = (noise(x * 7, y * 7, SEED + 23) - 0.5) * 0.06;
  const onPath = Math.min(ax, ay) < PATH_HALF + ragged || r0 < PLAZA_R + ragged;
  if (onPath) {
    const c = cellsId(x * 26, y * 26, SEED + 29);
    const pebble = 1 - smooth(0.1, 0.55, c);
    gH = GRAVEL + pebble * 0.008;
    gM = GRAVEL_M;
    const gravel = [lerp(p.bank[0], p.pad[0], 0.45), lerp(p.bank[1], p.pad[1], 0.45), lerp(p.bank[2], p.pad[2], 0.45)] as RGB;
    mixTo(gravel, p.rock, (1 - pebble) * 0.5, (cellHash - 0.5) * 0.12 + grain * 0.03);
  }

  // Pond: still water a hand below the lawn, a ring of rounded stones around it.
  const q = pondQ(x, y);
  if (q < 1.2) {
    if (q < 1.0) {
      gH = WATER;
      gM = WATER_M;
      const depth = clamp01((1 - q) * 1.6 + (fbm(x * 1.5, y * 1.5, SEED + 31, 2) - 0.5) * 0.3);
      const ripple = (noise(x * 9, y * 3.2, SEED + 37) - 0.5) * 0.06;
      mixTo(p.shallow, p.deep, depth, ripple);
      const edge = Math.exp(-((q - 0.97) ** 2) / 0.0006) * 0.5;
      gR += (p.foam[0] - gR) * edge; gG += (p.foam[1] - gG) * edge; gB += (p.foam[2] - gB) * edge;
    }
    if (q > 0.93) {
      const c = cellsId(x * 5.2, y * 5.2, SEED + 41);
      const band = smooth(0.93, 0.99, q) * (1 - smooth(1.12, 1.2, q));
      const stone = Math.sqrt(Math.max(0, 1 - (c / 0.46) ** 2)) * band;
      if (stone > 0.02) {
        const h = Math.min(gH, LAWN) + stone * 0.14;
        if (h > gH) {
          gH = h;
          gM = STONES;
          mixTo(p.rock, p.rock2, cellHash, (stone - 0.6) * 0.12 + grain * 0.05);
        }
      } else if (q > 1.0) {
        gH = LAWN - 0.02;
        gM = STONES;
        mixTo(p.soil, p.rock2, 0.4, grain * 0.04);
      }
    }
  }

  // Flower bed: a stone kerb round a full mound of gazanias.
  const rb = Math.hypot(x - BED.x, y - BED.y);
  if (rb < BED.r + 0.14) {
    if (rb >= BED.r) {
      const ang = Math.atan2(y - BED.y, x - BED.x);
      const blk = ang * 9 / Math.PI;
      const joint = Math.abs(blk - Math.round(blk));
      gH = LAWN + 0.13 - 0.02 * (1 - smooth(0.0, 0.06, Math.min(rb - BED.r, BED.r + 0.14 - rb))) - (joint < 0.04 ? 0.01 : 0);
      gM = KERB;
      set(p.rock, 0.06 + grain * 0.05 - (joint < 0.04 ? 0.08 : 0));
    } else {
      const mound = Math.sqrt(1 - (rb / BED.r) ** 2);
      const c = cellsId(x * 7.5, y * 7.5, SEED + 43);
      const id = cellHash;
      const head = 1 - smooth(0.0, 0.42, c);
      const lf = 1 - smooth(0.05, 0.6, cells(x * 24, y * 24, SEED + 47));
      gH = LAWN + 0.05 + mound * 0.24 + lf * 0.015;
      gM = BED_M;
      mixTo(p.forest, p.leaf, lf, grain * 0.04);
      if (id > 0.08 && head > 0.12) {
        gH += head * 0.05;
        const petal = id < 0.5 ? p.petalA : id < 0.78 ? p.petalB : p.petalC;
        const t = smooth(0.12, 0.3, head);
        gR = lerp(gR, petal[0], t); gG = lerp(gG, petal[1], t); gB = lerp(gB, petal[2], t);
        // Gazania: a dark eye ringed with a paler band.
        const eye = smooth(0.78, 0.86, head);
        gR = lerp(gR, p.eye[0], eye); gG = lerp(gG, p.eye[1], eye); gB = lerp(gB, p.eye[2], eye);
      }
    }
  }

  // Hedge: a ridge of small Worley cells, boxy with rounded shoulders.
  for (const b of HEDGES) {
    if (sdBox(x, y, b) > 0.1) continue;
    const lump = 1 - smooth(0.05, 0.6, cells(x * 6.5, y * 6.5, SEED + 53));
    const sd = sdBox(x, y, b) + (lump - 0.5) * 0.08 + (noise(x * 2, y * 2, SEED + 59) - 0.5) * 0.05;
    if (sd < 0) {
      const prof = smooth(0, 0.2, -sd);
      const h = LAWN + (0.86 + lump * 0.09 + (fbm(x * 1.5, y * 1.5, SEED + 61, 2) - 0.5) * 0.08) * Math.sqrt(prof);
      if (h > gH) {
        gH = h;
        gM = HEDGE;
        mixTo(p.forest, p.canopy, lump * 0.8 * (0.6 + 0.4 * prof), grain * 0.06);
      }
    }
  }

  // Monument: a stone plinth, the meteorite on it (ridged noise, thumb-print pits, the crater's glints).
  if (r0 < 0.72) {
    gH = PLINTH_TOP - 0.035 * (1 - smooth(0, 0.05, 0.7 - r0));
    gM = PLINTH;
    set(p.rock, 0.12 + grain * 0.05);
    const ang = Math.atan2(y, x);
    const rr = 0.5 * (1 + 0.32 * (fbm(Math.cos(ang) * 1.2 + 4, Math.sin(ang) * 1.2 + 4, SEED + 67, 3) - 0.5));
    const qx = x - 0.04, qy = y + 0.03;
    const qr = Math.hypot(qx, qy) / rr;
    if (qr < 1) {
      const dome = Math.pow(1 - qr * qr, 0.5);
      const crest = ridged(x * 2.4 + 1.3, y * 2.4, SEED + 71, 3);
      const pit = cellsId(x * 11, y * 11, SEED + 73);
      gH = PLINTH_TOP + 1.4 * dome * (0.78 + 0.32 * crest) - (1 - smooth(0.0, 0.35, pit)) * 0.03 * dome;
      gM = ROCK;
      mixTo(p.basalt, p.ash, fbm(x * 5, y * 5, SEED + 79, 2), grain * 0.06 - (1 - smooth(0, 0.3, pit)) * 0.06);
      if (cellHash > 0.93 && pit < 0.12) gGlow = 0.8;
    }
  }

  // Benches facing the plaza: end panels, a slatted seat, a back. The height field makes each a solid box;
  // wallColour paints the open space under the seat.
  for (const b of BENCHES) {
    const [la, lf] = benchLocal(x, y, b);
    if (Math.abs(la) < BENCH_HALF && lf > -0.26 && lf < 0.24) {
      const end = Math.abs(la) > BENCH_HALF - 0.07;
      const back = lf < -0.16;
      const slat = (lf + 0.16) / 0.1;
      const groove = !back && !end && Math.abs(slat - Math.round(slat)) < 0.1 ? 1 : 0;
      gH = end ? 0.62 - 0.02 * smooth(0.2, 0.24, Math.abs(lf + 0.01)) : back ? 0.88 : 0.46 - groove * 0.02;
      gM = BENCH;
      const tone = (hash2(Math.floor(slat), Math.round(b[0] * 10), SEED + 83) - 0.5) * 0.07;
      set(p.wood, tone - groove * 0.2 + (end ? -0.05 : 0) + grain * 0.03 + (noise(la * 30, lf * 3, SEED + 85) - 0.5) * 0.05);
    }
  }

  // Lamp posts (the globes float as clumps).
  for (const [lx, ly] of LAMPS) {
    const r = Math.hypot(x - lx, y - ly);
    if (r < 0.085) {
      gH = r < 0.035 ? LAMP_Z - 0.13 : LAWN + 0.26;
      gM = POST;
      set(p.metal, grain * 0.03);
    }
  }

  // Trunks with a root flare; the crown hides their tops.
  for (let t = 0; t < TREES.length; t++) {
    const tr = TREES[t]!;
    const r = Math.hypot(x - tr.x, y - tr.y);
    const rad = 0.06 + tr.h * 0.02;
    if (r < rad * 2.4) {
      const ang = Math.atan2(y - tr.y, x - tr.x);
      const roots = Math.pow(Math.max(0, Math.cos(ang * 5 + t)), 4);
      const flare = LAWN + 0.4 * Math.pow(1 - r / (rad * 2.4), 2) * (0.5 + roots);
      const h = flare;
      if (h > gH) {
        gH = h;
        gM = BARK;
        set(p.bark, grain * 0.05 + (noise(ang * 4, r * 8, SEED + 89) - 0.5) * 0.06);
      }
    }
  }
}

/** Colour of a vertical face of the ground, from its 3D point, so steep sides are not streaked. */
function wallColour(m: number, x: number, y: number, z: number, top: RGB, p: Palette): RGB {
  const grain = noise((x + y) * 22, z * 22, SEED + 3) - 0.5;
  switch (m) {
    case PAVE: {
      // The slab's cut side: stone in courses, darker towards the bottom.
      const course = (z - SLAB_BOTTOM) / 0.2;
      const bed = Math.abs(course - Math.round(course)) < 0.06 ? 0.1 : 0;
      const k = grain * 0.05 - bed - (1 - smooth(SLAB_BOTTOM, 0, z)) * 0.08;
      const s: RGB = [lerp(p.pad[0], p.rock[0], 0.4) + k, lerp(p.pad[1], p.rock[1], 0.4) + k, lerp(p.pad[2], p.rock[2], 0.4) + k];
      return s;
    }
    case PLINTH:
    case KERB:
    case STONES: {
      const k = grain * 0.05 + (fbm((x - y) * 4, z * 4, SEED + 191, 2) - 0.5) * 0.08 - (m === STONES ? 0.1 : 0);
      return [p.rock[0] + 0.1 + k, p.rock[1] + 0.1 + k, p.rock[2] + 0.1 + k];
    }
    case ROCK: {
      const t = fbm((x + y) * 5, z * 5, SEED + 79, 2);
      const pit = cells((x - y) * 9, z * 9, SEED + 73);
      const k = grain * 0.06 - (1 - smooth(0, 0.3, pit)) * 0.06;
      return [lerp(p.basalt[0], p.ash[0], t) + k, lerp(p.basalt[1], p.ash[1], t) + k, lerp(p.basalt[2], p.ash[2], t) + k];
    }
    case BARK: {
      const ang = Math.atan2(y, x);
      const ridge = noise(ang * 9, z * 1.8, SEED + 97) - 0.5;
      const k = ridge * 0.12 + grain * 0.04;
      return [p.bark[0] + k, p.bark[1] + k, p.bark[2] + k];
    }
    case BENCH: {
      // Under the seat is open, so the box's side is painted as the dark beneath it; the back is slatted.
      for (const b of BENCHES) {
        const [la, lf] = benchLocal(x, y, b);
        if (Math.abs(la) > BENCH_HALF + 0.05 || Math.abs(lf) > 0.3) continue;
        const w = p.wood;
        if (Math.abs(la) > BENCH_HALF - 0.075) return [w[0] - 0.06 + grain * 0.04, w[1] - 0.05 + grain * 0.04, w[2] - 0.04 + grain * 0.04];
        if (z < 0.4) return [p.forest[0] * 0.45, p.forest[1] * 0.45, p.forest[2] * 0.45];
        if (z > 0.48) {
          const f = (z - 0.48) / 0.135;
          if (f - Math.floor(f) < 0.22) return [w[0] * 0.4, w[1] * 0.4, w[2] * 0.4];
        }
        return [w[0] + grain * 0.04, w[1] + grain * 0.04, w[2] + grain * 0.04];
      }
      return top;
    }
    case HEDGE: {
      const lump = 1 - smooth(0.05, 0.6, cells((x - y) * 6.5, z * 6.5, SEED + 53));
      return [lerp(p.forest[0], p.canopy[0], lump * 0.7) + grain * 0.05, lerp(p.forest[1], p.canopy[1], lump * 0.7) + grain * 0.05, lerp(p.forest[2], p.canopy[2], lump * 0.7) + grain * 0.05];
    }
    default:
      return top;
  }
}

// ---------------------------------------------------------------- cameras and the column splat

interface Cam {
  rx: number; ry: number; ux: number; uy: number; uz: number; fx: number; fy: number; fz: number;
  scale: number; cx: number; cy: number; W: number; H: number;
}

/** An orthographic camera looking along `f`, its right vector kept level so columns stay vertical. */
function makeCam(f: [number, number, number], scale: number, cx: number, cy: number, W: number, H: number): Cam {
  const fl = Math.hypot(f[0], f[1], f[2]);
  const fx = f[0] / fl, fy = f[1] / fl, fz = f[2] / fl;
  const rl = Math.hypot(fy, fx);
  const rx = fy / rl, ry = -fx / rl;
  return { rx, ry, ux: ry * fz, uy: -rx * fz, uz: rx * fy - ry * fx, fx, fy, fz, scale, cx, cy, W, H };
}

interface Buffers { depth: Float32Array; who: Int32Array }
function buffers(c: Cam): Buffers {
  return { depth: new Float32Array(c.W * c.H).fill(Infinity), who: new Int32Array(c.W * c.H).fill(-1) };
}

interface Grid { N: number; g: number; h: Float32Array; m: Uint8Array; col: Float32Array; glow: Float32Array }

function buildGrid(N: number, p: Palette): Grid {
  const g = (2 * HALF) / N;
  const h = new Float32Array(N * N), m = new Uint8Array(N * N), col = new Float32Array(N * N * 3), glow = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const y = -HALF + (j + 0.5) * g;
    for (let i = 0; i < N; i++) {
      const x = -HALF + (i + 0.5) * g;
      ground(x, y, p);
      const k = j * N + i;
      h[k] = gH; m[k] = gM; col[k * 3] = gR; col[k * 3 + 1] = gG; col[k * 3 + 2] = gB; glow[k] = gGlow;
    }
  }
  return { N, g, h, m, col, glow };
}

/** Each grid point is a column from its height down to its lowest neighbour (the slab's foot at the edge). */
function splatGround(c: Cam, G: Grid, B: Buffers, stride: number): void {
  const { N, g, h } = G;
  const { depth, who } = B;
  for (let j = 0; j < N; j += stride) {
    const y = -HALF + (j + 0.5) * g;
    for (let i = 0; i < N; i += stride) {
      const k = j * N + i;
      const zt = h[k]!;
      let zb = zt;
      const nb = (ii: number, jj: number) => (ii < 0 || jj < 0 || ii >= N || jj >= N ? SLAB_BOTTOM : h[jj * N + ii]!);
      // All eight neighbours: with four, the inner corner of a staircase edge leaves a hole in the wall.
      zb = Math.min(zb, nb(i - stride, j), nb(i + stride, j), nb(i, j - stride), nb(i, j + stride));
      zb = Math.min(zb, nb(i - stride, j - stride), nb(i + stride, j - stride), nb(i - stride, j + stride), nb(i + stride, j + stride));
      const x = -HALF + (i + 0.5) * g;
      const px = Math.floor(c.cx + (x * c.rx + y * c.ry) * c.scale);
      if (px < 0 || px >= c.W) continue;
      const xyu = x * c.ux + y * c.uy;
      const xyf = x * c.fx + y * c.fy;
      const syT = c.cy - (xyu + zt * c.uz) * c.scale;
      const syB = c.cy - (xyu + zb * c.uz) * c.scale;
      const r0 = Math.max(0, Math.floor(syT));
      const r1 = Math.min(c.H - 1, Math.floor(syB));
      for (let row = r0; row <= r1; row++) {
        let z = ((c.cy - (row + 0.5)) / c.scale - xyu) / c.uz;
        if (z > zt) z = zt;
        else if (z < zb) z = zb;
        const d = xyf + z * c.fz;
        const pi = row * c.W + px;
        if (d < depth[pi]!) {
          depth[pi] = d;
          who[pi] = k;
        }
      }
    }
  }
}

/** Lumpy spheres, intersected per pixel; the leafy relief moves the surface, a few steps settle it. */
function splatClumps(c: Cam, B: Buffers, nGround: number): void {
  const { depth, who } = B;
  for (let ci = 0; ci < clumps.length; ci++) {
    const s = clumps[ci]!;
    const rmax = s.r * (1 + s.amp);
    const scx = c.cx + (s.x * c.rx + s.y * c.ry) * c.scale;
    const scy = c.cy - (s.x * c.ux + s.y * c.uy + s.z * c.uz) * c.scale;
    const rp = rmax * c.scale;
    const i0 = Math.max(0, Math.floor(scx - rp)), i1 = Math.min(c.W - 1, Math.ceil(scx + rp));
    const j0 = Math.max(0, Math.floor(scy - rp)), j1 = Math.min(c.H - 1, Math.ceil(scy + rp));
    const seed = 101 + s.tree * 17;
    for (let j = j0; j <= j1; j++) {
      const Y = (c.cy - (j + 0.5)) / c.scale;
      for (let i = i0; i <= i1; i++) {
        const X = (i + 0.5 - c.cx) / c.scale;
        const ox = X * c.rx + Y * c.ux, oy = X * c.ry + Y * c.uy, oz = Y * c.uz;
        const vx = s.x - ox, vy = s.y - oy, vz = s.z - oz;
        const tca = vx * c.fx + vy * c.fy + vz * c.fz;
        const d2 = vx * vx + vy * vy + vz * vz - tca * tca;
        if (d2 >= rmax * rmax) continue;
        let rr = rmax;
        let t = 0;
        let hit = false;
        for (let it = 0; it < (s.amp ? 3 : 1); it++) {
          if (d2 >= rr * rr) { hit = false; break; }
          t = tca - Math.sqrt(rr * rr - d2);
          hit = true;
          if (!s.amp) break;
          const lf = leafy(ox + c.fx * t, oy + c.fy * t, oz + c.fz * t, seed);
          rr = s.r * (1 - s.amp + 2 * s.amp * lf);
        }
        if (!hit || d2 >= rr * rr) continue;
        t = tca - Math.sqrt(rr * rr - d2);
        const pi = j * c.W + i;
        if (t < depth[pi]!) {
          depth[pi] = t;
          who[pi] = nGround + ci;
        }
      }
    }
  }
}

// ---------------------------------------------------------------- shading

const SUN: [number, number, number] = (() => {
  // The grounds' sun (park-spec.json): azimuth 250° from north, 35° up — the camera's left, so the faces we see are
  // lit. The map's north-west sun would leave every face this camera sees in shade.
  const az = (250 * Math.PI) / 180, el = (35 * Math.PI) / 180;
  const v = [Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el)];
  const l = Math.hypot(v[0]!, v[1]!, v[2]!);
  return [v[0]! / l, v[1]! / l, v[2]! / l];
})();

export interface Painted { rgba: Uint8Array; W: number; H: number; ms: Record<string, number> }

export function paintPark(theme: Theme, ss = 2): Painted {
  const p = theme === 'dark' ? DARK : LIGHT;
  const ms: Record<string, number> = {};
  let t0 = performance.now();
  const lap = (name: string) => {
    const t = performance.now();
    ms[name] = Math.round(t - t0);
    t0 = t;
  };

  // The grounds' camera, as the Blender render: rotation (60°, 0, 45°), orthographic, 21 m across 1600 px.
  const OW = 1600, OH = 1200;
  const scale = (OW / 21) * ss;
  const cam = makeCam([-Math.sin(Math.PI / 3) * Math.SQRT1_2, Math.sin(Math.PI / 3) * Math.SQRT1_2, -0.5], scale, (OW / 2) * ss, (OH / 2) * ss, OW * ss, OH * ss);

  // Columns closer than a pixel apart, so the splat leaves no holes.
  const N = Math.ceil((2 * HALF) / (0.68 / (Math.SQRT1_2 * scale)));
  const G = buildGrid(N, p);
  lap('grid');

  const B = buffers(cam);
  splatGround(cam, G, B, 1);
  splatClumps(cam, B, N * N);
  lap('splat');

  // The sun's view, for cast shadows: same columns, coarser.
  const texel = 0.014;
  const sunF: [number, number, number] = [-SUN[0], -SUN[1], -SUN[2]];
  const probe = makeCam(sunF, 1, 0, 0, 1, 1);
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (const x of [-HALF - 0.5, HALF + 0.5]) for (const y of [-HALF - 0.5, HALF + 0.5]) for (const z of [SLAB_BOTTOM, 8]) {
    const u = x * probe.rx + y * probe.ry, v = x * probe.ux + y * probe.uy + z * probe.uz;
    umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
  }
  const sun = makeCam(sunF, 1 / texel, -umin / texel, vmax / texel, Math.ceil((umax - umin) / texel), Math.ceil((vmax - vmin) / texel));
  const SB = buffers(sun);
  splatGround(sun, G, SB, Math.max(1, Math.floor((0.7 * texel) / G.g)));
  splatClumps(sun, SB, N * N);
  lap('shadowmap');

  // Ambient occlusion from above: how far the land and crowns nearby stand over a point.
  const AN = 240, ag = (2 * HALF) / AN;
  const occ = new Float32Array(AN * AN);
  for (let j = 0; j < AN; j++) for (let i = 0; i < AN; i++) {
    const x = -HALF + (i + 0.5) * ag, y = -HALF + (j + 0.5) * ag;
    const gi = Math.min(N - 1, Math.floor(((x + HALF) / (2 * HALF)) * N)), gj = Math.min(N - 1, Math.floor(((y + HALF) / (2 * HALF)) * N));
    // Trunks and posts are too thin to shade the lawn round them.
    const gm = G.m[gj * N + gi]!;
    let o = gm === BARK || gm === POST ? LAWN : G.h[gj * N + gi]!;
    for (const s of clumps) {
      if (s.kind !== FOLIAGE) continue;
      const d2 = (x - s.x) ** 2 + (y - s.y) ** 2;
      if (d2 < s.r * s.r) o = Math.max(o, Math.min(s.z, s.z - Math.sqrt(s.r * s.r - d2) + 1.2));
    }
    occ[j * AN + i] = o;
  }
  const blurred = [0.15, 0.5, 1.4].map((r) => boxBlur(occ, AN, Math.max(1, Math.round(r / ag))));
  const aoAt = (x: number, y: number, z: number) => {
    const i = Math.min(AN - 1, Math.max(0, Math.floor((x + HALF) / ag))), j = Math.min(AN - 1, Math.max(0, Math.floor((y + HALF) / ag)));
    const k = j * AN + i;
    const o = 0.3 * clamp01((blurred[0]![k]! - z) / 0.25) + 0.25 * clamp01((blurred[1]![k]! - z) / 0.8) + 0.3 * clamp01((blurred[2]![k]! - z) / 2.4);
    return 1 - o;
  };
  lap('ao');

  const { W, H } = cam;
  const depth = B.depth, who = B.who;
  const nG = N * N;
  const rgb = new Float32Array(W * H * 3);
  const zbuf = new Float32Array(W * H).fill(NaN);
  const isWater = new Uint8Array(W * H);
  const noContour = new Uint8Array(W * H);
  const lampsZ = LAMP_Z;
  const tolZ = 1.6 / (scale * cam.uz);
  const glintCol = p.glint;

  const groupOf = (w: number) => (w < 0 ? -1 : w < nG ? 0 : clumps[w - nG]!.group);

  for (let j = 0; j < H; j++) {
    const Y = (cam.cy - (j + 0.5)) / scale;
    for (let i = 0; i < W; i++) {
      const pi = j * W + i;
      const w = who[pi]!;
      if (w < 0) continue;
      const X = (i + 0.5 - cam.cx) / scale;
      const d = depth[pi]!;
      const px = X * cam.rx + Y * cam.ux + d * cam.fx;
      const py = X * cam.ry + Y * cam.uy + d * cam.fy;
      const pz = Y * cam.uz + d * cam.fz;
      zbuf[pi] = pz;

      // Normal: the height field's own gradient on top, the depth buffer's on walls and crowns.
      let nx = 0, ny = 0, nz = 1;
      let ar = 0, ag2 = 0, ab = 0;
      let glow = 0;
      let mat = 0;
      let wall = false;
      let ao = 1;
      const grp = groupOf(w);
      if (w < nG) {
        mat = G.m[w]!;
        const zt = G.h[w]!;
        ar = G.col[w * 3]!; ag2 = G.col[w * 3 + 1]!; ab = G.col[w * 3 + 2]!;
        glow = G.glow[w]!;
        if (zt - pz <= tolZ) {
          const gi = w % N, gj = (w - gi) / N;
          const hx0 = G.h[gj * N + Math.max(0, gi - 1)]!, hx1 = G.h[gj * N + Math.min(N - 1, gi + 1)]!;
          const hy0 = G.h[Math.max(0, gj - 1) * N + gi]!, hy1 = G.h[Math.min(N - 1, gj + 1) * N + gi]!;
          nx = -(hx1 - hx0) / (2 * G.g); ny = -(hy1 - hy0) / (2 * G.g); nz = 1;
          if (mat === WATER_M) { nx *= 0.1; ny *= 0.1; }
          // Past about 60° a grid's staircase shows in its normals: treat it as a wall.
          if (nx * nx + ny * ny > 3) wall = true;
        } else wall = true;
        if (wall) {
          const c = wallColour(mat, px, py, pz, [ar, ag2, ab], p);
          ar = c[0]; ag2 = c[1]; ab = c[2];
          if (mat !== ROCK) glow = 0;
          // A wall faces where the land falls away round it. Sampled on a ring a few cells wide, so the grid's
          // staircase along a round or slanted edge averages out.
          const fx0 = (px + HALF) / G.g - 0.5, fy0 = (py + HALF) / G.g - 0.5;
          let sx = 0, sy = 0;
          for (let k = 0; k < 16; k++) {
            const a = (k / 16) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
            const ii = Math.round(fx0 + ca * 6), jj = Math.round(fy0 + sa * 6);
            const hq = ii < 0 || jj < 0 || ii >= N || jj >= N ? SLAB_BOTTOM : G.h[jj * N + ii]!;
            const drop = zt - hq;
            if (drop > 0) { sx += ca * drop; sy += sa * drop; }
          }
          const wl = Math.hypot(sx, sy);
          if (wl > 1e-5) { nx = sx / wl; ny = sy / wl; nz = 0.12; }
          else {
            const n = screenNormal(depth, who, groupOf, grp, i, j, W, H, d, cam, scale);
            nx = n[0]; ny = n[1]; nz = n[2];
          }
        }
        if (!wall) ao = aoAt(px, py, pz);
        else if (mat !== PAVE) ao = 0.6 + 0.4 * smooth(LAWN, LAWN + 0.6, pz);
        if (mat === POST || mat === BARK) noContour[pi] = 1;
        if (mat === ROCK) {
          // The meteorite's skin: ridged crests and thumb-print pits in 3D, as a normal map over the dome.
          const nl0 = Math.hypot(nx, ny, nz);
          nx /= nl0; ny /= nl0; nz /= nl0;
          const rb = rockBump(px, py, pz);
          const e = 0.015, k = 0.06 / e;
          const gx = (rockBump(px + e, py, pz) - rb) * k, gy = (rockBump(px, py + e, pz) - rb) * k, gz = (rockBump(px, py, pz + e) - rb) * k;
          const gn = gx * nx + gy * ny + gz * nz;
          nx -= gx - gn * nx; ny -= gy - gn * ny; nz -= gz - gn * nz;
          ao *= 0.75 + 0.25 * rb;
        }
        if (mat === HEDGE) {
          // A hedge is leaves on every face: the crowns' 3D relief as a normal map, on its top and its sides.
          const nl0 = Math.hypot(nx, ny, nz);
          nx /= nl0; ny /= nl0; nz /= nl0;
          const hs = SEED + 171;
          const lf = hedgeLeaf(px, py, pz, hs);
          const e = 0.02, k = 0.05 / e;
          const gx = (hedgeLeaf(px + e, py, pz, hs) - lf) * k, gy = (hedgeLeaf(px, py + e, pz, hs) - lf) * k, gz = (hedgeLeaf(px, py, pz + e, hs) - lf) * k;
          const gn = gx * nx + gy * ny + gz * nz;
          nx -= gx - gn * nx; ny -= gy - gn * ny; nz -= gz - gn * nz;
          const grain = noise(px * 30 + pz * 17, py * 30, SEED + 173) - 0.5;
          const t = lf * 0.85;
          ar = lerp(p.forest[0], p.canopy[0], t) + grain * 0.06;
          ag2 = lerp(p.forest[1], p.canopy[1], t) + grain * 0.06;
          ab = lerp(p.forest[2], p.canopy[2], t) + grain * 0.06;
          ao *= 0.7 + 0.3 * lf;
          noContour[pi] = 1;
        }
      } else {
        const s = clumps[w - nG]!;
        // A clump's normal is its sphere's, tilted by the slope of the leafy relief.
        const sx0 = px - s.x, sy0 = py - s.y, sz0 = pz - s.z;
        const sl = Math.hypot(sx0, sy0, sz0) || 1;
        nx = sx0 / sl; ny = sy0 / sl; nz = sz0 / sl;
        if (s.kind === FOLIAGE) {
          const cr = crowns[s.tree]!;
          const sd = 101 + s.tree * 17;
          const lf = leafy(px, py, pz, sd);
          const e = 0.03;
          const k = (2 * s.amp * s.r) / e;
          const gx = (leafy(px + e, py, pz, sd) - lf) * k, gy = (leafy(px, py + e, pz, sd) - lf) * k, gz = (leafy(px, py, pz + e, sd) - lf) * k;
          const gn = gx * nx + gy * ny + gz * nz;
          nx -= (gx - gn * nx) * 0.8; ny -= (gy - gn * ny) * 0.8; nz -= (gz - gn * nz) * 0.8;
          // Single leaves catch the light at their own angles.
          nx += (noise(px * 26 + pz * 13, py * 26, SEED + 161) - 0.5) * 0.7;
          ny += (noise(py * 26 - pz * 11, px * 26, SEED + 163) - 0.5) * 0.7;
          nz += (noise(pz * 26 + px * 7, py * 26, SEED + 167) - 0.5) * 0.5;
          const grain = noise(px * 30 + pz * 11, py * 30, SEED + 151) - 0.5;
          const leaf = noise(px * 70 + pz * 40, py * 70 - pz * 30, SEED + 153) - 0.5;
          // The map's forest: dark between crowns, the canopy colour on top of each; then single leaves.
          const t = clamp01(lf * 0.95 + leaf * 0.35);
          ar = lerp(p.forest[0], p.canopy[0], t) + grain * 0.05;
          ag2 = lerp(p.forest[1], p.canopy[1], t) + grain * 0.05;
          ab = lerp(p.forest[2], p.canopy[2], t) + grain * 0.05;
          // Deep inside the crown is darker than its outside, and its underside darker than its top.
          const ox = px - cr.x, oy = py - cr.y, oz = pz - cr.z;
          const depthIn = Math.hypot(ox, oy, oz) / cr.R;
          ao = (0.65 + 0.35 * smooth(0.45, 1.0, depthIn)) * (0.72 + 0.28 * lf) * (0.85 + 0.15 * smooth(-0.8, 0.5, oz / cr.R));
          mat = -1;
          noContour[pi] = 1;
        } else if (s.kind === LIMB) {
          const tr = TREES[s.tree]!;
          const k = (noise(Math.atan2(py - tr.y, px - tr.x) * 6, pz * 2.2, SEED + 97) - 0.5) * 0.14 + (noise(px * 40, pz * 40, SEED + 3) - 0.5) * 0.05;
          ar = p.bark[0] + k; ag2 = p.bark[1] + k; ab = p.bark[2] + k;
          ao = 0.75 + 0.25 * smooth(LAWN, LAWN + 0.8, pz);
          mat = -4;
          noContour[pi] = 1;
        } else if (s.kind === GLOBE) {
          ar = p.globe[0]; ag2 = p.globe[1]; ab = p.globe[2];
          mat = -2;
        } else {
          ar = p.metal[0]; ag2 = p.metal[1]; ab = p.metal[2];
          mat = -3;
        }
      }
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl; ny /= nl; nz /= nl;

      // Cast shadow: the sun's depth at this point, 3×3 taps for a soft edge.
      const su = px * sun.rx + py * sun.ry, sv = px * sun.ux + py * sun.uy + pz * sun.uz;
      const sd = px * sun.fx + py * sun.fy + pz * sun.fz;
      const fu = sun.cx + su * sun.scale - 0.5, fv = sun.cy - sv * sun.scale - 0.5;
      const lam = nx * SUN[0] + ny * SUN[1] + nz * SUN[2];
      const bias = 0.03 + 0.05 * (1 - clamp01(lam));
      let lit = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const ti = Math.round(fu + a * 1.4), tj = Math.round(fv + b * 1.4);
        if (ti < 0 || tj < 0 || ti >= sun.W || tj >= sun.H) { lit++; continue; }
        if (sd - bias <= SB.depth[tj * sun.W + ti]!) lit++;
      }
      const shadow = lit / 9;

      let light = p.ambient * ao + p.diffuse * clamp01(lam) * shadow;
      // Leaves let a little sun through, so a crown lit from behind is not a dark ball.
      if (mat === -1) light += p.diffuse * 0.22 * clamp01(-lam) * ao;
      if (p.clouds) light *= 1 - p.clouds * smooth(0.52, 0.72, fbm(px * 0.11 + 3.1, py * 0.11, SEED + 127, 3));
      let r = ar * light, g = ag2 * light, b = ab * light;

      if (mat === WATER_M && !wall) {
        isWater[pi] = 1;
        // The map's water is not lit, it is coloured; shade only keeps it under the trees' shadow.
        const k = 0.8 + 0.2 * shadow;
        r = ar * k; g = ag2 * k; b = ab * k;
        if (theme === 'light' && noise(px * 40, py * 14, SEED + 149) > 0.9 && shadow > 0.5) { r += 0.18; g += 0.18; b += 0.18; }
      }
      if (mat === -2) {
        // Glass: lit by day, burning at dusk.
        if (theme === 'dark') { r = 1.0; g = 0.86; b = 0.6; } else { r = ar * (0.75 + 0.35 * clamp01(lam)); g = ag2 * (0.75 + 0.35 * clamp01(lam)); b = ab * (0.75 + 0.35 * clamp01(lam)); }
      }

      if (theme === 'dark') {
        // Lamp light: warm pools on whatever faces a globe.
        for (const [lx, ly] of LAMPS) {
          const vx = lx - px, vy = ly - py, vz = lampsZ - pz;
          const dl = Math.hypot(vx, vy, vz);
          if (dl < 0.2) continue;
          // Hedges, benches and the plinth stand in a lamp's way: a few steps along the ray over the height field.
          let seen = 1;
          for (let q = 1; q < 10 && seen; q++) {
            const f = q / 10, qx = px + vx * f, qy = py + vy * f;
            const gi = Math.floor((qx + HALF) / G.g), gj = Math.floor((qy + HALF) / G.g);
            if (gi >= 0 && gj >= 0 && gi < N && gj < N && G.h[gj * N + gi]! > pz + vz * f + 0.02 && G.m[gj * N + gi] !== POST) seen = 0;
          }
          if (!seen) continue;
          const nd = clamp01((vx * nx + vy * ny + vz * nz) / dl);
          const fall = 1 / (1 + (dl / 2.2) ** 2) ** 2;
          // Leaves right beside a globe would flare: they scatter the light, so they take less of it.
          const k = 1.5 * fall * (0.15 + 0.85 * nd) * (mat === -1 ? 0.45 : 1);
          // Lamplight shows the day colour back, so undo the night palette for it.
          r += (ar / 0.34) * 1.0 * k;
          g += (ag2 / 0.4) * 0.74 * k;
          b += (Math.max(0, ab - 0.03) / 0.48) * 0.45 * k;
        }
        if (mat === WATER_M && !wall) {
          // The lamps in the pond: reflected rays pass near a globe, stretched by the ripples.
          const rip = (noise(px * 12, py * 4, SEED + 157) - 0.5) * 0.12;
          const rx = cam.fx + rip, ry = cam.fy - rip * 0.5, rz = -cam.fz;
          const rl = Math.hypot(rx, ry, rz);
          for (const [lx, ly] of LAMPS) {
            const vx = lx - px, vy = ly - py, vz = lampsZ - pz;
            const along = (vx * rx + vy * ry + vz * rz) / rl;
            if (along <= 0) continue;
            const perp2 = vx * vx + vy * vy + vz * vz - along * along;
            const k = Math.exp(-perp2 / 0.03) * 0.9;
            r += 1.0 * k; g += 0.78 * k; b += 0.45 * k;
          }
        }
      }
      if (p.contour && mat === PAVE) {
        // The slab's top edge drawn as the hologram's edge, as the map rings the store's pad.
        const e = HALF - Math.max(Math.abs(px), Math.abs(py));
        if (e < 0.05 && pz > -0.06) {
          const k = 0.55 * (1 - e / 0.05);
          r += p.contour[0] * k; g += p.contour[1] * k; b += p.contour[2] * k;
        }
      }
      if (glow) { r += glintCol[0] * glow * (theme === 'dark' ? 1 : 0.5); g += glintCol[1] * glow * (theme === 'dark' ? 1 : 0.5); b += glintCol[2] * glow * (theme === 'dark' ? 1 : 0.5); }

      if (DEBUG === 'walls' && w < nG) { r = wall ? 1 : 0; g = (nx * 0.5 + 0.5) * 0.8; b = wall ? 0 : 1; }
      if (DEBUG === 'normals') { r = nx * 0.5 + 0.5; g = ny * 0.5 + 0.5; b = nz * 0.5 + 0.5; }
      rgb[pi * 3] = r; rgb[pi * 3 + 1] = g; rgb[pi * 3 + 2] = b;
    }
  }
  lap('shade');

  // The hologram's contour lines: every 25 cm of height, a pixel and a half wide whatever the slope.
  if (p.contour) {
    const cc = p.contour;
    for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
      const pi = j * W + i;
      const z = zbuf[pi]!;
      if (z !== z || isWater[pi]) continue;
      const dzx = Math.min(Math.abs(zbuf[pi + 1]! - z) || 9, Math.abs(zbuf[pi - 1]! - z) || 9);
      const dzy = Math.min(Math.abs(zbuf[pi + W]! - z) || 9, Math.abs(zbuf[pi - W]! - z) || 9);
      const fw = Math.max(dzx < 1 ? dzx : 0, dzy < 1 ? dzy : 0) / 0.25;
      // Lines only where they can be read: not on leaves, trunks or posts, not where the surface turns away within a pixel.
      if (fw < 1e-5 || fw > 0.25 || noContour[pi]) continue;
      const f = ((((z + 0.125) / 0.25) % 1) + 1) % 1;
      const line = Math.max(0, 1 - Math.min(f, 1 - f) / fw / (1.2 * ss)) * 0.3;
      rgb[pi * 3] += cc[0] * line; rgb[pi * 3 + 1] += cc[1] * line; rgb[pi * 3 + 2] += cc[2] * line;
    }
    lap('contour');
  }

  // Down to the output size; coverage becomes alpha.
  const rgba = new Uint8Array(OW * OH * 4);
  const inv = 1 / (ss * ss);
  for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let v = 0; v < ss; v++) for (let u = 0; u < ss; u++) {
      const pi = (y * ss + v) * W + x * ss + u;
      if (who[pi]! < 0) continue;
      r += clamp01(rgb[pi * 3]!); g += clamp01(rgb[pi * 3 + 1]!); b += clamp01(rgb[pi * 3 + 2]!); a++;
    }
    const o = (y * OW + x) * 4;
    if (a) {
      rgba[o] = Math.round((r / a) * 255); rgba[o + 1] = Math.round((g / a) * 255); rgba[o + 2] = Math.round((b / a) * 255);
      rgba[o + 3] = Math.round(a * inv * 255);
    }
  }

  if (theme === 'dark') {
    // A soft halo round each globe, over whatever is behind it.
    for (const [lx, ly] of LAMPS) {
      const sx = OW / 2 + (lx * cam.rx + ly * cam.ry) * (scale / ss);
      const sy = OH / 2 - (lx * cam.ux + ly * cam.uy + LAMP_Z * cam.uz) * (scale / ss);
      const R = 46;
      for (let y = Math.floor(sy - R); y <= sy + R; y++) for (let x = Math.floor(sx - R); x <= sx + R; x++) {
        if (x < 0 || y < 0 || x >= OW || y >= OH) continue;
        const d2 = ((x + 0.5 - sx) ** 2 + (y + 0.5 - sy) ** 2) / (R * R);
        if (d2 > 1) continue;
        const k = Math.exp(-d2 * 6) * 0.55;
        const o = (y * OW + x) * 4;
        const a0 = rgba[o + 3]! / 255;
        const a = Math.max(a0, k);
        const blend = (c: number, add: number) => Math.min(255, Math.round(((c / 255) * a0 + add * k) / a * 255));
        rgba[o] = blend(rgba[o]!, 1.0); rgba[o + 1] = blend(rgba[o + 1]!, 0.8); rgba[o + 2] = blend(rgba[o + 2]!, 0.5);
        rgba[o + 3] = Math.round(a * 255);
      }
    }
  }
  lap('resolve');
  return { rgba, W: OW, H: OH, ms };
}

/** Normal from the depth buffer: the flatter side in each direction, staying on the same object. */
function screenNormal(
  depth: Float32Array, who: Int32Array, groupOf: (w: number) => number, grp: number,
  i: number, j: number, W: number, H: number, d: number, c: Cam, scale: number,
): [number, number, number] {
  const pick = (a: number, b: number, okA: boolean, okB: boolean) => {
    const da = okA ? d - a : NaN, db = okB ? b - d : NaN;
    if (da === da && db === db) return Math.abs(da) < Math.abs(db) ? da : db;
    if (da === da) return da;
    if (db === db) return db;
    return 0;
  };
  const same = (pi: number) => who[pi]! >= 0 && groupOf(who[pi]!) === grp && Math.abs(depth[pi]! - depth[j * W + i]!) < 0.25;
  const pl = j * W + Math.max(0, i - 1), pr = j * W + Math.min(W - 1, i + 1);
  const pu = Math.max(0, j - 1) * W + i, pd = Math.min(H - 1, j + 1) * W + i;
  const ddx = pick(depth[pl]!, depth[pr]!, same(pl), same(pr));
  const ddy = pick(depth[pu]!, depth[pd]!, same(pu), same(pd));
  // Tangents of the surface per pixel step: right / scale along x, -up / scale along y, plus the depth change.
  const tx = [c.rx / scale + ddx * c.fx, c.ry / scale + ddx * c.fy, ddx * c.fz];
  const ty = [-c.ux / scale + ddy * c.fx, -c.uy / scale + ddy * c.fy, -c.uz / scale + ddy * c.fz];
  let nx = ty[1]! * tx[2]! - ty[2]! * tx[1]!;
  let ny = ty[2]! * tx[0]! - ty[0]! * tx[2]!;
  let nz = ty[0]! * tx[1]! - ty[1]! * tx[0]!;
  if (nx * c.fx + ny * c.fy + nz * c.fz > 0) { nx = -nx; ny = -ny; nz = -nz; }
  return [nx, ny, nz];
}

function boxBlur(src: Float32Array, N: number, r: number): Float32Array {
  const tmp = new Float32Array(N * N), out = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let s = 0, n = 0;
    for (let k = -r; k <= r; k++) { const ii = i + k; if (ii >= 0 && ii < N) { s += src[j * N + ii]!; n++; } }
    tmp[j * N + i] = s / n;
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    let s = 0, n = 0;
    for (let k = -r; k <= r; k++) { const jj = j + k; if (jj >= 0 && jj < N) { s += tmp[jj * N + i]!; n++; } }
    out[j * N + i] = s / n;
  }
  return out;
}

// ---------------------------------------------------------------- run

const here = dirname(fileURLToPath(import.meta.url));
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ss = Number(process.argv[2] ?? 2);
  for (const [theme, name] of [['light', 'park_day.png'], ['dark', 'park_dusk.png']] as const) {
    const t = performance.now();
    const out = paintPark(theme, ss);
    const total = Math.round(performance.now() - t);
    writePng(join(here, name), out.rgba, out.W, out.H);
    console.log(`${name}: paint ${total} ms (ss ${ss})`, JSON.stringify(out.ms));
  }
}
