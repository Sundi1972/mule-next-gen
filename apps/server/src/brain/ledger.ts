import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAIN } from '@mule/engine';

export interface Usage {
  input: number;
  cached_read: number;
  cache_write: number;
  output: number;
}

export type Outcome = 'llm' | 'timeout' | 'error' | 'unreadable' | 'off_list' | 'budget';

export interface CallRecord extends Usage {
  game: string;
  seat: string;
  persona: string;
  level: string;
  model: string;
  kind: string;
  ms: number;
  outcome: Outcome;
}

export interface Ledger {
  /** Appends one RULE-4 line and charges the seat. */
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
  let dirReady = false;

  const append = (line: object): void => {
    if (!dirReady) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      dirReady = true;
    }
    fs.appendFileSync(file, `${JSON.stringify(line)}\n`);
  };

  return {
    record(call) {
      const timedOut = call.outcome === 'timeout';
      const used: Usage = timedOut
        ? { input: 0, cached_read: 0, cache_write: 0, output: 0 }
        : { input: call.input, cached_read: call.cached_read, cache_write: call.cache_write, output: call.output };
      const cost = usd(used);
      append({
        t: clock().toISOString(),
        game: call.game,
        seat: call.seat,
        persona: call.persona,
        level: call.level,
        model: call.model,
        kind: call.kind,
        ...used,
        usd: cost,
        ms: call.ms,
        timed_out: timedOut,
        outcome: call.outcome,
      });
      const seats = games.get(call.game) ?? new Map<string, Total>();
      games.set(call.game, seats);
      const total = seats.get(call.seat) ?? { calls: 0, usd: 0 };
      seats.set(call.seat, total);
      total.calls += 1;
      total.usd += cost;
    },

    seatSpent: (game, seat) => games.get(game)?.get(seat)?.usd ?? 0,

    finish(game) {
      const seats = games.get(game) ?? new Map<string, Total>();
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
