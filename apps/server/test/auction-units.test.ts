import { describe, expect, it } from 'vitest';
import { GOODS, WALK, type GameState } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { GRANT_TICK_MS, MuleGame, PHASE_MS } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

/** The engine's state behind the game: the source of truth the view must match. */
const engineOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;

/** Plays into the first good's walk with s1 selling and s2 buying, walking toward each other. */
function toWalk() {
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
  game.handle('s2', { type: 'declare', side: 'buyer' });
  game.handle('s1', { type: 'ready' });
  game.handle('s2', { type: 'ready' });
  advance(WALK.tickMs * 2);
  const auction = game.viewFor(null).auction!;
  expect(auction.stage).toBe('walk');
  game.handle('s1', { type: 'walk', dir: 'down' });
  game.handle('s2', { type: 'walk', dir: 'up' });
  return { game, advance, good: auction.good };
}

function expectUnitsMatchEngine(view: MuleView, state: GameState) {
  const auction = view.auction!;
  for (const w of auction.walkers) {
    expect(w.units, `${w.id}'s units`).toBe(state.players.find((p) => p.id === w.id)!.stock[auction.good]);
  }
}

describe('the goods auction walkers carry their units', () => {
  it("T-AC-2: the auction view's walkers carry units equal to the engine's stock after every traded unit", () => {
    const { game, advance, good } = toWalk();
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
    const { game } = toWalk();
    const view = game.viewFor(null);
    expect(view.auction!.walkers.length).toBe(seats.length);
    expectUnitsMatchEngine(view, engineOf(game));
  });

  // trace-allow: guards the spec's HC-2 invariant, which has no INV id: the TV holds no player stock but the good up
  it("HC-2: the board view carries no stock of any good but the one that's up", () => {
    const { game, good } = toWalk();
    const view = game.viewFor(null);
    expect(view.me).toBeNull();
    for (const w of view.auction!.walkers) {
      expect(Object.keys(w).sort()).toEqual(['at', 'dir', 'done', 'id', 'price', 'side', 'units']);
    }
    const others = GOODS.filter((g) => g !== good);
    const json = JSON.stringify(view);
    for (const g of others) expect(json, `a player's ${g}`).not.toMatch(new RegExp(`"${g}":\\d`));
  });
});
