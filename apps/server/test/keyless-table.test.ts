import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_LEVELS, EVENT_SHOW, GAME, LOTS, RuleError, WALK } from '@mule/engine';
import type { MuleIntent, MuleView } from '@mule/protocol';
import { Room, TableError, type ClientEnvelope, type Connection, type GameContext } from '@tabletop/core';
import { AI_NAMES, DEFAULT_AI_LEVEL, MuleGame } from '../src/mule-game.js';
import type { SdkModuleFake } from './brain-fakes.js';

/**
 * G-2's keyless half: AI seats never stall a game with ANTHROPIC_API_KEY unset. Games on the real server (a Room and
 * MuleGame with its default brain, which reads the environment) on the fake clock, one human host and four AI seats,
 * played to gameOver. setup.ts deletes the key and the auth token before every server test file.
 */

/** The SDK module's constructor: records every client built, so a keyless game that builds one fails. */
const sdkModule = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdkModule));

const CODE = 'KEYLESS';
/** Game time per step of the fake clock; every timer due in a step runs, with promises settled between them. */
const STEP_MS = 500;
/** How long the host looks at planning, and reads the month end, before pressing on: the two phases that wait for players. */
const HOST_PRESSES_AFTER_MS = 3_000;
/** The goods auction at its slowest: every good's side pick, walk at the trading clock, and close. */
const GOODS_AUCTION_MS = WALK.order.length * (WALK.statusMs + WALK.goodMs / WALK.tradeClockRate + WALK.closeMs);
/** The land auction at its slowest: every lot of the month and the colony's plot, each run to its late-change cap. */
const LAND_AUCTION_MS = (LOTS.maxLotsPerMonth + 1) * (LOTS.introMs + LOTS.walkMs + LOTS.lateCapMs + LOTS.resultMs);
const AIS = 4;

let rooms: Room<MuleIntent, MuleView>[];

beforeEach(() => {
  sdkModule.built = [];
  sdkModule.create = null;
  rooms = [];
  vi.useFakeTimers();
});
afterEach(() => {
  for (const room of rooms) room.dispose();
  vi.useRealTimers();
});

/** A phase as the game lived it: month, phase, and how long it was open (game ms). */
interface PhaseLived {
  month: number;
  phase: string;
  ms: number;
  /** The most the phase was still open past its legal length or its own clock's end. */
  overrunMs: number;
}

/**
 * How far past its legal length a phase may stay open before it counts as stalled. Keyless there is no model wait
 * anywhere: what is left is the AI seat's own reaction (its level's slowest) and the step this loop sees the change in.
 */
const SLACK_MS = AI_LEVELS[DEFAULT_AI_LEVEL].reactMs[1] + STEP_MS;

/**
 * The longest a phase may legally stay open, from the config, or null where the view carries its clock (phaseEndsAt:
 * development and production), which is checked step by step instead. A month's event show may hold any phase's clocks
 * up to its cap. The phases with no clock wait for the host's press. A phase not named here with no clock in the view
 * may run no longer than the longest one, the goods auction.
 */
function legalMs(phase: string, view: MuleView): number | null {
  const show = EVENT_SHOW.capMs;
  switch (phase) {
    case 'planning':
    case 'upkeep':
      return HOST_PRESSES_AFTER_MS + show;
    case 'landGrant':
      return GAME.grantSweeps * view.width * view.height * GAME.grantTickMs + show;
    case 'landAuction':
      return LAND_AUCTION_MS + show;
    case 'auction':
      return GOODS_AUCTION_MS + show;
    default:
      return null;
  }
}

/** Whether a phase has stalled: open past its legal length, or past its own clock, by more than SLACK_MS. */
function stalledBy(p: PhaseLived): boolean {
  return p.overrunMs > SLACK_MS;
}

/**
 * Plays one game of `months` to gameOver, or until a phase stalls. The host presses Ready only where the game waits for
 * its players (planning, the month end), HOST_PRESSES_AFTER_MS in; everything else ends on its own clock or the AI
 * seats' moves. Returns every phase it lived, and the first that stalled.
 */
async function playKeyless(seed: number, months: number): Promise<{ finished: boolean; phases: PhaseLived[]; stalled: PhaseLived | null }> {
  let game: MuleGame | null = null;
  const room = new Room<MuleIntent, MuleView>({
    code: CODE,
    createGame: (ctx: GameContext) => (game = new MuleGame(ctx, seed, { maxMonths: months })),
    aiNames: AI_NAMES,
    isUserError: (err) => err instanceof RuleError || err instanceof TableError,
  });
  rooms.push(room);
  const host = { conn: { send: () => undefined } as Connection<MuleView>, from: { seatId: null as string | null } };
  const send = (msg: ClientEnvelope<MuleIntent>) => room.receive(host.conn, host.from, msg);
  send({ t: 'join', code: CODE, name: 'Heiko' });
  for (let i = 0; i < AIS; i++) send({ t: 'addAi' });
  send({ t: 'start' });

  const now = () => game!.viewFor(null);
  const lived = (month: number, phase: string): PhaseLived => ({ month, phase, ms: 0, overrunMs: 0 });
  const phases: PhaseLived[] = [];
  let current = lived(now().month, now().phase);
  while (!(now().finished ?? false)) {
    await vi.advanceTimersByTimeAsync(STEP_MS);
    const view = now();
    const { month, phase, phaseEndsAt } = view;
    if (month !== current.month || phase !== current.phase) {
      phases.push(current);
      current = lived(month, phase);
      continue;
    }
    current.ms += STEP_MS;
    const legal = legalMs(phase, view);
    const over = phaseEndsAt !== null ? Date.now() - phaseEndsAt : current.ms - (legal ?? GOODS_AUCTION_MS + EVENT_SHOW.capMs);
    current.overrunMs = Math.max(current.overrunMs, over);
    if ((phase === 'planning' || phase === 'upkeep') && current.ms >= HOST_PRESSES_AFTER_MS) send({ t: 'intent', intent: { type: 'ready' } });
    if (stalledBy(current)) return { finished: false, phases, stalled: current };
  }
  phases.push(current);
  return { finished: true, phases, stalled: null };
}

/** G-2's twenty games, as WS2's brain:trial seeds them. Local only (MULE_FULL=1, `pnpm test:full`): about 20 s a game, 7 minutes for the twenty. */
const FULL = process.env.MULE_FULL === '1';
const TRIAL_SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i);

describe('G-2 keyless: AI seats never stall a game with the key unset', () => {
  it('UBER-AC-2 (key unset, server): a 3-month game of four AI seats and a host reaches gameOver, no phase outlives its legal length or its clock, and no client is built', async () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    const { finished, phases, stalled } = await playKeyless(101, 3);
    expect(stalled, `stalled: ${JSON.stringify(stalled)}`).toBeNull();
    expect(finished).toBe(true);
    expect(new Set(phases.map((p) => p.month)).size).toBe(3);
    expect(sdkModule.built).toEqual([]);
  }, 60_000);

  it.runIf(FULL)('UBER-AC-2 (key unset, server): twenty whole games of four AI seats and a host, seeds 101 to 120, all reach gameOver with zero stalled phases and no client built', async () => {
    expect(process.env.ANTHROPIC_API_KEY).toBeUndefined();
    const stalls: string[] = [];
    for (const seed of TRIAL_SEEDS) {
      const { finished, phases, stalled } = await playKeyless(seed, GAME.maxMonths);
      if (stalled) stalls.push(`seed ${seed}: month ${stalled.month} ${stalled.phase} open ${stalled.ms} ms, ${stalled.overrunMs} ms past its bound`);
      else if (!finished) stalls.push(`seed ${seed}: no gameOver`);
      console.log(`keyless seed ${seed}: ${finished ? 'over' : 'stalled'}, ${phases.length} phases, longest ${Math.max(...phases.map((p) => p.ms)) / 1_000} s`);
    }
    expect(stalls, stalls.join('; ')).toEqual([]);
    expect(sdkModule.built).toEqual([]);
  }, 30 * 60_000);
});
