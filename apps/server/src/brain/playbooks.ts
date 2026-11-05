/**
 * When a seat's brain asks for its playbooks, and which takes effect (spec A RULE-A2, AM-A16): the month's land write
 * carries the land grant's and the development's edits, taken at each of those phases' start; the auction's is asked in
 * the production show and taken at the auction's start.
 */
import { BRAIN, type GameState, type Playbook, type PlayerId } from '@mule/engine';
import {
  landBrief,
  phaseBrief,
  playbookFrom,
  toolsFor,
  WRITER_SYSTEM,
  type AiSeat,
  type EditPhase,
  type Feedback,
  type PhaseFact,
  type PlaybookSource,
  type ValidatePlan,
  type WhatIfSim,
  type WriterReply,
} from '@mule/ai';
import type { PlaybookNote } from '../mule-game.js';
import { WRITE_CALLS } from './client.js';
import { timeSlicer } from './slice.js';
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
  /** A land ask's draft development for the month, whose edits ride on the land write (PM ruling, 5 Nov, option C). */
  development?: Playbook | null;
}

const isDevelopmentPath = (path: string | null) => path !== null && path.startsWith('/development/');

/**
 * A land write's reply as two: the land grant's (strategy, land edits, the line, every other refusal) and the
 * development's (its edits and refusals), or null when it has none of either.
 */
function splitDevelopment(written: WriterReply): { land: WriterReply; development: WriterReply | null } {
  const { reply, refused } = written;
  const devEdits = reply.edits.filter((e) => isDevelopmentPath(e.path));
  const devRefused = refused.filter((r) => isDevelopmentPath(r.path));
  const land: WriterReply = { reply: { ...reply, edits: reply.edits.filter((e) => !isDevelopmentPath(e.path)) }, refused: refused.filter((r) => !isDevelopmentPath(r.path)) };
  if (devEdits.length === 0 && devRefused.length === 0) return { land, development: null };
  return { land, development: { reply: { edits: devEdits, line: null }, refused: devRefused } };
}

/** Two feedbacks as one: the land write's, and the development part's it carried. */
function joined(a: Feedback | null, b: Feedback | null): Feedback | null {
  if (!a || !b) return a ?? b;
  return { refused: [...a.refused, ...b.refused], rejected: [...a.rejected, ...b.rejected] };
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
  /** The writes still open, so a trial can let them settle before the land grant (settle). */
  private readonly open = new Set<Promise<unknown>>();
  /** Each seat's open ask for the development or the auction, by `${seat}/${phase}`. */
  private readonly phaseAsks = new Map<string, Ask>();
  /** What the last reply for each seat's development or auction had refused, for that phase's next brief. */
  private readonly phaseFeedback = new Map<string, Feedback>();

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
        // What the rules and the writer refused of last month's reply. The seat's last PhaseOutcome joins it once its
        // producers write one (land: WS3; development and auction: WS9's playbook/outcome.ts); until then the brief
        // says nothing of it.
        const last = { feedback: joined(this.feedback.get(seat.id) ?? null, this.phaseFeedback.get(`${seat.id}/development`) ?? null) };
        // The month's development rides on the land write, so its edits land every month (PM ruling, 5 Nov, option C).
        let development: Playbook | null = null;
        try {
          development = seat.draft(state, 'development', month);
        } catch (err) {
          console.error(`playbooks: seat ${seat.id} has no development draft for month ${month}: ${messageOf(err)}`);
        }
        const brief = landBrief(state, seat.mind, seat.brain.persona, drafted.land, seat.brain.heard(), last, development?.development ?? null);
        const ask: Ask = { month, draft: drafted.playbook, written: null, started: false, controller: new AbortController(), development };
        this.asks.set(seat.id, ask);
        seat.playbookAsked(month);
        const waitMs = WRITE_CALLS.strategy.timeoutMs;
        // The tools answer from the game as it is now, when it is asked: a game that moves on changes no answer.
        const tools = toolsFor(state, seat.id, this.simFor(state, seat.id, drafted.playbook, source.validate));
        const write = writer.write('strategy', { brief, system: WRITER_SYSTEM, waitMs, late: () => ask.started, signal: ask.controller.signal, tools }).then(
          (written) => {
            if (!ask.started) ask.written = written;
          },
          (err: unknown) => console.error(`playbooks: seat ${seat.id}'s write failed: ${messageOf(err)}`),
        );
        this.open.add(write);
        void write.finally(() => this.open.delete(write));
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
    // A month takes about 0.3s: played in slices, so every other room's ticks keep their cadence meanwhile.
    return { seats, playbook: (edits) => validate(asked, seat, draft, edits), pause: timeSlicer(BRAIN.whatIfSliceMs) };
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
        // The land grant plays the land part; the development part waits for its phase's start (takePhase).
        if (asked.written) {
          const { land, development } = splitDevelopment(asked.written);
          asked.written = land;
          if (development && asked.development) {
            this.phaseAsks.set(`${seat.id}/development`, { month: state.month, draft: asked.development, written: development, started: false, controller: new AbortController() });
          }
        }
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

  /**
   * Asks each Smart seat's writer for its edits to `phase` in the slack before it: the game asks the auction's in the
   * production show (spec A RULE-A2, AM-A16), with the development's outcome from `facts`, its public facts read before
   * they reset. Returns at once; the phase's start (takePhase) cancels a call still open. No whatIf: its month sim plays
   * land-grant playbooks.
   */
  askPhase(state: GameState, phase: EditPhase, facts: readonly PhaseFact[]): void {
    if (!this.options.source) return;
    for (const seat of this.options.seats) {
      const writer = this.writers.get(seat.id);
      if (!writer) continue;
      const key = `${seat.id}/${phase}`;
      try {
        const draft = seat.draft(state, phase);
        const outcome = phase === 'auction' ? seat.outcome('development', state, facts) : null;
        const brief = phaseBrief(state, seat.mind, seat.brain.persona, draft, phase, seat.brain.heard(), { outcome, feedback: this.phaseFeedback.get(key) ?? null });
        const ask: Ask = { month: state.month, draft, written: null, started: false, controller: new AbortController() };
        this.phaseAsks.set(key, ask);
        const waitMs = WRITE_CALLS.playbook.timeoutMs;
        const write = writer
          .write('playbook', { brief, system: WRITER_SYSTEM, waitMs, late: () => ask.started, signal: ask.controller.signal, tools: toolsFor(state, seat.id) })
          .then(
            (written) => {
              if (!ask.started) ask.written = written;
            },
            (err: unknown) => console.error(`playbooks: seat ${seat.id}'s ${phase} write failed: ${messageOf(err)}`),
          );
        this.open.add(write);
        void write.finally(() => this.open.delete(write));
      } catch (err) {
        console.error(`playbooks: seat ${seat.id} could not ask for its ${phase}: ${messageOf(err)}`);
      }
    }
  }

  /**
   * `phase` has started: a call still open for it is cancelled and its reply would be late. A reply that came in time
   * is validated against the draft its brief showed; only a playbook carrying Claude's accepted edits is adopted and
   * recorded. Otherwise nothing is adopted, so the seat plays the phase its own way (today's hands while
   * AI_PLANS.ownPhases is off). The reply's feedback is kept for that phase's next brief.
   */
  takePhase(state: GameState, phase: EditPhase): void {
    for (const seat of this.options.seats) {
      const key = `${seat.id}/${phase}`;
      const ask = this.phaseAsks.get(key);
      if (!ask || ask.month !== state.month) continue;
      ask.started = true;
      ask.controller.abort();
      this.phaseAsks.delete(key);
      if (!ask.written) continue;
      let made: ReturnType<typeof playbookFrom>;
      try {
        made = playbookFrom(seat.validator(), state, ask.draft, ask.written);
      } catch (err) {
        console.error(`playbooks: validatePlan failed for seat ${seat.id}'s ${phase}, it plays its own way: ${messageOf(err)}`);
        continue;
      }
      if (made.feedback) this.phaseFeedback.set(key, made.feedback);
      if (made.playbook.by !== 'llm') continue;
      seat.adopt(made.playbook);
      this.options.record?.({ seat: seat.id, month: state.month, phase, playbook: made.playbook });
    }
  }

  /**
   * Settles once every write open now has: for the trial, which has no people to wait for in planning and so lets each
   * write run to its wait before the land grant, as an untimed planning would. Each is bounded by its kind's timeout.
   */
  async settle(): Promise<void> {
    if (this.open.size > 0) await Promise.allSettled([...this.open]);
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
