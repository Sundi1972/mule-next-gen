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

/** Heiko (host) and Mia on phones, a TV, and one AI seat, Brix, in the lobby; `hosted` is the game the room made. */
async function lobby(options: { newSeatCode?: () => string } = {}) {
  let hosted: object | null = null;
  const room = new Room<unknown, View>({ code: 'KRTX', createGame: () => (hosted = game()) as Game<unknown, View>, aiNames: ['Brix', 'Juno'], newToken: () => `t${++tokens}`, ...options });
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
  return { room, heiko, mia, tv, brix, set, hosted: hosted! as object };
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
    const { room, heiko, brix, set, hosted } = await lobby();
    await set(heiko, 'claude');
    const code = heiko.view().seats.find((s) => s.id === brix)!.seatCode!;
    // The table is the game the room hosts: the object the game's start recorded its Claude seats under (WS2's lookup).
    const live = room.seatForCode(code);
    expect(live).toMatchObject({ state: 'live', seatId: brix });
    // The game instance itself, never the Room: WS2's PR-1b keys each Claude seat's writer by it, and a Room would
    // match nothing and answer "call again" for ever.
    expect(live?.state === 'live' && live.table, 'the table is the hosted game itself').toBe(hosted);
    expect(live?.state === 'live' && live.table).not.toBe(room);
    expect(room.seatForCode(` ${code.toLowerCase()} `)).toMatchObject({ state: 'live', seatId: brix });
    expect(room.seatForCode('ZZZZ-00'), 'a code no seat ever held').toBeNull();
  });

  it('RULE-1 row 3: back to Built-in, the code dies at once: no view shows it, and it answers "taken back", never a seat', async () => {
    const { room, heiko, brix, set } = await lobby();
    await set(heiko, 'claude');
    const code = heiko.view().seats.find((s) => s.id === brix)!.seatCode!;
    await set(heiko, 'builtin');
    const seat = heiko.view().seats.find((s) => s.id === brix)!;
    expect(seat.kind).toBe('builtin');
    expect(seat.seatCode).toBeUndefined();
    expect(seat.claude).toBeUndefined();
    // Remembered as taken back, so the MCP side says so and doesn't count it as a wrong code (PM ruling (b)).
    expect(room.seatForCode(code)).toEqual({ state: 'taken_back' });
    // Back to Claude, the seat gets a new code; the old one stays taken back.
    await set(heiko, 'claude');
    const again = heiko.view().seats.find((s) => s.id === brix)!.seatCode!;
    expect(again).not.toBe(code);
    expect(room.seatForCode(code)).toEqual({ state: 'taken_back' });
    expect(room.seatForCode(again)).toMatchObject({ state: 'live', seatId: brix });
  });

  it('RULE-1 row 4: setting the kind a seat already has changes nothing, so a Claude seat keeps its code', async () => {
    const { heiko, brix, set } = await lobby();
    await set(heiko, 'claude');
    const code = heiko.view().seats.find((s) => s.id === brix)!.seatCode;
    await set(heiko, 'claude');
    expect(heiko.view().seats.find((s) => s.id === brix)!.seatCode).toBe(code);
  });

  it('C1: a room hosting a wrapper of its game (a recorder) names the game itself as the table, never the wrapper', async () => {
    const inner = game();
    const wrapper: Game<unknown, View> = { start: (s) => inner.start(s), handle: (a, b) => inner.handle(a, b), viewFor: (s) => inner.viewFor(s), table: inner };
    const room = new Room<unknown, View>({ code: 'KRTX', createGame: () => wrapper, aiNames: ['Brix'], newToken: () => `t${++tokens}` });
    const heiko = new Screen();
    room.receive(heiko, heiko.from, { t: 'join', code: 'KRTX', name: 'Heiko' });
    room.receive(heiko, heiko.from, { t: 'addAi' });
    await flush();
    const brix = heiko.view().seats.find((s) => s.isAi)!.id;
    room.receive(heiko, heiko.from, { t: 'setSeatKind', seatId: brix, kind: 'claude' });
    await flush();
    const answer = room.seatForCode(heiko.view().seats.find((s) => s.id === brix)!.seatCode!);
    expect(answer?.state === 'live' && answer.table).toBe(inner);
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

  it('C1: a code the room holds, live or taken back, is never issued again', async () => {
    const issued = ['AAAA-11', 'AAAA-11', 'BBBB-22', 'AAAA-11', 'BBBB-22', 'CCCC-33'];
    const { room, heiko, brix, set } = await lobby({ newSeatCode: () => issued.shift()! });
    room.receive(heiko, heiko.from, { t: 'addAi' });
    await flush();
    const juno = heiko.view().seats.filter((s) => s.isAi).find((s) => s.id !== brix)!.id;
    await set(heiko, 'claude');
    await set(heiko, 'claude', juno);
    expect(heiko.view().seats.filter((s) => s.kind === 'claude').map((s) => s.seatCode).sort()).toEqual(['AAAA-11', 'BBBB-22']);
    // Brix taken back and made Claude's again: AAAA-11 (taken back) and BBBB-22 (Juno's) are skipped.
    await set(heiko, 'builtin');
    await set(heiko, 'claude');
    expect(heiko.view().seats.find((s) => s.id === brix)!.seatCode).toBe('CCCC-33');
  });

  it('C1: the registry issues a code no other live room holds', async () => {
    // Room 1's code, its seat's code (AAAA-00), room 2's code, then room 2's seat draws AAAA-00 again before another.
    const draws = [0, 0, 0, 0, ...Array(6).fill(0), 0.5, 0.5, 0.5, 0.5, ...Array(6).fill(0), ...Array(6).fill(0.9)];
    const random = () => draws.shift() ?? 0.9;
    const registry = new RoomRegistry<unknown, View>({ createGame: game, aiNames: ['Brix'] }, random, Date.now, random);
    const codes: string[] = [];
    const rooms: { room: Room<unknown, View>; ai: string }[] = [];
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
      rooms.push({ room, ai });
    }
    // The registry answers for every room: each code finds its own room's game and seat (PM ruling (a)).
    for (const [i, { room, ai }] of rooms.entries()) {
      const answer = registry.seatForCode(codes[i]!.toLowerCase());
      expect(answer).toMatchObject({ state: 'live', seatId: ai });
      expect(answer && answer.state === 'live' && answer.table).toBe((room.seatForCode(codes[i]!) as { table: object }).table);
    }
    expect(registry.seatForCode('ZZZZ-99')).toBeNull();
    expect(codes[0]).toBe('AAAA-00');
    expect(codes[1]).toMatch(SEAT_CODE);
    expect(codes[1], 'the second room redraws rather than issue a live code').not.toBe('AAAA-00');
  });

  it('PM ruling (a) on #628\'s review: a room that leaves the registry leaves its codes taken back, never live and never issued again', async () => {
    let t = 0;
    // The first room's first code is AAAA-00; the last room draws it again and must redraw.
    const seatDraws: number[] = Array(6).fill(0);
    const seatRandom = () => seatDraws.shift() ?? Math.random();
    const registry = new RoomRegistry<unknown, View>({ createGame: game, aiNames: ['Brix', 'Juno'], newToken: () => `t${++tokens}` }, Math.random, () => t, seatRandom);
    /** A room whose host made two AI seats Claude's and switched the first back: one live code and one dead. */
    const claudeRoom = async () => {
      const room = registry.create();
      const host = new Screen();
      room.receive(host, host.from, { t: 'join', code: room.code, name: 'Host' });
      room.receive(host, host.from, { t: 'addAi' });
      room.receive(host, host.from, { t: 'addAi' });
      await flush();
      const [first, second] = host.view().seats.filter((s) => s.isAi).map((s) => s.id);
      const codeOf = (id: string) => host.view().seats.find((s) => s.id === id)!.seatCode!;
      room.receive(host, host.from, { t: 'setSeatKind', seatId: first!, kind: 'claude' });
      await flush();
      const dead = codeOf(first!);
      room.receive(host, host.from, { t: 'setSeatKind', seatId: first!, kind: 'builtin' });
      seatDraws.push(...Array(6).fill(0.5));
      room.receive(host, host.from, { t: 'setSeatKind', seatId: second!, kind: 'claude' });
      await flush();
      return { room, host, codes: [dead, codeOf(second!)] };
    };
    const ends: [string, (r: Awaited<ReturnType<typeof claudeRoom>>) => void][] = [
      ['the host closes it', ({ room, host }) => room.receive(host, host.from, { t: 'close' })],
      ['a game error ends it', ({ room }) => room.fail()],
      ['the idle sweep', ({ room, host }) => {
        room.disconnect(host);
        registry.sweep(1000);
        t += 1000;
        registry.sweep(1000);
      }],
      ['the server shuts down', () => registry.disposeAll()],
    ];
    for (const [how, end] of ends) {
      const made = await claudeRoom();
      expect(registry.seatForCode(made.codes[1]!), how).toMatchObject({ state: 'live' });
      end(made);
      expect(registry.get(made.room.code), `${how}: the room is gone`).toBeUndefined();
      for (const code of made.codes) expect(registry.seatForCode(` ${code.toLowerCase()} `), `${how}: ${code}`).toEqual({ state: 'taken_back' });
    }
    // A new room's seat draws AAAA-00, which the first room issued: it redraws rather than issue a retired code.
    const fresh = registry.create();
    const host = new Screen();
    fresh.receive(host, host.from, { t: 'join', code: fresh.code, name: 'Host' });
    fresh.receive(host, host.from, { t: 'addAi' });
    await flush();
    const ai = host.view().seats.find((s) => s.isAi)!.id;
    seatDraws.push(...Array(6).fill(0), ...Array(6).fill(0.75));
    fresh.receive(host, host.from, { t: 'setSeatKind', seatId: ai, kind: 'claude' });
    await flush();
    const code = host.view().seats.find((s) => s.id === ai)!.seatCode!;
    expect(code).toMatch(SEAT_CODE);
    expect(code).not.toBe('AAAA-00');
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

  it('C1 (negative): a kicked Claude seat takes its code with it: the code answers "taken back"', async () => {
    const { room, heiko, brix, set } = await lobby();
    await set(heiko, 'claude');
    const code = heiko.view().seats.find((s) => s.id === brix)!.seatCode!;
    room.receive(heiko, heiko.from, { t: 'kick', seatId: brix });
    await flush();
    expect(room.seatForCode(code)).toEqual({ state: 'taken_back' });
  });

  it('C1: a Claude seat starts the game as a computer seat with its kind, so the game knows it (PM ruling (c)) and plays its built-in plan until Claude calls', async () => {
    const started: { id: string; name: string; isAi: boolean; kind?: string }[][] = [];
    const room = new Room<unknown, View>({ code: 'KRTX', createGame: () => ({ ...game(), start: (seats) => started.push(seats) }), aiNames: ['Brix'], newToken: () => `t${++tokens}` });
    const heiko = new Screen();
    room.receive(heiko, heiko.from, { t: 'join', code: 'KRTX', name: 'Heiko' });
    room.receive(heiko, heiko.from, { t: 'addAi' });
    await flush();
    const brix = heiko.view().seats.find((s) => s.isAi)!.id;
    room.receive(heiko, heiko.from, { t: 'setSeatKind', seatId: brix, kind: 'claude' });
    room.receive(heiko, heiko.from, { t: 'start' });
    await flush();
    expect(started[0]!.find((s) => s.id === brix)).toMatchObject({ isAi: true, kind: 'claude' });
    expect(started[0]!.find((s) => s.name === 'Heiko')).not.toHaveProperty('kind');
  });
});
