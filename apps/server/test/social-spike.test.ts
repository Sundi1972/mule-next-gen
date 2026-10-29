import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRAIN, GOODS, type Good } from '@mule/engine';
import { AUTH_STOPPED, DATA_DIR } from '../src/brain/cli.js';
import {
  ASK,
  FOLDED_SCHEMA,
  judgeSocial,
  main,
  MODES,
  planCalls,
  REPLY_SCHEMA,
  SOCIAL_SCHEMA,
  socialSection,
  type Mode,
  type PlannedCall,
} from '../src/brain/social-spike.js';
import { collectBriefPoints, STRATEGY_SCHEMA, STRATEGY_SYSTEM, type BriefPoint } from '../src/brain/strategy-spike.js';
import { KEY, promptOf, sdkMessage, type SdkModuleFake, type SdkParams } from './brain-fakes.js';

/** The SDK module's client: records its options and answers through `sdk.create`; it never reaches the network. */
const sdk = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdk));

const C = BRAIN.socialSpike;
const TODAY = new Date('2026-10-29T00:00:00Z');
const PER_MILLION = 1_000_000;
/** A marker inside every reply below: no ledger line may carry it. */
const MARK = 'MARK-q8z2';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-spike-'));
  sdk.built = [];
  sdk.create = null;
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** apps/server/data as it was before this file ran: no test may add to it. */
const listData = () => (fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR).sort() : null);
let dataBefore: string[] | null;
beforeAll(() => {
  dataBefore = listData();
});

const PRICES: Record<string, { input: number; cacheRead: number; cacheWrite: number; output: number }> = { [C.models.haiku]: BRAIN.pricesPerMTok, [C.models.sonnet]: BRAIN.sonnetPricesPerMTok };

/** A request's characters as the model reads them: system, user and the schema's JSON. */
const charsOf = (params: SdkParams) => {
  const { system, user } = promptOf(params);
  return system.length + user.length + JSON.stringify(params.output_config?.format?.schema).length;
};

/** The worst case of a request from config alone: prompt tokens at the dearer input price, a full reply at the output price. */
const worstOf = (params: SdkParams) => {
  const p = PRICES[params.model]!;
  return (Math.ceil(charsOf(params) / BRAIN.charsPerToken) * Math.max(p.input, p.cacheWrite) + params.max_tokens * p.output) / PER_MILLION;
};

const modeOf = (params: SdkParams): Mode => {
  const keys = Object.keys((params.output_config?.format?.schema as { properties: object }).properties);
  return keys.includes('strategy') ? 'folded' : keys.includes('relationships') ? 'separate' : 'reply';
};

const fact = { kind: 'price', subject: 'Food', value: '28' };
const social = (over: Record<string, unknown> = {}) => ({
  relationships: [{ player: 'AI 2', standing: 'friend', why: `${MARK} trades fair` }],
  aims: [{ player: 'AI 2', aim: 'ally', ask: 'vote for me', why: 'needs food' }],
  messages: [{ to: 'AI 2', purpose: 'goodwill', text: `Food for votes? ${MARK}`, facts: [fact] }],
  campaign: { office: 'governor', line: 'Lower taxes, full bellies.' },
  ...over,
});
const strategy = { strategy: { kind: 'builder', moneyMaker: 'food', monopolyTarget: null, cashFloor: 0, reason: 'Steady food.' }, planPick: 'A', line: '' };
const wellFormed: Record<Mode, () => object> = {
  folded: () => ({ ...strategy, ...social() }),
  separate: () => social(),
  reply: () => ({ text: `Deal, at 30. ${MARK}`, facts: [fact] }),
};

/** Answers each request with a well-formed reply for its mode, billed `bill(params)`. */
const answerAll = (bill: (params: SdkParams) => Parameters<typeof sdkMessage>[1]) => (params: SdkParams) =>
  Promise.resolve(sdkMessage(JSON.stringify(wellFormed[modeOf(params)]()), bill(params)));

const paths = () => ({ ledger: path.join(dir, 'out', 'ledger.jsonl'), replies: path.join(dir, 'out', 'replies.jsonl') });
const readLines = (file: string) => fs.readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>);
const runMain = async (argv: string[], env: Record<string, string | undefined> = KEY) => {
  const out: string[] = [];
  const code = await main(argv, env, { dataDir: path.join(dir, 'data'), now: () => TODAY, out: (l) => out.push(l) });
  return { code, out, text: out.join('\n') };
};

// Local only (MULE_FULL=1, `pnpm test:full`): brain:social-spike is a command run by hand, and only with clearance.
describe.runIf(process.env.MULE_FULL === '1')('brain:social-spike', () => {
  let points: BriefPoint[];
  beforeAll(() => {
    points = collectBriefPoints(101, 3, 3);
  }, 30_000);

  it.each([
    { flag: '0.05', cap: 0.05 },
    { flag: '5', cap: C.capUsd },
  ])('INV-sb1-cap: billed at worst case, the run with --max-usd $flag never starts a call that could pass $cap, and stops short of the plan', async ({ flag, cap }) => {
    const before: number[] = [];
    let spent = 0;
    sdk.create = (params) => {
      const worst = worstOf(params);
      before.push(spent + worst);
      spent += worst;
      // Billed exactly the worst case: the whole prompt as cache write, a full reply.
      return answerAll(() => ({ cache_write: Math.ceil(charsOf(params) / BRAIN.charsPerToken), output: params.max_tokens }))(params);
    };
    const { ledger, replies } = paths();
    const { code } = await runMain(['--', '--seed', '101', '--haiku', '3', '--sonnet', '2', '--max-usd', flag, '--ledger', ledger, '--replies', replies]);
    expect(code).toBe(0);
    const planned = 3 * (3 + 2);
    expect(before.length).toBeGreaterThan(0);
    expect(before.length).toBeLessThan(planned);
    for (const counted of before) expect(counted).toBeLessThanOrEqual(cap);
    const usd = readLines(ledger).map((l) => l.usd as number);
    expect(usd).toHaveLength(before.length);
    const total = usd.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(spent, 12);
    expect(total).toBeLessThanOrEqual(cap);
  }, 60_000);

  it('INV-sb1-public: no prompt in any mode carries another seat\'s goods, while the seat\'s own planted stock does reach it', () => {
    const planted = collectBriefPoints(101, 3, 3);
    // Rival stocks no game reaches, a different number per rival and good, in the view the prompts are built from.
    const rivalNumbers: string[] = [];
    for (const [k, pt] of planted.entries()) {
      const rivals = pt.view.players.filter((p) => p.id !== pt.brief.seat);
      rivals.forEach((p, r) =>
        GOODS.forEach((g: Good, gi) => {
          p.stock[g] = 90_000 + k * 1_000 + r * 100 + gi * 7;
          rivalNumbers.push(String(p.stock[g]));
        }),
      );
      pt.view.players.find((p) => p.id === pt.brief.seat)!.stock.smithore = 77_123;
    }
    const calls = planCalls(planted, 3, 2);
    expect(calls).toHaveLength(15);
    for (const c of calls) {
      const text = `${c.prompt.system}\n${c.prompt.user}\n${JSON.stringify(c.prompt.schema)}`;
      for (const n of rivalNumbers) expect(text, `${c.mode} call ${c.n}`).not.toContain(n);
      // The rivals are there by name, so the prompt is about them.
      const rival = c.point.view.players.find((p) => p.id !== c.point.brief.seat)!;
      expect(text).toContain(rival.name);
      if (c.mode !== 'reply') expect(text).toContain('77123');
    }
  }, 30_000);

  it('INV-sb1-ledger-no-text: ledger lines carry counts and no reply text; every reply goes to the replies path only', async () => {
    sdk.create = answerAll(() => ({ input: 1_000, cache_write: 500, cached_read: 200, output: 300 }));
    const { ledger, replies } = paths();
    const { code, text } = await runMain(['--seed', '101', '--haiku', '1', '--sonnet', '1', '--max-usd', '0.1', '--ledger', ledger, '--replies', replies]);
    expect(code).toBe(0);
    const lines = readLines(ledger);
    expect(lines.map((l) => [l.model, l.mode])).toEqual([
      [C.models.haiku, 'folded'],
      [C.models.haiku, 'separate'],
      [C.models.haiku, 'reply'],
      [C.models.sonnet, 'folded'],
      [C.models.sonnet, 'separate'],
      [C.models.sonnet, 'reply'],
    ]);
    for (const l of lines) {
      expect(l).toMatchObject({ kind: 'social', input: 1_000, cache_write: 500, cached_read: 200, output: 300, outcome: 'valid', messages: 1, facts: 1 });
      for (const k of ['t', 'seat', 'persona', 'level', 'month', 'brief_chars', 'thinking', 'ms', 'usd']) expect(l).toHaveProperty(k);
    }
    expect(fs.readFileSync(ledger, 'utf8')).not.toContain(MARK);
    expect(text).not.toContain(MARK);
    const written = readLines(replies);
    expect(written.map((l) => l.mode)).toEqual(['folded', 'separate', 'reply', 'folded', 'separate', 'reply']);
    for (const l of written) expect(JSON.stringify(l.reply)).toContain(MARK);
    // The day's clearance marker is all that lands in the data dir.
    expect(fs.readdirSync(path.join(dir, 'data'))).toEqual(['social-spike-2026-10-29.jsonl']);
  }, 60_000);

  const malformed: Record<Mode, () => object> = {
    folded: () => ({ ...strategy, ...social({ messages: [1, 2, 3, 4].map(() => social().messages[0]) }) }),
    separate: () => social({ relationships: [{ player: 'AI 2', standing: 'ally', why: 'x' }] }),
    reply: () => ({ text: 'x'.repeat(BRAIN.maxLineChars + 1), facts: [] }),
  };
  const schemaOf: Record<Mode, object> = { folded: FOLDED_SCHEMA, separate: SOCIAL_SCHEMA, reply: REPLY_SCHEMA };

  it.each(MODES)('INV-sb1-modes: %s builds its prompt and schema, and its judge accepts a well-formed reply and rejects a malformed one', (mode) => {
    const call = planCalls(points, 1, 0).find((c) => c.mode === mode)! as PlannedCall;
    const { prompt, point } = call;
    expect(prompt.schema).toBe(schemaOf[mode]);
    const schema = prompt.schema as { properties: object; required: string[]; additionalProperties: boolean };
    expect(schema.additionalProperties).toBe(false);
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort());
    const section = socialSection(point);
    expect(section).toContain(ASK);
    expect(section).toContain("Vote for me and I'll cut taxes");
    if (mode === 'folded') {
      expect(prompt.system).toBe(STRATEGY_SYSTEM);
      expect(prompt.user.startsWith(point.brief.prompt.user)).toBe(true);
      expect(prompt.user.endsWith(section)).toBe(true);
      expect(Object.keys(schema.properties)).toEqual([...STRATEGY_SCHEMA.required, ...Object.keys((SOCIAL_SCHEMA as unknown as { properties: object }).properties)]);
    } else if (mode === 'separate') {
      expect(prompt.user.endsWith(section)).toBe(true);
      expect(prompt.system).toMatch(/never state a false game fact or rule/);
      expect(prompt.user.length).toBeLessThan(point.brief.prompt.user.length + section.length);
    } else {
      expect(prompt.user).not.toContain(ASK);
      expect(prompt.user).toMatch(/whispered to you: ".+"/);
    }

    expect(judgeSocial(call, JSON.stringify(wellFormed[mode]()))).toMatchObject({ valid: true, cause: null, messages: 1, facts: 1 });
    const bad = judgeSocial(call, JSON.stringify(malformed[mode]()));
    expect(bad).toMatchObject({ valid: false, messages: null, facts: null });
    expect(bad.cause).toBe({ folded: 'too_many_messages', separate: 'bad_enum', reply: 'text_too_long' }[mode]);
    if (mode === 'folded') expect(judgeSocial(call, JSON.stringify({ ...wellFormed.folded(), planPick: 'Z' }))).toMatchObject({ valid: false, strategy: { valid: false, cause: 'plan_not_offered' } });
  });

  it('FM-sb1-no-key: without the key main refuses before building a client; --plan calls nothing and needs no key or paths', async () => {
    const { ledger, replies } = paths();
    const refused = await runMain(['--seed', '101', '--haiku', '3', '--sonnet', '2', '--max-usd', '0.09', '--ledger', ledger, '--replies', replies], {});
    expect(refused.code).toBe(1);
    expect(refused.out).toContain('ANTHROPIC_API_KEY is not set; nothing called.');
    expect(sdk.built).toEqual([]);
    // Paths are required: with the key and without them, nothing is built either.
    const noPaths = await runMain(['--seed', '101', '--max-usd', '0.09']);
    expect(noPaths.code).toBe(1);
    expect(noPaths.text).toMatch(/--ledger.*--replies/);
    expect(sdk.built).toEqual([]);

    const plan = await runMain(['--seed', '101', '--haiku', '3', '--sonnet', '2', '--plan'], {});
    expect(plan.code).toBe(0);
    expect(sdk.built).toEqual([]);
    expect(plan.out.filter((l) => /^\s*\d+\s+claude-/.test(l))).toHaveLength(15);
    expect(plan.text).toMatch(/total worst case\s+\$\d/);
    expect(fs.existsSync(path.join(dir, 'out'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'data'))).toBe(false);
  }, 30_000);

  it('FM-sb1-auth: a 401 stops main after one call with exit 2 and AUTH_STOPPED, no retry, and prints neither the SDK text nor the key', async () => {
    const SDK_TEXT = 'sdk-text-invalid-x-api-key';
    const options: unknown[] = [];
    sdk.create = (_params, opts) => {
      options.push(opts);
      return Promise.reject(new Anthropic.AuthenticationError(401, { type: 'error', error: { message: SDK_TEXT } }, SDK_TEXT, new Headers()));
    };
    const { ledger, replies } = paths();
    const { code, out, text } = await runMain(['--haiku', '2', '--sonnet', '1', '--max-usd', '0.1', '--ledger', ledger, '--replies', replies]);
    expect(code).toBe(2);
    expect(options).toEqual([expect.objectContaining({ maxRetries: 0, timeout: C.timeoutMs.folded })]);
    expect(out.at(-1)).toBe(AUTH_STOPPED);
    expect(text).not.toContain(SDK_TEXT);
    expect(text).not.toContain(KEY.ANTHROPIC_API_KEY);
    expect(readLines(ledger)).toEqual([expect.objectContaining({ outcome: 'error', usd: 0 })]);
  }, 30_000);

  it('INV-sb1-paths: no run in this file wrote to apps/server/data', () => {
    expect(listData()).toEqual(dataBefore);
  });
});

afterAll(() => {
  // The check above runs only with MULE_FULL=1; this one always does.
  expect(listData()).toEqual(dataBefore);
});
