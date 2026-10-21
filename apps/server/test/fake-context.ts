import type { GameContext } from '@tabletop/core';

/** The three seats these server tests play with. */
export const seats = [
  { id: 's1', name: 'Heiko', isAi: false },
  { id: 's2', name: 'Mia', isAi: false },
  { id: 's3', name: 'The Baron', isAi: true },
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
