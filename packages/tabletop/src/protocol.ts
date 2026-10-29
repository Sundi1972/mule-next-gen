/**
 * The wire protocol between a room and its screens. It knows nothing about
 * any particular game: game moves travel as an opaque `intent`, and the
 * game's own state travels as `game` inside a view.
 */

/** What a phone or a board sends. */
export type ClientEnvelope<Intent> =
  /** Take a seat, take your old seat back with its token, or move a seat here with a handoff code. */
  | { t: 'join'; code: string; name: string; seatToken?: string; handoff?: string }
  /** Connect a shared screen. It gets only the public view and has no controls. */
  | { t: 'board'; code: string }
  | { t: 'addAi' }
  | { t: 'start' }
  /** The host removes a seat, in the lobby. */
  | { t: 'kick'; seatId: string }
  /** The host ends the room, in the lobby. */
  | { t: 'close' }
  /** Give up your seat in the lobby; after Start, only this screen lets go. */
  | { t: 'leave' }
  /** Ask for a one-time code that moves this seat to another device. */
  | { t: 'handoff' }
  /** Make this seat's one choice from the game's list, in the lobby. */
  | { t: 'pick'; pick: string }
  /** Take this colour index for the seat, in the lobby. */
  | { t: 'color'; color: number }
  | { t: 'intent'; intent: Intent }
  | { t: 'chat'; text: string; to?: string }
  | { t: 'emote'; emote: string }
  | { t: 'ping'; clientTime: number };

/** What the room sends to one screen. `Frame` is the game's own transient frame, opaque to the room like `GameView`. */
export type ServerEnvelope<GameView, Frame = unknown> =
  | { t: 'welcome'; code: string; role: 'player' | 'board'; seatId: string | null; seatToken: string | null }
  | { t: 'view'; view: TableView<GameView> }
  | { t: 'chat'; message: ChatMessage }
  | { t: 'emote'; from: string; emote: string }
  /** The game's light per-tick frame, beside its full view. A screen that is behind misses frames; they are never resent. */
  | { t: 'frame'; payload: Frame }
  | { t: 'pong'; clientTime: number; serverTime: number }
  | { t: 'error'; message: string }
  /** For this screen only: joining with `code` before `expiresAt` moves this seat to that device, once. */
  | { t: 'handoffCode'; code: string; expiresAt: number }
  /** This screen no longer holds a seat or watches the room; the room refuses what it sends next. */
  | { t: 'removed'; reason: 'kicked' | 'closed' | 'moved' | 'error' };

export interface ChatMessage {
  id: number;
  from: string;
  /** Set for a whisper: only the sender and the recipient receive it. */
  to?: string;
  text: string;
  at: number;
}

export interface SeatView {
  id: string;
  name: string;
  isAi: boolean;
  connected: boolean;
  /** The seat's colour index, unique at the table. */
  color: number;
  /** The seat's choice from the game's list; absent until it has chosen. */
  pick?: string;
}

export interface TableView<GameView> {
  code: string;
  status: 'lobby' | 'playing';
  hostId: string | null;
  seats: SeatView[];
  /** Big screens connected to this room. */
  boards: number;
  /** The game's own view: private to the seat, or public for a board. */
  game: GameView | null;
}
