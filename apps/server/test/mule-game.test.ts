import type { GameContext } from '@tabletop/core';
import { describe, expect, it } from 'vitest';
import { GRANT_TICK_MS, MuleGame, PHASE_MS } from '../src/mule-game.js';

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
    const lit = game.viewFor('s1').lit!;
    game.handle('s1', { type: 'claim', x: lit.x, y: lit.y });
    const mine = game.viewFor('s1').tiles.find((t) => t.x === lit.x && t.y === lit.y)!;
    const theirs = game.viewFor('s2').tiles.find((t) => t.x === lit.x && t.y === lit.y)!;
    const board = game.viewFor(null);
    expect(mine.owner).toBe('s1');
    expect(mine.traits).toBeDefined();
    expect(mine.ground).toBeUndefined();
    expect(theirs.traits).toBeUndefined();
    expect(game.viewFor('s2').me?.id).toBe('s2');
    expect(board.me).toBeNull();
    expect(board.tiles.every((t) => t.traits === undefined && t.ground === undefined)).toBe(true);
  });

  it('moves the land grant light on a tick and only lets the lit plot be claimed', () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    advance(PHASE_MS.planning);
    const first = game.viewFor('s1').lit!;
    const other = game.viewFor('s1').tiles.find((t) => t.terrain !== 'store' && !t.owner && (t.x !== first.x || t.y !== first.y))!;
    expect(() => game.handle('s1', { type: 'claim', x: other.x, y: other.y })).toThrow('not lit');
    advance(GRANT_TICK_MS);
    expect(game.viewFor('s1').lit).not.toEqual(first);
  });

  it('gives each player their own development clock, shortened by analyses and ended by the pub', () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    advance(PHASE_MS.planning);
    while (game.viewFor('s1').phase === 'landGrant') advance(GRANT_TICK_MS);
    const view = game.viewFor('s1');
    expect(view.phase).toBe('development');
    const ends = view.me!.devEndsAt!;
    const plot = view.tiles.find((t) => t.terrain !== 'store')!;
    game.handle('s1', { type: 'analyse', x: plot.x, y: plot.y });
    const after = game.viewFor('s1');
    expect(after.me!.devEndsAt).toBeLessThan(ends);
    expect(after.tiles.find((t) => t.x === plot.x && t.y === plot.y)!.ground).toBeDefined();
    expect(game.viewFor('s2').tiles.find((t) => t.x === plot.x && t.y === plot.y)!.ground).toBeUndefined();
    // Mia goes to the pub for cash while she still has time.
    const money = after.players.find((p) => p.id === 's2')!.money;
    game.handle('s2', { type: 'pub' });
    expect(game.viewFor('s2').players.find((p) => p.id === 's2')!.money).toBeGreaterThan(money);
    expect(() => game.handle('s2', { type: 'buyMule' })).toThrow('pub');
    // Heiko burns his time on analyses until it is up, which ends development.
    expect(() => {
      for (let i = 0; i < 20; i++) game.handle('s1', { type: 'analyse', x: plot.x, y: plot.y });
    }).toThrow('time is up');
    expect(game.viewFor('s1').phase).toBe('production');
  });

  it('tells each player their development time and what their plots made', () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    expect(game.viewFor('s1').me!.produced).toBeNull();
    advance(PHASE_MS.planning);
    while (game.viewFor('s1').phase === 'landGrant') advance(GRANT_TICK_MS);
    const dev = game.viewFor('s1').me!;
    expect(dev.devSeconds).toBeGreaterThan(0);
    expect(dev.devEndsAt! - ctx.now()).toBe(dev.devSeconds * 1_000);
    while (game.viewFor('s1').phase === 'development') advance(1_000);
    expect(game.viewFor('s1').phase).toBe('production');
    const produced = game.viewFor('s1').me!.produced;
    expect(produced).not.toBeNull();
    expect(produced!.food).toBeGreaterThanOrEqual(0);
  });
});
