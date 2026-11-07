/**
 * When a seat's brain asks for its playbooks, and which takes effect (spec A RULE-A2, AM-A16): the month's land write
 * carries the land grant's and the development's edits, taken at each of those phases' start; the auction's is asked in
 * the production show and taken at the auction's start.
 */
import { BRAIN, type GameState, type Playbook, type PlayerId } from '@mule/engine';
import {
  atAuctionStart,
  landBrief,
  newPlots,
  ownedPlots,
  phaseBrief,
  playbookFrom,
  resolveGranted,
  toolsFor,
  WRITER_SYSTEM,
  type AiSeat,
  type EditPhase,
  type Feedback,
  type LastPhase,
  type PhaseFact,
  type PlaybookSource,
  type ValidatePlan,
  type WhatIfSim,
  type WriterReply,
  type WorthAt,
  worthNow,
} from '@mule/ai';
import type { PlaybookNote } from '../mule-game.js';
import type { Spoken } from './chat.js';
import { WRITE_CALLS } from './client.js';
import { timeSlicer } from './slice.js';
import type { BrainService, PlaybookWriter } from './index.js';
import type { SeatKind } from '../claude-seat/seats.js';

export type { PlaybookSource };

export interface PlaybooksOptions {
  brain: BrainService;
  source: PlaybookSource | null;
  seats: readonly AiSeat[];
  /** Each seat's kind; a seat not in it plays builtin. */
  kinds?: ReadonlyMap<PlayerId, SeatKind>;
  /** Hears each playbook that takes effect for a Smart seat. */
  record?: (note: PlaybookNote) => void;
  /**
   * Hears Claude's line from a plan that came in time, as the plan's phase starts: the land write's at the land grant,
   * the auction's at the auction (PM ruling a', 5 Nov). The game says it through the seat's chat, inside its caps.
   */
  speak?: (seat: PlayerId, said: PlanLine) => void;
  /** How long a write may take, by kind, instead of WRITE_CALLS': brain:trial --deep, whose calls think longer. */
  waitMs?: Partial<Record<'strategy' | 'playbook', number>>;
}

/** A plan's line as the game hears it: a decision's spoken fields, said by Claude at the plan's phase. */
export type PlanLine = Pick<Spoken, 'month'> & { line: string; phase: 'landGrant' | EditPhase };

/**
 * Whether a plan's line goes to the table: its edits are played, or it proposed none and had none refused, so it keeps
 * the draft the seat plays. A plan whose edits were refused says nothing: the table never hears a plan not played.
 */
const saysPlan = (written: WriterReply, by: Playbook['by']) => by === 'llm' || (written.reply.edits.length === 0 && written.refused.length === 0);

export type { Feedback };

/**
 * A seat's ask for one month's land grant: the reply once it came in time, whether that grant has started, and the
 * cancel for its call. The edits go onto the phase's draft at its start (AM-A17), so the draft shown is not kept.
 */
interface Ask {
  month: number;
  /** An auction ask's role for each good its brief showed: an edit to a good whose role has changed by the auction's start is not played. */
  roles?: Readonly<Record<string, string>>;
  written: WriterReply | null;
  started: boolean;
  controller: AbortController;
  /** A land ask's draft development for the month, whose edits ride on the land write (PM ruling, 5 Nov, option C). */
  development?: Playbook | null;
  /**
   * The seat's plots when its land write was asked, at upkeep before the grant (no plot changes hands between them):
   * a land ask's, and the development part's it carried, against which a route's "granted" plot is found (B fix 4 a).
   */
  owned?: ReadonlySet<number>;
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
  /** The phase's draft of each seat kept past its start (C7), made as the phase started, by `${seat}/${phase}`. */
  private readonly keptDrafts = new Map<string, ReturnType<AiSeat['draft']>>();
  /** Every seat's Worth when each seat's last land plan was asked, for the result line of its next. */
  private readonly worthAtAsk = new Map<PlayerId, WorthAt>();

  constructor(private readonly options: PlaybooksOptions) {
    if (!options.source) return;
    for (const seat of options.seats) {
      const kind = options.kinds?.get(seat.id);
      const writer = options.brain.writerFor({ id: seat.id, persona: seat.options.persona, level: seat.options.level, ...(kind ? { kind } : {}) });
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
        // Asked at upkeep, the month just played is still state.month, so the seat's development outcome is that
        // month's route; null at game start, or when the month's development played no route.
        const last = {
          outcome: seat.outcome('development', state),
          feedback: joined(this.feedback.get(seat.id) ?? null, this.phaseFeedback.get(`${seat.id}/development`) ?? null),
          worthBefore: this.worthAtAsk.get(seat.id) ?? null,
          ownStrategy: this.ownStrategy(seat.id, month),
        };
        this.worthAtAsk.set(seat.id, { month, worth: worthNow(state) });
        // The month's development rides on the land write, so its edits land every month (PM ruling, 5 Nov, option C).
        let development: Playbook | null = null;
        try {
          development = seat.draft(state, 'development', month);
        } catch (err) {
          console.error(`playbooks: seat ${seat.id} has no development draft for month ${month}: ${messageOf(err)}`);
        }
        // The mind for the month briefed: asked at upkeep, this month's adopted fields never shape next month's plans.
        const brief = landBrief(state, seat.mindFor(month), seat.brain.persona, drafted.land, seat.brain.heard(), last, development?.development ?? null);
        const ask: Ask = { month, written: null, started: false, controller: new AbortController(), development, owned: ownedPlots(state, seat.id) };
        this.asks.set(seat.id, ask);
        seat.playbookAsked(month);
        const waitMs = this.options.waitMs?.strategy ?? WRITE_CALLS.strategy.timeoutMs;
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
            this.phaseAsks.set(`${seat.id}/development`, { month: state.month, written: development, started: false, controller: new AbortController(), owned: asked.owned });
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
      // The land part's line: the development part carries none, and is said nothing at its start.
      if (asked?.written && saysPlan(asked.written, playbook.by)) this.speak(seat.id, asked.written.reply.line, state.month, 'landGrant');
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
        // The auction is asked in the production show: it is drafted and briefed on the game as the auction will open,
        // its events and posted prices included, as the engine's own seats draft at its start.
        const view = phase === 'auction' ? atAuctionStart(state) : state;
        const draft = seat.draft(view, phase);
        const outcome = phase === 'auction' ? seat.outcome('development', state, facts) : null;
        const brief = phaseBrief(view, seat.mind, seat.brain.persona, draft, phase, seat.brain.heard(), {
          outcome,
          feedback: this.phaseFeedback.get(key) ?? null,
          worthBefore: this.worthAtAsk.get(seat.id) ?? null,
        });
        const roles = Object.fromEntries(Object.entries(draft.auction ?? {}).map(([g, plan]) => [g, plan.role]));
        const ask: Ask = { month: state.month, roles, written: null, started: false, controller: new AbortController() };
        this.phaseAsks.set(key, ask);
        const waitMs = this.options.waitMs?.playbook ?? WRITE_CALLS.playbook.timeoutMs;
        const write = writer
          .write('playbook', { brief, system: WRITER_SYSTEM, waitMs, late: () => ask.started, signal: ask.controller.signal, tools: toolsFor(view, seat.id) })
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
   * is applied to the phase's draft as it starts (AM-A17); only a playbook carrying Claude's accepted edits is adopted and
   * recorded. Otherwise nothing is adopted, so the seat plays the phase its own way (today's hands while
   * AI_PLANS.ownPhases is off). The reply's feedback is kept for that phase's next brief.
   *
   * A seat in `keep` with this month's ask is left asking (C7): its ask stays open, it is drafted now, and takeSeat takes
   * it later on that draft. Returns the seats kept.
   */
  takePhase(state: GameState, phase: EditPhase, keep: ReadonlySet<PlayerId> = new Set()): PlayerId[] {
    const kept: PlayerId[] = [];
    for (const seat of this.options.seats) {
      const key = `${seat.id}/${phase}`;
      const ask = this.phaseAsks.get(key);
      if (!ask || ask.month !== state.month) continue;
      if (keep.has(seat.id)) {
        try {
          this.keptDrafts.set(key, seat.draft(state, phase));
        } catch (err) {
          console.error(`playbooks: seat ${seat.id}'s ${phase} could not be drafted at its start, it is drafted when taken: ${messageOf(err)}`);
        }
        kept.push(seat.id);
        continue;
      }
      this.take(state, phase, seat, ask);
    }
    return kept;
  }

  /**
   * Takes one seat kept at `phase`'s start (C7): its ask is cancelled, and a reply that came is applied to the draft made
   * as the phase started, as takePhase would have; with none, the seat plays its own way. Nothing open: nothing happens.
   */
  takeSeat(state: GameState, phase: EditPhase, seatId: PlayerId): void {
    const key = `${seatId}/${phase}`;
    const held = this.keptDrafts.get(key);
    this.keptDrafts.delete(key);
    const seat = this.options.seats.find((s) => s.id === seatId);
    const ask = this.phaseAsks.get(key);
    if (!seat || !ask || ask.month !== state.month) return;
    this.take(state, phase, seat, ask, held);
  }

  /** Whether this month's ask for the seat's `phase` is still open with its reply come. Reads only. */
  answered(state: GameState, seatId: PlayerId, phase: EditPhase): boolean {
    const ask = this.phaseAsks.get(`${seatId}/${phase}`);
    return ask !== undefined && ask.month === state.month && ask.written !== null;
  }

  /** One seat's ask at its phase's start: cancelled, and its reply, if one came, applied to the draft (`held`, or made now). */
  private take(state: GameState, phase: EditPhase, seat: AiSeat, ask: Ask, held?: ReturnType<AiSeat['draft']>): void {
    const key = `${seat.id}/${phase}`;
    ask.started = true;
    ask.controller.abort();
    this.phaseAsks.delete(key);
    if (!ask.written) return;
    let made: ReturnType<typeof playbookFrom>;
    try {
      // The edits go onto the phase's draft as it starts, the one the engine's own seat would play (AM-A17): the
      // development's was shown at upkeep, before the land grant changed what the seat owns; the auction's in
      // production, before the store posted its prices and the month's events ran.
      const draft = held ?? seat.draft(state, phase);
      const flips = withoutFlippedGoods(ask.written, ask.roles, draft);
      // A route's "granted" plot is the one the seat gained since its land write was asked: found in the ranking of
      // the land playbook that took effect, else a land-auction win (B fix 4 a).
      const granted = this.withGranted(flips.written, state, seat.id, ask.owned);
      const written = granted.written;
      const dropped = [...flips.dropped, ...granted.dropped];
      made = playbookFrom(seat.validator(), state, draft, written);
      if (dropped.length > 0 && made.feedback) {
        // One new list for both: by 'llm', the feedback and the playbook share playbookFrom's rejected array.
        const rejected = [...made.feedback.rejected, ...dropped];
        made = { feedback: { ...made.feedback, rejected }, playbook: made.playbook.by === 'llm' ? { ...made.playbook, rejected } : made.playbook };
      }
    } catch (err) {
      console.error(`playbooks: seat ${seat.id}'s ${phase} could not be drafted or validated, it plays its own way: ${messageOf(err)}`);
      return;
    }
    if (made.feedback) this.phaseFeedback.set(key, made.feedback);
    // The development part carries no line: the land write's was said at the land grant.
    if (saysPlan(ask.written, made.playbook.by)) this.speak(seat.id, ask.written.reply.line, state.month, phase);
    if (made.playbook.by !== 'llm') return;
    seat.adopt(made.playbook);
    this.options.record?.({ seat: seat.id, month: state.month, phase, playbook: made.playbook });
  }

  /**
   * The reply with its route's "granted" steps on the plot the seat gained since `owned` was taken, or cut where no plot
   * was gained; what was cut comes back as dropped. A reply asked without `owned` (none rides on a land write) is kept.
   */
  private withGranted(written: WriterReply, state: GameState, seat: PlayerId, owned: ReadonlySet<number> | undefined): { written: WriterReply; dropped: NonNullable<Playbook['rejected']> } {
    if (!owned) return { written, dropped: [] };
    const ranking = this.playing.get(`${seat}/${state.month}`)?.landGrant?.ranked ?? [];
    const { edits, dropped } = resolveGranted(written.reply.edits, newPlots(state, seat, owned, ranking));
    return { written: { ...written, reply: { ...written.reply, edits } }, dropped };
  }

  /** Hands a plan's line to the game's speak; a blank or absent line says nothing, and a speak that throws stops no play. */
  private speak(seat: PlayerId, line: string | null, month: number, phase: 'landGrant' | EditPhase): void {
    if (!line?.trim() || !this.options.speak) return;
    try {
      this.options.speak(seat, { line, month, phase });
    } catch (err) {
      console.error(`playbooks: seat ${seat}'s plan line could not be said: ${messageOf(err)}`);
    }
  }

  /**
   * Settles once every write open now has: for the trial, which has no people to wait for in planning and so lets each
   * write run to its wait before the land grant, as an untimed planning would. Each is bounded by its kind's timeout.
   */
  async settle(): Promise<void> {
    if (this.open.size > 0) await Promise.allSettled([...this.open]);
  }

  /** The strategy set by the seat's newest land playbook before `month` that carried Claude's strategy edits; null if none did. */
  private ownStrategy(seat: PlayerId, month: number): LastPhase['ownStrategy'] {
    for (let m = month - 1; m >= 1; m--) {
      const playbook = this.playing.get(`${seat}/${m}`);
      if (playbook?.by === 'llm' && playbook.edits?.some((e) => e.path.startsWith('/strategy/'))) return { month: m, strategy: playbook.strategy };
    }
    return null;
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
   * land grant's own draft `now` (AM-A17): a plan letter was already turned into its plots by the writer, so no letter
   * can name other plots, and every field Claude left alone plays as the engine's seat would. Otherwise (no reply,
   * nothing accepted, a validator that throws) `now` plays by engine.
   * The reply's feedback is kept either way.
   */
  private decide(state: GameState, seat: PlayerId, now: Playbook, asked: Ask | null, validate: ValidatePlan): Playbook {
    const engine: Playbook = { ...now, by: 'engine' };
    const written: WriterReply | null = asked?.written ?? null;
    if (!asked || !written) return engine;
    let made: ReturnType<typeof playbookFrom>;
    try {
      made = playbookFrom(validate, state, now, written);
    } catch (err) {
      console.error(`playbooks: validatePlan failed for seat ${seat}, the engine's playbook plays: ${messageOf(err)}`);
      made = { playbook: engine, feedback: { refused: written.refused, rejected: [] } };
    }
    if (made.feedback) this.feedback.set(seat, made.feedback);
    return made.playbook.by === 'llm' ? made.playbook : engine;
  }
}

/**
 * The reply without its edits to a good whose role has changed since the plan was shown (a raid or an event between the
 * production ask and the auction's start), unless the reply sets that good's role itself: a seller's hold-out walk-away
 * read as a buyer's limit would pay that much. Each dropped edit comes back rejected, with why, for the next brief.
 */
function withoutFlippedGoods(
  written: WriterReply,
  shown: Readonly<Record<string, string>> | undefined,
  draft: Playbook,
): { written: WriterReply; dropped: NonNullable<Playbook['rejected']> } {
  if (!shown) return { written, dropped: [] };
  const goodOf = (path: string) => (path.startsWith('/auction/') ? path.split('/')[2] : undefined);
  const setsRole = new Set(written.reply.edits.filter((e) => e.path.endsWith('/role')).map((e) => goodOf(e.path)));
  const now = (g: string) => (draft.auction as Record<string, { role: string } | undefined> | undefined)?.[g]?.role;
  const flipped = (g: string | undefined) => g !== undefined && shown[g] !== undefined && now(g) !== undefined && shown[g] !== now(g) && !setsRole.has(g);
  const dropped = written.reply.edits
    .filter((e) => flipped(goodOf(e.path)))
    .map((e) => ({ path: e.path, to: e.to, why: `its role changed from ${shown[goodOf(e.path)!]} to ${now(goodOf(e.path)!)} before the auction opened, so the draft's plan for it plays` }));
  if (dropped.length === 0) return { written, dropped };
  return { written: { ...written, reply: { ...written.reply, edits: written.reply.edits.filter((e) => !flipped(goodOf(e.path))) } }, dropped };
}
