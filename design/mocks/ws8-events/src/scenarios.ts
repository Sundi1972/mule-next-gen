import type { MapTile } from '@mule/ui';
import { CATALOGUE, ENTRY, type EventKey } from './catalogue';
import { made, METEOR, PESTS, SICK_BRIX, SICK_LENA, STORM, type Effect, type Hit, type Scenario, type ShowEvent } from './events';
import { TILES } from './fixture';

/**
 * One scene per catalogue event on WS6's fixture colony (month 5, four players), and the sets that fire together in
 * one phase. Direction-independent: every direction plays these same scenes. Numbers follow the catalogue's rules on
 * the fixture's output; they are display data, not balance.
 */

export interface Scene extends Scenario {
  /** The map, when the scene needs it changed: a special field, a plot flagged for sale. */
  tiles?: MapTile[];
}

const STORE = { x: 6, y: 4 };

/** Hits in the order given, each with its own change. */
const hits = (list: [number, number][], delta: (x: number, y: number) => number, extra: Partial<Hit> = {}): Hit[] =>
  list.map(([x, y], order) => ({ x, y, order, good: goodAt(x, y), delta: delta(x, y), ...extra }));
const goodAt = (x: number, y: number) => TILES.find((t) => t.x === x && t.y === y)?.good;

/** The event's own words, from the catalogue; the line is what the TV reads out. */
function ev(key: EventKey, line: string, rest: Partial<ShowEvent> & Pick<ShowEvent, 'origin'>): ShowEvent {
  const c = ENTRY[key];
  return {
    key,
    title: c.title,
    line,
    scope: c.who === 'colony' || c.who === 'tile' ? 'colony' : c.who === 'area' ? 'local' : 'personal',
    sign: c.sign,
    phase: c.phases[0]!,
    plots: [],
    ...rest,
  };
}
const cash = (on: string, delta: number): Effect => ({ on, what: 'cash', delta });

// --- Planning ---------------------------------------------------------------------------------------------------

const TAX = ev('federationTax', 'The Federation takes 10% of every player’s cash for the colony fund.', {
  origin: STORE,
  effects: [cash('lena', -64), cash('ossa', -91), cash('brix', -38), cash('kai', -22), { on: 'colony', what: 'fund', delta: 215 }],
});
const GRANT = ev('federationGrant', 'The Federation grants 150 to each of the two poorest players.', { origin: STORE, effects: [cash('kai', 150), cash('brix', 150)] });
const IMMIGRATION = ev('immigrationWave', 'Colonists arrive: 10% more, for good. The store buys more Food, Water and Energy.', { origin: STORE, effects: [{ on: 'colony', what: 'colonists', delta: 10, pct: true }] });
const EMIGRATION = ev('emigrationWave', 'Colonists leave: 10% fewer, for good. The store buys less.', { origin: STORE, effects: [{ on: 'colony', what: 'colonists', delta: -10, pct: true }] });
const FESTIVAL = ev('festival', 'A festival! Mood and prestige rise, and the colony eats 25% more Food this month.', {
  origin: STORE,
  effects: [
    { on: 'colony', what: 'mood', delta: 10 },
    { on: 'colony', what: 'prestige', delta: 2 },
    { on: 'colony', what: 'demand', good: 'food', delta: 25, pct: true },
  ],
});
const STRIKE = ev('generalStrike', 'General strike: every Smithore plot makes 20% this production, unless the Governor pays the strikers.', {
  origin: STORE,
  landsIn: 'production',
  plots: hits([[12, 4], [13, 4], [12, 5], [9, 2], [10, 3]], (x, y) => Math.round(made(x, y) * 0.2) - made(x, y), { pending: true }),
});
const INHERITANCE = ev('inheritance', 'Kai inherits 260 credits from a relative back home.', { origin: STORE, player: 'kai', effects: [cash('kai', 260)] });
const BLAMED = ev('blamedForUnrest', 'The colony blames Ossa for the unrest: reputation −1.', { origin: STORE, player: 'ossa', effects: [{ on: 'ossa', what: 'reputation', delta: -1 }] });

// --- Land grant -------------------------------------------------------------------------------------------------

const PLOT_OFFERED = ev('colonyPlot', 'After the grant, the colony puts one free plot up for auction.', { origin: { x: 8, y: 3 }, plots: [{ x: 8, y: 3, order: 0, delta: 0 }] });

// --- Development ------------------------------------------------------------------------------------------------

const THEFT = ev('muleTheft', 'A thief takes the MULE off one of Ossa’s plots: it stands idle until it’s outfitted again.', {
  origin: { x: 12, y: 5 },
  player: 'ossa',
  plots: hits([[12, 5]], () => 0, { muleLost: true, becomes: 'idle' }),
});
const pace = (on: string): Effect => ({ on, what: 'pace', delta: -50, turns: 2 });
const EPIDEMIC = ev('epidemic', 'An epidemic: everyone without Medicine is sick this turn and next.', { origin: STORE, effects: [pace('lena'), pace('brix'), pace('kai')] });
const STORE_STRIKE = ev('storeStrike', 'The store’s staff strike: no MULEs for sale this turn.', { origin: STORE, effects: [{ on: 'store', what: 'mules', delta: 0 }] });

// --- Production -------------------------------------------------------------------------------------------------

const FOOD_WATER: [number, number][] = [[10, 7], [9, 7], [8, 6], [7, 2], [7, 3], [6, 2], [6, 7], [4, 3], [3, 2], [2, 6]];
const DROUGHT = ev('drought', 'Drought: every Food and Water plot makes 1 less.', { origin: { x: 14, y: 3 }, direction: 'e', plots: hits(FOOD_WATER, () => -1) });
const ACID = ev('acidRain', 'Acid rain: every Energy and Food plot makes 1 less.', {
  origin: { x: 7, y: 0 },
  direction: 'n',
  plots: hits([[6, 2], [7, 2], [3, 2], [7, 3], [1, 4], [6, 5], [5, 5], [4, 5], [3, 5], [2, 6], [3, 6], [6, 7]], () => -1),
});
const FLARE = ev('solarFlare', 'A solar flare: every Energy plot makes 2 more.', { origin: { x: 14, y: 2 }, direction: 'e', plots: hits([[6, 5], [5, 5], [4, 5], [3, 5], [3, 6], [1, 4]], () => 2) });
const COMET = ev('cometPass', 'A comet passes: every Water plot makes 2 more.', { origin: { x: 0, y: 1 }, direction: 'w', plots: hits([[4, 3], [8, 6], [9, 7], [10, 7]], () => 2) });
const FLOOD = ev('flood', 'The river floods: Food plots on the river make nothing.', { origin: { x: 6, y: 0 }, plots: hits([[6, 2], [7, 2], [7, 3], [6, 7]], (x, y) => -made(x, y)) });
const ASH = ev('volcanicAsh', 'Ash falls: plots within 2 steps of the volcano make 1 less.', { origin: { x: 3, y: 5 }, plots: hits([[3, 5], [4, 5], [2, 6], [3, 6], [1, 4], [4, 3], [5, 5]], () => -1) });
const COLD = ev('coldSnap', 'A cold snap: every plot needs twice its Energy this month.', {
  origin: { x: 7, y: 0 },
  direction: 'n',
  plots: hits([[6, 7], [9, 7], [10, 7]], () => -1),
  effects: [{ on: 'colony', what: 'energyNeed', delta: 100, pct: true }],
});
/** A fire on Lena's middle farm; `now` is what each plot makes before it (another event may have struck first). */
const fire = (now: (x: number, y: number) => number) =>
  ev('wildfire', 'A fire burns one Food plot and scorches the farms joined to it.', {
    origin: { x: 7, y: 2 },
    player: 'lena',
    plots: hits([[7, 2], [6, 2], [7, 3]], (x, y) => (x === 7 && y === 2 ? -now(x, y) : -1)),
  });
const FIRE = fire(made);
const harvest = (now: (x: number, y: number) => number) => ev('bumperHarvest', 'One of Kai’s plots makes double.', { origin: { x: 9, y: 7 }, player: 'kai', plots: hits([[9, 7]], now) });
const HARVEST = harvest(made);
const CAVE_IN = ev('cavernCollapse', 'Ossa’s crystal cavern caves in and becomes a plain plot.', { origin: { x: 10, y: 2 }, player: 'ossa', plots: hits([[10, 2]], () => 0, { becomes: 'plain' }) });
const WALKOUT = ev('walkout', 'Brix’s Smithore crews walk out: those plots make 20% this month.', { origin: { x: 9, y: 2 }, player: 'brix', plots: hits([[9, 2], [10, 3]], (x, y) => Math.round(made(x, y) * 0.2) - made(x, y)) });
const CREW = ev('loyalCrew', 'Kai’s crew works through: one plot makes 1 more this month.', { origin: { x: 6, y: 7 }, player: 'kai', plots: hits([[6, 7]], () => 1) });

// --- Goods auction ----------------------------------------------------------------------------------------------

const PIRATES = ev('pirateRaid', 'Pirates raid the colony and take all the Crystite the players hold.', {
  origin: STORE,
  effects: [
    { on: 'ossa', what: 'crystite', delta: -6 },
    { on: 'lena', what: 'crystite', delta: -3 },
  ],
});
const STORE_FIRE = ev('storeFire', 'Fire at the store: all its Food burns, and Food’s price jumps until it’s restocked.', {
  origin: STORE,
  effects: [
    { on: 'store', what: 'food', delta: -14 },
    { on: 'store', what: 'price', good: 'food', delta: 60, pct: true },
  ],
});

// --- Upkeep -----------------------------------------------------------------------------------------------------

const RATS = ev('ratsInSilo', 'Rats get into Lena’s silo and eat half the stored Food.', { origin: STORE, player: 'lena', effects: [{ on: 'lena', what: 'food', delta: -3 }] });
const ACCOUNTANT = ev('crookedAccountant', 'Ossa’s accountant skims 10% of the cash.', { origin: STORE, player: 'ossa', effects: [cash('ossa', -91)] });
const PACKAGE = ev('packageFromHome', 'A package from home: Kai gets 3 Food.', { origin: STORE, player: 'kai', effects: [{ on: 'kai', what: 'food', delta: 3 }] });
/** The mob gathers in the west, loots the store on its way, then smashes the stadium: the effects land in that order. */
const RIOT = ev('riot', 'A riot: the store loses a third of its stock, and the stadium is damaged.', {
  origin: { x: 2, y: 6 },
  effects: [
    { on: 'store', what: 'food', delta: -5 },
    { on: 'store', what: 'energy', delta: -4 },
    { on: 'colony', what: 'prestige', delta: -2 },
  ],
});
const CLEANUP = ev('volunteerCleanup', 'Volunteers clean up the colony: the air gauge drops by 5.', { origin: STORE, effects: [{ on: 'colony', what: 'air', delta: -5 }] });

// --- One scene per event ----------------------------------------------------------------------------------------

const withTile = (x: number, y: number, patch: Partial<MapTile>) => TILES.map((t) => (t.x === x && t.y === y ? { ...t, ...patch } : t));

const ONE: Record<EventKey, ShowEvent> = {
  federationTax: TAX, federationGrant: GRANT, immigrationWave: IMMIGRATION, emigrationWave: EMIGRATION, festival: FESTIVAL, generalStrike: STRIKE, inheritance: INHERITANCE, blamedForUnrest: BLAMED,
  colonyPlot: PLOT_OFFERED,
  sickness: SICK_LENA, muleTheft: THEFT, epidemic: EPIDEMIC, storeStrike: STORE_STRIKE,
  dustStorm: STORM, drought: DROUGHT, acidRain: ACID, solarFlare: FLARE, cometPass: COMET, flood: FLOOD, volcanicAsh: ASH, coldSnap: COLD, meteorStrike: METEOR,
  pestSwarm: PESTS, wildfire: FIRE, bumperHarvest: HARVEST, cavernCollapse: CAVE_IN, walkout: WALKOUT, loyalCrew: CREW,
  pirateRaid: PIRATES, storeFire: STORE_FIRE,
  ratsInSilo: RATS, crookedAccountant: ACCOUNTANT, packageFromHome: PACKAGE, riot: RIOT, volunteerCleanup: CLEANUP,
};

const TILES_FOR: Partial<Record<EventKey, MapTile[]>> = {
  colonyPlot: withTile(8, 3, { flag: 'sale' }),
  cavernCollapse: withTile(10, 2, { special: { kind: 'crystalCavern' } }),
};

/** Every event on its own, in catalogue order: id `ev-<key>`. */
export const EVENT_SCENES: Scene[] = CATALOGUE.map((c) => ({
  id: `ev-${c.key}`,
  title: c.title,
  phase: c.phases[0]!,
  events: [ONE[c.key]],
  shows: c.look,
  ...(TILES_FOR[c.key] ? { tiles: TILES_FOR[c.key]! } : {}),
}));
export const sceneOf = (key: EventKey) => EVENT_SCENES.find((s) => s.id === `ev-${key}`)!;

// --- Events that fire together in one phase ---------------------------------------------------------------------

/** What each plot makes after `before` have struck it, so a later event's change stacks on theirs. */
const after = (before: ShowEvent[]) => (x: number, y: number) => before.flatMap((e) => e.plots).filter((h) => h.x === x && h.y === y).reduce((n, h) => Math.max(0, n + h.delta), made(x, y));

const DRY_FIRE = fire(after([DROUGHT]));
const FLARE_COMET_HARVEST = harvest(after([COMET]));

/** Sets of events that can fall in one phase, in the order they fired. Opposites never share a month. */
export const TOGETHER: (Scene & { why: string })[] = [
  {
    id: 'tg-planning', title: 'Planning: tax, inheritance, blame', phase: 'planning', events: [TAX, INHERITANCE, BLAMED],
    shows: 'A headline, then a roll call of two players’ news.',
    why: 'Colony events roll first, then each player’s. The tax plays on its own; Kai’s inheritance and Ossa’s blame gather into one roll call that closes the phase.',
  },
  {
    id: 'tg-development', title: 'A troubled development', phase: 'development', events: [THEFT, SICK_LENA, SICK_BRIX],
    shows: 'MULE theft on Ossa’s plot, then two players sick in one roll call.',
    why: 'Smoggy air: 1.3 of a troubled colony’s 1.5 development events are sick players. Theft is a spotlight, so it plays first; the sick tags gather.',
  },
  {
    id: 'tg-epidemic', title: 'Epidemic and store strike', phase: 'development', events: [EPIDEMIC, STORE_STRIKE],
    shows: 'Two headlines at the walk’s start: everyone without Medicine sick, and no MULEs to buy.',
    why: 'An unhappy colony in Toxic air. Both are colony events, so both take the TV, one after the other.',
  },
  {
    id: 'tg-storm', title: 'Storm, pests, meteor', phase: 'production', events: [STORM, PESTS, METEOR],
    shows: 'The overall-look sequence: a sweep, a spotlight, a strike.',
    why: 'Each production event rolls on its own dice, so two or three can land in one month. Each plays in the order it fired.',
  },
  {
    id: 'tg-dry', title: 'A dry month', phase: 'production', events: [DROUGHT, DRY_FIRE, CAVE_IN],
    shows: 'Drought, then a wildfire on Lena’s farms, then Ossa’s cavern caves in. The fire stacks on the drought.',
    why: 'Wildfire is +3 during or after a drought. Effects stack: Lena’s farm makes 4, the drought takes 1, the fire burns the other 3.',
  },
  {
    id: 'tg-good', title: 'A good month', phase: 'production', events: [FLARE, COMET, FLARE_COMET_HARVEST],
    shows: 'Solar flare, comet pass, and Kai’s bumper harvest on a well the comet already raised.',
    why: 'Good events stack too: Kai’s well makes 4, the comet adds 2, the harvest doubles the 6.',
  },
  {
    id: 'tg-auction', title: 'Raid and fire before the auction', phase: 'auction', events: [PIRATES, STORE_FIRE],
    shows: 'Pirates take the players’ Crystite, then the store’s Food burns: both change what is worth selling.',
    why: 'The auction rolls before trading opens, so both land before the first bid.',
  },
  {
    id: 'tg-upkeep', title: 'Upkeep: clean-up and three players’ news', phase: 'upkeep', events: [CLEANUP, RATS, ACCOUNTANT, PACKAGE],
    shows: 'A colony headline, then one roll call for Lena’s rats, Ossa’s accountant and Kai’s package.',
    why: 'Three bulletins of three kinds still make one roll call, so a busy upkeep is one interruption, not four.',
  },
];

/** The pairs that never share a month: if both roll, the seeded dice keep one. */
export const OPPOSITES: [EventKey, EventKey][] = [
  ['drought', 'flood'],
  ['dustStorm', 'solarFlare'],
  ['festival', 'generalStrike'],
];

/** Which fields of the event drive what the screens show: read from the event, so it never drifts from the scene. */
export function drivesOf(e: ShowEvent): string[] {
  const out: string[] = [];
  const c = ENTRY[e.key];
  out.push(`key ${e.key} → its glyph; PROPOSED kind ${c.motion} → how it moves`);
  if (e.player) out.push(`player ${e.player} → whose ${e.plots.length ? 'land is singled out' : 'slot it lands on'}`);
  else out.push(`scope ${e.scope} → ${e.scope === 'colony' ? 'the whole colony' : 'one area of the map'}`);
  if (e.direction) out.push(`origin + direction ${e.direction} → the edge it comes in from`);
  else if (e.plots.length) out.push(`origin (${e.origin.x}, ${e.origin.y}) → where it starts`);
  if (e.plots.length > 1) out.push('plots[].order → the order it reaches each plot');
  if (e.plots.some((h) => h.delta !== 0)) out.push('plots[].delta, good → the chip on each plot, and its bars');
  if (e.plots.some((h) => h.muleLost)) out.push('PROPOSED plots[].muleLost → the MULE gone');
  if (e.plots.some((h) => h.becomes)) out.push(`PROPOSED plots[].becomes ${e.plots.find((h) => h.becomes)!.becomes} → what the plot turns into`);
  if (e.plots.some((h) => h.pending)) out.push('PROPOSED landsIn production → announced now, struck then');
  if (e.effects?.length) out.push(`PROPOSED effects[] (${[...new Set(e.effects.map((f) => f.what))].join(', ')}) → the chips on the slots, the store and the gauges`);
  if (e.because) out.push('PROPOSED because → the phone’s “why”');
  if (e.key === 'colonyPlot') out.push('the tile’s flag sale → the plot marked for auction');
  return out;
}

/** Every scene that shows an event, for the catalogue's "also in" links. */
export const scenesWith = (key: EventKey) => TOGETHER.filter((s) => s.events.some((e) => e.key === key));
