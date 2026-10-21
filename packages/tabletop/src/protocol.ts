/**
 * The wire protocol between a room and its screens. It knows nothing about
 * any particular game: game moves travel as an opaque `intent`, and the
 * game's own state travels as `game` inside a view.
 */

/** What a phone or a board sends. */
export type ClientEnvelope<Intent> =
  /** Take a seat, or take your old seat back with its token. */
  | { t: 'join'; code: string; name: string; seatToken?: string }
  /** Connect a shared screen. It gets only the public view and has no controls. */
  | { t: 'board'; code: string }
  | { t: 'addAi' }
  | { t: 'start' }
  /** Make this seat's one choice from the game's list, in the lobby. */
  | { t: 'pick'; pick: string }
  | { t: 'intent'; intent: Intent }
  | { t: 'chat'; text: string; to?: string }
  | { t: 'emote'; emote: string }
  | { t: 'ping'; clientTime: number };

/** What the room sends to one screen. */
export type ServerEnvelope<GameView> =
  | { t: 'welcome'; code: string; role: 'player' | 'board'; seatId: string | null; seatToken: string | null }
  | { t: 'view'; view: TableView<GameView> }
  | { t: 'chat'; message: ChatMessage }
  | { t: 'emote'; from: string; emote: string }
  | { t: 'pong'; clientTime: number; serverTime: number }
  | { t: 'error'; message: string };

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
