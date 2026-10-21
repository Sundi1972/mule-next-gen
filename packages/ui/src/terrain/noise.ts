/** Small, fast, seeded 2D noise for drawing terrain. Not cryptographic, not for game rules. */

export function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number) => t * t * (3 - 2 * t);

/** Value noise in 0..1. */
export function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

/** Fractal noise in roughly 0..1. */
export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, y, seed + i * 31) * amp;
    norm += amp;
    x *= 2.03;
    y *= 2.03;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Ridged noise: sharp crests, good for mountain ridges and lava cracks. 0..1. */
export function ridged(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(noise(x, y, seed + i * 57) * 2 - 1);
    sum += n * n * amp;
    norm += amp;
    x *= 2.1;
    y *= 2.1;
    amp *= 0.5;
  }
  return sum / norm;
}

/** Distance to the nearest jittered point, for tree canopies and pebbles. 0..~1. */
export function cells(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const cx = xi + i + hash2(xi + i, yi + j, seed);
      const cy = yi + j + hash2(xi + i, yi + j, seed + 7);
      const d = (cx - x) * (cx - x) + (cy - y) * (cy - y);
      if (d < best) best = d;
    }
  }
  return Math.sqrt(best);
}
