import { describe, expect, it } from 'vitest';
import { checkMap, createRng, type GameMap, type MapReport, type RuleId, type Violation } from '../src/index.js';
import { legacyGenerateMap } from './fixtures/legacy-map.js';
import {
  buildMap,
  field,
  LARGE_MAP,
  MID_CRYSTITE_4_PEAKS,
  MID_CRYSTITE_5_PEAKS,
  MID_MAP,
  MID_SPEC,
  mirrored,
  SMALL_MAP,
  withGround,
  withSpecials,
  withTerrain,
} from './fixtures/map-fixtures.js';

function rulesBroken(map: GameMap, players: number): RuleId[] {
  return [...new Set(checkMap(map, players).violations.map((v) => v.rule))];
}

function brokenBy(map: GameMap, players: number, rule: RuleId): Violation[] {
  return checkMap(map, players).violations.filter((v) => v.rule === rule);
}

function details(map: GameMap, players: number, rule: RuleId): string {
  return brokenBy(map, players, rule).map((v) => v.detail).join(' | ');
}

interface Twin {
  name: string;
  map: GameMap;
  players: number;
}

/** What a broken map must report beyond its rule id. */
interface Expected {
  /** A word the violation's detail must carry, naming what broke. */
  mentions: string;
  /** The whole detail, where a row pins it. */
  detail?: string;
  /** The offending plots, where a row pins them. */
  at?: { x: number; y: number }[];
  /** Metrics the broken map must report, each field whole. */
  metrics?: Partial<MapReport['metrics']>;
}

interface Case extends Expected {
  rule: RuleId;
  what: string;
  /** A map that passes every rule, often sitting exactly on this row's limit. */
  twin: Twin;
  /** The twin plus one change, breaking only this row. */
  map: GameMap;
}

const mid = (name: string, map: GameMap): Twin => ({ name, map, players: 4 });

const MID = mid('mid', MID_MAP);
const SMALL: Twin = { name: 'small', map: SMALL_MAP, players: 2 };
const SMALL_MIRRORED: Twin = { name: 'small mirrored', map: mirrored(SMALL_MAP), players: 2 };
const SMALL_3: Twin = { name: 'small at 3 players', map: SMALL_MAP, players: 3 };
const LARGE: Twin = { name: 'large', map: LARGE_MAP, players: 5 };

function row(rule: RuleId, what: string, twin: Twin, change: (map: GameMap) => GameMap, expected: string | Expected): Case {
  const extra = typeof expected === 'string' ? { mentions: expected } : expected;
  return { rule, what, twin, map: change(twin.map), ...extra };
}

const SMITHORE_12 = mid('smithore 12', withGround(MID_MAP, 'smithore', [[4, 3, 0], [10, 3, 0], [4, 5, 0], [10, 5, 0]]));
const FOOD_47_WATER_52 = mid(
  'food 47, water 52',
  withGround(withGround(MID_MAP, 'food', [[0, 0, 0], [5, 0, 0], [10, 0, 0], [0, 5, 0], [5, 5, 0], [10, 5, 0]]), 'water', [[2, 0, 0], [7, 0, 0]]),
);
const ICE_4 = mid('ice 4', withTerrain(MID_MAP, [[5, 5, 'P'], [4, 5, 'H'], [4, 6, 'H'], [5, 6, 'H']]));
const LAKE_SPECK_3 = mid('lake speck 3', withTerrain(MID_MAP, [[7, 0, 'L'], [8, 0, 'L'], [9, 0, 'L']]));
const PLAINS_REGION_15 = mid('plains region 15', withTerrain(MID_MAP, [[10, 2, 'P']]));
const SEAMS_75 = mid('seams 75%', withGround(MID_MAP, 'smithore', [[4, 2, 0], [3, 3, 0], [5, 2, 3], [2, 4, 3]]));
const CRYSTITE_4 = mid('crystite 4 peaks', MID_CRYSTITE_4_PEAKS);

const share = (count: number, of: number) => count / of;

const cases: Case[] = [
  // Smithore 2 is not good, so it still counts as missing.
  row('F1', 'smithore 11 good plots, 2.75 per player under the floor of 3', SMITHORE_12, (m) => withGround(m, 'smithore', [[11, 5, 2]]), {
    mentions: '2.75',
    metrics: { scarce: 'smithore' },
  }),
  row('F2', 'food 47 and water 51 good plots, both under normal', FOOD_47_WATER_52, (m) => withGround(m, 'water', [[12, 0, 0]]), {
    mentions: 'water',
    metrics: { scarce: null },
  }),
  row('F3', 'the corner (0,0) 6 steps from good smithore', MID, (m) => withGround(m, 'smithore', [[3, 2, 0], [3, 3, 0], [5, 2, 3], [5, 3, 3]]), 'smithore'),
  row(
    'F3',
    'the river plot (6,5) 4 steps from good energy',
    MID,
    (m) => withGround(m, 'energy', [[4, 4, 0], [5, 4, 0], [5, 5, 0], [6, 5, 0], [6, 6, 0], [7, 6, 0], [7, 7, 0]]),
    { mentions: '(6,5)', at: [{ x: 6, y: 5 }], metrics: { worstReach: { food: 2, water: 2, energy: 4, smithore: 5 } } },
  ),
  row('F3', 'large: the corner (0,0) 7 steps from good smithore, reach 6', LARGE, (m) => withGround(m, 'smithore', [[4, 2, 0], [4, 3, 0], [6, 2, 3], [6, 3, 3]]), '7 steps'),
  row('S1', 'the crater turned to plains', MID, (m) => withTerrain(m, [[2, 7, 'P'], [3, 7, 'P'], [4, 7, 'P'], [2, 8, 'P'], [3, 8, 'P'], [4, 8, 'P']]), {
    mentions: 'crater',
    metrics: {
      shares: {
        plains: share(34, 122),
        forest: share(13, 122),
        hills: share(12, 122),
        desert: share(11, 122),
        tundra: share(10, 122),
        mountains: share(9, 122),
        swamp: share(9, 122),
        lake: share(7, 122),
        volcanic: share(9, 122),
        ice: share(8, 122),
      },
    },
  }),
  row('S2', 'ice 3 plots, under its least share of 4 in 122', ICE_4, (m) => withTerrain(m, [[5, 7, 'C']]), 'ice'),
  row('S2', 'lake 11 plots, over its most share of 10 in 122', LAKE_SPECK_3, (m) => withTerrain(m, [[10, 0, 'L']]), 'lake'),
  row('S3', 'plains 16 of 47 plots, inside its share yet over a third', SMALL, (m) => withTerrain(m, [[8, 2, 'P']]), 'plains'),
  row('S4', 'a two-plot lake', LAKE_SPECK_3, (m) => withTerrain(m, [[9, 0, 'P']]), { mentions: 'lake', at: [{ x: 7, y: 0 }, { x: 8, y: 0 }] }),
  row('S5', 'a plains region of 16, over ceil(0.12 × 122) = 15', PLAINS_REGION_15, (m) => withTerrain(m, [[9, 3, 'P']]), 'plains'),
  row('S6', 'river at columns 5 and 7 in row 7, which is no bend', MID, (m) => withTerrain(m, [[5, 7, '~']]), {
    mentions: 'row 7',
    at: [{ x: 5, y: 7 }, { x: 7, y: 7 }],
    metrics: { bends: 3 },
  }),
  // Reported once: row 8 below the empty row is not reported again for touching it.
  row('S6', 'row 7 with no river', MID, (m) => withTerrain(m, [[7, 7, 'D']]), { mentions: 'row 7', detail: 'row 7 holds no river' }),
  row('S6', 'row 0 with no river', MID, (m) => withTerrain(m, [[6, 0, 'L'], [7, 0, 'L'], [8, 0, 'L']]), 'row 0'),
  row('S6', 'row 8 river teleported from column 7 to 10', MID, (m) => withTerrain(m, [[7, 8, 'V'], [10, 8, '~']]), 'row 8'),
  row('S6', 'row 8 river a diagonal step from row 7', MID, (m) => withTerrain(m, [[7, 8, 'I'], [8, 8, '~']]), 'row 8'),
  row('S7', 'mid: a river with 2 bends, 3 needed', MID, (m) => withTerrain(m, [[5, 0, '~'], [6, 0, 'P'], [6, 1, 'P'], [10, 0, 'T']]), '2 bends'),
  row('S7', 'small: a river with 1 bend, 2 needed', SMALL, (m) => withTerrain(m, [[8, 0, 'T'], [7, 0, '~'], [8, 1, 'F']]), '1 bend'),
  row('S7', 'small at 3 players: a river with 1 bend, 2 needed', SMALL_3, (m) => withTerrain(m, [[8, 0, 'T'], [7, 0, '~'], [8, 1, 'F']]), '1 bend'),
  row('S7', 'large: a river with 3 bends, 4 needed', LARGE, (m) => withTerrain(m, [[11, 10, 'V']]), '3 bends'),
  row('S7', 'small: a river plot in column 9 of 11', SMALL, (m) => withTerrain(m, [[9, 0, '~'], [9, 1, 'T']]), 'column 9'),
  row('S7', 'small mirrored: a river plot in column 1', SMALL_MIRRORED, (m) => withTerrain(m, [[1, 0, '~'], [1, 1, 'T']]), 'column 1'),
  row('S7', 'the store moved off the river', MID, (m) => withTerrain(m, [[8, 4, '#'], [7, 4, 'S']]), 'store'),
  // The isolated (12,4) gets a Smithore 2 neighbour: 2 is not good, so it stays isolated.
  row('S8', '11 of 16 good smithore plots in seams', SEAMS_75, (m) => withGround(m, 'smithore', [[10, 3, 0], [12, 4, 3], [13, 4, 2]]), {
    mentions: 'smithore',
    metrics: { seamShare: 11 / 16 },
  }),
  row('S10', 'crystite 2 beside a peak', MID, (m) => withGround(m, 'crystite', [[8, 2, 2]]), 'crystite'),
  row('S10', 'crystite 0 two steps from a peak', MID, (m) => withGround(m, 'crystite', [[8, 3, 0]]), 'crystite'),
  row('S10', 'crystite 3 two steps from a peak', MID, (m) => withGround(m, 'crystite', [[8, 3, 3]]), 'crystite'),
  row('S10', 'crystite 1 outside every ring', MID, (m) => withGround(m, 'crystite', [[0, 0, 1]]), 'crystite'),
  row('S10', 'five crystite peaks, 4 allowed', CRYSTITE_4, () => MID_CRYSTITE_5_PEAKS, { mentions: '5 peaks', metrics: { peaks: { crystite: 5, rareEarth: 3 } } }),
  row('P1', 'a geyser on plains', MID, (m) => withSpecials(m, [[3, 1, field('geyser')]]), { mentions: 'geyser', at: [{ x: 3, y: 1 }] }),
  row('P1', 'a relic 3 steps from the ruins', MID, (m) => withSpecials(m, [[1, 7, null], [3, 4, field('relic')]]), {
    mentions: '3 steps',
    at: [{ x: 3, y: 1 }, { x: 3, y: 4 }],
  }),
  row('P1', 'ruins touching the store', MID, (m) => withSpecials(m, [[3, 1, null], [7, 3, field('ruins')]]), { mentions: 'store', at: [{ x: 7, y: 3 }] }),
  row('P1', 'ruins with no salvage', MID, (m) => withSpecials(m, [[3, 1, { kind: 'ruins' }]]), { mentions: 'salvage', at: [{ x: 3, y: 1 }] }),
  row('P1', 'mid: 3 special fields, 4 needed', MID, (m) => withSpecials(m, [[13, 0, null]]), { mentions: '3 special fields', metrics: { specials: 3 } }),
  row('P1', 'large: ruins three times, twice allowed', LARGE, (m) => withSpecials(m, [[2, 8, field('ruins')]]), 'ruins 3 times'),
  row('P1', 'small: 2 kinds, 3 needed', SMALL, (m) => withSpecials(m, [[6, 1, field('relic')]]), '2 kinds'),
  row(
    'P1',
    'every special field right of the river',
    MID,
    (m) => withSpecials(m, [[3, 1, null], [1, 7, null], [9, 1, field('ruins')], [14, 5, field('relic')]]),
    'left of the river',
  ),
];

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
      specials: 4,
    },
  },
  {
    twin: SMALL,
    metrics: {
      perPlayer: { food: 27, water: 27, energy: 27, smithore: 6, crystite: 5.5, rareEarth: 5.5 },
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
      specials: 3,
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
      specials: 5,
    },
  },
];

describe('checkMap', () => {
  for (const { rule, what, twin, map, mentions, detail, at, metrics } of cases) {
    it(`T-AC-1: ${rule} is reported alone (${what})`, () => {
      const { players } = twin;
      expect(rulesBroken(twin.map, players)).toEqual([]);
      expect(rulesBroken(map, players)).toEqual([rule]);
      expect(details(map, players, rule)).toContain(mentions);
      if (detail) expect(details(map, players, rule)).toBe(detail);
      if (at) expect(brokenBy(map, players, rule).flatMap((v) => v.at ?? [])).toEqual(at);
      const reported = checkMap(map, players).metrics;
      for (const [field, value] of Object.entries(metrics ?? {})) expect(reported[field as keyof typeof reported]).toEqual(value);
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
    expect(details(dry, 4, 'S6')).toBe('no river on the map');
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
