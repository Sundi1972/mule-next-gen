import type { Good, ProcessedGood, Stock, Terrain, TileTrait } from './types.js';

/**
 * Every balancing number lives here, so playtests and the simulator can tune
 * the game without touching rules code. Values follow the design doc's
 * "Starting numbers" table.
 */

export interface GoodConfig {
  refPrice: number;
  /** How strongly price reacts to low cover (k in the price formula). */
  sensitivity: number;
  /** Share lost each month without suitable storage. */
  spoilage: number;
}

export const GOOD_CONFIG: Record<Good, GoodConfig> = {
  food: { refPrice: 30, sensitivity: 1.5, spoilage: 0.5 },
  water: { refPrice: 20, sensitivity: 1.5, spoilage: 0.05 },
  energy: { refPrice: 25, sensitivity: 1.2, spoilage: 0.25 },
  smithore: { refPrice: 50, sensitivity: 0.8, spoilage: 0 },
  crystite: { refPrice: 100, sensitivity: 0.5, spoilage: 0 },
  alloy: { refPrice: 90, sensitivity: 0.8, spoilage: 0 },
  electronics: { refPrice: 220, sensitivity: 0.5, spoilage: 0 },
  medicine: { refPrice: 120, sensitivity: 1.0, spoilage: 0.2 },
};

export const PRICE = {
  /** Months of demand the store aims to hold. */
  targetCover: 2,
  minCover: 0.1,
  /** Export parity: what the export ship pays, as a share of off-world price. */
  exportFactor: 0.7,
  /** Import parity: what an import costs, as a multiple of off-world price. */
  importFactor: 1.6,
  /** The store sells this much above and buys this much below the colony price. */
  storeSpread: 0.1,
  /** In a crisis, when the colony can't pay for imports, prices can still rise only this far above the import price. */
  crisisFactor: 2.5,
  /** How fast the reference price follows the last clearing price (0..1). */
  refDrift: 0.25,
};

/** Factory recipes: inputs consumed per unit of output. */
export const RECIPES: Record<ProcessedGood, { inputs: Partial<Stock>; output: number }> = {
  alloy: { inputs: { smithore: 2, energy: 1 }, output: 2 },
  electronics: { inputs: { crystite: 1, alloy: 1, energy: 1 }, output: 1 },
  medicine: { inputs: { food: 1, water: 1, energy: 1 }, output: 2 },
};

/** Base output of a raw-goods MULE before terrain, adjacency and traits. */
export const BASE_OUTPUT = 1;

/** Output bonus per terrain for each raw good. Mountains add peaks for Smithore. */
export const TERRAIN_BONUS: Record<Terrain, Partial<Record<Good, number>>> = {
  river: { food: 3, water: 1, smithore: -1 },
  plains: { energy: 2, food: 1 },
  hills: { smithore: 2, food: -1 },
  mountains: { smithore: 1, food: -1, energy: -1 },
  forest: { food: 1, energy: -1 },
  swamp: { food: -1, smithore: -1 },
  desert: { energy: 3, water: -1, food: -1 },
  ice: { water: 3, food: -1 },
  lake: { water: 3, food: 1, smithore: -1 },
  volcanic: { energy: 3, food: -1 },
  crater: { food: -1 },
  wasteland: { food: -1, water: -1, energy: -1, smithore: -1 },
  store: {},
};

/** Factory bonus by terrain (Medicine likes forest and swamp). */
export const FACTORY_TERRAIN_BONUS: Partial<Record<Terrain, Partial<Record<ProcessedGood, number>>>> = {
  forest: { medicine: 1 },
  swamp: { medicine: 2 },
};

export const TRAIT_EFFECT: Record<TileTrait, Partial<Record<Good, number>>> = {
  fertile: { food: 1 },
  richVein: { smithore: 2 },
  spring: { water: 1 },
  bedrock: {},
  sheltered: {},
  hotSpring: { energy: 2, water: -1 },
  thinVein: { smithore: -1 },
  toxic: { food: -2 },
  unstable: {},
};

export const ADJACENCY = {
  /** Bonus when at least one own neighbour produces the same good. */
  neighbour: 1,
  /** Bonus instead, when the connected cluster has this many plots or more. */
  clusterSize: 4,
  cluster: 2,
};

export const UPKEEP = {
  /** Per player per month. */
  food: 3,
  water: 2,
  /** Per working plot per month (factories and MULEs). */
  energyPerPlot: 1,
  /** Colonists need 1 Food and 1 Water per this many colonists. */
  colonistsPerUnit: 10,
  /** Units of each good a player's home depot holds. */
  depotCapacity: 10,
};

export const START = {
  money: 1000,
  colonists: 100,
  storeMules: 6,
  storeFund: 3000,
  storeStock: { food: 16, water: 12, energy: 16, smithore: 8, crystite: 0, alloy: 8, electronics: 0, medicine: 4 } satisfies Stock,
};

export const MULE = {
  /** Base price of an empty MULE at the store. */
  price: 100,
  /** Alloy the store needs to build one MULE. */
  alloyPerMule: 1,
  /** The store's own small smelter: Smithore per unit of Alloy (factories are more efficient). */
  storeSmithorePerAlloy: 2,
  outfitCost: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, alloy: 125, electronics: 150, medicine: 125 } satisfies Stock,
};

/** Map size by player count, from the design doc. */
export function mapSize(players: number): { width: number; height: number } {
  if (players <= 3) return { width: 13, height: 7 };
  if (players === 4) return { width: 15, height: 9 };
  return { width: 19, height: 11 };
}

export const GAME = {
  maxMonths: 12,
  /** Months the game continues after the last free plot is claimed. */
  landRushMonths: 3,
  claimsPerGrant: 2,
  /** The export ship calls every this many months. */
  exportShipEvery: 3,
};
