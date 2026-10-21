import type { Order } from '../auction.js';
import { DEVELOPMENT, GAME, GOOD_CONFIG, POLLUTION, PRICE, RECIPES, UPKEEP } from '../config.js';
import { colonyPrice, colonySupply, monthlyDemand, riseCap, storeQuotes } from '../economy.js';
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
import { energyUseOf, factoryFit, isFactory, isRaw, needsOf, rawOutput } from '../production.js';
import { GOODS, PROCESSED_GOODS, RAW_GOODS, type GameState, type Good, type Outfit, type Stock, type Tile } from '../types.js';

/**
 * The "hands" of an AI player: fast, rule-based decisions for the real-time
 * phases. A language-model "brain" will later set the priorities these rules
 * follow; for now they follow the colony prices directly.
 */

/**
 * What the AI expects each good to fetch next month, as a function of how
 * much more it adds. Supply is the colony's stock now plus what every plot
 * now working will make, including MULEs other players installed this month.
 * The store's price moves at most +50% or -30% a month, so a good that is
 * dear now stays dear for a while, and a cheap one takes time to climb. Pricing its own output this way keeps a simple
 * AI from piling into a good the colony already has plenty of.
 */
/** Months a simple AI looks ahead when it prices a MULE's output. */
export const AI_HORIZON = 6;

export interface Market {
  price(good: Good, extra?: number): number;
}

export function forecastMarket(state: GameState, adding: Partial<Stock> = {}): Market {
  const demand = monthlyDemand(state);
  const supply = {} as Stock;
  for (const good of GOODS) supply[good] = colonySupply(state, good) + (adding[good] ?? 0);
  for (const t of state.tiles) {
    if (!t.owner || !t.outfit || t.outfit === 'greenBelt') continue;
    supply[t.outfit] += isFactory(t.outfit) ? factoryFit(state, t, t.outfit, t.owner).output : rawOutput(state, t);
  }
  return {
    price(good, extra = 0) {
      const need = demand[good];
      const c = need > 0 ? (supply[good] + extra) / need : Infinity;
      const s = c === Infinity ? 1 : Math.pow(PRICE.targetCover / Math.max(c, PRICE.minCover), GOOD_CONFIG[good].sensitivity);
      // The posted price walks toward the target at most +50% or -30% a
      // month; average that walk over the months a MULE pays itself back.
      const target = Math.max(1, state.store.refPrice[good] * s);
      let posted = state.store.posted[good];
      let sum = 0;
      for (let m = 0; m < AI_HORIZON; m++) {
        posted = Math.min(riseCap(state, good, posted), Math.max(posted * (1 - PRICE.maxFall), target));
        sum += posted;
      }
      return sum / AI_HORIZON;
    },
  };
}

/** A tile as this player knows it: its real ground if they analysed it, otherwise what the terrain promises. */
function asKnown(state: GameState, tile: Tile, playerId: string): Tile {
  return hasAnalysed(player(state, playerId), state, tile) ? tile : { ...tile, ground: expectedGround(tile.terrain), traits: [] };
}

/** What a simple AI counts one colony air point as costing it, in clean air; it doubles by Smoggy. */
export const AI_AIR_COST = 10;

/** Value per month of putting this outfit on this tile, at the given prices, as far as the player knows. */
export function outfitValue(state: GameState, tile: Tile, outfit: Outfit, owner: string, market: Market): number {
  // Probe the tile as if the MULE were installed, so adjacency counts.
  const index = state.tiles.indexOf(tile);
  const probe: Tile = { ...asKnown(state, tile, owner), owner, outfit };
  state.tiles[index] = probe;
  try {
    // The AI counts pollution as a cost that grows as the air gets worse, and
    // a green belt as worth the air it cleans.
    const airCost = AI_AIR_COST * (1 + state.air / POLLUTION.bands[1].from);
    if (outfit === 'greenBelt') return POLLUTION.greenBeltAir * airCost;
    const fouls = airPoints(probe) * airCost;
    if ((PROCESSED_GOODS as readonly string[]).includes(outfit)) {
      const good = outfit as (typeof PROCESSED_GOODS)[number];
      const fit = factoryFit(state, probe, good, owner);
      const inputs = { ...RECIPES[good].inputs, energy: fit.energy };
      // A simple AI only builds a factory it can feed: every input other
      // than Energy comes from its own plots, or sits in its stock for four
      // runs on top of what its household eats.
      const me = player(state, owner);
      const needs = needsOf(state, owner);
      const short = (Object.entries(inputs) as [Good, number][]).some(
        ([g, q]) =>
          g !== 'energy' &&
          me.stock[g] - (g === 'food' || g === 'water' ? needs[g] : 0) < q * 4 &&
          !state.tiles.some((t) => t.owner === owner && t.outfit === g),
      );
      if (short) return -Infinity;
      const cost = (Object.entries(inputs) as [Good, number][]).reduce((n, [g, q]) => n + q * market.price(g, -q), 0);
      return fit.output * market.price(good, fit.output) - cost - fouls;
    }
    // Raw plots pay their Energy. Output is priced as if it were already on the market.
    const made = rawOutput(state, probe);
    const energy = energyUseOf(state, probe);
    return made * market.price(outfit as Good, made) - energy * market.price('energy', -energy) - fouls;
  } finally {
    state.tiles[index] = tile;
  }
}

export function bestOutfitFor(state: GameState, tile: Tile, owner: string, market: Market): { outfit: Outfit; value: number } {
  let best: { outfit: Outfit; value: number } = { outfit: 'food', value: -Infinity };
  for (const outfit of [...RAW_GOODS, ...PROCESSED_GOODS, 'greenBelt'] as Outfit[]) {
    // Spread the outfit's price over half a year of output.
    const value = outfitValue(state, tile, outfit, owner, market) - outfitCostFor(state, owner, outfit) / 6;
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
  // Land is free but idle land earns nothing: an AI that can't afford to
  // develop what it already holds stops claiming more.
  const idle = state.tiles.filter((t) => t.owner === playerId && !t.outfit).length;
  if (idle >= AI_MULES_PER_MONTH && player(state, playerId).money < (idle + 1) * mulePriceFor(state, playerId)) return false;
  const market = forecastMarket(state);
  const values = freePlots(state)
    .map((t) => bestOutfitFor(state, t, playerId, market).value)
    .sort((a, b) => b - a);
  const mine = bestOutfitFor(state, lit, playerId, market).value;
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
  const idle = state.tiles.filter((t) => t.owner === playerId && !t.outfit);
  // Know your own land before you dig.
  for (const tile of idle) if (!hasAnalysed(me, state, tile)) analysePlot(state, playerId, tile.x, tile.y);
  // One MULE at a time, re-forecasting after each, so the AI spreads over the goods the colony lacks.
  const adding: Partial<Stock> = {};
  for (let n = 0; n < AI_MULES_PER_MONTH; n++) {
    const market = forecastMarket(state, adding);
    const best = state.tiles
      .filter((t) => t.owner === playerId && !t.outfit)
      .map((tile) => ({ tile, ...bestOutfitFor(state, tile, playerId, market) }))
      .sort((a, b) => b.value - a.value)[0];
    if (!best || best.value <= 0) break;
    if (me.money < mulePriceFor(state, playerId) + outfitCostFor(state, playerId, best.outfit) + 100) break;
    if (state.store.mules <= 0) break;
    buyMule(state, playerId);
    outfitMule(state, playerId, best.outfit);
    installMule(state, playerId, best.tile.x, best.tile.y);
    if (best.outfit !== 'greenBelt') {
      const made = isFactory(best.outfit) ? factoryFit(state, best.tile, best.outfit, playerId).output : rawOutput(state, best.tile);
      adding[best.outfit] = (adding[best.outfit] ?? 0) + made;
    }
  }
  // In dirty air, filter the worst of your own polluters while Alloy lasts.
  if (state.air >= POLLUTION.bands[1].from - 10) {
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
  const needs = needsOf(state, playerId);
  const keep: Partial<Record<Good, number>> = {
    food: needs.food + 1,
    water: needs.water + 1,
    energy: mine.reduce((n, t) => n + (isFactory(t.outfit!) ? 0 : energyUseOf(state, t)), 0) + 1,
    medicine: state.air >= POLLUTION.bands[1].from - 5 ? 1 : 0,
  };
  // Alloy for a filter on each unfiltered polluter once the air turns.
  if (state.air >= POLLUTION.bands[1].from - 10) {
    keep.alloy = mine.filter((t) => !t.filter && airPoints(t) > 1).length * DEVELOPMENT.filterAlloy;
  }
  for (const tile of mine) {
    const recipe = (PROCESSED_GOODS as readonly string[]).includes(tile.outfit!) ? RECIPES[tile.outfit as (typeof PROCESSED_GOODS)[number]] : null;
    if (!recipe) continue;
    for (const [g, q] of Object.entries(recipe.inputs) as [Good, number][]) keep[g] = (keep[g] ?? 0) + q;
  }
  return keep;
}

/** What a second of development time is worth to a simple AI that still has idle land to work. */
export const AI_SECOND_VALUE = 10;

/**
 * The most a good is worth to this AI for one more unit: what it would lose
 * without it. Energy keeps a plot from running at half output, factory
 * inputs keep a factory running, Food buys development time, Medicine saves
 * sickness. There is no cap: when a good is short and it matters, the AI
 * pays what it is worth, so a player who corners a market can charge a lot.
 */
export function useValue(state: GameState, playerId: string, good: Good, market: Market = forecastMarket(state)): number {
  const mine = state.tiles.filter((t) => t.owner === playerId && t.outfit && t.outfit !== 'greenBelt');
  const values: number[] = [market.price(good)];
  if (good === 'energy') {
    for (const t of mine) if (isRaw(t.outfit!) && t.outfit !== 'energy') values.push((rawOutput(state, t) * market.price(t.outfit as Good)) / 2);
  }
  for (const t of mine) {
    if (!isFactory(t.outfit!)) continue;
    const made = t.outfit as (typeof PROCESSED_GOODS)[number];
    const inputs = RECIPES[made].inputs;
    if (!(good in inputs)) continue;
    const units = Object.values(inputs).reduce((n, q) => n + (q ?? 0), 0);
    values.push((factoryFit(state, t, made, playerId).output * market.price(made)) / Math.max(1, units));
  }
  const busy = state.tiles.some((t) => t.owner === playerId && !t.outfit);
  const second = busy ? AI_SECOND_VALUE : AI_SECOND_VALUE / 5;
  if (good === 'food') values.push(((DEVELOPMENT.fullSeconds - DEVELOPMENT.minSeconds) / needsOf(state, playerId).food) * second);
  if (good === 'medicine' && state.air >= POLLUTION.bands[1].from - 5) values.push(POLLUTION.bands[2].devPenalty * second);
  return Math.max(...values);
}

/** Keeps enough for next month and sells the rest. */
export function aiOrders(state: GameState, playerId: string): Partial<Record<Good, Order[]>> {
  const me = player(state, playerId);
  const keep = aiKeep(state, playerId);
  const market = forecastMarket(state);
  const orders: Partial<Record<Good, Order[]>> = {};
  for (const good of GOODS) {
    const quotes = storeQuotes(state, good);
    const posted = colonyPrice(state, good);
    const target = keep[good] ?? 0;
    const have = me.stock[good];
    if (have > target) {
      // Sell at the store's price, or a little under the posted price when the store isn't buying.
      orders[good] = [{ playerId, side: 'sell', quantity: have - target, limit: quotes.buy ?? Math.max(1, Math.floor(posted * 0.8)) }];
    } else if (have < target) {
      // Buy at the store's price if the good is worth it, otherwise bid what
      // it is worth to tempt another player; never spend more than half its
      // money on one good.
      const worth = Math.ceil(useValue(state, playerId, good, market));
      const limit = quotes.sell !== null && quotes.sell <= worth ? quotes.sell : worth;
      const quantity = Math.min(target - have, Math.floor(me.money / 2 / Math.max(1, limit)));
      if (quantity > 0) orders[good] = [{ playerId, side: 'buy', quantity, limit }];
    }
  }
  return orders;
}
