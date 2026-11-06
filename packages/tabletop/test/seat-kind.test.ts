import { describe, expect, it } from 'vitest';
import { Room, RoomRegistry, type Connection, type Game, type ServerEnvelope, type TableView } from '../src/index.js';

/**
 * C1 (the Claude seat spec): a computer seat has a kind, builtin or claude, which the host sets in the lobby. A claude
 * seat holds a seat code that lets whoever holds it play the seat, so the code reaches the host's own view and no other
 * (T-AC-5); RULE-1 says who may set it and when.
 */
type View = { n: number };
const game = (): Game<unknown, View> => ({ start() {}, handle() {}, viewFor: () => ({ n: 0 }) });

class Screen implements Connection<View> {
  readonly inbox: ServerEnvelope<View>[] = [];
  readonly from = { seatId: null as string | null };
  send(msg: ServerEnvelope<View>) {
    this.inbox.push(msg);
  }
  view(): TableView<View> {
    const v = this.inbox.filter((m) => m.t === 'view').at(-1);
    if (!v || v.t !== 'view') throw new Error('no view yet');
    return v.view;
  }
  error(): string | undefined {
    const e = this.inbox.filter((m) => m.t === 'error').at(-1);
    return e && e.t === 'error' ? e.message : undefined;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));
let tokens = 0;
const SEAT_CODE = /^[A-Z2-9]{4}-\d{2}$/;

/** Heiko (host) and Mia on phones, a TV, and one AI seat, Brix, in the lobby. */
async function lobby(options: { newSeatCode?: () => string } = {}) {
  const room = new Room<unknown, View>({ code: 'KRTX', createGame: game, aiNames: ['Brix', 'Juno'], newToken: () => `t${++tokens}`, ...options });
  const heiko = new Screen();
  const mia = new Screen();
  const tv = new Screen();
  room.receive(heiko, heiko.from, { t: 'join', code: 'KRTX', name: 'Heiko' });
  room.receive(mia, mia.from, { t: 'join', code: 'KRTX', name: 'Mia' });
  room.receive(tv, tv.from, { t: 'board', code: 'KRTX' });
  room.receive(heiko, heiko.from, { t: 'addAi' });
  await flush();
  const brix = heiko.view().seats.find((s) => s.isAi)!.id;
  const set = async (who: Screen, kind: 'builtin' | 'claude', seatId = brix) => {
    room.receive(who, who.from, { t: 'setSeatKind', seatId, kind });
    await flush();
  };
  return { room, heiko, mia, tv, brix, set };
}

describe('C1: a computer seat is Built-in or Claude, and only the host holds its code', () => {
  it('T-AC-5: the host sets Claude; his view holds the seat code, no other phone and no TV ever does', async () => {
    const { room, heiko, mia, tv, brix, set } = await lobby();
    await set(heiko, 'claude');
    const mine = heiko.view().seats.find((s) => s.id === brix)!;
    expect(mine).toMatchObject({ kind: 'claude', claude: 'waiting' });
    expect(mine.seatCode).toMatch(SEAT_CODE);
    for (const [who, view] of [['Mia', mia.view()], ['the TV', tv.view()], ['the room for nobody', room.viewFor(null)]] as const) {
      expect(view.seats.find((s) => s.id === brix), `${who} sees the seat is Claude's`).toMatchObject({ kind: 'claude', claude: 'waiting' });
      expect(JSON.stringify(view), `${who} never sees the code`).not.toContain(mine.seatCode!);
    }
    // Everything else Mia and the TV were ever sent, not only their last view.
    expect(JSON.stringify([...mia.inbox, ...tv.inbox])).not.toContain(mine.seatCode!);
  });

  it('C1: the code finds its seat in this room, typed in any case; a code nobody holds finds none', async () => {
    const { room, heiko, brix, set } = await lobby();
    await set(heiko, 'claude');
    const code = heiko.view().seats.find((s) => s.id === brix)!.seatCode!;
    expect(room.seatForCode(code)).toEqual({ seatId: brix, kind: 'claude' });
    expect(room.seatForCode(` ${code.toLowerCase()} `)).toEqual({ seatId: brix, kind: 'claude' });
    expect(room.seatForCode('ZZZZ-00')).toBeNull();
  });

  it('RULE-1 row 3: back to Built-in, the code dies at once: no view shows it and it finds no seat', async () => {
    const { room, heiko, brix, set } = await lobby();
    await set(heiko, 'claude');
    const code = heiko.view().seats.find((s) => s.id === brix)!.seatCode!;
    await set(heiko, 'builtin');
    const seat = heiko.view().seats.find((s) => s.id === brix)!;
    expect(seat.kind).toBe('builtin');
    expect(seat.seatCode).toBeUndefined();
    expect(seat.claude).toBeUndefined();
    expect(room.seatForCode(code)).toBeNull();
  });

  it('RULE-1 row 4: setting the kind a seat already has changes nothing, so a Claude seat keeps its code', async () => {
    const { heiko, brix, set } = await lobby();
    await set(heiko, 'claude');
    const code = heiko.view().seats.find((s) => s.id === brix)!.seatCode;
    await set(heiko, 'claude');
    expect(heiko.view().seats.find((s) => s.id === brix)!.seatCode).toBe(code);
  });

  it('C1: two Claude seats get two codes', async () => {
    const { room, heiko, brix, set } = await lobby();
    room.receive(heiko, heiko.from, { t: 'addAi' });
    await flush();
    const juno = heiko.view().seats.filter((s) => s.isAi).find((s) => s.id !== brix)!.id;
    await set(heiko, 'claude');
    await set(heiko, 'claude', juno);
    const codes = heiko.view().seats.filter((s) => s.kind === 'claude').map((s) => s.seatCode);
    expect(new Set(codes).size).toBe(2);
  });

  it('C1: a code already live in the room is never issued twice', async () => {
    const issued = ['AAAA-11', 'AAAA-11', 'BBBB-22'];
    const { room, heiko, brix, set } = await lobby({ newSeatCode: () => issued.shift()! });
    room.receive(heiko, heiko.from, { t: 'addAi' });
    await flush();
    const juno = heiko.view().seats.filter((s) => s.isAi).find((s) => s.id !== brix)!.id;
    await set(heiko, 'claude');
    await set(heiko, 'claude', juno);
    expect(heiko.view().seats.filter((s) => s.kind === 'claude').map((s) => s.seatCode).sort()).toEqual(['AAAA-11', 'BBBB-22']);
  });

  it('C1: the registry issues a code no other live room holds', async () => {
    // Room 1's code, its seat's code (AAAA-00), room 2's code, then room 2's seat draws AAAA-00 again before another.
    const draws = [0, 0, 0, 0, ...Array(6).fill(0), 0.5, 0.5, 0.5, 0.5, ...Array(6).fill(0), ...Array(6).fill(0.9)];
    const random = () => draws.shift() ?? 0.9;
    const registry = new RoomRegistry<unknown, View>({ createGame: game, aiNames: ['Brix'] }, random, Date.now, random);
    const codes: string[] = [];
    for (let i = 0; i < 2; i++) {
      const room = registry.create();
      const host = new Screen();
      room.receive(host, host.from, { t: 'join', code: room.code, name: 'Host' });
      room.receive(host, host.from, { t: 'addAi' });
      await flush();
      const ai = host.view().seats.find((s) => s.isAi)!.id;
      room.receive(host, host.from, { t: 'setSeatKind', seatId: ai, kind: 'claude' });
      await flush();
      codes.push(host.view().seats.find((s) => s.id === ai)!.seatCode!);
    }
    expect(codes[0]).toBe('AAAA-00');
    expect(codes[1]).toMatch(SEAT_CODE);
    expect(codes[1], 'the second room redraws rather than issue a live code').not.toBe('AAAA-00');
  });

  it('RULE-1 row 1 (negative): only the host, only in the lobby, only on a computer seat', async () => {
    const { room, heiko, mia, brix, set } = await lobby();
    await set(mia, 'claude');
    expect(mia.error()).toBe('Only the host can do that');
    expect(heiko.view().seats.find((s) => s.id === brix)!.kind).toBeUndefined();

    const heikoSeat = heiko.view().seats.find((s) => s.name === 'Heiko')!.id;
    await set(heiko, 'claude', heikoSeat);
    expect(heiko.error()).toBe('Only a computer seat can be played by Claude');
    await set(heiko, 'claude', 's999');
    expect(heiko.error()).toBe('No such seat');

    room.receive(heiko, heiko.from, { t: 'start' });
    await flush();
    await set(heiko, 'claude');
    expect(heiko.error()).toBe('The game has already started');
    expect(heiko.view().seats.find((s) => s.id === brix)!.kind).toBeUndefined();
  });

  it('C1 (negative): a kicked Claude seat takes its code with it', async () => {
    const { room, heiko, brix, set } = await lobby();
    await set(heiko, 'claude');
    const code = heiko.view().seats.find((s) => s.id === brix)!.seatCode!;
    room.receive(heiko, heiko.from, { t: 'kick', seatId: brix });
    await flush();
    expect(room.seatForCode(code)).toBeNull();
  });

  it('C1: a Claude seat starts the game as a computer seat, so it plays its built-in plan until Claude calls', async () => {
    const started: { id: string; isAi: boolean }[][] = [];
    const room = new Room<unknown, View>({ code: 'KRTX', createGame: () => ({ ...game(), start: (seats) => started.push(seats) }), aiNames: ['Brix'], newToken: () => `t${++tokens}` });
    const heiko = new Screen();
    room.receive(heiko, heiko.from, { t: 'join', code: 'KRTX', name: 'Heiko' });
    room.receive(heiko, heiko.from, { t: 'addAi' });
    await flush();
    const brix = heiko.view().seats.find((s) => s.isAi)!.id;
    room.receive(heiko, heiko.from, { t: 'setSeatKind', seatId: brix, kind: 'claude' });
    room.receive(heiko, heiko.from, { t: 'start' });
    await flush();
    expect(started[0]!.find((s) => s.id === brix)).toMatchObject({ isAi: true });
  });
});
