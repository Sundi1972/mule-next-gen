import { MAP, mapSize, sizeBand, type ShareTerrain, type SizeBand } from './config.js';
import { Grid, isMining, repairLayout, SHARE_TERRAINS, countTerrains, groups, type Band, type Budget, type Cells } from './map-repair.js';
import { dominantCap, regionCap, shareBand } from './map-rules.js';
import type { Rng } from './rng.js';
import type { Terrain } from './types.js';

/**
 * The layout stages of the map generator (spec RULE-2 stages 1-3): river,
 * terrain budget, regions. Each builds its rules in; the regions stage ends in
 * a bounded repair (map-repair.ts), never a reroll of the map.
 */

/**
 * The visible landscape before any ground is dealt: one terrain per plot,
 * row-major (index y * width + x), the store at the centre plot.
 */
export interface Layout {
  width: number;
  height: number;
  terrain: Terrain[];
}

/** A layout part-way through the stages: null marks a plot no stage has filled yet. */
export interface Sketch {
  width: number;
  height: number;
  band: SizeBand;
  terrain: Cells;
}

// A share exactly on the budget's cap must not lose a plot to float rounding.
const EPS = 1e-9;

/** Lays out a map's river, terrain shares and regions (spec RULE-2 stages 1-3). Pure: every choice comes from `rng`. */
export function layoutMap(players: number, rng: Rng): Layout {
  const sketch = placeRiver(players, rng);
  const budget = budgetTerrain(freeCount(sketch), rng);
  return growRegions(sketch, budget, rng);
}

/** Stage 1: the store at the centre and a bending river from the top row to the bottom row. */
export function placeRiver(players: number, rng: Rng): Sketch {
  const band = sizeBand(players);
  const { width, height } = mapSize(players);
  const terrain: Cells = Array(width * height).fill(null);
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  terrain[midY * width + midX] = 'store';

  // Transition y joins row y to row y + 1. The two beside the store's row never shift, so the river stays beside the store.
  const transitions = [...Array(height - 1).keys()].filter((y) => y !== midY - 1 && y !== midY);
  const bends = MAP.bends[band] + rng.int(0, 1);
  const shifts = new Set(rng.shuffle(transitions).slice(0, bends));
  const lo = MAP.riverMargin;
  const hi = width - 1 - MAP.riverMargin;
  // A shift only goes a way that stays inside the margins, so clamping never swallows a bend.
  // Today's maps are wide enough for both ways from any column; the filter guards a narrower size.
  const shift = (col: number) => col + rng.pick([-1, 1].filter((d) => col + d >= lo && col + d <= hi));

  const cols: number[] = Array(height).fill(midX + rng.pick([-1, 1]));
  for (let y = midY - 1; y >= 0; y--) cols[y] = shifts.has(y) ? shift(cols[y + 1]!) : cols[y + 1]!;
  for (let y = midY + 1; y < height; y++) cols[y] = shifts.has(y - 1) ? shift(cols[y - 1]!) : cols[y - 1]!;

  for (let y = 0; y < height; y++) terrain[y * width + cols[y]!] = 'river';
  for (let y = 0; y + 1 < height; y++) {
    if (cols[y] === cols[y + 1]) continue;
    // The joining plot sits on the row nearer the store, at the column of the row further from it.
    const nearer = y + 1 <= midY ? y + 1 : y;
    const further = nearer === y ? y + 1 : y;
    terrain[nearer * width + cols[further]!] = 'river';
  }
  return { width, height, band, terrain };
}

/** Stage 2: how many plots of the free land each terrain gets; the counts sum to `freeLand`. */
export function budgetTerrain(freeLand: number, rng: Rng): Budget {
  const bands = shareBands(freeLand);
  // The cap keeps a jittered plains share under S3 even if the shares or the jitter grow.
  const shares = SHARE_TERRAINS.map((t) => {
    const jittered = MAP.shares[t] * (1 + MAP.jitter * (2 * rng.next() - 1));
    return Math.min(MAP.layout.shareCap, jittered);
  });
  const total = shares.reduce((a, b) => a + b, 0);
  const budget = Object.fromEntries(
    SHARE_TERRAINS.map((t, i) => [t, clamp(Math.round((shares[i]! / total) * freeLand), bands[t])]),
  ) as Budget;
  // Rounding and the bands leave the sum a few plots off; settle it on terrains with room left in their band.
  for (let pass = 0; pass < freeLand; pass++) {
    const off = freeLand - SHARE_TERRAINS.reduce((a, t) => a + budget[t], 0);
    if (off === 0) break;
    const step = Math.sign(off);
    const room = SHARE_TERRAINS.filter((t) => (step > 0 ? budget[t] < bands[t].hi : budget[t] > bands[t].lo));
    if (room.length === 0) break;
    budget[rng.pick(room)] += step;
  }
  return budget;
}

/**
 * Stage 3: fills the sketch's free plots with regions of the budgeted terrains,
 * keeping each terrain in its share band, with hills or mountains within
 * Smithore reach of every land plot (AM-4).
 */
export function growRegions(sketch: Sketch, budget: Budget, rng: Rng): Layout {
  const grid = new Grid(sketch.width, sketch.terrain, MAP.reach[sketch.band].smithore);
  const cap = regionCap(grid.free.length);
  const plan = new Plan(grid, splitBudget(budget, cap));
  seedRegions(plan, rng);
  growTogether(plan, rng);
  for (let round = 0; round < MAP.layout.refillRounds; round++) {
    if (!plantPockets(plan, budget, cap, rng)) break;
    growTogether(plan, rng);
  }
  joinLeftovers(plan, cap, rng);

  const terrain: Cells = [...sketch.terrain];
  for (const i of grid.free) terrain[i] = plan.owner[i]! >= 0 ? plan.regions[plan.owner[i]!]!.terrain : null;
  // Only a stretch of land no seed reached is still empty; it goes to the terrain furthest under budget.
  for (const i of grid.free) if (terrain[i] === null) terrain[i] = mostShort(grid, terrain, budget);
  repairLayout({ grid, terrain, budget, bands: shareBands(grid.free.length), cap }, rng);
  return {
    width: sketch.width,
    height: sketch.height,
    terrain: terrain.map((t, i) => {
      if (t === null) throw new Error(`layout left plot ${i} empty`);
      return t;
    }),
  };
}

interface Region {
  terrain: ShareTerrain;
  quota: number;
  cells: number[];
}

/** The regions being grown, who owns each plot, and how many mining plots reach each land plot. */
class Plan {
  readonly owner: number[];
  private readonly reachedBy: number[];

  constructor(
    readonly grid: Grid,
    readonly regions: Region[],
  ) {
    this.owner = Array(grid.next.length).fill(-1);
    this.reachedBy = Array(grid.next.length).fill(0);
  }

  own(r: number, i: number): void {
    this.owner[i] = r;
    this.regions[r]!.cells.push(i);
    if (isMining(this.regions[r]!.terrain)) for (const l of this.grid.within[i]!) this.reachedBy[l]!++;
  }

  /** Land plots a mining plot at `i` would bring within reach that none reaches yet. */
  gain(i: number): number {
    return this.grid.within[i]!.filter((l) => this.reachedBy[l] === 0).length;
  }

  /** True when plot `i` touches another region of `r`'s terrain: taking it would merge the two into one. */
  touchesTwin(i: number, r: number): boolean {
    const terrain = this.regions[r]!.terrain;
    return this.grid.next[i]!.some((j) => {
      const other = this.owner[j]!;
      return other >= 0 && other !== r && this.regions[other]!.terrain === terrain;
    });
  }

  quotaLeft(r: number): number {
    return this.regions[r]!.quota - this.regions[r]!.cells.length;
  }
}

function freeCount(sketch: Sketch): number {
  return sketch.terrain.filter((t) => t === null).length;
}

function clamp(n: number, band: Band): number {
  return Math.max(band.lo, Math.min(band.hi, n));
}

/** The plot counts S1-S3 allow each terrain on this much free land. */
function shareBands(freeLand: number): Record<ShareTerrain, Band> {
  const top = Math.min(Math.floor(MAP.layout.shareCap * freeLand + EPS), dominantCap(freeLand));
  return Object.fromEntries(
    SHARE_TERRAINS.map((t) => {
      const band = shareBand(t, freeLand);
      // Never under one whole region: today's smallest band starts at 3 anyway; this guards smaller shares or maps.
      return [t, { lo: Math.max(MAP.minRegion, band.min), hi: Math.min(top, band.max) }];
    }),
  ) as Record<ShareTerrain, Band>;
}

/** Each terrain's count split into regions of minRegion to cap plots, about avgRegion each. */
function splitBudget(budget: Budget, cap: number): Region[] {
  return SHARE_TERRAINS.flatMap((terrain) => {
    const count = budget[terrain];
    const most = Math.max(1, Math.floor(count / MAP.minRegion));
    const k = Math.min(most, Math.max(1, Math.ceil(count / cap), Math.round(count / MAP.layout.avgRegion)));
    return Array.from({ length: k }, (_, i) => ({ terrain, quota: Math.floor(count / k) + (i < count % k ? 1 : 0), cells: [] }));
  });
}

/**
 * One seed per region. Mining regions go first, each where it brings the most
 * land within Smithore reach (AM-4); then every seed sits as far as it can from
 * its own terrain's seeds without crowding any other seed.
 */
function seedRegions(plan: Plan, rng: Rng): void {
  const { grid, regions, owner } = plan;
  const { twinSpacing, seedSpacing } = MAP.layout;
  const toAny: number[] = Array(owner.length).fill(seedSpacing);
  const toTwin = new Map<ShareTerrain, number[]>();
  const order = rng.shuffle([...regions.keys()]);
  const mining = order.filter((r) => isMining(regions[r]!.terrain));
  // Reach gained outranks any spacing: spacing scores at most this much.
  const reachWeight = twinSpacing + 2 * seedSpacing + 1;
  for (const r of [...mining, ...order.filter((r) => !mining.includes(r))]) {
    const terrain = regions[r]!.terrain;
    const twin = toTwin.get(terrain) ?? Array(owner.length).fill(twinSpacing);
    let best = -1;
    let bestScore = -Infinity;
    for (const i of grid.free) {
      if (owner[i]! >= 0 || plan.touchesTwin(i, r)) continue;
      // Spacing from every seed counts double: a crowded seed is the one that ends up boxed in.
      const spacing = twin[i]! + 2 * toAny[i]!;
      const score = (isMining(terrain) ? reachWeight * plan.gain(i) : 0) + spacing + rng.next();
      if (score > bestScore) [best, bestScore] = [i, score];
    }
    if (best < 0) continue;
    plan.own(r, best);
    for (const i of grid.free) {
      toAny[i] = Math.min(toAny[i]!, grid.steps(best, i));
      twin[i] = Math.min(twin[i]!, grid.steps(best, i));
    }
    toTwin.set(terrain, twin);
  }
}

/**
 * Grows every region with quota left a free neighbour at a time, weighted by
 * quota left, preferring plots that keep it compact; a mining region also
 * prefers plots that bring new land within reach.
 */
function growTogether(plan: Plan, rng: Rng): void {
  const { grid, regions, owner } = plan;
  let growing = [...regions.keys()].filter((r) => regions[r]!.cells.length > 0 && plan.quotaLeft(r) > 0);
  for (let pass = 0; pass < grid.free.length * MAP.layout.growPasses && growing.length > 0; pass++) {
    const r = growing[rng.weighted(growing.map((g) => plan.quotaLeft(g)))]!;
    const region = regions[r]!;
    const around = new Set(region.cells.flatMap((c) => grid.next[c]!));
    const frontier = [...around].filter((i) => owner[i] === -1 && !plan.touchesTwin(i, r));
    if (frontier.length > 0) {
      const weights = frontier.map((i) => {
        const compact = grid.next[i]!.filter((j) => owner[j] === r).length ** 2;
        return isMining(region.terrain) ? compact * (1 + plan.gain(i)) : compact;
      });
      plan.own(r, frontier[rng.weighted(weights)]!);
    }
    if (frontier.length === 0 || plan.quotaLeft(r) <= 0) growing = growing.filter((g) => g !== r);
  }
}

/**
 * Regions boxed in before their quota leave free pockets elsewhere; each
 * pocket big enough for a region gets a new one of the terrain furthest under
 * its budget, so the budget is met where the land is. Returns whether it planted any.
 */
function plantPockets(plan: Plan, budget: Budget, cap: number, rng: Rng): boolean {
  const { grid, regions, owner } = plan;
  const planned = countOwned(plan);
  const short = (t: ShareTerrain) => budget[t] - planned[t];
  let planted = false;
  for (const pocket of rng.shuffle(groups(grid, (i) => owner[i] === -1, () => true))) {
    if (pocket.length < MAP.minRegion) continue;
    for (const terrain of rng.shuffle(SHARE_TERRAINS).sort((a, b) => short(b) - short(a))) {
      if (short(terrain) <= 0) break;
      const r = regions.length;
      const quota = Math.min(pocket.length, cap, Math.max(MAP.minRegion, short(terrain)));
      regions.push({ terrain, quota, cells: [] });
      const open = pocket.filter((i) => !plan.touchesTwin(i, r));
      if (open.length === 0) {
        regions.pop();
        continue;
      }
      // Seed where the pocket is roomiest, so the new region has space to reach its quota.
      const roominess = open.map((i) => 1 + grid.next[i]!.filter((j) => owner[j] === -1).length ** 2);
      plan.own(r, open[rng.weighted(roominess)]!);
      planned[terrain] += quota;
      planted = true;
      break;
    }
  }
  return planted;
}

function countOwned(plan: Plan): Budget {
  const owned = Object.fromEntries(SHARE_TERRAINS.map((t) => [t, 0])) as Budget;
  for (const r of plan.regions) owned[r.terrain] += r.cells.length;
  return owned;
}

/** Plots no region reached join their smallest neighbouring region, one under the cap that merges with no twin where there is one. */
function joinLeftovers(plan: Plan, cap: number, rng: Rng): void {
  const { grid, regions, owner } = plan;
  const size = (r: number) => regions[r]!.cells.length;
  for (let pass = 0; pass < MAP.layout.leftoverPasses; pass++) {
    const left = rng.shuffle(grid.free.filter((i) => owner[i] === -1));
    if (left.length === 0) return;
    for (const i of left) {
      const around = [...new Set(grid.next[i]!.map((j) => owner[j]!).filter((r) => r >= 0))];
      if (around.length === 0) continue;
      const fits = around.filter((r) => size(r) < cap && !plan.touchesTwin(i, r));
      const from = fits.length > 0 ? fits : around;
      plan.own(from.reduce((a, b) => (size(b) < size(a) ? b : a)), i);
    }
  }
}

function mostShort(grid: Grid, terrain: Cells, budget: Budget): ShareTerrain {
  const have = countTerrains(grid, terrain);
  return SHARE_TERRAINS.reduce((a, b) => (budget[b] - have[b] > budget[a] - have[a] ? b : a));
}
