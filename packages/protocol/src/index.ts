import type { AuctionSide, CanRun, CeremonyStep, DevPlace, Election, EventKey, EventKind, Good, Ground, MonthEvent, Office, OfficeResult, Outfit, Phase, ScoreParts, SkipReason, SpecialField, Species, StatusRow, Stock, TaxPromise, Terrain, TileTrait, VoteWeight } from '@mule/engine';
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
  | { type: 'unlist'; id: string }
  /** Planning, until the election's ballot opens: run for an office (moving any candidacy for the other one); null withdraws. A Governor run needs a promise (RULE-10). */
  | { type: 'run'; office: Office | null; promise?: TaxPromise }
  /** Election, ballot: cast or change your secret vote for a contested office; null clears it. */
  | { type: 'vote'; office: Office; candidate: string | null }
  /** Planning, after the election: the Governor sets the sales tax in whole percent. */
  | { type: 'setTax'; percent: number }
  /** Planning: the host ends planning with players not yet Ready; in the election's announce or ballot, it goes on without players not Done. */
  | { type: 'continue' };

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
  /** The plot's special field, while it lasts. Public: every viewer, phone and TV, sees it; only the ground is private. */
  special?: SpecialField;
}

export interface PlayerView {
  id: string;
  name: string;
  isAi: boolean;
  color: string;
  /** The player's colour index, the one their seat chose in the lobby. */
  slot: number;
  species: Species;
  money: number;
  plots: number;
  ready: boolean;
  /** True once they went to the pub this development phase. */
  doneDeveloping: boolean;
  /** Where their colonist is in development, public like every place; null outside development. */
  colonist: ColonistView | null;
  /** How hunger and sickness slow this colonist, during development; null otherwise. Public: every screen shows it. */
  condition: {
    /** 0..1 of the month's Food held (engine foodShare). */
    foodShare: number;
    sick: boolean;
    /** Why it is sick (engine playerEventReason): the air, its own pollution, or plain chance; null when well. */
    sickBecause: 'air' | 'pollution' | 'chance' | null;
    /** hunger × sickness, 1 is normal; species is not in it (engine pace() adds it). */
    conditionPace: number;
  } | null;
}

/** A colonist in development. Times are the server's epoch ms, like phaseEndsAt. */
export interface ColonistView {
  /** Where it stands, or where it is walking to. */
  at: DevPlace;
  walk: { from: DevPlace; startedAt: number; arrivesAt: number } | null;
  /** While it stands on a plot for a geo analysis: when the analysis is done. */
  assayUntil: number | null;
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
  /** What this player needs of each good this month: the engine's monthNeeds. */
  monthNeeds: Stock;
  /** Epoch ms when the one development clock runs out, the same for every seat; null outside development. */
  devEndsAt: number | null;
  /** Seconds of development time this player got this month. */
  devSeconds: number;
  /** What this player's plots made in the latest production, or null before the first harvest. */
  produced: Stock | null;
  /** What this player pays for a MULE and for each outfit. */
  mulePrice: number;
  outfitCosts: Record<Outfit, number>;
  /** Free plots chosen for the geo drone this month. */
  droneOrder: { x: number; y: number }[];
  /** This player's own side of the election; null when the game plays without politics. */
  politics: MyPoliticsView | null;
  /** True once this player has installed a MULE in this development turn, and until their next one starts. */
  installedThisTurn: boolean;
}

/** Only on the owner's phone: their candidacy, their secret ballot, and whether they may run now. */
export interface MyPoliticsView {
  running: Office | null;
  ballot: Partial<Record<Office, string>>;
  canRun: Record<Office, CanRun>;
}

/** One office's result as far as the ceremony has shown it: the totals from its bars step, the winner and how from its winner step. */
export type OfficeReveal = Pick<OfficeResult, 'tallies'> & Partial<Pick<OfficeResult, 'winner' | 'how'>>;

/** This month's election as every screen sees it: who runs and who has voted, never for whom. */
export interface ElectionView {
  stage: Election['stage'];
  /** The office the ceremony shows and its step, with the step's clock in game seconds; null outside the ceremony. */
  ceremony: { office: Office; step: CeremonyStep; seconds: number; total: number } | null;
  /** Empty until the ballot opens: until then the candidacy is Politics'. */
  candidates: Record<Office, string[]>;
  /** Each Governor candidate's tax promise, public like the candidacy. */
  promises: Record<string, TaxPromise>;
  /** Players with a ballot in, never for whom. */
  voted: string[];
  /** Players who are Done in announce or the ballot: they pressed Done, or their ballot covers every contested office. */
  done: string[];
  /** Players announce or the ballot still waits for; empty from the ceremony on. */
  waitingFor: string[];
  /** The offices the ceremony has reached, every screen in the same step. */
  result: Partial<Record<Office, OfficeReveal>>;
}

/** The colony's offices, tax and vote weights, public on every screen. */
export interface PoliticsView {
  governor: string | null;
  sheriff: string | null;
  /** The months the sitting officeholders serve, or null before anyone holds office. */
  term: [number, number] | null;
  /** The next election's month, or null when the game ends first. */
  next: number | null;
  /** The Land Baron, fixed when planning opened. */
  baron: string | null;
  /** The sales tax in whole percent: now, when the month's planning opened, and the range the Governor may set. */
  tax: { percent: number; start: number; low: number; high: number };
  /** The colony fund the offices are paid from. */
  fund: number;
  /** What each office is paid at upkeep, as far as the fund reaches. */
  pay: { governor: number; sheriff: number };
  /** Every player's votes, part by part. */
  weights: { id: string; votes: number; parts: VoteWeight['parts'] }[];
  /** Who runs for each office in the next election, until its ballot opens. */
  candidates: Record<Office, string[]>;
  /** Each Governor candidate's tax promise, public like the candidacy. */
  promises: Record<string, TaxPromise>;
  /** This month's election, or null in a month without one. */
  election: ElectionView | null;
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
  /** Their stock of the good up now, live as units trade; public like the status table. */
  units: number;
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
  stage: 'status' | 'walk';
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
  /** Units the store will sell of this good: its stock less the colonists' Food and Water reserve. */
  storeForSale: number;
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
export interface LotWalkerView extends Omit<WalkerView, 'units'> {
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
  /** How long the production phase was scheduled to run, in ms; the show's timeline stretches over it. */
  lengthMs: number;
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
  /** Offices, tax, vote weights and the election; null when the game plays without politics. */
  politics: PoliticsView | null;
}

export const PLAYER_COLORS = ['#e4572e', '#3a86ff', '#2bb673', '#f2a541', '#9b5de5', '#00b4d8'];
