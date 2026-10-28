import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { AI_LEVELS, BRAIN, observe, PHASES, type GameState } from '@mule/engine';
import { PERSONAS, playGame, situation, type DecisionRecord, type ShortOption } from '@mule/ai';
import { AUTH_STOPPED, DATA_DIR } from '../src/brain/cli.js';
import { CallFailed } from '../src/brain/client.js';
import {
  callOrder,
  capFor,
  collectBriefs,
  judgeReply,
  LEVEL_MIX,
  main,
  renderReport,
  runStrategySpike,
  STRATEGY_SCHEMA,
  type Brief,
  type ModelRole,
  type StrategyLine,
  type StrategyReply,
} from '../src/brain/strategy-spike.js';
import { KEY, promptOf, sdkMessage, type SdkMessage, type SdkModuleFake } from './brain-fakes.js';

/** The SDK module's client: records its options and answers through `sdk.create`; it never reaches the network. */
const sdk = vi.hoisted((): SdkModuleFake => ({ built: [], create: null }));
vi.mock('@anthropic-ai/sdk', async (original) => (await import('./brain-fakes.js')).fakeSdkModule(original, sdk));

const S = BRAIN.strategySpike;
const TODAY = new Date('2026-10-29T00:00:00Z');
const PER_MILLION = 1_000_000;

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strategy-spike-'));
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

const PRICES: Record<ModelRole, { input: number; cacheRead: number; cacheWrite: number; output: number }> = {
  haiku: BRAIN.pricesPerMTok,
  sonnet: BRAIN.sonnetPricesPerMTok,
};
const SCHEMA_CHARS = JSON.stringify(STRATEGY_SCHEMA).length;

/** The worst case for a prompt of `chars` characters, from config alone (not from the code under test). */
const worstOf = (role: ModelRole, chars: number): number => {
  const p = PRICES[role];
  return (Math.ceil(chars / BRAIN.charsPerToken) * Math.max(p.input, p.cacheWrite) + S.maxTokens * p.output) / PER_MILLION;
};

const option = (id: string): ShortOption => ({ id, key: `land:${id}`, label: `Plan ${id}`, utility: 0.5, value: 600, rationale: 'fits' });

/** A brief whose prompt is `chars` characters long, schema included. */
function brief(index: number, chars = 10_000, over: Partial<Brief> = {}): Brief {
  const text = chars - SCHEMA_CHARS;
  return {
    index,
    seat: `ai${index % 4}`,
    name: `AI ${(index % 4) + 1}`,
    persona: 'trader',
    level: 'trader',
    corners: true,
    month: 1 + (index % 12),
    money: 1_000,
    plans: [option('A'), option('B')],
    prompt: { system: 's'.repeat(Math.floor(text / 2)), user: 'u'.repeat(Math.ceil(text / 2)), schema: STRATEGY_SCHEMA },
    ...over,
  };
}
const briefs = (n: number, chars = 10_000) => Array.from({ length: n }, (_, i) => brief(i, chars));

interface Answer {
  strategy?: Record<string, unknown>;
  planPick?: string;
  line?: string;
}
const answer = (over: Answer = {}): string =>
  JSON.stringify({
    strategy: { kind: 'builder', moneyMaker: 'food', monopolyTarget: null, cashFloor: 200, reason: 'Steady food first.', ...over.strategy },
    planPick: over.planPick ?? 'A',
    line: over.line ?? 'Food first, friends.',
  });

const reply = (billed: Partial<StrategyReply['usage']> = {}, text = answer(), ms = 1_000, thinking: number | null = 40): StrategyReply => ({
  text,
  ms,
  thinking,
  stopReason: 'end_turn',
  usage: { input: 1_000, cached_read: 0, cache_write: 0, output: 200, ...billed },
});

const run = (list: Brief[], sonnet: number, complete: (role: ModelRole, b: Brief) => Promise<StrategyReply>, cap: number = S.capUsd) => {
  const lines: StrategyLine[] = [];
  const order: string[] = [];
  const report = runStrategySpike({
    briefs: list,
    sonnet,
    complete: (role, prompt) => {
      const b = list.find((x) => x.prompt === prompt)!;
      order.push(`${role[0]}${b.index}`);
      return complete(role, b);
    },
    write: (line) => lines.push(line),
    cap,
    now: () => TODAY,
    log: () => {},
  });
  return { report, lines, order };
};

/** A reply as the SDK returns it, with its thinking tokens. */
function strategyMessage(text: string, usage: Partial<StrategyReply['usage']>, thinking = 30): SdkMessage {
  const msg = sdkMessage(text, usage);
  (msg.usage as { output_tokens_details: unknown }).output_tokens_details = { thinking_tokens: thinking };
  return msg;
}

// Local only (MULE_FULL=1, `pnpm test:full`): brain:strategy-spike is a command run by hand, and only with clearance.
describe.runIf(process.env.MULE_FULL === '1')('brain:strategy-spike', () => {
  it('S-A1: the cap is the lower of the flag and BRAIN.strategySpike.capUsd; an unusable flag gives 0', () => {
    expect(capFor(1)).toBe(S.capUsd);
    expect(capFor(0.03)).toBe(0.03);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) expect(capFor(bad)).toBe(0);
  });

  it('S-A1: the cap stops the run at the first call whose worst case would take the counted spend past it', async () => {
    const chars = 25_000;
    const billed = { input: 5_000, output: 200 };
    const usd = (billed.input * PRICES.haiku.input + billed.output * PRICES.haiku.output) / PER_MILLION;
    const worst = worstOf('haiku', chars);
    const cap = 0.01;
    // The most calls n with (n - 1) billed calls plus one worst case within the cap.
    const fits = Math.floor((cap - worst) / usd) + 1;
    expect(fits).toBeGreaterThan(2);
    expect(fits).toBeLessThan(40);
    const { report, lines } = run(briefs(40, chars), 0, async () => reply(billed), cap);
    const r = await report;
    expect(r.stopped).toBe('cap');
    expect(r.made).toBe(fits);
    expect((fits - 1) * usd + worst).toBeLessThanOrEqual(cap);
    expect(fits * usd + worst).toBeGreaterThan(cap);
    expect(r.countedUsd).toBeCloseTo(fits * usd, 12);
    expect(r.countedUsd).toBeLessThanOrEqual(cap);
    expect(lines).toHaveLength(fits);
  });

  it('S-A1: a call whose bill is unknown (timeout, lost connection, raw error) counts at its worst case; an answered HTTP error counts $0', async () => {
    const chars = 25_000;
    const worst = worstOf('haiku', chars);
    const cap = 0.01;
    const fits = Math.floor(cap / worst);
    expect(fits).toBeGreaterThan(1);
    const unknown = [
      () => new CallFailed('model call timed out', 'timeout', false, S.timeoutMs),
      () => new CallFailed('model call failed: connection failed', 'error', false, 10),
      () => new Error('raw'),
    ];
    for (const make of unknown) {
      const { report, lines } = run(briefs(20, chars), 0, async () => {
        throw make();
      }, cap);
      const r = await report;
      expect(r.made).toBe(fits);
      expect(r.stopped).toBe('cap');
      expect(r.ledgerUsd).toBe(0);
      expect(r.countedUsd).toBeCloseTo(fits * worst, 12);
      expect(r.countedUsd + worst).toBeGreaterThan(cap);
      expect(lines).toHaveLength(fits);
    }
    // Negative: a 500 the API answered billed nothing, so every call runs.
    const { report } = run(briefs(20, chars), 0, async () => {
      throw new CallFailed('model call failed: api status 500', 'error', false, 10, 500);
    }, cap);
    expect(await report).toMatchObject({ made: 20, stopped: 'done', countedUsd: 0 });
  });

  it('S-A1: a Sonnet call whose worst case would pass the cap stops the run, even though the Haiku call before it fit', async () => {
    const chars = 10_000;
    const hWorst = worstOf('haiku', chars);
    const sWorst = worstOf('sonnet', chars);
    // Room for the first Haiku call's worst case, not for a Sonnet one after it.
    const cap = sWorst * 0.9;
    expect(hWorst).toBeLessThan(cap);
    const { report, order } = run(briefs(4, chars), 2, async () => reply({ input: 10, output: 10 }), cap);
    const r = await report;
    expect(order).toEqual(['h0']);
    expect(r.stopped).toBe('cap');
  });

  it('S-A1: a NaN anywhere refuses: a NaN cap calls nothing, and a NaN bill stops the next call', async () => {
    const nanCap = run(briefs(3), 0, async () => reply(), Number.NaN);
    expect(await nanCap.report).toMatchObject({ made: 0, stopped: 'cap' });
    expect(nanCap.order).toEqual([]);

    const nanBill = run(briefs(3), 0, async () => reply({ input: Number.NaN }));
    const r = await nanBill.report;
    expect(nanBill.order).toEqual(['h0']);
    expect(r.stopped).toBe('cap');
  });

  it('S-A1: pairs run first: each of the first --sonnet briefs calls Haiku then Sonnet, then the rest call Haiku alone', async () => {
    expect(callOrder(briefs(5), 2).map((c) => `${c.role[0]}${c.brief.index}`)).toEqual(['h0', 's0', 'h1', 's1', 'h2', 'h3', 'h4']);
    const { report, order, lines } = run(briefs(5), 2, async () => reply());
    const r = await report;
    expect(r.stopped).toBe('done');
    expect(order).toEqual(['h0', 's0', 'h1', 's1', 'h2', 'h3', 'h4']);
    expect(lines.map((l) => l.model)).toEqual([S.models.haiku, S.models.sonnet, S.models.haiku, S.models.sonnet, S.models.haiku, S.models.haiku, S.models.haiku]);
    // More pairs asked than briefs: every brief is a pair.
    expect(callOrder(briefs(2), 5).map((c) => `${c.role[0]}${c.brief.index}`)).toEqual(['h0', 's0', 'h1', 's1']);
  });

  it("S-A1: the ledger prices each call at its own model's prices: Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, cache read 0.1x, cache write 1.25x", async () => {
    expect(S.models.haiku).toBe(BRAIN.model);
    const billed = { input: 1_000, cached_read: 2_000, cache_write: 3_000, output: 400 };
    const { report, lines } = run([brief(0, 10_000, { seat: 'ai3', level: 'rookie', corners: false })], 1, async (role) =>
      role === 'haiku' ? reply(billed, answer(), 900, 120) : reply(billed, answer(), 4_000, 300),
    );
    await report;
    expect(lines).toHaveLength(2);
    // 1000×0.10 + 2000×0.01 + 3000×0.125 + 400×0.50 = 695 per million; Sonnet: 1000×2 + 2000×0.2 + 3000×2.5 + 400×10 = 13 900.
    expect(lines[0]!.usd).toBeCloseTo(695 / PER_MILLION, 15);
    expect(lines[1]!.usd).toBeCloseTo(13_900 / PER_MILLION, 15);
    expect(lines[0]).toMatchObject({ model: 'claude-haiku-5-5', kind: 'strategy', brief: 0, seat: 'ai3', level: 'rookie', ...billed, thinking: 120, ms: 900, outcome: 'valid' });
    expect(lines[1]).toMatchObject({ model: 'claude-sonnet-5-5', kind: 'strategy', brief: 0, ms: 4_000, thinking: 300, outcome: 'valid' });
  });

  it('S-A1: the rookie bound marks a monopolist reply out of bounds; the same reply from a Trader seat is within', () => {
    const rookie = brief(0, 10_000, { level: 'rookie', corners: AI_LEVELS.rookie.corners });
    const trader = brief(1, 10_000, { level: 'trader', corners: AI_LEVELS.trader.corners });
    expect(rookie.corners).toBe(false);
    const monopolist = answer({ strategy: { kind: 'monopolist', moneyMaker: 'smithore', monopolyTarget: 'smithore' } });
    expect(judgeReply(rookie, monopolist)).toMatchObject({ valid: true, within: false, kind: 'monopolist', planPick: 'A' });
    expect(judgeReply(trader, monopolist)).toMatchObject({ valid: true, within: true });
    // Each half of the bound on its own.
    expect(judgeReply(rookie, answer({ strategy: { kind: 'monopolist', monopolyTarget: null } })).within).toBe(false);
    expect(judgeReply(rookie, answer({ strategy: { kind: 'builder', monopolyTarget: 'crystite' } })).within).toBe(false);
    expect(judgeReply(rookie, answer()).within).toBe(true);
    // cashFloor runs from 0 to the seat's money.
    expect(judgeReply(trader, answer({ strategy: { cashFloor: 1_000 } })).within).toBe(true);
    expect(judgeReply(trader, answer({ strategy: { cashFloor: 1_001 } })).within).toBe(false);
    expect(judgeReply(trader, answer({ strategy: { cashFloor: -1 } })).within).toBe(false);
  });

  it('S-A1: a reply is schema-valid only with every field in shape and a plan id from its own brief', () => {
    const b = brief(0);
    expect(judgeReply(b, answer())).toMatchObject({ valid: true, within: true });
    const invalid = [
      'not json',
      '',
      answer({ planPick: 'C' }), // not one of this brief's plans
      answer({ strategy: { kind: 'hermit' } }),
      answer({ strategy: { moneyMaker: 'gold' } }),
      answer({ strategy: { cashFloor: 12.5 } }),
      answer({ strategy: { reason: 'x'.repeat(S.reasonChars + 1) } }),
      answer({ strategy: { extra: 1 } }),
      JSON.stringify({ strategy: JSON.parse(answer()).strategy, planPick: 'A' }), // no line
    ];
    for (const text of invalid) expect(judgeReply(b, text), text.slice(0, 60)).toMatchObject({ valid: false, within: false });
    expect(judgeReply(b, answer({ strategy: { reason: 'x'.repeat(S.reasonChars) } })).valid).toBe(true);
  });

  it('S-A1: the report gives per-model latency, validity, bounds, tokens and cost, pair agreement and the upkeep verdict, and says what quality means here', async () => {
    const list = [brief(0, 10_000, { level: 'rookie', corners: false }), brief(1), brief(2)];
    const haikuMs = [1_000, 2_000, 9_000];
    const { report } = run(list, 2, async (role, b) => {
      if (role === 'sonnet') {
        // Agrees with Haiku on brief 0's plan and kind; on brief 1 picks plan B and the specialist.
        return b.index === 0 ? reply({ output: 500 }, answer({ strategy: { kind: 'monopolist', monopolyTarget: 'food' } }), 6_000, 400) : reply({ output: 500 }, answer({ planPick: 'B', strategy: { kind: 'specialist' } }), 7_000, 400);
      }
      // Haiku: brief 0 answers a monopolist on a rookie seat (valid, out of bounds).
      const text = b.index === 0 ? answer({ strategy: { kind: 'monopolist', monopolyTarget: 'food' } }) : answer();
      return reply({ output: 300 }, text, haikuMs[b.index]!, 100);
    });
    const r = await report;
    const haiku = r.models.find((m) => m.role === 'haiku')!;
    expect(haiku).toMatchObject({ calls: 3, answered: 3, timeouts: 0, errors: 0, p50: 2_000, p90: 9_000, max: 9_000, valid: 1, meanOutput: 300, meanThinking: 100 });
    expect(haiku.within).toBeCloseTo(2 / 3, 12);
    const haikuUsd = (1_000 * PRICES.haiku.input + 300 * PRICES.haiku.output) / PER_MILLION;
    expect(haiku.usd).toBeCloseTo(3 * haikuUsd, 15);
    expect(haiku.seatGameUsd).toBeCloseTo(haikuUsd * S.callsPerSeatGame, 15);
    expect(r.pairs).toEqual({ briefs: 2, planPick: 1, kind: 1 });

    const lines = renderReport(r);
    const text = lines.join('\n');
    expect(text).toMatch(/quality here means valid, within bounds and agreeing with Sonnet/i);
    expect(text).toMatch(/no validator exists yet/i);
    expect(text).toContain(`${PHASES.upkeepMs} ms`);
    // Haiku's p90 (9 s) is over the 8 s upkeep window; Sonnet's (7 s) is under.
    expect(9_000).toBeGreaterThan(PHASES.upkeepMs);
    expect(7_000).toBeLessThan(PHASES.upkeepMs);
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^${S.models.haiku}: p90 9000 ms is over`)));
    expect(lines).toContainEqual(expect.stringMatching(new RegExp(`^${S.models.sonnet}: p90 7000 ms is under`)));
    expect(lines).toContainEqual(expect.stringMatching(/^plan pick agreement\s+1 of 2$/));
    expect(lines).toContainEqual(expect.stringMatching(/^strategy kind agreement\s+1 of 2$/));
  });

  it('S-A1: briefs come from one strategist game at the start of planning, spread over months and seats, a Rookie seat among them, each from the seat\'s own observation', () => {
    const list = collectBriefs(101, 20, 4);
    expect(list).toHaveLength(20);
    expect(list.map((b) => b.index)).toEqual([...Array(20).keys()]);
    expect(LEVEL_MIX).toContain('rookie');
    expect(list.some((b) => b.level === 'rookie' && !b.corners)).toBe(true);
    expect(new Set(list.map((b) => b.seat)).size).toBe(4);
    expect(new Set(list.map((b) => b.month)).size).toBeGreaterThanOrEqual(8);
    // The system block is byte-identical across briefs, so the API can cache it; the schema too.
    expect(new Set(list.map((b) => b.prompt.system)).size).toBe(1);
    expect(new Set(list.map((b) => JSON.stringify(b.prompt.schema))).size).toBe(1);

    // The oracle: the same game, its land decisions as the seats made them, and each seat's view when planning ended.
    const decided: DecisionRecord[] = [];
    const views = new Map<string, GameState>();
    const played = playGame(101, LEVEL_MIX.map((level, i) => ({ level, persona: list.find((b) => b.seat === `ai${i}`)!.persona })), {
      onDecision: (r) => decided.push(r),
      onPhase: (state) => {
        if (state.phase !== 'planning') return;
        for (const p of state.players) views.set(`${p.id}@${state.month}`, observe(state, p.id));
      },
    });
    for (const b of list) {
      const seat = played.seats.find((s) => s.id === b.seat)!;
      expect({ persona: b.persona, level: b.level, corners: b.corners }).toEqual({ persona: seat.mind.personaId, level: seat.mind.levelId, corners: seat.mind.level.corners });
      const record = decided.find((d) => d.kind === 'land' && d.seat === b.seat && d.month === b.month)!;
      expect(b.plans.map((p) => [p.id, p.label])).toEqual(record.shortlist.map((p) => [p.id, p.label]));
      expect(b.plans.length).toBeGreaterThanOrEqual(2);
      const view = views.get(`${b.seat}@${b.month}`)!;
      expect(b.money).toBe(view.players.find((p) => p.id === b.seat)!.money);
      const { user } = b.prompt;
      expect(user).toContain(PERSONAS[b.persona].card);
      expect(user).toContain(situation(view, seat.mind));
      for (const p of b.plans) expect(user).toContain(`${p.id}. ${p.label} — ${p.rationale}`);
      expect(user).toMatch(b.corners ? /may aim to corner/ : /never aims for a monopoly/);
    }
    // The pair briefs (the first four) are spread over the game, not bunched in its first months, one per seat, so
    // Sonnet answers the Rookie seat too.
    const pairs = list.slice(0, 4);
    expect(Math.max(...pairs.map((b) => b.month))).toBeGreaterThan(6);
    expect(new Set(pairs.map((b) => b.seat)).size).toBe(4);
    expect(pairs.some((b) => b.level === 'rookie')).toBe(true);
  }, 60_000); // two strategist games

  it('S-A1: with the key unset, main calls nothing, builds the briefs, prints their sizes and exits 0', async () => {
    const out: string[] = [];
    const code = await main(['--briefs', '6', '--sonnet', '2'], {}, { dataDir: dir, now: () => TODAY, out: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(sdk.built).toEqual([]);
    expect(out[0]).toBe('ANTHROPIC_API_KEY is not set; nothing called.');
    expect(out).toContainEqual(expect.stringMatching(/^briefs\s+6 \(2 with Sonnet\)$/));
    expect(out).toContainEqual(expect.stringMatching(/^system chars \(same in every brief\)\s+\d+$/));
    expect(out).toContainEqual(expect.stringMatching(/^worst case per call, Haiku \/ Sonnet\s+\$\d/));
    expect(fs.readdirSync(dir)).toEqual([]);
  }, 30_000); // main plays a strategist game

  it('S-A1: a 401 stops main after one call with exit 2 and AUTH_STOPPED, no retry, and prints neither the SDK text nor the key', async () => {
    const SDK_TEXT = 'sdk-text-invalid-x-api-key';
    const options: unknown[] = [];
    sdk.create = (_params, opts) => {
      options.push(opts);
      return Promise.reject(new Anthropic.AuthenticationError(401, { type: 'error', error: { message: SDK_TEXT } }, SDK_TEXT, new Headers()));
    };
    const out: string[] = [];
    const code = await main(['--briefs', '3', '--sonnet', '1', '--max-usd', '0.1'], KEY, { dataDir: dir, now: () => TODAY, out: (l) => out.push(l) });
    expect(code).toBe(2);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ maxRetries: 0, timeout: S.timeoutMs });
    expect(out.at(-1)).toBe(AUTH_STOPPED);
    const text = out.join('\n');
    expect(text).not.toContain(SDK_TEXT);
    expect(text).not.toContain(KEY.ANTHROPIC_API_KEY);
  }, 30_000);

  it('S-A1: with the key, main requires --max-usd, sends adaptive thinking, effort and the schema, writes the ledger to its data dir and never prints a prompt', async () => {
    // Without --max-usd: usage, nothing built.
    const refused: string[] = [];
    expect(await main(['--briefs', '2'], KEY, { dataDir: dir, now: () => TODAY, out: (l) => refused.push(l) })).toBe(1);
    expect(refused).toEqual([expect.stringMatching(/^Usage: brain:strategy-spike .*--max-usd.*; nothing called\.$/)]);
    expect(sdk.built).toEqual([]);

    const requests: Parameters<NonNullable<SdkModuleFake['create']>>[0][] = [];
    sdk.create = (params) => {
      requests.push(params);
      return Promise.resolve(strategyMessage(answer(), { input: 2_000, cache_write: 1_500, output: 250 }, 90));
    };
    const out: string[] = [];
    const code = await main(['--', '--briefs', '3', '--sonnet', '1', '--max-usd', '0.05', '--seed', '101'], KEY, { dataDir: dir, now: () => TODAY, out: (l) => out.push(l) });
    expect(code).toBe(0);
    expect(requests.map((p) => p.model)).toEqual([S.models.haiku, S.models.sonnet, S.models.haiku, S.models.haiku]);
    for (const p of requests) {
      expect(p).toMatchObject({ max_tokens: S.maxTokens, thinking: { type: 'adaptive' }, output_config: { effort: S.effort, format: { type: 'json_schema', schema: STRATEGY_SCHEMA } } });
      expect(p.system).toEqual([expect.objectContaining({ cache_control: { type: 'ephemeral' } })]);
    }
    expect(out[0]).toMatch(/cap \$0\.05/);
    const text = out.join('\n');
    expect(text).not.toContain(KEY.ANTHROPIC_API_KEY);
    for (const p of requests.slice(0, 1)) {
      const { system, user } = promptOf(p);
      expect(text).not.toContain(system.slice(0, 200));
      expect(text).not.toContain(user.slice(0, 200));
    }
    const ledger = path.join(dir, 'strategy-spike-2026-10-29.jsonl');
    const lines = fs.readFileSync(ledger, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as StrategyLine);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatchObject({ model: S.models.haiku, kind: 'strategy', input: 2_000, cache_write: 1_500, output: 250, thinking: 90, outcome: 'valid' });

    // A second paid run the same day is refused: the day's ledger exists.
    const again: string[] = [];
    expect(await main(['--briefs', '2', '--max-usd', '0.05'], KEY, { dataDir: dir, now: () => TODAY, out: (l) => again.push(l) })).toBe(1);
    expect(again).toHaveLength(1);
    expect(again[0]).toContain(ledger);
  }, 60_000);

  it('S-A1: no run in this file wrote to apps/server/data', () => {
    expect(listData()).toEqual(dataBefore);
  });
});

afterAll(() => {
  // Belt and braces: the check above runs only with MULE_FULL=1; this one always does.
  expect(listData()).toEqual(dataBefore);
});
