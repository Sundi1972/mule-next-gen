import type { GameState } from '@mule/engine';
import { TopPickDecider, toOptions, type Choice, type DecisionContext, type Decider, type ShortOption, type TableTalk } from './decider.js';
import type { DecisionKind, Persona } from './personas.js';
import type { Consideration, Shortlist } from './utility.js';
import type { Mind } from './value.js';

/** One decision, as the log keeps it: every candidate with its scores, the shortlist, and the pick. */
export interface DecisionRecord {
  id: number;
  seat: string;
  kind: DecisionKind;
  month: number;
  phase: string;
  /** For trades, the good. */
  topic: string | null;
  candidates: { key: string; label: string; utility: number; value: number; veto: string | null; rationale: string; considerations: Consideration[] }[];
  shortlist: ShortOption[];
  pick: { id: string; key: string; label: string };
  by: Choice['by'];
  line: string | null;
  note?: string;
  /** Ms the seat waited for its decider. */
  waitedMs: number;
}

/** A decision asked for and not yet settled. The hands wait for it, up to `waitMs`, then play the default pick. */
export interface Pending<A> {
  id: number;
  kind: DecisionKind;
  topic: string | null;
  list: Shortlist<A>;
  options: ShortOption[];
  fallback: Choice;
  answer: Choice | null;
  waitedMs: number;
  waitMs: number;
  settled: { choice: Choice; action: A } | null;
}

const MAX_TALK = 6;

/**
 * Asks the decider and keeps the log. The default pick is always worked out
 * at once, so a slow, failing or absent decider never stalls the hands; an
 * answer that names no option on the shortlist is ignored.
 */
export class Brain {
  private nextId = 1;
  private readonly top = new TopPickDecider();
  readonly log: DecisionRecord[] = [];
  private talk: TableTalk[] = [];

  constructor(
    readonly mind: Mind,
    readonly persona: Persona,
    readonly name: string,
    private readonly seed: number,
    private readonly decider: Decider | null,
    private readonly onRecord?: (r: DecisionRecord) => void,
    private readonly logSize = 200,
  ) {}

  /** Table talk the seat heard, newest last. Only quoted to a decider, never obeyed. */
  hear(line: TableTalk): void {
    this.talk = [...this.talk, line].slice(-MAX_TALK);
  }

  ask<A>(kind: DecisionKind, list: Shortlist<A>, obs: GameState, waitMs: number, topic: string | null, summary: string): Pending<A> {
    const id = this.nextId++;
    const options = toOptions(list);
    const context: DecisionContext = {
      kind,
      seat: this.mind.me,
      name: this.name,
      month: obs.month,
      maxMonths: obs.maxMonths,
      summary,
      seed: (this.seed * 2_654_435_761 + id * 40_503 + obs.month * 977) >>> 0,
      pickTolerance: this.mind.level.pickTolerance,
      tableTalk: [...this.talk],
    };
    const fallback = this.top.decide(options, this.persona, context);
    const pending: Pending<A> = { id, kind, topic, list, options, fallback, answer: null, waitedMs: 0, waitMs, settled: null };
    if (!this.decider || options.length <= 1) {
      pending.answer = fallback;
      return pending;
    }
    try {
      const r = this.decider.decide(options, this.persona, context);
      if (r instanceof Promise) {
        r.then(
          (c) => {
            if (!pending.settled) pending.answer = c;
          },
          (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            if (!pending.settled) pending.answer = { ...fallback, by: 'fallback', note: `decider failed: ${message}` };
          },
        );
      } else pending.answer = r;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pending.answer = { ...fallback, by: 'fallback', note: `decider failed: ${message}` };
    }
    return pending;
  }

  /** The choice once the decider answered or the wait ran out; null while still waiting. `dt` is the time that passed. */
  resolve<A>(p: Pending<A>, dt: number, obs: Pick<GameState, 'month' | 'phase'>): { choice: Choice; action: A } | null {
    if (p.settled) return p.settled;
    p.waitedMs += dt;
    if (!p.answer && p.waitedMs < p.waitMs) return null;
    return this.settle(p, obs);
  }

  /** The choice now: the decider's if it answered, otherwise the default pick. */
  resolveNow<A>(p: Pending<A>, obs: Pick<GameState, 'month' | 'phase'>): { choice: Choice; action: A } {
    return p.settled ?? this.settle(p, obs);
  }

  private settle<A>(p: Pending<A>, obs: Pick<GameState, 'month' | 'phase'>): { choice: Choice; action: A } {
    let choice = p.answer ?? { ...p.fallback, by: 'fallback' as const, note: 'decider too slow' };
    let index = p.options.findIndex((o) => o.id === choice.optionId);
    if (index < 0) {
      choice = { ...p.fallback, by: 'fallback', note: `decider named ${choice.optionId}, not on the list` };
      index = p.options.findIndex((o) => o.id === choice.optionId);
    }
    const picked = p.list.options[index]!;
    p.settled = { choice, action: picked.action };
    const record: DecisionRecord = {
      id: p.id,
      seat: this.mind.me,
      kind: p.kind,
      month: obs.month,
      phase: obs.phase,
      topic: p.topic,
      candidates: p.list.all.map((c) => ({ key: c.key, label: c.label, utility: Math.round(c.utility * 1000) / 1000, value: c.value, veto: c.veto, rationale: c.rationale, considerations: c.considerations })),
      shortlist: p.options,
      pick: { id: choice.optionId, key: picked.key, label: picked.label },
      by: choice.by,
      line: choice.line,
      ...(choice.note ? { note: choice.note } : {}),
      waitedMs: p.waitedMs,
    };
    this.log.push(record);
    if (this.log.length > this.logSize) this.log.splice(0, this.log.length - this.logSize);
    this.onRecord?.(record);
    return p.settled;
  }
}
