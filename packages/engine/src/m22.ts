// MEASUREMENT ONLY (m22), NOT FOR MERGE: the variant switch and event log the m22 prototype reads.
// M22_VARIANT = G0 (as is) | GD (open project's missing goods in monthlyDemand) | GR (GD + reserve).
import { stillNeeds } from './colony.js';
import type { GameState, Good } from './types.js';

const variant: string = (globalThis as any).process?.env?.M22_VARIANT ?? 'G0';
export const M22 = { demand: variant === 'GD' || variant === 'GR', reserve: variant === 'GR' };
export const m22log: any[] = ((globalThis as any).__m22log ??= []);

/** The open commissioned project's still-missing goods, or none. */
export function m22Missing(state: GameState): Partial<Record<Good, number>> {
  const p = state.colony?.projects.find((q) => q.stage === 'commissioned');
  return p ? stillNeeds(p).goods : {};
}
