import type { Good } from '@mule/engine';
import { H, PLAYERS, TILES, W } from './fixture';

/**
 * The production show's data and timeline. Fixture data shaped as the
 * proposed contract WS1 is building (per-plot lines with their parts, events
 * with a kind, an origin and an order): see docs/research/2026-10-21-ws6-original-vs-ours.md §3.
 */

export type Why = 'ground' | 'cluster' | 'species' | 'pollution' | 'noEnergy' | 'noWater' | 'event';

export interface PlotLine {
  x: number;
  y: number;
  owner: string;
  good: Good;
  /** Units the plot makes before any event. */
  made: number;
  /** What changed the plot's output from its ground, shown as badges. 'half' parts halve rather than add. */
  parts: { why: Exclude<Why, 'ground' | 'event'>; delta: number | 'half' }[];
}

/** WS1's approved event kinds (21 Oct): one animation each. 'quake' also plays volcanic ash. */
export type EventKind = 'storm' | 'drought' | 'flare' | 'comet' | 'flood' | 'quake' | 'blight' | 'fire' | 'bounty';

export interface ShowEvent {
  kind: EventKind;
  title: string;
  /** One plain sentence: what it does. */
  line: string;
  sign: 'good' | 'bad' | 'mixed';
  /** Where it starts: a storm's edge, a quake's centre, the first blighted plot. */
  origin: { x: number; y: number };
  from?: 'w' | 'e' | 'n' | 's';
  /** Plots it hits, in the order it reaches them, with what it does to each. */
  hits: { x: number; y: number; order: number; delta: number | 'half'; muleLost?: boolean }[];
}

const P = (x: number, y: number, made: number, parts: PlotLine['parts'] = []): PlotLine => {
  const t = TILES.find((t) => t.x === x && t.y === y)!;
  return { x, y, owner: t.owner!, good: t.outfit as Good, made, parts };
};

/** Every working plot this month, in reading order (the order the show fills them). */
export const LINES: PlotLine[] = [
  P(10, 2, 2),
  P(3, 2, 1, [{ why: 'noWater', delta: 'half' }]),
  P(6, 2, 4, [{ why: 'cluster', delta: 1 }]),
  P(7, 2, 4, [{ why: 'cluster', delta: 1 }]),
  P(9, 2, 3),
  P(4, 3, 3),
  P(7, 3, 4, [{ why: 'cluster', delta: 1 }]),
  P(10, 3, 3),
  P(11, 3, 1, [{ why: 'pollution', delta: -1 }]),
  P(1, 4, 3),
  P(12, 4, 4, [{ why: 'cluster', delta: 1 }]),
  P(13, 4, 4, [{ why: 'cluster', delta: 1 }]),
  P(3, 5, 4, [{ why: 'cluster', delta: 1 }]),
  P(4, 5, 4, [{ why: 'cluster', delta: 1 }]),
  P(5, 5, 4, [{ why: 'cluster', delta: 1 }]),
  P(6, 5, 4, [{ why: 'cluster', delta: 1 }]),
  P(12, 5, 4, [{ why: 'cluster', delta: 1 }]),
  P(2, 6, 3, [{ why: 'species', delta: 1 }]),
  P(3, 6, 3),
  P(8, 6, 1),
  P(6, 7, 2, [{ why: 'noEnergy', delta: 'half' }]),
  P(9, 7, 4, [{ why: 'cluster', delta: 1 }]),
  P(10, 7, 4, [{ why: 'cluster', delta: 1 }]),
];

export const EVENTS = {
  storm: {
    kind: 'storm', title: 'Dust storm', line: 'Energy plants in its path make half this month.', sign: 'bad', origin: { x: 0, y: 5 }, from: 'w',
    hits: [
      { x: 1, y: 4, order: 0, delta: 'half' }, { x: 3, y: 5, order: 1, delta: 'half' }, { x: 3, y: 6, order: 1, delta: 'half' },
      { x: 4, y: 5, order: 2, delta: 'half' }, { x: 5, y: 5, order: 3, delta: 'half' }, { x: 6, y: 5, order: 4, delta: 'half' },
    ],
  },
  quake: {
    kind: 'quake', title: 'Planetquake', line: 'A MULE on a mountain plot is destroyed. The ground shakes around it.', sign: 'bad', origin: { x: 13, y: 4 },
    hits: [{ x: 13, y: 4, order: 0, delta: -4, muleLost: true }],
  },
  blight: {
    kind: 'blight', title: 'Pest swarm', line: "Pests eat half of Lena's Food plots, spreading from farm to farm.", sign: 'bad', origin: { x: 6, y: 2 },
    hits: [
      { x: 6, y: 2, order: 0, delta: 'half' }, { x: 7, y: 2, order: 1, delta: 'half' }, { x: 7, y: 3, order: 2, delta: 'half' },
    ],
  },
} as Record<EventKind, ShowEvent>;


const each = (cells: [number, number][], delta: number | 'half') => cells.map(([x, y], order) => ({ x, y, order, delta }));
const FOOD_WATER: [number, number][] = [[3, 2], [6, 2], [7, 2], [4, 3], [7, 3], [2, 6], [8, 6], [6, 7], [9, 7], [10, 7]];
const ENERGY: [number, number][] = [[1, 4], [3, 5], [4, 5], [5, 5], [6, 5], [3, 6]];
const WATER: [number, number][] = [[4, 3], [8, 6], [9, 7], [10, 7]];

Object.assign(EVENTS, {
  drought: { kind: 'drought', title: 'Drought', line: 'Every Food and Water plot makes 1 less.', sign: 'bad', origin: { x: 7, y: 4 }, hits: each(FOOD_WATER, -1) },
  flare: { kind: 'flare', title: 'Solar flare', line: 'Energy plants make 3 more this month.', sign: 'good', origin: { x: 7, y: 0 }, hits: each(ENERGY, 3) },
  comet: { kind: 'comet', title: 'Comet pass', line: 'Ice from its tail: Water plots make 2 more.', sign: 'good', origin: { x: 0, y: 0 }, from: 'w', hits: each(WATER, 2) },
  flood: {
    kind: 'flood', title: 'Flood season', line: 'River farms make no Food this month.', sign: 'bad', origin: { x: 7, y: 0 }, from: 'n',
    hits: [{ x: 6, y: 2, order: 0, delta: -4 }, { x: 7, y: 2, order: 0, delta: -4 }, { x: 7, y: 3, order: 1, delta: -4 }, { x: 6, y: 7, order: 4, delta: -2 }],
  },
  fire: {
    kind: 'fire', title: 'Wildfire', line: 'Fire burns a farm and spreads along the cluster.', sign: 'bad', origin: { x: 7, y: 3 },
    hits: [{ x: 7, y: 3, order: 0, delta: -4 }, { x: 7, y: 2, order: 1, delta: -4 }, { x: 6, y: 2, order: 2, delta: -4 }],
  },
  bounty: { kind: 'bounty', title: 'Rich vein', line: "Ossa's Smithore mines strike a rich vein: 2 more each.", sign: 'good', origin: { x: 12, y: 4 }, hits: each([[12, 4], [13, 4], [12, 5]], 2) },
} satisfies Partial<Record<EventKind, ShowEvent>>);

export const KIND_NAME: Record<EventKind, string> = {
  storm: 'Dust storm', drought: 'Drought', flare: 'Solar flare', comet: 'Comet', flood: 'Flood', quake: 'Quake / ash', blight: 'Pest swarm', fire: 'Wildfire', bounty: 'Rich vein',
};

// --- The timeline, in seconds -------------------------------------------------

export const SHOW = {
  /** Plots fill one after another in reading order. */
  fillStart: 0.6,
  fillStep: 0.12,
  /** The event card comes in, then the event plays over the map. */
  cardAt: 4.0,
  eventAt: 4.8,
  /** The goods fly home, plot by plot, each flight this long. */
  flyStart: 9.6,
  flyStep: 0.09,
  flight: 0.9,
  end: 15,
} as const;

export const fillAt = (i: number) => SHOW.fillStart + i * SHOW.fillStep;
export const flyAt = (i: number) => SHOW.flyStart + i * SHOW.flyStep;

/** When the event reaches a plot: a storm by how far it has blown, a quake by distance from its centre, blight by its spreading order. */
export function hitAt(ev: ShowEvent, hit: ShowEvent['hits'][number]): number {
  if (ev.kind === 'storm') return SHOW.eventAt + 0.3 + (hit.x / W) * 3.2;
  if (ev.kind === 'quake') return SHOW.eventAt + 0.9;
  if (ev.kind === 'flare') return SHOW.eventAt + 0.5 + hit.order * 0.15;
  if (ev.kind === 'comet') return SHOW.eventAt + 1.8 + hit.order * 0.25;
  if (ev.kind === 'drought') return SHOW.eventAt + 0.5 + Math.hypot(hit.x - ev.origin.x, hit.y - ev.origin.y) * 0.3;
  if (ev.kind === 'flood') return SHOW.eventAt + 0.6 + hit.order * 0.6;
  if (ev.kind === 'bounty') return SHOW.eventAt + 0.6 + hit.order * 0.4;
  return SHOW.eventAt + 0.4 + hit.order * 1.1;
}

export const half = (n: number) => Math.floor(n / 2);

/** What the plot makes after the event, if it hit. */
export function finalUnits(line: PlotLine, ev: ShowEvent | null): number {
  const hit = ev?.hits.find((h) => h.x === line.x && h.y === line.y);
  if (!hit) return line.made;
  return hit.delta === 'half' ? half(line.made) : Math.max(0, line.made + hit.delta);
}

/** Each player's goods from the show, after the event. */
export function totals(ev: ShowEvent | null): Record<string, Partial<Record<Good, number>>> {
  const out: Record<string, Partial<Record<Good, number>>> = Object.fromEntries(PLAYERS.map((p) => [p.id, {}]));
  for (const l of LINES) {
    const n = finalUnits(l, ev);
    if (n > 0) out[l.owner]![l.good] = (out[l.owner]![l.good] ?? 0) + n;
  }
  return out;
}

export { H, W };
