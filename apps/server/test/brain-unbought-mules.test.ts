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
import { advancePhase, AI_HANDS, createGame, DEV_STEER, DEVELOPMENT, floorConfig, GOODS, MS_PER_SECOND, type GameState } from '@mule/engine';
import { AiSeat, applyAction, arrive, GOOD_NAME, outfitName, playbookSource, TopPickDecider, type AiAction, type AiSeatOptions, type DevClock } from '@mule/ai';
import { playFloorPhase } from '../../../packages/ai/src/floor-turn.js';
import { createBrain } from '../src/brain/index.js';
import { Playbooks } from '../src/brain/playbooks.js';
import type { PlaybookNote } from '../src/mule-game.js';
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
const AUCTION_WORDS =
  'Kept as is, with no edit to any good, this plan does not play: on the day your hands trade each good themselves. One accepted edit to any good makes the whole plan play.';

let dir: string;
let steer: boolean;
const fullSeconds = DEVELOPMENT.fullSeconds;
beforeEach(() => {
  vi.useFakeTimers();
  steer = DEV_STEER.on;
  DEV_STEER.on = false;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-unbought-'));
});
afterEach(() => {
  vi.useRealTimers();
  DEV_STEER.on = steer;
  DEVELOPMENT.fullSeconds = fullSeconds;
  fs.rmSync(dir, { recursive: true, force: true });
});

const advanceTo = (state: GameState, phase: GameState['phase']) => {
  while (state.phase !== phase) advancePhase(state);
};

/** One Smart seat, `options` its own, whose model keeps every draft; its land and auction briefs as sent. The seat owns a free plains plot. */
function table(options: Partial<AiSeatOptions> = {}) {
  const asked: SdkParams[] = [];
  const sdk = fakeSdk((_n, params) => (asked.push(params), Promise.resolve(sdkMessage(KEEPS, USED))));
  const brain = createBrain({ gameId: 'g-unbought', env: KEY, logPath: path.join(dir, 'costs.jsonl'), sdkFactory: () => sdk });
  const state: GameState = createGame({ seed: 10, players: PLAYERS });
  const plot = state.tiles.findIndex((t) => t.terrain === 'plains' && t.owner === null);
  state.tiles[plot]!.owner = 'p0';
  const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1, ...options });
  const notes: PlaybookNote[] = [];
  const playbooks = new Playbooks({ brain, source: playbookSource([seat]), seats: [seat], record: (n) => notes.push(n) });
  const landBriefs = () => asked.map((p) => promptOf(p).user).filter((u) => u.includes('Land plans for this month'));
  const auctionBriefs = () => asked.map((p) => promptOf(p).user).filter((u) => u.includes('before the auction'));
  return { state, seat, notes, playbooks, landBriefs, auctionBriefs };
}

/** The seat's development turn on tap-to-walk, as play.ts's loop runs it; `before` sees each action first; `left` the seconds it starts with. */
function developTurn(state: GameState, seat: AiSeat, before: (a: AiAction) => void = () => {}, left?: number): void {
  const me = state.players.find((p) => p.id === seat.id)!;
  const clock: DevClock = { left: left ?? me.devSeconds, at: 'store' };
  while (clock.left > 0 && !me.doneDeveloping) {
    arrive(state, seat.id, clock);
    seat.developTick(state, AI_HANDS.devTickMs, clock.left, (a) => (before(a), applyAction(state, seat.id, a, clock)), { at: clock.at!, busy: !!clock.busy });
    clock.left -= AI_HANDS.devTickMs / MS_PER_SECOND;
  }
}

/**
 * The seat's development turn on the floor (steered walking, the live mode), as play.ts runs it. With `spareAfterBuy`,
 * once the hand has bought its first MULE the clock is cut to that many seconds from then, as a pack or a slow walk
 * eats it: the hand hurries to the pub and gives up the step it was walking to ('hurry').
 */
function floorTurn(state: GameState, seat: AiSeat, spareAfterBuy?: number, fullAtStart?: number): void {
  DEV_STEER.on = true;
  if (fullAtStart !== undefined) DEVELOPMENT.fullSeconds = fullAtStart;
  const tickMs = floorConfig().steer.tickMs;
  const ticks = playFloorPhase(state, [seat]);
  let cut = spareAfterBuy === undefined;
  for (let run = 1, step = ticks.next(); !step.done; run++, step = ticks.next()) {
    if (!cut && seat.developLog().some((e) => e.action.type === 'buyMule' && e.ok)) {
      DEVELOPMENT.fullSeconds = (run * tickMs) / MS_PER_SECOND + spareAfterBuy!;
      cut = true;
    }
  }
}

/** Month 1 played as the game asks and takes the plans, its development by the seat's hands; month 2's land brief asked. */
async function monthOne(t: ReturnType<typeof table>, before?: (a: AiAction) => void, develop?: (state: GameState, seat: AiSeat) => void): Promise<void> {
  const { state, seat, playbooks } = t;
  playbooks.ask(state, 1);
  await vi.advanceTimersByTimeAsync(10);
  advanceTo(state, 'landGrant');
  playbooks.takeEffect(state);
  advanceTo(state, 'development');
  playbooks.takePhase(state, 'development');
  if (develop) develop(state, seat);
  else developTurn(state, seat, before);
  advanceTo(state, 'production');
  // The production show: the auction's plan is asked, as the trial and the game ask it once development has run.
  playbooks.askPhase(state, 'auction', []);
  await vi.advanceTimersByTimeAsync(10);
  advanceTo(state, 'auction');
  playbooks.takePhase(state, 'auction');
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

  it('unbought-mules fix: FM-dev-outcome-today (floor): on steered walking, the live mode, the next land brief says what the hands bought and where they installed it', async () => {
    const t = table();
    await monthOne(t, undefined, (state, seat) => floorTurn(state, seat));

    const fitted = t.state.tiles.flatMap((tile, i) => (tile.owner === 'p0' && tile.outfit ? [{ plot: i, outfit: tile.outfit }] : []));
    expect(fitted).toHaveLength(1);
    expect(t.landBriefs()[1]!).toContain(`${HANDS_HEAD} bought 1 MULE; installed a ${outfitName(fitted[0]!.outfit)} on plot ${fitted[0]!.plot}.`);
  });

  it('unbought-mules fix: FM-dev-outcome-today (floor, clock cut): a MULE bought before the clock cut the walk to its outfit is told as bought, with time run out, never as a refused buy', async () => {
    const t = table();
    await monthOne(t, undefined, (state, seat) => floorTurn(state, seat, 1));

    // Ground truth: the buy went through, the outfit was given up as the clock ran short, and nothing was installed.
    const log = t.seat.developLog();
    expect(log.find((e) => e.action.type === 'buyMule')?.ok).toBe(true);
    expect(log.find((e) => e.action.type === 'outfit')).toMatchObject({ ok: false, why: 'hurry' });
    expect(t.state.tiles.some((tile) => tile.owner === 'p0' && tile.outfit)).toBe(false);
    const next = t.landBriefs()[1]!;
    expect(next).toContain(`${HANDS_HEAD} bought 1 MULE; time ran out before a bought MULE was outfitted.`);
    expect(next).not.toContain('a buy refused');
  });

  it("unbought-mules fix: FM-report-throws: a hands report that cannot be read drops only the report; the seat's auction plan is still asked", async () => {
    const t = table();
    vi.spyOn(t.seat, 'developLog').mockImplementation(() => {
      throw new Error('the log is unreadable');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await monthOne(t);

    expect(t.auctionBriefs()).toHaveLength(1);
    expect(t.landBriefs()[1]!).not.toContain(HANDS_HEAD);
  });
});

/** The first MULE the land brief's draft route installs on a numbered plot (not on "granted"): its good's name and plot. */
function draftTarget(brief: string): { good: string; plot: number } {
  const m = /outfit it for ([A-Za-z ]+?), install it on plot (\d+)/.exec(brief.split('\n').find((l) => l.startsWith('Route: '))!)!;
  return { good: m[1]!, plot: Number(m[2]) };
}

/** The outfit named `good` in the brief, by its key. */
const outfitOf = (good: string) => GOODS.find((g) => GOOD_NAME[g] === good)!;

describe('hands-why fix: the next land brief says why the hands stopped', { timeout: 30_000 }, () => {
  it("hands-why fix: FM-dev-stop-reason (walk veto): the hands keep the cash because the walk to the draft's plot no longer fits the clock, and the next brief names that MULE and the walk", async () => {
    const t = table();
    // The turn starts with 5 s on the clock: too little for any walk out to a plot and back.
    await monthOne(t, undefined, (state, seat) => developTurn(state, seat, undefined, 5));

    const { good, plot } = draftTarget(t.landBriefs()[0]!);
    expect(t.state.tiles[plot]!.outfit).toBeNull();
    const next = t.landBriefs()[1]!;
    expect(next).toMatch(new RegExp(`${HANDS_HEAD} bought no MULE; then an? ${good} (MULE|works) on plot ${plot} was ruled out: the walk takes \\d+ s, \\d+ s left\\.`));
  });

  it("hands-why fix: FM-dev-stop-reason (keep the cash): a cautious seat with little cash keeps it over the draft's MULE, and the next brief says it kept the cash over that MULE", async () => {
    const t = table({ persona: 'cautious' });
    await monthOne(t, undefined, (state, seat) => {
      state.players.find((p) => p.id === 'p0')!.money = 230;
      developTurn(state, seat);
    });

    const { good, plot } = draftTarget(t.landBriefs()[0]!);
    // The premise: no MULE went on, and the draft's MULE was open to the hands (not ruled out) when they kept the cash.
    expect(t.state.tiles[plot]!.outfit).toBeNull();
    const stop = t.seat.brain.log.filter((r) => r.kind === 'develop').at(-1)!;
    expect(stop.pick.key).toBe('stop');
    expect(stop.candidates.find((c) => c.key === `install:${outfitOf(good)}:${plot}`)?.veto).toBeNull();
    expect(t.landBriefs()[1]!).toContain(`${HANDS_HEAD} bought no MULE; then kept the cash, which scored above a ${outfitName(outfitOf(good))} on plot ${plot}.`);
  });

  it('hands-why fix: FM-dev-stop-reason (floor): on steered walking, with 10 s on the clock, the next brief says the walk to the draft\'s MULE no longer fit', async () => {
    const t = table();
    await monthOne(t, undefined, (state, seat) => floorTurn(state, seat, undefined, 10));

    const { good, plot } = draftTarget(t.landBriefs()[0]!);
    expect(t.state.tiles[plot]!.outfit).toBeNull();
    expect(t.landBriefs()[1]!).toMatch(new RegExp(`${HANDS_HEAD} bought no MULE; then an? ${good} (MULE|works) on plot ${plot} was ruled out: the walk takes \\d+ s, \\d+ s left\\.`));
  });
});

describe('hands-why fix: the auction brief says whether a kept draft plan plays', { timeout: 30_000 }, () => {
  it("hands-why fix: FM-kept-auction: a seat with a decider, which trades by today's path, is told a reply with no edit leaves its auction plan unplayed; kept, nothing is adopted", async () => {
    const t = table({ decider: new TopPickDecider() });
    await monthOne(t);

    const brief = t.auctionBriefs()[0]!;
    expect(brief).toContain('Your draft auction:');
    expect(brief).toContain(AUCTION_WORDS);
    // Ground truth: the reply kept every good's plan, and no auction playbook was adopted at the auction's start.
    expect(t.notes.filter((n) => n.phase === 'auction')).toEqual([]);
  });

  it('hands-why fix: FM-kept-auction (control): a seat whose own auction draft plays when kept (no decider, own phases on) is not told it does not play', async () => {
    const t = table({ ownPhases: true });
    await monthOne(t);

    const brief = t.auctionBriefs()[0]!;
    expect(brief).toContain('Your draft auction:');
    expect(brief).not.toContain('this plan does not play');
  });
});

