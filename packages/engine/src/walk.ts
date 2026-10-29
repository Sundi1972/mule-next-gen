import { WALK } from './config.js';
import { RuleError } from './errors.js';
import type { AuctionSide, Deal, LineOrder, Walker, WalkBoard } from './types.js';
import { MS_PER_SECOND } from './units.js';

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
 * At a house's line nothing trades until the player chooses how many
 * (chooseAtLine); the house then trades exactly that many and stops, and
 * touching Up or Down stops it at once (A-6, the UX audit's G-1). Players
 * still trade with each other for as long as they stay matched.
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

/** The lowest ask a buyer walking up meets, and the highest bid a seller walking down meets. */
const minAsk = (board: WalkBoard, m: WalkMarket) => Math.min(Infinity, ...board.walkers.filter((w) => activeSeller(m, w)).map((w) => w.price));
const maxBid = (board: WalkBoard, m: WalkMarket) => Math.max(-Infinity, ...board.walkers.filter((w) => activeBuyer(m, w)).map((w) => w.price));

/** Units of a house's turns the walker still wants: their choice at its line, while it runs. */
const wants = (w: Walker, house: string) => (w.order?.house === house ? w.order.units - w.order.traded : 0);

/**
 * The house line a walker stands at, if any: a buyer at or over the house's selling line, a seller at or under a
 * buying house's price (the one that pays most, as stepBoard serves them).
 */
export function houseLineAt(market: WalkMarket, w: Walker): { house: string; price: number } | null {
  if (w.side === 'buyer') {
    const price = market.houseSells?.price() ?? null;
    return market.houseSells && price !== null && rounded(w) >= price ? { house: market.houseSells.id, price } : null;
  }
  if (w.side !== 'seller') return null;
  const paying = market.houseBuys.map((h) => ({ house: h.id, price: h.price() })).filter((x): x is { house: string; price: number } => x.price !== null);
  return paying.filter((x) => rounded(w) <= x.price).sort((x, y) => y.price - x.price)[0] ?? null;
}

/**
 * At a house's line: trade this many units with it, then stop. More than the player can pay for or holds is clamped
 * to that; a house that runs out first just stops. The walker stands still while the units move.
 */
export function chooseAtLine(board: WalkBoard, market: WalkMarket, playerId: string, units: number): LineOrder {
  if (!Number.isInteger(units) || units < 1) throw new RuleError('Choose at least one unit');
  const w = board.walkers.find((x) => x.id === playerId);
  if (!w || w.side === 'pass') throw new RuleError('You passed on this good');
  const line = houseLineAt(market, w);
  if (!line) throw new RuleError('Walk to the store’s line first');
  const most = w.side === 'buyer' ? Math.floor(market.money(w.id) / line.price) : market.units(w.id);
  if (most < 1) throw new RuleError(w.side === 'buyer' ? 'You can’t pay for one' : 'You have none to sell');
  w.dir = 0;
  w.order = { house: line.house, units: Math.min(units, most), traded: 0, cr: 0 };
  return w.order;
}

/** Touching Up or Down stops a choice's units at once; a finished choice stays to be read until the walker moves off the line. */
export function stopAtLine(w: Walker): void {
  if (w.order) w.order.units = w.order.traded;
}

/**
 * One tap (G-2): one price step up or down from the walker's rounded price, within the same limits as walking (the
 * house lines, meeting the other side), and standing still after. It stops a choice's units like a press does.
 */
export function stepWalker(board: WalkBoard, market: WalkMarket, playerId: string, dir: -1 | 1): void {
  const w = board.walkers.find((x) => x.id === playerId);
  if (!w || w.side === 'pass') throw new RuleError('You passed on this good');
  stopAtLine(w);
  w.dir = 0;
  const before = rounded(w);
  const to = before + dir;
  if (w.side === 'buyer') {
    const sellLine = market.houseSells?.price() ?? null;
    w.price = dir > 0 ? Math.max(w.price, Math.min(to, sellLine ?? Infinity, minAsk(board, market))) : Math.max(0, to);
  } else {
    w.price = dir < 0 ? Math.min(w.price, Math.max(to, market.floor() ?? 1, maxBid(board, market), 1)) : to;
  }
  if (rounded(w) !== before) w.since = board.elapsed;
}

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
  delete w.order;
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
  const step = (board.speed * dt) / MS_PER_SECOND;

  // Walk. Buyers first, then sellers; nobody walks through an active walker of the other side: they meet.
  for (const w of board.walkers) {
    if (w.side !== 'buyer' || w.dir === 0) continue;
    const before = rounded(w);
    if (w.dir > 0) w.price = Math.max(w.price, Math.min(w.price + step, sellLine ?? Infinity, minAsk(board, market)));
    else w.price = Math.max(0, w.price - step);
    if (rounded(w) !== before) w.since = board.elapsed;
  }
  for (const w of board.walkers) {
    if (w.side !== 'seller' || w.dir === 0) continue;
    const before = rounded(w);
    if (w.dir < 0) w.price = Math.min(w.price, Math.max(w.price - step, floor ?? 1, maxBid(board, market), 1));
    else w.price += step;
    if (rounded(w) !== before) w.since = board.elapsed;
  }
  // A seller whose choice is still running stands on the line as it moves: the ship pays a little less for each
  // further unit. Never under the floor; there the store pays more, and the choice ends below.
  for (const w of board.walkers) {
    if (w.side !== 'seller' || !w.order || wants(w, w.order.house) <= 0) continue;
    const price = market.houseBuys.find((h) => h.id === w.order!.house)?.price() ?? null;
    if (price !== null && rounded(w) > price) w.price = Math.max(price, floor ?? 1);
  }
  // A choice made at a line goes once the walker is off it, or the line itself has gone.
  for (const w of board.walkers) if (w.order && houseLineAt(market, w)?.house !== w.order.house) delete w.order;

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
  // Houses hand units out in turns: one per player per round, whoever is first in line first, then whoever got there
  // first; and only to a player who chose how many at its line, until that many have moved.
  const nextInTurn = (house: string, list: Walker[]) =>
    [...list].sort(
      (x, y) =>
        (board.turns[`${house}:${x.id}`] ?? 0) - (board.turns[`${house}:${y.id}`] ?? 0) ||
        Number(market.first(y.id)) - Number(market.first(x.id)) ||
        order(x, y),
    )[0];
  const seller = market.houseSells;
  if (seller && sellLine !== null) {
    const atLine = buyers.filter((b) => !busy.has(b.id) && rounded(b) >= sellLine && market.money(b.id) >= sellLine && wants(b, seller.id) > 0);
    const next = nextInTurn(seller.id, atLine);
    if (next) wanted.push({ buyer: next.id, seller: seller.id, price: sellLine, queue: atLine });
  }
  // A seller standing at or under several houses' prices sells to the one that pays most.
  const paying = market.houseBuys.map((h) => ({ h, price: h.price() })).filter((x): x is { h: HouseLine; price: number } => x.price !== null);
  const houseOf = (w: Walker) => paying.filter((x) => rounded(w) <= x.price).sort((x, y) => y.price - x.price)[0]?.h.id ?? null;
  for (const { h, price } of paying) {
    const atLine = sellers.filter((s) => !busy.has(s.id) && houseOf(s) === h.id && wants(s, h.id) > 0);
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
      const next = nextInTurn(d.seller, queues.get(d)!.filter((b) => market.money(b.id) >= price && wants(b, d.seller) > 0));
      return next ? { buyer: next.id, seller: d.seller, price } : null;
    }
    const price = market.houseBuys.find((h) => h.id === d.buyer)?.price() ?? null;
    if (price === null) return null;
    const next = nextInTurn(d.buyer, queues.get(d)!.filter((s) => market.units(s.id) > 0 && rounded(s) <= price && wants(s, d.buyer) > 0));
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
      const player = houses.has(unit.buyer) ? unit.seller : houses.has(unit.seller) ? unit.buyer : null;
      const purse = player === null ? 0 : market.money(player);
      market.trade(unit.buyer, unit.seller, unit.price);
      if (!houses.has(unit.buyer) && !houses.has(unit.seller)) {
        board.between.units++;
        board.between.value += unit.price;
      } else {
        const turn = houses.has(unit.buyer) ? `${unit.buyer}:${unit.seller}` : `${unit.seller}:${unit.buyer}`;
        board.turns[turn] = (board.turns[turn] ?? 0) + 1;
        const order = board.walkers.find((w) => w.id === player)?.order;
        if (order) {
          order.traded++;
          // What the units cost, or brought in after the sales tax: the change in the player's money.
          order.cr += Math.abs(market.money(player!) - purse);
        }
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
