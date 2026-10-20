import type { Order } from '../auction.js';
import { MULE, UPKEEP } from '../config.js';
import { allPrices, storeQuotes } from '../economy.js';
import { buyMule, claimPlot, freePlots, installMule, outfitMule } from '../game.js';
import { rawOutput } from '../production.js';
import { RAW_GOODS, type GameState, type Good, type RawGood, type Stock, type Tile } from '../types.js';

/**
 * The "hands" of an AI player: fast, rule-based decisions for the real-time
 * phases. A language-model "brain" will later set the priorities these rules
 * follow; for now they follow the colony prices directly.
 */

/** Value of putting a MULE for this good on this tile, at the given prices. */
function tileValue(state: GameState, tile: Tile, good: RawGood, owner: string, prices: Stock): number {
  // Probe the tile as if the MULE were installed, so adjacency counts.
  const index = state.tiles.indexOf(tile);
  const probe: Tile = { ...tile, owner, outfit: good };
  state.tiles[index] = probe;
  const output = rawOutput(state, probe);
  state.tiles[index] = tile;
  return output * prices[good];
}

export function bestGoodFor(state: GameState, tile: Tile, owner: string, prices: Stock): { good: RawGood; value: number } {
  let best: { good: RawGood; value: number } = { good: 'food', value: -Infinity };
  for (const good of RAW_GOODS) {
    // AI players only farm Crystite where they would know it is there.
    if (good === 'crystite' && tile.crystite === 0) continue;
    const value = tileValue(state, tile, good, owner, prices) - MULE.outfitCost[good] / 6;
    if (value > best.value) best = { good, value };
  }
  return best;
}

export function aiClaim(state: GameState, playerId: string): void {
  const prices = allPrices(state);
  const candidates = freePlots(state)
    .map((tile) => ({ tile, value: bestGoodFor(state, tile, playerId, prices).value }))
    .sort((a, b) => b.value - a.value);
  const pick = candidates[0];
  if (pick) claimPlot(state, playerId, pick.tile.x, pick.tile.y);
}

export function aiDevelop(state: GameState, playerId: string): void {
  const player = state.players.find((p) => p.id === playerId)!;
  const prices = allPrices(state);
  const idle = state.tiles.filter((t) => t.owner === playerId && !t.outfit);
  for (const tile of idle) {
    const { good } = bestGoodFor(state, tile, playerId, prices);
    if (player.money < MULE.price + MULE.outfitCost[good] + 100) return;
    if (state.store.mules <= 0) return;
    buyMule(state, playerId);
    outfitMule(state, playerId, good);
    installMule(state, playerId, tile.x, tile.y);
  }
}

/** Keeps enough for next month's upkeep and sells the rest. */
export function aiOrders(state: GameState, playerId: string): Partial<Record<Good, Order[]>> {
  const player = state.players.find((p) => p.id === playerId)!;
  const plots = state.tiles.filter((t) => t.owner === playerId && t.outfit).length;
  const keep: Partial<Record<Good, number>> = {
    food: UPKEEP.food + 1,
    water: UPKEEP.water + 1,
    energy: plots * UPKEEP.energyPerPlot + 1,
  };
  const orders: Partial<Record<Good, Order[]>> = {};
  for (const good of Object.keys(player.stock) as Good[]) {
    const quotes = storeQuotes(state, good);
    const target = keep[good] ?? 0;
    const have = player.stock[good];
    if (have > target) {
      orders[good] = [{ playerId, side: 'sell', quantity: have - target, limit: quotes.buy }];
    } else if (have < target) {
      orders[good] = [{ playerId, side: 'buy', quantity: target - have, limit: quotes.sell }];
    }
  }
  return orders;
}
