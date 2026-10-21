import { bestPrices, type BoardWalker } from '@mule/ui';
import { describe, expect, it } from 'vitest';

const walker = (id: string, side: BoardWalker['side'], at: number, extra: Partial<BoardWalker> = {}): BoardWalker => ({
  id,
  name: id,
  slot: 0,
  side,
  price: Math.round(at),
  at,
  ...extra,
});

const ids = (best: ReturnType<typeof bestPrices>) => ({ ask: best.ask?.id ?? null, bid: best.bid?.id ?? null });

describe('T-AC-1: bestPrices returns the lowest seller with units and the highest buyer', () => {
  it('T-AC-1: Brix asks 70, Ossa 76, Kai bids 61, Lena 58: the ask is Brix at 70 and the bid Kai at 61', () => {
    const best = bestPrices([walker('brix', 'seller', 70), walker('ossa', 'seller', 76), walker('kai', 'buyer', 61), walker('lena', 'buyer', 58)]);
    expect(ids(best)).toEqual({ ask: 'brix', bid: 'kai' });
    expect(best.ask!.price - best.bid!.price).toBe(9);
  });

  it('T-AC-1: Brix and Kai meeting at 63: the ask and the bid are both 63', () => {
    const best = bestPrices([walker('brix', 'seller', 63), walker('ossa', 'seller', 76), walker('kai', 'buyer', 63), walker('lena', 'buyer', 58)]);
    expect(ids(best)).toEqual({ ask: 'brix', bid: 'kai' });
    expect([best.ask!.price, best.bid!.price]).toEqual([63, 63]);
  });

  it('T-AC-1: a land lot with Ossa at 310 and Lena at 290: the bid is Ossa at 310 and there is no ask', () => {
    const best = bestPrices([walker('ossa', 'buyer', 310), walker('lena', 'buyer', 290), walker('brix', 'pass', 0)]);
    expect(ids(best)).toEqual({ ask: null, bid: 'ossa' });
  });

  it('T-AC-1: a seller with 0 units holds no line, a seller with 1 unit does, and a buyer with 0 units still bids', () => {
    const best = bestPrices([walker('brix', 'seller', 60, { units: 0 }), walker('ossa', 'seller', 76, { units: 1 }), walker('kai', 'buyer', 61, { units: 0 })]);
    expect(ids(best)).toEqual({ ask: 'ossa', bid: 'kai' });
  });

  it('T-AC-1: a seller whose units are absent counts as having units', () => {
    const best = bestPrices([walker('brix', 'seller', 70), walker('ossa', 'seller', 76, { units: 2 })]);
    expect(ids(best)).toEqual({ ask: 'brix', bid: null });
  });

  it('T-AC-1: compares the unrounded price, and on an exact tie the first walker keeps the line', () => {
    const best = bestPrices([
      walker('rex', 'seller', 70.4),
      walker('brix', 'seller', 70.1),
      walker('ossa', 'seller', 70.1),
      walker('mia', 'buyer', 61.2),
      walker('kai', 'buyer', 61.4),
      walker('lena', 'buyer', 61.4),
    ]);
    expect(ids(best)).toEqual({ ask: 'brix', bid: 'kai' });
  });

  it('T-AC-1: nobody on either side: no ask and no bid', () => {
    expect(ids(bestPrices([walker('brix', 'pass', 0)]))).toEqual({ ask: null, bid: null });
  });
});
