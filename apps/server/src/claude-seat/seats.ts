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
  seats.set(seatId, { name, writer });
  tables.set(table, seats);
}

/** The Claude seat `seatId` of the game `table`, or null before that game starts. */
export function claudeSeatAt(table: object, seatId: string): ClaudeSeat | null {
  return tables.get(table)?.get(seatId) ?? null;
}
