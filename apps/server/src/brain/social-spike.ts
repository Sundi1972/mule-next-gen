/**
 * brain:social-spike: what a seat's social reasoning costs on Haiku 5.5 and Sonnet 5.5, folded into the strategy call,
 * as its own call, and as a reply to one whisper.
 * Usage: pnpm --filter @mule/server brain:social-spike -- --seed 101 --haiku 3 --sonnet 2 --max-usd 0.09 --ledger <path> --replies <path>
 * Spends real money; cap = min(--max-usd, BRAIN.socialSpike.capUsd); one paid run per UTC day. --plan calls nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { allPrices, BRAIN, GOODS, nextElectionMonth, type GameState, type Office, type TaxPromise } from '@mule/engine';
import { GOOD_NAME, PERSONAS, situation } from '@mule/ai';
import { alreadyRanToday, AUTH_STOPPED, claimLedger, day, dayLedgerPath, nearest, numberFlags, resolveDeps, runAsScript, table, type MainDeps, type StopReason } from './cli.js';
import { billUnknown, CallFailed, createAnthropicSdk } from './client.js';
import { API_KEY_ENV, apiKeyFrom } from './index.js';
import { NO_USAGE, type Usage } from './ledger.js';
import {
  briefChars,
  capFor,
  collectBriefPoints,
  createSpikeCall,
  judgeReply,
  STRATEGY_SCHEMA,
  STRATEGY_SYSTEM,
  strategyUserText,
  usdAt,
  worstCaseUsd,
  type Bound,
  type Brief,
  type BriefPoint,
  type Cause,
  type ModelRole,
  type SpikeCall,
  type SpikePrompt,
  type StrategyOutcome,
  type StrategyReply,
  type Verdict,
} from './strategy-spike.js';

const C = BRAIN.socialSpike;
const ROLES: readonly ModelRole[] = ['haiku', 'sonnet'];

export const MODES = ['folded', 'separate', 'reply'] as const;
export type Mode = (typeof MODES)[number];

const STANDINGS = ['friend', 'neutral', 'wary', 'enemy'] as const;
const AIMS = ['goodwill', 'influence', 'ally', 'vote'] as const;
const FACT_KINDS = ['price', 'owner', 'score', 'holding', 'rule'] as const;
const OFFICES = ['governor', 'sheriff'] as const;
/** Most messages a social reply may send at once; structured outputs take no maxItems, so the judge checks it. */
const MAX_MESSAGES = 3; // literal-ok: the spike's message limit, the ask's "up to 3"

const str = { type: 'string' } as const;
const obj = <P extends Record<string, object>>(properties: P) => ({ type: 'object', properties, required: Object.keys(properties) as (keyof P & string)[], additionalProperties: false }) as const;
const FACT = obj({ kind: { type: 'string', enum: [...FACT_KINDS] }, subject: str, value: str });
const SOCIAL_PROPERTIES = {
  relationships: { type: 'array', items: obj({ player: str, standing: { type: 'string', enum: [...STANDINGS] }, why: str }) },
  aims: { type: 'array', items: obj({ player: str, aim: { type: 'string', enum: [...AIMS] }, ask: str, why: str }) },
  messages: { type: 'array', items: obj({ to: str, purpose: str, text: str, facts: { type: 'array', items: FACT } }) },
  campaign: obj({ office: { anyOf: [{ type: 'string', enum: [...OFFICES] }, { type: 'null' }] }, line: { anyOf: [str, { type: 'null' }] } }),
} as const;

/** The separate call's schema: social fields only. */
export const SOCIAL_SCHEMA = obj(SOCIAL_PROPERTIES);
/** The folded call's schema: the strategy schema's fields, then the social ones. */
export const FOLDED_SCHEMA = obj({ ...STRATEGY_SCHEMA.properties, ...SOCIAL_PROPERTIES });
/** The reply to a whisper: one line and the game facts it states. */
export const REPLY_SCHEMA = obj({ text: str, facts: { type: 'array', items: FACT } });

export const ASK = 'Decide where you stand with each player and why, what you want from each and how you will win them, and up to 3 messages to send now (to a player or the table). If you will run for office, your campaign line.';

const SOCIAL_RULES = `Each message is at most ${BRAIN.maxLineChars} characters, in your character's voice and family-friendly. You may bluff about your own intentions, never about a game fact or rule; list every game fact a message states in its facts.`;

const SEPARATE_SYSTEM = `You play one seat in a colony trading game in the spirit of M.U.L.E., in character. Relationships and allies are how you win: goodwill and influence get you trades and votes, allies carry your policy, and office adds to your score. You may bluff about your own intentions but never state a false game fact or rule. Declare every game fact you state in the message's facts. Reply with JSON only, in the shape the schema gives.`;

const REPLY_SYSTEM = `You play one seat in a colony trading game, in character. Another player has whispered to you; answer with one line of at most ${BRAIN.maxLineChars} characters, family-friendly. You may bluff about your own intentions but never state a false game fact or rule. Declare every game fact you state in facts. Reply with JSON only, in the shape the schema gives.`;

/** What each seat knows of the others, keyed by how many seats after it they sit (1 = the next seat). */
const RELATIONS: readonly (readonly string[])[] = [
  [`bought 3 ${GOOD_NAME.food} from you at 28 at an auction`, 'took the plot next to yours'],
  ['promised in chat to vote for you', `outbid you for a ${GOOD_NAME.smithore} lot`, `sold you ${GOOD_NAME.energy} below the store's price`],
  [`said at the table that you hoard ${GOOD_NAME.food}`, 'asked you for an alliance against the leader'],
];

/** The last chat lines the seat heard; `from` counts seats after it, `to` is the table or this seat. */
const HEARD: readonly { from: number; to: 'table' | 'you'; text: string }[] = [
  { from: 1, to: 'table', text: `Prices are climbing. Whoever corners ${GOOD_NAME.smithore} will run this colony.` },
  { from: 2, to: 'you', text: "Vote for me and I'll cut taxes." },
  { from: 3, to: 'table', text: `Anyone selling ${GOOD_NAME.energy}? I pay fair.` },
  { from: 1, to: 'you', text: 'Stick with me and we both stay fed.' },
  { from: 2, to: 'table', text: 'The Governor has done nothing for us.' },
  { from: 3, to: 'you', text: 'Keep off the river plots and I will keep off yours.' },
];

/** The whisper the reply mode answers, from the next seat. */
const WHISPER = { from: 1, text: `Sell me 4 ${GOOD_NAME.food} at 30 next auction and I'll back you for Governor. Deal?` };

/** Each seat's strategy in one line, by seat order. */
const STRATEGY_LINES: readonly string[] = [
  `builder: steady ${GOOD_NAME.food} and ${GOOD_NAME.energy}, keep 200 credits back.`,
  `specialist: earn most from ${GOOD_NAME.smithore}.`,
  'landBaron: gather plots, each one counts toward the score.',
  "politician: win the Governor's office, each term adds points.",
];

const pctOf = (share: number) => `${Math.round(share * 100)}%`; // literal-ok: a share as a whole percentage
const at = <T>(list: readonly T[], i: number): T => list[i % list.length]!;

const indexOf = (view: GameState, seat: string) => view.players.findIndex((p) => p.id === seat);
/** The player `offset` seats after `seat`. */
const after = (view: GameState, seat: string, offset: number) => view.players[(indexOf(view, seat) + offset) % view.players.length]!;
const nameOf = (view: GameState, id: string | null) => (id === null ? 'nobody' : (view.players.find((p) => p.id === id)?.name ?? 'nobody'));

function officeOf(view: GameState, id: string): Office | null {
  if (view.politics?.governor === id) return 'governor';
  if (view.politics?.sheriff === id) return 'sheriff';
  return null;
}

/** A player's public position: plots, worth as every phone shows it, and office. Never their goods. */
function positionLine(point: BriefPoint, id: string): string {
  const { view, worth } = point;
  const plots = view.tiles.filter((t) => t.owner === id).length;
  const office = officeOf(view, id);
  const parts = [`${plots} plots`, ...(id in worth ? [`worth ${worth[id]}`] : []), ...(office ? [office === 'governor' ? 'Governor' : 'Sheriff'] : [])];
  return `${nameOf(view, id)}: ${parts.join(', ')}.`;
}

const relationsOf = (offset: number) => at(RELATIONS, offset - 1);

const promiseText = (p: TaxPromise | undefined): string =>
  p === undefined ? 'no tax promise' : p.kind === 'cap' ? `promises to cap the sales tax at ${p.percent}%` : p.kind === 'lower' ? 'promises to lower the sales tax' : 'promises to hold the sales tax';

function politicsLines(view: GameState): string[] {
  const pol = view.politics;
  if (pol === null) return ['Politics is off in this game: no offices, no elections, no tax changes.'];
  const next = nextElectionMonth(view);
  const election = next === null ? 'No election is left this game.' : next === view.month + 1 ? `The next election is next month (month ${next}).` : `No election next month; the next is in month ${next}.`;
  const candidates = OFFICES.map((office) => {
    const ids = pol.candidates[office] ?? [];
    const label = office === 'governor' ? 'Governor' : 'Sheriff';
    if (ids.length === 0) return `Candidates for ${label}: none declared.`;
    return `Candidates for ${label}: ${ids.map((id) => (office === 'governor' ? `${nameOf(view, id)} (${promiseText(pol.promises[id])})` : nameOf(view, id))).join(', ')}.`;
  });
  return [`Governor: ${nameOf(view, pol.governor)}. Sheriff: ${nameOf(view, pol.sheriff)}. Sales tax: ${pctOf(view.treasury.salesTax)}.`, election, ...candidates];
}

/** The social section: the other players, the politics, the chat the seat heard, and the ask. Public facts only. */
export function socialSection(point: BriefPoint): string {
  const { view } = point;
  const seat = point.brief.seat;
  const others = view.players.length - 1;
  const players = Array.from({ length: others }, (_, k) => k + 1).flatMap((offset) => {
    const p = after(view, seat, offset);
    return [`- ${positionLine(point, p.id)}`, `  What you know of ${p.name}: ${relationsOf(offset).join('; ')}.`];
  });
  const heard = HEARD.map((h) => {
    const who = after(view, seat, ((h.from - 1) % others) + 1).name;
    return h.to === 'table' ? `- ${who} to the table: "${h.text}"` : `- ${who} whispered to you: "${h.text}"`;
  });
  return ['Social.', 'The other players:', ...players, '', 'Politics:', ...politicsLines(view), '', 'The last chat lines you heard:', ...heard, '', ASK, SOCIAL_RULES].join('\n');
}

const strategyLine = (point: BriefPoint) => at(STRATEGY_LINES, Math.max(0, indexOf(point.view, point.brief.seat)));

function foldedPrompt(point: BriefPoint): SpikePrompt {
  const { brief, view, mind } = point;
  return { system: STRATEGY_SYSTEM, user: `${strategyUserText(brief, view, situation(view, mind))}\n\n${socialSection(point)}`, schema: FOLDED_SCHEMA };
}

function separatePrompt(point: BriefPoint): SpikePrompt {
  const { brief, view, mind } = point;
  const prices = allPrices(view);
  const user = [
    `You are ${brief.name}. Month ${brief.month} of ${view.maxMonths}, start of planning.`,
    `Your character: ${PERSONAS[brief.persona].card}`,
    situation(view, mind),
    `Colony prices: ${GOODS.map((g) => `${GOOD_NAME[g]} ${prices[g]}`).join(', ')}.`,
    `Your strategy: ${strategyLine(point)}`,
    '',
    socialSection(point),
  ].join('\n');
  return { system: SEPARATE_SYSTEM, user, schema: SOCIAL_SCHEMA };
}

function replyPrompt(point: BriefPoint): SpikePrompt {
  const { brief, view } = point;
  const from = after(view, brief.seat, WHISPER.from);
  const user = [
    `You are ${brief.name}. Month ${brief.month} of ${view.maxMonths}.`,
    `${positionLine(point, from.id)} What you know of ${from.name}: ${relationsOf(WHISPER.from).join('; ')}.`,
    `${from.name} whispered to you: "${WHISPER.text}"`,
    `Write your reply to ${from.name}.`,
  ].join('\n');
  return { system: REPLY_SYSTEM, user, schema: REPLY_SCHEMA };
}

const PROMPTS: Record<Mode, (point: BriefPoint) => SpikePrompt> = { folded: foldedPrompt, separate: separatePrompt, reply: replyPrompt };

export interface PlannedCall {
  /** Position in the run, from 1. */
  n: number;
  role: ModelRole;
  mode: Mode;
  point: BriefPoint;
  prompt: SpikePrompt;
  worstUsd: number;
}

/** The calls in order: Haiku's, then Sonnet's; each model's i-th brief in every mode before its next brief. */
export function planCalls(points: readonly BriefPoint[], haiku: number, sonnet: number): PlannedCall[] {
  const counts: Record<ModelRole, number> = { haiku, sonnet };
  const calls = ROLES.flatMap((role) =>
    points.slice(0, counts[role]).flatMap((point) =>
      MODES.map((mode) => {
        const prompt = PROMPTS[mode](point);
        return { role, mode, point, prompt, worstUsd: worstCaseUsd(role, prompt, C.maxTokens[mode]) };
      }),
    ),
  );
  return calls.map((c, i) => ({ n: i + 1, ...c }));
}

/** Why a social reply is invalid, checked in this order. */
export const SOCIAL_CAUSES = ['refused', 'cut_off', 'not_json', 'bad_shape', 'bad_enum', 'too_many_messages', 'text_too_long'] as const;
export type SocialCause = (typeof SOCIAL_CAUSES)[number];

export interface SocialVerdict {
  /** The social part is valid and, for a folded reply, the strategy part too. */
  valid: boolean;
  /** The social part's first failed check; null when it is valid. */
  cause: SocialCause | null;
  /** Messages in a valid reply (a whisper reply is one); null when invalid. */
  messages: number | null;
  /** Declared facts across its messages; null when invalid. */
  facts: number | null;
  /** A folded reply's strategy part, judged as the strategy spike judges it; null in the other modes. */
  strategy: Verdict | null;
}

class Bad extends Error {
  constructor(readonly cause: SocialCause) {
    super(cause);
  }
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** `x` as an object with exactly the schema's keys, or a bad_shape. */
function shaped(x: unknown, schema: { required: readonly string[] }): Record<string, unknown> {
  if (!isObject(x) || Object.keys(x).length !== schema.required.length || !schema.required.every((k) => k in x)) throw new Bad('bad_shape');
  return x;
}
function text(x: unknown, max = Infinity): string {
  if (typeof x !== 'string') throw new Bad('bad_shape');
  if ([...x].length > max) throw new Bad('text_too_long');
  return x;
}
function oneOf(x: unknown, values: readonly unknown[], nullable = false): void {
  if (nullable && x === null) return;
  if (typeof x !== 'string') throw new Bad('bad_shape');
  if (!values.includes(x)) throw new Bad('bad_enum');
}
function list(x: unknown): unknown[] {
  if (!Array.isArray(x)) throw new Bad('bad_shape');
  return x;
}
function facts(x: unknown): number {
  const items = list(x);
  for (const f of items) {
    const o = shaped(f, FACT);
    oneOf(o.kind, FACT_KINDS);
    text(o.subject);
    text(o.value);
  }
  return items.length;
}

/** The social fields of a reply, checked; the count of its messages and their facts. */
function judgeSocialFields(reply: Record<string, unknown>): { messages: number; facts: number } {
  const p = SOCIAL_PROPERTIES;
  for (const r of list(reply.relationships)) {
    const o = shaped(r, p.relationships.items);
    text(o.player);
    oneOf(o.standing, STANDINGS);
    text(o.why);
  }
  for (const a of list(reply.aims)) {
    const o = shaped(a, p.aims.items);
    text(o.player);
    oneOf(o.aim, AIMS);
    text(o.ask);
    text(o.why);
  }
  const messages = list(reply.messages);
  if (messages.length > MAX_MESSAGES) throw new Bad('too_many_messages');
  let count = 0;
  for (const m of messages) {
    const o = shaped(m, p.messages.items);
    text(o.to);
    text(o.purpose);
    text(o.text, BRAIN.maxLineChars);
    count += facts(o.facts);
  }
  const campaign = shaped(reply.campaign, p.campaign);
  oneOf(campaign.office, OFFICES, true);
  if (campaign.line !== null) text(campaign.line);
  return { messages: messages.length, facts: count };
}

const pick = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, o[k]]));

/** Judges a reply for its mode: the schema's exact keys and enums, at most 3 messages, lines within BRAIN.maxLineChars. */
export function judgeSocial(call: Pick<PlannedCall, 'mode' | 'point'>, raw: string, stopReason: StrategyReply['stopReason'] = 'end_turn'): SocialVerdict {
  const verdict = (cause: SocialCause, strategy: Verdict | null = null): SocialVerdict => ({ valid: false, cause, messages: null, facts: null, strategy });
  if (stopReason === 'refusal') return verdict('refused');
  if (stopReason === 'max_tokens') return verdict('cut_off');
  let reply: unknown;
  try {
    reply = JSON.parse(raw);
  } catch {
    return verdict('not_json');
  }
  const strategy = call.mode === 'folded' && isObject(reply) ? judgeReply(call.point.brief, JSON.stringify(pick(reply, STRATEGY_SCHEMA.required)), stopReason) : null;
  try {
    let counts: { messages: number; facts: number };
    if (call.mode === 'reply') {
      const o = shaped(reply, REPLY_SCHEMA);
      text(o.text, BRAIN.maxLineChars);
      counts = { messages: 1, facts: facts(o.facts) };
    } else {
      counts = judgeSocialFields(shaped(reply, call.mode === 'folded' ? FOLDED_SCHEMA : SOCIAL_SCHEMA));
    }
    return { valid: strategy === null || strategy.valid, cause: null, ...counts, strategy };
  } catch (e) {
    if (e instanceof Bad) return verdict(e.cause, strategy);
    throw e;
  }
}

/** A call's line in the ledger file: usage, cost, outcome and counts, never the reply's text. */
export interface SocialLine extends Usage {
  t: string;
  model: string;
  kind: 'social';
  mode: Mode;
  call: number;
  brief: number;
  seat: string;
  level: Brief['level'];
  persona: Brief['persona'];
  month: number;
  brief_chars: number;
  thinking: number | null;
  usd: number;
  ms: number;
  outcome: StrategyOutcome;
  cause: SocialCause | null;
  strategy_cause: Cause | null;
  strategy_bound: Bound | null;
  messages: number | null;
  facts: number | null;
}

/** A call's line in the replies file: the parsed reply, or its raw text when it does not parse, for a quality read. */
export interface ReplyLine {
  t: string;
  model: string;
  mode: Mode;
  call: number;
  brief: number;
  seat: string;
  outcome: StrategyOutcome;
  reply: unknown;
}

export interface SocialRow {
  role: ModelRole;
  model: string;
  mode: Mode;
  calls: number;
  /** Calls that brought a reply back, refusals included. */
  answered: number;
  /** Shares and means over answered calls; null when none was answered. */
  valid: number | null;
  p50: number | null;
  p90: number | null;
  meanInput: number | null;
  meanCached: number | null;
  meanCacheWrite: number | null;
  meanOutput: number | null;
  /** Over answered calls whose response carried thinking tokens. */
  meanThinking: number | null;
  meanUsd: number | null;
  /** Ledger dollars. */
  usd: number;
}

export interface SocialReport {
  planned: number;
  made: number;
  stopped: StopReason;
  cap: number;
  ledgerUsd: number;
  /** Ledger dollars plus each call whose bill is unknown at its worst case: what the cap is checked against. */
  countedUsd: number;
  rows: SocialRow[];
}

export interface SocialRunOptions {
  calls: PlannedCall[];
  call: SpikeCall;
  /** Appends one line each; a throw stops the run. */
  writeLedger: (line: SocialLine) => void;
  writeReply: (line: ReplyLine) => void;
  /** Dollars; trusted only up to C.capUsd. */
  cap: number;
  /** Called once, just before the first call starts. */
  claim?: () => void;
  now: () => Date;
  log: (line: string) => void;
}

interface Settled {
  role: ModelRole;
  mode: Mode;
  answered: boolean;
  valid: boolean;
  ms: number;
  usage: Usage;
  thinking: number | null;
  usd: number;
}

const ascending = (a: number, b: number) => a - b;
const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

function row(role: ModelRole, mode: Mode, calls: Settled[]): SocialRow {
  const answered = calls.filter((c) => c.answered);
  const ms = answered.map((c) => c.ms).sort(ascending);
  const of = (k: keyof Usage) => mean(answered.map((c) => c.usage[k]));
  return {
    role,
    model: C.models[role],
    mode,
    calls: calls.length,
    answered: answered.length,
    valid: answered.length === 0 ? null : answered.filter((c) => c.valid).length / answered.length,
    p50: ms.length === 0 ? null : nearest(ms, 0.5),
    p90: ms.length === 0 ? null : nearest(ms, 0.9),
    meanInput: of('input'),
    meanCached: of('cached_read'),
    meanCacheWrite: of('cache_write'),
    meanOutput: of('output'),
    meanThinking: mean(answered.flatMap((c) => (c.thinking === null ? [] : [c.thinking]))),
    meanUsd: mean(answered.map((c) => c.usd)),
    usd: calls.reduce((s, c) => s + c.usd, 0),
  };
}

function parsedOrRaw(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Sends the calls one at a time and never starts one that could take the counted spend past the cap. */
export async function runSocialSpike(options: SocialRunOptions): Promise<SocialReport> {
  const { calls: planned, now, log } = options;
  const cap = Math.min(options.cap, C.capUsd);
  let ledgerUsd = 0;
  let unknownUsd = 0;
  let stopped: StopReason = 'done';
  const settled: Settled[] = [];

  for (const c of planned) {
    // Written as !(<=) so a NaN refuses instead of slipping through.
    if (!(ledgerUsd + unknownUsd + c.worstUsd <= cap)) {
      stopped = 'cap';
      break;
    }
    if (settled.length === 0) options.claim?.();
    const model = C.models[c.role];
    let reply: StrategyReply | null = null;
    let failure: unknown;
    try {
      reply = await options.call(c.prompt, { model, effort: C.effort, maxTokens: C.maxTokens[c.mode], timeoutMs: C.timeoutMs[c.mode] });
    } catch (e) {
      // Anything but a CallFailed is counted as an error, and its text is dropped.
      failure = e ?? new Error('unknown error');
    }
    const failed = failure instanceof CallFailed ? failure : null;
    const verdict = reply ? judgeSocial(c, reply.text, reply.stopReason) : null;
    const outcome: StrategyOutcome = verdict ? (verdict.cause === 'refused' ? 'refused' : verdict.valid ? 'valid' : 'invalid') : (failed?.outcome ?? 'error');
    const usage = reply?.usage ?? NO_USAGE;
    const usd = usdAt(c.role, usage);
    const ms = reply?.ms ?? failed?.ms ?? 0;
    const thinking = reply?.thinking ?? null;
    const t = now().toISOString();
    const { brief } = c.point;
    options.writeLedger({
      t,
      model,
      kind: 'social',
      mode: c.mode,
      call: c.n,
      brief: brief.index,
      seat: brief.seat,
      level: brief.level,
      persona: brief.persona,
      month: brief.month,
      brief_chars: briefChars(c.prompt),
      ...usage,
      thinking,
      usd,
      ms,
      outcome,
      cause: verdict?.cause ?? null,
      strategy_cause: verdict?.strategy?.cause ?? null,
      strategy_bound: verdict?.strategy?.bound ?? null,
      messages: verdict?.messages ?? null,
      facts: verdict?.facts ?? null,
    });
    options.writeReply({ t, model, mode: c.mode, call: c.n, brief: brief.index, seat: brief.seat, outcome, reply: reply === null ? null : parsedOrRaw(reply.text) });
    settled.push({ role: c.role, mode: c.mode, answered: reply !== null, valid: verdict?.valid ?? false, ms, usage, thinking, usd });
    ledgerUsd += usd;
    if (billUnknown(reply, failure)) unknownUsd += c.worstUsd;
    log(`call ${c.n}/${planned.length} ${model} ${c.mode} brief ${brief.index} ${outcome} ${Math.round(ms)} ms, counted $${(ledgerUsd + unknownUsd).toFixed(5)}`);
    if (failed?.auth) {
      stopped = 'auth';
      break;
    }
  }

  return {
    planned: planned.length,
    made: settled.length,
    stopped,
    cap,
    ledgerUsd,
    countedUsd: ledgerUsd + unknownUsd,
    rows: ROLES.flatMap((role) => MODES.map((mode) => row(role, mode, settled.filter((s) => s.role === role && s.mode === mode)))).filter((r) => r.calls > 0),
  };
}

const pct = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(0)}%`);
const msText = (x: number | null) => (x === null ? '—' : `${Math.round(x)} ms`);
const usdText = (x: number | null) => (x === null ? '—' : `$${x.toFixed(5)}`);
const tokText = (x: number | null) => (x === null ? '—' : x.toFixed(0));

/** The report: totals against the cap, then a row per model and mode. */
export function renderReport(r: SocialReport): string[] {
  const totals = table([
    ['calls made / planned', `${r.made} / ${r.planned}`],
    ['stopped because', r.stopped],
    ['ledger spend', `$${r.ledgerUsd.toFixed(5)}`],
    [`counted spend (cap $${r.cap.toFixed(2)})`, `$${r.countedUsd.toFixed(5)}`],
  ]);
  const rows = table([
    ['model', 'mode', 'calls', 'valid', 'p50', 'p90', 'mean input', 'mean cached', 'mean cache write', 'mean output', 'mean thinking', 'mean usd', 'total usd'],
    ...r.rows.map((m) => [
      m.model,
      m.mode,
      String(m.calls),
      pct(m.valid),
      msText(m.p50),
      msText(m.p90),
      tokText(m.meanInput),
      tokText(m.meanCached),
      tokText(m.meanCacheWrite),
      tokText(m.meanOutput),
      tokText(m.meanThinking),
      usdText(m.meanUsd),
      `$${m.usd.toFixed(5)}`,
    ]),
  ]);
  return [...totals, '', ...rows];
}

/** The planned calls with their prompt sizes and worst cases, the run's total worst case and how many fit under the cap. */
export function renderPlan(calls: readonly PlannedCall[], cap: number): string[] {
  let sum = 0;
  let fit = 0;
  for (const c of calls) {
    sum += c.worstUsd;
    if (sum <= cap) fit += 1;
  }
  const rows = table([
    ['#', 'model', 'mode', 'brief', 'seat', 'month', 'brief chars', 'worst usd'],
    ...calls.map((c) => [String(c.n), C.models[c.role], c.mode, String(c.point.brief.index), c.point.brief.seat, String(c.point.brief.month), String(briefChars(c.prompt)), `$${c.worstUsd.toFixed(5)}`]),
  ]);
  const totals = table([
    ['total worst case', `$${sum.toFixed(5)}`],
    ['cap', `$${cap.toFixed(2)}`],
    ['planned calls that fit under the cap at worst case, in order', `${fit} of ${calls.length}`],
  ]);
  return [...rows, '', ...totals];
}

const USAGE =
  'Usage: brain:social-spike [--seed S] [--haiku N] [--sonnet N] [--plan] | --max-usd X --ledger <path> --replies <path> (all three required to call); nothing called.';

interface Flags {
  seed: number;
  haiku: number;
  sonnet: number;
  maxUsd: number | null;
  plan: boolean;
  ledger: string | null;
  replies: string | null;
}

/** The flags, or null for anything unknown, repeated, missing its value or out of range. */
function parseFlags(argv: readonly string[]): Flags | null {
  // pnpm hands its `--` separator through to the script.
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  const paths: Record<string, string> = {};
  let plan = false;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--plan') {
      if (plan) return null;
      plan = true;
    } else if (a === '--ledger' || a === '--replies') {
      const value = args[i + 1];
      if (a in paths || value === undefined || value.startsWith('--') || value.trim() === '') return null;
      paths[a] = value;
      i += 1;
    } else {
      rest.push(a);
    }
  }
  const given = numberFlags(rest, ['--seed', '--haiku', '--sonnet', '--max-usd']);
  if (!given) return null;
  const seed = given.get('--seed') ?? 101; // literal-ok: brain:spike's default seed
  const haiku = given.get('--haiku') ?? 3; // literal-ok: the spike's default Haiku calls per mode
  const sonnet = given.get('--sonnet') ?? 2; // literal-ok: the spike's default Sonnet calls per mode
  const maxUsd = given.get('--max-usd') ?? null;
  const ok = [seed, haiku, sonnet].every(Number.isInteger) && haiku + sonnet >= 1 && (maxUsd === null || maxUsd > 0);
  return ok ? { seed, haiku, sonnet, maxUsd, plan, ledger: paths['--ledger'] ?? null, replies: paths['--replies'] ?? null } : null;
}

const appender =
  <T>(file: string) =>
  (line: T) =>
    fs.appendFileSync(file, `${JSON.stringify(line)}\n`);

const plannedFor = (flags: Flags) => {
  const briefs = Math.max(flags.haiku, flags.sonnet);
  return planCalls(collectBriefPoints(flags.seed, briefs, briefs), flags.haiku, flags.sonnet);
};

/**
 * Exit code: 0 done, capped or planned; 1 nothing called (bad flags, a path or the key missing, --max-usd missing,
 * today's run already made, or a ledger or replies file already there); 2 stopped on an auth failure.
 */
export async function main(argv: readonly string[], env: Readonly<Record<string, string | undefined>>, deps: MainDeps = {}): Promise<number> {
  const { dataDir, out, now } = resolveDeps(deps);
  const flags = parseFlags(argv);
  if (!flags) {
    out(USAGE);
    return 1;
  }
  if (flags.plan) {
    for (const line of renderPlan(plannedFor(flags), capFor(flags.maxUsd ?? C.capUsd, C.capUsd))) out(line);
    return 0;
  }
  const { ledger, replies } = flags;
  // The same path for both would put reply text in the ledger.
  if (ledger === null || replies === null || path.resolve(ledger) === path.resolve(replies)) {
    out(`${USAGE} --ledger and --replies are required and must differ.`);
    return 1;
  }
  const key = apiKeyFrom(env);
  if (!key) {
    out(`${API_KEY_ENV} is not set; nothing called.`);
    return 1;
  }
  if (flags.maxUsd === null) {
    out(USAGE);
    return 1;
  }
  const marker = dayLedgerPath(dataDir, 'social-spike', now());
  const ranToday = alreadyRanToday(marker, 'brain:social-spike');
  if (ranToday) {
    out(ranToday);
    return 1;
  }
  const taken = [ledger, replies].find((f) => fs.existsSync(f));
  if (taken) {
    out(`${taken} exists: each run writes fresh files; nothing called.`);
    return 1;
  }

  const cap = capFor(flags.maxUsd, C.capUsd);
  const calls = plannedFor(flags);
  out(`brain:social-spike ${C.models.haiku} then ${C.models.sonnet}, adaptive thinking, effort ${C.effort}, cap $${cap.toFixed(2)}, planned ${calls.length} calls (${day(now())})`);
  for (const line of renderPlan(calls, cap)) out(line);

  const report = await runSocialSpike({
    calls,
    call: createSpikeCall(createAnthropicSdk(key)),
    writeLedger: appender<SocialLine>(ledger),
    writeReply: appender<ReplyLine>(replies),
    cap,
    // The day's clearance and both files are claimed once, by the run that starts the first call.
    claim: () => {
      claimLedger(marker);
      claimLedger(ledger);
      claimLedger(replies);
    },
    now,
    log: out,
  });
  for (const line of renderReport(report)) out(line);
  if (report.stopped === 'auth') out(AUTH_STOPPED);
  return report.stopped === 'auth' ? 2 : 0;
}

runAsScript(import.meta.url, 'brain:social-spike', main);
