import type { GameContext } from '@tabletop/core';
import { describe, expect, it } from 'vitest';
import { WALK } from '@mule/engine';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';

/**
 * A context with a manual clock that also records the wait each timer was
 * given. Copied from mule-game.test.ts, which belongs to another team.
 */
function fakeContext() {
  let now = 0;
  const waits: number[] = [];
  const timers: { at: number; fn: () => void }[] = [];
  const ctx: GameContext = {
    now: () => now,
    schedule: (ms, fn) => {
      waits.push(ms);
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
        const i = timers.indexOf(t);
        if (i < 0) continue;
        timers.splice(i, 1);
        t.fn();
      }
    }
  };
  return { ctx, advance, waits };
}

const seats = [
  { id: 's1', name: 'Heiko', isAi: false },
  { id: 's2', name: 'Mia', isAi: false },
  { id: 's3', name: 'The Baron', isAi: true },
];

type Options = ConstructorParameters<typeof MuleGame>[2];

function started(options?: Options) {
  const fake = fakeContext();
  const game = new MuleGame(fake.ctx, 7, options);
  game.start(seats);
  return { game, ...fake };
}

/** Plays the given game through planning and the land grant, on its own clocks. */
function toDevelopment(options?: Options) {
  const g = started(options);
  g.advance(g.game.viewFor(null).phaseEndsAt! - g.ctx.now());
  while (g.game.viewFor('s1').phase === 'landGrant') g.advance(GRANT_TICK_MS);
  expect(g.game.viewFor('s1').phase).toBe('development');
  return g;
}

/** Plays on until the auction's status screen is up, before its first tick. */
function toAuction(options?: Options) {
  const g = toDevelopment(options);
  while (g.game.viewFor('s1').phase === 'development' || g.game.viewFor('s1').phase === 'production') g.advance(100);
  const auction = g.game.viewFor(null).auction!;
  expect(auction.stage).toBe('status');
  expect(auction.seconds).toBe(WALK.statusMs / 1_000);
  return g;
}

describe('phaseScale and maxMonths', () => {
  it('T-AC-2: with no options, planning waits 45 s and the game runs 12 months', () => {
    const { game, waits, advance } = started();
    expect(waits[0]).toBe(45_000);
    expect(game.viewFor(null).phaseEndsAt).toBe(45_000);
    expect(game.viewFor(null).maxMonths).toBe(12);
    advance(44_999);
    expect(game.viewFor(null).phase).toBe('planning');
    advance(1);
    expect(game.viewFor(null).phase).toBe('landGrant');
  });

  it('T-AC-2: phaseScale 0.1 makes planning wait 4.5 s', () => {
    const { game, waits, advance } = started({ phaseScale: 0.1 });
    expect(waits[0]).toBe(4_500);
    expect(game.viewFor(null).phaseEndsAt).toBe(4_500);
    advance(4_499);
    expect(game.viewFor(null).phase).toBe('planning');
    advance(1);
    expect(game.viewFor(null).phase).toBe('landGrant');
  });

  it.each([
    [undefined, 1_000],
    [1, 1_000],
    [0.1, 100],
  ])('T-AC-2: with phaseScale %s each development second lasts %i ms, on devEndsAt and the clock', (phaseScale, msPerSecond) => {
    const { game, ctx, waits } = toDevelopment(phaseScale === undefined ? undefined : { phaseScale });
    const view = game.viewFor('s1');
    const now = ctx.now();
    expect(view.me!.devEndsAt! - now).toBeCloseTo(view.me!.devSeconds * msPerSecond, 6);
    // Development's own limit, 55 s (a full 50 s clock plus 5), scaled the same way.
    expect(view.phaseEndsAt! - now).toBeCloseTo(55 * msPerSecond, 6);
    // Each player's clock is checked the moment it runs out.
    expect(waits).toContainEqual(expect.closeTo(view.me!.devSeconds * msPerSecond + 1, 6));
  });

  it.each([
    // phaseScale, game seconds left on the status screen after one 100 ms tick, after a 1 s stall
    [undefined, 5.9, 5.7],
    [1, 5.9, 5.7],
    // A tenth of real time: one tick is a whole game second; the stall clamp (300 ms) applies before scaling.
    [0.1, 5, 3],
  ])('T-AC-2: with phaseScale %s the auction status clock reads %s s after a tick and %s s after a stall', (phaseScale, afterTick, afterStall) => {
    const opts = phaseScale === undefined ? undefined : { phaseScale };
    const ticked = toAuction(opts);
    ticked.advance(WALK.tickMs);
    expect(ticked.game.viewFor(null).auction!.seconds).toBeCloseTo(afterTick, 6);

    const stalled = toAuction(opts);
    stalled.advance(1_000);
    expect(stalled.game.viewFor(null).auction!.seconds).toBeCloseTo(afterStall, 6);
  });

  it('T-AC-2: under phaseScale 0.1 the status screen ends after a tenth of its real time', () => {
    const { game, advance } = toAuction({ phaseScale: 0.1 });
    for (let i = 0; i < (WALK.statusMs * 0.1) / WALK.tickMs - 1; i++) advance(WALK.tickMs);
    expect(game.viewFor(null).auction!.stage).toBe('status');
    advance(WALK.tickMs);
    expect(game.viewFor(null).auction!.stage).toBe('declare');
  });

  it('T-AC-2: maxMonths reaches the game and every view', () => {
    const { game } = started({ maxMonths: 2 });
    expect(game.viewFor(null).maxMonths).toBe(2);
    expect(game.viewFor('s1').maxMonths).toBe(2);
  });

  it.each([0, -0.5, Number.NaN, 2])('T-AC-2: phaseScale %s is refused at construction', (phaseScale) => {
    const { ctx } = fakeContext();
    expect(() => new MuleGame(ctx, 7, { phaseScale })).toThrow(RangeError);
  });
});
