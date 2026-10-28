import { describe, expect, it } from 'vitest';
import { GAME, POLLUTION, score, type GameState } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats, tapThere } from './fake-context.js';

/** A one-month game where s1 claims the first lit plot and installs a food MULE on it, played to game over. */
function playedOut() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7, { maxMonths: 1, phaseScale: 0.1 });
  game.start(seats);
  const before: MuleView[] = [];
  const step = () => {
    before.push(game.viewFor('s1'), game.viewFor(null));
    advance(100);
  };
  advance(game.viewFor(null).phaseEndsAt! - ctx.now());
  const lit = game.viewFor('s1').lit!;
  game.handle('s1', { type: 'claim', x: lit.x, y: lit.y });
  while (game.viewFor(null).phase !== 'development') step();
  tapThere(game, { ctx, advance }, 's1', { type: 'buyMule' });
  tapThere(game, { ctx, advance }, 's1', { type: 'outfit', outfit: 'food' });
  tapThere(game, { ctx, advance }, 's1', { type: 'install', x: lit.x, y: lit.y });
  for (let n = 0; n < 100_000 && !game.viewFor(null).finished; n++) step();
  expect(game.viewFor(null).finished).toBe(true);
  const state = (game as unknown as { state: GameState }).state;
  return { game, state, before };
}

describe('score parts in the game-over view', () => {
  it.each([
    { band: 'clean', cutSign: 0 },
    { band: 'collapse', cutSign: 1 },
  ] as const)('T-AC-7: only your own entry has parts; the board has none (air $band)', ({ band, cutSign }) => {
    const { game, state, before } = playedOut();
    state.air = POLLUTION.bands.find((b) => b.name === band)!.from;
    const board = game.viewFor(null);
    expect(board.air.band).toBe(band);

    expect(board.scores).toEqual(seats.map((s) => ({ id: s.id, score: score(state, s.id) })));
    expect(board.scores!.filter((e) => 'parts' in e)).toEqual([]);

    for (const { id } of seats) {
      const view = game.viewFor(id);
      const withParts = view.scores!.filter((e) => 'parts' in e);
      expect(withParts.map((e) => e.id)).toEqual([id]);

      const own = withParts[0]!;
      const parts = own.parts!;
      expect(own.score).toBe(score(state, id));
      expect(Object.keys(parts).sort()).toEqual(['cut', 'goods', 'land', 'money', 'muleValue', 'mules', 'office', 'plots']);
      expect(parts.money + parts.goods + parts.land + parts.muleValue + parts.office - parts.cut).toBe(own.score);
      expect(Math.sign(parts.cut)).toBe(cutSign);

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

      expect(view.scores!.map((e) => ({ id: e.id, score: e.score }))).toEqual(board.scores);
    }

    const s1 = game.viewFor('s1').scores!.find((e) => e.id === 's1')!.parts!;
    expect(s1.mules).toBe(1);
    expect(s1.muleValue).toBeGreaterThan(1);
    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((v) => v.scores !== null)).toEqual([]);
  });
});
