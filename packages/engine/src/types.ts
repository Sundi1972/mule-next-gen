export const RAW_GOODS = ['food', 'water', 'energy', 'smithore', 'crystite'] as const;
export const PROCESSED_GOODS = ['alloy', 'electronics', 'medicine'] as const;
export const GOODS = [...RAW_GOODS, ...PROCESSED_GOODS] as const;

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
  | 'ice'
  | 'lake'
  | 'volcanic'
  | 'crater'
  | 'wasteland'
  | 'store';

export type TileTrait =
  | 'fertile'
  | 'richVein'
  | 'spring'
  | 'bedrock'
  | 'sheltered'
  | 'hotSpring'
  | 'thinVein'
  | 'toxic'
  | 'unstable';

/** What a MULE on a plot has been outfitted to do. */
export type Outfit = Good;

export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  /** 1 to 3 for mountains, 0 otherwise. */
  peaks: number;
  /** Hidden Crystite richness, 0 to 4. */
  crystite: number;
  traits: TileTrait[];
  owner: string | null;
  outfit: Outfit | null;
}

export interface Player {
  id: string;
  name: string;
  isAi: boolean;
  money: number;
  stock: Stock;
  /** MULEs bought but not yet installed, with their outfit if any. */
  carriedMule: Outfit | 'empty' | null;
  reputation: number;
  /** Plots claimed in the current land grant. */
  claimsThisGrant: number;
  /** True when the player could not pay Food upkeep: shorter development next month. */
  hungry: boolean;
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

export interface MonthReport {
  month: number;
  produced: Record<string, Stock>;
  prices: Stock;
  shortages: Good[];
  /** MULEs left in the store after development. */
  storeMules: number;
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
  /** Month in which the last free plot was claimed, if it happened. */
  landRanOutMonth: number | null;
  history: MonthReport[];
}
