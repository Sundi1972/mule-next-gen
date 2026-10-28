import { BRAIN, GAME, GOODS, type GameState, type Playbook, type PlayerId, type Strategy } from '@mule/engine';
import { OPTION_IDS } from '../decider.js';
import { LAND_PATHS, type LandBrief, type LandPath } from './brief.js';
import { cleanLine } from './reply.js';

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
  'bad_cash_floor',
  'reason_too_long',
  'plan_not_offered',
  'bad_line',
  'path_not_offered',
  'path_repeated',
  'never_corners',
  'no_reply',
] as const;
export type Cause = (typeof CAUSES)[number];

/** A writer call's reply as the writer received it, before validatePlan. Replaced by the import from engine/src/record.ts when it lands. */
export interface RecordedWrite {
  strategy?: Strategy;
  edits: { path: string; to: unknown; reason: string }[];
  line: string | null;
  cause?: string;
}

export type PlanEdit = RecordedWrite['edits'][number];

/** WS1's validator: each edit clamped to the bounds the rules allow; what it refuses keeps the draft's value. */
export type ValidatePlan = (
  state: GameState,
  seat: PlayerId,
  draft: Playbook,
  edits: readonly PlanEdit[],
) => { playbook: Playbook; rejected: NonNullable<Playbook['rejected']> };

const KIND_SET: Record<Strategy['kind'], true> = { builder: true, specialist: true, monopolist: true, landBaron: true, politician: true, spoiler: true };
const STRATEGY_KINDS = Object.keys(KIND_SET) as Strategy['kind'][];

/** The strategy fields the writer may set, in the order its edits list them. */
const STRATEGY_FIELDS = ['kind', 'moneyMaker', 'monopolyTarget', 'cashFloor', 'reason'] as const;
type StrategyField = (typeof STRATEGY_FIELDS)[number];
/** The fields a seat that never corners may set: no monopolyTarget. */
const fieldsFor = (corners: boolean): readonly StrategyField[] => (corners ? STRATEGY_FIELDS : STRATEGY_FIELDS.filter((f) => f !== 'monopolyTarget'));
const strategyPath = (f: StrategyField) => `/strategy/${f}`;
const FIELD_OF = new Map(STRATEGY_FIELDS.map((f) => [strategyPath(f), f]));
const KNOWN_PATHS: readonly string[] = [...FIELD_OF.keys(), ...LAND_PATHS];

const goodOrNull = { anyOf: [{ type: 'string', enum: [...GOODS] }, { type: 'null' }] };
const CLAIMS = Array.from({ length: GAME.claimsPerGrant + 1 }, (_, i) => i);

/** What each land path's `to` is: a plan's letter, a claim count, a press share. */
const LAND_TO: Record<LandPath, object> = {
  '/landGrant/ranked': { type: 'string', enum: [...OPTION_IDS] },
  '/landGrant/claims': { type: 'integer', enum: CLAIMS },
  '/landGrant/pressShare': {
    type: 'object',
    properties: { start: { type: 'number' }, end: { type: 'number' } },
    required: ['start', 'end'],
    additionalProperties: false,
  },
};

export interface WriterSchema {
  type: 'object';
  properties: {
    strategy: {
      type: 'object';
      properties: Partial<Record<StrategyField, object>> & { kind: { type: 'string'; enum: string[] } };
      required: string[];
      additionalProperties: false;
    };
    edits: { type: 'array'; items: { anyOf: object[] } };
    line: { type: 'string' };
  };
  required: string[];
  additionalProperties: false;
}

/**
 * The reply's JSON schema for a seat: one per level's corners flag, so the request stays byte-stable. A seat that never
 * corners is offered neither 'monopolist' nor monopolyTarget. Plan letters are any option letter; the writer checks
 * them against the brief, and checks each reason's length (structured outputs take no string-length constraint).
 */
export function replySchema(corners: boolean): WriterSchema {
  const field: Record<StrategyField, object> = {
    kind: { type: 'string', enum: corners ? [...STRATEGY_KINDS] : STRATEGY_KINDS.filter((k) => k !== 'monopolist') },
    moneyMaker: goodOrNull,
    monopolyTarget: goodOrNull,
    cashFloor: { type: 'integer' },
    reason: { type: 'string' },
  };
  const fields = fieldsFor(corners);
  return {
    type: 'object',
    properties: {
      strategy: {
        type: 'object',
        properties: Object.fromEntries(fields.map((f) => [f, field[f]])) as WriterSchema['properties']['strategy']['properties'],
        required: [...fields],
        additionalProperties: false,
      },
      edits: {
        type: 'array',
        items: {
          anyOf: LAND_PATHS.map((path) => ({
            type: 'object',
            properties: { path: { type: 'string', enum: [path] }, to: LAND_TO[path], reason: { type: 'string' } },
            required: ['path', 'to', 'reason'],
            additionalProperties: false,
          })),
        },
      },
      line: { type: 'string' },
    },
    required: ['edits', 'line'],
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

export interface WriteRequest {
  /** The live state, for the validator only: the brief has already taken what the model may see. */
  state: GameState;
  draft: Playbook;
  brief: LandBrief;
  system: string;
  waitMs: number;
}

/** An edit the writer refused before validation, by path when the brief offered it, else null. */
export interface Refusal {
  path: string | null;
  cause: Cause;
}

/** The writer's checked reply, as recorded, and beside it the edits it refused, which are never recorded. */
export interface WriterReply {
  reply: RecordedWrite;
  refused: Refusal[];
}

export interface Written {
  reply: RecordedWrite;
  /** The edits the writer refused before validation, by path when the brief offered it, else null. */
  refused: Refusal[];
  /** What validatePlan made of the draft and the accepted edits: what plays. */
  result: ReturnType<ValidatePlan>;
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const onlyKeys = (o: Record<string, unknown>, allowed: readonly string[], required: readonly string[]) =>
  Object.keys(o).every((k) => allowed.includes(k)) && required.every((k) => k in o);
const isGoodOrNull = (x: unknown) => x === null || (GOODS as readonly unknown[]).includes(x);

interface Proposed extends PlanEdit {
  /** Came from the reply's strategy object rather than its edits. */
  fromStrategy: boolean;
}

/** The reply's parts, or the first cause that makes the whole reply unusable. */
function readReply(text: string, stopReason: string | null): { edits: Proposed[]; line: string } | { cause: Cause } {
  if (stopReason === 'refusal') return { cause: 'refused' };
  if (stopReason === 'max_tokens') return { cause: 'cut_off' };
  let reply: unknown;
  try {
    reply = JSON.parse(text);
  } catch {
    return { cause: 'not_json' };
  }
  if (!isObject(reply) || !onlyKeys(reply, ['strategy', 'edits', 'line'], ['edits', 'line'])) return { cause: 'bad_shape' };
  const { strategy, edits, line } = reply;
  const wellFormed = (e: unknown): e is PlanEdit =>
    isObject(e) && onlyKeys(e, ['path', 'to', 'reason'], ['path', 'to', 'reason']) && typeof e.path === 'string' && typeof e.reason === 'string';
  if (!Array.isArray(edits) || !edits.every(wellFormed)) return { cause: 'bad_shape' };
  const proposed: Proposed[] = [];
  if ('strategy' in reply) {
    // Both levels' schemas require every field but monopolyTarget; a Rookie's monopolyTarget is refused per edit.
    if (!isObject(strategy) || !onlyKeys(strategy, STRATEGY_FIELDS, fieldsFor(false)) || typeof strategy.reason !== 'string') return { cause: 'bad_shape' };
    for (const f of STRATEGY_FIELDS) if (f in strategy) proposed.push({ path: strategyPath(f), to: strategy[f], reason: strategy.reason, fromStrategy: true });
  }
  if (typeof line !== 'string') return { cause: 'bad_line' };
  for (const e of edits) proposed.push({ path: e.path, to: e.to, reason: e.reason, fromStrategy: false });
  return { edits: proposed, line };
}

/** One proposed edit: accepted, with its `to` resolved, or refused with its cause. */
function judgeEdit(e: Proposed, brief: LandBrief, seen: Set<string>): { edit: PlanEdit } | { cause: Cause } {
  const cornering = e.path === strategyPath('monopolyTarget') || (e.path === strategyPath('kind') && e.to === 'monopolist');
  if (!brief.corners && cornering) return { cause: 'never_corners' };
  const offered: readonly string[] = e.fromStrategy ? fieldsFor(brief.corners).map(strategyPath) : LAND_PATHS;
  if (!offered.includes(e.path)) return { cause: 'path_not_offered' };
  if (seen.has(e.path)) return { cause: 'path_repeated' };
  seen.add(e.path);
  if ([...e.reason].length > BRAIN.writeReasonChars) return { cause: 'reason_too_long' };
  const edit = { path: e.path, to: e.to, reason: e.reason };
  switch (e.path) {
    case strategyPath('kind'):
      return (STRATEGY_KINDS as readonly unknown[]).includes(e.to) ? { edit } : { cause: 'bad_kind' };
    case strategyPath('moneyMaker'):
    case strategyPath('monopolyTarget'):
      return isGoodOrNull(e.to) ? { edit } : { cause: 'bad_good' };
    case strategyPath('cashFloor'):
      return Number.isInteger(e.to) ? { edit } : { cause: 'bad_cash_floor' };
    case '/landGrant/ranked': {
      const plan = brief.plans.find((p) => p.id === e.to);
      return plan ? { edit: { ...edit, to: plan.ranked } } : { cause: 'plan_not_offered' };
    }
    default:
      return { edit };
  }
}

/**
 * Asks the model for the seat's strategy and land-grant edits, checks what the schema cannot carry, and hands the
 * edits it accepts to the validator, whose result is what plays. Never throws for the model: a failed call or an
 * unusable reply comes back as the reply's cause, with the draft validated alone.
 */
export async function writePlaybook(complete: WriteComplete, validate: ValidatePlan, request: WriteRequest): Promise<Written> {
  const { state, draft, brief } = request;
  const settle = (reply: RecordedWrite, refused: Written['refused']): Written => ({ reply, refused, result: validate(state, draft.seat, draft, reply.edits) });
  const unusable = (cause: Cause) => settle({ edits: [], line: null, cause }, []);

  let answer: Awaited<ReturnType<WriteComplete>>;
  try {
    answer = await complete({ system: request.system, user: brief.text, schema: replySchema(brief.corners) }, request.waitMs);
  } catch {
    return unusable('no_reply');
  }
  const read = readReply(answer.text, answer.stopReason ?? null);
  if ('cause' in read) return unusable(read.cause);

  const seen = new Set<string>();
  const accepted: PlanEdit[] = [];
  const refused: Written['refused'] = [];
  for (const e of read.edits) {
    const judged = judgeEdit(e, brief, seen);
    if ('cause' in judged) refused.push({ path: KNOWN_PATHS.includes(e.path) ? e.path : null, cause: judged.cause });
    else accepted.push(judged.edit);
  }
  // The draft's strategy with the accepted strategy fields set; none accepted, no strategy in the reply.
  const set: Record<string, unknown> = {};
  for (const e of accepted) {
    const f = FIELD_OF.get(e.path);
    if (f) set[f] = e.to;
  }
  const strategy = Object.keys(set).length === 0 ? undefined : ({ ...structuredClone(draft.strategy), ...set } as Strategy);
  return settle({ ...(strategy ? { strategy } : {}), edits: accepted, line: cleanLine(read.line) }, refused);
}
