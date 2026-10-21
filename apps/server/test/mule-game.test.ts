import type { GameContext } from '@tabletop/core';
import { describe, expect, it } from 'vitest';
import { WALK } from '@mule/engine';
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
      return () => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    changed: () => {},
  };
  const advance = (ms: number) => {
    now += ms;
    for (let due = timers.filter((t) => t.at <= now); due.length > 0; due = timers.filter((t) => t.at <= now)) {
      for (const t of due) {
        // A timer an earlier one cancelled doesn't run.
        const i = timers.indexOf(t);
        if (i < 0) continue;
        timers.splice(i, 1);
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
    // The AI player finishes its own turn at a human's pace, then the phase ends.
    for (let i = 0; i < 120 && game.viewFor('s1').phase === 'development'; i++) advance(1_000);
    expect(game.viewFor('s1').phase).toBe('production');
  });

  it('lets the AI player claim land, then buy, outfit and install a MULE through the same moves as a phone', () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    advance(PHASE_MS.planning);
    while (game.viewFor('s1').phase === 'landGrant') advance(GRANT_TICK_MS);
    const owned = () => game.viewFor(null).tiles.filter((t) => t.owner === 's3');
    expect(owned().length).toBeGreaterThan(0);
    // The humans go straight to the pub; the AI keeps its own clock.
    game.handle('s1', { type: 'pub' });
    game.handle('s2', { type: 'pub' });
    expect(game.viewFor('s1').phase).toBe('development');
    for (let i = 0; i < 120 && game.viewFor('s1').phase === 'development'; i++) advance(1_000);
    expect(game.viewFor('s1').phase).toBe('production');
    expect(owned().some((t) => t.outfit !== null)).toBe(true);
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

  /** Plays through to the auction with the fake clock. */
  function toAuction() {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    advance(PHASE_MS.planning);
    while (game.viewFor('s1').phase === 'landGrant') advance(GRANT_TICK_MS);
    while (game.viewFor('s1').phase === 'development') advance(1_000);
    while (game.viewFor('s1').phase === 'production') advance(1_000);
    expect(game.viewFor('s1').phase).toBe('auction');
    return { game, advance, ctx };
  }

  it('runs the auction live on the server clock: status, declare, walk, good by good', () => {
    const { game, advance } = toAuction();
    const view = game.viewFor(null);
    expect(view.phaseEndsAt).toBeNull();
    const first = view.auction!;
    expect(first.stage).toBe('status');
    expect(first.total).toBe(WALK.statusMs / 1_000);
    expect(first.status.map((r) => r.id)).toEqual(['s1', 's2', 's3']);
    // Both humans are done with the status screen; the AI is done by itself.
    game.handle('s1', { type: 'ready' });
    game.handle('s2', { type: 'ready' });
    advance(WALK.tickMs * 2);
    expect(game.viewFor(null).auction!.stage).toBe('declare');
    expect(() => game.handle('s1', { type: 'walk', dir: 'up' })).toThrow('Not walking');
    game.handle('s1', { type: 'declare', side: 'buyer' });
    game.handle('s1', { type: 'ready' });
    game.handle('s2', { type: 'ready' });
    advance(WALK.tickMs * 2);
    const walk = game.viewFor('s1').auction!;
    expect(walk.stage).toBe('walk');
    expect(walk.total).toBe(WALK.goodMs / 1_000);
    const before = walk.walkers.find((w) => w.id === 's1')!;
    expect(before.side).toBe('buyer');
    game.handle('s1', { type: 'walk', dir: 'up' });
    advance(1_000);
    const after = game.viewFor('s2').auction!.walkers.find((w) => w.id === 's1')!;
    expect(after.at).toBeGreaterThan(before.at);
    expect(after.dir).toBe(1);
  });

  it('moves on to upkeep once the last good is done, and counts a dropped phone as done', () => {
    const { game, advance } = toAuction();
    game.connectionChanged('s2', false);
    for (let i = 0; i < 2_000 && game.viewFor('s1').phase === 'auction'; i++) {
      game.handle('s1', { type: 'ready' });
      advance(WALK.tickMs);
    }
    expect(game.viewFor('s1').phase).toBe('upkeep');
    expect(game.viewFor('s1').auction).toBeNull();
  });
});

