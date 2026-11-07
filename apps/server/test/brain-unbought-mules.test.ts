/**
 * Unbought-MULEs fix (deep4, fix 4): in 26 of the 29 Sonnet chances where a seat ended development with idle land, a
 * stocked corral and the cash for a MULE, Claude kept a draft development that held the MULE. A seat with a decider
 * plays nothing it did not edit: today's hands decide each MULE on the day, and may keep the cash, run short of time or
 * find the corral sold out. The land brief must say so where it is true, and the next land brief must say what those
 * hands did, since no route outcome exists for such a month.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePhase, AI_HANDS, createGame, DEV_STEER, MS_PER_SECOND, type GameState } from '@mule/engine';
import { AiSeat, applyAction, arrive, outfitName, playbookSource, TopPickDecider, type AiAction, type AiSeatOptions, type DevClock } from '@mule/ai';
import { createBrain } from '../src/brain/index.js';
import { Playbooks } from '../src/brain/playbooks.js';
import { fakeSdk, KEY, promptOf, sdkMessage, type SdkParams } from './brain-fakes.js';

const PLAYERS = [
  { id: 'p0', name: 'Ada', isAi: true },
  { id: 'p1', name: 'Heiko', isAi: false },
];
const USED = { input: 900, output: 120 };
/** A land write that keeps every draft: no strategy, no edits. */
const KEEPS = JSON.stringify({ edits: [], line: '' });
const KEPT_WORDS =
  'Kept as is, this route does not play: on the day your hands pick each MULE themselves, and may keep the cash or run short of time. To have it played, send it as /development/route.';
const HANDS_HEAD = 'Last time (month 1) you kept the draft development, so your hands developed on their own:';

let dir: string;
let steer: boolean;
beforeEach(() => {
  vi.useFakeTimers();
  steer = DEV_STEER.on;
  DEV_STEER.on = false;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-unbought-'));
});
afterEach(() => {
  vi.useRealTimers();
  DEV_STEER.on = steer;
  fs.rmSync(dir, { recursive: true, force: true });
});

const advanceTo = (state: GameState, phase: GameState['phase']) => {
  while (state.phase !== phase) advancePhase(state);
};

/** One Smart seat, `options` its own, whose model keeps every draft; its land briefs as sent. The seat owns a free plains plot. */
function table(options: Partial<AiSeatOptions> = {}) {
  const asked: SdkParams[] = [];
  const sdk = fakeSdk((_n, params) => (asked.push(params), Promise.resolve(sdkMessage(KEEPS, USED))));
  const brain = createBrain({ gameId: 'g-unbought', env: KEY, logPath: path.join(dir, 'costs.jsonl'), sdkFactory: () => sdk });
  const state: GameState = createGame({ seed: 10, players: PLAYERS });
  const plot = state.tiles.findIndex((t) => t.terrain === 'plains' && t.owner === null);
  state.tiles[plot]!.owner = 'p0';
  const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1, ...options });
  const playbooks = new Playbooks({ brain, source: playbookSource([seat]), seats: [seat] });
  const landBriefs = () => asked.map((p) => promptOf(p).user).filter((u) => u.includes('Land plans for this month'));
  return { state, seat, playbooks, landBriefs };
}

/** The seat's development turn on tap-to-walk, as play.ts's loop runs it; `before` sees each action first. */
function developTurn(state: GameState, seat: AiSeat, before: (a: AiAction) => void = () => {}): void {
  const me = state.players.find((p) => p.id === seat.id)!;
  const clock: DevClock = { left: me.devSeconds, at: 'store' };
  while (clock.left > 0 && !me.doneDeveloping) {
    arrive(state, seat.id, clock);
    seat.developTick(state, AI_HANDS.devTickMs, clock.left, (a) => (before(a), applyAction(state, seat.id, a, clock)), { at: clock.at!, busy: !!clock.busy });
    clock.left -= AI_HANDS.devTickMs / MS_PER_SECOND;
  }
}

/** Month 1 played as the game asks and takes the plans, its development by the seat's hands; month 2's land brief asked. */
async function monthOne(t: ReturnType<typeof table>, before?: (a: AiAction) => void): Promise<void> {
  const { state, seat, playbooks } = t;
  playbooks.ask(state, 1);
  await vi.advanceTimersByTimeAsync(10);
  advanceTo(state, 'landGrant');
  playbooks.takeEffect(state);
  advanceTo(state, 'development');
  playbooks.takePhase(state, 'development');
  developTurn(state, seat, before);
  advanceTo(state, 'production');
  // The production show: the auction's plan is asked, as the trial and the game ask it once development has run.
  playbooks.askPhase(state, 'auction', []);
  await vi.advanceTimersByTimeAsync(10);
  advanceTo(state, 'upkeep');
  playbooks.ask(state, 2);
  await vi.advanceTimersByTimeAsync(10);
}

describe('unbought-mules fix: the land brief says whether a kept draft development plays', { timeout: 30_000 }, () => {
  it('unbought-mules fix: FM-kept-draft: a seat with a decider, which plays today\'s path, is told its kept draft development does not play and how to have it played; kept, no route plays', async () => {
    const t = table({ decider: new TopPickDecider() });
    await monthOne(t);

    const first = t.landBriefs()[0]!;
    expect(first).toContain('Your draft development:');
    expect(first).toContain(KEPT_WORDS);
    // Ground truth: the reply kept the draft, and no route played: the seat has no development outcome for the month.
    expect(t.seat.outcome('development', t.state)).toBeNull();
  });

  it('unbought-mules fix: FM-kept-draft (control): a seat whose own draft plays when kept (no decider, own phases on) is not told it does not play; kept, its route plays', async () => {
    const t = table({ ownPhases: true });
    await monthOne(t);

    const first = t.landBriefs()[0]!;
    expect(first).toContain('Your draft development:');
    expect(first).not.toContain('Kept as is, this route does not play');
    // Ground truth: the seat played its own drafted route.
    expect(t.seat.developLog().some((e) => e.route !== undefined)).toBe(true);
  });
});

describe("unbought-mules fix: the next land brief says what the seat's own hands did in development", { timeout: 30_000 }, () => {
  it('unbought-mules fix: FM-dev-outcome-today: after a month the hands developed on their own, the next land brief says what they bought and where they installed it', async () => {
    const t = table();
    await monthOne(t);

    // Ground truth: the plots the seat's hands fitted in month 1, read from the board.
    const fitted = t.state.tiles.flatMap((tile, i) => (tile.owner === 'p0' && tile.outfit ? [{ plot: i, outfit: tile.outfit }] : []));
    expect(fitted).toHaveLength(1);
    const next = t.landBriefs()[1]!;
    expect(next).toContain(`${HANDS_HEAD} bought 1 MULE; installed a ${outfitName(fitted[0]!.outfit)} on plot ${fitted[0]!.plot}.`);
    expect(next).not.toContain('What happened in your last phase');
  });

  it('unbought-mules fix: FM-dev-outcome-today (sold out): a buy refused because a rival took the last MULE first is told as the corral sold out', async () => {
    const t = table();
    // A rival buys the corral's last MULE the moment before the seat's buy.
    await monthOne(t, (a) => {
      if (a.type === 'buyMule') t.state.store.mules = 0;
    });

    expect(t.state.tiles.some((tile) => tile.owner === 'p0' && tile.outfit)).toBe(false);
    expect(t.landBriefs()[1]!).toContain(`${HANDS_HEAD} bought no MULE; a buy refused: the corral was sold out.`);
  });
});
