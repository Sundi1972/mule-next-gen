import type { Good, MapTile, Slot, Species } from '@mule/ui';

/**
 * The production show in three acts, as Heiko asked for it (2026-11-05): every plot makes its base output one after
 * the next; then a second pass adds the bonuses and takes the losses, each on its own plot; then the goods fly from
 * each plot into its owner's silo. Fixture data only, one 4-player game in month 5; nothing here is computed by the engine.
 */

export const W = 15;
export const H = 9;

const ROWS = [
  'mmhppfrrpsdddtt',
  'mhppffrrppsddti',
  'hppplfrrppcsdti',
  'pppllprrpphhdii',
  'ppfpppSrrpphhmm',
  'fppvpprrpppdmmm',
  'ffppprrpplpdhmm',
  'sfpppprpplldhhm',
  'ssfpprrppplddhh',
];
const TERRAIN = {
  m: 'mountains', h: 'hills', p: 'plains', f: 'forest', r: 'river', s: 'swamp', d: 'desert', t: 'tundra', i: 'ice', l: 'lake', c: 'crater', v: 'volcanic', S: 'store',
} as const;

export interface Player {
  id: string;
  name: string;
  slot: Slot;
  species: Species;
  ai: boolean;
}

export const PLAYERS: Player[] = [
  { id: 'lena', name: 'Lena', slot: 0, species: 'zipwing', ai: false },
  { id: 'ossa', name: 'Ossa', slot: 1, species: 'bramblet', ai: true },
  { id: 'brix', name: 'Brix', slot: 2, species: 'gearling', ai: false },
  { id: 'kai', name: 'Kai', slot: 3, species: 'mollox', ai: true },
];
export const ME = 'lena';
export const byId = (id: string) => PLAYERS.find((p) => p.id === id)!;

/** Why a plot's output moved after its base: the engine's reasons, as ProductionLineView's parts name them. */
export type Why = 'cluster' | 'species' | 'trait' | 'pollution' | 'noWater' | 'noEnergy';

export interface Mod {
  why: Why;
  delta: number;
}

export interface Plot {
  x: number;
  y: number;
  owner: string;
  good: Good;
  /** What the ground makes, before any bonus or loss. */
  base: number;
  mods: Mod[];
}

const P = (x: number, y: number, owner: string, good: Good, base: number, ...mods: Mod[]): Plot => ({ x, y, owner, good, base, mods });
const cluster: Mod = { why: 'cluster', delta: 1 };

/** Every working plot this month, in reading order. */
export const PLOTS: Plot[] = [
  P(6, 2, 'lena', 'food', 3, cluster),
  P(7, 2, 'lena', 'food', 3, cluster),
  P(3, 2, 'brix', 'food', 2, { why: 'noWater', delta: -1 }),
  P(9, 2, 'brix', 'smithore', 3),
  P(10, 2, 'ossa', 'crystite', 2),
  P(4, 3, 'lena', 'water', 3),
  P(7, 3, 'lena', 'food', 3, cluster),
  P(10, 3, 'brix', 'smithore', 3),
  P(11, 3, 'brix', 'alloy', 2, { why: 'pollution', delta: -1 }),
  P(1, 4, 'ossa', 'energy', 3),
  P(12, 4, 'ossa', 'smithore', 3, cluster),
  P(13, 4, 'ossa', 'smithore', 3, cluster),
  P(3, 5, 'brix', 'energy', 3, cluster),
  P(4, 5, 'brix', 'energy', 3, cluster),
  P(5, 5, 'lena', 'energy', 3, cluster),
  P(6, 5, 'lena', 'energy', 3, cluster),
  P(12, 5, 'ossa', 'smithore', 3, cluster),
  P(2, 6, 'ossa', 'food', 2, { why: 'species', delta: 1 }),
  P(3, 6, 'kai', 'energy', 3),
  P(8, 6, 'brix', 'water', 1),
  P(6, 7, 'kai', 'food', 4, { why: 'noEnergy', delta: -2 }),
  P(9, 7, 'kai', 'water', 3, cluster),
  P(10, 7, 'kai', 'water', 3, cluster),
];

const OWNED = new Map(PLOTS.map((p) => [`${p.x},${p.y}`, p]));
/** Claimed plots with no MULE yet: they make nothing and the show passes them by. */
const EMPTY: [number, number, string][] = [[5, 6, 'lena'], [11, 1, 'ossa'], [13, 1, 'kai']];

export const TILES: MapTile[] = ROWS.flatMap((row, y) =>
  [...row].map((c, x): MapTile => {
    const terrain = TERRAIN[c as keyof typeof TERRAIN];
    const plot = OWNED.get(`${x},${y}`);
    const empty = EMPTY.find(([ex, ey]) => ex === x && ey === y);
    const owner = plot ? byId(plot.owner).slot : empty ? byId(empty[2]).slot : null;
    return { x, y, terrain, owner, ...(plot ? { good: plot.good } : {}), ...(terrain === 'mountains' ? { peaks: 1 + ((x + y) % 3) } : {}), ...(x === 11 && y === 3 ? { pollution: 1 } : {}) };
  }),
);

/** The plot's own neighbours that make the same good: the plots its cluster bonus comes from. */
export function clusterMates(plot: Plot): Plot[] {
  return PLOTS.filter((o) => o !== plot && o.owner === plot.owner && o.good === plot.good && Math.abs(o.x - plot.x) + Math.abs(o.y - plot.y) === 1);
}

export const finalUnits = (p: Plot) => Math.max(0, p.base + p.mods.reduce((n, m) => n + m.delta, 0));

// --- The timeline, in show seconds at full pace ----------------------------------

/** A: the harvest scans the map in reading order. B: it goes player by player, each one's silo lit while theirs make. */
export type Order = 'scan' | 'player';

/**
 * Every length in one place, as named config would hold them (DEV: engine config.ts once approved). The steps start
 * slow and speed up, so the first plots read one by one and a big colony still finishes on time.
 */
export const PACE = {
  intro: 1.0,
  /** The harvest's length for any number of plots, and the most one plot may take. */
  harvest: 6.5,
  harvestStepMax: 0.45,
  /** One unit's bar rising, so a 4-unit plot counts up as you watch. */
  unitStep: 0.07,
  /** How sharply the steps shorten: 1 is even, lower starts slower. */
  ease: 0.7,
  /** In the player-by-player order, the beat between one player and the next. */
  playerBeat: 0.35,
  gap: 0.5,
  bonus: 4.0,
  bonusStepMax: 0.5,
  /** Where the month's events play (WS8's show, unchanged): their own length; this stands in for one. */
  eventSlot: 3.2,
  flights: 2.4,
  flight: 0.75,
  hold: 2.0,
  /** Everyone at the table asked to speed up: the rest of the show plays this many times faster. */
  fast: 3,
} as const;

export interface Beat {
  plot: Plot;
  /** When the plot starts making its base output. */
  harvestAt: number;
  /** When each of its bonuses and losses lands, in its mods' order. */
  modAt: number[];
  /** When its goods take off for the silo. */
  flyAt: number;
}

export interface Timeline {
  order: Order;
  beats: Beat[];
  /** The bonus pass's items in the order they land: bonuses first, then losses, each in reading order. */
  mods: { plot: Plot; mod: Mod; at: number }[];
  /** In the player-by-player order, when each player's turn starts. */
  turns: { owner: string; at: number }[];
  acts: { harvest: number; bonus: number; events: number | null; flight: number; hold: number; end: number };
}

/** n items over `length` seconds, the first gaps longest; never more than `stepMax` apart. */
function spread(n: number, length: number, stepMax: number): number[] {
  if (n <= 1) return [0];
  const total = Math.min(length, stepMax * (n - 1) * 1.6);
  return Array.from({ length: n }, (_, i) => total * Math.pow(i / (n - 1), PACE.ease));
}

export function timeline(order: Order, withEvent: boolean): Timeline {
  const ordered = order === 'scan' ? PLOTS : PLAYERS.flatMap((p) => PLOTS.filter((l) => l.owner === p.id));
  const harvest = PACE.intro;
  const at = spread(ordered.length, PACE.harvest, PACE.harvestStepMax);
  // Player by player: a beat before each new player's first plot.
  let beats = 0;
  const harvestAt = ordered.map((p, i) => {
    if (order === 'player' && i > 0 && ordered[i - 1]!.owner !== p.owner) beats += PACE.playerBeat;
    return harvest + at[i]! + beats;
  });
  const lastHarvest = Math.max(...ordered.map((p, i) => harvestAt[i]! + p.base * PACE.unitStep));
  const turns = order === 'player' ? PLAYERS.map((pl) => ({ owner: pl.id, at: harvestAt[ordered.findIndex((p) => p.owner === pl.id)]! - 0.2 })) : [];

  const bonus = lastHarvest + PACE.gap + 0.3;
  const items = [...PLOTS.flatMap((plot) => plot.mods.filter((m) => m.delta > 0).map((mod) => ({ plot, mod }))), ...PLOTS.flatMap((plot) => plot.mods.filter((m) => m.delta < 0).map((mod) => ({ plot, mod })))];
  const modSpread = spread(items.length, PACE.bonus, PACE.bonusStepMax);
  const mods = items.map((it, j) => ({ ...it, at: bonus + modSpread[j]! }));
  const bonusEnd = (mods.at(-1)?.at ?? bonus) + 0.6;

  const events = withEvent ? bonusEnd + PACE.gap : null;
  const flight = (events !== null ? events + PACE.eventSlot : bonusEnd) + PACE.gap;
  const flySpread = spread(ordered.length, PACE.flights, 0.3);
  const flyAt = new Map(ordered.map((p, i) => [p, flight + flySpread[i]!]));
  const hold = flight + PACE.flights + PACE.flight;
  const end = hold + PACE.hold;

  return {
    order,
    beats: ordered.map((plot, i) => ({ plot, harvestAt: harvestAt[i]!, modAt: plot.mods.map((m) => mods.find((x) => x.plot === plot && x.mod === m)!.at), flyAt: flyAt.get(plot)! })),
    mods,
    turns,
    acts: { harvest, bonus, events, flight, hold, end },
  };
}

/** The act the show is in at t. */
export type Act = 'intro' | 'harvest' | 'bonus' | 'events' | 'flight' | 'hold';
export function actAt(tl: Timeline, t: number): Act {
  const a = tl.acts;
  if (t >= a.hold) return 'hold';
  if (t >= a.flight - 0.2) return 'flight';
  if (a.events !== null && t >= a.events) return 'events';
  if (t >= a.bonus - 0.3) return 'bonus';
  if (t >= a.harvest) return 'harvest';
  return 'intro';
}

/** Units standing on the plot at t: its base counting up, then each bonus and loss as it lands. */
export function unitsAt(beat: Beat, t: number): number {
  if (t < beat.harvestAt) return 0;
  const counted = Math.min(beat.plot.base, Math.floor((t - beat.harvestAt) / PACE.unitStep) + 1);
  return Math.max(0, counted + beat.plot.mods.reduce((n, m, i) => n + (t >= beat.modAt[i]! ? m.delta : 0), 0));
}

/** What has landed in a player's silo by t, good by good. */
export function inSilo(tl: Timeline, owner: string, t: number): Partial<Record<Good, number>> {
  const out: Partial<Record<Good, number>> = {};
  for (const b of tl.beats) if (b.plot.owner === owner && t >= b.flyAt + PACE.flight) out[b.plot.good] = (out[b.plot.good] ?? 0) + finalUnits(b.plot);
  return out;
}

/** A player's whole harvest this month. */
export function harvestOf(owner: string): Partial<Record<Good, number>> {
  const out: Partial<Record<Good, number>> = {};
  for (const p of PLOTS) if (p.owner === owner) out[p.good] = (out[p.good] ?? 0) + finalUnits(p);
  return out;
}

export const sum = (r: Partial<Record<Good, number>>) => Object.values(r).reduce((n, v) => n + (v ?? 0), 0);
