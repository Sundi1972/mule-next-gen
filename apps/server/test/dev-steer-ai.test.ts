import { playGame, type SeatSpec } from '@mule/ai';
import { AI_PLANS, boxOf, DEV_STEER, EVENT_SHOW, GOODS, HALL, stableJson, type GameState } from '@mule/engine';
import type { SeatInfo } from '@tabletop/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrain } from '../src/brain/index.js';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, pressAct, readyAll, steerTo, type SteerPoint } from './fake-context.js';

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

/** T-AC-1's check: the sim's and the server's game, development by development, whole state and all. */
function parity(seed: number, politics: boolean): void {
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
}

describe('the AI walks the floor on the server as in the sim (arcade C9, HC-4)', () => {
  // Since PR-3 the seats play their development and auction parts here (the default path), the draft point inside the
  // floor tick's recorded step on the server and at the same step in the sim (C4, RULE-7).
  for (const { seed, politics } of GAMES) {
    it(`T-AC-1 (HC-4): seed ${seed}${politics ? ', politics on' : ''}: an AI-only game ends every development on the server as in the sim`, { timeout: 60_000 }, () => {
      parity(seed, politics);
    });
  }

  // AM-24: the parity runs both ways. Today's path (AI_PLANS.on false) on the first game, a whole game like its
  // neighbours (a few seconds).
  it(`T-AC-1 (HC-4, AM-24): seed ${GAMES[0]!.seed} on today's path: an AI-only game ends every development on the server as in the sim`, { timeout: 60_000 }, () => {
    const saved = AI_PLANS.on;
    AI_PLANS.on = false;
    try {
      parity(GAMES[0]!.seed, GAMES[0]!.politics);
    } finally {
      AI_PLANS.on = saved;
    }
  });

  it('C9 (WS3 condition 3): in a steered development the tap path never runs: no scheduleAiDevelop, no aiAct', { timeout: 60_000 }, () => {
    const server = serverGame(1, false);
    expect(server.outcomes).toHaveLength(MONTHS);
    expect(server.outcomes.some((o) => o.players.some((p) => p.mules > 0)), 'the AI developed, by walking').toBe(true);
    expect(server.taps).toEqual({ scheduled: 0, acts: 0 });
  });
});

/** One human and one AI seat at a table, seed 7. */
const HUMAN = 's1';
const BARON = 's2';
const mixed: SeatInfo[] = [
  { id: HUMAN, name: 'Lena', isAi: false, color: 0 },
  { id: BARON, name: 'The Baron', isAi: true, color: 1 },
];
const toPub: SteerPoint[] = [
  { space: 'hall', ...HALL.spots.pub },
  { space: 'hall', x: (boxOf('pub').x0 + boxOf('pub').x1) / 2, y: (boxOf('pub').y0 + boxOf('pub').y1) / 2 },
];

/**
 * The mixed table played into month 1's development, its clock running from the start as in any later month; and,
 * once development ends, whether the AI seat was done then and whether the clock had run out.
 */
function mixedDevelopment() {
  const rule = DEV_STEER.month1WaitsForFirstMule;
  DEV_STEER.month1WaitsForFirstMule = false;
  try {
    const fake = fakeContext({ table: mixed });
    const game = new MuleGame(fake.ctx, 7, { brain: createBrain({ gameId: 'ai-wait', env: {} }), log: () => {} });
    const inside = game as unknown as Inside & { devEndsAt: number | null };
    const ended: { aiDone: boolean; timeUp: boolean }[] = [];
    const finish = inside.finishDevelopment.bind(game);
    inside.finishDevelopment = () => {
      const ai = inside.state.players.find((p) => p.id === BARON)!;
      ended.push({ aiDone: ai.doneDeveloping, timeUp: inside.devEndsAt !== null && inside.devEndsAt <= fake.ctx.now() });
      finish();
    };
    game.start(mixed);
    readyAll(game);
    for (let i = 0; i < 10_000 && inside.state.phase !== 'development'; i++) fake.advance(100);
    if (inside.state.phase !== 'development') throw new Error('month 1 never reached development');
    const aiOf = () => inside.state.players.find((p) => p.id === BARON)!;
    /** The AI seat still has its turn and the clock time left. */
    const aiStillWalking = () => !aiOf().doneDeveloping && inside.devEndsAt !== null && inside.devEndsAt > fake.ctx.now();
    /** Runs the ticks until development ends, at most a full clock and a second more. */
    const runOut = () => {
      for (let i = 0; i < 2_000 && inside.state.phase === 'development'; i++) fake.advance(TICK);
    };
    return { game, fake, inside, ended, aiOf, aiStillWalking, runOut };
  } finally {
    DEV_STEER.month1WaitsForFirstMule = rule;
  }
}

describe('a table with a human waits for its AI colonists in a steered development', () => {
  it('T-AC-1: at a table with a human, development waits for the AI colonists still walking when the human drops or goes to the pub', () => {
    // The human's phone drops a few ticks in.
    const dropped = mixedDevelopment();
    dropped.fake.advance(5 * TICK);
    expect(dropped.aiStillWalking(), 'the row means something: the AI has its turn and time left').toBe(true);
    dropped.game.connectionChanged(HUMAN, false);
    expect(dropped.inside.state.phase, 'a dropped human ends nothing while the AI still walks').toBe('development');
    dropped.fake.advance(20 * TICK);
    expect(dropped.aiStillWalking()).toBe(true);
    expect(dropped.inside.state.phase).toBe('development');
    dropped.runOut();
    expect(dropped.inside.state.phase).not.toBe('development');
    expect(dropped.ended).toHaveLength(1);
    expect(dropped.ended[0]!.aiDone || dropped.ended[0]!.timeUp, 'development ended at the AI\'s pub or the clock').toBe(true);

    // The human walks into the store and ends the turn at the pub; then the phone is put down.
    const pubbed = mixedDevelopment();
    pressAct(pubbed.game, pubbed.fake, HUMAN);
    steerTo(pubbed.game, pubbed.fake, HUMAN, toPub);
    pressAct(pubbed.game, pubbed.fake, HUMAN);
    expect(pubbed.inside.state.players.find((p) => p.id === HUMAN)!.doneDeveloping, 'the human went to the pub').toBe(true);
    expect(pubbed.aiStillWalking(), 'the row means something: the AI has its turn and time left').toBe(true);
    expect(pubbed.inside.state.phase, 'the human at the pub ends nothing while the AI still walks').toBe('development');
    pubbed.game.connectionChanged(HUMAN, false);
    expect(pubbed.inside.state.phase, 'nor does the phone put down after the pub').toBe('development');
    pubbed.runOut();
    expect(pubbed.inside.state.phase).not.toBe('development');
    expect(pubbed.ended).toHaveLength(1);
    expect(pubbed.ended[0]!.aiDone || pubbed.ended[0]!.timeUp, 'development ended at the AI\'s pub or the clock').toBe(true);
  });
});
