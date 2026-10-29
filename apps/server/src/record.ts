/** Records every input a MuleGame reads at the room's seam, and writes the record at game over. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  configSnapshot,
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
import type { Game, GameContext, SeatInfo } from '@tabletop/core';
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
  politics: boolean;
}

export const configFingerprint = (): string => sha256(stableJson(configSnapshot()));

/** The fingerprint a record keeps of a game's final state. */
export const stateHash = (state: GameState): string => sha256(stableJson(state));

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function messageOf(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, MESSAGE_CHARS);
}

function recordedChoice({ optionId, line, by, note }: Choice): RecordedChoice {
  return { optionId, line, by, ...(note !== undefined ? { note } : {}) };
}

export function outcomeOf(state: GameState, seats: readonly { id: string }[]): NonNullable<MuleRecord['outcome']> {
  return { scores: Object.fromEntries(seats.map((s) => [s.id, score(state, s.id)])), stateHash: stateHash(state) };
}

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

  constructor(
    private readonly inner: GameContext,
    seed: number,
    options: RecordOptions,
    brain: BrainService,
    private readonly dir: string | null,
  ) {
    this.record = { v: 1, seed, configFingerprint: configFingerprint(), options: { ...options }, seats: [], t0: inner.now(), events: [] };
    this.ctx = this.wrapContext(inner);
    this.brain = this.wrapBrain(brain);
  }

  /** The game as the room should host it: every call opens a step, except `viewFor`. A heard line keeps no words. */
  wrap(game: Game<MuleIntent, MuleView>): Game<MuleIntent, MuleView> {
    return {
      start: (seats: SeatInfo[]) => {
        this.begin(() => ({ type: 'start' }));
        this.guard(() => {
          this.record.seats = seats.map(({ id, name, isAi, color, pick }) => ({ id, name, isAi, color, ...(pick !== undefined ? { pick } : {}), smart: false }));
        });
        game.start(seats);
      },
      handle: (seat, intent) => {
        this.begin(() => ({ type: 'intent', seat, intent: structuredClone(intent) }));
        const step = this.open;
        try {
          game.handle(seat, intent);
        } catch (err) {
          this.guard(() => {
            if (step?.type === 'intent') step.refused = messageOf(err);
          });
          throw err;
        }
      },
      connectionChanged: (seat, connected) => {
        this.begin(() => ({ type: 'connection', seat, connected }));
        game.connectionChanged?.(seat, connected);
      },
      seatMoved: (seat) => {
        this.begin(() => ({ type: 'moved', seat }));
        game.seatMoved?.(seat);
      },
      heard: (from, text, to) => {
        this.begin(() => ({ type: 'heard', from, ...(to ? { to } : {}) }));
        game.heard?.(from, text, to);
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
          fn();
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
}): { game: Game<MuleIntent, MuleView>; recorder: Recorder } {
  const brain = args.brain ?? createBrain({ gameId: ledgerGameId(args.seed, args.ctx.now()) });
  const recorder = new Recorder(args.ctx, args.seed, args.options, brain, args.dir ?? null);
  const game = new MuleGame(recorder.ctx, args.seed, {
    ...args.options,
    brain: recorder.brain,
    onGameOver: (state) => recorder.gameOver(state),
    notice: (notice) => recorder.notice(notice),
    recordPlaybook: (entry) => recorder.playbook(entry),
  });
  return { game: recorder.wrap(game), recorder };
}
