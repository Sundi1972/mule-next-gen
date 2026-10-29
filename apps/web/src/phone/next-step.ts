import type { Good, Outfit } from '@mule/engine';
import { FACTORY_GOODS, GOOD_NAME, OUTFIT_GOODS, type OutfitGood, type Shop, type StoreRoom } from '@mule/ui';
import { createElement, Fragment, type ReactNode } from 'react';
import { plotName } from '../game/derive';
import type { Now } from './Shell';

/** What development's next step is decided from (spec RULE-7). */
export interface DevelopState {
  /** The start-of-turn card is showing. */
  filling: boolean;
  carry: Outfit | 'empty' | null;
  place: 'store' | 'map';
  /** The plot selected on the map is one of yours: before R1 a tap on a plot is standing at it. */
  atOwnPlot: boolean;
  /** A MULE was installed this turn. */
  installed: boolean;
  /** Development seconds left. */
  seconds: number;
  /** Your plots with no MULE on them. */
  freePlots: { x: number; y: number }[];
  /** Where "nearest" is measured from: the store's plot, where you walk out. */
  from: { x: number; y: number };
  /**
   * The month's needs (the engine's monthNeeds) and what you hold, for row 3's glow. Undefined when they are
   * unknown: then row 3 glows nothing.
   */
  month?: { needs: Partial<Record<Good, number>>; have: Partial<Record<Good, number>> } | undefined;
  /** For the words: your pace line ("Hungry: 52% pace"), everyone's seconds, the corral, the pub. */
  pace: string;
  devSeconds: number;
  mulePrice: number;
  mulesLeft: number;
  pubPayout: number;
}

export interface NextStep {
  now: Now;
  /** The store's rooms that glow (data-next). */
  next: StoreRoom[];
  /** The plot that glows on the map, in row 5. */
  plot: { x: number; y: number } | null;
  /** Why closed rooms are closed; '' fades a room without a note. */
  locks: Partial<Record<StoreRoom, string>>;
}

/** Seconds left at which Now turns amber. */
export const WARN_SECONDS = 10;

const ROOMS_FOR_A_MULE: StoreRoom[] = [...OUTFIT_GOODS, 'works', 'greenBelt'];

const outfitName = (o: Outfit) => (o === 'greenBelt' ? 'Green belt' : GOOD_NAME[o]);

/** The raw good with the largest shortfall this month, first in the outfitters' order on a tie; null with none short. */
export function largestShortfall(month: NonNullable<DevelopState['month']>): { good: OutfitGood; need: number; have: number } | null {
  let best: { good: OutfitGood; need: number; have: number } | null = null;
  for (const g of OUTFIT_GOODS) {
    const need = month.needs[g] ?? 0;
    const have = month.have[g] ?? 0;
    if (need - have > 0 && (!best || need - have > best.need - best.have)) best = { good: g, need, have };
  }
  return best;
}

/** The nearest of these plots to a plot, or null with none. */
export function nearest<T extends { x: number; y: number }>(plots: T[], from: { x: number; y: number }): T | null {
  let best: T | null = null;
  let d = Infinity;
  for (const p of plots) {
    const e = Math.hypot(p.x - from.x, p.y - from.y);
    if (e < d) [best, d] = [p, e];
  }
  return best;
}

/** RULE-7 locks: no MULE closes what needs one; any MULE closes the corral; an outfitted one fades the rest without a note. */
function locksFor(carry: DevelopState['carry']): NextStep['locks'] {
  if (carry === null) return Object.fromEntries(ROOMS_FOR_A_MULE.map((r) => [r, 'needs a MULE']));
  if (carry === 'empty') return { corral: 'one at a time' };
  return { corral: 'one at a time', ...Object.fromEntries(ROOMS_FOR_A_MULE.map((r) => [r, ''])) };
}

/**
 * The shops the hall opens: every one RULE-7's locks leave unlocked. The works' three fits open and close with the
 * works; the corral and the pub are never locked for want of a MULE.
 */
export function openShops(locks: NextStep['locks']): Shop[] {
  const shops: [Shop, StoreRoom][] = [
    ...OUTFIT_GOODS.map((g): [Shop, StoreRoom] => [g, g]),
    ...FACTORY_GOODS.map((g): [Shop, StoreRoom] => [g, 'works']),
    ['greenBelt', 'greenBelt'],
    ['corral', 'corral'],
    ['pub', 'pub'],
  ];
  return shops.filter(([, room]) => locks[room] === undefined).map(([shop]) => shop);
}

/** RULE-7, development's next step: a decision table, first match wins. */
export function nextStep(s: DevelopState): NextStep {
  const warn = s.seconds <= WARN_SECONDS;
  const locks = locksFor(s.carry);
  const step = (n: number, title: string, detail: ReactNode, next: StoreRoom[] = [], plot: NextStep['plot'] = null): NextStep => ({
    now: { step: n, of: 3, title, detail, warn },
    next,
    plot,
    locks,
  });
  // Row 1.
  if (s.filling) return step(1, 'You eat, and the clock starts for everyone', `${s.pace}. Everyone has the same ${s.devSeconds} s; tap a room to start.`, ['corral']);
  // Row 2.
  if (s.carry === null && !s.installed)
    return step(
      1,
      'Buy a MULE at the corral',
      s.mulesLeft > 0 ? `Tap the glowing corral: ${s.mulePrice} cr, ${s.mulesLeft} left. The clock never stops.` : 'The corral is sold out. Analyse a plot, or end your turn at the pub.',
      ['corral'],
    );
  // Row 3.
  if (s.carry === 'empty') {
    const lead = 'Lead it to an outfitter (a farm or mine) or to the works (a factory).';
    if (!s.month) return step(2, 'Choose what your MULE makes', `${lead} It can make only that good.`);
    const short = largestShortfall(s.month);
    if (!short) return step(2, 'Choose what your MULE makes', 'Lead it to any outfitter or the works: you have what you need this month.');
    const detail = createElement(
      Fragment,
      null,
      `${lead} `,
      createElement('strong', { className: 'text-ink' }, `You're short of ${GOOD_NAME[short.good]}`),
      `: you need ${short.need}, you have ${short.have}.`,
    );
    return step(2, 'Choose what your MULE makes', detail, [short.good]);
  }
  if (s.carry !== null) {
    const free = nearest(s.freePlots, s.from);
    // Row 4.
    if (s.place === 'store') return step(3, 'Walk out and install it', `Leave by either door${free ? `: your plot ${plotName(free.x, free.y)} has no MULE yet` : ''}.`, ['doorL', 'doorR']);
    // Row 6.
    if (s.atOwnPlot) return step(3, `Install your ${outfitName(s.carry)} MULE here`, 'Installing is instant. A MULE works only on a plot you own.');
    // Row 5, and its unknown: no plot of yours without a MULE.
    if (!free) return step(3, 'Install on a plot of yours', 'Tap a plot of yours on the map. A MULE works only on a plot you own.');
    return step(3, `Walk to your plot ${plotName(free.x, free.y)}`, 'Tap it on the map. A MULE works only on a plot you own.', [], free);
  }
  // Row 7.
  return {
    now: {
      title: 'MULE installed. What next?',
      detail: `${Math.ceil(s.seconds)} s left. Buy another MULE (${s.mulePrice} cr), analyse a plot, or end your turn at the pub for ≈${s.pubPayout} cr: the more time left, the more it pays.`,
      warn,
    },
    next: ['corral', 'pub'],
    plot: null,
    locks,
  };
}
