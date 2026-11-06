import type { GameState, Playbook, PlayerId } from '@mule/engine';
import type { PlanEdit } from '../playbook/index.js';

/**
 * B fix 4 (a), WS9-reviewed: a route step's plot may be "granted", the plot the seat gains this month. The land write
 * that carries the development's edits is asked at upkeep, before the land grant, so it cannot name that plot by its
 * index; it is resolved here, at development's start, before the rules check the route.
 */
export const GRANTED = 'granted';

const ROUTE_PATH = '/development/route';

type Dropped = NonNullable<Playbook['rejected']>[number];

/**
 * The seat's plots (tile indices, as route steps and rankings name them) that it owns in `state` and did not own in
 * `ownedBefore`: those in the month's land ranking first, in its order (the grant hands out free plots, which is all a
 * ranking holds), then the others (a land-auction win) by index.
 */
export function newPlots(state: GameState, seat: PlayerId, ownedBefore: ReadonlySet<number>, ranking: readonly { plot: number }[]): number[] {
  const gained = state.tiles.flatMap((t, i) => (t.owner === seat && t.terrain !== 'store' && !ownedBefore.has(i) ? [i] : []));
  const ranked = ranking.map((r) => r.plot).filter((p, i, all) => gained.includes(p) && all.indexOf(p) === i);
  return [...ranked, ...gained.filter((p) => !ranked.includes(p))];
}

/** The seat's plots in `state`, as tile indices: what newPlots compares against. */
export function ownedPlots(state: GameState, seat: PlayerId): Set<number> {
  return new Set(state.tiles.flatMap((t, i) => (t.owner === seat && t.terrain !== 'store' ? [i] : [])));
}

/** A MULE's group: its buyMule, outfit and install. */
const MULE_GROUP = 3; // literal-ok: the three steps of a MULE's group, as the rules' route grammar reads them

const isStep = (s: unknown): s is Record<string, unknown> => typeof s === 'object' && s !== null && !Array.isArray(s);
const isGranted = (s: unknown) => isStep(s) && s.plot === GRANTED;

/** Where each step's group starts, as the rules read a route: a buyMule, its outfit and its install stand or fall together; any other step alone. */
function groupStarts(route: readonly unknown[]): number[] {
  const start: number[] = [];
  for (let i = 0; i < route.length; i++) {
    const s = route[i];
    if (isStep(s) && s.act === 'buyMule') {
      const end = Math.min(route.length, i + MULE_GROUP);
      for (let k = i; k < end; k++) start[k] = i;
      i = end - 1;
    } else start[i] = i;
  }
  return start;
}

/**
 * The edits with every route step on "granted" given `plots[0]`, the first plot the seat gained this month. With none,
 * the route is cut at the start of the group holding its first "granted" step, and why is returned in `dropped`; a
 * route with nothing left is removed. Edits on other paths, and a route with no "granted" step, pass through unchanged.
 */
export function resolveGranted(edits: readonly PlanEdit[], plots: readonly number[]): { edits: PlanEdit[]; dropped: Dropped[] } {
  const out: PlanEdit[] = [];
  const dropped: Dropped[] = [];
  for (const e of edits) {
    const route = e.to;
    if (e.path !== ROUTE_PATH || !Array.isArray(route) || !route.some(isGranted)) {
      out.push(e);
      continue;
    }
    const plot = plots[0];
    if (plot !== undefined) {
      out.push({ ...e, to: route.map((s) => (isGranted(s) ? { ...(s as object), plot } : s)) });
      continue;
    }
    const cut = groupStarts(route)[route.findIndex(isGranted)]!;
    dropped.push({ path: e.path, to: e.to, why: `no plot was granted this month, so steps ${cut} on are dropped` });
    if (cut > 0) out.push({ ...e, to: route.slice(0, cut) });
  }
  return { edits: out, dropped };
}
