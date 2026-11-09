import { HALL_CROSS_SECONDS, freePlotsOf, paceOf, terrainMult, tileAt, type Colonist, type P, type Tunables, type World } from './sim';

/**
 * "Bots race only with time to spare": a rough reckoning of a bot's errand left (to the store, the counters, its plot,
 * back to the pub), so a glint or the scramble lures it only if the errand still fits in the turn after the detour.
 * A reckoning, not a plan: straight lines a third longer, the land under the bot now, a fixed time at each counter.
 */

/** Straight lines are shorter than the paths walked. 1.2 and 1.5 s: Kai 20 of 20 turns finished, 63% of glints raced. */
const PATH_FACTOR = 1.2;
/** Kept in hand at the turn's end. */
const MARGIN_S = 1.5;

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y) * PATH_FACTOR;

function rates(w: World, c: Colonist, tun: Tunables) {
  const k = paceOf(c, tun).total * (c.bot ? tun.questions.botSpeed : 1) * (c.mule ? tun.leadPace : 1);
  const ground = c.space === 'map' ? Math.max(0.3, terrainMult(tun, tileAt(w, c.x, c.y)?.terrain ?? 'plains')) : 1;
  const tilesPerS = Math.max(0.05, tun.mapTilesPerSecond * k * Math.max(ground, 0.7));
  // A store visit: in through a door, across to a counter or two and back out, a pause at each.
  const visitS = (3 * HALL_CROSS_SECONDS(tun)) / Math.max(0.05, k) + 2 * tun.botThinkSeconds;
  return { tilesPerS, visitS };
}

/** Seconds of errand left for this colonist from where it stands. */
export function errandSeconds(w: World, c: Colonist, tun: Tunables, from: P = c): number {
  if (c.done) return 0;
  const { tilesPerS, visitS } = rates(w, c, tun);
  const store = { x: w.store.x + 0.5, y: w.store.y + 0.5 };
  const plot = freePlotsOf(w, c.id)[0];
  const at = plot ? { x: plot.x + 0.5, y: plot.y + 0.5 } : store;
  const here = c.space === 'hall' ? store : from;
  if (c.installs > 0 || !plot) return dist(here, store) / tilesPerS + visitS / 2;
  if (c.mule?.good && c.space === 'map') return (dist(here, at) + dist(at, store)) / tilesPerS + visitS / 2;
  return (dist(here, store) + 2 * dist(store, at)) / tilesPerS + visitS * 1.5;
}

/** Whether a detour to `to` leaves the errand time to finish inside the turn. */
export function fitsDetour(w: World, c: Colonist, tun: Tunables, to: P): boolean {
  if (!tun.botsSpareTime || !c.bot) return true;
  const { tilesPerS } = rates(w, c, tun);
  const here = c.space === 'hall' ? { x: w.store.x + 0.5, y: w.store.y + 0.5 } : c;
  const left = tun.devSeconds - w.t / 1000;
  return dist(here, to) / tilesPerS + errandSeconds(w, c, tun, to) + MARGIN_S <= left;
}
