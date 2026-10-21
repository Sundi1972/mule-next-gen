import type { GameContext } from '@tabletop/core';
import { describe, expect, it } from 'vitest';
import { GRANT_TICK_MS, MuleGame, PHASE_MS } from '../src/mule-game.js';

/**
 * A context with a manual clock that records the phase each broadcast went out
 * in. Copied from mule-game.test.ts, which belongs to another team.
 */
function fakeContext(phaseNow: () => string) {
  let now = 0;
  const broadcasts: { at: number; phase: string }[] = [];
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
    changed: () => broadcasts.push({ at: now, phase: phaseNow() }),
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
  return { ctx, advance, broadcasts };
}

const humans = ['s1', 's2'];
const seats = [
  { id: 's1', name: 'Heiko', isAi: false },
  { id: 's2', name: 'Mia', isAi: false },
  { id: 's3', name: 'The Baron', isAi: true },
];

/** Plays to development, then lets the humans either go to the pub at once or sit idle. */
function developmentEnds(seed: number, humansGoToPub: boolean) {
  let game: MuleGame | null = null;
  const { ctx, advance, broadcasts } = fakeContext(() => game!.viewFor(null).phase);
  game = new MuleGame(ctx, seed);
  game.start(seats);
  advance(PHASE_MS.planning);
  while (game.viewFor(null).phase === 'landGrant') advance(GRANT_TICK_MS);
  expect(game.viewFor(null).phase).toBe('development');
  const aiEndsAt = game.viewFor('s3').me!.devEndsAt!;
  const humansEndAt = Math.max(...humans.map((id) => game!.viewFor(id).me!.devEndsAt!));
  if (humansGoToPub) for (const id of humans) game.handle(id, { type: 'pub' });
  expect(game.viewFor(null).phase).toBe('development');

  // Small steps, so a broadcast that only comes with production's own timer can't hide in one big jump.
  while (game.viewFor(null).phase === 'development') advance(10);
  const productionAt = ctx.now();
  expect(game.viewFor(null).phase).toBe('production');
  return { productionAt, aiEndsAt, humansEndAt, broadcasts };
}

describe('broadcasts', () => {
  it('FM-1: when an AI\'s pub ends development, every screen hears production', () => {
    const { productionAt, aiEndsAt, broadcasts } = developmentEnds(7, true);
    // The AI ended development itself, at the pub, before its own clock ran out.
    expect(productionAt).toBeLessThan(aiEndsAt);
    const heard = broadcasts.filter((b) => b.phase === 'production');
    expect(heard.length).toBeGreaterThan(0);
    expect(heard[0]!.at).toBeLessThan(productionAt + PHASE_MS.production);
  });

  it('FM-1: when the clock ends development, every screen hears production', () => {
    const { productionAt, humansEndAt, broadcasts } = developmentEnds(7, false);
    // The last human's clock ran out; that is what ended development.
    expect(productionAt).toBeGreaterThanOrEqual(humansEndAt);
    const heard = broadcasts.filter((b) => b.phase === 'production');
    expect(heard.length).toBeGreaterThan(0);
    expect(heard[0]!.at).toBeLessThan(productionAt + PHASE_MS.production);
  });
});
