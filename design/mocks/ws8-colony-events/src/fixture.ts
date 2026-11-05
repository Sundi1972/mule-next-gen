import { EVENT_SHOW } from '@mule/engine';
import type { ColonyProjectView, ColonyView } from '@mule/protocol';
import { type MapTile, type ShowEffect, type ShowEventKey, type ShowEventView, type ShowLine, type ShowPlayer, type Slot } from '@mule/ui';
// STORY is the catalogue's, exported from its module (index.ts exports only EVENT_ENTRY).
import { STORY } from '../../../../packages/ui/src/events/catalogue';

/**
 * The colony's mood events as the server sends them, on WS1's frozen C26–C28 contract (catalogue rev 22, G-5 spec
 * C26/RULE-26 at f06477b9). Only the numbers are fixtures: who owns what, how much each plot makes, the fund.
 */

// --- The table ------------------------------------------------------------------------------------------------------

export const W = 9;
export const H = 5;
export const STORE = { x: 4, y: 2 };
export const LENA = 's1';
export const OSSA = 's2';
export const BRIX = 's3';
export const KAI = 's4';
export const GOVERNOR = KAI;
export const PLAYERS: ShowPlayer[] = [
  { id: LENA, name: 'Lena', slot: 0 },
  { id: OSSA, name: 'Ossa', slot: 1 },
  { id: BRIX, name: 'Brix', slot: 2 },
  { id: KAI, name: 'Kai', slot: 3 },
];
export const SLOTS: Record<string, Slot> = Object.fromEntries(PLAYERS.map((p) => [p.id, p.slot]));
export const nameOf = (id: string) => PLAYERS.find((p) => p.id === id)?.name ?? id;

/** Four farms across three players, so a Food strike stands on land everyone can see. */
const OWNED: Record<string, [Slot, NonNullable<MapTile['good']>, number]> = {
  '1,1': [0, 'food', 5],
  '2,1': [0, 'food', 4],
  '1,2': [0, 'water', 3],
  '6,3': [1, 'smithore', 3],
  '7,3': [1, 'energy', 4],
  '2,3': [2, 'food', 4],
  '3,4': [2, 'energy', 3],
  '6,1': [3, 'food', 3],
  '7,1': [3, 'crystite', 2],
};
const TERRAIN: Record<string, MapTile['terrain']> = { '0,0': 'hills', '8,0': 'mountains', '0,4': 'forest', '8,4': 'hills', '5,0': 'river', '5,1': 'river' };
/** The park stands on its plot (5,4); the hospital needs none. */
export const PARK_AT = { x: 5, y: 4 };

export function tilesWith(park: 'standing' | 'damaged' = 'standing'): MapTile[] {
  return Array.from({ length: W * H }, (_, i) => {
    const x = i % W;
    const y = Math.floor(i / W);
    const own = OWNED[`${x},${y}`];
    if (x === STORE.x && y === STORE.y) return { x, y, terrain: 'store', owner: null };
    if (x === PARK_AT.x && y === PARK_AT.y) return { x, y, terrain: 'plains', owner: null, object: { kind: 'park', name: 'Park', stage: park, buildMonths: 1 } };
    const terrain = TERRAIN[`${x},${y}`] ?? 'plains';
    return own ? { x, y, terrain, owner: own[0], good: own[1] } : { x, y, terrain, owner: null };
  });
}
export const TILES = tilesWith();
export const TILES_PARK_HIT = tilesWith('damaged');

/** Every plot of a good, in reading order: the struck good's plots. */
export const plotsOf = (good: NonNullable<MapTile['good']>) =>
  Object.entries(OWNED)
    .filter(([, [, g]]) => g === good)
    .map(([k, [slot, , made]]) => {
      const [x, y] = k.split(',').map(Number) as [number, number];
      return { x, y, slot, made, owner: PLAYERS.find((p) => p.slot === slot)!.id };
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);

// --- The contract's shapes ------------------------------------------------------------------------------------------

/** C26's new keys. The UI's ShowEventKey union widens to take them in the build; until then they are cast here. */
export type C26Key = 'generalStrike' | 'festival' | 'riot' | 'emigrationWave' | 'volunteerCleanup' | 'storeStrike' | 'walkout' | 'loyalCrew' | 'blamedForUnrest';
/** C26's effect: `what` gains the colony's gauges and a player's reputation. ShowEffect widens to match in the build. */
export interface C26Effect {
  on: string;
  what: ShowEffect['what'] | 'mood' | 'prestige' | 'air' | 'reputation';
  delta: number;
}
/** C26's MonthEvent as the show reads it: its key and effects widened, and the riot's damaged objects. */
export type C26Event = Omit<ShowEventView, 'key' | 'effects'> & {
  key: ShowEventKey | C26Key;
  effects?: C26Effect[];
  objects?: { id: ColonyProjectView['id']; becomes: 'damaged' }[];
};

/** The effects today's words (copy.ts effectWords) can say: the rest are drawn by this mock's own chips. */
const SAID: ReadonlySet<string> = new Set(['money', 'mules', 'colonists', 'energyNeed', 'food', 'energy', 'water', 'smithore', 'crystite', 'alloy', 'electronics', 'medicine']);
export const isSaid = (f: C26Effect) => SAID.has(f.what);

/**
 * The event as the real show parts take it. The cast is the one place a C26 key meets today's ShowEventKey union. The
 * effects today's copy can't word yet (mood, prestige, air, reputation) stay out of what the real log and phone cards
 * read, so they never print "undefined"; the mock's own chips draw them. In the build effectWords gains the four.
 */
export const forShow = (ev: C26Event): ShowEventView => ({ ...ev, effects: (ev.effects ?? []).filter(isSaid) }) as unknown as ShowEventView;
export const gaugeEffects = (ev: C26Event) => (ev.effects ?? []).filter((f) => !isSaid(f));

/** One change in a few words: today's effectWords for the known ones, and the four C26 adds. */
export function c26Words(f: C26Effect): string {
  const n = `${f.delta < 0 ? '−' : '+'}${Math.abs(f.delta)}`;
  switch (f.what) {
    case 'mood':
      return `Mood ${n}`;
    case 'prestige':
      return `Prestige ${n}`;
    case 'air':
      return `Air ${n}`;
    case 'reputation':
      return `Reputation ${n}`;
    default:
      return n;
  }
}

export const INTRO_MS = EVENT_SHOW.introMs;
export const PLAY_MS = EVENT_SHOW.playMs.headline;

function event(key: C26Event['key'], phase: ShowEventView['phase'], extra: Partial<C26Event>): C26Event {
  return { key, kind: key, title: key, line: '', sign: 'bad', scope: 'colony', origin: { ...STORE }, hits: [], phase, weight: 'headline', playMs: PLAY_MS, ...extra };
}

// --- The general strike ---------------------------------------------------------------------------------------------

export const STRIKE = { good: 'food' as const, cost: 240, fund: 2_340 };
export const FOOD_PLOTS = plotsOf('food');

/** Planning: the announcement. Its plots[] name the struck good's plots; nothing has been made yet, so no delta. */
export const STRIKE_PLANNING = event('generalStrike', 'planning', {
  title: 'General strike',
  line: `This month every Food plot makes 20%, unless the Governor pays the strikers ${STRIKE.cost} cr from the colony fund.`,
  hits: FOOD_PLOTS.map((p, i) => ({ x: p.x, y: p.y, order: i, delta: 0 })),
});

/** Down to 20%, as the engine rounds it (RULE-26): what one struck plot keeps. */
export const struck = (made: number) => Math.max(0, Math.round(made * 0.2));

/** Production, unpaid: the same key, phase production, every plot of the good down to 20%. */
export const STRIKE_PRODUCTION = event('generalStrike', 'production', {
  title: 'General strike',
  line: 'The strikers held: every Food plot makes 20% this month.',
  hits: FOOD_PLOTS.map((p, i) => ({ x: p.x, y: p.y, order: i, delta: struck(p.made) - p.made })),
});

/** The production show's lines: every working plot, what it made before the events. */
export const LINES: ShowLine[] = Object.entries(OWNED)
  .map(([k, [slot, good, made]]) => {
    const [x, y] = k.split(',').map(Number) as [number, number];
    return { x, y, owner: PLAYERS.find((p) => p.slot === slot)!.id, good, made, parts: [] as ShowLine['parts'] };
  })
  .sort((a, b) => a.y - b.y || a.x - b.x);

// --- The festival, the riot -----------------------------------------------------------------------------------------

export const FESTIVAL = event('festival', 'planning', {
  title: 'Festival',
  line: 'Mood +10, prestige +2, Food demand +25% this month.',
  sign: 'good',
  effects: [
    { on: 'colony', what: 'mood', delta: 10 },
    { on: 'colony', what: 'prestige', delta: 2 },
    { on: 'store', what: 'food', delta: 6 },
  ],
});

export const riot = (object: 'park' | 'hospital') =>
  event('riot', 'upkeep', {
    title: 'Riot',
    line: 'One prestige object is damaged (no prestige until repaired); the store loses a third of its stock.',
    hits: object === 'park' ? [{ x: PARK_AT.x, y: PARK_AT.y, order: 0, delta: 0 }] : [],
    objects: [{ id: object, becomes: 'damaged' }],
    effects: [
      { on: 'store', what: 'food', delta: -6 },
      { on: 'store', what: 'energy', delta: -4 },
      { on: 'store', what: 'smithore', delta: -5 },
    ],
  });
/** What the store held before the riot, per good: a third goes. */
export const STORE_STOCK: Record<string, number> = { food: 18, energy: 12, smithore: 15 };

// --- The gallery's rows ---------------------------------------------------------------------------------------------

export const GALLERY: { ev: C26Event; reuses: string }[] = [
  { ev: event('emigrationWave', 'planning', { title: 'Emigration wave', line: '10% fewer colonists, for good.', effects: [{ on: 'colony', what: 'colonists', delta: -12 }] }), reuses: 'immigration’s shuttle, leaving: colonists file in at the store, it lifts off, the head count ticks down.' },
  { ev: event('volunteerCleanup', 'upkeep', { title: 'Volunteer clean-up', line: 'The air gauge drops by 5.', sign: 'good', effects: [{ on: 'colony', what: 'air', delta: -5 }] }), reuses: 'the festival’s landing: the “Air −5” chip lands on the Environment gauge.' },
  { ev: event('storeStrike', 'development', { title: 'Store strike', line: 'The store sells no MULEs this turn.', effects: [{ on: 'store', what: 'mules', delta: 0 }] }), reuses: 'the store fire’s corral row, calm: the MULE shelf greys out with a NO MULES chip, no fire.' },
  {
    ev: event('walkout', 'production', { title: 'Walkout', line: 'Your plots of one good make 20% this month.', scope: 'personal', player: BRIX, origin: { x: 3, y: 4 }, weight: 'spotlight', hits: [{ x: 3, y: 4, order: 0, delta: struck(3) - 3 }] }),
    reuses: 'the pest swarm’s pattern: the spotlight on the player, each of their plots of the good struck in turn, its chip left on the plot.',
  },
  { ev: event('loyalCrew', 'production', { title: 'Loyal crew', line: 'One of your plots makes 1 more this month.', sign: 'good', scope: 'personal', player: LENA, origin: { x: 1, y: 1 }, weight: 'spotlight', hits: [{ x: 1, y: 1, order: 0, delta: 1 }] }), reuses: 'the bumper harvest: one plot glows and its gain chip stays.' },
  { ev: event('blamedForUnrest', 'planning', { title: 'Blamed for the unrest', line: 'Reputation −1, so fewer votes.', scope: 'personal', player: OSSA, effects: [{ on: OSSA, what: 'reputation', delta: -1 }] }), reuses: 'the crooked accountant’s ledger card: the chip lands on the player’s seat, no map story.' },
];

// --- The colony -----------------------------------------------------------------------------------------------------

const project = (id: 'park' | 'hospital', stage: ColonyProjectView['stage']): ColonyProjectView => ({
  id,
  name: id === 'park' ? 'Park' : 'Hospital',
  stage,
  cost: { credits: id === 'park' ? 420 : 680, goods: {} },
  funded: { credits: id === 'park' ? 420 : 680, goods: {} },
  buildMonths: id === 'park' ? 1 : 2,
  monthsLeft: null,
  plot: id === 'park' ? PARK_AT.y * W + PARK_AT.x : null,
  prestige: id === 'park' ? 2 : 3,
  upkeep: id === 'park' ? 30 : 45,
  repairCost: stage === 'damaged' ? (id === 'park' ? 150 : 225) : null,
  plaque: [],
});

/** Month 7 of a game with politics on: the park and the hospital stand, prestige 5, the colony Content at 64. */
export function colony(over: { happiness?: number; prestige?: number; fund?: number; environment?: number; strike?: ColonyView['strike']; damaged?: 'park' | 'hospital' | null; lastHappiness?: number } = {}): ColonyView {
  const happiness = over.happiness ?? 64;
  return {
    gauges: { wealth: 3_120, environment: over.environment ?? 22, prestige: over.prestige ?? 5, happiness, band: bandOf(happiness) },
    lastGauges: { wealth: 2_980, prestige: 5, happiness: over.lastHappiness ?? 61 },
    fund: over.fund ?? STRIKE.fund,
    ledger: null,
    projects: [project('park', over.damaged === 'park' ? 'damaged' : 'standing'), project('hospital', over.damaged === 'hospital' ? 'damaged' : 'standing')],
    catalogue: [],
    strike: over.strike ?? null,
    score: null,
  };
}

/** C23's bands at the engine's thresholds (config.ts colony.mood.bands). */
export function bandOf(h: number): NonNullable<ColonyView['gauges']['band']> {
  return h >= 80 ? 'thriving' : h >= 60 ? 'content' : h >= 40 ? 'restless' : h >= 20 ? 'unhappy' : 'unrest';
}

// --- Each new key's story timing (STORY is exported and mutable; in the build these join catalogue.ts) ---------------

const STORY_TIMES = STORY as Record<string, (typeof STORY)[ShowEventKey]>;
// The strikers walk out of the store to the struck good's plots, one plot after the other; the chip goes up as each arrives.
STORY_TIMES.generalStrike = { length: 5.4, lands: 2.6, step: 0.35, reveal: 4.6 };
// Bunting goes up over the colony and a crowd gathers at the store; then the changes come up and land on the gauges.
STORY_TIMES.festival = { length: 5.2, focus: 'store', zoom: 1.6, lands: 3.6, step: 0.35, reveal: 3.6 };
// A crowd at the store; a third of each shelf goes, shelf by shelf; the camera pulls back and the damaged object is hit.
STORY_TIMES.riot = { length: 6, focus: 'store', zoom: 1.7, lands: 4.6, step: 0.45, reveal: 4.2 };
