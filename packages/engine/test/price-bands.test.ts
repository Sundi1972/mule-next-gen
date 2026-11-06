import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  auctionDone,
  cloneForSim,
  colonySupply,
  createGame,
  declareRole,
  GOOD_CONFIG,
  GOODS,
  monthlyDemand,
  postPrices,
  priceBand,
  stepAuction,
  storeSellLine,
  UPKEEP,
  WALK,
  type GameState,
  type Good,
  type PriceBand,
} from '../src/index.js';
import { farms, foodMonth, game, hold, made, post, to, worked } from './fixtures/food-month.js';

/** Month 1's upkeep with the store's Food shelf empty, so the colonists go short of Food; then month 2's production. */
function colonistsShortOfFood(): GameState {
  const state = game();
  to(state, 'production');
  hold(state, 0, 10, 10, 10, 10);
  to(state, 'upkeep');
  expect(state.history.at(-1)!.shortages, 'the premise: colonists went short of Food').toContain('food');
  to(state, 'production');
  return state;
}

/** Food's status screen, `seller` selling, then everyone Done: the walk starts. */
function walkFood(state: GameState, seller: string): void {
  const a = state.auction!;
  expect(a.good, 'the premise: Food is up').toBe('food');
  declareRole(state, seller, 'seller');
  for (const p of state.players) auctionDone(state, p.id, true);
  stepAuction(state, WALK.tickMs);
  expect(state.auction!.stage).toBe('walk');
}

/** Steps the walk until the next unit changes hands, with `buyer` and `seller` standing at `price`, then moves them apart. */
function trade(state: GameState, buyer: string, seller: string | 'store', price: number): void {
  const a = state.auction!;
  const at = (id: string) => a.walkers.find((w) => w.id === id)!;
  at(buyer).price = price;
  if (seller !== 'store') at(seller).price = price;
  for (let t = 0; ; t += WALK.tickMs) {
    expect(t, 'the unit trades').toBeLessThan(60_000);
    const sold = stepAuction(state, WALK.tickMs);
    if (sold.length > 0) {
      expect(sold).toMatchObject([{ buyer, seller, price }]);
      break;
    }
  }
  at(buyer).price = a.lo;
  if (seller !== 'store') at(seller).price = a.hi;
  stepAuction(state, WALK.tickMs);
}

/** Everyone Done: Food's walk finishes and the month runs on to the next production. */
function nextMonth(state: GameState): void {
  for (const p of state.players) auctionDone(state, p.id, true);
  stepAuction(state, WALK.tickMs);
  to(state, 'production');
}

describe('price T-AC-5: RULE-6 as a decision table, first match wins', () => {
  type Row = { name: string; good: Good; shelf: number; depots: number; farms: number[]; factories?: number; short?: boolean; band: PriceBand };
  const rows: Row[] = [
    { name: 'D = 0: only the export ship wants Crystite, none held', good: 'crystite', shelf: 0, depots: 0, farms: [], band: 'offWorld' },
    { name: 'colonists short at the last upkeep, M ≥ 2', good: 'food', shelf: 0, depots: 40, farms: [], short: true, band: 'severe' },
    { name: 'colonists short at the last upkeep, farms keep up', good: 'food', shelf: 0, depots: 40, farms: [5, 5, 5, 1], short: true, band: 'severe' },
    { name: 'P ≥ D with M < 2: farms make 16 of 14', good: 'food', shelf: 0, depots: 17, farms: [5, 5, 5, 1], band: 'normal' },
    { name: 'P ≥ D with nothing held: factories keep up', good: 'medicine', shelf: 0, depots: 0, farms: [], factories: 2, band: 'normal' },
    { name: 'M = 2 exactly (28 of 14)', good: 'food', shelf: 0, depots: 28, farms: [5, 5], band: 'normal' },
    { name: 'M just under 2 (27 of 14)', good: 'food', shelf: 0, depots: 27, farms: [5, 5], band: 'tight' },
    { name: 'M = 1 exactly (14 of 14)', good: 'food', shelf: 0, depots: 14, farms: [5, 5], band: 'tight' },
    { name: 'M just under 1 (13 of 14)', good: 'food', shelf: 0, depots: 13, farms: [5, 5], band: 'short' },
    { name: 'M = 0.5 exactly (7 of 14)', good: 'food', shelf: 0, depots: 7, farms: [5, 3], band: 'short' },
    { name: 'M just under 0.5 (6 of 14)', good: 'food', shelf: 0, depots: 6, farms: [5, 1], band: 'severe' },
    { name: 'stock is the shelf plus the depots: 14 + 14 is normal, either alone tight', good: 'food', shelf: 14, depots: 14, farms: [5, 5], band: 'normal' },
    { name: 'stock on the shelf alone counts', good: 'food', shelf: 28, depots: 0, farms: [5, 5], band: 'normal' },
  ];

  it.each(rows)('price T-AC-5: $name → $band', ({ good, shelf, depots, farms: outputs, factories, short, band }) => {
    const state = game();
    to(state, 'production');
    farms(state, outputs);
    if (factories) worked(state, good, factories);
    state.store.stock[good] = shelf;
    state.players.forEach((p, i) => (p.stock[good] = i === 0 ? depots : 0));
    expect(colonySupply(state, good), 'the premise: the colony holds shelf plus depots').toBe(shelf + depots);
    if (good === 'food' && outputs.length > 0) expect(monthlyDemand(state).food, 'the premise: D').toBe(14);
    if (factories) expect(made(state, good), 'the premise: P ≥ D').toBeGreaterThanOrEqual(monthlyDemand(state)[good]);
    expect(priceBand(state, good, undefined, short ? [good] : [])).toBe(band);
  });
});

describe('price B-AC-7: the store posts the band of the colony’s months of cover (4 seats, Food demand 14, N 30)', () => {
  it.each([
    { holds: 30, farms: [5, 5], mid: 30 },
    { holds: 20, farms: [5, 5], mid: 38 },
    { holds: 10, farms: [5, 3], mid: 60 },
    { holds: 4, farms: [5, 1], mid: 120 },
    { holds: 17, farms: [5, 5, 5, 1], mid: 30 },
  ])('price B-AC-7: holding $holds with farms making $farms, Food is posted at $mid', ({ holds, farms: outputs, mid }) => {
    const state = foodMonth(holds, outputs);
    expect(state.store.refPrice.food, 'the premise: N').toBe(30);
    expect(post(state)).toBe(mid);
  });

  it('price B-AC-7: colonists short of Food at the last upkeep posts 120, however much the colony holds and makes', () => {
    const state = colonistsShortOfFood();
    farms(state, [5, 5, 5, 1]);
    hold(state, 30, 30);
    expect(state.store.refPrice.food, 'the premise: N').toBe(30);
    expect(post(state)).toBe(120);
  });
});

describe('price B-AC-7: a good only the export ship wants follows the off-world price, not the normal one', () => {
  it('price B-AC-7: Crystite with the off-world price at 40, under its normal 100, falls a quarter a month to 40 and stays there', () => {
    const state = game();
    to(state, 'production');
    state.store.offWorld.crystite = 40;
    advancePhase(state);
    expect(state.store.band?.crystite, 'the premise: off-world').toBe('offWorld');
    const posted = [state.store.posted.crystite];
    for (let month = 2; month <= 7; month++) {
      nextMonth(state);
      advancePhase(state);
      posted.push(state.store.posted.crystite);
    }
    expect(state.store.refPrice.crystite, 'the premise: N stays above 40').toBeGreaterThan(40);
    // From the opening 100: 75, 56, 42, then 40, the off-world price, never N.
    expect(posted).toEqual([75, 56, 42, 40, 40, 40, 40]);
  });
});

describe('price B-AC-4: the store’s Food lines when Food comes up, by band', () => {
  const lines = (holds: number, outputs: number[]) => {
    const state = foodMonth(holds, outputs);
    post(state);
    const a = state.auction!;
    expect(a.good, 'the premise: Food is up').toBe('food');
    return { buy: a.storeBuy, sell: a.storeSell };
  };

  it.each([
    { band: 'normal', holds: 30, farms: [5, 5], buy: 25, sell: 35 },
    { band: 'tight', holds: 20, farms: [5, 5], buy: 32, sell: 46 },
    { band: 'shortage', holds: 10, farms: [5, 3], buy: 54, sell: 75 },
    { band: 'severe', holds: 4, farms: [5, 1], buy: 108, sell: 150 },
  ])('price B-AC-4: $band Food comes up at $buy / $sell', ({ holds, farms: outputs, buy, sell }) => {
    // The colonists' cap would cut severe Food's buy line until colony-needs deletes colonistBudget: lifted here.
    const saved = UPKEEP.colonistBudget.food;
    UPKEEP.colonistBudget.food = 10_000;
    try {
      expect(lines(holds, outputs)).toEqual({ buy, sell });
    } finally {
      UPKEEP.colonistBudget.food = saved;
    }
  });

  it('price B-AC-4: while colonistBudget exists, the severe Food buy line stays under the colonists’ cap', () => {
    const { buy, sell } = lines(4, [5, 1]);
    // 150 ÷ 1.25², what colonists can pay after the store buys and then sells at the severe band's 25%.
    expect(buy).toBe(96);
    expect(sell).toBe(150);
  });
});

describe('price B-AC-8: once supply returns the price falls a quarter a month, never below normal', () => {
  it('price B-AC-8: Food at 120 with the colony back to 30 and farms making 16 posts 90, 68, 51, 38, 30, 30', () => {
    const state = foodMonth(4, [5, 1]);
    expect(post(state), 'the premise: severe').toBe(120);
    // Enough on the shelf that the colonists eat at upkeep: the next month is not severe for their sake.
    hold(state, 10, 20);
    farms(state, [5, 5]);
    expect(made(state, 'food'), 'the premise: farms make 16').toBe(16);
    const posted: number[] = [];
    for (let month = 2; month <= 7; month++) {
      nextMonth(state);
      hold(state, 10, 20);
      expect(state.store.refPrice.food, `the premise: N in month ${month}`).toBe(30);
      posted.push(post(state));
      expect(state.history.at(-2)!.shortages, 'the premise: the colonists ate').not.toContain('food');
    }
    expect(posted).toEqual([90, 68, 51, 38, 30, 30]);
  });
});

describe('price B-AC-8: never below normal, from the opening posting on, and a crisis price does not lower normal', () => {
  it.each([2, 4, 6])('price B-AC-8: a new %i-seat game opens every good in a band, at or above its normal price unless off-world', (seats) => {
    for (const seed of [1, 7, 11, 42]) {
      const state = createGame({ seed, players: Array.from({ length: seats }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
      for (const good of GOODS) {
        const band = state.store.band?.[good];
        expect(band, `seed ${seed}: ${good} has a band`).toBeDefined();
        if (band !== 'offWorld') expect(state.store.posted[good], `seed ${seed}: ${good}`).toBeGreaterThanOrEqual(state.store.refPrice[good]);
      }
    }
  });

  /** Food's walk in a month posted in `band`, p1 selling p2 one unit at `price`; N once the walk has finished. */
  function normalAfter(state: GameState, band: PriceBand, price: number): number {
    expect(state.store.band?.food, 'the premise: the band').toBe(band);
    expect(state.store.refPrice.food, 'the premise: N').toBe(30);
    walkFood(state, 'p1');
    trade(state, 'p2', 'p1', price);
    for (const p of state.players) auctionDone(state, p.id, true);
    stepAuction(state, WALK.tickMs);
    expect(state.auction!.stage, "the premise: Food's walk finished").toBe('close');
    return state.store.refPrice.food;
  }

  it('price B-AC-8: a trade at 120 in a severe month (120 ÷ 4 = 30) leaves N at 30', () => {
    const state = colonistsShortOfFood();
    hold(state, 10, 0, 7);
    expect(post(state), 'the premise: severe').toBe(120);
    expect(normalAfter(state, 'severe', 120)).toBe(30);
  });

  it('price B-AC-8: a trade at 36 in a normal month moves N a quarter of the way up: 30 + 6 × 0.25 = 31.5, posted 32', () => {
    const state = game();
    to(state, 'production');
    farms(state, [5, 5]);
    hold(state, 6, 17, 7);
    expect(post(state), 'the premise: normal').toBe(30);
    expect(normalAfter(state, 'normal', 36)).toBe(32);
  });
});

describe('price B-AC-9: a high trade between players pulls the store halfway towards it', () => {
  /**
   * Month 1 in shortage (mid 60, the store selling at 75) with `shelf` Food on the store's shelf, p1 selling p2 one unit
   * at `price`; month 2 posts in shortage again. Returns that mid and the normal price N it was posted against.
   */
  function tradeInShortage(price: number, shelf: number): { mid: number; normal: number } {
    const state = game();
    to(state, 'production');
    farms(state, [5, 3]);
    // p1 keeps 6 for its own need and sells the seventh.
    hold(state, shelf, 0, 7);
    expect(post(state), 'the premise: shortage').toBe(60);
    walkFood(state, 'p1');
    trade(state, 'p2', 'p1', price);
    nextMonth(state);
    hold(state, shelf, 0, 7);
    const mid = post(state);
    expect(state.store.band?.food, 'the premise: shortage again').toBe('short');
    return { mid, normal: state.store.refPrice.food };
  }

  it('price B-AC-9: shortage at 60 and a trade at 95 last walk posts 78', () => {
    // A buyer walking up stops at the store's selling line, so a trade above it finds the shelf at its colonists'
    // reserve (5): its sell-out floor, 95 / 1.25 = 76, is under the pull's 78.
    const { mid, normal } = tradeInShortage(95, 5);
    expect(2 * normal, 'the premise: the band alone posts under 78').toBeLessThan(78);
    expect(mid).toBe(78);
  });

  it('price B-AC-9: a trade at the store’s selling line (75) pulls nothing: the shortage band alone, 2N', () => {
    const { mid, normal } = tradeInShortage(75, 6);
    expect(mid).toBe(2 * normal);
  });

  it("price B-AC-9: a trade over this month's normal line but not over last month's selling line (46) pulls nothing", () => {
    const state = game();
    to(state, 'production');
    farms(state, [5, 5]);
    hold(state, 6, 0, 7, 7);
    expect(post(state), 'the premise: tight').toBe(38);
    expect(state.auction!.storeSell, "the premise: last month's selling line").toBe(46);
    walkFood(state, 'p1');
    // 45: over what a normal mid of 38 sells at (44), not over the 46 the store sold at.
    trade(state, 'p2', 'p1', 45);
    nextMonth(state);
    hold(state, 10, 20);
    const mid = post(state);
    expect(state.store.band?.food, 'the premise: normal').toBe('normal');
    expect(mid).toBe(state.store.refPrice.food);
  });
});

describe('price B-AC-1: a sell-out the players bid past lifts the next selling line', () => {
  /**
   * Month 1 normal (mid 30), the store holding one Food over the colonists' reserve, which p2 buys first when `soldOut`;
   * then p1 sells p2 one at `price`, and month 2's Food comes up.
   */
  function bidPast(price: number, { soldOut }: { soldOut: boolean }): GameState & { leftAfterPosting?: GameState['store']['lastWalk'] } {
    const state = game();
    to(state, 'production');
    farms(state, [5, 5]);
    hold(state, 6, 16, 8);
    state.players[2]!.money = 10_000;
    expect(post(state), 'the premise: normal').toBe(30);
    walkFood(state, 'p1');
    if (soldOut) trade(state, 'p2', 'store', state.auction!.storeSell);
    expect(storeSellLine(state) === null, 'the premise: the store has none for sale').toBe(soldOut);
    trade(state, 'p2', 'p1', price);
    nextMonth(state);
    hold(state, 10, 20);
    expect(state.store.lastWalk?.food?.soldOutHigh, 'the premise: the lesson waits for the posting').toBe(soldOut ? price : null);
    // The same posting on a copy, before Food comes up and starts a fresh lesson of its own.
    const posting = cloneForSim(state);
    postPrices(posting);
    post(state);
    expect(state.auction!.good, 'the premise: Food is up').toBe('food');
    return Object.assign(state, { leftAfterPosting: posting.store.lastWalk });
  }

  it('price B-AC-1: sold out and bid to 90, the next Food sell line is at least 90, and the lesson moves that posting only', () => {
    const state = bidPast(90, { soldOut: true });
    expect(storeSellLine(state)).toBeGreaterThanOrEqual(90);
    // The posting read last month's lesson and dropped it, so it lifts that posting only.
    expect(state.leftAfterPosting).toEqual({});
  });

  it('price B-AC-1: a 90 trade while the store still had Food sets no floor', () => {
    expect(storeSellLine(bidPast(90, { soldOut: false }))).toBeLessThan(90);
  });

  it('price B-AC-3: sold out and bid to 1,000, Food is posted at its ceiling, 12 × 30', () => {
    const state = bidPast(1_000, { soldOut: true });
    expect(state.store.posted.food).toBe(360);
    for (const good of GOODS) expect(state.store.posted[good], good).toBeLessThanOrEqual(12 * GOOD_CONFIG[good].refPrice);
  });
});
