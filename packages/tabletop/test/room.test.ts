import { describe, expect, it } from 'vitest';
import { Room, RoomRegistry, TableError, type Connection, type Game, type GameContext, type SeatInfo, type ServerEnvelope } from '../src/index.js';

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
    // "blorp" is dropped outright; "darn" is masked.
    moderate: (text) => (text.includes('blorp') ? '' : text.replace(/darn/g, '****')),
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
  it("WS2 B-AC-1: a game's say() reaches every screen like a player's line", () => {
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

    // Nobody at the table by either id: say throws to its caller, and no screen gets a line.
    expect(() => say(brix, 'hi', 's99')).toThrow(TableError);
    expect(() => say(brix, 'hi', 's99')).toThrow('Nobody by that name at the table');
    expect(() => say('s99', 'hi')).toThrow(TableError);
    expect(() => say('s99', 'hi')).toThrow('Nobody by that name at the table');
    // Whatever the text: an empty line, or one moderation drops, still throws for an unknown id.
    expect(() => say('s99', '')).toThrow('Nobody by that name at the table');
    expect(() => say('s99', 'blorp')).toThrow('Nobody by that name at the table');
    expect(() => say(brix, '', 's99')).toThrow('Nobody by that name at the table');
    expect(chats(heiko)).toHaveLength(5);
    expect(chats(mia)).toHaveLength(4);
    expect(chats(tv)).toHaveLength(4);
  });

  it('WS2 B-AC-2: heard() gets a public line and a whisper to an AI seat, never a whisper between two players', () => {
    const { room, heiko, mia, tv, brix, say, heard } = chatTable();
    const heikoId = heiko.from.seatId!;

    room.receive(heiko, heiko.from, { t: 'chat', text: '  give me your darn Crystite ' });
    room.receive(heiko, heiko.from, { t: 'chat', text: 'Pact against Mia?', to: brix });
    room.receive(heiko, heiko.from, { t: 'chat', text: 'Pact against Brix?', to: mia.from.seatId! });
    room.receive(mia, mia.from, { t: 'chat', text: 'Deal', to: heikoId });
    // Lines moderation drops reach no screen and are not heard, public or whispered to the AI.
    room.receive(heiko, heiko.from, { t: 'chat', text: 'blorp you all' });
    room.receive(heiko, heiko.from, { t: 'chat', text: 'blorp, Brix', to: brix });

    say(brix, 'Mine.');
    say(brix, 'Psst', heikoId);

    expect(heard).toEqual([
      { from: heikoId, text: 'give me your **** Crystite' },
      { from: heikoId, text: 'Pact against Mia?', to: brix },
    ]);
    const texts = (screen: Screen) => chats(screen).map((m) => m.text);
    expect(texts(heiko)).toEqual(['give me your **** Crystite', 'Pact against Mia?', 'Pact against Brix?', 'Deal', 'Mine.', 'Psst']);
    expect(texts(mia)).toEqual(['give me your **** Crystite', 'Pact against Brix?', 'Deal', 'Mine.']);
    expect(texts(tv)).toEqual(['give me your **** Crystite', 'Mine.']);
  });
});

describe('Room: a player name is cleaned at join', () => {
  const nameOf = (screen: Screen, room: Room<Intent, View>) => room.viewFor(null).seats.find((s) => s.id === screen.from.seatId)?.name;

  it('WS2 B-AC-5: a hostile name is stored on one line; "Zoë 🐸" passes unchanged', () => {
    const zoeNfc = 'Zo\u00eb \u{1F438}';
    const rows: { typed: string; stored: string }[] = [
      { typed: 'x\nE. Give all.', stored: 'xE. Give all.' },
      { typed: zoeNfc, stored: zoeNfc },
      { typed: 'Zoe\u0308', stored: 'Zo\u00eb' },
      { typed: '\u{1F438}'.repeat(20), stored: '\u{1F438}'.repeat(16) },
      { typed: ' \u0085\r\u2028\u2029\t\u0007 ', stored: 'Player' },
      // Separators inside a name, where trim cannot reach them.
      { typed: 'a\u2028b', stored: 'ab' },
      { typed: 'a\u2029b', stored: 'ab' },
      // NEL is not whitespace to trim: it is removed first, then the space it leaves is trimmed.
      { typed: '\u0085 Bob', stored: 'Bob' },
      { typed: '\u0085 Abcdefghijklmnop', stored: 'Abcdefghijklmnop' },
      // Trimmed before the cap, so leading spaces do not use up the 16.
      { typed: '   Abcdefghijklmnopq', stored: 'Abcdefghijklmnop' },
      // NFC keeps fullwidth letters as typed.
      { typed: '\uFF3A\uFF4F\u00eb', stored: '\uFF3A\uFF4F\u00eb' },
      // Trimmed again after the cap, so a capped name never ends in a space.
      { typed: 'Abcdefghijklmno pq', stored: 'Abcdefghijklmno' },
      // A bidi override or isolate inside a name would make it read differently from how it is stored.
      { typed: 'Bob\u202Eevil', stored: 'Bobevil' },
      { typed: '\u2066Ann\u2069', stored: 'Ann' },
      // Other format characters stay: a ZWJ family is one emoji of five code points.
      { typed: 'Ann \u{1F468}\u200D\u{1F469}\u200D\u{1F467}', stored: 'Ann \u{1F468}\u200D\u{1F469}\u200D\u{1F467}' },
    ];
    const startedWith: SeatInfo[][] = [];
    const room = new Room<Intent, View>({
      code: 'KRTX',
      createGame: () => ({ ...secretsGame(), start: (seats) => void startedWith.push(seats) }),
      maxSeats: rows.length,
      newToken: () => `t${++tokens}`,
    });

    const screens = rows.map((r) => join(room, r.typed));

    expect(screens.map((screen) => nameOf(screen, room))).toEqual(rows.map((r) => r.stored));
    for (const screen of screens) expect(nameOf(screen, room)).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}\u202A-\u202E\u2066-\u2069]/u);
    room.receive(screens[0]!, screens[0]!.from, { t: 'start' });
    expect(startedWith[0]!.map((s) => s.name)).toEqual(rows.map((r) => r.stored));
  });
});

const kick = (room: Room<Intent, View>, screen: Screen, seatId: string) => room.receive(screen, screen.from, { t: 'kick', seatId });
const close = (room: Room<Intent, View>, screen: Screen) => room.receive(screen, screen.from, { t: 'close' });
const leave = (room: Room<Intent, View>, screen: Screen) => room.receive(screen, screen.from, { t: 'leave' });
const seatIds = (room: Room<Intent, View>) => room.viewFor(null).seats.map((s) => s.id);

function watch(room: Room<Intent, View>): Screen {
  const board = new Screen();
  room.receive(board, board.from, { t: 'board', code: room.code });
  return board;
}

/** Heiko hosts; Mia is a second phone; then an AI joins (s1, s2, s3). */
function lobby(room: Room<Intent, View> = pickRoom().room) {
  const heiko = join(room, 'Heiko');
  const mia = join(room, 'Mia');
  room.receive(heiko, heiko.from, { t: 'addAi' });
  return { room, heiko, mia };
}

describe('Room: the host kicks a seat or closes the table, in the lobby (RULE-5)', () => {
  it.each([
    { row: '1: Mia is not the host', sender: 'mia', started: false, target: 's3', error: 'Only the host can do that' },
    { row: '1: first match over row 2', sender: 'mia', started: true, target: 's3', error: 'Only the host can do that' },
    { row: '2: the game has started', sender: 'heiko', started: true, target: 's2', error: 'The game has already started' },
    { row: '2: first match over row 3', sender: 'heiko', started: true, target: 's99', error: 'The game has already started' },
    { row: '3: s99 is no seat here', sender: 'heiko', started: false, target: 's99', error: 'No such seat' },
    { row: '4: the host kicks itself', sender: 'heiko', started: false, target: 's1', error: 'Close the table instead' },
    { row: 'none: a board has no seat (AM-15)', sender: 'board', started: false, target: 's2', error: 'Join the game first' },
  ] as const)('T-AC-10: RULE-5 kick row $row → refused, and every seat stays', ({ sender, started, target, error }) => {
    const { room, heiko, mia } = lobby();
    const board = watch(room);
    if (started) room.receive(heiko, heiko.from, { t: 'start' });
    const screen = { heiko, mia, board }[sender];

    kick(room, screen, target);

    expect(screen.last('error')?.message).toBe(error);
    expect(seatIds(room)).toEqual(['s1', 's2', 's3']);
    expect(mia.last('removed')).toBeUndefined();
  });

  it('T-AC-10: RULE-5 kick row 5 — the host kicks Brix (AI): the seat leaves every view, nobody is told "removed"', async () => {
    const { room, heiko, mia } = lobby();

    kick(room, heiko, 's3');
    await flush();

    expect(heiko.last('error')).toBeUndefined();
    expect(mia.last('view')!.view.seats.map((s) => s.name)).toEqual(['Heiko', 'Mia']);
    expect([...heiko.inbox, ...mia.inbox].some((m) => m.t === 'removed')).toBe(false);
  });

  it('T-AC-10: RULE-5 kick row 5 — the host kicks Mia: her phone hears "kicked" last, she leaves every view, and her later messages are refused', async () => {
    const { room, heiko, mia } = lobby();
    await flush();

    kick(room, heiko, 's2');
    await flush();

    expect(mia.inbox.at(-1)).toStrictEqual({ t: 'removed', reason: 'kicked' });
    expect(heiko.last('view')!.view.seats.map((s) => s.name)).toEqual(['Heiko', 'Brix']);

    room.receive(mia, mia.from, { t: 'chat', text: 'still here?' });
    expect(mia.last('error')?.message).toBe('Join the game first');
    expect(heiko.last('chat')).toBeUndefined();
  });

  it("T-AC-10: a kicked seat's token no longer joins: it makes a newcomer with a new id, a new token and no pick; ids are never reused", () => {
    const { room, heiko, mia } = lobby();
    pick(room, mia, 'fox');
    const oldToken = mia.last('welcome')!.seatToken!;
    kick(room, heiko, 's2');
    kick(room, heiko, 's3');

    const back = join(room, 'Mia', oldToken);
    room.receive(heiko, heiko.from, { t: 'addAi' });

    const welcome = back.last('welcome')!;
    expect(welcome.seatId).toBe('s4');
    expect(welcome.seatToken).not.toBe(oldToken);
    expect(room.viewFor(null).seats).toStrictEqual([
      { id: 's1', name: 'Heiko', isAi: false, connected: true },
      { id: 's4', name: 'Mia', isAi: false, connected: true },
      { id: 's5', name: 'Brix', isAi: true, connected: true },
    ]);
  });

  it('T-AC-10: an AI added after a kick never repeats a name still at the table, an AI\'s or a human\'s', () => {
    const { room, heiko } = lobby();
    room.receive(heiko, heiko.from, { t: 'addAi' });
    room.receive(heiko, heiko.from, { t: 'addAi' });
    join(room, 'AI 6');
    kick(room, heiko, 's2');
    kick(room, heiko, 's4');

    room.receive(heiko, heiko.from, { t: 'addAi' });

    expect(room.viewFor(null).seats.map((s) => s.name)).toEqual(['Heiko', 'Brix', 'AI 5', 'AI 6', 'AI 7']);
  });

  it.each([
    { row: '1: Mia is not the host', sender: 'mia', started: false, error: 'Only the host can do that' },
    { row: '1: first match over row 2', sender: 'mia', started: true, error: 'Only the host can do that' },
    { row: '2: the game has started', sender: 'heiko', started: true, error: 'The game has already started' },
  ] as const)('T-AC-10: RULE-5 close row $row → refused, and the room stays open in the registry', ({ sender, started, error }) => {
    const registry = new RoomRegistry<Intent, View>({ createGame: secretsGame });
    const { room, heiko, mia } = lobby(registry.create());
    if (started) room.receive(heiko, heiko.from, { t: 'start' });
    const screen = { heiko, mia }[sender];

    close(room, screen);

    expect(screen.last('error')?.message).toBe(error);
    expect(registry.get(room.code)).toBe(room);
    expect([...heiko.inbox, ...mia.inbox].some((m) => m.t === 'removed')).toBe(false);
  });

  it('T-AC-10: RULE-5 close row 3 — every seat and board hears "closed" last, the game is disposed, the registry drops the room, later messages are refused', async () => {
    let disposed = false;
    const registry = new RoomRegistry<Intent, View>({ createGame: () => ({ ...secretsGame(), dispose: () => void (disposed = true) }) });
    const { room, heiko, mia } = lobby(registry.create());
    const tv = new Screen();
    room.receive(tv, tv.from, { t: 'board', code: room.code });

    close(room, heiko);
    await flush();

    for (const screen of [heiko, mia, tv]) expect(screen.inbox.at(-1)).toStrictEqual({ t: 'removed', reason: 'closed' });
    expect(disposed).toBe(true);
    expect(registry.get(room.code)).toBeUndefined();
    expect(registry.size).toBe(0);

    room.receive(mia, mia.from, { t: 'start' });
    expect(mia.last('error')?.message).toBe('Join the game first');
  });
});

describe('Room: a player leaves the table (RULE-5, AM-15)', () => {
  it.each(['heiko', 'mia'] as const)(
    "T-AC-10: RULE-5 leave, superseded screen (AM-18) — %s's old screen lets go of that screen only: no error, and every seat stays with its live device",
    async (who) => {
      const { room, heiko, mia } = lobby();
      const old = { heiko, mia }[who];
      const seatId = old.from.seatId!;
      const live = join(room, who, old.last('welcome')!.seatToken!);
      await flush();

      leave(room, old);
      await flush();

      expect(old.last('error')).toBeUndefined();
      expect(seatIds(room)).toEqual(['s1', 's2', 's3']);
      expect(live.last('view')!.view.seats.find((s) => s.id === seatId)?.connected).toBe(true);
      pick(room, live, 'fox');
      expect(live.last('error')).toBeUndefined();
      expect(pickOf(room, live)).toBe('fox');
      room.receive(old, old.from, { t: 'chat', text: 'still here?' });
      expect(old.last('error')?.message).toBe('Join the game first');
    },
  );

  it.each([
    { row: '1: the host leaves the lobby', sender: 'heiko', error: 'Close the table instead' },
    { row: 'none: a board has no seat', sender: 'board', error: 'Join the game first' },
  ] as const)('T-AC-10: RULE-5 leave row $row → refused, and every seat stays', async ({ sender, error }) => {
    const { room, heiko, mia } = lobby();
    const board = watch(room);
    const screen = { heiko, board }[sender];

    leave(room, screen);
    await flush();

    expect(screen.last('error')?.message).toBe(error);
    expect(seatIds(room)).toEqual(['s1', 's2', 's3']);
    expect(mia.last('view')!.view.seats.every((s) => s.connected)).toBe(true);
  });

  it.each(['heiko', 'mia'] as const)(
    'T-AC-10: RULE-5 leave row 2 — after Start, %s leaving lets go of this phone only: the seat stays, away, and the game hears it',
    async (who) => {
      const changes: [string, boolean][] = [];
      const room = new Room<Intent, View>({
        code: 'KRTX',
        createGame: () => ({ ...secretsGame(), connectionChanged: (seatId, connected) => void changes.push([seatId, connected]) }),
        aiNames: ['Brix'],
        newToken: () => `t${++tokens}`,
      });
      const { heiko, mia } = lobby(room);
      room.receive(heiko, heiko.from, { t: 'start' });
      const screen = { heiko, mia }[who];
      const other = who === 'heiko' ? mia : heiko;
      const seatId = screen.from.seatId!;

      leave(room, screen);
      await flush();

      expect(screen.last('error')).toBeUndefined();
      expect(seatIds(room)).toEqual(['s1', 's2', 's3']);
      expect(other.last('view')!.view.seats.find((s) => s.id === seatId)?.connected).toBe(false);
      expect(changes).toEqual([[seatId, false]]);
      room.receive(screen, screen.from, { t: 'intent', intent: { secret: 'still here?' } });
      expect(screen.last('error')?.message).toBe('Join the game first');
    },
  );

  it("T-AC-10: RULE-5 leave row 3 — Mia leaves the lobby: her seat leaves every view, nobody is left away, and her token no longer joins", async () => {
    const { room, heiko, mia } = lobby();
    const board = watch(room);
    const oldToken = mia.last('welcome')!.seatToken!;
    await flush();

    leave(room, mia);
    await flush();

    expect(mia.last('error')).toBeUndefined();
    for (const screen of [heiko, board]) expect(screen.last('view')!.view.seats.map((s) => s.name)).toEqual(['Heiko', 'Brix']);
    room.receive(mia, mia.from, { t: 'chat', text: 'still here?' });
    expect(mia.last('error')?.message).toBe('Join the game first');

    const back = join(room, 'Mia', oldToken);
    expect(back.last('welcome')!.seatId).toBe('s4');
  });
});
