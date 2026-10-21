import { Room, type RoomOptions } from './room.js';

/** No vowels (so codes never spell words) and no letters that are easy to mix up. */
const CODE_LETTERS = 'BCDFGHJKLMNPQRSTVWXZ';

/** Keeps the live rooms by their 4-letter code. */
export class RoomRegistry<Intent, View> {
  private readonly rooms = new Map<string, { room: Room<Intent, View>; idleSince: number | null }>();

  constructor(
    private readonly options: Omit<RoomOptions<Intent, View>, 'code' | 'onClose'>,
    private readonly random: () => number = Math.random,
    private readonly now: () => number = Date.now,
  ) {}

  create(): Room<Intent, View> {
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(this.random() * CODE_LETTERS.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room<Intent, View>({ ...this.options, code, onClose: () => this.rooms.delete(code) });
    this.rooms.set(code, { room, idleSince: null });
    return room;
  }

  get(code: string): Room<Intent, View> | undefined {
    return this.rooms.get(code.trim().toUpperCase())?.room;
  }

  get size(): number {
    return this.rooms.size;
  }

  /** Closes rooms nobody has been connected to for `idleMs`. Phones that drop briefly keep their room. */
  sweep(idleMs: number): void {
    const now = this.now();
    for (const [code, entry] of this.rooms) {
      if (!entry.room.isIdle) entry.idleSince = null;
      else if (entry.idleSince === null) entry.idleSince = now;
      else if (now - entry.idleSince >= idleMs) {
        entry.room.dispose();
        this.rooms.delete(code);
      }
    }
  }
}
