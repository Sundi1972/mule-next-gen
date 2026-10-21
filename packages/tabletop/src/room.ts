import type { ChatMessage, ClientEnvelope, ServerEnvelope, TableView } from './protocol.js';

/** A rule a player broke: shown to them, never a crash. */
export class TableError extends Error {}

export interface Connection<GameView> {
  send(msg: ServerEnvelope<GameView>): void;
}

export interface SeatInfo {
  id: string;
  name: string;
  isAi: boolean;
  /** Absent means not chosen: the game applies its own default. */
  pick?: string;
}

/** What a room offers the game it hosts. */
export interface GameContext {
  now(): number;
  /** Runs `fn` after `ms` unless the room is disposed first. Returns a cancel function. */
  schedule(ms: number, fn: () => void): () => void;
  /** Tell every screen that the game's view changed. */
  changed(): void;
  /**
   * Posts a chat line as seat `from`. The line follows a player's trim, cap, moderation and whisper rules, but the
   * game's `heard` never receives it.
   * Throws TableError for an unknown `from` or `to`. It runs outside the room's error handling, so the caller must
   * not let it throw: from a timer, a throw is unhandled.
   */
  say?(from: string, text: string, to?: string): void;
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
  /**
   * A player's delivered, moderated line: public, or whispered to an AI seat. Never a whisper between two humans, a
   * line moderation dropped, or a line from `say`. Runs while the speaker's message is handled, after delivery, and
   * must not throw.
   */
  heard?(from: string, text: string, to?: string): void;
  dispose?(): void;
}

export interface RoomOptions<Intent, GameView> {
  code: string;
  createGame(ctx: GameContext): Game<Intent, GameView>;
  minSeats?: number;
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
  /** Called once the host has closed the room and it is disposed. */
  onClose?(): void;
}

/**
 * A typed name on one line, at most 16 code points, with no control characters, line or paragraph separators, or bidi
 * overrides and isolates: a line break in a name would forge a line in an AI's prompt, and a bidi control would make
 * it read differently from how it is stored. Other format characters stay, so a ZWJ emoji survives. NFC, not NFKC,
 * so a name shows as typed. Capping by code point never splits an emoji's surrogate pair. See B-AC-5.
 */
function cleanName(name: string): string {
  const oneLine = name.normalize('NFC').replace(/[\p{Cc}\p{Zl}\p{Zp}\u202A-\u202E\u2066-\u2069]/gu, '').trim();
  return Array.from(oneLine).slice(0, 16).join('').trim();
}

interface Seat<View> extends SeatInfo {
  token: string | null;
  conn: Connection<View> | null;
}

/**
 * One table: seats for players (human or AI), any number of boards, and the
 * game they play. Human seats have a secret token, so a phone that drops can
 * take its seat back. The host is the first connected human, and hosting
 * moves on when the host leaves. Before Start the host may kick a seat or close the room,
 * and a player may give up their seat.
 */
export class Room<Intent, View> {
  readonly code: string;
  private readonly seats: Seat<View>[] = [];
  private readonly boards = new Set<Connection<View>>();
  private readonly game: Game<Intent, View>;
  private readonly opts: Required<Omit<RoomOptions<Intent, View>, 'createGame' | 'code' | 'picks'>>;
  private readonly picks: readonly string[] | undefined;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private started = false;
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
    };
    this.game = options.createGame({
      now: this.opts.now,
      schedule: (ms, fn) => {
        const timer = setTimeout(() => {
          this.timers.delete(timer);
          fn();
        }, ms);
        this.timers.add(timer);
        return () => {
          clearTimeout(timer);
          this.timers.delete(timer);
        };
      },
      changed: () => this.broadcast(),
      say: (from, text, to) => void this.deliver(from, text, to),
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
    try {
      this.apply(conn, from, msg);
    } catch (err) {
      if (!this.opts.isUserError(err)) throw err;
      conn.send({ t: 'error', message: (err as Error).message });
    }
  }

  private apply(conn: Connection<View>, from: { seatId: string | null }, msg: ClientEnvelope<Intent>): void {
    if (msg.t === 'ping') {
      conn.send({ t: 'pong', clientTime: msg.clientTime, serverTime: this.opts.now() });
      return;
    }
    if (msg.t === 'join') {
      from.seatId = this.join(conn, msg.name, msg.seatToken);
      return;
    }
    if (msg.t === 'board') {
      this.boards.add(conn);
      conn.send({ t: 'welcome', code: this.code, role: 'board', seatId: null, seatToken: null });
      this.broadcast();
      return;
    }
    const seatId = from.seatId;
    if (!seatId || !this.seats.some((s) => s.id === seatId)) {
      // A kicked or closed-out screen still carries its old seat id. Ids are never reused, so it can't land on another seat.
      from.seatId = null;
      throw new TableError('Join the game first');
    }
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
        this.game.start(this.seats.map(({ id, name, isAi, pick }) => ({ id, name, isAi, ...(pick !== undefined ? { pick } : {}) })));
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
        this.leave(conn, from, seatId);
        return;
      case 'pick':
        this.pick(seatId, msg.pick);
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

  private join(conn: Connection<View>, name: string, token?: string): string {
    const back = token ? this.seats.find((s) => s.token === token) : undefined;
    let seat: Seat<View>;
    if (back) {
      seat = back;
      back.conn = conn;
      this.game.connectionChanged?.(seat.id, true);
    } else {
      if (this.started) throw new TableError('This game has already started');
      if (this.seats.length >= this.opts.maxSeats) throw new TableError('The table is full');
      seat = this.addSeat(cleanName(name) || 'Player', false);
      seat.conn = conn;
    }
    conn.send({ t: 'welcome', code: this.code, role: 'player', seatId: seat.id, seatToken: seat.token });
    this.broadcast();
    return seat.id;
  }

  /** A screen's connection closed. */
  disconnect(conn: Connection<View>): void {
    if (this.boards.delete(conn)) {
      this.broadcast();
      return;
    }
    const seat = this.seats.find((s) => s.conn === conn);
    if (!seat) return;
    seat.conn = null;
    if (this.started) this.game.connectionChanged?.(seat.id, false);
    this.broadcast();
  }

  private addSeat(name: string, isAi: boolean): Seat<View> {
    const seat: Seat<View> = { id: `s${this.nextSeat++}`, name, isAi, token: isAi ? null : this.opts.newToken(), conn: null };
    this.seats.push(seat);
    return seat;
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
  private leave(conn: Connection<View>, from: { seatId: string | null }, seatId: string): void {
    const seat = this.seats.find((s) => s.id === seatId);
    // A screen another device took the seat from lets go of itself only.
    if (seat?.conn !== conn) {
      from.seatId = null;
      return;
    }
    if (!this.started && seatId === this.hostId) throw new TableError('Close the table instead');
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
    this.everyone((c) => c.send({ t: 'removed', reason: 'closed' }));
    this.seats.length = 0;
    this.boards.clear();
    this.dispose();
    this.opts.onClose();
  }

  private requireHost(seatId: string): void {
    if (seatId !== this.hostId) throw new TableError('Only the host can do that');
  }

  private chat(from: string, text: string, to?: string): void {
    const line = this.deliver(from, text, to);
    if (!line) return;
    // A whisper between two humans stays private from the game too.
    if (line.to && !this.seats.find((s) => s.id === line.to)?.isAi) return;
    this.game.heard?.(line.from, line.text, line.to);
  }

  /**
   * Sends one cleaned chat line to the screens it is for. Returns it, or null when moderation dropped it.
   * Throws TableError for an unknown sender or recipient.
   */
  private deliver(from: string, text: string, to?: string): ChatMessage | null {
    // Checked before moderation, so an unknown seat throws whatever the text.
    if (!this.seats.some((s) => s.id === from)) throw new TableError('Nobody by that name at the table');
    if (to && !this.seats.some((s) => s.id === to)) throw new TableError('Nobody by that name at the table');
    const clean = this.opts.moderate(text.trim().slice(0, 280));
    if (!clean) return null;
    const message: ChatMessage = { id: ++this.chatId, from, text: clean, at: this.opts.now(), ...(to ? { to } : {}) };
    if (to) {
      // A whisper reaches only its two ends, never a board.
      for (const seat of this.seats) if (seat.id === to || seat.id === from) seat.conn?.send({ t: 'chat', message });
    } else {
      this.everyone((c) => c.send({ t: 'chat', message }));
    }
    return message;
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
        ...(s.pick !== undefined ? { pick: s.pick } : {}),
      })),
      boards: this.boards.size,
      game: this.started ? this.game.viewFor(seatId) : null,
    };
  }

  dispose(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.game.dispose?.();
  }
}
