import { GOODS, type Good, type Stock } from './types.js';

export function emptyStock(): Stock {
  return Object.fromEntries(GOODS.map((g) => [g, 0])) as Stock;
}

export function addStock(target: Stock, delta: Partial<Stock>, factor = 1): void {
  for (const [good, amount] of Object.entries(delta) as [Good, number][]) {
    target[good] += amount * factor;
  }
}

export function hasStock(stock: Stock, needed: Partial<Stock>, times = 1): boolean {
  return (Object.entries(needed) as [Good, number][]).every(([good, amount]) => stock[good] >= amount * times);
}
