import { describe, expect, it } from 'vitest';
import { advancePhase, applyReach, buildFloor, createGame, DEV_STEER, DEVELOPMENT, pubPayoutFor, reachOf, type AiLevelId } from '@mule/engine';
import { placePoint } from '../src/floor-time.js';
import { simFloorConfig } from '../src/floor-turn.js';
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
    const saved = { floorSeconds: DEV_STEER.floorSeconds, waits: DEV_STEER.month1WaitsForFirstMule };
    // The pub is three hall units in from the right door, a third of the door-to-corral walk: four clocks a crossing.
    DEV_STEER.floorSeconds = DEVELOPMENT.fullSeconds * 4;
    // Month 1's waiting clock would give them the time: this is the clock alone.
    DEV_STEER.month1WaitsForFirstMule = false;
    try {
      const [first] = steeredTurns(1);
      expect(first!.map((t) => t.pubAt)).toEqual(LEVELS.map(() => null));
    } finally {
      DEV_STEER.floorSeconds = saved.floorSeconds;
      DEV_STEER.month1WaitsForFirstMule = saved.waits;
    }
  });
});

describe('the sim referees the floor as the server will (arcade C10)', () => {
  it('C10: a pub press pays exactly what game.ts pubPayoutFor says, and the button said so first', { timeout: 120_000 }, () => {
    steered(() => {
      // One press, by hand: a colonist standing in the pub with 30 s on the clock.
      const state = createGame({ seed: 4, players: LEVELS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
      while (state.phase !== 'development') advancePhase(state);
      const cfg = simFloorConfig();
      const pub = placePoint('pub', cfg.hall);
      const built = buildFloor(state, cfg);
      const floor = { ...built, colonists: built.colonists.map((c) => (c.id === 'ai1' ? { ...c, space: 'hall' as const, ...pub } : c)) };
      const secondsLeft = 30;
      const expected = pubPayoutFor(state, 'ai1', secondsLeft);
      expect(reachOf(floor, state, 'ai1', cfg, { secondsLeft })).toEqual({ kind: 'pub', enabled: true, payout: expected });
      const money = state.players[1]!.money;
      expect(applyReach(state, floor, 'ai1', secondsLeft, cfg).payout).toBe(expected);
      expect(state.players[1]!.money - money).toBe(expected);
    });
    // And in played turns: every pub paid what its button quoted, from the same pubPayoutFor.
    const turns = steeredTurns(12).flat();
    for (const t of turns) expect(t.payout, `month ${t.month} ${t.id}`).toBe(t.quoted);
    expect(turns.every((t) => t.quoted !== null)).toBe(true);
  });

  it('AM-3: in month 1 the clock stands until every seat has its first MULE in, and runs at once without the rule', { timeout: 120_000 }, () => {
    const month1 = (waits: boolean) => {
      const saved = DEV_STEER.month1WaitsForFirstMule;
      DEV_STEER.month1WaitsForFirstMule = waits;
      try {
        return steered(() => playGame(1, seatsFor(1)));
      } finally {
        DEV_STEER.month1WaitsForFirstMule = saved;
      }
    };
    const waited = month1(true);
    // The seats got in by themselves (no host's stand-in), and the time they took stood off the clock.
    expect(waited.month1).toMatchObject({ continued: false });
    expect(waited.month1!.waited).toBeGreaterThan(0);
    const first = waited.turns.filter((t) => t.month === 1);
    expect(first.every((t) => t.installs > 0), JSON.stringify(first)).toBe(true);
    expect(month1(false).month1).toBeNull();
  });
});
