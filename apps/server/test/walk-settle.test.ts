import type { GameContext } from '@tabletop/core';
import { describe, expect, it } from 'vitest';
import type { GameState } from '@mule/engine';
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
      // Never sooner than a millisecond on: a real timer always lets some time pass.
      const t = { at: now + Math.max(1, ms - earlyMs), fn };
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
  /** Month 1 to development on a clock that fires `earlyMs` early; then Ossa goes to the pub, and nobody else acts. */
  function ossaAtThePub(earlyMs: number) {
    const clock = earlyClock(earlyMs);
    const game = new MuleGame(clock.ctx, 7);
    game.start(walkers);
    readyAll(game);
    for (let i = 0; i < 10_000 && game.viewFor(null).phase !== 'development'; i++) clock.advance(100);
    expect(game.viewFor(null).phase).toBe('development');
    game.handle('s2', { type: 'pub' });
    return { game, ...clock };
  }
  const lenaOnFloor = (game: MuleGame) => game.viewFor(null).players.find((p) => p.id === 's1')!.colonist!;

  it.each([1, 3])('Lena walks to the corral while Ossa is already at the pub, timers %i ms early: with nobody else acting, her MULE still arrives', (earlyMs) => {
    const { game, ctx, advance } = ossaAtThePub(earlyMs);

    game.handle('s1', { type: 'buyMule' });
    const walk = game.viewFor(null).players.find((p) => p.id === 's1')!.colonist!.walk!;
    expect(walk, 'Lena is walking to the corral').not.toBeNull();
    // Nobody else acts from here: only the walk's own timer can settle it.
    advance(walk.arrivesAt - ctx.now() + 2_000);
    const lena = game.viewFor('s1');
    expect(lena.players.find((p) => p.id === 's1')!.colonist!.walk, 'her walk has settled').toBeNull();
    expect(lena.me!.carriedMule, 'and she leads the MULE she bought').toBe('empty');
  });

  it('Lena analyses a plot while Ossa is already at the pub, timers 1 ms early: the assay ends, and so does her wait', () => {
    const { game, ctx, advance } = ossaAtThePub(1);
    const state = (game as unknown as { state: GameState }).state;
    const tile = state.tiles.findIndex((t) => t.owner === null && t.terrain !== 'river');
    game.handle('s1', { type: 'analyse', x: tile % state.width, y: Math.floor(tile / state.width) });
    // The walk out and the assay each end on a timer that fires early; nobody else acts.
    const busy = () => game.viewFor(null).phase === 'development' && (lenaOnFloor(game).walk !== null || lenaOnFloor(game).assayUntil !== null);
    for (let i = 0; i < 100 && busy(); i++) advance(1_000);
    expect(game.viewFor(null).phase, 'her assay settled while her turn was still running').toBe('development');
    expect({ walk: lenaOnFloor(game).walk, assayUntil: lenaOnFloor(game).assayUntil }, 'her walk and her assay have both settled').toEqual({ walk: null, assayUntil: null });
    expect(state.players.find((p) => p.id === 's1')!.analysed, 'and the plot is analysed for her').toContain(tile);
    void ctx;
  });
});
