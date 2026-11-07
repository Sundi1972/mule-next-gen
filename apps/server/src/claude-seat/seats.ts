/** Which seats a Claude chat plays, and how a seat named by a code reaches its writer. */
import type { SeatInfo } from '@tabletop/core';
import type { PlaybookWriter } from '../brain/index.js';
import { ClaudeSeatWriter } from './writer.js';

/** Who plays a computer seat: the built-in AI, or a Claude chat holding the seat's code. */
export type SeatKind = 'builtin' | 'claude';

/** A seat's kind as the Room hands it to the game; a seat with none plays builtin. */
export function seatKindOf(seat: SeatInfo): SeatKind {
  return (seat as SeatInfo & { kind?: unknown }).kind === 'claude' ? 'claude' : 'builtin';
}

export interface ClaudeSeat {
  name: string;
  writer: ClaudeSeatWriter;
}

/** Each started game's Claude seats by seat id, keyed by the game that hosts them; a disposed game takes its own along. */
const tables = new WeakMap<object, Map<string, ClaudeSeat>>();

/** Records a started game's Claude seat; a writer that is not a ClaudeSeatWriter (a test's brain) records nothing. */
export function seatClaude(table: object, seatId: string, name: string, writer: PlaybookWriter | null): void {
  if (!(writer instanceof ClaudeSeatWriter)) return;
  const seats = tables.get(table) ?? new Map<string, ClaudeSeat>();
  const seat = { name, writer };
  seats.set(seatId, seat);
  tables.set(table, seats);
  for (const wake of [...(waiting.get(table) ?? [])]) wake(seatId, seat);
}

type Wake = (seatId: string, seat: ClaudeSeat) => void;

/** Waits held before a game starts, by the game they wait on. */
const waiting = new WeakMap<object, Set<Wake>>();

/** The Claude seat once its game records it, within `holdMs`; null when the hold ends or `signal` aborts first. */
export function waitForSeat(table: object, seatId: string, holdMs: number, signal?: AbortSignal): Promise<ClaudeSeat | null> {
  const now = claudeSeatAt(table, seatId);
  if (now || signal?.aborted) return Promise.resolve(now);
  return new Promise((resolve) => {
    const wakes = waiting.get(table) ?? new Set<Wake>();
    waiting.set(table, wakes);
    const done = (seat: ClaudeSeat | null) => {
      wakes.delete(wake);
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      resolve(seat);
    };
    const wake: Wake = (id, seat) => {
      if (id === seatId) done(seat);
    };
    const stop = () => done(null);
    const timer = setTimeout(stop, holdMs);
    signal?.addEventListener('abort', stop, { once: true });
    wakes.add(wake);
  });
}

/** The Claude seat `seatId` of the game `table`, or null before that game starts. */
export function claudeSeatAt(table: object, seatId: string): ClaudeSeat | null {
  return tables.get(table)?.get(seatId) ?? null;
}
