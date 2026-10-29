import type { Outfit, EventKey, GrownGood, Good, MinedGood, Office, ProcessedGood, RawGood, SpecialKind, Species, Stock, Terrain, TileTrait } from './types.js';

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
  /** Food and Water count as short when the store's shelf holds under this many months of the colonists' need, so the price climbs before they go hungry. */
  shelfCover: 1,
  /** With that shelf short, the store bids up to this times the posted price for Food and Water, capped so it can still sell to colonists within their budget. */
  restockPremium: 1.5,
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

/** Chance of each grown-good rating from GROWN_ODDS_MIN up (today -2 to +3), by how the terrain suits the good. */
export const GROWN_ODDS = {
  good: [0, 0.05, 0.15, 0.3, 0.3, 0.2],
  neutral: [0.05, 0.2, 0.4, 0.25, 0.1, 0],
  poor: [0.3, 0.35, 0.25, 0.1, 0, 0],
} as const;
/** The grown-good rating GROWN_ODDS' first chance is for; each later chance is one rating higher. */
export const GROWN_ODDS_MIN = -2;

/** Chance of each mineral deposit rating from MINERAL_ODDS_MIN up (today 0 to 4). */
export const MINERAL_ODDS = {
  none: [1, 0, 0, 0, 0],
  low: [0.7, 0.2, 0.1, 0, 0],
  medium: [0.4, 0.3, 0.2, 0.1, 0],
  high: [0.05, 0.15, 0.3, 0.3, 0.2],
  veryHigh: [0.02, 0.08, 0.15, 0.4, 0.35],
} as const;
/** The deposit rating MINERAL_ODDS' first chance is for; each later chance is one rating higher. */
export const MINERAL_ODDS_MIN = 0;

/** The rating each chance in an odds row stands for: `lowest` for the first, one higher for each after it. */
export function ratingsOf(odds: readonly number[], lowest: number): number[] {
  return odds.map((_, i) => lowest + i);
}

type LandTerrain = Exclude<Terrain, 'store'>;

/**
 * Terrain only sets the odds; the real rating is rolled once per plot when
 * the map is made and stays hidden until a geo analysis. From the design
 * doc's Terrain and geology tab. Goods not listed are neutral.
 */
export const TERRAIN_ODDS: Record<
  LandTerrain,
  { grown: Partial<Record<GrownGood, 'good' | 'poor'>>; mined: { smithore: keyof typeof MINERAL_ODDS } }
> = {
  river: { grown: { food: 'good', water: 'good' }, mined: { smithore: 'low' } },
  lake: { grown: { water: 'good', food: 'good' }, mined: { smithore: 'none' } },
  plains: { grown: { food: 'good', energy: 'good' }, mined: { smithore: 'low' } },
  forest: { grown: { food: 'good', energy: 'poor' }, mined: { smithore: 'low' } },
  swamp: { grown: { water: 'good', food: 'poor' }, mined: { smithore: 'low' } },
  hills: { grown: { food: 'poor' }, mined: { smithore: 'high' } },
  mountains: { grown: { food: 'poor', energy: 'poor' }, mined: { smithore: 'veryHigh' } },
  desert: { grown: { energy: 'good', water: 'poor', food: 'poor' }, mined: { smithore: 'low' } },
  tundra: { grown: { energy: 'good', water: 'good', food: 'poor' }, mined: { smithore: 'medium' } },
  ice: { grown: { water: 'good', food: 'poor', energy: 'poor' }, mined: { smithore: 'none' } },
  volcanic: { grown: { energy: 'good', food: 'poor' }, mined: { smithore: 'medium' } },
  crater: { grown: { food: 'poor' }, mined: { smithore: 'low' } },
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
  /** Zipwing: walks this many times as fast in development (DEV_WALK). At 1.5 Zipwings won 37% of games, not 25%. */
  zipwingSpeed: 1.25,
  /** Bramblet: extra Food on every farm. */
  brambletFood: 1,
  /** Gearling: share of the normal price paid for MULEs and outfits. At 0.75 Gearlings won 44% of games, not 25%. */
  gearlingPrice: 0.95,
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
  /** Share of its output a plot makes without the Energy (or, for an irrigated plot, the Water) it needs. */
  shortOutputShare: 0.5,
  /** Colonists need 1 Food and 1 Water a month per this many colonists. */
  colonistsPerUnit: 20,
  /** Colonists' Energy demand, as a share of their Food and Water units. */
  colonistEnergyShare: 0.5,
  /** Colonists need 1 Medicine a month per this many colonists (more when the air makes them sick). */
  colonistsPerMedicine: 50,
  /** The colony grows by this factor in a month its colonists were fed, and shrinks by this one when they went hungry. */
  colonistGrowth: { fed: 1.04, hungry: 0.95 },
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
  /** Each player's depot at the start. */
  playerStock: { food: 6, water: 6, energy: 4 } as Partial<Stock>,
  /** Each player's reputation at the start, out of 100. */
  reputation: 50,
  colonists: 100,
  storeMules: 10,
  storeCapital: 4000,
  /**
   * Little enough Water that the AI's outlook (STRATEGIST.horizon, outlook.ts) sees the store run dry from month 1 and
   * prices Water at what colonists pay, so the seats build wells early. A few units more put the dry month past the
   * outlook, and the colonists go short later in the game. When this, START.colonists, UPKEEP.colonistGrowth or the
   * outlook changes, re-run `pnpm sim -- --games 40 --seed N --politics on|off` for seeds 1, 101 and 201 and read
   * "Colonists short of Food or Water".
   */
  storeStock: { food: 30, water: 20, energy: 16, smithore: 20, crystite: 0, rareEarth: 4, alloy: 8, electronics: 0, medicine: 4 } satisfies Stock,
};

export const MULE = {
  /** Labour in an empty MULE. Its price is this plus the Smithore it is built from. */
  labour: 120,
  /** Smithore the store needs to build one MULE, as in the original. */
  smithorePerMule: 1,
  /** The store builds MULEs for every plot claimed in a month, plus this many. */
  spareInCorral: 2,
  /** If the corral sold out, MULEs cost this much more next month; with surplusShare of the month's MULEs or more left over, surplusDown less. */
  scarcityUp: 0.15,
  surplusDown: 0.1,
  surplusShare: 0.5,
  /** The scarcity factor never falls below this. */
  minFactor: 0.6,
  outfitCost: {
    food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100,
    alloy: 150, electronics: 200, medicine: 150, greenBelt: 20,
  } satisfies Record<Outfit, number>,
};

export const DEVELOPMENT = {
  /** Seconds of development, the same for every player: hunger and sickness slow the walk instead (DEV_WALK). */
  fullSeconds: 50,
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

/**
 * Walking in development costs time off the one development clock (Heiko's R1, 0.4 s a tile). A walk goes in grid
 * steps on the map, never diagonally; the store and its corral are on the store's tile. A hungry or sick colonist
 * walks slower, and the two multiply: no Food and sick is a tenth of normal pace (Heiko's numbers).
 * Not WALK, the goods auction's walk.
 */
export const DEV_WALK = {
  /** Seconds for each step from one map tile to the next. */
  tileSeconds: 0.4,
  /** Seconds to cross the store floor to the corral, from the door or any other room. */
  floorSeconds: 1,
  /** Share of its pace a colonist with no Food walks at; it rises linearly to 1 with the share of the month's Food it holds. */
  hungerPaceMin: 0.2,
  /** Share of its pace a sick colonist walks at (EVENTS.player.sickness rolled, and no Medicine held). */
  sickPace: 0.5,
  /**
   * The hunger levels the screens show, as shares of the month's Food missing (0 fed, 1 none): peckish below
   * hungryFrom, hungry from it, starving from starvingFrom. Display bands only: the pace itself is continuous.
   * Player.hungry is any shortfall; these levels are only the words on screen.
   * WS6's thresholds, in the variant-B mock Heiko approved 2026-10-28 (design/mocks/ws6-ux at bb4bc11).
   */
  hungerLevels: { hungryFrom: 0.3, starvingFrom: 0.7 },
};

/** Every land but the store's own tile, which no colonist walks on. */
export type WalkTerrain = Exclude<Terrain, 'store'>;
/** 'shore': a lake blocks, and a lake plot is worked from its shore. 'wade': a lake is walked at DEV_STEER.wading. */
export type LakeMode = 'shore' | 'wade';

/**
 * Arcade walking in development: every colonist steered live and stepped at one fixed tick, everywhere the game runs.
 * Heiko's starting values (arcade spec RULE-7); DEV_WALK's hunger, sickness and Zipwing pace still apply.
 */
export const DEV_STEER = {
  /** Steered walking instead of DEV_WALK's tap-to-walk. Off until Heiko's OK on the rig. */
  on: false as boolean,
  /** Tiles a second on plains at full pace: half of today's 1 / DEV_WALK.tileSeconds. */
  mapTilesPerSecond: 1.25,
  /** Seconds across the store's hall at full pace, door to corral. */
  floorSeconds: 3,
  /** Share of its speed a colonist keeps while it leads a MULE. */
  leadPace: 0.9,
  /** Share of full speed on each land. 0 blocks it. */
  terrain: {
    plains: 1, desert: 0.9, tundra: 0.85, forest: 0.75, ice: 0.75, crater: 0.8, hills: 0.7,
    volcanic: 0.6, river: 0.6, swamp: 0.5, mountains: 0.4, lake: 0,
  } satisfies Record<WalkTerrain, number>,
  lakeMode: 'shore' as LakeMode,
  /** Share of full speed in a lake when lakeMode is 'wade'. */
  wading: 0.3,
  /** In shore mode, a colonist reaches a lake plot nearer than this to its edge, in tiles (RULE-3 row 10; the mock's). */
  shoreReachTiles: 0.45,
  /** Mountains block like a lake instead of slowing. */
  mountainsImpassable: false as boolean,
  /** Others' plots may be walked across; false makes them block like a lake. */
  trespass: true as boolean,
  /** Ms of game time a tick steps: the server, the sim and the phone's prediction all step at this. */
  tickMs: 50,
  /** The most missed ticks a late server timer runs before it resyncs. */
  catchUpTicks: 10,
  /** The most steering messages a phone sends a second, under the server's RATE_LIMIT. */
  steerMaxPerSecond: 10,
  /** AI colonists walk at this times a person's speed. */
  botSpeed: 1,
  /** Seconds an AI colonist stands at a counter before it presses. */
  botCounterPauseSeconds: 0.5,
  /** An AI colonist joins a glint race or the scramble only if its errand still fits the time left after the detour. */
  botsSpareTime: true as boolean,
  /** Share of what a MULE cost that the pub pays back when its owner walks in leading it. */
  pubLeadRefund: 0,
  /** A re-outfit's price, as a share of the outfitter's price for the new good: 1 is the outfit price. */
  reoutfitCost: 1,
  /** Month 1's development clock stands full until every present seat's first MULE is installed. */
  month1WaitsForFirstMule: true as boolean,
  /** A colonist's clearance from walls, lakes and the map's edge, in tiles. */
  bodyTiles: 0.18,
  /** How far the door reaches above and below the middle of each side face of the store's tile, in tiles. */
  doorHalfTiles: 0.25,
  /** How far behind its colonist a MULE on its lead walks: in tiles on the map, as a share of the hall's width inside. */
  leadTiles: 0.55,
  leadHallShare: 0.075,
  /** The phone's own colonist: within snapTiles of the server's it eases there over correctMs, beyond it snaps. */
  snapTiles: 0.25,
  correctMs: 150,
  /** Other colonists draw this far behind the newest frame, interpolated between frames. */
  interpolateMs: 100,
  /** No frame for this long and the phone shows "reconnecting" and stops predicting. */
  staleMs: 1_000,
};

/** The bot skill levels a wolf fight knows. */
export type WolfFightLevel = 'rookie' | 'regular' | 'veteran';

/** Wolves on forest, hills and tundra: run, or fight for pelts (arcade spec RULE-4). */
export const WOLVES = {
  on: true as boolean,
  /** Chance a second, on wolf land, that a pack comes for a colonist. */
  chancePerSecond: 0.1,
  packSize: 3,
  /** No second pack for the same colonist for this long. */
  cooldownSeconds: 20,
  /** Time to choose run or fight before they pounce, which is a fight. */
  chooseSeconds: 3,
  /** A chasing wolf's speed, in tiles a second. */
  chaseSpeed: 1.1,
  /** A chase ends, got away, after this long or this far from where it started. */
  giveUpSeconds: 5,
  giveUpTiles: 4,
  /** Share of its speed a bitten colonist keeps, till it reaches the store or its own plot. */
  bittenPace: 0.5,
  fightSeconds: 10,
  lungeEverySeconds: 1.6,
  /** The crouch before a lunge: the time there is to dodge. */
  warnSeconds: 0.8,
  strikesToWin: 3,
  bitesToLose: 3,
  /** Pelts a won fight gives, and what the store pays for each. */
  pelts: 2,
  peltPrice: 20,
  /** A lost fight with no MULE on the lead freezes its colonist this long. */
  stunSeconds: 4,
  /** A lost fight's MULE bolts this many tiles at this many tiles a second. */
  boltTiles: 4,
  boltSpeed: 3.5,
  /** Share of AI colonists that fight rather than run. */
  botFightShare: 0.5,
  /** Share of an AI colonist's legs that go by wolf land. */
  botWolfLandShare: 0.5,
  /** Each level's chance to dodge a lunge, and its delay before it strikes at a wolf that stands open. */
  levels: {
    rookie: { dodge: 0.4, strikeDelaySeconds: 0.5 },
    regular: { dodge: 0.6, strikeDelaySeconds: 0.35 },
    veteran: { dodge: 0.9, strikeDelaySeconds: 0.15 },
  } satisfies Record<WolfFightLevel, { dodge: number; strikeDelaySeconds: number }>,
};

/** The glint race: a Crystite sparkle on a tile, and the first colonist onto it wins (arcade spec RULE-5). */
export const GLINT = {
  on: true as boolean,
  /** Mean seconds between glints while none is lit. */
  meanGapSeconds: 20,
  showSeconds: 8,
  /** None in a turn's first seconds, nor this soon after one ends. */
  firstAfterSeconds: 6,
  pauseSeconds: 5,
  /** A glint may light someone's plot (never a lake or the store). */
  onOwnedPlots: true as boolean,
  prize: 'crystite' as 'crystite' | 'credits',
  /** The prize: this much Crystite, or these credits when prize is 'credits'. */
  crystite: 1,
  credits: 60,
  /** Share of AI colonists that race, and only for a glint within botCareTiles. */
  botShare: 0.75,
  botCareTiles: 8,
};

/** The corral scramble: the race for the store's last MULEs (arcade spec RULE-6). */
export const SCRAMBLE = {
  on: true as boolean,
  /** It starts when a sale leaves the corral with this many MULEs or fewer. */
  mulesLeft: 2,
  /** It ends after this long, if the corral has not emptied first. */
  maxSeconds: 15,
  /** Share of AI colonists still needing a MULE that race, and only from within botCareTiles of the store. */
  botShare: 0.9,
  botCareTiles: 10,
};

/** What pollutes, and by how much. From the design doc's Pollution tab. */
export const POLLUTION = {
  /** The air gauge runs from 0 (clean) to this. */
  airMax: 100,
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
  /** The colony gauge's bands: from a band that sickens, a colonist who takes no Medicine is sick (DEV_WALK.sickPace). */
  bands: [
    { name: 'clean', from: 0, sickens: false },
    { name: 'smoggy', from: 30, sickens: true },
    { name: 'toxic', from: 60, sickens: true },
    { name: 'collapse', from: 80, sickens: true },
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

export type SizeBand = 'small' | 'mid' | 'large';

/** Map size band by player count: small is 2-3 players, mid 4, large 5-6. */
export function sizeBand(players: number): SizeBand {
  if (players <= 3) return 'small';
  if (players === 4) return 'mid';
  return 'large';
}

const MAP_SIZE: Record<SizeBand, { width: number; height: number }> = {
  small: { width: 13, height: 7 },
  mid: { width: 15, height: 9 },
  large: { width: 19, height: 11 },
};

/** Map size by player count, from the design doc. */
export function mapSize(players: number): { width: number; height: number } {
  return { ...MAP_SIZE[sizeBand(players)] };
}

/** The goods every map guarantees a floor, reach and normal range for. */
export type FloorGood = 'food' | 'water' | 'energy' | 'smithore';

/** The 11 land terrains other than the river: the ones with a target share. */
export type ShareTerrain = Exclude<LandTerrain, 'river'>;

/** The special fields the generator places; a meteor crater only forms in play. */
export type PlacedSpecialKind = Exclude<SpecialKind, 'meteorCrater'>;

/**
 * What every map must meet (the map rules), read by the checker, the
 * generator and the map gallery. Size bands are sizeBand's. Counts are good
 * plots per player.
 */
export const MAP = {
  /**
   * The honest map-wide average Crystite and Rare earth rating, shown as the
   * hint on every terrain: both exist only in random rings, so no terrain
   * says where they are. Measured: the mean over maps of 2 to 6 players, each map counted once (about 0.82 small, 0.60 mid, 0.41 large).
   */
  unknownMineral: 0.6,
  /** A plot is good for a raw good at this rating or more. */
  goodAt: { food: 1, water: 1, energy: 1, smithore: 3, crystite: 3, rareEarth: 3 } satisfies Record<RawGood, number>,
  /** Every map has at least this many good plots per player. */
  floor: { food: 10, water: 10, energy: 10, smithore: 3 } satisfies Record<FloorGood, number>,
  /** Lower edge of the normal range: a good below it is the map's scarce good, and at most one may be. */
  normalLo: { food: 12, water: 13, energy: 13, smithore: 4 } satisfies Record<FloorGood, number>,
  /** Most steps from any land plot to a good plot of each good. */
  reach: {
    small: { food: 3, water: 3, energy: 3, smithore: 5 },
    mid: { food: 3, water: 3, energy: 3, smithore: 5 },
    large: { food: 4, water: 4, energy: 4, smithore: 6 },
  } satisfies Record<SizeBand, Record<FloorGood, number>>,
  /** Fewest river bends: rows holding two river plots. */
  bends: { small: 2, mid: 3, large: 4 } satisfies Record<SizeBand, number>,
  /** Target share of non-river land for each terrain. */
  shares: {
    plains: 0.24,
    forest: 0.11,
    hills: 0.1,
    desert: 0.09,
    tundra: 0.08,
    mountains: 0.07,
    swamp: 0.07,
    lake: 0.06,
    volcanic: 0.06,
    crater: 0.06,
    ice: 0.06,
  } satisfies Record<ShareTerrain, number>,
  /** A terrain's share may stray this fraction of its target, plus one plot. */
  jitter: 1 / 3,
  /** No terrain may cover more than this share of non-river land. */
  maxTerrainShare: 1 / 3,
  /** The river keeps at least this many columns from each side edge. */
  riverMargin: 2,
  /** Smallest connected same-terrain region. */
  minRegion: 3,
  /** Largest region, as a share of non-river land (rounded up to whole plots). */
  maxRegionShare: 0.12,
  /** Share of good Smithore plots that touch another good Smithore plot. */
  seamShare: 0.7,
  /**
   * Largest gap between a terrain's mean rating over many maps and the hint
   * players see. Read by the generator and the map-quality test, not the checker.
   */
  honesty: 0.3,
  /**
   * Largest gap, on one part of the map (each edge row or column, or the interior), between the mean of
   * rating minus hint and zero. The hint is the same everywhere, so ground that is poorer by place misleads.
   */
  placeHonesty: 0.1,
  /**
   * Crystite and Rare earth come in rings: a peak plot rated `high`, the plots
   * `steps.medium` steps from it `medium`, `steps.low` steps `low`, and 0 elsewhere.
   */
  peak: { high: 4, medium: 3, low: { min: 1, max: 2 }, count: { min: 3, max: 4 }, steps: { medium: 1, low: 2 } },
  /** Hidden hazard traits: a land plot draws its trait count evenly from this list (a repeat weights a count), then that many traits, a duplicate adding none. */
  traits: { counts: [0, 0, 0, 1, 1, 2] },
  /** Peaks drawn on a mountain plot, evenly from min to max. For the picture only: yield comes from the ground. */
  mountainPeaks: { min: 1, max: 3 },
  /** Chance a map has one scarce good. Read by the generator and the map-quality test, not the checker. */
  scarceChance: 0.25,
  /** Special fields on each map. */
  specials: { small: 3, mid: 4, large: 5 } satisfies Record<SizeBand, number>,
  /** Where special fields may go (spec RULE-5), read by the generator and the checker. */
  special: {
    /** Terrains each kind may sit on. Ruins and relics take any dry land: every land terrain but the river and lakes. */
    on: {
      ruins: ['plains', 'forest', 'hills', 'desert', 'tundra', 'mountains', 'swamp', 'volcanic', 'crater', 'ice'],
      crystalCavern: ['crater', 'mountains', 'hills'],
      geyser: ['volcanic', 'tundra', 'ice'],
      oasis: ['desert'],
      relic: ['plains', 'forest', 'hills', 'desert', 'tundra', 'mountains', 'swamp', 'volcanic', 'crater', 'ice'],
    } satisfies Record<PlacedSpecialKind, ShareTerrain[]>,
    maxPerKind: 2,
    minKinds: 3,
    /** Fewest steps between two special fields. */
    spacing: 4,
    /** Fewest of an oasis's 4 neighbours that are desert. */
    oasisDeserts: 2,
    /** Least Crystite rating under a crystal cavern. */
    cavernCrystite: 1,
    /**
     * Plots the generator's placement search tries for one map, backtracking included; real maps need
     * 3 to 10. At the bound it throws rather than place the map short. Read by the generator, not the checker.
     */
    placementTries: 10_000,
  },
  /** What special fields do (spec RULE-6). Output bonuses count before adjacency. */
  specialEffect: {
    /** Extra Crystite from a crystal cavern mined for Crystite. */
    crystalCavern: 4,
    /** Chance a cavern that produced Crystite this month collapses into a plain plot. */
    collapseChance: 0.06,
    /** Extra Water or Energy from a geyser outfitted for either. */
    geyser: 2,
    /** Extra Food from an oasis farm. */
    oasis: 3,
    /** Extra output for every working plot, raw or factory, per relic among its 4 neighbours. */
    relic: 1,
    /** What ruins pay their first owner, once, by the salvage drawn with the map. */
    salvage: { alloy: 2, electronics: 1 },
  },
  /** A meteor crater, formed in play: its Crystite rating (the top of the mined scale), and no production bonus. */
  meteorCrater: { crystite: 4 },
  /** Tuning for the layout stages (map-layout.ts): how the generator meets the rules above, not rules themselves. */
  layout: {
    /** The budget never gives a terrain more than this share, so jitter can't take plains near maxTerrainShare. */
    shareCap: 0.3,
    /** Plots a region aims for: each terrain's count is split into regions about this size. */
    avgRegion: 6,
    /** River bends beyond MAP.bends, drawn evenly from min to max. */
    extraBends: { min: 0, max: 1 },
    /** A region's seed scores its distance to seeds of its own terrain up to this many steps, and to any seed up to seedSpacing. */
    twinSpacing: 8,
    seedSpacing: 4,
    /** Distance to any seed scores this many times distance to a twin's seed: a crowded seed is the one that ends up boxed in. */
    crowdWeight: 2,
    /** A growing region weights a free neighbour by how many of its plots touch it, to this power: higher grows rounder regions. */
    compactPower: 2,
    /** A pocket's new region seeds on a plot weighted 1 plus its free neighbours to this power: higher seeds deeper in the pocket. */
    roomPower: 2,
    /** Growth steps, per free plot, before the regions stop growing. */
    growPasses: 4,
    /** Rounds of planting new regions in pockets the first growth left. */
    refillRounds: 3,
    /** Sweeps over the plots no region reached. */
    leftoverPasses: 10,
    /** Most fixes the repair makes to one layout. */
    repairMoves: 120,
    /** Of those, how many may leave the layout no better, to step off a dead end. */
    sidewaysMoves: 30,
    /** Of those, how many may leave it worse, when nothing better or level is left; the best layout seen is kept. */
    worseMoves: 10,
    /** Those level and worse moves skip plots the last this-many changed plots include, so they can't undo themselves. */
    tabu: 6,
    /** When no single move helps, runs of up to this many moves are searched, keeping the beamWidth least-bad at each step. */
    lookahead: 3,
    beamWidth: 12,
    /** Moves that search may measure on one layout, in all, before it gives up. */
    lookaheadEvaluations: 20000,
    /** Edge plots of each big patch tried as the start of a carved region. */
    carveStarts: 3,
    /** A patch is big enough to carve from at this many times minRegion; under 2, what is left could be a speck. */
    carveFrom: 2,
  },
  /** Tuning for the ground stages (map-ground.ts): how the generator meets the rules above, not rules themselves. */
  ground: {
    /**
     * The smooth fields that rank plots: one random blob per `area` plots of the box padded by blobPad (at least minBlobs), each a bump of
     * this `spread` (variance, in plots squared). Smithore's are narrow, so its rich plots gather into seams.
     */
    blobs: {
      grown: { area: 14, spread: 2.5 },
      smithore: { area: 10, spread: 1.3 },
    },
    minBlobs: 3,
    /** Plots past each edge the blob centres may fall, so the field is as strong at the edges as inside. */
    blobPad: 3,
    /** Random jitter on every plot's field, so a flat stretch still ranks by rng rather than by index. */
    fieldNoise: 0.15,
    /** Most repairs the reach stage makes for one good. */
    reachPasses: 200,
    /** Sweeps the seam stage makes over the isolated good Smithore plots. */
    seamPasses: 4,
    /** Most plots the scarcity stage tries, searching for a set to lower that keeps reach and the seams. */
    scarcityTries: 4000,
  },
};

export const GAME = {
  /** A game seats this many players, from the fewest to the most. */
  minPlayers: 2,
  maxPlayers: 6,
  maxMonths: 12,
  /** Months the game continues after the last free plot is claimed. */
  landRushMonths: 3,
  claimsPerGrant: 2,
  /** The land grant is one pass of the light over the free plots, or ends earlier once every claim is used. */
  grantSweeps: 1,
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
 * Colony politics: the election of the offices in POLITICS.offices, the vote weight,
 * the Governor's sales tax and the offices' pay. No decision has a clock; only
 * the reveal ceremony does, in milliseconds of game time, stepped like the land auction.
 */
export const POLITICS = {
  /** Months whose planning phase opens with an election; a term runs until the next one. */
  electionMonths: [1, 4, 7, 10],
  /** The offices elected, in the order the ceremony reveals them; the Sheriff returns with slice 4's powers. */
  offices: ['governor'] as Office[],
  /** A Governor who has served this many terms in a row may not run for Governor again until someone else has held it. */
  maxGovernorTermsInRow: 2,
  /**
   * The reveal ceremony's beats on its one show clock, from WS6's approved mock (ElectionReveal.tsx). Each office
   * in turn: its title, its candidates, its vote blocks one at a time, a tie if one was broken, then its winner.
   */
  ceremony: {
    /** Before the first office's title. */
    leadMs: 300,
    /** The office's title, before its candidates. */
    titleMs: 1_800,
    /** Each candidate popping in, in seat order. */
    candidateMs: 500,
    /** After the last candidate, before the first vote block. */
    barsLeadMs: 500,
    /** Each vote block, one per weighted vote, interleaved across the candidates. */
    blockMs: 550,
    /** After the last block, before a tie is stamped. */
    tieLeadMs: 400,
    /** The tie and the rule that broke it, before the winner. */
    tieMs: 2_600,
    /** After the last block, before the winner, when there was no tie. */
    winnerLeadMs: 700,
    /** The winner and the congratulations, before the next office. */
    winnerMs: 3_800,
    /** The whole result held after the last office, before the winners take office. */
    summaryMs: 1_500,
  },
  weight: {
    /** Votes every player has, before the parts below. */
    base: 1,
    /** One extra vote per this many plots owned. */
    plotsPerVote: 10,
    /** Reputation at or above this adds a vote. */
    repHigh: 70,
    /** Reputation below this takes a vote away. */
    repLow: 30,
    /** Votes a high reputation adds, and a low one takes away. */
    repVotes: 1,
    /** Extra votes for the month's Land Baron. */
    baronVotes: 1,
    /** One extra vote per this much sales tax paid over the game, up to taxCap votes. */
    taxPerVote: 300,
    taxCap: 2,
  },
  /** The sales tax the Governor may set, in whole percent, and how far it may move from the month's starting rate. */
  tax: { min: 0, max: 15, maxStep: 5 },
  /** Paid from the colony fund to each officeholder at upkeep, as far as the fund reaches. */
  pay: { governor: 50, sheriff: 30 },
  /**
   * Worth per term served in either office: about one good month's income, the median monthly Worth gain of a
   * top-half player with politics on (1,150-1,222 on the sim's three sets, 28 Oct). No AI choice and no sim check
   * reads it; it moves only who wins.
   */
  termScore: 1200,
  /** How Classic AI seats run, vote and set the tax (VoteHand). Placeholders until the sim balances them. */
  ai: {
    /** Ms a seat waits before acting in announce or the ballot, drawn per stage: a human's pause. */
    actMs: [800, 2_500] as [number, number],
    /** A seat decides whether to run in the first planning phase at most this many months before an election month; in month 1, at the last call. */
    declareLeadMonths: 1,
    /** Chance per election that a persona runs for Governor. */
    runGovernor: { trader: 0.5, cautious: 0.3, aggressive: 0.8, saboteur: 0.6 } satisfies Record<AiPersonaId, number>,
    /** Chance it runs for Sheriff when it does not run for Governor. */
    runSheriff: { trader: 0.3, cautious: 0.4, aggressive: 0.3, saboteur: 0.7 } satisfies Record<AiPersonaId, number>,
    /** The sales tax in whole percent a persona steers toward as Governor. */
    taxTarget: { trader: 5, cautious: 4, aggressive: 8, saboteur: 10 } satisfies Record<AiPersonaId, number>,
    /** Whole percent a Governor adds when the colony fund is low. */
    taxFundBump: 2,
    /** The fund is low under this many months of the elected offices' pay. */
    fundMonths: 3,
  },
};

/**
 * The goods auction, played live as in the original: goods come up one at a
 * time, each with a status screen and then a walk. Times are in
 * milliseconds of game time; the server steps the auction on a fixed tick.
 */
export const WALK = {
  /** The order goods come up in: raw goods first, then processed ones. */
  order: ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'alloy', 'electronics', 'medicine'] as Good[],
  /** The status screen before each good: what everyone had, used, made and is short of, and where each player picks a side for the walk. */
  statusMs: 8_000,
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
  /** And this share of the posted price more, so a board whose price lines sit close together still has room to walk. */
  boardPostedMargin: 0.1,
  /** How often the server steps the auction. */
  tickMs: 100,
};

/**
 * The land auction, after the land grant: plots and MULEs players listed in
 * planning come up one at a time, each with an intro, a walk and a result.
 * The walk reuses WALK's speed and tick; the highest bid at the bell wins.
 */
export const LOTS = {
  /** Lots one player may list in a month. */
  perPlayer: 2,
  /** Lots the land auction takes in a month, from all sellers together. */
  maxLotsPerMonth: 4,
  /** The intro: the lot lit on the map with its seller and minimum. */
  introMs: 3_000,
  /** The walk's clock for one lot. */
  walkMs: 12_000,
  /** The result on screen before the next lot comes up. */
  resultMs: 2_500,
  /** The board runs from this share of the minimum (where buyers start) to boardHigh's. */
  boardLow: 0.7,
  boardHigh: 2,
  /** Past the board's top the walk speeds up by this much for the rest of the lot, so a contested lot can reach its runner-up's price before the bell. */
  fastClimb: 2,
  /** A change of leader with less than this left on the walk clock sets it back to this, so the bell doesn't decide who wins. */
  lateMs: 2_000,
  /** The most those resets may add to one lot's walk. */
  lateCapMs: 6_000,
  /** What the store pays for an unsold plot, as a share of GAME.plotScore, so it can't drift past the score. */
  storePlotShare: 2 / 3,
  /** What the store pays for an unsold MULE, as a share of this month's MULE price. */
  storeMuleShare: 0.5,
  /** The chance, each month, that the colony puts one free plot up after the land grant. Heiko's range: 1/10 to 1/8. */
  colonyPlotChance: 0.1,
  /** The colony plot's minimum, as a share of GAME.plotScore: what the store would pay for land. */
  colonyPlotShare: 2 / 3,
  /** An AI seat presses Done on a lot's intro after this long. */
  aiIntroMs: [400, 1_200] as [number, number],
  /** An AI seat first moves this long after a lot's walk starts, scaled by its patience. */
  aiStartMs: [300, 1_200] as [number, number],
  /** An AI's overtake goes past the leader by this share of the gap to its limit, drawn per overtake. */
  aiOvershoot: [0.1, 0.35] as [number, number],
};

/**
 * The longest each timed phase lasts, in milliseconds at phaseScale 1. Planning waits for every human's Ready,
 * a dropped phone's too, unless the host continues. Other phases also end early: when every connected player is
 * ready, the land grant after its one pass or once the claims are used, development when everyone is out of time or at the pub. The
 * goods auction and the land auction have no fixed length; they run on WALK's and LOTS' clocks.
 */
export const PHASES = {
  /**
   * Planning: the hub, listings, and in election months the election first. null: planning waits for every player's
   * Ready or the host's Continue; a number restores a timer.
   */
  planningMs: null as number | null,
  /**
   * The land grant: the light passes once over the free plots, GAME.grantTickMs a plot. null: no clock; it ends after
   * the pass or once every claim is used. A number restores a timer.
   */
  landGrantMs: null as number | null,
  /**
   * The land grant's fast-forward: once every human has used their claims or is done with land, the AI seats' presses
   * resolve at once at each lit plot, and the light moves on after this display step, so it races across the TV. Like
   * the grant's tick, phaseScale never changes it.
   */
  grantFastForwardMs: GAME.grantTickMs / 8,
  /** Production: the show of what each plot made. */
  productionMs: 15_000,
  /**
   * Upkeep, the month end: colonists eat and goods spoil, and the table reads the league table. null: it waits for
   * every player's Ready ("On to month N") or the host's Continue; a number restores a timer.
   */
  upkeepMs: null as number | null,
};

/** How big an event's story is on the TV: a headline, a spotlight, or one line of a shared roll call. */
export type EventWeight = 'headline' | 'spotlight' | 'bulletin';

/** How long the production show plays each month event, and how far production stretches to fit them. */
export const EVENT_SHOW = {
  /** How big each event's story is on the TV; a key missing here plays as a headline. */
  weight: {
    dustStorm: 'headline',
    drought: 'headline',
    acidRain: 'headline',
    solarFlare: 'headline',
    cometPass: 'headline',
    flood: 'headline',
    volcanicAsh: 'headline',
    pestSwarm: 'spotlight',
    wildfire: 'spotlight',
    bumperHarvest: 'spotlight',
  } as Partial<Record<EventKey, EventWeight>>,
  /** How long one headline or spotlight plays, in ms. */
  playMs: { headline: 7_000, spotlight: 5_200 },
  /** How long the intro (the phase's opening card of what fired) plays before the first event, in ms; none in a quiet month. */
  introMs: 1_800,
  /** How long the one roll call that every bulletin of a phase shares plays, in ms. */
  rollCallMs: 4_000,
  /** The event window production's 15 s show already has; only time beyond it lengthens production. */
  productionWindowMs: 4_800,
  /** The most the events of one phase may play in all, in ms; past it each is cut in proportion. */
  capMs: 30_000,
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
  /** Allowed to corner a good (a monopoly try). Rookie never does. */
  corners: boolean;
  /** Allowed to act on spite against the leader. Rookie never does. */
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
/**
 * Production events: at most one a month, rolled at production from the seed.
 * Each event's numbers sit under its key; the weights decide which event fires
 * among those that would hit at least one plot.
 */
export const EVENTS = {
  /** Chance that a month has an event at all. */
  chance: 0.5,
  /** No event before this month: there is nothing developed to hit. */
  firstMonth: 2,
  /** Chance a bad personal event starts on the leader's land, a good one on the trailing player's; otherwise anyone's. */
  targetBias: 0.5,
  weights: {
    dustStorm: 1,
    drought: 1,
    acidRain: 1,
    solarFlare: 1,
    cometPass: 1,
    flood: 1,
    volcanicAsh: 1,
    pestSwarm: 1,
    wildfire: 1,
    bumperHarvest: 1,
  },
  /** Share of an Energy plot's output a dust storm takes. */
  dustStorm: { cut: 0.5 },
  /** Food and Water each Food and Water plot loses in a drought. */
  drought: { loss: 1 },
  /** Energy and Food each such plot loses to acid rain. */
  acidRain: { loss: 1 },
  /** Energy each Energy plot gains from a solar flare. */
  solarFlare: { gain: 2 },
  /** Water each Water plot gains from a comet pass. */
  cometPass: { gain: 2 },
  /** Plots within this many steps of the origin lose this much of their good to ash. */
  volcanicAsh: { radius: 2, loss: 1 },
  /** Share of a Food plot's output pests eat, and the most plots a swarm reaches. */
  pestSwarm: { cut: 0.5, maxPlots: 4 },
  /** The burnt plot makes nothing; the rest of its owner's Food cluster loses this much. */
  wildfire: { loss: 1 },
  /** How many times its usual output the bumper plot makes. */
  bumperHarvest: { factor: 2 },
  /**
   * Player events (Heiko's event model): each rolls per player at the start of each phase it lists, with that
   * phase's chance plus its modifiers, never above cap. Several can fire in a month.
   */
  player: {
    /**
     * Sickness, at development start: the colonist walks at DEV_WALK.sickPace this turn unless it holds a Medicine,
     * which it then takes. Likelier in dirty air (by band) and for a polluter: perPoint for each air point its plots
     * caused last month (a filter halves them), at most max. Heiko's catalogue numbers.
     */
    sickness: {
      phases: { development: 0.03 },
      air: { clean: 0, smoggy: 0.15, toxic: 0.3, collapse: 0.5 },
      pollution: { perPoint: 0.03, max: 0.4 },
      cap: 0.9,
    },
  },
};

export const STRATEGIST = {
  /** Months of output it counts a MULE as earning, at most. */
  horizon: 6,
  /** Each later month counts this share of the one before. */
  discount: 0.9,
  /**
   * Credits of gain that score 0.75 on the gain curve (0 scores 0.5). A plot's gain over the game runs to
   * several thousand, so its scale is wide: at 400 every plot above about 1,200 scored the same.
   */
  gainScale: { plot: 1200, develop: 300, trade: 80 },
  /** Cash it always keeps back, before the persona's reserve multiplier, plus the cost of next month's Food, Water and Energy shortfall. */
  cashFloor: 60,
  /** What one colony air point costs it, in credits, rising as the air gets dirtier (doubles by Smoggy). */
  airCost: 10,
  /** What it counts a green belt as costing a month, in credits (the engine charges none), set against the air it cleans; without full scoring, the cost alone. */
  greenBeltCost: 5,
  /**
   * The land grant is one pass, so a lit plot is weighed against the free plots still ahead of the light: its utility
   * must be at least this share of the best of theirs to be pressed for.
   */
  grantShare: 0.75,
  /**
   * Beyond the claims it has left, how many more of its top plots still ahead of the light it presses for. 0: it
   * presses only for plots it would claim with the claims it has left.
   */
  grantSpare: 0,
  /** A factory needs this many months of its inputs on hand or from its own plots. */
  factoryInputMonths: 2,
  /** Spare Food, Water, Energy and Medicine it keeps over next month's need, before the reserve multiplier. */
  keepSpare: { food: 1, water: 1, energy: 1, medicine: 0 } as Partial<Record<Good, number>>,
  /** It analyses an unknown plot of its own when the plot's best and second-best uses are this close, as a share. */
  analyseWhenClose: 0.25,
  /** Analyses per month, at most, and never with less than this many seconds left. */
  analysesPerMonth: 2,
  analyseMinSeconds: 20,
  /** Analyses per month, at most, at a level without full scoring (Rookie), in place of analysesPerMonth. */
  rookieAnalyses: 1,
  /** It fits filters once the air is within this many points of Smoggy, and only to polluters of more than filterOverAir air points a month. */
  filterAirMargin: 10,
  filterOverAir: 1,
  /** Share of its money it spends on one good at the auction, at most. */
  budgetShare: 0.5,
  /**
   * A developed plot counts in the final score at the MULE price; it counts this share of that as won back. A price
   * in a sell-out doesn't last to the game's end, so counting most of it made a MULE bought while the corral was
   * short look cheaper than it is.
   */
  residual: 0.6,
  /** What a second of development time is worth, with idle land to work and without. */
  secondValue: { busy: 10, idle: 3 },
  /** Share it takes off next month's price for a good it would hold, per point of risk weight, because the forecast may be wrong. */
  forecastHaircut: 0.05,
  /** And this share more off a unit it would buy only to resell, per point of risk weight. */
  resaleRisk: 0.1,
  /** A corner pays this share over next month's price for the units the others are short of. */
  cornerPremium: 0.5,
  /** It corners only a good that spoils less than this share a month, and at most this many units. */
  cornerMaxSpoilage: 0.5,
  cornerMaxUnits: 6,
  /**
   * Spite: while the leader is short of the good, it bids this share of next month's price, times its spite, over its
   * own value for at least the next spiteUnits units (all the cornered ones while it corners).
   */
  spiteShare: 0.1,
  spiteUnits: 2,
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
   * much, and keeping cashLeftFull times the reserve scores 1. The reserve itself is a hard
   * rule, so this is only a mild preference for cash in hand.
   */
  cashLeftFloor: 0.75,
  cashLeftFull: 2,
  /** The land plan's considerations (landDecision), besides gainScale.plot. */
  land: {
    /** "Known ground": what a plot it hasn't analysed scores; an analysed one scores 1. */
    unknownGround: 0.8,
    /** "Next to my land": `full` of its own plots beside a plot score 1, never under `floor`; weighted clusterWeight in the cluster plan, else `weight`. */
    nextToMine: { full: 2, floor: 0.6, clusterWeight: 2, weight: 0.5 },
    /** "Blocks the leader": `full` of the leader's plots beside a plot score 1, never under `floor`; weighted by spite, at least minWeight. */
    blocksLeader: { full: 2, floor: 0.4, minWeight: 0.5 },
    /** "Feeds me": what a plan scores while its Food and Energy are covered, and, while they are short, any plan but farms first (which scores 1). */
    feedsMe: { covered: 0.75, short: 0.6 },
    /** "Can develop it": cash over the reserve scores 1 at `mules` MULE prices; weighted factoryWeight in the factory plan, else `weight`. */
    canDevelop: { mules: 2, factoryWeight: 1, weight: 0.3 },
    /** "Hurts the leader": what the plan that fences in the leader scores. */
    hurtsLeader: 0.7,
  },
  /** The development decision's considerations (developDecision), besides gainScale.develop and the cash left. */
  develop: {
    /** "Known ground": what an idle plot it hasn't analysed scores; an analysed one scores 1. */
    unknownGround: 0.75,
    /** "Feeds me": what a MULE that doesn't cover its own Food or Energy scores (one that does scores 1); weighted this share of the persona's reserve. */
    feedsMe: { other: 0.8, reserveShare: 0.5 },
  },
  /** The auction's trade decision (tradeDecision, expectedPrices), besides gainScale.trade and the cash left. */
  trade: {
    /** "Sure thing": what a sale scores, a buy of what it needs, and a buy partly to resell (a forecast); a pass scores 1. */
    sure: { sell: 0.9, need: 0.9, resale: 0.6 },
    /** Selling, it also offers to keep a buffer: this share of next month's need, at least 1 unit, over what it would keep. */
    bufferShare: 0.5,
    /** It expects a sale to fetch at least this share of the posted price, whoever buys. */
    sellFloor: 0.85,
  },
};

/** The AI's hands in the real-time phases. Times are in ms. */
export const AI_HANDS = {
  /** How often AI hands act during development, in the server and the simulator alike. */
  devTickMs: 100,
  /** Development steps, as a quick human taps them: to the corral and buy, to an outfitter, out to the plot and install, analyse, the pub. */
  develop: {
    /** Buying and installing where the game has no walking: each includes a notional walk. */
    buyMs: [1_400, 2_400] as [number, number],
    outfitMs: [1_000, 1_900] as [number, number],
    installMs: [1_800, 3_200] as [number, number],
    /** The same two taps where the game walks (DEV_WALK charges the walk): the tap alone. */
    buyTapMs: [600, 1_000] as [number, number],
    installTapMs: [600, 1_200] as [number, number],
    analyseTapMs: [1_200, 2_000] as [number, number],
    filterMs: [1_200, 2_000] as [number, number],
    pubMs: [800, 1_500] as [number, number],
    /** The most it waits for its decider before it plays its own top option. */
    decideWaitMs: 2_500,
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

/**
 * The balance targets `pnpm sim` checks, from the design doc's Economy model tab, each named for its check. Shares are
 * of months or of games, as the check says; the report prints the targets from here.
 */
export const SIM_TARGETS = {
  /** MULE price median: from min to max credits. */
  muleMedian: { min: 150, max: 300 },
  /** MULE price 90th percentile: under this many credits. */
  mule90th: 500,
  /** Corral sold out: in under this share of months. */
  corralSoldOut: 0.1,
  /** Food above `factor` times its reference price: in this share of games, from min to max. */
  foodSpike: { factor: 3, min: 0.1, max: 0.5 },
  /** Colonists short of Food or Water: in under this share of months. */
  colonistsShort: 0.15,
  /** Owned plots developed at the end: this share or more. */
  developed: 0.7,
  /** No game has an AI broke, under `below` credits with idle land, for `months` months in a row. */
  broke: { below: 100, months: 3 },
  /** Ended in Collapse: in this share of games or fewer. */
  collapsed: 0.1,
};

/** The language model that decides for Smart AI seats, and its limits. */
export const BRAIN = {
  /** The model that decides and talks. */
  model: 'claude-haiku-5-5',
  /** A Smart seat's model budget per game, in US dollars; past it the seat plays Classic. */
  seatBudgetUsd: 0.06,
  /** Hard ceiling, in US dollars, for the latency spike command. */
  spikeCapUsd: 0.05,
  /** US dollars per million tokens. */
  pricesPerMTok: { input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 },
  /** Reply cap, in tokens. */
  maxTokens: 200,
  /**
   * Prompt characters per token, as the budget assumes. Haiku 5.5 measured 2.56 to 2.65 on real prompts; this sits
   * below the lowest so the worst case never undercounts.
   */
  charsPerToken: 2.5,
  /** Longest chat line an AI says, in characters. */
  maxLineChars: 140,
  /** Most chat lines per AI seat per game month: one each for land, development and the auction, since a seat says at most one a phase. */
  linesPerMonth: 3,
  /** Longest quoted table-talk line put in a prompt, in characters. */
  maxTalkChars: 200,
  /** How many of the latest table-talk lines an AI keeps for its next prompt; each one costs prompt tokens. */
  talkLines: 6,
  /** How long a land decision may wait for the model, in ms; planning lasts up to 45 s. */
  landTimeoutMs: 5_000,
} as const;
