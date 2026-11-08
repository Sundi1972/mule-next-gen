import { describe, expect, it } from 'vitest';
import { createGame, lawImpact, observe, POLITICS, type GameState, type LawId } from '@mule/engine';
import { lawWorth, lineWorth, overruleWorth } from '../src/politics-value.js';

const SEATS = ['ai0', 'ai1', 'ai2'];

/** Month 2's planning, no election; ai0 holds three plots, so a land tax costs it something. */
function planning(): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: true })) });
  state.month = 2;
  state.politics = { ...state.politics!, election: null };
  for (const t of state.tiles.filter((t) => t.owner === null && t.terrain !== 'store').slice(0, 3)) t.owner = 'ai0';
  return state;
}

describe('politics valuation (WS7 slices 3-5, WS1 values)', () => {
  it('lawWorth: an enact is worth minus what the law costs the seat a month; a repeal is worth what the law in force costs it', () => {
    const state = planning();
    const law: LawId = 'landTax';
    const setting = POLITICS.laws[law].settings[0]!;
    const obs = observe(state, 'ai0');
    const cost = lawImpact(obs, { kind: 'enact', law, setting })['ai0']?.cost ?? 0;
    expect(cost, 'the case: a land tax costs a plot holder').toBeGreaterThan(0);
    expect(lawWorth(obs, 'ai0', { kind: 'enact', law, setting })).toBe(-cost);
    // Not in force: repealing it saves nothing.
    expect(lawWorth(obs, 'ai0', { kind: 'repeal', law })).toBe(0);
    state.politics!.laws[law] = { setting, since: state.month };
    const inForce = observe(state, 'ai0');
    expect(lawWorth(inForce, 'ai0', { kind: 'repeal', law })).toBe(lawImpact(inForce, { kind: 'enact', law, setting })['ai0']?.cost ?? 0);
  });

  it("slice 5's stubs take WS7's final contracts: a line's credits, an overrule's target (slice 4's values are real: sabotage-values.test.ts)", () => {
    const obs = observe(planning(), 'ai0');
    expect(lineWorth(obs, 'ai0', 'welfare', 100)).toBe(0);
    expect(overruleWorth(obs, 'ai1', 'budget')).toBe(0);
    expect(overruleWorth(obs, 'ai0')).toBe(0);
  });
});
