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

export interface Ledger {
  /** Appends one RULE-4 line and charges the seat, unless its game is finished. */
  record(call: CallRecord): void;
  /** US dollars charged to a seat so far this game. */
  seatSpent(game: string, seat: string): number;
  /** Appends the game's total line. */
  finish(game: string): void;
}

const PER_MILLION = 1_000_000;

/** RULE-4: dollars for one call, prices per million tokens from BRAIN. */
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
      append({
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
      });
    },

    seatSpent: (game, seat) => games.get(game)?.get(seat)?.usd ?? 0,

    /** Writes the game's total line once and releases its totals; a second finish of the same game is a no-op. */
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
      append({ t: clock().toISOString(), game, type: 'game', seats: seats.size, calls, usd: cost, by_seat });
    },
  };
}
