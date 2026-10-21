import { driftReference, storeQuotes, storeWants } from './economy.js';
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

/**
 * Settles one good's auction. Players are matched with each other first (best
 * buyer with best seller, at the midpoint of their limits), as in the
 * original's walk-to-the-price auction. Whatever is left trades with the
 * colony store, if its quote is good enough and it has stock or money.
 */
export function runAuction(state: GameState, good: Good, orders: Order[]): Trade[] {
  const players = new Map(state.players.map((p) => [p.id, p]));
  const quotes = storeQuotes(state, good);
  const trades: Trade[] = [];

  // Clamp orders to what each player can actually deliver or afford.
  const buys = orders
    .filter((o) => o.side === 'buy' && o.quantity > 0)
    .map((o) => ({ ...o }))
    .sort((a, b) => b.limit - a.limit);
  const sells = orders
    .filter((o) => o.side === 'sell' && o.quantity > 0)
    .map((o) => ({ ...o, quantity: Math.min(o.quantity, players.get(o.playerId)?.stock[good] ?? 0) }))
    .sort((a, b) => a.limit - b.limit);

  const settle = (buyer: string, seller: string, quantity: number, price: number) => {
    const b = buyer === STORE_ID ? null : players.get(buyer)!;
    const s = seller === STORE_ID ? null : players.get(seller)!;
    const affordable = b ? Math.min(quantity, Math.floor(b.money / price)) : Math.min(quantity, Math.floor(state.store.fund / price));
    const available = s ? Math.min(affordable, s.stock[good]) : Math.min(affordable, state.store.stock[good]);
    if (available <= 0) return 0;
    const total = available * price;
    if (b) { b.money -= total; b.stock[good] += available; } else { state.store.fund -= total; state.store.stock[good] += available; }
    if (s) { s.money += total; s.stock[good] -= available; } else { state.store.fund += total; state.store.stock[good] -= available; }
    trades.push({ good, buyer, seller, quantity: available, price });
    return available;
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

  // Leftovers against the store, in turns. A Quibbit is always first in
  // line; otherwise whoever reached the price first goes first.
  const turnOrder = <T extends Order>(list: T[]) =>
    list
      .map((o, i) => ({ o, i }))
      .sort((a, b) => {
        const q = Number(players.get(b.o.playerId)?.species === 'quibbit') - Number(players.get(a.o.playerId)?.species === 'quibbit');
        return q || (a.o.at ?? Infinity) - (b.o.at ?? Infinity) || a.i - b.i;
      })
      .map(({ o }) => o);

  const storeBuyers = turnOrder(buys.filter((b) => b.quantity > 0 && b.limit >= quotes.sell));
  const buyerWants = storeBuyers.map((b) => Math.min(b.quantity, Math.floor((players.get(b.playerId)?.money ?? 0) / quotes.sell)));
  takeTurns(state.store.stock[good], buyerWants).forEach((n, i) => {
    if (n > 0) settle(storeBuyers[i]!.playerId, STORE_ID, n, quotes.sell);
  });

  const storeSellers = turnOrder(sells.filter((o) => o.quantity > 0 && o.limit <= quotes.buy));
  const room = Math.min(storeWants(state, good, quotes.buy), Math.floor(Math.max(0, state.store.fund) / quotes.buy));
  takeTurns(room, storeSellers.map((o) => o.quantity)).forEach((n, i) => {
    if (n > 0) settle(STORE_ID, storeSellers[i]!.playerId, n, quotes.buy);
  });

  // Only trades between players teach the market something: store trades are
  // at the store's own quote.
  const between = trades.filter((t) => t.buyer !== STORE_ID && t.seller !== STORE_ID);
  const volume = between.reduce((n, t) => n + t.quantity, 0);
  driftReference(state, good, volume > 0 ? between.reduce((n, t) => n + t.price * t.quantity, 0) / volume : null);
  return trades;
}
