import { describe, expect, it } from 'vitest';
import { checkMap, createRng, type MapReport } from '../src/index.js';
import { legacyGenerateMap } from './fixtures/legacy-map.js';
import {
  buildMap,
  CRYSTITE_4_PEAKS,
  CRYSTITE_5_PEAKS,
  LARGE_MAP,
  MID_MAP,
  MID_SPEC,
  SMALL_MAP,
  withGround,
  withTerrain,
  type TestMap,
} from './fixtures/map-fixtures.js';

function rulesBroken(map: TestMap, players: number): string[] {
  return [...new Set(checkMap(map, players).violations.map((v) => v.rule))];
}

function details(map: TestMap, players: number, rule: string): string {
  return checkMap(map, players).violations.filter((v) => v.rule === rule).map((v) => v.detail).join(' | ');
}

interface Case {
  rule: string;
  what: string;
  players: number;
  /** A map that passes every rule, often sitting exactly on this row's limit. */
  twin: TestMap;
  /** The twin plus one change, breaking only this row. */
  map: TestMap;
  /** A word the violation's detail must carry, naming what broke. */
  mentions: string;
  /** Metrics the broken map must report. */
  metrics?: Partial<MapReport['metrics']>;
}

interface Twin {
  name: string;
  map: TestMap;
  players: number;
}

const MID: Twin = { name: 'mid', map: MID_MAP, players: 4 };
const SMALL: Twin = { name: 'small', map: SMALL_MAP, players: 2 };
const LARGE: Twin = { name: 'large', map: LARGE_MAP, players: 5 };

function row(
  rule: string,
  what: string,
  twin: Twin | TestMap,
  change: (twin: TestMap) => TestMap,
  mentions: string,
  metrics?: Partial<MapReport['metrics']>,
): Case {
  const { map, players } = 'name' in twin ? twin : { map: twin, players: 4 };
  return { rule, what, players, twin: map, map: change(map), mentions, ...(metrics ? { metrics } : {}) };
}

const SMITHORE_12 = withGround(MID_MAP, 'smithore', [[4, 3, 0], [10, 3, 0], [4, 5, 0], [10, 5, 0]]);
const FOOD_47_WATER_52 = withGround(
  withGround(MID_MAP, 'food', [[0, 0, 0], [5, 0, 0], [10, 0, 0], [0, 5, 0], [5, 5, 0], [10, 5, 0]]),
  'water',
  [[2, 0, 0], [7, 0, 0]],
);
const ICE_4 = withTerrain(MID_MAP, [[5, 5, 'P'], [4, 5, 'H'], [4, 6, 'H'], [5, 6, 'H']]);
const LAKE_SPECK_3 = withTerrain(MID_MAP, [[7, 0, 'L'], [8, 0, 'L'], [9, 0, 'L']]);
const PLAINS_REGION_15 = withTerrain(MID_MAP, [[10, 2, 'P']]);
const SEAMS_75 = withGround(MID_MAP, 'smithore', [[4, 2, 0], [3, 3, 0], [5, 2, 3], [2, 4, 3]]);
const CRYSTITE_4 = buildMap({ ...MID_SPEC, ground: { ...MID_SPEC.ground, crystite: CRYSTITE_4_PEAKS } });

const cases: Case[] = [
  // Smithore 2 is not good, so it still counts as missing.
  row('F1', 'smithore 11 good plots, 2.75 per player under the floor of 3', SMITHORE_12, (m) => withGround(m, 'smithore', [[11, 5, 2]]), '2.75', {
    scarce: 'smithore',
  }),
  row('F2', 'food 47 and water 51 good plots, both under normal', FOOD_47_WATER_52, (m) => withGround(m, 'water', [[12, 0, 0]]), 'water', {
    scarce: null,
  }),
  row('F3', 'the corner (0,0) 6 steps from good smithore', MID_MAP, (m) => withGround(m, 'smithore', [[3, 2, 0], [3, 3, 0], [5, 2, 3], [5, 3, 3]]), 'smithore'),
  row(
    'F3',
    'the river plot (6,5) 4 steps from good energy',
    MID_MAP,
    (m) => withGround(m, 'energy', [[4, 4, 0], [5, 4, 0], [5, 5, 0], [6, 5, 0], [6, 6, 0], [7, 6, 0], [7, 7, 0]]),
    '(6,5)',
  ),
  row('F3', 'large: the corner (0,0) 7 steps from good smithore, reach 6', LARGE, (m) => withGround(m, 'smithore', [[4, 2, 0], [4, 3, 0], [6, 2, 3], [6, 3, 3]]), '7 steps'),
  row('S1', 'the crater turned to plains', MID_MAP, (m) => withTerrain(m, [[2, 7, 'P'], [3, 7, 'P'], [4, 7, 'P'], [2, 8, 'P'], [3, 8, 'P'], [4, 8, 'P']]), 'crater'),
  row('S2', 'ice 3 plots, under its least share of 4 in 122', ICE_4, (m) => withTerrain(m, [[5, 7, 'C']]), 'ice'),
  row('S3', 'plains 16 of 47 plots, inside its share yet over a third', SMALL, (m) => withTerrain(m, [[8, 2, 'P']]), 'plains'),
  row('S4', 'a two-plot lake', LAKE_SPECK_3, (m) => withTerrain(m, [[9, 0, 'P']]), 'lake'),
  row('S5', 'a plains region of 16, over ceil(0.12 × 122) = 15', PLAINS_REGION_15, (m) => withTerrain(m, [[9, 3, 'P']]), 'plains'),
  row('S6', 'river at columns 5 and 7 in row 7', MID_MAP, (m) => withTerrain(m, [[5, 7, '~']]), 'row 7'),
  row('S6', 'row 7 with no river', MID_MAP, (m) => withTerrain(m, [[7, 7, 'D']]), 'row 7'),
  row('S6', 'row 0 with no river', MID_MAP, (m) => withTerrain(m, [[6, 0, 'L'], [7, 0, 'L'], [8, 0, 'L']]), 'row 0'),
  row('S6', 'row 8 river teleported from column 7 to 10', MID_MAP, (m) => withTerrain(m, [[7, 8, 'V'], [10, 8, '~']]), 'row 8'),
  row('S7', 'mid: a river with 2 bends, 3 needed', MID_MAP, (m) => withTerrain(m, [[5, 0, '~'], [6, 0, 'P'], [6, 1, 'P'], [10, 0, 'T']]), '2 bends'),
  row('S7', 'small: a river with 1 bend, 2 needed', SMALL, (m) => withTerrain(m, [[8, 0, 'T'], [7, 0, '~'], [8, 1, 'F']]), '1 bend'),
  row('S7', 'large: a river with 3 bends, 4 needed', LARGE, (m) => withTerrain(m, [[11, 10, 'V']]), '3 bends'),
  row('S7', 'small: a river plot in column 9 of 11', SMALL, (m) => withTerrain(m, [[9, 0, '~'], [9, 1, 'T']]), 'column 9'),
  row('S7', 'the store moved off the river', MID_MAP, (m) => withTerrain(m, [[8, 4, '#'], [7, 4, 'S']]), 'store'),
  // The isolated (12,4) gets a Smithore 2 neighbour: 2 is not good, so it stays isolated.
  row('S8', '11 of 16 good smithore plots in seams', SEAMS_75, (m) => withGround(m, 'smithore', [[10, 3, 0], [12, 4, 3], [13, 4, 2]]), 'smithore'),
  row('S10', 'crystite 2 beside a peak', MID_MAP, (m) => withGround(m, 'crystite', [[8, 2, 2]]), 'crystite'),
  row('S10', 'crystite 0 two steps from a peak', MID_MAP, (m) => withGround(m, 'crystite', [[8, 3, 0]]), 'crystite'),
  row('S10', 'crystite 1 outside every ring', MID_MAP, (m) => withGround(m, 'crystite', [[0, 0, 1]]), 'crystite'),
  row('S10', 'five crystite peaks, 4 allowed', CRYSTITE_4, () => buildMap({ ...MID_SPEC, ground: { ...MID_SPEC.ground, crystite: CRYSTITE_5_PEAKS } }), '5 peaks'),
];

const share = (count: number, of: number) => count / of;

const arranged: { twin: Twin; metrics: MapReport['metrics'] }[] = [
  {
    twin: MID,
    metrics: {
      perPlayer: { food: 13.25, water: 13.5, energy: 13.5, smithore: 4, crystite: 3.75, rareEarth: 3.75 },
      shares: {
        plains: share(28, 122),
        forest: share(13, 122),
        hills: share(12, 122),
        desert: share(11, 122),
        tundra: share(10, 122),
        mountains: share(9, 122),
        swamp: share(9, 122),
        lake: share(7, 122),
        volcanic: share(9, 122),
        crater: share(6, 122),
        ice: share(8, 122),
      },
      biggestRegion: 14,
      bends: 3,
      seamShare: 1,
      peaks: { crystite: 3, rareEarth: 3 },
      worstReach: { food: 2, water: 2, energy: 3, smithore: 5 },
      scarce: null,
      specials: 0,
    },
  },
  {
    twin: SMALL,
    metrics: {
      perPlayer: { food: 27, water: 27, energy: 27, smithore: 4, crystite: 5.5, rareEarth: 5.5 },
      shares: {
        plains: share(15, 47),
        forest: share(4, 47),
        hills: share(3, 47),
        desert: share(4, 47),
        tundra: share(3, 47),
        mountains: share(3, 47),
        swamp: share(3, 47),
        lake: share(3, 47),
        volcanic: share(3, 47),
        crater: share(3, 47),
        ice: share(3, 47),
      },
      biggestRegion: 5,
      bends: 2,
      seamShare: 1,
      peaks: { crystite: 3, rareEarth: 3 },
      worstReach: { food: 0, water: 0, energy: 0, smithore: 4 },
      scarce: null,
      specials: 0,
    },
  },
  {
    twin: LARGE,
    metrics: {
      perPlayer: { food: 16.8, water: 16.8, energy: 16.8, smithore: 4, crystite: 3, rareEarth: 3 },
      shares: {
        plains: share(46, 193),
        forest: share(24, 193),
        hills: share(22, 193),
        desert: share(14, 193),
        tundra: share(12, 193),
        mountains: share(14, 193),
        swamp: share(14, 193),
        lake: share(12, 193),
        volcanic: share(12, 193),
        crater: share(12, 193),
        ice: share(11, 193),
      },
      biggestRegion: 24,
      bends: 4,
      seamShare: 1,
      peaks: { crystite: 3, rareEarth: 3 },
      worstReach: { food: 2, water: 2, energy: 2, smithore: 6 },
      scarce: null,
      specials: 0,
    },
  },
];

describe('checkMap', () => {
  for (const { rule, what, twin, players, map, mentions, metrics } of cases) {
    it(`T-AC-1: ${rule} is reported alone (${what})`, () => {
      expect(rulesBroken(twin, players)).toEqual([]);
      expect(rulesBroken(map, players)).toEqual([rule]);
      expect(details(map, players, rule)).toContain(mentions);
      if (metrics) expect(checkMap(map, players).metrics).toMatchObject(metrics);
    });
  }

  for (const { twin, metrics } of arranged) {
    it(`T-AC-1: the passing ${twin.name} map reports its arranged metrics`, () => {
      const report = checkMap(twin.map, twin.players);

      expect(report.violations).toEqual([]);
      expect(report.metrics).toEqual(metrics);
    });
  }

  it('T-AC-1: S6 alone reports a map with no river, not as a river of zero bends', () => {
    const dry = withTerrain(MID_MAP, [
      [6, 0, 'I'], [5, 1, 'I'], [6, 1, 'I'],
      [5, 2, 'C'], [5, 3, 'C'], [6, 3, 'C'], [6, 4, 'C'],
      [6, 5, 'D'], [6, 6, 'D'], [7, 6, 'D'], [7, 7, 'D'], [7, 8, 'D'],
    ]);

    expect(rulesBroken(dry, 4)).toEqual(['S6']);
    expect(details(dry, 4, 'S6')).toContain('no river');
  });

  it('T-AC-1: S10 is reported alone for a mineral with no peak', () => {
    const noCrystite = buildMap({ ...MID_SPEC, ground: { ...MID_SPEC.ground, crystite: 0 } });

    expect(rulesBroken(noCrystite, 4)).toEqual(['S10']);
    expect(details(noCrystite, 4, 'S10')).toContain('crystite');
  });

  it('T-AC-1: a good with no good plot reports its reach as width + height, so the report stays JSON-safe', () => {
    const report = checkMap(withGround(MID_MAP, 'food', MID_MAP.tiles.map((t): [number, number, number] => [t.x, t.y, 0])), 4);

    expect(report.metrics.worstReach.food).toBe(15 + 9);
    expect(JSON.parse(JSON.stringify(report.metrics))).toEqual(report.metrics);
  });

  it("T-AC-2: today's generator fails S7 on seed 1", () => {
    const report = checkMap(legacyGenerateMap(4, createRng(1)), 4);

    expect(report.violations.map((v) => v.rule)).toContain('S7');
    expect(report.metrics.bends).toBe(0);
  });
});
