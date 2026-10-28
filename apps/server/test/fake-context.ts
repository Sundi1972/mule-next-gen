import { advancePhase, COLONY_SELLER, createGame } from '@mule/engine';
import type { GameContext } from '@tabletop/core';

/** The three seats these server tests play with. */
export const seats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Mia', isAi: false, color: 1 },
  { id: 's3', name: 'The Baron', isAi: true, color: 2 },
];

/**
 * A game context with a manual clock. `waits` is the wait each scheduled timer
 * was given; `onChanged` is called with the clock's time on every `changed()`.
 */
export function fakeContext(options: { onChanged?: (at: number) => void } = {}) {
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
    changed: () => options.onChanged?.(now),
  };
  const advance = (ms: number) => {
    now += ms;
    for (let due = timers.filter((t) => t.at <= now); due.length > 0; due = timers.filter((t) => t.at <= now)) {
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i < 0) continue; // A timer an earlier one cancelled doesn't run.
        timers.splice(i, 1);
        t.fn();
      }
    }
  };
  return { ctx, advance, waits };
}

/** The first seed whose month-1 roll brings a colony lot for these seats, found by playing the engine, never by mocking its RNG. */
export function colonySeed(players: { id: string; name: string; isAi: boolean }[] = seats): number {
  for (let seed = 1; seed < 1_000; seed++) {
    const state = createGame({ seed, players });
    while (state.phase !== 'landGrant') advancePhase(state);
    advancePhase(state);
    if (state.landAuction?.lot?.seller === COLONY_SELLER) return seed;
  }
  throw new Error('no colony seed under 1000');
}
