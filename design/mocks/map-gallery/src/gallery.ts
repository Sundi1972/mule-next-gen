import { checkMap, createRng, generateMap, MAP, RAW_GOODS, regionCap, type GameMap, type MapReport, type RawGood, type RuleId } from '@mule/engine';
import type { MapTile } from '@mule/ui';
// The frozen pre-WS5 generator lives only as a test fixture; this breaks if that fixture moves.
import { legacyGenerateMap } from '../../../../packages/engine/test/fixtures/legacy-map';

/**
 * The gallery's data: for each seed, today's map and the new map, each with
 * the checker's report. Pass and fail come from checkMap's report; the few
 * marks a card draws itself use the same MAP numbers and engine helpers.
 */

export type Players = 2 | 4 | 6;
export type Generator = 'current' | 'new';
export const GENERATORS: Generator[] = ['current', 'new'];

export interface CheckedMap {
  map: GameMap;
  report: MapReport;
}

export type SeedMaps = Record<Generator, CheckedMap>;

/** What the ground overlay shows: nothing (as players see the map), every good, or one good. */
export type GroundView = 'off' | 'all' | RawGood;

const MINERAL_RINGS: RawGood[] = ['crystite', 'rareEarth'];

export function mapsForSeed(seed: number, players: Players): SeedMaps {
  const current = legacyGenerateMap(players, createRng(seed));
  const next = generateMap(players, createRng(seed));
  return {
    current: { map: current, report: checkMap(current, players) },
    new: { map: next, report: checkMap(next, players) },
  };
}

/**
 * The map as HoloMap draws it. With the overlay on, each plot carries the goods
 * it is good for (MAP.goodAt); HoloMap draws the best one as a glyph. With one
 * mineral picked, every rated plot shows, so its rings are visible.
 */
export function toMapTiles(map: GameMap, view: GroundView): MapTile[] {
  return map.tiles.map((t) => {
    const tile: MapTile = { x: t.x, y: t.y, terrain: t.terrain, owner: null, peaks: t.peaks };
    if (view === 'off' || t.terrain === 'store') return tile;
    const goods = view === 'all' ? RAW_GOODS : [view];
    const shown = goods.filter((g) => t.ground[g] >= (MINERAL_RINGS.includes(g) && view === g ? 1 : MAP.goodAt[g]));
    if (shown.length > 0) tile.ground = Object.fromEntries(shown.map((g) => [g, t.ground[g]]));
    return tile;
  });
}

/** S5's cap for this map, from the checker. */
export function biggestRegionCap(map: GameMap): number {
  return regionCap(map.tiles.filter((t) => t.terrain !== 'river' && t.terrain !== 'store').length);
}

export function brokenRules(report: MapReport): RuleId[] {
  return [...new Set(report.violations.map((v) => v.rule))];
}

export interface Tally {
  maps: number;
  failing: number;
  scarce: number;
  byRule: Partial<Record<RuleId, number>>;
  /** Sum over maps of good plots per player, for the average. */
  perPlayerSum: Record<RawGood, number>;
}

export type Aggregate = Record<Generator, Tally>;

function emptyTally(): Tally {
  return { maps: 0, failing: 0, scarce: 0, byRule: {}, perPlayerSum: Object.fromEntries(RAW_GOODS.map((g) => [g, 0])) as Record<RawGood, number> };
}

export function emptyAggregate(): Aggregate {
  return { current: emptyTally(), new: emptyTally() };
}

export function addToTally(tally: Tally, report: MapReport): void {
  tally.maps += 1;
  const broken = brokenRules(report);
  if (broken.length > 0) tally.failing += 1;
  for (const rule of broken) tally.byRule[rule] = (tally.byRule[rule] ?? 0) + 1;
  if (report.metrics.scarce) tally.scarce += 1;
  for (const g of RAW_GOODS) tally.perPlayerSum[g] += report.metrics.perPlayer[g];
}

export const AGGREGATE_SEEDS = 200;
export const PAGE_SIZE = 12;
