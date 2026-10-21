import { MAP, type ShareTerrain } from './config.js';
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
  readonly free: number[];
  readonly next: number[][];
  /** Every plot but the store: what AM-4 covers. */
  readonly land: number[];
  /** For a free plot, the land plots within Smithore reach of it; empty for other plots. */
  readonly within: number[][];
  private readonly mark: number[];
  private stamp = 0;

  constructor(width: number, terrain: Cells, reach: number) {
    const height = terrain.length / width;
    const isFree = terrain.map((t) => t === null);
    this.width = width;
    this.free = terrain.flatMap((t, i) => (t === null ? [i] : []));
    this.land = terrain.flatMap((t, i) => (t === 'store' ? [] : [i]));
    this.next = terrain.map((_, i) => {
      const x = i % width;
      const y = Math.floor(i / width);
      const around = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
      return around.filter((j) => j >= 0 && isFree[j]);
    });
    this.within = terrain.map((_, i) => (isFree[i] ? this.land.filter((l) => this.steps(i, l) <= reach) : []));
    this.mark = Array(terrain.length).fill(0);
  }

  steps(a: number, b: number): number {
    return Math.abs((a % this.width) - (b % this.width)) + Math.abs(Math.floor(a / this.width) - Math.floor(b / this.width));
  }

  /** Land plots with no mining plot within Smithore reach. */
  uncovered(terrain: Cells): number[] {
    this.stamp++;
    for (const i of this.free) {
      if (!isMining(terrain[i])) continue;
      for (const l of this.within[i]!) this.mark[l] = this.stamp;
    }
    return this.land.filter((l) => this.mark[l] !== this.stamp);
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

/** Connected same-terrain patches: what S4 and S5 measure, whichever regions they grew from. */
function patchesOf(grid: Grid, terrain: Cells): number[][] {
  return groups(grid, () => true, (a, b) => terrain[a] === terrain[b]);
}

export interface RepairState {
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
export function repairLayout(s: RepairState, rng: Rng): void {
  const { repairMoves, sidewaysMoves, worseMoves, tabu } = MAP.layout;
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
      if (fresh.bad === current ? ++sideways > sidewaysMoves : ++worse > worseMoves) break;
      chosen = [rng.pick(fresh.moves)];
    }
    for (const m of chosen) {
      apply(s.terrain, m);
      recent.push(...m.cells);
    }
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
 * Pass `uncovered` when the move left the mining plots as they were.
 */
function measure(s: RepairState, uncovered?: number): Score {
  const have = countTerrains(s.grid, s.terrain);
  let bad = uncovered ?? s.grid.uncovered(s.terrain).length;
  for (const p of patchesOf(s.grid, s.terrain)) bad += Math.max(0, MAP.minRegion - p.length) + Math.max(0, p.length - s.cap);
  let drift = 0;
  for (const t of SHARE_TERRAINS) {
    const { lo, hi } = s.bands[t];
    bad += Math.max(0, lo - have[t]) + Math.max(0, have[t] - hi) + (have[t] === 0 ? MAP.minRegion : 0);
    drift += Math.abs(have[t] - s.budget[t]);
  }
  return { bad, drift };
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

/** The moves that leave the layout least bad, ties broken by least drift from the budget. */
function bestMoves(s: RepairState, candidates: Move[]): { moves: Move[]; bad: number } {
  const coverage = s.grid.uncovered(s.terrain).length;
  let moves: Move[] = [];
  let bad = Infinity;
  let drift = Infinity;
  for (const m of candidates) {
    const touchesMining = isMining(m.to) || m.cells.some((i) => isMining(s.terrain[i]));
    const before = apply(s.terrain, m);
    const after = measure(s, touchesMining ? undefined : coverage);
    undo(s.terrain, m, before);
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
function bestRun(s: RepairState, current: number, rng: Rng, work: { evaluations: number }): Move[] | null {
  const { lookahead, beamWidth } = MAP.layout;
  let beam: Move[][] = [[]];
  for (let depth = 1; depth <= lookahead; depth++) {
    const next: { run: Move[]; score: Score }[] = [];
    for (const run of beam) {
      const befores = run.map((m) => apply(s.terrain, m));
      for (const m of [...candidateMoves(s, rng), ...carveMoves(s, rng, specksAndShortfalls(s))]) {
        if (work.evaluations-- <= 0) break;
        const before = apply(s.terrain, m);
        next.push({ run: [...run, m], score: measure(s) });
        undo(s.terrain, m, before);
      }
      for (let k = run.length - 1; k >= 0; k--) undo(s.terrain, run[k]!, befores[k]!);
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
function specksAndShortfalls(s: RepairState): Set<ShareTerrain> {
  const have = countTerrains(s.grid, s.terrain);
  const wanted = new Set<ShareTerrain>(SHARE_TERRAINS.filter((t) => have[t] < s.bands[t].lo));
  for (const p of patchesOf(s.grid, s.terrain)) if (p.length < MAP.minRegion) wanted.add(s.terrain[p[0]!] as ShareTerrain);
  return wanted;
}

/**
 * minRegion plots carved off the edge of each patch big enough to spare them,
 * recoloured to each wanted terrain. With `near`, only edges within Smithore
 * reach of one of those land plots are tried.
 */
function carveMoves(s: RepairState, rng: Rng, wanted: Set<ShareTerrain>, near?: Set<number>): Move[] {
  const { grid, terrain } = s;
  const moves: Move[] = [];
  if (wanted.size === 0) return moves;
  for (const p of patchesOf(grid, terrain)) {
    if (p.length < 2 * MAP.minRegion) continue;
    const inPatch = new Set(p);
    const edge = p.filter((i) => grid.next[i]!.some((j) => !inPatch.has(j)) && (!near || grid.within[i]!.some((l) => near.has(l))));
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
function candidateMoves(s: RepairState, rng: Rng): Move[] {
  const { grid, terrain, bands, cap } = s;
  const have = countTerrains(grid, terrain);
  const hot = new Set<number>();
  const specks: number[][] = [];
  for (const p of patchesOf(grid, terrain)) {
    if (p.length < MAP.minRegion) specks.push(p);
    if (p.length < MAP.minRegion || p.length > cap) for (const i of p) hot.add(i);
  }
  const offBand = new Set(SHARE_TERRAINS.filter((t) => have[t] < bands[t].lo || have[t] > bands[t].hi));
  for (const i of grid.free) {
    if (offBand.has(terrain[i] as ShareTerrain) && grid.next[i]!.some((j) => terrain[j] !== terrain[i])) hot.add(i);
  }
  for (const i of [...hot]) for (const j of grid.next[i]!) hot.add(j);

  const toward = (cells: number[]) => {
    const from = terrain[cells[0]!];
    return [...new Set(cells.flatMap((i) => grid.next[i]!.map((j) => terrain[j] as ShareTerrain)))].filter((t) => t !== from);
  };
  const moves: Move[] = [];
  for (const i of hot) for (const to of toward([i])) moves.push({ cells: [i], to });
  for (const speck of specks) if (speck.length > 1) for (const to of toward(speck)) moves.push({ cells: speck, to });

  const uncovered = new Set(grid.uncovered(terrain));
  if (uncovered.size > 0) {
    for (const i of grid.free) {
      if (isMining(terrain[i]) || !grid.within[i]!.some((l) => uncovered.has(l))) continue;
      for (const to of toward([i]).filter(isMining)) moves.push({ cells: [i], to });
    }
    moves.push(...carveMoves(s, rng, new Set(MINING), uncovered).filter((m) => !isMining(terrain[m.cells[0]!])));
  }
  return moves;
}
