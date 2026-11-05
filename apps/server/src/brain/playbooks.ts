/** When a seat's brain asks for its land-grant playbook, and which playbook takes effect when the land grant starts. */
import type { GameState, Playbook, PlayerId } from '@mule/engine';
import { landBrief, playbookFrom, toolsFor, WRITER_SYSTEM, type AiSeat, type Feedback, type PlaybookSource, type ValidatePlan, type WhatIfSim, type WriterReply } from '@mule/ai';
import type { PlaybookNote } from '../mule-game.js';
import { WRITE_CALLS } from './client.js';
import type { BrainService, PlaybookWriter } from './index.js';

export type { PlaybookSource };

export interface PlaybooksOptions {
  brain: BrainService;
  source: PlaybookSource | null;
  seats: readonly AiSeat[];
  /** Hears each playbook that takes effect for a Smart seat. */
  record?: (note: PlaybookNote) => void;
}

export type { Feedback };

/**
 * A seat's ask for one month's land grant: the draft its brief showed, the reply once it came in time, whether that
 * grant has started, and the cancel for its call.
 */
interface Ask {
  month: number;
  draft: Playbook;
  written: WriterReply | null;
  started: boolean;
  controller: AbortController;
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
   * Nothing is asked for a month past the game's last. The call waits at most its kind's timeout, and the land grant's
   * start cancels it; a reply after the grant started is never played.
   */
  ask(state: GameState, month: number): void {
    const { source } = this.options;
    if (!source || month > state.maxMonths) return;
    for (const seat of this.options.seats) {
      const writer = this.writers.get(seat.id);
      if (!writer) continue;
      try {
        const drafted = source.draft(state, seat.id);
        const brief = landBrief(state, seat.mind, seat.brain.persona, drafted.land, seat.brain.heard());
        const ask: Ask = { month, draft: drafted.playbook, written: null, started: false, controller: new AbortController() };
        this.asks.set(seat.id, ask);
        seat.playbookAsked(month);
        const waitMs = WRITE_CALLS.strategy.timeoutMs;
        // The tools answer from the game as it is now, when it is asked: a game that moves on changes no answer.
        const tools = toolsFor(state, seat.id, this.simFor(state, seat.id, drafted.playbook, source.validate));
        writer.write('strategy', { brief, system: WRITER_SYSTEM, waitMs, late: () => ask.started, signal: ask.controller.signal, tools }).then(
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

  /**
   * What whatIf plays a month with for `seat`: every AI seat as it plays, with its own seed, and each person's seat as
   * the engine's Trader would play it; and the seat's draft with the model's edits, checked by the validator against
   * the game as it was when it was asked.
   */
  private simFor(state: GameState, seat: PlayerId, draft: Playbook, validate: ValidatePlan): WhatIfSim {
    const asked = structuredClone(state);
    const seats = state.players.map((p, i) => {
      const ai = this.options.seats.find((s) => s.id === p.id);
      if (ai) return { id: p.id, persona: ai.options.persona, level: ai.options.level, seed: ai.options.seed };
      // literal-ok: a person's seat in a what-if month is a Trader, seeded by seat order: not balance
      return { id: p.id, persona: 'trader' as const, level: 'trader' as const, seed: (i * 7_919 + 1) >>> 0 };
    });
    return { seats, playbook: (edits) => validate(asked, seat, draft, edits) };
  }

  /**
   * The land grant has started: each seat's playbook for this month takes effect, a call still open for it is
   * cancelled (freeing the seat at once), and later replies for it are late. Each seat's feedback is this month's.
   */
  takeEffect(state: GameState): void {
    const { source } = this.options;
    if (!source) return;
    for (const seat of this.options.seats) {
      const ask = this.asks.get(seat.id);
      const asked = ask?.month === state.month ? ask : null;
      if (asked) {
        asked.started = true;
        asked.controller.abort();
      }
      this.feedback.delete(seat.id);
      let now: Playbook;
      try {
        now = source.draft(state, seat.id).playbook;
      } catch (err) {
        console.error(`playbooks: seat ${seat.id} has no draft for month ${state.month}: ${messageOf(err)}`);
        continue;
      }
      const playbook = this.decide(state, seat.id, now, asked, source.validate);
      this.playing.set(`${seat.id}/${state.month}`, playbook);
      if (!this.writers.has(seat.id)) continue;
      // In effect from the grant on: adopted only here, at this month's grant, never at the upkeep that asked for next
      // month's, since adopt keeps the newest month's playbooks only (WS9).
      seat.adopt(playbook);
      this.options.record?.({ seat: seat.id, month: state.month, phase: 'landGrant', playbook });
    }
  }

  /** The playbook in effect for a seat's land grant in `month`; null before it starts, or with no source. */
  playbookFor(seat: PlayerId, month: number): Playbook | null {
    return this.playing.get(`${seat}/${month}`) ?? null;
  }

  /** What the seat's reply for this month's land grant had refused or rejected; null when none came in time. */
  feedbackFor(seat: PlayerId): Feedback | null {
    return this.feedback.get(seat) ?? null;
  }

  /**
   * The playbook that takes effect, by playbookFrom. A reply that came in time has its edits validated against the
   * draft its brief showed, never a later one whose plan letters may name other plots; only a playbook by 'llm' comes
   * from that draft. Otherwise (no reply, nothing accepted, a validator that throws) the engine's draft `now` plays.
   * The reply's feedback is kept either way.
   */
  private decide(state: GameState, seat: PlayerId, now: Playbook, asked: Ask | null, validate: ValidatePlan): Playbook {
    const engine: Playbook = { ...now, by: 'engine' };
    const written: WriterReply | null = asked?.written ?? null;
    if (!asked || !written) return engine;
    let made: ReturnType<typeof playbookFrom>;
    try {
      made = playbookFrom(validate, state, asked.draft, written);
    } catch (err) {
      console.error(`playbooks: validatePlan failed for seat ${seat}, the engine's playbook plays: ${messageOf(err)}`);
      made = { playbook: engine, feedback: { refused: written.refused, rejected: [] } };
    }
    if (made.feedback) this.feedback.set(seat, made.feedback);
    return made.playbook.by === 'llm' ? made.playbook : engine;
  }
}
