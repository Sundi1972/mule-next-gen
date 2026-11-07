/** What a seat code names: the read contract /mcp holds with the Room that issues codes (spec C1, C2, RULE-2). */
import { randomInt } from 'node:crypto';

/**
 * A live code's seat: the game hosting it (the object MuleGame.start recorded its Claude seats under) and the seat id.
 * A dead code says why it died; a code no seat ever held is null.
 */
export type CodeAnswer = { state: 'live'; table: object; seatId: string } | { state: 'taken_back' } | { state: 'game_over' } | null;

/** Asked on every tool call; never logs or keeps the code it is given. */
export type SeatLookup = (code: string) => CodeAnswer;

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DIGITS = '0123456789';

const normal = (code: string) => code.trim().toUpperCase();

/**
 * Seat codes held in the server, for tests and until the Room issues them (C1). It answers as the Room will: a code
 * taken back or of a game that ended says so, and is never live again.
 */
export class SeatCodeBook {
  private readonly live = new Map<string, { table: object; seatId: string }>();
  private readonly dead = new Map<string, 'taken_back' | 'game_over'>();

  readonly lookup: SeatLookup = (code) => {
    const typed = normal(code);
    const seat = this.live.get(typed);
    if (seat) return { state: 'live', ...seat };
    const died = this.dead.get(typed);
    return died ? { state: died } : null;
  };

  /** A new code for the seat, in the spec's format (`K7QM-42`), unique among every code this book has issued. */
  issue(table: object, seatId: string): string {
    let code: string;
    do {
      const pick = (from: string, n: number) => Array.from({ length: n }, () => from[randomInt(from.length)]).join('');
      code = `${pick(LETTERS, 4)}-${pick(DIGITS, 2)}`;
    } while (this.live.has(code) || this.dead.has(code));
    this.live.set(code, { table, seatId });
    return code;
  }

  takeBack(code: string): void {
    this.kill(normal(code), 'taken_back');
  }

  /** Every code of the game `table` dies. */
  endGame(table: object): void {
    for (const [code, seat] of this.live) if (seat.table === table) this.kill(code, 'game_over');
  }

  private kill(code: string, why: 'taken_back' | 'game_over'): void {
    if (this.live.delete(code)) this.dead.set(code, why);
  }
}
