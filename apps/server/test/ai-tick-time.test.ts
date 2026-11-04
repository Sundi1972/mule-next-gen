import { describe, expect, it } from 'vitest';
import { aiTurnOver } from '../src/mule-game.js';

/*
 * On real Node a busy event loop runs steer ticks late, so a catch-up tick due just before the clock's end can run
 * when the wall clock is already past it. The AI seat's input for that tick must follow the tick's own time, the time
 * its presses resolve at, as the sim's does (HC-4); the wall clock (`now` below) must not decide it.
 */
const END = 60_000;
const rows: { name: string; done: boolean; devEndsAt: number | null; at: number; now: number; over: boolean }[] = [
  { name: 'done at the pub', done: true, devEndsAt: END, at: END - 5_000, now: END - 5_000, over: true },
  { name: "month 1's clock still waiting", done: false, devEndsAt: null, at: END + 5_000, now: END + 5_000, over: false },
  { name: 'a tick at devEndsAt', done: false, devEndsAt: END, at: END, now: END, over: true },
  { name: 'a tick after devEndsAt', done: false, devEndsAt: END, at: END + 1, now: END + 1, over: true },
  { name: 'a late tick before devEndsAt, the wall clock past it', done: false, devEndsAt: END, at: END - 1, now: END + 40, over: false },
];

describe("FM-ai-tick-time: an AI seat's turn is over by the tick's own time, not the wall clock", () => {
  it.each(rows)('$name: over $over', ({ done, devEndsAt, at, over }) => {
    expect(aiTurnOver(done, devEndsAt, at)).toBe(over);
  });
});
