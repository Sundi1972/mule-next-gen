/**
 * RULE-A2 rows 3-4 (C4): the development and auction edits, asked in the slack before each phase and taken at its
 * start, on a manual clock. T-AC-A1 and T-AC-A3 for the development and auction deadlines.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePhase, allPrices, createGame, type GameState } from '@mule/engine';
import { AiSeat, atAuctionStart, playbookSource } from '@mule/ai';
import { createBrain, type MeteredBrain } from '../src/brain/index.js';
import { Playbooks } from '../src/brain/playbooks.js';
import type { PlaybookNote } from '../src/mule-game.js';
import { fakeSdk, KEY, neverAnswers, promptOf, readLedger, sdkMessage, type FakeSdk, type SdkParams } from './brain-fakes.js';

const PLAYERS = [
  { id: 'p0', name: 'Ada', isAi: true },
  { id: 'p1', name: 'Heiko', isAi: false },
];
const USED = { input: 900, output: 120 };
const DEV_EDIT = JSON.stringify({ edits: [{ path: '/development/timeBudgetMs', to: 1_000, reason: 'Quick.' }], line: '' });
/** Claude's lines in its land and auction plans. */
const LAND_LINE = 'The north field is mine.';
const AUCTION_LINE = 'Selling my Food dear today.';
/** The paths a write's schema offers, or [] for a request that is not a write. */
const offeredPaths = (params: SdkParams) =>
  ((params.output_config?.format?.schema as { properties?: { edits?: { items: { anyOf: { properties: { path: { enum: string[] } } }[] } } } } | undefined)?.properties?.edits?.items.anyOf ?? []).flatMap(
    (v) => v.properties.path.enum,
  );

let dir: string;
beforeEach(() => {
  vi.useFakeTimers();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-phase-asks-'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const ledgerPath = () => path.join(dir, 'costs.jsonl');
const callLines = () => (fs.existsSync(ledgerPath()) ? readLedger(ledgerPath()).filter((l) => l.type === undefined) : []);
const advanceTo = (state: GameState, phase: GameState['phase']) => {
  while (state.phase !== phase) advancePhase(state);
};
const smartOn = (sdk: FakeSdk): MeteredBrain => createBrain({ gameId: 'g-phases', env: KEY, logPath: ledgerPath(), sdkFactory: () => sdk });

/** A fake model that answers `text` `atMs` after it is asked; an aborted call rejects at once, as the SDK's does. */
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

/** One Smart seat at a game, its playbooks heard, at month 1's land grant: as it ends, the slack before development. */
function table(brain: MeteredBrain) {
  const state: GameState = createGame({ seed: 10, players: PLAYERS });
  const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
  const notes: PlaybookNote[] = [];
  const playbooks = new Playbooks({ brain, source: playbookSource([seat]), seats: [seat], record: (n) => notes.push(n) });
  advanceTo(state, 'landGrant');
  return { state, seat, notes, playbooks };
}

describe('RULE-A2 rows 3-4: the next phase is edited in the slack before it', { timeout: 30_000 }, () => {
  it("T-AC-A1 (development): a reply in the slack takes effect at development's start, adopted and recorded by llm; the brief is the development brief", async () => {
    const asked: SdkParams[] = [];
    const spy = fakeSdk((_n, params) => (asked.push(params), new Promise((resolve) => setTimeout(() => resolve(sdkMessage(DEV_EDIT, USED)), 500))));
    const { state, seat, notes, playbooks } = table(smartOn(spy));

    playbooks.askPhase(state, 'development', []);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'development');
    playbooks.takePhase(state, 'development');

    expect(promptOf(asked[0]!).user).toContain('Your draft development:');
    expect(notes.map((n) => [n.seat, n.month, n.phase, n.playbook.by])).toEqual([['p0', 1, 'development', 'llm']]);
    expect(notes[0]!.playbook.development?.timeBudgetMs).toBe(1_000);
    expect(seat.part(state, 'development')?.part.timeBudgetMs).toBe(1_000);
    expect(callLines().map((l) => [l.kind, l.outcome])).toEqual([['playbook', 'llm']]);
  });

  it('T-AC-A1 (development): a reply landing after development starts is late: dropped, nothing adopted or recorded, and the seat plays its own way', async () => {
    const sdk = answersAt(3_000, DEV_EDIT);
    const { state, seat, notes, playbooks } = table(smartOn(sdk));

    playbooks.askPhase(state, 'development', []);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'development');
    const before = seat.part(state, 'development');
    playbooks.takePhase(state, 'development');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(sdk.calls).toBe(1);
    expect(notes).toEqual([]);
    expect(seat.part(state, 'development')).toEqual(before);
  });

  it('T-AC-A3 (auction): the auction opens on time with a model that never answers: the call is cancelled at its start and nothing is adopted', async () => {
    const sdk = fakeSdk((_n, _params, options) => neverAnswers(options));
    const { state, seat, notes, playbooks } = table(smartOn(sdk));
    advanceTo(state, 'production');

    playbooks.askPhase(state, 'auction', []);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'auction');
    const before = seat.part(state, 'auction');
    // Returns at once: nothing here waits on the model.
    playbooks.takePhase(state, 'auction');
    await vi.advanceTimersByTimeAsync(0);

    expect(sdk.calls).toBe(1);
    expect(notes).toEqual([]);
    expect(seat.part(state, 'auction')).toEqual(before);
    // The seat is free again at once: its next write is asked, not refused as busy.
    advanceTo(state, 'upkeep');
    playbooks.ask(state, 2);
    await vi.advanceTimersByTimeAsync(0);
    expect(sdk.calls).toBe(2);
  });

  it("C4: the ask in production's slack sends the auction brief, and the development's start takes nothing it never asked for", async () => {
    const asked: SdkParams[] = [];
    const spy = fakeSdk((_n, params, options) => (asked.push(params), neverAnswers(options)));
    const { state, playbooks, notes } = table(smartOn(spy));
    advanceTo(state, 'production');
    playbooks.askPhase(state, 'auction', []);
    await vi.advanceTimersByTimeAsync(0);
    expect(promptOf(asked[0]!).user).toContain('Your draft auction:');
    // A takePhase for the development (a phase not asked this month) takes nothing.
    playbooks.takePhase(state, 'development');
    expect(notes).toEqual([]);
  });

  it("C4 (option C): the month's land write carries the development edits; the land grant plays its land part, and the development's start adopts the development part, each recorded by llm under its own phase", async () => {
    const asked: SdkParams[] = [];
    const reply = JSON.stringify({
      edits: [
        { path: '/landGrant/claims', to: 1, reason: 'One will do.' },
        { path: '/development/timeBudgetMs', to: 1_000, reason: 'Quick.' },
      ],
      line: '',
    });
    const sdk = fakeSdk((_n, params) => (asked.push(params), new Promise((resolve) => setTimeout(() => resolve(sdkMessage(reply, USED)), 500))));
    const state: GameState = createGame({ seed: 10, players: PLAYERS });
    const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
    const notes: PlaybookNote[] = [];
    const playbooks = new Playbooks({ brain: smartOn(sdk), source: playbookSource([seat]), seats: [seat], record: (n) => notes.push(n) });

    playbooks.ask(state, 1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(promptOf(asked[0]!).user).toContain('Your draft development:');
    advanceTo(state, 'landGrant');
    playbooks.takeEffect(state);
    // The land grant's playbook carries the land edit only: the development edit waits for its phase.
    expect(notes.map((n) => [n.phase, n.playbook.by])).toEqual([['landGrant', 'llm']]);
    expect(notes[0]!.playbook.landGrant?.claims).toBe(1);
    expect(notes[0]!.playbook.edits?.map((e) => e.path)).toEqual(['/landGrant/claims']);
    expect(notes[0]!.playbook.development).toBeUndefined();

    advanceTo(state, 'development');
    playbooks.takePhase(state, 'development');
    expect(notes.map((n) => [n.phase, n.playbook.by])).toEqual([
      ['landGrant', 'llm'],
      ['development', 'llm'],
    ]);
    expect(notes[1]!.playbook.development?.timeBudgetMs).toBe(1_000);
    expect(notes[1]!.playbook.edits?.map((e) => e.path)).toEqual(['/development/timeBudgetMs']);
    expect(seat.part(state, 'development')?.part.timeBudgetMs).toBe(1_000);
    // One write for both: the month's land write is the only call.
    expect(sdk.calls).toBe(1);
  });

  it('C4 (option C): a land reply with no development edit adopts no development part; a late land reply plays neither', async () => {
    const landOnly = JSON.stringify({ edits: [{ path: '/landGrant/claims', to: 1, reason: 'One.' }], line: '' });
    const { state, seat, notes, playbooks } = (() => {
      const st: GameState = createGame({ seed: 10, players: PLAYERS });
      const se = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
      const ns: PlaybookNote[] = [];
      const pb = new Playbooks({ brain: smartOn(answersAt(500, landOnly)), source: playbookSource([se]), seats: [se], record: (n) => ns.push(n) });
      return { state: st, seat: se, notes: ns, playbooks: pb };
    })();
    playbooks.ask(state, 1);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'landGrant');
    playbooks.takeEffect(state);
    advanceTo(state, 'development');
    const before = seat.part(state, 'development');
    playbooks.takePhase(state, 'development');
    expect(notes.map((n) => n.phase)).toEqual(['landGrant']);
    expect(seat.part(state, 'development')).toEqual(before);
  });

  it("B-AC-1 (a'): Claude's line in each plan it wrote is said as that plan's phase starts: the land write's at the land grant, the auction's at the auction, each with real adopted edits; the development part says nothing", async () => {
    const sdk = fakeSdk((_n, params) => {
      const hold = offeredPaths(params).find((p) => p.endsWith('/hold'));
      if (hold) return sdkMessage(JSON.stringify({ edits: [{ path: hold, to: 0, reason: 'None.' }], line: AUCTION_LINE }), USED);
      const edits = [
        { path: '/landGrant/claims', to: 1, reason: 'One will do.' },
        { path: '/development/timeBudgetMs', to: 1_000, reason: 'Quick.' },
      ];
      return sdkMessage(JSON.stringify({ edits, line: LAND_LINE }), USED);
    });
    const state: GameState = createGame({ seed: 10, players: PLAYERS });
    const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
    const notes: PlaybookNote[] = [];
    const spoken: { seat: string; line: string; month: number; phase: string }[] = [];
    const playbooks = new Playbooks({ brain: smartOn(sdk), source: playbookSource([seat]), seats: [seat], record: (n) => notes.push(n), speak: (id, said) => spoken.push({ seat: id, ...said }) });

    playbooks.ask(state, 1);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'landGrant');
    // Asked and answered, but not said until its phase starts.
    expect(spoken).toEqual([]);
    playbooks.takeEffect(state);
    expect(spoken).toEqual([{ seat: 'p0', line: LAND_LINE, month: 1, phase: 'landGrant' }]);
    advanceTo(state, 'development');
    playbooks.takePhase(state, 'development');
    expect(spoken).toHaveLength(1);
    advanceTo(state, 'production');
    playbooks.askPhase(state, 'auction', []);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'auction');
    playbooks.takePhase(state, 'auction');
    expect(spoken).toEqual([
      { seat: 'p0', line: LAND_LINE, month: 1, phase: 'landGrant' },
      { seat: 'p0', line: AUCTION_LINE, month: 1, phase: 'auction' },
    ]);
    // Each line rode on a plan whose edits were adopted.
    expect(notes.map((n) => [n.phase, n.playbook.by])).toEqual([
      ['landGrant', 'llm'],
      ['development', 'llm'],
      ['auction', 'llm'],
    ]);
  });

  it("B-AC-1 (a'): a plan reply that came too late, or whose line is blank, says nothing", async () => {
    /** Asks month 1's land plan of a model answering `line` at `atMs`, takes it at the land grant, and returns what was said. */
    const saidAt = async (atMs: number, line: string) => {
      const said: string[] = [];
      const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
      const reply = JSON.stringify({ edits: [{ path: '/landGrant/claims', to: 1, reason: 'One.' }], line });
      const playbooks = new Playbooks({ brain: smartOn(answersAt(atMs, reply)), source: playbookSource([seat]), seats: [seat], speak: (_id, s) => said.push(s.line) });
      const state: GameState = createGame({ seed: 10, players: PLAYERS });
      playbooks.ask(state, 1);
      await vi.advanceTimersByTimeAsync(1_000);
      advanceTo(state, 'landGrant');
      playbooks.takeEffect(state);
      await vi.advanceTimersByTimeAsync(10_000);
      return said;
    };
    // Positive control: the same reply in time is said.
    expect(await saidAt(100, LAND_LINE)).toEqual([LAND_LINE]);
    expect(await saidAt(5_000, LAND_LINE)).toEqual([]);
    expect(await saidAt(100, '   ')).toEqual([]);
  });

  it("B-AC-1 (a'): a plan whose every edit was refused says nothing, so the table never hears a plan the seat does not play; a plan that changes nothing, and refused nothing, is said", async () => {
    const saidFor = async (edits: unknown[]) => {
      const said: string[] = [];
      const notes: PlaybookNote[] = [];
      const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
      const reply = JSON.stringify({ edits, line: LAND_LINE });
      const playbooks = new Playbooks({ brain: smartOn(answersAt(100, reply)), source: playbookSource([seat]), seats: [seat], record: (n) => notes.push(n), speak: (_id, s) => said.push(s.line) });
      const state: GameState = createGame({ seed: 10, players: PLAYERS });
      playbooks.ask(state, 1);
      await vi.advanceTimersByTimeAsync(1_000);
      advanceTo(state, 'landGrant');
      playbooks.takeEffect(state);
      return { said, by: notes.map((n) => n.playbook.by) };
    };
    // A path no draft has: refused, so the engine's draft plays and the line is not said.
    expect(await saidFor([{ path: '/landGrant/nothingLikeThis', to: 1, reason: 'Odd.' }])).toEqual({ said: [], by: ['engine'] });
    // No edit at all: Claude keeps the draft as it is, and its line is said.
    expect((await saidFor([])).said).toEqual([LAND_LINE]);
  });

  it("B-AC-1 (a'): a speak that throws stops no play: the seat still adopts the plan, and the game goes on", async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
    const notes: PlaybookNote[] = [];
    const reply = JSON.stringify({ edits: [{ path: '/landGrant/claims', to: 1, reason: 'One.' }], line: LAND_LINE });
    const playbooks = new Playbooks({
      brain: smartOn(answersAt(100, reply)),
      source: playbookSource([seat]),
      seats: [seat],
      record: (n) => notes.push(n),
      speak: () => {
        throw new Error('no chat');
      },
    });
    const state: GameState = createGame({ seed: 10, players: PLAYERS });
    playbooks.ask(state, 1);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'landGrant');
    expect(() => playbooks.takeEffect(state)).not.toThrow();
    expect(notes.map((n) => [n.phase, n.playbook.by])).toEqual([['landGrant', 'llm']]);
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual(["playbooks: seat p0's plan line could not be said: no chat"]);
  });

  it("C4: the auction playbook adopted at the auction's start carries every drafted good, the ones past the brief's cap too", async () => {
    let edited: string | null = null;
    const sdk = fakeSdk((_n, params) => {
      const offered = (params.output_config?.format?.schema as { properties: { edits: { items: { anyOf: { properties: { path: { enum: string[] } } }[] } } } }).properties.edits.items.anyOf.flatMap((v) => v.properties.path.enum);
      edited = offered.find((p) => p.endsWith('/hold'))!;
      return sdkMessage(JSON.stringify({ edits: [{ path: edited, to: 0, reason: 'None.' }], line: '' }), USED);
    });
    const { state, seat, notes, playbooks } = table(smartOn(sdk));
    advanceTo(state, 'production');
    const drafted = Object.keys(seat.draft(state, 'auction').auction ?? {}).sort();
    playbooks.askPhase(state, 'auction', []);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'auction');
    playbooks.takePhase(state, 'auction');
    expect(edited).not.toBeNull();
    expect(notes.map((n) => [n.phase, n.playbook.by])).toEqual([['auction', 'llm']]);
    expect(Object.keys(notes[0]!.playbook.auction ?? {}).sort()).toEqual(drafted);
  });

  it("C4 (option C): the development edits the land write carried apply to the development's draft at its start, not to the draft shown at upkeep, so a plot won since is outfitted", async () => {
    const reply = JSON.stringify({ edits: [{ path: '/development/timeBudgetMs', to: 1_000, reason: 'Quick.' }], line: '' });
    const state: GameState = createGame({ seed: 10, players: PLAYERS });
    const seat = new AiSeat({ id: 'p0', name: 'Ada', persona: 'trader', level: 'trader', seed: 1 });
    const notes: PlaybookNote[] = [];
    const playbooks = new Playbooks({ brain: smartOn(answersAt(500, reply)), source: playbookSource([seat]), seats: [seat], record: (n) => notes.push(n) });
    const shown = seat.draft(state, 'development', 1).development;
    playbooks.ask(state, 1);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'landGrant');
    playbooks.takeEffect(state);
    advanceTo(state, 'development');
    // Won since upkeep: a plot the draft shown at upkeep could not know of.
    for (const t of state.tiles.filter((x) => x.owner === null && x.terrain !== 'store').slice(0, 2)) t.owner = 'p0';
    const fresh = seat.draft(state, 'development').development;
    expect(fresh?.route).not.toEqual(shown?.route);
    playbooks.takePhase(state, 'development');
    expect(notes.map((n) => n.phase)).toEqual(['landGrant', 'development']);
    expect(notes[1]!.playbook.development).toEqual({ ...fresh, timeBudgetMs: 1_000 });
  });

  /** Production's state, the plan shown for it, and the plan the auction would draft once a raid takes all of p0's goods. */
  const raided = (state: GameState, seat: AiSeat) => {
    const shown = seat.draft(atAuctionStart(state), 'auction').auction!;
    const later = structuredClone(state);
    advanceTo(later, 'auction');
    raid(later, shown);
    return { shown, fresh: seat.draft(later, 'auction').auction! };
  };
  const raid = (state: GameState, shown: object) => {
    for (const g of Object.keys(shown)) (state.players[0]!.stock as Record<string, number>)[g] = 0;
  };
  type Plans = ReturnType<typeof raided>;
  const roleOf = (plans: Plans['shown'], g: string) => (plans as Record<string, { role: string }>)[g]?.role;

  it("B fix 1: the auction is briefed on the draft it opens on: with nothing happening between, the plan shown in production is the one the auction drafts", async () => {
    const asked: SdkParams[] = [];
    const { state, seat, playbooks } = table(smartOn(fakeSdk((_n, params, options) => (asked.push(params), neverAnswers(options)))));
    advanceTo(state, 'production');
    const shown = seat.draft(atAuctionStart(state), 'auction');
    playbooks.askPhase(state, 'auction', []);
    await vi.advanceTimersByTimeAsync(0);
    advanceTo(state, 'auction');
    expect(seat.draft(state, 'auction').auction).toEqual(shown.auction);
    expect(asked).toHaveLength(1);
  });

  it("B fix 1 (AM-A17): the auction edits apply to the auction's draft at its start, not to the one shown in production, so stock lost since is planned for", async () => {
    let plans: Plans | null = null;
    let edited: string | null = null;
    const sdk = fakeSdk((_n, params) => {
      // A good whose role the raid leaves alone, so its edit still plays.
      edited = offeredPaths(params).find((p) => p.endsWith('/concedeCrPerS') && roleOf(plans!.shown, p.split('/')[2]!) === roleOf(plans!.fresh, p.split('/')[2]!))!;
      return sdkMessage(JSON.stringify({ edits: [{ path: edited, to: 3, reason: 'Patient.' }], line: '' }), USED);
    });
    const { state, seat, notes, playbooks } = table(smartOn(sdk));
    advanceTo(state, 'production');
    plans = raided(state, seat);
    playbooks.askPhase(state, 'auction', []);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'auction');
    raid(state, plans.shown);
    const fresh = seat.draft(state, 'auction').auction!;
    expect(fresh).toEqual(plans.fresh);
    playbooks.takePhase(state, 'auction');
    expect(edited).toBeTruthy();
    const good = edited!.split('/')[2]!;
    // The drafts differ outside the edited good, so only the fresh one can pass the next line.
    expect({ ...fresh, [good]: null }).not.toEqual({ ...plans.shown, [good]: null });
    expect(notes.map((n) => [n.phase, n.playbook.by])).toEqual([['auction', 'llm']]);
    const played = notes[0]!.playbook.auction as Record<string, unknown>;
    expect({ ...played, [good]: null }).toEqual({ ...fresh, [good]: null });
    expect((played[good] as { concedeCrPerS: number }).concedeCrPerS).toBe(3);
  });

  it("B fix 1 (review of #551): an edit to a good whose role changed since the plan was shown is not played on the new role; it is rejected with why, and the draft's plan for that good plays", async () => {
    let plans: Plans | null = null;
    let edited: string | null = null;
    let kept: string | null = null;
    const sdk = fakeSdk((_n, params) => {
      const offered = offeredPaths(params);
      const flipped = (p: string) => roleOf(plans!.shown, p.split('/')[2]!) !== roleOf(plans!.fresh, p.split('/')[2]!);
      edited = offered.find((p) => p.endsWith('/walkAway') && flipped(p))!;
      kept = offered.find((p) => p.endsWith('/concedeCrPerS') && !flipped(p))!;
      return sdkMessage(JSON.stringify({ edits: [{ path: edited, to: 90, reason: 'Hold out.' }, { path: kept, to: 3, reason: 'Patient.' }], line: '' }), USED);
    });
    const { state, seat, notes, playbooks } = table(smartOn(sdk));
    advanceTo(state, 'production');
    plans = raided(state, seat);
    playbooks.askPhase(state, 'auction', []);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'auction');
    raid(state, plans.shown);
    playbooks.takePhase(state, 'auction');
    expect(edited).toBeTruthy();
    expect(kept).toBeTruthy();
    const good = edited!.split('/')[2]!;
    const played = notes[0]!.playbook.auction as Record<string, unknown>;
    expect(played[good]).toEqual((plans.fresh as Record<string, unknown>)[good]);
    expect((played[kept!.split('/')[2]!] as { concedeCrPerS: number }).concedeCrPerS).toBe(3);
    // Listed once, beside whatever the rules rejected of the kept edit (nothing here).
    expect(notes[0]!.playbook.rejected).toEqual([{ path: edited, to: 90, why: expect.stringMatching(/role/) }]);
  });

  it("B fix 1 (review of #551): a reply that sets a flipped good's role keeps its other edits for that good, read under the role it chose", async () => {
    let plans: Plans | null = null;
    let good: string | null = null;
    const sdk = fakeSdk((_n, params) => {
      const offered = offeredPaths(params);
      const flipped = (g: string) => roleOf(plans!.shown, g) !== roleOf(plans!.fresh, g);
      good = offered.filter((p) => p.endsWith('/walkAway')).map((p) => p.split('/')[2]!).find(flipped)!;
      const shownRole = roleOf(plans!.shown, good);
      return sdkMessage(
        JSON.stringify({ edits: [{ path: `/auction/${good}/role`, to: shownRole, reason: 'Still.' }, { path: `/auction/${good}/concedeCrPerS`, to: 3, reason: 'Patient.' }], line: '' }),
        USED,
      );
    });
    const { state, seat, notes, playbooks } = table(smartOn(sdk));
    advanceTo(state, 'production');
    plans = raided(state, seat);
    playbooks.askPhase(state, 'auction', []);
    await vi.advanceTimersByTimeAsync(1_000);
    advanceTo(state, 'auction');
    raid(state, plans.shown);
    playbooks.takePhase(state, 'auction');
    expect(good).toBeTruthy();
    const played = (notes[0]!.playbook.auction as Record<string, { concedeCrPerS: number }>)[good!]!;
    expect(played.concedeCrPerS).toBe(3);
    expect((notes[0]!.playbook.rejected ?? []).filter((r) => /role changed/.test(r.why))).toEqual([]);
  });
});

describe('deep2: what the Smart seat is asked with (t120s audit, 6 Nov)', { timeout: 30_000 }, () => {
  it("deep2 C1: the auction ask in production's slack shows, and drafts at, the prices the store posts as the auction opens", async () => {
    const asked: SdkParams[] = [];
    const spy = fakeSdk((_n, params, options) => (asked.push(params), neverAnswers(options)));
    const { state, playbooks } = table(smartOn(spy));
    advanceTo(state, 'production');
    // No Food anywhere: the store must raise its price when it posts at the auction's start.
    state.store.stock.food = 0;
    for (const p of state.players) p.stock.food = 0;
    const stale = allPrices(state).food;
    const posted = allPrices(atAuctionStart(state)).food;
    expect(posted).not.toBe(stale);
    playbooks.askPhase(state, 'auction', []);
    await vi.advanceTimersByTimeAsync(0);
    const user = promptOf(asked[0]!).user;
    expect(user).toContain(`Food ${posted}`);
    expect(user).not.toContain(`Food ${stale} `);
    // The game itself is untouched until the auction posts.
    expect(allPrices(state).food).toBe(stale);
  });

  it("deep2: a seat's next land brief shows each seat's Worth change since its last plan; its first shows none", async () => {
    const asked: SdkParams[] = [];
    // Answers at once with nothing to change, so the seat is free for its next ask.
    const spy = fakeSdk((_n, params) => (asked.push(params), Promise.resolve(sdkMessage(JSON.stringify({ edits: [], line: '' }), USED))));
    const { state, playbooks } = table(smartOn(spy));
    playbooks.ask(state, 2);
    await vi.advanceTimersByTimeAsync(10);
    await playbooks.settle();
    state.players.find((p) => p.id === 'p0')!.money += 300;
    playbooks.ask(state, 3);
    await vi.advanceTimersByTimeAsync(10);
    const briefs = asked.map((p) => promptOf(p).user).filter((u) => u.includes('Land plans for this month'));
    expect(briefs).toHaveLength(2);
    expect(briefs[0]).not.toContain('Since your plan for month');
    expect(briefs[1]).toMatch(/Since your plan for month 2: your Worth .+ \(\+300\)/);
  });
});
