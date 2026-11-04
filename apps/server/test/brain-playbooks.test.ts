/** Which land-grant playbook takes effect for a seat, by when its writer's reply came: playbooks.ts on a manual clock. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePhase, BRAIN, createGame, observe, type GameState, type Playbook } from '@mule/engine';
import { AiSeat, candidate, consider, shortlist, type ValidatePlan } from '@mule/ai';
import { createBrain, type BrainService, type MeteredBrain } from '../src/brain/index.js';
import { MuleGame } from '../src/mule-game.js';
import { Playbooks, type PlaybookSource } from '../src/brain/playbooks.js';
import { fakeSdk, KEY, neverAnswers, promptOf, readLedger, sdkMessage, type FakeSdk, type SdkMessage, type SdkParams } from './brain-fakes.js';
import { fakeContext, seats as TABLE } from './fake-context.js';
import { boundsValidate, ENGINE_PRESS, READ_MS, runTable, stubSource } from './playbook-fakes.js';

const SEED = 10;
const PLAYERS = [
  { id: 'p0', name: 'Ada', isAi: true },
  { id: 'p1', name: 'Heiko', isAi: false },
];
const USED = { input: 900, output: 120 };

/** The fake model's reply: plan A's ranking, one claim where the engine drafts two, and the line it says. */
const EDITS = JSON.stringify({
  edits: [
    { path: '/landGrant/ranked', to: 'A', reason: 'A is mine.' },
    { path: '/landGrant/claims', to: 1, reason: 'Save money.' },
  ],
  line: 'Mine.',
});
/** Every edit out of bounds, or refused by the writer before validation. */
const ALL_REFUSED = JSON.stringify({
  edits: [
    { path: '/landGrant/pressShare', to: { start: 0.2, end: 0.7 }, reason: 'Wait for it.' },
    { path: '/landGrant/ranked', to: 'Z', reason: 'No such plan.' },
  ],
  line: '',
});

let dir: string;
beforeEach(() => {
  vi.useFakeTimers();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-playbooks-'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Advances the engine state phase by phase until `phase` opens. */
function advanceTo(state: GameState, phase: GameState['phase']): void {
  while (state.phase !== phase) advancePhase(state);
}

const ledgerPath = () => path.join(dir, 'costs.jsonl');
const callLines = () => (fs.existsSync(ledgerPath()) ? readLedger(ledgerPath()).filter((l) => l.type === undefined) : []);

/**
 * A fake model that answers `text` `atMs` after it is asked; every ask here is made at the game's start. Like the real
 * SDK, a call aborted before it answered rejects at once and never answers.
 */
const answersAt = (atMs: number, text: string) =>
  fakeSdk(
    (_n, _params, options) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => resolve(sdkMessage(text, USED)), atMs);
        options.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(options.signal?.reason);
        });
      }),
  );

/** A fake model whose reply waits for `release`; like the real SDK, a call aborted before that rejects at once. */
function heldModel(text: string) {
  let release = () => {};
  const sdk = fakeSdk(
    (_n, _params, options) =>
      new Promise<SdkMessage>((resolve, reject) => {
        release = () => resolve(sdkMessage(text, USED));
        options.signal?.addEventListener('abort', () => reject(options.signal?.reason));
      }),
  );
  return { sdk, release: () => release() };
}

const smartOn = (sdk: FakeSdk, gameBudgetUsd?: number): MeteredBrain =>
  createBrain({ gameId: 'g-playbooks', env: KEY, logPath: ledgerPath(), sdkFactory: () => sdk, ...(gameBudgetUsd === undefined ? {} : { gameBudgetUsd }) });

/**
 * Month 1 on the clock: the brain asks at game start (time 0), and the land grant starts at `grantAtMs`. Returns the
 * playbook in effect for the AI seat once the clock has run past both.
 */
async function month1(options: { brain: MeteredBrain; source?: PlaybookSource | null; grantAtMs: number; justBeforeGrant?: () => void }) {
  const state: GameState = createGame({ seed: SEED, players: PLAYERS });
  const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
  const source = options.source === undefined ? stubSource() : options.source;
  const playbooks = new Playbooks({ brain: options.brain, source, seats: [seat] });
  const engine = source?.draft(structuredClone(state), 'p0').playbook ?? null;
  playbooks.ask(state, 1);
  let inEffectAtStart: Playbook | null = null;
  setTimeout(() => {
    advanceTo(state, 'landGrant');
    options.justBeforeGrant?.();
    playbooks.takeEffect(state);
    inEffectAtStart = structuredClone(playbooks.playbookFor('p0', 1));
  }, options.grantAtMs);
  await vi.advanceTimersByTimeAsync(10_000);
  return { playbooks, state, inEffectAtStart: inEffectAtStart as Playbook | null, now: playbooks.playbookFor('p0', 1), engine, brain: options.brain };
}

/** The draft's press share once the land grant has started, in `driftingSource`: other than the one the brief showed. */
const LATER_PRESS = { start: 0.6, end: 0.1 };

/** The stub source, whose draft has moved on by the land grant: its press share is LATER_PRESS there. */
function driftingSource(): PlaybookSource {
  const stub = stubSource();
  return {
    draft(state, seat) {
      const made = stub.draft(state, seat);
      if (state.phase === 'landGrant') made.playbook.landGrant!.pressShare = { ...LATER_PRESS };
      return made;
    },
    validate: stub.validate,
  };
}

/** The plots and values plan `id` names in the brief the model read, in order. */
function planInBrief(params: SdkParams, id: string): { plot: number; value: number }[] {
  const line = promptOf(params).user.split('\n').find((l) => l.startsWith(`${id}. `));
  if (!line) throw new Error(`the brief offers no plan ${id}`);
  const plots = line.slice(line.lastIndexOf('): ') + 3);
  return [...plots.matchAll(/plot (\d+) \((-?\d+) cr\)/g)].map((m) => ({ plot: Number(m[1]), value: Number(m[2]) }));
}

describe('RULE-A1: which playbook takes effect at the land grant', () => {
  it('T-AC-A1: row 1, no call was made: with no key, or a share too small for any model, the engine playbook plays by engine; with no source nothing is asked or written', async () => {
    const keyless = await month1({ brain: createBrain({ gameId: 'g-keyless', env: {}, logPath: ledgerPath() }), grantAtMs: 2_000 });
    expect(keyless.now).toEqual({ ...keyless.engine, by: 'engine' });

    const sdk = answersAt(1_000, EDITS);
    const broke = await month1({ brain: smartOn(sdk, 1e-9), grantAtMs: 2_000 });
    expect(sdk.calls).toBe(0);
    expect(broke.now).toEqual({ ...broke.engine, by: 'engine' });
    expect(callLines().map((l) => [l.kind, l.outcome])).toEqual([['strategy', 'budget']]);

    const unused = answersAt(1_000, EDITS);
    const none = await month1({ brain: smartOn(unused), source: null, grantAtMs: 2_000 });
    expect(unused.calls).toBe(0);
    expect(none.now).toBeNull();
  });

  it('T-AC-A1: row 4, a reply 1 s before the land grant: the draft the brief showed, with its accepted edits, plays by llm', async () => {
    const sdk = answersAt(1_000, EDITS);
    // The draft moves on between the ask and the land grant: the edits apply to the one the brief showed.
    const { now, inEffectAtStart, engine } = await month1({ brain: smartOn(sdk), source: driftingSource(), grantAtMs: 2_000 });

    expect(sdk.calls).toBe(1);
    expect(sdk.requests[0]!.params.model).toBe(BRAIN.writeCalls.strategy.model);
    // No land-grant start time is known when it asks, so the call waits its kind's full timeout.
    expect(sdk.requests[0]!.options.timeout).toBe(BRAIN.writeCalls.strategy.timeoutMs);
    const planA = planInBrief(sdk.requests[0]!.params, 'A');
    expect(planA.length).toBeGreaterThan(0);
    expect(engine?.landGrant?.claims).toBe(2);
    expect(inEffectAtStart?.by).toBe('llm');
    expect(inEffectAtStart?.landGrant?.ranked.slice(0, planA.length)).toEqual(planA);
    expect(inEffectAtStart?.landGrant?.claims).toBe(1);
    expect(engine?.landGrant?.pressShare).toEqual(ENGINE_PRESS);
    expect(inEffectAtStart?.landGrant?.pressShare, "the ask-time draft's, not the land grant's").toEqual(ENGINE_PRESS);
    expect(inEffectAtStart?.rejected).toEqual([]);
    expect(now).toEqual(inEffectAtStart);
    expect(callLines().map((l) => [l.kind, l.outcome])).toEqual([['strategy', 'llm']]);
  });

  it('T-AC-A1: row 2, a model still thinking when the land grant starts is cancelled then: the engine playbook plays, and the call is ledgered as a timeout, its bill unknown and counted at the worst case', async () => {
    const sdk = answersAt(1_200, EDITS);
    const { now, inEffectAtStart, engine, brain } = await month1({ brain: smartOn(sdk), grantAtMs: 1_000 });

    expect(sdk.calls).toBe(1);
    expect(sdk.requests[0]!.options.signal?.aborted, 'the land grant cancelled the request').toBe(true);
    expect(inEffectAtStart).toEqual({ ...engine, by: 'engine' });
    expect(now).toEqual(inEffectAtStart);
    const lines = callLines();
    expect(lines.map((l) => [l.kind, l.outcome])).toEqual([['strategy', 'timeout']]);
    expect(lines[0]).toMatchObject({ seat: 'p0', input: 0, output: 0, usd: 0 });
    expect(brain.countedUsd(), "the cancelled call's worst case").toBeGreaterThan(0);
  });

  it("T-AC-A1: row 2, a reply that came in the land grant's tick, just before it started, is never played: the engine playbook stays, and the reply is ledgered late with no usage", async () => {
    const held = heldModel(EDITS);
    const { now, inEffectAtStart, engine, brain } = await month1({ brain: smartOn(held.sdk), grantAtMs: 1_000, justBeforeGrant: held.release });

    expect(held.sdk.calls).toBe(1);
    expect(inEffectAtStart).toEqual({ ...engine, by: 'engine' });
    expect(now).toEqual(inEffectAtStart);
    const lines = callLines();
    expect(lines.map((l) => [l.kind, l.outcome])).toEqual([['strategy', 'llm'], ['strategy', 'late']]);
    expect(lines[1]).toMatchObject({ seat: 'p0', input: 0, cached_read: 0, cache_write: 0, output: 0, usd: 0 });

    // The late line is not a model call: the game's total counts the one call.
    brain.finish();
    const game = readLedger(ledgerPath()).find((l) => l.type === 'game');
    expect(game).toMatchObject({ calls: 1, by_seat: { p0: { calls: 1 } } });
  });

  it('T-AC-A1: row 2, a model that never answers before the land grant leaves the engine playbook, and the land grant cancels its request', async () => {
    const sdk = fakeSdk((_n, _params, options) => neverAnswers(options));
    const { now, engine, playbooks } = await month1({ brain: smartOn(sdk), grantAtMs: 1_000 });
    expect(sdk.calls).toBe(1);
    expect(sdk.requests[0]!.options.signal?.aborted).toBe(true);
    expect(now).toEqual({ ...engine, by: 'engine' });
    expect(playbooks.feedbackFor('p0')).toBeNull();
    expect(callLines().map((l) => [l.kind, l.outcome])).toEqual([['strategy', 'timeout']]);
  });

  it('T-AC-A1: row 3, a reply whose every edit is refused or rejected leaves the engine playbook; what was refused is kept for the next brief, never played, and only until the next month', async () => {
    // Month 1's call answers ALL_REFUSED; month 2's never answers before its land grant.
    const sdk = fakeSdk((n, _params, options) => (n === 1 ? sdkMessage(ALL_REFUSED, USED) : neverAnswers(options)));
    const { now, engine, playbooks, state } = await month1({ brain: smartOn(sdk), grantAtMs: 2_000 });

    expect(now).toEqual({ ...engine, by: 'engine' });
    expect(playbooks.feedbackFor('p0')).toEqual({
      refused: [{ path: '/landGrant/ranked', cause: 'plan_not_offered' }],
      rejected: [{ path: '/landGrant/pressShare', to: { start: 0.2, end: 0.7 }, why: 'out of bounds' }],
    });

    // Month 2's reply never comes: month 1's refusals are not this month's, so the seat has none.
    advanceTo(state, 'upkeep');
    playbooks.ask(state, 2);
    await vi.advanceTimersByTimeAsync(0);
    advanceTo(state, 'landGrant');
    playbooks.takeEffect(state);
    expect(sdk.calls).toBe(2);
    expect(playbooks.playbookFor('p0', 2)?.by).toBe('engine');
    expect(playbooks.feedbackFor('p0')).toBeNull();
  });

  it('T-AC-A1: row 3 against row 4, a reply with one edit the validator accepts plays by llm, even when the validator lists the other edit rejected twice', async () => {
    const twice: ValidatePlan = (state, seat, draft, edits) => {
      const result = boundsValidate(state, seat, draft, edits);
      return { ...result, rejected: result.rejected.flatMap((r) => [r, { ...r, why: 'and again' }]) };
    };
    const reply = JSON.stringify({
      edits: [
        { path: '/landGrant/claims', to: 1, reason: 'Save money.' },
        { path: '/landGrant/pressShare', to: { start: 0.2, end: 0.7 }, reason: 'Wait for it.' },
      ],
      line: '',
    });
    const { now, playbooks } = await month1({ brain: smartOn(answersAt(500, reply)), source: stubSource(twice), grantAtMs: 2_000 });

    expect(now?.by).toBe('llm');
    expect(now?.landGrant?.claims).toBe(1);
    expect(now?.landGrant?.pressShare).toEqual(ENGINE_PRESS);
    expect(playbooks.feedbackFor('p0')?.rejected.map((r) => r.why)).toEqual(['out of bounds', 'and again']);
  });

  it('T-AC-A1: a validator that throws leaves the engine playbook, and the land grant starts', async () => {
    const throwing: ValidatePlan = () => {
      throw new Error('validator fault');
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const sdk = answersAt(500, EDITS);
    const { now, engine } = await month1({ brain: smartOn(sdk), source: stubSource(throwing), grantAtMs: 2_000 });
    expect(now).toEqual({ ...engine, by: 'engine' });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('validator fault'));
  });

  it("INV-write-yields-at-land-grant: with the seat's write still open as the land grant starts, the seat's next decision reaches the model in that same tick; the write settling later leaves that decision's call the seat's one open call", async () => {
    let answerMove = () => {};
    const sdk = fakeSdk((_n, params, options) =>
      isWrite(params) ? neverAnswers(options) : new Promise<SdkMessage>((resolve) => (answerMove = () => resolve(sdkMessage(JSON.stringify({ option: 'B', line: '' }), USED)))),
    );
    const brain = smartOn(sdk);
    const state: GameState = createGame({ seed: SEED, players: PLAYERS });
    const decider = brain.deciderFor({ id: 'p0', persona: 'trader', level: 'trader' });
    const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1, decider });
    const playbooks = new Playbooks({ brain, source: stubSource(), seats: [seat] });
    // A land decision with three plots to choose between, so the seat asks its decider.
    const plots = shortlist(['12', '13', '14'].map((p, i) => candidate(p, `Plot ${p}`, p, 400, [consider('fit', 0.9 - i * 0.05, 1, 'fits')])), 3, 0.5);
    const landAsk = () => seat.brain.ask('land', plots, observe(state, 'p0'), Infinity, null, 'summary');

    playbooks.ask(state, 1);
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.calls).toBe(1);
    // INV-one-in-flight: while the write is open, the seat's decisions make no call.
    const whileWriting = landAsk();
    await vi.advanceTimersByTimeAsync(0);
    expect(whileWriting.options).toHaveLength(3);
    expect(whileWriting.answer?.note).toBe('decider failed: busy');
    expect(sdk.calls).toBe(1);

    // As MuleGame.enterPhase does: the playbook takes effect, then the seat decides, in one tick.
    advanceTo(state, 'landGrant');
    playbooks.takeEffect(state);
    const atGrant = landAsk();
    expect(sdk.calls, "the decision reached the model in the land grant's tick").toBe(2);
    expect(isWrite(sdk.requests[1]!.params)).toBe(false);

    // The cancelled write settles: its own lock is gone, and the decision's call is still the seat's one open call.
    await vi.advanceTimersByTimeAsync(0);
    expect(callLines().map((l) => [l.kind, l.outcome])).toEqual([['strategy', 'timeout']]);
    const meanwhile = landAsk();
    await vi.advanceTimersByTimeAsync(0);
    expect(meanwhile.answer?.note).toBe('decider failed: busy');
    expect(sdk.calls).toBe(2);

    answerMove();
    await vi.advanceTimersByTimeAsync(0);
    expect(atGrant.answer).toMatchObject({ by: 'llm', optionId: 'B' });
    expect(callLines().map((l) => [l.kind, l.outcome])).toEqual([['strategy', 'timeout'], ['land', 'llm']]);
  });
});

/** A 2-month table of two people and The Big Spender on the game's clock, the stub source behind every seat: each phase's start. */
async function phaseStarts(brain: BrainService) {
  const fake = fakeContext({ table: TABLE });
  const game = new MuleGame(fake.ctx, SEED, { maxMonths: 2, brain, playbookSource: stubSource() });
  game.start(TABLE);
  const starts = await runTable(game, fake, () => false);
  game.dispose();
  return starts;
}

/** Whether a request is a writer call: its user text is a land brief. */
const isWrite = (params: SdkParams) => promptOf(params).user.includes('What you may change:');

describe('HC-1: no phase waits for a model', { timeout: 30_000 }, () => {
  it('T-AC-A3: phases start on time with a fake model that never answers: each land grant opens as the people press Ready in planning, each planning as they press it at the month end', async () => {
    const silent = fakeSdk(() => new Promise(() => {}));
    const starts = await phaseStarts(smartOn(silent));

    const opened = (month: number, phase: string) => starts.find(([m, p]) => m === month && p === phase)?.[2];
    expect(starts.at(-1)?.[1]).toBe('gameOver');
    for (const month of [1, 2]) expect(opened(month, 'landGrant')! - opened(month, 'planning')!, `month ${month}'s land grant`).toBe(READ_MS);
    expect(opened(2, 'planning')! - opened(1, 'upkeep')!, "month 2's planning").toBe(READ_MS);
    // The model was asked to write at game start and never answered; month 1's land grant cancelled that call, and the
    // seat's next decision opened the call that then stayed open all game, so month 2's write found the seat busy.
    expect(silent.requests.map((r) => isWrite(r.params))).toEqual([true, false]);
    expect(silent.requests[0]!.options.signal?.aborted).toBe(true);
  });
});
