import { WALK } from './config.js';
import type { AuctionSide, Deal, Walker, WalkBoard } from './types.js';

/**
 * The walk auction's board, as in the original M.U.L.E.: buyers walk up to
 * raise their bid, sellers walk down to lower their ask. When the highest
 * bid reaches the lowest ask the two trade one unit at a time at the
 * seller's ask, faster with every unit, for as long as they stay matched.
 * Houses stand at lines on the board: one that sells (the store's selling
 * price, which buyers can't walk past), ones that buy (the store, the
 * export ship), and a floor sellers can't walk under (the store's buying
 * price, or a seller's minimum at the land auction).
 *
 * The board knows nothing of goods or plots: a WalkMarket says who holds
 * what, who can pay and where the lines are, and moves each unit. The step
 * is a pure function of the board, the market and the time step.
 */

/** A house's line on the board. Its price may change from one unit to the next (the ship pays less as it fills); null while it doesn't trade. */
export interface HouseLine {
  id: string;
  price(): number | null;
}

export interface WalkMarket {
  /** Units a player could sell. */
  units(playerId: string): number;
  money(playerId: string): number;
  /** The house selling to buyers at its line, in turns. Buyers can't walk above it while it sells. */
  houseSells: HouseLine | null;
  /** Houses buying from sellers at or under their price, in turns. The best payer serves a seller first. */
  houseBuys: HouseLine[];
  /** Sellers can't walk below this. */
  floor(): number | null;
  /** First in line at a house's turns (a Quibbit at the goods auction). */
  first(playerId: string): boolean;
  /** Seat order, the last tie-break. */
  seat(playerId: string): number;
  /** Moves one unit from seller to buyer at this price. Either may be a house. */
  trade(buyer: string, seller: string, price: number): void;
}

export interface Sale {
  buyer: string;
  seller: string;
  price: number;
}

/** Ms until the next unit of a deal that has already moved this many: faster with every unit, down to a floor. */
export function tradeInterval(units: number): number {
  return Math.max(WALK.tradeFloorMs, WALK.tradeStartMs * Math.pow(WALK.tradeSpeedUp, units));
}

const rounded = (w: Walker) => Math.round(w.price);

/** A buyer who can pay their own bid, or a seller with units left: only they stop the other side walking through. */
const activeBuyer = (m: WalkMarket, w: Walker) => w.side === 'buyer' && m.money(w.id) >= Math.max(1, rounded(w));
const activeSeller = (m: WalkMarket, w: Walker) => w.side === 'seller' && m.units(w.id) > 0;

/**
 * Puts a player on a side. Sellers start at the top of the board and buyers
 * at the bottom, beyond anyone on the other side, so taking or switching
 * sides never trades at once. Pass takes them off the board.
 */
export function takeSide(board: WalkBoard, market: WalkMarket, playerId: string, side: AuctionSide): void {
  const w = board.walkers.find((x) => x.id === playerId);
  if (!w) return;
  const others = board.walkers.filter((x) => x.id !== playerId);
  w.side = side;
  w.dir = 0;
  w.since = board.elapsed;
  if (side === 'seller') w.price = Math.max(board.hi, ...others.filter((x) => activeBuyer(market, x)).map((x) => rounded(x) + 1));
  if (side === 'buyer') w.price = Math.max(0, Math.min(board.lo, ...others.filter((x) => activeSeller(market, x)).map((x) => rounded(x) - 1)));
}

/** True while some trade could still happen on this board: someone could sell to someone who could buy. */
export function tradePossible(board: WalkBoard, market: WalkMarket): boolean {
  const sellLine = market.houseSells?.price() ?? null;
  const floor = market.floor() ?? 1;
  const sellers = board.walkers.filter((w) => activeSeller(market, w));
  const buyers = board.walkers.filter((w) => w.side === 'buyer');
  const housesBuy = market.houseBuys.some((h) => h.price() !== null);
  if (sellers.length > 0 && (housesBuy || buyers.some((b) => market.money(b.id) >= floor))) return true;
  return sellLine !== null && buyers.some((b) => market.money(b.id) >= sellLine);
}

/**
 * Advances the board by dt ms: moves the walkers, makes the trades that are
 * due and runs the clock (slower while units change hands). Returns every
 * unit sold in this step; a long step can sell several units of one deal.
 */
export function stepBoard(board: WalkBoard, market: WalkMarket, dt: number): Sale[] {
  board.ticks++;
  board.elapsed += dt;
  const sellLine = market.houseSells?.price() ?? null;
  const floor = market.floor();
  const step = (board.speed * dt) / 1000;

  // Walk. Buyers first, then sellers; nobody walks through an active walker of the other side: they meet.
  const minAsk = () => Math.min(Infinity, ...board.walkers.filter((w) => activeSeller(market, w)).map((w) => w.price));
  const maxBid = () => Math.max(-Infinity, ...board.walkers.filter((w) => activeBuyer(market, w)).map((w) => w.price));
  for (const w of board.walkers) {
    if (w.side !== 'buyer' || w.dir === 0) continue;
    const before = rounded(w);
    if (w.dir > 0) w.price = Math.max(w.price, Math.min(w.price + step, sellLine ?? Infinity, minAsk()));
    else w.price = Math.max(0, w.price - step);
    if (rounded(w) !== before) w.since = board.elapsed;
  }
  for (const w of board.walkers) {
    if (w.side !== 'seller' || w.dir === 0) continue;
    const before = rounded(w);
    if (w.dir < 0) w.price = Math.min(w.price, Math.max(w.price - step, floor ?? 1, maxBid(), 1));
    else w.price += step;
    if (rounded(w) !== before) w.since = board.elapsed;
  }

  // Who trades with whom. The best pair of players first: the highest bid
  // that reaches the lowest ask, at the seller's ask.
  const order = (x: Walker, y: Walker) => x.since - y.since || market.seat(x.id) - market.seat(y.id);
  const sellers = board.walkers.filter((w) => activeSeller(market, w)).sort((x, y) => rounded(x) - rounded(y) || order(x, y));
  const buyers = board.walkers.filter((w) => w.side === 'buyer').sort((x, y) => rounded(y) - rounded(x) || order(x, y));
  const wanted: (Omit<Deal, 'units' | 'progress'> & { queue: Walker[] })[] = [];
  const busy = new Set<string>();
  const bestSeller = sellers[0];
  if (bestSeller) {
    const ask = rounded(bestSeller);
    const buyer = buyers.find((b) => rounded(b) >= ask && market.money(b.id) >= ask);
    if (buyer) {
      wanted.push({ buyer: buyer.id, seller: bestSeller.id, price: ask, queue: [] });
      busy.add(buyer.id).add(bestSeller.id);
    }
  }
  // Houses hand units out in turns: one per player per round, whoever is first in line first, then whoever got there first.
  const nextInTurn = (house: string, list: Walker[]) =>
    [...list].sort(
      (x, y) =>
        (board.turns[`${house}:${x.id}`] ?? 0) - (board.turns[`${house}:${y.id}`] ?? 0) ||
        Number(market.first(y.id)) - Number(market.first(x.id)) ||
        order(x, y),
    )[0];
  const seller = market.houseSells;
  if (seller && sellLine !== null) {
    const atLine = buyers.filter((b) => !busy.has(b.id) && rounded(b) >= sellLine && market.money(b.id) >= sellLine);
    const next = nextInTurn(seller.id, atLine);
    if (next) wanted.push({ buyer: next.id, seller: seller.id, price: sellLine, queue: atLine });
  }
  // A seller standing at or under several houses' prices sells to the one that pays most.
  const paying = market.houseBuys.map((h) => ({ h, price: h.price() })).filter((x): x is { h: HouseLine; price: number } => x.price !== null);
  const houseOf = (w: Walker) => paying.filter((x) => rounded(w) <= x.price).sort((x, y) => y.price - x.price)[0]?.h.id ?? null;
  for (const { h, price } of paying) {
    const atLine = sellers.filter((s) => !busy.has(s.id) && houseOf(s) === h.id);
    const next = nextInTurn(h.id, atLine);
    if (next) wanted.push({ buyer: h.id, seller: next.id, price, queue: atLine });
  }

  // A deal that carries on keeps its progress and its speed; one that broke off starts again from the beginning.
  const houses = new Set([...(seller ? [seller.id] : []), ...market.houseBuys.map((h) => h.id)]);
  const key = (d: Pick<Deal, 'buyer' | 'seller'>) => (houses.has(d.buyer) ? `${d.buyer}<` : houses.has(d.seller) ? `${d.seller}>` : `${d.buyer}<${d.seller}`);
  const old = new Map(board.deals.map((d) => [key(d), d]));
  const queues = new Map<Deal, Walker[]>();
  board.deals = wanted.map(({ queue, ...d }) => {
    const prev = old.get(key(d));
    const deal = { ...d, units: prev?.units ?? 0, progress: prev?.progress ?? 0 };
    queues.set(deal, queue);
    return deal;
  });

  // Who takes the next unit of a deal, and at what price, or null when it can't go on.
  const nextUnit = (d: Deal): Sale | null => {
    if (!houses.has(d.buyer) && !houses.has(d.seller)) return market.money(d.buyer) >= d.price && market.units(d.seller) > 0 ? { buyer: d.buyer, seller: d.seller, price: d.price } : null;
    if (seller && d.seller === seller.id) {
      const price = seller.price();
      if (price === null) return null;
      const next = nextInTurn(d.seller, queues.get(d)!.filter((b) => market.money(b.id) >= price));
      return next ? { buyer: next.id, seller: d.seller, price } : null;
    }
    const price = market.houseBuys.find((h) => h.id === d.buyer)?.price() ?? null;
    if (price === null) return null;
    const next = nextInTurn(d.buyer, queues.get(d)!.filter((s) => market.units(s.id) > 0 && rounded(s) <= price));
    return next ? { buyer: d.buyer, seller: next.id, price } : null;
  };

  const sales: Sale[] = [];
  for (const d of board.deals) {
    d.progress += dt;
    for (let due = tradeInterval(d.units); d.progress >= due; due = tradeInterval(d.units)) {
      const unit = nextUnit(d);
      if (!unit) {
        d.progress = due;
        break;
      }
      d.progress -= due;
      Object.assign(d, unit);
      market.trade(unit.buyer, unit.seller, unit.price);
      if (!houses.has(unit.buyer) && !houses.has(unit.seller)) {
        board.between.units++;
        board.between.value += unit.price;
      } else {
        const turn = houses.has(unit.buyer) ? `${unit.buyer}:${unit.seller}` : `${unit.seller}:${unit.buyer}`;
        board.turns[turn] = (board.turns[turn] ?? 0) + 1;
      }
      d.units++;
      board.units++;
      sales.push({ ...unit });
    }
  }

  // The clock runs slower while units change hands, as in the original.
  board.clockMs -= dt * (board.deals.length > 0 ? WALK.tradeClockRate : 1);
  return sales;
}
