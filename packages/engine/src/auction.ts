import { colonyPrice, driftReference, storeQuotes } from './economy.js';
import type { GameState, Good } from './types.js';

export interface Order {
  playerId: string;
  side: 'buy' | 'sell';
  quantity: number;
  /** Highest price a buyer pays, or lowest price a seller accepts, per unit. */
  limit: number;
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

  // Leftovers against the store.
  for (const buy of buys) {
    if (buy.quantity > 0 && buy.limit >= quotes.sell) settle(buy.playerId, STORE_ID, buy.quantity, quotes.sell);
  }
  for (const sell of sells) {
    if (sell.quantity > 0 && sell.limit <= quotes.buy) settle(STORE_ID, sell.playerId, sell.quantity, quotes.buy);
  }

  const volume = trades.reduce((n, t) => n + t.quantity, 0);
  if (volume > 0) {
    const average = trades.reduce((n, t) => n + t.price * t.quantity, 0) / volume;
    driftReference(state, good, average);
  } else {
    driftReference(state, good, colonyPrice(state, good));
  }
  return trades;
}
