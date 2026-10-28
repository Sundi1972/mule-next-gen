/** Records every input a MuleGame reads at the room's seam, and replays a record to the same final state. */
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
import type { BrainService } from './brain/index.js';
import { MuleGame } from './mule-game.js';

// literal-ok: caps a refusal's or a failed call's message in the record; no effect on play
const MESSAGE_CHARS = 120;

export type MuleRecord = GameRecord<MuleIntent>;
type StepEvent = Exclude<MuleRecord['events'][number], NoticeEntry | PlaybookEntry>;
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

function messageOf(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, MESSAGE_CHARS);
}

function recordedChoice({ optionId, line, by, note }: Choice): RecordedChoice {
  return { optionId, line, by, ...(note !== undefined ? { note } : {}) };
}

function outcomeOf(state: GameState, seats: readonly { id: string }[]): NonNullable<MuleRecord['outcome']> {
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

  /** The game as the room should host it: every call opens a step, except `heard` and `viewFor`. */
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
      heard: (from, text, to) => game.heard?.(from, text, to),
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
    setImmediate(() => this.close());
  }

  private close(): void {
    if (this.broken || this.finished) return;
    const text = JSON.stringify(this.record);
    this.finished = JSON.parse(text) as MuleRecord;
    if (this.dir === null) return;
    const stamp = new Date(this.record.t0).toISOString().replaceAll(':', '-');
    const file = path.join(this.dir, `game-${stamp}-s${this.record.seed}.json`);
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
  brain: BrainService;
  /** Where the file goes at game over; null keeps the record in memory only. */
  dir?: string | null;
}): { game: Game<MuleIntent, MuleView>; recorder: Recorder } {
  const recorder = new Recorder(args.ctx, args.seed, args.options, args.brain, args.dir ?? null);
  const game = new MuleGame(recorder.ctx, args.seed, { ...args.options, brain: recorder.brain, onGameOver: (state) => recorder.gameOver(state) });
  return { game: recorder.wrap(game), recorder };
}

/** The replay reached a step that does not play as recorded. `seq` is that step's. */
export class ReplayDiverged extends Error {
  constructor(
    readonly seq: number,
    readonly reason: string,
  ) {
    super(`replay diverged at step ${seq}: ${reason}`);
    this.name = 'ReplayDiverged';
  }
}

/** The record can't be replayed here: another record version, or another config. */
export class RecordMismatch extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'RecordMismatch';
  }
}

export interface ReplayResult {
  identical: boolean;
  scores: { seat: string; recorded: number | null; replayed: number | null }[];
  stateHash: { recorded: string | null; replayed: string | null };
}

/** A step's tape, timers and brain calls, served back to a game in replay. Never calls a model or the network. */
class Script {
  readonly ctx: GameContext;
  readonly brain: BrainService;
  private step: StepEvent | null = null;
  private reads = 0;
  private hosts = 0;
  private lastNow: number;
  private lastHost: string | null = null;
  private nextTimer = 0;
  private readonly timers = new Map<number, () => void>();
  private readonly calls = new Map<string, number>();
  private made: { seat: string; call: number; kind: CallKind }[] = [];
  private readonly pending = new Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }>();
  private divergence: string | null = null;

  constructor(private readonly record: MuleRecord) {
    this.lastNow = record.t0;
    this.ctx = {
      now: () => this.now(),
      hostId: () => this.hostId(),
      schedule: (_ms, fn) => {
        const timer = this.nextTimer++;
        this.timers.set(timer, fn);
        return () => void this.timers.delete(timer);
      },
      changed: () => {},
      say: () => {},
    };
    const smart = new Set(record.seats.filter((s) => s.smart).map((s) => s.id));
    this.brain = {
      deciderFor: (seat) =>
        smart.has(seat.id) ? { name: 'recorded', decide: () => this.call(seat.id, 'move') as Choice | Promise<Choice> } : null,
      chatter: () => () => {},
      finish: () => {},
    };
  }

  enter(step: StepEvent): void {
    this.step = step;
    this.reads = 0;
    this.hosts = 0;
    this.made = [];
  }

  /** Throws ReplayDiverged when the step just played read, fired or asked other than as recorded. */
  leave(step: StepEvent): void {
    const fail = (reason: string) => {
      throw new ReplayDiverged(step.seq, reason);
    };
    if (this.divergence) fail(this.divergence);
    if (this.reads < (step.reads?.length ?? 0)) fail('clock tape not consumed');
    if (this.hosts < (step.hosts?.length ?? 0)) fail('host tape not consumed');
    const recorded = (step.decides ?? []).map(({ seat, call, kind }) => `${seat}#${call} ${kind}`);
    const made = this.made.map(({ seat, call, kind }) => `${seat}#${call} ${kind}`);
    if (recorded.join() !== made.join()) fail(`brain calls [${made.join(', ')}], recorded [${recorded.join(', ')}]`);
  }

  diverge(reason: string): void {
    this.divergence ??= reason;
  }

  fire(timer: number): void {
    const fn = this.timers.get(timer);
    if (!fn) return this.diverge(`timer ${timer} not live`);
    this.timers.delete(timer);
    fn();
  }

  answer(step: Extract<StepEvent, { type: 'answer' }>): void {
    const key = `${step.seat}#${step.call} ${step.kind}`;
    const waiting = this.pending.get(key);
    if (!waiting) return this.diverge(`answer to ${key}, which is not open`);
    this.pending.delete(key);
    if (step.error !== undefined) waiting.reject(new Error(step.error));
    else if (step.kind === 'move' && step.choice) waiting.resolve({ ...step.choice });
    else if (step.kind !== 'move' && step.write) waiting.resolve(structuredClone(step.write));
    else this.diverge(`answer to ${key} has no outcome`);
  }

  dispose(): void {
    this.timers.clear();
    this.pending.clear();
  }

  private now(): number {
    const tape = this.step?.reads ?? [];
    if (this.reads >= tape.length) {
      this.diverge('clock tape exhausted');
      return this.lastNow;
    }
    this.lastNow = this.record.t0 + tape[this.reads++]!;
    return this.lastNow;
  }

  private hostId(): string | null {
    const tape = this.step?.hosts ?? [];
    if (this.hosts >= tape.length) {
      this.diverge('host tape exhausted');
      return this.lastHost;
    }
    this.lastHost = tape[this.hosts++]!;
    return this.lastHost;
  }

  /** A brain call of any kind, answered from the open step's record: at once, by throwing, or by a promise its `answer` step settles. */
  private call(seat: string, kind: CallKind): unknown {
    const call = (this.calls.get(seat) ?? 0) + 1;
    this.calls.set(seat, call);
    const expected = this.step?.decides?.[this.made.length];
    this.made.push({ seat, call, kind });
    const key = `${seat}#${call} ${kind}`;
    if (!expected || expected.seat !== seat || expected.call !== call || expected.kind !== kind) {
      this.diverge(`unrecorded brain call ${key}`);
      throw new Error('replay: unrecorded brain call');
    }
    if (expected.pending) return new Promise((resolve, reject) => this.pending.set(key, { resolve, reject }));
    if (expected.error !== undefined) throw new Error(expected.error);
    if (kind === 'move' && expected.choice) return { ...expected.choice };
    if (kind !== 'move' && expected.write) return structuredClone(expected.write);
    this.diverge(`brain call ${key} has no recorded outcome`);
    throw new Error('replay: brain call without an outcome');
  }
}

/** Lets every promise handler a step started run before the next step, as the room's event loop did. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Plays a record through a fresh MuleGame: its timers by recorded id and order, its clock from the tape, and Claude's
 * answers from the record. Throws RecordMismatch before building anything when the record's version or config differs,
 * and ReplayDiverged at the first step that doesn't play as recorded.
 */
export async function replay(record: MuleRecord): Promise<ReplayResult> {
  if (record.v !== 1) throw new RecordMismatch(`record version ${String(record.v)}; this server replays version 1`);
  if (record.configFingerprint !== configFingerprint()) throw new RecordMismatch('the record was made under another config');

  const script = new Script(record);
  let replayed: MuleRecord['outcome'] | null = null;
  const game = new MuleGame(script.ctx, record.seed, {
    ...record.options,
    brain: script.brain,
    onGameOver: (state) => (replayed ??= outcomeOf(state, record.seats)),
  });
  const seats: SeatInfo[] = record.seats.map(({ id, name, isAi, color, pick }) => ({ id, name, isAi, color, ...(pick !== undefined ? { pick } : {}) }));
  try {
    for (const event of record.events) {
      if (event.type === 'notice' || event.type === 'playbook') continue;
      script.enter(event);
      playStep(game, script, event, seats);
      await settle();
      script.leave(event);
    }
  } finally {
    script.dispose();
    game.dispose();
  }

  const recorded = record.outcome ?? null;
  const outcome = replayed as MuleRecord['outcome'] | null;
  const scores = record.seats.map((s) => ({ seat: s.id, recorded: recorded?.scores[s.id] ?? null, replayed: outcome?.scores[s.id] ?? null }));
  const stateHash = { recorded: recorded?.stateHash ?? null, replayed: outcome?.stateHash ?? null };
  return { identical: stateHash.recorded === stateHash.replayed && scores.every((s) => s.recorded === s.replayed), scores, stateHash };
}

function playStep(game: MuleGame, script: Script, event: StepEvent, seats: SeatInfo[]): void {
  if (event.type === 'intent') {
    let refused: string | undefined;
    try {
      game.handle(event.seat, structuredClone(event.intent));
    } catch (err) {
      refused = messageOf(err);
    }
    const said = (r: string | undefined) => (r === undefined ? 'accepted' : `refused "${r}"`);
    if (refused !== event.refused) script.diverge(`intent ${said(refused)}, recorded ${said(event.refused)}`);
    return;
  }
  try {
    switch (event.type) {
      case 'start':
        game.start(seats);
        return;
      case 'fire':
        script.fire(event.timer);
        return;
      case 'connection':
        game.connectionChanged(event.seat, event.connected);
        return;
      case 'moved':
        game.seatMoved(event.seat);
        return;
      case 'answer':
        script.answer(event);
        return;
    }
  } catch (err) {
    script.diverge(`the game threw: ${messageOf(err)}`);
  }
}
