/** When a seat's brain asks for its land-grant playbook, and which playbook takes effect when the land grant starts. */
import type { GameState, Playbook, PlayerId } from '@mule/engine';
import { landBrief, STRATEGY_SYSTEM, type AiSeat, type LandDraft, type Refusal, type ValidatePlan, type WriterReply } from '@mule/ai';
import type { PlaybookNote } from '../mule-game.js';
import { WRITE_CALLS } from './client.js';
import type { BrainService, PlaybookWriter } from './index.js';

/** The engine's side of a playbook: the seat's draft for the state, and the validator every playbook passes. */
export interface PlaybookSource {
  draft(state: GameState, seat: PlayerId): { playbook: Playbook; land: LandDraft };
  validate: ValidatePlan;
}

/** None until the engine drafts and validates playbooks: with no source, no seat asks and no playbook is written. */
export const ENGINE_SOURCE: PlaybookSource | null = null;

export interface PlaybooksOptions {
  brain: BrainService;
  source: PlaybookSource | null;
  seats: readonly AiSeat[];
  /** Hears each playbook that takes effect for a Smart seat. */
  record?: (note: PlaybookNote) => void;
}

/** What a seat's last reply had refused or rejected: kept for its next brief, never played. */
export interface Feedback {
  refused: Refusal[];
  rejected: NonNullable<Playbook['rejected']>;
}

/** A seat's ask for one month's land grant: the reply once it came in time, and whether that grant has started. */
interface Ask {
  month: number;
  written: WriterReply | null;
  started: boolean;
}

/** How long a write call may wait: its kind's timeout, cut to the time left before its phase when that start is known. */
export function writeWaitMs(timeoutMs: number, msLeft: number | null): number {
  return msLeft === null ? timeoutMs : Math.min(timeoutMs, msLeft);
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Each Smart seat's land-grant playbook: asked for without waiting, at game start and as each upkeep opens, and taken
 * at the land grant's start from the reply that came before it, if any, else from the engine's draft. Never throws
 * into the game.
 */
export class Playbooks {
  private readonly writers = new Map<PlayerId, PlaybookWriter>();
  private readonly asks = new Map<PlayerId, Ask>();
  private readonly playing = new Map<string, Playbook>();
  private readonly feedback = new Map<PlayerId, Feedback>();

  constructor(private readonly options: PlaybooksOptions) {
    if (!options.source) return;
    for (const seat of options.seats) {
      const writer = options.brain.writerFor({ id: seat.id, persona: seat.options.persona, level: seat.options.level });
      if (writer) this.writers.set(seat.id, writer);
    }
  }

  /**
   * Asks each Smart seat's writer for its strategy and land-grant edits for `month`'s land grant, and returns at once.
   * Nothing is asked for a month past the game's last. The land grant's start time is not known yet, so the call waits
   * its kind's whole timeout; a reply after the grant started is never played.
   */
  ask(state: GameState, month: number): void {
    const { source } = this.options;
    if (!source || month > state.maxMonths) return;
    for (const seat of this.options.seats) {
      const writer = this.writers.get(seat.id);
      if (!writer) continue;
      try {
        const brief = landBrief(state, seat.mind, seat.brain.persona, source.draft(state, seat.id).land, seat.brain.heard());
        const ask: Ask = { month, written: null, started: false };
        this.asks.set(seat.id, ask);
        const waitMs = writeWaitMs(WRITE_CALLS.strategy.timeoutMs, null);
        writer.write('strategy', { brief, system: STRATEGY_SYSTEM, waitMs, late: () => ask.started }).then(
          (written) => {
            if (!ask.started) ask.written = written;
          },
          (err: unknown) => console.error(`playbooks: seat ${seat.id}'s write failed: ${messageOf(err)}`),
        );
      } catch (err) {
        console.error(`playbooks: seat ${seat.id} could not ask: ${messageOf(err)}`);
      }
    }
  }

  /** The land grant has started: each seat's playbook for this month takes effect, and later replies for it are late. */
  takeEffect(state: GameState): void {
    const { source } = this.options;
    if (!source) return;
    for (const seat of this.options.seats) {
      const ask = this.asks.get(seat.id);
      const asked = ask?.month === state.month ? ask : null;
      if (asked) asked.started = true;
      try {
        const draft = source.draft(state, seat.id).playbook;
        this.playing.set(`${seat.id}/${state.month}`, this.decide(state, seat.id, draft, asked?.written ?? null, source.validate));
      } catch (err) {
        console.error(`playbooks: seat ${seat.id} has no draft for month ${state.month}: ${messageOf(err)}`);
      }
    }
  }

  /** The playbook in effect for a seat's land grant in `month`; null before it starts, or with no source. */
  playbookFor(seat: PlayerId, month: number): Playbook | null {
    return this.playing.get(`${seat}/${month}`) ?? null;
  }

  /** What the seat's last reply had refused or rejected; null before one came in time. */
  feedbackFor(seat: PlayerId): Feedback | null {
    return this.feedback.get(seat) ?? null;
  }

  /**
   * The playbook that takes effect: the engine's draft unless a reply came in time with an edit the validator accepts;
   * then the validator's playbook, by 'llm'. The writer's refusals never reach the playbook, only the next brief.
   */
  private decide(state: GameState, seat: PlayerId, draft: Playbook, written: WriterReply | null, validate: ValidatePlan): Playbook {
    const engine: Playbook = { ...draft, by: 'engine' };
    if (!written) return engine;
    const { edits } = written.reply;
    const feedback: Feedback = { refused: written.refused, rejected: [] };
    this.feedback.set(seat, feedback);
    if (edits.length === 0) return engine;
    let result: ReturnType<ValidatePlan>;
    try {
      result = validate(state, seat, draft, edits);
    } catch (err) {
      console.error(`playbooks: validatePlan failed for seat ${seat}, the engine's playbook plays: ${messageOf(err)}`);
      return engine;
    }
    feedback.rejected = result.rejected;
    if (result.rejected.length >= edits.length) return engine;
    return { ...result.playbook, by: 'llm', rejected: result.rejected };
  }
}
