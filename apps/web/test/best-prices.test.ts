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
  it('Brix asks 70, Ossa 76, Kai bids 61, Lena 58: the ask is Brix at 70 and the bid Kai at 61', () => {
    const best = bestPrices([walker('brix', 'seller', 70), walker('ossa', 'seller', 76), walker('kai', 'buyer', 61), walker('lena', 'buyer', 58)]);
    expect(ids(best)).toEqual({ ask: 'brix', bid: 'kai' });
    expect(best.ask!.price - best.bid!.price).toBe(9);
  });

  it('Brix and Kai meeting at 63: both lines sit at 63, where the trade bar is', () => {
    const best = bestPrices([walker('brix', 'seller', 63), walker('ossa', 'seller', 76), walker('kai', 'buyer', 63), walker('lena', 'buyer', 58)]);
    expect(ids(best)).toEqual({ ask: 'brix', bid: 'kai' });
    expect([best.ask!.price, best.bid!.price]).toEqual([63, 63]);
  });

  it('a land lot with Ossa at 310 and Lena at 290: the bid is Ossa at 310 and there is no ask', () => {
    const best = bestPrices([walker('ossa', 'buyer', 310), walker('lena', 'buyer', 290), walker('brix', 'pass', 0)]);
    expect(ids(best)).toEqual({ ask: null, bid: 'ossa' });
  });

  it('a seller with 0 units holds no line, even at the lowest ask', () => {
    const best = bestPrices([walker('brix', 'seller', 60, { units: 0 }), walker('ossa', 'seller', 76, { units: 3 }), walker('kai', 'buyer', 61)]);
    expect(ids(best)).toEqual({ ask: 'ossa', bid: 'kai' });
  });

  it('a seller whose units are absent counts as having units', () => {
    const best = bestPrices([walker('brix', 'seller', 70), walker('ossa', 'seller', 76, { units: 2 })]);
    expect(ids(best)).toEqual({ ask: 'brix', bid: null });
  });

  it('compares the unrounded price, the one the line is drawn at', () => {
    const best = bestPrices([walker('brix', 'seller', 70.4), walker('ossa', 'seller', 70.1), walker('kai', 'buyer', 61.2), walker('lena', 'buyer', 61.4)]);
    expect(ids(best)).toEqual({ ask: 'ossa', bid: 'lena' });
  });

  it('nobody on either side: no ask and no bid', () => {
    expect(ids(bestPrices([walker('brix', 'pass', 0)]))).toEqual({ ask: null, bid: null });
  });
});
