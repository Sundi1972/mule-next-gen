import { describe, expect, it } from 'vitest';
import { advancePhase, callStrike, COLONY, colonyScore, colonyScoreOf, GOOD_CONFIG, HAPPINESS, monthLedger, PRESTIGE, RuleError, type GameState } from '@mule/engine';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

/** A started game in month 1's planning with Heiko (s1) governing and no election open. */
function governed() {
  const { ctx } = fakeContext();
  const game = new MuleGame(ctx, 7, { politics: true });
  game.start(seats);
  const state = engineOf(game);
  state.politics = { ...state.politics!, governor: 's1', election: null };
  return { game, state };
}

function refusal(run: () => void): string {
  try {
    run();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return 'accepted';
}

describe('the colony at the table', () => {
  it('AM-12: lastScore is the colony score as the last month ended, from its own snapshot (air included); none in month 1', () => {
    const { game, state } = governed();
    expect(game.viewFor(null).colony!.lastScore ?? null, 'month 1 has no last month end').toBeNull();
    state.month = 2;
    const end = { month: 1, wealth: 9_000, prestige: 3, happiness: 70, air: 12 };
    state.colony!.monthEnds = [end];
    state.air = 80; // the air now is not the air that month ended at
    const expected = colonyScoreOf({ wealth: end.wealth, air: end.air, prestige: end.prestige, happiness: end.happiness }).total;
    for (const seat of [null, 's1']) expect(game.viewFor(seat).colony!.lastScore, `seen by ${seat ?? 'the TV'}`).toBe(expected);
    state.colony!.monthEnds = [{ ...end, happiness: null }];
    expect(game.viewFor(null).colony!.lastScore, 'no mood yet, no score').toBeNull();

    // At the month end (upkeep) this month's snapshot is already in: lastScore is still the month before's.
    state.phase = 'upkeep';
    const thisEnd = { month: 2, wealth: 12_000, prestige: 5, happiness: 40, air: 30 };
    state.colony!.monthEnds = [end, thisEnd];
    expect(game.viewFor(null).colony!.lastScore, "the month end compares with last month's, not its own").toBe(expected);
  });

  it('AM-12 (RULE-25): every screen carries the colony score every month, as the state scores now, not only at game over', () => {
    const { game, state } = governed();
    expect(state.phase).not.toBe('gameOver');
    const now = colonyScore(state)!;
    expect(now.total).toBeGreaterThan(0);
    for (const seat of [null, 's1', 's2']) expect(game.viewFor(seat).colony!.score, `seen by ${seat ?? 'the TV'}`).toEqual(now);
    state.colony!.happiness = 0;
    expect(game.viewFor(null).colony!.score, 'it follows the state, not a stored total').toEqual(colonyScore(state));
    expect(game.viewFor(null).colony!.score!.total).toBeLessThan(now.total);
  });

  it("B-AC-23: the Governor's phone commissions and another phone donates; every screen's colony view shows the project and the plaque at once, and a non-Governor's commission is refused with RULE-22's message", () => {
    const { game, state } = governed();
    expect(refusal(() => game.handle('s2', { type: 'commission', id: 'hospital' }))).toBe('Only the Governor commissions for the colony');
    expect(game.viewFor(null).colony!.projects).toEqual([]);

    game.handle('s1', { type: 'commission', id: 'hospital' });
    state.players.find((p) => p.id === 's2')!.stock.electronics = 1;
    const price = state.store.posted.electronics;
    game.handle('s2', { type: 'donate', id: 'hospital', credits: 100, goods: { electronics: 1 } });

    for (const viewer of [null, 's1', 's2']) {
      const [project] = game.viewFor(viewer).colony!.projects;
      expect(project, `${viewer ?? 'the TV'}'s view`).toMatchObject({
        id: 'hospital',
        stage: 'commissioned',
        buildMonths: PRESTIGE.hospital.buildMonths,
        funded: { credits: 100, goods: { electronics: 1 } },
        plaque: [{ playerId: 's2', value: 100 + price }],
      });
    }
    const hospital = game.viewFor(null).colony!.catalogue.find((c) => c.id === 'hospital')!;
    expect(hospital).toMatchObject({ commissionable: false, why: 'The colony already has a Hospital' });
  });

  it('T-AC-29: every screen gets the same colony view, and it carries no ballot and no private hand', () => {
    const { game, state } = governed();
    state.politics = { ...state.politics!, council: { stage: 'ballot', clockMs: 0, proposal: { kind: 'enact', law: 'landTax', setting: 10 }, proposer: 's1', ballots: { s1: true, s2: false }, done: [], result: null } };
    const views = [null, 's1', 's2'].map((viewer) => game.viewFor(viewer).colony);
    expect(views[0]).not.toBeNull();
    for (const view of views) expect(view).toEqual(views[0]);
    const text = JSON.stringify(views[0]);
    expect(text).not.toMatch(/ballot|stock|drone|analysed/i);
  });

  it('B-AC-24: from 60, a month ending with two goods short and the air at 70 shows every screen happiness 55, Restless: the mood falls, by no more than maxStep', () => {
    const { game, state } = governed();
    expect(state.colony!.happiness).toBe(60);
    while (state.phase !== 'auction') advancePhase(state);
    state.air = 70;
    state.store.stock.food = 0;
    state.store.stock.water = 0;
    advancePhase(state);
    expect(state.history.at(-1)!.shortages.length, 'two goods short').toBe(2);
    for (const viewer of [null, 's1', 's2']) {
      expect(game.viewFor(viewer).colony!.gauges, `${viewer ?? 'the TV'}'s view`).toMatchObject({ happiness: 60 - HAPPINESS.maxStep, band: 'restless' });
    }
  });

  it("B-AC-25: the Governor's phone pays off a Food strike from the fund; the ledger shows strikePay, every screen shows it paid, the news names it, and another phone's payment is refused with RULE-26's message", () => {
    const { game, state } = governed();
    state.treasury.money = 400;
    callStrike(state, 'food');
    expect(game.viewFor(null).colony!.strike).toEqual({ good: 'food', cost: COLONY.strike.cost, paid: false });
    expect(refusal(() => game.handle('s2', { type: 'payStrike' }))).toBe('Only the Governor pays the strikers');

    game.handle('s1', { type: 'payStrike' });
    expect(state.treasury.money).toBe(400 - COLONY.strike.cost);
    expect(monthLedger(state)!.out.strikePay).toBe(COLONY.strike.cost);
    for (const viewer of [null, 's1', 's2']) expect(game.viewFor(viewer).colony!.strike).toEqual({ good: 'food', cost: COLONY.strike.cost, paid: true });
    expect(game.viewFor(null).news).toContain(`Heiko pays the food strikers ${COLONY.strike.cost} cr.`);
  });

  it("B-AC-25: with no strike this month the colony view shows none, and last month's strike is gone from it", () => {
    const { game, state } = governed();
    expect(game.viewFor(null).colony!.strike).toBeNull();
    callStrike(state, 'food');
    state.month++;
    expect(game.viewFor(null).colony!.strike, "last month's strike").toBeNull();
  });

  it('B-AC-25: the news names the struck good in words: a Rare earth strike reads "rare earth"', () => {
    const { game, state } = governed();
    state.treasury.money = 400;
    callStrike(state, 'rareEarth');
    game.handle('s1', { type: 'payStrike' });
    expect(game.viewFor(null).news).toContain(`Heiko pays the rare earth strikers ${COLONY.strike.cost} cr.`);
  });

  it("B-AC-26: the Governor's phone sets the colony's bid for the park's site; every screen's colony view shows it, and another phone is refused with RULE-28's message", () => {
    const { game } = governed();
    game.handle('s1', { type: 'commission', id: 'park' });
    expect(game.viewFor(null).colony!.projects[0]!.maxBid, 'a new object has no bid').toBeNull();
    expect(refusal(() => game.handle('s2', { type: 'setSiteBid', id: 'park', maxBid: 300 }))).toBe("Only the Governor sets the colony's bid");

    game.handle('s1', { type: 'setSiteBid', id: 'park', maxBid: 300 });
    for (const viewer of [null, 's1', 's2']) expect(game.viewFor(viewer).colony!.projects[0]!.maxBid, `${viewer ?? 'the TV'}'s view`).toBe(300);
    game.handle('s1', { type: 'setSiteBid', id: 'park', maxBid: null });
    expect(game.viewFor(null).colony!.projects[0]!.maxBid, 'the Governor can take the bid back').toBeNull();
  });

  it("C35, AM-13: the colony view's refPrice is the store's price today for every good the catalogue needs, and a gift's plaque grows by exactly units × that price", () => {
    const { game, state } = governed();
    const needed = [...new Set(Object.values(PRESTIGE).flatMap((row) => Object.keys(row.goods)))].sort();
    // The store's posted price moves with the market; a gift is valued at it on the day (PM ruling, option B).
    for (const good of needed) state.store.posted[good as keyof typeof state.store.posted] += 37;
    const view = game.viewFor('s2').colony!;
    expect(Object.keys(view.refPrice ?? {}).sort()).toEqual(needed);
    for (const good of needed) expect(view.refPrice![good as keyof typeof view.refPrice], good).toBe(state.store.posted[good as keyof typeof state.store.posted]);
    for (const viewer of [null, 's1']) expect(game.viewFor(viewer).colony!.refPrice, `${viewer ?? 'the TV'}'s view`).toEqual(view.refPrice);

    game.handle('s1', { type: 'commission', id: 'hospital' });
    state.players.find((p) => p.id === 's2')!.stock.electronics = 1;
    game.handle('s2', { type: 'donate', id: 'hospital', credits: 50, goods: { electronics: 1 } });
    const [project] = game.viewFor('s2').colony!.projects;
    expect(project!.plaque).toEqual([{ playerId: 's2', value: 50 + 1 * view.refPrice!.electronics! }]);
  });

  it('the colony view is null with politics off', () => {
    const { ctx } = fakeContext();
    const game = new MuleGame(ctx, 7, { politics: false });
    game.start(seats);
    expect(game.viewFor(null).colony).toBeNull();
  });
});
