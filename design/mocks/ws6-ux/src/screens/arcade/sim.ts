import { DEV_WALK, DEVELOPMENT, MULE, SPECIES_PERK, type Species, type Terrain } from '@mule/engine';
import type { TileView } from '@mule/protocol';
import { glintReach, racing, spawnGlint, stepGlint, winGlint, type Glint } from './glint';
import { afterSale, racingScramble, spawnScramble, stepScramble, type Scramble } from './scramble';
import { fitsDetour } from './spare';
import { botWolfInput, endBolt, rollWolves, spawnPack, stepBolts, stepEncounter, WOLF_LAND, wolfReach, type Encounter } from './wolves';

/**
 * Arcade development: the functional core. Pure and seeded: `step(world, inputs, dtMs, tunables)` returns the next
 * world and reads no clock, no Math.random and no DOM, so one seed plus the inputs replays a turn. The shell
 * (loop.tsx) runs it at a fixed 60 Hz and every view on the page draws the same world.
 *
 * Two spaces: the colony map, in tiles, and the store hall, in hall units on a 4:3 floor (every view draws the hall at
 * that aspect, so a step is the same length across and down). Movement is continuous: speed × terrain × condition pace.
 * Slice 2's wolves live in wolves.ts and come through the world's event queue.
 */

export type Space = 'map' | 'hall';
export interface P {
  x: number;
  y: number;
}
export type WalkTerrain = Exclude<Terrain, 'store'>;
/** The four outfitters slice 1 opens (Heiko's loop); Water, Rare earth and the works stay shut. */
export const ARCADE_OUTFITS = ['food', 'energy', 'smithore', 'crystite'] as const;
export type ArcadeOutfit = (typeof ARCADE_OUTFITS)[number];
export type LakeMode = 'wade' | 'shore';
/** A bot's skill in a wolf fight. */
export type BotLevel = 'rookie' | 'regular' | 'veteran';
export const BOT_LEVELS: BotLevel[] = ['rookie', 'regular', 'veteran'];

// --- Tunables ----------------------------------------------------------------------------------

/** Every speed, price and frequency the arcade uses: Heiko changes them while playing (Tunables.tsx). */
export interface Tunables {
  /** Tiles a second on plains at full pace: today's DEV_WALK.tileSeconds, turned round. */
  mapTilesPerSecond: number;
  /** Seconds from the store door to the corral at full pace: today's DEV_WALK.floorSeconds. */
  floorSeconds: number;
  /** Share of full speed on each land; 0 is impassable. The lake's is its wading speed (questions.lakeMode). */
  terrain: Record<WalkTerrain, number>;
  hungerPaceMin: number;
  sickPace: number;
  zipwingSpeed: number;
  /** Share of your speed while you lead a MULE: 1 is no drag (Heiko's question 1). */
  leadPace: number;
  /** How far behind you the MULE walks, in tiles on the map. */
  leadTiles: number;
  devSeconds: number;
  /** The MULE's price is MULE.labour + MULE.smithorePerMule × this (engine mulePrice). */
  smithorePrice: number;
  storeMules: number;
  outfit: Record<ArcadeOutfit, number>;
  /** How long a bot stands at a counter before it presses its action. */
  botThinkSeconds: number;
  /** A bot joins a glint race or the scramble only if its errand still fits in the time left after the detour. */
  botsSpareTime: boolean;
  seats: Record<string, { food: number; need: number; sick: boolean; money: number }>;
  /** Heiko's answers to slice 1's open questions, each a switch so no answer needs a rebuild. */
  questions: {
    mountainsImpassable: boolean;
    lakeMode: LakeMode;
    /** Others' plots: walk across them, or they block you like a lake. */
    trespass: boolean;
    /** Share of what a MULE cost you that the pub pays back when you walk in leading it. */
    pubRefund: number;
    /** Bots walk at this times the human rules. */
    botSpeed: number;
  };
  /** Slice 2: wolves (Heiko's G-3). */
  wolves: {
    on: boolean;
    /** Chance a second, on forest, hills or tundra, that a pack comes for a colonist. */
    chancePerSecond: number;
    packSize: number;
    /** No second pack for the same colonist for this long. */
    cooldownSeconds: number;
    /** Time to pick run or fight before they pounce (a fight). */
    chooseSeconds: number;
    chaseSpeed: number;
    giveUpSeconds: number;
    giveUpTiles: number;
    /** Your speed once bitten, till you reach the store or your own plot. */
    bittenPace: number;
    fightSeconds: number;
    lungeEverySeconds: number;
    /** The crouch that warns of a lunge: the time you have to dodge. */
    warnSeconds: number;
    strikesToWin: number;
    bitesToLose: number;
    pelts: number;
    peltPrice: number;
    /** A lost fight with no MULE on the lead costs this much time instead. */
    stunSeconds: number;
    boltTiles: number;
    boltSpeed: number;
    /** Share of bots that fight rather than run. */
    botFightShare: number;
    /** Each bot level's chance to dodge a lunge, and how long it takes to strike at a wolf that stands open. */
    levels: Record<BotLevel, { dodge: number; strikeDelaySeconds: number }>;
    /** Share of a bot's legs (store, plot, pub) that prefer a path through forest, hills or tundra. */
    botWolfLandShare: number;
  };
  /** Slice 3: the glint race (Heiko's G-3). */
  glint: {
    on: boolean;
    /** Mean seconds between glints, while none is lit. */
    meanGapSeconds: number;
    showSeconds: number;
    /** Whether a glint may light someone's plot (never a lake or the store). */
    onOwnedPlots: boolean;
    prize: 'crystite' | 'credits';
    crystite: number;
    credits: number;
    /** Share of bots that race for a glint. */
    botShare: number;
    /** How much a bot cares: it races only for a glint within this many tiles. */
    botCare: number;
  };
  /** Slice 4: the corral scramble (Heiko's G-3). The corral's starting stock is storeMules. */
  scramble: {
    on: boolean;
    /** It starts when a sale leaves the corral with this many MULEs or fewer. */
    mulesLeft: number;
    /** It ends after this long, if the corral has not emptied first. */
    maxSeconds: number;
    /** Share of bots still needing a MULE that drop their errand and race. */
    botShare: number;
    /** How much a bot cares: it races only from within this many tiles of the store. */
    botCare: number;
  };
}

export const DEFAULT_TUNABLES: Tunables = {
  // Heiko after playing slice 2 (29 Oct): half of today's 1 / DEV_WALK.tileSeconds. Terrain multipliers unchanged.
  mapTilesPerSecond: 0.5 / DEV_WALK.tileSeconds,
  floorSeconds: DEV_WALK.floorSeconds,
  // Plains are the yardstick; mountains and swamp are Heiko's two slow ones; the rest are the mock's judgement.
  terrain: {
    plains: 1,
    desert: 0.9,
    tundra: 0.85,
    forest: 0.75,
    ice: 0.75,
    crater: 0.8,
    hills: 0.7,
    volcanic: 0.6,
    river: 0.6,
    swamp: 0.5,
    mountains: 0.4,
    lake: 0.3,
  },
  hungerPaceMin: DEV_WALK.hungerPaceMin,
  sickPace: DEV_WALK.sickPace,
  zipwingSpeed: SPECIES_PERK.zipwingSpeed,
  // Heiko (29 Oct): with a MULE in tow you walk at 90%.
  leadPace: 0.9,
  leadTiles: 0.55,
  devSeconds: DEVELOPMENT.fullSeconds,
  // 120 + 19 = 139 cr, the development audit's month-2 MULE.
  smithorePrice: 19,
  storeMules: 6,
  outfit: { food: MULE.outfitCost.food, energy: MULE.outfitCost.energy, smithore: MULE.outfitCost.smithore, crystite: MULE.outfitCost.crystite },
  botThinkSeconds: 0.5,
  // Pending the PM's word: on, so a slow bot (Kai, sick) is not lured past the pub's closing by a glint.
  botsSpareTime: true,
  seats: {
    lena: { food: 3, need: 3, sick: false, money: 300 },
    ossa: { food: 4, need: 4, sick: false, money: 520 },
    brix: { food: 8, need: 10, sick: false, money: 410 },
    kai: { food: 3, need: 3, sick: true, money: 280 },
  },
  // Slice 1's behaviour, unchanged, until Heiko flips one.
  questions: { mountainsImpassable: false, lakeMode: 'shore', trespass: true, pubRefund: 0, botSpeed: 1 },
  wolves: {
    on: true,
    // Heiko (29 Oct): 0.1 a second on wolf land.
    chancePerSecond: 0.1,
    packSize: 3,
    cooldownSeconds: 20,
    chooseSeconds: 3,
    // Halved with the walk, so a run on wolf land can still get away.
    chaseSpeed: 1.1,
    giveUpSeconds: 5,
    giveUpTiles: 4,
    bittenPace: 0.5,
    fightSeconds: 10,
    lungeEverySeconds: 1.6,
    warnSeconds: 0.8,
    strikesToWin: 3,
    bitesToLose: 3,
    pelts: 2,
    peltPrice: 20,
    stunSeconds: 4,
    boltTiles: 4,
    boltSpeed: 3.5,
    botFightShare: 0.5,
    // A rookie mostly fails to dodge and strikes late in the opening; a veteran rarely does either.
    levels: {
      // Heiko (29 Oct): a rookie wins about 1 fight in 4 (17 of 60 headless fights at these values).
      rookie: { dodge: 0.4, strikeDelaySeconds: 0.5 },
      regular: { dodge: 0.6, strikeDelaySeconds: 0.35 },
      veteran: { dodge: 0.9, strikeDelaySeconds: 0.15 },
    },
    // Not slice 2's 0 (bots took the cheapest path and rarely met a pack): half their legs go through wolf land.
    botWolfLandShare: 0.5,
  },
  glint: { on: true, meanGapSeconds: 20, showSeconds: 8, onOwnedPlots: true, prize: 'crystite', crystite: 1, credits: 60, botShare: 0.75, botCare: 8 },
  scramble: { on: true, mulesLeft: 2, maxSeconds: 15, botShare: 0.9, botCare: 10 },
};

export const mulePrice = (t: Tunables) => Math.round(MULE.labour + MULE.smithorePerMule * t.smithorePrice);

// --- The world ---------------------------------------------------------------------------------

export interface Lead {
  /** What it was outfitted for; null while empty. */
  good: ArcadeOutfit | null;
  x: number;
  y: number;
  facing: 'left' | 'right';
  /** What it has cost its owner so far, MULE and outfit: what a pub refund is a share of. */
  paid: number;
}

export interface Colonist {
  id: string;
  name: string;
  slot: 0 | 1 | 2 | 3 | 4 | 5;
  species: Species;
  /** Driven by botInput inside step; Lena too on the TV's autopilot. */
  bot: boolean;
  /** A bot's skill in a wolf fight (Lena's when on autopilot). */
  level: BotLevel;
  space: Space;
  x: number;
  y: number;
  facing: 'left' | 'right';
  moving: boolean;
  mule: Lead | null;
  money: number;
  /** In the pub: this turn is over. */
  done: boolean;
  installs: number;
  /** A bot's pick at the outfitters, drawn from the seed. */
  plan: ArcadeOutfit;
  /** Ms a bot has stood at its counter. */
  botWait: number;
  /** Where it walked lately, newest last: the MULE on the lead walks it. */
  trail: P[];
  /** Wolf pelts carried, for the store to buy. */
  pelts: number;
  /** Caught by a chasing pack: slowed till the store or its own plot. */
  bitten: boolean;
  /** A lost fight with no MULE: frozen till then. */
  stunnedUntil: number;
  /** No new pack before this. */
  wolvesAfter: number;
  encounter: Encounter | null;
  /** Crystite units carried: the glint's prize. */
  crystite: number;
  /** The bot's current leg (where it is heading) and whether this leg prefers wolf land, drawn when the leg began. */
  leg: string;
  legWolf: boolean;
  /** On a wolf-land leg: the forest, hills or tundra tile the bot goes by first, till it has been there. */
  legVia: P | null;
  /** A review page's set-up: a bot stands still till then (#arcade-glint's racer waits for the glint). */
  waitUntil: number;
}

/** A MULE that bolted from a lost fight: it runs, then stands till its owner catches it. */
export interface Loose {
  owner: string;
  slot: Colonist['slot'];
  good: ArcadeOutfit | null;
  paid: number;
  x: number;
  y: number;
  dir: P;
  /** Tiles still to run. */
  left: number;
  facing: 'left' | 'right';
}

/** A wolf leaving after the moment is over: drawn running off, then gone. */
export interface Fleeing {
  x: number;
  y: number;
  vx: number;
  vy: number;
  until: number;
}

/** A short line the TV shows for a few seconds: "Wolves! Lena — run or fight?". */
export interface Beat {
  t: number;
  id: string;
  text: string;
  tone: 'alert' | 'warn' | 'ok';
}

/** Something happening on the world, queued by the seed: wolves now, the glint and the scramble in later slices. */
export type EventKind = 'wolves' | 'glint' | 'scramble';
export interface WorldEvent {
  atMs: number;
  kind: EventKind;
  /** Whom it comes for. */
  target?: string;
  /** Called by the review page: comes whatever the land and the cooldown. */
  forced?: boolean;
  /** A glint's tile, when called to a chosen one. */
  at?: P;
  /** A glint's racers, when called with chosen ones. */
  racers?: string[];
}

export interface World {
  t: number;
  seed: number;
  rng: number;
  month: number;
  width: number;
  height: number;
  store: P;
  tiles: TileView[];
  colonists: Colonist[];
  storeMules: number;
  queue: WorldEvent[];
  loose: Loose[];
  fleeing: Fleeing[];
  glint: Glint | null;
  /** No new glint rolls before this: a breather after one ends. */
  glintAfter: number;
  /** The corral scramble, while it runs and for a few seconds after, so everyone sees how it ended. */
  scramble: Scramble | null;
  /** Whether this turn's scramble has fired: it comes once a turn. */
  scrambled: boolean;
  beats: Beat[];
  /** Newest last: what happened, for the TV and the tests. */
  log: string[];
  over: boolean;
}

export interface Input {
  /** Each axis -1..1; a joystick may give less than 1 to walk slower. */
  dir: P;
  /** Pressed this step. */
  action: boolean;
  /** Mouse held on a spot of this space: walk toward it. Wins over dir when set. */
  toward?: (P & { space: Space }) | null;
}
export const IDLE: Input = { dir: { x: 0, y: 0 }, action: false };

// --- Seeded randomness (mulberry32, the engine's, kept as a number in the world so step stays pure) ---

export function rand(state: number): [number, number] {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/** One draw from the world's stream: the value and the world with its stream advanced. */
export function draw(w: World): [number, World] {
  const [u, rng] = rand(w.rng);
  return [u, { ...w, rng }];
}

/** Where each slice plugs in: a handler per kind, wolves (2), the glint (3) and the scramble (4). */
export const EVENT_HANDLERS: Partial<Record<EventKind, (w: World, e: WorldEvent, tun: Tunables) => World>> = { wolves: spawnPack, glint: spawnGlint, scramble: spawnScramble };

export interface Seat {
  id: string;
  name: string;
  slot: Colonist['slot'];
  species: Species;
  bot: boolean;
  level: BotLevel;
  start: P;
}

/** No glint in the turn's first seconds: the turn opens with the errands. */
const FIRST_GLINT_MS = 6000;

export function initWorld(seed: number, seats: Seat[], tiles: TileView[], size: { width: number; height: number; month: number }, tun: Tunables): World {
  let rng = seed >>> 0;
  const colonists = seats.map((s): Colonist => {
    const [u, n] = rand(rng);
    rng = n;
    return {
      id: s.id, name: s.name, slot: s.slot, species: s.species, bot: s.bot, level: s.level,
      space: 'map', x: s.start.x + 0.5, y: s.start.y + 0.5, facing: 'right', moving: false, mule: null,
      money: tun.seats[s.id]?.money ?? 0, done: false, installs: 0,
      plan: ARCADE_OUTFITS[Math.floor(u * ARCADE_OUTFITS.length)]!, botWait: 0, trail: [],
      pelts: 0, bitten: false, stunnedUntil: 0, wolvesAfter: 0, encounter: null, crystite: 0, leg: '', legWolf: false, legVia: null, waitUntil: 0,
    };
  });
  const store = tiles.find((t) => t.terrain === 'store')!;

  return {
    t: 0, seed, rng, month: size.month, width: size.width, height: size.height, store: { x: store.x, y: store.y },
    tiles, colonists, storeMules: tun.storeMules, queue: [], loose: [], fleeing: [], glint: null, glintAfter: FIRST_GLINT_MS, scramble: null, scrambled: false, beats: [], log: [], over: false,
  };
}

export const say = (w: World, c: Pick<Colonist, 'name'>, line: string): string[] => [...w.log, `${(w.t / 1000).toFixed(1)}s ${c.name} ${line}`].slice(-60);
export const beat = (w: World, id: string, text: string, tone: Beat['tone']): Beat[] => [...w.beats, { t: w.t, id, text, tone }].slice(-12);

// --- Condition and speed -------------------------------------------------------------------------

export interface Pace {
  foodShare: number;
  hunger: number;
  sick: number;
  species: number;
  /** hunger × sickness, species aside: the DS Condition's conditionPace. */
  condition: number;
  /** All three. */
  total: number;
}

/** The engine's dev-walk pace (hungerPace × sickPace × the Zipwing's perk), linear in the Food held. */
export function paceOf(c: Pick<Colonist, 'id' | 'species'>, tun: Tunables): Pace {
  const s = tun.seats[c.id] ?? { food: 1, need: 1, sick: false, money: 0 };
  const foodShare = Math.min(1, s.food / Math.max(1, s.need));
  const hunger = 1 - (1 - tun.hungerPaceMin) * (1 - foodShare);
  const sick = s.sick ? tun.sickPace : 1;
  const species = c.species === 'zipwing' ? tun.zipwingSpeed : 1;
  return { foodShare, hunger, sick, species, condition: hunger * sick, total: hunger * sick * species };
}

/** The hall: 16 × 12 units, the 4:3 floor every view draws StoreInterior at. */
export const HALL = { w: 16, h: 12 };

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * DS-GAP: StoreInterior (packages/ui Store.tsx) lays its rooms out in % of the hall but exports no floor plan, so its
 * TOP, BOT, X0, X1, COL, BOTTOM and DOOR are mirrored here. If Store.tsx moves a room, this copy drifts: the DS should
 * export its plan for a free-walking colonist.
 */
const TOP = { y0: 3, y1: 39 };
const BOT = { y0: 60, y1: 97 };
const X0 = 9;
const X1 = 91;
const COL = (X1 - X0) / 6;
const SHOP_ORDER = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'] as const;
const BOTTOM = { works: [9, 36], greenBelt: [37, 46], corral: [47, 73], pub: [74, 91] } as const;

export type HallRoom = (typeof SHOP_ORDER)[number] | keyof typeof BOTTOM | 'doorL' | 'doorR';

/** Each room's box in % of the hall, as StoreInterior draws it. */
export const ROOMS: Record<HallRoom, Rect> = {
  ...(Object.fromEntries(SHOP_ORDER.map((g, i) => [g, { x0: X0 + COL * i + 0.4, x1: X0 + COL * (i + 1) - 0.4, y0: TOP.y0, y1: TOP.y1 }])) as Record<(typeof SHOP_ORDER)[number], Rect>),
  ...(Object.fromEntries(Object.entries(BOTTOM).map(([k, [x0, x1]]) => [k, { x0, x1, y0: BOT.y0, y1: BOT.y1 }])) as Record<keyof typeof BOTTOM, Rect>),
  doorL: { x0: 0.6, x1: 7.6, y0: 30, y1: 70 },
  doorR: { x0: 92.4, x1: 99.4, y0: 30, y1: 70 },
};
export const OPEN_ROOMS: HallRoom[] = ['food', 'energy', 'smithore', 'crystite', 'corral', 'pub', 'doorL', 'doorR'];

/** The body's clearance from walls, in % of the hall. */
const MX = 1.5;
const MY = 3;
/**
 * Where a colonist's feet may stand: the walkway, the doorways, and each open room, which overlaps the walkway by a
 * little so you walk straight in. Shut rooms are walls.
 */
const WALKABLE: Rect[] = [
  { x0: 3, x1: 97, y0: TOP.y1 + MY, y1: BOT.y0 - MY },
  { x0: 0.2, x1: 8, y0: 30 + MY, y1: 70 - MY },
  { x0: 92, x1: 99.8, y0: 30 + MY, y1: 70 - MY },
  ...OPEN_ROOMS.filter((r) => r !== 'doorL' && r !== 'doorR').map((r) => {
    const b = ROOMS[r];
    return b.y1 <= TOP.y1
      ? { x0: b.x0 + MX, x1: b.x1 - MX, y0: b.y0 + MY, y1: TOP.y1 + MY + 1 }
      : { x0: b.x0 + MX, x1: b.x1 - MX, y0: BOT.y0 - MY - 1, y1: b.y1 - MY };
  }),
];
const inRect = (r: Rect, x: number, y: number) => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
const pct = (p: P): P => ({ x: (p.x / HALL.w) * 100, y: (p.y / HALL.h) * 100 });
const units = (x: number, y: number): P => ({ x: (x / 100) * HALL.w, y: (y / 100) * HALL.h });
const walkable = (p: P) => {
  const q = pct(p);
  return WALKABLE.some((r) => inRect(r, q.x, q.y));
};

/** The room a point in the hall stands in, or null on the walkway. */
export function roomAt(p: P): HallRoom | null {
  const q = pct(p);
  for (const r of Object.keys(ROOMS) as HallRoom[]) if (inRect(ROOMS[r], q.x, q.y)) return r;
  return null;
}

/** Inside each door, and in front of the corral: StoreInterior's SPOT, so the floor crossing is today's. */
const DOOR_SPOT = { doorL: units(4.5, 50), doorR: units(95.5, 50) };
const CORRAL_SPOT = units(60, 54);
const HALL_CROSS = Math.hypot(CORRAL_SPOT.x - DOOR_SPOT.doorL.x, CORRAL_SPOT.y - DOOR_SPOT.doorL.y);
/** Seconds to cross the store floor once at full pace: the tunable itself, for the reckoning in spare.ts. */
export const HALL_CROSS_SECONDS = (tun: Tunables) => tun.floorSeconds;

/** Map clearance in tiles, and the band of the store's left and right faces that is its door. */
export const R = 0.18;
const DOOR_BAND = 0.25;

export function tileAt(w: World, x: number, y: number): TileView | undefined {
  if (x < 0 || y < 0 || x >= w.width || y >= w.height) return undefined;
  return w.tiles[Math.floor(y) * w.width + Math.floor(x)];
}

/** A land's share of full speed under Heiko's switches: impassable mountains, and lakes waded or not. */
export function terrainMult(tun: Tunables, t: Terrain): number {
  if (t === 'store') return 1;
  if (t === 'mountains' && tun.questions.mountainsImpassable) return 0;
  if (t === 'lake' && tun.questions.lakeMode === 'shore') return 0;
  return tun.terrain[t];
}

/** Whether a colonist may set foot on a tile: its land, and (trespass off) whose it is. */
export function tileOpen(tun: Tunables, t: TileView, who: string | null): boolean {
  if (terrainMult(tun, t.terrain) <= 0) return false;
  if (!tun.questions.trespass && who && t.owner && t.owner !== who) return false;
  return true;
}

export interface Speed {
  /** Tiles a second on the map, hall units a second in the store. */
  perSecond: number;
  /** The land underfoot, or null in the store. */
  terrain: Terrain | null;
  ground: number;
  pace: Pace;
  lead: number;
  bitten: number;
  bot: number;
}

export function speedOf(w: World, c: Colonist, tun: Tunables): Speed {
  const pace = paceOf(c, tun);
  const lead = c.mule ? tun.leadPace : 1;
  const bitten = c.bitten ? tun.wolves.bittenPace : 1;
  const bot = c.bot ? tun.questions.botSpeed : 1;
  const stunned = c.stunnedUntil > w.t ? 0 : 1;
  const k = pace.total * lead * bitten * bot * stunned;
  if (c.space === 'hall') return { perSecond: (HALL_CROSS / Math.max(0.05, tun.floorSeconds)) * k, terrain: null, ground: 1, pace, lead, bitten, bot };
  const t = tileAt(w, c.x, c.y)?.terrain ?? 'plains';
  // Standing on a tile you could not walk onto (a flag flipped under you) you still walk at its old speed, to get off.
  const ground = terrainMult(tun, t) || tun.terrain[t as WalkTerrain] || 1;
  return { perSecond: tun.mapTilesPerSecond * ground * k, terrain: t, ground, pace, lead, bitten, bot };
}

// --- Moving ------------------------------------------------------------------------------------

export const inStore = (w: World, x: number, y: number) => x > w.store.x - R && x < w.store.x + 1 + R && y > w.store.y - R && y < w.store.y + 1 + R;
const doorY = (w: World) => w.store.y + 0.5;
const inDoorBand = (w: World, y: number) => Math.abs(y - doorY(w)) < DOOR_BAND;

/**
 * Whether a body may stand at (x, y): inside the map, off the store, and every tile its corners touch open to it. The
 * tile it stands on now never blocks it, so a flag flipped under a colonist never traps it.
 */
export function passable(w: World, tun: Tunables, x: number, y: number, who: Colonist | null): boolean {
  if (x < R || y < R || x > w.width - R || y > w.height - R) return false;
  if (inStore(w, x, y)) return false;
  const hx = who ? Math.floor(who.x) : -1;
  const hy = who ? Math.floor(who.y) : -1;
  for (const [cx, cy] of [[x - R, y - R], [x + R, y - R], [x - R, y + R], [x + R, y + R]] as const) {
    const t = tileAt(w, cx, cy);
    if (!t) return false;
    if (t.x === hx && t.y === hy) continue;
    if (!tileOpen(tun, t, who?.id ?? null)) return false;
  }
  return true;
}

/** Just outside each of the store's doors on the map. */
export const doorOutside = (w: World, side: 'L' | 'R'): P => ({ x: side === 'L' ? w.store.x - R - 0.12 : w.store.x + 1 + R + 0.12, y: doorY(w) });

function mapMove(w: World, tun: Tunables, c: Colonist, dx: number, dy: number): { x: number; y: number; enter: 'L' | 'R' | null } {
  let { x, y } = c;
  const nx = x + dx;
  if (inStore(w, nx, y)) {
    const fromL = x <= w.store.x - R && dx > 0;
    const fromR = x >= w.store.x + 1 + R && dx < 0;
    if ((fromL || fromR) && inDoorBand(w, y)) return { x, y, enter: fromL ? 'L' : 'R' };
    // Pushing into the store's face near its door slides you onto the door, so it is easy to find.
    if ((fromL || fromR) && Math.abs(y - doorY(w)) < 0.5 && dy === 0) {
      const toward = Math.sign(doorY(w) - y) * Math.min(Math.abs(dx), Math.abs(doorY(w) - y));
      if (passable(w, tun, x, y + toward, c)) y += toward;
    }
  } else if (passable(w, tun, nx, y, c)) x = nx;
  const ny = y + dy;
  if (passable(w, tun, x, ny, c)) y = ny;
  return { x, y, enter: null };
}

function hallMove(c: Colonist, dx: number, dy: number): { x: number; y: number; exit: 'L' | 'R' | null } {
  let { x, y } = c;
  // Out through a doorway: judged on where the step would land, so a fast step past the threshold still leaves.
  const room = roomAt(c);
  const to = pct({ x: x + dx, y: y + dy });
  if (room === 'doorL' && to.x < 1.2) return { x, y, exit: 'L' };
  if (room === 'doorR' && to.x > 98.8) return { x, y, exit: 'R' };
  if (walkable({ x: x + dx, y })) x += dx;
  if (walkable({ x, y: y + dy })) y += dy;
  return { x, y, exit: null };
}

/** The point `len` back along the trail; the trail's oldest point when it is shorter. */
function alongTrail(trail: P[], head: P, len: number): P {
  let left = len;
  let a = head;
  for (let i = trail.length - 1; i >= 0; i--) {
    const b = trail[i]!;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d >= left) {
      const k = left / d;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    left -= d;
    a = b;
  }
  return a;
}

const leadLength = (space: Space, tun: Tunables) => (space === 'map' ? tun.leadTiles : tun.leadTiles * 2.2);

function follow(c: Colonist, tun: Tunables): Colonist {
  if (!c.mule) return c;
  const at = alongTrail(c.trail, c, leadLength(c.space, tun));
  const dx = at.x - c.mule.x;
  const facing = Math.abs(dx) < 0.002 ? c.mule.facing : dx > 0 ? 'right' : 'left';
  return { ...c, mule: { ...c.mule, x: at.x, y: at.y, facing } };
}

/** Into a new space: the trail starts afresh behind you, so the MULE comes through the door after you. */
function arrive(c: Colonist, space: Space, at: P, facing: 'left' | 'right', tun: Tunables): Colonist {
  const back = leadLength(space, tun) * (facing === 'right' ? -1 : 1);
  const behind = { x: at.x + back, y: at.y };
  return { ...c, space, x: at.x, y: at.y, facing, trail: [behind, at], mule: c.mule ? { ...c.mule, x: behind.x, y: behind.y, facing } : null };
}

// The store is safe ground: a bite heals at its door.
const enterHall = (c: Colonist, side: 'L' | 'R', tun: Tunables) => ({ ...arrive(c, 'hall', side === 'L' ? DOOR_SPOT.doorL : DOOR_SPOT.doorR, side === 'L' ? 'right' : 'left', tun), bitten: false });
const leaveHall = (w: World, c: Colonist, side: 'L' | 'R', tun: Tunables) => arrive(c, 'map', doorOutside(w, side), side === 'L' ? 'left' : 'right', tun);

// --- What the action button does -----------------------------------------------------------------

export type ReachKind = 'enter' | 'buy' | 'outfit' | 'leave' | 'install' | 'pub' | 'sell' | 'catch' | 'fight' | 'strike' | 'grab' | 'none';
export interface Reach {
  kind: ReachKind;
  /** The button's words, e.g. "BUY MULE"; with `detail`, e.g. "139 cr". */
  verb: string;
  detail?: string;
  /** False: dim, and pressing does nothing; the words say what to do instead. */
  enabled: boolean;
  /** The thing in reach, for the views to highlight and the mouse to click. */
  target?: { space: 'map'; door: 'L' | 'R' } | { space: 'map'; tile: P } | { space: 'map'; mule: P } | { space: 'hall'; room: HallRoom };
  outfit?: ArcadeOutfit;
}

const NAME: Record<ArcadeOutfit, string> = { food: 'FOOD', energy: 'ENERGY', smithore: 'SMITHORE', crystite: 'CRYSTITE' };
export const pubPayout = (w: World, tun: Tunables) => {
  const left = Math.max(0, tun.devSeconds * 1000 - w.t) / (tun.devSeconds * 1000);
  return Math.round(DEVELOPMENT.pub.base + (DEVELOPMENT.pub.start + w.month * DEVELOPMENT.pub.perMonth) * left);
};
export const refundOf = (c: Colonist, tun: Tunables) => (c.mule ? Math.round(c.mule.paid * tun.questions.pubRefund) : 0);
export const freePlotsOf = (w: World, id: string) => w.tiles.filter((t) => t.owner === id && !t.outfit);
/** A colonist's bolted MULE, running or standing: catch it whenever you reach it. */
export const looseOf = (w: World, id: string) => w.loose.find((m) => m.owner === id) ?? null;
const CATCH_REACH = 0.6;

/** Your own free lake plot beside the tile you stand on: in shore mode, INSTALL reaches into it. */
function shorePlot(w: World, c: Colonist, tun: Tunables): TileView | null {
  if (tun.questions.lakeMode !== 'shore') return null;
  const cx = Math.floor(c.x);
  const cy = Math.floor(c.y);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const t = tileAt(w, cx + dx, cy + dy);
    if (!t || t.terrain !== 'lake' || t.owner !== c.id || t.outfit) continue;
    // Close to it, not just on the tile beside it: within reach of its edge.
    const nx = Math.max(t.x, Math.min(t.x + 1, c.x));
    const ny = Math.max(t.y, Math.min(t.y + 1, c.y));
    if (Math.hypot(c.x - nx, c.y - ny) < 0.45) return t;
  }
  return null;
}

/** What pressing the action button would do right now, for this colonist. Never a menu: one thing, or a dim hint. */
export function reachOf(w: World, c: Colonist, tun: Tunables): Reach {
  if (w.over) return { kind: 'none', verb: 'DEVELOPMENT OVER', enabled: false };
  if (c.done) return { kind: 'none', verb: 'IN THE PUB', detail: 'turn over', enabled: false };
  if (c.stunnedUntil > w.t) return { kind: 'none', verb: 'STUNNED', detail: `${Math.ceil((c.stunnedUntil - w.t) / 1000)} s`, enabled: false };
  if (c.encounter) return wolfReach(w, c, tun);
  const grab = glintReach(w, c);
  if (grab) return grab;
  const price = mulePrice(tun);
  if (c.space === 'hall') {
    const room = roomAt(c);
    // Walking in with pelts, the store buys them before anything else.
    if (c.pelts > 0 && (room === null || room === 'doorL' || room === 'doorR'))
      return { kind: 'sell', verb: `SELL ${c.pelts} PELT${c.pelts > 1 ? 'S' : ''}`, detail: `${c.pelts * tun.wolves.peltPrice} cr`, enabled: true };
    if (room === 'doorL' || room === 'doorR') return { kind: 'leave', verb: 'LEAVE', detail: c.mule ? 'with your MULE' : 'to the colony', enabled: true, target: { space: 'hall', room } };
    if (room === 'pub') {
      const back = refundOf(c, tun);
      return { kind: 'pub', verb: 'PUB · END TURN', detail: `+${pubPayout(w, tun) + back} cr${c.mule ? (back ? ' · refund' : ' · MULE back') : ''}`, enabled: true, target: { space: 'hall', room } };
    }
    if (room === 'corral') {
      const target = { space: 'hall' as const, room };
      if (c.mule) return { kind: 'none', verb: c.mule.good ? 'MULE ON LEAD' : 'TO AN OUTFITTER', enabled: false };
      if (w.storeMules <= 0) return { kind: 'none', verb: 'SOLD OUT', enabled: false };
      if (c.money < price) return { kind: 'buy', verb: 'BUY MULE', detail: `need ${price} cr`, enabled: false, target };
      return { kind: 'buy', verb: 'BUY MULE', detail: `${price} cr`, enabled: true, target };
    }
    if (room && (ARCADE_OUTFITS as readonly string[]).includes(room)) {
      const g = room as ArcadeOutfit;
      const target = { space: 'hall' as const, room };
      const cost = tun.outfit[g];
      if (!c.mule) return { kind: 'outfit', verb: `OUTFIT · ${NAME[g]}`, detail: 'needs a MULE', enabled: false, target, outfit: g };
      if (c.mule.good === g) return { kind: 'none', verb: `FITTED · ${NAME[g]}`, detail: 'now to a door', enabled: false };
      if (c.money < cost) return { kind: 'outfit', verb: `OUTFIT · ${NAME[g]}`, detail: `need ${cost} cr`, enabled: false, target, outfit: g };
      return { kind: 'outfit', verb: `${c.mule.good ? 'REFIT' : 'OUTFIT'} · ${NAME[g]}`, detail: `${cost} cr`, enabled: true, target, outfit: g };
    }
    if (room) return { kind: 'none', verb: 'CLOSED', detail: 'not in this mock', enabled: false };
    if (!c.mule && w.storeMules <= 0) return { kind: 'none', verb: 'NO MULES LEFT', detail: 'the pub pays now', enabled: false };
    return { kind: 'none', verb: !c.mule ? 'TO THE CORRAL' : !c.mule.good ? 'TO AN OUTFITTER' : 'TO A DOOR', enabled: false };
  }
  const loose = looseOf(w, c.id);
  if (loose && !c.mule) {
    if (Math.hypot(c.x - loose.x, c.y - loose.y) < CATCH_REACH) return { kind: 'catch', verb: 'CATCH MULE', enabled: true, target: { space: 'map', mule: { x: loose.x, y: loose.y } } };
    return { kind: 'none', verb: 'CATCH YOUR MULE', detail: 'it bolted', enabled: false };
  }
  for (const side of ['L', 'R'] as const) {
    const d = doorOutside(w, side);
    if (Math.hypot(c.x - d.x, c.y - d.y) < 0.6) return { kind: 'enter', verb: 'ENTER STORE', detail: c.pelts ? `sell ${c.pelts} pelts` : undefined, enabled: true, target: { space: 'map', door: side } };
  }
  const t = tileAt(w, c.x, c.y);
  const mine = t && t.owner === c.id;
  const shore = c.mule?.good ? shorePlot(w, c, tun) : null;
  if (shore) return { kind: 'install', verb: `INSTALL · ${NAME[c.mule!.good!]}`, detail: 'from the shore', enabled: true, target: { space: 'map', tile: { x: shore.x, y: shore.y } }, outfit: c.mule!.good! };
  if (mine && t.outfit && c.mule?.good) return { kind: 'none', verb: 'PLOT HAS A MULE', detail: 'try a free plot', enabled: false };
  if (mine && c.mule?.good) return { kind: 'install', verb: `INSTALL · ${NAME[c.mule.good]}`, enabled: true, target: { space: 'map', tile: { x: t.x, y: t.y } }, outfit: c.mule.good };
  if (mine && c.mule) return { kind: 'none', verb: 'OUTFIT IT FIRST', detail: 'in the store', enabled: false };
  if (c.mule?.good) return { kind: 'none', verb: 'TO YOUR PLOT', detail: t?.owner ? 'not yours' : undefined, enabled: false };
  if (!c.mule && w.storeMules <= 0) return { kind: 'none', verb: 'NO MULES LEFT', detail: 'the pub pays now', enabled: false };
  if (c.installs > 0 && !c.mule) return { kind: 'none', verb: 'TO THE STORE', detail: 'MULE or pub', enabled: false };
  return { kind: 'none', verb: 'TO THE STORE', enabled: false };
}

function act(w: World, c: Colonist, tun: Tunables): { w: World; c: Colonist } {
  const r = reachOf(w, c, tun);
  if (!r.enabled) return { w, c };
  switch (r.kind) {
    case 'enter':
      return { w, c: enterHall(c, r.target && 'door' in r.target ? r.target.door : 'L', tun) };
    case 'leave':
      return { w, c: leaveHall(w, c, roomAt(c) === 'doorR' ? 'R' : 'L', tun) };
    case 'buy': {
      const price = mulePrice(tun);
      const behind = alongTrail(c.trail, c, leadLength('hall', tun));
      const bought = { ...c, money: c.money - price, mule: { good: null, x: behind.x, y: behind.y, facing: c.facing, paid: price } };
      // Each sale may start the scramble, or counts down the one running.
      return { w: afterSale({ ...w, storeMules: w.storeMules - 1, log: say(w, c, `bought a MULE (${price} cr)`) }, bought, tun), c: bought };
    }
    case 'outfit': {
      const g = r.outfit!;
      return { w: { ...w, log: say(w, c, `outfitted for ${NAME[g]} (${tun.outfit[g]} cr)`) }, c: { ...c, money: c.money - tun.outfit[g], mule: { ...c.mule!, good: g, paid: c.mule!.paid + tun.outfit[g] } } };
    }
    case 'install': {
      const at = r.target && 'tile' in r.target ? r.target.tile : { x: Math.floor(c.x), y: Math.floor(c.y) };
      const tiles = w.tiles.map((t) => (t.x === at.x && t.y === at.y ? { ...t, outfit: c.mule!.good } : t));
      return { w: { ...w, tiles, log: say(w, c, `installed ${NAME[c.mule!.good!]} on ${at.x + 1}·${at.y + 1}`) }, c: { ...c, mule: null, installs: c.installs + 1 } };
    }
    case 'pub': {
      const pay = pubPayout(w, tun);
      const back = refundOf(c, tun);
      const note = c.mule ? ` and the MULE back${back ? ` (refund ${back} cr)` : ''}` : '';
      return { w: { ...w, storeMules: w.storeMules + (c.mule ? 1 : 0), log: say(w, c, `went to the pub (+${pay} cr${note})`) }, c: { ...c, money: c.money + pay + back, done: true, moving: false, mule: null } };
    }
    case 'sell': {
      const pay = c.pelts * tun.wolves.peltPrice;
      return { w: { ...w, log: say(w, c, `sold ${c.pelts} pelts (+${pay} cr)`), beats: beat(w, c.id, `${c.name} sold ${c.pelts} pelts: +${pay} cr`, 'ok') }, c: { ...c, money: c.money + pay, pelts: 0 } };
    }
    case 'grab':
      return winGlint(w, c, tun);
    case 'catch': {
      const m = looseOf(w, c.id)!;
      return { w: { ...w, loose: w.loose.filter((x) => x !== m), log: say(w, c, 'caught the MULE') }, c: { ...c, mule: { good: m.good, x: m.x, y: m.y, facing: m.facing, paid: m.paid }, trail: [{ x: m.x, y: m.y }, { x: c.x, y: c.y }] } };
    }
    default:
      return { w, c };
  }
}

// --- Bots --------------------------------------------------------------------------------------

/** Cheapest path in tiles (4-way, cost 1/terrain) for `who`, avoiding the store's tile and what is shut to it; null if none. */
export function pathTo(w: World, tun: Tunables, from: P, to: P, who: string | null = null, wolfLand = false): P[] | null {
  const n = w.width * w.height;
  const idx = (x: number, y: number) => y * w.width + x;
  const g = idx(to.x, to.y);
  const cost = (i: number) => {
    const t = w.tiles[i]!;
    if (t.terrain === 'store') return Infinity;
    // The goal itself is always reachable: a plot of your own is never shut to you.
    if (i !== g && !tileOpen(tun, t, who)) return Infinity;
    const m = terrainMult(tun, t.terrain);
    // A leg that prefers wolf land finds forest, hills and tundra cheap.
    const lure = wolfLand && (WOLF_LAND as readonly string[]).includes(t.terrain) ? 0.25 : 1;
    return m > 0 ? lure / m : 4;
  };
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  const s = idx(from.x, from.y);
  dist[s] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]!)) u = i;
    if (u < 0) return null;
    if (u === g) break;
    done[u] = true;
    const ux = u % w.width;
    const uy = Math.floor(u / w.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const vx = ux + dx;
      const vy = uy + dy;
      if (vx < 0 || vy < 0 || vx >= w.width || vy >= w.height) continue;
      const v = idx(vx, vy);
      const d = dist[u]! + cost(v);
      if (d < dist[v]!) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  const out: P[] = [];
  for (let v = g; v >= 0; v = prev[v]!) out.unshift({ x: v % w.width, y: Math.floor(v / w.width) });
  return out;
}

export const toward = (from: P, to: P, near = 0.06): P => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  return d < near ? { x: 0, y: 0 } : { x: dx / d, y: dy / d };
};
const centreOf = (r: Rect): P => units((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
const WALKWAY_Y = units(0, (TOP.y1 + BOT.y0) / 2).y;

export type Goal = { kind: 'room'; room: HallRoom } | { kind: 'plot'; at: P } | { kind: 'shore'; at: P; stand: P } | { kind: 'store' } | { kind: 'door'; side: 'L' | 'R' } | { kind: 'mule'; at: P } | { kind: 'idle' };

/** For a lake plot in shore mode, an open tile beside it to install from. */
function shoreStand(w: World, tun: Tunables, plot: P, who: string): P | null {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    const t = tileAt(w, plot.x + dx, plot.y + dy);
    if (t && t.terrain !== 'store' && tileOpen(tun, t, who)) return { x: t.x, y: t.y };
  }
  return null;
}

export function botGoal(w: World, c: Colonist, tun: Tunables): Goal {
  if (c.done) return { kind: 'idle' };
  // The corral scramble, then a glint it races for, come before any errand.
  if (racingScramble(w, c)) return c.space === 'hall' ? { kind: 'room', room: 'corral' } : { kind: 'store' };
  if (racing(w, c) && w.glint) {
    const g = w.glint;
    return c.space === 'hall' ? { kind: 'door', side: g.x < w.store.x + 0.5 ? 'L' : 'R' } : { kind: 'plot', at: { x: g.x, y: g.y } };
  }
  const loose = looseOf(w, c.id);
  if (loose && !c.mule) return c.space === 'hall' ? { kind: 'door', side: loose.x < w.store.x + 0.5 ? 'L' : 'R' } : { kind: 'mule', at: { x: loose.x, y: loose.y } };
  const plot = freePlotsOf(w, c.id)[0];
  const side = (x: number): 'L' | 'R' => (x < w.store.x + 0.5 ? 'L' : 'R');
  const pub: Goal = c.space === 'hall' ? { kind: 'room', room: 'pub' } : { kind: 'store' };
  const affordable = ARCADE_OUTFITS.filter((g) => tun.outfit[g] <= c.money);
  if (c.installs > 0 || !plot) return pub;
  if (!c.mule) {
    if (w.storeMules <= 0 || c.money < mulePrice(tun) + Math.min(...ARCADE_OUTFITS.map((g) => tun.outfit[g]))) return pub;
    return c.space === 'hall' ? { kind: 'room', room: 'corral' } : { kind: 'store' };
  }
  if (!c.mule.good) {
    if (c.space !== 'hall') return { kind: 'store' };
    const g = tun.outfit[c.plan] <= c.money ? c.plan : affordable[0];
    return g ? { kind: 'room', room: g } : { kind: 'room', room: 'pub' };
  }
  if (c.space === 'hall') return { kind: 'door', side: side(plot.x) };
  if (plot.terrain === 'lake' && tun.questions.lakeMode === 'shore') {
    const stand = shoreStand(w, tun, plot, c.id);
    return stand ? { kind: 'shore', at: { x: plot.x, y: plot.y }, stand } : pub;
  }
  return { kind: 'plot', at: { x: plot.x, y: plot.y } };
}

/** A bot's input from the world alone: where it is heading next, and whether it presses its action. */
export function botInput(w: World, c: Colonist, tun: Tunables): Input {
  const ready = c.botWait >= tun.botThinkSeconds * 1000;
  const press = (at: boolean): Input => (at ? { dir: { x: 0, y: 0 }, action: ready } : IDLE);
  // A wolf encounter overrides any errand (wolves.ts); stunned, nothing; then the store buys pelts first.
  if (c.encounter) return botWolfInput(w, c, tun);
  if (c.stunnedUntil > w.t || c.waitUntil > w.t) return IDLE;
  if (c.space === 'hall' && c.pelts > 0 && reachOf(w, c, tun).kind === 'sell') return press(true);
  const goal = botGoal(w, c, tun);
  if (goal.kind === 'idle') return IDLE;
  if (c.space === 'hall') {
    const room = roomAt(c);
    if (goal.kind === 'room' && room === goal.room) return { ...press(true), dir: toward(c, centreOf(ROOMS[goal.room]), 0.5) };
    const target = goal.kind === 'door' ? units(goal.side === 'L' ? 0.4 : 99.6, 50) : goal.kind === 'room' ? centreOf(ROOMS[goal.room]) : DOOR_SPOT.doorL;
    // Out of a room onto the walkway first, along the walkway, then straight in.
    if (room && room !== 'doorL' && room !== 'doorR') return { dir: toward(c, { x: c.x, y: WALKWAY_Y }), action: false };
    if (Math.abs(c.x - target.x) > 0.3 && goal.kind === 'room') return { dir: toward(c, { x: target.x, y: WALKWAY_Y }), action: false };
    return { dir: toward(c, target), action: false };
  }
  const here = { x: Math.floor(c.x), y: Math.floor(c.y) };
  const side: 'L' | 'R' = c.x < w.store.x + 0.5 ? 'L' : 'R';
  const goalTile =
    goal.kind === 'plot' ? goal.at : goal.kind === 'shore' ? goal.stand : goal.kind === 'mule' ? { x: Math.floor(goal.at.x), y: Math.floor(goal.at.y) } : { x: side === 'L' ? w.store.x - 1 : w.store.x + 1, y: w.store.y };
  if (here.x === goalTile.x && here.y === goalTile.y) {
    if (goal.kind === 'plot' || goal.kind === 'mule' || goal.kind === 'shore') {
      // On the plot's centre; beside the loose MULE; at the shore's edge facing the lake plot.
      const spot =
        goal.kind === 'plot'
          ? { x: goal.at.x + 0.5, y: goal.at.y + 0.5 }
          : goal.kind === 'mule'
            ? goal.at
            : { x: goal.stand.x + 0.5 + (goal.at.x - goal.stand.x) * 0.3, y: goal.stand.y + 0.5 + (goal.at.y - goal.stand.y) * 0.3 };
      if (Math.hypot(c.x - spot.x, c.y - spot.y) < (goal.kind === 'mule' ? 0.4 : 0.2)) return press(true);
      return { dir: toward(c, spot), action: false };
    }
    // Line up on the door, then walk in through it.
    const d = doorOutside(w, side);
    if (Math.abs(c.y - d.y) > 0.1) return { dir: toward(c, { x: d.x, y: d.y }, 0.02), action: false };
    return { dir: { x: side === 'L' ? 1 : -1, y: 0 }, action: false };
  }
  // A race takes the quickest way, whatever the leg preferred.
  // A wolf-land leg goes by its forest, hills or tundra tile first; a race takes the quickest way.
  const hurry = racing(w, c) || racingScramble(w, c);
  const via = c.legVia && !hurry ? c.legVia : null;
  const path = pathTo(w, tun, here, via ?? goalTile, c.id, c.legWolf && !hurry);
  if (!path || path.length < 2) return IDLE;
  const next = path[1]!;
  return { dir: toward(c, { x: next.x + 0.5, y: next.y + 0.5 }), action: false };
}

/** The most a wolf-land leg goes out of its way, in tiles. */
const WOLF_DETOUR = 6;

/**
 * For a leg that prefers wolf land: the forest, hills or tundra tile that costs the least detour on the way to its
 * goal, within WOLF_DETOUR tiles; none if there is no such tile near the way.
 */
function wolfVia(w: World, c: Colonist, g: Goal, tun: Tunables): P | null {
  const to = g.kind === 'plot' || g.kind === 'mule' ? g.at : g.kind === 'shore' ? g.stand : g.kind === 'store' ? w.store : null;
  if (!to) return null;
  const here = { x: Math.floor(c.x), y: Math.floor(c.y) };
  const m = (a: P, b: P) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const direct = m(here, to);
  let best: P | null = null;
  let cost = Infinity;
  for (const t of w.tiles) {
    if (!(WOLF_LAND as readonly string[]).includes(t.terrain) || !tileOpen(tun, t, c.id)) continue;
    const extra = m(here, t) + m(t, to) - direct;
    if (extra <= WOLF_DETOUR && extra < cost) {
      cost = extra;
      best = { x: t.x, y: t.y };
    }
  }
  return best;
}

// --- The step ----------------------------------------------------------------------------------

/** Moves a colonist by a direction for one step: across the map or the hall, through doors, the MULE following. */
export function moveColonist(w: World, c0: Colonist, dir: P, dtMs: number, tun: Tunables, clamp?: (p: P) => P): Colonist {
  let c = c0;
  const mag = Math.min(1, Math.hypot(dir.x, dir.y));
  if (mag <= 0.05) return c.moving ? { ...c, moving: false } : c;
  const len = Math.hypot(dir.x, dir.y);
  const d = (speedOf(w, c, tun).perSecond * dtMs) / 1000;
  const dx = (dir.x / len) * mag * d;
  const dy = (dir.y / len) * mag * d;
  const facing = dir.x > 0.05 ? 'right' : dir.x < -0.05 ? 'left' : c.facing;
  if (c.space === 'map') {
    const m = mapMove(w, tun, c, dx, dy);
    if (m.enter) c = enterHall(c, m.enter, tun);
    else {
      const p = clamp ? clamp(m) : m;
      c = { ...c, x: p.x, y: p.y, facing };
    }
  } else {
    const m = hallMove(c, dx, dy);
    c = m.exit ? leaveHall(w, c, m.exit, tun) : { ...c, x: m.x, y: m.y, facing };
  }
  // Standing on your own plot heals a bite.
  if (c.bitten && c.space === 'map' && tileAt(w, c.x, c.y)?.owner === c.id) c = { ...c, bitten: false };
  const last = c.trail[c.trail.length - 1];
  const moved = c.x !== c0.x || c.y !== c0.y;
  if (!last || Math.hypot(c.x - last.x, c.y - last.y) > 0.04) c = { ...c, trail: [...c.trail, { x: c.x, y: c.y }].slice(-48) };
  return follow({ ...c, moving: moved }, tun);
}

function stepColonist(w0: World, c0: Colonist, input0: Input, dtMs: number, tun: Tunables): { w: World; c: Colonist } {
  let w = w0;
  let c = c0;
  // Stunned: no move, no action.
  const input = c.stunnedUntil > w.t ? IDLE : input0;
  let dir = input.dir;
  if (input.toward && input.toward.space === c.space) dir = toward(c, input.toward, 0.08);
  if (c.encounter) {
    const r = stepEncounter(w, c, { ...input, dir }, dtMs, tun);
    w = r.w;
    c = r.c;
  } else {
    c = moveColonist(w, c, dir, dtMs, tun);
    if (input.action) {
      const r = act(w, c, tun);
      w = r.w;
      c = r.c;
    }
    const roll = rollWolves(w, c, dtMs, tun);
    w = roll.w;
    c = roll.c;
  }
  const still = Math.hypot(dir.x, dir.y) <= 0.05;
  c = { ...c, botWait: c.bot && still && !input.action ? c.botWait + dtMs : 0 };
  return { w, c };
}

/**
 * One fixed step of the whole world. `inputs` holds the humans' inputs by colonist id; every bot's comes from botInput
 * on the same world, so bots walk by the same rules. Due events run their slice's handler, or are logged.
 */
export function step(w0: World, inputs: Record<string, Input>, dtMs: number, tun: Tunables): World {
  if (w0.over) return w0;
  let w: World = { ...w0, t: w0.t + dtMs };
  const colonists: Colonist[] = [];
  for (const c0 of w0.colonists) {
    if (c0.done) {
      colonists.push(c0);
      continue;
    }
    // Later colonists read the earlier ones' new state, so the world they step on is the one being built.
    w = { ...w, colonists: [...colonists, ...w0.colonists.slice(colonists.length)] };
    let c1 = c0;
    if (c0.bot) {
      // A new leg: the seed decides whether this one goes through wolf land.
      const g = botGoal(w, c0, tun);
      const leg = `${c0.space}:${g.kind}:${'room' in g ? g.room : 'at' in g && g.kind !== 'mule' ? `${g.at.x},${g.at.y}` : 'side' in g ? g.side : ''}`;
      if (leg !== c0.leg) {
        const [u, w1] = draw(w);
        w = w1;
        const legWolf = c0.space === 'map' && u < tun.wolves.botWolfLandShare;
        // A detour by wolf land only with time to spare, as for the glint and the scramble.
        const via = legWolf ? wolfVia(w, c0, g, tun) : null;
        const ok = via && fitsDetour(w, c0, tun, { x: via.x + 0.5, y: via.y + 0.5 });
        c1 = { ...c0, leg, legWolf: !!ok, legVia: ok ? via : null };
      }
      // Been by it: on to the goal.
      if (c1.legVia && Math.floor(c1.x) === c1.legVia.x && Math.floor(c1.y) === c1.legVia.y) c1 = { ...c1, legVia: null };
    }
    const input = c1.bot ? botInput(w, c1, tun) : (inputs[c1.id] ?? IDLE);
    const r = stepColonist(w, c1, input, dtMs, tun);
    w = r.w;
    colonists.push(r.c);
  }
  w = { ...w, colonists };
  w = stepBolts(w, dtMs, tun);
  w = stepGlint(w, dtMs, tun);
  w = stepScramble(w, tun);
  w = { ...w, fleeing: w.fleeing.filter((f) => f.until > w.t).map((f) => ({ ...f, x: f.x + (f.vx * dtMs) / 1000, y: f.y + (f.vy * dtMs) / 1000 })) };
  while (w.queue.length > 0 && w.queue[0]!.atMs <= w.t) {
    const [e, ...rest] = w.queue;
    w = { ...w, queue: rest };
    const handle = EVENT_HANDLERS[e!.kind];
    w = handle ? handle(w, e!, tun) : { ...w, log: [...w.log, `${(w.t / 1000).toFixed(1)}s ${e!.kind} (a later slice: not built)`].slice(-60) };
  }
  if (w.t >= tun.devSeconds * 1000 || w.colonists.every((c) => c.done)) w = { ...endBolt(w), glint: null, scramble: null, over: true, colonists: w.colonists.map((c) => ({ ...c, moving: false, encounter: null })) };
  return w;
}

// --- Outside the step: the review page's own controls ----------------------------------------------

/** Drop a colonist on a tile of the map, to feel a land's speed (the tunables' test track). */
export function teleport(w: World, id: string, at: P, tun: Tunables): World {
  return { ...w, colonists: w.colonists.map((c) => (c.id === id ? { ...arrive(c, 'map', at, 'right', tun), encounter: null } : c)) };
}

export const setBot = (w: World, id: string, bot: boolean): World => ({ ...w, colonists: w.colonists.map((c) => (c.id === id ? { ...c, bot, botWait: 0 } : c)) });

/** "Call the wolves now": a pack for this colonist, due in `inMs`, whatever the land or the cooldown. */
export function callWolves(w: World, id: string, inMs = 0): World {
  const queue = [...w.queue, { atMs: w.t + inMs, kind: 'wolves' as const, target: id, forced: true }].sort((a, b) => a.atMs - b.atMs);
  return { ...w, queue };
}

/** "Call a glint now", or #arcade-glint's: due in `inMs`, on a chosen tile with chosen racers, or the seed's. */
export function callGlint(w: World, inMs = 0, at?: P, racers?: string[]): World {
  const e: WorldEvent = { atMs: w.t + inMs, kind: 'glint', forced: true, ...(at ? { at } : {}), ...(racers ? { racers } : {}) };
  return { ...w, queue: [...w.queue, e].sort((a, b) => a.atMs - b.atMs) };
}

/** "Start a scramble now": whatever the corral holds, the race to it starts. */
export function callScramble(w: World, inMs = 0): World {
  const e: WorldEvent = { atMs: w.t + inMs, kind: 'scramble', forced: true };
  return { ...w, queue: [...w.queue, e].sort((a, b) => a.atMs - b.atMs) };
}
