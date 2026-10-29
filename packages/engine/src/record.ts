/** A game's record: every input it read, in order, so the server can replay it exactly. Types and pure helpers only. */
import * as config from './config.js';
import type { AuctionSide, Good, Phase } from './types.js';
import type { Playbook, PlayerId, PlotIndex, Strategy } from './playbook.js';

/** Claude's answer as play used it: the structural subset of @mule/ai's Choice. */
export interface RecordedChoice { optionId: string; line: string | null; by: 'top' | 'llm' | 'fallback'; note?: string }

/** A brain call: a move pick (an option letter) or a playbook writer call. Numbered per seat across kinds. */
export type CallKind = 'move' | 'strategy' | 'playbook';

/**
 * The writer's checked reply, before validatePlan; never raw model text. `cause` is the writer's code when the reply
 * was unusable. The replay returns it as it is, and validatePlan and the engine draft re-derive the playbook.
 */
export interface RecordedWrite {
  strategy?: Strategy;
  edits: { path: string; to: unknown; reason: string }[];
  line: string | null;
  cause?: string;
}

/** What every step carries: when, its place in order, and what the game read during it. */
export interface RecordStep {
  at: number;                       // ms since GameRecord.t0
  seq: number;                      // index of this step among the record's steps
  reads?: number[];                 // ctx.now() values the game read, ms since t0, in order
  hosts?: (PlayerId | null)[];      // ctx.hostId() values, in order
  decides?: { seat: PlayerId; call: number; kind: CallKind; choice?: RecordedChoice; write?: RecordedWrite; error?: string; pending?: true }[];
}

export type RecordEvent<Intent> =
  | (RecordStep & { type: 'start' })
  | (RecordStep & { type: 'fire'; timer: number })
  | (RecordStep & { type: 'intent'; seat: PlayerId; intent: Intent; refused?: string })
  | (RecordStep & { type: 'connection'; seat: PlayerId; connected: boolean })
  | (RecordStep & { type: 'moved'; seat: PlayerId })
  | (RecordStep & { type: 'heard'; from: PlayerId; to?: PlayerId })   // who spoke to whom, never the words
  | (RecordStep & { type: 'answer'; seat: PlayerId; call: number; kind: CallKind; choice?: RecordedChoice; write?: RecordedWrite; error?: string })
  | NoticeEntry
  | PlaybookEntry;

/** A public fact as it settled; derived, so the replay ignores it. */
export type NoticeEntry = { type: 'notice'; at: number; seq: number; month: number; phase: Phase } & (
  | { kind: 'claim'; seat: PlayerId; plot: PlotIndex }
  | { kind: 'declare'; seat: PlayerId; good: Good; side: AuctionSide }
  | { kind: 'trade'; good: Good; buyer: PlayerId | 'store' | 'ship'; seller: PlayerId | 'store'; price: number; qty: number }
  | { kind: 'sale'; item: 'plot' | 'mule'; plot: PlotIndex; seller: PlayerId; buyer: PlayerId | 'store'; price: number }
);

/** As frozen in playbook schema v1. */
export type PlaybookEntry = { type: 'playbook'; at: number; seq: number; seat: PlayerId; month: number; phase: Playbook['phase']; playbook: Playbook };

export interface GameRecord<Intent> {
  v: 1;
  seed: number;
  configFingerprint: string;        // sha256 of stableJson(configSnapshot()), hex
  options: { maxMonths?: number; phaseScale?: number; politics: boolean };
  seats: { id: PlayerId; name: string; isAi: boolean; color: number; pick?: string; smart: boolean }[];
  t0: number;                       // the room clock when recording began, epoch ms
  events: RecordEvent<Intent>[];
  outcome?: { scores: Record<PlayerId, number>; stateHash: string };
}

/** Every value config.ts exports, as plain data: what a record's config fingerprint is taken over. */
export function configSnapshot(): Record<string, unknown> {
  return Object.fromEntries(Object.entries(config).filter(([, value]) => typeof value !== 'function'));
}

/** JSON with every object's keys sorted, so equal values always serialise to equal text. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}
