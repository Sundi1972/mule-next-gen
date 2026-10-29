/**
 * brain:social-spike: what a seat's social reasoning costs on Haiku 5.5 and Sonnet 5.5, folded into the strategy call,
 * as its own call, and as a reply to one whisper. Spends real money; cap = min(--max-usd, BRAIN.socialSpike.capUsd).
 */
import { BRAIN } from '@mule/engine';
import type { MainDeps, StopReason } from './cli.js';
import type { Usage } from './ledger.js';
import type { BriefPoint, Brief, Cause, Bound, ModelRole, SpikeCall, SpikePrompt, StrategyOutcome, StrategyReply, Verdict } from './strategy-spike.js';

const C = BRAIN.socialSpike;

export const MODES = ['folded', 'separate', 'reply'] as const;
export type Mode = (typeof MODES)[number];

export const SOCIAL_SCHEMA = {} as const;
export const FOLDED_SCHEMA = {} as const;
export const REPLY_SCHEMA = {} as const;

export const ASK = 'Decide where you stand with each player and why, what you want from each and how you will win them, and up to 3 messages to send now (to a player or the table). If you will run for office, your campaign line.';

export function socialSection(_point: BriefPoint): string {
  throw new Error('NotImplemented: social-section');
}

export interface PlannedCall {
  n: number;
  role: ModelRole;
  mode: Mode;
  point: BriefPoint;
  prompt: SpikePrompt;
  worstUsd: number;
}

export function planCalls(_points: readonly BriefPoint[], _haiku: number, _sonnet: number): PlannedCall[] {
  throw new Error('NotImplemented: plan-calls');
}

export const SOCIAL_CAUSES = ['refused', 'cut_off', 'not_json', 'bad_shape', 'bad_enum', 'too_many_messages', 'text_too_long'] as const;
export type SocialCause = (typeof SOCIAL_CAUSES)[number];

export interface SocialVerdict {
  valid: boolean;
  cause: SocialCause | null;
  messages: number | null;
  facts: number | null;
  strategy: Verdict | null;
}

export function judgeSocial(_call: Pick<PlannedCall, 'mode' | 'point'>, _text: string, _stopReason: StrategyReply['stopReason'] = 'end_turn'): SocialVerdict {
  throw new Error('NotImplemented: judge-social');
}

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
  answered: number;
  valid: number | null;
  p50: number | null;
  p90: number | null;
  meanInput: number | null;
  meanCached: number | null;
  meanCacheWrite: number | null;
  meanOutput: number | null;
  meanThinking: number | null;
  meanUsd: number | null;
  usd: number;
}

export interface SocialReport {
  planned: number;
  made: number;
  stopped: StopReason;
  cap: number;
  ledgerUsd: number;
  countedUsd: number;
  rows: SocialRow[];
}

export interface SocialRunOptions {
  calls: PlannedCall[];
  call: SpikeCall;
  writeLedger: (line: SocialLine) => void;
  writeReply: (line: ReplyLine) => void;
  cap: number;
  claim?: () => void;
  now: () => Date;
  log: (line: string) => void;
}

export async function runSocialSpike(_options: SocialRunOptions): Promise<SocialReport> {
  throw new Error('NotImplemented: run-social-spike');
}

export function renderReport(_r: SocialReport): string[] {
  throw new Error('NotImplemented: render-report');
}

export async function main(_argv: readonly string[], _env: Readonly<Record<string, string | undefined>>, _deps: MainDeps = {}): Promise<number> {
  void C;
  throw new Error('NotImplemented: social-spike main');
}
