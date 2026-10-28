import { MAP, type ShareTerrain } from './config.js';
import { reachTable, type ReachTable } from './grid.js';
import type { Rng } from './rng.js';
import type { Terrain } from './types.js';

/**
 * The regions stage's repair (spec RULE-2 row 3, AM-5): a bounded local search
 * that scores a layout by what S1-S5 and AM-4 would report, and recolours plots
 * until that score is zero or its budgets run out.
 */

export type Cells = (Terrain | null)[];
export type Budget = Record<ShareTerrain, number>;
export type Band = { lo: number; hi: number };

export const SHARE_TERRAINS = Object.keys(MAP.shares) as ShareTerrain[];

/** Terrains Smithore can be mined on: AM-4 wants one within Smithore reach of every land plot. */
export const MINING: readonly ShareTerrain[] = ['hills', 'mountains'];

export function isMining(t: Terrain | null | undefined): boolean {
  return t === 'hills' || t === 'mountains';
}

/** The sketch's free plots and their free neighbours, and which land plots each free plot reaches for AM-4. */
export class Grid {
  readonly width: number;
  private readonly col: number[];
  private readonly row: number[];
  readonly free: number[];
  readonly next: number[][];
  /** Every plot but the store: what AM-4 covers. */
  readonly land: number[];
  /** For every plot, the land plots within Smithore reach of it. */
  readonly reach: ReachTable;
  /** As `reach`, for a free plot; empty for other plots. */
  readonly within: ReachTable;

  constructor(width: number, terrain: Cells, reach: number) {
    const height = terrain.length / width;
    const isFree = terrain.map((t) => t === null);
    this.width = width;
    this.col = terrain.map((_, i) => i % width);
    this.row = terrain.map((_, i) => Math.floor(i / width));
    this.free = terrain.flatMap((t, i) => (t === null ? [i] : []));
    this.land = terrain.flatMap((t, i) => (t === 'store' ? [] : [i]));
    this.next = terrain.map((_, i) => {
      const x = i % width;
      const y = Math.floor(i / width);
      const around = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
      return around.filter((j) => j >= 0 && isFree[j]);
    });
    // Land is every plot but the one store, so the shared table for this size holds exactly these lists.
    this.reach = reachTable(width, height, terrain.indexOf('store'), reach);
    const none: readonly number[] = [];
    this.within = terrain.map((_, i) => (isFree[i] ? this.reach[i]! : none));
  }

  steps(a: number, b: number): number {
    return Math.abs(this.col[a]! - this.col[b]!) + Math.abs(this.row[a]! - this.row[b]!);
  }
}

export function zeroBudget(): Budget {
  return Object.fromEntries(SHARE_TERRAINS.map((t) => [t, 0])) as Budget;
}

export function countTerrains(grid: Grid, terrain: Cells): Budget {
  const have = zeroBudget();
  for (const i of grid.free) {
    const t = terrain[i];
    if (t) have[t as ShareTerrain]++;
  }
  return have;
}

/** Connected groups of free plots that pass `member`, joined where `joins` says two neighbours belong together. */
export function groups(grid: Grid, member: (i: number) => boolean, joins: (a: number, b: number) => boolean): number[][] {
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

export interface RepairState {
  grid: Grid;
  terrain: Cells;
  budget: Budget;
  bands: Record<ShareTerrain, Band>;
  cap: number;
}

/** A repair under way: the state, and the tally that every recolouring goes through. */
interface Repairing extends RepairState {
  tally: Tally;
}

const CODE = new Map<Terrain | null, number>(SHARE_TERRAINS.map((t, k) => [t, k]));
const MINING_CODE = SHARE_TERRAINS.map(isMining);

/**
 * What `measure` reads, kept current as plots are recoloured instead of recounted
 * per candidate move: each terrain's count, how many mining plots reach each land
 * plot, and the patches of the settled layout, so a move's patch penalty is worked
 * out only around the plots that differ from it.
 */
class Tally {
  readonly have: Int32Array;
  uncovered = 0;
  private readonly code: Int8Array;
  private readonly reached: Int32Array;
  private readonly seen: Int32Array;
  private readonly queue: Int32Array;
  private stamp = 0;
  /** The settled layout: each plot's terrain code and patch, each patch's size, and the penalty they come to. */
  private readonly settledCode: Int8Array;
  private readonly patchOf: Int32Array;
  private readonly patchSize: Int32Array;
  private readonly patchCounted: Int32Array;
  private settledPenalty = 0;
  /** Plots set since the layout settled; some may be back at their settled terrain. */
  private readonly changed: number[] = [];
  private readonly listed: Uint8Array;
  private version = 0;
  private patchList: { version: number; patches: number[][] } = { version: -1, patches: [] };

  constructor(private readonly s: RepairState) {
    const size = s.terrain.length;
    this.have = new Int32Array(SHARE_TERRAINS.length);
    this.code = new Int8Array(size).fill(-1);
    this.reached = new Int32Array(size);
    this.seen = new Int32Array(size);
    this.queue = new Int32Array(size);
    this.settledCode = new Int8Array(size);
    this.patchOf = new Int32Array(size);
    this.patchSize = new Int32Array(size);
    this.patchCounted = new Int32Array(size);
    this.listed = new Uint8Array(size);
    for (const i of s.grid.free) {
      const k = CODE.get(s.terrain[i]!)!;
      this.code[i] = k;
      this.have[k]!++;
      if (MINING_CODE[k]) for (const l of s.grid.within[i]!) this.reached[l]!++;
    }
    for (const l of s.grid.land) if (this.reached[l] === 0) this.uncovered++;
    this.settle();
  }

  set(i: number, t: Terrain | null): void {
    const from = this.code[i]!;
    const to = CODE.get(t)!;
    this.s.terrain[i] = t;
    if (from === to) return;
    this.code[i] = to;
    this.version++;
    if (!this.listed[i]) {
      this.listed[i] = 1;
      this.changed.push(i);
    }
    this.have[from]!--;
    this.have[to]!++;
    if (MINING_CODE[from] === MINING_CODE[to]) return;
    if (MINING_CODE[to]) {
      for (const l of this.s.grid.within[i]!) if (this.reached[l]!++ === 0) this.uncovered--;
    } else {
      for (const l of this.s.grid.within[i]!) if (--this.reached[l]! === 0) this.uncovered++;
    }
  }

  /** Whether no mining plot has land plot `l` within Smithore reach. */
  isUncovered(l: number): boolean {
    return this.reached[l] === 0;
  }

  /**
   * Connected same-terrain patches: what S4 and S5 measure, whichever regions they grew from.
   * In the free plots' order, each filled breadth-first. Shared until the layout changes, so read-only.
   */
  patches(): readonly number[][] {
    if (this.patchList.version !== this.version) {
      const stamp = ++this.stamp;
      const patches: number[][] = [];
      for (const start of this.s.grid.free) {
        if (this.seen[start] !== stamp) patches.push(Array.from(this.queue.subarray(0, this.flood(start, stamp))));
      }
      this.patchList = { version: this.version, patches };
    }
    return this.patchList.patches;
  }

  /** Takes the current layout as the settled one that later penalties are worked out from. */
  settle(): void {
    const stamp = ++this.stamp;
    let patches = 0;
    this.settledPenalty = 0;
    for (const start of this.s.grid.free) {
      if (this.seen[start] === stamp) continue;
      const size = this.flood(start, stamp);
      for (let q = 0; q < size; q++) this.patchOf[this.queue[q]!] = patches;
      this.patchSize[patches++] = size;
      this.settledPenalty += this.penalty(size);
    }
    this.settledCode.set(this.code);
    for (const i of this.changed) this.listed[i] = 0;
    this.changed.length = 0;
  }

  /**
   * S4 and S5's share of `bad`: each same-terrain patch's plots short of minRegion or over the cap.
   * Only patches holding or touching a plot that differs from the settled layout can differ from
   * the settled patches, so those are swapped out of the settled penalty and the rest is left as it was.
   */
  patchPenalty(): number {
    const { code, settledCode, changed, listed } = this;
    let kept = 0;
    for (const i of changed) {
      if (code[i] === settledCode[i]) listed[i] = 0;
      else changed[kept++] = i;
    }
    changed.length = kept;
    if (kept === 0) return this.settledPenalty;
    const stamp = ++this.stamp;
    let penalty = this.settledPenalty;
    const swap = (a: number) => {
      const patch = this.patchOf[a]!;
      if (this.patchCounted[patch] !== stamp) {
        this.patchCounted[patch] = stamp;
        penalty -= this.penalty(this.patchSize[patch]!);
      }
      if (this.seen[a] !== stamp) penalty += this.penalty(this.flood(a, stamp));
    };
    for (const i of changed) {
      swap(i);
      for (const j of this.s.grid.next[i]!) swap(j);
    }
    return penalty;
  }

  private penalty(size: number): number {
    return Math.max(0, MAP.minRegion - size) + Math.max(0, size - this.s.cap);
  }

  /** Marks the current patch holding `start` with `stamp`, leaving its plots at the head of `queue`; returns its size. */
  private flood(start: number, stamp: number): number {
    const { code, seen, queue } = this;
    const { next } = this.s.grid;
    const k = code[start];
    seen[start] = stamp;
    queue[0] = start;
    let size = 1;
    for (let q = 0; q < size; q++) {
      for (const j of next[queue[q]!]!) {
        if (seen[j] === stamp || code[j] !== k) continue;
        seen[j] = stamp;
        queue[size++] = j;
      }
    }
    return size;
  }
}

interface Move {
  cells: number[];
  to: ShareTerrain;
}

interface Score {
  bad: number;
  drift: number;
}

/**
 * Repairs the layout in place, within MAP.layout's budgets. Each move recolours
 * one plot, a whole speck, or a carved patch: a speck grows from a neighbour or
 * takes its neighbours' terrain, a blob sheds edge plots, a terrain outside its
 * band trades edge plots, and mining terrain stretches or is carved towards an
 * uncovered plot. The best measured move is kept; when no single move helps,
 * the best short run that helps; failing that, a few no-worse and then worse
 * moves off plots not touched lately. The best layout seen is what is left.
 */
export function repairLayout(state: RepairState, rng: Rng): void {
  const { repairMoves, sidewaysMoves, worseMoves, tabu } = MAP.layout;
  const s: Repairing = { ...state, tally: new Tally(state) };
  let current = measure(s).bad;
  let best = { bad: current, terrain: [...s.terrain] };
  const work = { evaluations: MAP.layout.lookaheadEvaluations };
  const recent: number[] = [];
  let sideways = 0;
  let worse = 0;
  for (let move = 0; move < repairMoves && current > 0; move++) {
    const single = bestMoves(s, candidateMoves(s, rng));
    let chosen = single.bad < current ? [rng.pick(single.moves)] : bestRun(s, current, rng, work);
    if (!chosen) {
      // Off a dead end: allow moves no better, then worse, on plots no recent move touched, so it can't undo itself.
      const fresh = bestMoves(s, candidateMoves(s, rng).filter((m) => m.cells.every((i) => !recent.includes(i))));
      if (fresh.moves.length === 0) break;
      // The fresh draw of candidates can hold a move that helps after all; that spends neither budget.
      if (fresh.bad === current && ++sideways > sidewaysMoves) break;
      if (fresh.bad > current && ++worse > worseMoves) break;
      chosen = [rng.pick(fresh.moves)];
    }
    for (const m of chosen) {
      apply(s, m);
      recent.push(...m.cells);
    }
    s.tally.settle();
    recent.splice(0, Math.max(0, recent.length - tabu));
    current = measure(s).bad;
    if (current < best.bad) best = { bad: current, terrain: [...s.terrain] };
  }
  if (current > best.bad) best.terrain.forEach((t, i) => (s.terrain[i] = t));
}

/**
 * `bad` counts what S1-S5 and AM-4 would report, in plots: short of minRegion,
 * over the cap, outside a share band, minRegion more for a terrain gone
 * altogether, and land plots with no mining terrain in reach. Zero means the
 * layout meets them all. `drift` is how far the counts are from the budget.
 */
function measure(s: Repairing): Score {
  const { have } = s.tally;
  let bad = s.tally.uncovered + s.tally.patchPenalty();
  let drift = 0;
  SHARE_TERRAINS.forEach((t, k) => {
    const { lo, hi } = s.bands[t];
    bad += Math.max(0, lo - have[k]!) + Math.max(0, have[k]! - hi) + (have[k] === 0 ? MAP.minRegion : 0);
    drift += Math.abs(have[k]! - s.budget[t]);
  });
  return { bad, drift };
}

/** Applies the move and returns what it overwrote, for `undo`. */
function apply(s: Repairing, move: Move): Cells {
  const before = move.cells.map((i) => s.terrain[i]!);
  for (const i of move.cells) s.tally.set(i, move.to);
  return before;
}

function undo(s: Repairing, move: Move, before: Cells): void {
  move.cells.forEach((i, k) => s.tally.set(i, before[k]!));
}

/** The moves that leave the layout least bad, ties broken by least drift from the budget. */
function bestMoves(s: Repairing, candidates: Move[]): { moves: Move[]; bad: number } {
  let moves: Move[] = [];
  let bad = Infinity;
  let drift = Infinity;
  for (const m of candidates) {
    const before = apply(s, m);
    const after = measure(s);
    undo(s, m, before);
    if (after.bad < bad || (after.bad === bad && after.drift < drift)) [moves, bad, drift] = [[m], after.bad, after.drift];
    else if (after.bad === bad && after.drift === drift) moves.push(m);
  }
  return { moves, bad };
}

/**
 * A short run of moves that together beat `current` when no single move does:
 * steps back that open a bigger step forward. A beam search: each level extends
 * the least-bad runs so far by one move, up to MAP.layout.lookahead moves deep.
 * Spends from `work`, and gives up when it runs out.
 */
function bestRun(s: Repairing, current: number, rng: Rng, work: { evaluations: number }): Move[] | null {
  const { lookahead, beamWidth } = MAP.layout;
  let beam: Move[][] = [[]];
  for (let depth = 1; depth <= lookahead; depth++) {
    const next: { run: Move[]; score: Score }[] = [];
    for (const run of beam) {
      const befores = run.map((m) => apply(s, m));
      for (const m of [...candidateMoves(s, rng), ...carveMoves(s, rng, specksAndShortfalls(s))]) {
        if (work.evaluations-- <= 0) break;
        const before = apply(s, m);
        next.push({ run: [...run, m], score: measure(s) });
        undo(s, m, before);
      }
      for (let k = run.length - 1; k >= 0; k--) undo(s, run[k]!, befores[k]!);
    }
    if (next.length === 0) return null;
    // Shuffled first, so the stable sort breaks ties by rng.
    const ranked = rng.shuffle(next).sort((a, b) => a.score.bad - b.score.bad || a.score.drift - b.score.drift);
    if (ranked[0]!.score.bad < current) return ranked[0]!.run;
    beam = ranked.slice(0, beamWidth).map((r) => r.run);
  }
  return null;
}

/** Terrains that need plots somewhere new: each speck's terrain and each terrain under its band. */
function specksAndShortfalls(s: Repairing): Set<ShareTerrain> {
  const { have } = s.tally;
  const wanted = new Set<ShareTerrain>(SHARE_TERRAINS.filter((t, k) => have[k]! < s.bands[t].lo));
  for (const p of s.tally.patches()) if (p.length < MAP.minRegion) wanted.add(s.terrain[p[0]!] as ShareTerrain);
  return wanted;
}

/**
 * minRegion plots carved off the edge of each patch big enough to spare them,
 * recoloured to each wanted terrain. With `near`, only edges within Smithore
 * reach of a land plot it accepts are tried.
 */
function carveMoves(s: Repairing, rng: Rng, wanted: Set<ShareTerrain>, near?: (l: number) => boolean): Move[] {
  const { grid, terrain } = s;
  const moves: Move[] = [];
  if (wanted.size === 0) return moves;
  for (const p of s.tally.patches()) {
    if (p.length < MAP.layout.carveFrom * MAP.minRegion) continue;
    const inPatch = new Set(p);
    const edge = p.filter((i) => grid.next[i]!.some((j) => !inPatch.has(j)) && (!near || grid.within[i]!.some(near)));
    for (const start of rng.shuffle(edge).slice(0, MAP.layout.carveStarts)) {
      const cells = [start];
      for (let k = 0; k < cells.length && cells.length < MAP.minRegion; k++) {
        for (const j of grid.next[cells[k]!]!) {
          if (inPatch.has(j) && !cells.includes(j) && cells.length < MAP.minRegion) cells.push(j);
        }
      }
      for (const to of wanted) if (to !== terrain[start]) moves.push({ cells, to });
    }
  }
  return moves;
}

/**
 * Moves near what is wrong: plots in or beside a speck or blob, the edges of a
 * terrain outside its band, and, while a land plot lacks mining terrain in
 * reach, mining patches' neighbours near it and mining patches carved near it.
 */
function candidateMoves(s: Repairing, rng: Rng): Move[] {
  const { grid, terrain, bands, cap, tally } = s;
  const hot = new Set<number>();
  const specks: number[][] = [];
  for (const p of tally.patches()) {
    if (p.length < MAP.minRegion) specks.push(p);
    if (p.length < MAP.minRegion || p.length > cap) for (const i of p) hot.add(i);
  }
  const offBand = new Set(SHARE_TERRAINS.filter((t, k) => tally.have[k]! < bands[t].lo || tally.have[k]! > bands[t].hi));
  for (const i of grid.free) {
    if (offBand.has(terrain[i] as ShareTerrain) && grid.next[i]!.some((j) => terrain[j] !== terrain[i])) hot.add(i);
  }
  for (const i of [...hot]) for (const j of grid.next[i]!) hot.add(j);

  // The terrains around the cells other than their own, each once, in the order the neighbours name them.
  const toward = (cells: readonly number[]) => {
    const from = terrain[cells[0]!];
    const out: ShareTerrain[] = [];
    for (const i of cells) {
      for (const j of grid.next[i]!) {
        const t = terrain[j] as ShareTerrain;
        if (t !== from && !out.includes(t)) out.push(t);
      }
    }
    return out;
  };
  const moves: Move[] = [];
  for (const i of hot) for (const to of toward([i])) moves.push({ cells: [i], to });
  for (const speck of specks) if (speck.length > 1) for (const to of toward(speck)) moves.push({ cells: speck, to });

  if (tally.uncovered > 0) {
    const uncovered = (l: number) => tally.isUncovered(l);
    for (const i of grid.free) {
      if (isMining(terrain[i]) || !grid.within[i]!.some(uncovered)) continue;
      for (const to of toward([i]).filter(isMining)) moves.push({ cells: [i], to });
    }
    moves.push(...carveMoves(s, rng, new Set(MINING), uncovered).filter((m) => !isMining(terrain[m.cells[0]!])));
  }
  return moves;
}
