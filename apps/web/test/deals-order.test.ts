import { SHIP_ID, STORE_ID } from '@mule/engine';
import type { DealView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { newestFirst, type DealRow } from '../src/components/AuctionParts';

const pair = (units: number, buyer = 'kai', seller = 'brix'): DealView => ({ buyer, seller, price: 63, units });
const shipBuys = (units: number, seller = 'ossa'): DealView => ({ buyer: SHIP_ID, seller, price: 72, units });
const storeSells = (buyer: string, units: number): DealView => ({ buyer, seller: STORE_ID, price: 66, units });
const storeBuys = (seller: string, units: number): DealView => ({ buyer: STORE_ID, seller, price: 40, units });

/** The rows after each server update in turn, as the TV holds them. */
const play = (...updates: DealView[][]): DealRow[] => updates.reduce<DealRow[]>((rows, deals) => newestFirst(rows, deals), []);
const shown = (rows: DealRow[]) => rows.map((r) => `${r.deal.seller}>${r.deal.buyer} ×${r.deal.units}`);

describe("the TV's deals list", () => {
  it("FM-A5-1: the TV's deals list keeps the newest deal on top, in a stable order (a new deal goes on top)", () => {
    // The server lists the pair first whatever started when.
    expect(shown(play([pair(1)], [pair(1), shipBuys(1)]))).toEqual(['ossa>ship ×1', 'brix>kai ×1']);
  });

  it("FM-A5-1: the TV's deals list keeps the newest deal on top, in a stable order (the order holds while units move)", () => {
    expect(shown(play([pair(1)], [pair(1), shipBuys(1)], [pair(3), shipBuys(2)], [pair(4), shipBuys(5)]))).toEqual(['ossa>ship ×5', 'brix>kai ×4']);
  });

  it("FM-A5-1: the TV's deals list keeps the newest deal on top, in a stable order (a house deal stays one deal when its buyer changes)", () => {
    const rows = play([storeSells('lena', 1)], [pair(1), storeSells('lena', 2)], [pair(2), storeSells('kai', 3)]);
    expect(shown(rows)).toEqual(['brix>kai ×2', 'store>kai ×3']);
  });

  it("FM-A5-1: the TV's deals list keeps the newest deal on top, in a stable order (ended deals are dropped)", () => {
    expect(shown(play([pair(1)], [pair(2), shipBuys(1)], [shipBuys(2)]))).toEqual(['ossa>ship ×2']);
    expect(play([pair(1), shipBuys(1)], [])).toEqual([]);
  });

  it("FM-A5-1: the TV's deals list keeps the newest deal on top, in a stable order (a pair that meets again goes back on top)", () => {
    expect(shown(play([pair(1)], [pair(2), shipBuys(1)], [shipBuys(2)], [pair(1), shipBuys(3)]))).toEqual(['brix>kai ×1', 'ossa>ship ×3']);
  });

  it("FM-A5-1: the TV's deals list keeps the newest deal on top, in a stable order (the store buying and selling at once is two deals)", () => {
    const rows = play([storeSells('kai', 1), storeBuys('lena', 1)]);
    expect(rows.map((r) => r.key)).toHaveLength(new Set(rows.map((r) => r.key)).size);
    expect(shown(rows).sort()).toEqual(['lena>store ×1', 'store>kai ×1']);
  });
});
