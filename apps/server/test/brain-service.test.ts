import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, BRAIN, createGame, observe } from '@mule/engine';
import { Brain, candidate, consider, PERSONAS, shortlist, type DecisionRecord, type Mind } from '@mule/ai';
import type { HaikuSdk } from '../src/brain/client.js';
import { createBrain, type BrainSeat } from '../src/brain/index.js';

// Dummy values only: no test reads, prints or sends a real credential, and no test builds a real client.
const KEY = { ANTHROPIC_API_KEY: 'test-key-not-real' };
const SEAT: BrainSeat = { id: 'p0', persona: 'trader', level: 'rookie' };
const GAME = 'g-test';
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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-service-'));
  file = path.join(dir, 'costs.jsonl');
});
afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(dir, { recursive: true, force: true });
});

const lines = (): Record<string, unknown>[] =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as Record<string, unknown>) : [];

/** A real Brain on the service's decider: asks one develop decision and settles it as the hand would. */
function seatOn(sdk: HaikuSdk) {
  const service = createBrain({ gameId: GAME, env: KEY, logPath: file, sdkFactory: () => sdk, now: ticking() });
  const records: DecisionRecord[] = [];
  const brain = new Brain(mind, PERSONAS.trader, 'The Gambler', 11, service.deciderFor(SEAT), (r) => records.push(r));
  const decide = async () => {
    const pending = brain.ask('develop', list(), obs, WAIT, null, 'summary');
    await flush();
    const settled = brain.resolve(pending, WAIT, obs)!;
    return { pending, settled, record: records[records.length - 1]! };
  };
  return { service, brain, decide };
}

describe('brain service', () => {
  it('B-AC-3: with ANTHROPIC_API_KEY unset no client is built, even with ANTHROPIC_AUTH_TOKEN set', () => {
    const keys: string[] = [];
    const sdkFactory = (apiKey: string) => {
      keys.push(apiKey);
      return fakeSdk(() => message('{}'));
    };

    const unset = [{}, { ANTHROPIC_API_KEY: '' }, { ANTHROPIC_AUTH_TOKEN: 'test-token-not-real' }, { ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: 'test-token-not-real' }];
    for (const env of unset) {
      const service = createBrain({ gameId: GAME, env, logPath: file, sdkFactory });
      expect(service.deciderFor(SEAT)).toBeNull();
      expect(service.deciderFor({ id: 'p1', persona: 'aggressive', level: 'tycoon' })).toBeNull();
    }

    // The default env is process.env: unset key, dummy auth token.
    vi.stubEnv('ANTHROPIC_API_KEY', undefined);
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'test-token-not-real');
    const fromProcess = createBrain({ gameId: GAME, logPath: file, sdkFactory });
    expect(fromProcess.deciderFor(SEAT)).toBeNull();

    expect(keys).toEqual([]);

    // Negative: a (dummy) key builds exactly one client, with that key, and seats get deciders.
    const keyed = createBrain({ gameId: GAME, env: KEY, logPath: file, sdkFactory });
    expect(keyed.deciderFor(SEAT)).not.toBeNull();
    expect(keyed.deciderFor({ id: 'p1', persona: 'aggressive', level: 'tycoon' })).not.toBeNull();
    expect(keys).toEqual(['test-key-not-real']);
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
    const { decide } = seatOn(sdk);

    // Negative: below the budget the call is made, even at $0.059 spent.
    for (let i = 0; i < 2; i++) {
      const { settled } = await decide();
      expect(settled.choice).toMatchObject({ by: 'llm', optionId: 'B' });
    }
    expect(sdk.calls).toBe(2);

    for (let i = 0; i < 3; i++) {
      const { pending, settled, record } = await decide();
      expect(settled.choice.by).toBe('fallback');
      expect(settled.choice.optionId).toBe(pending.fallback.optionId);
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
      const { decide } = seatOn(sdk);

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

  it('INV-one-in-flight: a second decision for a busy seat makes no call and writes no line', async () => {
    let answer!: (m: Message) => void;
    const sdk = fakeSdk((n) => (n === 1 ? new Promise<Message>((r) => (answer = r)) : message('{"option":"C","line":""}', USED)));
    const { decide } = seatOn(sdk);

    const first = await decide(); // the hand stops waiting; the call is still open
    expect(first.settled.choice.note).toBe('decider too slow');

    const second = await decide();
    expect(second.settled.choice).toMatchObject({ by: 'fallback', optionId: second.pending.fallback.optionId });
    expect(second.record.note).toBe('decider failed: busy');
    expect(sdk.calls).toBe(1);
    expect(lines()).toEqual([]);

    // The first call settles late: it was billed, so it gets its line, and the seat may call again.
    answer(message('{"option":"B","line":"Mine."}', USED));
    await flush();
    expect(lines().map((l) => l.outcome)).toEqual(['llm']);

    const third = await decide();
    expect(third.settled.choice).toMatchObject({ by: 'llm', optionId: 'C' });
    expect(sdk.calls).toBe(2);
    expect(lines()).toHaveLength(2);
  });

  it("INV-finish: finish writes the game line and releases the budget's locks", async () => {
    const sdk = fakeSdk(() => message('{"option":"B","line":"Mine."}', { input: 600_000 })); // $0.06 a call
    const { service, decide } = seatOn(sdk);

    await decide();
    const locked = await decide();
    expect(locked.record.note).toBe('decider failed: budget spent');
    expect(sdk.calls).toBe(1);

    service.finish();

    const all = lines();
    expect(all).toHaveLength(3);
    expect(all[2]).toMatchObject({
      game: GAME, type: 'game', seats: 1, calls: 2, usd: expect.closeTo(0.06, 10),
      by_seat: { p0: { calls: 2, usd: expect.closeTo(0.06, 10) } },
    });

    // The game's locks are gone: the seat is no longer refused.
    const after = await decide();
    expect(after.settled.choice.by).toBe('llm');
    expect(sdk.calls).toBe(2);
  });
});
