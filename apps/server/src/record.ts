/** Records every input a MuleGame reads at the room's seam, and writes the record at game over. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  colonyScore,
  configSnapshot,
  RuleError,
  score,
  stableJson,
  type CallKind,
  type GameRecord,
  type GameState,
  type NoticeEntry,
  type PlaybookEntry,
  type RecordedChoice,
  type RecordedWrite,
} from '@mule/engine';
import type { Choice } from '@mule/ai';
import type { MuleIntent, MuleView } from '@mule/protocol';
import { TableError, type Game, type GameContext, type SeatInfo } from '@tabletop/core';
import { createBrain, type BrainService } from './brain/index.js';
import { ledgerGameId, MuleGame, type Notice, type PlaybookNote } from './mule-game.js';

// literal-ok: caps a refusal's or a failed call's message in the record; no effect on play
const MESSAGE_CHARS = 120;

export type MuleRecord = GameRecord<MuleIntent>;
export type StepEvent = Exclude<MuleRecord['events'][number], NoticeEntry | PlaybookEntry>;
type Decided = NonNullable<StepEvent['decides']>[number];
/** What a call's outcome adds to its record entry. */
type Outcome = { choice: RecordedChoice } | { write: RecordedWrite } | { error: string };
type NewStep = StepEvent extends infer E ? (E extends StepEvent ? Omit<E, 'at' | 'seq'> : never) : never;

export interface RecordOptions {
  maxMonths?: number;
  phaseScale?: number;
  /** The game steered its development; the replay steers it too. */
  devSteer?: boolean;
  /** The game forced its wolves (a test option); the replay forces them too. */
  forceWolves?: boolean;
  politics: boolean;
}

export const configFingerprint = (): string => sha256(stableJson(configSnapshot()));

/** The fingerprint a record keeps of a game's final state. */
export const stateHash = (state: GameState): string => sha256(stableJson(state));

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * An absolute path in a message: a POSIX `/…` run not inside a word, a number or a URL, or a Windows `C:\…` run. It
 * ends at whitespace, a quote, or punctuation that closes it in a sentence.
 */
const ABSOLUTE_PATH = /(?<![\w:/.~-])\/[^\s'"`,;()<>]+|\b[A-Za-z]:\\[^\s'"`,;()<>]*/g;

/**
 * What a record keeps of a thrown error (a refusal, a failed brain call, a game error): its message only, every
 * absolute path in it replaced by `<path>` so no machine's folders reach the file, then cut at MESSAGE_CHARS.
 */
export function messageOf(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).replace(ABSOLUTE_PATH, '<path>').slice(0, MESSAGE_CHARS);
}

function recordedChoice({ optionId, line, by, note }: Choice): RecordedChoice {
  return { optionId, line, by, ...(note !== undefined ? { note } : {}) };
}

export function outcomeOf(state: GameState, seats: readonly { id: string }[]): NonNullable<MuleRecord['outcome']> {
  const colony = colonyScore(state);
  return {
    scores: Object.fromEntries(seats.map((s) => [s.id, score(state, s.id)])),
    // C32 (G-5 RULE-25): the end's colony score, so a replay is checked against it as against the seats' scores.
    ...(colony ? { colonyScore: colony.total } : {}),
    stateHash: stateHash(state),
  };
}

/**
 * The outcome of a game a game error ended (AM-5): the state's hash as the error left it, and its scores, or none if
 * scoring that state throws too. A game that never started hashes as null.
 */
export function crashOutcomeOf(state: GameState | null, seats: readonly { id: string }[]): NonNullable<MuleRecord['outcome']> {
  const hash = sha256(stableJson(state));
  let scores: Record<string, number>;
  try {
    scores = Object.fromEntries(seats.map((s) => [s.id, score(state!, s.id)]));
  } catch {
    return { stateHash: hash };
  }
  // The colony score reads more of the state than a seat's score does: if it throws on what the error left, the
  // seats' scores are kept without it.
  let colony: number | undefined;
  try {
    colony = colonyScore(state!)?.total;
  } catch {
    colony = undefined;
  }
  return { scores, ...(colony !== undefined ? { colonyScore: colony } : {}), stateHash: hash };
}

/** The server's own user errors: a refusal shown to the player, never a game error that ends the room. */
export const isUserError = (err: unknown): boolean => err instanceof RuleError || err instanceof TableError;

/**
 * Keeps one game's record in memory: wraps its context, the game and its brain, and writes the file once the game is
 * over. Bookkeeping never throws into play: a fault logs, marks the record broken, and a broken record is not written.
 */
export class Recorder {
  readonly record: MuleRecord;
  readonly ctx: GameContext;
  readonly brain: BrainService;
  broken = false;
  /** The record as written, once the game is over; null before, and for a broken record. */
  finished: MuleRecord | null = null;
  private open: StepEvent | null = null;
  private steps = 0;
  private timers = 0;
  private viewing = 0;
  private readonly calls = new Map<string, number>();
  private stateOf: () => GameState | null = () => null;

  constructor(
    private readonly inner: GameContext,
    seed: number,
    options: RecordOptions,
    brain: BrainService,
    private readonly dir: string | null,
    private readonly userError: (err: unknown) => boolean = isUserError,
  ) {
    this.record = { v: 1, seed, configFingerprint: configFingerprint(), options: { ...options }, seats: [], t0: inner.now(), events: [] };
    this.ctx = this.wrapContext(inner);
    this.brain = this.wrapBrain(brain);
  }

  /**
   * The game as the room should host it: every call opens a step, except `viewFor`. A heard line keeps no words.
   * `stateOf` reads the game's state, for the record of a game an error ends.
   */
  wrap(game: Game<MuleIntent, MuleView>, stateOf: () => GameState | null = () => null): Game<MuleIntent, MuleView> {
    this.stateOf = stateOf;
    return {
      start: (seats: SeatInfo[]) => {
        this.begin(() => ({ type: 'start' }));
        this.guard(() => {
          this.record.seats = seats.map(({ id, name, isAi, color, pick }) => ({ id, name, isAi, color, ...(pick !== undefined ? { pick } : {}), smart: false }));
        });
        this.run(() => game.start(seats));
      },
      handle: (seat, intent) => {
        this.begin(() => ({ type: 'intent', seat, intent: structuredClone(intent) }));
        const step = this.open;
        this.run(
          () => game.handle(seat, intent),
          (err) => {
            if (step?.type === 'intent') step.refused = messageOf(err);
          },
        );
      },
      // The room asks before it sends views after an intent; it is the game's own answer, not an input.
      quiet: (intent) => game.quiet?.(intent) ?? false,
      connectionChanged: (seat, connected) => {
        this.begin(() => ({ type: 'connection', seat, connected }));
        this.run(() => game.connectionChanged?.(seat, connected));
      },
      seatMoved: (seat) => {
        this.begin(() => ({ type: 'moved', seat }));
        this.run(() => game.seatMoved?.(seat));
      },
      heard: (from, text, to) => {
        this.begin(() => ({ type: 'heard', from, ...(to ? { to } : {}) }));
        this.run(() => game.heard?.(from, text, to));
      },
      viewFor: (seat) => {
        this.viewing++;
        try {
          return game.viewFor(seat);
        } finally {
          this.viewing--;
        }
      },
      dispose: () => game.dispose?.(),
    };
  }

  /**
   * Runs one step of the game that the room calls. A user error is the player's refusal (`refused`, for an intent);
   * any other throw ends the room (it reaches the room's onError and fail()), so the record is written as it stands,
   * `ended: 'error'`. Either way the throw goes on to the room unchanged.
   */
  private run(step: () => void, refused?: (err: unknown) => void): void {
    try {
      step();
    } catch (err) {
      const user = this.userError(err);
      this.guard(() => (user ? refused?.(err) : this.crashed(err)));
      throw err;
    }
  }

  /** A game error ended the room: the record closes now, with the state the error left (AM-5). */
  private crashed(err: unknown): void {
    if (this.finished) return;
    this.record.ended = 'error';
    this.record.error = messageOf(err);
    this.record.outcome = crashOutcomeOf(this.stateOf(), this.record.seats);
    this.close();
  }

  /** Sets the outcome; the file is written once the step that ended the game has run to its end. */
  gameOver(state: GameState): void {
    this.guard(() => {
      this.record.outcome ??= outcomeOf(state, this.record.seats);
    });
    setImmediate(() => this.guard(() => this.close()));
  }

  /** Appends a public fact as it settled, stamped with the open step's at and seq. */
  notice(notice: Notice): void {
    this.guard(() => {
      const { at, seq } = this.openStep();
      this.record.events.push({ type: 'notice', at, seq, ...structuredClone(notice) });
    });
  }

  /** Appends a seat's playbook, stamped with the open step's at and seq: the last step's, between steps. */
  playbook(entry: PlaybookNote): void {
    this.guard(() => {
      const { at, seq } = this.openStep();
      this.record.events.push({ type: 'playbook', at, seq, ...structuredClone(entry) });
    });
  }

  private close(): void {
    if (this.finished) return;
    const stamp = new Date(this.record.t0).toISOString().replaceAll(':', '-');
    const file = this.dir === null ? null : path.join(this.dir, `game-${stamp}-s${this.record.seed}.json`);
    const text = JSON.stringify(this.record);
    this.finished = JSON.parse(text) as MuleRecord;
    if (this.dir === null || file === null) return;
    fs.promises
      .mkdir(this.dir, { recursive: true })
      .then(() => fs.promises.writeFile(file, text))
      .catch((err: unknown) => console.error(`game record: could not write ${file}: ${(err as NodeJS.ErrnoException).code ?? String(err)}`));
  }

  private guard(bookkeeping: () => void): void {
    if (this.broken) return;
    try {
      bookkeeping();
    } catch (err) {
      this.broken = true;
      console.error(`game record: bookkeeping failed, this game will not be written: ${err instanceof Error ? err.stack : String(err)}`);
    }
  }

  private begin(step: () => NewStep): void {
    this.guard(() => {
      const event = { ...step(), at: this.inner.now() - this.record.t0, seq: this.steps } as StepEvent;
      this.record.events.push(event);
      this.steps++;
      this.open = event;
    });
  }

  private openStep(): StepEvent {
    if (!this.open) throw new Error('the game read an input outside any step');
    return this.open;
  }

  private wrapContext(inner: GameContext): GameContext {
    return {
      now: () => {
        const value = inner.now();
        this.guard(() => {
          if (!this.viewing) (this.openStep().reads ??= []).push(value - this.record.t0);
        });
        return value;
      },
      hostId: () => {
        const host = inner.hostId();
        this.guard(() => {
          if (!this.viewing) (this.openStep().hosts ??= []).push(host);
        });
        return host;
      },
      schedule: (ms, fn) => {
        const timer = this.timers++;
        return inner.schedule(ms, () => {
          this.begin(() => ({ type: 'fire', timer }));
          // The room fails on any throw from a timer, a user error included: nobody is there to be refused.
          try {
            fn();
          } catch (err) {
            this.guard(() => this.crashed(err));
            throw err;
          }
        });
      },
      changed: () => inner.changed(),
      // A frame is output the game learns nothing from, so it passes through untaped.
      frame: (payload) => inner.frame(payload),
      ...(inner.say ? { say: (from: string, text: string, to?: string) => inner.say!(from, text, to) } : {}),
    };
  }

  private wrapBrain(inner: BrainService): BrainService {
    return {
      deciderFor: (seat) => {
        const decider = inner.deciderFor(seat);
        if (!decider) return null;
        this.guard(() => {
          const header = this.record.seats.find((s) => s.id === seat.id);
          if (header) header.smart = true;
        });
        return {
          name: decider.name,
          decide: (shortlist, persona, context) =>
            this.call(seat.id, 'move', () => decider.decide(shortlist, persona, context), (choice) => ({ choice: recordedChoice(choice) })),
        };
      },
      chatter: (seat, say) => inner.chatter(seat, say),
      finish: () => inner.finish(),
    };
  }

  /**
   * One brain call, of any kind: an answer given at once goes in the open step; a promised one is noted pending there,
   * and its settling opens an `answer` step. The caller sees exactly what the inner call returned or threw.
   */
  private call<T>(seat: string, kind: CallKind, run: () => T | Promise<T>, outcome: (value: T) => Outcome): T | Promise<T> {
    const call = (this.calls.get(seat) ?? 0) + 1;
    this.calls.set(seat, call);
    let result: T | Promise<T>;
    try {
      result = run();
    } catch (err) {
      this.decided({ seat, call, kind, error: messageOf(err) });
      throw err;
    }
    if (!(result instanceof Promise)) {
      const value = result;
      this.decided(() => ({ seat, call, kind, ...outcome(value) }));
      return value;
    }
    this.decided({ seat, call, kind, pending: true });
    return result.then(
      (value) => {
        this.begin(() => ({ type: 'answer', seat, call, kind, ...outcome(value) }));
        return value;
      },
      (err: unknown) => {
        this.begin(() => ({ type: 'answer', seat, call, kind, error: messageOf(err) }));
        throw err;
      },
    );
  }

  private decided(entry: Decided | (() => Decided)): void {
    this.guard(() => {
      (this.openStep().decides ??= []).push(typeof entry === 'function' ? entry() : entry);
    });
  }
}

/** A game as the server builds it, with its record kept: the room hosts `game`. */
export function createRecordedGame(args: {
  ctx: GameContext;
  seed: number;
  options: RecordOptions;
  /** Absent: the brain MuleGame would build for itself, from the environment. */
  brain?: BrainService;
  /** Where the file goes at game over; null keeps the record in memory only. */
  dir?: string | null;
  /** The room's own user-error test: any other throw from a step ends the room and writes the record. */
  isUserError?: (err: unknown) => boolean;
}): { game: Game<MuleIntent, MuleView>; recorder: Recorder } {
  const brain = args.brain ?? createBrain({ gameId: ledgerGameId(args.seed, args.ctx.now()) });
  const recorder = new Recorder(args.ctx, args.seed, args.options, brain, args.dir ?? null, args.isUserError);
  const game = new MuleGame(recorder.ctx, args.seed, {
    ...args.options,
    brain: recorder.brain,
    onGameOver: (state) => recorder.gameOver(state),
    notice: (notice) => recorder.notice(notice),
    recordPlaybook: (entry) => recorder.playbook(entry),
  });
  return { game: recorder.wrap(game, () => game.stateNow()), recorder };
}
