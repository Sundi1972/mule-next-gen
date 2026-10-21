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
  /** True when the player started development short of Food: less time to build. */
  hungry: boolean;
  /** Seconds of development time this month, set when development starts. */
  devSeconds: number;
  /** True when sickness cost development time this month (no Medicine to cure it). */
  sick: boolean;
  /** True once the player has gone to the pub: their development turn is over. */
  doneDeveloping: boolean;
  /** Indices of tiles whose ground this player has analysed. Private to them. */
  analysed: number[];
  /** Free plots chosen for a geo drone this planning phase, analysed when the land grant starts. */
  droneOrder: number[];
}

export type Phase =
  | 'planning'
  | 'landGrant'
  | 'development'
  | 'production'
  | 'auction'
  | 'upkeep'
  | 'gameOver';

export interface Store {
  stock: Stock;
  mules: number;
  /** Money the colony store (the colony fund) can spend. */
  fund: number;
  /** Colony reference price for each good, drifting toward recent trade. */
  refPrice: Stock;
  /** Off-world price for each good; sets the export floor and import cap. */
  offWorld: Stock;
  /** Imports ordered this month, delivered at the start of next month. */
  pendingImports: Stock;
}

/** The land grant: free plots light up one at a time, in a random order each sweep. */
export interface Grant {
  /** Tile indices in the order they light up this sweep. */
  order: number[];
  /** Position of the lit plot in `order`. */
  step: number;
  sweep: number;
}

export interface MonthReport {
  month: number;
  produced: Record<string, Stock>;
  prices: Stock;
  shortages: Good[];
  /** MULEs left in the store after development. */
  storeMules: number;
  /** Colony pollution points each player caused this month. */
  pollutionBy: Record<string, number>;
  /** The colony air gauge after production. */
  air: number;
}

export interface GameState {
  seed: number;
  month: number;
  maxMonths: number;
  phase: Phase;
  width: number;
  height: number;
  tiles: Tile[];
  players: Player[];
  store: Store;
  colonists: number;
  /** The colony's air pollution gauge, 0 to 100. */
  air: number;
  grant: Grant | null;
  /** Month in which the last free plot was claimed, if it happened. */
  landRanOutMonth: number | null;
  history: MonthReport[];
}
