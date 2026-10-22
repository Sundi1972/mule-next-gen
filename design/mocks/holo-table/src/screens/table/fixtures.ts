import type { Slot, Species } from '@mule/ui';
import { SEATS } from '../../data';

/**
 * Made-up end-of-game data for the WS4 table screens: month 12 of the same
 * six-player game the rest of the prototype shows. Nothing comes from the engine.
 */

export interface ScoreParts {
  money: number;
  /** Goods in stock at the final colony prices. */
  goods: number;
  plots: number;
  /** Plots at the flat per-plot land value. */
  land: number;
  mules: number;
  /** Installed MULEs at the final MULE price. */
  muleValue: number;
}

export interface FinalSeat {
  slot: Slot;
  name: string;
  species: Species;
  parts: ScoreParts;
}

const PLOT_VALUE = 300;
const MULE_PRICE = 150;

function parts(money: number, goods: number, plots: number, mules: number): ScoreParts {
  return { money, goods, plots, land: plots * PLOT_VALUE, mules, muleValue: mules * MULE_PRICE };
}

const PARTS: Record<Slot, ScoreParts> = {
  0: parts(2140, 610, 6, 5),
  1: parts(2480, 420, 5, 4),
  2: parts(1310, 260, 4, 3),
  3: parts(1890, 710, 5, 5),
  4: parts(1020, 380, 4, 4),
  5: parts(3150, 540, 6, 6),
};

/** In the "you win" state Heiko's last auction went better. */
const WON_PARTS: Partial<Record<Slot, ScoreParts>> = { 0: parts(3520, 610, 6, 5) };

export function subtotal(p: ScoreParts): number {
  return p.money + p.goods + p.land + p.muleValue;
}

/** A colony that ends in Collapse cuts every score by a fifth. */
export const COLLAPSE_SHARE = 0.2;

export function finalScore(p: ScoreParts, collapse: boolean): number {
  const total = subtotal(p);
  return collapse ? Math.round(total * (1 - COLLAPSE_SHARE)) : total;
}

export function finalSeats(won: boolean): FinalSeat[] {
  return SEATS.map((s) => ({ slot: s.slot, name: s.name, species: s.species, parts: (won && WON_PARTS[s.slot]) || PARTS[s.slot] }));
}

export function ranking(won: boolean, collapse: boolean): (FinalSeat & { score: number })[] {
  return finalSeats(won)
    .map((s) => ({ ...s, score: finalScore(s.parts, collapse) }))
    .sort((a, b) => b.score - a.score);
}

/** The colony's air at the end: Smoggy when it passes, Collapse when it fails. */
export const END_AIR = { ok: 46, collapse: 86 };

export const fmt = (n: number) => Math.round(n).toLocaleString('en');
