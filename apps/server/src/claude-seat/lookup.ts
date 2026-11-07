/** What a seat code names: the read contract /mcp holds with the Room that issues codes (spec C1, C2, RULE-2). */
import { randomInt } from 'node:crypto';
import type { SeatCodeAnswer } from '@tabletop/core';

/**
 * A live code's seat: the game hosting it (the object MuleGame.start recorded its Claude seats under) and the seat id.
 * A dead code says why it died; a code no seat ever held is null. The Room's answer, plus game over, which withGameOver
 * decides here from the game's own state (spec §8, amendment 3).
 */
export type CodeAnswer = SeatCodeAnswer | { state: 'game_over' };

/** Asked on every tool call; never logs or keeps the code it is given. */
export type SeatLookup = (code: string) => CodeAnswer;

/** A game that can say where it stands: MuleGame's stateNow. */
interface Standing {
  stateNow(): { phase: string } | null;
}

const isOver = (table: object) => 'stateNow' in table && (table as Standing).stateNow()?.phase === 'gameOver';

/**
 * `lookup` with game over decided here: the Room kills a code only when the seat is taken back, so a live code of a
 * game that has ended answers game_over before anything else reads it.
 */
export function withGameOver(lookup: SeatLookup): SeatLookup {
  return (code) => {
    const answer = lookup(code);
    return answer?.state === 'live' && isOver(answer.table) ? { state: 'game_over' } : answer;
  };
}

const LETTERS ='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DIGITS = '0123456789';

const normal = (code: string) => code.trim().toUpperCase();

/**
 * Seat codes held outside any Room, for the endpoint's own tests; the server asks the Room (mcp.ts roomLookup). It
 * answers as the Room's seatForCode does: a live code names its seat, a taken-back code says so and is never live
 * again, any other code is null. Game over is withGameOver's, from the game's state, as on the server.
 */
export class SeatCodeBook {
  private readonly live = new Map<string, { table: object; seatId: string }>();
  private readonly takenBack = new Set<string>();

  readonly lookup = (code: string): SeatCodeAnswer => {
    const typed = normal(code);
    const seat = this.live.get(typed);
    if (seat) return { state: 'live', ...seat };
    return this.takenBack.has(typed) ? { state: 'taken_back' } : null;
  };

  /** A new code for the seat, in the spec's format (`K7QM-42`), unique among every code this book has issued. */
  issue(table: object, seatId: string): string {
    let code: string;
    do {
      const pick = (from: string, n: number) => Array.from({ length: n }, () => from[randomInt(from.length)]).join('');
      code = `${pick(LETTERS, 4)}-${pick(DIGITS, 2)}`;
    } while (this.live.has(code) || this.takenBack.has(code));
    this.live.set(code, { table, seatId });
    return code;
  }

  takeBack(code: string): void {
    const typed = normal(code);
    if (this.live.delete(typed)) this.takenBack.add(typed);
  }
}
