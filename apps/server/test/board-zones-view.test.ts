import type { AuctionView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { WALK, type GameState } from '@mule/engine';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/**
 * The goods board's rest zones and a sold-out store's line, as every screen receives them: Heiko's phone, Mia's phone
 * and the TV. The game keeps its engine state private; the tests reach it to arrange the store's shelf and to read the
 * zones the engine fixed as the good came up.
 */
const VIEWERS = ['s1', 's2', null] as const;
const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

/**
 * Into the first good's walk (seed 7's Food), everyone a buyer, standing at the board's bottom edge. Only Mia (s2) has
 * money, so only her bid counts; the AI seat (s3) holds none of the good, so it never sells to her.
 */
function toWalk() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  readyAll(game);
  while (game.viewFor('s1').phase === 'landGrant') advance(GRANT_TICK_MS);
  while (game.viewFor('s1').phase === 'development') advance(1_000);
  while (game.viewFor('s1').phase === 'production') advance(1_000);
  const state = engineOf(game);
  state.players.find((p) => p.id === 's3')!.stock[state.auction!.good!] = 0;
  state.players.find((p) => p.id === 's1')!.money = 0;
  state.players.find((p) => p.id === 's3')!.money = 0;
  game.handle('s1', { type: 'ready' });
  game.handle('s2', { type: 'ready' });
  advance(WALK.tickMs * 2);
  expect(game.viewFor('s2').auction!.stage, 'the premise: the walk has begun').toBe('walk');
  state.players.find((p) => p.id === 's2')!.money = 5_000;
  return { game, advance, state };
}

const views = (game: MuleGame): AuctionView[] => VIEWERS.map((v) => game.viewFor(v).auction!);
const mia = (game: MuleGame) => game.viewFor('s2').auction!.walkers.find((w) => w.id === 's2')!;
const ticks = (advance: (ms: number) => void, ms: number) => {
  for (let t = 0; t < ms; t += WALK.tickMs) advance(WALK.tickMs);
};

describe("RULE-6: the auction view carries the board's zones", () => {
  it("B-AC-D1 (view): every phone and the TV receive the zones the engine fixed for the good, and a buyer holding ▼ stands at their bottom edge with no deal", () => {
    const { game, advance, state } = toWalk();
    const good = state.auction!.good;
    const engine = state.auction!.zones;
    const start = views(game)[0]!;
    expect(engine.buyersTop, "the premise: B is the store's buying line at the good's start").toBe(start.storeBuys);
    expect(engine.sellersBottom, "the premise: S is the store's selling line at the good's start").toBe(start.storeSells);

    for (const [k, view] of views(game).entries()) expect(view.zones, `${VIEWERS[k] ?? 'the TV'} receives the zones`).toEqual({ ...engine });

    // Up into the buyers' zone first, so the edge has something to stop: B is above her, so nothing trades.
    game.handle('s2', { type: 'walk', dir: 'up' });
    for (let i = 0; i < 2_000 && mia(game).price < engine.lo + 5; i++) advance(WALK.tickMs);
    game.handle('s2', { type: 'walk', dir: 'down' });
    // Long enough to walk well past the edge at the board's speed.
    ticks(advance, Math.ceil((10 / state.auction!.speed) * 1_000));
    expect(state.auction!.good, 'the premise: still the same good').toBe(good);
    for (const [k, view] of views(game).entries()) {
      const who = VIEWERS[k] ?? 'the TV';
      expect(view.walkers.find((w) => w.id === 's2')!.price, `${who} shows Mia at the buyers' hard edge`).toBe(engine.lo);
      expect(view.deals, `${who} shows no deal`).toEqual([]);
      expect(view.zones, `${who} still receives the same zones`).toEqual({ ...engine });
    }
  });
});

describe('RULE-7: a sold-out store\'s line, as every screen receives it', () => {
  it("B-AC-E1 (view): sold out, every screen's store line is the old price, unflagged, until Mia bids past it; then it is her bid, flagged", () => {
    const { game, advance, state } = toWalk();
    const S = state.auction!.zones.sellersBottom;
    state.store.stock[state.auction!.good!] = 0;
    // Heiko sells, resting at the sellers' edge: walking up, Mia must not trade with him.
    game.handle('s1', { type: 'declare', side: 'seller' });

    for (const [k, view] of views(game).entries()) {
      const who = VIEWERS[k] ?? 'the TV';
      expect(view.storeForSale, `${who}: the premise, the store has none to sell`).toBe(0);
      expect(view.storeSells, `${who}: no bid above S, so the line stays at the old price`).toBe(S);
      expect('storeSellsBid' in view, `${who}: the old price is no bid`).toBe(false);
    }

    game.handle('s2', { type: 'walk', dir: 'up' });
    for (let i = 0; i < 2_000 && mia(game).price < S + 3; i++) advance(WALK.tickMs);
    game.handle('s2', { type: 'walk', dir: 'stop' });
    const bid = mia(game).price;
    expect(bid, 'the premise: Mia bid past the old line').toBeGreaterThan(S);

    for (const [k, view] of views(game).entries()) {
      const who = VIEWERS[k] ?? 'the TV';
      expect(view.storeSells, `${who}: the line is Mia's bid`).toBe(bid);
      expect(view.storeSellsBid, `${who}: flagged as a bid`).toBe(true);
      expect(view.deals, `${who}: nobody trades, the store least of all`).toEqual([]);
    }
    expect(state.store.stock[state.auction!.good!], 'the store sold nothing').toBe(0);
    expect(state.players.find((p) => p.id === 's2')!.stock[state.auction!.good!], 'Mia bought nothing from Heiko standing still').toBe(2);
  });
});
