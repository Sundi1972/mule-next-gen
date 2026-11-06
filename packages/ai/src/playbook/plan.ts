import type { Strategy } from '@mule/engine';
import type { Mind } from '../value.js';

/** The plan a seat keeps across months, and the mind it plays that plan with. See spec C12. */

export function planMind(_mind: Mind, _strategy: Pick<Strategy, 'kind'>): Mind {
  throw new Error('NotImplemented: planMind');
}
