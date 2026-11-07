import type { Listing } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { lotNews } from '../src/land-auction.js';

/** The news line at a lot's bell, as the table reads it. */
const names: Record<string, string> = { brix: 'Brix', ossa: 'Ossa' };
const nameOf = (id: string) => names[id] ?? id;
const brixPlot: Listing = { id: 'plot-2-1', seller: 'brix', item: { kind: 'plot', x: 2, y: 1 }, minimum: 100, unsold: 'keep', storePays: 0 };

describe('the news at a lot’s bell', () => {
  it('a player who buys it is named as before', () => {
    expect(lotNews(brixPlot, { kind: 'sold', buyer: 'ossa', price: 300 }, nameOf)).toBe('Ossa bought plot 2·1 from Brix for 300.');
  });
});
