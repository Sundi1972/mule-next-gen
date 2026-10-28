export const GROWN_GOODS = ['food', 'water', 'energy'] as const;
export const MINED_GOODS = ['smithore', 'crystite', 'rareEarth'] as const;
export const RAW_GOODS = [...GROWN_GOODS, ...MINED_GOODS] as const;
export const PROCESSED_GOODS = ['alloy', 'electronics', 'medicine'] as const;
export const GOODS = [...RAW_GOODS, ...PROCESSED_GOODS] as const;

export type GrownGood = (typeof GROWN_GOODS)[number];
export type MinedGood = (typeof MINED_GOODS)[number];
export type RawGood = (typeof RAW_GOODS)[number];
export type ProcessedGood = (typeof PROCESSED_GOODS)[number];
export type Good = (typeof GOODS)[number];

/** A quantity of every good. */
export type Stock = Record<Good, number>;

export type Terrain =
  | 'river'
  | 'plains'
  | 'hills'
  | 'mountains'
  | 'forest'
  | 'swamp'
  | 'desert'
  | 'tundra'
  | 'ice'
  | 'lake'
  | 'volcanic'
  | 'crater'
  | 'store';

/** Hidden hazard traits. Yield comes from the ground rating, not from traits. */
export type TileTrait =
  | 'bedrock'
  | 'sheltered'
  | 'hotSpring'
  | 'thinVein'
  | 'toxic'
  | 'unstable'
  | 'infested'
  | 'floodPlain';

export const SPECIES = ['zipwing', 'bramblet', 'gearling', 'mollox', 'glimmer', 'quibbit'] as const;
export type Species = (typeof SPECIES)[number];

/**
 * What a MULE on a plot has been outfitted to do: make a good, or stand as a
 * green belt that makes nothing and cleans the air around it.
 */
export type Outfit = Good | 'greenBelt';

/**
 * The real rating of a plot for each raw good, hidden until a geo analysis.
 * Grown goods are rated -2 to +3, mined goods 0 to 4.
 */
export type Ground = Record<RawGood, number>;

export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  /** 1 to 3 for mountains, 0 otherwise. Only for drawing: yield comes from the ground. */
  peaks: number;
  ground: Ground;
  traits: TileTrait[];
  owner: string | null;
  outfit: Outfit | null;
  /** Pollution on this plot: 0 clean, 1 dusty, 2 polluted, 3 toxic. */
  pollution: number;
  /** A filter halves this plot's colony pollution and stops it spreading. */
  filter: boolean;
  /** Months in a row this plot's current outfit has run. Factories gain from experience. */
  runMonths: number;
  /** A special field on this plot, placed with the map or, for a meteor crater, formed in play; absent on most plots. */
  special?: SpecialField;
}

export type SpecialKind = 'ruins' | 'crystalCavern' | 'geyser' | 'oasis' | 'relic' | 'meteorCrater';

export interface SpecialField {
  kind: SpecialKind;
  /** Ruins only: the good its salvage pays, drawn when the map is made. */
  salvage?: 'alloy' | 'electronics';
}

export interface Player {
  id: string;
  name: string;
  isAi: boolean;
  species: Species;
  money: number;
  stock: Stock;
  /** MULEs bought but not yet installed, with their outfit if any. */
  carriedMule: Outfit | 'empty' | null;
  reputation: number;
  /** Plots claimed in the current land grant. */
  claimsThisGrant: number;
  /** The player pressed Done in the current land grant ("Done with land"): they claim no more this month. */
  doneWithLand: boolean;
  /** True when the player started development short of Food: less time to build. */
  hungry: boolean;
  /** Seconds of development time this month, set when development starts. */
  devSeconds: number;
  /** True when sickness cost development time this month (no Medicine to cure it). */
  sick: boolean;
  /** True once the player has gone to the pub: their development turn is over. */
  doneDeveloping: boolean;
  /** True once the player has installed a MULE in this development turn, so a reloaded phone still knows. */
  installedThisTurn: boolean;
  /** Indices of tiles whose ground this player has analysed. Private to them. */
  analysed: number[];
  /** Free plots chosen for a geo drone this planning phase, analysed when the land grant starts. */
  droneOrder: number[];
}

export type Phase =
  | 'planning'
  | 'landGrant'
  | 'landAuction'
  | 'development'
  | 'production'
  | 'auction'
  | 'upkeep'
  | 'gameOver';

export interface Store {
  stock: Stock;
  mules: number;
  /** MULEs in the corral when development started, to see whether it sold out. */
  mulesAtStart: number;
  /** Multiplies the MULE price: up after a sell-out, down after a surplus. */
  muleFactor: number;
  /** The store's own working money. Never the colony fund. */
  capital: number;
  /** The price the store posts this month for each good; its quotes are this plus and minus the spread. */
  posted: Stock;
  /** Reference price for each good: the price at normal supply, learning from trades between players. */
  refPrice: Stock;
  /** Off-world price for each good: what the export ship pays for its first unit. */
  offWorld: Stock;
}

/** The colony government's money, filled only by taxes, fines and donations. */
export interface Treasury {
  money: number;
  salesTax: number;
  /** Taxes each player has paid in during the game. */
  paid: Record<string, number>;
}

/** The export ship: its wishlist is announced the month before it calls, and its hold fills as it buys. */
export interface ExportShip {
  arrives: number;
  goods: Good[];
  /** Units of each wishlist good it still wants. */
  hold: Partial<Stock>;
  /** Units of each good it has already bought on this call. */
  bought: Partial<Stock>;
}

/** The land grant: free plots light up one at a time, in reading order each sweep. */
export interface Grant {
  /** Tile indices in the order they light up this sweep. */
  order: number[];
  /** Position of the lit plot in `order`. */
  step: number;
  sweep: number;
}

export interface MonthReport {
  month: number;
  /** Each player's stock just before production, for the auction's status screen. */
  before: Record<string, Stock>;
  produced: Record<string, Stock>;
  prices: Stock;
  /** Goods the store ran out of before its colonists had enough. */
  shortages: Good[];
  /** MULEs left in the store after development. */
  storeMules: number;
  /** Colony pollution points each player caused this month. */
  pollutionBy: Record<string, number>;
  /** The colony air gauge after production. */
  air: number;
  /** What a MULE cost this month, and whether the corral sold out. */
  mulePrice: number;
  corralSoldOut: boolean;
  storeCapital: number;
  colonyFund: number;
  /** Colonists short of Food or Water this month. */
  colonistsHungry: boolean;
  /** The production events that fired this month (none in most months). Absent in older reports. */
  events?: MonthEvent[];
  /** Events announced ahead of time. Absent in older reports. */
  warnings?: EventWarning[];
  /** Every working plot's output, part by part. Absent in older reports. */
  lines?: ProductionLine[];
}

export type EventKey =
  | 'dustStorm'
  | 'drought'
  | 'acidRain'
  | 'solarFlare'
  | 'cometPass'
  | 'flood'
  | 'volcanicAsh'
  | 'pestSwarm'
  | 'wildfire'
  | 'bumperHarvest';

/** How the screens animate an event; several events share a kind. */
export type EventKind = 'storm' | 'drought' | 'flare' | 'comet' | 'flood' | 'quake' | 'blight' | 'fire' | 'bounty';

export interface MonthEvent {
  key: EventKey;
  kind: EventKind;
  /** Two to four words, e.g. "Dust storm". */
  title: string;
  /** One plain sentence of the effect. */
  line: string;
  scope: 'colony' | 'local' | 'personal';
  /** Where the animation starts: an edge point for a colony sweep, the first plot otherwise. */
  origin: { x: number; y: number };
  /** For a colony sweep, the map edge it comes in from. */
  direction?: 'n' | 'e' | 's' | 'w';
  /** Each plot hit, in the order the event reached it, and how much its output changed. */
  plots: { index: number; order: number; good: Good; delta: number }[];
  /** For a personal event, the player whose land it started on. */
  player?: string;
  sign: 'good' | 'bad' | 'mixed';
  when: 'afterProduction';
}

export interface EventWarning {
  key: EventKey;
  title: string;
  line: string;
  arrivesMonth: number;
  visibility: 'public' | 'observatory';
}

export interface ProductionLine {
  tile: number;
  good: Good;
  made: number;
  /** What made up the output, in order; the deltas sum to `made`. */
  parts: {
    why: 'ground' | 'trait' | 'species' | 'cluster' | 'pollution' | 'floor' | 'noEnergy' | 'noWater' | 'event' | 'factory' | 'special';
    delta: number;
    event?: EventKey;
  }[];
}

export interface GameState {
  /** Set on a what-if copy (an AI's look-ahead): no production event and no colony lot is ever rolled on it. */
  whatIf?: true;
  seed: number;
  month: number;
  maxMonths: number;
  phase: Phase;
  width: number;
  height: number;
  tiles: Tile[];
  players: Player[];
  store: Store;
  treasury: Treasury;
  ship: ExportShip;
  colonists: number;
  /** The colony's air pollution gauge, 0 to 100. */
  air: number;
  grant: Grant | null;
  /** Month in which the last free plot was claimed, if it happened. */
  landRanOutMonth: number | null;
  history: MonthReport[];
  /** The live goods auction, while the auction phase runs. */
  auction: LiveAuction | null;
  /** This month's lots, in listing order. Made in planning, cleared when the land auction ends. */
  listings: Listing[];
  /** The live land auction, while the landAuction phase runs. */
  landAuction: LandAuction | null;
  /**
   * Offices, elections and the Governor's tax; null when the host switched politics off.
   * Written only by politics.ts, which replaces the object on every write: re-read it, don't hold a reference.
   */
  politics: Politics | null;
}

export type Office = 'governor' | 'sheriff';

/** Why an office went to its winner, as the ceremony shows it. */
export type ElectionHow = 'votes' | 'unopposed' | 'appointed' | 'baron' | 'land' | 'lot';

/**
 * Whether a player may run for an office now, or why not. Running for the other office is no refusal: it moves the
 * candidacy. 'notPlanning': outside the planning phase. 'notElected': the office is not in POLITICS.offices.
 */
export type CanRun = true | 'notPlanning' | 'closed' | 'termLimit' | 'notElected';

/** A Governor candidate's tax promise, in whole percent for a cap. See WS7 spec RULE-10. */
export type TaxPromise = { kind: 'cap'; percent: number } | { kind: 'lower' } | { kind: 'hold' };

export interface OfficeResult {
  winner: string;
  how: ElectionHow;
  /** Every candidate's weighted votes, highest first. Never who voted for whom. */
  tallies: { id: string; votes: number }[];
}

/** One entry per office elected, keyed by POLITICS.offices. */
export type ElectionResult = Partial<Record<Office, OfficeResult>>;

/**
 * The beats of one office in the ceremony, in the order they come: the office's title, its candidates popping in,
 * the vote blocks growing, a tie stamped (only when one was broken), the winner, and the office's end.
 */
export type CeremonyBeat = 'title' | 'candidates' | 'bars' | 'tie' | 'winner' | 'end';

/** One election, announce → ballot → ceremony → over, inside a planning phase. Only the ceremony runs on a clock. */
export interface Election {
  stage: 'announce' | 'ballot' | 'ceremony' | 'over';
  /** The ceremony's one show clock, from 0 when the ballot closes, and its whole length; null outside the ceremony. */
  ceremony: { elapsedMs: number; totalMs: number } | null;
  /** Copied from Politics when the ballot opens; empty until then. */
  candidates: Record<Office, string[]>;
  /** Each Governor candidate's promise, copied with the candidacy. */
  promises: Record<string, TaxPromise>;
  /** Secret: each voter's choice per office. Only the voter may see their own. */
  ballots: Record<string, Partial<Record<Office, string>>>;
  /** Players who pressed Done in this stage. */
  done: string[];
  /** Fixed when the ballot closes; the ceremony shows it office by office. */
  result: ElectionResult | null;
}

export interface Politics {
  governor: string | null;
  sheriff: string | null;
  /** Month the current terms began. */
  termStart: number;
  /** Terms served per player, in either office; a term counts once it starts. */
  terms: Record<string, number>;
  /** The sitting Governor and how many terms in a row they have served, for the two-in-a-row rule. */
  governorRun: { id: string; terms: number } | null;
  /** The Land Baron, fixed when planning opens each month. */
  baron: string | null;
  /** treasury.salesTax when this month's planning opened: the Governor's bounds are around it. */
  taxAtStart: number;
  /** Who runs for each office in the next election, public, from declaration until that election's ballot opens. */
  candidates: Record<Office, string[]>;
  /** Each Governor candidate's promise, public like the candidacy and dropped with it. */
  promises: Record<string, TaxPromise>;
  /** The sitting Governor's promise, held for the term; null when they were appointed. */
  promise: TaxPromise | null;
  /** This month's election, live or just finished; null in a month without one. */
  election: Election | null;
}

export type AuctionRole = 'buyer' | 'seller';
/** A player's side for one lot: buying, selling, or sitting it out. */
export type AuctionSide = AuctionRole | 'pass';

/** One player at a walk auction. On the board, a buyer's height is their bid and a seller's their ask. */
export interface Walker {
  id: string;
  side: AuctionSide;
  /** Price units, not rounded. */
  price: number;
  /** Holding up (1), down (-1) or standing (0). */
  dir: -1 | 0 | 1;
  /** Board time (ms into the walk) when their rounded price last changed: who got there first. */
  since: number;
}

/** A buyer and a seller, either of them perhaps a house (the store, the ship), exchanging units right now. */
export interface Deal {
  buyer: string;
  seller: string;
  price: number;
  /** Units this deal has moved since the pair met. Each one goes faster. */
  units: number;
  /** Ms towards the next unit. */
  progress: number;
}

/**
 * A walk-auction board, generic over what is sold: a good at the goods
 * auction, later a plot or a MULE at the land auction. What is sold, who
 * holds it and the house lines come from a WalkMarket each step.
 */
export interface WalkBoard {
  /** Ms left on the walk clock. */
  clockMs: number;
  /** Ms since the walk started, and steps taken, for tie-breaks and seeded AI pauses. */
  elapsed: number;
  ticks: number;
  /** The board's starting range: sellers start at the top, buyers at the bottom. */
  lo: number;
  hi: number;
  /** Price units per second. */
  speed: number;
  walkers: Walker[];
  deals: Deal[];
  /** Units each player got in a house's turns, keyed house:player, so a house serves one per player per round. */
  turns: Record<string, number>;
  /** Units sold on this board so far. */
  units: number;
  /** Units and value traded between players: the market learns only from these. */
  between: { units: number; value: number };
}

/** One player's line on the status screen before a good comes up. */
export interface StatusRow {
  id: string;
  /** Before production. */
  had: number;
  /** Burnt in production: Energy for plots, factory inputs. */
  used: number;
  made: number;
  now: number;
  /** What they need for next month. */
  need: number;
  /** What would spoil or overflow the depot at month end if they kept everything over their need. */
  spoils: number;
}

/** Why a good was skipped without a screen of its own. */
export type SkipReason = 'nobody has any' | 'nobody buys' | 'nobody trading';

/** The live goods auction: goods one at a time, each with a status screen and then a walk. */
export interface LiveAuction extends WalkBoard {
  /** The status screen's or the walk's clock, by stage. */
  clockMs: number;
  /** Goods still to come after the current one. */
  queue: Good[];
  good: Good | null;
  stage: 'status' | 'walk' | 'over';
  /** Store prices for this good, fixed when it comes up. Whether the store trades at them depends on its stock and budget. */
  storeBuy: number;
  storeSell: number;
  /** Units the store will still buy of this good, from its demand and its budget. */
  storeBudget: number;
  /** Players who pressed Done in this stage. */
  done: string[];
  status: StatusRow[];
  /** Goods skipped since the last one that came up, shown as one line. */
  skipped: { good: Good; reason: SkipReason }[];
}

/** What is for sale: a plot with whatever stands on it, or the MULE off one of the seller's plots. */
export type LotItem = { kind: 'plot'; x: number; y: number } | { kind: 'mule'; x: number; y: number; outfit: Outfit };

/** One lot for the land auction, public from the moment it is listed in planning. */
export interface Listing {
  id: string;
  /** A player's id, or 'colony' for a plot the colony puts up: its proceeds go to store capital. */
  seller: string;
  item: LotItem;
  minimum: number;
  /** If no bid reaches the minimum: the store buys it at storePays, or the seller keeps it. */
  unsold: 'store' | 'keep';
  /** Fixed when the lot is listed. */
  storePays: number;
}

export type LotResult = { kind: 'sold'; buyer: string; price: number } | { kind: 'store'; price: number } | { kind: 'kept' };

/**
 * The live land auction: one lot at a time, each with an intro, a walk and
 * a result. Only buyers walk; the highest bid at or over the minimum wins at
 * the bell. clockMs is the intro's, the walk's or the result's clock, by stage.
 */
export interface LandAuction extends WalkBoard {
  /** Lots still to come after the current one. */
  queue: Listing[];
  lot: Listing | null;
  stage: 'intro' | 'walk' | 'result' | 'over';
  /** Players who pressed Done in this stage. */
  done: string[];
  /** Players who can't bid on this lot, and why: too little money, or already leading a MULE. */
  aside: Record<string, 'money' | 'mule'>;
  /** The lot's outcome, from the bell until the next lot comes up. */
  result: LotResult | null;
  /** This lot's place in the month's line-up, from 1, and the line-up's length. */
  number: number;
  count: number;
  /** True once this lot's leading bid has passed hi and the walk sped up. */
  fast: boolean;
  /** Ms the soft close has put back on this lot's walk clock. */
  addedMs: number;
  /** The last buyer to lead this lot, kept while nobody reaches the minimum, so only a change of hands counts as an overtake. */
  leaderId: string | null;
}
