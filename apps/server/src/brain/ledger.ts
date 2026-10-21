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
  record(call: CallRecord): void;
  seatSpent(game: string, seat: string): number;
  finish(game: string): void;
}

export function usd(_usage: Usage): number {
  throw new Error('NotImplemented: usd');
}

export function createLedger(_opts?: { path?: string; clock?: () => Date }): Ledger {
  throw new Error('NotImplemented: createLedger');
}
