import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  createGame,
  createRng,
  GOOD_CONFIG,
  monthNeeds,
  needsOf,
  shownSellLine,
  startAuction,
  stepAuction,
  STORE_ID,
  WALK,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
  type GoodPlay,
  type Trade,
} from '@mule/engine';
import type { AiAction } from '../src/actions.js';
import { AuctionHand } from '../src/hands/auction.js';
import { applyAction } from '../src/play.js';
import { draftGoodPlaybook } from '../src/playbook/draft.js';
import { AiSeat } from '../src/seat.js';

/**
 * RULE-7's AI bullet: with the store sold out, a buyer short of the good walks up past the store's old selling line
 * toward its own price limit, and a seller resting above that line walks down onto the highest bid once that bid is at
 * or over its reservation price. Month 1's Food auction with the store holding none to sell and buying none (so its
 * shelf never refills mid-walk), played through the engine: ai0 (the trader) holds a surplus of Food, ai1 holds none and
 * has money. Each seat's limit is set through its own draft's walkAway, the playbook's bound on today's limit.
 */

const SEATS: { persona: AiPersonaId; level: AiLevelId }[] = [
  { persona: 'trader', level: 'trader' },
  { persona: 'cautious', level: 'tycoon' },
  { persona: 'aggressive', level: 'rookie' },
  { persona: 'saboteur', level: 'tycoon' },
];
const SEED = 1;
const SELLER = 'ai0';
const BUYER = 'ai1';
const seatsFor = () => SEATS.map((s, i) => new AiSeat({ id: `ai${i}`, name: `AI ${i + 1}`, ...s, seed: SEED * 10 + i }));

/** Upkeep eats the household's Food, half of the rest spoils, and next development is hungry under the household's Food. */
const wholeFood = (state: GameState, id: string) => needsOf(state, id).food + Math.ceil(needsOf(state, id).food / (1 - GOOD_CONFIG.food.spoilage));

/** The Food status screen with the store sold out: ai0 holds 10 over what keeps it whole, ai1 none and 3,000 cr. */
function soldOutFood(): GameState {
  const state = createGame({ seed: SEED, players: SEATS.map((_, i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'auction') advancePhase(state);
  state.store.stock.food = 0;
  for (const p of state.players) p.stock.food = Math.max(monthNeeds(state, p.id).food, wholeFood(state, p.id));
  const seller = state.players.find((p) => p.id === SELLER)!;
  seller.stock.food = wholeFood(state, SELLER) + 10;
  seller.money = 3_000;
  const buyer = state.players.find((p) => p.id === BUYER)!;
  buyer.stock.food = 0;
  buyer.money = 3_000;
  startAuction(state, ['food']);
  return state;
}

/** A seat's playbook hand on its own Food draft with `edit` applied, its rng seeded as AiSeat seeds its auction hand. */
function handOf(seat: AiSeat, state: GameState, edit: Partial<GoodPlay>): AuctionHand {
  const own = draftGoodPlaybook({ state, seat: seat.id, mind: seat.mind, seed: seat.options.seed }, 'food').auction!.food!;
  const part: GoodPlay = { ...own, bluff: false, ...edit };
  return new AuctionHand(seat.brain, createRng((seat.options.seed ^ 0x85ebca6b) >>> 0), () => structuredClone(part)); // literal-ok: AiSeat's salt for the auction hand's rng
}

interface Walk {
  trades: Trade[];
  /** The highest price ai1 stood at in the walk. */
  buyerTop: number;
  /** The lowest price ai0 stood at in the walk. */
  sellerBottom: number;
  /** The highest the store's line showed as a bid. */
  lineTop: number | null;
}

/**
 * Plays the Food good to its close. `hands` gives a seat its playbook hand; a seat in `rest` is placed at that price once
 * the walk opens and never moves; every other seat plays today's hand.
 */
function play(state: GameState, hands: Record<string, Partial<GoodPlay>>, rest: Record<string, { side: 'buyer' | 'seller'; price: number }> = {}): Walk {
  const seats = seatsFor();
  const mine = new Map(Object.entries(hands).map(([id, edit]) => [id, handOf(seats.find((s) => s.id === id)!, state, edit)]));
  const walk: Walk = { trades: [], buyerTop: -Infinity, sellerBottom: Infinity, lineTop: null };
  let placed = false;
  for (let tick = 0; tick < 2_000; tick++) {
    const a = state.auction!;
    if (a.good !== 'food' || a.stage === 'close' || a.stage === 'over') break;
    if (a.stage === 'walk' && !placed) {
      placed = true;
      a.storeBudget = 0;
      for (const w of a.walkers) if (rest[w.id]) Object.assign(w, { ...rest[w.id], dir: 0 });
    }
    for (const s of seats) {
      const act = (x: AiAction) => applyAction(state, s.id, x);
      if (a.stage === 'walk' && rest[s.id]) continue;
      if (a.stage === 'status' && rest[s.id]) {
        if (rest[s.id]!.side === 'seller') act({ type: 'declare', side: 'seller' });
        act({ type: 'done', done: true });
        continue;
      }
      const hand = mine.get(s.id);
      if (hand) hand.tick(state, WALK.tickMs, act);
      else s.auctionTick(state, WALK.tickMs, act);
    }
    walk.trades.push(...stepAuction(state, WALK.tickMs));
    const b = state.auction!;
    if (b.stage !== 'walk') continue;
    walk.buyerTop = Math.max(walk.buyerTop, Math.round(b.walkers.find((w) => w.id === BUYER)!.price));
    walk.sellerBottom = Math.min(walk.sellerBottom, Math.round(b.walkers.find((w) => w.id === SELLER)!.price));
    const line = shownSellLine(state);
    if (line?.bid) walk.lineTop = Math.max(walk.lineTop ?? -Infinity, line.price);
  }
  return walk;
}

const between = (walk: Walk) => walk.trades.filter((t) => t.seller === SELLER && t.buyer === BUYER);

describe('RULE-7 AI: with the store sold out, an AI buyer bids a seller out and an AI seller is convinced by a good enough bid', () => {
  it('RULE-7 AI: a buyer short of sold-out Food walks up past the old line to its own limit, or one step under a seller resting below that limit, and its bid is the line', () => {
    const state = soldOutFood();
    const { sellersBottom: S, hi } = state.auction!.zones;
    expect(S + 6, 'the premise: room above the old line').toBeLessThan(hi);
    expect(state.store.stock.food, 'the premise: the store has no Food to sell').toBe(0);

    // [the buyer's limit, where the seller rests, the top it walks to]
    const rows: [number, number, number][] = [
      [S + 3, hi, S + 3],
      [hi + 50, S + 5, S + 4],
    ];
    for (const [limit, ask, top] of rows) {
      const walk = play(soldOutFood(), { [BUYER]: { role: 'buyer', walkAway: limit, start: limit } }, { [SELLER]: { side: 'seller', price: ask } });
      const at = `limit ${limit}, seller resting at ${ask}`;
      expect(walk.buyerTop, at).toBe(top);
      expect(walk.lineTop, `${at}: the store's line shows its bid`).toBe(top);
      expect(between(walk), `${at}: walking up never trades with the resting seller`).toEqual([]);
    }
  });

  it('RULE-7 AI: a seller resting above the old line walks down onto the highest bid at or over its reservation price, and stays put for one under it', () => {
    const state = soldOutFood();
    const { sellersBottom: S, hi } = state.auction!.zones;
    const reservation = S + 4;

    // [the bid it sees, whether it sells to that buyer]
    const rows: [number, boolean][] = [
      [reservation + 2, true],
      [reservation, true],
      [reservation - 1, false],
    ];
    for (const [bid, sells] of rows) {
      const walk = play(soldOutFood(), { [SELLER]: { role: 'seller', walkAway: reservation, start: reservation } }, { [BUYER]: { side: 'buyer', price: bid } });
      const at = `reservation ${reservation}, bid ${bid}`;
      const sales = between(walk);
      if (sells) {
        expect(sales.length, at).toBeGreaterThan(0);
        expect(sales.every((t) => t.price === bid), `${at}: at the bid`).toBe(true);
      } else {
        expect(sales, at).toEqual([]);
        expect(walk.sellerBottom, `${at}: it never walks down onto the bid`).toBeGreaterThan(bid);
      }
      expect(walk.trades.filter((t) => t.buyer === STORE_ID || t.seller === STORE_ID), `${at}: the store trades nothing`).toEqual([]);
    }
  });

  it('RULE-7 AI: played hand against hand, a buyer whose limit reaches the seller\'s reservation buys from it between the two, and one whose limit falls short buys nothing', () => {
    const state = soldOutFood();
    const { sellersBottom: S, hi } = state.auction!.zones;
    const reservation = S + 4;

    for (const limit of [reservation, reservation + 3]) {
      const walk = play(soldOutFood(), {
        [SELLER]: { role: 'seller', walkAway: reservation, start: reservation },
        [BUYER]: { role: 'buyer', walkAway: limit, start: limit },
      });
      const sales = between(walk);
      expect(sales.length, `limit ${limit}: the buyer bids the seller out`).toBeGreaterThan(0);
      for (const t of sales) {
        expect(t.price, `limit ${limit}`).toBeGreaterThanOrEqual(reservation);
        expect(t.price, `limit ${limit}`).toBeLessThanOrEqual(limit);
      }
    }
    const short = play(soldOutFood(), {
      [SELLER]: { role: 'seller', walkAway: reservation, start: reservation },
      [BUYER]: { role: 'buyer', walkAway: reservation - 1, start: reservation - 1 },
    });
    expect(between(short), 'a limit under the reservation buys nothing').toEqual([]);
  });
});
