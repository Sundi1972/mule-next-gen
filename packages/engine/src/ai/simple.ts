import type { Order } from '../auction.js';
import { GAME, POLLUTION, RECIPES, UPKEEP } from '../config.js';
import { allPrices, storeQuotes } from '../economy.js';
import {
  analysePlot,
  buyMule,
  claimPlot,
  fitFilter,
  freePlots,
  hasAnalysed,
  installMule,
  litPlot,
  mulePriceFor,
  outfitCostFor,
  outfitMule,
  player,
} from '../game.js';
import { expectedGround } from '../map.js';
import { airPoints } from '../pollution.js';
import { factoryFit, rawOutput } from '../production.js';
import { GOODS, PROCESSED_GOODS, RAW_GOODS, type GameState, type Good, type Outfit, type Stock, type Tile } from '../types.js';

/**
 * The "hands" of an AI player: fast, rule-based decisions for the real-time
 * phases. A language-model "brain" will later set the priorities these rules
 * follow; for now they follow the colony prices directly.
 */

/** A tile as this player knows it: its real ground if they analysed it, otherwise what the terrain promises. */
function asKnown(state: GameState, tile: Tile, playerId: string): Tile {
  return hasAnalysed(player(state, playerId), state, tile) ? tile : { ...tile, ground: expectedGround(tile.terrain), traits: [] };
}

/** Value per month of putting this outfit on this tile, at the given prices, as far as the player knows. */
export function outfitValue(state: GameState, tile: Tile, outfit: Outfit, owner: string, prices: Stock): number {
  // Probe the tile as if the MULE were installed, so adjacency counts.
  const index = state.tiles.indexOf(tile);
  const probe: Tile = { ...asKnown(state, tile, owner), owner, outfit };
  state.tiles[index] = probe;
  try {
    if (outfit === 'greenBelt') return 0;
    if ((PROCESSED_GOODS as readonly string[]).includes(outfit)) {
      const good = outfit as (typeof PROCESSED_GOODS)[number];
      const fit = factoryFit(state, probe, good, owner);
      const inputs = { ...RECIPES[good].inputs, energy: fit.energy };
      // A simple AI only builds a factory it can feed: every input other
      // than Energy comes from its own plots or sits in its stock for two runs.
      const me = player(state, owner);
      const short = (Object.entries(inputs) as [Good, number][]).some(
        ([g, q]) =>
          g !== 'energy' &&
          me.stock[g] < q * 2 &&
          !state.tiles.some((t) => t.owner === owner && t.outfit === g),
      );
      if (short) return -Infinity;
      const cost = (Object.entries(inputs) as [Good, number][]).reduce((n, [g, q]) => n + q * prices[g], 0);
      return fit.output * prices[good] - cost;
    }
    // Raw plots pay 1 Energy.
    return rawOutput(state, probe) * prices[outfit as Good] - (outfit === 'energy' ? 0 : prices.energy);
  } finally {
    state.tiles[index] = tile;
  }
}

export function bestOutfitFor(state: GameState, tile: Tile, owner: string, prices: Stock): { outfit: Outfit; value: number } {
  let best: { outfit: Outfit; value: number } = { outfit: 'food', value: -Infinity };
  for (const outfit of [...RAW_GOODS, ...PROCESSED_GOODS] as Outfit[]) {
    // Spread the outfit's price over half a year of output.
    const value = outfitValue(state, tile, outfit, owner, prices) - outfitCostFor(state, owner, outfit) / 6;
    if (value > best.value) best = { outfit, value };
  }
  return best;
}

/**
 * Whether the AI presses for the plot that is lit. It takes a plot in the top
 * quarter of what is still free, and in later sweeps settles for anything
 * above the median, so it doesn't end the month empty-handed.
 */
export function aiWantsLit(state: GameState, playerId: string): boolean {
  const lit = litPlot(state);
  if (!lit || lit.owner || player(state, playerId).claimsThisGrant >= GAME.claimsPerGrant) return false;
  const prices = allPrices(state);
  const values = freePlots(state)
    .map((t) => bestOutfitFor(state, t, playerId, prices).value)
    .sort((a, b) => b - a);
  const mine = bestOutfitFor(state, lit, playerId, prices).value;
  const bar = values[Math.floor(values.length * ((state.grant?.sweep ?? 0) > 0 ? 0.5 : 0.25))] ?? -Infinity;
  return mine >= bar;
}

/** Claims the lit plot if the AI wants it. Returns true when it did. */
export function aiClaim(state: GameState, playerId: string): boolean {
  const lit = litPlot(state);
  if (!lit || !aiWantsLit(state, playerId)) return false;
  claimPlot(state, playerId, lit.x, lit.y);
  return true;
}

/** A simple AI leads at most this many MULEs out of the store a month, so the corral isn't emptied by whoever moves first. */
export const AI_MULES_PER_MONTH = 2;

export function aiDevelop(state: GameState, playerId: string): void {
  const me = player(state, playerId);
  if (me.doneDeveloping) return;
  const prices = allPrices(state);
  const idle = state.tiles.filter((t) => t.owner === playerId && !t.outfit);
  // Know your own land before you dig.
  for (const tile of idle) if (!hasAnalysed(me, state, tile)) analysePlot(state, playerId, tile.x, tile.y);
  const ranked = idle
    .map((tile) => ({ tile, ...bestOutfitFor(state, tile, playerId, prices) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, AI_MULES_PER_MONTH);
  for (const { tile, outfit, value } of ranked) {
    if (value <= 0) continue;
    if (me.money < mulePriceFor(state, playerId) + outfitCostFor(state, playerId, outfit) + 100) break;
    if (state.store.mules <= 0) break;
    buyMule(state, playerId);
    outfitMule(state, playerId, outfit);
    installMule(state, playerId, tile.x, tile.y);
  }
  // In dirty air, filter the worst of your own polluters while Alloy lasts.
  if (state.air >= POLLUTION.bands[1].from) {
    const polluters = state.tiles
      .filter((t) => t.owner === playerId && !t.filter && airPoints(t) > 1)
      .sort((a, b) => airPoints(b) - airPoints(a));
    for (const tile of polluters) {
      if (me.stock.alloy < 1) break;
      fitFilter(state, playerId, tile.x, tile.y);
    }
  }
}

/** What the AI keeps for next month: upkeep, Energy for its plots, factory inputs, and Medicine in dirty air. */
export function aiKeep(state: GameState, playerId: string): Partial<Record<Good, number>> {
  const mine = state.tiles.filter((t) => t.owner === playerId && t.outfit);
  const keep: Partial<Record<Good, number>> = {
    food: UPKEEP.food + 1,
    water: UPKEEP.water + 1,
    energy: mine.length * UPKEEP.energyPerPlot + 1,
    medicine: state.air >= POLLUTION.bands[1].from - 5 ? 1 : 0,
  };
  for (const tile of mine) {
    const recipe = (PROCESSED_GOODS as readonly string[]).includes(tile.outfit!) ? RECIPES[tile.outfit as (typeof PROCESSED_GOODS)[number]] : null;
    if (!recipe) continue;
    for (const [g, q] of Object.entries(recipe.inputs) as [Good, number][]) keep[g] = (keep[g] ?? 0) + q;
  }
  return keep;
}

/** Keeps enough for next month and sells the rest. */
export function aiOrders(state: GameState, playerId: string): Partial<Record<Good, Order[]>> {
  const me = player(state, playerId);
  const keep = aiKeep(state, playerId);
  const orders: Partial<Record<Good, Order[]>> = {};
  for (const good of GOODS) {
    const quotes = storeQuotes(state, good);
    const target = keep[good] ?? 0;
    const have = me.stock[good];
    if (have > target) {
      orders[good] = [{ playerId, side: 'sell', quantity: have - target, limit: quotes.buy }];
    } else if (have < target) {
      orders[good] = [{ playerId, side: 'buy', quantity: target - have, limit: quotes.sell }];
    }
  }
  return orders;
}
