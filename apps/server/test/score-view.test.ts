import { describe, expect, it } from 'vitest';
import { GAME } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

/** A one-month game in which s1 claims the first lit plot, played to game over on its own clocks. */
function playedOut() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7, { maxMonths: 1, phaseScale: 0.1 });
  game.start(seats);
  const before: MuleView[] = [];
  advance(game.viewFor(null).phaseEndsAt! - ctx.now());
  const lit = game.viewFor('s1').lit!;
  game.handle('s1', { type: 'claim', x: lit.x, y: lit.y });
  for (let step = 0; step < 100_000 && !game.viewFor(null).finished; step++) {
    before.push(game.viewFor('s1'), game.viewFor(null));
    advance(100);
  }
  expect(game.viewFor(null).finished).toBe(true);
  return { game, before };
}

describe('score parts in the game-over view', () => {
  it('T-AC-7: only your own entry has parts; the board has none', () => {
    const { game, before } = playedOut();
    const board = game.viewFor(null);

    expect(board.scores!.map((e) => e.id)).toEqual(seats.map((s) => s.id));
    expect(board.scores!.filter((e) => 'parts' in e)).toEqual([]);

    for (const { id } of seats) {
      const view = game.viewFor(id);
      const withParts = view.scores!.filter((e) => 'parts' in e);
      expect(withParts.map((e) => e.id)).toEqual([id]);

      const own = withParts[0]!;
      const parts = own.parts!;
      expect(Object.keys(parts).sort()).toEqual(['cut', 'goods', 'land', 'money', 'muleValue', 'mules', 'plots']);
      expect(parts.money + parts.goods + parts.land + parts.muleValue - parts.cut).toBe(own.score);

      // The lines a public view can check on its own.
      const player = board.players.find((p) => p.id === id)!;
      const owned = board.tiles.filter((t) => t.owner === id);
      const mules = owned.filter((t) => t.outfit).length;
      expect(parts).toMatchObject({
        money: Math.round(player.money),
        plots: owned.length,
        land: owned.length * GAME.plotScore,
        mules,
        muleValue: mules * board.mulePrice,
      });
      if (board.air.band !== 'collapse') expect(parts.cut).toBe(0);

      // The score a phone shows is the one the board shows.
      expect(view.scores!.map((e) => ({ id: e.id, score: e.score }))).toEqual(board.scores);
    }

    expect(game.viewFor('s1').scores!.find((e) => e.id === 's1')!.parts!.plots).toBeGreaterThanOrEqual(1);
    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((v) => v.scores !== null)).toEqual([]);
  });
});
