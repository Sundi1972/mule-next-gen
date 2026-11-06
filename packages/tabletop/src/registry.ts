import { cryptoRandom, Room, seatCode, type RoomOptions } from './room.js';

/** No vowels (so codes never spell words) and no letters that are easy to mix up. */
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

/** Keeps the live rooms by their 4-letter code. */
export class RoomRegistry<Intent, View> {
  private readonly rooms = new Map<string, { room: Room<Intent, View>; idleSince: number | null }>();

  constructor(
    private readonly options: Omit<RoomOptions<Intent, View>, 'code' | 'onClose'>,
    private readonly random: () => number = Math.random,
    private readonly now: () => number = Date.now,
    /** For seat codes, which let whoever holds one play a seat: cryptographic unless a test passes its own. */
    private readonly seatRandom: () => number = cryptoRandom,
  ) {}

  /** A seat code no live room holds (spec §3: unique among live codes), so a code always finds one seat. */
  private newSeatCode(): string {
    for (let i = 0; i < 100; i++) {
      const code = seatCode(this.seatRandom);
      if (![...this.rooms.values()].some(({ room }) => room.seatForCode(code))) return code;
    }
    throw new Error('No free seat code after 100 draws');
  }

  create(): Room<Intent, View> {
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(this.random() * CODE_LETTERS.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room<Intent, View>({ ...this.options, code, newSeatCode: () => this.newSeatCode(), onClose: () => this.rooms.delete(code) });
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
    for (const [code, entry] of this.rooms) {
      this.rooms.delete(code);
      disposeQuietly(code, entry.room);
    }
  }

  /** Closes rooms nobody has been connected to for `idleMs`. Phones that drop briefly keep their room. */
  sweep(idleMs: number): void {
    const now = this.now();
    for (const [code, entry] of this.rooms) {
      if (!entry.room.isIdle) entry.idleSince = null;
      else if (entry.idleSince === null) entry.idleSince = now;
      else if (now - entry.idleSince >= idleMs) {
        this.rooms.delete(code);
        disposeQuietly(code, entry.room);
      }
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
