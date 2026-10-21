import type { MuleView, ServerEnvelope, TableView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { createRoom, socketUrl, TableClient, type SocketLike } from '../src/net/client';
import { ClockSync } from '../src/net/clock';
import { loadSeat, saveSeat, type KeyValueStore } from '../src/net/seat';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  send(data: string) {
    this.sent.push(JSON.parse(data));
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

/** A client with a fake socket, a manual clock and manual timers. */
function setup(storage = memoryStore()) {
  const sockets: FakeSocket[] = [];
  let now = 1_000;
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
    setTimeout: (fn, ms) => {
      const t = { at: now + ms, fn, id: nextTimer++ };
      timers.push(t);
      return t.id;
    },
    clearTimeout: (id) => {
      timers = timers.filter((t) => t.id !== id);
    },
  });
  const advance = (ms: number) => {
    now += ms;
    for (let due = timers.filter((t) => t.at <= now); due.length > 0; due = timers.filter((t) => t.at <= now)) {
      for (const t of due) {
        timers = timers.filter((x) => x !== t);
        t.fn();
      }
    }
  };
  return { client, sockets, storage, advance, setNow: (n: number) => (now = n), last: () => sockets.at(-1)! };
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

  it('B-AC-6: leaving tells the room, then forgets the seat and disconnects', () => {
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

  it('B-AC-6: leaving before the socket opens sends nothing, and still forgets the seat', () => {
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
  ] as const)('B-AC-6: removed $reason on a $role → a phone forgets its seat (a board keeps the one saved beside it), the start screen gives the reason, and nothing reconnects', ({ reason, role, message }) => {
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
