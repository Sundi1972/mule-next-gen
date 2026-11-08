import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { advancePhase, BRAIN, createGame, type GameState } from '@mule/engine';
import { AiSeat, playbookSource, type Prompt } from '@mule/ai';
import { createBudget, MOVE_CALL, worstCaseUsd } from '../src/brain/budget.js';
import { WRITE_CALLS, WRITE_FALLBACK_MODEL, WRITE_KINDS } from '../src/brain/client.js';
import { createBrain } from '../src/brain/index.js';
import { Playbooks } from '../src/brain/playbooks.js';
import { fakeSdk, KEY, readLedger, sdkMessage, type SdkParams } from './brain-fakes.js';

/** The game budget these tests use; two registered seats get a share of 0.5 each. */
const GAME_BUDGET = 1;

/**
 * A $1 game budget over a fake ledger whose totals the test sets directly. `seats` names each game's registered
 * Smart seats; `register` adds one later, as the brain does when it builds a seat's decider.
 */
function setup(seats: Record<string, string[]>) {
  const spent = new Map<string, number>();
  const registered = new Map(Object.entries(seats));
  const key = (game: string, seat: string) => `${game}/${seat}`;
  const budget = createBudget(
    { seatSpent: (game, seat) => spent.get(key(game, seat)) ?? 0 },
    { budgetUsd: GAME_BUDGET, seats: (game) => registered.get(game) ?? [] },
  );
  return {
    budget,
    setSpent: (game: string, seat: string, v: number) => spent.set(key(game, seat), v),
    register: (game: string, seat: string) => registered.set(game, [...(registered.get(game) ?? []), seat]),
  };
}

const SCHEMA: Prompt['schema'] = {
  type: 'object',
  properties: { option: { type: 'string', enum: ['a', 'b'] }, line: { type: 'string' } },
  required: ['option'],
  additionalProperties: false,
};
const SCHEMA_CHARS = JSON.stringify(SCHEMA).length;
/** A prompt whose system + user + schema JSON total exactly `total` characters. */
const promptOf = (total: number, schema = SCHEMA): Prompt => ({
  system: 'x'.repeat(1000),
  user: 'y'.repeat(total - 1000 - JSON.stringify(schema).length),
  schema,
});

/** allow's answers: call; refused by this check, which locks the seat; refused because it was already locked. */
const CALL = { allowed: true, lockedNow: false };
const LOCKS = { allowed: false, lockedNow: true };
const LOCKED = { allowed: false, lockedNow: false };

describe('RULE-3 budget table', () => {
  it('B-AC-4 (RULE-3): spent 0, next 0.0005 → call', () => {
    const { budget } = setup({ g: ['s', 't'] });
    expect(budget.allow('g', 's', 0.0005)).toEqual(CALL);
  });

  it("B-AC-4 (RULE-3): two Smart seats at a $1 game budget, spent 0.499, next 0.0005 → call (0.4995 is within the seat's 0.5 share)", () => {
    const { budget, setSpent } = setup({ g: ['s', 't'] });
    setSpent('g', 's', 0.499);
    expect(budget.allow('g', 's', 0.0005)).toEqual(CALL);
  });

  it("B-AC-4 (RULE-3): spent 0.4996, next 0.0005 → over the seat's 0.5 share though the table has room; a NaN spent or next fails closed", () => {
    const { budget, setSpent } = setup({ g: ['s', 't'], 'g-nan': ['nan-spent', 'nan-next'] });
    setSpent('g', 's', 0.4996);
    expect(budget.allow('g', 's', 0.0005)).toEqual(LOCKS);
    setSpent('g-nan', 'nan-spent', NaN);
    expect(budget.allow('g-nan', 'nan-spent', 0.0005)).toEqual(LOCKS);
    expect(budget.allow('g-nan', 'nan-next', NaN)).toEqual(LOCKS);
    // and each is locked afterwards, even once the numbers are sane
    setSpent('g-nan', 'nan-spent', 0);
    expect(budget.allow('g-nan', 'nan-spent', 0)).toEqual(LOCKED);
    expect(budget.allow('g-nan', 'nan-next', 0)).toEqual(LOCKED);
  });

  it('B-AC-4 (RULE-3): a negative or non-finite next, or a non-finite spent, fails closed even when the sum would fit', () => {
    const { budget, setSpent } = setup({ g: ['neg-next', 'neg-inf-next', 'inf-next', 'zero-next'], 'g-inf': ['neg-inf-spent'] });
    setSpent('g', 'neg-next', 0.2);
    expect(budget.allow('g', 'neg-next', -0.0005)).toEqual(LOCKS);
    expect(budget.allow('g', 'neg-inf-next', -Infinity)).toEqual(LOCKS);
    expect(budget.allow('g', 'inf-next', Infinity)).toEqual(LOCKS);
    setSpent('g-inf', 'neg-inf-spent', -Infinity);
    expect(budget.allow('g-inf', 'neg-inf-spent', 0.0005)).toEqual(LOCKS);
    // Negative: a next of exactly 0 is a valid worst case.
    expect(budget.allow('g', 'zero-next', 0)).toEqual(CALL);
  });

  it("B-AC-4 (RULE-3): exactly at the seat's share (spent + next = 0.5) → call; a hair past it → refused", () => {
    const { budget, setSpent } = setup({ g: ['s', 't'], h: ['s', 't'] });
    setSpent('g', 's', 0.25);
    expect(budget.allow('g', 's', GAME_BUDGET / 2 - 0.25)).toEqual(CALL);
    setSpent('h', 's', 0.25);
    expect(budget.allow('h', 's', GAME_BUDGET / 2 - 0.25 + 1e-9)).toEqual(LOCKS);
  });

  it('B-AC-4 (RULE-3): after a refusal the same seat stays refused even when a call would fit; only the first refusal reports the lock', () => {
    const { budget, setSpent } = setup({ g: ['s', 't'] });
    setSpent('g', 's', 0.4996);
    expect(budget.allow('g', 's', 0.0005)).toEqual(LOCKS);
    setSpent('g', 's', 0);
    expect(budget.allow('g', 's', 0)).toEqual(LOCKED);
  });

  it('B-AC-4 (RULE-3): a refusal on one seat leaves a different seat in the same game alone', () => {
    const { budget, setSpent } = setup({ g: ['a', 'b'] });
    setSpent('g', 'a', 0.4996);
    expect(budget.allow('g', 'a', 0.0005)).toEqual(LOCKS);
    expect(budget.allow('g', 'b', 0.0005)).toEqual(CALL);
  });

  it('B-AC-4 (RULE-3): a refusal leaves the same seat id in another game alone', () => {
    const { budget, setSpent } = setup({ g1: ['s', 't'], g2: ['s', 't'] });
    setSpent('g1', 's', 0.4996);
    expect(budget.allow('g1', 's', 0.0005)).toEqual(LOCKS);
    expect(budget.allow('g2', 's', 0.0005)).toEqual(CALL);
  });

  it("B-AC-4 (RULE-3): release(game) forgets that game's locks and unknown bills, and only that game's", () => {
    const { budget, setSpent } = setup({ g1: ['s', 'u'], g2: ['s', 'u'] });
    setSpent('g1', 's', 0.4996);
    setSpent('g2', 's', 0.4996);
    expect(budget.allow('g1', 's', 0.0005)).toEqual(LOCKS);
    expect(budget.allow('g2', 's', 0.0005)).toEqual(LOCKS);
    // Seat u has no ledger spend; only its unknown bills bring it near its share.
    budget.countUnknownBill('g1', 'u', 0.4996);
    budget.countUnknownBill('g2', 'u', 0.4996);
    budget.release('g1');
    setSpent('g1', 's', 0);
    setSpent('g2', 's', 0);
    expect(budget.allow('g1', 's', 0.0005)).toEqual(CALL);
    expect(budget.allow('g2', 's', 0.0005)).toEqual(LOCKED);
    expect(budget.allow('g1', 'u', 0.0005)).toEqual(CALL);
    expect(budget.allow('g2', 'u', 0.0005)).toEqual(LOCKS);
  });

  it('B-AC-4 (RULE-3): worstCase counts system, user and schema, rounds tokens up, prices input at the cache-write rate', () => {
    const p = BRAIN.pricesPerMTok;
    const priced = (tokens: number) => (tokens * p.cacheWrite + BRAIN.maxTokens * p.output) / 1_000_000;
    const TOKENS = 1000;
    const whole = TOKENS * BRAIN.charsPerToken; // chars that make exactly TOKENS tokens
    expect(Number.isInteger(whole)).toBe(true);
    expect(worstCaseUsd(promptOf(whole), MOVE_CALL)).toBeCloseTo(priced(TOKENS), 12);
    // one char more is one token more: pins ceil
    expect(worstCaseUsd(promptOf(whole + 1), MOVE_CALL)).toBeCloseTo(priced(TOKENS + 1), 12);
    // the schema's JSON is what carries a prompt over a token boundary: without it these chars price one token less
    const sys = 'x'.repeat(1000);
    const user = 'y'.repeat(whole - 1000 - SCHEMA_CHARS + 1);
    const chars = 1000 + user.length; // system + user alone
    expect(chars + SCHEMA_CHARS).toBe(whole + 1);
    const tokensWithout = Math.ceil(chars / BRAIN.charsPerToken);
    expect(tokensWithout).toBeLessThan(TOKENS + 1);
    expect(worstCaseUsd({ system: sys, user, schema: SCHEMA }, MOVE_CALL)).toBeCloseTo(priced(TOKENS + 1), 12);
  });
});

describe("INV-price-by-model: a call's worst case is at its own model's prices and its own reply cap", () => {
  const TOKENS = 1000;
  const whole = TOKENS * BRAIN.charsPerToken;
  /** RULE-3's worst case at a price table and reply cap, from BRAIN's constants. */
  const pricedAt = (p: Readonly<Record<keyof typeof BRAIN.pricesPerMTok, number>>, maxTokens: number) =>
    (TOKENS * Math.max(p.input, p.cacheWrite) + maxTokens * p.output) / 1_000_000;

  it('INV-price-by-model: a Sonnet 5.5 call is priced at Sonnet rates, never at Haiku rates', () => {
    const maxTokens = 3_000;
    const sonnet = worstCaseUsd(promptOf(whole), { model: 'claude-sonnet-5-5', maxTokens });
    expect(sonnet).toBeCloseTo(pricedAt(BRAIN.sonnetPricesPerMTok, maxTokens), 12);
    expect(sonnet).not.toBeCloseTo(pricedAt(BRAIN.pricesPerMTok, maxTokens), 8);
  });

  it.each(WRITE_KINDS)("INV-price-by-model: a %s call's worst case is at its kind's model and reply cap, and so is the fallback's; both exceed a move's", (kind) => {
    const { model, maxTokens } = WRITE_CALLS[kind];
    const own = worstCaseUsd(promptOf(whole), WRITE_CALLS[kind]);
    const fallback = worstCaseUsd(promptOf(whole), { model: WRITE_FALLBACK_MODEL, maxTokens });
    expect(own).toBeCloseTo(pricedAt(BRAIN[BRAIN.priceTable[model]], maxTokens), 12);
    expect(fallback).toBeCloseTo(pricedAt(BRAIN[BRAIN.priceTable[WRITE_FALLBACK_MODEL]], maxTokens), 12);
    // A write call counted at a move's cap would undercount: neither may ever come out at the move worst case.
    const move = worstCaseUsd(promptOf(whole), MOVE_CALL);
    expect(own).toBeGreaterThan(move);
    expect(fallback).toBeGreaterThan(move);
  });

  it('INV-price-by-model: a move call is unchanged: BRAIN.model at its prices, BRAIN.maxTokens', () => {
    expect(MOVE_CALL).toEqual({ model: BRAIN.model, maxTokens: BRAIN.maxTokens });
    expect(worstCaseUsd(promptOf(whole), MOVE_CALL)).toBeCloseTo(pricedAt(BRAIN[BRAIN.priceTable[BRAIN.model]], BRAIN.maxTokens), 12);
  });
});

describe('INV-table-budget', () => {
  it('INV-table-budget: a seat registered after spending began shrinks the shares; the first seat is then past its share, and the newcomer is refused a call that fits its share but not the table', () => {
    const { budget, setSpent, register } = setup({ g: ['a'] });
    setSpent('g', 'a', 0.9);
    // Alone, a's share is the whole game budget.
    expect(budget.allow('g', 'a', 0.05)).toEqual(CALL);
    register('g', 'b');
    expect(budget.allow('g', 'a', 0.0005)).toEqual(LOCKS);
    // 0.2 is within b's 0.5 share, but 0.9 + 0.2 passes the game budget.
    expect(budget.allow('g', 'b', 0.2)).toEqual(LOCKS);
  });

  it('INV-table-budget: the newcomer may still make a call that fits both its share and what is left of the table', () => {
    const { budget, setSpent, register } = setup({ g: ['a'] });
    setSpent('g', 'a', 0.9);
    register('g', 'b');
    expect(budget.allow('g', 'b', 0.05)).toEqual(CALL);
  });

  it("INV-table-budget: a call within both the seat's share and the table's budget → call", () => {
    const { budget, setSpent } = setup({ g: ['a', 'b'] });
    setSpent('g', 'a', 0.3);
    setSpent('g', 'b', 0.2);
    expect(budget.allow('g', 'a', 0.1)).toEqual(CALL);
    expect(budget.allow('g', 'b', 0.3)).toEqual(CALL);
  });

  it("INV-table-budget: the table counts every seat's unknown bills at their worst case", () => {
    const { budget, setSpent, register } = setup({ g: ['a'] });
    setSpent('g', 'a', 0.5);
    budget.countUnknownBill('g', 'a', 0.4);
    register('g', 'b');
    // On the ledger alone the table would hold 0.5 + 0.2.
    expect(budget.allow('g', 'b', 0.2)).toEqual(LOCKS);
  });

  it("INV-table-budget: a non-finite spend at any seat fails every seat's check closed", () => {
    const { budget, setSpent } = setup({ g: ['a', 'b'], h: ['a', 'b'] });
    setSpent('g', 'a', NaN);
    expect(budget.allow('g', 'b', 0.0005)).toEqual(LOCKS);
    setSpent('h', 'a', -Infinity);
    expect(budget.allow('h', 'b', 0.0005)).toEqual(LOCKS);
  });

  it('INV-table-budget: a seat asking before it is registered counts as one more seat, so it can neither widen the shares nor slip past the table', () => {
    const { budget, setSpent } = setup({ g: ['a'], h: ['a'] });
    // As one of two seats, x's share is 0.5.
    expect(budget.allow('g', 'x', 0.6)).toEqual(LOCKS);
    // x's own spend is on the table: 0.9 + 0.1 + 0.05 passes the game budget.
    setSpent('h', 'a', 0.9);
    setSpent('h', 'x', 0.1);
    expect(budget.allow('h', 'x', 0.05)).toEqual(LOCKS);
  });
});

let dir: string;

/**
 * S-B1's measured means per call (apps/server/data/social-spike-ledger-2026-10-29.jsonl, 29 Oct), by model: the folded
 * strategy call that carries the social reasoning, and the small reply call. The month's other write, the auction's
 * playbook, has no measure of its own there; it is billed as the small call.
 */
const MEASURED = {
  'claude-sonnet-5-5': { folded: { input: 1_258, cached_read: 1_352, cache_write: 1_352, output: 693 }, small: { input: 602, output: 115 } },
  'claude-haiku-5-5': { folded: { input: 1_289, cached_read: 1_803, cache_write: 901, output: 1_068 }, small: { input: 602, output: 297 } },
} as const;
const MONTHS = 12;
const SONNET = 'claude-sonnet-5-5';
const HAIKU = 'claude-haiku-5-5';

/** Long enough for a played game on the fake clock, many times over. */
const GAME_MS = 120_000;

/** Advances the engine state phase by phase until `phase` opens, or the game is over. */
const advanceTo = (state: GameState, phase: GameState['phase']) => {
  while (state.phase !== phase && state.phase !== 'gameOver') advancePhase(state);
};

/** A fake model billing each call at MEASURED for the model it names: a social land write as folded, any other as small. */
const billing = () =>
  fakeSdk((_n, params: SdkParams) => {
    const model = params.model as keyof typeof MEASURED;
    const social = 'messages' in ((params.output_config?.format?.schema as { properties?: object } | undefined)?.properties ?? {});
    const text = social ? JSON.stringify({ edits: [], line: '', messages: [] }) : JSON.stringify({ edits: [], line: '' });
    return sdkMessage(text, MEASURED[model][social ? 'folded' : 'small']);
  });

/**
 * `seats` Smart seats play `MONTHS` months of asks as the game makes them: the land write at the start and at each
 * upkeep, the auction's in production. Returns each call's ledger line, in order.
 */
async function table(seats: number) {
  const sdk = billing();
  const logPath = path.join(dir, `costs-${seats}.jsonl`);
  const brain = createBrain({ gameId: `g-${seats}`, env: KEY, logPath, sdkFactory: () => sdk });
  const players = Array.from({ length: seats }, (_, i) => ({ id: `ai${i}`, name: `AI ${i}`, isAi: true }));
  const state = createGame({ seed: 4, players, maxMonths: MONTHS, politics: true });
  const ais = players.map((p, i) => new AiSeat({ id: p.id, name: p.name, persona: 'trader', level: 'trader', seed: i + 1 }));
  const playbooks = new Playbooks({ brain, source: playbookSource(ais), seats: ais, say: () => {} });
  // The fake answers at once; a step of the clock lets every open write settle.
  const settle = () => vi.advanceTimersByTimeAsync(1_000);
  playbooks.ask(state, 1);
  for (let month = 1; month <= MONTHS; month++) {
    await settle();
    advanceTo(state, 'landGrant');
    playbooks.takeEffect(state);
    advanceTo(state, 'production');
    playbooks.askPhase(state, 'auction', []);
    await settle();
    advanceTo(state, 'auction');
    playbooks.takePhase(state, 'auction');
    advanceTo(state, 'upkeep');
    playbooks.ask(state, month + 1);
    if (month < MONTHS) advanceTo(state, 'planning');
  }
  await settle();
  brain.finish();
  const calls = readLedger(logPath).filter((l) => l.type === undefined && l.outcome !== 'budget');
  return { calls, total: calls.reduce((sum, l) => sum + (l.usd as number), 0), counted: brain.countedUsd() };
}

describe('T-AC-B4: the 5-seat budget (spec B RULE-B5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-budget-social-'));
  });
  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('T-AC-B4: 5 Smart seats, a fake model billing at S-B1\'s option-(1) prices for 12 months: the total stays at or below BRAIN.gameBudgetUsd; Sonnet early, Haiku late', async () => {
    const { calls, total, counted } = await table(5);
    // Every seat reasoned every month, and nothing was refused for want of a model.
    const strategy = calls.filter((l) => l.kind === 'strategy');
    expect(strategy).toHaveLength(5 * MONTHS);
    expect(total).toBeLessThanOrEqual(BRAIN.gameBudgetUsd);
    expect(counted).toBeLessThanOrEqual(BRAIN.gameBudgetUsd);
    // Sonnet early, Haiku late: each seat's first land write is Sonnet's, its last Haiku's.
    for (let i = 0; i < 5; i++) {
      const own = strategy.filter((l) => l.seat === `ai${i}`);
      expect(own[0]!.model, `ai${i}'s first`).toBe(SONNET);
      expect(own.at(-1)!.model, `ai${i}'s last`).toBe(HAIKU);
      // Once a seat falls back to Haiku it stays there: the share only shrinks.
      const first = own.findIndex((l) => l.model === HAIKU);
      expect(own.slice(first).every((l) => l.model === HAIKU)).toBe(true);
    }
  }, GAME_MS);

  it('T-AC-B4: the same at 4 seats: every land write, the monthly social reasoning, is Sonnet', async () => {
    const { calls, total } = await table(4);
    const strategy = calls.filter((l) => l.kind === 'strategy');
    expect(strategy).toHaveLength(4 * MONTHS);
    expect(strategy.map((l) => l.model)).toEqual(strategy.map(() => SONNET));
    expect(total).toBeLessThanOrEqual(BRAIN.gameBudgetUsd);
    for (let i = 0; i < 4; i++) {
      const auction = calls.filter((l) => l.kind === 'playbook' && l.seat === `ai${i}`);
      expect(auction).toHaveLength(MONTHS);
      expect(auction.slice(0, -1).every((l) => l.model === SONNET)).toBe(true);
      // RULE-A5's worst-case margin keeps the seat's share: Sonnet's worst case for the last auction write no longer fits.
      expect(auction.at(-1)!.model).toBe(HAIKU);
    }
  }, GAME_MS);
});
