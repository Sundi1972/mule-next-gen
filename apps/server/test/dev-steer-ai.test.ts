import { playGame, type SeatSpec } from '@mule/ai';
import { DEV_STEER, EVENT_SHOW, GOODS, stableJson, type GameState } from '@mule/engine';
import type { SeatInfo } from '@tabletop/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrain } from '../src/brain/index.js';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext } from './fake-context.js';

/*
 * Arcade C9 on the server (PR-4's follow-up): with DEV_STEER.on the AI seats walk the floor, their input from the
 * same AiSeat.developSteer the sim's playFloorPhase calls, inside the tick's own step (RULE-1 step 2).
 */

const TICK = DEV_STEER.tickMs;
/** A whole game: twelve developments, month 1's wait for first MULEs among them. */
const MONTHS = 12;
const GAMES: { seed: number; politics: boolean }[] = [
  { seed: 1, politics: false },
  { seed: 2, politics: false },
  { seed: 3, politics: true },
];

/** Four AI seats as the sim names them; on the server their names give them the sim's personas (personaFor). */
const table: SeatInfo[] = Array.from({ length: 4 }, (_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true, color: i }));
/** The sim's seats for the same table: personaFor's order for unnamed seats, at the server's DEFAULT_AI_LEVEL. */
const specs: SeatSpec[] = (['trader', 'aggressive', 'cautious', 'saboteur'] as const).map((persona) => ({ persona, level: 'trader' }));

/** What the floor decides, read as a development ends: each seat's money, stock, turn and MULEs, and every plot's owner and outfit. */
function floorOutcome(state: GameState) {
  return {
    month: state.month,
    players: state.players.map((p) => ({
      id: p.id,
      money: p.money,
      stock: GOODS.map((g) => p.stock[g]),
      done: p.doneDeveloping,
      mules: state.tiles.filter((t) => t.owner === p.id && t.outfit !== null).length,
    })),
    tiles: state.tiles.flatMap((t, i) => (t.owner ? [{ i, owner: t.owner, outfit: t.outfit }] : [])),
    /** The whole engine state, the seeded rng's included: HC-4's "ends in the same state". */
    state: stableJson(state),
  };
}
type Outcome = ReturnType<typeof floorOutcome>;

let flag = DEV_STEER.on;
let cap = EVENT_SHOW.capMs;
beforeEach(() => {
  flag = DEV_STEER.on;
  cap = EVENT_SHOW.capMs;
  DEV_STEER.on = true;
  // The sim has no event show. The server holds a timed phase for its show (RULE-4), and a hold's end checks
  // checkAllReady, which a table with no human passes at once, ending development before a tick; so no show here.
  EVENT_SHOW.capMs = 0;
});
afterEach(() => {
  DEV_STEER.on = flag;
  EVENT_SHOW.capMs = cap;
});

/** The sim's game: each development's outcome, read by onPhase as the phase ends, before production. */
function simGame(seed: number, politics: boolean): Outcome[] {
  const out: Outcome[] = [];
  playGame(seed, specs, { politics, maxMonths: MONTHS, onPhase: (s) => void (s.phase === 'development' && out.push(floorOutcome(s))) });
  return out;
}

/** The private parts of MuleGame this file reads or wraps. */
interface Inside {
  state: GameState;
  finishDevelopment: () => void;
  checkAllReady: () => void;
  scheduleAiDevelop: (...a: unknown[]) => void;
  aiAct: (...a: unknown[]) => boolean;
}

/**
 * The server's game on the fake clock, AI seats only: each development's outcome, read as finishDevelopment runs,
 * before production; and how often the tap path ran. Planning and the month end wait for a human's Ready, and this
 * table has none: the loop checks them as a Ready would. The land grant runs on 1 ms steps, so the AI's claim timers
 * fire in their own order.
 */
function serverGame(seed: number, politics: boolean) {
  const fake = fakeContext({ table, host: null });
  const game = new MuleGame(fake.ctx, seed, { maxMonths: MONTHS, politics, brain: createBrain({ gameId: 'ai-walk', env: {} }), log: () => {} });
  const inside = game as unknown as Inside;
  const outcomes: Outcome[] = [];
  const finish = inside.finishDevelopment.bind(game);
  inside.finishDevelopment = () => {
    outcomes.push(floorOutcome(inside.state));
    finish();
  };
  const taps = { scheduled: 0, acts: 0 };
  const schedule = inside.scheduleAiDevelop.bind(game);
  inside.scheduleAiDevelop = (...a: unknown[]) => {
    taps.scheduled++;
    schedule(...a);
  };
  const aiAct = inside.aiAct.bind(game);
  inside.aiAct = (...a: unknown[]) => {
    if (inside.state.phase === 'development') taps.acts++;
    return aiAct(...a);
  };
  game.start(table);
  for (let i = 0; i < 1_000_000 && inside.state.phase !== 'gameOver'; i++) {
    if (inside.state.phase === 'planning' || inside.state.phase === 'upkeep') inside.checkAllReady();
    fake.advance(inside.state.phase === 'landGrant' ? 1 : TICK);
  }
  return { outcomes, state: inside.state, taps };
}

describe('the AI walks the floor on the server as in the sim (arcade C9, HC-4)', () => {
  for (const { seed, politics } of GAMES) {
    it(`T-AC-1 (HC-4): seed ${seed}${politics ? ', politics on' : ''}: an AI-only game ends every development on the server as in the sim`, { timeout: 60_000 }, () => {
      const sim = simGame(seed, politics);
      const server = serverGame(seed, politics);
      expect(sim, 'the sim played every month').toHaveLength(MONTHS);
      // Not two tables standing still alike: the sim's AI installs MULEs and goes to the pub.
      expect(sim.some((o) => o.players.some((p) => p.mules > 0))).toBe(true);
      expect(sim.every((o) => o.players.some((p) => p.done))).toBe(true);
      expect(server.outcomes, 'the server played every month').toHaveLength(MONTHS);
      for (let m = 0; m < MONTHS; m++) {
        const { state: simState, ...simFloor } = sim[m]!;
        const { state: serverState, ...serverFloor } = server.outcomes[m]!;
        expect(serverFloor, `month ${m + 1}: money, stock, turns, MULEs and plots`).toEqual(simFloor);
        expect(serverState === simState, `month ${m + 1}: the whole engine state`).toBe(true);
      }
      expect(server.state.phase).toBe('gameOver');
    });
  }

  it('C9 (WS3 condition 3): in a steered development the tap path never runs: no scheduleAiDevelop, no aiAct', { timeout: 60_000 }, () => {
    const server = serverGame(1, false);
    expect(server.outcomes).toHaveLength(MONTHS);
    expect(server.outcomes.some((o) => o.players.some((p) => p.mules > 0)), 'the AI developed, by walking').toBe(true);
    expect(server.taps).toEqual({ scheduled: 0, acts: 0 });
  });
});
