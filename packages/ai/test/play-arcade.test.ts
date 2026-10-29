import { describe, expect, it } from 'vitest';
import { DEV_STEER, DEVELOPMENT, type AiLevelId } from '@mule/engine';
import { ROTATION } from '../src/lineup.js';
import { playGame, type DevTurn, type SeatSpec } from '../src/play.js';

/** Every level at the table, the slowest (Rookie) twice: the spec's Kai is a rookie. */
const LEVELS: AiLevelId[] = ['rookie', 'trader', 'tycoon', 'rookie'];
const seatsFor = (seed: number): SeatSpec[] => LEVELS.map((level, i) => ({ level, persona: ROTATION[(i + seed) % ROTATION.length]! }));

/** Runs `body` with DEV_STEER.on set, restoring it after. */
function steered<T>(body: () => T): T {
  const saved = DEV_STEER.on;
  DEV_STEER.on = true;
  try {
    return body();
  } finally {
    DEV_STEER.on = saved;
  }
}

/** The first `phases` development turns of AI-only games from seed 1 on, each the four seats' turns of one month. */
function steeredTurns(phases: number): DevTurn[][] {
  return steered(() => {
    const out: DevTurn[][] = [];
    for (let seed = 1; out.length < phases; seed++) {
      const { turns } = playGame(seed, seatsFor(seed));
      const months = [...new Set(turns.map((t) => t.month))];
      for (const m of months) if (out.length < phases) out.push(turns.filter((t) => t.month === m));
    }
    return out;
  });
}

describe('the AI walks the floor, and the sim plays it (arcade C9, C10)', () => {
  it('T-AC-5: in 20 seeded AI-only turns every AI colonist reaches the pub within 50 s', { timeout: 120_000 }, () => {
    const phases = steeredTurns(20);
    expect(phases).toHaveLength(20);
    for (const [i, seats] of phases.entries()) {
      expect(seats, `turn ${i}: one record a seat`).toHaveLength(LEVELS.length);
      for (const t of seats) {
        const why = `turn ${i}, month ${t.month}, ${t.id}`;
        expect(t.pubAt, `${why}: never reached the pub`).not.toBeNull();
        expect(t.pubAt!, `${why}: reached the pub after the clock`).toBeLessThanOrEqual(DEVELOPMENT.fullSeconds);
      }
    }
    // Reaching the pub is not the whole turn: the AI walked MULEs out and installed them on the way.
    expect(phases.flat().reduce((n, t) => n + t.installs, 0)).toBeGreaterThan(phases.length);
  });

  it('T-AC-5 negative: with a store floor that takes longer than the clock to cross, no colonist reaches the pub', { timeout: 120_000 }, () => {
    const saved = DEV_STEER.floorSeconds;
    DEV_STEER.floorSeconds = DEVELOPMENT.fullSeconds * 2;
    try {
      const [first] = steeredTurns(1);
      expect(first!.map((t) => t.pubAt)).toEqual(LEVELS.map(() => null));
    } finally {
      DEV_STEER.floorSeconds = saved;
    }
  });
});
