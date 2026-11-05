import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, goodsMarket, PERCENT, player, SHIP_ID, STORE_ID, type GameState, type LawId } from '../src/index.js';

/**
 * W2's receipt split (for WS7's C41 export tax, slice 2a RULE-43): the close stage's receipt (UX audit A-5) spells
 * the export tax out beside the sales tax, from what chargeExportTax took, so its words add up: `tax` is the sales
 * tax alone and `exportTax` the export tax, and the month's tally nets both.
 */
const SEATS = ['lena', 'brix', 'ossa', 'kai'];

function crystiteUp(laws: Partial<Record<LawId, number>>): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  const inForce = Object.fromEntries(Object.entries(laws).map(([law, setting]) => [law, { setting, since: 1 }]));
  state.politics = { ...state.politics!, election: null, laws: inForce };
  state.treasury.salesTax = 5 / PERCENT;
  while (state.phase !== 'auction') advancePhase(state);
  state.auction = { ...state.auction!, good: 'crystite', stage: 'walk' };
  player(state, 'brix').stock.crystite = 2;
  return state;
}

describe("W2: the receipt spells out the export tax (A-5, RULE-43)", () => {
  it('a unit to the ship and one to the store under a 20% export tax: 200 gross, 10 sales tax, 20 export tax, +170 for the month', () => {
    const state = crystiteUp({ exportTax: 20 });
    const money = player(state, 'brix').money;
    goodsMarket(state).trade(SHIP_ID, 'brix', 100);
    goodsMarket(state).trade(STORE_ID, 'brix', 100);
    const a = state.auction!;
    expect(a.receipts.brix!.sold).toMatchObject({ units: 2, gross: 200, tax: 10, exportTax: 20 });
    expect(a.tally.brix).toBe(170);
    expect(player(state, 'brix').money - money).toBe(170);
  });

  it('without the export tax law the receipt has no export tax, and its tax is the sales tax as before', () => {
    const state = crystiteUp({});
    goodsMarket(state).trade(SHIP_ID, 'brix', 100);
    expect(state.auction!.receipts.brix!.sold).toMatchObject({ gross: 100, tax: 5, exportTax: 0 });
    expect(state.auction!.tally.brix).toBe(95);
  });
});
