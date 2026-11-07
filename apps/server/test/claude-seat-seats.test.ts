import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claudeSeatAt, seatClaude, waitForSeat, wrapsClaudeSeat } from '../src/claude-seat/seats.js';
import { ClaudeSeatWriter } from '../src/claude-seat/writer.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("a Claude seat's wait before Start", () => {
  it('B-AC-3: a wait wakes when its game records the seat, and only for that seat and game', async () => {
    const game = {};
    const other = {};
    const writer = new ClaudeSeatWriter({ id: 's2', persona: 'trader' });
    const waits = { mine: waitForSeat(game, 's2', 25_000), seat: waitForSeat(game, 's3', 25_000), table: waitForSeat(other, 's2', 25_000) };

    await vi.advanceTimersByTimeAsync(10_000);
    seatClaude(game, 's2', 'Claudia', writer);

    expect(await waits.mine).toEqual({ name: 'Claudia', writer });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await waits.seat).toBeNull();
    expect(await waits.table).toBeNull();
  });

  it('B-AC-3: a wait gives up at its hold, or at once when its call is cancelled', async () => {
    const cancel = new AbortController();
    const held = waitForSeat({}, 's2', 25_000);
    const cancelled = waitForSeat({}, 's2', 25_000, cancel.signal);

    cancel.abort();
    expect(await cancelled).toBeNull();
    let done = false;
    void held.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(24_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await held).toBeNull();
  });
});

describe("a Claude seat's writer behind the recorder's wrapper", () => {
  it('B-AC-3: seatClaude records the ClaudeSeatWriter behind a wrapper wrapsClaudeSeat named; an unnamed wrapper records nothing', () => {
    const game = {};
    const writer = new ClaudeSeatWriter({ id: 's2', persona: 'trader' });
    const write = writer.write.bind(writer);

    seatClaude(game, 's2', 'Claudia', wrapsClaudeSeat({ write }, writer));
    seatClaude(game, 's3', 'Claude B', { write });

    expect(claudeSeatAt(game, 's2')).toEqual({ name: 'Claudia', writer });
    expect(claudeSeatAt(game, 's3')).toBeNull();
  });
});
