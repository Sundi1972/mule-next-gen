import type { Good } from '@mule/engine';
import type { AuctionView, MuleView, WalkerView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { shipWants, ShipWants, storeWords, TvReadout, walkHint } from '../src/components/AuctionParts';

const view = { players: [{ id: 'lena', name: 'Lena', slot: 0 }, { id: 'acc', name: 'The Accountant', slot: 1 }, { id: 'kai', name: 'Kai', slot: 2 }] } as unknown as MuleView;

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
    expect(walkHint(view, a, 'lena', 1).how).toBe('Hold ▲ to walk up; a tap moves 1 cr.');
  });
  it('a seller holds ▼ to walk down', () => {
    const a = auction({ storeBuys: 8, walkers: [walker('lena', 'seller', 40)] });
    expect(walkHint(view, a, 'lena', 3).how).toBe('Hold ▼ to walk down; a tap moves 1 cr.');
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
  /** What the readout's NEAREST TRADE row says, as rendered (WS6, 6 Nov: the row counts only pairs with a player in them). */
  const gapOf = (a: AuctionView) => /NEAREST TRADE<\/dt><dd[^>]*>([^<]*)<\/dd>/.exec(renderToStaticMarkup(createElement(TvReadout, { view, auction: a })))?.[1];
  it.each<[string, Partial<AuctionView>, string]>([
    // Two houses never trade with each other: the ship paying over the store's selling line is no meeting.
    ['the ship pays over the store’s selling line, the only player asks above both', { good: 'crystite', storeSells: 100, storeForSale: 3, shipPays: 119, walkers: [walker('lena', 'seller', 150)] }, '31 apart'],
    ['the ship pays the store’s selling line, the only player bids under it', { good: 'crystite', storeSells: 100, storeForSale: 3, shipPays: 100, walkers: [walker('lena', 'buyer', 90)] }, '10 apart'],
    ['a buyer faces the store’s selling line, not the store’s own buying line', { storeSells: 30, storeForSale: 3, storeBuys: 24, walkers: [walker('lena', 'buyer', 12)] }, '18 apart'],
    ['no player price at all: nothing to read', { good: 'crystite', storeSells: 100, storeForSale: 3, shipPays: 119, walkers: [walker('lena', 'seller', 150, 0)] }, '—'],
    // A player on one side: they meet.
    ['a player’s ask at the ship’s price', { good: 'crystite', storeSells: 100, storeForSale: 3, shipPays: 119, walkers: [walker('lena', 'seller', 119)] }, 'they meet'],
    ['a player’s ask under the store’s buying line', { storeBuys: 24, walkers: [walker('lena', 'seller', 20)] }, 'they meet'],
    ['a player’s ask under another player’s bid', { walkers: [walker('lena', 'seller', 40), walker('kai', 'buyer', 45)] }, 'they meet'],
    ['a player’s bid at the store’s selling line', { storeSells: 30, storeForSale: 3, storeBuys: 24, walkers: [walker('lena', 'buyer', 30)] }, 'they meet'],
  ])('FM-house-meet: the readout never says the lines meet when only the ship and the store cross; a player crossing a house line still meets — %s', (_, over, gap) => {
    expect(gapOf(auction(over))).toBe(gap);
  });
});

describe("the TV's nearest trade while a deal runs", () => {
  it('NEAREST TRADE (WS6, 6 Nov): while a deal runs the row reads TRADING, one word, so the longer label costs the readout no line (TV-FIT)', () => {
    const html = renderToStaticMarkup(createElement(TvReadout, { view, auction: auction({ walkers: [walker('lena', 'seller', 40), walker('kai', 'buyer', 45)], deals: [{ buyer: 'kai', seller: 'lena', price: 40, units: 1 }] }) }));
    expect(/NEAREST TRADE<\/dt><dd[^>]*>([^<]*)<\/dd>/.exec(html)?.[1]).toBe('TRADING');
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
    const text = html.replace(/<[^>]+>/g, '');
    expect(text).toContain('100 · ship');
    expect(text).not.toContain('100 · store');
  });
});

describe("the TV's readout, one line a value, as the couch reads it", () => {
  /** Each value's words, and the label of each mark in it. */
  const read = (a: AuctionView) =>
    [...renderToStaticMarkup(createElement(TvReadout, { view, auction: a })).matchAll(/<dd[^>]*>(.*?)<\/dd>/g)].map((m) => ({
      text: m[1]!.replace(/<[^>]+>/g, ''),
      marks: [...m[1]!.matchAll(/role="img"[^>]*aria-label="([^"]+)"/g)].map((x) => x[1]),
    }));

  it("a player's value leads with the price, then their mark, the creature the board draws, then their name", () => {
    const [ask, bid] = read(auction({ walkers: [walker('acc', 'seller', 118), walker('lena', 'seller', 140), walker('kai', 'buyer', 131)], deals: [{ buyer: 'kai', seller: 'acc', price: 118, units: 12 }] }));
    expect(ask).toEqual({ text: '118 · The Accountant', marks: ['The Accountant'] });
    expect(bid).toEqual({ text: '131 · Kai', marks: ['Kai'] });
  });

  it('a house says its own short word, "store" or "ship", with no mark and no "the"', () => {
    const [ask, bid] = read(auction({ storeSells: 60, storeForSale: 4, storeBuys: 40, shipPays: 50, walkers: [walker('lena', 'seller', 70)] }));
    expect(ask).toEqual({ text: '60 · store', marks: [] });
    expect(bid).toEqual({ text: '50 · ship', marks: [] });
    const [, storeBid] = read(auction({ storeBuys: 40, walkers: [walker('lena', 'seller', 70)] }));
    expect(storeBid).toEqual({ text: '40 · store', marks: [] });
  });
});
