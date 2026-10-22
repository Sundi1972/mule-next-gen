import { describe, expect, it } from 'vitest';
import { GRANT_TICK_MS, MuleGame, PHASE_MS } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

/** Month 1 into development with Heiko (s1) owning the first plot that lit up in the grant. */
function toDevelopment() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  advance(PHASE_MS.planning);
  let plot: { x: number; y: number } | null = null;
  while (game.viewFor(null).phase === 'landGrant') {
    const lit = game.viewFor('s1').lit;
    if (!plot && lit) {
      game.handle('s1', { type: 'claim', ...lit });
      plot = lit;
    }
    if (game.viewFor(null).phase === 'landGrant') advance(GRANT_TICK_MS);
  }
  for (let i = 0; i < 100 && game.viewFor(null).phase !== 'development'; i++) advance(1_000);
  expect(game.viewFor(null).phase).toBe('development');
  expect(plot).not.toBeNull();
  return { game, advance, plot: plot! };
}

describe("MyView.installedThisTurn: the store's Now line after a reload", () => {
  it('FM-reload-install: true on the installer\'s own view after an install and on a fresh view after a reload, never on another seat\'s, and false again when their next development turn starts', () => {
    const { game, advance, plot } = toDevelopment();
    expect(game.viewFor('s1').me!.installedThisTurn).toBe(false);
    game.handle('s1', { type: 'buyMule' });
    game.handle('s1', { type: 'outfit', outfit: 'food' });
    expect(game.viewFor('s1').me!.installedThisTurn, 'an outfitted MULE still in hand is not installed').toBe(false);
    game.handle('s1', { type: 'install', ...plot });

    expect(game.viewFor('s1').me!.installedThisTurn).toBe(true);
    game.connectionChanged('s1', false);
    game.connectionChanged('s1', true);
    expect(game.viewFor('s1').me!.installedThisTurn, 'a fresh view for the same seat after a reload').toBe(true);

    expect(game.viewFor('s2').me!.installedThisTurn).toBe(false);
    const board = game.viewFor(null);
    expect(board.me).toBeNull();
    for (const view of [board, game.viewFor('s2')]) {
      for (const p of view.players) expect(Object.keys(p)).not.toContain('installedThisTurn');
    }

    for (let i = 0; i < 10_000 && !(game.viewFor(null).phase === 'development' && game.viewFor(null).month === 2); i++) advance(100);
    expect(game.viewFor(null)).toMatchObject({ phase: 'development', month: 2 });
    expect(game.viewFor('s1').me!.installedThisTurn, "the next development turn starts with nothing installed").toBe(false);
  });
});
