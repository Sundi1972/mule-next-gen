import { describe, expect, it } from 'vitest';
import type { GameState } from '@mule/engine';
import type { DecisionRecord } from '../src/brain.js';
import type { Choice, Decider } from '../src/decider.js';
import { simSeats } from '../src/lineup.js';
import { playGame, playGameAsync, type PlayedGame, type PlayOptions, type SeatSpec } from '../src/play.js';

const SPECS = (seed: number) => simSeats(4, 'trader', seed);
// A full game takes 1-2 s alone and several times that while the whole workspace tests in parallel.
const GAMES = { timeout: 60_000 };
const PICK_B: Choice = { optionId: 'B', line: null, by: 'llm' };

/** Everything a played game reports, as one string to compare. */
function fingerprint(game: PlayedGame, records: DecisionRecord[]): string {
  const { state, auction, lots, broke, decisions } = game;
  return JSON.stringify({ state, auction, lots, broke, decisions, records });
}

function recording(options: PlayOptions = {}): { records: DecisionRecord[]; options: PlayOptions } {
  const records: DecisionRecord[] = [];
  return { records, options: { ...options, onDecision: (r) => records.push(r) } };
}

function nextTimer(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A decider that answers B, only once the test lets it: its answers wait until `release()`. */
function lateB(): { decider: Decider; release: () => void } {
  const waiting: (() => void)[] = [];
  return {
    decider: { name: 'late-b', decide: () => new Promise<Choice>((resolve) => waiting.push(() => resolve(PICK_B))) },
    release: () => {
      for (const answer of waiting.splice(0)) answer();
    },
  };
}

const seatRecords = (records: DecisionRecord[], seat: string) => records.filter((r) => r.seat === seat);
const withChoice = (records: DecisionRecord[]) => records.filter((r) => r.shortlist.length > 1);

describe('playGameAsync', GAMES, () => {
  it.each([1, 7, 101])('T-AC-6: playGame and playGameAsync play the same game (seed %i, no hooks)', async (seed) => {
    const sync = recording();
    const played = playGame(seed, SPECS(seed), sync.options);
    const async_ = recording();
    const awaited = await playGameAsync(seed, SPECS(seed), async_.options);

    expect(played.state.phase).toBe('gameOver');
    expect(fingerprint(awaited, async_.records)).toBe(fingerprint(played, sync.records));
  });

  it('T-AC-6: playGame and playGameAsync play the same game when between awaits a real timer (seed 101)', async () => {
    const sync = recording();
    const played = playGame(101, SPECS(101), sync.options);
    const async_ = recording({ between: nextTimer });
    const awaited = await playGameAsync(101, SPECS(101), async_.options);

    expect(fingerprint(awaited, async_.records)).toBe(fingerprint(played, sync.records));
  }, 120_000);

  it('INV-between: deciderFor returning null for every seat plays the same game as no hook', async () => {
    const plain = recording();
    const played = playGame(7, SPECS(7), plain.options);
    const hooked = recording({ deciderFor: () => null });
    const sync = playGame(7, SPECS(7), hooked.options);
    const awaitedHooks = recording({ deciderFor: () => null });
    const awaited = await playGameAsync(7, SPECS(7), awaitedHooks.options);

    expect(fingerprint(sync, hooked.records)).toBe(fingerprint(played, plain.records));
    expect(fingerprint(awaited, awaitedHooks.records)).toBe(fingerprint(played, plain.records));
  });

  it('INV-between: between runs at least once in every phase of the game, planning and upkeep included', async () => {
    let live: GameState | null = null;
    const played = new Set<string>();
    const calls: Record<string, number> = {};
    await playGameAsync(101, SPECS(101), {
      onPhase: (state) => {
        live = state;
        played.add(state.phase);
      },
      // Until the first phase ends the game is in its opening phase, planning.
      between: () => {
        const phase = live?.phase ?? 'planning';
        calls[phase] = (calls[phase] ?? 0) + 1;
      },
    });

    for (const phase of ['planning', 'landGrant', 'development', 'production', 'auction', 'upkeep']) expect(played).toContain(phase);
    for (const phase of played) expect(calls[phase] ?? 0, phase).toBeGreaterThanOrEqual(1);
    expect(Object.keys(calls).sort()).toEqual([...played].sort());
  });
});

describe('deciderFor', GAMES, () => {
  it('INV-between: a seat given a decider plays its pick; the other seats keep the default pick', () => {
    const specs = SPECS(101);
    const asked: [string, SeatSpec, number][] = [];
    const run = recording({
      deciderFor: (seatId, spec, index) => {
        asked.push([seatId, spec, index]);
        return seatId === 'ai0' ? { name: 'always-b', decide: () => PICK_B } : null;
      },
    });
    playGame(101, specs, run.options);

    expect(asked).toEqual(specs.map((spec, i) => [`ai${i}`, spec, i]));
    const mine = withChoice(seatRecords(run.records, 'ai0'));
    expect(mine.length).toBeGreaterThan(10);
    for (const r of mine) expect({ by: r.by, pick: r.pick.id }).toEqual({ by: 'llm', pick: 'B' });
    const others = run.records.filter((r) => r.seat !== 'ai0');
    expect(others.length).toBeGreaterThan(30);
    for (const r of others) expect(r.by).toBe('top');
  });

  it('INV-between: an async decider answer that arrives in between is played, not the fallback', async () => {
    const late = lateB();
    const run = recording({
      deciderFor: (seatId) => (seatId === 'ai0' ? late.decider : null),
      between: async () => {
        late.release();
        await Promise.resolve();
      },
    });
    await playGameAsync(101, SPECS(101), run.options);

    const mine = withChoice(seatRecords(run.records, 'ai0'));
    expect(mine.length).toBeGreaterThan(10);
    for (const r of mine) expect({ by: r.by, pick: r.pick.id, note: r.note }).toEqual({ by: 'llm', pick: 'B', note: undefined });
  });

  it('INV-between: the same late decider under synchronous playGame always falls back, so between is what lets the answer in', () => {
    const late = lateB();
    const run = recording({ deciderFor: (seatId) => (seatId === 'ai0' ? late.decider : null) });
    playGame(101, SPECS(101), run.options);

    const mine = withChoice(seatRecords(run.records, 'ai0'));
    expect(mine.length).toBeGreaterThan(10);
    for (const r of mine) expect(r.by).toBe('fallback');
  });
});
