import { BRAIN, GAME, GOODS, type GameState, type Good, type Playbook, type PlayerId, type RecordedWrite, type Strategy } from '@mule/engine';
import { OPTION_IDS } from '../decider.js';
import { LAND_OFFERS, LAND_PATHS, type EditOffer, type WriterBrief } from './brief.js';
import { cleanLine } from './reply.js';
import { capCodePoints } from '../text.js';
import type { PlanEdit, ValidatePlan } from '../playbook/index.js';
import type { Fact, Message } from '../social/index.js';

/**
 * Why a reply, or one of its edits, cannot be used: a code only, never reply text. refused and cut_off come from the
 * stop reason; bad_shape is keys missing or extra, or a value not of its JSON type; no_reply is a call that failed.
 */
export const CAUSES = [
  'refused',
  'cut_off',
  'not_json',
  'bad_shape',
  'bad_kind',
  'bad_good',
  // No writer refuses for it since cashFloor is not offered (WS9 ruling, 6 Nov); kept for the strategy spike's replies
  // and for records written before.
  'bad_cash_floor',
  // No writer refuses for it since an over-long why is cut instead (whyOf); kept for the strategy spike and old records.
  'reason_too_long',
  'plan_not_offered',
  'bad_line',
  'path_not_offered',
  'path_repeated',
  'never_corners',
  'no_reply',
] as const;
export type Cause = (typeof CAUSES)[number];

export type { RecordedWrite };

const KIND_SET: Record<Strategy['kind'], true> = { builder: true, specialist: true, monopolist: true, landBaron: true, politician: true, spoiler: true };
const STRATEGY_KINDS = Object.keys(KIND_SET) as Strategy['kind'][];

/**
 * The strategy fields the writer may set, in the order its edits list them, for every level: the ones play reads.
 * monopolyTarget and cashFloor are not offered: play does not read them (WS9 ruling, 6 Nov); they may return once WS9
 * wires them.
 */
const STRATEGY_FIELDS = ['kind', 'moneyMaker', 'reason'] as const;
type StrategyField = (typeof STRATEGY_FIELDS)[number];
const strategyPath = (f: StrategyField) => `/strategy/${f}`;
const FIELD_OF = new Map(STRATEGY_FIELDS.map((f) => [strategyPath(f), f]));
/** A path is recorded in a refusal only when some brief offers it; any other comes back as null. */
const knownPath = (path: string, brief: WriterBrief) => FIELD_OF.has(path) || (LAND_PATHS as readonly string[]).includes(path) || brief.offers.some((o) => o.path === path);

const goodOrNull = { anyOf: [{ type: 'string', enum: [...GOODS] }, { type: 'null' }] };

export interface WriterSchema {
  type: 'object';
  properties: {
    strategy?: {
      type: 'object';
      properties: Partial<Record<StrategyField, object>> & { kind: { type: 'string'; enum: string[] } };
      required: string[];
      additionalProperties: false;
    };
    edits: { type: 'array'; items: { anyOf: object[] } };
    line: { type: 'string' };
    messages?: { type: 'array'; items: object };
  };
  required: string[];
  additionalProperties: false;
}

/**
 * The offers as schema branches: offers whose value has the same type share one branch, its paths an enum, in first-offer
 * order. The API refuses a schema of one branch per path past a few dozen (an auction of 6 goods offers 30 paths), and
 * offers of distinct types keep a branch each, so the land schema's bytes are unchanged.
 */
function byValueType(offers: readonly EditOffer[]): { paths: string[]; to: object }[] {
  const branches = new Map<string, { paths: string[]; to: object }>();
  for (const { path, to } of offers) {
    const key = JSON.stringify(to);
    const branch = branches.get(key);
    if (branch) branch.paths.push(path);
    else branches.set(key, { paths: [path], to });
  }
  return [...branches.values()];
}

const integer = { type: 'integer' };
const str = { type: 'string' };
const factBranch = (properties: Record<string, object>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
/** The facts a message may declare, one branch per kind. */
const FACT_BRANCHES = [
  factBranch({ price: { type: 'string', enum: [...GOODS] }, value: integer }),
  factBranch({ owner: integer, player: { anyOf: [str, { type: 'null' }] } }),
  factBranch({ score: str, value: integer }),
  factBranch({ holding: { type: 'string', enum: [...GOODS] }, value: integer }),
  factBranch({ rule: str }),
];
const MESSAGE_KEYS = ['to', 'purpose', 'text', 'facts'] as const;

/** A message's schema: to an offered player or the table, its purpose, its text and its declared facts. */
const messagesSchema = (to: readonly PlayerId[]) => ({
  type: 'array' as const,
  items: {
    type: 'object',
    properties: { to: { type: 'string', enum: [...to, 'table'] }, purpose: str, text: str, facts: { type: 'array', items: { anyOf: FACT_BRANCHES } } },
    required: [...MESSAGE_KEYS],
    additionalProperties: false,
  },
});

/**
 * The reply's JSON schema for a brief: one per level's corners flag and offered paths, so the request stays
 * byte-stable (the land brief's, by default). A seat that never corners is not offered 'monopolist'; a brief that
 * offers no strategy has none in its schema; one that offers messages (`messageTo`) requires them. Plan letters are
 * any option letter; the writer checks them against the brief, and checks each reason's length (structured outputs
 * take no string-length constraint).
 */
export function replySchema(corners: boolean, offers: readonly EditOffer[] = LAND_OFFERS, strategyOffered = true, messageTo?: readonly PlayerId[]): WriterSchema {
  const field: Record<StrategyField, object> = {
    kind: { type: 'string', enum: corners ? [...STRATEGY_KINDS] : STRATEGY_KINDS.filter((k) => k !== 'monopolist') },
    moneyMaker: goodOrNull,
    reason: { type: 'string' },
  };
  const strategy: NonNullable<WriterSchema['properties']['strategy']> = {
    type: 'object',
    properties: Object.fromEntries(STRATEGY_FIELDS.map((f) => [f, field[f]])) as NonNullable<WriterSchema['properties']['strategy']>['properties'],
    required: [...STRATEGY_FIELDS],
    additionalProperties: false,
  };
  return {
    type: 'object',
    properties: {
      ...(strategyOffered ? { strategy } : {}),
      edits: {
        type: 'array',
        items: {
          anyOf: byValueType(offers).map(({ paths, to }) => ({
            type: 'object',
            properties: { path: { type: 'string', enum: paths }, to, reason: { type: 'string' } },
            required: ['path', 'to', 'reason'],
            additionalProperties: false,
          })),
        },
      },
      line: { type: 'string' },
      ...(messageTo ? { messages: messagesSchema(messageTo) } : {}),
    },
    required: messageTo ? ['edits', 'line', 'messages'] : ['edits', 'line'],
    additionalProperties: false,
  };
}

export interface WriterPrompt {
  /** Given by the caller, so it can be cached. */
  system: string;
  user: string;
  schema: WriterSchema;
}

/** The port to a language model for writer calls: the prompt and the longest to wait; back come the text and the stop reason. */
export type WriteComplete = (prompt: WriterPrompt, waitMs: number) => Promise<{ text: string; stopReason?: string | null }>;

/** What a writer call needs: the brief, whose strategy the accepted strategy fields are set on, the system text and the wait. */
export interface WriteAsk {
  brief: WriterBrief;
  system: string;
  waitMs: number;
}

/** An edit the writer refused before validation, by path when the brief offered it, else null. */
export interface Refusal {
  path: string | null;
  cause: Cause;
}

/**
 * The writer's checked reply, as recorded, and beside it the edits it refused and the messages it asks to send, which
 * are never recorded. No messages: a brief that offered none, or a reply the record replays.
 */
export interface WriterReply {
  reply: RecordedWrite;
  refused: Refusal[];
  messages?: Message[];
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[], required: readonly string[]) =>
  Object.keys(o).every((k) => allowed.includes(k)) && required.every((k) => k in o);
const isGoodOrNull = (x: unknown) => x === null || (GOODS as readonly unknown[]).includes(x);

interface Proposed extends PlanEdit {
  /** Came from the reply's strategy object rather than its edits. */
  fromStrategy: boolean;
}

/**
 * An edit's why, cut to its first BRAIN.writeReasonChars code points, as the brief's cap counts them (PM ruling, 8 Nov:
 * a why past the cap is cut, and its edit kept; only the why, never a value). No writer refuses 'reason_too_long' since.
 */
const whyOf = (reason: string) => capCodePoints(reason, BRAIN.writeReasonChars);

const isInt = (x: unknown): x is number => Number.isInteger(x);
const isGood = (x: unknown) => (GOODS as readonly unknown[]).includes(x);

/** A declared fact as its schema branch gives it, or null. */
function factOf(f: unknown): Fact | null {
  if (!isObject(f)) return null;
  const keys = Object.keys(f).sort().join(',');
  if (keys === 'price,value' && isGood(f.price) && isInt(f.value)) return { price: f.price as Good, value: f.value };
  if (keys === 'owner,player' && isInt(f.owner) && (f.player === null || typeof f.player === 'string')) return { owner: f.owner, player: f.player };
  if (keys === 'score,value' && typeof f.score === 'string' && isInt(f.value)) return { score: f.score, value: f.value };
  if (keys === 'holding,value' && isGood(f.holding) && isInt(f.value)) return { holding: f.holding as Good, value: f.value };
  if (keys === 'rule' && typeof f.rule === 'string') return { rule: f.rule };
  return null;
}

/** One message as the schema gives it, to a player the brief offered or the table, with a line to say; else null. */
function messageOf(m: unknown, to: readonly PlayerId[]): Message | null {
  if (!isObject(m) || !onlyKeys(m, MESSAGE_KEYS, MESSAGE_KEYS)) return null;
  if (typeof m.to !== 'string' || !(m.to === 'table' || to.includes(m.to)) || typeof m.purpose !== 'string' || !Array.isArray(m.facts)) return null;
  const text = cleanLine(m.text);
  const facts = m.facts.map(factOf);
  if (text === null || facts.some((f) => f === null)) return null;
  return { to: m.to, purpose: m.purpose, text, facts: facts as Fact[] };
}

/** The reply's parts, or the first cause that makes the whole reply unusable. Messages are read only when offered. */
function readReply(text: string, stopReason: string | null, messageTo?: readonly PlayerId[]): { edits: Proposed[]; line: string; messages: Message[] } | { cause: Cause } {
  if (stopReason === 'refusal') return { cause: 'refused' };
  if (stopReason === 'max_tokens') return { cause: 'cut_off' };
  let reply: unknown;
  try {
    reply = JSON.parse(text);
  } catch {
    return { cause: 'not_json' };
  }
  if (!isObject(reply) || !onlyKeys(reply, messageTo ? ['strategy', 'edits', 'line', 'messages'] : ['strategy', 'edits', 'line'], ['edits', 'line'])) return { cause: 'bad_shape' };
  // A Claude Code seat's plan comes with no messages: they are read when sent, and dropped one by one when not their shape.
  if ('messages' in reply && !Array.isArray(reply.messages)) return { cause: 'bad_shape' };
  const messages = messageTo && Array.isArray(reply.messages) ? reply.messages.flatMap((m) => messageOf(m, messageTo) ?? []) : [];
  const { strategy, edits, line } = reply;
  const wellFormed = (e: unknown): e is PlanEdit =>
    isObject(e) && onlyKeys(e, ['path', 'to', 'reason'], ['path', 'to', 'reason']) && typeof e.path === 'string' && typeof e.reason === 'string';
  if (!Array.isArray(edits) || !edits.every(wellFormed)) return { cause: 'bad_shape' };
  const proposed: Proposed[] = [];
  if ('strategy' in reply) {
    // Every level's schema requires the same fields: a strategy with another (monopolyTarget, cashFloor) is not its shape.
    if (!isObject(strategy) || !onlyKeys(strategy, STRATEGY_FIELDS, STRATEGY_FIELDS) || typeof strategy.reason !== 'string') return { cause: 'bad_shape' };
    // The strategy's reason is its why, so it is cut as every edit's is (whyOf), the reason field's value with it.
    const why = whyOf(strategy.reason);
    for (const f of STRATEGY_FIELDS) if (f in strategy) proposed.push({ path: strategyPath(f), to: f === 'reason' ? why : strategy[f], reason: why, fromStrategy: true });
  }
  if (typeof line !== 'string') return { cause: 'bad_line' };
  for (const e of edits) proposed.push({ path: e.path, to: e.to, reason: whyOf(e.reason), fromStrategy: false });
  return { edits: proposed, line, messages };
}

/** One proposed edit: accepted, with its `to` resolved, or refused with its cause. */
function judgeEdit(e: Proposed, brief: WriterBrief, seen: Set<string>): { edit: PlanEdit } | { cause: Cause } {
  // RULE-A3: 'monopolist' is never a kind for a level that does not corner, however it is sent.
  if (!brief.corners && e.path === strategyPath('kind') && e.to === 'monopolist') return { cause: 'never_corners' };
  const offered: readonly string[] = e.fromStrategy ? (brief.strategyOffered ? STRATEGY_FIELDS.map(strategyPath) : []) : brief.offers.map((o) => o.path);
  if (!offered.includes(e.path)) return { cause: 'path_not_offered' };
  if (seen.has(e.path)) return { cause: 'path_repeated' };
  seen.add(e.path);
  const edit = { path: e.path, to: e.to, reason: e.reason };
  switch (e.path) {
    case strategyPath('kind'):
      return (STRATEGY_KINDS as readonly unknown[]).includes(e.to) ? { edit } : { cause: 'bad_kind' };
    case strategyPath('moneyMaker'):
      return isGoodOrNull(e.to) ? { edit } : { cause: 'bad_good' };
    case '/landGrant/ranked': {
      const plan = brief.plans.find((p) => p.id === e.to);
      return plan ? { edit: { ...edit, to: plan.ranked } } : { cause: 'plan_not_offered' };
    }
    case '/development/route':
      // The schema's nulls stand for a field the act takes none of: the playbook's step leaves it out.
      return Array.isArray(e.to)
        ? { edit: { ...edit, to: e.to.map((s) => (isObject(s) ? Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null)) : s)) } }
        : { edit };
    default:
      return { edit };
  }
}

/** A reply nothing in it can be used from: the cause, no edits, no line. */
export const unusableReply = (cause: Cause): WriterReply => ({ reply: { edits: [], line: null, cause }, refused: [] });

/**
 * Asks the model for the seat's strategy and land-grant edits and checks what the schema cannot carry. Never throws
 * for the model: a failed call or an unusable reply comes back as the reply's cause. The validator is the caller's.
 */
export async function writeReply(complete: WriteComplete, ask: WriteAsk): Promise<WriterReply> {
  const { brief } = ask;
  let answer: Awaited<ReturnType<WriteComplete>>;
  try {
    answer = await complete({ system: ask.system, user: brief.text, schema: replySchema(brief.corners, brief.offers, brief.strategyOffered, brief.messageTo) }, ask.waitMs);
  } catch {
    return unusableReply('no_reply');
  }
  const read = readReply(answer.text, answer.stopReason ?? null, brief.messageTo);
  if ('cause' in read) return unusableReply(read.cause);

  const seen = new Set<string>();
  const accepted: PlanEdit[] = [];
  const refused: Refusal[] = [];
  for (const e of read.edits) {
    const judged = judgeEdit(e, brief, seen);
    if ('cause' in judged) refused.push({ path: knownPath(e.path, brief) ? e.path : null, cause: judged.cause });
    else accepted.push(judged.edit);
  }
  // The draft's strategy with the accepted strategy fields set; none accepted, no strategy in the reply.
  const set: Record<string, unknown> = {};
  for (const e of accepted) {
    const f = FIELD_OF.get(e.path);
    if (f) set[f] = e.to;
  }
  const strategy = Object.keys(set).length === 0 ? undefined : ({ ...structuredClone(brief.strategy), ...set } as Strategy);
  const reply: RecordedWrite = { ...(strategy ? { strategy } : {}), edits: accepted, line: cleanLine(read.line) };
  return brief.messageTo ? { reply, refused, messages: read.messages } : { reply, refused };
}

/** What a seat's reply had refused or rejected: kept for its next brief, never played. */
export interface Feedback {
  refused: Refusal[];
  rejected: NonNullable<Playbook['rejected']>;
}

/**
 * The playbook that plays from the engine's draft and the reply that came in time, if any: the draft by 'engine' unless
 * validate accepts at least one of the reply's edits; then validate's playbook, by 'llm'. Validate is never called
 * without an edit. The feedback is null with no reply. An edit is accepted when validate's playbook carries its path in
 * `edits`, whatever `rejected` says: a clamped edit plays and is listed there too, with its why (the writer accepts each
 * path once). Throws what validate throws.
 */
export function playbookFrom(
  validate: ValidatePlan,
  state: GameState,
  draft: Playbook,
  written: WriterReply | null,
): { playbook: Playbook; feedback: Feedback | null } {
  const engine: Playbook = { ...draft, by: 'engine' };
  if (!written) return { playbook: engine, feedback: null };
  const { edits } = written.reply;
  if (edits.length === 0) return { playbook: engine, feedback: { refused: written.refused, rejected: [] } };
  const result = validate(state, draft.seat, draft, edits);
  const feedback: Feedback = { refused: written.refused, rejected: result.rejected };
  const carried = new Set((result.playbook.edits ?? []).map((e) => e.path));
  if (!edits.some((e) => carried.has(e.path))) return { playbook: engine, feedback };
  return { playbook: { ...result.playbook, by: 'llm', rejected: result.rejected }, feedback };
}
