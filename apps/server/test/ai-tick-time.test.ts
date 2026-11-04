import { AiSeat } from '@mule/ai';
import { DEV_STEER, IDLE_INPUT } from '@mule/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aiTurnOver } from '../src/mule-game.js';
import { toDevelopment } from './fake-context.js';

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

/** The game's steered floor and clock, read through its private fields as the server tests read its GameState. */
type Inside = { steering: { origin: number; floor: { tick: number } } | null; devEndsAt: number | null };

let flag = DEV_STEER.on;
beforeEach(() => {
  flag = DEV_STEER.on;
  DEV_STEER.on = true;
});
afterEach(() => {
  DEV_STEER.on = flag;
  vi.restoreAllMocks();
});

/**
 * Plays a steered development (two idle phones, one AI seat standing still) on the fake clock, tick by tick, until
 * the tick due `ticksEarly` ticks before devEndsAt is next; then that tick's timer fires late, the clock reading
 * `lateBy` ms past its due time. Returns the from-ticks the AI's hand was asked for in that late batch, how many
 * ticks the batch stepped (one frame each) and the phase after it.
 */
function lateBatch(ticksEarly: number, lateBy: number) {
  const { game, ctx, advance, frames } = toDevelopment();
  const inside = game as unknown as Inside;
  const steering = inside.steering!;
  const end = inside.devEndsAt!;
  const tickMs = DEV_STEER.tickMs;
  // From-tick k's step resolves at origin + (k + 1) * tickMs.
  const dueOf = (tick: number) => steering.origin + (tick + 1) * tickMs;
  const lateTick = (end - steering.origin) / tickMs - 1 - ticksEarly;
  expect(Number.isInteger(lateTick)).toBe(true);
  // The AI stands still all development, so its turn ends only by the clock, never at the pub.
  const asked: number[] = [];
  vi.spyOn(AiSeat.prototype, 'developSteer').mockImplementation((_state, floor) => {
    asked.push(floor.tick);
    return IDLE_INPUT;
  });
  while (steering.floor.tick < lateTick) advance(dueOf(steering.floor.tick) - ctx.now());
  expect(ctx.now()).toBe(dueOf(lateTick - 1));
  expect(game.viewFor(null).phase).toBe('development');
  asked.length = 0;
  const framesBefore = frames.length;
  const real = ctx.now;
  ctx.now = () => real() + lateBy;
  advance(dueOf(lateTick) - real());
  const lateNow = ctx.now();
  ctx.now = real;
  return { asked, stepped: frames.length - framesBefore, phase: game.viewFor(null).phase, lateTick, lateNow, end, dueOf };
}

describe("FM-ai-tick-time on the server: a late steer tick's AI input follows the tick's own time", () => {
  it('a late batch run with the wall clock past devEndsAt plays every tick due before it, the AI hand asked for each, then ends', () => {
    const { asked, stepped, phase, lateTick, lateNow, end, dueOf } = lateBatch(2, 110);
    // The batch's first two ticks resolve before the clock's end, though the wall clock already reads past it.
    expect(dueOf(lateTick + 1)).toBeLessThan(end);
    expect(dueOf(lateTick + 2)).toBe(end);
    expect(lateNow).toBeGreaterThan(end);
    // As the sim plays them: both ticks before the end ask the AI hand; the tick at the end, its turn over, does not.
    expect(asked).toEqual([lateTick, lateTick + 1]);
    // Development ends in the tick at devEndsAt, not after the batch's first tick.
    expect(stepped).toBe(3);
    expect(phase).not.toBe('development');
  });
});
