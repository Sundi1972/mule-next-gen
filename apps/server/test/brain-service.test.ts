import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, BRAIN, createGame, observe } from '@mule/engine';
import { Brain, candidate, consider, PERSONAS, shortlist, TopPickDecider, WAIT_MS, type Complete, type Decider, type DecisionRecord, type Mind, type Prompt } from '@mule/ai';
import type { HaikuSdk } from '../src/brain/client.js';
import { API_KEY_ENV, createBrain, type BrainSeat, type BrainService } from '../src/brain/index.js';
import { NO_USAGE, type Usage } from '../src/brain/ledger.js';
import { fakeSdk, KEY, readLedger, sdkMessage, worstUsdOfRequest, type SdkMessage, type SdkModuleFake } from './brain-fakes.js';

/** The SDK module's constructor: records its options and builds nothing, so no network and no credential chain. */
const sdkModule = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdkModule));

/** The port each LlmDecider was built with, newest last, so a test can call one directly. */
const ports = vi.hoisted(() => [] as Array<(prompt: unknown, waitMs: number) => Promise<unknown>>);

vi.mock('@mule/ai', async (importOriginal) => {
  const real = await importOriginal<typeof import('@mule/ai')>();
  class PortCapturingLlmDecider extends real.LlmDecider {
    constructor(complete: Complete) {
      super(complete);
      ports.push(complete as (prompt: unknown, waitMs: number) => Promise<unknown>);
    }
  }
  return { ...real, LlmDecider: PortCapturingLlmDecider };
});

const SEAT: BrainSeat = { id: 'p0', persona: 'trader', level: 'rookie' };
const GAME = 'g-test';
/** The SDK's other credential sources (auth token, profile, workload federation), read from its source. */
const OTHER_CREDENTIALS = [
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_PROFILE',
  'ANTHROPIC_CONFIG_DIR',
  'ANTHROPIC_FEDERATION_RULE_ID',
  'ANTHROPIC_IDENTITY_TOKEN',
  'ANTHROPIC_IDENTITY_TOKEN_FILE',
  'ANTHROPIC_ORGANIZATION_ID',
  'ANTHROPIC_SERVICE_ACCOUNT_ID',
  'ANTHROPIC_WORKSPACE_ID',
  'ANTHROPIC_SCOPE',
];

const mind: Mind = { me: 'p0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'rookie', level: AI_LEVELS.rookie };
const obs = observe(createGame({ seed: 7, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: true })) }), 'p0');
const list = () =>
  shortlist(['a', 'b', 'c'].map((a, i) => candidate(a, `Option ${a}`, a, 10, [consider('fit', 0.9 - i * 0.05, 1, 'fits')])), 3, 0.5);

/** Every clock read moves 40 ms on, so each call takes 40 ms. */
const ticking = () => {
  let t = 0;
  return () => (t += 40);
};

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
};

let dir: string;
let file: string;
beforeEach(() => {
  sdkModule.built = [];
  sdkModule.create = null;
  ports.length = 0;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-service-'));
  file = path.join(dir, 'costs.jsonl');
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** The ledger's lines; none before the first is written. */
const lines = () => (fs.existsSync(file) ? readLedger(file) : []);
/** Plain input tokens that bill `usd`. */
const inputTokensFor = (usd: number) => Math.round((usd * 1_000_000) / BRAIN.pricesPerMTok.input);

const serviceOn = (sdk: HaikuSdk, gameBudgetUsd?: number) =>
  createBrain({ gameId: GAME, env: KEY, logPath: file, sdkFactory: () => sdk, now: ticking(), ...(gameBudgetUsd === undefined ? {} : { gameBudgetUsd }) });
/** A second Smart seat: registering it halves each seat's share of the game budget. */
const OTHER: BrainSeat = { id: 'p1', persona: 'aggressive', level: 'tycoon' };

/**
 * A real Brain on a decider from the service for `seat` (p0 by default). `ask` starts one develop decision, `settle` ends it as the
 * hand would after its wait; `decide` does both. `topPick` is what TopPickDecider picks given the same arguments.
 */
function seatOn(service: BrainService, options = list, seat = SEAT) {
  const inner = service.deciderFor(seat)!;
  let seen: Parameters<Decider['decide']> | null = null;
  const watched: Decider = { name: inner.name, decide: (...args) => ((seen = args), inner.decide(...args)) };
  const records: DecisionRecord[] = [];
  const brain = new Brain(mind, PERSONAS.trader, 'The Gambler', 11, watched, (r) => records.push(r));
  const ask = () => {
    const pending = brain.ask('develop', options(), obs, WAIT_MS.develop, null, 'summary');
    const topPick = new TopPickDecider().decide(...seen!).optionId;
    const settle = () => ({ settled: brain.resolve(pending, WAIT_MS.develop, obs)!, record: records[records.length - 1]! });
    return { pending, topPick, settle };
  };
  const decide = async () => {
    const asked = ask();
    await flush();
    return { ...asked, ...asked.settle() };
  };
  return { decider: inner, ask, decide };
}

describe('brain service', () => {
  it('B-AC-3: with ANTHROPIC_API_KEY unset no client is built, even with ANTHROPIC_AUTH_TOKEN set', () => {
    const keys: string[] = [];
    const sdkFactory = (apiKey: string) => {
      keys.push(apiKey);
      return fakeSdk(() => sdkMessage('{}'));
    };

    const unset = [
      {},
      { ANTHROPIC_API_KEY: '' },
      { ANTHROPIC_API_KEY: ' \t\n ' },
      { ANTHROPIC_AUTH_TOKEN: 'test-token-not-real' },
      { ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: 'test-token-not-real' },
    ];
    for (const env of unset) {
      const service = createBrain({ gameId: GAME, env, logPath: file, sdkFactory });
      expect(service.deciderFor(SEAT)).toBeNull();
      expect(service.deciderFor({ id: 'p1', persona: 'aggressive', level: 'tycoon' })).toBeNull();
    }

    // The default env is process.env and the default factory is the real SDK's constructor (mocked to count).
    // Every other credential source the SDK knows is set to a dummy value; none of them may build a client.
    vi.stubEnv('ANTHROPIC_API_KEY', undefined);
    for (const name of OTHER_CREDENTIALS) vi.stubEnv(name, `test-${name.toLowerCase()}-not-real`);
    expect(createBrain({ gameId: GAME, logPath: file, sdkFactory }).deciderFor(SEAT)).toBeNull();
    vi.stubEnv('ANTHROPIC_API_KEY', '   ');
    expect(createBrain({ gameId: GAME, logPath: file }).deciderFor(SEAT)).toBeNull();
    vi.stubEnv('ANTHROPIC_API_KEY', undefined);
    expect(createBrain({ gameId: GAME, logPath: file }).deciderFor(SEAT)).toBeNull();

    expect(keys).toEqual([]);
    expect(sdkModule.built).toEqual([]);

    // Negative: a (dummy) key builds exactly one client, with that key, and seats get deciders.
    const keyed = createBrain({ gameId: GAME, env: KEY, logPath: file, sdkFactory });
    expect(keyed.deciderFor(SEAT)).not.toBeNull();
    expect(keyed.deciderFor({ id: 'p1', persona: 'aggressive', level: 'tycoon' })).not.toBeNull();
    expect(keys).toEqual(['test-key-not-real']);

    // The default factory passes the key and nothing else the SDK could fall back on: no auth token, and the
    // public API host even with a gateway URL left in the environment (HC-2).
    // Its log level is pinned off, so ANTHROPIC_LOG=debug cannot print requests (prompts).
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://gateway.test-not-real');
    vi.stubEnv('ANTHROPIC_LOG', 'debug');
    const viaSdk = createBrain({ gameId: GAME, env: KEY, logPath: file });
    expect(viaSdk.deciderFor(SEAT)).not.toBeNull();
    expect(sdkModule.built).toEqual([{ apiKey: 'test-key-not-real', authToken: null, baseURL: 'https://api.anthropic.com', logLevel: 'off' }]);
  });

  it("INV-key-read: the key's env name appears in production source only in brain/index.ts", () => {
    expect(API_KEY_ENV).toBe('ANTHROPIC_API_KEY');
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name)) files.push(p);
      }
    };
    for (const group of ['apps', 'packages']) {
      for (const pkg of fs.readdirSync(path.join(root, group))) {
        const src = path.join(root, group, pkg, 'src');
        if (fs.existsSync(src)) walk(src);
      }
    }
    expect(files.map((f) => path.relative(root, f).split(path.sep).join('/'))).toEqual(
      expect.arrayContaining(['apps/server/src/brain/spike.ts', 'apps/server/src/brain/index.ts', 'packages/ai/src/index.ts']),
    );
    const naming = files
      .filter((f) => fs.readFileSync(f, 'utf8').includes('ANTHROPIC_API_KEY'))
      .map((f) => path.relative(root, f).split(path.sep).join('/'));
    expect(naming).toEqual(['apps/server/src/brain/index.ts']);
  });

  // trace-allow: spec §9 names this import check as the ownership boundary's enforcement; it has no AC or INV id.
  it('§9: only brain/client.ts imports @anthropic-ai/sdk', () => {
    const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts')) files.push(p);
      }
    };
    walk(src);
    expect(files.length).toBeGreaterThan(4);
    const importers = files
      .filter((f) => /['"]@anthropic-ai\/sdk(\/[^'"]*)?['"]/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(src, f).split(path.sep).join('/'));
    expect(importers).toEqual(['brain/client.ts']);
  });

  it("B-AC-4: a seat at its share of the game budget makes no call, plays its top pick and calls no more this game", async () => {
    // Two Smart seats share the game budget. Call 1 bills all but about $0.001 of p0's share and call 2 about $0.001,
    // in whole tokens: no call fits after.
    const share = BRAIN.gameBudgetUsd / 2;
    const billed: Partial<Usage>[] = [{ input: inputTokensFor(share - 0.001) }, { input: inputTokensFor(0.001) }];
    const sdk = fakeSdk((n) => sdkMessage('{"option":"B","line":"Mine."}', billed[n - 1] ?? { input: 1 }));
    const service = serviceOn(sdk);
    service.deciderFor(OTHER);
    const { decide } = seatOn(service);

    // Negative: below the budget the call is made, even with only $0.001 left.
    for (let i = 0; i < 2; i++) {
      const { settled } = await decide();
      expect(settled.choice).toMatchObject({ by: 'llm', optionId: 'B' });
    }
    expect(sdk.calls).toBe(2);

    for (let i = 0; i < 3; i++) {
      const { topPick, settled, record } = await decide();
      expect(settled.choice.by).toBe('fallback');
      expect(settled.choice.optionId).toBe(topPick);
      expect(record.note).toBe('decider failed: budget spent');
    }
    expect(sdk.calls).toBe(2);

    const all = lines();
    expect(all.map((l) => l.outcome)).toEqual(['llm', 'llm', 'budget']);
    expect(all[2]).toMatchObject({
      game: GAME, seat: 'p0', kind: 'develop', ...NO_USAGE, usd: 0, ms: 0, outcome: 'budget',
    });
  });

  it("B-AC-4: a seat whose calls all time out or lose the connection locks before its counted spend passes its share of the game budget; a 500 or a reply, even an unusable one, counts only its bill", async () => {
    // Two seats at a $0.08 game budget: a share of $0.04. Labels this long make each call's worst case a large part of
    // it, so only a handful fit.
    const gameBudget = 0.08;
    const share = gameBudget / 2;
    const long = () =>
      shortlist(['a', 'b', 'c'].map((a, i) => candidate(a, a.repeat(105_000), a, 10, [consider('fit', 0.9 - i * 0.05, 1, 'fits')])), 3, 0.5);
    // Replies here bill nothing, so a seat that locks could only have been charged a worst case.
    const cases: { name: string; answer: () => SdkMessage; outcome: string; locks: boolean }[] = [
      {
        name: 'timeout',
        answer: () => {
          throw new Anthropic.APIConnectionTimeoutError();
        },
        outcome: 'timeout',
        locks: true,
      },
      {
        name: 'lost connection',
        answer: () => {
          throw new Anthropic.APIConnectionError({ message: 'socket hang up' });
        },
        outcome: 'error',
        locks: true,
      },
      {
        name: '500',
        answer: () => {
          throw Anthropic.APIError.generate(500, { type: 'error', error: { type: 'api_error', message: 'x' } }, 'x', new Headers());
        },
        outcome: 'error',
        locks: false,
      },
      { name: 'unreadable reply', answer: () => sdkMessage('not json at all'), outcome: 'unreadable', locks: false },
      { name: 'off-list reply', answer: () => sdkMessage('{"option":"F","line":"x"}'), outcome: 'off_list', locks: false },
    ];
    for (const c of cases) {
      fs.rmSync(file, { force: true });
      const worst: number[] = [];
      const sdk = fakeSdk((_n, params) => {
        worst.push(worstUsdOfRequest(params));
        return c.answer();
      });
      const service = serviceOn(sdk, gameBudget);
      service.deciderFor(OTHER);
      const { decide } = seatOn(service, long);

      const notes: (string | undefined)[] = [];
      for (let i = 0; i < 8; i++) notes.push((await decide()).record.note);

      if (!c.locks) {
        // An answer with a status, or any reply, has a known bill (here $0): the seat keeps calling.
        expect(sdk.calls, c.name).toBe(8);
        expect(notes, c.name).not.toContain('decider failed: budget spent');
        expect(lines().map((l) => l.outcome), c.name).toEqual(Array(8).fill(c.outcome));
        continue;
      }
      const calls = sdk.calls;
      expect(calls, c.name).toBeGreaterThan(0);
      expect(new Set(worst).size, c.name).toBe(1);
      const each = worst[0]!;
      // It called while its counted spend left room for one more worst case, and not once past that.
      expect(calls * each, c.name).toBeLessThanOrEqual(share);
      expect((calls + 1) * each, c.name).toBeGreaterThan(share);
      expect(notes.slice(calls), c.name).toEqual(Array(8 - calls).fill('decider failed: budget spent'));

      // The ledger still records the usage it was given, so the game total stays the sum of its call lines.
      service.finish();
      const all = lines();
      expect(all.map((l) => l.type ?? l.outcome), c.name).toEqual([...Array(calls).fill(c.outcome), 'budget', 'game']);
      expect(all.every((l) => l.usd === 0), c.name).toBe(true);
      expect(all.at(-1), c.name).toMatchObject({ type: 'game', calls, usd: 0 });
    }
  });

  it('INV-table-budget: a seat that joins after another spent nearly the whole game budget makes no call though the call fits its share, and the first seat is now past its share', async () => {
    // p0, alone, bills all but $0.0001 of the game budget; every prompt's worst case is more than that.
    const sdk = fakeSdk(() => sdkMessage('{"option":"B","line":"Mine."}', { input: inputTokensFor(BRAIN.gameBudgetUsd - 0.0001) }));
    const service = serviceOn(sdk);
    const first = seatOn(service);
    expect((await first.decide()).settled.choice.by).toBe('llm');

    const second = seatOn(service, list, OTHER);
    const joined = await second.decide();
    expect(joined.settled.choice).toMatchObject({ by: 'fallback', optionId: joined.topPick });
    expect(joined.record.note).toBe('decider failed: budget spent');
    const again = await first.decide();
    expect(again.record.note).toBe('decider failed: budget spent');
    expect(sdk.calls).toBe(1);
    expect(lines().map((l) => [l.seat, l.outcome])).toEqual([['p0', 'llm'], ['p1', 'budget'], ['p0', 'budget']]);
  });

  it('INV-table-budget: createBrain refuses a game budget that is not above 0 and at most BRAIN.gameBudgetUsd, with the key or without', () => {
    const sdkFactory = () => fakeSdk(() => sdkMessage('{}'));
    for (const env of [KEY, {}]) {
      for (const gameBudgetUsd of [0, -0.01, BRAIN.gameBudgetUsd + 0.01, NaN, Infinity]) {
        expect(() => createBrain({ gameId: GAME, env, logPath: file, sdkFactory, gameBudgetUsd }), String(gameBudgetUsd)).toThrow(RangeError);
      }
      // Negative: the ceiling itself and anything below it down to a cent are budgets.
      for (const gameBudgetUsd of [BRAIN.gameBudgetUsd, 0.01]) {
        expect(() => createBrain({ gameId: GAME, env, logPath: file, sdkFactory, gameBudgetUsd })).not.toThrow();
      }
    }
  });

  const USED = { input: 410, cached_read: 620, cache_write: 50, output: 38 };
  const rows: {
    name: string;
    answer: () => SdkMessage;
    outcome: string;
    usage: Usage;
    by: 'llm' | 'fallback';
    note?: string;
  }[] = [
    { name: 'a good reply', answer: () => sdkMessage('{"option":"B","line":"Mine."}', USED), outcome: 'llm', usage: USED, by: 'llm' },
    { name: 'a refusal whose text parses', answer: () => sdkMessage('{"option":"B","line":"Mine."}', USED, 'refusal'), outcome: 'refused', usage: USED, by: 'llm' },
    { name: 'a refusal with no usable text', answer: () => sdkMessage('', USED, 'refusal'), outcome: 'refused', usage: USED, by: 'fallback', note: 'decider failed: unreadable reply' },
    { name: 'junk', answer: () => sdkMessage('not json at all', USED), outcome: 'unreadable', usage: USED, by: 'fallback', note: 'decider failed: unreadable reply' },
    { name: 'an off-list letter', answer: () => sdkMessage('{"option":"F","line":"x"}', USED), outcome: 'off_list', usage: USED, by: 'fallback', note: 'decider failed: named F, not on the list' },
    {
      name: 'a timeout',
      answer: () => {
        throw new Anthropic.APIConnectionTimeoutError();
      },
      outcome: 'timeout',
      usage: NO_USAGE,
      by: 'fallback',
      note: `decider failed: model call timed out (wait ${WAIT_MS.develop} ms)`,
    },
    {
      name: 'a 500',
      answer: () => {
        throw Anthropic.APIError.generate(500, { type: 'error', error: { type: 'api_error', message: 'x' } }, 'x', new Headers());
      },
      outcome: 'error',
      usage: NO_USAGE,
      by: 'fallback',
      note: 'decider failed: model call failed: api status 500',
    },
  ];

  for (const row of rows) {
    it(`INV-RULE4: one ledger line per call with its outcome — ${row.name} → ${row.outcome}`, async () => {
      const sdk = fakeSdk(row.answer);
      const { decide } = seatOn(serviceOn(sdk));

      const { record } = await decide();

      expect(sdk.calls).toBe(1);
      const all = lines();
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({
        game: GAME, seat: 'p0', persona: 'trader', level: 'rookie', model: BRAIN.model, kind: 'develop',
        ...row.usage, ms: 40, timed_out: row.outcome === 'timeout', outcome: row.outcome,
      });
      expect(record.by).toBe(row.by);
      if (row.by === 'llm') expect(record.pick.id).toBe('B');
      expect(record.note).toBe(row.note);
    });
  }

  it('INV-one-in-flight: a second decision for a busy seat makes no call and writes no line, from any decider for that seat', async () => {
    let answer!: (m: SdkMessage) => void;
    const sdk = fakeSdk((n) => (n === 1 ? new Promise<SdkMessage>((r) => (answer = r)) : sdkMessage('{"option":"C","line":""}', USED)));
    const service = serviceOn(sdk);
    const a = seatOn(service);
    const b = seatOn(service); // a second decider for the same seat id

    // Both deciders for p0 decide at once: exactly one call.
    const fromA = a.ask();
    const fromB = b.ask();
    await flush();
    const settledA = fromA.settle(); // the hand stops waiting; the call is still open
    const settledB = fromB.settle();
    expect(sdk.calls).toBe(1);
    expect(settledA.record.note).toBe('decider too slow');
    expect(settledB.record.note).toBe('decider failed: busy');
    expect(settledB.settled.choice).toMatchObject({ by: 'fallback', optionId: fromB.topPick });

    // The same decider again while its call is open: busy too.
    const again = await a.decide();
    expect(again.record.note).toBe('decider failed: busy');
    expect(sdk.calls).toBe(1);
    expect(lines()).toEqual([]);

    // The call settles late: it was billed, so it gets its line, and the seat may call again.
    answer(sdkMessage('{"option":"B","line":"Mine."}', USED));
    await flush();
    expect(lines().map((l) => l.outcome)).toEqual(['llm']);

    const next = await b.decide();
    expect(next.settled.choice).toMatchObject({ by: 'llm', optionId: 'C' });
    expect(sdk.calls).toBe(2);
    expect(lines()).toHaveLength(2);
  });

  it("INV-trial-cap: countedUsd is the game's spend as the seat budget counts it, billed dollars plus each unknown-bill call at its worst case, and keeps that figure after finish", async () => {
    const worst: number[] = [];
    const sdk = fakeSdk((n, params) => {
      worst.push(worstUsdOfRequest(params));
      if (n === 1) return sdkMessage('{"option":"B","line":"Mine."}', { input: 1_000, output: 20 });
      if (n === 2) throw new Anthropic.APIConnectionTimeoutError();
      throw Anthropic.APIError.generate(500, { type: 'error', error: { type: 'api_error', message: 'x' } }, 'x', new Headers());
    });
    const service = serviceOn(sdk);
    const seat = seatOn(service);
    expect(service.countedUsd()).toBe(0);
    for (let i = 0; i < 3; i++) await seat.decide();
    expect(sdk.calls).toBe(3);

    const billed = (1_000 * BRAIN.pricesPerMTok.input + 20 * BRAIN.pricesPerMTok.output) / 1_000_000;
    // The reply bills its usage, the timeout its worst case, and the 500 nothing: the API answered it.
    expect(service.countedUsd()).toBeCloseTo(billed + worst[1]!, 12);
    service.finish();
    expect(service.countedUsd()).toBeCloseTo(billed + worst[1]!, 12);
    expect(createBrain({ gameId: GAME, env: {} }).countedUsd()).toBe(0);
  });

  it('INV-finish: finish writes the game line once, counting model calls only, and the game makes no further calls', async () => {
    // One call bills the only seat's share, the whole game budget, in whole input tokens.
    const tokens = inputTokensFor(BRAIN.gameBudgetUsd);
    const billed = (tokens * BRAIN.pricesPerMTok.input) / 1_000_000;
    const sdk = fakeSdk(() => sdkMessage('{"option":"B","line":"Mine."}', { input: tokens }));
    const service = serviceOn(sdk);
    const seat = seatOn(service);

    await seat.decide();
    const locked = await seat.decide();
    expect(locked.record.note).toBe('decider failed: budget spent');
    expect(sdk.calls).toBe(1);

    service.finish();

    const all = lines();
    expect(all.map((l) => l.type ?? l.outcome)).toEqual(['llm', 'budget', 'game']);
    expect(all[2]).toMatchObject({
      game: GAME, type: 'game', seats: 1, calls: 1, usd: expect.closeTo(billed, 10),
      by_seat: { p0: { calls: 1, usd: expect.closeTo(billed, 10) } },
    });

    // Terminal: no new deciders, and an existing one makes no call and writes no line.
    expect(service.deciderFor(SEAT)).toBeNull();
    const after = await seat.decide();
    expect(after.settled.choice).toMatchObject({ by: 'fallback', optionId: after.topPick });
    expect(after.record.note).toBe('decider failed: game over');
    expect(sdk.calls).toBe(1);

    // The port itself refuses once the game is finished, whatever calls it: finish released the seat's lock.
    expect(ports.length).toBeGreaterThan(0);
    const prompt: Prompt = { system: 's', user: 'u', schema: { type: 'object' } as Prompt['schema'] };
    for (const port of ports) await expect(port(prompt, WAIT_MS.develop)).rejects.toThrow('game over');
    expect(sdk.calls).toBe(1);

    service.finish();
    expect(lines()).toHaveLength(3);
  });
});
