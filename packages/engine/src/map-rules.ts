import { MAP, sizeBand, type FloorGood, type ShareTerrain, type SizeBand } from './config.js';
import { neighbours, tileIndex } from './map.js';
import { RAW_GOODS, type RawGood, type SpecialKind, type Terrain, type Tile } from './types.js';

/**
 * The map rules as a checker: every rule a map breaks, and the numbers the map
 * gallery prints. S9 (honest hints) holds only over many maps, so the map-quality
 * test checks it.
 */

export type GameMap = { width: number; height: number; tiles: Tile[] };
type Mineral = 'crystite' | 'rareEarth';

export type RuleId = 'F1' | 'F2' | 'F3' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | 'S10' | 'P1';

/** Each rule's short title, for labelling violations. */
export const RULE_TITLES: Record<RuleId, string> = {
  F1: 'Floors',
  F2: 'One scarce good at most',
  F3: 'Reach',
  S1: 'All terrains',
  S2: 'Shares',
  S3: 'No dominant terrain',
  S4: 'No specks',
  S5: 'No blob',
  S6: 'River shape',
  S7: 'River bends',
  S8: 'Smithore seams',
  S10: 'Crystite and Rare earth rings',
  P1: 'Special fields',
};

export interface Violation {
  rule: RuleId;
  detail: string;
  /** The offending plots, where the rule has them. */
  at?: { x: number; y: number }[];
}

export interface MapReport {
  /** One entry per broken rule instance. */
  violations: Violation[];
  metrics: {
    /** Good plots per player. */
    perPlayer: Record<RawGood, number>;
    /** Share of non-river land for each land terrain; absent terrains are omitted. */
    shares: Partial<Record<ShareTerrain, number>>;
    biggestRegion: number;
    bends: number;
    /** Share of good Smithore plots touching another; 0 when there are none. */
    seamShare: number;
    peaks: Record<Mineral, number>;
    /** Most steps from any land plot to a good plot; width + height when the map has no good plot. */
    worstReach: Record<FloorGood, number>;
    /** The one good below its normal range, or null when none is (or several are). */
    scarce: RawGood | null;
    specials: number;
  };
}

const FLOOR_GOODS = Object.keys(MAP.floor) as FloorGood[];
const SHARE_TERRAINS = Object.keys(MAP.shares) as ShareTerrain[];
const MINERALS: Mineral[] = ['crystite', 'rareEarth'];

// Shares and tolerances are fractions; a value exactly on an edge must not fail on float rounding.
const EPS = 1e-9;

interface Facts {
  map: GameMap;
  players: number;
  band: SizeBand;
  land: Tile[];
  nonRiver: Tile[];
  good: Record<RawGood, Tile[]>;
  /** Steps from a plot to the nearest good plot. */
  reach: Record<FloorGood, Steps>;
  regions: Tile[][];
  /** River columns in each row, ascending. */
  riverRows: number[][];
  hasRiver: boolean;
  store: Tile | undefined;
  specials: Tile[];
}

type Steps = (tile: Tile) => number;

/** Checks a map against every map rule (spec RULE-1). Pure. */
export function checkMap(map: GameMap, players: number): MapReport {
  const facts = gatherFacts(map, players);
  const rows = [floors, oneScarce, reach, allTerrains, shares, noDominant, noSpecks, noBlob, riverShape, riverBends, seams, rings, specialFields];
  return { violations: rows.flatMap((row) => row(facts)), metrics: metrics(facts) };
}

function gatherFacts(map: GameMap, players: number): Facts {
  const land = map.tiles.filter((t) => t.terrain !== 'store');
  const nonRiver = land.filter((t) => t.terrain !== 'river');
  const good = Object.fromEntries(RAW_GOODS.map((g) => [g, land.filter((t) => t.ground[g] >= MAP.goodAt[g])])) as Record<RawGood, Tile[]>;
  const reachField = Object.fromEntries(FLOOR_GOODS.map((g) => [g, distances(map, good[g])])) as Record<FloorGood, Steps>;
  const riverRows: number[][] = Array.from({ length: map.height }, () => []);
  for (const t of land) if (t.terrain === 'river') riverRows[t.y]!.push(t.x);
  for (const row of riverRows) row.sort((a, b) => a - b);
  return {
    map,
    players,
    band: sizeBand(players),
    land,
    nonRiver,
    good,
    reach: reachField,
    regions: regionsOf(map, nonRiver),
    riverRows,
    hasRiver: riverRows.some((row) => row.length > 0),
    store: map.tiles.find((t) => t.terrain === 'store'),
    specials: map.tiles.filter((t) => t.special),
  };
}

/** Steps (Manhattan) from a tile to the nearest source; Infinity with no source. */
function distances(map: GameMap, sources: Tile[]): Steps {
  const dist: number[] = map.tiles.map(() => Infinity);
  let frontier = sources;
  for (const s of sources) dist[tileIndex(map.width, s.x, s.y)] = 0;
  for (let step = 1; frontier.length > 0; step++) {
    const next: Tile[] = [];
    for (const t of frontier) {
      for (const n of neighbours(map.tiles, map.width, t)) {
        const i = tileIndex(map.width, n.x, n.y);
        if (dist[i] !== Infinity) continue;
        dist[i] = step;
        next.push(n);
      }
    }
    frontier = next;
  }
  return (tile) => dist[tileIndex(map.width, tile.x, tile.y)]!;
}

function regionsOf(map: GameMap, nonRiver: Tile[]): Tile[][] {
  const seen = new Set<Tile>();
  const regions: Tile[][] = [];
  for (const start of nonRiver) {
    if (seen.has(start)) continue;
    const region = [start];
    seen.add(start);
    for (let i = 0; i < region.length; i++) {
      for (const n of neighbours(map.tiles, map.width, region[i]!)) {
        if (n.terrain !== start.terrain || seen.has(n)) continue;
        seen.add(n);
        region.push(n);
      }
    }
    regions.push(region);
  }
  return regions;
}

function perPlayer(f: Facts, good: RawGood): number {
  return f.good[good].length / f.players;
}

function belowNormal(f: Facts): FloorGood[] {
  return FLOOR_GOODS.filter((g) => perPlayer(f, g) < MAP.normalLo[g]);
}

function worstReach(f: Facts, good: FloorGood): number {
  const worst = Math.max(0, ...f.land.map(f.reach[good]));
  return worst === Infinity ? f.map.width + f.map.height : worst;
}

function terrainCount(f: Facts, terrain: Terrain): number {
  return f.nonRiver.filter((t) => t.terrain === terrain).length;
}

function riverBendCount(f: Facts): number {
  return f.riverRows.filter((cols) => cols.length === 2 && cols[1]! - cols[0]! === 1).length;
}

function isolatedSmithore(f: Facts): Tile[] {
  const goodSet = new Set(f.good.smithore);
  return f.good.smithore.filter((t) => !neighbours(f.map.tiles, f.map.width, t).some((n) => goodSet.has(n)));
}

function seamShareOf(f: Facts): number {
  const count = f.good.smithore.length;
  return count === 0 ? 0 : (count - isolatedSmithore(f).length) / count;
}

function peaksOf(f: Facts, mineral: Mineral): Tile[] {
  return f.land.filter((t) => t.ground[mineral] === MAP.peak.high);
}

const at = (t: Tile) => `(${t.x},${t.y})`;
const plots = (tiles: Tile[]) => tiles.map(({ x, y }) => ({ x, y }));
const round = (n: number) => Number(n.toFixed(2));
const pct = (n: number) => `${round(n * 100)}%`;

/** F1 floors: enough good plots per player of each floor good. */
function floors(f: Facts): Violation[] {
  return FLOOR_GOODS.filter((g) => perPlayer(f, g) < MAP.floor[g]).map((g) => ({
    rule: 'F1',
    detail: `${g} ${round(perPlayer(f, g))} good plots per player, floor ${MAP.floor[g]}`,
  }));
}

/** F2: at most one floor good below its normal range. */
function oneScarce(f: Facts): Violation[] {
  const below = belowNormal(f);
  if (below.length <= 1) return [];
  const list = below.map((g) => `${g} ${round(perPlayer(f, g))} (normal from ${MAP.normalLo[g]})`).join(', ');
  return [{ rule: 'F2', detail: `${below.length} goods below normal, at most 1 may be: ${list}` }];
}

/** F3 reach: every land plot, the river included, near a good plot of each floor good. */
function reach(f: Facts): Violation[] {
  return FLOOR_GOODS.flatMap((g) => {
    const limit = MAP.reach[f.band][g];
    if (f.good[g].length === 0) return [{ rule: 'F3', detail: `no good ${g} plot to reach` }];
    const steps = f.reach[g];
    const far = f.land.filter((t) => steps(t) > limit);
    if (far.length === 0) return [];
    const worst = far.reduce((a, b) => (steps(b) > steps(a) ? b : a));
    const detail = `${g}: plot ${at(worst)} is ${steps(worst)} steps from a good plot, reach ${limit} (${far.length} too far)`;
    return [{ rule: 'F3', detail, at: plots(far) }];
  });
}

/** S1: all 11 land terrains present. */
function allTerrains(f: Facts): Violation[] {
  const missing = SHARE_TERRAINS.filter((t) => terrainCount(f, t) === 0);
  return missing.map((t) => ({ rule: 'S1', detail: `no ${t} on the map` }));
}

/** S2 shares: each terrain present within its target share. An absent terrain is S1's alone. */
function shares(f: Facts): Violation[] {
  const n = f.nonRiver.length;
  return SHARE_TERRAINS.flatMap((t) => {
    const count = terrainCount(f, t);
    if (count === 0) return [];
    const band = shareBand(t, n);
    if (count >= band.min && count <= band.max) return [];
    return [{ rule: 'S2', detail: `${t} ${count} plots, ${pct(count / n)} of non-river land; target ${pct(MAP.shares[t])} ± ${pct(band.tolerance)}` }];
  });
}

/** S3: no terrain over MAP.maxTerrainShare of non-river land. */
function noDominant(f: Facts): Violation[] {
  const n = f.nonRiver.length;
  return SHARE_TERRAINS.filter((t) => terrainCount(f, t) / n > MAP.maxTerrainShare + EPS).map((t) => ({
    rule: 'S3',
    detail: `${t} ${terrainCount(f, t)} of ${n} plots, over ${pct(MAP.maxTerrainShare)} of non-river land`,
  }));
}

/** S4 no specks: every same-terrain region at least MAP.minRegion plots. */
function noSpecks(f: Facts): Violation[] {
  return f.regions.filter((r) => r.length < MAP.minRegion).map((r) => ({
    rule: 'S4',
    detail: `${r[0]!.terrain} region of ${r.length} plots at ${at(r[0]!)}, fewer than ${MAP.minRegion}`,
    at: plots(r),
  }));
}

/** S2's allowed plot counts for a terrain on `nonRiver` plots of non-river land: its target share ± a third of it, ± 1 plot. */
export function shareBand(terrain: ShareTerrain, nonRiver: number): { min: number; max: number; tolerance: number } {
  const target = MAP.shares[terrain];
  const tolerance = target * MAP.jitter + 1 / nonRiver;
  return {
    min: Math.ceil((target - tolerance - EPS) * nonRiver),
    max: Math.floor((target + tolerance + EPS) * nonRiver),
    tolerance,
  };
}

/** S5's cap: the most plots one region may hold on `nonRiver` plots of non-river land. */
export function regionCap(nonRiver: number): number {
  return Math.ceil(MAP.maxRegionShare * nonRiver - EPS);
}

/** S5 no blob: no region over its share of non-river land. */
function noBlob(f: Facts): Violation[] {
  const cap = regionCap(f.nonRiver.length);
  return f.regions.filter((r) => r.length > cap).map((r) => ({
    rule: 'S5',
    detail: `${r[0]!.terrain} region of ${r.length} plots at ${at(r[0]!)}, over the cap of ${cap}`,
    at: plots(r),
  }));
}

/** S6 river shape: every row holds 1 river plot or 2 touching, each sharing a column with the row above. */
function riverShape(f: Facts): Violation[] {
  if (!f.hasRiver) return [{ rule: 'S6', detail: 'no river on the map' }];
  return f.riverRows.flatMap((cols, y): Violation[] => {
    if (cols.length === 0) return [{ rule: 'S6', detail: `row ${y} holds no river` }];
    const where = cols.map((x) => ({ x, y }));
    if (cols[cols.length - 1]! - cols[0]! > 1) {
      return [{ rule: 'S6', detail: `row ${y} holds river at columns ${cols.join(', ')}; a row holds 1 river plot or 2 touching`, at: where }];
    }
    const above = f.riverRows[y - 1];
    if (above && above.length > 0 && !cols.some((x) => above.includes(x))) {
      const detail = `row ${y}'s river (column ${cols.join(', ')}) does not touch row ${y - 1}'s (column ${above.join(', ')})`;
      return [{ rule: 'S6', detail, at: where }];
    }
    return [];
  });
}

/**
 * S7: enough bends, MAP.riverMargin columns from each side, and a river plot
 * touching the store. With no river at all, S6 reports it; zero bends would only restate that.
 */
function riverBends(f: Facts): Violation[] {
  if (!f.hasRiver) return [];
  const out: Violation[] = [];
  const bends = riverBendCount(f);
  const needed = MAP.bends[f.band];
  if (bends < needed) out.push({ rule: 'S7', detail: `${bends} ${bends === 1 ? 'bend' : 'bends'}, ${needed} needed` });
  const { width } = f.map;
  for (const [y, cols] of f.riverRows.entries()) {
    for (const x of cols.filter((c) => c < MAP.riverMargin || c > width - 1 - MAP.riverMargin)) {
      out.push({ rule: 'S7', detail: `river at column ${x} in row ${y}, closer than ${MAP.riverMargin} columns to the side`, at: [{ x, y }] });
    }
  }
  const store = f.store;
  const touchesStore = store !== undefined && neighbours(f.map.tiles, width, store).some((t) => t.terrain === 'river');
  if (!touchesStore) out.push({ rule: 'S7', detail: 'no river plot touches the store', ...(store ? { at: plots([store]) } : {}) });
  return out;
}

/** S8 seams: enough good Smithore plots touching another. */
function seams(f: Facts): Violation[] {
  const share = seamShareOf(f);
  if (share + EPS >= MAP.seamShare) return [];
  const count = f.good.smithore.length;
  const isolated = isolatedSmithore(f);
  const detail = `${count - isolated.length} of ${count} good smithore plots touch another (${pct(share)}), ${pct(MAP.seamShare)} needed`;
  return [{ rule: 'S8', detail, at: plots(isolated) }];
}

function ringRating(steps: number): (rating: number) => boolean {
  const { high, medium, low } = MAP.peak;
  if (steps === 0) return (r) => r === high;
  if (steps === 1) return (r) => r === medium;
  if (steps === 2) return (r) => r >= low.min && r <= low.max;
  return (r) => r === 0;
}

function ringWants(steps: number): string {
  const { medium, low } = MAP.peak;
  if (steps === 1) return `1 step from a peak needs ${medium}`;
  if (steps === 2) return `2 steps from a peak needs ${low.min} to ${low.max}`;
  return 'outside every ring needs 0';
}

/** S10 rings: 3 to 4 peaks per mineral, and every plot rated by its steps to the nearest peak. */
function rings(f: Facts): Violation[] {
  const { count } = MAP.peak;
  return MINERALS.flatMap((m) => {
    const out: Violation[] = [];
    const peaks = peaksOf(f, m);
    if (peaks.length < count.min || peaks.length > count.max) {
      out.push({ rule: 'S10', detail: `${m} has ${peaks.length} peaks (plots rated ${MAP.peak.high}), ${count.min} to ${count.max} needed` });
    }
    const steps = distances(f.map, peaks);
    const wrong = f.land.filter((t) => !ringRating(steps(t))(t.ground[m]));
    const first = wrong[0];
    if (first) {
      const more = wrong.length > 1 ? ` (${wrong.length - 1} more plots off the rings)` : '';
      out.push({ rule: 'S10', detail: `${m} at ${at(first)} is rated ${first.ground[m]}; ${ringWants(steps(first))}${more}`, at: plots(wrong) });
    }
    return out;
  });
}

const SPECIAL_KINDS = Object.keys(MAP.special.on) as SpecialKind[];

/** P1 (RULE-5): the count, the kinds, each plot's fit, the spacing and both river sides. */
function specialFields(f: Facts): Violation[] {
  const out: Violation[] = [];
  const { special } = MAP;
  const needed = MAP.specials[f.band];
  if (f.specials.length !== needed) out.push({ rule: 'P1', detail: `${f.specials.length} special fields, ${needed} needed` });
  const kinds = SPECIAL_KINDS.filter((k) => f.specials.some((t) => t.special!.kind === k));
  for (const kind of kinds) {
    const of = f.specials.filter((t) => t.special!.kind === kind);
    if (of.length > special.maxPerKind) out.push({ rule: 'P1', detail: `${kind} ${of.length} times, at most ${special.maxPerKind}`, at: plots(of) });
  }
  if (kinds.length < special.minKinds) out.push({ rule: 'P1', detail: `${kinds.length} kinds of special field, ${special.minKinds} needed` });
  for (const t of f.specials) {
    const fault = misplaced(f, t);
    if (fault) out.push({ rule: 'P1', detail: `${t.special!.kind} at ${at(t)} ${fault}`, at: plots([t]) });
  }
  for (const [i, a] of f.specials.entries()) {
    const steps = distances(f.map, [a]);
    for (const b of f.specials.slice(i + 1).filter((b) => steps(b) < special.spacing)) {
      const detail = `${a.special!.kind} at ${at(a)} and ${b.special!.kind} at ${at(b)} are ${steps(b)} steps apart, ${special.spacing} needed`;
      out.push({ rule: 'P1', detail, at: plots([a, b]) });
    }
  }
  // With no river, S6 reports it; a missing side would only restate that.
  if (f.hasRiver) {
    const side = (t: Tile, s: 'left' | 'right') => {
      const cols = f.riverRows[t.y]!;
      return cols.length > 0 && (s === 'left' ? t.x < cols[0]! : t.x > cols[cols.length - 1]!);
    };
    for (const s of ['left', 'right'] as const) {
      if (!f.specials.some((t) => side(t, s))) out.push({ rule: 'P1', detail: `no special field ${s} of the river` });
    }
  }
  return out;
}

/** Why a special field's plot breaks RULE-5's rows for its kind, or undefined when it fits. */
function misplaced(f: Facts, t: Tile): string | undefined {
  const { kind, salvage } = t.special!;
  const { special } = MAP;
  if (t.terrain === 'river' || t.terrain === 'lake' || t.terrain === 'store') return `is on ${t.terrain}`;
  if (f.store && neighbours(f.map.tiles, f.map.width, f.store).includes(t)) return 'touches the store';
  const allowed: readonly Terrain[] = special.on[kind];
  if (!allowed.includes(t.terrain)) return `is on ${t.terrain}; allowed on ${allowed.join(', ')}`;
  if (kind === 'crystalCavern' && t.ground.crystite < special.cavernCrystite) {
    return `has crystite ${t.ground.crystite}, at least ${special.cavernCrystite} needed`;
  }
  if (kind === 'oasis') {
    const deserts = neighbours(f.map.tiles, f.map.width, t).filter((n) => n.terrain === 'desert').length;
    if (deserts < special.oasisDeserts) return `has ${deserts} desert neighbours, ${special.oasisDeserts} needed`;
  }
  if (kind === 'ruins' && !salvage) return 'has no salvage';
  if (kind !== 'ruins' && salvage) return 'has salvage, which only ruins carry';
  return undefined;
}

function metrics(f: Facts): MapReport['metrics'] {
  const n = f.nonRiver.length;
  const below = belowNormal(f);
  return {
    perPlayer: Object.fromEntries(RAW_GOODS.map((g) => [g, perPlayer(f, g)])) as Record<RawGood, number>,
    shares: Object.fromEntries(SHARE_TERRAINS.filter((t) => terrainCount(f, t) > 0).map((t) => [t, terrainCount(f, t) / n])),
    biggestRegion: Math.max(0, ...f.regions.map((r) => r.length)),
    bends: riverBendCount(f),
    seamShare: seamShareOf(f),
    peaks: { crystite: peaksOf(f, 'crystite').length, rareEarth: peaksOf(f, 'rareEarth').length },
    worstReach: Object.fromEntries(FLOOR_GOODS.map((g) => [g, worstReach(f, g)])) as Record<FloorGood, number>,
    scarce: below.length === 1 ? below[0]! : null,
    specials: f.specials.length,
  };
}
