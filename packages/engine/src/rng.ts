/** Small seeded PRNG (mulberry32) so every game and simulation is reproducible. */
export function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0; // literal-ok: mulberry32's constants
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); // literal-ok: mulberry32's constants
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); // literal-ok: mulberry32's constants
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; // literal-ok: mulberry32's constants; 2^32 maps to [0, 1)
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick from empty list');
      return items[Math.floor(next() * items.length)] as T;
    },
    chance: (p: number) => next() < p,
    /** Index drawn from a list of weights that need not sum to 1. */
    weighted: (weights: readonly number[]): number => {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i]!;
        if (r < 0) return i;
      }
      return weights.length - 1;
    },
    /** A shuffled copy (Fisher-Yates). */
    shuffle: <T>(items: readonly T[]): T[] => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
}

export type Rng = ReturnType<typeof createRng>;
