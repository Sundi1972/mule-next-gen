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
/** Pings sent right after connecting or a device clock jump, the first at once, to sync the clock quickly; otherwise one every PING_EVERY_MS. */
const FIRST_PINGS = 4;
const PING_EVERY_MS = 15_000;
const MAX_BACKOFF_MS = 5_000;
const MAX_CHAT = 80;
const TOAST_MS = 3_500;
/** Milliseconds after which an unanswered move-code request counts as lost: the room drops messages over its rate limit without a reply. */
export const HANDOFF_LOST_MS = 5_000;

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
  /** Milliseconds to add to Date.now() for the server's clock, as of the last pong; serverNow() also follows a jump noticed since. */
  clockOffset: number;
  /** The one-time code that moves this seat to another device: null while none has arrived since it was asked for. */
  handoffCode: HandoffCode | null;
}

/** `expiresAt` is server time. An expired code stays until a new one is asked for or the dialog closes. */
export type HandoffCode = Omit<Extract<ServerEnvelope<MuleView>, { t: 'handoffCode' }>, 't'> & { expired: boolean };

/** Where the client wants to be: at a seat (moved here by a handoff code, or not), or watching as a board. */
type Target = { kind: 'player'; code: string; name: string; handoff?: string } | { kind: 'board'; code: string };

export interface ClientOptions {
  url: string;
  socket: SocketFactory;
  storage?: KeyValueStore | null;
  now?: () => number;
  /** A clock the device can't change (performance.now()), to tell its clock jumping from time passing. */
  monotonic?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

/**
 * One screen's connection to its room. It keeps the latest view, the chat and
 * the clock offset; it takes a phone's seat back with the saved token after a
 * reload, and with its own after a dropped connection, reconnecting with a growing pause.
 */
export class TableClient {
  private state: ClientState = { status: 'idle', role: null, code: null, seatId: null, view: null, chat: [], emotes: [], toasts: [], notice: null, clockOffset: 0, handoffCode: null };
  private readonly listeners = new Set<() => void>();
  private readonly clock: ClockSync;
  private socket: SocketLike | null = null;
  private target: Target | null = null;
  /** True between sending a join or board message and its welcome. */
  private joining = false;
  private attempts = 0;
  private retry: unknown = null;
  private pinger: unknown = null;
  private handoffExpiry: unknown = null;
  /** True while the move dialog is open. */
  private handoffWanted = false;
  /** A lost-request timer per `handoff` request sent and not answered yet, oldest first; only the reply to the newest carries a live code. */
  private handoffsPending: unknown[] = [];
  /**
   * This tab's seat: the one the room gave it, or the saved one its join claimed. Another tab of the browser may save
   * its own seat at any time, so this token, not the saved one, is the only one this tab sends or forgets.
   */
  private ownSeat: { code: string; token: string } | null = null;
  /** The seat token the last join sent; null for a join by code or by link. */
  private joinToken: string | null = null;
  private nextId = 1;
  private readonly now: () => number;
  private readonly monotonic: () => number;
  private readonly later: (fn: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;
  private readonly storage: KeyValueStore | null;

  constructor(private readonly opts: ClientOptions) {
    this.now = opts.now ?? Date.now;
    this.monotonic = opts.monotonic ?? (() => performance.now());
    this.clock = new ClockSync(undefined, { monotonic: this.monotonic, onJump: () => this.burstOfPings(), onOffset: () => this.retimeHandoff() });
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

  /** The server's time now, by the synced clock. A device clock jump noticed here sends the burst of pings. */
  serverNow(): number {
    return this.clock.serverNow(this.now());
  }

  /** The seat this phone held before, if any. */
  savedSeat() {
    return loadSeat(this.storage);
  }

  // --- Where to be ------------------------------------------------------------

  /**
   * Take a seat at the table with this code, or the saved seat back if it is for this table.
   * With a handoff code from another device's link, take that device's seat instead.
   */
  join(code: string, name: string, handoff?: string): void {
    const room = code.trim().toUpperCase();
    // Claimed now, not on connecting: a seat saved after this is another tab's.
    if (!handoff && this.ownSeat?.code !== room) {
      const saved = loadSeat(this.storage);
      this.ownSeat = saved && saved.code === room ? { code: room, token: saved.token } : null;
    }
    this.goTo({ kind: 'player', code: room, name, ...(handoff ? { handoff } : {}) });
  }

  /** Connect as a big screen. */
  watch(code: string): void {
    this.goTo({ kind: 'board', code: code.trim().toUpperCase() });
  }

  /** Give up the seat on this phone: tell the room, forget the seat and disconnect. */
  leave(): void {
    if (this.socket?.readyState === OPEN) this.raw({ t: 'leave' });
    this.forgetSeat(this.ownSeat?.token ?? null);
    this.letGo(null);
  }

  /** Drops the target and the socket, so its close starts no reconnect. */
  private letGo(notice: string | null): void {
    this.target = null;
    this.ownSeat = null;
    this.stopTimers();
    this.closeHandoff();
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
    // A new socket has no request in flight. Not in onclose: it returns early after leave, removed or a refused join.
    for (const timer of this.handoffsPending) this.cancel(timer);
    this.handoffsPending = [];
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

  /** Introduces this screen to its room: as a board, or at a seat with this tab's own token. */
  private hello(): void {
    const target = this.target;
    if (!target) return;
    this.joining = true;
    this.joinToken = null;
    if (target.kind === 'board') {
      this.raw({ t: 'board', code: target.code });
      return;
    }
    if (target.handoff !== undefined) {
      this.raw({ t: 'join', code: target.code, name: target.name, handoff: target.handoff });
      return;
    }
    const token = this.ownSeat?.code === target.code ? this.ownSeat.token : undefined;
    this.joinToken = token ?? null;
    this.raw({ t: 'join', code: target.code, name: target.name || loadSeat(this.storage)?.name || '', ...(token ? { seatToken: token } : {}) });
  }

  private startPings(): void {
    this.burstOfPings();
    const loop = () => {
      this.pinger = this.later(() => {
        this.ping();
        loop();
      }, PING_EVERY_MS);
    };
    loop();
  }

  private burstOfPings(): void {
    this.ping();
    for (let i = 1; i < FIRST_PINGS; i++) this.later(() => this.ping(), i * 150);
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
          // The welcome to a join this screen has since replaced claims nothing.
          if (msg.code === this.target.code) this.ownSeat = { code: msg.code, token: msg.seatToken };
          // A handoff code is spent once it lands; a reconnect comes back with the new token.
          if (this.target.handoff !== undefined) this.target = { kind: 'player', code: this.target.code, name: this.target.name };
        }
        // A code shown or on its way moves the seat this screen held, not the one it holds now.
        if (msg.code !== this.state.code || msg.seatId !== this.state.seatId) this.setHandoff(null);
        this.set({ role: msg.role, code: msg.code, seatId: msg.seatId });
        // A code asked for while away was never sent. A welcome on the same socket keeps any request in flight.
        this.askAgainIfWanted();
        return;
      }
      case 'view':
        this.learnName(msg.view);
        this.set({ view: msg.view });
        return;
      case 'handoffCode':
        // The room answers in order, so this is the reply to the oldest request still pending.
        if (this.handoffsPending.length > 0) this.cancel(this.handoffsPending.shift());
        if (this.handoffWanted && this.handoffsPending.length === 0) this.setHandoff({ code: msg.code, expiresAt: msg.expiresAt });
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
      case 'error': {
        // A refused link ("That link has expired") stays on the start screen; a toast would be gone before it is read.
        const byLink = this.joining && this.target?.kind === 'player' && this.target.handoff !== undefined;
        if (this.joining) this.joinFailed(byLink ? msg.message : null);
        if (!byLink) this.toast(msg.message);
        return;
      }
      case 'removed':
        // A board never holds a seat; the one saved here belongs to a phone tab in the same browser.
        if (this.state.role === 'player') this.forgetSeat(this.ownSeat?.token ?? null);
        this.letGo(REMOVED[msg.reason]);
        return;
    }
  }

  /** The room turned this screen away: a stale seat token or link, an unknown code, a full or started table. */
  private joinFailed(notice: string | null): void {
    this.joining = false;
    // A join by code or by link sent no token, so its refusal says nothing about the seat saved here.
    if (this.joinToken !== null) this.forgetSeat(this.joinToken);
    this.target = null;
    this.ownSeat = null;
    const s = this.socket;
    this.socket = null;
    this.stopTimers();
    s?.close();
    this.set({ status: 'idle', role: null, code: null, seatId: null, view: null, ...(notice !== null ? { notice } : {}) });
  }

  /** Clears the saved seat while it still holds `token`: another tab of the browser may have saved its own since. */
  private forgetSeat(token: string | null): void {
    if (loadSeat(this.storage)?.token === token) clearSeat(this.storage);
  }

  /** A seat taken by a handoff code learns its name from the room, so the saved seat carries it. */
  private learnName(view: TableView<MuleView>): void {
    const target = this.target;
    if (target?.kind !== 'player' || target.name) return;
    const name = view.seats.find((s) => s.id === this.state.seatId)?.name;
    if (!name) return;
    this.target = { ...target, name };
    const saved = loadSeat(this.storage);
    if (saved && saved.code === target.code) saveSeat(this.storage, { ...saved, name });
  }

  /** Shows a handoff code, marked expired when its time is up; null drops it. Only the newest code has a pending expiry. */
  private setHandoff(issued: Omit<HandoffCode, 'expired'> | null): void {
    if (!issued) {
      if (this.handoffExpiry !== null) this.cancel(this.handoffExpiry);
      this.handoffExpiry = null;
      if (this.state.handoffCode !== null) this.set({ handoffCode: null });
      return;
    }
    this.timeHandoff(issued);
  }

  /** Shows `issued` live until the server clock reaches its `expiresAt`, or expired if it already has. */
  private timeHandoff(issued: Omit<HandoffCode, 'expired'>): void {
    const leftMs = issued.expiresAt - this.serverNow();
    if (this.handoffExpiry !== null) this.cancel(this.handoffExpiry);
    this.handoffExpiry = null;
    if (leftMs <= 0) {
      this.set({ handoffCode: { ...issued, expired: true } });
      return;
    }
    this.handoffExpiry = this.later(() => {
      this.handoffExpiry = null;
      this.set({ handoffCode: { ...issued, expired: true } });
    }, leftMs);
    this.set({ handoffCode: { ...issued, expired: false } });
  }

  /** The clock's offset changed, so a live code's expiry moves with it. An expired code stays expired. */
  private retimeHandoff(): void {
    const shown = this.state.handoffCode;
    if (shown && !shown.expired) this.timeHandoff(shown);
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

  /** Takes a colour for this seat, in the lobby. */
  color(colour: number): void {
    this.send({ t: 'color', color: colour });
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

  /** Asks the room for a one-time code that moves this seat to another device; it arrives as `handoffCode`. */
  handoff(): void {
    // The room kills the previous code when it issues the next one, so it must not show meanwhile.
    this.setHandoff(null);
    this.handoffWanted = true;
    this.askForHandoff();
  }

  private askForHandoff(): void {
    // A jump noticed by this read pings ahead of the request, so the code is timed by a fresh round trip.
    this.serverNow();
    if (!this.send({ t: 'handoff' })) return;
    // Timers fire in the order they were set, so this one finds its own request at the front: older ones were answered or lost.
    this.handoffsPending.push(
      this.later(() => {
        this.handoffsPending.shift();
        this.askAgainIfWanted();
      }, HANDOFF_LOST_MS),
    );
  }

  /** Asks for a code if the open dialog shows none and none is on its way. A closed connection waits for the welcome. */
  private askAgainIfWanted(): void {
    if (this.socket?.readyState === OPEN && this.handoffWanted && this.handoffsPending.length === 0 && this.state.handoffCode === null) this.askForHandoff();
  }

  /** The move dialog closed: forget the code, and one still on its way. Nothing is sent; the room lets an unused code expire. */
  closeHandoff(): void {
    this.handoffWanted = false;
    this.setHandoff(null);
  }

  /** Sends `msg`, or tells the player the screen is not connected. Returns whether it went out. */
  private send(msg: ClientEnvelope<MuleIntent>): boolean {
    if (this.socket?.readyState !== OPEN) {
      this.toast('Not connected. Trying again…');
      return false;
    }
    this.raw(msg);
    return true;
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
