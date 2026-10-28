import { describe, expect, it } from 'vitest';
import { readyAll, tapThere, toDevelopment as reachDevelopment } from './fake-context.js';

/** Month 1 into development with Heiko (s1) owning the first plot that lit up in the grant. */
function toDevelopment() {
  const { game, advance, ctx, plot } = reachDevelopment({ claimer: 's1' });
  expect(plot).not.toBeNull();
  return { game, advance, fake: { ctx, advance }, plot: plot! };
}

describe("MyView.installedThisTurn: the store's Now line after a reload", () => {
  it('FM-reload-install: true on the installer\'s own view after an install and on a fresh view after a reload, never on another seat\'s, and false again when their next development turn starts', () => {
    const { game, advance, fake, plot } = toDevelopment();
    expect(game.viewFor('s1').me!.installedThisTurn).toBe(false);
    tapThere(game, fake, 's1', { type: 'buyMule' });
    tapThere(game, fake, 's1', { type: 'outfit', outfit: 'food' });
    expect(game.viewFor('s1').me!.installedThisTurn, 'an outfitted MULE still in hand is not installed').toBe(false);
    game.handle('s1', { type: 'install', ...plot });
    expect(game.viewFor('s1').me!.installedThisTurn, 'walking it to the plot, nothing is installed yet').toBe(false);
    const walk = game.viewFor(null).players.find((p) => p.id === 's1')!.colonist!.walk!;
    advance(walk.arrivesAt - fake.ctx.now());

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

    for (let i = 0; i < 10_000 && !(game.viewFor(null).phase === 'development' && game.viewFor(null).month === 2); i++) {
      if (game.viewFor(null).phase === 'planning') readyAll(game);
      advance(100);
    }
    expect(game.viewFor(null)).toMatchObject({ phase: 'development', month: 2 });
    expect(game.viewFor('s1').me!.installedThisTurn, "the next development turn starts with nothing installed").toBe(false);
  });

  it('FM-reload-install: a second MULE bought and outfitted after the install leaves it true, and it holds through production and the next planning until that month\'s development starts', () => {
    const { game, advance, fake, plot } = toDevelopment();
    tapThere(game, fake, 's1', { type: 'buyMule' });
    tapThere(game, fake, 's1', { type: 'outfit', outfit: 'food' });
    tapThere(game, fake, 's1', { type: 'install', ...plot });
    tapThere(game, fake, 's1', { type: 'buyMule' });
    tapThere(game, fake, 's1', { type: 'outfit', outfit: 'energy' });
    expect(game.viewFor('s1').me).toMatchObject({ carriedMule: 'energy', installedThisTurn: true });

    // The flag as s1's phone saw it on entering each phase, keyed "month phase".
    const seen = new Map<string, boolean>();
    for (let i = 0; i < 10_000 && !(game.viewFor(null).phase === 'development' && game.viewFor(null).month === 2); i++) {
      if (game.viewFor(null).phase === 'planning') readyAll(game);
      advance(100);
      const { month, phase, me } = game.viewFor('s1');
      if (!seen.has(`${month} ${phase}`)) seen.set(`${month} ${phase}`, me!.installedThisTurn);
    }
    expect([...seen.keys()]).toEqual(expect.arrayContaining(['1 production', '1 auction', '1 upkeep', '2 planning', '2 landGrant', '2 development']));
    for (const [at, installed] of seen) expect(installed, at).toBe(at !== '2 development');
  });
});
