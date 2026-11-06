import { afterEach, describe, expect, it } from 'vitest';
import {
  advancePhase,
  AI_VALUE,
  auctionNeed,
  createGame,
  GOOD_CONFIG,
  startAuction,
  stepAuction,
  UPKEEP,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
  type Good,
  type Outfit,
  type Trade,
} from '@mule/engine';
import { applyAction } from '../src/play.js';
import { AiSeat, type AiSeatOptions } from '../src/seat.js';

/**
 * PM ruling, 6 Nov: an AI never sells Food, Energy or Water into its own next-month shortage, so its sell floor is the
 * status screen's need (auctionNeed), not monthNeeds. Each row plays month 1's auction of the good through the engine
 * with every seat's own hands, the store buying at three times the good's reference price (so every unit the seat
 * values under that is for sale), and reads what the seat sold. Water counts only for a seat with a farm to water.
 */

const SEATS: { persona: AiPersonaId; level: AiLevelId }[] = [
  { persona: 'trader', level: 'trader' },
  { persona: 'cautious', level: 'tycoon' },
  { persona: 'aggressive', level: 'rookie' },
  { persona: 'saboteur', level: 'tycoon' },
];
const SEED = 1;
const MONEY = 3_000;
/** The store buys at this many times the good's reference price, for up to STORE_UNITS units: a strong pull to sell. */
const STORE_TIMES = 3;
const STORE_UNITS = 20;
const ROWS = SEATS.map((s, k) => [`ai${k}`, `${s.persona}/${s.level}`] as const);

/** The seat's plots, by good: Food with Energy plots (a unit is worth only the walking it keeps), the others with farms. */
const PLOTS: Record<'food' | 'energy' | 'water', Outfit[]> = {
  food: ['energy', 'energy', 'energy'],
  energy: ['food', 'food', 'food'],
  water: ['food', 'food', 'food'],
};
const NO_FARM: Outfit[] = Array<Outfit>(7).fill('energy');

const seatOf = (k: number, extra: Partial<AiSeatOptions>) => new AiSeat({ id: `ai${k}`, name: `AI ${k + 1}`, ...SEATS[k]!, seed: SEED * 10 + k, ...extra });

/**
 * Month 1's auction of `good`, the status screen up. Seat `id` has `plots` and holds `held(state)` of the good (its
 * other goods plenty); every other seat holds its own auctionNeed. The store sells none past the colonists' month and
 * buys at STORE_TIMES the reference price.
 */
function auctionOf(good: Good, id: string, plots: Outfit[], held: (s: GameState) => number): GameState {
  const state = createGame({ seed: SEED, players: SEATS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'auction') advancePhase(state);
  state.store.stock[good] = good === 'food' || good === 'water' ? Math.ceil(state.colonists / UPKEEP.colonistsPerUnit) : 0;
  const free = state.tiles.filter((x) => x.terrain === 'plains' && !x.owner);
  plots.forEach((outfit, i) => Object.assign(free[i]!, { owner: id, outfit }));
  for (const p of state.players) {
    for (const g of ['food', 'energy', 'water'] as const) p.stock[g] = 2 * (auctionNeed(state, p.id)[g] + 2);
    p.stock[good] = auctionNeed(state, p.id)[good];
  }
  const me = state.players.find((p) => p.id === id)!;
  me.stock[good] = held(state);
  me.money = MONEY;
  startAuction(state, [good]);
  expect(state.auction!.good, 'the premise: the good comes up').toBe(good);
  const buy = Math.round(GOOD_CONFIG[good].refPrice * STORE_TIMES);
  Object.assign(state.auction!, { storeBuy: buy, storeSell: Math.max(state.auction!.storeSell, buy + 1), storeBudget: STORE_UNITS });
  return state;
}

/** Plays the good that is up to its close with every seat's own hands; returns the trades. */
function play(state: GameState, extra: Partial<AiSeatOptions>): Trade[] {
  const good = state.auction!.good;
  const seats = SEATS.map((_, k) => seatOf(k, extra));
  const trades: Trade[] = [];
  for (let tick = 0; tick < 20_000; tick++) {
    const a = state.auction!;
    if (a.good !== good || a.stage === 'close' || a.stage === 'over') break;
    for (const s of seats) s.auctionTick(state, WALK.tickMs, (x) => applyAction(state, s.id, x));
    trades.push(...stepAuction(state, WALK.tickMs));
  }
  return trades;
}

const soldBy = (trades: Trade[], id: string) => trades.filter((t) => t.seller === id).reduce((n, t) => n + t.quantity, 0);

/** Seat `id` holding its auctionNeed of `good` and `extra` more: it sells at most `extra` and keeps its auctionNeed. */
function keepsHold(good: 'food' | 'energy' | 'water', id: string, extra: number, path: Partial<AiSeatOptions> = {}): { sold: number; need: number } {
  const state = auctionOf(good, id, PLOTS[good], (s) => auctionNeed(s, id)[good] + extra);
  const need = auctionNeed(state, id)[good];
  expect(need, 'the premise: it needs some').toBeGreaterThan(0);

  const trades = play(state, path);

  const sold = soldBy(trades, id);
  expect(sold, `it sold ${sold} of the ${extra} over its hold of ${need}`).toBeLessThanOrEqual(extra);
  expect(state.players.find((p) => p.id === id)!.stock[good], `it keeps its hold of ${need}`).toBeGreaterThanOrEqual(need);
  return { sold, need };
}

const GOODS_UP = ['food', 'energy', 'water'] as const;

describe('SF: an AI never sells Food, Energy or Water into its own next-month shortage (PM ruling, 6 Nov)', () => {
  for (const good of GOODS_UP) {
    it.each(ROWS)(`SF-1: %s (%s) holding exactly its ${good} hold (auctionNeed${good === 'water' ? ', with a farm' : ''}) sells none, the store buying at ${STORE_TIMES}x reference`, (id) => {
      const { sold } = keepsHold(good, id, 0);
      expect(sold).toBe(0);
    });

    it.each(ROWS)(`SF-2: %s (%s) holding its ${good} hold and 3 more sells at most the 3`, (id) => {
      keepsHold(good, id, 3);
    });
  }

  it('SF-3: the trader with no farm to water stays free to sell its Water below auctionNeed: going short costs it nothing', () => {
    const id = 'ai0';
    const state = auctionOf('water', id, NO_FARM, (s) => auctionNeed(s, id).water);
    const need = auctionNeed(state, id).water;
    expect(need, 'the premise: the screen shows a Water need (what upkeep drinks)').toBeGreaterThan(0);

    const trades = play(state, {});

    expect(soldBy(trades, id), 'it sold Water it holds under the screen need').toBeGreaterThan(0);
    expect(state.players.find((p) => p.id === id)!.stock.water).toBeLessThan(need);
  });
});

describe('SF: the floor holds on the playbook path (own draft plays the auction)', () => {
  for (const good of GOODS_UP) {
    it(`SF-4: the trader on its own playbook path holding exactly its ${good} hold sells none`, () => {
      const { sold } = keepsHold(good, 'ai0', 0, { playbook: true, ownPhases: true });
      expect(sold).toBe(0);
    });
  }
});

describe('SF: the floor holds on the unit-model path (AI_VALUE.unit)', () => {
  const unit = AI_VALUE.unit;
  afterEach(() => {
    AI_VALUE.unit = unit;
  });

  for (const good of GOODS_UP) {
    it.each(ROWS)(`SF-5: %s (%s) with the unit model on, holding exactly its ${good} hold, sells none`, (id) => {
      AI_VALUE.unit = true;
      const { sold } = keepsHold(good, id, 0);
      expect(sold).toBe(0);
    });
  }
});
