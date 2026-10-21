import { describe, expect, it } from 'vitest';
import { checkMap } from '../src/index.js';
import { buildMap, MID_MAP, MID_SPEC, SMALL_MAP, withGround, withTerrain, type TestMap } from './fixtures/map-fixtures.js';

function rulesBroken(map: TestMap, players: number): string[] {
  return [...new Set(checkMap(map, players).violations.map((v) => v.rule))];
}

function details(map: TestMap, players: number, rule: string): string {
  return checkMap(map, players).violations.filter((v) => v.rule === rule).map((v) => v.detail).join(' | ');
}

const MID = { twin: MID_MAP, players: 4 };

/** Each map is its passing twin plus one change, and breaks exactly one row. */
const cases: { rule: string; twin: TestMap; players: number; map: TestMap; mentions: string }[] = [
  // Smithore 16 -> 11 good plots: 2.75 per player, under the floor of 3 (and the only good under normal).
  { rule: 'F1', ...MID, mentions: '2.75', map: withGround(MID_MAP, 'smithore', [[4, 3, 0], [10, 3, 0], [4, 5, 0], [10, 5, 0], [11, 5, 0]]) },
  // Food 53 -> 47 (normal 48) and water 54 -> 51 (normal 52), both above their floor of 40.
  {
    rule: 'F2',
    ...MID,
    mentions: 'water',
    map: withGround(
      withGround(MID_MAP, 'food', [[0, 0, 0], [5, 0, 0], [10, 0, 0], [0, 5, 0], [5, 5, 0], [10, 5, 0]]),
      'water',
      [[2, 0, 0], [7, 0, 0], [12, 0, 0]],
    ),
  },
  // The top-left seam moves one column right: the corner (0,0) is now 6 steps from good Smithore.
  { rule: 'F3', ...MID, mentions: 'smithore', map: withGround(MID_MAP, 'smithore', [[3, 2, 0], [3, 3, 0], [5, 2, 3], [5, 3, 3]]) },
  // The crater becomes a separate plains region of 6.
  { rule: 'S1', ...MID, mentions: 'crater', map: withTerrain(MID_MAP, [[2, 7, 'P'], [3, 7, 'P'], [4, 7, 'P'], [2, 8, 'P'], [3, 8, 'P'], [4, 8, 'P']]) },
  // Ice 8 -> 3 plots (its share allows 4 to 10); the five go to plains, hills and crater.
  { rule: 'S2', ...MID, mentions: 'ice', map: withTerrain(MID_MAP, [[5, 5, 'P'], [4, 5, 'H'], [4, 6, 'H'], [5, 6, 'H'], [5, 7, 'C']]) },
  // Plains 16 of 47 plots: inside its share, over a third.
  { rule: 'S3', twin: SMALL_MAP, players: 2, mentions: 'plains', map: withTerrain(SMALL_MAP, [[7, 0, 'P']]) },
  // A two-plot lake on the top edge, cut from the plains.
  { rule: 'S4', ...MID, mentions: 'lake', map: withTerrain(MID_MAP, [[7, 0, 'L'], [8, 0, 'L']]) },
  // Two lake plots join the right plains region: 16 plots, over ceil(0.12 × 122) = 15.
  { rule: 'S5', ...MID, mentions: 'plains', map: withTerrain(MID_MAP, [[10, 2, 'P'], [9, 3, 'P']]) },
  // Row 7 holds river at columns 5 and 7.
  { rule: 'S6', ...MID, mentions: 'row 7', map: withTerrain(MID_MAP, [[5, 7, '~']]) },
  // Each two-plot row loses a plot, so the river steps diagonally: 0 bends, 3 needed.
  { rule: 'S7', ...MID, mentions: 'bend', map: withTerrain(MID_MAP, [[6, 1, 'P'], [5, 3, 'P'], [7, 6, 'D']]) },
  // Two seams scatter into isolated plots: 8 of 16 good Smithore plots touch another.
  {
    rule: 'S8',
    ...MID,
    mentions: 'smithore',
    map: withGround(MID_MAP, 'smithore', [[4, 2, 0], [3, 3, 0], [5, 2, 3], [2, 4, 3], [10, 2, 0], [11, 3, 0], [9, 2, 3], [12, 4, 3]]),
  },
  // A plot next to the Crystite peak at (8,1) is rated 2 instead of 3.
  { rule: 'S10', ...MID, mentions: 'crystite', map: withGround(MID_MAP, 'crystite', [[8, 2, 2]]) },
];

describe('checkMap', () => {
  it.each(cases)('T-AC-1: $rule is reported alone', ({ rule, twin, players, map, mentions }) => {
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
