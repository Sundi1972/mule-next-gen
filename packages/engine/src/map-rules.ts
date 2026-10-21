import { MAP } from './config.js';
import { neighbours, tileIndex } from './map.js';
import { RAW_GOODS, type RawGood, type Terrain, type Tile } from './types.js';

/** The map rules as a checker: every rule a map breaks, and the numbers the map gallery prints. */

type GameMap = { width: number; height: number; tiles: Tile[] };
type FloorGood = keyof typeof MAP.floor;
type ShareTerrain = keyof typeof MAP.shares;
type Mineral = 'crystite' | 'rareEarth';
export type SizeBand = keyof typeof MAP.bends;

export interface MapReport {
  /** One entry per broken rule instance; `rule` is the row id ('F1', 'S7', ...). */
  violations: { rule: string; detail: string }[];
  metrics: {
    /** Good plots per player. */
    perPlayer: Record<RawGood, number>;
    /** Share of non-river land for each land terrain on the map. */
    shares: Partial<Record<Exclude<Terrain, 'river' | 'store'>, number>>;
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
}

type Violation = MapReport['violations'][number];
type Steps = (tile: Tile) => number;

/** Map size band by player count, as mapSize sizes the map. */
export function sizeBand(players: number): SizeBand {
  if (players <= 3) return 'small';
  if (players === 4) return 'mid';
  return 'large';
}

/** Checks a map against every map rule (spec RULE-1). Pure. */
export function checkMap(map: GameMap, players: number): MapReport {
  const facts = gatherFacts(map, players);
  const rows = [floors, oneScarce, reach, allTerrains, shares, noDominant, noSpecks, noBlob, riverShape, riverBends, seams, rings];
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

function touchingSmithore(f: Facts): number {
  const goodSet = new Set(f.good.smithore);
  return f.good.smithore.filter((t) => neighbours(f.map.tiles, f.map.width, t).some((n) => goodSet.has(n))).length;
}

function seamShareOf(f: Facts): number {
  return f.good.smithore.length === 0 ? 0 : touchingSmithore(f) / f.good.smithore.length;
}

function peaksOf(f: Facts, mineral: Mineral): Tile[] {
  return f.land.filter((t) => t.ground[mineral] === MAP.peak.high);
}

const at = (t: Tile) => `(${t.x},${t.y})`;
const round = (n: number) => Number(n.toFixed(2));
const pct = (n: number) => `${round(n * 100)}%`;

function floors(f: Facts): Violation[] {
  return FLOOR_GOODS.filter((g) => perPlayer(f, g) < MAP.floor[g]).map((g) => ({
    rule: 'F1',
    detail: `${g} ${round(perPlayer(f, g))} good plots per player, floor ${MAP.floor[g]}`,
  }));
}

function oneScarce(f: Facts): Violation[] {
  const below = belowNormal(f);
  if (below.length <= 1) return [];
  const list = below.map((g) => `${g} ${round(perPlayer(f, g))} (normal from ${MAP.normalLo[g]})`).join(', ');
  return [{ rule: 'F2', detail: `${below.length} goods below normal, at most 1 may be: ${list}` }];
}

function reach(f: Facts): Violation[] {
  return FLOOR_GOODS.flatMap((g) => {
    const limit = MAP.reach[f.band][g];
    if (f.good[g].length === 0) return [{ rule: 'F3', detail: `no good ${g} plot to reach` }];
    const steps = f.reach[g];
    const far = f.land.filter((t) => steps(t) > limit);
    if (far.length === 0) return [];
    const worst = far.reduce((a, b) => (steps(b) > steps(a) ? b : a));
    return [{ rule: 'F3', detail: `${g}: plot ${at(worst)} is ${steps(worst)} steps from a good plot, reach ${limit} (${far.length} too far)` }];
  });
}

function allTerrains(f: Facts): Violation[] {
  const missing: string[] = SHARE_TERRAINS.filter((t) => terrainCount(f, t) === 0);
  if (!f.hasRiver) missing.push('river');
  return missing.map((t) => ({ rule: 'S1', detail: `no ${t} on the map` }));
}

// A terrain that is absent is S1's violation, so S2 judges only the terrains present.
function shares(f: Facts): Violation[] {
  const n = f.nonRiver.length;
  return SHARE_TERRAINS.flatMap((t) => {
    const count = terrainCount(f, t);
    if (count === 0) return [];
    const target = MAP.shares[t];
    const tolerance = target * MAP.jitter + 1 / n;
    if (Math.abs(count / n - target) <= tolerance + EPS) return [];
    return [{ rule: 'S2', detail: `${t} ${count} plots, ${pct(count / n)} of non-river land; target ${pct(target)} ± ${pct(tolerance)}` }];
  });
}

function noDominant(f: Facts): Violation[] {
  const n = f.nonRiver.length;
  return SHARE_TERRAINS.filter((t) => terrainCount(f, t) * 3 > n).map((t) => ({
    rule: 'S3',
    detail: `${t} ${terrainCount(f, t)} of ${n} plots, over a third of non-river land`,
  }));
}

function noSpecks(f: Facts): Violation[] {
  return f.regions
    .filter((r) => r.length < MAP.minRegion)
    .map((r) => ({ rule: 'S4', detail: `${r[0]!.terrain} region of ${r.length} plots at ${at(r[0]!)}, fewer than ${MAP.minRegion}` }));
}

function regionCap(f: Facts): number {
  return Math.ceil(MAP.maxRegionShare * f.nonRiver.length - EPS);
}

function noBlob(f: Facts): Violation[] {
  const cap = regionCap(f);
  return f.regions
    .filter((r) => r.length > cap)
    .map((r) => ({ rule: 'S5', detail: `${r[0]!.terrain} region of ${r.length} plots at ${at(r[0]!)}, over the cap of ${cap}` }));
}

function riverShape(f: Facts): Violation[] {
  if (!f.hasRiver) return [{ rule: 'S6', detail: 'no river on the map' }];
  return f.riverRows.flatMap((cols, y) => {
    if (cols.length === 1 || (cols.length === 2 && cols[1]! - cols[0]! === 1)) return [];
    const where = cols.length === 0 ? 'no river' : `river at columns ${cols.join(', ')}`;
    return [{ rule: 'S6', detail: `row ${y} holds ${where}; a row holds 1 river plot or 2 touching` }];
  });
}

// With no river at all, S6 reports it; zero bends would only restate that.
function riverBends(f: Facts): Violation[] {
  if (!f.hasRiver) return [];
  const out: Violation[] = [];
  const bends = riverBendCount(f);
  const needed = MAP.bends[f.band];
  if (bends < needed) out.push({ rule: 'S7', detail: `${bends} bends, ${needed} needed` });
  const { width } = f.map;
  for (const [y, cols] of f.riverRows.entries()) {
    for (const x of cols.filter((c) => c < 2 || c > width - 3)) {
      out.push({ rule: 'S7', detail: `river at column ${x} in row ${y}, closer than 2 columns to the side` });
    }
  }
  const store = f.store;
  const touchesStore = store !== undefined && neighbours(f.map.tiles, width, store).some((t) => t.terrain === 'river');
  if (!touchesStore) out.push({ rule: 'S7', detail: 'no river plot touches the store' });
  return out;
}

function seams(f: Facts): Violation[] {
  const share = seamShareOf(f);
  if (share + EPS >= MAP.seamShare) return [];
  const detail = `${touchingSmithore(f)} of ${f.good.smithore.length} good smithore plots touch another (${pct(share)}), ${pct(MAP.seamShare)} needed`;
  return [{ rule: 'S8', detail }];
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
      out.push({ rule: 'S10', detail: `${m} at ${at(first)} is rated ${first.ground[m]}; ${ringWants(steps(first))}${more}` });
    }
    return out;
  });
}

function metrics(f: Facts): MapReport['metrics'] {
  const n = f.nonRiver.length;
  const below = belowNormal(f);
  return {
    perPlayer: Object.fromEntries(RAW_GOODS.map((g) => [g, perPlayer(f, g)])) as Record<RawGood, number>,
    shares: Object.fromEntries(SHARE_TERRAINS.map((t) => [t, n === 0 ? 0 : terrainCount(f, t) / n])) as MapReport['metrics']['shares'],
    biggestRegion: Math.max(0, ...f.regions.map((r) => r.length)),
    bends: riverBendCount(f),
    seamShare: seamShareOf(f),
    peaks: { crystite: peaksOf(f, 'crystite').length, rareEarth: peaksOf(f, 'rareEarth').length },
    worstReach: Object.fromEntries(FLOOR_GOODS.map((g) => [g, worstReach(f, g)])) as Record<FloorGood, number>,
    scarce: below.length === 1 ? below[0]! : null,
    specials: 0,
  };
}
