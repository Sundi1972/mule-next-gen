import { RuleError, WALK, type GameState, type Good } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/**
 * The goods auction trades by itself (docs/specs/2026-11-05-ws3-auction-auto-trade.md, PM-approved 2026-11-05): at a
 * house's line units move one at a time, faster and faster, with no amount asked and no confirm (RULE-1, RULE-3); and
 * every player starts every good as a buyer, with no Pass (RULE-2). Asserted at the server, as a phone receives it.
 */
const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

/** Month 1 played to the first good's status screen, seed 7: s1 and s2 people, s3 the AI. */
function toStatus() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  readyAll(game);
  while (game.viewFor('s1').phase === 'landGrant') advance(GRANT_TICK_MS);
  while (game.viewFor('s1').phase === 'development') advance(1_000);
  while (game.viewFor('s1').phase === 'production') advance(1_000);
  const state = engineOf(game);
  expect(game.viewFor('s1').auction!.stage).toBe('status');
  return { game, advance, state, good: state.auction!.good! };
}

/**
 * Into the walk on the good that is up, the store with plenty and room to buy, `arrange` setting purses and stock on
 * the status screen. The AI seat holds none and has no money, so it can neither sell to nor buy from anyone here.
 */
function toWalk(arrange: (state: GameState, good: Good) => void = () => {}) {
  const g = toStatus();
  const { game, advance, state, good } = g;
  state.store.stock[good] = 500;
  const baron = state.players.find((p) => p.id === 's3')!;
  Object.assign(baron, { money: 0 });
  baron.stock[good] = 0;
  arrange(state, good);
  return {
    ...g,
    /** Both people press Done on the status screen, and the walk starts. */
    walk: () => {
      game.handle('s1', { type: 'ready' });
      game.handle('s2', { type: 'ready' });
      advance(WALK.tickMs * 2);
      expect(game.viewFor('s2').auction!.stage).toBe('walk');
    },
  };
}

const walker = (game: MuleGame, id: string) => game.viewFor(id).auction!.walkers.find((w) => w.id === id)!;
const stock = (state: GameState, id: string, good: Good) => state.players.find((p) => p.id === id)!.stock[good];

/** Holds Up or Down until the view says the walker stands at the store's line, then lets go. */
function toTheLine(game: MuleGame, advance: (ms: number) => void, id: string, dir: 'up' | 'down') {
  game.handle(id, { type: 'walk', dir });
  for (let i = 0; i < 400 && walker(game, id).line !== 'store'; i++) advance(WALK.tickMs);
  game.handle(id, { type: 'walk', dir: 'stop' });
  expect(walker(game, id).line).toBe('store');
}

/** The fake clock runs one auction tick per call: step it a tick at a time. */
const ticks = (advance: (ms: number) => void, ms: number) => {
  for (let t = 0; t < ms; t += WALK.tickMs) advance(WALK.tickMs);
};

describe('RULE-2: everyone takes part in every goods auction, as a buyer by default', () => {
  it('B-AC-3: as a good\'s status screen opens every player, the AI included, is a buyer, whatever they hold or need', () => {
    const { game } = toStatus();
    expect(game.viewFor(null).auction!.walkers.map((w) => w.side)).toEqual(['buyer', 'buyer', 'buyer']);
  });

  it('B-AC-3: Pass is refused with the rules\' words, and the side is unchanged', () => {
    const { game } = toStatus();
    expect(() => game.handle('s1', { type: 'declare', side: 'pass' })).toThrow(new RuleError('Everyone takes part in the auction'));
    expect(walker(game, 's1').side).toBe('buyer');
  });

  it('B-AC-3: tapping your own side again keeps it; Sell and back to Buy switch', () => {
    const { game, state, good } = toStatus();
    state.players.find((p) => p.id === 's2')!.stock[good] = 4;
    game.handle('s2', { type: 'declare', side: 'buyer' });
    expect(walker(game, 's2').side).toBe('buyer');
    game.handle('s2', { type: 'declare', side: 'seller' });
    expect(walker(game, 's2').side).toBe('seller');
    game.handle('s2', { type: 'declare', side: 'buyer' });
    expect(walker(game, 's2').side).toBe('buyer');
  });
});

describe('RULE-1 and RULE-3: at the store\'s line units trade by themselves, one at a time, faster and faster', () => {
  it('B-AC-1: Brix walks his 12 down to the store\'s line and does nothing else: they sell one by one, faster, past his need, until one tap up stops them', () => {
    const { game, advance, state, good, walk } = toWalk((s, g) => {
      s.players.find((p) => p.id === 's2')!.stock[g] = 12;
      // The store buys only as many as it is willing to this month (storeBudget); here it will take all twelve.
      s.auction!.storeBudget = 50;
    });
    game.handle('s2', { type: 'declare', side: 'seller' });
    walk();
    const need = game.viewFor('s2').auction!.status.find((r) => r.id === 's2')!.need;
    toTheLine(game, advance, 's2', 'down');
    const at = stock(state, 's2', good);
    ticks(advance, 1_000);
    const afterOne = at - stock(state, 's2', good);
    ticks(advance, 1_000);
    const afterTwo = at - stock(state, 's2', good);
    // Speeding up: the second second sells more than the first (at a steady 400 ms it would sell the same).
    expect(afterOne, 'the first second sells a few').toBeGreaterThanOrEqual(2);
    expect(afterTwo - afterOne, 'the next second sells more').toBeGreaterThan(afterOne);
    // Selling below next month's need is allowed and shown, never asked: nothing stops it but the player.
    ticks(advance, 2_000);
    expect(stock(state, 's2', good), 'sold down past the need, with nothing asked').toBeLessThan(Math.max(1, need));
    game.handle('s2', { type: 'ready' });
    const left = stock(state, 's2', good);
    if (left > 0) {
      game.handle('s2', { type: 'walkStep', dir: 'up' });
      ticks(advance, 2_000);
      expect(stock(state, 's2', good), 'one tap off the line stops it').toBe(left);
    }
  });

  it('B-AC-2: Lena walks up to the store\'s selling line with the money: she buys one at a time until she steps off', () => {
    const { game, advance, state, good, walk } = toWalk((s) => {
      s.players.find((p) => p.id === 's2')!.money = 5_000;
    });
    walk();
    const shelf = state.store.stock[good];
    toTheLine(game, advance, 's2', 'up');
    ticks(advance, 2_000);
    const bought = shelf - state.store.stock[good];
    expect(bought, 'two seconds at the line, with nothing chosen').toBeGreaterThanOrEqual(10);
    expect(stock(state, 's2', good)).toBeGreaterThanOrEqual(bought);
    game.handle('s2', { type: 'walkStep', dir: 'down' });
    const after = state.store.stock[good];
    ticks(advance, 2_000);
    expect(state.store.stock[good], 'one tap below the line stops it').toBe(after);
  });

  it('B-AC-2 (negative): a buyer below the store\'s line buys nothing', () => {
    const { game, advance, state, good, walk } = toWalk((s) => {
      s.players.find((p) => p.id === 's2')!.money = 5_000;
    });
    walk();
    const shelf = state.store.stock[good];
    ticks(advance, 3_000);
    expect(walker(game, 's2').line).toBeNull();
    expect(state.store.stock[good]).toBe(shelf);
  });

  it('B-AC-4: two buyers at the store\'s line are served in turns, and the speed-up carries on across them', () => {
    const { game, advance, state, good, walk } = toWalk((s) => {
      for (const id of ['s1', 's2']) s.players.find((p) => p.id === id)!.money = 5_000;
    });
    walk();
    const had = { s1: stock(state, 's1', good), s2: stock(state, 's2', good) };
    game.handle('s1', { type: 'walk', dir: 'up' });
    toTheLine(game, advance, 's2', 'up');
    for (let i = 0; i < 400 && walker(game, 's1').line !== 'store'; i++) advance(WALK.tickMs);
    game.handle('s1', { type: 'walk', dir: 'stop' });
    ticks(advance, 2_000);
    const got = { s1: stock(state, 's1', good) - had.s1, s2: stock(state, 's2', good) - had.s2 };
    expect(got.s1, 'Heiko was served').toBeGreaterThan(0);
    expect(got.s2, 'Mia was served').toBeGreaterThan(0);
    expect(Math.abs(got.s1 - got.s2), 'in turns').toBeLessThanOrEqual(got.s1 + got.s2 > 20 ? 3 : 2);
    const deal = game.viewFor(null).auction!.deals.find((d) => d.seller === 'store')!;
    expect(deal.units, 'one deal at the store, its count running across both').toBeGreaterThanOrEqual(10);
  });
});
