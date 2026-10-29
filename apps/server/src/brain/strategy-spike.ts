/**
 * Spike S-A1 (WS2 spec A §7): Haiku 5.5 with adaptive thinking against Sonnet 5.5, writing a seat's strategy from
 * briefs taken at the start of planning in one strategist game.
 * Usage: pnpm --filter @mule/server brain:strategy-spike -- --briefs 20 --sonnet 4 --max-usd 0.10 --seed 101
 * Spends real money; cap = min(--max-usd, BRAIN.strategySpike.capUsd); one paid run per UTC day.
 * Without the key it calls nothing: it builds the briefs and prints their sizes.
 */
import fs from 'node:fs';
import {
  AI_LEVELS,
  allPrices,
  BRAIN,
  GAME,
  GOODS,
  observe,
  PHASES,
  POLITICS,
  POLLUTION,
  PROCESSED_GOODS,
  RAW_GOODS,
  score,
  UPKEEP,
  type AiLevelId,
  type AiPersonaId,
  type Good,
  type GameState,
} from '@mule/engine';
import { CAUSES, GOOD_NAME, landDecision, OPTION_IDS, PERSONAS, playGame, simSeats, situation, toOptions, type Cause, type Mind, type ShortOption } from '@mule/ai';
import { alreadyRanToday, AUTH_STOPPED, claimLedger, day, dayLedgerPath, nearest, numberFlags, resolveDeps, runAsScript, table, type MainDeps, type StopReason } from './cli.js';
import { billUnknown, CallFailed, createAnthropicSdk, createThinkingComplete, type HaikuSdk, type ThinkingCall, type ThinkingReply } from './client.js';
import { API_KEY_ENV, apiKeyFrom } from './index.js';
import { NO_USAGE, type Usage } from './ledger.js';

const S = BRAIN.strategySpike;
const PER_MILLION = 1_000_000;

export type ModelRole = keyof typeof S.models;
const ROLES: readonly ModelRole[] = ['haiku', 'sonnet'];

/** The strategy kinds a seat may play to. */
export const STRATEGY_KINDS = ['builder', 'specialist', 'monopolist', 'landBaron', 'politician', 'spoiler'] as const;
export type StrategyKind = (typeof STRATEGY_KINDS)[number];

/**
 * The table this spike plays: one Rookie seat, so the corners bound (AI_LEVELS[level].corners false) is exercised, and
 * the other levels beside it. Personas rotate by seat and seed as in simSeats.
 */
export const LEVEL_MIX: readonly AiLevelId[] = ['trader', 'tycoon', 'trader', 'rookie'];

const goodOrNull = { anyOf: [{ type: 'string', enum: [...GOODS] }, { type: 'null' }] };

/**
 * The reply's JSON schema: the same for every brief, so the request stays byte-stable. planPick is any option letter;
 * judgeReply checks it names one of the brief's own plans, and checks the reason's length (structured outputs take no
 * string-length constraint).
 */
export const STRATEGY_SCHEMA = {
  type: 'object',
  properties: {
    strategy: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: [...STRATEGY_KINDS] },
        moneyMaker: goodOrNull,
        monopolyTarget: goodOrNull,
        cashFloor: { type: 'integer' },
        reason: { type: 'string' },
      },
      required: ['kind', 'moneyMaker', 'monopolyTarget', 'cashFloor', 'reason'],
      additionalProperties: false,
    },
    planPick: { type: 'string', enum: [...OPTION_IDS] },
    line: { type: 'string' },
  },
  required: ['strategy', 'planPick', 'line'],
  additionalProperties: false,
} as const;

/** A spike prompt: system and user text and the reply's JSON schema. */
export interface SpikePrompt {
  system: string;
  user: string;
  schema: object;
}

export interface StrategyPrompt extends SpikePrompt {
  /** The rules primer: identical for every brief, so the API can cache it. */
  system: string;
  schema: typeof STRATEGY_SCHEMA;
}

/** One seat at the start of one month's planning, as a prompt, with what is needed to judge its reply. */
export interface Brief {
  /** Position in the run: the first --sonnet briefs are the pairs. */
  index: number;
  seat: string;
  name: string;
  persona: AiPersonaId;
  level: AiLevelId;
  /** AI_LEVELS[level].corners: whether the seat may aim to corner a good. */
  corners: boolean;
  month: number;
  /** The seat's money when it planned: cashFloor's upper bound. */
  money: number;
  /** The engine's land plans for the month, best first, as ids A–E. */
  plans: ShortOption[];
  prompt: StrategyPrompt;
}

const names = (goods: readonly Good[]) => goods.map((g) => GOOD_NAME[g]).join(', ');
const pctOf = (share: number) => `${Math.round(share * 100)}%`; // literal-ok: a share as a whole percentage

/**
 * A stand-in for the generated manual (spec A C8): the phases as llm/prompt.ts's PRIMER gives them, how the game is
 * won as engine/src/game.ts::scoreParts computes it, and what the strategy fields mean.
 */
export const STRATEGY_SYSTEM = `You play one seat in a colony trading game in the spirit of M.U.L.E.: a few players share a young colony and each tries to end with the highest score. You write your seat's strategy for the rest of the game, in character.

How a month goes:
- Planning. Everyone looks at the colony's stores, prices and plots, and decides what to aim for. This is when you write your strategy.
- Land grant. Free plots are handed out. Each player may claim up to ${GAME.claimsPerGrant} plots per grant, and the choice matters: ground differs in what it produces well, and a plot next to your others can be worth more.
- Development. You may outfit a plot with a MULE, a working machine the store builds from ${GOOD_NAME.smithore}, set to produce one raw good: ${names(RAW_GOODS)}. A plot without a MULE produces nothing. A MULE costs money and the wrong kind wastes it. Factories make the processed goods (${names(PROCESSED_GOODS)}); they are fitted at the works counter and use inputs from your stock.
- Production. Plots and factories produce, and goods that are short hurt the player who runs out.
- The auction. Players buy and sell goods with each other, and the store trades there too. Buyers bid up, sellers ask down, and a trade happens when they meet. Cheap goods bought now and sold when dear are how a trader earns; a scarce good can be cornered. Goods spoil and storage is limited, so hoarding has a cost.
- Upkeep. At the end of the month each player eats ${GOOD_NAME.food} and ${GOOD_NAME.water} from their own stock, goods spoil, and anything above the depot limit of ${UPKEEP.depotCapacity} is lost. If the colony fails, everyone's score suffers.

How the game is won. At the end, the highest score wins. A player's score adds up:
- money on hand;
- every good in stock, valued at the colony's posted price for it that day;
- ${GAME.plotScore} for each plot owned;
- each plot with a MULE installed, valued at the store's MULE price that day.
That sum is rounded. If the colony's air has fallen to Collapse, it is cut to ${pctOf(POLLUTION.collapseScore)} of itself. Then ${POLITICS.termScore} points are added for each term served in office, which Collapse does not cut.

Your strategy. You choose:
- kind: the plan you play to. builder: develop many plots and grow steady production. specialist: concentrate on one good, your moneyMaker, and sell it. monopolist: corner one good, your monopolyTarget, so others must buy it from you. landBaron: gather plots, since each one counts toward the score. politician: win office, since each term adds points. spoiler: hold the leader back.
- moneyMaker: the good you mean to earn most from, or null.
- monopolyTarget: the good you mean to corner, or null. Only a monopolist names one, and only a seat whose level may corner.
- cashFloor: credits you keep back and do not spend below, a whole number from 0 to the money you have.
- reason: why, in at most ${BRAIN.writeReasonChars} characters.
You also pick one of this month's land plans by its letter (planPick); the engine ranked them, best first, and the ranking is a guide you may depart from when your strategy calls for it. Never name a plan that is not in the list. And you may say one short sentence at the table (line), at most ${BRAIN.maxLineChars} characters, in the character's voice, or leave it empty. Keep it family-friendly.

Reply with JSON only, in the shape the schema gives.`;

/** The strategy prompt's user text for a seat's brief, from its view and situation summary. */
export function strategyUserText(b: Omit<Brief, 'prompt' | 'index'>, view: GameState, summary: string): string {
  const prices = allPrices(view);
  const bound = b.corners
    ? 'Your level may aim to corner a good.'
    : 'Your level never aims for a monopoly: leave monopolyTarget null and never choose monopolist.';
  return [
    `You are ${b.name}. Month ${b.month} of ${view.maxMonths}, start of planning.`,
    `Your character: ${PERSONAS[b.persona].card}`,
    `Your level: ${b.level}. ${bound}`,
    '',
    summary,
    '',
    `Colony prices: ${GOODS.map((g) => `${GOOD_NAME[g]} ${prices[g]}`).join(', ')}.`,
    '',
    'Land plans for this month, best first:',
    // literal-ok: each plan's score to two decimals, as llm/prompt.ts shows options
    ...b.plans.map((p) => `${p.id}. ${p.label} — ${p.rationale} (score ${p.utility.toFixed(2)})`),
    '',
    'Write your strategy, pick one land plan and reply with the JSON.',
  ].join('\n');
}

interface Point {
  seat: string;
  month: number;
  view: GameState;
  worth: Record<string, number>;
}

/** A brief with what it was built from: the seat's view, its mind, and every player's public worth at that moment. */
export interface BriefPoint {
  brief: Brief;
  view: GameState;
  mind: Mind;
  worth: Record<string, number>;
}

/** The order to take `n` of `len` items evenly spread, as indexes. */
const spread = (len: number, n: number): number[] => Array.from({ length: Math.min(n, len) }, (_, k) => Math.floor((k * len) / Math.min(n, len)));

/**
 * Briefs from one strategist game: each seat at the start of each month's planning (its view when it planned, after
 * any election), taken evenly over the game's months and seats, only where the engine has at least two land plans.
 * A Rookie point replaces the last pick when none was taken. The pair briefs come first, spread over the game and,
 * as far as they go, one per seat.
 */
export function collectBriefs(seed: number, count: number, sonnet: number): Brief[] {
  return collectBriefPoints(seed, count, sonnet).map((p) => p.brief);
}

/** collectBriefs, each brief with its view, mind and the players' public worth. */
export function collectBriefPoints(seed: number, count: number, sonnet: number): BriefPoint[] {
  const personas = simSeats(LEVEL_MIX.length, 'trader', seed).map((s) => s.persona);
  const specs = LEVEL_MIX.map((level, i) => ({ level, persona: personas[i]! }));
  const points: Point[] = [];
  const played = playGame(seed, specs, {
    onPhase: (state) => {
      // Planning's hands have run: each seat planned its month from exactly this state.
      if (state.phase !== 'planning') return;
      const worth = Object.fromEntries(state.players.map((p) => [p.id, score(state, p.id)]));
      for (const p of state.players) points.push({ seat: p.id, month: state.month, view: observe(state, p.id), worth });
    },
  });
  const minds = new Map(played.seats.map((s) => [s.id, s.mind]));
  const ready = points
    .map((pt) => ({ pt, plans: toOptions(landDecision(pt.view, minds.get(pt.seat)!)) }))
    .filter((c) => c.plans.length >= 2);

  const picked = spread(ready.length, count).map((i) => ready[i]!);
  const isRookie = (c: (typeof ready)[number]) => !minds.get(c.pt.seat)!.level.corners;
  if (picked.length > 0 && !picked.some(isRookie)) {
    const rookie = ready.find(isRookie);
    if (rookie) picked[picked.length - 1] = rookie;
  }
  // Each pair is the first brief at or after its even spot whose seat no pair has yet, so the pairs cover the seats too.
  const pairs: number[] = [];
  for (const target of spread(picked.length, sonnet)) {
    const from = picked.map((_, d) => (target + d) % picked.length).filter((i) => !pairs.includes(i));
    const seats = new Set(pairs.map((i) => picked[i]!.pt.seat));
    pairs.push(from.find((i) => !seats.has(picked[i]!.pt.seat)) ?? from[0]!);
  }
  const ordered = [...pairs.map((i) => picked[i]!), ...picked.filter((_, i) => !pairs.includes(i))];

  return ordered.map(({ pt, plans }, index) => {
    const mind = minds.get(pt.seat)!;
    const me = pt.view.players.find((p) => p.id === pt.seat)!;
    const level = mind.levelId as AiLevelId;
    const base = {
      seat: pt.seat,
      name: me.name,
      persona: mind.personaId as AiPersonaId,
      level,
      corners: AI_LEVELS[level].corners,
      month: pt.month,
      money: me.money,
      plans,
    };
    const brief = { index, ...base, prompt: { system: STRATEGY_SYSTEM, user: strategyUserText(base, pt.view, situation(pt.view, mind)), schema: STRATEGY_SCHEMA } };
    return { brief, view: pt.view, mind, worth: pt.worth };
  });
}

/** Characters the model reads for a prompt: system, user and the schema's JSON. */
export const briefChars = (p: SpikePrompt): number => p.system.length + p.user.length + JSON.stringify(p.schema).length;

const pricesOf = (role: ModelRole) => (role === 'haiku' ? BRAIN.pricesPerMTok : BRAIN.sonnetPricesPerMTok);

/** Dollars for one call's usage at its model's prices. */
export function usdAt(role: ModelRole, u: Usage): number {
  const p = pricesOf(role);
  return (u.input * p.input + u.cached_read * p.cacheRead + u.cache_write * p.cacheWrite + u.output * p.output) / PER_MILLION;
}

/**
 * The most a call can cost: the whole prompt at BRAIN.charsPerToken, priced at the dearer of input and cache write
 * (the first call of a model writes the cache), and a full reply of maxTokens at the output price.
 */
export function worstCaseUsd(role: ModelRole, prompt: SpikePrompt, maxTokens: number = S.maxTokens): number {
  const p = pricesOf(role);
  const tokens = Math.ceil(briefChars(prompt) / BRAIN.charsPerToken);
  return (tokens * Math.max(p.input, p.cacheWrite) + maxTokens * p.output) / PER_MILLION;
}

/** A flag may lower the cap below the ceiling, never raise it. An unusable flag gives 0, so nothing is called. */
export function capFor(flagMaxUsd: number, ceilingUsd: number = S.capUsd): number {
  return Number.isFinite(flagMaxUsd) && flagMaxUsd > 0 ? Math.min(flagMaxUsd, ceilingUsd) : 0;
}

export type StrategyReply = ThinkingReply;

export type StrategyComplete = (role: ModelRole, prompt: StrategyPrompt) => Promise<StrategyReply>;

/** What one spike call asks of the API besides the prompt: the client's thinking-call settings. */
export type SpikeCallSettings = ThinkingCall;

export type SpikeCall = (prompt: SpikePrompt, settings: SpikeCallSettings) => Promise<StrategyReply>;

/** The client's thinking port, at the settings each call names: one try, no retries, never past its timeout. */
export function createSpikeCall(sdk: HaikuSdk, now?: () => number): SpikeCall {
  const think = createThinkingComplete(sdk, now);
  return (prompt, settings) => think(settings, prompt);
}

/** The strategy port: createSpikeCall at BRAIN.strategySpike's model, effort, reply cap and timeout. */
export function createStrategyComplete(sdk: HaikuSdk, now: () => number = () => performance.now()): StrategyComplete {
  const call = createSpikeCall(sdk, now);
  return (role, prompt) => call(prompt, { model: S.models[role], effort: S.effort, maxTokens: S.maxTokens, timeoutMs: S.timeoutMs });
}

export interface Verdict {
  /** The reply parses, has every field in the schema's shape, a reason within BRAIN.writeReasonChars and a plan from the brief. */
  valid: boolean;
  /** Valid, and within the seat's bounds: cashFloor 0…money, goods known or null, and no monopoly for a seat that never corners. */
  within: boolean;
  planPick: string | null;
  kind: StrategyKind | null;
  /** Why an invalid reply is invalid, the first check it fails; null when valid. A code only, never reply text. */
  cause: Cause | null;
  /** Which bound a valid reply breaks, cash_floor first when it breaks both; null when within or invalid. */
  bound: Bound | null;
}

/** Why a reply is invalid: the writer's cause codes, one list, so the spike and the writer count the same things. */
export type { Cause };

export const BOUNDS = ['cash_floor', 'corners'] as const;
export type Bound = (typeof BOUNDS)[number];

const invalid = (cause: Cause): Verdict => ({ valid: false, within: false, planPick: null, kind: null, cause, bound: null });
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const exactKeys = (o: Record<string, unknown>, keys: readonly string[]) => Object.keys(o).length === keys.length && keys.every((k) => k in o);
const isGoodOrNull = (x: unknown): x is Good | null => x === null || (GOODS as readonly unknown[]).includes(x);

/**
 * Judges a reply against its brief: valid or the first cause it fails, and for a valid one the bound it breaks.
 * Quality here is only this, and agreement with Sonnet: no validator exists yet.
 */
export function judgeReply(brief: Brief, text: string, stopReason: StrategyReply['stopReason'] = 'end_turn'): Verdict {
  if (stopReason === 'refusal') return invalid('refused');
  if (stopReason === 'max_tokens') return invalid('cut_off');
  let reply: unknown;
  try {
    reply = JSON.parse(text);
  } catch {
    return invalid('not_json');
  }
  if (!isObject(reply) || !exactKeys(reply, STRATEGY_SCHEMA.required)) return invalid('bad_shape');
  const { strategy: st, planPick, line } = reply;
  if (!isObject(st) || !exactKeys(st, STRATEGY_SCHEMA.properties.strategy.required)) return invalid('bad_shape');
  const { kind, moneyMaker, monopolyTarget, cashFloor, reason } = st;
  if (!(STRATEGY_KINDS as readonly unknown[]).includes(kind)) return invalid('bad_kind');
  if (!isGoodOrNull(moneyMaker) || !isGoodOrNull(monopolyTarget)) return invalid('bad_good');
  if (!Number.isInteger(cashFloor)) return invalid('bad_cash_floor');
  if (typeof reason !== 'string') return invalid('bad_shape');
  if ([...reason].length > BRAIN.writeReasonChars) return invalid('reason_too_long');
  if (typeof planPick !== 'string' || !brief.plans.some((p) => p.id === planPick)) return invalid('plan_not_offered');
  if (typeof line !== 'string') return invalid('bad_line');
  const floor = cashFloor as number;
  const cornered = !brief.corners && (monopolyTarget !== null || kind === 'monopolist');
  const bound: Bound | null = floor < 0 || floor > brief.money ? 'cash_floor' : cornered ? 'corners' : null;
  return { valid: true, within: bound === null, planPick, kind: kind as StrategyKind, cause: null, bound };
}

/** The calls in order: each of the first `sonnet` briefs Haiku then Sonnet, so the cap cannot starve the pairs; then Haiku alone. */
export function callOrder(briefs: readonly Brief[], sonnet: number): { role: ModelRole; brief: Brief }[] {
  return briefs.flatMap((brief, i) => (i < sonnet ? [{ role: 'haiku' as const, brief }, { role: 'sonnet' as const, brief }] : [{ role: 'haiku' as const, brief }]));
}

export type StrategyOutcome = 'valid' | 'invalid' | 'refused' | 'timeout' | 'error';

/** A call's line in the ledger file. */
export interface StrategyLine extends Usage {
  t: string;
  model: string;
  kind: 'strategy';
  brief: number;
  seat: string;
  level: AiLevelId;
  persona: AiPersonaId;
  month: number;
  thinking: number | null;
  usd: number;
  ms: number;
  outcome: StrategyOutcome;
  /** An answered, invalid reply's cause; null when valid, timed out or failed. */
  cause: Cause | null;
  /** A valid reply's broken bound; null otherwise. */
  bound: Bound | null;
}

/** One settled call, as the report needs it. */
export interface SettledCall {
  role: ModelRole;
  brief: number;
  outcome: StrategyOutcome;
  ms: number;
  usd: number;
  output: number;
  thinking: number | null;
  /** Null when no reply came back (timeout, error). */
  verdict: Verdict | null;
}

export interface ModelRow {
  role: ModelRole;
  model: string;
  calls: number;
  /** Calls that brought a reply back, valid or not, refusals included. */
  answered: number;
  timeouts: number;
  errors: number;
  /** Over answered calls; null when none was answered. */
  p50: number | null;
  p90: number | null;
  max: number | null;
  /** Shares of answered calls; null when none was answered. */
  valid: number | null;
  within: number | null;
  meanOutput: number | null;
  /** Over answered calls whose response carried thinking tokens. */
  meanThinking: number | null;
  /** Ledger dollars. */
  usd: number;
  /** Ledger dollars per answered call. */
  usdPerCall: number | null;
  /** usdPerCall × S.callsPerSeatGame. */
  seatGameUsd: number | null;
  /** Answered calls per invalid cause. */
  causes: Record<Cause, number>;
  /** Valid answered calls per broken bound. */
  bounds: Record<Bound, number>;
}

export interface StrategyReport {
  planned: number;
  made: number;
  stopped: StopReason;
  cap: number;
  /** Dollars the ledger charged. */
  ledgerUsd: number;
  /** Ledger dollars plus each call whose bill is unknown at its worst case: what the cap is checked against. */
  countedUsd: number;
  models: ModelRow[];
  /** Briefs where both models gave a valid reply, and on how many of them they agreed. */
  pairs: { briefs: number; planPick: number; kind: number };
  calls: SettledCall[];
}

export interface RunOptions {
  briefs: Brief[];
  /** How many of the first briefs Sonnet also answers. */
  sonnet: number;
  complete: StrategyComplete;
  /** Appends one ledger line; a throw stops the run. */
  write: (line: StrategyLine) => void;
  /** Dollars; trusted only up to S.capUsd. */
  cap: number;
  /** Called once, just before the first call starts; a run that calls nothing never calls it. */
  claim?: () => void;
  now: () => Date;
  log: (line: string) => void;
}

const ascending = (a: number, b: number) => a - b;
const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const isAnswered = (c: SettledCall) => c.outcome !== 'timeout' && c.outcome !== 'error';

function modelRow(role: ModelRole, calls: SettledCall[]): ModelRow {
  const answered = calls.filter(isAnswered);
  const ms = answered.map((c) => c.ms).sort(ascending);
  const share = (n: number) => (answered.length === 0 ? null : n / answered.length);
  const usd = calls.reduce((s, c) => s + c.usd, 0);
  const perCall = mean(answered.map((c) => c.usd));
  return {
    role,
    model: S.models[role],
    calls: calls.length,
    answered: answered.length,
    timeouts: calls.filter((c) => c.outcome === 'timeout').length,
    errors: calls.filter((c) => c.outcome === 'error').length,
    p50: ms.length === 0 ? null : nearest(ms, 0.5),
    p90: ms.length === 0 ? null : nearest(ms, 0.9),
    max: ms.length === 0 ? null : ms[ms.length - 1]!,
    valid: share(answered.filter((c) => c.verdict?.valid).length),
    within: share(answered.filter((c) => c.verdict?.within).length),
    meanOutput: mean(answered.map((c) => c.output)),
    meanThinking: mean(answered.flatMap((c) => (c.thinking === null ? [] : [c.thinking]))),
    usd,
    usdPerCall: perCall,
    seatGameUsd: perCall === null ? null : perCall * S.callsPerSeatGame,
    causes: Object.fromEntries(CAUSES.map((k) => [k, calls.filter((c) => c.verdict?.cause === k).length])) as Record<Cause, number>,
    bounds: Object.fromEntries(BOUNDS.map((k) => [k, calls.filter((c) => c.verdict?.bound === k).length])) as Record<Bound, number>,
  };
}

function pairsOf(calls: SettledCall[]): StrategyReport['pairs'] {
  const valid = (role: ModelRole) => new Map(calls.flatMap((c) => (c.role === role && c.verdict?.valid ? [[c.brief, c.verdict] as const] : [])));
  const haiku = valid('haiku');
  const both = [...valid('sonnet')].flatMap(([brief, s]) => (haiku.has(brief) ? [[haiku.get(brief)!, s] as const] : []));
  return { briefs: both.length, planPick: both.filter(([h, s]) => h.planPick === s.planPick).length, kind: both.filter(([h, s]) => h.kind === s.kind).length };
}

/** Sends the calls one at a time and never starts one that could take the counted spend past the cap. */
export async function runStrategySpike(options: RunOptions): Promise<StrategyReport> {
  const { complete, write, now, log } = options;
  const cap = Math.min(options.cap, S.capUsd);
  const order = callOrder(options.briefs, options.sonnet);
  let ledgerUsd = 0;
  let unknownUsd = 0;
  let stopped: StopReason = 'done';
  const calls: SettledCall[] = [];

  for (const { role, brief } of order) {
    const worst = worstCaseUsd(role, brief.prompt);
    // Written as !(<=) so a NaN refuses instead of slipping through.
    if (!(ledgerUsd + unknownUsd + worst <= cap)) {
      stopped = 'cap';
      break;
    }
    if (calls.length === 0) options.claim?.();
    let reply: StrategyReply | null = null;
    let failure: unknown;
    try {
      reply = await complete(role, brief.prompt);
    } catch (e) {
      // Anything but a CallFailed is counted as an error, and its text is dropped.
      failure = e ?? new Error('unknown error');
    }
    const failed = failure instanceof CallFailed ? failure : null;
    const verdict = reply ? judgeReply(brief, reply.text, reply.stopReason) : null;
    const outcome: StrategyOutcome = verdict
      ? verdict.cause === 'refused'
        ? 'refused'
        : verdict.valid
          ? 'valid'
          : 'invalid'
      : (failed?.outcome ?? 'error');
    const usage = reply?.usage ?? NO_USAGE;
    const usd = usdAt(role, usage);
    const ms = reply?.ms ?? failed?.ms ?? 0;
    const thinking = reply?.thinking ?? null;
    write({
      t: now().toISOString(),
      model: S.models[role],
      kind: 'strategy',
      brief: brief.index,
      seat: brief.seat,
      level: brief.level,
      persona: brief.persona,
      month: brief.month,
      ...usage,
      thinking,
      usd,
      ms,
      outcome,
      cause: verdict?.cause ?? null,
      bound: verdict?.bound ?? null,
    });
    calls.push({ role, brief: brief.index, outcome, ms, usd, output: usage.output, thinking, verdict });
    ledgerUsd += usd;
    if (billUnknown(reply, failure)) unknownUsd += worst;
    log(`call ${calls.length}/${order.length} ${S.models[role]} brief ${brief.index} ${outcome} ${Math.round(ms)} ms, counted $${(ledgerUsd + unknownUsd).toFixed(5)}`);
    if (failed?.auth) {
      stopped = 'auth';
      break;
    }
  }

  return {
    planned: order.length,
    made: calls.length,
    stopped,
    cap,
    ledgerUsd,
    countedUsd: ledgerUsd + unknownUsd,
    models: ROLES.map((role) => modelRow(role, calls.filter((c) => c.role === role))),
    pairs: pairsOf(calls),
    calls,
  };
}

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(0)}%`);
const msText = (x: number | null) => (x === null ? '—' : `${Math.round(x)} ms`);
const usdText = (x: number | null) => (x === null ? '—' : `$${x.toFixed(5)}`);
const tokText = (x: number | null) => (x === null ? '—' : x.toFixed(0));

/** The report: totals, a row per model, pair agreement, the upkeep verdict and what quality means here. */
export function renderReport(r: StrategyReport): string[] {
  const totals = table([
    ['calls made / planned', `${r.made} / ${r.planned}`],
    ['stopped because', r.stopped],
    ['ledger spend', `$${r.ledgerUsd.toFixed(5)}`],
    [`counted spend (cap $${r.cap.toFixed(2)})`, `$${r.countedUsd.toFixed(5)}`],
  ]);
  const rows = table([
    ['model', 'calls', 'answered', 'timeouts', 'errors', 'p50', 'p90', 'max', 'valid', 'within bounds', 'mean output tok', 'mean thinking tok', 'ledger usd', 'usd per call', `usd per seat-game (x${S.callsPerSeatGame})`],
    ...r.models.map((m) => [
      m.model,
      String(m.calls),
      String(m.answered),
      String(m.timeouts),
      String(m.errors),
      msText(m.p50),
      msText(m.p90),
      msText(m.max),
      pct(m.valid),
      pct(m.within),
      tokText(m.meanOutput),
      tokText(m.meanThinking),
      `$${m.usd.toFixed(5)}`,
      usdText(m.usdPerCall),
      usdText(m.seatGameUsd),
    ]),
  ]);
  const causes = table([
    ['invalid cause', ...r.models.map((m) => m.model)],
    ...CAUSES.map((k) => [k, ...r.models.map((m) => String(m.causes[k]))]),
    ...BOUNDS.map((k) => [`out of bounds: ${k}`, ...r.models.map((m) => String(m.bounds[k]))]),
  ]);
  const pairs = table([
    ['briefs with both models valid', String(r.pairs.briefs)],
    ['plan pick agreement', `${r.pairs.planPick} of ${r.pairs.briefs}`],
    ['strategy kind agreement', `${r.pairs.kind} of ${r.pairs.briefs}`],
  ]);
  const verdicts = r.models.map((m) => {
    const timeouts = m.timeouts === 0 ? '' : `; ${m.timeouts} timed out at ${S.timeoutMs} ms and are not in it`;
    const window = PHASES.upkeepMs;
    if (m.p90 === null) return `${m.model}: no answered calls, so no p90${timeouts}.`;
    // The month end has no clock when PHASES.upkeepMs is null: then there is no window to judge the p90 against.
    if (window === null) return `${m.model}: p90 ${Math.round(m.p90)} ms; the month end has no clock to judge it against${timeouts}.`;
    return `${m.model}: p90 ${Math.round(m.p90)} ms is ${m.p90 < window ? 'under' : 'over'} the ${window} ms upkeep window${timeouts}.`;
  });
  return [
    ...totals,
    '',
    ...rows,
    '',
    ...causes,
    '',
    ...pairs,
    '',
    ...verdicts,
    '',
    'Quality here means valid, within bounds and agreeing with Sonnet: no validator exists yet, so nothing checks whether a strategy is good.',
  ];
}

/** Brief sizes, the worst case per call per model, and how many of the planned calls fit under the cap at worst case. */
export function renderSizes(briefs: readonly Brief[], sonnet: number, cap: number): string[] {
  if (briefs.length === 0) return ['briefs  0'];
  const chars = briefs.map((b) => briefChars(b.prompt)).sort(ascending);
  const users = briefs.map((b) => b.prompt.user.length).sort(ascending);
  const tokens = (c: number) => Math.ceil(c / BRAIN.charsPerToken);
  const largest = briefs.reduce((a, b) => (briefChars(b.prompt) > briefChars(a.prompt) ? b : a));
  let fit = 0;
  let sum = 0;
  const order = callOrder(briefs, sonnet);
  for (const c of order) {
    sum += worstCaseUsd(c.role, c.brief.prompt);
    if (!(sum <= cap)) break;
    fit += 1;
  }
  const levels = [...new Set(briefs.map((b) => b.level))].map((l) => `${l} ${briefs.filter((b) => b.level === l).length}`).join(', ');
  return table([
    ['briefs', `${briefs.length} (${Math.min(sonnet, briefs.length)} with Sonnet)`],
    ['seats / months', `${new Set(briefs.map((b) => b.seat)).size} / ${[...new Set(briefs.map((b) => b.month))].sort(ascending).join(',')}`],
    ['levels', levels],
    ['system chars (same in every brief)', String(briefs[0]!.prompt.system.length)],
    ['user chars min / median / max', `${users[0]} / ${nearest(users, 0.5)} / ${users[users.length - 1]}`],
    ['schema chars', String(JSON.stringify(STRATEGY_SCHEMA).length)],
    ['prompt chars min / median / max', `${chars[0]} / ${nearest(chars, 0.5)} / ${chars[chars.length - 1]}`],
    [`est. tokens at ${BRAIN.charsPerToken} chars each`, `${tokens(chars[0]!)} / ${tokens(nearest(chars, 0.5))} / ${tokens(chars[chars.length - 1]!)}`],
    ['worst case per call, Haiku / Sonnet', `$${worstCaseUsd('haiku', largest.prompt).toFixed(5)} / $${worstCaseUsd('sonnet', largest.prompt).toFixed(5)} (largest brief, ${S.maxTokens} max tokens)`],
    [`planned calls that fit under $${cap.toFixed(2)} at worst case`, `${fit} of ${order.length}`],
  ]);
}

const USAGE = 'Usage: brain:strategy-spike [--briefs N] [--sonnet N] [--seed S] --max-usd X (--max-usd is required with the key); nothing called.';

interface Flags {
  briefs: number;
  sonnet: number;
  maxUsd: number | null;
  seed: number;
}

/** The flags, or null for anything numberFlags refuses or a value out of range. */
function parseFlags(argv: readonly string[]): Flags | null {
  const given = numberFlags(argv, ['--briefs', '--sonnet', '--max-usd', '--seed']);
  if (!given) return null;
  const briefs = given.get('--briefs') ?? 20; // literal-ok: the spike's default brief count (spec A §7)
  const sonnet = given.get('--sonnet') ?? 4; // literal-ok: the spike's default pair count
  const maxUsd = given.get('--max-usd') ?? null;
  const seed = given.get('--seed') ?? 101; // literal-ok: brain:spike's default seed
  const ok = Number.isInteger(briefs) && briefs >= 1 && Number.isInteger(sonnet) && sonnet >= 0 && Number.isInteger(seed) && (maxUsd === null || maxUsd > 0);
  return ok ? { briefs, sonnet, maxUsd, seed } : null;
}

/** Appends JSON lines to a claimed ledger file; throws on a write fault, which stops the run before its next call. */
function jsonlWriter(file: string): (line: StrategyLine) => void {
  return (line) => fs.appendFileSync(file, `${JSON.stringify(line)}\n`);
}

/**
 * Exit code: 0 done, capped, or no key (briefs built, nothing called); 1 nothing called (bad flags, --max-usd missing
 * with the key, or today's run already made); 2 stopped on an auth failure.
 */
export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, deps: MainDeps = {}): Promise<number> {
  const { dataDir, out, now } = resolveDeps(deps);
  const flags = parseFlags(argv);
  if (!flags) {
    out(USAGE);
    return 1;
  }
  const key = apiKeyFrom(env);
  if (!key) {
    out(`${API_KEY_ENV} is not set; nothing called.`);
    const briefs = collectBriefs(flags.seed, flags.briefs, flags.sonnet);
    for (const line of renderSizes(briefs, flags.sonnet, capFor(flags.maxUsd ?? S.capUsd))) out(line);
    return 0;
  }
  if (flags.maxUsd === null) {
    out(USAGE);
    return 1;
  }
  const ledgerPath = dayLedgerPath(dataDir, 'strategy-spike', now());
  const ranToday = alreadyRanToday(ledgerPath, 'brain:strategy-spike');
  if (ranToday) {
    out(ranToday);
    return 1;
  }

  const cap = capFor(flags.maxUsd);
  const briefs = collectBriefs(flags.seed, flags.briefs, flags.sonnet);
  out(
    `brain:strategy-spike ${S.models.haiku} vs ${S.models.sonnet}, adaptive thinking, effort ${S.effort}, cap $${cap.toFixed(2)}, ` +
      `planned ${callOrder(briefs, flags.sonnet).length} calls, ledger ${ledgerPath} (${day(now())})`,
  );
  for (const line of renderSizes(briefs, flags.sonnet, cap)) out(line);

  // The day's clearance is used once, by the run that starts the first call.
  const report = await runStrategySpike({
    briefs,
    sonnet: flags.sonnet,
    complete: createStrategyComplete(createAnthropicSdk(key)),
    write: jsonlWriter(ledgerPath),
    cap,
    claim: () => claimLedger(ledgerPath),
    now,
    log: out,
  });
  for (const line of renderReport(report)) out(line);
  if (report.stopped === 'auth') out(AUTH_STOPPED);
  return report.stopped === 'auth' ? 2 : 0;
}

runAsScript(import.meta.url, 'brain:strategy-spike', main);
