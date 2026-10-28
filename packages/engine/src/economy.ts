import { EXPORT_DEMAND, EXPORT_SHIP, GAME, GOOD_CONFIG, MULE, POLLUTION, PRICE, RECIPES, UPKEEP } from './config.js';
import { airBand } from './pollution.js';
import { energyUseOf, needsOf } from './production.js';
import { createRng } from './rng.js';
import { emptyStock } from './stock.js';
import { GOODS, type ExportShip, type GameState, type Good, type Stock } from './types.js';

/** True from the month before the export ship calls: its wishlist is public and counts as demand. */
export function shipAnnounced(state: GameState): boolean {
  return state.month >= state.ship.arrives - 1;
}

export function shipInPort(state: GameState): boolean {
  return state.month === state.ship.arrives;
}

/** Plans the next call of the export ship: when it arrives and the goods it will want, drawn from the seed. */
export function planShip(seed: number, arrives: number, players: number): ExportShip {
  const rng = createRng((seed * 7 + arrives * 2_654_435) >>> 0);
  const goods = rng.shuffle(Object.keys(EXPORT_DEMAND) as Good[]).slice(0, EXPORT_SHIP.wishlist);
  const hold: Partial<Stock> = {};
  for (const g of goods) hold[g] = Math.ceil((EXPORT_DEMAND[g] ?? 0) * players * GAME.exportShipEvery);
  return { arrives, goods, hold, bought: {} };
}

/**
 * Expected demand for next month, per good, from colonists, players,
 * industry and the export ship's off-world buyers.
 */
export function monthlyDemand(state: GameState): Stock {
  const demand = emptyStock();
  const players = state.players.length;
  const colonistUnits = state.colonists / UPKEEP.colonistsPerUnit;

  // Players must eat and power their plots whatever the price. Colonists buy
  // less when the store's price is above what their wages pay.
  const sick = airBand(state.air).sickens;
  const own = playersUse(state);
  demand.food = own.food + colonistDemand(state, 'food', colonistUnits);
  demand.water = own.water + colonistDemand(state, 'water', colonistUnits);
  demand.energy = own.energy + colonistDemand(state, 'energy', colonistUnits * UPKEEP.colonistEnergyShare);
  // Sick colonists in dirty air need more Medicine.
  demand.medicine = colonistDemand(state, 'medicine', (state.colonists / UPKEEP.colonistsPerMedicine) * (sick ? POLLUTION.sickMedicineDemand : 1));
  const factories = (good: Good) => state.tiles.filter((t) => t.outfit === good).length;
  // The store builds a MULE from Smithore for every plot that will want one;
  // smelters need Smithore too, and Electronics works need Alloy.
  demand.smithore = factories('alloy') * (RECIPES.alloy.inputs.smithore ?? 0) + mulesWanted(state) * MULE.smithorePerMule;
  demand.alloy = factories('electronics');
  demand.rareEarth = factories('electronics');
  // Crystite is a pure off-world luxury: only the export ship wants it.
  demand.crystite = 0;
  demand.electronics = 0;
  const off = exportDemand(state);
  for (const good of GOODS) demand[good] += off[good];
  return demand;
}

/**
 * What off-world buyers take a month: once the ship's wishlist is out, what
 * it will buy; before that, what an average call takes of each good it may want.
 */
export function exportDemand(state: GameState): Stock {
  const demand = emptyStock();
  const exportGoods = Object.keys(EXPORT_DEMAND) as Good[];
  for (const good of exportGoods) {
    demand[good] = shipAnnounced(state)
      ? (state.ship.hold[good] ?? 0) / GAME.exportShipEvery
      : ((EXPORT_DEMAND[good] ?? 0) * state.players.length * EXPORT_SHIP.wishlist) / exportGoods.length;
  }
  return demand;
}

/**
 * What the players themselves use a month: Food and Water for their
 * households and crews, and the Energy their plots and factories burn.
 */
export function playersUse(state: GameState): { food: number; water: number; energy: number } {
  const use = { food: 0, water: 0, energy: 0 };
  for (const p of state.players) {
    const needs = needsOf(state, p.id);
    use.food += needs.food;
    use.water += needs.water;
  }
  for (const t of state.tiles) use.energy += energyUseOf(state, t);
  return use;
}

/** What colonists buy of a good they need this much of, at the store's current selling price. */
export function colonistDemand(state: GameState, good: Good, need: number): number {
  const budget = UPKEEP.colonistBudget[good];
  if (budget === undefined) return need;
  const price = state.store.posted[good] * (1 + PRICE.storeSpread);
  return need * Math.min(1, budget / Math.max(1, price));
}

/** MULEs the colony will want next month: one for each idle plot, plus the plots still to be granted. */
export function mulesWanted(state: GameState): number {
  const idle = state.tiles.filter((t) => t.owner && !t.outfit).length;
  const free = state.tiles.some((t) => t.terrain !== 'store' && !t.owner);
  return idle + (free ? state.players.length * GAME.claimsPerGrant : 0);
}

/**
 * Everything the colony holds of a good: the store's shelves and every
 * player's depot. MULEs in the corral count as the Smithore they were built
 * from. Prices follow the colony's supply, as in the original, not only
 * what is on the store's shelf.
 */
export function colonySupply(state: GameState, good: Good): number {
  const held = state.players.reduce((n, p) => n + p.stock[good], 0);
  const corral = good === 'smithore' ? state.store.mules * MULE.smithorePerMule : 0;
  return state.store.stock[good] + held + corral;
}

/** Months of demand the colony's supply would cover. */
export function cover(state: GameState, good: Good, demand = monthlyDemand(state), supply = colonySupply(state, good)): number {
  const need = demand[good];
  if (need <= 0) return Infinity;
  return supply / need;
}

/** How far scarcity pushes the target above or below the reference: (T / max(C, minCover))^k. */
export function scarcity(state: GameState, good: Good, demand = monthlyDemand(state)): number {
  const c = cover(state, good, demand);
  if (c === Infinity) return 1;
  return Math.pow(PRICE.targetCover / Math.max(c, PRICE.minCover), GOOD_CONFIG[good].sensitivity);
}

/**
 * Where supply and demand would put the price: P = Pref * (T / max(C, 0.25))^k.
 * The posted price moves toward it with momentum. A good nobody in the colony
 * needs (Crystite, or anything without demand) targets its reference price.
 */
export function targetPrice(state: GameState, good: Good, demand = monthlyDemand(state)): number {
  return Math.max(1, state.store.refPrice[good] * scarcity(state, good, demand));
}

/**
 * Posts this month's prices: each moves toward its target by at most +50% or
 * -30%, so a shortage builds over a few months. There is no ceiling: while a
 * good is nearly gone the price keeps climbing month after month.
 */
export function postPrices(state: GameState): void {
  const demand = monthlyDemand(state);
  // This month's report is already open; last month's says what colonists lacked.
  const lastShortages = state.history.at(-2)?.shortages ?? [];
  const off = exportDemand(state);
  const next = GOODS.map((good) => nextPostedPrice(state, good, demand, lastShortages, off));
  GOODS.forEach((good, i) => (state.store.posted[good] = next[i]!));
}

/**
 * The price the store would post for a good now, from the posted price it
 * moves from. Below the lowest cover, or after colonists went short of it last
 * month, the price has no target at all: it climbs the full step every month
 * until supply comes back. A good only off-world buyers want is worth no more
 * than they pay. AI players use this to price what an extra unit would do.
 */
export function nextPostedPrice(
  state: GameState,
  good: Good,
  demand = monthlyDemand(state),
  lastShortages: readonly Good[] = state.history.at(-2)?.shortages ?? [],
  off = exportDemand(state),
): number {
  const prev = state.store.posted[good];
  const short = cover(state, good, demand) < PRICE.minCover || lastShortages.includes(good) || shelfShort(state, good, PRICE.shelfCover);
  let target = short ? Infinity : targetPrice(state, good, demand);
  if (demand[good] - off[good] <= 0) target = Math.min(target, state.store.offWorld[good]);
  const next = Math.min(riseCap(state, good, prev), Math.max(prev * (1 - PRICE.maxFall), target));
  return Math.max(1, Math.round(next));
}

/**
 * The highest the posted price can go next month: up by half of the current
 * price, or of the reference price if the good has become cheap, so a good
 * that crashed can recover in a couple of months.
 */
export function riseCap(state: GameState, good: Good, prev: number): number {
  return prev + PRICE.maxRise * Math.max(prev, state.store.refPrice[good]);
}

/** The colony price of a good: what the store has posted this month. */
export function colonyPrice(state: GameState, good: Good): number {
  return state.store.posted[good];
}

export function allPrices(state: GameState): Stock {
  return { ...state.store.posted };
}

/**
 * What an empty MULE costs at the store: its labour plus the Smithore it is
 * built from, so a Smithore shortage makes MULEs dear, as in the original.
 * The scarcity factor rises each month the corral sells out and falls when
 * MULEs are left over.
 */
export function mulePrice(state: GameState): number {
  return Math.round((MULE.labour + MULE.smithorePerMule * state.store.posted.smithore) * state.store.muleFactor);
}

/**
 * What the store charges and what it pays, or null where it doesn't trade:
 * no sell price with an empty shelf, no buy price when it wants no more.
 */
export function storeQuotes(state: GameState, good: Good): { buy: number | null; sell: number | null } {
  const price = colonyPrice(state, good);
  const buy = Math.max(1, Math.floor(price * (1 - PRICE.storeSpread)));
  return {
    buy: storeWants(state, good) > 0 ? buy : null,
    sell: storeForSale(state, good) > 0 ? Math.ceil(price * (1 + PRICE.storeSpread)) : null,
  };
}

/**
 * Units the store will sell to players. It keeps back the Food and Water its
 * colonists will buy at the end of the month: the colony's own people come
 * first, so a short good runs out for the players, not for the colonists.
 */
export function storeForSale(state: GameState, good: Good): number {
  const reserve = good === 'food' || good === 'water' ? Math.ceil(state.colonists / UPKEEP.colonistsPerUnit) : 0;
  return Math.max(0, state.store.stock[good] - reserve);
}

/** Whether the store's shelf of Food or Water holds under `months` of the colonists' need. Other goods never are. */
export function shelfShort(state: GameState, good: Good, months: number): boolean {
  return (good === 'food' || good === 'water') && state.store.stock[good] < (state.colonists / UPKEEP.colonistsPerUnit) * months;
}

/**
 * How many units the store is willing to buy this month: it fills its shelves
 * up to a few months of demand, plus a ship's load of goods off-world buyers
 * take. The store never runs out of money, so only shelf room limits it.
 */
export function storeWants(state: GameState, good: Good, demand = monthlyDemand(state)): number {
  // For off-world goods it also stocks up a full ship's load, to sell when the ship calls.
  const shipLoad = exportDemand(state)[good] * GAME.exportShipEvery;
  const room = Math.ceil(demand[good] * PRICE.storeMaxCover + shipLoad) - state.store.stock[good];
  return Math.max(0, room);
}

/**
 * What the export ship pays for its next unit of a good: the off-world price
 * for the first, 2% less for each one after as its cargo fills, and 10% more
 * from a clean colony. Null when it doesn't want the good or its hold is full.
 */
export function shipPrice(state: GameState, good: Good): number | null {
  const ship = state.ship;
  if (!ship.goods.includes(good) || (ship.hold[good] ?? 0) <= 0) return null;
  const clean = airBand(state.air).name === 'clean' ? 1 + POLLUTION.cleanExportBonus : 1;
  const step = 1 - EXPORT_SHIP.stepDown * (ship.bought[good] ?? 0);
  return Math.max(1, Math.floor(state.store.offWorld[good] * clean * step));
}

/**
 * Learns from what players actually paid each other. The reference is the
 * price at normal supply, so a trade at a shortage price only raises it by as
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

/** Takes the sales tax from a player's sale: the tax goes to the colony fund and the seller keeps the rest. */
export function taxSale(state: GameState, sellerId: string, total: number): number {
  const tax = Math.round(total * state.treasury.salesTax);
  state.treasury.money += tax;
  state.treasury.paid[sellerId] = (state.treasury.paid[sellerId] ?? 0) + tax;
  return total - tax;
}
