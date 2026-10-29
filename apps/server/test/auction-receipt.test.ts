import { describe, expect, it } from 'vitest';
import { WALK, type GameState } from '@mule/engine';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/** The engine's state behind the game: the source of truth the view must match. */
const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

/**
 * A-5 (UX audit G-5): plays month 1 into the first good's walk with s1 selling and s2 buying, walks them together
 * until the walk ends on its own, and returns the game in the close stage, with each seat's money and stock of the
 * good from the moment the auction opened.
 */
function toClose() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  readyAll(game);
  while (game.viewFor('s1').phase === 'landGrant') advance(WALK.tickMs);
  while (game.viewFor('s1').phase === 'development') advance(1_000);
  while (game.viewFor('s1').phase === 'production') advance(1_000);
  expect(game.viewFor('s1').phase).toBe('auction');
  const state = engineOf(game);
  const good = game.viewFor(null).auction!.good;
  const opened = Object.fromEntries(state.players.map((p) => [p.id, { money: p.money, stock: p.stock[good] }]));
  game.handle('s1', { type: 'declare', side: 'seller' });
  game.handle('s2', { type: 'declare', side: 'buyer' });
  game.handle('s1', { type: 'ready' });
  game.handle('s2', { type: 'ready' });
  advance(WALK.tickMs * 2);
  expect(game.viewFor(null).auction!.stage).toBe('walk');
  game.handle('s1', { type: 'walk', dir: 'down' });
  game.handle('s2', { type: 'walk', dir: 'up' });
  for (let i = 0; i < 2_000 && game.viewFor(null).auction?.stage === 'walk'; i++) advance(WALK.tickMs);
  return { game, advance, state, good, opened };
}

describe('A-5 the receipt: the close stage on the view a phone receives', () => {
  it('T-AC-A5-7: after a walk the view says close, and each phone carries its own receipt for the good', () => {
    const { game, state, good, opened } = toClose();
    const s1 = game.viewFor('s1').auction!;
    const s2 = game.viewFor('s2').auction!;
    expect(s1).toMatchObject({ stage: 'close', good, total: WALK.closeMs / 1_000 });
    const soldUnits = opened.s1!.stock - state.players.find((p) => p.id === 's1')!.stock[good];
    const boughtUnits = state.players.find((p) => p.id === 's2')!.stock[good] - opened.s2!.stock;
    expect(soldUnits, 's1 sold some').toBeGreaterThan(0);
    expect(boughtUnits, 's2 bought some').toBeGreaterThan(0);
    // What the phone says it sold is what left its stock, and what it was paid is what reached its money.
    expect(s1.receipt!.sold.units).toBe(soldUnits);
    expect(s1.receipt!.sold.prices).toHaveLength(soldUnits);
    expect(s1.receipt!.sold.gross).toBe(s1.receipt!.sold.prices.reduce((x, y) => x + y, 0));
    expect(s1.receipt!.sold.tax).toBeGreaterThan(0);
    expect(s1.receipt!.sold.with).toContain('s2');
    expect(s2.receipt!.bought.units).toBe(boughtUnits);
    expect(s2.receipt!.bought.with[0]).toBeDefined();
    // The month's total in the header is the auction's money, to the credit.
    const moneyOf = (id: string) => game.viewFor(id).players.find((p) => p.id === id)!.money;
    expect(s1.tally).toBe(moneyOf('s1') - opened.s1!.money);
    expect(s2.tally).toBe(moneyOf('s2') - opened.s2!.money);
    // Each phone gets only its own: the board gets none.
    const board = game.viewFor(null).auction!;
    expect(board.stage).toBe('close');
    expect(board.receipt).toBeNull();
    expect(board.tally).toBeNull();
    expect(s1.upNext).toBe(board.upNext);
    // The good's headline is on the ticker while it closes, not only once the next good is up.
    expect(game.viewFor(null).news.some((n) => n.includes(`sold ${soldUnits} ${good}`))).toBe(true);
  });

  it('T-AC-A5-8: the close stage lasts WALK.closeMs on the server clock, moves no money, then the next good comes up', () => {
    const { game, advance, good } = toClose();
    const money = () => JSON.stringify(game.viewFor(null).players.map((p) => p.money));
    const before = money();
    const upNext = game.viewFor(null).auction!.upNext;
    // The fake clock fires a timer once per advance, so the server's tick is stepped one at a time.
    const ticks = (n: number) => {
      for (let i = 0; i < n; i++) advance(WALK.tickMs);
    };
    ticks(WALK.closeMs / WALK.tickMs - 2);
    expect(game.viewFor(null).auction).toMatchObject({ stage: 'close', good });
    expect(money()).toBe(before);
    ticks(3);
    const after = game.viewFor(null).auction;
    if (upNext === null) expect(after).toBeNull();
    else expect(after).toMatchObject({ stage: 'status', good: upNext, receipt: null });
  });
});
