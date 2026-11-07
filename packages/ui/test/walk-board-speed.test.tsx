import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WalkBoard, type BoardDeal, type BoardWalker } from '../src/index';

/**
 * The self-trading goods auction (WS3's amendment 2026-11-05, Heiko's variant A): a deal shows its speed-up on the
 * board, as chevrons on its counter and a faster pulse, so the table sees units go faster and faster.
 */

const walkers: BoardWalker[] = [
  { id: 'lena', name: 'Lena', slot: 0, side: 'seller', price: 27, at: 27 },
  { id: 'brix', name: 'Brix', slot: 2, side: 'buyer', price: 22, at: 22 },
];

const board = (deals: BoardDeal[]) =>
  renderToStaticMarkup(<WalkBoard lo={18} hi={46} walkers={walkers} deals={deals} storeBuys={27} storeSells={36} shipPays={null} meId="lena" />);

/** The deal's chevrons: how many are lit, of how many. */
function chevrons(html: string): { lit: number; of: number } | null {
  const m = html.match(/data-testid="deal-speed"[^>]*>([\s\S]*?)<\/span><\/span>/);
  if (!m) return null;
  const all = [...m[0].matchAll(/<span class="([^"]*)">›<\/span>/g)].map((x) => x[1]!);
  return { lit: all.filter((c) => c.includes('text-holo')).length, of: all.length };
}

const pulse = (html: string) => Number(html.match(/data-testid="deal"><div[^>]*style="[^"]*animation-duration:([\d.]+)s/)?.[1]);

describe('G-1 (auto-trade): a deal shows its speed-up on the board', () => {
  it('lights one chevron of four at the first unit and all four at the top speed, and pulses faster', () => {
    const slow = board([{ buyer: 'store', seller: 'lena', price: 27, units: 1, speed: 0 }]);
    const fast = board([{ buyer: 'store', seller: 'lena', price: 27, units: 9, speed: 1 }]);
    const mid = board([{ buyer: 'store', seller: 'lena', price: 27, units: 4, speed: 0.6 }]);
    expect(chevrons(slow)).toEqual({ lit: 1, of: 4 });
    expect(chevrons(mid)).toEqual({ lit: 3, of: 4 });
    expect(chevrons(fast)).toEqual({ lit: 4, of: 4 });
    expect(pulse(slow)).toBeCloseTo(1.2);
    expect(pulse(fast)).toBeCloseTo(0.25);
    expect(pulse(fast)).toBeLessThan(pulse(mid));
    expect(pulse(mid)).toBeLessThan(pulse(slow));
  });

  it('draws no chevrons for a deal without a speed: the land auction is unchanged', () => {
    const html = board([{ buyer: 'brix', seller: 'lena', price: 25, units: 2 }]);
    expect(html).toContain('×2 @ 25');
    expect(chevrons(html)).toBeNull();
  });
});
