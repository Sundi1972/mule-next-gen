import { cryptoRandom, Room, seatCode, type RoomOptions, type SeatCodeAnswer } from './room.js';

/** No vowels (so codes never spell words) and no letters that are easy to mix up. */
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

/** Keeps the live rooms by their 4-letter code. */
export class RoomRegistry<Intent, View> {
  private readonly rooms = new Map<string, { room: Room<Intent, View>; idleSince: number | null }>();
  /**
   * The seat codes of every room that has left (closed, failed, swept, shut down), taken back (PM ruling (a) on #628's
   * review): a Claude chat still calling with one is told so, not counted as a wrong code, and no room issues it again.
   * A few bytes a code, for the server's life.
   */
  private readonly retired = new Set<string>();

  constructor(
    private readonly options: Omit<RoomOptions<Intent, View>, 'code' | 'onClose'>,
    private readonly random: () => number = Math.random,
    private readonly now: () => number = Date.now,
    /** For seat codes, which let whoever holds one play a seat: cryptographic unless a test passes its own. */
    private readonly seatRandom: () => number = cryptoRandom,
  ) {}

  /**
   * What a seat code names, across every live room: the Claude seat's MCP module asks this on every call (spec §9: the
   * Room is the one store of codes). A code is held by at most one room, live or dead, so the first answer is the answer.
   */
  seatForCode(code: string): SeatCodeAnswer {
    for (const { room } of this.rooms.values()) {
      const answer = room.seatForCode(code);
      if (answer) return answer;
    }
    return this.retired.has(code.trim().toUpperCase()) ? { state: 'taken_back' } : null;
  }

  /** Drops a room, retiring its seat codes. */
  private remove(code: string): Room<Intent, View> | undefined {
    const entry = this.rooms.get(code);
    if (!entry) return undefined;
    this.rooms.delete(code);
    for (const seatCode of entry.room.seatCodes) this.retired.add(seatCode);
    return entry.room;
  }

  /** A seat code no room holds, has taken back or has retired (spec §3: unique among live codes), so a code names one seat. */
  private newSeatCode(): string {
    for (let i = 0; i < 100; i++) {
      const code = seatCode(this.seatRandom);
      if (this.seatForCode(code) === null) return code;
    }
    throw new Error('No free seat code after 100 draws');
  }

  create(): Room<Intent, View> {
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(this.random() * CODE_LETTERS.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room<Intent, View>({ ...this.options, code, newSeatCode: () => this.newSeatCode(), onClose: () => void this.remove(code) });
    this.rooms.set(code, { room, idleSince: null });
    return room;
  }

  get(code: string): Room<Intent, View> | undefined {
    return this.rooms.get(code.trim().toUpperCase())?.room;
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Disposes every room, as the server shuts down: no game's timers outlive it. One room that fails to stops no other. */
  disposeAll(): void {
    for (const code of [...this.rooms.keys()]) disposeQuietly(code, this.remove(code)!);
  }

  /** Closes rooms nobody has been connected to for `idleMs`. Phones that drop briefly keep their room. */
  sweep(idleMs: number): void {
    const now = this.now();
    for (const [code, entry] of this.rooms) {
      if (!entry.room.isIdle) entry.idleSince = null;
      else if (entry.idleSince === null) entry.idleSince = now;
      else if (now - entry.idleSince >= idleMs) disposeQuietly(code, this.remove(code)!);
    }
  }
}

/** Disposes a room; a game whose own dispose throws is logged, so the rooms after it are still disposed. */
function disposeQuietly(code: string, room: { dispose(): void }): void {
  try {
    room.dispose();
  } catch (err) {
    console.error(`room ${code}: dispose failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
