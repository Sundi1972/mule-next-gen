import { AiSeat } from '@mule/ai';
import { DEV_STEER, IDLE_INPUT, type DevFloor } from '@mule/engine';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type MuleGame, turnOverAt } from '../src/mule-game.js';
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

describe("FM-ai-tick-time: turnOverAt, a seat's turn is over by a given time, the tick's own, not the wall clock", () => {
  it.each(rows)('$name: over $over', ({ done, devEndsAt, at, over }) => {
    expect(turnOverAt(done, devEndsAt, at)).toBe(over);
  });
});

/** Where a seat's colonist stands on the server's steered floor. */
type Standing = (seatId: string) => { space: string; x: number; y: number };

/** The game's steered floor and clock, read through its private fields as the server tests read its GameState. */
type Inside = { steering: { origin: number; floor: DevFloor } | null; devEndsAt: number | null };

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
 * the tick due `ticksEarly` ticks before devEndsAt is next; `queue` then sends what the phones send, and that tick's
 * timer fires late, the clock reading `lateBy` ms past its due time. Returns the from-ticks the AI's hand was asked for
 * in that late batch, how many ticks have stepped since (one frame each), the phase after it, and the game to play on.
 */
function lateBatch(ticksEarly: number, lateBy: number, queue: (game: MuleGame, standing: Standing, lateTick: number) => void = () => {}) {
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
  // The floor the steering last stepped, read even once the phase has ended and the views no longer show it.
  const standing: Standing = (seatId) => {
    const c = steering.floor.colonists.find((q) => q.id === seatId)!;
    return { space: c.space, x: c.x, y: c.y };
  };
  queue(game, standing, lateTick);
  asked.length = 0;
  const framesBefore = frames.length;
  const real = ctx.now;
  ctx.now = () => real() + lateBy;
  advance(dueOf(lateTick) - real());
  const lateNow = ctx.now();
  ctx.now = real;
  const stepped = () => frames.length - framesBefore;
  return { game, ctx, advance, standing, asked, stepped, phase: game.viewFor(null).phase, lateTick, lateNow, end, dueOf };
}


describe("FM-ai-tick-time on the server: a late steer tick's AI input follows the tick's own time", () => {
  it('a late batch run with the wall clock past devEndsAt steps exactly the ticks due before it (AM-19), the AI hand asked for each', () => {
    let from: ReturnType<Standing> | null = null;
    const { game, ctx, advance, standing, asked, stepped, phase, lateTick, lateNow, end, dueOf } = lateBatch(2, 110, (table, standing, lateTick) => {
      from = standing('s1');
      // Heiko's phone steers for the batch's third tick, the one at devEndsAt, which AM-19 never steps.
      table.handle('s1', { type: 'steer', x: 1, y: 0, tick: lateTick + 2 });
    });
    // The batch's first two ticks resolve before the clock's end, though the wall clock already reads past it.
    expect(dueOf(lateTick + 1)).toBeLessThan(end);
    expect(dueOf(lateTick + 2)).toBe(end);
    expect(lateNow).toBeGreaterThan(end);
    // As the sim plays them: both ticks before the end ask the AI hand, and no tick at or after the end is stepped.
    expect(asked).toEqual([lateTick, lateTick + 1]);
    expect.soft(stepped()).toBe(2);
    // The steer queued for the tick at devEndsAt never applies: Heiko's colonist stands where it stood.
    expect.soft(standing('s1')).toEqual(from);
    // The development-end timer ends the phase, as on time, still stepping nothing more.
    expect(phase).toBe('development');
    advance(end - ctx.now());
    expect(game.viewFor(null).phase).not.toBe('development');
    expect.soft(stepped()).toBe(2);
    expect(asked).toEqual([lateTick, lateTick + 1]);
  });
});
