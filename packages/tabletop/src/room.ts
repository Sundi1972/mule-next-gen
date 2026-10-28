import type { ChatMessage, ClientEnvelope, ServerEnvelope, TableView } from './protocol.js';

/** A rule a player broke: shown to them, never a crash. */
export class TableError extends Error {}

/** How long a handoff code can move its seat to another device. See RULE-6. */
const HANDOFF_TTL_MS = 2 * 60_000;

export interface Connection<GameView> {
  send(msg: ServerEnvelope<GameView>): void;
}

export interface SeatInfo {
  id: string;
  name: string;
  isAi: boolean;
  /** The seat's colour index, unique at the table. */
  color: number;
  /** Absent means not chosen: the game applies its own default. */
  pick?: string;
}

/** What a room offers the game it hosts. */
export interface GameContext {
  now(): number;
  /** Runs `fn` after `ms` (or, if the room is held then, at its release) unless the room is disposed first. Returns a cancel function. */
  schedule(ms: number, fn: () => void): () => void;
  /** Tell every screen that the game's view changed. */
  changed(): void;
}

/** The part a game supplies. The room does everything else. */
export interface Game<Intent, GameView> {
  start(seats: SeatInfo[]): void;
  /** Applies one player's move. Throws a user error for an illegal move. */
  handle(seatId: string, intent: Intent): void;
  /** What one seat may see, or with `null` what everyone may see (the big screen). */
  viewFor(seatId: string | null): GameView;
  /** A player's phone dropped or came back. The game may let AI play their routine moves meanwhile. */
  connectionChanged?(seatId: string, connected: boolean): void;
  /** The seat's screen was replaced by another device; drop any input the old screen was holding. Not a disconnect. */
  seatMoved?(seatId: string): void;
  dispose?(): void;
}

export interface RoomOptions<Intent, GameView> {
  code: string;
  createGame(ctx: GameContext): Game<Intent, GameView>;
  minSeats?: number;
  /** Also the number of colours (0..maxSeats−1), so a game with a fixed palette keeps it within the palette (6 for M.U.L.E.). */
  maxSeats?: number;
  aiNames?: string[];
  emotes?: readonly string[];
  /** The values a seat may pick in the lobby. Absent: the game has no choices to make. */
  picks?: readonly string[];
  /** Cleans chat text, for example with a family-friendly filter. Return '' to drop the message. */
  moderate?(text: string): string;
  /** Errors whose message is shown to the player instead of thrown. */
  isUserError?(err: unknown): boolean;
  now?(): number;
  newToken?(): string;
  /** Called once the room has ended, closed by the host or stopped by a game error, and is disposed. */
  onClose?(): void;
  /** Hears a game error that ended the room, for logging. The players are only told the table stopped. */
  onError?(err: unknown): void;
}

interface Seat<View> extends SeatInfo {
  token: string | null;
  conn: Connection<View> | null;
  /** The seat's one live handoff code; a newer one replaces it, and it goes with the seat. */
  handoff: { code: string; expiresAt: number } | null;
}

/**
 * One table: seats for players (human or AI), any number of boards, and the
 * game they play. Human seats have a secret token, so a phone that drops can
 * take its seat back, and a one-time handoff code moves a seat to another device.
 * The host is the first connected human, and hosting moves on when the host leaves.
 * Before Start the host may kick a seat or close the room, and a player may give up their seat.
 */
export class Room<Intent, View> {
  readonly code: string;
  private readonly seats: Seat<View>[] = [];
  private readonly boards = new Set<Connection<View>>();
  private readonly game: Game<Intent, View>;
  private readonly opts: Required<Omit<RoomOptions<Intent, View>, 'createGame' | 'code' | 'picks'>>;
  private readonly picks: readonly string[] | undefined;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  /** While held: the game callbacks that came due, by timer, in the order they came due. Null when not held. */
  private queued: Map<ReturnType<typeof setTimeout>, () => void> | null = null;
  private started = false;
  private endedBy: 'closed' | 'error' | null = null;
  private nextSeat = 1;
  private chatId = 0;
  private broadcastQueued = false;

  constructor(options: RoomOptions<Intent, View>) {
    this.code = options.code;
    this.picks = options.picks;
    this.opts = {
      minSeats: options.minSeats ?? 2,
      maxSeats: options.maxSeats ?? 6,
      aiNames: options.aiNames ?? ['AI'],
      emotes: options.emotes ?? [],
      moderate: options.moderate ?? ((text) => text),
      isUserError: options.isUserError ?? ((err) => err instanceof TableError),
      now: options.now ?? Date.now,
      newToken: options.newToken ?? (() => crypto.randomUUID()),
      onClose: options.onClose ?? (() => {}),
      onError: options.onError ?? (() => {}),
    };
    this.game = options.createGame({
      now: this.opts.now,
      schedule: (ms, fn) => {
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          if (this.endedBy) return;
          if (this.queued) this.queued.set(timer, fn);
          else this.runScheduled(fn);
        }, ms);
        this.timers.add(timer);
        return () => {
          clearTimeout(timer);
          this.timers.delete(timer);
          this.queued?.delete(timer);
        };
      },
      changed: () => this.broadcast(),
    });
  }

  get hostId(): string | null {
    const humans = this.seats.filter((s) => !s.isAi);
    return (humans.find((s) => s.conn) ?? humans[0])?.id ?? null;
  }

  /** True when no human and no board is connected. */
  get isIdle(): boolean {
    return this.boards.size === 0 && this.seats.every((s) => !s.conn);
  }

  /** Handles one message from a screen. `from` is null until the screen has joined. */
  receive(conn: Connection<View>, from: { seatId: string | null }, msg: ClientEnvelope<Intent>): void {
    // A failed game must never see another message. A closed room has no game running and still refuses screens out loud.
    if (this.endedBy === 'error') return;
    try {
      this.apply(conn, from, msg);
    } catch (err) {
      if (!this.opts.isUserError(err)) {
        // A bug ends this table only; its state can no longer be trusted, and every other table plays on.
        this.opts.onError(err);
        this.fail();
        return;
      }
      conn.send({ t: 'error', message: (err as Error).message });
    }
  }

  private apply(conn: Connection<View>, from: { seatId: string | null }, msg: ClientEnvelope<Intent>): void {
    if (msg.t === 'ping') {
      conn.send({ t: 'pong', clientTime: msg.clientTime, serverTime: this.opts.now() });
      return;
    }
    if (msg.t === 'join') {
      from.seatId = this.join(conn, msg.name, msg.seatToken, msg.handoff);
      return;
    }
    if (msg.t === 'board') {
      this.boards.add(conn);
      conn.send({ t: 'welcome', code: this.code, role: 'board', seatId: null, seatToken: null });
      this.broadcast();
      return;
    }
    const seat = this.seats.find((s) => s.id === from.seatId);
    if (!seat || seat.conn !== conn) {
      // A kicked, closed-out or superseded screen still carries its old seat id. Ids are never reused, so it can't land on another seat.
      from.seatId = null;
      // A screen another device took the seat from lets go of itself only. See AM-18.
      if (seat && msg.t === 'leave') return;
      throw new TableError('Join the game first');
    }
    const seatId = seat.id;
    switch (msg.t) {
      case 'addAi':
        this.requireHost(seatId);
        if (this.started) throw new TableError('The game has already started');
        if (this.seats.length >= this.opts.maxSeats) throw new TableError('The table is full');
        this.addSeat(this.nextAiName(), true);
        this.broadcast();
        return;
      case 'start':
        this.requireHost(seatId);
        if (this.started) throw new TableError('The game has already started');
        if (this.seats.length < this.opts.minSeats) throw new TableError(`At least ${this.opts.minSeats} players are needed`);
        this.started = true;
        this.game.start(this.seats.map(({ id, name, isAi, color, pick }) => ({ id, name, isAi, color, ...(pick !== undefined ? { pick } : {}) })));
        this.broadcast();
        return;
      case 'kick':
        this.kick(seatId, msg.seatId);
        this.broadcast();
        return;
      case 'close':
        this.close(seatId);
        return;
      case 'leave':
        this.leave(conn, from, seat);
        return;
      case 'handoff':
        seat.handoff = { code: this.opts.newToken(), expiresAt: this.opts.now() + HANDOFF_TTL_MS };
        conn.send({ t: 'handoffCode', ...seat.handoff });
        return;
      case 'pick':
        this.pick(seatId, msg.pick);
        this.broadcast();
        return;
      case 'color':
        this.paint(seatId, msg.color);
        this.broadcast();
        return;
      case 'intent':
        if (!this.started) throw new TableError('The game has not started');
        this.game.handle(seatId, msg.intent);
        this.broadcast();
        return;
      case 'chat':
        this.chat(seatId, msg.text, msg.to);
        return;
      case 'emote':
        if (!this.opts.emotes.includes(msg.emote)) throw new TableError('Unknown emote');
        this.everyone((c) => c.send({ t: 'emote', from: seatId, emote: msg.emote }));
        return;
    }
  }

  private join(conn: Connection<View>, name: string, token?: string, handoff?: string): string {
    const seat = handoff !== undefined ? this.moveHere(conn, handoff) : this.seatFor(conn, name, token);
    conn.send({ t: 'welcome', code: this.code, role: 'player', seatId: seat.id, seatToken: seat.token });
    this.broadcast();
    return seat.id;
  }

  private seatFor(conn: Connection<View>, name: string, token?: string): Seat<View> {
    const back = token ? this.seats.find((s) => s.token === token) : undefined;
    if (!back) {
      if (this.started) throw new TableError('This game has already started');
      if (this.seats.length >= this.opts.maxSeats) throw new TableError('The table is full');
    }
    const seat = back ?? this.addSeat(name.trim().slice(0, 16) || 'Player', false);
    this.letGoOfOtherSeats(conn, seat);
    seat.conn = conn;
    if (back) this.game.connectionChanged?.(seat.id, true);
    return seat;
  }

  /** A live handoff code moves its seat here, once: the old screen is told and let go, and the seat gets a new token. See RULE-6. */
  private moveHere(conn: Connection<View>, code: string): Seat<View> {
    const now = this.opts.now();
    const seat = this.seats.find((s) => s.handoff?.code === code && now < s.handoff.expiresAt);
    if (!seat) throw new TableError('That link has expired');
    seat.handoff = null;
    const old = seat.conn;
    this.letGoOfOtherSeats(conn, seat);
    seat.conn = conn;
    seat.token = this.opts.newToken();
    if (!old) this.game.connectionChanged?.(seat.id, true);
    else if (old !== conn) {
      old.send({ t: 'removed', reason: 'moved' });
      this.game.seatMoved?.(seat.id);
    }
    return seat;
  }

  /** A screen's connection closed. */
  disconnect(conn: Connection<View>): void {
    if (this.boards.delete(conn)) {
      this.broadcast();
      return;
    }
    const seat = this.seats.find((s) => s.conn === conn);
    if (!seat) return;
    this.detach(seat);
    this.broadcast();
  }

  /** A connection holds one seat: one that joins another lets go of the seat it held, as a disconnect would. See FM-3. */
  private letGoOfOtherSeats(conn: Connection<View>, joining: Seat<View>): void {
    for (const seat of this.seats) if (seat !== joining && seat.conn === conn) this.detach(seat);
  }

  private detach(seat: Seat<View>): void {
    seat.conn = null;
    if (this.started) this.game.connectionChanged?.(seat.id, false);
  }

  private addSeat(name: string, isAi: boolean): Seat<View> {
    const seat: Seat<View> = { id: `s${this.nextSeat++}`, name, isAi, color: this.lowestFreeColour(), token: isAi ? null : this.opts.newToken(), conn: null, handoff: null };
    this.seats.push(seat);
    return seat;
  }

  /** See RULE-7. Defined while a seat is free, since the palette has one colour per seat. */
  private lowestFreeColour(): number {
    const held = new Set(this.seats.map((s) => s.color));
    let colour = 0;
    while (held.has(colour)) colour++;
    return colour;
  }

  private nextAiName(): string {
    const used = new Set(this.seats.map((s) => s.name));
    const named = this.opts.aiNames.find((n) => !used.has(n));
    if (named) return named;
    let n = this.seats.length + 1;
    while (used.has(`AI ${n}`)) n++;
    return `AI ${n}`;
  }

  /** A human seat makes its own choice from the game's list, before Start. See RULE-1. */
  private pick(seatId: string, pick: string): void {
    if (!this.picks) throw new TableError('This game has no choices to make');
    if (this.started) throw new TableError('The game has already started');
    if (!this.picks.includes(pick)) throw new TableError('Unknown choice');
    const seat = this.seats.find((s) => s.id === seatId);
    if (seat) seat.pick = pick;
  }

  /** A human seat takes a colour before Start; an AI holding it moves to the lowest free one. See RULE-7. */
  private paint(seatId: string, colour: number): void {
    if (this.started) throw new TableError('The game has already started');
    if (!Number.isInteger(colour) || colour < 0 || colour >= this.opts.maxSeats) throw new TableError('Unknown colour');
    const seat = this.seats.find((s) => s.id === seatId)!;
    const holder = this.seats.find((s) => s.color === colour && s !== seat);
    if (holder && !holder.isAi) throw new TableError('That colour is taken');
    seat.color = colour;
    // Chosen once the sender let go of its own, so a full table still has one free.
    if (holder) holder.color = this.lowestFreeColour();
  }

  /** The host removes a seat, and its token with it, before Start. See RULE-5. */
  private kick(by: string, target: string): void {
    this.requireHost(by);
    if (this.started) throw new TableError('The game has already started');
    const seat = this.seats.find((s) => s.id === target);
    if (!seat) throw new TableError('No such seat');
    if (target === this.hostId) throw new TableError('Close the table instead');
    this.seats.splice(this.seats.indexOf(seat), 1);
    seat.conn?.send({ t: 'removed', reason: 'kicked' });
  }

  /** In the lobby the sender's seat goes, token and all; after Start only this screen lets go and the seat waits, away. See RULE-5. */
  private leave(conn: Connection<View>, from: { seatId: string | null }, seat: Seat<View>): void {
    if (!this.started && seat.id === this.hostId) throw new TableError('Close the table instead');
    from.seatId = null;
    if (this.started) {
      this.disconnect(conn);
      return;
    }
    this.seats.splice(this.seats.indexOf(seat), 1);
    this.broadcast();
  }

  /** The host ends the room before Start: every screen is told and let go, then the room is disposed. See RULE-5. */
  private close(by: string): void {
    this.requireHost(by);
    if (this.started) throw new TableError('The game has already started');
    this.end('closed');
  }

  /** Stops the room after a game error: every screen is told and let go, then the room is disposed. */
  fail(): void {
    this.end('error');
  }

  private end(reason: 'closed' | 'error'): void {
    if (this.endedBy) return;
    this.endedBy = reason;
    this.everyone((c) => c.send({ t: 'removed', reason }));
    this.seats.length = 0;
    this.boards.clear();
    // The timers are already cleared when the game's own dispose runs; a throw there must still let the registry drop the room.
    try {
      this.dispose();
    } catch (err) {
      this.opts.onError(err);
    }
    this.opts.onClose();
  }

  private requireHost(seatId: string): void {
    if (seatId !== this.hostId) throw new TableError('Only the host can do that');
  }

  private chat(from: string, text: string, to?: string): void {
    const clean = this.opts.moderate(text.trim().slice(0, 280));
    if (!clean) return;
    if (to && !this.seats.some((s) => s.id === to)) throw new TableError('Nobody by that name at the table');
    const message: ChatMessage = { id: ++this.chatId, from, text: clean, at: this.opts.now(), ...(to ? { to } : {}) };
    if (to) {
      // A whisper reaches only its two ends, never a board.
      for (const seat of this.seats) if (seat.id === to || seat.id === from) seat.conn?.send({ t: 'chat', message });
    } else {
      this.everyone((c) => c.send({ t: 'chat', message }));
    }
  }

  private everyone(fn: (conn: Connection<View>) => void): void {
    for (const seat of this.seats) if (seat.conn) fn(seat.conn);
    for (const board of this.boards) fn(board);
  }

  /** Sends every screen its own view. Several changes in one tick go out as one update. */
  broadcast(): void {
    if (this.broadcastQueued) return;
    this.broadcastQueued = true;
    queueMicrotask(() => {
      this.broadcastQueued = false;
      for (const seat of this.seats) seat.conn?.send({ t: 'view', view: this.viewFor(seat.id) });
      const shared = this.viewFor(null);
      for (const board of this.boards) board.send({ t: 'view', view: shared });
    });
  }

  viewFor(seatId: string | null): TableView<View> {
    return {
      code: this.code,
      status: this.started ? 'playing' : 'lobby',
      hostId: this.hostId,
      seats: this.seats.map((s) => ({
        id: s.id,
        name: s.name,
        isAi: s.isAi,
        connected: s.isAi || s.conn !== null,
        color: s.color,
        ...(s.pick !== undefined ? { pick: s.pick } : {}),
      })),
      boards: this.boards.size,
      game: this.started ? this.game.viewFor(seatId) : null,
    };
  }

  /**
   * For tests that look around a screen without the game's own clock moving under them: until `release`, a game
   * callback that comes due waits. Real time, `now()` and every message carry on as usual.
   */
  hold(): void {
    this.queued ??= new Map();
  }

  /** Ends a hold: runs the callbacks that came due meanwhile, in the order they came due, then lets the clock run. */
  release(): void {
    const queued = this.queued;
    if (!queued) return;
    // Walks the live map: a released callback may cancel one still queued, and a game error clears it.
    for (const [timer, fn] of queued) {
      queued.delete(timer);
      this.runScheduled(fn);
    }
    this.queued = null;
  }

  private runScheduled(fn: () => void): void {
    // A throw here would be uncaught and take the whole server down with this one table.
    try {
      fn();
    } catch (err) {
      this.opts.onError(err);
      this.fail();
    }
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.queued?.clear();
    this.queued = null;
    this.game.dispose?.();
  }
}
