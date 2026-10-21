import { GROWN_ODDS, MAP, MINERAL_ODDS, TERRAIN_ODDS, sizeBand, type FloorGood } from './config.js';
import type { Layout } from './map-layout.js';
import { zeroGround } from './map.js';
import type { Rng } from './rng.js';
import type { Ground, Terrain } from './types.js';

/**
 * The ground stages of the map generator (spec RULE-2 stages 4-9): hidden ratings
 * dealt onto a finished layout, then repaired in bounded passes, never rerolled.
 */

/** Per floor good, one smooth-field value per plot: where that good's best ratings go. */
export type Fields = Record<FloorGood, number[]>;

/** The ground part-way through the stages, with what later stages read. */
export interface Dealt {
  layout: Layout;
  players: number;
  fields: Fields;
  /** One rating set per plot, row-major like the layout; the store's is all 0. */
  ground: Ground[];
}

export interface GroundDeal {
  ground: Ground[];
  /** The map's one scarce good, or null when it has none. */
  scarce: FloorGood | null;
}

type LandTerrain = Exclude<Terrain, 'store'>;
type Odds = { values: number[]; weights: readonly number[] };

const FLOOR_GOODS = Object.keys(MAP.floor) as FloorGood[];
const MINERALS = ['crystite', 'rareEarth'] as const;

/** Deals a laid-out map its hidden ground (spec RULE-2 stages 4-9). Pure: every choice comes from `rng`; never throws. */
export function dealGround(layout: Layout, players: number, rng: Rng): GroundDeal {
  const peaks = placePeaks(dealOdds(layout, players, rng), rng);
  const scarce = pickScarce(rng);
  const done = applyScarcity(joinSeams(repairReach(liftFloors(peaks, scarce))), scarce);
  return { ground: done.ground, scarce };
}

/**
 * Stage 4: for each floor good, a smooth field ranks the plots and every terrain's
 * plots are dealt that terrain's ratings by stratified draw, highest rating to highest field.
 */
export function dealOdds(layout: Layout, players: number, rng: Rng): Dealt {
  const ground = layout.terrain.map(() => zeroGround());
  const fields = {} as Fields;
  const byTerrain = plotsByTerrain(gridOf(layout));
  for (const good of FLOOR_GOODS) {
    const field = smoothField(layout, good, rng);
    fields[good] = field;
    for (const [terrain, plots] of byTerrain) {
      const ratings = stratifiedDraw(plots.length, oddsOf(terrain, good), rng);
      const ranked = [...plots].sort((a, b) => field[b]! - field[a]! || a - b);
      ranked.forEach((i, k) => (ground[i]![good] = ratings[k]!));
    }
  }
  return { layout, players, fields, ground };
}

/** Stage 4b: Crystite, then Rare earth, in 3-4 rings around random land plots; every land plot rated by its steps to the nearest centre. */
export function placePeaks(dealt: Dealt, rng: Rng): Dealt {
  const grid = gridOf(dealt.layout);
  const ground = copyGround(dealt);
  for (const mineral of MINERALS) {
    // Distinct centres: two on one plot would count as one peak.
    const centres = rng.shuffle(grid.land).slice(0, rng.int(MAP.peak.count.min, MAP.peak.count.max));
    for (const i of grid.land) ground[i]![mineral] = ringRating(Math.min(...centres.map((c) => grid.steps(i, c))), rng);
  }
  return { ...dealt, ground };
}

/** Stage 5: the scarce good, or null; with chance MAP.scarceChance one floor good, chosen equally. */
export function pickScarce(rng: Rng): FloorGood | null {
  // Both draws always happen, so what the rng gives later never depends on whether this map has a scarce good.
  const draw = rng.next();
  const pick = rng.pick(FLOOR_GOODS);
  return draw < MAP.scarceChance ? pick : null;
}

/**
 * Stage 6: each floor good gets at least its target of good plots (the floor for the
 * scarce good, the normal lower edge otherwise), lifting the best-suited terrains' plots,
 * highest field first, to exactly the good threshold.
 */
export function liftFloors(dealt: Dealt, scarce: FloorGood | null): Dealt {
  const ground = copyGround(dealt);
  const { land } = gridOf(dealt.layout);
  for (const good of FLOOR_GOODS) {
    const target = Math.ceil((good === scarce ? MAP.floor[good] : MAP.normalLo[good]) * dealt.players);
    let have = land.filter((i) => isGood(ground, i, good)).length;
    const candidates = land.filter((i) => !isGood(ground, i, good)).sort(bySuit(dealt, good));
    for (const i of candidates) {
      if (have >= target) break;
      ground[i]![good] = MAP.goodAt[good];
      have++;
    }
  }
  return { ...dealt, ground };
}

/** A rating stage 7 raised because no swap could bring a plot within reach. */
export interface Lift {
  plot: number;
  good: FloorGood;
  /** The rating before the lift; after it, the plot holds exactly the good threshold. */
  from: number;
  /** The plot's terrain odds give no chance of a good rating: no plot that could be good was in reach. */
  impossible: boolean;
}

/**
 * Stage 7: every land plot within reach of a good plot of each floor good. A plot too far
 * gets a near plot swapped with a good plot of the same terrain whose loss strands nobody;
 * only when no such pair exists is a near plot lifted, and the lift is recorded, since it
 * is the one change here to a terrain's ratings.
 */
export function repairReach(dealt: Dealt): Dealt & { lifts: Lift[] } {
  const grid = gridOf(dealt.layout);
  const ground = copyGround(dealt);
  const lifts: Lift[] = [];
  for (const good of FLOOR_GOODS) {
    const limit = MAP.reach[sizeBand(dealt.players)][good];
    const cover = coverage(grid, limit, grid.land.filter((i) => isGood(ground, i, good)));
    const field = dealt.fields[good];
    const suit = bySuit(dealt, good);
    const touches = (i: number) => (grid.neighbours[i]!.some((n) => isGood(ground, n, good)) ? 1 : 0);
    for (let pass = 0; pass < MAP.ground.reachPasses; pass++) {
      const stranded = grid.land.find((i) => cover.isFar(i));
      if (stranded === undefined) break;
      const far = grid.land.filter((i) => cover.isFar(i));
      const reaches = (i: number) => far.filter((f) => grid.steps(f, i) <= limit).length;
      // The stranded plot is never good itself, so `near` always holds at least it.
      const near = ballOf(grid, limit)[stranded]!
        .filter((i) => !isGood(ground, i, good))
        .map((i) => ({ i, odds: pGood(grid.terrain[i]!, good), mean: meanRating(grid.terrain[i]!, good), touches: touches(i), reaches: reaches(i) }));
      // Swaps keep the odds whatever terrain they use; touching another good plot helps the seams.
      const plots = [...near].sort((a, b) => b.touches - a.touches || b.odds - a.odds || b.reaches - a.reaches || suit(a.i, b.i)).map((c) => c.i);
      const swap = findSwap(grid, ground, field, good, plots, cover);
      if (swap) {
        swapRatings(ground, good, swap[0], swap[1]);
        cover.move([swap[0]], [swap[1]]);
        continue;
      }
      // A lift on a terrain whose odds can't give the good makes its hint a lie, so any terrain that can comes first, nearest first.
      const rating = (i: number) => ground[i]![good];
      const capable = (c: { odds: number }) => (c.odds > 0 ? 1 : 0);
      const away = (i: number) => grid.steps(i, stranded);
      const pick = [...near].sort(
        (a, b) =>
          capable(b) - capable(a) || away(a.i) - away(b.i) || b.mean - a.mean || rating(b.i) - rating(a.i) || b.touches - a.touches || b.reaches - a.reaches || suit(a.i, b.i),
      )[0]!;
      lifts.push({ plot: pick.i, good, from: rating(pick.i), impossible: pick.odds === 0 });
      ground[pick.i]![good] = MAP.goodAt[good];
      cover.move([], [pick.i]);
    }
  }
  return { ...dealt, ground, lifts };
}

/**
 * Stage 8: an isolated good Smithore plot joins a seam by an in-terrain trade that strands
 * nobody and leaves fewer isolated plots: it trades with a plot of its own terrain, or a
 * good plot of a neighbour's terrain trades with that neighbour.
 */
export function joinSeams(dealt: Dealt): Dealt {
  const grid = gridOf(dealt.layout);
  const ground = copyGround(dealt);
  const cover = coverage(grid, MAP.reach[sizeBand(dealt.players)].smithore, grid.land.filter((i) => isGood(ground, i, 'smithore')));
  seamTrades(grid, ground, dealt.fields.smithore, cover);
  return { ...dealt, ground };
}

/**
 * Stage 9: the scarce good's good plots drop to just under the threshold, lowest field
 * first, until it is below its normal lower edge, skipping any whose loss would strand a plot.
 * When reach blocks every further lowering, one lowering may come with an in-terrain move that
 * keeps the reach. For Smithore, lone plots go first, a bounded search tries other sets when
 * the first would break the seams (S8), and the seam trades run again afterwards.
 */
export function applyScarcity(dealt: Dealt, scarce: FloorGood | null): Dealt {
  const ground = copyGround(dealt);
  if (scarce === null) return { ...dealt, ground };
  const grid = gridOf(dealt.layout);
  const field = dealt.fields[scarce];
  const goods = grid.land.filter((i) => isGood(ground, i, scarce));
  const cut = goods.length - (Math.ceil(MAP.normalLo[scarce] * dealt.players) - 1);
  if (cut <= 0) return { ...dealt, ground };
  const lone = (i: number) => (scarce === 'smithore' && isLoneGood(grid, ground, i, scarce) ? 0 : 1);
  const order = [...goods].sort((a, b) => lone(a) - lone(b) || field[a]! - field[b]! || a - b);
  const cover = coverage(grid, MAP.reach[sizeBand(dealt.players)][scarce], goods);
  const lowered = new Set<number>();
  const seamsHold = () => {
    if (scarce !== 'smithore') return true;
    const kept = goods.filter((i) => !lowered.has(i));
    const joined = kept.filter((i) => grid.neighbours[i]!.some((n) => !lowered.has(n) && isGood(ground, n, scarce))).length;
    return joined >= MAP.seamShare * kept.length - 1e-9;
  };
  let first: number[] | undefined;
  let deepest: number[] = [];
  let tries = 0;
  // Depth-first over the order: its first full path is the plain lowest-field-first pass.
  const search = (from: number): number[] | undefined => {
    if (lowered.size === cut) {
      first ??= [...lowered];
      return seamsHold() ? [...lowered] : undefined;
    }
    if (lowered.size > deepest.length) deepest = [...lowered];
    for (let k = from; k < order.length && tries < MAP.ground.scarcityTries; k++) {
      const i = order[k]!;
      tries++;
      if (!cover.keeps([i])) continue;
      lowered.add(i);
      cover.move([i]);
      const found = search(k + 1);
      lowered.delete(i);
      cover.move([], [i]);
      if (found) return found;
    }
    return undefined;
  };
  const chosen = search(0) ?? first ?? deepest;
  for (const i of chosen) {
    ground[i]![scarce] = MAP.goodAt[scarce] - 1;
    cover.move([i]);
  }
  // Each round lowers one more plot or stops, so this ends within the good plots' count.
  for (let left = cut - chosen.length; left > 0; left--) {
    const move = relocatedLowering(grid, ground, field, scarce, order, cover);
    if (!move) break;
    ground[move.lower]![scarce] = MAP.goodAt[scarce] - 1;
    swapRatings(ground, scarce, move.from, move.to);
    cover.move([move.lower, move.from], [move.to]);
  }
  if (scarce === 'smithore') seamTrades(grid, ground, field, cover);
  return { ...dealt, ground };
}

/** A good plot to lower, paired with an in-terrain move (from a good plot to a plot of its terrain) that together strand nobody. */
function relocatedLowering(
  grid: Grid,
  ground: Ground[],
  field: number[],
  good: FloorGood,
  order: number[],
  cover: Coverage,
): { lower: number; from: number; to: number } | undefined {
  const goods = order.filter((i) => isGood(ground, i, good));
  for (const lower of goods) {
    for (const from of goods) {
      if (from === lower) continue;
      const to = grid.land
        .filter((c) => grid.terrain[c] === grid.terrain[from] && !isGood(ground, c, good))
        .sort((a, b) => field[b]! - field[a]! || a - b)
        .find((c) => cover.keeps([lower, from], [c]));
      if (to !== undefined) return { lower, from, to };
    }
  }
  return undefined;
}

/** Stage 8's trades, also run after the scarcity lowering: in-terrain, reach-keeping, each leaving fewer isolated good Smithore plots. */
function seamTrades(grid: Grid, ground: Ground[], field: number[], cover: Coverage): void {
  const good = 'smithore';
  const highestField = (plots: number[]) => plots.sort((a, b) => field[b]! - field[a]! || a - b)[0];
  const helps = (from: number, to: number) => loneChange(grid, ground, good, from, to) < 0 && cover.keeps([from], [to]);
  for (let pass = 0; pass < MAP.ground.seamPasses; pass++) {
    let moved = false;
    for (const lone of grid.land) {
      if (!isLoneGood(grid, ground, lone, good)) continue;
      const terrain = grid.terrain[lone];
      let trade: [number, number] | undefined;
      const spot = highestField(grid.land.filter((i) => grid.terrain[i] === terrain && !isGood(ground, i, good) && helps(lone, i)));
      if (spot !== undefined) trade = [lone, spot];
      for (const beside of grid.neighbours[lone]!) {
        if (trade || isGood(ground, beside, good)) continue;
        const partner = grid.terrain[beside];
        const donor = highestField(grid.land.filter((i) => i !== lone && grid.terrain[i] === partner && isGood(ground, i, good) && helps(i, beside)));
        if (donor !== undefined) trade = [donor, beside];
      }
      if (trade) {
        swapRatings(ground, good, trade[0], trade[1]);
        cover.move([trade[0]], [trade[1]]);
        moved = true;
        continue;
      }
      if (seamShare(grid, ground) + 1e-9 >= MAP.seamShare) continue;
      const pair = coveredMove(grid, ground, field, cover, lone);
      if (!pair) continue;
      for (const [from, to] of pair) swapRatings(ground, good, from, to);
      cover.move(pair.map(([from]) => from), pair.map(([, to]) => to));
      moved = true;
    }
    if (!moved) break;
  }
}

/**
 * A lone plot that reach pins in place: it moves beside another good plot of the seam while a
 * second in-terrain trade takes over the reach it gave, when together they leave fewer lone plots.
 */
function coveredMove(grid: Grid, ground: Ground[], field: number[], cover: Coverage, lone: number): [number, number][] | undefined {
  const good = 'smithore';
  const byField = (a: number, b: number) => field[b]! - field[a]! || a - b;
  const spots = grid.land
    .filter((i) => grid.terrain[i] === grid.terrain[lone] && !isGood(ground, i, good) && grid.neighbours[i]!.some((n) => n !== lone && isGood(ground, n, good)))
    .sort(byField);
  for (const spot of spots) {
    const first = loneChange(grid, ground, good, lone, spot);
    swapRatings(ground, good, lone, spot);
    let found: [number, number] | undefined;
    for (const from of grid.land) {
      if (found || from === spot || !isGood(ground, from, good)) continue;
      const to = grid.land
        .filter((c) => c !== lone && grid.terrain[c] === grid.terrain[from] && !isGood(ground, c, good))
        .sort(byField)
        .find((c) => first + loneChange(grid, ground, good, from, c) < 0 && cover.keeps([lone, from], [spot, c]));
      if (to !== undefined) found = [from, to];
    }
    swapRatings(ground, good, lone, spot);
    if (found) return [[lone, spot], found];
  }
  return undefined;
}

/** Share of good Smithore plots that touch another, as S8 measures it; 1 with none. */
function seamShare(grid: Grid, ground: Ground[]): number {
  const goods = grid.land.filter((i) => isGood(ground, i, 'smithore'));
  if (goods.length === 0) return 1;
  return goods.filter((i) => !isLoneGood(grid, ground, i, 'smithore')).length / goods.length;
}

/**
 * A good plot and a near plot of its terrain that can trade ratings, stranding nobody. Donors
 * whose loss leaves no seam neighbour alone come first; for Smithore, the pair leaving the
 * fewest lone plots wins outright.
 */
function findSwap(grid: Grid, ground: Ground[], field: number[], good: FloorGood, plots: number[], cover: Coverage): [number, number] | undefined {
  const donorsFor = (plot: number) =>
    grid.land
      .filter((d) => grid.terrain[d] === grid.terrain[plot] && isGood(ground, d, good))
      .map((d) => ({ d, breaks: seamBreaks(grid, ground, d, good) }))
      .sort((a, b) => a.breaks - b.breaks || field[a.d]! - field[b.d]! || a.d - b.d)
      .map(({ d }) => d);
  if (good !== 'smithore') {
    for (const plot of plots) {
      const donor = donorsFor(plot).find((d) => cover.keeps([d], [plot]));
      if (donor !== undefined) return [donor, plot];
    }
    return undefined;
  }
  const pairs = plots.flatMap((plot) => donorsFor(plot).map((d) => ({ d, plot, cost: loneChange(grid, ground, good, d, plot) })));
  const best = pairs.sort((a, b) => a.cost - b.cost).find(({ d, plot }) => cover.keeps([d], [plot]));
  return best && [best.d, best.plot];
}

/** How a trade of ratings between `from` (good) and `to` changes the number of isolated good plots. */
function loneChange(grid: Grid, ground: Ground[], good: FloorGood, from: number, to: number): number {
  // Only the two plots and their neighbours can change isolation.
  const around = new Set([from, to, ...grid.neighbours[from]!, ...grid.neighbours[to]!]);
  const count = () => [...around].filter((i) => isLoneGood(grid, ground, i, good)).length;
  const before = count();
  swapRatings(ground, good, from, to);
  const after = count();
  swapRatings(ground, good, from, to);
  return after - before;
}

/** How many good plots lie within reach of each plot, kept current as good plots move. */
interface Coverage {
  isFar(i: number): boolean;
  /** Whether the `lose` plots losing their good rating, and the `gain` plots gaining one, leaves every plot reached now still reached. */
  keeps(lose: number[], gain?: number[]): boolean;
  move(lose: number[], gain?: number[]): void;
}

function coverage(grid: Grid, limit: number, goods: number[]): Coverage {
  const near = ballOf(grid, limit);
  const count = grid.layout.terrain.map(() => 0);
  const shift = (at: number, by: number) => {
    for (const i of near[at]!) count[i]! += by;
  };
  for (const g of goods) shift(g, 1);
  const within = (i: number, j: number) => grid.steps(i, j) <= limit;
  return {
    isFar: (i) => count[i] === 0,
    keeps: (lose, gain = []) =>
      lose.every((l) =>
        near[l]!.every((i) => {
          if (count[i] === 0) return true;
          const left = count[i]! - lose.filter((x) => within(i, x)).length + gain.filter((y) => within(i, y)).length;
          return left > 0;
        }),
      ),
    move: (lose, gain = []) => {
      for (const l of lose) shift(l, -1);
      for (const g of gain) shift(g, 1);
    },
  };
}

/** A layout's land plots, terrain and neighbours, worked out once per layout. */
interface Grid {
  layout: Layout;
  land: number[];
  terrain: (LandTerrain | undefined)[];
  /** Land 4-neighbours of each plot. */
  neighbours: number[][];
  steps(a: number, b: number): number;
  /** Per reach limit, the land plots within that many steps of each plot. */
  balls: Map<number, number[][]>;
}

const grids = new WeakMap<Layout, Grid>();

function gridOf(layout: Layout): Grid {
  const known = grids.get(layout);
  if (known) return known;
  const { width, height } = layout;
  const land = layout.terrain.flatMap((t, i) => (t === 'store' ? [] : [i]));
  const isLand = (i: number) => layout.terrain[i] !== 'store';
  const neighbours = layout.terrain.map((_, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    const out: number[] = [];
    if (x > 0) out.push(i - 1);
    if (x < width - 1) out.push(i + 1);
    if (y > 0) out.push(i - width);
    if (y < height - 1) out.push(i + width);
    return out.filter(isLand);
  });
  const grid: Grid = {
    layout,
    land,
    terrain: layout.terrain.map((t) => (t === 'store' ? undefined : t)),
    neighbours,
    steps: (a, b) => Math.abs((a % width) - (b % width)) + Math.abs(Math.floor(a / width) - Math.floor(b / width)),
    balls: new Map(),
  };
  grids.set(layout, grid);
  return grid;
}

function ballOf(grid: Grid, limit: number): number[][] {
  let ball = grid.balls.get(limit);
  if (!ball) {
    ball = grid.layout.terrain.map((_, i) => grid.land.filter((j) => grid.steps(i, j) <= limit));
    grid.balls.set(limit, ball);
  }
  return ball;
}

/** Plots ordered best-suited first: highest chance of a good rating on their terrain's odds, then highest field. */
function bySuit(dealt: Dealt, good: FloorGood): (a: number, b: number) => number {
  const chance = gridOf(dealt.layout).terrain.map((t) => (t ? pGood(t, good) : 0));
  const field = dealt.fields[good];
  return (a, b) => chance[b]! - chance[a]! || field[b]! - field[a]! || a - b;
}

function smoothField(layout: Layout, good: FloorGood, rng: Rng): number[] {
  const { width, height } = layout;
  const { area, spread } = good === 'smithore' ? MAP.ground.blobs.smithore : MAP.ground.blobs.grown;
  const count = Math.max(MAP.ground.minBlobs, Math.round((width * height) / area));
  const blobs = Array.from({ length: count }, () => ({ x: rng.next() * width, y: rng.next() * height, weight: rng.next() }));
  return layout.terrain.map((_, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    const bumps = blobs.reduce((sum, b) => sum + b.weight * Math.exp(-((x - b.x) ** 2 + (y - b.y) ** 2) / (2 * spread)), 0);
    return bumps + rng.next() * MAP.ground.fieldNoise;
  });
}

/** n ratings following the odds almost exactly: slot i draws once from [i/n, (i+1)/n) of the cumulative odds. Sorted high to low. */
function stratifiedDraw(n: number, { values, weights }: Odds, rng: Rng): number[] {
  // Float sums of the odds can leave a sliver past the last real rating; it belongs to that rating, not a 0-chance one.
  let last = weights.length - 1;
  while (last > 0 && weights[last] === 0) last--;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let u = (i + rng.next()) / n;
    let k = 0;
    while (k < last && u >= weights[k]!) {
      u -= weights[k]!;
      k++;
    }
    out.push(values[k]!);
  }
  return out.sort((a, b) => b - a);
}

function oddsOf(terrain: LandTerrain, good: FloorGood): Odds {
  const odds = TERRAIN_ODDS[terrain];
  if (good === 'smithore') return { values: [0, 1, 2, 3, 4], weights: MINERAL_ODDS[odds.mined.smithore] };
  return { values: [-2, -1, 0, 1, 2, 3], weights: GROWN_ODDS[odds.grown[good] ?? 'neutral'] };
}

const LAND_TERRAINS = Object.keys(TERRAIN_ODDS) as LandTerrain[];
const ODDS_FACTS = new Map(
  LAND_TERRAINS.flatMap((terrain) =>
    FLOOR_GOODS.map((good) => {
      const { values, weights } = oddsOf(terrain, good);
      const mean = values.reduce((sum, v, k) => sum + v * weights[k]!, 0);
      const chance = values.reduce((sum, v, k) => sum + (v >= MAP.goodAt[good] ? weights[k]! : 0), 0);
      return [`${terrain} ${good}`, { mean, chance }] as const;
    }),
  ),
);

/** The average rating a plot of this terrain is dealt for the good: what its hint promises. */
function meanRating(terrain: LandTerrain, good: FloorGood): number {
  return ODDS_FACTS.get(`${terrain} ${good}`)!.mean;
}

/** Chance a plot of this terrain is dealt a good rating for the good. */
function pGood(terrain: LandTerrain, good: FloorGood): number {
  return ODDS_FACTS.get(`${terrain} ${good}`)!.chance;
}

function ringRating(stepsToCentre: number, rng: Rng): number {
  const { high, medium, low } = MAP.peak;
  if (stepsToCentre === 0) return high;
  if (stepsToCentre === 1) return medium;
  if (stepsToCentre === 2) return rng.int(low.min, low.max);
  return 0;
}

function plotsByTerrain(grid: Grid): Map<LandTerrain, number[]> {
  const out = new Map<LandTerrain, number[]>();
  for (const i of grid.land) {
    const terrain = grid.terrain[i]!;
    const plots = out.get(terrain);
    if (plots) plots.push(i);
    else out.set(terrain, [i]);
  }
  return out;
}

/** How many good neighbours of good plot `i` would be left with no good neighbour if `i` lost its rating. */
function seamBreaks(grid: Grid, ground: Ground[], i: number, good: FloorGood): number {
  const alone = (n: number) => !grid.neighbours[n]!.some((m) => m !== i && isGood(ground, m, good));
  return grid.neighbours[i]!.filter((n) => isGood(ground, n, good) && alone(n)).length;
}

/** A good plot with no good 4-neighbour. */
function isLoneGood(grid: Grid, ground: Ground[], i: number, good: FloorGood): boolean {
  return isGood(ground, i, good) && !grid.neighbours[i]!.some((n) => isGood(ground, n, good));
}

function isGood(ground: Ground[], i: number, good: FloorGood): boolean {
  return ground[i]![good] >= MAP.goodAt[good];
}

function swapRatings(ground: Ground[], good: FloorGood, a: number, b: number): void {
  const rating = ground[a]![good];
  ground[a]![good] = ground[b]![good];
  ground[b]![good] = rating;
}

function copyGround(dealt: Dealt): Ground[] {
  return dealt.ground.map((g) => ({ ...g }));
}
