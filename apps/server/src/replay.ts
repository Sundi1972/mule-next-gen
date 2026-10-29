/** Replays a game record through a fresh MuleGame and names the first step that doesn't play as recorded. */
import { stableJson, type CallKind, type PlaybookEntry, type RecordedWrite } from '@mule/engine';
import type { Choice } from '@mule/ai';
import type { GameContext, SeatInfo } from '@tabletop/core';
import type { BrainService } from './brain/index.js';
import { MuleGame, type PlaybookNote } from './mule-game.js';
import { configFingerprint, messageOf, outcomeOf, type MuleRecord, type StepEvent } from './record.js';

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
  private readonly playbooks: PlaybookEntry[];
  private playbooksWritten = 0;

  constructor(private readonly record: MuleRecord) {
    this.playbooks = record.events.filter((e) => e.type === 'playbook');
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
      frame: () => {},
      say: () => {},
    };
    const smart = new Set(record.seats.filter((s) => s.smart).map((s) => s.id));
    this.brain = {
      deciderFor: (seat) =>
        smart.has(seat.id) ? { name: 'recorded', decide: () => this.call(seat.id, 'move') as Choice | Promise<Choice> } : null,
      // The record holds no refusals, so a replayed reply never has any.
      writerFor: (seat) =>
        smart.has(seat.id) ? { write: async (kind) => ({ reply: (await this.call(seat.id, kind)) as RecordedWrite, refused: [] }) } : null,
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

  /** A playbook the game wrote must be the recorded one at the same place: same step, same content. */
  playbook(entry: PlaybookNote): void {
    const recorded = this.playbooks[this.playbooksWritten++];
    if (!recorded) return this.diverge(`seat ${entry.seat} wrote a playbook the record does not hold`);
    const { type: _type, at: _at, seq, ...content } = recorded;
    if (seq !== this.step?.seq || stableJson(content) !== stableJson(entry)) this.diverge(`seat ${entry.seat}'s playbook differs from the recorded one`);
  }

  /** The first recorded playbook the replay never wrote, if any. */
  unwritten(): PlaybookEntry | undefined {
    return this.playbooks[this.playbooksWritten];
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
    recordPlaybook: (entry) => script.playbook(entry),
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
    const unwritten = script.unwritten();
    if (unwritten) throw new ReplayDiverged(unwritten.seq, `seat ${unwritten.seat}'s recorded playbook was never written`);
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
      case 'heard':
        game.heard(event.from, '', event.to);
        return;
      case 'answer':
        script.answer(event);
        return;
    }
  } catch (err) {
    script.diverge(`the game threw: ${messageOf(err)}`);
  }
}
