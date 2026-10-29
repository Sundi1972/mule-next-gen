import { describe, expect, it } from 'vitest';
import { foodShare, needsOf, player, POLLUTION, RuleError, scoreParts, type GameState } from '@mule/engine';
import type { MuleView, PlayerView } from '@mule/protocol';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/** Two phones and the board: every kind of viewer. */
const VIEWERS = ['s1', 's2', null] as const;
/** A posted Food price far beyond what the colonists' wages pay (UPKEEP.colonistBudget). */
const DEAR_FOOD = 10_000;
/** The air set in each month's goods auction, after production cleans it: smoggy in month 1, toxic in month 2 (POLLUTION.bands). */
const AIR_IN: Record<number, number> = { 1: band('smoggy'), 2: band('toxic') };
/** Ten minutes: far longer than any phase clock, so a phase still up after it has none. */
const LONG_WAIT_MS = 600_000;

function band(name: string): number {
  return POLLUTION.bands.find((b) => b.name === name)!.from;
}
const stateOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;
const worthIn = (view: MuleView) => Object.fromEntries(view.players.map((p) => [p.id, p.worth]));
const lastWorthIn = (view: MuleView) => Object.fromEntries(view.players.map((p) => [p.id, p.lastWorth]));
const conditionsIn = (view: MuleView) => Object.fromEntries(view.players.map((p) => [p.id, p.condition]));

/** What each viewer saw at one month's end, as it opened. */
interface MonthEnd {
  month: number;
  views: Map<string | null, MuleView>;
  /** Each player's condition as every screen showed it at the last look in that month's development. */
  developed: Record<string, PlayerView['condition']>;
  /** s1's food share as the engine reads it at the month's end, after the colonists ate. */
  liveShare: number;
  /** Each player's Food need as the engine reads it at the month's end: the plots haven't changed since development. */
  needs: Record<string, number>;
}

/**
 * Plays a three-month game on the fake clock, seed 7, so months 1 and 2 both have a month end; the last month's end
 * is game over. Every human presses Ready in planning and at each month's end, as their phones would. s1 claims the
 * first plot lit in each land grant, so the players' worths differ. In month 2's planning s1 is left one Food, short of
 * what its household eats, so the month's condition says hungry.
 */
function playThreeMonths(options: { dearFoodIn?: number } = {}): { ends: MonthEnd[]; over: MuleView; state: GameState } {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7, { maxMonths: 3, phaseScale: 0.1 });
  game.start(seats);
  const state = stateOf(game);
  const ends: MonthEnd[] = [];
  let developed: MonthEnd['developed'] = {};
  let claimedIn = 0;
  let starvedIn = 0;
  let airedIn = 0;
  for (let n = 0; n < 100_000 && !game.viewFor(null).finished; n++) {
    if (state.phase === 'planning' && state.month === 2 && starvedIn !== 2) {
      player(state, 's1').stock.food = 1;
      starvedIn = 2;
    }
    // Food on the shelf at a price no colonist's wage reaches, in that month's goods auction.
    if (state.phase === 'auction' && state.month === options.dearFoodIn) state.store.posted.food = DEAR_FOOD;
    // Each month's air in its own band, so a month end showing the live air, or one band for all, can't match.
    if (state.phase === 'auction' && AIR_IN[state.month] !== undefined && airedIn !== state.month) {
      state.air = AIR_IN[state.month]!;
      airedIn = state.month;
    }
    if (state.phase === 'development') developed = conditionsIn(game.viewFor(null));
    if (state.phase === 'upkeep' && ends.at(-1)?.month !== state.month) {
      ends.push({ month: state.month, views: new Map(VIEWERS.map((v) => [v, game.viewFor(v)])), developed, liveShare: foodShare(state, 's1'), needs: Object.fromEntries(seats.map((s) => [s.id, needsOf(state, s.id).food])) });
    }
    if (state.phase === 'planning' || state.phase === 'upkeep') readyAll(game);
    // s1 never installs on its plot: as host it starts month 1's waiting development clock (A-1).
    if (game.viewFor(null).clockWaitsFor) game.handle('s1', { type: 'continue' });
    const lit = state.phase === 'landGrant' && claimedIn !== state.month ? game.viewFor('s1').lit : null;
    if (lit) {
      game.handle('s1', { type: 'claim', ...lit });
      claimedIn = state.month;
    }
    advance(100);
  }
  expect(game.viewFor(null).finished, 'the game reached game over').toBe(true);
  return { ends, over: game.viewFor(null), state };
}

describe('Month end: last month against this one (C20)', () => {
  it("T-AC-15: at each month end every player's lastWorth is the worth the views showed at the previous month end (null in month 1), and lastAir the air then", () => {
    const { ends, over } = playThreeMonths();
    expect(ends.map((e) => e.month), 'months 1 and 2 end in upkeep; month 3 ends in game over').toEqual([1, 2]);
    const [first, second] = ends as [MonthEnd, MonthEnd];
    expect(first.views.get(null)!.air.band, 'precondition: month 1 ends in smog, not the clean air a default would give').toBe('smoggy');
    expect(second.views.get(null)!.air.band, 'precondition: the air changed band over month 2').toBe('toxic');
    for (const viewer of VIEWERS) {
      const who = viewer ?? 'the board';
      const one = first.views.get(viewer)!;
      const two = second.views.get(viewer)!;
      expect(Object.values(lastWorthIn(one)), `${who} in month 1: no last month`).toEqual([null, null, null]);
      expect(one.lastAir, `${who} in month 1`).toBeNull();
      expect(lastWorthIn(two), `${who} in month 2: month 1's shown worth`).toEqual(worthIn(first.views.get(null)!));
      expect(two.lastAir, `${who} in month 2: month 1's air, level and band`).toEqual(first.views.get(null)!.air);
    }
    // The change is real, so a lastWorth recomputed from today's state would not match what month 1 showed.
    const two = second.views.get(null)!;
    expect(two.players.some((p) => p.worth !== p.lastWorth), 'some worth moved over month 2').toBe(true);
    expect(lastWorthIn(over), "game over's lastWorth is month 2's end").toEqual(worthIn(two));
    expect(over.lastAir).toEqual(two.air);
  });

  it("T-AC-15: at the month end each player's condition is the month's, as development showed it, not re-read after the colonists ate", () => {
    const { ends } = playThreeMonths();
    for (const end of ends) {
      for (const viewer of VIEWERS) expect(conditionsIn(end.views.get(viewer)!), `${viewer ?? 'the board'} at month ${end.month}'s end`).toEqual(end.developed);
    }
    const second = ends[1]!;
    const s1 = second.developed['s1']!;
    expect(s1, "s1's condition in month 2's development").not.toBeNull();
    expect(s1.foodShare, 's1 went hungry in month 2').toBeLessThan(1);
    expect(second.liveShare, "the engine's food share after upkeep has eaten the Food: a re-read would differ").not.toBe(s1.foodShare);
    // Each condition carries the month's Food need, so every screen can say "ate n of m".
    for (const end of ends) {
      for (const viewer of VIEWERS) {
        for (const p of end.views.get(viewer)!.players) expect(p.condition?.foodNeed, `${p.id}'s need at month ${end.month}'s end, ${viewer ?? 'the board'}`).toBe(end.needs[p.id]);
      }
    }
    expect(second.needs['s1'], "s1's need is more than the one Food it held").toBeGreaterThan(1);
    const s2 = second.developed['s2']!;
    expect(s2.foodShare, 's2 was fed').toBe(1);
  });

  it("T-AC-15 (negative, HC-4): at a month end no view carries another player's parts, and the board carries none", () => {
    const { ends } = playThreeMonths();
    for (const end of ends) {
      const board = end.views.get(null)!;
      expect(board.me).toBeNull();
      expect(JSON.stringify(board), `the board at month ${end.month}'s end`).not.toContain('muleValue');
      for (const viewer of ['s1', 's2'] as const) {
        const view = end.views.get(viewer)!;
        expect(view.me!.id).toBe(viewer);
        expect(JSON.stringify({ ...view, me: null }), `${viewer}'s view outside its own me`).not.toContain('muleValue');
      }
    }
  });
});

/**
 * Month 1 played to its month end: Heiko (s1) hosts, Mia (s2) is the other phone, The Baron (s3) is an AI. With
 * `emptyStore`, the store's Food and Water are kept at nothing through the auction, so the colonists run short at upkeep.
 */
function toMonthEnd(options: { emptyStore?: boolean; dearFood?: boolean } = {}) {
  const fake = fakeContext();
  const game = new MuleGame(fake.ctx, 7, { maxMonths: 3, phaseScale: 0.1 });
  game.start(seats);
  const state = stateOf(game);
  for (let n = 0; n < 100_000 && game.viewFor(null).phase !== 'upkeep'; n++) {
    if (game.viewFor(null).phase === 'planning') readyAll(game);
    if (options.emptyStore && state.phase === 'auction') {
      state.store.stock.food = 0;
      state.store.stock.water = 0;
    }
    // Food on the shelf at a price no colonist's wage reaches.
    if (options.dearFood && state.phase === 'auction') state.store.posted.food = DEAR_FOOD;
    fake.advance(100);
  }
  expect(game.viewFor(null).phase).toBe('upkeep');
  return { game, ...fake };
}

const readyOf = (game: MuleGame, id: string) => game.viewFor(null).players.find((p) => p.id === id)!.ready;

describe('Month end holds until everyone moves on (C20, Q4)', () => {
  it('B-AC-13: the month end has no clock: with Mia not yet on, it stays up however long; once both humans tap, planning opens', () => {
    const { game, advance } = toMonthEnd();
    expect(game.viewFor(null).phaseEndsAt, 'no clock').toBeNull();
    expect(readyOf(game, 's3'), 'the AI seat is ready at once').toBe(true);
    game.handle('s1', { type: 'ready' });
    advance(LONG_WAIT_MS);
    expect(game.viewFor(null).phase, "Heiko's tap alone, ten minutes on").toBe('upkeep');
    expect(readyOf(game, 's1')).toBe(true);
    expect(readyOf(game, 's2')).toBe(false);
    game.handle('s2', { type: 'ready' });
    expect(game.viewFor(null).phase, 'both humans on; the AI never held it').toBe('planning');
    expect(game.viewFor(null).month).toBe(2);
  });

  it("B-AC-13: a phone that drops at the month end is still waited for, as in planning", () => {
    const { game, advance } = toMonthEnd();
    game.connectionChanged('s2', false);
    game.handle('s1', { type: 'ready' });
    advance(LONG_WAIT_MS);
    expect(game.viewFor(null).phase).toBe('upkeep');
  });

  it("B-AC-13: the host's Continue moves on with Mia still out, and says so", () => {
    const { game } = toMonthEnd();
    game.handle('s1', { type: 'ready' });
    game.handle('s1', { type: 'continue' });
    const view = game.viewFor(null);
    expect(view.phase).toBe('planning');
    expect(view.month).toBe(2);
    expect(view.news.join(' ')).toContain('Heiko continued without Mia.');
  });

  it("B-AC-13 (negative): Mia's Continue is refused, and the month end stays up", () => {
    const { game } = toMonthEnd();
    game.handle('s2', { type: 'ready' });
    expect(() => game.handle('s2', { type: 'continue' })).toThrow(RuleError);
    expect(game.viewFor(null).phase).toBe('upkeep');
  });
});

describe('Before the cut, from the view (C20)', () => {
  it("T-AC-15: in Collapse every player's worthBeforeCut is scoreParts' total before the cut, exactly; outside Collapse it is null", () => {
    const { game } = toMonthEnd();
    const state = stateOf(game);
    const beforeCut = (id: string) => {
      const p = scoreParts(state, id);
      return p.total + p.cut;
    };
    const divided = (id: string) => Math.round(scoreParts(state, id).total / POLLUTION.collapseScore);
    for (const viewer of VIEWERS) for (const p of game.viewFor(viewer).players) expect(p.worthBeforeCut, `${p.id} in clean air, ${viewer ?? 'the board'}`).toBeNull();

    state.air = POLLUTION.bands.find((b) => b.name === 'collapse')!.from;
    // A total over collapseScore is not the number before the cut: one player's rounding is made to show it.
    for (let n = 0; n < 10 && seats.every((s) => divided(s.id) === beforeCut(s.id)); n++) player(state, 's1').money += 1;
    expect(seats.some((s) => divided(s.id) !== beforeCut(s.id)), 'precondition: the division misses by a credit for someone').toBe(true);
    for (const viewer of VIEWERS) {
      const view = game.viewFor(viewer);
      expect(view.air.band).toBe('collapse');
      expect(Object.fromEntries(view.players.map((p) => [p.id, p.worthBeforeCut])), viewer ?? 'the board').toEqual(Object.fromEntries(seats.map((s) => [s.id, beforeCut(s.id)])));
    }
  });
});

describe('Colonists fed or short (C20)', () => {
  const shortages = (game: MuleGame) => stateOf(game).history.at(-1)!.shortages;
  const wentShort = (game: MuleGame) => stateOf(game).history.at(-1)!.colonistsHungry;

  it("T-AC-15: at the month end colonistsFed is true when that upkeep's store ran short of nothing, false when it ran short; null before it", () => {
    const fed = toMonthEnd();
    expect(shortages(fed.game), 'precondition: month 1 runs short of nothing').toEqual([]);
    for (const viewer of VIEWERS) expect(fed.game.viewFor(viewer).colonistsFed, viewer ?? 'the board').toBe(true);
    readyAll(fed.game);
    expect(fed.game.viewFor(null).phase).toBe('planning');
    for (const viewer of VIEWERS) expect(fed.game.viewFor(viewer).colonistsFed, `${viewer ?? 'the board'} in planning`).toBeNull();

    const short = toMonthEnd({ emptyStore: true });
    expect(shortages(short.game), 'precondition: the empty store runs short').not.toEqual([]);
    for (const viewer of VIEWERS) expect(short.game.viewFor(viewer).colonistsFed, viewer ?? 'the board').toBe(false);
  });

  it('T-AC-15: colonistsFed is false when the store has Food but the colonists cannot afford it', () => {
    const dear = toMonthEnd({ dearFood: true });
    expect(shortages(dear.game), 'precondition: the shelf did not run empty').toEqual([]);
    expect(wentShort(dear.game), 'precondition: the engine says the colonists went short').toBe(true);
    expect(dear.game.viewFor(null).news.join(' ')).toContain('could not afford');
    for (const viewer of VIEWERS) expect(dear.game.viewFor(viewer).colonistsFed, viewer ?? 'the board').toBe(false);
  });

  it("T-AC-15: at game over colonistsFed is the last upkeep's: true when that month fed the colonists, false when they couldn't afford Food", () => {
    const fed = playThreeMonths();
    const fedLast = fed.state.history.at(-1)!;
    expect(fedLast.month, 'the last report is the last month').toBe(fed.over.month);
    expect(fedLast.colonistsHungry, 'precondition: the last month fed the colonists').toBe(false);
    expect(fed.over.colonistsFed).toBe(true);

    const short = playThreeMonths({ dearFoodIn: 3 });
    const shortLast = short.state.history.at(-1)!;
    expect(shortLast.month).toBe(short.over.month);
    expect(shortLast.colonistsHungry, 'precondition: the last month the colonists could not afford Food').toBe(true);
    expect(short.over.colonistsFed).toBe(false);
  });
});
