import type { GameContext } from '@tabletop/core';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../src/mule-game.js';
import { readyAll, walkers } from './fake-context.js';

/**
 * A clock whose timers fire `earlyMs` before they are due, as Node's setTimeout may against Date.now(): the callback
 * runs while the wall clock still reads a millisecond short of the time it was set for.
 */
function earlyClock(earlyMs: number) {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const ctx: GameContext = {
    now: () => now,
    schedule: (ms, fn) => {
      const t = { at: now + Math.max(0, ms - earlyMs), fn };
      timers.push(t);
      return () => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    changed: () => {},
    frame: () => {},
    hostId: () => 's1',
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      now = Math.max(now, due.at);
      due.fn();
    }
    now = end;
  };
  return { ctx, advance };
}

describe('a walk settles on arrival even when its timer fires a little early (the frozen colonist, #262)', () => {
  it('Lena walks to the corral while Ossa is already at the pub: with nobody else acting, her MULE still arrives', () => {
    const { ctx, advance } = earlyClock(1);
    const game = new MuleGame(ctx, 7);
    game.start(walkers);
    readyAll(game);
    for (let i = 0; i < 10_000 && game.viewFor(null).phase !== 'development'; i++) advance(100);
    expect(game.viewFor(null).phase).toBe('development');

    game.handle('s2', { type: 'pub' });
    game.handle('s1', { type: 'buyMule' });
    const walk = game.viewFor(null).players.find((p) => p.id === 's1')!.colonist!.walk!;
    expect(walk, 'Lena is walking to the corral').not.toBeNull();
    // Nobody else acts from here: only the walk's own timer can settle it.
    advance(walk.arrivesAt - ctx.now() + 2_000);
    const lena = game.viewFor('s1');
    expect(lena.players.find((p) => p.id === 's1')!.colonist!.walk, 'her walk has settled').toBeNull();
    expect(lena.me!.carriedMule, 'and she leads the MULE she bought').toBe('empty');
  });
});
