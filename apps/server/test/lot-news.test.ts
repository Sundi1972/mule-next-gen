import { COLONY_SELLER, type Listing } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { lotNews } from '../src/land-auction.js';

/** The news line at a lot's bell, as the table reads it. C30 (G-5 RULE-28): the colony can buy a plot for an object's site. */
const names: Record<string, string> = { brix: 'Brix', ossa: 'Ossa' };
const nameOf = (id: string) => names[id] ?? id;
const brixPlot: Listing = { id: 'plot-2-1', seller: 'brix', item: { kind: 'plot', x: 2, y: 1 }, minimum: 100, unsold: 'keep', storePays: 0 };

describe('the news at a lot’s bell', () => {
  it('C30: a plot the colony buys for an object’s site says the colony bought it, never its id', () => {
    expect(lotNews(brixPlot, { kind: 'sold', buyer: COLONY_SELLER, price: 181 }, nameOf)).toBe('The colony bought plot 2·1 from Brix for 181.');
  });

  it('a player who buys it is named as before', () => {
    expect(lotNews(brixPlot, { kind: 'sold', buyer: 'ossa', price: 300 }, nameOf)).toBe('Ossa bought plot 2·1 from Brix for 300.');
  });
});
