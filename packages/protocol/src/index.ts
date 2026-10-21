import type { AuctionSide, EventKey, EventKind, Good, Ground, MonthEvent, Outfit, Phase, ScoreParts, SkipReason, Species, StatusRow, Stock, Terrain, TileTrait } from '@mule/engine';
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
  /** Auction, during the walk: hold up, hold down, or let go. The land auction's walk uses it too. */
  | { type: 'walk'; dir: 'up' | 'down' | 'stop' }
  /** Planning: put a plot, or the MULE on one, up for the land auction, with a minimum and what happens if nobody bids it. */
  | { type: 'list'; item: { kind: 'plot' | 'mule'; x: number; y: number }; minimum: number; unsold: 'store' | 'keep' }
  /** Planning: take one of your listings back. */
  | { type: 'unlist'; id: string };

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

/** What is for sale: a plot (with whatever stands on it), or the MULE off one of the seller's plots. */
export type LotItemView = { kind: 'plot'; x: number; y: number } | { kind: 'mule'; x: number; y: number; outfit: Outfit };

/** One listing, public from the moment it is made in planning. */
export interface ListingView {
  id: string;
  /** A player's id, or 'colony' for a plot the colony puts up. */
  seller: string;
  item: LotItemView;
  minimum: number;
  /** If nobody bids the minimum: the store buys it at `storePays`, or the seller keeps it. */
  unsold: 'store' | 'keep';
  storePays: number;
}

/** A buyer on a lot's board. Everyone but the seller, if they can pay the minimum (and, for a MULE, has no MULE in hand). */
export interface LotWalkerView extends WalkerView {
  /** Why a player stands aside, for the names along the bottom. */
  aside?: 'money' | 'mule';
}

export type LotResultView = { kind: 'sold'; buyer: string; price: number } | { kind: 'store'; price: number } | { kind: 'kept' };

/** The land auction while it runs: one lot at a time. */
export interface LandAuctionView {
  lot: ListingView;
  stage: 'intro' | 'walk' | 'result';
  seconds: number;
  total: number;
  /** This lot's place in the month's line-up, from 1. */
  number: number;
  count: number;
  lo: number;
  hi: number;
  speed: number;
  walkers: LotWalkerView[];
  /** The highest bid at or above the minimum, and who holds it: what wins at the bell. */
  leader: { id: string; bid: number } | null;
  result: LotResultView | null;
  next: ListingView[];
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

/** A player's own score, line by line, as their phone receives it at game over. */
export type ScorePartsView = Omit<ScoreParts, 'total'>;

/** A reason a plot made more or less than its ground gives, as a badge on the map. */
export type ProductionReason = 'cluster' | 'species' | 'trait' | 'pollution' | 'noEnergy' | 'noWater';

/** One working plot in the month's production show. Public, like the auction's status table. */
export interface ProductionLineView {
  x: number;
  y: number;
  owner: string;
  good: Good;
  /** Units the plot made before the month's event; an event hit adds its delta on top. */
  made: number;
  /** Its badges: at most two reasons, biggest change first. */
  parts: { why: ProductionReason; delta: number }[];
}

/** The month's event as the map shows it. */
export interface ProductionEventView {
  key: EventKey;
  kind: EventKind;
  title: string;
  line: string;
  sign: MonthEvent['sign'];
  scope: MonthEvent['scope'];
  /** Where it starts: a colony sweep's edge point, otherwise its first plot or its source. */
  origin: { x: number; y: number };
  /** For a colony sweep, the map edge it blows in from. */
  from?: 'n' | 'e' | 's' | 'w';
  /** The plots it hit, in the order it reached them, and how many units each gained or lost. */
  hits: { x: number; y: number; order: number; delta: number }[];
}

/** What every plot made this month and what the month's event did: never anything a player holds. */
export interface ProductionView {
  /** In reading order: row by row, left to right. */
  lines: ProductionLineView[];
  events: ProductionEventView[];
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
  /** At game over; `parts` only on the viewer's own entry, never in the board view (goods are private). */
  scores: { id: string; score: number; parts?: ScorePartsView }[] | null;
  /** The live goods auction while it runs. */
  auction: AuctionView | null;
  /** This month's lots for the land auction, in line-up order. */
  listings: ListingView[];
  /** The month's lot slots: LOTS.maxLotsPerMonth, and how many are taken. */
  lotSlots: { used: number; max: number };
  /** The live land auction while it runs. */
  landAuction: LandAuctionView | null;
  /** The month's production show, during production and upkeep. */
  production: ProductionView | null;
}

export const PLAYER_COLORS = ['#e4572e', '#3a86ff', '#2bb673', '#f2a541', '#9b5de5', '#00b4d8'];
