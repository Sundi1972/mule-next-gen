/** A Claude seat's playbook writer: its asks wait for whichever chat calls with the seat's code (spec C3). */
import { randomUUID } from 'node:crypto';
import type { AiPersonaId } from '@mule/engine';
import { unusableReply, writeReply, type EditOffer, type PlanEdit, type Refusal, type WriterReply } from '@mule/ai';
import type { WriteKind } from '../brain/client.js';
import type { PlaybookAsk, PlaybookWriter } from '../brain/index.js';

/** An ask as a chat receives it from wait_for_my_turn. */
export interface SeatAsk {
  id: string;
  phase: 'land' | 'auction';
  brief: string;
  offers: readonly EditOffer[];
  /** What is left of the game's wait for this kind of plan; the ask stays open until the phase starts. */
  msLeft: number;
}

/** A chat's plan as submit_plan carries it, unchecked. */
export interface SubmittedPlan {
  /** Absent unless sent; the parser offers it only where the brief does (the land ask). */
  strategy?: unknown;
  edits: unknown;
  line: unknown;
}

export type SubmitResult =
  | { kind: 'accepted'; accepted: PlanEdit[]; refused: Refusal[] }
  | { kind: 'unknown_ask' }
  | { kind: 'answered' }
  | { kind: 'too_late' };

interface OpenAsk {
  id: string;
  kind: WriteKind;
  ask: PlaybookAsk;
  askedAt: number;
  state: 'open' | 'answering' | 'answered' | 'aborted';
  resolve: (written: WriterReply) => void;
}

type Waiter = (ask: SeatAsk | null) => void;

export class ClaudeSeatWriter implements PlaybookWriter {
  private readonly asks = new Map<string, OpenAsk>();
  private readonly waiters = new Set<Waiter>();
  private closed = false;
  private readonly now: () => number;
  private readonly tally = { asks: 0, answered: 0, late: 0, refused: 0 };

  constructor(
    readonly seat: { id: string; persona: AiPersonaId },
    options: { now?: () => number } = {},
  ) {
    this.now = options.now ?? Date.now;
  }

  get over(): boolean {
    return this.closed;
  }

  /** Queues the ask for the seat's chat; it resolves with the first answer, or no_reply once its signal aborts. Never throws. */
  write(kind: WriteKind, ask: PlaybookAsk): Promise<WriterReply> {
    if (this.closed || !(ask.waitMs > 0) || ask.signal?.aborted) return Promise.resolve(unusableReply('no_reply'));
    return new Promise((resolve) => {
      const open: OpenAsk = { id: randomUUID(), kind, ask, askedAt: this.now(), state: 'open', resolve };
      this.asks.set(open.id, open);
      this.tally.asks += 1;
      // Resolved inside the abort itself: the game's next decider must find the seat on its built-in plan in this tick.
      ask.signal?.addEventListener('abort', () => this.abandon(open), { once: true });
      const shown = this.shown(open);
      for (const wake of [...this.waiters]) wake(shown);
    });
  }

  /** The oldest ask no chat has answered yet, or null. */
  openAsk(): SeatAsk | null {
    for (const open of this.asks.values()) if (open.state === 'open') return this.shown(open);
    return null;
  }

  /** The open ask, or the next one asked within `holdMs`; null when none comes, the seat closes, or `signal` aborts. */
  waitForAsk(holdMs: number, signal?: AbortSignal): Promise<SeatAsk | null> {
    const now = this.openAsk();
    if (now || this.closed || signal?.aborted) return Promise.resolve(now);
    return new Promise((resolve) => {
      const done: Waiter = (ask) => {
        this.waiters.delete(done);
        clearTimeout(timer);
        signal?.removeEventListener('abort', stop);
        resolve(ask);
      };
      const stop = () => done(null);
      const timer = setTimeout(stop, holdMs);
      signal?.addEventListener('abort', stop, { once: true });
      this.waiters.add(done);
    });
  }

  /** Answers the seat's ask `askId` through the API writer's reply parser; only the first answer to an ask counts. */
  async submit(askId: string, plan: SubmittedPlan): Promise<SubmitResult> {
    const open = this.asks.get(askId);
    if (!open) return { kind: 'unknown_ask' };
    if (open.state === 'aborted') return { kind: 'too_late' };
    if (open.state !== 'open') return { kind: 'answered' };
    open.state = 'answering';
    const reply = { ...(plan.strategy === undefined ? {} : { strategy: plan.strategy }), edits: plan.edits, line: plan.line };
    const written = await writeReply(async () => ({ text: JSON.stringify(reply) }), open.ask);
    if (open.state !== 'answering') return { kind: 'too_late' };
    open.state = 'answered';
    this.tally.answered += 1;
    this.tally.refused += written.refused.length;
    open.resolve(written);
    return { kind: 'accepted', accepted: written.reply.edits, refused: written.refused };
  }

  /** The game is over: every open ask resolves no_reply, and the seat's line goes to the log (never its code). */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const open of this.asks.values()) this.abandon(open);
    for (const wake of [...this.waiters]) wake(null);
    const { asks, answered, late, refused } = this.tally;
    console.info(`claude seat ${this.seat.id}: ${asks} asks, ${answered} answered in time, ${late} late, ${refused} edits refused`);
  }

  private abandon(open: OpenAsk): void {
    if (open.state !== 'open' && open.state !== 'answering') return;
    open.state = 'aborted';
    this.tally.late += 1;
    open.resolve(unusableReply('no_reply'));
  }

  private shown(open: OpenAsk): SeatAsk {
    const { brief, waitMs } = open.ask;
    return {
      id: open.id,
      phase: open.kind === 'strategy' ? 'land' : 'auction',
      brief: brief.text,
      offers: brief.offers,
      msLeft: Math.max(0, open.askedAt + waitMs - this.now()),
    };
  }
}
