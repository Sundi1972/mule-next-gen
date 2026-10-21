import type { Terrain } from '../components/tokens';
import { cells, fbm, hash2, noise, ridged } from './noise';

/**
 * Paints the colony as one continuous landscape instead of coloured squares.
 *
 * Each pixel blends the terrains of the nearest plots across warped borders, builds a
 * height field (hills rise, mountains get ridges and snow, craters get rims), then lights
 * it from the north-west. Rivers are drawn as a smooth channel through the river plots.
 * The plot grid is not drawn here; the map component lays it over the top.
 */

export type LandscapeTheme = 'light' | 'dark';

export interface LandscapeInput {
  width: number;
  height: number;
  terrainAt(x: number, y: number): Terrain | undefined;
  /** Pixels per plot. The output is width × pxPerTile wide. */
  pxPerTile: number;
  theme: LandscapeTheme;
  seed?: number;
}

type RGB = [number, number, number];

interface Palette {
  grass: RGB; grass2: RGB; meadow: RGB;
  forest: RGB; canopy: RGB;
  swamp: RGB; reed: RGB;
  hills: RGB; hills2: RGB;
  rock: RGB; rock2: RGB; snow: RGB;
  sand: RGB; sand2: RGB;
  tundra: RGB; frost: RGB;
  ice: RGB; crack: RGB;
  basalt: RGB; ash: RGB; lava: RGB;
  dust: RGB; glint: RGB;
  shallow: RGB; deep: RGB; foam: RGB; bank: RGB;
  pad: RGB; padRing: RGB;
  ambient: number; diffuse: number;
  contour: RGB | null;
  clouds: number;
}

const LIGHT: Palette = {
  grass: [0.56, 0.73, 0.39], grass2: [0.47, 0.66, 0.33], meadow: [0.68, 0.78, 0.42],
  forest: [0.2, 0.42, 0.24], canopy: [0.36, 0.6, 0.31],
  swamp: [0.37, 0.46, 0.3], reed: [0.55, 0.58, 0.34],
  hills: [0.7, 0.68, 0.43], hills2: [0.6, 0.62, 0.38],
  rock: [0.58, 0.53, 0.49], rock2: [0.44, 0.41, 0.4], snow: [0.97, 0.98, 1],
  sand: [0.93, 0.81, 0.56], sand2: [0.85, 0.69, 0.45],
  tundra: [0.63, 0.65, 0.54], frost: [0.86, 0.89, 0.88],
  ice: [0.88, 0.94, 0.98], crack: [0.55, 0.75, 0.9],
  basalt: [0.3, 0.27, 0.27], ash: [0.45, 0.41, 0.4], lava: [1.0, 0.46, 0.14],
  dust: [0.68, 0.62, 0.64], glint: [0.85, 0.45, 1.0],
  shallow: [0.44, 0.77, 0.86], deep: [0.15, 0.44, 0.66], foam: [0.92, 0.97, 1], bank: [0.8, 0.74, 0.55],
  pad: [0.9, 0.91, 0.93], padRing: [0.05, 0.6, 0.72],
  ambient: 0.58, diffuse: 0.55,
  contour: null,
  clouds: 0.13,
};

/** Night: the same land, darker and cooler, with the hologram's contour lines. */
const DARK: Palette = {
  ...mapPalette(LIGHT, (c) => [c[0] * 0.34, c[1] * 0.4, c[2] * 0.48 + 0.03]),
  snow: [0.58, 0.68, 0.78], ice: [0.4, 0.5, 0.6], frost: [0.36, 0.44, 0.5],
  shallow: [0.05, 0.24, 0.32], deep: [0.02, 0.09, 0.16], foam: [0.3, 0.75, 0.9],
  lava: [1.0, 0.42, 0.16], glint: [0.85, 0.45, 1.0], padRing: [0.22, 0.88, 1],
  ambient: 0.42, diffuse: 0.62,
  contour: [0.22, 0.88, 1],
  clouds: 0,
};

function mapPalette(p: Palette, f: (c: RGB) => RGB): Palette {
  const out = { ...p } as Record<string, unknown>;
  for (const [k, v] of Object.entries(p)) if (Array.isArray(v)) out[k] = f(v as RGB);
  return out as unknown as Palette;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

interface Sample {
  elev: number;
  color: RGB;
  /** 0..1, how much this point is open water. */
  water: number;
  /** Light the point gives off itself (lava, crystal glints, the store's beacon). */
  glow: RGB | null;
  /** Snow is allowed here (mountains only). */
  snowy: boolean;
}

function sample(t: Terrain, u: number, v: number, cx: number, cy: number, p: Palette, seed: number): Sample {
  const dx = u - cx;
  const dy = v - cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  const grain = noise(u * 38, v * 38, seed + 3) - 0.5;
  switch (t) {
    case 'plains':
    case 'river': {
      // Farmland patchwork: each patch a slightly different green.
      const patch = hash2(Math.floor(u * 2.3 + fbm(u, v, seed + 11, 2)), Math.floor(v * 2.3), seed + 13);
      const lush = t === 'river' ? 0.35 : 0;
      const c = mix(mix(p.grass, p.grass2, patch), p.meadow, clamp01(fbm(u * 3, v * 3, seed + 17, 3) - 0.35 + lush * 0.3));
      return { elev: 0.1 + fbm(u * 1.4, v * 1.4, seed + 19, 3) * 0.08 + grain * 0.004, color: tint(c, grain * 0.05), water: 0, glow: null, snowy: false };
    }
    case 'forest': {
      const tree = cells(u * 11, v * 11, seed + 23);
      const crown = 1 - smooth(0.05, 0.62, tree);
      const clearing = smooth(0.68, 0.78, fbm(u * 1.8, v * 1.8, seed + 29, 2));
      const c = mix(mix(p.forest, p.canopy, crown * 0.8), p.grass2, clearing);
      return { elev: 0.16 + crown * 0.06 * (1 - clearing) + fbm(u, v, seed + 31, 2) * 0.06, color: tint(c, grain * 0.06), water: 0, glow: null, snowy: false };
    }
    case 'swamp': {
      const pool = smooth(0.56, 0.62, fbm(u * 3.2, v * 3.2, seed + 37, 3));
      const reeds = noise(u * 30, v * 6, seed + 41);
      const c = mix(p.swamp, p.reed, reeds * 0.5);
      return { elev: 0.04 - pool * 0.03, color: tint(c, grain * 0.06), water: pool * 0.85, glow: null, snowy: false };
    }
    case 'hills': {
      const h = fbm(u * 1.1, v * 1.1, seed + 43, 3);
      const c = mix(mix(p.grass2, p.hills2, 0.55), p.hills, smooth(0.35, 0.75, h));
      return { elev: 0.28 + h * 0.5 + ridged(u * 2.2, v * 2.2, seed + 47, 2) * 0.05, color: tint(c, grain * 0.05), water: 0, glow: null, snowy: false };
    }
    case 'mountains': {
      const r = ridged(u * 2.2 + fbm(u, v, seed + 51, 2), v * 2.2, seed + 53, 5);
      const range = ridged(u * 0.6, v * 0.6, seed + 59, 3);
      const peak = Math.exp(-d * d * 3.2);
      const c = mix(mix(p.rock2, p.hills2, 0.35), p.rock, r * 0.8 + peak * 0.2);
      return { elev: 0.4 + range * 0.35 + peak * (0.25 + r * 0.75), color: tint(c, grain * 0.07), water: 0, glow: null, snowy: true };
    }
    case 'desert': {
      const w = fbm(u * 1.1, v * 1.1, seed + 59, 3);
      const dune = Math.sin((u * 0.9 + v * 0.4) * Math.PI * 5.5 + w * 7);
      const c = mix(p.sand2, p.sand, 0.5 + dune * 0.35);
      return { elev: 0.14 + dune * 0.035 + w * 0.08, color: tint(c, grain * 0.04), water: 0, glow: null, snowy: false };
    }
    case 'tundra':
    case 'wasteland': {
      const frost = smooth(0.62, 0.7, noise(u * 9, v * 9, seed + 61) * 0.6 + fbm(u * 2, v * 2, seed + 67, 2) * 0.4);
      const stone = 1 - smooth(0.04, 0.12, cells(u * 16, v * 16, seed + 71));
      const c = mix(mix(p.tundra, p.frost, frost * 0.7), p.rock2, stone * 0.5);
      return { elev: 0.22 + fbm(u * 1.5, v * 1.5, seed + 73, 3) * 0.12 + stone * 0.01, color: tint(c, grain * 0.05), water: 0, glow: null, snowy: false };
    }
    case 'ice': {
      const crack = smooth(0.86, 0.95, ridged(u * 2.6, v * 2.6, seed + 79, 3));
      const c = mix(p.ice, p.crack, crack * 0.8);
      return { elev: 0.28 + fbm(u * 1.3, v * 1.3, seed + 83, 3) * 0.14 - crack * 0.02, color: tint(c, grain * 0.03), water: 0, glow: null, snowy: false };
    }
    case 'volcanic': {
      const cone = Math.max(0, 1 - d * 1.35);
      const caldera = d < 0.12 ? (0.12 - d) * 3 : 0;
      const ang = Math.atan2(dy, dx);
      const channel = Math.pow(Math.max(0, Math.cos(ang * 3 + fbm(u * 2, v * 2, seed + 89, 2) * 4)), 40) * smooth(0.5, 0.15, d);
      const lava = Math.max(channel, d < 0.09 ? 1 : 0, smooth(0.94, 0.99, ridged(u * 3, v * 3, seed + 97, 3)) * 0.6);
      const c = mix(p.basalt, p.ash, fbm(u * 4, v * 4, seed + 101, 2));
      return {
        elev: 0.32 + cone * cone * 0.85 - caldera + fbm(u * 3, v * 3, seed + 103, 2) * 0.06,
        color: tint(c, grain * 0.05),
        water: 0,
        glow: lava > 0.02 ? scale(p.lava, lava) : d < 0.2 ? scale(p.lava, (0.2 - d) * 1.5) : null,
        snowy: false,
      };
    }
    case 'crater': {
      const rim = Math.exp(-((d - 0.31) ** 2) / 0.004) * 0.34;
      const bowl = d < 0.31 ? (0.31 - d) * 1.1 : 0;
      const sparkle = hash2(Math.floor(u * 40), Math.floor(v * 40), seed + 107);
      const inBowl = d < 0.3 ? 1 : 0;
      const c = mix(p.dust, p.rock2, smooth(0.2, 0.33, d) * 0.4);
      return {
        elev: 0.24 + rim - bowl + fbm(u * 2, v * 2, seed + 109, 3) * 0.08,
        color: tint(c, grain * 0.06),
        water: 0,
        glow: inBowl && sparkle > 0.965 ? scale(p.glint, 0.9) : null,
        snowy: false,
      };
    }
    case 'lake': {
      return { elev: -0.25, color: p.shallow, water: 1, glow: null, snowy: false };
    }
    case 'store': {
      const pad = d < 0.33 ? 1 : 0;
      const ring = Math.abs(d - 0.27) < 0.018 ? 1 : 0;
      const c = pad ? p.pad : mix(p.grass2, p.pad, 0.25);
      return { elev: 0.12, color: c, water: 0, glow: ring ? p.padRing : null, snowy: false };
    }
  }
}

function tint(c: RGB, k: number): RGB {
  return [c[0] + k, c[1] + k, c[2] + k];
}
function scale(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** A smooth path through the river plots, top to bottom, as a list of points in plot units. */
function riverPath(input: LandscapeInput, seed: number): [number, number][] {
  const { width, height, terrainAt } = input;
  const rows: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    const xs: number[] = [];
    for (let x = 0; x < width; x++) {
      const t = terrainAt(x, y);
      if (t === 'river' || (t === 'store' && (terrainAt(x, y - 1) === 'river' || terrainAt(x, y + 1) === 'river'))) xs.push(x);
    }
    if (xs.length) rows.push([xs.reduce((a, b) => a + b, 0) / xs.length + 0.5, y + 0.5]);
  }
  if (rows.length < 2) return [];
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  const ctrl: [number, number][] = [];
  if (first[1] < 1) ctrl.push([first[0], -0.6]);
  for (const [x, y] of rows) {
    // The river swings around the store's landing pad rather than through it.
    const t = terrainAt(Math.floor(x), Math.floor(y));
    const swing = t === 'store' ? 0.42 : (noise(y * 0.7, 0.5, seed + 5) - 0.5) * 0.6;
    ctrl.push([x + swing, y]);
  }
  if (last[1] > height - 1) ctrl.push([last[0], height + 0.6]);

  const out: [number, number][] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)]!;
    const p1 = ctrl[i]!;
    const p2 = ctrl[i + 1]!;
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)]!;
    for (let s = 0; s < 12; s++) {
      const t = s / 12;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]!);
  return out;
}

function distToPath(u: number, v: number, path: [number, number][], from: number, to: number): number {
  let best = 99;
  for (let i = from; i < to; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const len = ex * ex + ey * ey || 1e-6;
    const t = clamp01(((u - a[0]) * ex + (v - a[1]) * ey) / len);
    const qx = a[0] + ex * t - u;
    const qy = a[1] + ey * t - v;
    const dd = qx * qx + qy * qy;
    if (dd < best) best = dd;
  }
  return Math.sqrt(best);
}

/** Renders the landscape into a new ImageData. Runs in a few hundred milliseconds for a phone-sized map. */
export function renderLandscape(input: LandscapeInput): ImageData {
  const { width, height, terrainAt, pxPerTile, theme } = input;
  const seed = input.seed ?? 7;
  const p = theme === 'dark' ? DARK : LIGHT;
  const W = Math.max(1, Math.round(width * pxPerTile));
  const H = Math.max(1, Math.round(height * pxPerTile));
  const n = W * H;
  const elev = new Float32Array(n);
  const col = new Float32Array(n * 3);
  const water = new Float32Array(n);
  const glow = new Float32Array(n * 3);
  const snowy = new Uint8Array(n);

  const at = (x: number, y: number): Terrain => {
    const cx = Math.min(width - 1, Math.max(0, x));
    const cy = Math.min(height - 1, Math.max(0, y));
    return terrainAt(cx, cy) ?? 'plains';
  };

  const path = riverPath(input, seed);
  // Index path segments by row so each pixel only checks nearby ones.
  const segByRow: [number, number][] = [];
  for (let y = 0; y < height; y++) {
    let lo = -1;
    let hi = -1;
    for (let i = 0; i < path.length - 1; i++) {
      const py = path[i]![1];
      if (py > y - 1.2 && py < y + 2.2) {
        if (lo < 0) lo = i;
        hi = i + 1;
      }
    }
    segByRow.push([Math.max(0, lo), Math.max(0, hi)]);
  }

  const weights: [Terrain, number, number, number][] = [];
  for (let py = 0; py < H; py++) {
    const v = (py + 0.5) / pxPerTile;
    for (let px = 0; px < W; px++) {
      const u = (px + 0.5) / pxPerTile;
      const i = py * W + px;
      const wu = u + (fbm(u * 0.7, v * 0.7, seed + 1, 4) - 0.5) * 1.5 + (noise(u * 3.1, v * 3.1, seed + 3) - 0.5) * 0.34;
      const wv = v + (fbm(u * 0.7 + 5.2, v * 0.7 + 1.3, seed + 2, 4) - 0.5) * 1.5 + (noise(u * 3.1 + 9, v * 3.1, seed + 4) - 0.5) * 0.34;
      const gx = wu - 0.5;
      const gy = wv - 0.5;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const sx = smooth(0.2, 0.8, gx - x0);
      const sy = smooth(0.2, 0.8, gy - y0);
      weights.length = 0;
      const add = (tx: number, ty: number, w: number) => {
        if (w < 0.002) return;
        const t = at(tx, ty);
        for (const e of weights) if (e[0] === t) { e[1] += w; return; }
        weights.push([t, w, Math.min(width - 1, Math.max(0, tx)) + 0.5, Math.min(height - 1, Math.max(0, ty)) + 0.5]);
      };
      add(x0, y0, (1 - sx) * (1 - sy));
      add(x0 + 1, y0, sx * (1 - sy));
      add(x0, y0 + 1, (1 - sx) * sy);
      add(x0 + 1, y0 + 1, sx * sy);

      let e = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let wat = 0;
      let gr = 0;
      let gg = 0;
      let gb = 0;
      let snow = false;
      for (const [t, w, cx, cy] of weights) {
        // Shape features (cones, craters, pads) follow their own plot, so use that plot's centre.
        const s = sample(t, u, v, cx, cy, p, seed);
        e += s.elev * w;
        r += s.color[0] * w;
        g += s.color[1] * w;
        b += s.color[2] * w;
        wat += s.water * w;
        if (s.glow) {
          gr += s.glow[0] * w;
          gg += s.glow[1] * w;
          gb += s.glow[2] * w;
        }
        if (s.snowy && w > 0.5) snow = true;
      }

      // The river: a channel carved through the land, with soft banks.
      if (path.length) {
        const row = segByRow[Math.min(height - 1, Math.max(0, Math.floor(v)))]!;
        const dist = distToPath(u, v, path, row[0], row[1]);
        const half = 0.12 + (noise(v * 2.2, u * 0.3, seed + 113) - 0.5) * 0.05;
        const bank = 1 - smooth(half, half + 0.09, dist);
        const inWater = 1 - smooth(half - 0.025, half, dist);
        if (bank > 0) {
          const k = bank * (1 - inWater);
          r += (p.bank[0] - r) * k * 0.55;
          g += (p.bank[1] - g) * k * 0.55;
          b += (p.bank[2] - b) * k * 0.55;
          e = e - bank * 0.08;
        }
        if (inWater > wat) wat = inWater;
      }

      elev[i] = e;
      col[i * 3] = r;
      col[i * 3 + 1] = g;
      col[i * 3 + 2] = b;
      water[i] = wat;
      glow[i * 3] = gr;
      glow[i * 3 + 1] = gg;
      glow[i * 3 + 2] = gb;
      snowy[i] = snow ? 1 : 0;
    }
  }

  // Light from the north-west, slopes measured per plot so detail looks the same at any size.
  const img = new ImageData(W, H);
  const out = img.data;
  const L = normalize([-0.62, -0.7, 0.55]);
  const step = pxPerTile;
  for (let py = 0; py < H; py++) {
    const v = (py + 0.5) / pxPerTile;
    for (let px = 0; px < W; px++) {
      const u = (px + 0.5) / pxPerTile;
      const i = py * W + px;
      const k = Math.max(1, Math.round(pxPerTile / 40));
      const xl = elev[py * W + Math.max(0, px - k)]!;
      const xr = elev[py * W + Math.min(W - 1, px + k)]!;
      const yu = elev[Math.max(0, py - k) * W + px]!;
      const yd = elev[Math.min(H - 1, py + k) * W + px]!;
      const w = water[i]!;
      const flat = w > 0.5 ? 0.15 : 1;
      const nx = (-(xr - xl) * step * 0.5 * 0.7 * flat) / k;
      const ny = (-(yd - yu) * step * 0.5 * 0.7 * flat) / k;
      const nl = Math.hypot(nx, ny, 1);
      const lam = clamp01((nx * L[0] + ny * L[1] + L[2]) / nl);
      let light = p.ambient + p.diffuse * lam;
      if (p.clouds) light *= 1 - p.clouds * smooth(0.52, 0.72, fbm(u * 0.32 + 3.1, v * 0.32, seed + 127, 3));

      let r = col[i * 3]! * light;
      let g = col[i * 3 + 1]! * light;
      let b = col[i * 3 + 2]! * light;

      const e = elev[i]!;
      if (snowy[i]) {
        const slope = Math.hypot(nx, ny);
        const s = smooth(1.02, 1.18, e + (fbm(u * 6, v * 6, seed + 131, 2) - 0.5) * 0.1) * (1 - smooth(1.6, 3.2, slope));
        if (s > 0) {
          const sl = p.ambient + p.diffuse * lam * 1.1;
          r += (p.snow[0] * sl - r) * s;
          g += (p.snow[1] * sl - g) * s;
          b += (p.snow[2] * sl - b) * s;
        }
      }

      if (w > 0.01) {
        const depth = clamp01(0.6 - e * 1.6 + (fbm(u * 1.5, v * 1.5, seed + 137, 2) - 0.5) * 0.3);
        const wc = mix(p.shallow, p.deep, depth);
        const ripple = (noise(u * 26, v * 9, seed + 139) - 0.5) * 0.06;
        const sparkle = theme === 'light' && noise(u * 60, v * 60, seed + 149) > 0.93 ? 0.18 : 0;
        const k = smooth(0.35, 0.65, w);
        r += (wc[0] + ripple + sparkle - r) * k;
        g += (wc[1] + ripple + sparkle - g) * k;
        b += (wc[2] + ripple + sparkle - b) * k;
        // A thin bright edge where water meets land.
        const edge = Math.exp(-((w - 0.5) ** 2) / 0.006) * 0.55;
        r += (p.foam[0] - r) * edge;
        g += (p.foam[1] - g) * edge;
        b += (p.foam[2] - b) * edge;
      }

      if (p.contour && w < 0.5) {
        const f = (e * 9) % 1;
        const line = Math.max(0, 1 - Math.min(f, 1 - f) * step * 0.11) * 0.22;
        r += p.contour[0] * line;
        g += p.contour[1] * line;
        b += p.contour[2] * line;
      }

      r += glow[i * 3]!;
      g += glow[i * 3 + 1]!;
      b += glow[i * 3 + 2]!;

      out[i * 4] = Math.round(clamp01(r) * 255);
      out[i * 4 + 1] = Math.round(clamp01(g) * 255);
      out[i * 4 + 2] = Math.round(clamp01(b) * 255);
      out[i * 4 + 3] = 255;
    }
  }
  return img;
}

function normalize(v: [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}
