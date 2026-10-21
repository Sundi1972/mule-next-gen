import { describe, expect, it } from 'vitest';
import { checkMap } from '../src/index.js';
import { buildMap, MID_MAP, MID_SPEC, SMALL_MAP, withGround, withTerrain, type TestMap } from './fixtures/map-fixtures.js';

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
}

function row(rule: string, what: string, twin: TestMap, change: (twin: TestMap) => TestMap, mentions: string, players = 4): Case {
  return { rule, what, players, twin, map: change(twin), mentions };
}

const SMITHORE_12 = withGround(MID_MAP, 'smithore', [[4, 3, 0], [10, 3, 0], [4, 5, 0], [10, 5, 0]]);
const FOOD_47_WATER_52 = withGround(
  withGround(MID_MAP, 'food', [[0, 0, 0], [5, 0, 0], [10, 0, 0], [0, 5, 0], [5, 5, 0], [10, 5, 0]]),
  'water',
  [[2, 0, 0], [7, 0, 0]],
);
const LAKE_SPECK_3 = withTerrain(MID_MAP, [[7, 0, 'L'], [8, 0, 'L'], [9, 0, 'L']]);
const PLAINS_REGION_15 = withTerrain(MID_MAP, [[10, 2, 'P']]);
const SEAMS_75 = withGround(MID_MAP, 'smithore', [[4, 2, 0], [3, 3, 0], [5, 2, 3], [2, 4, 3]]);

const cases: Case[] = [
  row('F1', 'smithore 11 good plots, 2.75 per player under the floor of 3', SMITHORE_12, (m) => withGround(m, 'smithore', [[11, 5, 0]]), '2.75'),
  row('F2', 'food 47 and water 51 good plots, both under normal', FOOD_47_WATER_52, (m) => withGround(m, 'water', [[12, 0, 0]]), 'water'),
  row('F3', 'the corner (0,0) 6 steps from good smithore', MID_MAP, (m) => withGround(m, 'smithore', [[3, 2, 0], [3, 3, 0], [5, 2, 3], [5, 3, 3]]), 'smithore'),
  row('S1', 'the crater turned to plains', MID_MAP, (m) => withTerrain(m, [[2, 7, 'P'], [3, 7, 'P'], [4, 7, 'P'], [2, 8, 'P'], [3, 8, 'P'], [4, 8, 'P']]), 'crater'),
  row('S2', 'ice down to 3 plots, its share allowing 4 to 10', MID_MAP, (m) => withTerrain(m, [[5, 5, 'P'], [4, 5, 'H'], [4, 6, 'H'], [5, 6, 'H'], [5, 7, 'C']]), 'ice'),
  row('S3', 'plains 16 of 47 plots, inside its share yet over a third', SMALL_MAP, (m) => withTerrain(m, [[7, 0, 'P']]), 'plains', 2),
  row('S4', 'a two-plot lake', LAKE_SPECK_3, (m) => withTerrain(m, [[9, 0, 'P']]), 'lake'),
  row('S5', 'a plains region of 16, over ceil(0.12 × 122) = 15', PLAINS_REGION_15, (m) => withTerrain(m, [[9, 3, 'P']]), 'plains'),
  row('S6', 'river at columns 5 and 7 in row 7', MID_MAP, (m) => withTerrain(m, [[5, 7, '~']]), 'row 7'),
  row('S7', 'a river with 0 bends, 3 needed', MID_MAP, (m) => withTerrain(m, [[6, 1, 'P'], [5, 3, 'P'], [7, 6, 'D']]), 'bend'),
  row('S8', '11 of 16 good smithore plots in seams', SEAMS_75, (m) => withGround(m, 'smithore', [[10, 3, 0], [12, 4, 3]]), 'smithore'),
  row('S10', 'crystite 2 beside a peak', MID_MAP, (m) => withGround(m, 'crystite', [[8, 2, 2]]), 'crystite'),
  row('S10', 'crystite 1 outside every ring', MID_MAP, (m) => withGround(m, 'crystite', [[0, 0, 1]]), 'crystite'),
];

describe('checkMap', () => {
  it.each(cases)('T-AC-1: $rule is reported alone ($what)', ({ rule, twin, players, map, mentions }) => {
    expect(rulesBroken(twin, players)).toEqual([]);
    expect(rulesBroken(map, players)).toEqual([rule]);
    expect(details(map, players, rule)).toContain(mentions);
  });

  it('T-AC-1: S6 is reported for a map with no river, not as a river of zero bends', () => {
    const dry = buildMap({ ...MID_SPEC, terrain: MID_SPEC.terrain.map((row) => row.replaceAll('~', 'P')) });

    const broken = rulesBroken(dry, 4);

    expect(broken).toContain('S6');
    expect(broken).not.toContain('S7');
    expect(details(dry, 4, 'S6')).toContain('no river');
  });

  it('T-AC-1: S10 is reported alone for a mineral with no peak', () => {
    const noCrystite = buildMap({ ...MID_SPEC, ground: { ...MID_SPEC.ground, crystite: 0 } });

    expect(rulesBroken(noCrystite, 4)).toEqual(['S10']);
    expect(details(noCrystite, 4, 'S10')).toContain('crystite');
  });
});
