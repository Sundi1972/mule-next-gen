import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, observe, type GameState } from '@mule/engine';
import { outlook } from '../src/outlook.js';
import { AiSeat } from '../src/seat.js';

const fourSeats = (seed: number) => createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });

/** A land grant in its third sweep, where any free plot is otherwise wanted, with `idle` undeveloped plots given to ai0. */
function grantWithIdleLand(idle: number, money: number): GameState {
  const state = fourSeats(3);
  while (state.phase !== 'landGrant') advancePhase(state);
  state.grant!.sweep = 2;
  const lit = state.grant!.order[state.grant!.step];
  const spare = state.tiles.map((t, i) => ({ t, i })).filter(({ t, i }) => !t.owner && t.terrain !== 'store' && i !== lit);
  for (const { t } of spare.slice(0, idle)) t.owner = 'ai0';
  state.players[0]!.money = money;
  return state;
}

const tycoon = () => new AiSeat({ id: 'ai0', name: 'AI0', persona: 'trader', level: 'tycoon', seed: 11 });

describe('land claims', () => {
  it('T-AC-1: a seat holding idle land it cannot develop does not bid for a lit plot', () => {
    // Tycoon leads 3 MULEs a month; 3 idle plots and 100 credits can't develop them.
    expect(tycoon().onLit(grantWithIdleLand(3, 100))).toBeNull();
    // Negative cases: no idle land, or the money to develop it, and it bids as before.
    expect(tycoon().onLit(grantWithIdleLand(0, 100))).toBeTypeOf('number');
    expect(tycoon().onLit(grantWithIdleLand(3, 5_000))).toBeTypeOf('number');
  });
});

/** Month 1's development, with the colony's Water (store and every depot) set to `water` units. */
function developmentWithWater(water: number): GameState {
  const state = fourSeats(3);
  while (state.phase !== 'development') advancePhase(state);
  state.store.stock.water = water;
  for (const p of state.players) p.stock.water = 0;
  return state;
}

describe('shortage foresight', () => {
  it('T-AC-5: a seat prices Water at what colonists would pay once its outlook shows Water running short', () => {
    // Colonists pay at most 120 a unit, the store adds 10%: 120 / 1.1 is about 109.
    const ceiling = 120 / 1.1;
    const short = outlook(observe(developmentWithWater(0), 'ai0'), 'ai0', { lookAhead: true });
    expect(short.later('water')).toBeGreaterThanOrEqual(ceiling);
    // Negative case: with Water to spare the forecast stays a market price, far under the ceiling.
    const plenty = outlook(observe(developmentWithWater(300), 'ai0'), 'ai0', { lookAhead: true });
    expect(plenty.later('water')).toBeLessThan(ceiling / 2);
  });
});
