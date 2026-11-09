import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  applyRumours,
  createGame,
  createRng,
  endRumours,
  GOODS,
  observe,
  orderSabotage,
  postPrices,
  POLITICS,
  seedOf,
  type GameState,
  type Good,
  type SabotageOrder,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa'];

/** Sabotage is built off (AM-2): every test here switches it on and puts the config's value back after. */
let savedOn: boolean;
beforeEach(() => {
  savedOn = POLITICS.sabotage.on;
  POLITICS.sabotage.on = true;
});
afterEach(() => {
  POLITICS.sabotage.on = savedOn;
});

/** Month 2, no election, rumour orders placed by `by`; the prices are posted as the auction posts them. */
function month(seed: number, orders: { by: string; good: Good; dir: 'up' | 'down' }[] = []): GameState {
  const state = createGame({ seed, players: SEATS.map((id) => ({ id, name: id[0]!.toUpperCase() + id.slice(1), isAi: false })) });
  state.month = 2;
  state.politics = { ...state.politics!, governor: 'lena', election: null };
  for (const { by, good, dir } of orders) orderSabotage(state, by, { kind: 'rumour', good, dir });
  return state;
}

/** Marks every pending order worked and public-free, as resolveSabotage would for a rumour that takes and is not seen. */
function worked(state: GameState): void {
  for (const o of state.politics!.sabotage) Object.assign(o, { outcome: 'done', worked: true, victim: null });
}

/** The first seed in 1..400 where one rumour on food draws works and is not seen (the draws of S4-RULE-3, read from its stream). */
function seedWhereRumourTakes(want: boolean): number {
  for (let seed = 1; seed <= 400; seed++) {
    const state = month(seed, [{ by: 'lena', good: 'food', dir: 'up' }]);
    const rng = createRng(seedOf(seed, state.month, String(POLITICS.sabotage.streamSalt)));
    const takes = rng.next() < POLITICS.sabotage.orders.rumour.success;
    const seen = rng.next() < POLITICS.sabotage.orders.rumour.detect;
    if (takes === want && !seen) return seed;
  }
  throw new Error('no seed draws that pair');
}

/** What S4-RULE-4 says a posted price becomes under a net shift: rounded, at least 1. */
const shifted = (from: number, net: number): number => Math.max(1, Math.round(from * (1 + net)));

describe('market rumours', () => {
  it('S4-T-AC-6: after endRumours every posted price equals postPrices\'s, whichever goods were rumoured', () => {
    const state = month(5, [
      { by: 'lena', good: 'food', dir: 'up' },
      { by: 'brix', good: 'energy', dir: 'down' },
    ]);
    worked(state);
    postPrices(state);
    const posted = { ...state.store.posted };
    applyRumours(state);
    expect(state.store.posted.food).toBe(shifted(posted.food, POLITICS.sabotage.orders.rumour.shift));
    expect(state.store.posted.energy).toBe(shifted(posted.energy, -POLITICS.sabotage.orders.rumour.shift));
    for (const good of GOODS.filter((g) => g !== 'food' && g !== 'energy')) expect(state.store.posted[good]).toBe(posted[good]);
    endRumours(state);
    expect(state.store.posted).toEqual(posted);
    expect(state.politics!.rumoured).toEqual([]);
  });

  it('S4-T-AC-6: a computer seat is not told the price a worked rumour moved from (HC-4): observe() keeps the rumoured goods and drops `from`; the engine state keeps it for endRumours', () => {
    const state = month(5, [{ by: 'lena', good: 'food', dir: 'up' }]);
    worked(state);
    postPrices(state);
    const posted = state.store.posted.food;
    applyRumours(state);
    expect(state.politics!.rumoured).toEqual([{ good: 'food', from: posted }]);
    for (const seat of SEATS) {
      const rumoured = observe(state, seat).politics!.rumoured;
      expect(rumoured.map((r) => r.good), seat).toEqual(['food']);
      for (const entry of rumoured) expect(Object.keys(entry), seat).toEqual(['good']);
    }
    expect(state.politics!.rumoured, 'the state itself is untouched').toEqual([{ good: 'food', from: posted }]);
  });

  it('S4-T-AC-6: the auction ending on an observed copy (an AI seat looking ahead) leaves every posted price a number', () => {
    const state = month(5, [{ by: 'lena', good: 'food', dir: 'up' }]);
    worked(state);
    postPrices(state);
    applyRumours(state);
    const seen = observe(state, 'brix');
    endRumours(seen);
    for (const good of GOODS) expect(Number.isFinite(seen.store.posted[good]), good).toBe(true);
  });

  it('S4-T-AC-6: two opposite rumours on one good cancel, and two on the same side add their shifts', () => {
    const { shift } = POLITICS.sabotage.orders.rumour;
    const cancel = month(5, [
      { by: 'lena', good: 'food', dir: 'up' },
      { by: 'brix', good: 'food', dir: 'down' },
    ]);
    worked(cancel);
    postPrices(cancel);
    const posted = { ...cancel.store.posted };
    applyRumours(cancel);
    expect(cancel.store.posted).toEqual(posted);
    endRumours(cancel);
    expect(cancel.store.posted).toEqual(posted);

    const add = month(5, [
      { by: 'lena', good: 'water', dir: 'up' },
      { by: 'brix', good: 'water', dir: 'up' },
    ]);
    worked(add);
    postPrices(add);
    const water = add.store.posted.water;
    applyRumours(add);
    expect(add.store.posted.water).toBe(shifted(water, 2 * shift));
    expect(add.politics!.rumoured).toEqual([{ good: 'water', from: water }]);
    endRumours(add);
    expect(add.store.posted.water).toBe(water);
  });

  it('S4-T-AC-6: the price is put back from the recorded price, never by dividing the shift out (rounding)', () => {
    const state = month(5, [{ by: 'lena', good: 'food', dir: 'down' }]);
    worked(state);
    postPrices(state);
    // 10 x 0.75 = 7.5 rounds to 8; dividing 0.75 back out would give 10.67.
    state.store.posted.food = 10;
    applyRumours(state);
    expect(state.store.posted.food).toBe(shifted(10, -POLITICS.sabotage.orders.rumour.shift));
    expect(state.politics!.rumoured).toEqual([{ good: 'food', from: 10 }]);
    endRumours(state);
    expect(state.store.posted.food).toBe(10);
  });

  it('S4-T-AC-6: a rumour that did not work, and a month with none, move nothing; a price never falls below 1', () => {
    const taken = month(5, [{ by: 'lena', good: 'food', dir: 'up' }]);
    worked(taken);
    postPrices(taken);
    applyRumours(taken);
    expect(taken.politics!.rumoured).toHaveLength(1);
    const failed = month(5, [{ by: 'lena', good: 'food', dir: 'up' }]);
    Object.assign(failed.politics!.sabotage[0]!, { outcome: 'failed', worked: false, victim: null });
    postPrices(failed);
    const posted = { ...failed.store.posted };
    applyRumours(failed);
    expect(failed.store.posted).toEqual(posted);
    expect(failed.politics!.rumoured).toEqual([]);
    endRumours(failed);
    expect(failed.store.posted).toEqual(posted);

    const low = month(5, [{ by: 'lena', good: 'food', dir: 'down' }]);
    worked(low);
    low.store.posted.food = 1;
    applyRumours(low);
    expect(low.store.posted.food).toBe(1);
    // Three down rumours take the multiplier to 1 - 3 x shift; at a price of 1 the rounding reaches 0 and only the floor holds it.
    const three = month(5, [
      { by: 'lena', good: 'food', dir: 'down' },
      { by: 'brix', good: 'food', dir: 'down' },
      { by: 'ossa', good: 'food', dir: 'down' },
    ]);
    worked(three);
    three.store.posted.food = 1;
    expect(Math.round(1 * (1 - 3 * POLITICS.sabotage.orders.rumour.shift))).toBeLessThanOrEqual(0);
    applyRumours(three);
    expect(three.store.posted.food).toBe(1);
  });

  it('S4-T-AC-6: only this month\'s worked rumours shift: the same order of an earlier month does nothing', () => {
    const state = month(5, [{ by: 'lena', good: 'food', dir: 'up' }]);
    worked(state);
    postPrices(state);
    const posted = { ...state.store.posted };
    (state.politics!.sabotage[0] as SabotageOrder).month = 1;
    applyRumours(state);
    expect(state.store.posted).toEqual(posted);
    (state.politics!.sabotage[0] as SabotageOrder).month = 2;
    applyRumours(state);
    expect(state.store.posted.food).not.toBe(posted.food);
  });

  it('S4-T-AC-6: applying twice does not shift twice, and a politics-off game is untouched', () => {
    const state = month(5, [{ by: 'lena', good: 'food', dir: 'up' }]);
    worked(state);
    postPrices(state);
    const once = (() => {
      applyRumours(state);
      return state.store.posted.food;
    })();
    applyRumours(state);
    expect(state.store.posted.food).toBe(once);
    const off = createGame({ seed: 5, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics: false });
    postPrices(off);
    const posted = { ...off.store.posted };
    applyRumours(off);
    endRumours(off);
    expect(off.store.posted).toEqual(posted);
  });

  // Red until Task S4-1.10 wires game.ts (resolveSabotage before production; applyRumours after postPrices; endRumours after endAuction).
  it('S4-B-AC-5: a worked rumour on Food, up, opens the auction\'s Food lines from the shifted price; after the auction the posted price is what it was', () => {
    const seed = seedWhereRumourTakes(true);
    const control = month(seed);
    const rumoured = month(seed, [{ by: 'lena', good: 'food', dir: 'up' }]);
    for (const state of [control, rumoured]) while (state.phase !== 'auction') advancePhase(state);
    const base = control.store.posted.food;
    expect(rumoured.politics!.sabotage[0]).toMatchObject({ outcome: 'done', worked: true });
    const rumourEvent = rumoured.monthEvents.find((e) => e.key === 'marketRumour')!;
    expect(rumourEvent.line).toBe(`A rumour: Food opens ${Math.round(POLITICS.sabotage.orders.rumour.shift * 100)}% higher at the auction.`);
    expect(rumoured.store.posted.food).toBe(shifted(base, POLITICS.sabotage.orders.rumour.shift));
    expect(rumoured.politics!.rumoured).toEqual([{ good: 'food', from: base }]);
    // Food comes up first: its store lines are built from the shifted price.
    expect(control.auction!.good).toBe('food');
    expect(rumoured.auction!.good).toBe('food');
    expect(rumoured.auction!.storeSell).toBeGreaterThan(control.auction!.storeSell);
    for (const state of [control, rumoured]) advancePhase(state);
    expect(rumoured.phase).toBe('upkeep');
    expect(rumoured.store.posted.food).toBe(control.store.posted.food);
    expect(rumoured.store.posted).toEqual(control.store.posted);
    expect(rumoured.politics!.rumoured).toEqual([]);
  });

  it('S4-B-AC-5, negative: a failed rumour moves nothing', () => {
    const seed = seedWhereRumourTakes(false);
    const control = month(seed);
    const failed = month(seed, [{ by: 'lena', good: 'food', dir: 'up' }]);
    for (const state of [control, failed]) while (state.phase !== 'auction') advancePhase(state);
    expect(failed.politics!.sabotage[0]).toMatchObject({ outcome: 'failed', worked: false });
    expect(failed.store.posted).toEqual(control.store.posted);
    expect(failed.auction!.storeSell).toBe(control.auction!.storeSell);
    expect(failed.politics!.rumoured).toEqual([]);
  });
});
