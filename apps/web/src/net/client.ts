import type { ChatMessage, ClientEnvelope, MuleIntent, MuleView, ServerEnvelope, TableView } from '@mule/protocol';
import type { Species } from '@mule/ui';
import { ClockSync } from './clock';
import { clearSeat, loadSeat, saveSeat, type KeyValueStore } from './seat';

/** The part of a WebSocket the client uses, so tests can hand it a fake. */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

const OPEN = 1;
/** Pings sent right after connecting, to sync the clock quickly, then one every PING_EVERY_MS. */
const FIRST_PINGS = 4;
const PING_EVERY_MS = 15_000;
const MAX_BACKOFF_MS = 5_000;
const MAX_CHAT = 80;
const TOAST_MS = 3_500;

export type Status = 'idle' | 'connecting' | 'open' | 'reconnecting';

type RemovedReason = Extract<ServerEnvelope<MuleView>, { t: 'removed' }>['reason'];

const REMOVED: Record<RemovedReason, string> = {
  kicked: 'The host removed you from the table',
  closed: 'The host closed the table',
  moved: "You're playing on another device now",
  error: 'Something went wrong and the table had to stop. Start a new game to play again.',
};

export interface Toast {
  id: number;
  message: string;
}

export interface Emote {
  id: number;
  from: string;
  emote: string;
}

export interface ClientState {
  status: Status;
  role: 'player' | 'board' | null;
  code: string | null;
  seatId: string | null;
  view: TableView<MuleView> | null;
  chat: ChatMessage[];
  emotes: Emote[];
  toasts: Toast[];
  /** Why the room sent this screen back to the start; shown there until it joins again. */
  notice: string | null;
  /** Milliseconds to add to Date.now() for the server's clock. */
  clockOffset: number;
}

/** Where the client wants to be: at a seat, or watching as a board. */
type Target = { kind: 'player'; code: string; name: string } | { kind: 'board'; code: string };

export interface ClientOptions {
  url: string;
  socket: SocketFactory;
  storage?: KeyValueStore | null;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

/**
 * One screen's connection to its room. It keeps the latest view, the chat and
 * the clock offset; it takes a phone's seat back with the saved token after a
 * reload or a dropped connection, and reconnects with a growing pause.
 */
export class TableClient {
  private state: ClientState = { status: 'idle', role: null, code: null, seatId: null, view: null, chat: [], emotes: [], toasts: [], notice: null, clockOffset: 0 };
  private readonly listeners = new Set<() => void>();
  private readonly clock = new ClockSync();
  private socket: SocketLike | null = null;
  private target: Target | null = null;
  /** True between sending a join or board message and its welcome. */
  private joining = false;
  private attempts = 0;
  private retry: unknown = null;
  private pinger: unknown = null;
  private nextId = 1;
  private readonly now: () => number;
  private readonly later: (fn: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;
  private readonly storage: KeyValueStore | null;

  constructor(private readonly opts: ClientOptions) {
    this.now = opts.now ?? Date.now;
    this.later = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
    this.cancel = opts.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.storage = opts.storage ?? null;
  }

  // --- State for React --------------------------------------------------------

  getState = (): ClientState => this.state;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<ClientState>): void {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** The server's time now, by the synced clock. */
  serverNow(): number {
    return this.clock.serverNow(this.now());
  }

  /** The seat this phone held before, if any. */
  savedSeat() {
    return loadSeat(this.storage);
  }

  // --- Where to be ------------------------------------------------------------

  /** Take a seat at the table with this code, or the saved seat back if it is for this table. */
  join(code: string, name: string): void {
    this.goTo({ kind: 'player', code: code.trim().toUpperCase(), name });
  }

  /** Connect as a big screen. */
  watch(code: string): void {
    this.goTo({ kind: 'board', code: code.trim().toUpperCase() });
  }

  /** Give up the seat on this phone: tell the room, forget the seat and disconnect. */
  leave(): void {
    if (this.socket?.readyState === OPEN) this.raw({ t: 'leave' });
    clearSeat(this.storage);
    this.letGo(null);
  }

  /** Drops the target and the socket, so its close starts no reconnect. */
  private letGo(notice: string | null): void {
    this.target = null;
    this.stopTimers();
    const s = this.socket;
    this.socket = null;
    s?.close();
    this.set({ status: 'idle', role: null, code: null, seatId: null, view: null, chat: [], emotes: [], notice });
  }

  private goTo(target: Target): void {
    this.target = target;
    this.attempts = 0;
    if (this.state.notice !== null) this.set({ notice: null });
    if (this.socket && this.socket.readyState === OPEN) this.hello();
    else if (!this.socket) this.connect();
  }

  private connect(): void {
    if (!this.target) return;
    this.set({ status: this.attempts > 0 ? 'reconnecting' : 'connecting' });
    const socket = this.opts.socket(this.opts.url);
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.set({ status: 'open' });
      this.hello();
      this.startPings();
    };
    socket.onmessage = (ev) => {
      if (this.socket !== socket || typeof ev.data !== 'string') return;
      let msg: ServerEnvelope<MuleView>;
      try {
        msg = JSON.parse(ev.data) as ServerEnvelope<MuleView>;
      } catch {
        return;
      }
      this.receive(msg);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopTimers();
      if (!this.target) {
        this.set({ status: 'idle' });
        return;
      }
      // Try again, waiting longer each time, up to a few seconds.
      const wait = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempts);
      this.attempts++;
      this.set({ status: 'reconnecting' });
      this.retry = this.later(() => {
        this.retry = null;
        this.connect();
      }, wait);
    };
    socket.onerror = () => {
      // A close always follows; reconnecting happens there.
    };
  }

  /** Introduces this screen to its room: as a board, or at a seat with the saved token. */
  private hello(): void {
    const target = this.target;
    if (!target) return;
    this.joining = true;
    if (target.kind === 'board') {
      this.raw({ t: 'board', code: target.code });
      return;
    }
    const saved = loadSeat(this.storage);
    const token = saved && saved.code === target.code ? saved.token : undefined;
    this.raw({ t: 'join', code: target.code, name: target.name || saved?.name || '', ...(token ? { seatToken: token } : {}) });
  }

  private startPings(): void {
    for (let i = 0; i < FIRST_PINGS; i++) this.later(() => this.ping(), i * 150);
    const loop = () => {
      this.pinger = this.later(() => {
        this.ping();
        loop();
      }, PING_EVERY_MS);
    };
    loop();
  }

  private ping(): void {
    if (this.socket?.readyState === OPEN) this.raw({ t: 'ping', clientTime: this.now() });
  }

  private stopTimers(): void {
    if (this.retry !== null) this.cancel(this.retry);
    if (this.pinger !== null) this.cancel(this.pinger);
    this.retry = null;
    this.pinger = null;
  }

  // --- What the server says ----------------------------------------------------

  /** Handles one message from the room. Public so tests can drive it directly. */
  receive(msg: ServerEnvelope<MuleView>): void {
    switch (msg.t) {
      case 'welcome': {
        this.joining = false;
        this.attempts = 0;
        if (msg.role === 'player' && msg.seatToken && this.target?.kind === 'player') {
          saveSeat(this.storage, { code: msg.code, token: msg.seatToken, name: this.target.name });
        }
        this.set({ role: msg.role, code: msg.code, seatId: msg.seatId });
        return;
      }
      case 'view':
        this.set({ view: msg.view });
        return;
      case 'chat': {
        if (this.state.chat.some((c) => c.id === msg.message.id)) return;
        this.set({ chat: [...this.state.chat, msg.message].slice(-MAX_CHAT) });
        return;
      }
      case 'emote': {
        const emote = { id: this.nextId++, from: msg.from, emote: msg.emote };
        this.set({ emotes: [...this.state.emotes, emote].slice(-6) });
        this.later(() => this.set({ emotes: this.state.emotes.filter((e) => e.id !== emote.id) }), TOAST_MS);
        return;
      }
      case 'pong':
        this.clock.add(msg.clientTime, msg.serverTime, this.now());
        if (this.clock.offset !== this.state.clockOffset) this.set({ clockOffset: this.clock.offset });
        return;
      case 'error':
        if (this.joining) this.joinFailed();
        this.toast(msg.message);
        return;
      case 'removed':
        // A board never holds a seat; the one saved here belongs to a phone tab in the same browser.
        if (this.state.role === 'player') clearSeat(this.storage);
        this.letGo(REMOVED[msg.reason]);
        return;
    }
  }

  /** The room turned this screen away: a stale seat token, an unknown code, a full or started table. */
  private joinFailed(): void {
    this.joining = false;
    const target = this.target;
    const saved = loadSeat(this.storage);
    if (target && saved && saved.code === target.code) clearSeat(this.storage);
    this.target = null;
    const s = this.socket;
    this.socket = null;
    this.stopTimers();
    s?.close();
    this.set({ status: 'idle', role: null, code: null, seatId: null, view: null });
  }

  toast(message: string): void {
    const toast = { id: this.nextId++, message };
    this.set({ toasts: [...this.state.toasts, toast].slice(-3) });
    this.later(() => this.dismiss(toast.id), TOAST_MS);
  }

  dismiss(id: number): void {
    this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) });
  }

  // --- What this screen says ---------------------------------------------------

  intent(intent: MuleIntent): void {
    this.send({ t: 'intent', intent });
  }

  chat(text: string, to?: string): void {
    if (text.trim()) this.send({ t: 'chat', text, ...(to ? { to } : {}) });
  }

  emote(emote: string): void {
    this.send({ t: 'emote', emote });
  }

  addAi(): void {
    this.send({ t: 'addAi' });
  }

  /** Chooses what this seat plays as, in the lobby. */
  pick(species: Species): void {
    this.send({ t: 'pick', pick: species });
  }

  start(): void {
    this.send({ t: 'start' });
  }

  /** The host removes a seat, in the lobby. */
  kick(seatId: string): void {
    this.send({ t: 'kick', seatId });
  }

  /** The host ends the table for everyone, in the lobby. */
  closeTable(): void {
    this.send({ t: 'close' });
  }

  private send(msg: ClientEnvelope<MuleIntent>): void {
    if (this.socket?.readyState !== OPEN) {
      this.toast('Not connected. Trying again…');
      return;
    }
    this.raw(msg);
  }

  private raw(msg: ClientEnvelope<MuleIntent>): void {
    this.socket?.send(JSON.stringify(msg));
  }
}

/** Creates a room on the server and returns its code. */
export async function createRoom(fetcher: typeof fetch = fetch, base = ''): Promise<string> {
  const res = await fetcher(`${base}/rooms`, { method: 'POST' });
  if (!res.ok) throw new Error('Could not create a game');
  const { code } = (await res.json()) as { code: string };
  return code;
}

/** The WebSocket address of the server that served this page. */
export function socketUrl(loc: { protocol: string; host: string }): string {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws`;
}
