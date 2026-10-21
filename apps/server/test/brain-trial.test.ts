import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAIN, GAME, type GameState } from '@mule/engine';
import type { DecisionKind } from '@mule/ai';
import { cutOffPhase, renderTrialReport, trial, trialReport, type TrialGame, type TrialInput } from '../src/brain/trial.js';
import { KEY, promptOf, readLedger, sdkMessage, worstUsdOf, type SdkModuleFake, type SdkParams } from './brain-fakes.js';

/** The SDK module's client: records its options and answers through `sdk.create`; it never reaches the network. */
const sdk = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdk));

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
});
afterEach(() => {
  vi.useRealTimers();
  fs.rmSync(dir, { recursive: true, force: true });
});

const USABLE = '{"option":"A","line":"Mine, and cheap at that."}';
const BILLED = { input: 1_000, output: 20 };
const p = BRAIN.pricesPerMTok;
/** One usable reply's bill, from BRAIN's prices (not from the ledger under test). */
const BILLED_USD = (BILLED.input * p.input + BILLED.output * p.output) / 1_000_000;

/** What one request asked: the seat's name and the decision's kind, as the prompt carries them. */
function asked(params: SdkParams): { name: string; kind: DecisionKind; chars: number } {
  const { system, user } = promptOf(params);
  const kind = /^Decision: (\w+)$/.exec(user.split('\n')[0]!)![1] as DecisionKind;
  const name = /^You are (AI \d)\./.exec(user.split('\n')[1]!)![1]!;
  const schema = (params.output_config as { format: { schema: unknown } }).format.schema;
  return { name, kind, chars: system.length + user.length + JSON.stringify(schema).length };
}

/** A call that answers only when the client aborts it at its wait, as the real SDK does. */
const neverAnswers = (options: { signal?: AbortSignal }) =>
  new Promise<never>((_, reject) => options.signal?.addEventListener('abort', () => reject(new Anthropic.APIUserAbortError())));

const run = (argv: string[], env: Record<string, string | undefined> = KEY) => {
  const out: string[] = [];
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

const callLines = (at = file) => readLedger(at).filter((l) => l.type !== 'game');
const gameLines = (at = file) => readLedger(at).filter((l) => l.type === 'game');
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('brain:trial', () => {
  it(
    'UBER-AC-1, UBER-AC-2: two games with one fast and one never-answering Smart seat report the model share by kind, why the rest fell back, lines per seat-month, ledger $ per Smart seat-game, counted spend and zero stalls',
    async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const requests: Array<ReturnType<typeof asked>> = [];
      let printedAtFirstCall: string[] | null = null;
      const { out, result } = run(['--games', '2', '--seed', '101', '--max-usd', '1']);
      sdk.create = (params, options) => {
        printedAtFirstCall ??= [...out];
        const request = asked(params);
        requests.push(request);
        return request.name === 'AI 1' ? Promise.resolve(sdkMessage(USABLE, BILLED)) : neverAnswers(options);
      };
      const { code, report } = await drive(result);

      expect(code).toBe(0);
      expect(sdk.built).toHaveLength(2); // one client per game
      expect(printedAtFirstCall).toHaveLength(1);
      expect(printedAtFirstCall![0]).toMatch(/model claude-haiku-5-5, cap \$1\.00, planned 2 games/);

      const fast = requests.filter((r) => r.name === 'AI 1');
      const slow = requests.filter((r) => r.name === 'AI 2');
      expect(fast.length).toBeGreaterThan(10);
      expect(slow.length).toBeGreaterThan(10);
      expect(requests.every((r) => r.name === 'AI 1' || r.name === 'AI 2')).toBe(true); // the strategist seats never call

      // Every asked Smart decision made a call: the fast seat's are the model's, the slow seat's fell back as too slow.
      expect(report!.asked.all).toEqual({ model: fast.length, of: fast.length + slow.length });
      for (const kind of ['land', 'develop', 'trade'] as const) {
        const n = (rs: typeof requests) => rs.filter((r) => r.kind === kind).length;
        expect(report!.asked[kind], kind).toEqual({ model: n(fast), of: n(fast) + n(slow) });
      }
      expect(report!.smartAll.model).toBe(fast.length);
      expect(report!.smartAll.of).toBeGreaterThanOrEqual(fast.length + slow.length);
      expect(report!.fallbacks).toEqual({ 'too slow': slow.length, busy: 0, budget: 0, 'off-list': 0, unreadable: 0, error: 0 });
      expect(report!.refusedCalls).toBe(0);

      // Both Smart seats spoke in every month of both games.
      expect(report!.lines.seatMonths).toBe(2 * 2 * GAME.maxMonths);
      expect(report!.lines.silent).toBe(0);
      expect(report!.lines.min).toBeGreaterThanOrEqual(1);
      expect(report!.lines.median).toBeLessThanOrEqual(BRAIN.linesPerMonth);

      // Per Smart seat-game, from the ledger file; only the fast seat was billed.
      const lines = callLines();
      expect(lines).toHaveLength(requests.length);
      const perSeatGame = new Map<string, number>();
      for (const l of lines) perSeatGame.set(`${String(l.game)}/${String(l.seat)}`, (perSeatGame.get(`${String(l.game)}/${String(l.seat)}`) ?? 0) + (l.usd as number));
      expect(perSeatGame.size).toBe(4);
      const usds = [...perSeatGame.values()];
      expect(report!.seatGameUsd.seatGames).toBe(4);
      expect(report!.seatGameUsd.max).toBeCloseTo(Math.max(...usds), 12);
      expect(report!.seatGameUsd.mean).toBeCloseTo(sum(usds) / 4, 12);
      expect(report!.seatGameUsd.atOrOverBudget).toBe(0);
      expect(report!.ledgerUsd).toBeCloseTo(fast.length * BILLED_USD, 12);
      // A timed-out call's bill is unknown: it counts at its RULE-3 worst case.
      expect(report!.countedUsd).toBeCloseTo(fast.length * BILLED_USD + sum(slow.map((r) => worstUsdOf(r.chars))), 12);
      expect(report!.cap).toBe(1);

      expect(report!.stalls).toEqual({ unfinished: [], cutOff: [] });
      expect(gameLines()).toHaveLength(2);

      const text = out.join('\n');
      expect(text).toMatch(/^UBER-AC-1 FAIL\b/m);
      expect(text).toMatch(/^UBER-AC-2 PASS\b/m);
      expect(text).toMatch(new RegExp(`^fallbacks by reason\\s+too slow ${slow.length}, busy 0, budget 0, off-list 0, unreadable 0, error 0$`, 'm'));
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
      expect(report!.stalls).toEqual({ unfinished: [], cutOff: [] });
      expect(out[0]).toBe('ANTHROPIC_API_KEY is not set: every seat plays Classic and nothing is called.');
      expect(out.join('\n')).toMatch(/^UBER-AC-2 \(key unset\) PASS\b/m);
    },
    GAMES_MS,
  );

  it(
    'UBER-AC-2, INV-spike-cap: a game starts only while counted spend plus its Smart seats\' budgets fits the cap; the default cap and one below a game play none and write no ledger, a cap of exactly one game plays one',
    async () => {
      let calls = 0;
      sdk.create = () => (calls++, Promise.resolve(sdkMessage(USABLE, BILLED)));

      const byDefault = run(['--games', '2']);
      const none = await byDefault.result;
      expect(none.code).toBe(0);
      expect(byDefault.out[0]).toMatch(new RegExp(`cap \\$${BRAIN.spikeCapUsd.toFixed(2)}, planned 2 games`));
      expect(none.report).toMatchObject({ played: 0, stopped: 'cap' });

      const below = await run(['--games', '2', '--smart', '1', '--max-usd', String(BRAIN.seatBudgetUsd - 0.001)]).result;
      expect(below.report).toMatchObject({ played: 0, stopped: 'cap' });
      expect(calls).toBe(0);
      expect(sdk.built).toEqual([]);
      expect(fs.readdirSync(dir)).toEqual([]);

      const one = await run(['--games', '2', '--smart', '1', '--max-usd', String(BRAIN.seatBudgetUsd)]).result;
      expect(one.code).toBe(0);
      expect(one.report).toMatchObject({ played: 1, stopped: 'cap' });
      expect(calls).toBeGreaterThan(0);
      expect(gameLines()).toHaveLength(1);
      expect(sum(callLines().map((l) => l.usd as number))).toBeLessThanOrEqual(BRAIN.seatBudgetUsd);
    },
    GAMES_MS,
  );

  it("INV-spike-cap: a second paid run on the same UTC day is refused with exit 1 and one line naming today's ledger, before any client is built", async () => {
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
        return Promise.reject(new Anthropic.AuthenticationError(401, { type: 'error', error: { message: SDK_TEXT } }, SDK_TEXT, new Headers()));
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
      expect(callLines()).toEqual([expect.objectContaining({ outcome: 'error' })]);
      expect(gameLines()).toEqual([expect.objectContaining({ calls: 1 })]);
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
      const { result } = run(['--games', '1', '--max-usd', '1']);
      const { report } = await result;
      expect(calls).toBeGreaterThan(20);
      expect(report!.asked.all).toEqual({ model: calls, of: calls });
      expect(sum(Object.values(report!.fallbacks))).toBe(0);
    },
    GAMES_MS,
  );

  it('UBER-AC-2: a land grant, auction or land auction still open when its phase ends was cut off by its tick limit', () => {
    const at = (s: Partial<GameState>) => ({ month: 3, players: [], tiles: [], ...s }) as unknown as GameState;
    expect(cutOffPhase(at({ phase: 'auction', auction: { stage: 'trading' } as GameState['auction'] }))).toBe('month 3 auction');
    expect(cutOffPhase(at({ phase: 'auction', auction: { stage: 'over' } as GameState['auction'] }))).toBeNull();
    expect(cutOffPhase(at({ phase: 'auction', auction: null }))).toBeNull();
    expect(cutOffPhase(at({ phase: 'landAuction', landAuction: { stage: 'bidding' } as GameState['landAuction'] }))).toBe('month 3 landAuction');
    expect(cutOffPhase(at({ phase: 'landAuction', landAuction: { stage: 'over' } as GameState['landAuction'] }))).toBeNull();
    expect(cutOffPhase(at({ phase: 'development' }))).toBeNull();
  });

  it('UBER-AC-1, UBER-AC-2: the verdict holds at 80% model share and under $0.06 a seat-game, fails just past either bound or on a stall, and is not proven on fewer games than planned', () => {
    const decisions = (model: number, of: number) =>
      Array.from({ length: of }, (_, i) => ({ seat: 'ai0', kind: 'develop' as const, by: i < model ? ('llm' as const) : ('fallback' as const), options: 2, ...(i < model ? {} : { note: 'decider too slow' }) }));
    const game = (over: Partial<TrialGame> = {}): TrialGame => ({
      id: 'g',
      end: 'over',
      months: 1,
      smart: ['ai0'],
      decisions: decisions(4, 5),
      lines: { ai0: [1] },
      cutOff: [],
      unknownUsd: 0,
      ...over,
    });
    const call = (usd: number) => ({ game: 'g', seat: 'ai0', usd, outcome: 'llm' }) as TrialInput['calls'][number];
    const input = (over: Partial<TrialInput> = {}): TrialInput => ({ keyed: true, planned: 1, stopped: 'done', smartPerGame: 1, cap: 1, games: [game()], calls: [call(0.059)], ...over });
    const verdicts = (i: TrialInput) => {
      const r = trialReport(i);
      return [r.ac1, r.ac2];
    };

    expect(verdicts(input())).toEqual(['pass', 'pass']);
    expect(verdicts(input({ games: [game({ decisions: decisions(79, 100) })] }))).toEqual(['fail', 'pass']);
    expect(verdicts(input({ games: [game({ lines: { ai0: [0] } })] }))).toEqual(['fail', 'pass']);
    expect(verdicts(input({ calls: [call(0.06)] }))).toEqual(['pass', 'fail']);
    expect(verdicts(input({ games: [game({ cutOff: ['month 1 auction'] })] }))).toEqual(['pass', 'fail']);
    expect(verdicts(input({ games: [game({ end: 'unfinished' })] }))[1]).toBe('fail');
    expect(verdicts(input({ planned: 2, stopped: 'cap' }))).toEqual(['not proven', 'not proven']);
    expect(renderTrialReport(trialReport(input()))).toContainEqual(expect.stringMatching(/^UBER-AC-1 PASS\b/));
  });
});
