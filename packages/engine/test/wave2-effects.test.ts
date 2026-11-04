import { afterEach, describe, expect, it } from 'vitest';
import { advancePhase, createGame, EVENTS, firePhase, type EventKey, type GameState, type Phase } from '../src/index.js';

type Row = { phases: Partial<Record<Phase, number>>; cap: number };
const allRows = (): [string, Row][] => [...Object.entries(EVENTS.colony), ...Object.entries(EVENTS.player)] as [string, Row][];
const saved = allRows().map(([, row]) => ({ row, phases: { ...row.phases }, cap: row.cap }));
afterEach(() => {
  for (const { row, phases, cap } of saved) Object.assign(row, { phases, cap });
});

/** Only `keys` can fire, each certain in its every phase; every other row at 0. */
function only(...keys: EventKey[]) {
  for (const [k, row] of allRows()) {
    const on = (keys as string[]).includes(k);
    row.phases = Object.fromEntries(Object.keys(row.phases).map((p) => [p, on ? 1 : 0]));
    if (on) row.cap = 1;
  }
}

/** Three players in month 2 (events may fire), no land. */
function monthTwo(): GameState {
  const state = createGame({ seed: 9, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
  state.month = EVENTS.firstMonth;
  return state;
}

/** Advances to the next time the game enters `phase`. */
function toPhase(state: GameState, phase: Phase) {
  do advancePhase(state);
  while (state.phase !== phase);
}

describe('T-AC-3 (HC-5): a wave-2 event never drives cash or goods below 0', () => {
  it('a tax on cash 0, 9 and 250 takes 0, 0 and 25, and still fires with only the one effect', () => {
    only('federationTax');
    const state = monthTwo();
    state.players.forEach((p, i) => (p.money = [0, 9, 250][i]!));
    const [tax] = firePhase(state, 'planning');
    expect(tax).toMatchObject({ key: 'federationTax', effects: [{ on: 'p2', what: 'money', delta: -25 }] });
    expect(state.players.map((p) => p.money)).toEqual([0, 9, 225]);
    expect(state.monthEvents).toEqual([tax]);
  });

  it('a theft, rats or an accountant on a player with nothing to take fires nothing and leaves 0', () => {
    only('muleTheft', 'ratsInSilo', 'crookedAccountant');
    const state = monthTwo();
    for (const p of state.players) Object.assign(p, { money: 0, stock: { ...p.stock, food: 0 } });
    expect(firePhase(state, 'development')).toEqual([]);
    expect(firePhase(state, 'upkeep')).toEqual([]);
    expect(state.players.map((p) => [p.money, p.stock.food])).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
  });

  it('rats and the accountant fire only when they take at least 1: 1 Food and 9 credits are left alone, 3 and 10 lose 1', () => {
    only('ratsInSilo', 'crookedAccountant');
    const state = monthTwo();
    state.players.forEach((p, i) => Object.assign(p, { money: [9, 10, 0][i], stock: { ...p.stock, food: [1, 3, 0][i] } }));
    const fired = firePhase(state, 'upkeep');
    expect(fired.map((e) => [e.key, e.player, e.effects])).toEqual([
      ['ratsInSilo', 'p1', [{ on: 'p1', what: 'food', delta: -1 }]],
      ['crookedAccountant', 'p1', [{ on: 'p1', what: 'money', delta: -1 }]],
    ]);
    expect(state.players.map((p) => [p.money, p.stock.food])).toEqual([
      [9, 1],
      [9, 2],
      [0, 0],
    ]);
  });
});

describe('T-AC-5 (RULE-4): one Medicine cures being sick this turn, whatever the cause', () => {
  it("a carried-over epidemic and a sickness roll together take one Medicine, and the player is not sick", () => {
    only('sickness');
    const state = monthTwo();
    const p = state.players[0]!;
    Object.assign(p, { sickNext: true, stock: { ...p.stock, medicine: 1 } });
    toPhase(state, 'development');
    expect([p.sick, p.sickNext, p.stock.medicine]).toEqual([false, false, 0]);
  });
});

describe('RULE-3 (AM-1 6a): inheritances in one phase are ranked once, by wealth before any payout', () => {
  it('four players inheriting in the same planning get 300 / 233 / 166 / 100 by their starting wealth', () => {
    only('inheritance');
    const state = createGame({ seed: 9, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
    state.month = EVENTS.firstMonth;
    // Close enough that an earlier payout would reorder later ranks: p0's 100 would lift it past p2.
    state.players.forEach((p, i) => (p.money = [500, 520, 540, 560][i]!));
    const fired = firePhase(state, 'planning');
    expect(fired.map((e) => [e.player, e.effects])).toEqual(
      [300, 233, 166, 100].map((amount, i) => [`p${i}`, [{ on: `p${i}`, what: 'money', delta: amount }]]),
    );
    expect(state.players.map((p) => p.money)).toEqual([800, 753, 706, 660]);
  });
});

describe('T-AC-5 (RULE-4): an epidemic sickens for two developments unless a Medicine cures it', () => {
  it('without Medicine sick this development and the next; with one, cured and the Medicine gone', () => {
    only('epidemic');
    const state = monthTwo();
    state.players.forEach((p, i) => (p.stock.medicine = [0, 1, 0][i]!));
    toPhase(state, 'development');
    expect(state.monthEvents.map((e) => e.key)).toEqual(['epidemic']);
    expect(state.players.map((p) => [p.sick, p.sickNext, p.stock.medicine])).toEqual([
      [true, true, 0],
      [false, false, 0],
      [true, true, 0],
    ]);

    only();
    // p2 buys a Medicine in next month's land grant, after the month end's spoilage; p0 does not.
    toPhase(state, 'landGrant');
    state.players[2]!.stock.medicine = 1;
    toPhase(state, 'development');
    expect(state.monthEvents).toEqual([]);
    expect(state.players.map((p) => [p.sick, p.sickNext, p.stock.medicine])).toEqual([
      [true, false, 0],
      [false, false, 0],
      [false, false, 0],
    ]);

    // The development after that, the epidemic is over.
    toPhase(state, 'development');
    expect(state.players.map((p) => p.sick)).toEqual([false, false, false]);
  });
});
