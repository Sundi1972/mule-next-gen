import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAIN, type AiLevelId, type AiPersonaId } from '@mule/engine';
import type { DecisionKind, RejectOutcome } from '@mule/ai';

export interface Usage {
  input: number;
  cached_read: number;
  cache_write: number;
  output: number;
}

export const NO_USAGE: Readonly<Usage> = Object.freeze({ input: 0, cached_read: 0, cache_write: 0, output: 0 });

export type Outcome = RejectOutcome | 'llm' | 'refused' | 'timeout' | 'error' | 'budget';

export interface CallRecord extends Usage {
  game: string;
  seat: string;
  persona: AiPersonaId;
  level: AiLevelId;
  model: string;
  kind: DecisionKind;
  ms: number;
  outcome: Outcome;
}

/** A call's line in the ledger file. See RULE-4. */
export interface CallLine extends Usage {
  t: string;
  game: string;
  seat: string;
  persona: AiPersonaId;
  level: AiLevelId;
  model: string;
  kind: DecisionKind;
  usd: number;
  ms: number;
  timed_out: boolean;
  outcome: Outcome;
}

/** A game's total line in the ledger file: model calls only, settled before finish. See RULE-4. */
export interface GameLine {
  t: string;
  game: string;
  type: 'game';
  seats: number;
  calls: number;
  usd: number;
  by_seat: Record<string, { calls: number; usd: number }>;
}

export interface Ledger {
  /** Appends the call's line and charges its seat; a call in a finished game gets its line but no charge. See RULE-4. */
  record(call: CallRecord): void;
  /** US dollars charged to a seat so far this game. */
  seatSpent(game: string, seat: string): number;
  /**
   * Appends the game's total line, once; a second call is a no-op. Terminal: the game's totals are released, so
   * seatSpent reads 0 afterwards, and later records are written but not totalled.
   */
  finish(game: string): void;
}

const PER_MILLION = 1_000_000;

/** Dollars for one call's usage, at BRAIN's prices per million tokens. See RULE-4. */
export function usd(u: Usage): number {
  const p = BRAIN.pricesPerMTok;
  return (u.input * p.input + u.cached_read * p.cacheRead + u.cache_write * p.cacheWrite + u.output * p.output) / PER_MILLION;
}

/** MULE_BRAIN_LOG when set, otherwise apps/server/data/brain-costs.jsonl. */
export function defaultLedgerPath(): string {
  const fromEnv = process.env.MULE_BRAIN_LOG;
  if (fromEnv) return fromEnv;
  const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  return path.join(serverRoot, 'data', 'brain-costs.jsonl');
}

interface Total {
  calls: number;
  usd: number;
}

/** The only writer of the ledger file. Totals live in memory so the budget check never reads the file. */
export function createLedger(opts: { path?: string; clock?: () => Date } = {}): Ledger {
  const file = opts.path ?? defaultLedgerPath();
  const clock = opts.clock ?? (() => new Date());
  const games = new Map<string, Map<string, Total>>();
  const finished = new Set<string>();
  let dirReady = false;

  let reported = false;

  /** Never throws: a ledger I/O fault must not reach the game. Reports the first fault only. */
  const append = (line: object): void => {
    try {
      if (!dirReady) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        dirReady = true;
      }
      fs.appendFileSync(file, `${JSON.stringify(line)}\n`);
    } catch (e) {
      if (reported) return;
      reported = true;
      console.error(`brain ledger: cannot append to ${file}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return {
    record(call) {
      const cost = usd(call);
      // A call that settles after finish still gets its line, but the finished game's totals stay closed.
      if (!finished.has(call.game)) {
        const seats = games.get(call.game) ?? new Map<string, Total>();
        games.set(call.game, seats);
        const total = seats.get(call.seat) ?? { calls: 0, usd: 0 };
        seats.set(call.seat, total);
        // A budget refusal is a line, not a model call.
        if (call.outcome !== 'budget') total.calls += 1;
        total.usd += cost;
      }
      const line: CallLine = {
        t: clock().toISOString(),
        game: call.game,
        seat: call.seat,
        persona: call.persona,
        level: call.level,
        model: call.model,
        kind: call.kind,
        input: call.input,
        cached_read: call.cached_read,
        cache_write: call.cache_write,
        output: call.output,
        usd: cost,
        ms: call.ms,
        timed_out: call.outcome === 'timeout',
        outcome: call.outcome,
      };
      append(line);
    },

    seatSpent: (game, seat) => games.get(game)?.get(seat)?.usd ?? 0,

    finish(game) {
      if (finished.has(game)) return;
      finished.add(game);
      const seats = games.get(game) ?? new Map<string, Total>();
      games.delete(game);
      const by_seat: Record<string, Total> = {};
      let calls = 0;
      let cost = 0;
      for (const [seat, t] of seats) {
        by_seat[seat] = { calls: t.calls, usd: t.usd };
        calls += t.calls;
        cost += t.usd;
      }
      const line: GameLine = { t: clock().toISOString(), game, type: 'game', seats: seats.size, calls, usd: cost, by_seat };
      append(line);
    },
  };
}
