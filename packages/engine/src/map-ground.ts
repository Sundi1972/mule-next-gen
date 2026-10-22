import { GROWN_ODDS, MAP, MINERAL_ODDS, TERRAIN_ODDS, sizeBand, type FloorGood } from './config.js';
import type { Layout } from './map-layout.js';
import { zeroGround } from './grid.js';
import type { Rng } from './rng.js';
import type { Ground, Terrain } from './types.js';

/**
 * The ground stages of the map generator (spec RULE-2 stages 4-9): hidden ratings
 * dealt onto a finished layout, then repaired in bounded passes, never rerolled.
 */

/** Per floor good, one smooth-field value per plot: where that good's best ratings go. */
export type Fields = Record<FloorGood, number[]>;

type LandTerrain = Exclude<Terrain, 'store'>;

/** A layout's land plots, terrains, neighbours and reach, worked out once per map by stage 4. */
export interface Board {
  layout: Layout;
  land: number[];
  /** Per plot; undefined for the store. */
  terrain: (LandTerrain | undefined)[];
  /** Land 4-neighbours of each plot. */
  neighbours: number[][];
  byTerrain: Map<LandTerrain, number[]>;
  steps(a: number, b: number): number;
  /** For each plot, the land plots within `limit` steps of it. */
  ball(limit: number): number[][];
}

/** The ground part-way through the stages, with what later stages read. */
export interface Dealt {
  layout: Layout;
  players: number;
  board: Board;
  fields: Fields;
  /** One rating set per plot, row-major like the layout; the store's is all 0. */
  ground: Ground[];
}

/**
 * A rating raised outside the floors stage, always to exactly the good threshold: the only
 * changes stages 7-9 make to a terrain's ratings besides the scarcity lowering.
 */
export type Lift = ReachLift | SeamLift;

/** Stage 7: no swap could bring `stranded` within reach. */
export interface ReachLift {
  kind: 'reach';
  good: FloorGood;
  plot: number;
  /** The rating before the lift. */
  from: number;
  stranded: number;
  /** No plot of a terrain whose odds allow a good rating lay within reach of `stranded`, so the lift went on one that doesn't. */
  impossible: boolean;
}

/** Stages 8 and 9: no same-terrain arrangement kept S8 and reach, so a plot beside the lone good plot `joins` was lifted. */
export interface SeamLift {
  kind: 'seam';
  good: 'smithore';
  plot: number;
  from: number;
  joins: number;
}

export interface GroundDeal {
  ground: Ground[];
  /** The map's one scarce good, or null when it has none. */
  scarce: FloorGood | null;
  lifts: Lift[];
}

type Odds = { values: number[]; weights: readonly number[] };

const FLOOR_GOODS = Object.keys(MAP.floor) as FloorGood[];
const MINERALS = ['crystite', 'rareEarth'] as const;
// S8 compares a share; a share exactly on the edge must pass here as it does in the checker.
const EPS = 1e-9;

/** Deals a laid-out map its hidden ground (spec RULE-2 stages 4-9). Pure: every choice comes from `rng`; never throws. */
export function dealGround(layout: Layout, players: number, rng: Rng): GroundDeal {
  const peaks = placePeaks(dealOdds(layout, players, rng), rng);
  const scarce = pickScarce(rng);
  const reach = repairReach(liftFloors(peaks, scarce));
  const seams = joinSeams(reach);
  const done = applyScarcity(seams, scarce);
  return { ground: done.ground, scarce, lifts: [...reach.lifts, ...seams.lifts, ...done.lifts] };
}

/**
 * Stage 4: for each floor good, a smooth field ranks the plots and every terrain's
 * plots are dealt that terrain's ratings by stratified draw, highest rating to highest field.
 */
export function dealOdds(layout: Layout, players: number, rng: Rng): Dealt {
  const board = boardOf(layout);
  const ground = layout.terrain.map(() => zeroGround());
  const fields = {} as Fields;
  for (const good of FLOOR_GOODS) {
    const field = smoothField(layout, good, rng);
    fields[good] = field;
    for (const [terrain, plots] of board.byTerrain) {
      const ratings = stratifiedDraw(plots.length, oddsOf(terrain, good), rng);
      [...plots].sort(highestField(field)).forEach((i, k) => (ground[i]![good] = ratings[k]!));
    }
  }
  return { layout, players, board, fields, ground };
}

/** Stage 4b: Crystite, then Rare earth, in 3-4 rings around random land plots; every land plot rated by its steps to the nearest centre. */
export function placePeaks(dealt: Dealt, rng: Rng): Dealt {
  const { board } = dealt;
  const ground = copyGround(dealt);
  for (const mineral of MINERALS) {
    // Distinct centres: two on one plot would count as one peak.
    const centres = rng.shuffle(board.land).slice(0, rng.int(MAP.peak.count.min, MAP.peak.count.max));
    for (const i of board.land) ground[i]![mineral] = ringRating(Math.min(...centres.map((c) => board.steps(i, c))), rng);
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
 * Stage 6: each floor good gets at least its target of good plots (the floor for the scarce
 * good, the normal lower edge otherwise). Each lift raises a plot to exactly the threshold, on
 * the capable terrain whose mean it raises least, highest field first within a terrain.
 */
export function liftFloors(dealt: Dealt, scarce: FloorGood | null): Dealt {
  const { board } = dealt;
  const ground = copyGround(dealt);
  for (const good of FLOOR_GOODS) {
    const target = Math.ceil((good === scarce ? MAP.floor[good] : MAP.normalLo[good]) * dealt.players);
    const field = dealt.fields[good];
    let have = board.land.filter((i) => isGood(ground, i, good)).length;
    const queues = [...board.byTerrain.entries()]
      .filter(([terrain]) => pGood(terrain, good) > 0)
      .map(([, plots]) => plots.filter((i) => !isGood(ground, i, good)).sort(highestField(field)));
    const raised = new Raised(board, ground, good, field);
    // Each round lifts one plot or stops, so this ends within the land's size.
    while (have < target) {
      const plot = raised.cheapest(queues.flatMap((queue) => queue.slice(0, 1)));
      if (plot === undefined) break;
      raised.lift(plot);
      queues.find((queue) => queue[0] === plot)!.shift();
      have++;
    }
  }
  return { ...dealt, ground };
}

/**
 * Stage 7: every land plot within reach of a good plot of each floor good. A plot too far gets
 * a near plot swapped with a good plot of the same terrain whose loss strands nobody; only when
 * no such pair exists is a near plot lifted, and the lift is recorded.
 */
export function repairReach(dealt: Dealt): Dealt & { lifts: ReachLift[] } {
  const { board } = dealt;
  const ground = copyGround(dealt);
  const lifts: ReachLift[] = [];
  for (const good of FLOOR_GOODS) {
    const limit = MAP.reach[sizeBand(dealt.players)][good];
    const cover = coverage(board, limit, board.land.filter((i) => isGood(ground, i, good)));
    const field = dealt.fields[good];
    for (let pass = 0; pass < MAP.ground.reachPasses; pass++) {
      const stranded = board.land.find((i) => cover.isFar(i));
      if (stranded === undefined) break;
      const far = board.land.filter((i) => cover.isFar(i));
      // The stranded plot is never good itself, so `near` always holds at least it.
      const near: Candidate[] = board.ball(limit)[stranded]!
        .filter((i) => !isGood(ground, i, good))
        .map((i) => ({
          i,
          odds: pGood(board.terrain[i]!, good),
          mean: meanRating(board.terrain[i]!, good),
          rating: ground[i]![good],
          touches: board.neighbours[i]!.some((n) => isGood(ground, n, good)) ? 1 : 0,
          reaches: far.filter((f) => board.steps(f, i) <= limit).length,
          away: board.steps(i, stranded),
          field: field[i]!,
        }));
      const swap = findSwap(board, ground, field, good, [...near].sort(swapFirst).map((c) => c.i), cover);
      if (swap) {
        swapRatings(ground, good, swap[0], swap[1]);
        cover.move([swap[0]], [swap[1]]);
        continue;
      }
      const pick = [...near].sort(liftFirst)[0]!;
      lifts.push({ kind: 'reach', good, plot: pick.i, from: pick.rating, stranded, impossible: pick.odds === 0 });
      ground[pick.i]![good] = MAP.goodAt[good];
      cover.move([], [pick.i]);
    }
  }
  return { ...dealt, ground, lifts };
}

/** A non-good plot near a stranded one, with what the swap and lift orders weigh. */
interface Candidate {
  i: number;
  odds: number;
  mean: number;
  rating: number;
  touches: number;
  reaches: number;
  away: number;
  field: number;
}

/** Swaps keep the odds whatever terrain they use, so seams come first: a plot touching a good one, then the likeliest terrain, then the most far plots reached. */
function swapFirst(a: Candidate, b: Candidate): number {
  return b.touches - a.touches || b.odds - a.odds || b.reaches - a.reaches || b.field - a.field || a.i - b.i;
}

/** A lift on a terrain whose odds can't give the good makes its hint a lie, so capable terrains first, nearest first, then the smallest move of the terrain's mean. */
function liftFirst(a: Candidate, b: Candidate): number {
  const capable = (c: Candidate) => (c.odds > 0 ? 1 : 0);
  return (
    capable(b) - capable(a) ||
    a.away - b.away ||
    b.mean - a.mean ||
    b.rating - a.rating ||
    b.touches - a.touches ||
    b.reaches - a.reaches ||
    b.field - a.field ||
    a.i - b.i
  );
}

/**
 * Stage 8: an isolated good Smithore plot joins a seam by a same-terrain trade that strands
 * nobody and leaves fewer isolated plots. When no trade reaches S8, seam lifts make up the rest.
 */
export function joinSeams(dealt: Dealt): Dealt & { lifts: SeamLift[] } {
  const { board } = dealt;
  const ground = copyGround(dealt);
  const field = dealt.fields.smithore;
  const cover = coverage(board, MAP.reach[sizeBand(dealt.players)].smithore, board.land.filter((i) => isGood(ground, i, 'smithore')));
  seamTrades(board, ground, field, cover);
  const raised = new Raised(board, ground, 'smithore', field);
  const lifts: SeamLift[] = [];
  // Each lift joins at least one isolated plot, so no more lifts than isolated plots are ever needed.
  for (let budget = isolatedCount(board, ground); budget > 0 && !seamsHold(board, ground); budget--) {
    const lift = seamLift(board, ground, raised, cover, new Set());
    if (!lift) break;
    lifts.push(lift);
  }
  return { ...dealt, ground, lifts };
}

/**
 * Stage 9: the scarce good's good plots drop to exactly one under the threshold until its count
 * is under the normal lower edge, skipping any whose loss would strand a plot. The cut is searched
 * depth-first, lowest field first (lone Smithore plots first), so the first full cut is the plain
 * lowest-field-first pass. For Smithore the cut must also keep S8: the search goes on to other
 * cuts, then to cuts that leave fewer plots (down to the floor), and if none holds, seam lifts
 * are paired with extra lowerings so the count stays in the scarce band.
 */
export function applyScarcity(dealt: Dealt, scarce: FloorGood | null): Dealt & { lifts: SeamLift[] } {
  const ground = copyGround(dealt);
  if (scarce === null) return { ...dealt, ground, lifts: [] };
  const { board, players } = dealt;
  const field = dealt.fields[scarce];
  const goods = board.land.filter((i) => isGood(ground, i, scarce));
  const most = Math.ceil(MAP.normalLo[scarce] * players) - 1;
  const least = Math.ceil(MAP.floor[scarce] * players);
  if (goods.length <= most) return { ...dealt, ground, lifts: [] };
  const cover = coverage(board, MAP.reach[sizeBand(players)][scarce], goods);
  const lone = (i: number) => (scarce === 'smithore' && isLoneGood(board, ground, i, scarce) ? 0 : 1);
  const order = [...goods].sort((a, b) => lone(a) - lone(b) || field[a]! - field[b]! || a - b);
  const keepsSeams = (lowered: Set<number>) => scarce !== 'smithore' || seamsHoldWithout(board, ground, lowered);
  const search = new CutSearch(order, cover, keepsSeams);
  const sizes = scarce === 'smithore' ? range(goods.length - most, goods.length - least) : [goods.length - most];
  const cut = firstOf(sizes, (size) => search.find(size)) ?? search.first ?? search.deepest;
  const lower = (i: number) => {
    ground[i]![scarce] = MAP.goodAt[scarce] - 1;
    cover.move([i]);
  };
  for (const i of cut) lower(i);
  const lifts: SeamLift[] = [];
  if (scarce !== 'smithore') return { ...dealt, ground, lifts };
  const lowered = new Set(cut);
  // Lifted plots and the plots they join are never lowered again: that would undo the seam it paid for.
  const kept = new Set<number>();
  const raised = new Raised(board, ground, 'smithore', field);
  // Each round adds one seam lift and one lowering, or undoes its lift and stops; at most one round per good plot.
  for (let round = 0; round < goods.length && !seamsHold(board, ground); round++) {
    const lift = seamLift(board, ground, raised, cover, lowered);
    if (!lift) break;
    const extra = leastIsolating(board, ground, cover, new Set([...lowered, ...kept, lift.plot, lift.joins]));
    if (extra === undefined) {
      cover.move([lift.plot]);
      raised.undo(lift.plot, lift.from);
      break;
    }
    lifts.push(lift);
    kept.add(lift.plot).add(lift.joins);
    lower(extra);
    lowered.add(extra);
  }
  return { ...dealt, ground, lifts };
}

/** A bounded depth-first search for a set of plots to lower that strands nobody and keeps the seams. */
class CutSearch {
  /** The first cut that kept reach, whatever the seams; the fallback when no cut keeps both. */
  first: number[] | undefined;
  /** The largest reach-keeping set seen, for when reach blocks every full cut. */
  deepest: number[] = [];
  private tries = 0;
  private readonly lowered = new Set<number>();

  constructor(
    private readonly order: number[],
    private readonly cover: Coverage,
    private readonly keepsSeams: (lowered: Set<number>) => boolean,
  ) {}

  find(size: number): number[] | undefined {
    return this.from(0, size);
  }

  private from(start: number, size: number): number[] | undefined {
    if (this.lowered.size === size) {
      this.first ??= [...this.lowered];
      return this.keepsSeams(this.lowered) ? [...this.lowered] : undefined;
    }
    if (this.lowered.size > this.deepest.length) this.deepest = [...this.lowered];
    for (let k = start; k < this.order.length && this.tries < MAP.ground.scarcityTries; k++) {
      const i = this.order[k]!;
      this.tries++;
      if (!this.cover.keeps([i])) continue;
      this.lowered.add(i);
      this.cover.move([i]);
      const found = this.from(k + 1, size);
      this.lowered.delete(i);
      this.cover.move([], [i]);
      if (found) return found;
    }
    return undefined;
  }
}

/** A good Smithore plot outside `barred` to lower after a seam lift, keeping reach: the one leaving the fewest isolated plots. */
function leastIsolating(board: Board, ground: Ground[], cover: Coverage, barred: Set<number>): number | undefined {
  const options = board.land.filter((i) => isGood(ground, i, 'smithore') && !barred.has(i) && cover.keeps([i]));
  const after = (i: number) => {
    ground[i]!.smithore -= MAP.goodAt.smithore;
    const count = isolatedCount(board, ground);
    ground[i]!.smithore += MAP.goodAt.smithore;
    return count;
  };
  return options.map((i) => ({ i, isolated: after(i) })).sort((a, b) => a.isolated - b.isolated || a.i - b.i)[0]?.i;
}

/**
 * One seam lift: a non-good plot of a capable terrain beside an isolated good Smithore plot,
 * joining the most isolated plots, then on the terrain whose mean it raises least. The lift
 * reaches plots too, so it enters `cover`, as every lift does, or a later change could strand what it covers.
 */
function seamLift(board: Board, ground: Ground[], raised: Raised, cover: Coverage, barred: Set<number>): SeamLift | undefined {
  const good = 'smithore';
  const lonely = (i: number) => board.neighbours[i]!.filter((n) => isLoneGood(board, ground, n, good));
  const options = board.land.filter((i) => !barred.has(i) && !isGood(ground, i, good) && pGood(board.terrain[i]!, good) > 0 && lonely(i).length > 0);
  const most = Math.max(0, ...options.map((i) => lonely(i).length));
  const plot = raised.cheapest(options.filter((i) => lonely(i).length === most));
  if (plot === undefined) return undefined;
  const lift: SeamLift = { kind: 'seam', good, plot, from: ground[plot]!.smithore, joins: lonely(plot)[0]! };
  raised.lift(plot);
  cover.move([], [plot]);
  return lift;
}

/** Stage 8's trades: same-terrain, reach-keeping, each leaving fewer isolated good Smithore plots. */
function seamTrades(board: Board, ground: Ground[], field: number[], cover: Coverage): void {
  const good = 'smithore';
  const best = (plots: number[]) => plots.sort(highestField(field))[0];
  const helps = (from: number, to: number) => loneChange(board, ground, good, from, to) < 0 && cover.keeps([from], [to]);
  for (let pass = 0; pass < MAP.ground.seamPasses; pass++) {
    let moved = false;
    for (const lone of board.land) {
      if (!isLoneGood(board, ground, lone, good)) continue;
      const terrain = board.terrain[lone];
      let trade: [number, number] | undefined;
      const spot = best(board.land.filter((i) => board.terrain[i] === terrain && !isGood(ground, i, good) && helps(lone, i)));
      if (spot !== undefined) trade = [lone, spot];
      for (const beside of board.neighbours[lone]!) {
        if (trade || isGood(ground, beside, good)) continue;
        const partner = board.terrain[beside];
        const donor = best(board.land.filter((i) => i !== lone && board.terrain[i] === partner && isGood(ground, i, good) && helps(i, beside)));
        if (donor !== undefined) trade = [donor, beside];
      }
      if (!trade) continue;
      swapRatings(ground, good, trade[0], trade[1]);
      cover.move([trade[0]], [trade[1]]);
      moved = true;
    }
    if (!moved) break;
  }
}

/**
 * A good plot and a near plot of its terrain that can trade ratings, stranding nobody. Donors
 * whose loss leaves no seam neighbour alone come first; for Smithore, the pair leaving the
 * fewest lone plots wins outright.
 */
function findSwap(board: Board, ground: Ground[], field: number[], good: FloorGood, plots: number[], cover: Coverage): [number, number] | undefined {
  const donorsFor = (plot: number) =>
    board.land
      .filter((d) => board.terrain[d] === board.terrain[plot] && isGood(ground, d, good))
      .map((d) => ({ d, breaks: seamBreaks(board, ground, d, good) }))
      .sort((a, b) => a.breaks - b.breaks || field[a.d]! - field[b.d]! || a.d - b.d)
      .map(({ d }) => d);
  if (good !== 'smithore') {
    for (const plot of plots) {
      const donor = donorsFor(plot).find((d) => cover.keeps([d], [plot]));
      if (donor !== undefined) return [donor, plot];
    }
    return undefined;
  }
  const pairs = plots.flatMap((plot) => donorsFor(plot).map((d) => ({ d, plot, cost: loneChange(board, ground, good, d, plot) })));
  const pair = pairs.sort((a, b) => a.cost - b.cost).find(({ d, plot }) => cover.keeps([d], [plot]));
  return pair && [pair.d, pair.plot];
}

/**
 * Lifts to exactly the threshold for one good, choosing among offered plots the one that
 * raises its terrain's mean least, counting this stage's earlier lifts on that terrain.
 */
class Raised {
  private readonly gained = new Map<LandTerrain, number>();

  constructor(
    private readonly board: Board,
    private readonly ground: Ground[],
    private readonly good: FloorGood,
    private readonly field: number[],
  ) {}

  /** The offered plot whose lift leaves its terrain's mean least raised; then the likelier terrain, then the highest field. */
  cheapest(offered: number[]): number | undefined {
    const rise = (i: number) => {
      const terrain = this.board.terrain[i]!;
      return ((this.gained.get(terrain) ?? 0) + MAP.goodAt[this.good] - this.ground[i]![this.good]) / this.board.byTerrain.get(terrain)!.length;
    };
    const odds = (i: number) => pGood(this.board.terrain[i]!, this.good);
    return [...offered].sort((a, b) => rise(a) - rise(b) || odds(b) - odds(a) || highestField(this.field)(a, b))[0];
  }

  lift(i: number): void {
    const terrain = this.board.terrain[i]!;
    this.gained.set(terrain, (this.gained.get(terrain) ?? 0) + MAP.goodAt[this.good] - this.ground[i]![this.good]);
    this.ground[i]![this.good] = MAP.goodAt[this.good];
  }

  undo(i: number, from: number): void {
    const terrain = this.board.terrain[i]!;
    this.gained.set(terrain, this.gained.get(terrain)! - (MAP.goodAt[this.good] - from));
    this.ground[i]![this.good] = from;
  }
}

/** How a trade of ratings between `from` (good) and `to` changes the number of isolated good plots. */
function loneChange(board: Board, ground: Ground[], good: FloorGood, from: number, to: number): number {
  // Only the two plots and their neighbours can change isolation.
  const around = new Set([from, to, ...board.neighbours[from]!, ...board.neighbours[to]!]);
  const count = () => [...around].filter((i) => isLoneGood(board, ground, i, good)).length;
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

function coverage(board: Board, limit: number, goods: number[]): Coverage {
  const near = board.ball(limit);
  const count = board.layout.terrain.map(() => 0);
  const shift = (at: number, by: number) => {
    for (const i of near[at]!) count[i]! += by;
  };
  for (const g of goods) shift(g, 1);
  const within = (i: number, j: number) => board.steps(i, j) <= limit;
  return {
    isFar: (i) => count[i] === 0,
    keeps: (lose, gain = []) =>
      lose.every((l) =>
        near[l]!.every((i) => {
          if (count[i] === 0) return true;
          return count[i]! - lose.filter((x) => within(i, x)).length + gain.filter((y) => within(i, y)).length > 0;
        }),
      ),
    move: (lose, gain = []) => {
      for (const l of lose) shift(l, -1);
      for (const g of gain) shift(g, 1);
    },
  };
}

function boardOf(layout: Layout): Board {
  const { width, height } = layout;
  const land = layout.terrain.flatMap((t, i) => (t === 'store' ? [] : [i]));
  const terrain = layout.terrain.map((t) => (t === 'store' ? undefined : t));
  const neighbours = layout.terrain.map((_, i) => {
    const x = i % width;
    const y = Math.floor(i / width);
    const around = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
    return around.filter((j) => j >= 0 && terrain[j] !== undefined);
  });
  const byTerrain = new Map<LandTerrain, number[]>();
  for (const i of land) {
    const plots = byTerrain.get(terrain[i]!);
    if (plots) plots.push(i);
    else byTerrain.set(terrain[i]!, [i]);
  }
  const steps = (a: number, b: number) => Math.abs((a % width) - (b % width)) + Math.abs(Math.floor(a / width) - Math.floor(b / width));
  const balls = new Map<number, number[][]>();
  const ball = (limit: number) => {
    let known = balls.get(limit);
    if (!known) {
      known = layout.terrain.map((_, i) => land.filter((j) => steps(i, j) <= limit));
      balls.set(limit, known);
    }
    return known;
  };
  return { layout, land, terrain, neighbours, byTerrain, steps, ball };
}

function smoothField(layout: Layout, good: FloorGood, rng: Rng): number[] {
  const { width, height } = layout;
  const { area, spread } = good === 'smithore' ? MAP.ground.blobs.smithore : MAP.ground.blobs.grown;
  // Centres fall in the plot box padded on every side, at the same density, so an edge plot has as many bumps
  // around it as an interior one; otherwise the edges come out poorer than the hint says.
  const pad = MAP.ground.blobPad;
  const boxWidth = width - 1 + 2 * pad;
  const boxHeight = height - 1 + 2 * pad;
  const count = Math.max(MAP.ground.minBlobs, Math.round((boxWidth * boxHeight) / area));
  const blobs = Array.from({ length: count }, () => ({ x: rng.next() * boxWidth - pad, y: rng.next() * boxHeight - pad, weight: rng.next() }));
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

const ODDS_FACTS = new Map(
  (Object.keys(TERRAIN_ODDS) as LandTerrain[]).flatMap((terrain) =>
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

/** Chance a plot of this terrain is dealt a good rating for the good; 0 means its odds never allow one. */
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

/** Orders plots highest field first, index breaking ties. */
function highestField(field: number[]): (a: number, b: number) => number {
  return (a, b) => field[b]! - field[a]! || a - b;
}

/** How many good neighbours of good plot `i` would be left with no good neighbour if `i` lost its rating. */
function seamBreaks(board: Board, ground: Ground[], i: number, good: FloorGood): number {
  const alone = (n: number) => !board.neighbours[n]!.some((m) => m !== i && isGood(ground, m, good));
  return board.neighbours[i]!.filter((n) => isGood(ground, n, good) && alone(n)).length;
}

/** A good plot with no good 4-neighbour. */
function isLoneGood(board: Board, ground: Ground[], i: number, good: FloorGood): boolean {
  return isGood(ground, i, good) && !board.neighbours[i]!.some((n) => isGood(ground, n, good));
}

function isolatedCount(board: Board, ground: Ground[]): number {
  return board.land.filter((i) => isLoneGood(board, ground, i, 'smithore')).length;
}

/** S8 as the checker measures it: enough good Smithore plots touching another. */
function seamsHold(board: Board, ground: Ground[]): boolean {
  return seamsHoldWithout(board, ground, new Set());
}

/** S8 if the `lowered` plots lost their good Smithore rating. */
function seamsHoldWithout(board: Board, ground: Ground[], lowered: Set<number>): boolean {
  const good = (i: number) => !lowered.has(i) && isGood(ground, i, 'smithore');
  const kept = board.land.filter(good);
  const joined = kept.filter((i) => board.neighbours[i]!.some(good)).length;
  return kept.length === 0 || joined + EPS >= MAP.seamShare * kept.length;
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

/** from, from + 1, ..., to (empty when to < from). */
function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => from + k);
}

/** The first non-undefined result of `f` over `items`, in order. */
function firstOf<T, R>(items: T[], f: (item: T) => R | undefined): R | undefined {
  for (const item of items) {
    const result = f(item);
    if (result !== undefined) return result;
  }
  return undefined;
}
