import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, BRAIN, createGame, observe } from '@mule/engine';
import { Brain, candidate, consider, PERSONAS, shortlist, TopPickDecider, type Decider, type DecisionRecord, type Mind } from '@mule/ai';
import type { HaikuSdk } from '../src/brain/client.js';
import { API_KEY_ENV, createBrain, type BrainSeat, type BrainService } from '../src/brain/index.js';

/** What the SDK constructor was given, once per construction. */
const built = vi.hoisted(() => ({ options: [] as unknown[] }));

// The SDK module with a counting constructor that builds nothing: no network, no credential chain. Statics such as
// the error classes resolve to the real ones through the prototype chain, so the client's instanceof checks still hold.
vi.mock('@anthropic-ai/sdk', async (importOriginal) => {
  const real = await importOriginal<typeof import('@anthropic-ai/sdk')>();
  class CountingAnthropic {
    readonly messages = { create: () => Promise.reject(new Error('no network in tests')) };
    constructor(options: unknown) {
      built.options.push(options);
    }
  }
  Object.setPrototypeOf(CountingAnthropic, real.Anthropic);
  return { ...real, default: CountingAnthropic, Anthropic: CountingAnthropic };
});

// Dummy values only: no test reads, prints or sends a real credential, and no test builds a real client.
const KEY = { ANTHROPIC_API_KEY: 'test-key-not-real' };
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
const WAIT = 1_500; // the develop hand's wait, which LlmDecider uses for kind 'develop'

const mind: Mind = { me: 'p0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'rookie', level: AI_LEVELS.rookie };
const obs = observe(createGame({ seed: 7, players: [0, 1, 2].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: true })) }), 'p0');
const list = () =>
  shortlist(['a', 'b', 'c'].map((a, i) => candidate(a, `Option ${a}`, a, 10, [consider('fit', 0.9 - i * 0.05, 1, 'fits')])), 3, 0.5);

type Create = HaikuSdk['messages']['create'];
type Message = Awaited<ReturnType<Create>>;
type Billed = { input?: number; cached_read?: number; cache_write?: number; output?: number };

function message(text: string, billed: Billed = {}, stop_reason: string = 'end_turn'): Message {
  return {
    id: 'm',
    type: 'message',
    role: 'assistant',
    model: BRAIN.model,
    content: [{ type: 'text', text }],
    stop_reason,
    stop_sequence: null,
    usage: {
      input_tokens: billed.input ?? 0,
      cache_read_input_tokens: billed.cached_read ?? 0,
      cache_creation_input_tokens: billed.cache_write ?? 0,
      output_tokens: billed.output ?? 0,
    },
  } as unknown as Message; // the stub omits server-only Message fields
}

/** A stand-in for the SDK: the client's real code runs on top of it, and it counts the calls it gets. */
function fakeSdk(answer: (n: number) => Message | Promise<Message>) {
  const sdk = {
    calls: 0,
    messages: {
      create: (() => {
        sdk.calls += 1;
        const n = sdk.calls;
        return Promise.resolve().then(() => answer(n));
      }) as unknown as Create,
    },
  };
  return sdk;
}

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
  built.options.length = 0;
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-service-'));
  file = path.join(dir, 'costs.jsonl');
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const lines = (): Record<string, unknown>[] =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : [];

const serviceOn = (sdk: HaikuSdk) => createBrain({ gameId: GAME, env: KEY, logPath: file, sdkFactory: () => sdk, now: ticking() });

/**
 * A real Brain on a decider from the service for seat p0. `ask` starts one develop decision, `settle` ends it as the
 * hand would after its wait; `decide` does both. `topPick` is what TopPickDecider picks given the same arguments.
 */
function seatOn(service: BrainService) {
  const inner = service.deciderFor(SEAT)!;
  let seen: Parameters<Decider['decide']> | null = null;
  const watched: Decider = { name: inner.name, decide: (...args) => ((seen = args), inner.decide(...args)) };
  const records: DecisionRecord[] = [];
  const brain = new Brain(mind, PERSONAS.trader, 'The Gambler', 11, watched, (r) => records.push(r));
  const ask = () => {
    const pending = brain.ask('develop', list(), obs, WAIT, null, 'summary');
    const topPick = new TopPickDecider().decide(...seen!).optionId;
    const settle = () => ({ settled: brain.resolve(pending, WAIT, obs)!, record: records[records.length - 1]! });
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
      return fakeSdk(() => message('{}'));
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
    expect(built.options).toEqual([]);

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
    expect(built.options).toEqual([{ apiKey: 'test-key-not-real', authToken: null, baseURL: 'https://api.anthropic.com', logLevel: 'off' }]);
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

  it('B-AC-4: a seat at its budget makes no call, plays its top pick and calls no more this game', async () => {
    // Call 1 bills $0.059; call 2 bills $0.001, which brings the seat to $0.06.
    const billed: Billed[] = [{ input: 590_000 }, { input: 10_000 }];
    const sdk = fakeSdk((n) => message('{"option":"B","line":"Mine."}', billed[n - 1] ?? { input: 1 }));
    const { decide } = seatOn(serviceOn(sdk));

    // Negative: below the budget the call is made, even at $0.059 spent.
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
      game: GAME, seat: 'p0', kind: 'develop', input: 0, cached_read: 0, cache_write: 0, output: 0, usd: 0, ms: 0, outcome: 'budget',
    });
  });

  const ZERO = { input: 0, cached_read: 0, cache_write: 0, output: 0 };
  const USED = { input: 410, cached_read: 620, cache_write: 50, output: 38 };
  const rows: {
    name: string;
    answer: () => Message;
    outcome: string;
    usage: typeof ZERO;
    by: 'llm' | 'fallback';
    note?: string;
  }[] = [
    { name: 'a good reply', answer: () => message('{"option":"B","line":"Mine."}', USED), outcome: 'llm', usage: USED, by: 'llm' },
    { name: 'a refusal whose text parses', answer: () => message('{"option":"B","line":"Mine."}', USED, 'refusal'), outcome: 'refused', usage: USED, by: 'llm' },
    { name: 'a refusal with no usable text', answer: () => message('', USED, 'refusal'), outcome: 'refused', usage: USED, by: 'fallback', note: 'decider failed: unreadable reply' },
    { name: 'junk', answer: () => message('not json at all', USED), outcome: 'unreadable', usage: USED, by: 'fallback', note: 'decider failed: unreadable reply' },
    { name: 'an off-list letter', answer: () => message('{"option":"F","line":"x"}', USED), outcome: 'off_list', usage: USED, by: 'fallback', note: 'decider failed: named F, not on the list' },
    {
      name: 'a timeout',
      answer: () => {
        throw new Anthropic.APIConnectionTimeoutError();
      },
      outcome: 'timeout',
      usage: ZERO,
      by: 'fallback',
      note: `decider failed: model call timed out (wait ${WAIT} ms)`,
    },
    {
      name: 'a 500',
      answer: () => {
        throw Anthropic.APIError.generate(500, { type: 'error', error: { type: 'api_error', message: 'x' } }, 'x', new Headers());
      },
      outcome: 'error',
      usage: ZERO,
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
    let answer!: (m: Message) => void;
    const sdk = fakeSdk((n) => (n === 1 ? new Promise<Message>((r) => (answer = r)) : message('{"option":"C","line":""}', USED)));
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
    answer(message('{"option":"B","line":"Mine."}', USED));
    await flush();
    expect(lines().map((l) => l.outcome)).toEqual(['llm']);

    const next = await b.decide();
    expect(next.settled.choice).toMatchObject({ by: 'llm', optionId: 'C' });
    expect(sdk.calls).toBe(2);
    expect(lines()).toHaveLength(2);
  });

  it('INV-finish: finish writes the game line once, counting model calls only, and the game makes no further calls', async () => {
    const sdk = fakeSdk(() => message('{"option":"B","line":"Mine."}', { input: 600_000 })); // $0.06 a call
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
      game: GAME, type: 'game', seats: 1, calls: 1, usd: expect.closeTo(0.06, 10),
      by_seat: { p0: { calls: 1, usd: expect.closeTo(0.06, 10) } },
    });

    // Terminal: no new deciders, and an existing one makes no call and writes no line.
    expect(service.deciderFor(SEAT)).toBeNull();
    const after = await seat.decide();
    expect(after.settled.choice).toMatchObject({ by: 'fallback', optionId: after.topPick });
    expect(after.record.note).toBe('decider failed: game over');
    expect(sdk.calls).toBe(1);
    service.finish();
    expect(lines()).toHaveLength(3);
  });
});
