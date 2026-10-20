import { GOOD_CONFIG, MULE, PRICE, UPKEEP } from './config.js';
import { emptyStock } from './stock.js';
import { GOODS, type GameState, type Good, type Stock } from './types.js';

/**
 * Expected demand for next month, per good, from colonists, players and
 * industry. Off-world demand is not counted here: it acts through the export
 * floor in colonyPrice().
 */
export function monthlyDemand(state: GameState): Stock {
  const demand = emptyStock();
  const players = state.players.length;
  const workingPlots = state.tiles.filter((t) => t.owner && t.outfit).length;
  const colonistUnits = state.colonists / UPKEEP.colonistsPerUnit;

  demand.food = players * UPKEEP.food + colonistUnits;
  demand.water = players * UPKEEP.water + colonistUnits;
  demand.energy = workingPlots * UPKEEP.energyPerPlot + colonistUnits / 2;
  demand.medicine = state.colonists / 50;
  // The store builds MULEs from Alloy; expect about one sale per player.
  demand.alloy = players * MULE.alloyPerMule;
  // Factories pull raw inputs.
  const factories = (good: Good) => state.tiles.filter((t) => t.outfit === good).length;
  // Alloy factories, and the store's own smelter for MULEs.
  demand.smithore = factories('alloy') * 2 + players * MULE.storeSmithorePerAlloy;
  demand.crystite = factories('electronics');
  demand.electronics = 0;
  return demand;
}

/** Months of demand the colony store could serve from its stock. */
export function cover(state: GameState, good: Good, demand = monthlyDemand(state)): number {
  const need = demand[good];
  if (need <= 0) return Infinity;
  return state.store.stock[good] / need;
}

export function exportPrice(state: GameState, good: Good): number {
  return state.store.offWorld[good] * PRICE.exportFactor;
}

export function importPrice(state: GameState, good: Good): number {
  return state.store.offWorld[good] * PRICE.importFactor;
}

/**
 * The colony price: P = Pref * (T / max(C, 0.1))^k, kept between the export
 * floor and the import cap. The cap only holds while the colony fund can
 * actually pay for an import; in a crisis prices break through it.
 */
export function colonyPrice(state: GameState, good: Good, demand = monthlyDemand(state)): number {
  const c = cover(state, good, demand);
  const { sensitivity } = GOOD_CONFIG[good];
  const raw =
    c === Infinity
      ? 0
      : state.store.refPrice[good] * Math.pow(PRICE.targetCover / Math.max(c, PRICE.minCover), sensitivity);
  const floor = exportPrice(state, good);
  const cap = importPrice(state, good);
  const canImport = state.store.fund >= cap;
  const capped = Math.min(raw, canImport ? cap : cap * PRICE.crisisFactor);
  return Math.round(Math.max(floor, capped));
}

export function allPrices(state: GameState): Stock {
  const demand = monthlyDemand(state);
  const prices = emptyStock();
  for (const good of GOODS) prices[good] = colonyPrice(state, good, demand);
  return prices;
}

/** What the store charges and what it pays. */
export function storeQuotes(state: GameState, good: Good): { buy: number; sell: number } {
  const price = colonyPrice(state, good);
  return {
    buy: Math.max(1, Math.floor(price * (1 - PRICE.storeSpread))),
    sell: Math.ceil(price * (1 + PRICE.storeSpread)),
  };
}

/** Moves the colony reference price toward the price that actually cleared. */
export function driftReference(state: GameState, good: Good, clearingPrice: number): void {
  const ref = state.store.refPrice[good];
  const next = ref + (clearingPrice - ref) * PRICE.refDrift;
  // Keep the reference inside the off-world band, so a long shortage can't
  // ratchet it up for the rest of the game.
  const bounded = Math.min(importPrice(state, good), Math.max(exportPrice(state, good), next));
  state.store.refPrice[good] = Math.round(bounded);
}
