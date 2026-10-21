import { GOOD_NAME, type Good, type MapTile, type Slot, type Terrain } from '@mule/ui';

export type Factory = 'alloy' | 'electronics' | 'medicine';

export const FACTORIES: { good: Factory; name: string; cost: number; inputs: Partial<Record<Good, number>>; makes: number }[] = [
  { good: 'alloy', name: 'Alloy smelter', cost: 150, inputs: { smithore: 2, energy: 1 }, makes: 2 },
  { good: 'electronics', name: 'Electronics works', cost: 200, inputs: { rareEarth: 1, alloy: 1, energy: 1 }, makes: 1 },
  { good: 'medicine', name: 'Medicine lab', cost: 150, inputs: { food: 1, water: 1, energy: 1 }, makes: 2 },
];

export function isFactory(g: Good): g is Factory {
  return g === 'alloy' || g === 'electronics' || g === 'medicine';
}

/** Terrain fit from the design doc: +1 good place, -1 poor place, with the reason a player reads. */
const TERRAIN_FIT: Record<Factory, Partial<Record<Terrain, [number, string]>>> = {
  alloy: {
    volcanic: [1, 'Geothermal heat saves the Energy'],
    hills: [1, 'Firm rock under the furnace'],
    mountains: [1, 'Firm rock under the furnace'],
    swamp: [-1, 'Soft ground: the furnace sinks'],
    ice: [-1, 'Too cold for the furnace'],
    lake: [-1, 'Wet ground'],
  },
  electronics: {
    tundra: [1, 'Cold air cools the works'],
    desert: [1, 'Dry air, no damp'],
    plains: [1, 'Flat and dry'],
    swamp: [-1, 'Damp gets into the circuits'],
    river: [-1, 'Damp gets into the circuits'],
    volcanic: [-1, 'Quakes and ash'],
  },
  medicine: {
    forest: [1, 'Herbs nearby: +1 Medicine'],
    swamp: [1, 'Herbs nearby: +1 Medicine'],
    river: [1, 'Clean water'],
    desert: [-1, 'No herbs, little water'],
    volcanic: [-1, 'Ash in the air'],
    crater: [-1, 'Dust in the air'],
  },
};

export interface FitLine {
  tone: 'good' | 'bad' | 'note';
  text: string;
}

/** Everything that would help or hurt this factory on this plot, as the phone lists it before you install. */
export function factoryFit(factory: Factory, plot: MapTile, tiles: MapTile[], me: Slot, stock: Partial<Record<Good, number>>) {
  const spec = FACTORIES.find((f) => f.good === factory)!;
  const lines: FitLine[] = [];
  let score = 0;

  const fit = TERRAIN_FIT[factory][plot.terrain];
  if (fit) {
    score += fit[0];
    lines.push({ tone: fit[0] > 0 ? 'good' : 'bad', text: fit[1] });
  } else {
    lines.push({ tone: 'note', text: plot.terrain === 'plains' ? 'Plains suit any factory' : 'Neutral ground' });
  }

  const around = tiles.filter((t) => t.owner === me && Math.abs(t.x - plot.x) + Math.abs(t.y - plot.y) === 1);
  const feeder = around.find((t) => t.good && t.good in spec.inputs);
  if (feeder?.good) {
    score += 1;
    lines.push({ tone: 'good', text: `Next to your ${GOOD_NAME[feeder.good]} plot: saves 1 Energy` });
  }
  if (around.some((t) => t.good === factory)) {
    score += 1;
    lines.push({ tone: 'good', text: 'Next to the same factory: industrial park, +1' });
  }
  if (factory === 'alloy' && around.some((t) => t.good === 'food')) {
    score -= 1;
    lines.push({ tone: 'bad', text: 'Smoke over your farm next door: −1 Food' });
  }

  for (const [g, n] of Object.entries(spec.inputs) as [Good, number][]) {
    const have = stock[g] ?? 0;
    if (have < n) lines.push({ tone: 'bad', text: `Needs ${n} ${GOOD_NAME[g]} a month; you have ${have}. Buy it at the auction or by contract.` });
  }

  const verdict = score >= 2 ? 'Great spot' : score === 1 ? 'Good spot' : score === 0 ? 'Fair spot' : 'Poor spot';
  return { verdict, score, lines, makes: Math.max(0, spec.makes + Math.max(-1, Math.min(1, score))) };
}
