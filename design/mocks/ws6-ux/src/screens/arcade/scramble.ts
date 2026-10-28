import { fitsDetour } from './spare';
import { beat, draw, freePlotsOf, looseOf, mulePrice, say, type Colonist, type Tunables, type World, type WorldEvent } from './sim';

/**
 * Slice 4: the corral scramble (Heiko's G-3). Pure, like the rest of the sim. When a sale leaves the corral with its
 * last few MULEs (tunable, default 2), a `scramble` event goes on the world's queue, the wolves' and the glint's path.
 * Its handler announces "2 MULEs left! Race to the corral" to every screen and marks who still needs a MULE; bots among
 * them, near enough to care, drop their errand and race. Buying is the corral's normal BUY MULE: first there, first
 * served. Each sale is told ("Kai got one: 1 left"); then "The corral is empty", and who is left without one this
 * turn. Left out costs nothing more than that.
 */

export interface Scramble {
  since: number;
  /** It ends then, if the corral has not emptied first. */
  until: number;
  /** MULEs in the corral when it began. */
  start: number;
  /** Who needed a MULE when it began. */
  needers: string[];
  /** The bots among them that race. */
  racers: string[];
  /** Who got one, in order. */
  got: string[];
  /** How it ended, and when; null while it runs. */
  over: 'empty' | 'time' | 'everyone' | null;
  endedAt: number;
  /** Needers still without a MULE when the corral emptied. */
  leftOut: string[];
}

/** How long the ending stays on every screen. */
export const SCRAMBLE_SHOW_MS = 5000;

/** A colonist still needs a MULE: none on its lead or bolted, a free plot to put one on, and the money for it. */
export function needsMule(w: World, c: Colonist, tun: Tunables): boolean {
  return !c.done && !c.mule && !looseOf(w, c.id) && freePlotsOf(w, c.id).length > 0 && c.money >= mulePrice(tun);
}

export const live = (w: World) => !!w.scramble && !w.scramble.over;

/** Whether this bot races for the corral now. */
export const racingScramble = (w: World, c: Colonist) => live(w) && w.scramble!.racers.includes(c.id) && !c.mule && !c.done && !c.encounter;

const plural = (n: number) => `${n} MULE${n === 1 ? '' : 's'}`;
export const scrambleCall = (n: number) => `${plural(n)} left! Race to the corral`;

/** The `scramble` event's handler: everyone told, the needers marked, the bots that care set racing. */
export function spawnScramble(w0: World, e: WorldEvent, tun: Tunables): World {
  if (w0.scramble && !w0.scramble.over) return w0;
  if ((!e.forced && (!tun.scramble.on || w0.scrambled)) || w0.storeMules <= 0) return w0;
  let w = w0;
  const needers = w.colonists.filter((c) => needsMule(w, c, tun)).map((c) => c.id);
  // Nobody left needing one: no race to call.
  if (needers.length === 0) return w0;
  const racers: string[] = [];
  for (const id of needers) {
    const c = w.colonists.find((x) => x.id === id)!;
    if (!c.bot) continue;
    const [u, w1] = draw(w);
    w = w1;
    const far = c.space === 'hall' ? 0 : Math.hypot(c.x - (w.store.x + 0.5), c.y - (w.store.y + 0.5));
    // With time to spare: the corral, then the rest of the errand, must still fit in the turn.
    if (u < tun.scramble.botShare && far <= tun.scramble.botCare && fitsDetour(w, c, tun, { x: w.store.x + 0.5, y: w.store.y + 0.5 })) racers.push(id);
  }
  const scramble: Scramble = { since: w.t, until: w.t + tun.scramble.maxSeconds * 1000, start: w.storeMules, needers, racers, got: [], over: null, endedAt: 0, leftOut: [] };
  return { ...w, scramble, scrambled: true, log: say(w, { name: 'The corral' }, `scramble: ${plural(w.storeMules)} left`), beats: beat(w, 'scramble', scrambleCall(w.storeMules), 'alert') };
}

function end(w: World, how: NonNullable<Scramble['over']>): World {
  const s = w.scramble!;
  const leftOut = how === 'empty' ? s.needers.filter((id) => !s.got.includes(id) && !w.colonists.find((c) => c.id === id)!.mule) : [];
  const names = leftOut.map((id) => w.colonists.find((c) => c.id === id)!.name);
  let beats = w.beats;
  if (how === 'empty') beats = beat({ ...w, beats }, 'scramble', 'The corral is empty', 'warn');
  if (names.length) beats = beat({ ...w, beats }, 'scramble', `No MULE this turn for ${names.join(', ')}`, 'warn');
  if (how === 'time') beats = beat({ ...w, beats }, 'scramble', `The scramble is over: ${plural(w.storeMules)} left`, 'ok');
  return { ...w, beats, scramble: { ...s, over: how, endedAt: w.t, leftOut }, log: say(w, { name: 'The scramble' }, `ended (${how})${names.length ? `; no MULE for ${names.join(', ')}` : ''}`) };
}

/** After every sale: count it down if one runs; start one if this sale left the corral at its last few. */
export function afterSale(w: World, c: Colonist, tun: Tunables): World {
  if (live(w)) {
    const s = w.scramble!;
    const next = { ...w, scramble: { ...s, got: [...s.got, c.id] }, beats: beat(w, c.id, `${c.name} got one: ${w.storeMules} left`, 'ok') };
    return next.storeMules <= 0 ? end(next, 'empty') : next;
  }
  if (tun.scramble.on && !w.scrambled && w.storeMules > 0 && w.storeMules <= tun.scramble.mulesLeft && !w.queue.some((e) => e.kind === 'scramble'))
    return { ...w, queue: [...w.queue, { atMs: w.t, kind: 'scramble' as const }].sort((a, b) => a.atMs - b.atMs) };
  return w;
}

/** Each step: end it on time or once every needer has a MULE (or is in the pub); clear the ending after a few seconds. */
export function stepScramble(w: World, tun: Tunables): World {
  const s = w.scramble;
  if (!s) return w;
  if (s.over) return w.t - s.endedAt > SCRAMBLE_SHOW_MS ? { ...w, scramble: null } : w;
  if (w.t >= s.until) return end(w, 'time');
  const waiting = s.needers.filter((id) => {
    const c = w.colonists.find((x) => x.id === id)!;
    return !c.mule && !c.done;
  });
  return waiting.length === 0 ? end(w, 'everyone') : w;
}
