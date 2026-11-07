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
  /** The host sets a computer seat's kind, in the lobby: claude issues it a seat code, builtin takes the code back (C1). */
  | { t: 'setSeatKind'; seatId: string; kind: SeatKind }
  /** Hand this seat to a Claude chat: the room answers with a one-time handoverCode (C8). */
  | { t: 'handoverToClaude' }
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
  /** For this screen only: a Claude chat that joins with `code` before `expiresAt` plays this seat from then on (C8). */
  | { t: 'handoverCode'; code: string; invite: string; expiresAt: number }
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

/** Who plays a computer seat: the built-in AI, or a Claude chat that joined with the seat's code. */
export type SeatKind = 'builtin' | 'claude';

/** A Claude seat's state as every screen shows it on its chip (C6). */
export type ClaudeStatus = 'waiting' | 'connected' | 'thinking' | 'ready' | 'offline';

export interface SeatView {
  id: string;
  name: string;
  isAi: boolean;
  connected: boolean;
  /** The seat's colour index, unique at the table. */
  color: number;
  /** The seat's choice from the game's list; absent until it has chosen. */
  pick?: string;
  /** In the lobby, what the seat plays as if it never picks, at the table's current seat count; absent once started, or when the game has no defaults. */
  defaultPick?: string;
  /** A computer seat's kind; absent on a human seat, and on a computer seat no one has set (it plays builtin). */
  kind?: SeatKind;
  /** A claude seat's state, on every screen. */
  claude?: ClaudeStatus;
  /** A claude seat's code, in the host's own view only: it lets whoever holds it play the seat (C1, T-AC-5). */
  seatCode?: string;
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
