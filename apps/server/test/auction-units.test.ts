import { describe, expect, it } from 'vitest';
import { storeForSale, UPKEEP, WALK, type AuctionSide, type GameState, type Good } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { GRANT_TICK_MS, MuleGame, PHASE_MS } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

/** The engine's state behind the game: the source of truth the view must match. */
const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

/** Plays into the first good's walk with s1 selling and s2 on the given side; nobody walks yet. */
function toWalk(s2Side: AuctionSide = 'buyer') {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  advance(PHASE_MS.planning);
  while (game.viewFor('s1').phase === 'landGrant') advance(GRANT_TICK_MS);
  while (game.viewFor('s1').phase === 'development') advance(1_000);
  while (game.viewFor('s1').phase === 'production') advance(1_000);
  expect(game.viewFor('s1').phase).toBe('auction');
  game.handle('s1', { type: 'ready' });
  game.handle('s2', { type: 'ready' });
  advance(WALK.tickMs * 2);
  game.handle('s1', { type: 'declare', side: 'seller' });
  game.handle('s2', { type: 'declare', side: s2Side });
  game.handle('s1', { type: 'ready' });
  game.handle('s2', { type: 'ready' });
  advance(WALK.tickMs * 2);
  const auction = game.viewFor(null).auction!;
  expect(auction.stage).toBe('walk');
  return { game, advance, good: auction.good };
}

/** s1 walks down and s2 up, toward each other. */
function walkTogether(game: MuleGame) {
  game.handle('s1', { type: 'walk', dir: 'down' });
  game.handle('s2', { type: 'walk', dir: 'up' });
}

/** Plays the first month until the good is up in the auction; nobody presses anything. */
function toGood(good: Good) {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  for (let i = 0; i < 20_000 && game.viewFor(null).auction?.good !== good; i++) advance(WALK.tickMs);
  expect(game.viewFor(null).auction?.good, `${good} comes up in the first month's auction`).toBe(good);
  return game;
}

function expectUnitsMatchEngine(view: MuleView, state: GameState) {
  const auction = view.auction!;
  for (const w of auction.walkers) {
    expect(w.units, `${w.id}'s units`).toBe(state.players.find((p) => p.id === w.id)!.stock[auction.good]);
  }
}

const keysOf = (o: object) => Object.keys(o).sort();
const NEW_FIELD = 'a new board field: check it against HC-2';

/** Every field the board's auction carries is one of these, so no other good's stock can ride along. */
function expectBoardKeys(auction: NonNullable<MuleView['auction']>) {
  expect(keysOf(auction), NEW_FIELD).toEqual(
    ['deals', 'good', 'hi', 'lo', 'next', 'seconds', 'shipPays', 'skipped', 'slowed', 'speed', 'stage', 'status', 'storeBuys', 'storeForSale', 'storeSells', 'total', 'units', 'walkers'],
  );
  for (const w of auction.walkers) expect(keysOf(w), NEW_FIELD).toEqual(['at', 'dir', 'done', 'id', 'price', 'side', 'units']);
  for (const r of auction.status) expect(keysOf(r), NEW_FIELD).toEqual(['had', 'id', 'made', 'need', 'now', 'spoils', 'used']);
  for (const d of auction.deals) expect(keysOf(d), NEW_FIELD).toEqual(['buyer', 'price', 'seller', 'units']);
  for (const k of auction.skipped) expect(keysOf(k), NEW_FIELD).toEqual(['good', 'reason']);
  for (const g of auction.next) expect(typeof g).toBe('string');
}

describe('the goods auction walkers carry their units', () => {
  it("T-AC-2: the auction view's walkers carry units equal to the engine's stock after every traded unit", () => {
    const { game, advance, good } = toWalk();
    walkTogether(game);
    const state = engineOf(game);
    const stockOf = (id: string) => state.players.find((p) => p.id === id)!.stock[good];
    const start = { s1: stockOf('s1'), s2: stockOf('s2') };
    let traded = state.auction!.units;
    let checks = 0;
    let betweenPlayers = 0;
    for (let i = 0; i < 2_000 && game.viewFor(null).auction?.good === good && game.viewFor(null).auction?.stage === 'walk'; i++) {
      advance(WALK.tickMs);
      if (state.auction?.units === traded) continue;
      if (game.viewFor(null).auction?.good !== good) break;
      traded = state.auction!.units;
      betweenPlayers = state.auction!.between.units;
      expectUnitsMatchEngine(game.viewFor('s1'), state);
      expectUnitsMatchEngine(game.viewFor('s2'), state);
      expectUnitsMatchEngine(game.viewFor(null), state);
      checks++;
    }
    expect(checks, 'units traded during the walk').toBeGreaterThan(0);
    expect(betweenPlayers, 'units traded between the two players').toBeGreaterThan(0);
    expect(stockOf('s1')).toBeLessThan(start.s1);
    expect(stockOf('s2')).toBeGreaterThan(start.s2);
  });

  it('T-AC-2: every walker carries units from the first frame of the walk, before any trade', () => {
    const { game, good } = toWalk('pass');
    const view = game.viewFor(null);
    expect(view.auction!.walkers.length).toBe(seats.length);
    expectUnitsMatchEngine(view, engineOf(game));
    const passer = view.auction!.walkers.find((w) => w.id === 's2')!;
    expect(passer.side).toBe('pass');
    expect(passer.units, "a passing player's holding, public like the status table").toBe(engineOf(game).players.find((p) => p.id === 's2')!.stock[good]);
    expect(passer.units).toBeGreaterThan(0);
  });

  // trace-allow: guards the spec's HC-2 invariant, which has no INV id: the TV holds no player stock but the good up
  it("HC-2: the board's auction carries no stock of any good but the one that's up", () => {
    const { game, advance, good } = toWalk();
    walkTogether(game);
    let dealsSeen = 0;
    for (let i = 0; i < 2_000 && game.viewFor(null).auction?.good === good; i++) {
      const view = game.viewFor(null);
      expect(view.me).toBeNull();
      expectBoardKeys(view.auction!);
      dealsSeen += view.auction!.deals.length;
      advance(WALK.tickMs);
    }
    expect(dealsSeen, 'frames with units changing hands, so the deal keys were checked').toBeGreaterThan(0);
  });
});

describe("the board's store count", () => {
  it("B-AC-3: the board's store count is what the store will sell (stock less the colonists' Food and Water reserve)", () => {
    const smithore = toGood('smithore');
    const board = smithore.viewFor(null);
    const forSale = storeForSale(engineOf(smithore), 'smithore');
    expect(forSale, 'the store has Smithore to sell').toBeGreaterThan(0);
    expect(board.auction!.storeForSale).toBe(forSale);

    const food = toGood('food');
    const state = engineOf(food);
    const reserve = Math.ceil(state.colonists / UPKEEP.colonistsPerUnit);
    expect(reserve, "the colonists' Food reserve").toBeGreaterThan(1);
    state.store.stock.food = reserve - 1;
    const view = food.viewFor(null);
    expect(view.auction!.storeForSale, "Food inside the colonists' reserve is not for sale").toBe(0);
    expect(view.auction!.storeSells, 'so the store has no selling line').toBeNull();
    expect(view.market.find((r) => r.good === 'food')!.storeStock, "the market still shows the store's real stock").toBe(reserve - 1);
  });
});
