import type { Good } from '@mule/engine';
import type { AuctionView, MuleView, WalkerView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { shipWants, ShipWants, storeWords, TvReadout, walkHint } from '../src/components/AuctionParts';

const view = { players: [{ id: 'lena', name: 'Lena' }, { id: 'acc', name: 'The Accountant' }, { id: 'kai', name: 'Kai' }] } as unknown as MuleView;

const walker = (id: string, side: WalkerView['side'], price: number, units = 3): WalkerView => ({ id, side, price, at: price, dir: 0, done: false, units });

function auction(over: Partial<AuctionView>): AuctionView {
  return {
    good: 'food',
    stage: 'walk',
    seconds: 10,
    total: 20,
    slowed: false,
    next: [],
    storeBuys: null,
    storeSells: null,
    storeForSale: 0,
    shipPays: null,
    lo: 0,
    hi: 100,
    speed: 1,
    walkers: [],
    deals: [],
    units: 0,
    status: [],
    skipped: [],
    upNext: null,
    receipt: null,
    tally: null,
    ...over,
  };
}

describe("G-4: the store's prices said from your side", () => {
  it('names what you can do at each price', () => {
    expect(storeWords(auction({ storeSells: 30, storeBuys: 24, storeForSale: 5 }))).toBe('You can buy from the store at 30 · sell to it at 24');
  });
  it('says when the store has none to sell', () => {
    expect(storeWords(auction({ storeSells: 30, storeBuys: 24, storeForSale: 0 }))).toBe('The store has none to sell · you can sell to it at 24');
  });
  it('says when the store is not buying', () => {
    expect(storeWords(auction({ storeSells: 30, storeBuys: null, storeForSale: 2 }))).toBe('You can buy from the store at 30 · it isn’t buying');
  });
});

describe('G-3: the hint names the line to walk to, and who stands there', () => {
  it("a buyer with the store as the only seller walks up to the store's line", () => {
    const a = auction({ storeSells: 30, storeBuys: 24, storeForSale: 4, walkers: [walker('lena', 'buyer', 12), walker('acc', 'buyer', 10)] });
    expect(walkHint(view, a, 'lena', 1).line).toBe('Walk up to the store’s line at 30: it’s the only seller.');
  });
  it('a buyer walks up to the cheapest of the store and the players', () => {
    const a = auction({ storeSells: 30, storeForSale: 4, walkers: [walker('lena', 'buyer', 12), walker('kai', 'seller', 41)] });
    expect(walkHint(view, a, 'lena', 1).line).toBe('Walk up to the store’s line at 30: it sells cheapest.');
  });
  it("a buyer walks up to a player's ask when it is under the store's", () => {
    const a = auction({ storeSells: 30, storeForSale: 4, walkers: [walker('lena', 'buyer', 12), walker('kai', 'seller', 26)] });
    expect(walkHint(view, a, 'lena', 1).line).toBe('Walk up to Kai’s ask at 26: the store asks 30.');
  });
  it("a seller hears the store's price and every bid under it", () => {
    const a = auction({ good: 'water', storeBuys: 8, walkers: [walker('lena', 'seller', 40), walker('acc', 'buyer', 6)] });
    expect(walkHint(view, a, 'lena', 3).line).toBe('Walk down: the store pays 8, The Accountant bids 6.');
  });
  it("a seller walks down to the ship's line when it pays the most", () => {
    const a = auction({ good: 'crystite', storeBuys: 86, shipPays: 120, walkers: [walker('lena', 'seller', 150)] });
    expect(walkHint(view, a, 'lena', 4).line).toBe('Walk down to the ship’s line at 120: it pays the most. The store pays 86.');
  });
  it('a seller who has sold all they have is told so, not sent to a bid', () => {
    const a = auction({ good: 'water', storeBuys: 8, walkers: [walker('lena', 'seller', 40, 0), walker('acc', 'buyer', 6)] });
    expect(walkHint(view, a, 'lena', 0)).toEqual({ line: 'You’ve sold all you have.', how: null });
  });
  it('a player who passed is told they sit it out, with nothing about walking', () => {
    const a = auction({ walkers: [walker('lena', 'pass', 0)] });
    expect(walkHint(view, a, 'lena', 2)).toEqual({ line: 'You sit Food out.', how: null });
  });
  it('a buyer with nobody selling is told so', () => {
    const a = auction({ storeSells: null, walkers: [walker('lena', 'buyer', 12)] });
    expect(walkHint(view, a, 'lena', 0).line).toBe('Nobody is selling Food now.');
  });
});

describe('G-2: "Hold" said in the hint', () => {
  it('a buyer holds ▲ to walk up', () => {
    const a = auction({ storeSells: 30, storeForSale: 4, walkers: [walker('lena', 'buyer', 12)] });
    expect(walkHint(view, a, 'lena', 1).how).toBe('Hold ▲ to walk up.');
  });
  it('a seller holds ▼ to walk down', () => {
    const a = auction({ storeBuys: 8, walkers: [walker('lena', 'seller', 40)] });
    expect(walkHint(view, a, 'lena', 3).how).toBe('Hold ▼ to walk down.');
  });
});

describe('G-6: what the ship in port wants, in one panel', () => {
  const game = (inPort: boolean, wants: Partial<Record<Good, number>> = { crystite: 24, alloy: 12, smithore: 0 }) =>
    ({
      ship: { arrives: 3, inPort, wants },
      market: [
        { good: 'crystite', shipPays: 120 },
        { good: 'alloy', shipPays: 90 },
        { good: 'smithore', shipPays: 40 },
        { good: 'rareEarth', shipPays: 70 },
        { good: 'water', shipPays: 12 },
      ],
    }) as unknown as MuleView;
  const panel = (view: MuleView, a: AuctionView, have?: number) => {
    const w = shipWants(view, a);
    if (!w) return null;
    const html = renderToStaticMarkup(createElement(ShipWants, { want: w.first, also: w.also, ...(have === undefined ? {} : { have }) }));
    return { count: html.split('data-testid="ship-wants"').length - 1, text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/ ([.,:])/g, '$1').trim() };
  };

  it('heads with the first wanted good still to come, with the good really before it and its first price', () => {
    const a = auction({ good: 'food', next: ['water', 'energy', 'smithore', 'crystite', 'rareEarth', 'alloy'] });
    expect(shipWants(game(true), a)).toEqual({ first: { good: 'crystite', wants: 24, pays: 120, after: 'smithore' }, also: [{ good: 'alloy', wants: 12 }] });
  });
  it('says nothing while the ship is only announced, not in port', () => {
    expect(shipWants(game(false), auction({ next: ['crystite', 'alloy'] }))).toBeNull();
  });
  it('leaves out a wanted good that has already come up', () => {
    expect(shipWants(game(true), auction({ good: 'rareEarth', next: ['alloy'] }))?.first.good).toBe('alloy');
  });
  it('names the good that really comes up before it: a skipped good is not "before" anything', () => {
    // Smithore was skipped, so Crystite comes up after Energy.
    expect(shipWants(game(true), auction({ good: 'food', next: ['water', 'energy', 'crystite', 'rareEarth', 'alloy'] }))?.first.after).toBe('energy');
  });
  it('the first good still to come is after the good up now', () => {
    expect(shipWants(game(true), auction({ good: 'energy', next: ['crystite'] }))?.first.after).toBe('energy');
  });
  it("on the wanted good's own status screen, it heads the panel, at the auction's ship price", () => {
    const a = auction({ good: 'crystite', stage: 'status', shipPays: 118, next: ['rareEarth', 'alloy'] });
    expect(shipWants(game(true), a)).toEqual({ first: { good: 'crystite', wants: 24, pays: 118, after: null }, also: [{ good: 'alloy', wants: 12 }] });
  });

  it('one good: one panel, no "also"', () => {
    const p = panel(game(true, { crystite: 24 }), auction({ good: 'food', next: ['smithore', 'crystite'] }), 4);
    expect(p).toEqual({ count: 1, text: 'The ship wants 24 Crystite this month. Crystite comes up after Smithore: the ship pays 120 cr for the first. You have 4.' });
  });
  it('two goods: one panel, the other with its count', () => {
    const p = panel(game(true, { crystite: 24, rareEarth: 6 }), auction({ good: 'food', next: ['smithore', 'crystite', 'rareEarth'] }), 4);
    expect(p).toEqual({ count: 1, text: 'The ship wants 24 Crystite this month. Crystite comes up after Smithore: the ship pays 120 cr for the first. You have 4. It also wants 6 Rare earth.' });
  });
  it('four goods: one panel, the other three by name in one sentence; the TV leaves out what you have', () => {
    const p = panel(game(true, { water: 3, smithore: 9, crystite: 24, rareEarth: 6 }), auction({ good: 'food', next: ['water', 'energy', 'smithore', 'crystite', 'rareEarth'] }));
    expect(p).toEqual({ count: 1, text: 'The ship wants 3 Water this month. Water comes up after Food: the ship pays 12 cr for the first. It also wants Smithore, Crystite and Rare earth.' });
  });
});

describe("the TV's gap", () => {
  it('reads "they meet" when the best ask is not above the best bid, never a negative', () => {
    const a = auction({ good: 'crystite', storeSells: 100, storeForSale: 3, shipPays: 119, walkers: [walker('lena', 'seller', 150)] });
    const html = renderToStaticMarkup(createElement(TvReadout, { view, auction: a }));
    expect(html).toContain('they meet');
    expect(html).not.toMatch(/-\d+ apart/);
  });
  it('reads "N apart" while the ask is above the bid', () => {
    const a = auction({ storeSells: 30, storeForSale: 3, storeBuys: 24, walkers: [walker('lena', 'buyer', 12)] });
    expect(renderToStaticMarkup(createElement(TvReadout, { view, auction: a }))).toContain('6 apart');
  });
});

describe('a tie between the ship and the store goes to the ship, as the engine sells', () => {
  it('a seller is sent to the ship when it pays what the store pays', () => {
    const a = auction({ good: 'crystite', storeBuys: 100, shipPays: 100, walkers: [walker('lena', 'seller', 150)] });
    expect(walkHint(view, a, 'lena', 4).line).toBe('Walk down to the ship’s line at 100: it pays the most. The store pays 100.');
  });
  it("the TV's readout names the ship as the highest bid", () => {
    const a = auction({ good: 'crystite', storeBuys: 100, shipPays: 100, walkers: [walker('lena', 'seller', 150)] });
    const html = renderToStaticMarkup(createElement(TvReadout, { view, auction: a }));
    expect(html).toContain('100 · the ship');
    expect(html).not.toContain('100 · the store');
  });
});
