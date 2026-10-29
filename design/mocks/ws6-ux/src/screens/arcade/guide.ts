import { bestFreePlot } from '../audit/dev/fixture';
import { ARCADE_VIEW } from './fixture';
import { ARCADE_OUTFITS, looseOf, mulePrice, pubPayout, refundOf, tileOpen, type ArcadeOutfit, type Colonist, type HallRoom, type P, type Tunables, type World } from './sim';

/**
 * Where you go next, for the phone's ring on the map or in the hall (RULE-9, first match wins):
 *   1 no MULE, MULEs left, money for a MULE and an outfit → the store, then the corral
 *   V-7 no MULE and not the money (or the corral empty) → what you can do instead: analyse a plot, or the pub, in words
 *   2 an unfitted MULE → the outfitters you can pay
 *   3 a MULE taken off a plot (AM-2) → the outfitters you can pay, its own good dimmed
 *   3a a fitted MULE → the door on your plot's side, then the BEST of your free plots for its good (V-2: by its
 *      analysis, else its land's odds; the nearer only on a tie), not merely the nearest
 *   4 otherwise → the store, then the pub
 * Pure: the phone and the TV read the same world.
 */
export interface Spot {
  what: 'store' | 'plot' | 'mule' | 'analyse';
  at: P;
  label: string;
}
export type Guide =
  | { space: 'map'; spots: Spot[]; note?: string }
  | { space: 'hall'; rooms: HallRoom[]; labels: Partial<Record<HallRoom, string>>; dim: HallRoom[]; note?: string }
  | null;

/** The works' bays and the Green belt are narrow: their ring says FIT. */
const NARROW: readonly string[] = ['alloy', 'electronics', 'medicine', 'greenBelt'];
const fitLabel = (g: string, word: string) => (NARROW.includes(g) ? (word === 'RE-OUTFIT' ? 'RE-FIT' : 'FIT') : word);

/** The plot as the game names it: 4·1 is x 3, y 0. */
export const plotName = (p: P) => `${p.x + 1}·${p.y + 1}`;

const sideOf = (w: World, x: number): 'doorL' | 'doorR' => (x < w.store.x + 0.5 ? 'doorL' : 'doorR');

/** Your own plots that nobody has analysed, nothing stands on and you can stand on (not a lake in shore mode), nearest first (V-7). */
export function unanalysed(w: World, c: Colonist, tun: Tunables): P[] {
  const from = c.space === 'map' ? c : { x: w.store.x + 0.5, y: w.store.y + 0.5 };
  return w.tiles
    .filter((t) => t.owner === c.id && !t.outfit && !t.ground && tileOpen(tun, t, c.id))
    .sort((a, b) => Math.hypot(a.x + 0.5 - from.x, a.y + 0.5 - from.y) - Math.hypot(b.x + 0.5 - from.x, b.y + 0.5 - from.y))
    .map((t) => ({ x: t.x, y: t.y }));
}

/** V-2: the best of your free plots for a good, from where you are (the store, inside). */
export function bestPlot(w: World, c: Colonist, good: ArcadeOutfit): P | null {
  const from = c.space === 'map' ? { x: c.x - 0.5, y: c.y - 0.5 } : w.store;
  // A Green belt suits every plot alike, as a factory does: ranked as one (the nearer wins).
  const best = bestFreePlot({ ...ARCADE_VIEW, tiles: w.tiles }, good === 'greenBelt' ? 'alloy' : good, from);
  return best ? { x: best.plot.x, y: best.plot.y } : null;
}

export function guideOf(w: World, c: Colonist, tun: Tunables): Guide {
  if (w.over || c.done || c.encounter) return null;
  const hall = c.space === 'hall';
  const store = (why: string): Spot => ({ what: 'store', at: { x: w.store.x, y: w.store.y }, label: `STORE · ${why}` });
  const pay = pubPayout(w, tun) + refundOf(c, tun);
  const pub: Guide = hall ? { space: 'hall', rooms: ['pub'], labels: { pub: 'PUB' }, dim: [] } : { space: 'map', spots: [store('PUB')] };
  if (c.analysing) return hall ? null : { space: 'map', spots: [{ what: 'analyse', at: { x: c.analysing.x, y: c.analysing.y }, label: 'ANALYSING' }] };
  const loose = looseOf(w, c.id);
  if (loose && !c.mule) return hall ? { space: 'hall', rooms: [sideOf(w, loose.x)], labels: { [sideOf(w, loose.x)]: 'OUT' }, dim: [] } : { space: 'map', spots: [{ what: 'mule', at: { x: loose.x, y: loose.y }, label: 'YOUR MULE' }] };
  const m = c.mule;
  const affordable = ARCADE_OUTFITS.filter((g) => tun.outfit[g] <= c.money);
  if (!m) {
    if (c.installs > 0) return pub;
    const price = mulePrice(tun);
    const least = price + Math.min(...ARCADE_OUTFITS.map((g) => tun.outfit[g]));
    if (w.storeMules > 0 && c.money >= least) return hall ? { space: 'hall', rooms: ['corral'], labels: { corral: 'CORRAL' }, dim: [] } : { space: 'map', spots: [store('CORRAL')] };
    // V-7: never the corral you cannot pay for; what you can do instead, and why, in words.
    const why = w.storeMules <= 0 ? 'The corral is empty.' : c.money < price ? `A MULE costs ${price} cr; you have ${c.money}.` : `A MULE and its outfit cost at least ${least} cr; you have ${c.money}.`;
    const plots = unanalysed(w, c, tun);
    const note = `${why} ${plots.length ? `Analyse a plot, or end at the pub for ≈${pay} cr.` : `End at the pub for ≈${pay} cr.`}`;
    if (hall) {
      const doors: HallRoom[] = plots.length ? [sideOf(w, plots[0]!.x)] : [];
      return { space: 'hall', rooms: ['pub', ...doors], labels: { pub: `PUB ≈ +${pay} cr`, doorL: 'OUT: ANALYSE', doorR: 'OUT: ANALYSE' }, dim: [], note };
    }
    const first = plots[0];
    return { space: 'map', spots: [...(first ? [{ what: 'analyse' as const, at: first, label: `ANALYSE · ${plotName(first)}` }] : []), store('PUB')], note };
  }
  if (!m.good) return hall ? { space: 'hall', rooms: affordable.length ? [...affordable] : ['pub'], labels: Object.fromEntries(affordable.map((g) => [g, fitLabel(g, 'OUTFITTER')])), dim: [] } : { space: 'map', spots: [store('OUTFITTER')] };
  if (m.taken) {
    // AM-2: the other outfitters re-outfit it; its own good's is dimmed, it makes that already.
    const others = affordable.filter((g) => g !== m.good);
    return hall ? { space: 'hall', rooms: others.length ? [...others] : ['pub'], labels: Object.fromEntries(others.map((g) => [g, fitLabel(g, 'RE-OUTFIT')])), dim: [m.good] } : { space: 'map', spots: [store('RE-OUTFIT')] };
  }
  const plot = bestPlot(w, c, m.good);
  if (!plot) return pub;
  if (hall) return { space: 'hall', rooms: [sideOf(w, plot.x)], labels: { [sideOf(w, plot.x)]: 'DOOR' }, dim: [] };
  return { space: 'map', spots: [{ what: 'plot', at: plot, label: `YOUR PLOT ${plotName(plot)}` }] };
}

