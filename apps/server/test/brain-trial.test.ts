import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePhase, AI_LEVELS, AI_PERSONAS, BRAIN, createGame, GAME, observe, type GameState } from '@mule/engine';
import { Brain, candidate, consider, parseReply, PERSONAS, ReplyRejected, shortlist, simSeats, toOptions, WAIT_MS, type Choice, type Mind } from '@mule/ai';
import { createHaikuComplete } from '../src/brain/client.js';
import { isCallLine, readLedgerLines, type CallLine } from '../src/brain/ledger.js';
import { cutOffPhase, fallbackReason, renderTrialReport, tournamentBar, trialReport, type TrialGame, type TrialInput } from '../src/brain/trial-report.js';
import { capRefusal, everyCallFailed, exitCode, proofCapRefusal, seedsFlag, tableSeats, tourneySpent, trial, trialLedgerPath, trialSeeds, trialSpent, writeModelFlag } from '../src/brain/trial.js';
import { fakeSdk, KEY, neverAnswers, requestOf, sdkMessage, worstUsdOfRequest, type SdkModuleFake, type SdkParams } from './brain-fakes.js';

/** The SDK module's client: records its options and answers through `sdk.create`; it never reaches the network. */
const sdk = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdk));

/**
 * When armed, the engine's observe throws once, for seat ai2 in month 2's planning, the first time a Smart seat's call
 * is open: the month's election observes ai2 before the land asks, so the phase alone would throw with none open.
 */
const crash = vi.hoisted(() => ({ armed: false, thrown: false, open: (): number => 0, openAtThrow: 0 }));
vi.mock('@mule/engine', async (importOriginal) => {
  const real = await importOriginal<typeof import('@mule/engine')>();
  return {
    ...real,
    observe: (state: Parameters<typeof real.observe>[0], id: string) => {
      if (crash.armed && id === 'ai2' && state.month === 2 && state.phase === 'planning' && crash.open() > 0) {
        crash.armed = false;
        crash.thrown = true;
        crash.openAtThrow = crash.open();
        throw new Error('engine fault for the test');
      }
      return real.observe(state, id);
    },
  };
});

const TODAY = new Date('2026-10-22T09:00:00Z');
/** Fake time per step while a run waits on a never-answering call; its abort timer fires within a few steps. */
const STEP_MS = 250;
/** A trial plays whole strategist games, a few seconds each on a loaded machine. */
const GAMES_MS = 120_000;

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-trial-'));
  file = path.join(dir, 'trial-2026-10-22.jsonl');
  sdk.built = [];
  sdk.create = null;
  crash.armed = false;
  crash.thrown = false;
  crash.open = () => 0;
  crash.openAtThrow = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

const USABLE = '{"option":"A","line":"Mine, and cheap at that."}';
const BILLED = { input: 1_000, output: 20 };
const p = BRAIN.pricesPerMTok;
/** One usable reply's bill, from BRAIN's prices (not from the ledger under test). */
const BILLED_USD = (BILLED.input * p.input + BILLED.output * p.output) / 1_000_000;

/** What one request asked, and its RULE-3 worst case. */
const asked = (params: SdkParams) => ({ ...requestOf(params), worst: worstUsdOfRequest(params) });

/** Starts a run; it calls the SDK before it first yields, so set `sdk.create` before this. */
const run = (argv: string[], env: Record<string, string | undefined> = KEY, out: string[] = []) => {
  return { out, result: trial(argv, env, { dataDir: dir, now: () => TODAY, out: (l) => out.push(l) }) };
};

/** Runs fake time until the promise settles. */
async function drive<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  const settled = promise.finally(() => {
    done = true;
  });
  settled.catch(() => {});
  while (!done) await vi.advanceTimersByTimeAsync(STEP_MS);
  return settled;
}

const callLines = (at = file) => readLedgerLines(at).filter(isCallLine);
const gameLines = (at = file) => readLedgerLines(at).filter((l) => !isCallLine(l));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// The paid-run guard: fast, no game played, so it runs in CI (it guards money).
/** A prior run's ledger: one call line of `usd`, and its game line. */
const ledger = (name: string, usd: number) =>
  fs.writeFileSync(
    path.join(dir, name),
    [
      JSON.stringify({ t: '2026-10-20T09:00:00.000Z', game: 'g', seat: 'ai0', persona: 'trader', level: 'trader', model: BRAIN.writeCalls.strategy.model, kind: 'strategy', input: 0, cached_read: 0, cache_write: 0, output: 0, usd, ms: 1, timed_out: false, outcome: 'llm' }),
      JSON.stringify({ t: '2026-10-20T09:00:01.000Z', game: 'g', type: 'game', seats: 1, calls: 1, usd, by_seat: {} }),
    ].join('\n') + '\n',
  );
/** Counts the SDK calls a run makes; each one gets a usable reply. */
const called = () => {
  let calls = 0;
  sdk.create = () => {
    calls++;
    return Promise.resolve(sdkMessage(USABLE, BILLED));
  };
  return () => calls;
};

describe('brain:trial paid-run guard (PR-5: --run label, the proof cap)', () => {

  it('PR-5: --run <label> names the ledger trial-<day>-<label>.jsonl; with no label it is trial-<day>.jsonl, as before', () => {
    expect(trialLedgerPath(dir, TODAY, 'rerun1')).toBe(path.join(dir, 'trial-2026-10-22-rerun1.jsonl'));
    expect(trialLedgerPath(dir, TODAY, null)).toBe(file);
  });

  it('PR-5: a label whose ledger exists is refused, and nothing is called', async () => {
    const calls = called();
    fs.writeFileSync(path.join(dir, 'trial-2026-10-22-rerun1.jsonl'), '');
    const { out, result } = run(['--games', '1', '--max-usd', '1', '--run', 'rerun1']);
    expect((await result).code).toBe(1);
    expect(calls()).toBe(0);
    expect(out.join('\n')).toContain('trial-2026-10-22-rerun1.jsonl exists');
  });

  it('PR-5: with no label, a second paid run on the same day is refused as before, and nothing is called', async () => {
    const calls = called();
    fs.writeFileSync(file, '');
    const { out, result } = run(['--games', '1', '--max-usd', '1']);
    expect((await result).code).toBe(1);
    expect(calls()).toBe(0);
    expect(out).toEqual([`${file} exists: brain:trial already ran today, and each run needs its own clearance; nothing called.`]);
  });

  it('PR-5: a run whose --max-usd would carry every trial ledger past BRAIN.proofCapUsd is refused before any call; up to the cap it may start', async () => {
    ledger('trial-2026-10-20.jsonl', 6);
    ledger('trial-2026-10-21-a.jsonl', 3.5);
    // Spike ledgers are not trial runs: they do not count.
    ledger('strategy-spike-2026-10-21.jsonl', 5);
    expect(trialSpent(dir)).toBeCloseTo(9.5, 10);
    expect(proofCapRefusal(dir, BRAIN.proofCapUsd - 9.5)).toBeNull();
    expect(proofCapRefusal(dir, 1)).toContain('nothing called');

    const calls = called();
    const { out, result } = run(['--games', '1', '--max-usd', '1', '--run', 'rerun1']);
    expect((await result).code).toBe(1);
    expect(calls()).toBe(0);
    expect(out).toEqual([`brain:trial would pass the PR-5 cap: the trial ledgers hold $9.50000, --max-usd $1.00, cap $${BRAIN.proofCapUsd.toFixed(2)}; nothing called.`]);
    expect(fs.existsSync(path.join(dir, 'trial-2026-10-22-rerun1.jsonl'))).toBe(false);
  });

  it('PR-5: a trial ledger that cannot be read (a torn last line) refuses the run, naming the file, and nothing is called', async () => {
    fs.writeFileSync(path.join(dir, 'trial-2026-10-20.jsonl'), '{"game":"g","usd":0.5,');
    const calls = called();
    const { out, result } = run(['--games', '1', '--max-usd', '1', '--run', 'rerun1']);
    expect((await result).code).toBe(1);
    expect(calls()).toBe(0);
    expect(out).toEqual([`brain:trial cannot check the PR-5 cap: ${path.join(dir, 'trial-2026-10-20.jsonl')} is not a readable ledger; nothing called.`]);
  });

  it('PR-5 5.4: --write-model is sonnet or haiku, named in the run line; anything else, or twice, is a bad flag', async () => {
    expect(writeModelFlag('sonnet')).toBe(BRAIN.strategySpike.models.sonnet);
    expect(writeModelFlag('haiku')).toBe(BRAIN.strategySpike.models.haiku);
    expect(writeModelFlag('opus')).toBeUndefined();
    const calls = called();
    for (const argv of [['--write-model', 'opus'], ['--write-model'], ['--write-model', 'haiku', '--write-model', 'sonnet']]) {
      const { result } = run(['--games', '1', '--max-usd', '1', ...argv]);
      expect((await result).code, argv.join(' ')).toBe(1);
    }
    expect(calls()).toBe(0);
  });

  it('PR-5: a label of anything but lowercase letters, digits and dashes (1 to 32) is refused as a bad flag', async () => {
    const calls = called();
    for (const label of ['Rerun', 'a b', '../x', '']) {
      const { result } = run(['--games', '1', '--max-usd', '1', '--run', label]);
      expect((await result).code, label).toBe(1);
    }
    const { result } = run(['--games', '1', '--max-usd', '1', '--run']);
    expect((await result).code).toBe(1);
    expect(calls()).toBe(0);
  });
});

// The tournament (WS1's bar for UBER-AC-A, Heiko 5 Nov): fast, so it runs in CI (it guards money and the bar).
describe("brain:trial tournament (WS1's bar for UBER-AC-A: --table pair, --seeds, --control, its own cap)", () => {
  const T = BRAIN.tournament;
  /** Results with the Claude chairs at `wins` of 100 games and the given mean ranks. */
  const results = (wins: number, claude: number, engine: number) => ({ games: 100, smartWins: wins, smart: { meanScore: 0, meanRank: claude }, strategist: { meanScore: 0, meanRank: engine } });

  it('TOURNEY-1: --table pair seats Claude on the even chairs and every seat on its playbook path, personas rotating by seed as the sim does; without it, the first K chairs as before', () => {
    for (const seed of [1, 101, 202]) {
      const pair = tableSeats('pair', seed, 2);
      expect(pair.claude).toEqual([0, 2]);
      expect(pair.specs).toEqual(simSeats(4, 'trader', seed, null, 'playbook'));
      expect(pair.specs.map((s) => s.persona)).toEqual(simSeats(4, 'trader', seed, null, 'pair').map((s) => s.persona));
    }
    expect(tableSeats(null, 7, 2)).toEqual({ specs: simSeats(4, 'trader', 7), claude: [0, 1] });
    expect(tableSeats(null, 7, 3).claude).toEqual([0, 1, 2]);
  });

  it('TOURNEY-2: --seeds 1,101,201 with --games 40 plays seeds 1-40, 101-140 and 201-240, as the sim plays 40 games from each; --seed alone plays seed onward as before', () => {
    const seeds = trialSeeds({ seeds: [1, 101, 201], seed: 101, games: 40 });
    expect(seeds).toHaveLength(120);
    expect([seeds[0], seeds[39], seeds[40], seeds[79], seeds[80], seeds[119]]).toEqual([1, 40, 101, 140, 201, 240]);
    expect(trialSeeds({ seeds: null, seed: 101, games: 3 })).toEqual([101, 102, 103]);
    expect(seedsFlag('1,101,201')).toEqual([1, 101, 201]);
    for (const bad of ['', '1,,2', '1,x', '1.5', '-1', '1,1']) expect(seedsFlag(bad), bad).toBeUndefined();
  });

  it('TOURNEY-2: --seeds with --seed, a bad --seeds, --table other than pair, --smart other than 2 under pair, pair without --playbooks 1 (unless --control), or --control without pair, is a bad flag; nothing is called', async () => {
    const calls = called();
    for (const argv of [
      ['--seeds', '1,101', '--seed', '5', '--playbooks', '1'],
      ['--seeds', '1,x', '--playbooks', '1'],
      ['--table', 'trio', '--playbooks', '1'],
      ['--table', 'pair', '--smart', '3', '--playbooks', '1'],
      ['--table', 'pair'],
      ['--control', '1'],
    ]) {
      const { out, result } = run(['--games', '1', '--max-usd', '1', ...argv]);
      expect((await result).code, argv.join(' ')).toBe(1);
      expect(out[0], argv.join(' ')).toMatch(/^Usage: brain:trial/);
    }
    expect(calls()).toBe(0);
  });

  it('TOURNEY-3: a pair run writes tourney-<day>-<label>.jsonl and counts against BRAIN.tournament.capUsd, not the PR-5 cap; the two caps count only their own ledgers', async () => {
    ledger('trial-2026-10-20.jsonl', 9.5);
    ledger('tourney-2026-10-21-a.jsonl', 50);
    expect(trialSpent(dir)).toBeCloseTo(9.5, 10);
    expect(tourneySpent(dir)).toBeCloseTo(50, 10);
    expect(trialLedgerPath(dir, TODAY, 't1', 'tourney')).toBe(path.join(dir, 'tourney-2026-10-22-t1.jsonl'));
    // Past the PR-5 cap, a pair run may still start; past the tournament's, it may not.
    expect(capRefusal(dir, 'pair', T.capUsd - 50)).toBeNull();
    expect(capRefusal(dir, null, 1)).toContain('PR-5 cap');
    expect(capRefusal(dir, 'pair', T.capUsd - 49)).toBe(
      `brain:trial would pass the tournament cap: the tournament ledgers hold $50.00000, --max-usd $11.00, cap $${T.capUsd.toFixed(2)}; nothing called.`,
    );

    const calls = called();
    const { out, result } = run(['--table', 'pair', '--playbooks', '1', '--games', '1', '--max-usd', '11', '--run', 't1']);
    expect((await result).code).toBe(1);
    expect(calls()).toBe(0);
    expect(out).toEqual([capRefusal(dir, 'pair', 11)]);
    expect(fs.existsSync(path.join(dir, 'tourney-2026-10-22-t1.jsonl'))).toBe(false);
  });

  it('TOURNEY-4 (positive control): --control plays the Claude chairs as engine seats: no call with the key set, no --max-usd needed, no ledger; the report judges the control bar over chairs 0 and 2', async () => {
    const calls = called();
    const { out, result } = run(['--table', 'pair', '--control', '1', '--games', '1', '--seed', '1']);
    const { code, report } = await result;
    expect(code).toBe(report!.bar!.verdict === 'pass' ? 0 : 1);
    expect(calls()).toBe(0);
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(report!.results.games).toBe(1);
    expect(report!.bar).toEqual({ kind: 'control', verdict: tournamentBar(report!.results, true, 1) });
    expect(out.join('\n')).toContain('control: the Claude chairs play as engine seats');
  }, GAMES_MS);

  it('TOURNEY-4: a control that does not pass exits 1, so the paid run cannot follow it in a chain; a claim that fails is a result and exits 0; a pair claim without the key is refused before any game', async () => {
    expect(exitCode(false, 'done', { ac2: 'pass', bar: { kind: 'control', verdict: 'fail' } })).toBe(1);
    expect(exitCode(false, 'done', { ac2: 'pass', bar: { kind: 'control', verdict: 'not proven' } })).toBe(1);
    expect(exitCode(false, 'done', { ac2: 'pass', bar: { kind: 'control', verdict: 'pass' } })).toBe(0);
    expect(exitCode(true, 'done', { ac2: 'pass', bar: { kind: 'claim', verdict: 'fail' } })).toBe(0);
    const { out, result } = run(['--table', 'pair', '--playbooks', '1', '--games', '1'], {});
    expect((await result).code).toBe(1);
    expect(out).toEqual([expect.stringContaining('no Claude would sit at the pair table')]);
  });

  it("TOURNEY-5: WS1's bar: the Claude chairs pass at 60% wins or more with a mean-rank lead of 0.3 or more, failing just short of either; the control passes at 45-55% wins within 0.15 mean rank, failing just outside", () => {
    expect([T.claim.winShare, T.claim.rankLead, T.control.winShareLow, T.control.winShareHigh, T.control.rankBand]).toEqual([0.6, 0.3, 0.45, 0.55, 0.15]);
    expect(tournamentBar(results(60, 2.34375, 2.65625), false, 100)).toBe('pass');
    expect(tournamentBar(results(59, 2.34375, 2.65625), false, 100)).toBe('fail');
    expect(tournamentBar(results(80, 2.375, 2.625), false, 100)).toBe('fail');
    expect(tournamentBar(results(45, 2.4375, 2.5625), true, 100)).toBe('pass');
    expect(tournamentBar(results(55, 2.5625, 2.4375), true, 100)).toBe('pass');
    expect(tournamentBar(results(44, 2.5, 2.5), true, 100)).toBe('fail');
    expect(tournamentBar(results(56, 2.5, 2.5), true, 100)).toBe('fail');
    expect(tournamentBar(results(50, 2.40625, 2.59375), true, 100)).toBe('fail');
    expect(tournamentBar({ ...results(0, Number.NaN, Number.NaN), games: 0 }, false, 100)).toBe('not proven');
    // WS1: 120 means 120. A game left unscored (unfinished, crashed, stopped) is not dropped uncharged: the bar is not proven.
    expect(tournamentBar(results(90, 1.5, 3.5), false, 101)).toBe('not proven');
    expect(tournamentBar(results(50, 2.5, 2.5), true, 101)).toBe('not proven');
  });

  it('TOURNEY-6: a pair report shows the bar row and both caps\' totals; a run without --table shows neither', () => {
    const game = (scores: Record<string, number>): TrialGame => ({
      id: 'g', end: 'over', months: 12, smart: ['ai0', 'ai2'], chairs: ['ai0', 'ai2'], decisions: [], lines: {}, modelLines: {}, cutOff: [], countedUsd: 0.4, settledCalls: 0, playbooks: [], scores,
    });
    const input = { keyed: true, planned: 1, stopped: 'done' as const, smartPerGame: 2, seatsPerGame: 4, cap: 60, gameBudgetUsd: 0.55, games: [game({ ai0: 900, ai1: 100, ai2: 800, ai3: 200 })], calls: [], playbooks: true };
    const pair = trialReport({ ...input, table: 'pair', control: false, totals: { proofUsd: 8.5, tourneyUsd: 0.4 } });
    // One game, played to its end: both Claude chairs above both engine chairs, so ranks 1.5 against 3.5.
    expect(pair.bar).toEqual({ kind: 'claim', verdict: 'pass' });
    expect(trialReport({ ...input, stopped: 'cap', table: 'pair', control: false }).bar).toEqual({ kind: 'claim', verdict: 'not proven' });
    // A crashed game counts in the planned games, unscored: the bar says how many.
    const crashed = { ...game({}), id: 'g2', end: 'crashed' as const };
    const short = trialReport({ ...input, planned: 2, games: [...input.games, crashed], table: 'pair', control: false });
    expect(short.bar).toEqual({ kind: 'claim', verdict: 'not proven' });
    expect(renderTrialReport(short)).toContainEqual(expect.stringMatching(/^WS1's bar \(UBER-AC-A result\)\s+NOT PROVEN: .*; unscored 1 of 2 planned$/));
    const text = renderTrialReport(pair);
    expect(text).toContainEqual(expect.stringMatching(/^WS1's bar \(UBER-AC-A result\)\s+PASS: won 100\.0% of 1 games \(at least 60%\); mean rank lead 2\.00 \(at least 0\.30\); unscored 0 of 1 planned$/));
    expect(text).toContainEqual(expect.stringMatching(new RegExp(`^Spend so far, every ledger\\s+PR-5 proofs \\$8\\.50 of \\$${BRAIN.proofCapUsd.toFixed(2).replace('.', '\\.')}; tournament \\$0\\.40 of \\$${T.capUsd.toFixed(2).replace('.', '\\.')}$`)));
    const plain = renderTrialReport(trialReport(input));
    expect(plain.some((l) => l.startsWith("WS1's bar") || l.startsWith('Spend so far'))).toBe(false);
  });

  it('TOURNEY-7: a paid game in which the API refused every call stops the run, naming the status and error type; one answered call, or a game that called nothing, does not', () => {
    const line = (game: string, outcome: string, extra: object = {}) => ({ game, seat: 'ai0', usd: 0, outcome, kind: 'playbook', ...extra }) as unknown as CallLine;
    const refused = [line('g1', 'error', { status: 400, error_type: 'invalid_request_error' }), line('g1', 'error', { status: 400, error_type: 'invalid_request_error' }), line('g1', 'tool')];
    expect(everyCallFailed(refused, 'g1')).toBe('Stopped: the API refused every call in game g1 (400 invalid_request_error); check the account before more is played.');
    expect(everyCallFailed([...refused, line('g1', 'llm')], 'g1')).toBeNull();
    expect(everyCallFailed(refused, 'g2')).toBeNull();
    expect(everyCallFailed([line('g1', 'fallback')], 'g1')).toBeNull();
  });
});

// Local only (MULE_FULL=1, `pnpm test:full`): brain:trial is a command run by hand, and only with the PM's clearance.
describe.runIf(process.env.MULE_FULL === '1')('brain:trial', () => {
  it(
    'UBER-AC-1, UBER-AC-2: two games with one fast and one never-answering Smart seat report the model share by kind, why the rest fell back, lines per seat-month, ledger $ per Smart seat-game and per game, counted spend and zero stalls',
    async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const requests: Array<ReturnType<typeof asked>> = [];
      let printedAtFirstCall: string[] | null = null;
      let claimedAtFirstCall: boolean | null = null;
      const out: string[] = [];
      sdk.create = (params, options) => {
        printedAtFirstCall ??= [...out];
        claimedAtFirstCall ??= fs.existsSync(file);
        const request = asked(params);
        requests.push(request);
        return request.seat === 'AI 1' ? Promise.resolve(sdkMessage(USABLE, BILLED)) : neverAnswers(options);
      };
      // The second game starts only while counted spend plus a whole game budget fits the cap.
      const { code, report } = await drive(run(['--games', '2', '--seed', '101', '--max-usd', '2'], KEY, out).result);

      expect(code).toBe(0);
      expect(sdk.built).toHaveLength(2); // one client per game
      expect(printedAtFirstCall).toHaveLength(1);
      expect(printedAtFirstCall![0]).toMatch(/model claude-haiku-5-5, cap \$2\.00, planned 2 games with 2 Smart seats \(together held to \$1\.00 a game, an equal share each\)/);
      expect(claimedAtFirstCall).toBe(true); // today's ledger is claimed before the first call

      const fast = requests.filter((r) => r.seat === 'AI 1');
      const slow = requests.filter((r) => r.seat === 'AI 2');
      expect(fast.length).toBeGreaterThan(10);
      expect(slow.length).toBeGreaterThan(10);
      expect(requests.every((r) => r.seat === 'AI 1' || r.seat === 'AI 2')).toBe(true); // the strategist seats never call

      // Every asked Smart decision made a call: the fast seat's are the model's, the slow seat's fell back as too slow.
      expect(report!.asked.all).toEqual({ model: fast.length, of: fast.length + slow.length });
      // On the arcade floor the development plays its seeded default pick with no ask (trunk; the gap is with Heiko), so
      // only land and trade are asked.
      expect(requests.filter((r) => r.kind === 'develop')).toEqual([]);
      expect(report!.asked.develop).toEqual({ model: 0, of: 0 });
      for (const kind of ['land', 'trade'] as const) {
        const n = (rs: typeof requests) => rs.filter((r) => r.kind === kind).length;
        expect(report!.asked[kind], kind).toEqual({ model: n(fast), of: n(fast) + n(slow) });
      }
      expect(report!.smartAll.model).toBe(fast.length);
      expect(report!.smartAll.of).toBeGreaterThanOrEqual(fast.length + slow.length);
      expect(report!.fallbacks).toEqual({ 'too slow': slow.length, busy: 0, budget: 0, 'off-list': 0, unreadable: 0, error: 0 });
      for (const kind of ['land', 'trade'] as const) {
        const tooSlow = slow.filter((r) => r.kind === kind).length;
        expect(tooSlow, kind).toBeGreaterThan(0);
        expect(report!.fallbacksByKind[kind], kind).toEqual({ 'too slow': tooSlow, busy: 0, budget: 0, 'off-list': 0, unreadable: 0, error: 0 });
      }
      expect(report!.refusedCalls).toBe(0);

      // Both Smart seats spoke in every month of both games.
      const seatMonths = 2 * 2 * GAME.maxMonths;
      expect(report!.lines.seatMonths).toBe(seatMonths);
      expect(report!.lines.silent).toBe(0);
      expect(report!.lines.min).toBeGreaterThanOrEqual(1);
      expect(report!.lines.median).toBeLessThanOrEqual(BRAIN.linesPerMonth);
      // The slow seat's lines are all templates; the fast seat's model wrote some of its own.
      expect(report!.modelLines.silent).toBeGreaterThanOrEqual(2 * GAME.maxMonths);
      expect(report!.modelLines.silent).toBeLessThan(seatMonths);

      // Per Smart seat-game and per game, from the ledger file; only the fast seat was billed.
      const lines = callLines();
      expect(lines).toHaveLength(requests.length);
      const perSeatGame = new Map<string, number>();
      const perGame = new Map<string, number>();
      for (const l of lines) {
        perSeatGame.set(`${l.game}/${l.seat}`, (perSeatGame.get(`${l.game}/${l.seat}`) ?? 0) + l.usd);
        perGame.set(l.game, (perGame.get(l.game) ?? 0) + l.usd);
      }
      expect(perSeatGame.size).toBe(4);
      const usds = [...perSeatGame.values()];
      expect(report!.seatGameUsd.seatGames).toBe(4);
      expect(report!.seatGameUsd.max).toBeCloseTo(Math.max(...usds), 12);
      expect(report!.seatGameUsd.mean).toBeCloseTo(sum(usds) / 4, 12);
      expect(perGame.size).toBe(2);
      expect(report!.gameUsd.games).toBe(2);
      expect(report!.gameUsd.max).toBeCloseTo(Math.max(...perGame.values()), 12);
      expect(report!.gameUsd.atOrOverBudget).toBe(0);
      expect(report!.gameBudgetUsd).toBe(BRAIN.gameBudgetUsd);
      expect(report!.ledgerUsd).toBeCloseTo(fast.length * BILLED_USD, 12);
      // A timed-out call's bill is unknown: it counts at its RULE-3 worst case.
      expect(report!.countedUsd).toBeCloseTo(fast.length * BILLED_USD + sum(slow.map((r) => r.worst)), 12);
      expect(report!.cap).toBe(2);

      expect(report!.stalls).toEqual({ unfinished: [], cutOff: [] });
      expect(gameLines()).toHaveLength(2);

      const text = out.join('\n');
      expect(text).toMatch(/^UBER-AC-1 FAIL\b/m);
      expect(text).toMatch(/^UBER-AC-2 PASS\b/m);
      expect(text).toMatch(new RegExp(`^fallbacks by reason\\s+too slow ${slow.length}, busy 0, budget 0, off-list 0, unreadable 0, error 0$`, 'm'));
      const tradeSlow = slow.filter((r) => r.kind === 'trade').length;
      expect(text).toMatch(new RegExp(`^  trade\\s+too slow ${tradeSlow}, busy 0, budget 0, off-list 0, unreadable 0, error 0$`, 'm'));
      expect(text).toMatch(new RegExp(`^model-written lines per Smart seat-month\\s+min 0, median \\d, months with none \\d+ of ${seatMonths}$`, 'm'));
      expect(text).toMatch(/^stalls\s+games not finished 0, phases cut off 0$/m);
      expect(text).not.toContain(KEY.ANTHROPIC_API_KEY);
    },
    GAMES_MS,
  );

  it(
    'UBER-AC-2: with the key unset brain:trial plays every seat Classic, builds no client even with an auth token set, writes no ledger, reports zero stalls and exits 0',
    async () => {
      const { out, result } = run(['--games', '1', '--seed', '101'], { ANTHROPIC_API_KEY: '  ', ANTHROPIC_AUTH_TOKEN: 'token-not-real' });
      const { code, report } = await result;
      expect(code).toBe(0);
      expect(sdk.built).toEqual([]);
      expect(fs.readdirSync(dir)).toEqual([]);
      expect(report!.played).toBe(1);
      expect(report!.allDecisions.of).toBeGreaterThan(100);
      expect(report!.allDecisions.model).toBe(0);
      expect(report!.topPicks).toBe(report!.allDecisions.of);
      expect(report!.stalls).toEqual({ unfinished: [], cutOff: [] });
      expect(out[0]).toBe('ANTHROPIC_API_KEY is not set: every seat plays Classic and nothing is called.');
      expect(out.join('\n')).toMatch(/^UBER-AC-2 \(key unset\) PASS\b/m);
    },
    GAMES_MS,
  );

  it(
    'UBER-AC-2, INV-trial-cap: a keyed run without --max-usd is refused before any claim or call; a game starts only while counted spend plus the game budget fits the cap, however many Smart seats share it, so a cap below one game plays none and writes no ledger, and a cap of exactly one game plays one',
    async () => {
      let calls = 0;
      sdk.create = () => (calls++, Promise.resolve(sdkMessage(USABLE, BILLED)));

      const uncapped = run(['--games', '2']);
      const refused = await uncapped.result;
      expect(refused).toEqual({ code: 1, report: null });
      expect(uncapped.out).toEqual(['brain:trial spends real money with ANTHROPIC_API_KEY set: give --max-usd, the cap that was cleared; nothing called.']);
      expect(fs.readdirSync(dir)).toEqual([]);
      expect(sdk.built).toEqual([]);

      const belowDefault = run(['--games', '2', '--smart', '2', '--max-usd', String(BRAIN.gameBudgetUsd - 0.001)]);
      expect((await belowDefault.result).report).toMatchObject({ played: 0, stopped: 'cap' });
      expect(belowDefault.out.at(-1)).toBe(`No game started: cap $${BRAIN.gameBudgetUsd - 0.001} is below one game's budget ($${BRAIN.gameBudgetUsd.toFixed(2)}).`);

      const below = await run(['--games', '2', '--smart', '1', '--game-budget-usd', '0.06', '--max-usd', '0.059']).result;
      expect(below.report).toMatchObject({ played: 0, stopped: 'cap' });
      expect(calls).toBe(0);
      expect(sdk.built).toEqual([]);
      expect(fs.readdirSync(dir)).toEqual([]);

      // Two Smart seats share one game budget, so a cap of exactly that budget plays one game.
      const one = await run(['--games', '2', '--smart', '2', '--game-budget-usd', '0.06', '--max-usd', '0.06']).result;
      expect(one.code).toBe(0);
      expect(one.report).toMatchObject({ played: 1, stopped: 'cap' });
      expect(calls).toBeGreaterThan(0);
      expect(gameLines()).toHaveLength(1);
      expect(sum(callLines().map((l) => l.usd))).toBeLessThanOrEqual(0.06);

      // A seat whose calls all time out is billed $0 in the ledger; its unknown bills alone leave no room for a second game.
      fs.rmSync(file);
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      sdk.create = (_params, options) => (calls++, neverAnswers(options));
      const unknown = await drive(run(['--games', '2', '--smart', '1', '--game-budget-usd', '0.06', '--max-usd', '0.0601']).result);
      expect(unknown.report).toMatchObject({ played: 1, stopped: 'cap', ledgerUsd: 0 });
      expect(unknown.report!.countedUsd).toBeGreaterThan(0.0001);
    },
    GAMES_MS,
  );

  it('INV-trial-cap: a --game-budget-usd above BRAIN.gameBudgetUsd, or of 0, prints the usage and exits 1 before any claim, client or call', async () => {
    let calls = 0;
    sdk.create = () => (calls++, Promise.resolve(sdkMessage(USABLE, BILLED)));
    for (const budget of [String(BRAIN.gameBudgetUsd + 0.01), '0', '0.0']) {
      const { out, result } = run(['--games', '1', '--game-budget-usd', budget, '--max-usd', '5']);
      expect(await result, budget).toEqual({ code: 1, report: null });
      expect(out, budget).toEqual([expect.stringMatching(/^Usage: brain:trial .*\[--game-budget-usd Y\].*; nothing played\.$/)]);
    }
    // Negative: the ceiling itself is a game budget; this cap is below it, so the run stops before any game.
    const ceiling = await run(['--games', '1', '--game-budget-usd', String(BRAIN.gameBudgetUsd), '--max-usd', '0.5']).result;
    expect(ceiling).toMatchObject({ code: 0, report: { played: 0, stopped: 'cap' } });
    expect(calls).toBe(0);
    expect(sdk.built).toEqual([]);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("INV-trial-cap: a second paid run on the same UTC day is refused with exit 1 and one line naming today's ledger, before any client is built", async () => {
    fs.writeFileSync(file, '');
    let calls = 0;
    sdk.create = () => (calls++, Promise.resolve(sdkMessage(USABLE, BILLED)));
    const { out, result } = run(['--games', '2', '--max-usd', '1']);
    const { code } = await result;
    expect(code).toBe(1);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain(file);
    expect(calls).toBe(0);
    expect(sdk.built).toEqual([]);
    expect(fs.readFileSync(file, 'utf8')).toBe('');
  });

  it(
    'FM-auth: a 401 stops brain:trial at once with exit 2, prints none of the SDK text, and the aborted game still closes with its game line',
    async () => {
      const SDK_TEXT = 'sdk-text-invalid-x-api-key';
      let calls = 0;
      sdk.create = () => {
        calls++;
        return Promise.reject(new Anthropic.AuthenticationError(401, { type: 'error', error: { type: 'authentication_error', message: SDK_TEXT } }, SDK_TEXT, new Headers()));
      };
      const { out, result } = run(['--games', '3', '--smart', '1', '--max-usd', '1']);
      const { code, report } = await result;
      expect(code).toBe(2);
      expect(calls).toBe(1);
      expect(report).toMatchObject({ played: 1, stopped: 'auth' });
      const text = out.join('\n');
      expect(text).not.toContain(SDK_TEXT);
      expect(text).not.toContain(KEY.ANTHROPIC_API_KEY);
      expect(out.at(-1)).toBe('Stopped: the API refused the credentials (401/403). Nothing more was called.');
      // The ledger line names the answer, not its text: the status and the API's error type.
      expect(callLines()).toEqual([expect.objectContaining({ outcome: 'error', status: 401, error_type: 'authentication_error' })]);
      expect(JSON.stringify(callLines())).not.toContain(SDK_TEXT);
      expect(gameLines()).toEqual([expect.objectContaining({ calls: 1 })]);
    },
    GAMES_MS,
  );

  it(
    'FM-auth: with --playbooks 1, a 401 on the first write stops brain:trial at once with exit 2, and nothing more is called',
    async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      let calls = 0;
      sdk.create = () => {
        calls++;
        return Promise.reject(new Anthropic.AuthenticationError(401, { type: 'error', error: { message: 'x' } }, 'x', new Headers()));
      };
      const { out, result } = run(['--games', '3', '--smart', '1', '--playbooks', '1', '--max-usd', '1']);
      const { code, report } = await result;
      expect(code).toBe(2);
      // The one Smart seat's month 1 write is the game's first call; nothing is called after it.
      expect(calls).toBe(1);
      expect(report).toMatchObject({ played: 1, stopped: 'auth' });
      expect(out.at(-1)).toBe('Stopped: the API refused the credentials (401/403). Nothing more was called.');
    },
    GAMES_MS,
  );

  it(
    'INV-finish (trial): a game that throws with model calls still open is closed only after they settle, so its game line counts them, and the run reports it as a stall and not proven',
    async () => {
      let open = 0;
      crash.open = () => open;
      sdk.create = () => {
        open++;
        return new Promise((resolve) =>
          setImmediate(() => {
            open--;
            resolve(sdkMessage(USABLE, BILLED));
          }),
        );
      };
      crash.armed = true;
      const { out, result } = run(['--games', '2', '--max-usd', '2']);
      const { code, report } = await result;

      expect(crash.thrown).toBe(true);
      expect(crash.openAtThrow).toBeGreaterThan(0);
      expect(code).toBe(0);
      const crashed = 'trial-2026-10-22-101-0';
      expect(report!.stalls.unfinished).toEqual([crashed]);
      expect(report!.played).toBe(2);
      expect(report!.ac1).toBe('not proven');
      expect(report!.ac2).toBe('fail');
      expect(out).toContainEqual(`game ${crashed} threw: engine fault for the test`);

      // Every call of the crashed game, the ones open at the throw too, is written before its game line and totalled in it.
      const ledger = readLedgerLines(file);
      const gameAt = ledger.findIndex((l) => !isCallLine(l) && l.game === crashed);
      const itsCalls = ledger.filter(isCallLine).filter((l) => l.game === crashed);
      expect(itsCalls.length).toBeGreaterThan(0);
      expect(ledger.map((l) => isCallLine(l) && l.game === crashed).lastIndexOf(true)).toBeLessThan(gameAt);
      expect(ledger[gameAt]).toMatchObject({ calls: itsCalls.length });
      expect(ledger[gameAt]!.usd).toBeCloseTo(sum(itsCalls.map((l) => l.usd)), 12);
    },
    GAMES_MS,
  );

  it(
    'FM-ledger-write: when the ledger file is missing even one call line, here a rejected reply\'s, the run stops after that game with exit 1 and says so',
    async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      let calls = 0;
      sdk.create = () => {
        calls++;
        // Only the first call's line is lost: the file is read-only while that unreadable reply settles.
        if (calls === 1) {
          fs.chmodSync(file, 0o444);
          return Promise.resolve(sdkMessage('not json at all', BILLED));
        }
        if (calls === 2) fs.chmodSync(file, 0o644);
        return Promise.resolve(sdkMessage(USABLE, BILLED));
      };
      const { out, result } = run(['--games', '2', '--smart', '1', '--max-usd', '1']);
      const { code, report } = await result;
      expect(code).toBe(1);
      expect(report).toMatchObject({ played: 1, stopped: 'ledger' });
      expect(error).toHaveBeenCalled();
      expect(calls).toBeGreaterThan(2);
      const written = callLines();
      expect(written).toHaveLength(calls - 1);
      expect(written.map((l) => l.outcome)).not.toContain('unreadable');
      expect(out.at(-1)).toMatch(
        new RegExp(`^Stopped: the ledger .*trial-2026-10-22\\.jsonl has ${calls - 1} of ${calls} call lines for game trial-2026-10-22-101-0; a write failed, so spend cannot be checked\\.$`),
      );
    },
    GAMES_MS,
  );

  it(
    "FM-ledger-write: with --playbooks 1 the write lines never cover for a decider's lost line: the run still stops after that game",
    async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      let moves = 0;
      sdk.create = (params) => {
        const user = (params.messages[0]?.content ?? '') as string;
        if (user.includes('What you may change:')) return Promise.resolve(sdkMessage(JSON.stringify({ edits: [], line: '' }), BILLED));
        moves++;
        // Only the first move call's line is lost: the file is read-only while that unreadable reply settles.
        if (moves === 1) {
          fs.chmodSync(file, 0o444);
          return Promise.resolve(sdkMessage('not json at all', BILLED));
        }
        if (moves === 2) fs.chmodSync(file, 0o644);
        return Promise.resolve(sdkMessage(USABLE, BILLED));
      };
      const { code, report } = await run(['--games', '2', '--smart', '1', '--playbooks', '1', '--max-usd', '1']).result;
      expect(code).toBe(1);
      expect(report).toMatchObject({ played: 1, stopped: 'ledger' });
    },
    GAMES_MS,
  );

  it(
    'FM-ledger-write: a seat locked by its budget writes one budget line and then decides without calling, and the run is not stopped by the ledger check',
    async () => {
      // The only Smart seat's share is the whole game budget; one reply bills it, so its next decision is refused before calling.
      const wholeBudget = Math.round((0.06 * 1_000_000) / BRAIN.pricesPerMTok.input);
      let calls = 0;
      sdk.create = () => (calls++, Promise.resolve(sdkMessage(USABLE, { input: wholeBudget })));
      const { out, result } = run(['--games', '1', '--smart', '1', '--game-budget-usd', '0.06', '--max-usd', '1']);
      const { code, report } = await result;
      expect(calls).toBe(1);
      expect(callLines().map((l) => l.outcome)).toEqual(['llm', 'budget']);
      expect(report!.fallbacks.budget).toBeGreaterThan(1); // refused again after the lock, still with no call
      expect(report).toMatchObject({ played: 1, stopped: 'done' });
      expect(code).toBe(0);
      expect(out.join('\n')).not.toMatch(/^Stopped:/m);
    },
    GAMES_MS,
  );

  it(
    'INV-between: answers that arrive on a later macrotask are the ones the Smart seats play, so every asked Smart decision is by the model',
    async () => {
      let calls = 0;
      sdk.create = () => {
        calls++;
        return new Promise((resolve) => setImmediate(() => resolve(sdkMessage(USABLE, BILLED))));
      };
      const { out, result } = run(['--games', '1', '--max-usd', '1']);
      const { report } = await result;
      expect(calls).toBeGreaterThan(20);
      expect(report!.asked.all).toEqual({ model: calls, of: calls });
      expect(sum(Object.values(report!.fallbacks))).toBe(0);
      expect(out).toContainEqual(expect.stringMatching(/^UBER-AC-1 PASS\b/));
      expect(out).toContainEqual(expect.stringMatching(/^UBER-AC-2 PASS\b/));
    },
    GAMES_MS,
  );

  it('UBER-AC-1: every note Brain writes for a fallback is counted under its own reason', async () => {
    const mind: Mind = { me: 'ai0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'rookie', level: AI_LEVELS.rookie };
    const obs = observe(createGame({ seed: 7, players: [0, 1].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) }), 'ai0');
    const list = () => shortlist(['a', 'b', 'c'].map((a, i) => candidate(a, `Option ${a}`, a, 10, [consider('fit', 0.9 - i * 0.05, 1, 'fits')])), 3, 0.5);
    /** The note a real Brain writes when its decider answers with `decide`, settled after `waitedMs`. */
    const noteOf = async (decide: () => Choice | Promise<Choice>, waitedMs = 0) => {
      let note: string | undefined;
      const brain = new Brain(mind, PERSONAS.trader, 'AI 1', 11, { name: 'llm', decide }, (r) => (note = r.note));
      const pending = brain.ask('develop', list(), obs, WAIT_MS.develop, null, 'summary');
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
      brain.resolve(pending, waitedMs, obs);
      return note;
    };
    const rejecting = (err: unknown) => () => Promise.reject(err);
    const rejectedReply = (text: string) => {
      const parsed = parseReply(text, toOptions(list()));
      if (parsed.ok) throw new Error('expected a rejected reply');
      return new ReplyRejected(parsed.reason, parsed.outcome);
    };
    // The client's own failures, from a fake SDK under the real client.
    const clientFailure = (answer: (options: { signal?: AbortSignal }) => Promise<never>, waitMs: number) =>
      createHaikuComplete(fakeSdk((_n, _params, options) => answer(options)))({ system: 's', user: 'u', schema: { type: 'object' } as never }, waitMs).catch((e: unknown) => e);
    const timedOut = await clientFailure(neverAnswers, 5);
    const status500 = await clientFailure(
      () => Promise.reject(Anthropic.APIError.generate(500, { type: 'error', error: { type: 'api_error', message: 'x' } }, 'x', new Headers())),
      1_000,
    );

    const cases: Array<[string | undefined, string]> = [
      [await noteOf(() => new Promise(() => {}), WAIT_MS.develop), 'too slow'],
      [await noteOf(rejecting(timedOut)), 'too slow'],
      [await noteOf(rejecting(new Error('busy'))), 'busy'],
      [await noteOf(rejecting(new Error('budget spent'))), 'budget'],
      [await noteOf(rejecting(rejectedReply('{"option":"F","line":"x"}'))), 'off-list'],
      [await noteOf(() => ({ optionId: 'F', line: null, by: 'llm' })), 'off-list'],
      [await noteOf(rejecting(rejectedReply('not json at all'))), 'unreadable'],
      [await noteOf(rejecting(status500)), 'error'],
      [await noteOf(rejecting(new Error('game over'))), 'error'],
    ];
    for (const [note, reason] of cases) {
      expect(note, reason).toBeDefined();
      expect(fallbackReason(note), note).toBe(reason);
    }
  });

  it('UBER-AC-2: a land grant, auction or land auction still open when its phase ends was cut off by its tick limit', () => {
    const grant = createGame({ seed: 7, players: [0, 1].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
    advancePhase(grant);
    expect(grant.phase).toBe('landGrant');
    expect(cutOffPhase(grant)).toBe('month 1 landGrant');
    for (const player of grant.players) player.claimsThisGrant = GAME.claimsPerGrant;
    expect(cutOffPhase(grant)).toBeNull();

    const at = (phase: string, s: object = {}) => ({ month: 3, phase, ...s }) as unknown as GameState;
    expect(cutOffPhase(at('auction', { auction: { stage: 'walk' } }))).toBe('month 3 auction');
    expect(cutOffPhase(at('auction', { auction: { stage: 'over' } }))).toBeNull();
    expect(cutOffPhase(at('auction', { auction: null }))).toBeNull();
    expect(cutOffPhase(at('landAuction', { landAuction: { stage: 'walk' } }))).toBe('month 3 landAuction');
    expect(cutOffPhase(at('landAuction', { landAuction: { stage: 'over' } }))).toBeNull();
    expect(cutOffPhase(at('development'))).toBeNull();
  });

  it("UBER-AC-1, UBER-AC-2: the verdict holds at 80% model share and with each game's Smart seats together under the run's game budget, fails just past either bound or on a stall, and is not proven unless every planned game was played to its end", () => {
    const decisions = (model: number, of: number) =>
      Array.from({ length: of }, (_, i) => ({ seat: 'ai0', kind: 'develop' as const, by: i < model ? ('llm' as const) : ('fallback' as const), options: 2, ...(i < model ? {} : { note: 'decider too slow' }) }));
    const game = (over: Partial<TrialGame> = {}): TrialGame => ({
      id: 'g',
      end: 'over',
      months: 1,
      smart: ['ai0', 'ai1'],
      decisions: decisions(4, 5),
      lines: { ai0: [1], ai1: [1] },
      modelLines: { ai0: [1], ai1: [1] },
      cutOff: [],
      countedUsd: 0.9999,
      settledCalls: 2,
      playbooks: [],
      ...over,
    });
    const call = (usd: number, seat = 'ai0', g = 'g') => ({ game: g, seat, usd, outcome: 'llm' }) as TrialInput['calls'][number];
    const input = (over: Partial<TrialInput> = {}): TrialInput => ({
      keyed: true,
      planned: 1,
      stopped: 'done',
      smartPerGame: 2,
      seatsPerGame: 4,
      cap: 2,
      gameBudgetUsd: 1,
      games: [game()],
      calls: [call(0.5), call(0.4999, 'ai1')],
      playbooks: false,
      ...over,
    });
    const verdicts = (i: TrialInput) => {
      const r = trialReport(i);
      return [r.ac1, r.ac2];
    };

    expect(verdicts(input())).toEqual(['pass', 'pass']);
    expect(verdicts(input({ games: [game({ decisions: decisions(79, 100) })] }))).toEqual(['fail', 'pass']);
    expect(verdicts(input({ games: [game({ lines: { ai0: [0], ai1: [1] } })] }))).toEqual(['fail', 'pass']);
    // Each seat at its share puts the game at its budget: that is not under it.
    expect(verdicts(input({ calls: [call(0.5), call(0.5, 'ai1')] }))).toEqual(['pass', 'fail']);
    // Judged per game: two games each under the budget pass, though the run spent more than one budget.
    expect(verdicts(input({ planned: 2, games: [game(), game({ id: 'b' })], calls: [call(0.9), call(0.9, 'ai1', 'b')] }))[1]).toBe('pass');
    // Judged against the game budget the run used.
    expect(verdicts(input({ gameBudgetUsd: 0.06, calls: [call(0.03), call(0.0299, 'ai1')] }))[1]).toBe('pass');
    expect(verdicts(input({ gameBudgetUsd: 0.06, calls: [call(0.03), call(0.03, 'ai1')] }))[1]).toBe('fail');
    expect(verdicts(input({ games: [game({ cutOff: ['month 1 auction'] })] }))).toEqual(['pass', 'fail']);
    expect(verdicts(input({ games: [game({ end: 'unfinished' })] }))[1]).toBe('fail');
    expect(verdicts(input({ planned: 2, stopped: 'cap' }))).toEqual(['not proven', 'not proven']);
    expect(verdicts(input({ planned: 2, stopped: 'done' }))).toEqual(['not proven', 'not proven']);
    expect(verdicts(input({ planned: 2, stopped: 'cap', games: [game({ decisions: decisions(79, 100) })] }))[0]).toBe('not proven');
    expect(verdicts(input({ games: [game({ end: 'crashed' })] }))[1]).toBe('fail');
    // A game cut short leaves its seat-months out, so a silent month in it must not let the share pass.
    for (const end of ['crashed', 'unfinished'] as const) {
      expect(verdicts(input({ planned: 2, games: [game(), game({ id: 'b', end, lines: { ai0: [0] } })] })), end).toEqual(['not proven', 'fail']);
    }
    // The model share is measured over games played to their end only.
    const partial = trialReport(input({ planned: 2, games: [game(), game({ id: 'b', end: 'crashed', decisions: decisions(0, 5) })] }));
    expect(partial.asked.all).toEqual({ model: 4, of: 5 });
    expect(partial.fallbacks['too slow']).toBe(1);
    // No Smart seat-game played, nothing measured.
    expect(verdicts(input({ games: [game({ smart: [] })] }))[1]).toBe('not proven');
    // Playbooks played every move (C7): no decision was asked, so the share has nothing to judge; n/a, not FAIL. A silent
    // seat-month still fails, and a run cut short is still not proven.
    expect(verdicts(input({ games: [game({ decisions: [] })] }))[0]).toBe('n/a');
    expect(verdicts(input({ games: [game({ decisions: [], lines: { ai0: [0], ai1: [1] } })] }))[0]).toBe('fail');
    expect(verdicts(input({ planned: 2, games: [game({ decisions: [] })] }))[0]).toBe('not proven');
    // RULE-2 counts template lines too, so a seat-month with only template lines is not silent.
    expect(verdicts(input({ games: [game({ modelLines: { ai0: [0] } })] }))[0]).toBe('pass');
    // Without the key, every decision must be the strategist's top pick.
    const top = (over: object = {}) => ({ seat: 'ai0', kind: 'develop' as const, by: 'top' as const, options: 2, ...over });
    const classic = (ds: TrialGame['decisions']) => input({ keyed: false, cap: null, calls: [], games: [game({ smart: [], decisions: ds })] });
    expect(verdicts(classic([top(), top()]))[1]).toBe('pass');
    expect(verdicts(classic([top(), top({ by: 'llm' })]))[1]).toBe('fail');
    expect(verdicts(classic([top(), top({ by: 'fallback', note: 'decider too slow' })]))[1]).toBe('fail');
    const printed = renderTrialReport(trialReport(input()));
    expect(printed).toContainEqual(expect.stringMatching(/^UBER-AC-1 PASS\b/));
    expect(printed).toContainEqual(expect.stringMatching(/^ledger \$ per Smart seat-game\s+max \$0\.50000, mean \$0\.49995$/));
    expect(printed).toContainEqual(expect.stringMatching(/^ledger \$ per game, Smart seats together\s+max \$0\.99990, at or over the game budget \$1\.00: 0 of 1$/));
    expect(printed).toContain('UBER-AC-2 PASS: at most $0.99990 per game for all Smart seats together (needs under the game budget $1.00), 0 stalls (needs 0)');
  });

  it('UBER-AC-A (result): the report gives Smart seats against strategist seats over finished games: mean final score, games a Smart seat won, mean rank; no verdict (the bar is WS1\'s)', () => {
    const base = (over: Partial<TrialGame>): TrialGame => ({
      id: 'g',
      end: 'over',
      months: 12,
      smart: ['ai0', 'ai1'],
      decisions: [],
      lines: { ai0: [1], ai1: [1] },
      modelLines: { ai0: [1], ai1: [1] },
      cutOff: [],
      countedUsd: 0.1,
      settledCalls: 0,
      playbooks: [],
      scores: {},
      ...over,
    });
    const games = [
      // A Smart seat wins, the other Smart seat is last.
      base({ id: 'a', scores: { ai0: 900, ai1: 300, ai2: 600, ai3: 500 } }),
      // A strategist seat wins; the Smart seats are 2nd and 3rd.
      base({ id: 'b', scores: { ai0: 700, ai1: 600, ai2: 800, ai3: 100 } }),
      // A first place shared by a Smart and a strategist seat counts half a win to each side (WS1, 5 Nov), and shares rank 1.
      base({ id: 'c', scores: { ai0: 500, ai1: 200, ai2: 500, ai3: 400 } }),
      // A crashed game is left out.
      base({ id: 'd', end: 'crashed', scores: { ai0: 0, ai1: 0, ai2: 9_999, ai3: 9_999 } }),
    ];
    const r = trialReport({ keyed: true, planned: 4, stopped: 'done', smartPerGame: 2, seatsPerGame: 4, cap: 2, gameBudgetUsd: 1, games, calls: [], playbooks: true });
    expect(r.results).toEqual({
      games: 3,
      smartWins: 1.5,
      smart: { meanScore: (900 + 300 + 700 + 600 + 500 + 200) / 6, meanRank: (1 + 4 + 2 + 3 + 1 + 4) / 6 },
      strategist: { meanScore: (600 + 500 + 800 + 100 + 500 + 400) / 6, meanRank: (2 + 3 + 1 + 4 + 1 + 3) / 6 },
    });
    expect(renderTrialReport(r)).toContainEqual(expect.stringMatching(/^Smart seats against strategist seats\s+won 1\.5 of 3 games; mean score 533 against 483; mean rank 2\.50 against 2\.33$/));
  });

  it("T-AC-A4 (report): rows for the strategy and playbook calls, the edit share of the playbooks that took effect, late writes, tool rounds per call, and the edit verdict at 80%", () => {
    const took = (llm: number, of: number) => Array.from({ length: of }, (_, i) => ({ seat: i % 2 ? 'ai1' : 'ai0', month: 1 + Math.floor(i / 2), by: i < llm ? ('llm' as const) : ('engine' as const) }));
    const game = (over: Partial<TrialGame> = {}): TrialGame => ({
      id: 'g',
      end: 'over',
      months: 5,
      smart: ['ai0', 'ai1'],
      decisions: [],
      lines: { ai0: [1, 1, 1, 1, 1], ai1: [1, 1, 1, 1, 1] },
      modelLines: { ai0: [1, 1, 1, 1, 1], ai1: [1, 1, 1, 1, 1] },
      cutOff: [],
      countedUsd: 0.3,
      settledCalls: 0,
      playbooks: took(8, 10),
      ...over,
    });
    const line = (kind: string, outcome: string, usd = 0.01, seat = 'ai0') => ({ game: 'g', seat, usd, outcome, kind }) as TrialInput['calls'][number];
    const calls = [
      line('strategy', 'tool'),
      line('strategy', 'tool'),
      line('strategy', 'llm'),
      line('strategy', 'late', 0, 'ai1'),
      line('strategy', 'llm', 0.02, 'ai1'),
      line('land', 'llm'),
      // A write its seat's budget refused: never made, so no call.
      line('strategy', 'budget', 0, 'ai1'),
    ];
    const input = (over: Partial<TrialInput> = {}): TrialInput => ({ keyed: true, planned: 1, stopped: 'done', smartPerGame: 2, seatsPerGame: 4, cap: 2, gameBudgetUsd: 1, games: [game()], calls, playbooks: true, ...over });

    const r = trialReport(input());
    // A late reply's call line and its 'late' line are one call; tool rounds and the budget line are none.
    expect(r.writes).toMatchObject({ calls: 2, late: 1, toolRounds: 2 });
    expect(r.writes.usd).toBeCloseTo(0.05, 10);
    expect(r.edits).toEqual({ model: 8, of: 10 });
    expect(r.acEdits).toBe('pass');
    expect(trialReport(input({ games: [game({ playbooks: took(7, 10) })] })).acEdits).toBe('fail');
    expect(trialReport(input({ planned: 2 })).acEdits).toBe('not proven');
    expect(trialReport(input({ keyed: false, cap: null, calls: [] })).acEdits).toBe('n/a');
    // A run without --playbooks never tried the clause: n/a, and no rows for it.
    const off = trialReport(input({ playbooks: false, games: [game({ playbooks: [] })] }));
    expect(off.acEdits).toBe('n/a');
    expect(renderTrialReport(off).some((l) => l.includes('UBER-AC-A'))).toBe(false);
    // Only the playbooks of finished games count, as the decisions do.
    expect(trialReport(input({ planned: 2, games: [game(), game({ id: 'b', end: 'crashed', playbooks: took(0, 6) })] })).edits).toEqual({ model: 8, of: 10 });
    // A write the API refused is a failed call, never a success: counted and printed, and a failed phase write (an
    // auction's) is a playbook Claude did not edit, so it joins the clause's denominator (the PR-5 pilot's 24 refused
    // auction writes read as 100%). A failed land write already counts there, as the engine's land playbook.
    const failed = trialReport(input({ calls: [...calls, line('playbook', 'error'), line('playbook', 'error'), line('strategy', 'error')] }));
    expect(failed.writes).toMatchObject({ calls: 5, failed: 3 });
    expect(failed.edits).toEqual({ model: 8, of: 12 });
    expect(failed.acEdits).toBe('fail');
    expect(renderTrialReport(failed)).toContainEqual(expect.stringMatching(/^strategy and playbook calls, each waited for\s+5, late 1 \(20\.0%\), failed 3, tool rounds/));

    const printed = renderTrialReport(r);
    expect(printed).toContainEqual(expect.stringMatching(/^strategy and playbook calls, each waited for\s+2, late 1 \(50\.0%\), failed 0, tool rounds 1\.00 a call, \$0\.05000$/));
    expect(printed).toContainEqual(expect.stringMatching(/^playbooks with Claude's edits\s+80\.0% \(8 of 10\)$/));
    expect(printed).toContain("UBER-AC-A edits PASS: 80.0% (8 of 10) of the playbooks that took effect carry Claude's accepted edits (needs at least 80%)");
  });

  it(
    "T-AC-A4 (trial): each Smart seat writes as on the server: its land write (with the development) at the start and each upkeep, and its auction in the production show; it adopts the land grant, the development and the auction by llm, and the report counts every write",
    async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const land: string[] = [];
      const auction: string[] = [];
      const offered = (params: { output_config?: { format?: { schema?: unknown } } }) =>
        (params.output_config?.format?.schema as { properties: { edits: { items: { anyOf: { properties: { path: { enum: string[] } } }[] } } } }).properties.edits.items.anyOf.map((v) => v.properties.path.enum[0]!);
      sdk.create = (params) => {
        const user = (params.messages[0]?.content ?? '') as string;
        const who = () => /^You are (.+)\. Month (\d+)/m.exec(user)!.slice(1, 3).join(' m');
        if (user.includes('Your draft land grant:')) {
          land.push(who());
          const edits = [{ path: '/landGrant/claims', to: 1, reason: 'One will do.' }, { path: '/development/timeBudgetMs', to: 1_000, reason: 'Quick.' }];
          return Promise.resolve(sdkMessage(JSON.stringify({ edits, line: '' }), BILLED));
        }
        if (user.includes('Your draft auction:')) {
          auction.push(who());
          const hold = offered(params as never).find((path) => path.endsWith('/hold'))!;
          return Promise.resolve(sdkMessage(JSON.stringify({ edits: [{ path: hold, to: 0, reason: 'Sell it all.' }], line: '' }), BILLED));
        }
        return Promise.resolve(sdkMessage(USABLE, BILLED));
      };
      const { code, report } = await drive(run(['--games', '1', '--seed', '101', '--playbooks', '1', '--max-usd', '2'], KEY).result);

      expect(code).toBe(0);
      for (const seat of ['AI 1', 'AI 2']) {
        const months = land.filter((w) => w.startsWith(`${seat} m`)).length;
        expect(months, seat).toBeGreaterThan(1);
        // An auction write in each month that reached its production show.
        expect(auction.filter((w) => w.startsWith(`${seat} m`)).length, seat).toBeGreaterThan(0);
      }
      // Each write came in time with an accepted edit, so each playbook that took effect is Claude's: the land grant's,
      // the development's it carried, and the auction's.
      expect(report!.edits.model).toBe(report!.edits.of);
      expect(report!.edits.of).toBe(land.length * 2 + auction.length);
      expect(report!.writes.calls).toBe(land.length + auction.length);
      // The game's final scores reach the report: Smart seats against the strategist seats.
      expect(report!.results.games).toBe(1);
      expect(Number.isFinite(report!.results.smart.meanScore) && Number.isFinite(report!.results.strategist.meanScore)).toBe(true);
      expect(report!.writes.late).toBe(0);
    },
    GAMES_MS,
  );
});

