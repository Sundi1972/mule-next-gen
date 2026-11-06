import { EXPORT_DEMAND, EXPORT_SHIP, GAME, GOOD_CONFIG, MULE, POLLUTION, PRICE, RECIPES, UPKEEP } from './config.js';
import { fundIn } from './colony.js';
import { airBand } from './pollution.js';
import { energyUseOf, factoryFit, isFactory, needsOf, rawOutput } from './production.js';
import { createRng } from './rng.js';
import { emptyStock } from './stock.js';
import { GOODS, type ExportShip, type GameState, type Good, type PriceBand, type Stock } from './types.js';

/** True from the month before the export ship calls: its wishlist is public and counts as demand. */
export function shipAnnounced(state: GameState): boolean {
  return state.month >= state.ship.arrives - 1;
}

export function shipInPort(state: GameState): boolean {
  return state.month === state.ship.arrives;
}

/** Plans the next call of the export ship: when it arrives and the goods it will want, drawn from the seed. */
export function planShip(seed: number, arrives: number, players: number): ExportShip {
  // literal-ok: hash constants that mix the seed and the month into the ship's own rng stream
  const rng = createRng((seed * 7 + arrives * 2_654_435) >>> 0);
  const goods = rng.shuffle(Object.keys(EXPORT_DEMAND) as Good[]).slice(0, EXPORT_SHIP.wishlist);
  const hold: Partial<Stock> = {};
  for (const g of goods) hold[g] = Math.ceil((EXPORT_DEMAND[g] ?? 0) * players * GAME.exportShipEvery);
  return { arrives, goods, hold, bought: {} };
}

/** Energy a new MULE draws from the stock: the mean use of the outfits that buy Energy, a plant's own use being no demand (AM-17 A). Read on every call, so a run's `--set UPKEEP.energyUse` reaches it. */
function energyPerNewMule(): number {
  const buyers = Object.entries(UPKEEP.energyUse).filter(([good]) => good !== 'energy');
  return buyers.reduce((sum, [, use]) => sum + use, 0) / buyers.length;
}

/**
 * Expected demand for next month, per good, from colonists, players,
 * industry and the export ship's off-world buyers. `festival` is the extra Food the colonists ask this month (G-5 C26);
 * once upkeep's meal has run it is eaten, and the caller passes 0.
 */
export function monthlyDemand(state: GameState, festival = festivalFood(state)): Stock {
  const demand = emptyStock();
  const players = state.players.length;
  const colonistUnits = state.colonists / UPKEEP.colonistsPerUnit;

  // Players must eat and power their plots whatever the price. Colonists buy
  // less when the store's price is above what their wages pay.
  const sick = airBand(state.air).sickens;
  const own = playersUse(state);
  demand.food = own.food + colonistDemand(state, 'food', colonistUnits + festival);
  demand.water = own.water + colonistDemand(state, 'water', colonistUnits);
  demand.energy = own.energy + colonistDemand(state, 'energy', colonistUnits * UPKEEP.colonistEnergyShare);
  // The MULEs players are about to install will each need Energy before any plot draws it (C6).
  demand.energy += mulesWanted(state) * energyPerNewMule();
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
  // A plant pays its own use from its own output (AM-17 R2, PM ruling A): it asks the store for nothing.
  for (const t of state.tiles) if (t.outfit !== 'energy') use.energy += energyUseOf(state, t);
  return use;
}

/**
 * The Food the colonists ask this month beyond their need: a festival's extra (G-5 C26), the units its store-Food
 * effect carries; 0 in any other month. The month's list holds it from planning until the next month opens.
 */
export function festivalFood(state: GameState): number {
  return state.monthEvents
    .filter((e) => e.key === 'festival')
    .flatMap((e) => e.effects ?? [])
    .filter((f) => f.on === 'store' && f.what === 'food')
    .reduce((sum, f) => sum + f.delta, 0);
}

/** What colonists buy of a good they need this much of, at the store's current selling price. */
export function colonistDemand(state: GameState, good: Good, need: number): number {
  const budget = UPKEEP.colonistBudget[good];
  if (budget === undefined) return need;
  const price = storeSellAt(state, good, state.store.posted[good], { exact: true });
  return need * Math.min(1, budget / Math.max(1, price));
}

/** MULEs a month's new land takes from the corral, by grant and by auction: MULE.corralPerPlayer for every seat. */
export function newLandMules(players: number): number {
  return players * MULE.corralPerPlayer;
}

/** The corral's build target: a month's new land and MULE.spareInCorral more. upkeep builds to it; the AI's outlook reads it. */
export function corralTarget(players: number): number {
  return newLandMules(players) + MULE.spareInCorral;
}

/** MULEs the colony will want next month: one for each idle plot, plus a month's new land while land is still to be granted. */
export function mulesWanted(state: GameState): number {
  const idle = state.tiles.filter((t) => t.owner && !t.outfit).length;
  const free = state.tiles.some((t) => t.terrain !== 'store' && !t.owner);
  return idle + (free ? newLandMules(state.players.length) : 0);
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

/** What every worked plot of a good is set to make this month, before Energy shortfalls and events. */
export function expectedOutput(state: GameState, good: Good): number {
  let made = 0;
  for (const t of state.tiles) {
    if (!t.owner || t.outfit !== good) continue;
    made += isFactory(good) ? factoryFit(state, t, good, t.owner).output : rawOutput(state, t);
  }
  return made;
}

/**
 * How short the colony is of a good (pricing RULE-6, first match wins): off-world when only the export ship wants it;
 * severe after colonists went short of it at the last upkeep; normal while production keeps up with demand or the
 * colony holds normalCover months of it; then tight, short and severe by its months of cover.
 */
export function priceBand(
  state: GameState,
  good: Good,
  demand = monthlyDemand(state),
  lastShortages: readonly Good[] = state.history.at(-2)?.shortages ?? [], // literal-ok: last month's report, a position in the history
  off = exportDemand(state),
): PriceBand {
  const need = demand[good];
  if (need - off[good] <= 0) return 'offWorld';
  if (lastShortages.includes(good)) return 'severe';
  const months = colonySupply(state, good) / need;
  if (months >= PRICE.normalCover || expectedOutput(state, good) >= need) return 'normal';
  if (months >= PRICE.tightCover) return 'tight';
  if (months >= PRICE.shortCover) return 'short';
  return 'severe';
}

/** How many times the normal price N a band's target is; 1 for normal and off-world. */
function bandMultiple(band: PriceBand): number {
  return band === 'normal' || band === 'offWorld' ? 1 : PRICE.band[band];
}

/** The mid a band aims at: the off-world price, or the normal price N times the band's multiple. */
function bandTarget(state: GameState, good: Good, band: PriceBand): number {
  return band === 'offWorld' ? state.store.offWorld[good] : state.store.refPrice[good] * bandMultiple(band);
}

/**
 * This month's mid and band for a good (pricing RULE-7): straight up to a higher band target, down at most fallStep a
 * month, never under the normal price unless off-world; pulled towards a high trade between players and lifted past a sell-out they bid
 * over; never above the ceiling, which always wins.
 */
function nextPosting(state: GameState, good: Good, demand: Stock, lastShortages: readonly Good[], off: Stock): { mid: number; band: PriceBand } {
  const prev = state.store.posted[good];
  const band = priceBand(state, good, demand, lastShortages, off);
  const target = bandTarget(state, good, band);
  let mid = target >= prev ? target : Math.max(target, prev * (1 - PRICE.fallStep));
  // An export-only good follows the off-world price wherever it goes; the colony's normal price is no floor for it.
  if (band !== 'offWorld') mid = Math.max(mid, state.store.refPrice[good]);
  const lesson = state.store.lastWalk?.[good];
  // Last month's selling line: the store's band and mid are still last month's until postPrices writes them.
  const highTrade = lesson?.highTrade ?? null;
  if (highTrade !== null && highTrade > storeLines(state, good).sell) mid = Math.max(mid, prev + PRICE.tradePull * (highTrade - prev));
  const soldOutHigh = lesson?.soldOutHigh ?? null;
  if (soldOutHigh !== null) mid = Math.max(mid, soldOutHigh / (1 + PRICE.bandSpread[band].over));
  mid = Math.min(mid, PRICE.ceiling * GOOD_CONFIG[good].refPrice);
  return { mid: Math.max(1, Math.round(mid)), band };
}

/** Posts this month's prices and bands from last month's walk, which it then clears. */
export function postPrices(state: GameState): void {
  const demand = monthlyDemand(state);
  // This month's report is already open; last month's says what colonists lacked.
  const lastShortages = state.history.at(-2)?.shortages ?? []; // literal-ok: last month's report, a position in the history
  const off = exportDemand(state);
  const next = GOODS.map((good) => nextPosting(state, good, demand, lastShortages, off));
  const band: Partial<Record<Good, PriceBand>> = {};
  GOODS.forEach((good, i) => {
    state.store.posted[good] = next[i]!.mid;
    band[good] = next[i]!.band;
  });
  // New records, never edits: an AI's what-if copy may share the old ones.
  state.store.band = band;
  state.store.lastWalk = {};
}

/** The mid the store would post for a good now (nextPosting). AI players use this to price what an extra unit would do. */
export function nextPostedPrice(
  state: GameState,
  good: Good,
  demand = monthlyDemand(state),
  lastShortages: readonly Good[] = state.history.at(-2)?.shortages ?? [], // literal-ok: last month's report, a position in the history
  off = exportDemand(state),
): number {
  return nextPosting(state, good, demand, lastShortages, off).mid;
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

/** The spread of the band a good was posted in this month; normal for a record that has none. */
function spreadOf(state: GameState, good: Good): { under: number; over: number } {
  return PRICE.bandSpread[state.store.band?.[good] ?? 'normal'];
}

/** What the store sells a good at around a mid price, with its band's spread: rounded up, or unrounded with `exact` for a forecast. */
export function storeSellAt(state: GameState, good: Good, mid: number, { exact = false } = {}): number {
  const line = mid * (1 + spreadOf(state, good).over);
  if (exact) return line;
  const whole = Math.round(line);
  // 1 + 0.1 is a hair over 1.1 in floating point, so 50 × 1.1 lands a hair over 55: that close to a whole number, it is one.
  return Math.abs(line - whole) <= Number.EPSILON * line ? whole : Math.ceil(line);
}

/** What the store pays for a good around a mid price, with its band's spread: rounded down to at least 1, or unrounded with `exact`. */
export function storeBuyAt(state: GameState, good: Good, mid: number, { exact = false } = {}): number {
  const line = mid * (1 - spreadOf(state, good).under);
  if (exact) return line;
  const whole = Math.round(line);
  // The sell side's float, mirrored: 1 - 0.3 is a hair under 0.7, so 90 × 0.7 lands a hair under 63: that close, it is 63.
  return Math.max(1, Math.abs(line - whole) <= Number.EPSILON * line ? whole : Math.floor(line));
}

/** The highest mid price whose exact selling line the colonists' budget for a good still covers. */
export function colonistAffordable(state: GameState, good: Good): number {
  return (UPKEEP.colonistBudget[good] ?? 0) / (1 + spreadOf(state, good).over);
}

/**
 * The store's two lines for a good, whether or not it trades today: the auction's board is drawn around both. It never
 * buys Food or Water above what colonists can pay once it sells on (pricing HC-4), nor above its own selling price.
 */
export function storeLines(state: GameState, good: Good): { buy: number; sell: number } {
  const posted = colonyPrice(state, good);
  let buy = storeBuyAt(state, good, posted);
  if (good === 'food' || good === 'water') {
    const cap = Math.floor((UPKEEP.colonistBudget[good] ?? 0) / (1 + spreadOf(state, good).over) ** 2); // literal-ok: the spread applies twice, store buys then sells
    buy = Math.max(1, Math.min(buy, cap));
  }
  return { buy, sell: Math.max(storeSellAt(state, good, posted), buy + 1) };
}

/**
 * What the store charges and what it pays, or null where it doesn't trade:
 * no sell price with an empty shelf, no buy price when it wants no more.
 * storeLines' numbers with nulls where the store won't trade; every screen and the AI read this (pricing HC-3).
 */
export function storeQuotes(state: GameState, good: Good): { buy: number | null; sell: number | null } {
  const lines = storeLines(state, good);
  return {
    buy: storeWants(state, good) > 0 ? lines.buy : null,
    sell: storeForSale(state, good) > 0 ? lines.sell : null,
  };
}

/** The off-world price expected `monthsAhead` from now; pure, never draws. Nothing moves that price yet, so it is today's. */
export function expectedOffWorld(state: GameState, good: Good, monthsAhead: number): number {
  return state.store.offWorld[good];
}

/**
 * Units the store will sell to players. It keeps back the Food and Water its
 * colonists will buy at the end of the month: the colony's own people come
 * first, so a short good runs out for the players, not for the colonists.
 */
export function storeForSale(state: GameState, good: Good): number {
  const need = state.colonists / UPKEEP.colonistsPerUnit + (good === 'food' ? festivalFood(state) : 0);
  const reserve = good === 'food' || good === 'water' ? Math.ceil(need) : 0;
  return Math.max(0, state.store.stock[good] - reserve);
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
 * Learns from what players actually paid each other. The reference is the price at normal supply, so a trade counts
 * divided by the multiple of the band the good was posted in this month: a trade at a shortage's price says nothing
 * about the normal one. It also drifts a little toward the off-world price, because ships keep bringing that price
 * back into the colony.
 */
export function driftReference(state: GameState, good: Good, clearingPrice: number | null): void {
  const ref = state.store.refPrice[good];
  const implied = clearingPrice !== null ? clearingPrice / bandMultiple(state.store.band?.[good] ?? 'normal') : ref;
  const next = ref + (implied - ref) * PRICE.refDrift + (state.store.offWorld[good] - ref) * PRICE.worldPull;
  state.store.refPrice[good] = Math.max(1, Math.round(next));
}

/** Takes the sales tax from a player's sale: the tax goes to the colony fund and the seller keeps the rest. */
export function taxSale(state: GameState, sellerId: string, total: number): number {
  const tax = Math.round(total * state.treasury.salesTax);
  fundIn(state, 'salesTax', tax);
  state.treasury.paid[sellerId] = (state.treasury.paid[sellerId] ?? 0) + tax;
  return total - tax;
}
