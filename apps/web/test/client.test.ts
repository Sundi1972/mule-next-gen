import type { MuleView, ServerEnvelope, TableView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { createRoom, HANDOFF_LOST_MS, socketUrl, TableClient, type SocketLike } from '../src/net/client';
import { CLOCK_JUMP_MS, ClockSync } from '../src/net/clock';
import { loadSeat, saveSeat, type KeyValueStore } from '../src/net/seat';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(data: string) {
    // A closed WebSocket discards what is sent on it.
    if (this.readyState !== 3) this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }
  drop() {
    this.readyState = 3;
    this.onclose?.({});
  }
  deliver(msg: ServerEnvelope<MuleView>) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

/**
 * A client with a fake socket, manual timers and two manual clocks: the device clock (`now`, which `setNow` can
 * jump) and the monotonic clock the timers run on. `advance` moves both.
 */
function setup(storage = memoryStore()) {
  const sockets: FakeSocket[] = [];
  let now = 1_000;
  let mono = 0;
  let timers: { at: number; fn: () => void; id: number }[] = [];
  let nextTimer = 1;
  const client = new TableClient({
    url: 'ws://test/ws',
    socket: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    storage,
    now: () => now,
    monotonic: () => mono,
    setTimeout: (fn, ms) => {
      const t = { at: mono + ms, fn, id: nextTimer++ };
      timers.push(t);
      return t.id;
    },
    clearTimeout: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
  });
  const advance = (ms: number) => {
    now += ms;
    mono += ms;
    for (let due = timers.filter((t) => t.at <= mono); due.length > 0; due = timers.filter((t) => t.at <= mono)) {
      for (const t of due) {
        timers = timers.filter((x) => x !== t);
        t.fn();
      }
    }
  };
  return { client, sockets, storage, advance, setNow: (n: number) => (now = n), now: () => now, mono: () => mono, last: () => sockets.at(-1)! };
}

const lobbyView = (code: string): TableView<MuleView> => ({ code, status: 'lobby', hostId: 's1', seats: [], boards: 0, game: null });

describe('TableClient', () => {
  it('joins a table, keeps the view and remembers the seat token', () => {
    const { client, last, storage } = setup();
    client.join('krtx', 'Heiko');
    expect(client.getState().status).toBe('connecting');
    last().open();
    expect(last().sent[0]).toEqual({ t: 'join', code: 'KRTX', name: 'Heiko' });

    last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's1', seatToken: 'secret' });
    last().deliver({ t: 'view', view: lobbyView('KRTX') });
    expect(client.getState()).toMatchObject({ status: 'open', role: 'player', seatId: 's1', code: 'KRTX' });
    expect(client.getState().view?.code).toBe('KRTX');
    expect(loadSeat(storage)).toEqual({ code: 'KRTX', token: 'secret', name: 'Heiko' });
  });

  it('takes the saved seat back after a reload', () => {
    const storage = memoryStore();
    saveSeat(storage, { code: 'KRTX', token: 'secret', name: 'Heiko' });
    const { client, last } = setup(storage);
    client.join('KRTX', '');
    last().open();
    expect(last().sent[0]).toEqual({ t: 'join', code: 'KRTX', name: 'Heiko', seatToken: 'secret' });
  });

  it('does not send a token saved for another table', () => {
    const storage = memoryStore();
    saveSeat(storage, { code: 'BBBB', token: 'old', name: 'Heiko' });
    const { client, last } = setup(storage);
    client.join('KRTX', 'Heiko');
    last().open();
    expect(last().sent[0]).toEqual({ t: 'join', code: 'KRTX', name: 'Heiko' });
  });

  it('reconnects after a drop with a growing pause and rejoins with the token', () => {
    const { client, sockets, last, advance } = setup();
    client.join('KRTX', 'Heiko');
    last().open();
    last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's1', seatToken: 'secret' });

    last().drop();
    expect(client.getState().status).toBe('reconnecting');
    advance(499);
    expect(sockets).toHaveLength(1);
    advance(1);
    expect(sockets).toHaveLength(2);
    // The second try fails too; the next one waits twice as long.
    last().drop();
    advance(999);
    expect(sockets).toHaveLength(2);
    advance(1);
    expect(sockets).toHaveLength(3);
    last().open();
    expect(last().sent[0]).toEqual({ t: 'join', code: 'KRTX', name: 'Heiko', seatToken: 'secret' });
    expect(client.getState().status).toBe('open');
  });

  it('forgets a seat the room no longer knows and stops retrying', () => {
    const storage = memoryStore();
    saveSeat(storage, { code: 'KRTX', token: 'stale', name: 'Heiko' });
    const { client, sockets, last, advance } = setup(storage);
    client.join('KRTX', 'Heiko');
    last().open();
    last().deliver({ t: 'error', message: 'No game with that code' });
    expect(loadSeat(storage)).toBeNull();
    expect(client.getState().status).toBe('idle');
    expect(client.getState().toasts.map((t) => t.message)).toEqual(['No game with that code']);
    advance(10_000);
    expect(sockets).toHaveLength(1);
  });

  it('shows a rule error as a toast that goes away, without leaving the table', () => {
    const { client, last, advance } = setup();
    client.join('KRTX', 'Heiko');
    last().open();
    last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's1', seatToken: 'secret' });
    client.intent({ type: 'claim', x: 1, y: 2 });
    expect(last().sent.at(-1)).toEqual({ t: 'intent', intent: { type: 'claim', x: 1, y: 2 } });
    last().deliver({ t: 'error', message: 'That plot is not lit' });
    expect(client.getState().toasts).toHaveLength(1);
    expect(client.getState().seatId).toBe('s1');
    advance(4_000);
    expect(client.getState().toasts).toHaveLength(0);
  });

  it('syncs the clock from pongs', () => {
    const { client, last, advance, setNow } = setup();
    client.watch('KRTX');
    last().open();
    expect(last().sent[0]).toEqual({ t: 'board', code: 'KRTX' });
    advance(0);
    const ping = last().sent.find((m) => m.t === 'ping')!;
    // The server's clock is 5 s ahead; the round trip took 40 ms.
    setNow((ping.clientTime as number) + 40);
    last().deliver({ t: 'pong', clientTime: ping.clientTime as number, serverTime: (ping.clientTime as number) + 20 + 5_000 });
    expect(client.getState().clockOffset).toBe(5_000);
    expect(client.serverNow()).toBe((ping.clientTime as number) + 40 + 5_000);
  });

  // trace-allow: chat de-duplication predates the spec's ids; split out of the leave test unchanged
  it('keeps chat without duplicates', () => {
    const { client, last } = setup();
    client.join('KRTX', 'Heiko');
    last().open();
    last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's1', seatToken: 'secret' });
    const message = { id: 1, from: 's2', text: 'Hi', at: 0 };
    last().deliver({ t: 'chat', message });
    last().deliver({ t: 'chat', message });
    expect(client.getState().chat).toHaveLength(1);
  });

  it('FM-16: leaving tells the room, then forgets the seat and disconnects', () => {
    const { client, last, storage } = setup();
    client.join('KRTX', 'Heiko');
    last().open();
    last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's1', seatToken: 'secret' });

    client.leave();

    expect(last().sent.at(-1)).toEqual({ t: 'leave' });
    expect(last().readyState).toBe(3);
    expect(loadSeat(storage)).toBeNull();
    expect(client.getState().status).toBe('idle');
  });

  it("T-AC-12: a colour pick leaves the phone as the room's color message", () => {
    const { client, last } = setup();
    client.join('KRTX', 'Heiko');
    last().open();

    client.color(3);

    expect(last().sent.at(-1)).toEqual({ t: 'color', color: 3 });
  });

  it('FM-17: leaving before the socket opens sends nothing, and still forgets the seat', () => {
    const storage = memoryStore();
    saveSeat(storage, { code: 'KRTX', token: 'secret', name: 'Heiko' });
    const { client, last } = setup(storage);
    client.join('KRTX', 'Heiko');

    client.leave();

    expect(last().sent).toEqual([]);
    expect(loadSeat(storage)).toBeNull();
    expect(client.getState().status).toBe('idle');
  });

  it.each([
    { reason: 'kicked', role: 'player', message: 'The host removed you from the table' },
    { reason: 'closed', role: 'player', message: 'The host closed the table' },
    { reason: 'moved', role: 'player', message: "You're playing on another device now" },
    { reason: 'closed', role: 'board', message: 'The host closed the table' },
  ] as const)('FM-18: removed $reason on a $role → a phone forgets its seat (a board keeps the one saved beside it), the start screen gives the reason, and nothing reconnects', ({ reason, role, message }) => {
    const storage = memoryStore();
    const seat = { code: 'KRTX', token: 'secret', name: 'Heiko' };
    saveSeat(storage, seat);
    const { client, sockets, last, advance } = setup(storage);
    if (role === 'player') client.join('KRTX', 'Heiko');
    else client.watch('KRTX');
    last().open();
    last().deliver({ t: 'welcome', code: 'KRTX', role, seatId: role === 'player' ? 's2' : null, seatToken: role === 'player' ? 'secret' : null });
    last().deliver({ t: 'view', view: lobbyView('KRTX') });

    last().deliver({ t: 'removed', reason });
    last().drop();
    advance(10_000);

    expect(loadSeat(storage)).toEqual(role === 'player' ? null : seat);
    expect(client.getState()).toMatchObject({ status: 'idle', role: null, seatId: null, view: null, notice: message });
    expect(sockets).toHaveLength(1);

    client.join('KRTX', 'Heiko');
    expect(client.getState().notice).toBeNull();
  });

  /** A phone seated as s2 at KRTX, with its clock in sync. */
  function seated() {
    const t = setup();
    t.client.join('KRTX', 'Mia');
    t.last().open();
    t.last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's2', seatToken: 'secret' });
    return t;
  }

  it('FM-7: asking to move sends handoff; the code is live until it expires by the server clock, then shows as expired until a new one is asked for, and a newer code replaces it and its expiry', () => {
    const { client, last, advance, setNow } = seated();
    setNow(10_000);
    // The server's clock runs 50 s ahead of this screen's.
    last().deliver({ t: 'pong', clientTime: 10_000, serverTime: 60_000 });
    expect(client.getState().clockOffset).toBe(50_000);

    client.handoff();
    expect(last().sent.at(-1)).toEqual({ t: 'handoff' });
    last().deliver({ t: 'handoffCode', code: 'one', expiresAt: 180_000 });
    expect(client.getState().handoffCode).toEqual({ code: 'one', expiresAt: 180_000, expired: false });
    advance(119_999);
    expect(client.getState().handoffCode).toEqual({ code: 'one', expiresAt: 180_000, expired: false });
    advance(1);
    expect(client.getState().handoffCode).toEqual({ code: 'one', expiresAt: 180_000, expired: true });
    advance(600_000);
    expect(client.getState().handoffCode).toEqual({ code: 'one', expiresAt: 180_000, expired: true });

    const sent = last().sent.length;
    client.handoff();
    expect(last().sent.slice(sent)).toEqual([{ t: 'handoff' }]);
    expect(client.getState().handoffCode).toBeNull();
    last().deliver({ t: 'handoffCode', code: 'two', expiresAt: 900_000 });
    advance(60_000);
    client.handoff();
    // The room has killed 'two' by now; it must not show while 'three' is on its way.
    expect(client.getState().handoffCode).toBeNull();
    last().deliver({ t: 'handoffCode', code: 'three', expiresAt: 960_000 });
    expect(client.getState().handoffCode).toEqual({ code: 'three', expiresAt: 960_000, expired: false });

    advance(60_000);
    expect(client.getState().handoffCode).toEqual({ code: 'three', expiresAt: 960_000, expired: false });
    advance(59_999);
    expect(client.getState().handoffCode).toEqual({ code: 'three', expiresAt: 960_000, expired: false });
    advance(1);
    expect(client.getState().handoffCode).toEqual({ code: 'three', expiresAt: 960_000, expired: true });

    client.closeHandoff();
    expect(client.getState().handoffCode).toBeNull();
  });

  it('FM-8: closing the dialog drops the code and sends nothing; being moved away drops it too', () => {
    const { client, last } = seated();
    client.handoff();
    last().deliver({ t: 'handoffCode', code: 'one', expiresAt: 999_999 });
    const sent = last().sent.length;

    client.closeHandoff();
    expect(client.getState().handoffCode).toBeNull();
    expect(last().sent).toHaveLength(sent);

    // A code that arrives after the dialog closed is not shown later.
    client.handoff();
    client.closeHandoff();
    last().deliver({ t: 'handoffCode', code: 'late', expiresAt: 999_999 });
    expect(client.getState().handoffCode).toBeNull();

    client.handoff();
    last().deliver({ t: 'handoffCode', code: 'two', expiresAt: 999_999 });
    last().deliver({ t: 'removed', reason: 'moved' });
    expect(client.getState().handoffCode).toBeNull();
  });

  it.each([
    { saved: { code: 'KRTX', token: 'mine', name: 'Old' }, kept: 'this room' },
    { saved: { code: 'BBBB', token: 'other', name: 'Heiko' }, kept: 'another room' },
  ])('FM-9: a handoff join sends the code, not the token saved for $kept, then keeps the new token and the seat\'s name', ({ saved }) => {
    const storage = memoryStore();
    saveSeat(storage, saved);
    const { client, last, advance } = setup(storage);

    client.join('krtx', '', 'code-1');
    last().open();
    expect(last().sent[0]).toEqual({ t: 'join', code: 'KRTX', name: '', handoff: 'code-1' });

    last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's2', seatToken: 'fresh' });
    last().deliver({ t: 'view', view: { ...lobbyView('KRTX'), seats: [{ id: 's2', name: 'Mia', isAi: false, connected: true, color: 1 }] } });
    expect(loadSeat(storage)).toEqual({ code: 'KRTX', token: 'fresh', name: 'Mia' });

    // A dropped connection comes back with the new token; the used code would be refused.
    last().drop();
    advance(500);
    last().open();
    expect(last().sent[0]).toEqual({ t: 'join', code: 'KRTX', name: 'Mia', seatToken: 'fresh' });
  });

  it.each([
    { saved: { code: 'KRTX', token: 'mine', name: 'Mia' }, kept: 'this room' },
    { saved: { code: 'BBBB', token: 'other', name: 'Heiko' }, kept: 'another room' },
  ])('FM-10: a used or expired link shows "That link has expired" on the start screen and keeps the seat saved for $kept', ({ saved }) => {
    const storage = memoryStore();
    saveSeat(storage, saved);
    const { client, sockets, last, advance } = setup(storage);

    client.join('KRTX', '', 'used');
    last().open();
    last().deliver({ t: 'error', message: 'That link has expired' });
    advance(10_000);

    expect(client.getState()).toMatchObject({ status: 'idle', role: null, seatId: null, notice: 'That link has expired' });
    expect(loadSeat(storage)).toEqual(saved);
    expect(sockets).toHaveLength(1);
  });

  it.each([
    { row: 'asked twice, with the dialog closed in between', act: (t: ReturnType<typeof seated>) => (t.client.handoff(), t.client.closeHandoff(), t.client.handoff()), requests: 2 },
    { row: 'asked twice', act: (t: ReturnType<typeof seated>) => (t.client.handoff(), t.client.handoff()), requests: 2 },
    {
      row: 'asked once while the screen joins again on the same connection',
      act: (t: ReturnType<typeof seated>) => {
        t.client.join('KRTX', 'Mia');
        t.client.handoff();
        t.last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's2', seatToken: 'secret' });
      },
      requests: 1,
    },
    {
      row: 'asked once on a new connection, after the screen was removed with a request in flight',
      act: (t: ReturnType<typeof seated>) => {
        t.client.handoff();
        t.last().deliver({ t: 'removed', reason: 'kicked' });
        t.client.join('KRTX', 'Mia');
        t.last().open();
        t.last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's2', seatToken: 'secret' });
        t.client.handoff();
      },
      requests: 1,
    },
  ])('FM-4: a code $row, within one round trip, shows nothing until the newest request is answered, then that code', ({ act, requests }) => {
    const t = seated();
    act(t);
    expect(t.last().sent.filter((m) => m.t === 'handoff')).toHaveLength(requests);
    expect(t.client.getState().handoffCode).toBeNull();

    for (let earlier = 1; earlier < requests; earlier++) {
      t.last().deliver({ t: 'handoffCode', code: 'dead', expiresAt: 999_999 });
      expect(t.client.getState().handoffCode).toBeNull();
    }
    t.last().deliver({ t: 'handoffCode', code: 'live', expiresAt: 999_999 });
    expect(t.client.getState().handoffCode).toEqual({ code: 'live', expiresAt: 999_999, expired: false });

    t.client.handoff();
    t.last().deliver({ t: 'handoffCode', code: 'next', expiresAt: 999_999 });
    expect(t.client.getState().handoffCode).toEqual({ code: 'next', expiresAt: 999_999, expired: false });
  });

  it.each([
    { row: 'opened while reconnecting', before: (t: ReturnType<typeof seated>) => (t.last().drop(), t.client.handoff()), asks: true, shows: 'fresh' },
    { row: 'opened while the new connection is still opening', before: (t: ReturnType<typeof seated>) => (t.last().drop(), t.advance(500), t.client.handoff()), asks: true, shows: 'fresh' },
    { row: 'whose request was lost with the socket', before: (t: ReturnType<typeof seated>) => (t.client.handoff(), t.last().drop()), asks: true, shows: 'fresh' },
    {
      row: 'already showing a code',
      before: (t: ReturnType<typeof seated>) => (t.client.handoff(), t.last().deliver({ t: 'handoffCode', code: 'kept', expiresAt: 999_999 }), t.last().drop()),
      asks: false,
      shows: 'kept',
    },
    { row: 'closed before the drop', before: (t: ReturnType<typeof seated>) => (t.client.handoff(), t.client.closeHandoff(), t.last().drop()), asks: false, shows: null },
  ])('FM-5: when the seat is back after a drop, a move dialog $row asks the room for a code again: $asks', ({ before, asks, shows }) => {
    const t = seated();
    before(t);

    t.advance(500);
    t.last().open();
    t.last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's2', seatToken: 'secret' });

    expect(t.last().sent.filter((m) => m.t === 'handoff')).toEqual(asks ? [{ t: 'handoff' }] : []);
    if (asks) t.last().deliver({ t: 'handoffCode', code: 'fresh', expiresAt: 999_999 });
    expect(t.client.getState().handoffCode?.code ?? null).toBe(shows);
  });

  it.each([
    { reason: 'moved', join: (c: TableClient) => c.join('KRTX', '', 'code-1'), seatId: 's2', name: 'Mia' },
    { reason: 'kicked', join: (c: TableClient) => c.join('KRTX', 'Jonas'), seatId: 's3', name: 'Jonas' },
    { reason: 'closed', join: (c: TableClient) => c.join('KRTX', 'Jonas'), seatId: 's3', name: 'Jonas' },
  ] as const)(
    'FM-6: a screen removed ($reason) while another tab of the browser holds the saved seat leaves it saved, so that tab rejoins with its own token after a reload; removed in turn, that tab forgets it',
    ({ reason, join, seatId, name }) => {
      const storage = memoryStore();
      const oldTab = setup(storage);
      oldTab.client.join('KRTX', 'Mia');
      oldTab.last().open();
      oldTab.last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's2', seatToken: 'old' });
      const newTab = setup(storage);
      join(newTab.client);
      newTab.last().open();
      newTab.last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId, seatToken: 'new' });
      const seats = [
        { id: 's2', name: 'Mia', isAi: false, connected: true, color: 1 },
        { id: 's3', name: 'Jonas', isAi: false, connected: true, color: 2 },
      ];
      newTab.last().deliver({ t: 'view', view: { ...lobbyView('KRTX'), seats } });

      oldTab.last().deliver({ t: 'removed', reason });

      const reloaded = setup(storage);
      reloaded.client.join('KRTX', '');
      reloaded.last().open();
      expect(reloaded.last().sent[0]).toEqual({ t: 'join', code: 'KRTX', name, seatToken: 'new' });

      newTab.last().deliver({ t: 'removed', reason });
      expect(loadSeat(storage)).toBeNull();
    },
  );

  it.each([
    { row: 'another room', join: (c: TableClient) => c.join('BBBB', 'Mia'), welcome: { code: 'BBBB', seatId: 's1', seatToken: 'b-token' }, asks: true },
    { row: 'another seat of this room', join: (c: TableClient) => c.join('KRTX', 'Mia'), welcome: { code: 'KRTX', seatId: 's4', seatToken: 'reseated' }, asks: true },
    { row: 'the same room and seat', join: (c: TableClient) => c.join('KRTX', 'Mia'), welcome: { code: 'KRTX', seatId: 's2', seatToken: 'secret' }, asks: false },
  ])('FM-14: a welcome on the same connection to $row, with a move code shown, drops that code and asks the room for a new one: $asks', ({ join, welcome, asks }) => {
    const t = seated();
    t.client.handoff();
    t.last().deliver({ t: 'handoffCode', code: 'old', expiresAt: 999_999 });
    const sent = t.last().sent.length;

    join(t.client);
    t.last().deliver({ t: 'welcome', role: 'player', ...welcome });

    expect(t.client.getState().handoffCode?.code ?? null).toBe(asks ? null : 'old');
    expect(t.last().sent.slice(sent).filter((m) => m.t === 'handoff')).toEqual(asks ? [{ t: 'handoff' }] : []);
    if (asks) {
      t.last().deliver({ t: 'handoffCode', code: 'new', expiresAt: 999_999 });
      expect(t.client.getState().handoffCode?.code).toBe('new');
    }
  });

  it.each([
    { row: 'it sent a token that is still saved', saved: { code: 'KRTX', token: 'stale', name: 'Mia' }, savedSince: null, byLinkAfterWelcome: false, kept: null },
    {
      row: 'it sent a token, and another tab saved its own since',
      saved: { code: 'KRTX', token: 'stale', name: 'Mia' },
      savedSince: { code: 'KRTX', token: 'other-tab', name: 'Lena' },
      byLinkAfterWelcome: false,
      kept: { code: 'KRTX', token: 'other-tab', name: 'Lena' },
    },
    {
      row: 'it joined by code, and another tab saved a seat for this room since',
      saved: null,
      savedSince: { code: 'KRTX', token: 'other-tab', name: 'Lena' },
      byLinkAfterWelcome: false,
      kept: { code: 'KRTX', token: 'other-tab', name: 'Lena' },
    },
    {
      row: 'it joined by link on a connection the room had welcomed back by token',
      saved: { code: 'KRTX', token: 'secret', name: 'Mia' },
      savedSince: null,
      byLinkAfterWelcome: true,
      kept: { code: 'KRTX', token: 'secret', name: 'Mia' },
    },
  ])('FM-15: a refused join forgets the saved seat only while it holds the token that join sent: $row', ({ saved, savedSince, byLinkAfterWelcome, kept }) => {
    const storage = memoryStore();
    if (saved) saveSeat(storage, saved);
    const { client, last } = setup(storage);
    client.join('KRTX', 'Mia');
    last().open();
    expect(last().sent[0]).toEqual({ t: 'join', code: 'KRTX', name: 'Mia', ...(saved ? { seatToken: saved.token } : {}) });
    if (savedSince) saveSeat(storage, savedSince);
    if (byLinkAfterWelcome) {
      last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's2', seatToken: 'secret' });
      client.join('KRTX', '', 'used');
      expect(last().sent.at(-1)).toEqual({ t: 'join', code: 'KRTX', name: '', handoff: 'used' });
    }

    last().deliver({ t: 'error', message: byLinkAfterWelcome ? 'That link has expired' : 'The game has already started' });

    expect(client.getState().status).toBe('idle');
    expect(loadSeat(storage)).toEqual(kept);
  });

  type Seated = ReturnType<typeof seated>;
  const welcomeBack = (t: Seated) => t.last().deliver({ t: 'welcome', code: 'KRTX', role: 'player', seatId: 's2', seatToken: 'secret' });
  const reply = (t: Seated, code: string) => t.last().deliver({ t: 'handoffCode', code, expiresAt: 999_999 });

  it.each([
    {
      row: 'is never answered counts as lost after HANDOFF_LOST_MS, and the dialog, still open, asks again by itself',
      act: (t: Seated) => (t.client.handoff(), t.advance(HANDOFF_LOST_MS)),
      requests: 2, replies: ['live'], shows: 'live',
    },
    {
      row: 'is never answered still holds a later code back 1 ms before that, and nothing asks again',
      act: (t: Seated) => (t.client.handoff(), t.advance(HANDOFF_LOST_MS - 1), t.client.handoff()),
      requests: 2, replies: ['live'], shows: null,
    },
    {
      row: 'is answered in time is never counted lost later, so of two asked within one round trip only the newest shows',
      act: (t: Seated) => (t.client.handoff(), reply(t, 'first'), t.advance(HANDOFF_LOST_MS - 1), t.client.handoff(), t.client.handoff(), t.advance(1)),
      requests: 3, replies: ['dead', 'live'], shows: 'live',
    },
    {
      row: 'is lost after the dialog closed asks nothing again',
      act: (t: Seated) => (t.client.handoff(), t.client.closeHandoff(), t.advance(HANDOFF_LOST_MS)),
      requests: 1, replies: ['late'], shows: null,
    },
    {
      row: 'is lost, with the dialog reopened within HANDOFF_LOST_MS, has the newer reply counted against it, and the dialog asks again once the newer request counts as lost too',
      act: (t: Seated) => (t.client.handoff(), t.advance(2_000), t.client.closeHandoff(), t.client.handoff(), reply(t, 'counted-against-the-lost-one'), t.advance(HANDOFF_LOST_MS)),
      requests: 3, replies: ['live'], shows: 'live',
    },
    {
      row: 'is lost after the screen moved to another room on the same connection, and the dialog asks the new room',
      act: (t: Seated) => (
        t.client.handoff(),
        t.client.join('BBBB', 'Mia'),
        t.last().deliver({ t: 'welcome', code: 'BBBB', role: 'player', seatId: 's1', seatToken: 'b-token' }),
        t.advance(HANDOFF_LOST_MS)
      ),
      requests: 1, replies: ['live'], shows: 'live',
    },
    {
      row: "was asked on a new connection is never counted lost by the old connection's timer",
      act: (t: Seated) => (t.client.handoff(), t.last().drop(), t.advance(500), t.last().open(), welcomeBack(t), t.advance(HANDOFF_LOST_MS - 500), t.client.handoff()),
      requests: 2, replies: ['dead', 'live'], shows: 'live',
    },
    {
      row: 'is lost while the connection is down asks nothing until the seat is back, then the welcome asks once',
      act: (t: Seated) => (t.client.handoff(), t.advance(HANDOFF_LOST_MS - 100), t.last().drop(), t.advance(500), t.last().open(), welcomeBack(t)),
      requests: 1, replies: ['live'], shows: 'live',
    },
  ])('FM-19: a move-code request that $row', ({ act, requests, replies, shows }) => {
    const t = seated();
    act(t);

    const sinceJoin = t.last().sent.slice(t.last().sent.map((m) => m.t).lastIndexOf('join'));
    expect(sinceJoin.filter((m) => m.t === 'handoff')).toHaveLength(requests);
    expect(t.client.getState().toasts).toEqual([]);
    for (const code of replies.slice(0, -1)) {
      reply(t, code);
      expect(t.client.getState().handoffCode).toBeNull();
    }
    reply(t, replies.at(-1)!);
    expect(t.client.getState().handoffCode?.code ?? null).toBe(shows);
  });

  it.each([
    { row: 'jumps 2 minutes ahead, and the next read of the server clock notices', jump: 120_000, sleep: false, notice: 'read', resync: 4, offset: -70_000, liveFor: 120_000 },
    { row: 'jumps 2 minutes back, and the next read of the server clock notices', jump: -120_000, sleep: false, notice: 'read', resync: 4, offset: 170_000, liveFor: 120_000 },
    { row: 'jumps 2 minutes ahead across a ping in flight, and its pong notices', jump: 120_000, sleep: false, notice: 'pong', resync: 4, offset: -70_000, liveFor: 120_000 },
    { row: 'jumps 2 minutes back across a ping in flight, and its pong notices', jump: -120_000, sleep: false, notice: 'pong', resync: 4, offset: 170_000, liveFor: 120_000 },
    { row: 'jumps 2 minutes ahead across a ping in flight, and a read notices before its pong', jump: 120_000, sleep: false, notice: 'read, then pong', resync: 4, offset: -70_000, liveFor: 120_000 },
    { row: 'moves 1 ms more than CLOCK_JUMP_MS from the monotonic clock', jump: CLOCK_JUMP_MS + 1, sleep: false, notice: 'pong', resync: 4, offset: 50_000 - (CLOCK_JUMP_MS + 1), liveFor: 120_000 },
    { row: 'moves CLOCK_JUMP_MS from the monotonic clock', jump: CLOCK_JUMP_MS, sleep: false, notice: 'pong', resync: 0, offset: 50_000, liveFor: 120_000 - CLOCK_JUMP_MS },
    { row: 'keeps time with the monotonic clock', jump: 0, sleep: false, notice: 'pong', resync: 0, offset: 50_000, liveFor: 120_000 },
    {
      row: 'keeps time through a 2-minute sleep that paused the monotonic clock, and the move-code request notices',
      jump: 120_000,
      sleep: true,
      notice: 'request',
      resync: 0,
      offset: 50_000,
      liveFor: 120_000,
    },
  ] as const)(
    'FM-20: when the device clock $row, the clock offset is $offset from then on, and a move code asked for then is live for $liveFor ms of server time',
    ({ jump, sleep, notice, resync, offset, liveFor }) => {
      const t = seated();
      // A real device clock reads far from the monotonic one, so a first pong taken for a jump would show.
      t.setNow(1_761_600_000_000);
      let slept = 0;
      // The server's clock runs 50 s ahead; it keeps time with the monotonic clock, and with the device's through a sleep.
      const server = () => 1_761_600_050_000 + t.mono() + slept;
      const pings = () => t.last().sent.filter((m) => m.t === 'ping');
      /** The room answers a ping that left `rtt` ms ago, halfway through the round trip. */
      const pong = (rtt: number, clientTime = t.now() - rtt) => t.last().deliver({ t: 'pong', clientTime, serverTime: server() - rtt / 2 });

      t.advance(450);
      const opening = pings().length;
      pong(20);
      t.advance(450);
      expect(t.client.getState().clockOffset).toBe(50_000);
      expect(pings()).toHaveLength(opening);

      t.advance(15_000 - t.mono());
      const inFlight = pings().at(-1)!.clientTime as number;
      t.setNow(t.now() + jump);
      if (sleep) slept += jump;
      const beforeNotice = pings().length;
      if (notice.startsWith('read')) expect(t.client.serverNow()).toBe(server());
      if (notice.endsWith('pong')) {
        t.advance(20);
        pong(20, inFlight);
        expect(t.client.getState().clockOffset).toBe(offset);
      }
      t.advance(450);
      expect(pings().length - beforeNotice).toBe(resync);

      const asked = t.last().sent.length;
      t.client.handoff();
      const request = t.last().sent.slice(asked);
      expect(request.map((m) => m.t)).toEqual(notice === 'request' ? ['ping', 'handoff'] : ['handoff']);
      // The room answers in order, 40 ms later.
      t.advance(40);
      for (const m of request) if (m.t === 'ping') pong(40, m.clientTime as number);
      t.last().deliver({ t: 'handoffCode', code: 'fresh', expiresAt: server() + 120_000 });
      for (let later = 0; later < 2; later++) {
        pong(40);
        expect(t.client.getState().clockOffset).toBe(offset);
      }

      t.advance(liveFor - 1);
      expect(t.client.getState().handoffCode).toMatchObject({ code: 'fresh', expired: false });
      t.advance(1);
      expect(t.client.getState().handoffCode).toMatchObject({ code: 'fresh', expired: true });
    },
  );
});

describe('ClockSync', () => {
  it('trusts the round trip with the least delay', () => {
    const clock = new ClockSync();
    expect(clock.offset).toBe(0);
    clock.add(0, 1_100, 400); // slow trip: offset 900
    clock.add(1_000, 2_010, 1_020); // fast trip: offset 1000
    expect(clock.offset).toBe(1_000);
    expect(clock.serverNow(5_000)).toBe(6_000);
  });

  it('ignores impossible samples and keeps only the latest few', () => {
    const clock = new ClockSync(2);
    clock.add(100, 0, 50);
    expect(clock.synced).toBe(false);
    clock.add(0, 500, 10);
    clock.add(0, 700, 100);
    clock.add(0, 900, 80);
    // The fast 10 ms trip has been pushed out; of the two kept, the 80 ms one wins.
    expect(clock.offset).toBe(860);
  });
});

describe('helpers', () => {
  it('builds the socket address from the page', () => {
    expect(socketUrl({ protocol: 'https:', host: 'mule.game' })).toBe('wss://mule.game/ws');
    expect(socketUrl({ protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:5173/ws');
  });

  it('creates a room', async () => {
    const fake = (async () => new Response(JSON.stringify({ code: 'KRTX' }), { status: 201 })) as typeof fetch;
    expect(await createRoom(fake)).toBe('KRTX');
  });
});
