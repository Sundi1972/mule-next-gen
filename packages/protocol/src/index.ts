import type { Good, Outfit, Phase, Stock, Terrain, TileTrait } from '@mule/engine';
export type { ChatMessage, ClientEnvelope, ServerEnvelope, TableView } from '@tabletop/core/protocol';

/**
 * The M.U.L.E. part of the protocol. Rooms, seats, boards, chat and clock
 * sync come from @tabletop/core; these are the game moves a phone sends and
 * the game view each screen receives.
 */
export type MuleIntent =
  | { type: 'ready' }
  | { type: 'claim'; x: number; y: number }
  | { type: 'buyMule' }
  | { type: 'outfit'; good: Good }
  | { type: 'install'; x: number; y: number }
  | { type: 'setOrder'; good: Good; side: 'buy' | 'sell' | 'none'; quantity: number; limit: number };

export const EMOTES = ['Deal?', 'Nice!', 'Traitor!', 'Ha!', 'Help!'] as const;
export type Emote = (typeof EMOTES)[number];

export interface TileView {
  x: number;
  y: number;
  terrain: Terrain;
  peaks: number;
  owner: string | null;
  outfit: Outfit | null;
  /** Only sent to the tile's owner: what lies under their own land. */
  crystite?: number;
  traits?: TileTrait[];
}

export interface PlayerView {
  id: string;
  name: string;
  isAi: boolean;
  color: string;
  money: number;
  plots: number;
  ready: boolean;
}

export interface MyView {
  id: string;
  stock: Stock;
  carriedMule: Outfit | 'empty' | null;
  claimsLeft: number;
  hungry: boolean;
  orders: Partial<Record<Good, { side: 'buy' | 'sell'; quantity: number; limit: number }>>;
}

export interface MarketRow {
  good: Good;
  price: number;
  storeBuys: number;
  storeSells: number;
  storeStock: number;
  /** Months of demand the colony store holds. */
  cover: number;
}

/** One screen's view of the game: a player's private view, or the public one for a board. */
export interface MuleView {
  finished: boolean;
  month: number;
  maxMonths: number;
  phase: Phase;
  /** Epoch ms when the current phase ends, or null if it waits for players. */
  phaseEndsAt: number | null;
  width: number;
  height: number;
  tiles: TileView[];
  players: PlayerView[];
  me: MyView | null;
  market: MarketRow[];
  storeMules: number;
  mulePrice: number;
  colonists: number;
  news: string[];
  scores: { id: string; score: number }[] | null;
}

export const PLAYER_COLORS = ['#e4572e', '#3a86ff', '#2bb673', '#f2a541', '#9b5de5', '#00b4d8'];
