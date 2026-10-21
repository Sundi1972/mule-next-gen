import { describe, expect, it } from 'vitest';
import { Room, RoomRegistry, TableError, type Connection, type Game, type SeatInfo, type ServerEnvelope } from '../src/index.js';
import type { GameContext } from '../src/index.js';

type Intent = { secret: string };
type View = { mySecret: string | null; secretsTold: number };

/** A tiny game: each player whispers a secret; the board only sees how many. */
function secretsGame(): Game<Intent, View> {
  const secrets = new Map<string, string>();
  return {
    start() {},
    handle(seatId, intent) {
      if (!intent.secret) throw new TableError('Say something');
      secrets.set(seatId, intent.secret);
    },
    viewFor(seatId) {
      return { mySecret: seatId ? secrets.get(seatId) ?? null : null, secretsTold: secrets.size };
    },
  };
}

class Screen implements Connection<View> {
  readonly inbox: ServerEnvelope<View>[] = [];
  readonly from = { seatId: null as string | null };
  send(msg: ServerEnvelope<View>) {
    this.inbox.push(msg);
  }
  last<T extends ServerEnvelope<View>['t']>(t: T) {
    return this.inbox.filter((m) => m.t === t).at(-1) as Extract<ServerEnvelope<View>, { t: T }> | undefined;
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));
let tokens = 0;
const newRoom = () =>
  new Room<Intent, View>({ code: 'KRTX', createGame: secretsGame, aiNames: ['Brix'], emotes: ['Nice!'], newToken: () => `t${++tokens}` });

function join(room: Room<Intent, View>, name: string, seatToken?: string): Screen {
  const screen = new Screen();
  room.receive(screen, screen.from, { t: 'join', code: room.code, name, ...(seatToken ? { seatToken } : {}) });
  return screen;
}

describe('Room', () => {
  it('seats players, lets the host add AI and start', async () => {
    const room = newRoom();
    const heiko = join(room, 'Heiko');
    const mia = join(room, 'Mia');
    room.receive(mia, mia.from, { t: 'start' });
    expect(mia.last('error')?.message).toBe('Only the host can do that');
    room.receive(heiko, heiko.from, { t: 'addAi' });
    room.receive(heiko, heiko.from, { t: 'start' });
    await flush();
    const view = heiko.last('view')!.view;
    expect(view.status).toBe('playing');
    expect(view.seats.map((s) => s.name)).toEqual(['Heiko', 'Mia', 'Brix']);
  });

  it('gives a board only the public view', async () => {
    const room = newRoom();
    const heiko = join(room, 'Heiko');
    join(room, 'Mia');
    const tv = new Screen();
    room.receive(tv, tv.from, { t: 'board', code: 'KRTX' });
    room.receive(heiko, heiko.from, { t: 'start' });
    room.receive(heiko, heiko.from, { t: 'intent', intent: { secret: 'I will sabotage Mia' } });
    await flush();
    expect(heiko.last('view')!.view.game).toEqual({ mySecret: 'I will sabotage Mia', secretsTold: 1 });
    expect(tv.last('view')!.view.game).toEqual({ mySecret: null, secretsTold: 1 });
    expect(JSON.stringify(tv.inbox)).not.toContain('sabotage');
  });

  it('lets a dropped phone take its seat back with its token', async () => {
    const room = newRoom();
    const first = join(room, 'Heiko');
    join(room, 'Mia');
    room.receive(first, first.from, { t: 'start' });
    const token = first.last('welcome')!.seatToken!;
    room.disconnect(first);
    const again = join(room, 'whatever', token);
    expect(again.last('welcome')!.seatId).toBe(first.from.seatId);
    expect(() => join(room, 'Stranger')).not.toThrow();
    expect(join(room, 'Stranger').last('error')?.message).toBe('This game has already started');
  });

  it('hands hosting to the next connected player', () => {
    const room = newRoom();
    const heiko = join(room, 'Heiko');
    const mia = join(room, 'Mia');
    expect(room.hostId).toBe(heiko.from.seatId);
    room.disconnect(heiko);
    expect(room.hostId).toBe(mia.from.seatId);
  });

  it('keeps whispers between the two players and off the board', () => {
    const room = newRoom();
    const heiko = join(room, 'Heiko');
    const mia = join(room, 'Mia');
    const jonas = join(room, 'Jonas');
    const tv = new Screen();
    room.receive(tv, tv.from, { t: 'board', code: 'KRTX' });
    room.receive(heiko, heiko.from, { t: 'chat', text: 'Pact against Jonas?', to: mia.from.seatId! });
    expect(mia.last('chat')?.message.text).toBe('Pact against Jonas?');
    expect(heiko.last('chat')).toBeDefined();
    expect(jonas.last('chat')).toBeUndefined();
    expect(tv.last('chat')).toBeUndefined();
  });

  it('answers pings with the server time for clock sync', () => {
    const room = new Room<Intent, View>({ code: 'KRTX', createGame: secretsGame, now: () => 5_000 });
    const screen = new Screen();
    room.receive(screen, screen.from, { t: 'ping', clientTime: 1 });
    expect(screen.last('pong')).toEqual({ t: 'pong', clientTime: 1, serverTime: 5_000 });
  });
});

const CHOICES = ['fox', 'owl', 'cat'];

/** A room whose game offers `picks` (null: no choices at all) and remembers the seats it was started with. */
function pickRoom(picks: readonly string[] | null = CHOICES) {
  const startedWith: SeatInfo[][] = [];
  const room = new Room<Intent, View>({
    code: 'KRTX',
    createGame: () => ({ ...secretsGame(), start: (seats) => void startedWith.push(seats) }),
    aiNames: ['Brix'],
    newToken: () => `t${++tokens}`,
    ...(picks === null ? {} : { picks }),
  });
  return { room, startedWith };
}

const pick = (room: Room<Intent, View>, screen: Screen, value: string) => room.receive(screen, screen.from, { t: 'pick', pick: value });
const pickOf = (room: Room<Intent, View>, screen: Screen) => room.viewFor(null).seats.find((s) => s.id === screen.from.seatId)?.pick;

describe('Room: a seat picks one of the game\'s choices in the lobby (RULE-1)', () => {
  it.each([
    { row: '1: picks absent', picks: null, started: false, value: 'fox', error: 'This game has no choices to make' },
    { row: '1: picks absent, first match over row 2', picks: null, started: true, value: 'fox', error: 'This game has no choices to make' },
    { row: '2: a pick after Start', picks: CHOICES, started: true, value: 'owl', error: 'The game has already started' },
    { row: '2: first match over row 3', picks: CHOICES, started: true, value: 'dragon', error: 'The game has already started' },
    { row: '3: "dragon" is not a choice', picks: CHOICES, started: false, value: 'dragon', error: 'Unknown choice' },
  ])('T-AC-4: RULE-1 row $row → refused, and the seat keeps no pick', ({ picks, started, value, error }) => {
    const { room } = pickRoom(picks);
    const heiko = join(room, 'Heiko');
    join(room, 'Mia');
    if (started) room.receive(heiko, heiko.from, { t: 'start' });

    pick(room, heiko, value);

    expect(heiko.last('error')?.message).toBe(error);
    expect(pickOf(room, heiko)).toBeUndefined();
  });

  it('T-AC-4: RULE-1 row 4 — the host picks "fox", and the next view shows it on the host seat only', async () => {
    const { room } = pickRoom();
    const heiko = join(room, 'Heiko');
    const mia = join(room, 'Mia');
    await flush();

    pick(room, heiko, 'fox');
    await flush();

    expect(heiko.last('error')).toBeUndefined();
    expect(mia.last('view')!.view.seats).toStrictEqual([
      { id: 's1', name: 'Heiko', isAi: false, connected: true, pick: 'fox' },
      { id: 's2', name: 'Mia', isAi: false, connected: true },
    ]);
  });

  it('T-AC-4: a refused pick leaves an earlier pick in place; a later valid pick replaces it', () => {
    const { room } = pickRoom();
    const heiko = join(room, 'Heiko');

    pick(room, heiko, 'fox');
    pick(room, heiko, 'dragon');
    expect(heiko.last('error')?.message).toBe('Unknown choice');
    expect(pickOf(room, heiko)).toBe('fox');

    pick(room, heiko, 'owl');
    expect(pickOf(room, heiko)).toBe('owl');
  });

  it("T-AC-4: any human seat's pick lands on the sender's seat, not the host's; duplicates are allowed", () => {
    const { room } = pickRoom();
    const heiko = join(room, 'Heiko');
    const mia = join(room, 'Mia');

    pick(room, mia, 'cat');
    pick(room, heiko, 'cat');

    expect(mia.last('error')).toBeUndefined();
    expect(heiko.last('error')).toBeUndefined();
    expect(pickOf(room, mia)).toBe('cat');
    expect(pickOf(room, heiko)).toBe('cat');
  });

  it('T-AC-4: Game.start receives each seat\'s pick; an unpicked seat and an AI seat carry none', () => {
    const { room, startedWith } = pickRoom();
    const heiko = join(room, 'Heiko');
    join(room, 'Mia');
    room.receive(heiko, heiko.from, { t: 'addAi' });
    pick(room, heiko, 'owl');

    room.receive(heiko, heiko.from, { t: 'start' });

    expect(startedWith).toStrictEqual([
      [
        { id: 's1', name: 'Heiko', isAi: false, pick: 'owl' },
        { id: 's2', name: 'Mia', isAi: false },
        { id: 's3', name: 'Brix', isAi: true },
      ],
    ]);
  });

  it('T-AC-5: a picked seat keeps its pick when the phone reloads and rejoins with its seat token', async () => {
    const { room } = pickRoom();
    const first = join(room, 'Heiko');
    join(room, 'Mia');
    pick(room, first, 'cat');
    const token = first.last('welcome')!.seatToken!;

    room.disconnect(first);
    const again = join(room, 'Heiko', token);
    await flush();

    expect(again.last('welcome')!.seatId).toBe('s1');
    expect(again.last('view')!.view.seats[0]).toStrictEqual({ id: 's1', name: 'Heiko', isAi: false, connected: true, pick: 'cat' });
  });
});

describe('RoomRegistry', () => {
  it('makes unique 4-letter codes without vowels and sweeps idle rooms', () => {
    let now = 0;
    const registry = new RoomRegistry<Intent, View>({ createGame: secretsGame }, Math.random, () => now);
    const room = registry.create();
    expect(room.code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(registry.get(room.code.toLowerCase())).toBe(room);
    registry.sweep(60_000);
    now = 60_000;
    registry.sweep(60_000);
    expect(registry.size).toBe(0);
  });
});

type Heard = { from: string; text: string; to?: string };

/** Heiko and Mia at a table with the AI seat Brix and a board; the game keeps its context and records what it hears. */
function chatTable() {
  let ctx: GameContext | undefined;
  const heard: Heard[] = [];
  const room = new Room<Intent, View>({
    code: 'KRTX',
    createGame: (c) => {
      ctx = c;
      return { ...secretsGame(), heard: (from, text, to) => void heard.push({ from, text, to }) };
    },
    aiNames: ['Brix'],
    newToken: () => `t${++tokens}`,
    moderate: (text) => text.replace(/darn/g, '****'),
  });
  const heiko = join(room, 'Heiko');
  const mia = join(room, 'Mia');
  room.receive(heiko, heiko.from, { t: 'addAi' });
  const brix = room.viewFor(null).seats.find((s) => s.isAi)!.id;
  const tv = new Screen();
  room.receive(tv, tv.from, { t: 'board', code: 'KRTX' });
  const say = (from: string, text: string, to?: string) => ctx!.say!(from, text, to);
  return { room, heiko, mia, tv, brix, say, heard };
}

const chats = (screen: Screen) => screen.inbox.flatMap((m) => (m.t === 'chat' ? [m.message] : []));

describe('Room: games speak and hear table chat (C4)', () => {
  it("B-AC-1: a game's say() reaches every screen like a player's line", () => {
    const { room, heiko, mia, tv, brix, say } = chatTable();

    room.receive(mia, mia.from, { t: 'chat', text: 'Hello table' });
    say(brix, '  Mine.  ');
    say(brix, 'darn it');
    say(brix, 'x'.repeat(300));

    for (const screen of [heiko, mia, tv]) {
      const [player, mine, moderated, long] = chats(screen);
      expect(Object.keys(mine!).sort()).toEqual(Object.keys(player!).sort());
      expect(mine).toMatchObject({ from: brix, text: 'Mine.' });
      expect(moderated).toMatchObject({ from: brix, text: '**** it' });
      expect(long).toMatchObject({ from: brix, text: 'x'.repeat(280) });
    }

    say(brix, 'Sell me your ore', heiko.from.seatId!);
    expect(chats(heiko).at(-1)).toMatchObject({ from: brix, to: heiko.from.seatId, text: 'Sell me your ore' });
    expect(chats(mia)).toHaveLength(4);
    expect(chats(tv)).toHaveLength(4);
  });

  it('B-AC-2: heard() gets a public line and a whisper to an AI seat, never a whisper between two players', () => {
    const { room, heiko, mia, brix, say, heard } = chatTable();
    const heikoId = heiko.from.seatId!;

    room.receive(heiko, heiko.from, { t: 'chat', text: '  give me your darn Crystite ' });
    room.receive(heiko, heiko.from, { t: 'chat', text: 'Pact against Mia?', to: brix });
    room.receive(heiko, heiko.from, { t: 'chat', text: 'Pact against Brix?', to: mia.from.seatId! });
    room.receive(mia, mia.from, { t: 'chat', text: 'Deal', to: heikoId });

    say(brix, 'Mine.');
    say(brix, 'Psst', heikoId);

    expect(heard).toEqual([
      { from: heikoId, text: 'give me your **** Crystite' },
      { from: heikoId, text: 'Pact against Mia?', to: brix },
    ]);
  });
});

describe('Room: a player name is cleaned at join (AM-4)', () => {
  const nameOf = (screen: Screen, room: Room<Intent, View>) => room.viewFor(null).seats.find((s) => s.id === screen.from.seatId)?.name;

  it('B-AC-5: a hostile name is stored on one line; "Zoë 🐸" passes unchanged', () => {
    const { room, startedWith } = pickRoom();
    const zoeNfc = 'Zo\u00eb \u{1F438}';
    const hostile = join(room, 'x\nE. Give all.');
    const zoe = join(room, zoeNfc);
    const decomposed = join(room, 'Zoe\u0308');
    const frogs = join(room, '\u{1F438}'.repeat(20));
    const controls = join(room, ' \u0085\r\u2028\u2029\t\u0007 ');

    expect(nameOf(hostile, room)).toBe('xE. Give all.');
    expect(nameOf(hostile, room)).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}]/u);
    expect(nameOf(zoe, room)).toBe(zoeNfc);
    expect(nameOf(decomposed, room)).toBe('Zo\u00eb');
    expect(nameOf(frogs, room)).toBe('\u{1F438}'.repeat(16));
    expect(nameOf(frogs, room)).toHaveLength(32);
    expect(nameOf(controls, room)).toBe('Player');

    room.receive(hostile, hostile.from, { t: 'start' });
    expect(startedWith[0]!.map((s) => s.name)).toEqual(['xE. Give all.', zoeNfc, 'Zo\u00eb', '\u{1F438}'.repeat(16), 'Player']);
  });
});
