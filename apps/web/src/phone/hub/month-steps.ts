import { GAME } from '@mule/engine';
import type { MuleView } from '@mule/protocol';

/** The land grant's claims, as config has them: "up to 2 free plots", "up to 1 free plot". */
export const freePlots = (n: number = GAME.claimsPerGrant) => `up to ${n} free ${n === 1 ? 'plot' : 'plots'}`;

/** One step of the month, as the roadmap names it. */
export interface MonthStep {
  id: 'plan' | 'grant' | 'land' | 'develop' | 'produce' | 'auction';
  label: string;
}

/** The month in order, as the engine runs its phases; the month end after the goods auction is not a step. */
const STEPS: readonly MonthStep[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'grant', label: 'Land grant' },
  { id: 'land', label: 'Land auction' },
  { id: 'develop', label: 'Develop' },
  { id: 'produce', label: 'Produce' },
  { id: 'auction', label: 'Goods auction' },
];

/**
 * This month's steps: the land auction only in a month with a lot, as the engine skips it with none. In planning the
 * lots are the ones listed so far; the colony's own lot, if any, is drawn as the land grant ends.
 */
export function roadmapSteps(view: Pick<MuleView, 'listings'>): MonthStep[] {
  return STEPS.filter((s) => s.id !== 'land' || view.listings.length > 0);
}
