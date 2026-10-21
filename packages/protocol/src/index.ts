import type { AuctionSide, Good, Ground, Outfit, Phase, SkipReason, Species, StatusRow, Stock, Terrain, TileTrait } from '@mule/engine';
export type { ChatMessage, ClientEnvelope, ServerEnvelope, TableView } from '@tabletop/core/protocol';

/**
 * The M.U.L.E. part of the protocol. Rooms, seats, boards, chat and clock
 * sync come from @tabletop/core; these are the game moves a phone sends and
 * the game view each screen receives.
 */
export type MuleIntent =
  /** Ready to move on; at the auction, done with this stage of the current good. */
  | { type: 'ready' }
  /** Planning: send the geo drone over one or two free plots. */
  | { type: 'drone'; plots: { x: number; y: number }[] }
  /** Land grant: claim the plot that is lit. The coordinates say which plot the player saw lit. */
  | { type: 'claim'; x: number; y: number }
  | { type: 'buyMule' }
  | { type: 'outfit'; outfit: Outfit }
  | { type: 'install'; x: number; y: number }
  /** Development: analyse any plot's ground. Costs development time. */
  | { type: 'analyse'; x: number; y: number }
  /** Development: fit a filter to one of your plots, paid in Alloy. */
  | { type: 'filter'; x: number; y: number }
  /** Development: end your turn at the pub for cash. */
  | { type: 'pub' }
  /** Auction: buy, sell or pass on the good that is up. During the walk a switch jumps you to the new side's start edge. */
  | { type: 'declare'; side: AuctionSide }
  /** Auction, during the walk: hold up, hold down, or let go. */
  | { type: 'walk'; dir: 'up' | 'down' | 'stop' };

export const EMOTES = ['Deal?', 'Nice!', 'Traitor!', 'Ha!', 'Help!'] as const;
export type Emote = (typeof EMOTES)[number];

export interface TileView {
  x: number;
  y: number;
  terrain: Terrain;
  peaks: number;
  owner: string | null;
  outfit: Outfit | null;
  /** Plot pollution, 0 clean to 3 toxic. Public: everyone can see the smog. */
  pollution: number;
  filter: boolean;
  /** Only for a player who analysed this plot: its real ground rating per raw good. */
  ground?: Ground;
  /** Only for the plot's owner or a player who analysed it: its hazard traits. */
  traits?: TileTrait[];
}

export interface PlayerView {
  id: string;
  name: string;
  isAi: boolean;
  color: string;
  species: Species;
  money: number;
  plots: number;
  ready: boolean;
  /** True once they went to the pub this development phase. */
  doneDeveloping: boolean;
}

export interface MyView {
  id: string;
  species: Species;
  stock: Stock;
  carriedMule: Outfit | 'empty' | null;
  claimsLeft: number;
  hungry: boolean;
  sick: boolean;
  /** Food and Water this player's household and crew need each month. */
  needs: { food: number; water: number };
  /** Epoch ms when this player's development time runs out, during development. */
  devEndsAt: number | null;
  /** Seconds of development time this player got this month, before analyses. */
  devSeconds: number;
  /** What this player's plots made in the latest production, or null before the first harvest. */
  produced: Stock | null;
  /** What this player pays for a MULE and for each outfit. */
  mulePrice: number;
  outfitCosts: Record<Outfit, number>;
  /** Free plots chosen for the geo drone this month. */
  droneOrder: { x: number; y: number }[];
}

/** A player on the auction board. */
export interface WalkerView {
  id: string;
  /** Pass means off the board for this good. */
  side: AuctionSide;
  /** Their bid or ask, rounded. */
  price: number;
  /** Unrounded, for smooth drawing. */
  at: number;
  dir: -1 | 0 | 1;
  done: boolean;
}

/** Units changing hands right now: between two players, or with the store or the ship ('store', 'ship'). */
export interface DealView {
  buyer: string;
  seller: string;
  price: number;
  units: number;
}

/** The live goods auction, on every screen. */
export interface AuctionView {
  good: Good;
  stage: 'status' | 'declare' | 'walk';
  /** Seconds left on the stage's clock. It runs slower while units change hands. */
  seconds: number;
  /** The stage's full time in seconds, for the draining time bar. */
  total: number;
  /** True while the clock is slowed by a trade. */
  slowed: boolean;
  /** Goods still to come after this one. */
  next: Good[];
  /** What the store pays and charges, or null while it doesn't trade at that line. */
  storeBuys: number | null;
  storeSells: number | null;
  /** What the export ship pays for the next unit, while it is in port and wants this good. */
  shipPays: number | null;
  /** The board's price range: it grows when a walker goes past it. */
  lo: number;
  hi: number;
  /** Walking speed in price units per second. */
  speed: number;
  walkers: WalkerView[];
  deals: DealView[];
  /** Units traded in this good so far. */
  units: number;
  /** The status screen: every player's had, used, made, now, need and spoilage of this good, as in the original. */
  status: StatusRow[];
  /** Goods skipped since the last one that came up, and why, for one line on screen. */
  skipped: { good: Good; reason: SkipReason }[];
}

export interface MarketRow {
  good: Good;
  /** The price the store posted this month. */
  price: number;
  /** What the store pays, or null when it isn't buying. */
  storeBuys: number | null;
  /** What the store charges, or null when it is sold out. */
  storeSells: number | null;
  storeStock: number;
  /** Months of demand the colony's whole supply covers. */
  cover: number;
  /** Next month's expected demand. */
  demand: number;
  /** What the export ship pays for the next unit while in port, or null. */
  shipPays: number | null;
}

export interface ShipView {
  /** The month the ship calls. Its wishlist is public from the month before. */
  arrives: number;
  inPort: boolean;
  /** Goods it wants and how many units it still takes, once announced. */
  wants: Partial<Record<Good, number>> | null;
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
  /** The plot lit in the land grant right now. */
  lit: { x: number; y: number } | null;
  players: PlayerView[];
  me: MyView | null;
  market: MarketRow[];
  storeMules: number;
  mulePrice: number;
  colonists: number;
  /** Colony air gauge 0 to 100 and its band. */
  air: { level: number; band: 'clean' | 'smoggy' | 'toxic' | 'collapse' };
  ship: ShipView;
  /** The colony fund and the sales tax rate. */
  treasury: { money: number; salesTax: number };
  news: string[];
  scores: { id: string; score: number }[] | null;
  /** The live goods auction while it runs. */
  auction: AuctionView | null;
}

export const PLAYER_COLORS = ['#e4572e', '#3a86ff', '#2bb673', '#f2a541', '#9b5de5', '#00b4d8'];
