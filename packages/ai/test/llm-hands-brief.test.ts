/**
 * Hands fix 2: the brief marks a lake plot no MULE can be walked to (unreachablePlot), wherever it lists a plot the
 * seat might claim or install on, so Claude stops asking for MULEs the hands must refuse (deep3 diaries).
 */
import { describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, createGame, floorConfig, tileAt, tileIndex, type GameState, type LandGrantPlay, type Playbook, type Strategy } from '@mule/engine';
import { doorTable } from '../src/floor-time.js';
import { unreachablePlot } from '../src/hands/develop.js';
import { landBrief, phaseBrief } from '../src/llm/brief.js';
import { PERSONAS } from '../src/personas.js';
import type { LandDraft } from '../src/playbook/index.js';
import type { Mind } from '../src/value.js';

const mind: Mind = { me: 'p0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader, salt: 3 };
const STRATEGY: Strategy = { kind: 'builder', moneyMaker: 'food', monopolyTarget: null, cashFloor: 0, landTarget: { plots: 6, byMonth: 6 }, stances: {}, reason: 'Grow steady.' };
const MARK = 'lake: no MULE can be installed';

/**
 * Seed 4's four-seat map (route-veto.test.ts's): (10, 0) is lake ringed by lake, (9, 1) lake with a free shore the floor
 * walks to. Not (10, 1): its only shore is a corner, which no walk reaches (hands-refusals fix).
 */
function lakeTable(): { state: GameState; ringed: number; shore: number } {
  const state = createGame({ seed: 4, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: true })) });
  const ringed = tileIndex(state.width, 10, 0);
  const shore = tileIndex(state.width, 9, 1);
  expect([state.tiles[ringed]!.terrain, state.tiles[shore]!.terrain]).toEqual(['lake', 'lake']);
  return { state, ringed, shore };
}

const own = (state: GameState, ...plots: number[]) => plots.forEach((i) => (state.tiles[i]!.owner = 'p0'));

/** The brief's one line that starts with `head`. */
const lineOf = (text: string, head: string) => text.split('\n').find((l) => l.startsWith(head))!;

describe('hands fix 2: the brief marks a lake plot no MULE can be installed on', () => {
  it("hands fix 2: the seat's own plot line marks its unreachable lake plot, and not its reachable one", () => {
    const { state, ringed, shore } = lakeTable();
    own(state, ringed, shore);
    expect([unreachablePlot(state, ringed), unreachablePlot(state, shore)]).toEqual([true, false]);
    const draft: LandDraft = { strategy: STRATEGY, landGrant: { ranked: [], pressShare: { start: 0.8, end: 0.4 }, deny: [], planB: [], claims: 1 } };
    const line = lineOf(landBrief(state, mind, PERSONAS.trader, draft, []).text, 'Seat 0 (you):');
    expect(line).toBe(`Seat 0 (you): 2 plots — plot ${ringed} ${MARK}, plot ${shore} idle`);
  });

  it('hands fix 2: the land plans and the draft ranking mark an unreachable free lake plot, and no reachable plot', () => {
    const { state, ringed, shore } = lakeTable();
    expect([unreachablePlot(state, ringed), unreachablePlot(state, shore)]).toEqual([true, false]);
    const landGrant: LandGrantPlay = { ranked: [{ plot: ringed, value: 40 }, { plot: shore, value: 30 }], pressShare: { start: 0.8, end: 0.4 }, deny: [], planB: [], claims: 1 };
    const text = landBrief(state, mind, PERSONAS.trader, { strategy: STRATEGY, landGrant }, []).text;
    expect(lineOf(text, 'Ranked:')).toBe(`Ranked: plot ${ringed} ${MARK} (40 cr), plot ${shore} (30 cr)`);
    // Every plot a plan names is marked exactly when no MULE can be walked to it: no shore stand, or no walk from any door.
    const noWalk = (plot: number) => [...doorTable(state, floorConfig()).values()].every((walks) => walks[plot]!.seconds === Infinity);
    const plans = text.slice(text.indexOf('Land plans for this month'), text.indexOf('Your draft land grant:'));
    const named = [...plans.matchAll(/plot (\d+)( lake: no MULE can be installed)? \(/g)];
    expect(named.length).toBeGreaterThan(0);
    for (const [, plot, mark] of named) expect(!!mark, `plot ${plot}`).toBe(unreachablePlot(state, Number(plot)) || noWalk(Number(plot)));
  });

  it("hands fix 2: the draft development's route marks an install on an unreachable lake plot, and not one on a reachable plot", () => {
    const { state, ringed, shore } = lakeTable();
    own(state, ringed, shore);
    const route: NonNullable<Playbook['development']>['route'] = [
      { act: 'buyMule' },
      { act: 'outfit', outfit: 'water' },
      { act: 'install', plot: ringed },
      { act: 'buyMule' },
      { act: 'outfit', outfit: 'water' },
      { act: 'install', plot: shore },
      { act: 'pub' },
    ];
    const draft: Playbook = { v: 1, seat: 'p0', month: 1, phase: 'development', strategy: STRATEGY, development: { route, timeBudgetMs: 30_000, ifSoldOut: 'pub' }, by: 'engine' };
    const text = phaseBrief(state, mind, PERSONAS.trader, draft, 'development', []).text;
    expect(lineOf(text, 'Route:')).toBe(
      `Route: buy a MULE, outfit it for Water, install it on plot ${ringed} (${MARK}), buy a MULE, outfit it for Water, install it on plot ${shore}, the pub.`,
    );
  });
});
