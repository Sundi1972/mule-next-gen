import { afterEach, describe, expect, it } from 'vitest';
import { advancePhase, createGame, PRICE, STRATEGIST, stepAuction, WALK, type GameState, type Good, type Tile, type Trade } from '@mule/engine';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';

/**
 * AM-17 in the AI's Energy value: a unit short of covering its plots keeps on the plot the engine would turn off first,
 * so it is worth what that plot loses turned off: (1 − UPKEEP.offOutputShare) × its output × the good's price, spread
 * over the plot's use. Observed where the seat receives it: what it buys at the Energy auction.
 */

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

/** PR #386's stopgap buys any shortfall at the store's ask; off here, so the seat's own Energy value decides. */
const savedShortfall = (STRATEGIST as Record<string, unknown>).buyShortfall;
afterEach(() => {
  if (savedShortfall === undefined) delete (STRATEGIST as Record<string, unknown>).buyShortfall;
  else Object.assign(STRATEGIST, { buyShortfall: savedShortfall });
});

/**
 * Month 1's auction. ai0 (Rookie: no look-ahead, so its prices are the store's posted ones, and nothing spoils) owns one
 * Smithore mine rated 6 (use 2) and holds no Energy; the store's Smithore is posted at 100 and there is no sales tax.
 * Turned off, the mine loses 0.8 × 6 × 100 = 480, 240 a unit of its use; under the old halving it lost 0.5 × 6 × 100 =
 * 300, 150 a unit. The store sells Energy at about 195 a unit, between the two. Nobody else holds Energy or money.
 */
function table(): GameState {
  const state = createGame({ seed: 7, players: ['ai0', 'ai1', 'ai2', 'ai3'].map((id) => ({ id, name: id, isAi: true, species: 'zipwing' as const })) });
  while (state.phase !== 'auction') advancePhase(state);
  for (const t of state.tiles) if (t.owner) Object.assign(t, { owner: null, outfit: null });
  const mine = state.tiles.find((t) => t.terrain !== 'store')!;
  Object.assign(mine, { terrain: 'plains', traits: [], ground: { ...flatGround, smithore: 6 }, owner: 'ai0', outfit: 'smithore', pollution: 0, runMonths: 0 } satisfies Partial<Tile>);
  delete mine.special;
  // It has analysed its own plot, so it reads the mine's real rating.
  state.players.find((p) => p.id === 'ai0')!.analysed.push(state.tiles.indexOf(mine));
  state.treasury.salesTax = 0;
  state.store.posted.smithore = 100;
  state.store.posted.energy = Math.round(195 / (1 + PRICE.storeSpread));
  state.store.stock.energy = 20;
  for (const p of state.players) {
    p.stock.energy = 0;
    p.money = p.id === 'ai0' ? 5000 : 0;
  }
  return state;
}

function playAuction(state: GameState): Trade[] {
  const seats = state.players.map((p, i) => new AiSeat({ id: p.id, name: p.name, persona: 'cautious', level: i === 0 ? 'rookie' : 'trader', seed: 70 + i }));
  const trades: Trade[] = [];
  let ask: number | null = null;
  for (let i = 0; i < 60_000 && state.auction && state.auction.stage !== 'over'; i++) {
    if (state.auction.good === 'energy') ask = state.auction.storeSell;
    for (const s of seats) s.auctionTick(state, WALK.tickMs, (x) => applyAction(state, s.id, x));
    trades.push(...stepAuction(state, WALK.tickMs));
  }
  // The arrangement held: the store's Energy ask sat between the old and the new value of a unit short.
  expect(ask).toBeGreaterThan(150);
  expect(ask).toBeLessThan(240);
  return trades;
}

describe('AM-17: the AI values Energy by the plot it keeps on', () => {
  it('B-AC-energy-value: a seat short of the Energy its mine uses buys it at the store when the mine turned off loses more than the price', () => {
    Object.assign(STRATEGIST, { buyShortfall: [] as Good[] });
    const state = table();

    const trades = playAuction(state);

    const bought = trades.filter((t) => t.good === 'energy' && t.buyer === 'ai0').reduce((n, t) => n + t.quantity, 0);
    expect(bought).toBeGreaterThanOrEqual(1);
    expect(state.players.find((p) => p.id === 'ai0')!.stock.energy).toBe(bought);
  });
});
