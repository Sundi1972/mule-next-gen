import { driftReference, shipInPort, shipPrice, storeForSale, storeQuotes, storeWants, taxSale } from './economy.js';
import type { GameState, Good } from './types.js';

/**
 * The store hands out units in turns: one to each waiting player, round by
 * round, until it runs out or everyone has what they asked for. `wants` are
 * in turn order; returns how many each gets. 8 units for wants of 4, 3, 3
 * gives 3, 3, 2.
 */
export function takeTurns(capacity: number, wants: number[]): number[] {
  const got = wants.map(() => 0);
  let left = Math.max(0, Math.floor(capacity));
  while (left > 0) {
    let handed = 0;
    for (let i = 0; i < wants.length && left > 0; i++) {
      if (got[i]! < wants[i]!) {
        got[i]!++;
        left--;
        handed++;
      }
    }
    if (handed === 0) break;
  }
  return got;
}

export interface Order {
  playerId: string;
  side: 'buy' | 'sell';
  quantity: number;
  /** Highest price a buyer pays, or lowest price a seller accepts, per unit. */
  limit: number;
  /** When the player reached their price (any increasing clock). Earlier goes first in the store's turns. */
  at?: number;
}

export interface Trade {
  good: Good;
  buyer: string;
  seller: string;
  quantity: number;
  price: number;
}

export const STORE_ID = 'store';
export const SHIP_ID = 'ship';

/**
 * Settles one good's auction. Players are matched with each other first (best
 * buyer with best seller, at the midpoint of their limits), as in the
 * original's walk-to-the-price auction. Then the export ship, when it is in
 * port and wants the good, buys from the sellers left, and the colony store
 * trades the rest at its posted prices, if it has stock or money. Every sale
 * a player makes pays the sales tax into the colony fund.
 */
export function runAuction(state: GameState, good: Good, orders: Order[]): Trade[] {
  const players = new Map(state.players.map((p) => [p.id, p]));
  const quotes = storeQuotes(state, good);
  const trades: Trade[] = [];

  // Clamp orders to what each player can actually deliver.
  const buys = orders
    .filter((o) => o.side === 'buy' && o.quantity > 0)
    .map((o) => ({ ...o }))
    .sort((a, b) => b.limit - a.limit);
  const sells = orders
    .filter((o) => o.side === 'sell' && o.quantity > 0)
    .map((o) => ({ ...o, quantity: Math.min(o.quantity, players.get(o.playerId)?.stock[good] ?? 0) }))
    .sort((a, b) => a.limit - b.limit);

  const settle = (buyer: string, seller: string, quantity: number, price: number) => {
    const b = players.get(buyer) ?? null;
    const s = players.get(seller) ?? null;
    let n = quantity;
    if (b) n = Math.min(n, Math.floor(b.money / price));
    else if (buyer === STORE_ID) n = Math.min(n, Math.floor(state.store.capital / price));
    n = Math.min(n, s ? s.stock[good] : state.store.stock[good]);
    if (n <= 0) return 0;
    const total = n * price;
    if (b) { b.money -= total; b.stock[good] += n; }
    else if (buyer === STORE_ID) { state.store.capital -= total; state.store.stock[good] += n; }
    if (s) { s.money += taxSale(state, s.id, total); s.stock[good] -= n; }
    else { state.store.capital += total; state.store.stock[good] -= n; }
    trades.push({ good, buyer, seller, quantity: n, price });
    return n;
  };

  // Player to player.
  let bi = 0;
  let si = 0;
  while (bi < buys.length && si < sells.length) {
    const buy = buys[bi]!;
    const sell = sells[si]!;
    if (buy.limit < sell.limit) break;
    if (buy.playerId === sell.playerId) { si++; continue; }
    const price = Math.round((buy.limit + sell.limit) / 2);
    const done = settle(buy.playerId, sell.playerId, Math.min(buy.quantity, sell.quantity), price);
    if (done === 0) {
      // The buyer ran out of money or the seller out of stock.
      if ((players.get(buy.playerId)?.money ?? 0) < price) bi++;
      else si++;
      continue;
    }
    buy.quantity -= done;
    sell.quantity -= done;
    if (buy.quantity === 0) bi++;
    if (sell.quantity === 0) si++;
  }

  // Leftovers against the store and the ship, in turns. A Quibbit is always
  // first in line; otherwise whoever reached the price first goes first.
  const turnOrder = <T extends Order>(list: T[]) =>
    list
      .map((o, i) => ({ o, i }))
      .sort((a, b) => {
        const q = Number(players.get(b.o.playerId)?.species === 'quibbit') - Number(players.get(a.o.playerId)?.species === 'quibbit');
        return q || (a.o.at ?? Infinity) - (b.o.at ?? Infinity) || a.i - b.i;
      })
      .map(({ o }) => o);

  if (quotes.sell !== null) {
    const sellPrice = quotes.sell;
    const storeBuyers = turnOrder(buys.filter((b) => b.quantity > 0 && b.limit >= sellPrice));
    const wants = storeBuyers.map((b) => Math.min(b.quantity, Math.floor((players.get(b.playerId)?.money ?? 0) / sellPrice)));
    takeTurns(storeForSale(state, good), wants).forEach((n, i) => {
      if (n > 0) settle(storeBuyers[i]!.playerId, STORE_ID, n, sellPrice);
    });
  }

  // The export ship buys one unit per seller per round, paying a little less
  // for every unit as its hold fills, while its price is above their limit.
  if (shipInPort(state)) {
    const shipSellers = turnOrder(sells.filter((o) => o.quantity > 0));
    const sold = new Map<string, { n: number; total: number }>();
    for (let round = true; round; ) {
      round = false;
      for (const o of shipSellers) {
        const price = shipPrice(state, good);
        if (price === null || o.quantity <= 0 || o.limit > price) continue;
        const seller = players.get(o.playerId)!;
        if (seller.stock[good] <= 0) continue;
        seller.stock[good]--;
        o.quantity--;
        state.ship.hold[good] = (state.ship.hold[good] ?? 0) - 1;
        state.ship.bought[good] = (state.ship.bought[good] ?? 0) + 1;
        const entry = sold.get(o.playerId) ?? { n: 0, total: 0 };
        entry.n++;
        entry.total += price;
        sold.set(o.playerId, entry);
        round = true;
      }
    }
    for (const [id, { n, total }] of sold) {
      players.get(id)!.money += taxSale(state, id, total);
      trades.push({ good, buyer: SHIP_ID, seller: id, quantity: n, price: Math.round(total / n) });
    }
  }

  if (quotes.buy !== null) {
    const buyPrice = quotes.buy;
    const storeSellers = turnOrder(sells.filter((o) => o.quantity > 0 && o.limit <= buyPrice));
    const room = Math.min(storeWants(state, good, buyPrice), Math.floor(Math.max(0, state.store.capital) / buyPrice));
    takeTurns(room, storeSellers.map((o) => o.quantity)).forEach((n, i) => {
      if (n > 0) settle(STORE_ID, storeSellers[i]!.playerId, n, buyPrice);
    });
  }

  // Only trades between players teach the market something: the store and
  // the ship trade at their own prices.
  const between = trades.filter((t) => players.has(t.buyer) && players.has(t.seller));
  const volume = between.reduce((n, t) => n + t.quantity, 0);
  driftReference(state, good, volume > 0 ? between.reduce((n, t) => n + t.price * t.quantity, 0) / volume : null);
  return trades;
}
