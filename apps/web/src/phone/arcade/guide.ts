import { terrainShare, type FloorConfig, type HallPlace, type Outfit } from '@mule/engine';
import type { MuleView, MyView, PlayerView, TileView } from '@mule/protocol';
import { plotName } from '../../game/derive';
import { bestFreePlot } from './plots';

/**
 * Where you go next, for the phone's ring on the map or in the hall (arcade spec RULE-9, the mock's guide.ts at
 * d30ae057 on the view; first match wins):
 *   1 no MULE, MULEs left, money for a MULE and an outfit → the store, then the corral
 *   V-7 no MULE and not the money (or the corral empty) → what you can do instead: analyse a plot, or the pub, in words
 *   2 an unfitted MULE → the outfitters you can pay
 *   3a a fitted MULE → the door on your plot's side, then the BEST of your free plots for its good (V-2: by its
 *      analysis, else its land's odds; the nearer only on a tie)
 *   4 otherwise → the store, then the pub
 * Row 3 (a MULE taken off a plot, AM-2) is PR-7's and the bolted MULE PR-9's: the view carries neither yet.
 */

export interface P {
  x: number;
  y: number;
}
export interface Spot {
  what: 'store' | 'plot' | 'analyse';
  at: P;
  label: string;
}
export type Guide =
  | { space: 'map'; spots: Spot[]; note?: string }
  | { space: 'hall'; rooms: HallPlace[]; labels: Partial<Record<HallPlace, string>>; note?: string }
  | null;

/** Every outfit, in the order the hall shows them: the shopfronts, the works' bays, the Green belt. */
export const OUTFITS: readonly Outfit[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'alloy', 'electronics', 'medicine', 'greenBelt'];

/** The works' bays and the Green belt are narrow: their ring says FIT. */
const NARROW: readonly Outfit[] = ['alloy', 'electronics', 'medicine', 'greenBelt'];
const fitLabel = (g: Outfit, word: string) => (NARROW.includes(g) ? 'FIT' : word);

export interface GuideInput {
  view: Pick<MuleView, 'tiles' | 'storeMules'>;
  me: Pick<MyView, 'id' | 'carriedMule' | 'installedThisTurn' | 'mulePrice' | 'outfitCosts'>;
  self: Pick<PlayerView, 'money' | 'doneDeveloping'>;
  /** Where you stand, and whether you are assaying a plot. */
  at: P & { space: 'map' | 'hall' };
  analysing: boolean;
  over: boolean;
  /** What the pub pays now. */
  pay: number;
  cfg: FloorConfig;
}

export const storeOf = (tiles: TileView[]): TileView => tiles.find((t) => t.terrain === 'store')!;

const sideOf = (store: P, x: number): 'doorL' | 'doorR' => (x < store.x + 0.5 ? 'doorL' : 'doorR');

/** Your own plots that nobody has analysed, nothing stands on and you can stand on, nearest first (V-7). */
export function unanalysed(tiles: TileView[], id: string, from: P, cfg: FloorConfig): TileView[] {
  return tiles
    .filter((t) => t.owner === id && !t.outfit && !t.ground && terrainShare(t.terrain, cfg) > 0)
    .sort((a, b) => Math.hypot(a.x + 0.5 - from.x, a.y + 0.5 - from.y) - Math.hypot(b.x + 0.5 - from.x, b.y + 0.5 - from.y));
}

export function guideOf({ view, me, self, at, analysing, over, pay, cfg }: GuideInput): Guide {
  if (over || self.doneDeveloping) return null;
  const hall = at.space === 'hall';
  const store = storeOf(view.tiles);
  const toStore = (why: string): Spot => ({ what: 'store', at: { x: store.x, y: store.y }, label: `STORE · ${why}` });
  const pub: Guide = hall ? { space: 'hall', rooms: ['pub'], labels: { pub: 'PUB' } } : { space: 'map', spots: [toStore('PUB')] };
  if (analysing) return hall ? null : { space: 'map', spots: [{ what: 'analyse', at: { x: Math.floor(at.x), y: Math.floor(at.y) }, label: 'ANALYSING' }] };
  const m = me.carriedMule;
  const money = self.money;
  const affordable = OUTFITS.filter((g) => me.outfitCosts[g] <= money);
  if (!m) {
    if (me.installedThisTurn) return pub;
    const price = me.mulePrice;
    const least = price + Math.min(...OUTFITS.map((g) => me.outfitCosts[g]));
    if (view.storeMules > 0 && money >= least) return hall ? { space: 'hall', rooms: ['corral'], labels: { corral: 'CORRAL' } } : { space: 'map', spots: [toStore('CORRAL')] };
    // V-7: never the corral you cannot pay for; what you can do instead, and why, in words.
    const why = view.storeMules <= 0 ? 'The corral is empty.' : money < price ? `A MULE costs ${price} cr; you have ${money}.` : `A MULE and its outfit cost at least ${least} cr; you have ${money}.`;
    const from = hall ? { x: store.x + 0.5, y: store.y + 0.5 } : at;
    const plots = unanalysed(view.tiles, me.id, from, cfg);
    const note = `${why} ${plots.length ? `Analyse a plot, or end at the pub for ≈${pay} cr.` : `End at the pub for ≈${pay} cr.`}`;
    if (hall) {
      const doors: HallPlace[] = plots.length ? [sideOf(store, plots[0]!.x)] : [];
      return { space: 'hall', rooms: ['pub', ...doors], labels: { pub: `PUB ≈ +${pay} cr`, doorL: 'OUT: ANALYSE', doorR: 'OUT: ANALYSE' }, note };
    }
    const first = plots[0];
    return { space: 'map', spots: [...(first ? [{ what: 'analyse' as const, at: { x: first.x, y: first.y }, label: `ANALYSE · ${plotName(first.x, first.y)}` }] : []), toStore('PUB')], note };
  }
  if (m === 'empty') {
    return hall
      ? { space: 'hall', rooms: affordable.length ? [...affordable] : ['pub'], labels: Object.fromEntries(affordable.map((g) => [g, fitLabel(g, 'OUTFITTER')])) }
      : { space: 'map', spots: [toStore('OUTFITTER')] };
  }
  const plot = bestFreePlot(view.tiles, me.id, m, hall ? store : { x: at.x - 0.5, y: at.y - 0.5 });
  if (!plot) return pub;
  if (hall) return { space: 'hall', rooms: [sideOf(store, plot.x)], labels: { [sideOf(store, plot.x)]: 'DOOR' } };
  return { space: 'map', spots: [{ what: 'plot', at: { x: plot.x, y: plot.y }, label: `YOUR PLOT ${plotName(plot.x, plot.y)}` }] };
}
