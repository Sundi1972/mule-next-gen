import { MAP, mapSize, sizeBand, type ShareTerrain } from './config.js';
import { regionCap, shareBand } from './map-rules.js';
import type { Rng } from './rng.js';
import type { Terrain } from './types.js';

/**
 * The layout stages of the map generator (spec RULE-2 stages 1-3): river,
 * terrain budget, regions. Each builds its rules in; the regions stage ends in
 * a bounded repair, never a reroll of the map.
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
  terrain: (Terrain | null)[];
}

type Budget = Record<ShareTerrain, number>;
type Band = { lo: number; hi: number };
type Cells = (Terrain | null)[];

const SHARE_TERRAINS = Object.keys(MAP.shares) as ShareTerrain[];
// A share exactly on S3's ceiling must not lose a plot to float rounding.
const EPS = 1e-9;

/** Lays out a map's river, terrain shares and regions (spec RULE-2 stages 1-3). Pure: every choice comes from `rng`. */
export function layoutMap(players: number, rng: Rng): Layout {
  const sketch = placeRiver(players, rng);
  const budget = budgetTerrain(freeCells(sketch).length, rng);
  return growRegions(sketch, budget, rng);
}

/** Stage 1: the store at the centre and a bending river from the top row to the bottom row. */
export function placeRiver(players: number, rng: Rng): Sketch {
  const { width, height } = mapSize(players);
  const terrain: Cells = Array(width * height).fill(null);
  const midX = Math.floor(width / 2);
  const midY = Math.floor(height / 2);
  terrain[midY * width + midX] = 'store';

  // Transition y joins row y to row y + 1. The two beside the store's row never shift, so the river stays beside the store.
  const transitions = [...Array(height - 1).keys()].filter((y) => y !== midY - 1 && y !== midY);
  const shifts = new Set(rng.shuffle(transitions).slice(0, MAP.bends[sizeBand(players)] + rng.int(0, 1)));
  const lo = MAP.riverMargin;
  const hi = width - 1 - MAP.riverMargin;
  // A shift only goes a way that stays inside the margins, so clamping never swallows a bend.
  const shift = (col: number) => col + rng.pick([-1, 1].filter((d) => col + d >= lo && col + d <= hi));

  const cols: number[] = Array(height).fill(midX + rng.pick([-1, 1]));
  for (let y = midY - 1; y >= 0; y--) cols[y] = shifts.has(y) ? shift(cols[y + 1]!) : cols[y + 1]!;
  for (let y = midY + 1; y < height; y++) cols[y] = shifts.has(y - 1) ? shift(cols[y - 1]!) : cols[y - 1]!;

  for (let y = 0; y < height; y++) terrain[y * width + cols[y]!] = 'river';
  for (let y = 0; y + 1 < height; y++) {
    if (cols[y] === cols[y + 1]) continue;
    const join = (y + 1) * width + cols[y]!;
    if (terrain[join] === 'store') terrain[y * width + cols[y + 1]!] = 'river';
    else terrain[join] = 'river';
  }
  return { width, height, terrain };
}

/** Stage 2: how many plots of the free land each terrain gets; the counts sum to `freeLand`. */
export function budgetTerrain(freeLand: number, rng: Rng): Budget {
  const bands = shareBands(freeLand);
  const shares = SHARE_TERRAINS.map((t) => Math.min(MAP.layout.shareCap, MAP.shares[t] * (1 + MAP.jitter * (2 * rng.next() - 1))));
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

/** Stage 3: fills the sketch's free plots with regions of the budgeted terrains, keeping each terrain in its share band. */
export function growRegions(sketch: Sketch, budget: Budget, rng: Rng): Layout {
  const grid = new Grid(sketch);
  const cap = regionCap(grid.free.length);
  const regions = splitBudget(budget, cap);
  const owner: number[] = Array(sketch.terrain.length).fill(-1);
  seedRegions(grid, regions, owner, rng);
  growTogether(grid, regions, owner, rng);
  for (let round = 0; round < MAP.layout.refillRounds && plantPockets(grid, regions, owner, budget, cap, rng); round++) {
    growTogether(grid, regions, owner, rng);
  }
  joinLeftovers(grid, regions, owner, cap, rng);

  const terrain: Cells = [...sketch.terrain];
  for (const i of grid.free) terrain[i] = owner[i]! >= 0 ? regions[owner[i]!]!.terrain : null;
  // Only a stretch of land no seed reached is still empty; it goes to the terrain furthest under budget.
  for (const i of grid.free) if (terrain[i] === null) terrain[i] = mostShort(grid, terrain, budget);
  repair({ grid, terrain, budget, bands: shareBands(grid.free.length), cap }, rng);
  return { width: sketch.width, height: sketch.height, terrain: terrain.map((t) => t ?? 'plains') };
}

interface Region {
  terrain: ShareTerrain;
  quota: number;
  cells: number[];
}

/** Free plots of a sketch and their free neighbours: the only plots the regions stage touches. */
class Grid {
  readonly width: number;
  readonly free: number[];
  readonly next: number[][];

  constructor(sketch: Sketch) {
    const { width, height } = sketch;
    const isFree = sketch.terrain.map((t) => t === null);
    this.width = width;
    this.free = freeCells(sketch);
    this.next = sketch.terrain.map((_, i) => {
      const x = i % width;
      const y = Math.floor(i / width);
      const around = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
      return around.filter((j) => j >= 0 && isFree[j]);
    });
  }

  steps(a: number, b: number): number {
    return Math.abs((a % this.width) - (b % this.width)) + Math.abs(Math.floor(a / this.width) - Math.floor(b / this.width));
  }
}

function freeCells(sketch: Sketch): number[] {
  return sketch.terrain.flatMap((t, i) => (t === null ? [i] : []));
}

function clamp(n: number, band: Band): number {
  return Math.max(band.lo, Math.min(band.hi, n));
}

function zeroBudget(): Budget {
  return Object.fromEntries(SHARE_TERRAINS.map((t) => [t, 0])) as Budget;
}

/** The plot counts S1-S3 allow each terrain on this much free land, never under one whole region. */
function shareBands(freeLand: number): Record<ShareTerrain, Band> {
  // Below S3's ceiling by MAP.layout.shareCap, and never under a whole region, whatever the shares become.
  const top = Math.floor(Math.min(MAP.layout.shareCap, MAP.maxTerrainShare) * freeLand + EPS);
  return Object.fromEntries(
    SHARE_TERRAINS.map((t) => {
      const band = shareBand(t, freeLand);
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

/** True when plot `i` touches another region of `r`'s terrain: taking it would merge the two into one. */
function touchesTwin(grid: Grid, regions: Region[], owner: number[], i: number, r: number): boolean {
  return grid.next[i]!.some((j) => owner[j]! >= 0 && owner[j] !== r && regions[owner[j]!]!.terrain === regions[r]!.terrain);
}

function own(regions: Region[], owner: number[], r: number, i: number): void {
  owner[i] = r;
  regions[r]!.cells.push(i);
}

/** One seed per region, as far as it can be from its own terrain's seeds without crowding any other seed. */
function seedRegions(grid: Grid, regions: Region[], owner: number[], rng: Rng): void {
  const { twinSpacing, seedSpacing } = MAP.layout;
  const toAny: number[] = Array(owner.length).fill(seedSpacing);
  const toTwin = new Map<ShareTerrain, number[]>();
  for (const r of rng.shuffle([...regions.keys()])) {
    const terrain = regions[r]!.terrain;
    const twin = toTwin.get(terrain) ?? Array(owner.length).fill(twinSpacing);
    let best = -1;
    let bestScore = -Infinity;
    for (const i of grid.free) {
      if (owner[i]! >= 0 || touchesTwin(grid, regions, owner, i, r)) continue;
      // Spacing from every seed counts double: a crowded seed is the one that ends up boxed in.
      const score = twin[i]! + 2 * toAny[i]! + rng.next();
      if (score > bestScore) [best, bestScore] = [i, score];
    }
    if (best < 0) continue;
    own(regions, owner, r, best);
    for (const i of grid.free) {
      toAny[i] = Math.min(toAny[i]!, grid.steps(best, i));
      twin[i] = Math.min(twin[i]!, grid.steps(best, i));
    }
    toTwin.set(terrain, twin);
  }
}

/** Grows every region with quota left a free neighbour at a time, weighted by quota left, preferring plots that keep it compact. */
function growTogether(grid: Grid, regions: Region[], owner: number[], rng: Rng): void {
  let growing = [...regions.keys()].filter((r) => regions[r]!.cells.length > 0 && regions[r]!.cells.length < regions[r]!.quota);
  for (let pass = 0; pass < grid.free.length * MAP.layout.growPasses && growing.length > 0; pass++) {
    const r = growing[rng.weighted(growing.map((g) => regions[g]!.quota - regions[g]!.cells.length))]!;
    const region = regions[r]!;
    const frontier = [...new Set(region.cells.flatMap((c) => grid.next[c]!))].filter(
      (i) => owner[i] === -1 && !touchesTwin(grid, regions, owner, i, r),
    );
    if (frontier.length > 0) {
      const compactness = frontier.map((i) => grid.next[i]!.filter((j) => owner[j] === r).length ** 2);
      own(regions, owner, r, frontier[rng.weighted(compactness)]!);
    }
    if (frontier.length === 0 || region.cells.length >= region.quota) growing = growing.filter((g) => g !== r);
  }
}

/**
 * Regions boxed in before their quota leave free pockets elsewhere; each
 * pocket big enough for a region gets a new one of the terrain furthest under
 * its budget, so the budget is met where the land is. Returns whether it planted any.
 */
function plantPockets(grid: Grid, regions: Region[], owner: number[], budget: Budget, cap: number, rng: Rng): boolean {
  const planned = zeroBudget();
  for (const r of regions) planned[r.terrain] += r.cells.length;
  let planted = false;
  for (const pocket of rng.shuffle(pocketsOf(grid, owner))) {
    if (pocket.length < MAP.minRegion) continue;
    const short = (t: ShareTerrain) => budget[t] - planned[t];
    for (const terrain of rng.shuffle(SHARE_TERRAINS).sort((a, b) => short(b) - short(a))) {
      if (short(terrain) <= 0) break;
      const r = regions.length;
      regions.push({ terrain, quota: Math.min(pocket.length, cap, Math.max(MAP.minRegion, short(terrain))), cells: [] });
      const open = pocket.filter((i) => !touchesTwin(grid, regions, owner, i, r));
      if (open.length === 0) {
        regions.pop();
        continue;
      }
      own(regions, owner, r, open[rng.weighted(open.map((i) => 1 + grid.next[i]!.filter((j) => owner[j] === -1).length ** 2))]!);
      planned[terrain] += regions[r]!.quota;
      planted = true;
      break;
    }
  }
  return planted;
}

/** Connected groups of free plots no region owns. */
function pocketsOf(grid: Grid, owner: number[]): number[][] {
  return groups(grid, (i) => owner[i] === -1, () => true);
}

/** Plots no region reached join their smallest neighbouring region, one under the cap that merges with no twin where there is one. */
function joinLeftovers(grid: Grid, regions: Region[], owner: number[], cap: number, rng: Rng): void {
  for (let pass = 0; pass < MAP.layout.leftoverPasses; pass++) {
    const left = rng.shuffle(grid.free.filter((i) => owner[i] === -1));
    if (left.length === 0) return;
    for (const i of left) {
      const around = [...new Set(grid.next[i]!.map((j) => owner[j]!).filter((r) => r >= 0))];
      if (around.length === 0) continue;
      const fits = around.filter((r) => regions[r]!.cells.length < cap && !touchesTwin(grid, regions, owner, i, r));
      const from = fits.length > 0 ? fits : around;
      own(regions, owner, from.reduce((a, b) => (regions[b]!.cells.length < regions[a]!.cells.length ? b : a)), i);
    }
  }
}

function countTerrains(grid: Grid, terrain: Cells): Budget {
  const have = zeroBudget();
  for (const i of grid.free) {
    const t = terrain[i];
    if (t) have[t as ShareTerrain]++;
  }
  return have;
}

function mostShort(grid: Grid, terrain: Cells, budget: Budget): ShareTerrain {
  const have = countTerrains(grid, terrain);
  return SHARE_TERRAINS.reduce((a, b) => (budget[b] - have[b] > budget[a] - have[a] ? b : a));
}

/** Connected groups of free plots that pass `member`, joined where `joins` says two neighbours belong together. */
function groups(grid: Grid, member: (i: number) => boolean, joins: (a: number, b: number) => boolean): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const start of grid.free) {
    if (seen.has(start) || !member(start)) continue;
    const group = [start];
    seen.add(start);
    for (let k = 0; k < group.length; k++) {
      for (const j of grid.next[group[k]!]!) {
        if (seen.has(j) || !member(j) || !joins(group[k]!, j)) continue;
        seen.add(j);
        group.push(j);
      }
    }
    out.push(group);
  }
  return out;
}

/** Connected same-terrain patches: what S4 and S5 measure, whichever regions they grew from. */
function patchesOf(grid: Grid, terrain: Cells): number[][] {
  return groups(grid, () => true, (a, b) => terrain[a] === terrain[b]);
}

interface RepairState {
  grid: Grid;
  terrain: Cells;
  budget: Budget;
  bands: Record<ShareTerrain, Band>;
  cap: number;
}

interface Move {
  cells: number[];
  to: ShareTerrain;
}

/**
 * `bad` counts what S1-S5 would report, in plots: short of minRegion, over the
 * cap, outside a share band, and minRegion more for a terrain gone altogether.
 * Zero means the layout meets them. `drift` is how far the counts are from the budget.
 */
function measure(s: RepairState): { bad: number; drift: number } {
  const have = countTerrains(s.grid, s.terrain);
  let bad = 0;
  for (const p of patchesOf(s.grid, s.terrain)) bad += Math.max(0, MAP.minRegion - p.length) + Math.max(0, p.length - s.cap);
  let drift = 0;
  for (const t of SHARE_TERRAINS) {
    bad += Math.max(0, s.bands[t].lo - have[t]) + Math.max(0, have[t] - s.bands[t].hi) + (have[t] === 0 ? MAP.minRegion : 0);
    drift += Math.abs(have[t] - s.budget[t]);
  }
  return { bad, drift };
}

/**
 * Bounded local repair. Each move recolours one plot, or a whole speck, to a
 * neighbouring terrain: so a speck grows from a neighbour or takes its
 * neighbours' terrain, a blob sheds edge plots, and a terrain outside its band
 * trades edge plots. The best measured move is kept; when no single move helps,
 * the best helping pair; failing that, a few moves that are no worse.
 */
function repair(s: RepairState, rng: Rng): void {
  let current = measure(s).bad;
  let sideways = 0;
  for (let move = 0; move < MAP.layout.repairMoves && current > 0; move++) {
    const single = bestMoves(s);
    if (single.bad < current) {
      apply(s.terrain, rng.pick(single.moves));
      current = single.bad;
      continue;
    }
    const pair = bestPair(s, current, rng);
    if (pair) {
      for (const m of rng.pick(pair.moves)) apply(s.terrain, m);
      current = pair.bad;
      continue;
    }
    if (single.bad > current || single.moves.length === 0 || ++sideways > MAP.layout.sidewaysMoves) return;
    apply(s.terrain, rng.pick(single.moves));
  }
}

/** Applies the move and returns what it overwrote, for `undo`. */
function apply(terrain: Cells, move: Move): Cells {
  const before = move.cells.map((i) => terrain[i]!);
  for (const i of move.cells) terrain[i] = move.to;
  return before;
}

function undo(terrain: Cells, move: Move, before: Cells): void {
  move.cells.forEach((i, k) => (terrain[i] = before[k]!));
}

/** The candidate moves that leave the layout least bad, ties broken by least drift from the budget. */
function bestMoves(s: RepairState): { moves: Move[]; bad: number } {
  let moves: Move[] = [];
  let bad = Infinity;
  let drift = Infinity;
  for (const m of candidateMoves(s)) {
    const before = apply(s.terrain, m);
    const after = measure(s);
    undo(s.terrain, m, before);
    if (after.bad < bad || (after.bad === bad && after.drift < drift)) [moves, bad, drift] = [[m], after.bad, after.drift];
    else if (after.bad === bad && after.drift === drift) moves.push(m);
  }
  return { moves, bad };
}

/**
 * Two moves that together beat `current` when no single move does: a step back
 * that opens a bigger step forward. The first may also carve a fresh region for
 * a terrain whose only patch is a speck that can't grow where it is.
 */
function bestPair(s: RepairState, current: number, rng: Rng): { moves: Move[][]; bad: number } | null {
  let pairs: Move[][] = [];
  let bad = current;
  for (const first of [...candidateMoves(s), ...carveMoves(s, rng)]) {
    const before = apply(s.terrain, first);
    const second = bestMoves(s);
    undo(s.terrain, first, before);
    if (second.bad < bad) [pairs, bad] = [second.moves.map((m) => [first, m]), second.bad];
    else if (second.bad === bad && pairs.length > 0) pairs.push(...second.moves.map((m) => [first, m]));
  }
  return pairs.length > 0 ? { moves: pairs, bad } : null;
}

/** For each speck's terrain and each terrain under its band: minRegion plots carved off the edge of a patch big enough to spare them. */
function carveMoves(s: RepairState, rng: Rng): Move[] {
  const { grid, terrain, bands } = s;
  const have = countTerrains(grid, terrain);
  const patches = patchesOf(grid, terrain);
  const wanted = new Set<ShareTerrain>(SHARE_TERRAINS.filter((t) => have[t] < bands[t].lo));
  for (const p of patches) if (p.length < MAP.minRegion) wanted.add(terrain[p[0]!] as ShareTerrain);
  const moves: Move[] = [];
  for (const p of patches) {
    if (p.length < 2 * MAP.minRegion) continue;
    const inPatch = new Set(p);
    const edge = p.filter((i) => grid.next[i]!.some((j) => !inPatch.has(j)));
    for (const start of rng.shuffle(edge).slice(0, MAP.layout.carveStarts)) {
      const cells = [start];
      for (let k = 0; k < cells.length && cells.length < MAP.minRegion; k++) {
        for (const j of grid.next[cells[k]!]!) if (inPatch.has(j) && !cells.includes(j) && cells.length < MAP.minRegion) cells.push(j);
      }
      for (const to of wanted) if (to !== terrain[start]) moves.push({ cells, to });
    }
  }
  return moves;
}

/** Moves near what is wrong: plots in or beside a speck or blob, and the edges of a terrain outside its band. */
function candidateMoves(s: RepairState): Move[] {
  const { grid, terrain, bands, cap } = s;
  const have = countTerrains(grid, terrain);
  const hot = new Set<number>();
  const specks: number[][] = [];
  for (const p of patchesOf(grid, terrain)) {
    if (p.length < MAP.minRegion) specks.push(p);
    if (p.length < MAP.minRegion || p.length > cap) for (const i of p) hot.add(i);
  }
  const offBand = new Set(SHARE_TERRAINS.filter((t) => have[t] < bands[t].lo || have[t] > bands[t].hi));
  for (const i of grid.free) if (offBand.has(terrain[i] as ShareTerrain) && grid.next[i]!.some((j) => terrain[j] !== terrain[i])) hot.add(i);
  for (const i of [...hot]) for (const j of grid.next[i]!) hot.add(j);

  const toward = (cells: number[]) => {
    const from = terrain[cells[0]!];
    return [...new Set(cells.flatMap((i) => grid.next[i]!.map((j) => terrain[j] as ShareTerrain)))].filter((t) => t !== from);
  };
  const moves: Move[] = [];
  for (const i of hot) for (const to of toward([i])) moves.push({ cells: [i], to });
  for (const speck of specks) if (speck.length > 1) for (const to of toward(speck)) moves.push({ cells: speck, to });
  return moves;
}
