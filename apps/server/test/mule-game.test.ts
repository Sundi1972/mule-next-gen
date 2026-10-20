import type { GameContext } from '@tabletop/core';
import { describe, expect, it } from 'vitest';
import { MuleGame, PHASE_MS } from '../src/mule-game.js';

/** A context with a manual clock, so phase timers run instantly. */
function fakeContext() {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const ctx: GameContext = {
    now: () => now,
    schedule: (ms, fn) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => timers.splice(timers.indexOf(t), 1);
    },
    changed: () => {},
  };
  const advance = (ms: number) => {
    now += ms;
    for (let due = timers.filter((t) => t.at <= now); due.length > 0; due = timers.filter((t) => t.at <= now)) {
      for (const t of due) {
        timers.splice(timers.indexOf(t), 1);
        t.fn();
      }
    }
  };
  return { ctx, advance };
}

const seats = [
  { id: 's1', name: 'Heiko', isAi: false },
  { id: 's2', name: 'Mia', isAi: false },
  { id: 's3', name: 'The Baron', isAi: true },
];

describe('MuleGame', () => {
  it('moves on when the phase timer runs out', () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    expect(game.viewFor('s1').phase).toBe('planning');
    advance(PHASE_MS.planning);
    expect(game.viewFor('s1').phase).toBe('landGrant');
  });

  it('moves on early when every connected player is ready, without waiting for a dropped phone', () => {
    const { ctx } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    game.handle('s1', { type: 'ready' });
    expect(game.viewFor('s1').phase).toBe('planning');
    game.connectionChanged('s2', false);
    expect(game.viewFor('s1').phase).toBe('landGrant');
  });

  it('shows each player only their own stock and land secrets', () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    advance(PHASE_MS.planning);
    const plot = game.viewFor('s1').tiles.find((t) => t.terrain !== 'store' && !t.owner)!;
    game.handle('s1', { type: 'claim', x: plot.x, y: plot.y });
    const mine = game.viewFor('s1').tiles.find((t) => t.x === plot.x && t.y === plot.y)!;
    const theirs = game.viewFor('s2').tiles.find((t) => t.x === plot.x && t.y === plot.y)!;
    const board = game.viewFor(null);
    expect(mine.traits).toBeDefined();
    expect(theirs.traits).toBeUndefined();
    expect(game.viewFor('s2').me?.id).toBe('s2');
    expect(board.me).toBeNull();
    expect(board.tiles.every((t) => t.traits === undefined && t.crystite === undefined)).toBe(true);
  });
});
