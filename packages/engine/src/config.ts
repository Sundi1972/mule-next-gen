import type { Outfit, GrownGood, Good, MinedGood, ProcessedGood, RawGood, Species, Stock, Terrain, TileTrait } from './types.js';

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
  water: { refPrice: 25, sensitivity: 1.5, spoilage: 0.05 },
  energy: { refPrice: 25, sensitivity: 1.2, spoilage: 0.25 },
  smithore: { refPrice: 50, sensitivity: 1.2, spoilage: 0 },
  crystite: { refPrice: 100, sensitivity: 0.5, spoilage: 0 },
  rareEarth: { refPrice: 60, sensitivity: 0.8, spoilage: 0 },
  alloy: { refPrice: 90, sensitivity: 0.8, spoilage: 0 },
  electronics: { refPrice: 220, sensitivity: 0.5, spoilage: 0 },
  medicine: { refPrice: 120, sensitivity: 1.0, spoilage: 0.2 },
};

export const PRICE = {
  /** Months of demand the store aims to hold. */
  targetCover: 2,
  /** Cover below this counts as this, so an empty shelf still gives a finite target. */
  minCover: 0.25,
  /** Momentum: the posted price moves toward its target by at most this share up or down a month. */
  maxRise: 0.5,
  maxFall: 0.4,
  /** The store sells this much above and buys this much below its posted price. */
  storeSpread: 0.1,
  /** The store fills its shelves up to this many months of demand. */
  storeMaxCover: 3,
  /** The most of its capital the store spends on one good in one month. */
  storeBudgetShare: 0.5,
  /** Share of normal spoilage the store suffers, thanks to its cold store and silos. */
  storeSpoilage: 0.25,
  /** How fast the reference price follows what players pay each other (0..1). */
  refDrift: 0.25,
  /** How fast the reference price drifts back toward the off-world price (0..1). */
  worldPull: 0.1,
};

/**
 * Off-world demand per player per month: what the export ship's buyers take.
 * Food, Water and Energy don't travel well, so only the colony wants them.
 * The colony is self-contained: nothing is imported.
 */
export const EXPORT_DEMAND: Partial<Record<Good, number>> = {
  smithore: 1,
  crystite: 2,
  rareEarth: 0.5,
  alloy: 1,
  electronics: 1,
  medicine: 0.5,
};

/** Factory recipes: inputs consumed per unit of output. */
export const RECIPES: Record<ProcessedGood, { inputs: Partial<Stock>; output: number }> = {
  alloy: { inputs: { smithore: 2, energy: 2 }, output: 2 },
  electronics: { inputs: { rareEarth: 1, alloy: 1, energy: 1 }, output: 1 },
  medicine: { inputs: { food: 1, water: 1, energy: 1 }, output: 2 },
};

/**
 * Production from the ground. A grown good makes GROWN_BASE plus the plot's
 * rating, but never less than GROWN_MIN: a poor plot still works, just badly.
 * A mined good makes exactly its deposit rating, so a 0 means nothing to mine.
 */
export const GROWN_BASE = 2;
export const GROWN_MIN = 1;

/** Chance of each grown-good rating from -2 to +3, by how the terrain suits the good. */
export const GROWN_ODDS = {
  good: [0, 0.05, 0.15, 0.3, 0.3, 0.2],
  neutral: [0.05, 0.2, 0.4, 0.25, 0.1, 0],
  poor: [0.3, 0.35, 0.25, 0.1, 0, 0],
} as const;

/** Chance of each mineral deposit rating from 0 to 4. */
export const MINERAL_ODDS = {
  none: [1, 0, 0, 0, 0],
  low: [0.7, 0.2, 0.1, 0, 0],
  medium: [0.4, 0.3, 0.2, 0.1, 0],
  high: [0.1, 0.2, 0.35, 0.25, 0.1],
  veryHigh: [0.05, 0.1, 0.25, 0.35, 0.25],
} as const;

type LandTerrain = Exclude<Terrain, 'store'>;

/**
 * Terrain only sets the odds; the real rating is rolled once per plot when
 * the map is made and stays hidden until a geo analysis. From the design
 * doc's Terrain and geology tab. Goods not listed are neutral.
 */
export const TERRAIN_ODDS: Record<
  LandTerrain,
  { grown: Partial<Record<GrownGood, 'good' | 'poor'>>; mined: Record<MinedGood, keyof typeof MINERAL_ODDS> }
> = {
  river: { grown: { food: 'good', water: 'good' }, mined: { smithore: 'low', crystite: 'none', rareEarth: 'low' } },
  lake: { grown: { water: 'good', food: 'good' }, mined: { smithore: 'none', crystite: 'none', rareEarth: 'none' } },
  plains: { grown: { food: 'good', energy: 'good' }, mined: { smithore: 'low', crystite: 'low', rareEarth: 'low' } },
  forest: { grown: { food: 'good', energy: 'poor' }, mined: { smithore: 'low', crystite: 'none', rareEarth: 'low' } },
  swamp: { grown: { water: 'good', food: 'poor' }, mined: { smithore: 'low', crystite: 'low', rareEarth: 'medium' } },
  hills: { grown: { food: 'poor' }, mined: { smithore: 'high', crystite: 'medium', rareEarth: 'medium' } },
  mountains: { grown: { food: 'poor', energy: 'poor' }, mined: { smithore: 'veryHigh', crystite: 'medium', rareEarth: 'high' } },
  desert: { grown: { energy: 'good', water: 'poor', food: 'poor' }, mined: { smithore: 'low', crystite: 'medium', rareEarth: 'medium' } },
  tundra: { grown: { energy: 'good', water: 'good', food: 'poor' }, mined: { smithore: 'medium', crystite: 'low', rareEarth: 'medium' } },
  ice: { grown: { water: 'good', food: 'poor', energy: 'poor' }, mined: { smithore: 'none', crystite: 'low', rareEarth: 'low' } },
  volcanic: { grown: { energy: 'good', food: 'poor' }, mined: { smithore: 'medium', crystite: 'low', rareEarth: 'high' } },
  crater: { grown: { food: 'poor' }, mined: { smithore: 'low', crystite: 'veryHigh', rareEarth: 'medium' } },
};

/** How hazard traits change output. Traits not listed only change event risks. */
export const TRAIT_EFFECT: Partial<Record<TileTrait, Partial<Record<RawGood, number>>>> = {
  hotSpring: { energy: 2, water: -1 },
  toxic: { food: -2 },
};

/** A thin vein's mining output drops by 1 every this many months the mine runs. */
export const THIN_VEIN_MONTHS = 3;

/**
 * Factories. A good place gives +1 output and a poor place -1, with the
 * reason the phone shows before you install. Plains suit any factory.
 */
export const FACTORY_FIT: Record<ProcessedGood, Partial<Record<Terrain, [number, string]>>> = {
  alloy: {
    volcanic: [1, 'Geothermal heat helps the furnace'],
    hills: [1, 'Firm rock under the furnace'],
    mountains: [1, 'Firm rock under the furnace'],
    swamp: [-1, 'Soft ground: the furnace sinks'],
    ice: [-1, 'Too cold for the furnace'],
    lake: [-1, 'Wet ground'],
  },
  electronics: {
    tundra: [1, 'Cold air cools the works'],
    desert: [1, 'Dry air, no damp'],
    plains: [1, 'Flat and dry'],
    swamp: [-1, 'Damp gets into the circuits'],
    river: [-1, 'Damp gets into the circuits'],
    volcanic: [-1, 'Quakes and ash'],
  },
  medicine: {
    forest: [1, 'Herbs nearby'],
    swamp: [1, 'Herbs nearby'],
    river: [1, 'Clean water'],
    desert: [-1, 'No herbs, little water'],
    volcanic: [-1, 'Ash in the air'],
    crater: [-1, 'Dust in the air'],
  },
};

export const FACTORY = {
  /** Two factories of the same kind side by side each make this much more (an industrial park). */
  parkBonus: 1,
  /** A factory next to its owner's plot that makes one of its inputs saves this much Energy. */
  feederEnergySaving: 1,
  /** After running this many months in a row, a factory makes experienceBonus more. */
  experienceMonths: 3,
  experienceBonus: 1,
};

/** Species perks. Numbers are placeholders until the balance sim has run. */
export const SPECIES_PERK = {
  /** Zipwing: walks this many times as fast in development (the client moves the colonist). */
  zipwingSpeed: 2,
  /** Bramblet: extra Food on every farm. */
  brambletFood: 1,
  /** Gearling: share of the normal price paid for MULEs and outfits. */
  gearlingPrice: 0.75,
  /** Mollox: extra output on every working mine, and share of the normal geo analysis time. */
  molloxMine: 1,
  molloxAnalysis: 0.5,
} satisfies Record<string, number>;

/** Default species by seat, when a player hasn't picked one. */
export const DEFAULT_SPECIES: readonly Species[] = ['zipwing', 'bramblet', 'gearling', 'mollox', 'glimmer', 'quibbit'];

export const ADJACENCY = {
  /** Bonus when at least one own neighbour produces the same good. */
  neighbour: 1,
  /** Bonus instead, when the connected cluster has this many plots or more. */
  clusterSize: 4,
  cluster: 2,
};

export const UPKEEP = {
  /**
   * A player's crew eats and drinks: the player alone needs baseFood and
   * baseWater, and every few crew add one more. A raw plot has a crew of 1, a
   * factory a crew of 2, so a bigger estate costs more to feed.
   */
  baseFood: 2,
  baseWater: 1,
  crewPerFood: 4,
  crewPerWater: 6,
  crew: { raw: 1, factory: 2, greenBelt: 0 },
  /**
   * Energy a raw plot burns a month, by what it makes. Factories burn what
   * their recipe says. Without it a raw plot makes half, a factory nothing.
   */
  energyUse: { food: 1, water: 1, energy: 0, smithore: 2, crystite: 2, rareEarth: 2 } satisfies Record<RawGood, number>,
  /**
   * Plots that need irrigation: when their owner holds less Water than the
   * household and crew need, they make half (on top of any Energy shortfall).
   */
  irrigated: ['food'] as RawGood[],
  /** Colonists need 1 Food and 1 Water a month per this many colonists. */
  colonistsPerUnit: 20,
  /**
   * The most colonists pay per unit, from their off-world wages. Above it they
   * buy less, so their demand falls as the price rises: this is the demand curve.
   */
  colonistBudget: { food: 150, water: 120, energy: 100, medicine: 400 } as Partial<Record<Good, number>>,
  /** Units of each good a player's home depot holds. */
  depotCapacity: 10,
};

export const START = {
  money: 1000,
  colonists: 100,
  storeMules: 10,
  storeCapital: 4000,
  storeStock: { food: 30, water: 36, energy: 16, smithore: 20, crystite: 0, rareEarth: 4, alloy: 8, electronics: 0, medicine: 4 } satisfies Stock,
};

export const MULE = {
  /** Labour in an empty MULE. Its price is this plus the Smithore it is built from. */
  labour: 120,
  /** Smithore the store needs to build one MULE, as in the original. */
  smithorePerMule: 1,
  /** The store builds MULEs for every plot claimed in a month, plus this many. */
  spareInCorral: 2,
  /** If the corral sold out, MULEs cost this much more next month; with half or more left over, surplusDown less. */
  scarcityUp: 0.15,
  surplusDown: 0.1,
  /** The scarcity factor never falls below this. */
  minFactor: 0.6,
  outfitCost: {
    food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100,
    alloy: 150, electronics: 200, medicine: 150, greenBelt: 20,
  } satisfies Record<Outfit, number>,
};

export const DEVELOPMENT = {
  /** Seconds of development with enough Food for the month. */
  fullSeconds: 50,
  /** Seconds with no Food at all; the time shrinks linearly with the shortfall. */
  minSeconds: 15,
  /** Seconds a colonist stands on a plot for a geo analysis. */
  analysisSeconds: 8,
  /** The pub pays base + (start + month * perMonth) * share of time left. */
  pub: { base: 20, start: 60, perMonth: 20 },
  /** A geo drone analyses this many free plots from orbit for this fee. */
  droneFee: 60,
  dronePlots: 2,
  /** Alloy a filter costs, from the player's own stock. */
  filterAlloy: 1,
};

/** What pollutes, and by how much. From the design doc's Pollution tab. */
export const POLLUTION = {
  /** Colony air points a month, and whether the source also fouls the plots around it. */
  sources: {
    rareEarth: { air: 4, spreads: true },
    alloy: { air: 3, spreads: true },
    electronics: { air: 1, spreads: false },
    smithore: { air: 1, spreads: false },
    crystite: { air: 1, spreads: false },
  } as Partial<Record<Outfit, { air: number; spreads: boolean }>>,
  /** The highest plot level (toxic). */
  maxPlot: 3,
  /** Nature cleans this many air points a month per player (a bigger colony has a bigger map). */
  natureCleansPerPlayer: 2,
  /** Plot levels a plot with no polluter beside it recovers each month; untouched forest and swamp recover faster. */
  recovery: 1,
  wildRecovery: 2,
  /** A filter multiplies the source's air points by this and stops the local spread. */
  filterFactor: 0.5,
  /** A green belt cleans its plot and the four touching it by this much, and the air by greenBeltAir. */
  greenBeltCleans: 1,
  greenBeltAir: 2,
  /** Goods that lose 1 unit per plot pollution level. */
  sensitive: ['food', 'water', 'medicine'] as Good[],
  /** The colony gauge's bands: from this level, everyone loses devPenalty seconds unless they take Medicine. */
  bands: [
    { name: 'clean', from: 0, devPenalty: 0 },
    { name: 'smoggy', from: 30, devPenalty: 5 },
    { name: 'toxic', from: 60, devPenalty: 10 },
    { name: 'collapse', from: 80, devPenalty: 15 },
  ] as const,
  /** Clean colony: off-world buyers pay this much more for exports. */
  cleanExportBonus: 0.1,
  /** From Smoggy: colonists' Medicine demand is multiplied by this. */
  sickMedicineDemand: 1.5,
  /** From Toxic: every farm and well makes this much less. */
  toxicFarmLoss: 1,
  /** In Collapse: this share of colonists leaves each month, and final scores are multiplied by collapseScore. */
  collapseLeave: 0.05,
  collapseScore: 0.8,
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
  /** What each plot a player owns adds to their score, before any MULE on it. */
  plotScore: 300,
  /** The export ship calls every this many months. */
  exportShipEvery: 3,
  /** How long each free plot stays lit in the land grant. */
  grantTickMs: 650,
};

export const EXPORT_SHIP = {
  /** Goods on the ship's wishlist, announced one month before it calls. */
  wishlist: 3,
  /** The ship pays the off-world price for its first unit of a good and this share less for each further unit. */
  stepDown: 0.02,
};

export const TAX = {
  /** Sales tax on every sale a player makes, into the colony fund. The Governor sets it later; this is the start. */
  salesTax: 0.05,
};

/**
 * The goods auction, played live as in the original: goods come up one at a
 * time, each with a status screen, a declare and a walk. Times are in
 * milliseconds of game time; the server steps the auction on a fixed tick.
 */
export const WALK = {
  /** The order goods come up in: raw goods first, then processed ones. */
  order: ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'alloy', 'electronics', 'medicine'] as Good[],
  /** The status screen before each good: what everyone had, used, made, and their surplus or shortage. */
  statusMs: 6_000,
  /** Picking Buyer or Seller before the walk. */
  declareMs: 5_000,
  /** The walk's clock for one good. */
  goodMs: 20_000,
  /** While any unit is changing hands the clock runs at this share of its speed, as in the original. */
  tradeClockRate: 0.25,
  /**
   * While a buyer and a seller (or a player and the store or the ship) stay
   * matched, the first unit takes tradeStartMs, each further one tradeSpeedUp
   * times as long as the one before, down to tradeFloorMs, so big lots don't
   * take ages. The speed-up starts again when the pair separates.
   */
  tradeStartMs: 400,
  tradeSpeedUp: 0.8,
  tradeFloorMs: 60,
  /**
   * Walking speed in price units per second, set when a good comes up: its
   * board's starting height divided by this, so crossing the board takes
   * this many seconds whatever the good costs. Never under minSpeed.
   */
  crossSeconds: 6,
  minSpeed: 2,
  /** The board reaches this share beyond the outermost price line; sellers start at its top, buyers at its bottom. */
  boardMargin: 0.3,
  /** How often the server steps the auction. */
  tickMs: 100,
};

/**
 * AI players. The strategist scores options with named considerations; a
 * persona is a set of weights on them, and a level sets how complete the
 * scoring is, how many near-best options reach the decider and how fast the
 * hands react. No level sees more than a human in that seat would.
 */
export interface AiPersonaWeights {
  /** Dislike of uncertain bets (unanalysed ground, thin markets). 1 is neutral; higher avoids risk. */
  risk: number;
  /** Weight on money made. Higher chases bigger but less certain gains. */
  greed: number;
  /** Multiplies the cash and the Food and Energy it keeps back for next month. */
  reserve: number;
  /** Weight on hurting the leader: blocking their land, outbidding them for what they need. 0 never. */
  spite: number;
  /** Willingness to buy now to sell next month. 0 never. */
  speculate: number;
  /** Willingness to buy up a scarce good the others are short of, to sell it to them dear. 0 never. */
  corner: number;
  /** Auction patience: higher waits longer for the other side to come to it. */
  patience: number;
}

export const AI_PERSONAS = {
  cautious: { risk: 1.6, greed: 0.8, reserve: 1.6, spite: 0, speculate: 0.3, corner: 0, patience: 1.4 },
  aggressive: { risk: 0.6, greed: 1.4, reserve: 0.7, spite: 0.3, speculate: 1.0, corner: 1.0, patience: 0.6 },
  trader: { risk: 1.0, greed: 1.1, reserve: 1.0, spite: 0, speculate: 1.4, corner: 0.4, patience: 1.0 },
  saboteur: { risk: 0.9, greed: 0.9, reserve: 1.0, spite: 1.5, speculate: 0.6, corner: 0.6, patience: 0.9 },
} satisfies Record<string, AiPersonaWeights>;

export type AiPersonaId = keyof typeof AI_PERSONAS;

export interface AiLevelConfig {
  /** Prices from the engine's own look-ahead (next month's production, upkeep and spoilage); without it, today's posted prices. */
  lookAhead: boolean;
  /** Counts spoilage, the depot limit and the air in its values. */
  fullScoring: boolean;
  /** Options handed to the decider, at most. */
  shortlist: number;
  /** An option reaches the shortlist only within this share of the best utility. */
  shortlistTolerance: number;
  /** The default decider picks among options within this share of the best, in proportion to utility. */
  pickTolerance: number;
  /** Reaction time in ms, drawn per reaction. */
  reactMs: [number, number];
  /** Multiplies the hands' development step times. 1 is a quick human. */
  devPace: number;
  /** MULEs it leads out of the store in one month, at most. */
  mulesPerMonth: number;
  /** Chance it misses a plot it wanted in the land grant. */
  missChance: number;
  /** Allowed to corner goods and to act on spite. Rookie never does. */
  corners: boolean;
  sabotage: boolean;
}

export const AI_LEVELS = {
  rookie: {
    lookAhead: false,
    fullScoring: false,
    shortlist: 3,
    shortlistTolerance: 0.35,
    pickTolerance: 0.25,
    reactMs: [320, 550],
    devPace: 1.4,
    mulesPerMonth: 1,
    missChance: 0.25,
    corners: false,
    sabotage: false,
  },
  trader: {
    lookAhead: true,
    fullScoring: true,
    shortlist: 4,
    shortlistTolerance: 0.2,
    pickTolerance: 0.1,
    reactMs: [250, 400],
    devPace: 1.1,
    mulesPerMonth: 2,
    missChance: 0.05,
    corners: true,
    sabotage: true,
  },
  tycoon: {
    lookAhead: true,
    fullScoring: true,
    shortlist: 5,
    shortlistTolerance: 0.12,
    pickTolerance: 0.04,
    reactMs: [200, 320],
    devPace: 1,
    mulesPerMonth: 3,
    missChance: 0,
    corners: true,
    sabotage: true,
  },
} satisfies Record<string, AiLevelConfig>;

export type AiLevelId = keyof typeof AI_LEVELS;

/** Numbers the strategist's considerations use. */
export const STRATEGIST = {
  /** Months of output it counts a MULE as earning, at most. */
  horizon: 6,
  /** Each later month counts this share of the one before. */
  discount: 0.9,
  /** Credits of gain that score 0.75 on the gain curve (0 scores 0.5). */
  gainScale: { plot: 400, develop: 300, trade: 80 },
  /** Cash it always keeps back, before the persona's reserve multiplier, plus the cost of next month's Food, Water and Energy shortfall. */
  cashFloor: 60,
  /** What one colony air point costs it, in credits, rising as the air gets dirtier (doubles by Smoggy). */
  airCost: 10,
  /** Below this utility share of the best, a free plot is not worth pressing for in the first sweep; later sweeps take anything above laterShare. */
  grantShare: 0.75,
  grantLaterShare: 0.5,
  /** A factory needs this many months of its inputs on hand or from its own plots. */
  factoryInputMonths: 2,
  /** Spare Food, Water, Energy and Medicine it keeps over next month's need, before the reserve multiplier. */
  keepSpare: { food: 1, water: 1, energy: 1, medicine: 0 } as Partial<Record<Good, number>>,
  /** It analyses an unknown plot of its own when the plot's best and second-best uses are this close, as a share. */
  analyseWhenClose: 0.25,
  /** Analyses per month, at most, and never with less than this many seconds left. */
  analysesPerMonth: 2,
  analyseMinSeconds: 20,
  /** Share of its money it spends on one good at the auction, at most. */
  budgetShare: 0.5,
  /** A developed plot counts in the final score at the MULE price; it counts this share of that as won back. */
  residual: 0.8,
  /** What a second of development time is worth, with idle land to work and without. */
  secondValue: { busy: 10, idle: 3 },
  /** Share it takes off next month's price for a good it would hold, per point of risk weight, because the forecast may be wrong. */
  forecastHaircut: 0.05,
  /** A corner pays this share over next month's price for the units the others are short of. */
  cornerPremium: 0.5,
  /**
   * How many months past next the outlook plays the status quo forward
   * (nobody builds or trades), to see a shortage coming before the price
   * shows it: the corral's Smithore, Food or Water running out.
   */
  outlookMonths: 2,
  /** When it sizes its cash reserve, a short unit counts at most this many times the reference price. */
  reservePriceCap: 3,
  /**
   * A new farm's Food, Water or Energy that covers the seat's own shortfall is
   * worth at least this many times the reference price: going short costs
   * development time (Food), half of every farm (Water) or half of every plot
   * (Energy), whatever the market price is today.
   */
  selfSupply: 3,
  /**
   * The "cash left" consideration: spending down to the reserve scores this
   * much, and keeping twice the reserve scores 1. The reserve itself is a hard
   * rule, so this is only a mild preference for cash in hand.
   */
  cashLeftFloor: 0.75,
};

/** The AI's hands in the real-time phases. Times are in ms. */
export const AI_HANDS = {
  /** Development steps, as a quick human taps them: to the corral and buy, to an outfitter, out to the plot and install, analyse, the pub. */
  develop: {
    buyMs: [1_400, 2_400] as [number, number],
    outfitMs: [1_000, 1_900] as [number, number],
    installMs: [1_800, 3_200] as [number, number],
    analyseTapMs: [1_200, 2_000] as [number, number],
    filterMs: [1_200, 2_000] as [number, number],
    pubMs: [800, 1_500] as [number, number],
    /** The most it waits for its decider before it plays its own top option. */
    decideWaitMs: 1_500,
  },
  auction: {
    /** Delay after the walk starts before it first moves, scaled by patience. */
    startMs: [300, 1_500] as [number, number],
    /** A gap to the other side's best price this small (share of the board) is left for them to close. */
    waitGap: [0.03, 0.08] as [number, number],
    /** It wanders its target up to this share of the board inside its limit, so its stops are hard to read. */
    targetJitter: 0.03,
    /** How long it waits for the decider at the status screen before it plays its own top option. */
    decideWaitMs: 2_500,
  },
  grant: {
    /** A go/no-go choice takes this much longer than a bare reaction. */
    choiceMs: [150, 300] as [number, number],
  },
};
