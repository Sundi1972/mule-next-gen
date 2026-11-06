import { COLONY, EVENTS, GAME, GOOD_CONFIG, SOCIAL_EVENTS, UPKEEP } from './config.js';
import { addPrestige, callStrike, fundIn, goodWords, moodBand, moodShift, strikeHolds } from './colony.js';
import { neighbours } from './grid.js';
import { reputationShift } from './politics.js';
import { airBand, type AirBand } from './pollution.js';
import { createRng } from './rng.js';
import { GOODS, RAW_GOODS, type EventEffect, type EventKey, type EventKind, type GameState, type Good, type MonthEvent, type MoodBand, type Phase, type Player, type PrestigeId, type SpecialKind, type Tile } from './types.js';

type Rng = ReturnType<typeof createRng>;
type Direction = NonNullable<MonthEvent['direction']>;

/** How each event looks and reads; the numbers in the lines come from EVENTS. */
const SHAPE: Record<EventKey, { kind: EventKind; title: string; scope: MonthEvent['scope']; sign: MonthEvent['sign']; line: () => string }> = {
  dustStorm: { kind: 'storm', title: 'Dust storm', scope: 'colony', sign: 'bad', line: () => `A dust storm takes ${pct(EVENTS.dustStorm.cut)} of every Energy plot's output.` },
  drought: { kind: 'drought', title: 'Drought', scope: 'colony', sign: 'bad', line: () => `Drought: every Food and Water plot makes ${EVENTS.drought.loss} less.` },
  acidRain: { kind: 'storm', title: 'Acid rain', scope: 'colony', sign: 'bad', line: () => `Acid rain: every Energy and Food plot makes ${EVENTS.acidRain.loss} less.` },
  solarFlare: { kind: 'flare', title: 'Solar flare', scope: 'colony', sign: 'good', line: () => `A solar flare: every Energy plot makes ${EVENTS.solarFlare.gain} more.` },
  cometPass: { kind: 'comet', title: 'Comet pass', scope: 'colony', sign: 'good', line: () => `A comet passes: every Water plot makes ${EVENTS.cometPass.gain} more.` },
  flood: { kind: 'flood', title: 'Flood season', scope: 'local', sign: 'bad', line: () => 'The river floods: Food plots on the river make nothing.' },
  volcanicAsh: { kind: 'quake', title: 'Volcanic ash', scope: 'local', sign: 'bad', line: () => `Ash falls: plots near the volcano make ${EVENTS.volcanicAsh.loss} less.` },
  pestSwarm: { kind: 'blight', title: 'Pest swarm', scope: 'personal', sign: 'bad', line: () => `Pests eat ${pct(EVENTS.pestSwarm.cut)} of the Food on the plots they reach.` },
  wildfire: { kind: 'fire', title: 'Wildfire', scope: 'personal', sign: 'bad', line: () => 'A fire burns one Food plot and scorches the farms joined to it.' },
  bumperHarvest: { kind: 'bounty', title: 'Bumper harvest', scope: 'personal', sign: 'good', line: () => `One plot makes ${EVENTS.bumperHarvest.factor} times its usual output.` },
  cavernCollapse: { kind: 'quake', title: 'Cavern collapse', scope: 'personal', sign: 'bad', line: () => 'A crystal cavern caves in and becomes a plain plot.' },
  federationTax: { kind: 'ledger', title: 'Federation tax', scope: 'colony', sign: 'bad', line: () => `The Federation takes ${pct(EVENTS.colony.federationTax.share)} of every player's cash for the colony fund.` },
  federationGrant: { kind: 'ledger', title: 'Federation grant', scope: 'colony', sign: 'good', line: () => `The Federation pays the ${EVENTS.colony.federationGrant.count} poorest players ${EVENTS.colony.federationGrant.amount} each.` },
  immigrationWave: { kind: 'colony', title: 'Immigration wave', scope: 'colony', sign: 'good', line: () => `A ship brings ${pct(EVENTS.colony.immigrationWave.growth)} more colonists, for good.` },
  inheritance: { kind: 'ledger', title: 'Inheritance', scope: 'personal', sign: 'good', line: () => `An inheritance: ${EVENTS.player.inheritance.min} to ${EVENTS.player.inheritance.max} credits, more for the poorer.` },
  muleTheft: { kind: 'plot', title: 'MULE theft', scope: 'personal', sign: 'bad', line: () => 'A MULE is stolen; its plot stands idle until it is outfitted again.' },
  epidemic: { kind: 'colonists', title: 'Epidemic', scope: 'colony', sign: 'bad', line: () => 'An epidemic: everyone without Medicine is sick this turn and next.' },
  coldSnap: { kind: 'sweep', title: 'Cold snap', scope: 'colony', sign: 'bad', line: () => `A cold snap: every plot needs ${EVENTS.colony.coldSnap.factor} times its Energy this month.` },
  meteorStrike: { kind: 'strike', title: 'Meteor strike', scope: 'local', sign: 'bad', line: () => 'A meteor strikes: its MULE is lost and the plot becomes a crater rich in Crystite.' },
  pirateRaid: { kind: 'ledger', title: 'Pirate raid', scope: 'colony', sign: 'bad', line: () => "Pirates take all the Crystite, the store's and every player's." },
  storeFire: { kind: 'store', title: 'Store fire', scope: 'colony', sign: 'bad', line: () => 'The store burns: every good it held and its MULEs are lost.' },
  ratsInSilo: { kind: 'ledger', title: 'Rats in the silo', scope: 'personal', sign: 'bad', line: () => `Rats eat ${pct(EVENTS.player.ratsInSilo.share)} of the stored Food.` },
  crookedAccountant: { kind: 'ledger', title: 'Crooked accountant', scope: 'personal', sign: 'bad', line: () => `A crooked accountant takes ${pct(EVENTS.player.crookedAccountant.share)} of the cash.` },
  packageFromHome: { kind: 'ledger', title: 'Package from home', scope: 'personal', sign: 'good', line: () => `A package from home: +${EVENTS.player.packageFromHome.amount} Food.` },
  // G-5 C26 (SOCIAL_EVENTS). A general strike's line names its good once it is picked (strikeLine).
  festival: {
    kind: 'colony',
    title: 'Festival',
    scope: 'colony',
    sign: 'good',
    line: () => {
      const f = SOCIAL_EVENTS.colony.festival;
      return `A festival: the mood lifts by ${f.moodShift}, the colony gains ${f.prestige} prestige for good, and the colonists eat ${pct(f.foodDemand)} more Food this month.`;
    },
  },
  generalStrike: { kind: 'colony', title: 'General strike', scope: 'colony', sign: 'bad', line: () => strikeLine(null) },
  emigrationWave: { kind: 'colony', title: 'Emigration wave', scope: 'colony', sign: 'bad', line: () => `${pct(SOCIAL_EVENTS.colony.emigrationWave.shrink)} of the colonists leave, for good.` },
  blamedForUnrest: {
    kind: 'ledger',
    title: 'Blamed for the unrest',
    scope: 'personal',
    sign: 'bad',
    line: () => `Blamed for the unrest: ${Math.abs(SOCIAL_EVENTS.player.blamedForUnrest.reputation)} reputation lost, so fewer votes.`,
  },
  storeStrike: { kind: 'store', title: 'Store strike', scope: 'colony', sign: 'bad', line: () => 'The store is on strike: it sells no MULEs this turn.' },
};

/** A general strike's line, naming its good when it has one. */
function strikeLine(good: Good | null): string {
  const plots = good ? `every ${goodWords(good)} plot` : 'every plot of one good';
  return `A general strike: this month ${plots} makes ${pct(COLONY.strike.output)}, unless the Governor pays the strikers.`;
}

/** The goods a colony-wide event touches. */
const COLONY_GOODS: Partial<Record<EventKey, readonly Good[]>> = {
  dustStorm: ['energy'],
  drought: ['food', 'water'],
  acidRain: ['energy', 'food'],
  solarFlare: ['energy'],
  cometPass: ['water'],
};

const pct = (share: number) => `${Math.round(share * 100)}%`; // literal-ok: a share shown as a percentage
const steps = (a: Tile, b: Tile) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** What a hit plot makes after the event (never below 0), from what it made before; `first` marks the event's first plot. */
export function eventOutput(key: EventKey, before: number, first: boolean): number {
  const rules: Partial<Record<EventKey, () => number>> = {
    dustStorm: () => Math.floor(before * (1 - EVENTS.dustStorm.cut)),
    drought: () => before - EVENTS.drought.loss,
    acidRain: () => before - EVENTS.acidRain.loss,
    solarFlare: () => before + EVENTS.solarFlare.gain,
    cometPass: () => before + EVENTS.cometPass.gain,
    flood: () => 0,
    volcanicAsh: () => before - EVENTS.volcanicAsh.loss,
    pestSwarm: () => Math.floor(before * (1 - EVENTS.pestSwarm.cut)),
    wildfire: () => (first ? 0 : before - EVENTS.wildfire.loss),
    bumperHarvest: () => before * EVENTS.bumperHarvest.factor,
    cavernCollapse: () => before,
    generalStrike: () => Math.floor(before * COLONY.strike.output),
  };
  // An event with no rule here changes no plot's output.
  return Math.max(0, rules[key]?.() ?? before);
}

/**
 * What one event would hit this month, in the order it reaches the plots, each plot's delta 0 until production fills
 * it in; null when it would hit nothing. A personal event starts on `player`'s plots (null when they have none).
 * Throws for a key it draws no plots for; a per-plot row's event is plotEvent's.
 */
export function buildEvent(state: GameState, key: EventKey, rng: Rng, player?: string, phase: Phase = 'production'): MonthEvent | null {
  if (Object.hasOwn(OFF_MAP, key)) return offMapEvent(state, key as OffMapKey, rng, phase, player);
  const working = state.tiles.filter((t) => t.owner && t.outfit && (RAW_GOODS as readonly string[]).includes(t.outfit));
  const food = working.filter((t) => t.outfit === 'food');
  let hit: Tile[];
  let origin: { x: number; y: number };
  let direction: Direction | undefined;

  const goods = COLONY_GOODS[key];
  if (goods) {
    const targets = working.filter((t) => goods.includes(t.outfit as Good));
    if (targets.length === 0) return null;
    direction = rng.pick(['n', 'e', 's', 'w'] as const);
    const edge = { n: (t: Tile) => t.y, s: (t: Tile) => state.height - 1 - t.y, w: (t: Tile) => t.x, e: (t: Tile) => state.width - 1 - t.x }[direction];
    origin =
      direction === 'n' || direction === 's'
        ? { x: rng.int(0, state.width - 1), y: direction === 'n' ? 0 : state.height - 1 }
        : { x: direction === 'w' ? 0 : state.width - 1, y: rng.int(0, state.height - 1) };
    hit = targets.sort((a, b) => edge(a) - edge(b));
  } else if (key === 'flood' || key === 'volcanicAsh') {
    const sources = state.tiles.filter((t) => (key === 'flood' ? t.terrain === 'river' : t.terrain === 'volcanic' || t.terrain === 'mountains'));
    const reach = (s: Tile) =>
      key === 'flood' ? food.filter((t) => t.terrain === 'river') : working.filter((t) => steps(t, s) <= EVENTS.volcanicAsh.radius);
    const live = sources.filter((s) => reach(s).length > 0);
    if (live.length === 0) return null;
    const source = rng.pick(live);
    origin = { x: source.x, y: source.y };
    hit = reach(source).sort((a, b) => steps(a, source) - steps(b, source));
  } else if (key === 'pestSwarm' || key === 'wildfire' || key === 'bumperHarvest') {
    const candidates = (key === 'bumperHarvest' ? working : food).filter((t) => t.owner === player);
    if (candidates.length === 0) return null;
    const start = rng.pick(candidates);
    origin = { x: start.x, y: start.y };
    hit =
      key === 'pestSwarm'
        ? spread(state, start, (t) => t.outfit === 'food' && t.owner === start.owner, EVENTS.pestSwarm.maxPlots)
        : key === 'wildfire'
          ? spread(state, start, (t) => t.outfit === 'food' && t.owner === start.owner, Infinity)
          : [start];
  } else {
    throw new Error(`buildEvent draws no plots for ${key}; a per-plot row's event is plotEvent's`);
  }
  return toEvent(state, key, origin, hit, direction, player);
}

/**
 * The wave-2 events' only-ifs (spec RULE-3): whether each fires for this state and player. Most change things off the
 * map and hit no plot; a MULE theft and a meteor strike hit one plot each, picked on the row's dice (offMapEvent).
 */
const OFF_MAP = {
  federationTax: () => true,
  federationGrant: (state: GameState) => state.players.length > 0,
  immigrationWave: () => true,
  inheritance: () => true,
  muleTheft: () => true,
  epidemic: () => true,
  coldSnap: () => true,
  meteorStrike: () => true,
  pirateRaid: () => true,
  storeFire: () => true,
  // Rats and the accountant fire only when they would take at least 1: 2 Food and 10 credits at today's shares.
  ratsInSilo: (_: GameState, p?: Player) => p !== undefined && taken(p.stock.food, EVENTS.player.ratsInSilo.share) >= 1,
  crookedAccountant: (_: GameState, p?: Player) => p !== undefined && taken(p.money, EVENTS.player.crookedAccountant.share) >= 1,
  packageFromHome: () => true,
  // G-5 C26: a strike needs a good the colony works; the rest always find what they change.
  festival: () => true,
  generalStrike: (state: GameState) => strikeGoods(state).length > 0,
  emigrationWave: () => true,
  blamedForUnrest: () => true,
  storeStrike: () => true,
} satisfies Partial<Record<EventKey, (state: GameState, player?: Player) => boolean>>;
type OffMapKey = keyof typeof OFF_MAP;

/** Whether the store is on strike this turn: a store strike fired in this month's development. buyMule refuses then. */
export function storeOnStrike(state: Pick<GameState, 'monthEvents'>): boolean {
  return state.monthEvents.some((e) => e.key === 'storeStrike' && e.phase === 'development');
}

/** A share of what someone holds, floored, never more than they hold (HC-5). */
const taken = (have: number, share: number) => Math.min(have, Math.floor(have * share));

function offMapEvent(state: GameState, key: OffMapKey, rng: Rng, phase: Phase, player?: string): MonthEvent | null {
  if (!OFF_MAP[key](state, state.players.find((p) => p.id === player))) return null;
  if (key === 'muleTheft') {
    const outfitted = state.tiles.filter((t) => t.owner === player && t.outfit);
    if (outfitted.length === 0) return null;
    const plot = rng.pick(outfitted);
    return withPlots(toEvent(state, key, { x: plot.x, y: plot.y }, [plot], undefined, player, phase), { becomes: 'idle', muleLost: true });
  }
  if (key === 'meteorStrike') {
    const tile = rng.pick(state.tiles.filter((t) => t.terrain !== 'store'));
    const event = toEvent(state, key, { x: tile.x, y: tile.y }, [tile], undefined, tile.owner ?? undefined, phase);
    return withPlots(event, { becomes: 'crater', ...(tile.special ? { was: tile.special.kind } : {}), ...(tile.outfit ? { muleLost: true as const } : {}) });
  }
  if (key === 'generalStrike') return struck(state, rng.pick(strikeGoods(state)), phase);
  // Off the map: it starts at the store, where every colonist starts development.
  const store = state.tiles.find((t) => t.terrain === 'store');
  return toEvent(state, key, store ? { x: store.x, y: store.y } : { x: 0, y: 0 }, [], undefined, player, phase);
}

/** The goods the most working colony plots make, in GOODS order: a general strike's pick (none when nothing works). */
function strikeGoods(state: GameState): Good[] {
  const plots = (good: Good) => state.tiles.filter((t) => t.owner && t.outfit === good).length;
  const most = Math.max(0, ...GOODS.map(plots));
  return most === 0 ? [] : GOODS.filter((g) => plots(g) === most);
}

/** A general strike on `good`: every working plot of it, each delta 0 until production fills it in. */
function struck(state: GameState, good: Good, phase: Phase): MonthEvent {
  const hit = state.tiles.filter((t) => t.owner && t.outfit === good);
  const at = hit[0] ?? state.tiles.find((t) => t.terrain === 'store') ?? { x: 0, y: 0 };
  return { ...toEvent(state, 'generalStrike', { x: at.x, y: at.y }, hit, undefined, undefined, phase), line: strikeLine(good) };
}

/**
 * This month's general strike as production files it while the strikers are unpaid (strikeHolds, G-5 RULE-26): every
 * working plot of the struck good, each delta 0 until production fills it in; null when no strike holds or no plot
 * works that good. Paid, production runs in full and files nothing.
 */
export function strikeEvent(state: GameState): MonthEvent | null {
  const good = state.colony?.strike?.good;
  if (!good || !strikeHolds(state, good)) return null;
  const event = struck(state, good, 'production');
  return event.plots.length > 0 ? event : null;
}

/** `event` with each of its plots changed as `change` says. */
const withPlots = (event: MonthEvent, change: Partial<MonthEvent['plots'][number]>): MonthEvent => ({ ...event, plots: event.plots.map((p) => ({ ...p, ...change })) });

/**
 * What a per-plot row's event turns its plot into. The special is gone by the time the event is built (settleSpecials
 * deletes it), so the event carries it for the screens to show until the hit lands.
 */
const BECOMES: Partial<Record<EventKey, { was: SpecialKind; becomes: 'plain' }>> = {
  cavernCollapse: { was: 'crystalCavern', becomes: 'plain' },
};

/** A per-plot row's event on the plot it fired for: that plot alone, for its owner, its output already made (delta 0). */
export function plotEvent(state: GameState, key: EventKey, index: number): MonthEvent {
  const tile = state.tiles[index]!;
  const event = toEvent(state, key, { x: tile.x, y: tile.y }, [tile], undefined, tile.owner ?? undefined);
  const change = BECOMES[key];
  return change ? { ...event, plots: event.plots.map((p) => ({ ...p, ...change })) } : event;
}

function toEvent(state: GameState, key: EventKey, origin: MonthEvent['origin'], hit: Tile[], direction?: Direction, player?: string, phase: Phase = 'production'): MonthEvent {
  const shape = SHAPE[key];
  const index = new Map(state.tiles.map((t, i) => [t, i]));
  return {
    key,
    kind: shape.kind,
    title: shape.title,
    line: shape.line(),
    scope: shape.scope,
    origin,
    ...(direction ? { direction } : {}),
    plots: hit.map((t, order) => ({ index: index.get(t)!, order, good: t.outfit as Good, delta: 0 })),
    ...(player === undefined ? {} : { player }),
    sign: shape.sign,
    phase,
  };
}

/** The start plot, then neighbours that `joins`, breadth first, up to `max` plots. */
function spread(state: GameState, start: Tile, joins: (t: Tile) => boolean, max: number): Tile[] {
  const out = [start];
  for (let i = 0; i < out.length && out.length < max; i++) {
    for (const n of neighbours(state.tiles, state.width, out[i]!)) {
      if (out.length >= max) break;
      if (!out.includes(n) && joins(n)) out.push(n);
    }
  }
  return out;
}

/**
 * A row of EVENTS.colony or EVENTS.player: its chance in each phase it rolls in, what raises or lowers it, and its
 * cap, all in shares. Every influence is optional and reads 0 when absent.
 */
export interface EventRow {
  phases: Partial<Record<Phase, number>>;
  /** By the colony air's band. */
  air?: Partial<Record<AirBand['name'], number>>;
  /** perPoint for each air point the player's plots caused last month, at most max. */
  pollution?: { perPoint: number; max: number };
  /** Signed, for the richest and the poorest player by cash plus land at GAME.plotScore a plot; a tie goes to the first seat. */
  wealth?: { richest?: number; poorest?: number };
  /** By event key: points when that event fired in a window the row names; once, if it fired in both. */
  follows?: Record<string, { points: number; thisPhase?: boolean; lastMonth?: boolean }>;
  /** Rolls once per plot its caller names, after production's output; rollPhase never rolls it. */
  perPlot?: true;
  /** Rolls once for the colony after production's output (rollAfterOutput); rollPhase never rolls it. */
  afterOutput?: true;
  /** By the colony's mood band (G-5 C26); 0 with no colony. */
  mood?: Partial<Record<MoodBand, number>>;
  /** A hard zero in these mood bands, whatever raises it (the catalogue's "never when"). */
  neverIn?: readonly MoodBand[];
  /** Never rolls without a colony: politics off (HC-22). */
  needsColony?: true;
  /** For each standing object of these kinds. */
  objects?: Partial<Record<PrestigeId, number>>;
  /** Points when the store's Food is dearer than `factor` times its usual price (GOOD_CONFIG). */
  foodPrice?: { factor: number; points: number };
  /**
   * By the colony air's band, like `air`, and a hard zero in the `neverInAir` bands; both read only with a colony, so a
   * wave-2 row that gains them rolls with politics off exactly as before (HC-22).
   */
  colonyAir?: Partial<Record<AirBand['name'], number>>;
  neverInAir?: readonly AirBand['name'][];
  cap: number;
}

/** A wave-2 row's effect numbers, each named on its row (spec RULE-2). */
export interface EventParams {
  share?: number;
  amount?: number;
  count?: number;
  growth?: number;
  min?: number;
  max?: number;
  factor?: number;
  /** G-5 C26: a festival's mood change, lasting prestige and extra Food (a share of the colonists' need). */
  moodShift?: number;
  prestige?: number;
  foodDemand?: number;
  /** G-5 C26: the share of the colonists an emigration wave takes. */
  shrink?: number;
  /** G-5 C26: the reputation a blamed player loses (signed). */
  reputation?: number;
}

/** What a chance reads beside the state: whose roll it is (none for a colony row), and the keys already fired this phase. */
export interface ChanceInput {
  player?: string;
  firedThisPhase?: readonly string[];
}

/**
 * A row's chance in this phase (RULE-1): the phase's base plus the row's raises and minus its lowers, never below 0
 * or above its cap; 0 in a phase the row doesn't list.
 */
export function eventChance(state: GameState, row: EventRow, phase: Phase, input: ChanceInput = {}): number {
  const base = row.phases[phase];
  if (base === undefined) return 0;
  // The hard zeros (G-5 C26): no colony for a row that needs one, or a mood band the row never fires in.
  if (row.needsColony && !state.colony) return 0;
  if (state.colony && row.neverIn?.includes(moodBand(state.colony.happiness))) return 0;
  if (state.colony && row.neverInAir?.includes(airBand(state.air).name)) return 0;
  const { air, pollution, wealth, follows, mood, objects, foodPrice } = influences(state, row, input);
  return Math.min(row.cap, Math.max(0, base + air + pollution + wealth + follows + mood + objects + foodPrice));
}

/** Each influence's share of a row's chance; 0 for one the row doesn't read, or with nothing to read. */
function influences(state: GameState, row: EventRow, { player, firedThisPhase = [] }: ChanceInput) {
  // Last month's report only until production files this month's: a row in a later phase would read this month's.
  const last = state.history.at(-1);
  const firedLastMonth: readonly string[] = last?.events?.map((e) => e.key) ?? [];
  const caused = player === undefined ? 0 : (last?.pollutionBy?.[player] ?? 0);
  const follows = Object.entries(row.follows ?? {})
    .filter(([key, f]) => (f.thisPhase && firedThisPhase.includes(key)) || (f.lastMonth && firedLastMonth.includes(key)))
    .reduce((sum, [, f]) => sum + f.points, 0);
  return {
    air: (row.air?.[airBand(state.air).name] ?? 0) + (state.colony ? (row.colonyAir?.[airBand(state.air).name] ?? 0) : 0),
    pollution: row.pollution ? Math.min(row.pollution.max, row.pollution.perPoint * caused) : 0,
    wealth: row.wealth && player !== undefined ? wealthShare(state, row.wealth, player) : 0,
    follows,
    mood: state.colony ? (row.mood?.[moodBand(state.colony.happiness)] ?? 0) : 0,
    objects: (state.colony?.projects ?? []).filter((p) => p.stage === 'standing').reduce((sum, p) => sum + (row.objects?.[p.id] ?? 0), 0),
    foodPrice: row.foodPrice && state.store.posted.food > row.foodPrice.factor * GOOD_CONFIG.food.refPrice ? row.foodPrice.points : 0,
  };
}

/** A wealth influence for this player: the richest's and the poorest's points, by cash plus land, a tie to the first seat. */
function wealthShare(state: GameState, wealth: NonNullable<EventRow['wealth']>, id: string): number {
  const worth = (p: Player) => worthOf(state, p);
  const richest = state.players.reduce((a, b) => (worth(b) > worth(a) ? b : a));
  const poorest = state.players.reduce((a, b) => (worth(b) < worth(a) ? b : a));
  return (richest.id === id ? (wealth.richest ?? 0) : 0) + (poorest.id === id ? (wealth.poorest ?? 0) : 0);
}

/** A player's wealth as the wealth influence ranks it: cash plus land at GAME.plotScore a plot. */
function worthOf(state: GameState, p: Player): number {
  return p.money + GAME.plotScore * state.tiles.filter((t) => t.owner === p.id).length;
}

/** The Federation grant's players: the EVENTS.colony.federationGrant.count poorest by worthOf, a tie to the first seat. */
export function grantees(state: GameState): Player[] {
  const ranked = state.players.map((p, seat) => ({ p, seat, worth: worthOf(state, p) }));
  ranked.sort((a, b) => a.worth - b.worth || a.seat - b.seat);
  return ranked.slice(0, EVENTS.colony.federationGrant.count).map((r) => r.p);
}

/**
 * An inheritance's credits for this player (AM-1 6a): min for the richest, max for the poorest, linear in the rank
 * from the richest, floored; players tied on worth share the mean of their ranks' amounts (AM-3); a lone player gets
 * max.
 */
export function inheritanceAmount(state: GameState, id: string): number {
  const { min, max } = EVENTS.player.inheritance;
  if (state.players.length < 2) return max; // literal-ok: a rank needs two players to compare
  const mine = worthOf(state, state.players.find((p) => p.id === id)!);
  const worths = state.players.map((p) => worthOf(state, p));
  const richer = worths.filter((w) => w > mine).length;
  const tied = worths.filter((w) => w === mine).length;
  // The amounts are linear in the rank, so the mean of the tied ranks' amounts is the amount at their mean rank.
  const rank = richer + (tied - 1) / 2; // literal-ok: the middle of the tied ranks
  return Math.floor(min + ((max - min) * rank) / (state.players.length - 1));
}

/** A player event's key: a row of EVENTS.player. */
export type PlayerEventKey = keyof typeof EVENTS.player;

/**
 * The chance a player row rolls for this player at the start of this phase: its row's eventChance, reading no
 * firedThisPhase (a follows-this-phase raise counts 0) and not the row's only-if (buildEvent finding a plot to hit).
 */
export function playerEventChance(state: GameState, key: PlayerEventKey, phase: Phase, id: string): number {
  return eventChance(state, EVENTS.player[key], phase, { player: id });
}

/**
 * Why a player event would fire for this player, so the screens can say it: the air or its own pollution, whichever
 * raised its chance more (the air on a tie), or plain chance when neither raised it.
 */
export function playerEventReason(state: GameState, key: PlayerEventKey, phase: Phase, id: string): 'air' | 'pollution' | 'chance' {
  const { air, pollution } = influences(state, EVENTS.player[key], { player: id });
  if (air <= 0 && pollution <= 0) return 'chance';
  return pollution > air ? 'pollution' : 'air';
}

/**
 * Whether a player row's roll hits for this player at the start of this phase, on the row dice rollPhase uses for that
 * row and seat; never on a what-if copy. It reads no firedThisPhase and skips the row's only-if (buildEvent finding a
 * plot to hit), so for a production row a hit is not yet an event that fired.
 */
export function rollPlayerEvent(state: GameState, key: PlayerEventKey, phase: Phase, id: string): boolean {
  if (state.whatIf) return false;
  const chance = playerEventChance(state, key, phase, id);
  if (chance <= 0) return false;
  return rowDice(state, key, phase, id).chance(chance);
}

/**
 * A row's dice for one roll, seeded from the game, the month, the row, the phase and whose roll it is (a player's id
 * or a plot's index), so a game replays exactly and no other roll moves it.
 */
export function rowDice(state: GameState, key: keyof typeof EVENTS.colony | PlayerEventKey, phase: Phase, who?: string): Rng {
  return createRng(seedOf(state.seed, state.month, key, phase, ...(who === undefined ? [] : [who])));
}

/**
 * The events that fire at the start of a phase, in order: each colony row once in table order, then each player's
 * rows in seat order; a per-plot row is not rolled here. A row fires when its seeded roll hits and its event finds a
 * plot to hit, a player row on that player's own plots; of a pair in EVENTS.excludes that both fire, the pair's seeded
 * dice keep one. Never on a what-if copy or before EVENTS.firstMonth.
 */
export function rollPhase(state: GameState, phase: Phase): MonthEvent[] {
  if (state.whatIf || state.month < EVENTS.firstMonth) return [];
  // Each row lists one phase and rolls once per roller, so none fires twice in a month (RULE-2's onceAMonth).
  const colony = roll(state, phase, rowsOf(EVENTS.colony), []);
  // The excludes resolve here, before any player row reads what fired, so a dropped event never fired. That needs every
  // excludes member to be a colony row and no colony row to follow one thisPhase; EM-T-AC-3's key check holds both.
  const kept = keepOneOfEachPair(state, phase, colony);
  return roll(state, phase, state.players.flatMap((p) => rowsOf(EVENTS.player, p.id)), kept);
}

/** `fired`, then each of `rolls` that fires, rolled in order; a later roll reads what fired before it. */
function roll(state: GameState, phase: Phase, rolls: ReturnType<typeof rowsOf>, fired: readonly MonthEvent[]): MonthEvent[] {
  const out = [...fired];
  for (const { key, row, player } of rolls) {
    const chance = eventChance(state, row, phase, { player, firedThisPhase: out.map((e) => e.key) });
    if (chance <= 0) continue;
    // Its own dice for the roll and the event's shape: a shared rng would let retuning one row move every later one.
    const rng = rowDice(state, key, phase, player);
    const event = rng.chance(chance) ? buildEvent(state, key, rng, player, phase) : null;
    if (event) out.push(event);
  }
  return out;
}

/** `fired` without the events EVENTS.excludes drops: of a pair that both fired, its own seeded dice keep one. */
function keepOneOfEachPair(state: GameState, phase: Phase, fired: MonthEvent[]): MonthEvent[] {
  let kept = fired;
  for (const pair of EVENTS.excludes) {
    if (!pair.every((key) => kept.some((e) => e.key === key))) continue;
    const keeper = createRng(seedOf(state.seed, state.month, phase, ...pair)).pick(pair);
    kept = kept.filter((e) => !pair.includes(e.key) || e.key === keeper);
  }
  return kept;
}

/**
 * A table's rows the phase start rolls, tagged with whose roll it is: sickness makes no MonthEvent and keeps its own
 * roll, and a per-plot row rolls after output.
 */
function rowsOf(table: Record<string, EventRow>, player?: string) {
  return Object.entries(table)
    .filter((entry): entry is [EventKey, EventRow] => Object.hasOwn(SHAPE, entry[0]) && !entry[1].perPlot && !entry[1].afterOutput)
    .map(([key, row]) => ({ key, row, player }));
}

/**
 * The colony rows that roll after production's output (a meteor strike), each once on its own dice: nothing on a
 * what-if copy or before EVENTS.firstMonth. The caller applies what fired.
 */
export function rollAfterOutput(state: GameState): MonthEvent[] {
  if (state.whatIf || state.month < EVENTS.firstMonth) return [];
  const rows = Object.entries(EVENTS.colony as Record<string, EventRow>).filter(([, row]) => row.afterOutput) as [keyof typeof EVENTS.colony, EventRow][];
  return rows.flatMap(([key, row]) => {
    const chance = eventChance(state, row, 'production');
    const rng = rowDice(state, key, 'production');
    const event = chance > 0 && rng.chance(chance) ? buildEvent(state, key, rng, undefined, 'production') : null;
    return event ? [event] : [];
  });
}

/**
 * Rolls a phase's events, applies them in fired order and keeps them in the month's list: the one call each phase but
 * production makes (spec C3). Production rolls inside runProduction, and the month keeps what its report files.
 */
export function firePhase(state: GameState, phase: Phase): MonthEvent[] {
  const fired = rollPhase(state, phase);
  applyEvents(state, fired);
  state.monthEvents.push(...fired);
  return fired;
}

/**
 * What each fired wave-2 event does, in fired order (spec RULE-4), filing its changes off the map on it as `effects`.
 * Nothing goes below 0 (HC-5). A cold snap's Energy need and a meteor strike's crater are production's to apply; a
 * wave-1 event changes only production's output.
 */
export function applyEvents(state: GameState, fired: readonly MonthEvent[]): void {
  // Inheritances are ranked once, on the wealth before any of this phase's payouts (RULE-3).
  const inherits = new Map(state.players.map((p) => [p.id, inheritanceAmount(state, p.id)]));
  for (const event of fired) {
    const effects: EventEffect[] = [];
    const change = (on: string, what: EventEffect['what'], delta: number) => {
      if (delta !== 0) effects.push({ on, what, delta });
    };
    const me = state.players.find((p) => p.id === event.player);
    switch (event.key) {
      case 'federationTax':
        for (const p of state.players) {
          const t = taken(p.money, EVENTS.colony.federationTax.share);
          p.money -= t;
          fundIn(state, 'federationTax', t);
          change(p.id, 'money', -t);
        }
        break;
      case 'federationGrant':
        for (const p of grantees(state)) {
          p.money += EVENTS.colony.federationGrant.amount;
          change(p.id, 'money', EVENTS.colony.federationGrant.amount);
        }
        break;
      case 'immigrationWave': {
        const n = Math.round(state.colonists * (1 + EVENTS.colony.immigrationWave.growth)) - state.colonists;
        state.colonists += n;
        change('colony', 'colonists', n);
        break;
      }
      case 'inheritance': {
        const amount = inherits.get(me!.id)!;
        me!.money += amount;
        change(me!.id, 'money', amount);
        break;
      }
      case 'muleTheft':
        for (const { index } of event.plots) Object.assign(state.tiles[index]!, { outfit: null, runMonths: 0, filter: false });
        break;
      case 'epidemic':
        for (const p of state.players) {
          if (p.stock.medicine >= 1) {
            p.stock.medicine--;
            change(p.id, 'medicine', -1);
          } else {
            p.sick = true;
            p.sickNext = true;
          }
        }
        break;
      case 'coldSnap':
        change('colony', 'energyNeed', Math.round((EVENTS.colony.coldSnap.factor - 1) * 100)); // literal-ok: the extra need in percent
        break;
      case 'pirateRaid':
        for (const p of state.players) {
          change(p.id, 'crystite', -p.stock.crystite);
          p.stock.crystite = 0;
        }
        change('store', 'crystite', -state.store.stock.crystite);
        state.store.stock.crystite = 0;
        break;
      case 'storeFire':
        for (const g of GOODS) {
          change('store', g, -state.store.stock[g]);
          state.store.stock[g] = 0;
        }
        change('store', 'mules', -state.store.mules);
        state.store.mules = 0;
        break;
      case 'ratsInSilo': {
        const n = taken(me!.stock.food, EVENTS.player.ratsInSilo.share);
        me!.stock.food -= n;
        change(me!.id, 'food', -n);
        break;
      }
      case 'crookedAccountant': {
        const n = taken(me!.money, EVENTS.player.crookedAccountant.share);
        me!.money -= n;
        change(me!.id, 'money', -n);
        break;
      }
      case 'packageFromHome':
        me!.stock.food += EVENTS.player.packageFromHome.amount;
        change(me!.id, 'food', EVENTS.player.packageFromHome.amount);
        break;
      // G-5 C26: colony.ts and politics.ts write the colony and reputation; each effect is what moved.
      case 'festival': {
        const f = SOCIAL_EVENTS.colony.festival;
        const mood = state.colony?.happiness ?? 0;
        moodShift(state, f.moodShift);
        change('colony', 'mood', (state.colony?.happiness ?? 0) - mood);
        const prestige = state.colony?.permanentPrestige ?? 0;
        addPrestige(state, f.prestige);
        change('colony', 'prestige', (state.colony?.permanentPrestige ?? 0) - prestige);
        // The extra Food is this month's demand: the store's outlook and the colonists' meal read it back (festivalFood).
        change('store', 'food', Math.round((state.colonists / UPKEEP.colonistsPerUnit) * f.foodDemand));
        break;
      }
      case 'generalStrike':
        // Announced in planning; production reads strikeHolds and files its own event (strikeEvent).
        if (event.phase !== 'production') callStrike(state, event.plots[0]!.good);
        break;
      case 'emigrationWave': {
        const n = Math.round(state.colonists * (1 - SOCIAL_EVENTS.colony.emigrationWave.shrink)) - state.colonists;
        state.colonists += n;
        change('colony', 'colonists', n);
        break;
      }
      case 'blamedForUnrest': {
        const was = me!.reputation;
        reputationShift(state, me!.id, SOCIAL_EVENTS.player.blamedForUnrest.reputation);
        change(me!.id, 'reputation', me!.reputation - was);
        break;
      }
      default:
        break;
    }
    if (effects.length > 0) event.effects = effects;
  }
}

/** A seed from a game's seed, its month and some names: FNV-1a over them. */
function seedOf(seed: number, month: number, ...names: string[]): number {
  let h = 2_166_136_261; // literal-ok: FNV-1a offset basis
  for (const part of [String(seed), String(month), ...names]) {
    for (let i = 0; i < part.length; i++) h = Math.imul(h ^ part.charCodeAt(i), 16_777_619); // literal-ok: FNV-1a prime
    h = Math.imul(h ^ 0, 16_777_619); // literal-ok: FNV-1a prime, a separator between parts
  }
  return h >>> 0;
}
