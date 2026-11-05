import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  chargeExportTax,
  createGame,
  goodsMarket,
  player,
  PERCENT,
  plotsOwned,
  SHIP_ID,
  STORE_ID,
  type GameState,
  type LawId,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

/** A politics game with `laws` in force and no Governor; the sales tax at 5%. */
function withLaws(laws: Partial<Record<LawId, number>>): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  const inForce = Object.fromEntries(Object.entries(laws).map(([law, setting]) => [law, { setting, since: 1 }]));
  state.politics = { ...state.politics!, election: null, laws: inForce };
  state.treasury.salesTax = 5 / PERCENT;
  return state;
}

function advanceTo(state: GameState, phase: GameState['phase']): void {
  while (state.phase !== phase) advancePhase(state);
}

/** The goods auction with crystite up and Brix holding two. */
function crystiteUp(state: GameState): void {
  advanceTo(state, 'auction');
  state.auction = { ...state.auction!, good: 'crystite', stage: 'walk' };
  player(state, 'brix').stock.crystite = 2;
}

function give(state: GameState, id: string, plots: number): void {
  for (const t of state.tiles.filter((t) => t.owner === null && t.terrain !== 'store').slice(0, plots)) t.owner = id;
}

describe('C41: the law taxes charge their payers into the fund', () => {
  it('T-AC-42: under a 20% export tax a 100 cr unit sold to the ship pays the 5% sales tax and the export tax, so the seller keeps 75; a unit sold to the store pays the sales tax only', () => {
    const state = withLaws({ exportTax: 20 });
    crystiteUp(state);
    const brix = player(state, 'brix');
    const [money, fund] = [brix.money, state.treasury.money];

    goodsMarket(state).trade(SHIP_ID, 'brix', 100);
    expect(brix.money - money).toBe(75);
    expect(state.treasury.money - fund).toBe(25);
    expect(state.colony!.ledger.in).toMatchObject({ salesTax: 5, exportTax: 20 });
    expect(state.treasury.paid.brix).toBe(25);

    goodsMarket(state).trade(STORE_ID, 'brix', 100);
    expect(brix.money - money).toBe(75 + 95);
    expect(state.colony!.ledger.in.exportTax).toBe(20);
  });

  it('T-AC-43: the pollution tax charges this month\'s pollution, and a payer short of money pays what they have and never goes below 0', () => {
    const state = withLaws({ pollutionTax: 20 });
    advanceTo(state, 'auction');
    const report = state.history.at(-1)!;
    report.pollutionBy = { lena: 3, brix: 2 };
    player(state, 'lena').money = 500;
    player(state, 'brix').money = 30;
    const fund = state.treasury.money;
    advanceTo(state, 'upkeep');
    expect(player(state, 'brix').money).toBe(0);
    expect(state.history.at(-1)!.ledger!.in.pollutionTax).toBe(60 + 30);
    expect(state.treasury.money).toBeGreaterThanOrEqual(fund);
    expect(state.players.every((p) => p.money >= 0)).toBe(true);
  });

  it('B-AC-41: under a land tax of 10 each owner pays 10 a plot at the month end, what they have at most, into the fund, and the report shows it', () => {
    const state = withLaws({ landTax: 10 });
    give(state, 'ossa', 7);
    give(state, 'kai', 4);
    advanceTo(state, 'auction');
    player(state, 'ossa').money = 500;
    player(state, 'kai').money = 30;
    const plots = { ossa: plotsOwned(state, 'ossa'), kai: plotsOwned(state, 'kai') };
    advanceTo(state, 'upkeep');
    expect(player(state, 'ossa').money).toBe(500 - 10 * plots.ossa);
    expect(player(state, 'kai').money).toBe(0);
    expect(state.history.at(-1)!.ledger!.in.landTax).toBe(10 * plots.ossa + 30);
  });

  it('T-AC-44 (engine): with no law in force, or with politics off, no law tax is charged', () => {
    const none = withLaws({});
    crystiteUp(none);
    goodsMarket(none).trade(SHIP_ID, 'brix', 100);
    expect(none.colony!.ledger.in.exportTax).toBeUndefined();
    expect(chargeExportTax(none, 'brix', 100)).toBe(0);

    const off = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics: false });
    expect(chargeExportTax(off, 'brix', 100)).toBe(0);
  });
});
