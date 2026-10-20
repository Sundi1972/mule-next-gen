import { EXPORT_DEMAND, GOOD_CONFIG, MULE, PRICE, UPKEEP } from './config.js';
import { emptyStock } from './stock.js';
import { GOODS, type GameState, type Good, type Stock } from './types.js';

/**
 * Expected demand for next month, per good, from colonists, players and
 * industry, plus what off-world buyers take through the export ship.
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
  // Off-world buyers, served by the export ship.
  for (const good of GOODS) demand[good] += (EXPORT_DEMAND[good] ?? 0) * players;
  return demand;
}

/** Months of demand the colony store could serve from its stock. */
export function cover(state: GameState, good: Good, demand = monthlyDemand(state)): number {
  const need = demand[good];
  if (need <= 0) return Infinity;
  return state.store.stock[good] / need;
}

/** What the export ship pays per unit. */
export function exportPrice(state: GameState, good: Good): number {
  return state.store.offWorld[good] * PRICE.exportFactor;
}

/** What an import costs the colony fund per unit. */
export function importPrice(state: GameState, good: Good): number {
  return state.store.offWorld[good] * PRICE.importFactor;
}

/**
 * The colony price: P = Pref * (T / max(C, 0.1))^k. There is no floor and no
 * cap: a glut can push a price close to nothing, and a shortage can push it as
 * high as buyers are willing to pay. Imports and the export ship are not
 * limits on the price; they are goods arriving and leaving, which change the
 * cover and so move the price.
 */
export function colonyPrice(state: GameState, good: Good, demand = monthlyDemand(state)): number {
  return Math.max(1, Math.round(state.store.refPrice[good] * scarcity(state, good, demand)));
}

/** How far scarcity pushes the price above or below the reference: (T / max(C, 0.1))^k. */
export function scarcity(state: GameState, good: Good, demand = monthlyDemand(state)): number {
  const c = cover(state, good, demand);
  if (c === Infinity) return 0;
  return Math.pow(PRICE.targetCover / Math.max(c, PRICE.minCover), GOOD_CONFIG[good].sensitivity);
}

export function allPrices(state: GameState): Stock {
  const demand = monthlyDemand(state);
  const prices = emptyStock();
  for (const good of GOODS) prices[good] = colonyPrice(state, good, demand);
  return prices;
}

/**
 * What an empty MULE costs at the store: its labour plus the Alloy inside it
 * at today's price. As in the original, a Smithore shortage makes MULEs dear.
 */
export function mulePrice(state: GameState): number {
  return MULE.labour + MULE.alloyPerMule * colonyPrice(state, 'alloy');
}

/** What the store charges and what it pays. */
export function storeQuotes(state: GameState, good: Good): { buy: number; sell: number } {
  const price = colonyPrice(state, good);
  return {
    buy: Math.max(1, Math.floor(price * (1 - PRICE.storeSpread))),
    sell: Math.ceil(price * (1 + PRICE.storeSpread)),
  };
}

/**
 * How many units the store is willing to buy this month. The store is a
 * merchant, not a bottomless buyer: it fills its shelves up to a few months of
 * demand and never bets more than a share of the colony fund on one good.
 * Players can still trade with each other at any price they agree on.
 */
export function storeWants(state: GameState, good: Good, price: number, demand = monthlyDemand(state)): number {
  const room = Math.ceil(demand[good] * PRICE.storeMaxCover) - state.store.stock[good];
  const budget = Math.floor((Math.max(0, state.store.fund) * PRICE.storeBudgetShare) / Math.max(1, price));
  return Math.max(0, Math.min(room, budget));
}

/**
 * Learns from what players actually paid. The reference is the price of a
 * good at normal supply, so a trade at a shortage price only raises it by as
 * much as players paid above what the shortage alone explains. It also drifts
 * a little toward the off-world price, because ships keep bringing that price
 * back into the colony. There is no bound in either direction.
 */
export function driftReference(state: GameState, good: Good, clearingPrice: number | null): void {
  const ref = state.store.refPrice[good];
  const s = scarcity(state, good);
  const implied = clearingPrice !== null && s > 0 ? clearingPrice / s : ref;
  const next = ref + (implied - ref) * PRICE.refDrift + (state.store.offWorld[good] - ref) * PRICE.worldPull;
  state.store.refPrice[good] = Math.max(1, Math.round(next));
}
