import { fitsDetour } from './spare';
import { beat, draw, say, terrainMult, tileOpen, type Colonist, type P, type Reach, type Tunables, type World, type WorldEvent } from './sim';

/**
 * Slice 3: the glint race (Heiko's G-3). Pure, like the rest of the sim. Now and then (a seeded roll each step, queued
 * as a `glint` event on the world, the wolves' path) a Crystite sparkle lights one tile for about 8 s, on every screen
 * at once. The first colonist to set foot on it wins a small prize; the button reads GRAB THE GLINT one step away and
 * grabs it from there. Bots join by a share, if it is near enough to care, and drop their errand while they race.
 * Nobody there in time: it fades. Wolves and the glint never wait for each other; whoever stands on the tile wins.
 */

export interface Glint {
  x: number;
  y: number;
  since: number;
  until: number;
  /** The bots racing for it, picked when it lit. */
  racers: string[];
}

/** After a glint is won or fades, none rolls for this long. */
const BREATHER_MS = 5000;

/** One step from the tile's centre: close enough for the button to grab it. */
export const GRAB_REACH = 1.2;

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
export const glintCentre = (g: Pick<Glint, 'x' | 'y'>): P => ({ x: g.x + 0.5, y: g.y + 0.5 });
export const plotLabel = (g: Pick<Glint, 'x' | 'y'>) => `${g.x + 1}·${g.y + 1}`;
const replace = (w: World, c: Colonist): World => ({ ...w, colonists: w.colonists.map((x) => (x.id === c.id ? c : x)) });

/** Where a colonist is for the race: on the map, or at the store's door when inside. */
const raceFrom = (w: World, c: Colonist): P => (c.space === 'map' ? c : { x: w.store.x + 0.5, y: w.store.y + 0.5 });

/** Tiles a glint may light: land a body can stand on, never a lake or the store, owned plots only if the flag allows. */
export function glintTiles(w: World, tun: Tunables): { x: number; y: number }[] {
  return w.tiles.filter((t) => {
    if (t.terrain === 'store' || t.terrain === 'lake') return false;
    if (terrainMult(tun, t.terrain) <= 0) return false;
    if (t.owner && (!tun.glint.onOwnedPlots || !tileOpen(tun, t, null))) return false;
    // Not under anyone's feet: that would be no race.
    return !w.colonists.some((c) => c.space === 'map' && Math.floor(c.x) === t.x && Math.floor(c.y) === t.y);
  });
}

/** Each step with no glint lit or queued, the seed may light one: its mean gap in seconds sets the chance. */
export function rollGlint(w: World, dtMs: number, tun: Tunables): World {
  if (!tun.glint.on || w.glint || w.t < w.glintAfter || w.queue.some((e) => e.kind === 'glint')) return w;
  const [u, w2] = draw(w);
  if (u >= dtMs / (Math.max(1, tun.glint.meanGapSeconds) * 1000)) return w2;
  return { ...w2, queue: [...w2.queue, { atMs: w2.t, kind: 'glint' as const }].sort((a, b) => a.atMs - b.atMs) };
}

/** The `glint` event's handler: the sparkle lights a tile (the event's, or a seeded one), and the bots pick who races. */
export function spawnGlint(w0: World, e: WorldEvent, tun: Tunables): World {
  if (w0.glint) return { ...w0, log: say(w0, { name: 'A glint' }, 'missed: one is lit already') };
  if (!e.forced && !tun.glint.on) return w0;
  let w = w0;
  let at = e.at;
  if (!at) {
    const tiles = glintTiles(w, tun);
    if (tiles.length === 0) return w;
    const [u, w1] = draw(w);
    w = w1;
    at = tiles[Math.floor(u * tiles.length)]!;
  }
  const centre = glintCentre(at);
  let racers = e.racers;
  if (!racers) {
    racers = [];
    for (const c of w.colonists) {
      if (!c.bot || c.done) continue;
      const [u, w1] = draw(w);
      w = w1;
      if (u < tun.glint.botShare && dist(raceFrom(w, c), centre) <= tun.glint.botCare && fitsDetour(w, c, tun, centre)) racers.push(c.id);
    }
  }
  const glint: Glint = { x: at.x, y: at.y, since: w.t, until: w.t + tun.glint.showSeconds * 1000, racers };
  return { ...w, glint, log: say(w, { name: 'A glint' }, `lit at ${plotLabel(at)}`), beats: beat(w, 'glint', `A Crystite glint at ${plotLabel(at)}! First there wins`, 'warn') };
}

const prizeWords = (tun: Tunables) => (tun.glint.prize === 'crystite' ? `+${tun.glint.crystite} Crystite` : `+${tun.glint.credits} cr`);

/** The prize to the winner, and everyone told. */
export function winGlint(w: World, c: Colonist, tun: Tunables): { w: World; c: Colonist } {
  const won = tun.glint.prize === 'crystite' ? { ...c, crystite: c.crystite + tun.glint.crystite } : { ...c, money: c.money + tun.glint.credits };
  const line = `${c.name} got the glint: ${prizeWords(tun)}`;
  return { w: { ...w, glint: null, glintAfter: w.t + BREATHER_MS, log: [...w.log, `${(w.t / 1000).toFixed(1)}s ${line}`].slice(-60), beats: beat(w, c.id, line, 'ok') }, c: won };
}

/**
 * After everyone has moved: the first colonist (in seat order) standing on the tile wins; past its time it fades; with
 * none lit, the roll for the next.
 */
export function stepGlint(w0: World, dtMs: number, tun: Tunables): World {
  let w = w0;
  const g = w.glint;
  if (g) {
    const winner = w.colonists.find((c) => c.space === 'map' && !c.done && Math.floor(c.x) === g.x && Math.floor(c.y) === g.y);
    if (winner) {
      const r = winGlint(w, winner, tun);
      return replace(r.w, r.c);
    }
    if (w.t >= g.until) return { ...w, glint: null, glintAfter: w.t + BREATHER_MS, log: say(w, { name: 'The glint' }, 'faded'), beats: beat(w, 'glint', 'The glint faded', 'warn') };
    return w;
  }
  return rollGlint(w, dtMs, tun);
}

/** One step away: the button grabs it. */
export function glintReach(w: World, c: Colonist): Reach | null {
  const g = w.glint;
  if (!g || c.space !== 'map') return null;
  const d = dist(c, glintCentre(g));
  if (d > GRAB_REACH) return null;
  return { kind: 'grab', verb: 'GRAB THE GLINT', detail: `${Math.ceil((g.until - w.t) / 1000)} s left`, enabled: true, target: { space: 'map', tile: { x: g.x, y: g.y } } };
}

/** Whether this colonist races for the lit glint. */
export const racing = (w: World, c: Colonist) => !!w.glint && w.glint.racers.includes(c.id) && !c.done && !c.encounter;

/** The compass word for a direction on the map, north up: "E", "NE". */
export function compass(dx: number, dy: number): string {
  const a = (Math.atan2(-dy, dx) * 180) / Math.PI;
  const names = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE'];
  return names[(Math.round(a / 45) + 8) % 8]!;
}
