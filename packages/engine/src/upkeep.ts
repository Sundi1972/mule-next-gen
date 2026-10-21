import { EXPORT_DEMAND, GAME, GOOD_CONFIG, MULE, POLLUTION, PRICE, UPKEEP } from './config.js';
import { airBand } from './pollution.js';
import { colonyPrice, cover, exportPrice, importPrice, monthlyDemand, storeQuotes, storeWants } from './economy.js';
import { addStock, emptyStock } from './stock.js';
import { GOODS, type GameState, type Good } from './types.js';

/**
 * End of month: players and colonists eat, goods spoil, overflow above the
 * home depot goes to the store, the store orders imports and builds MULEs.
 * Returns the goods the colony ran short of.
 */
export function runUpkeep(state: GameState): Good[] {
  const shortages = new Set<Good>();

  // Imports ordered last month arrive.
  addStock(state.store.stock, state.store.pendingImports);
  state.store.pendingImports = emptyStock();

  // Players. Energy for plots was already paid in production.
  for (const player of state.players) {
    player.stock.food = Math.max(0, player.stock.food - UPKEEP.food);
    player.stock.water = Math.max(0, player.stock.water - UPKEEP.water);
  }

  // Colonists buy their Food and Water from the store at the colony price,
  // out of wages paid from off-world. When the price is more than they can
  // pay, they go short, just as when the shelves are empty.
  const colonistNeed = state.colonists / UPKEEP.colonistsPerUnit;
  let fed = true;
  for (const good of ['food', 'water'] as const) {
    const price = colonyPrice(state, good);
    const budget = colonistNeed * UPKEEP.colonistBudget[good];
    const bought = Math.min(colonistNeed, state.store.stock[good], budget / price);
    if (bought < colonistNeed) {
      shortages.add(good);
      fed = false;
    }
    state.store.stock[good] = Math.max(0, state.store.stock[good] - bought);
    state.store.fund += Math.round(bought * price);
  }
  // In Collapse colonists leave whatever they eat.
  const growth = airBand(state.air).name === 'collapse' ? 1 - POLLUTION.collapseLeave : fed ? 1.04 : 0.95;
  state.colonists = Math.round(state.colonists * growth);

  // Spoilage, then overflow above the depot is sold to the store at half price.
  for (const player of state.players) {
    for (const good of GOODS) {
      const kept = player.stock[good] * (1 - GOOD_CONFIG[good].spoilage);
      player.stock[good] = Math.floor(kept);
      const overflow = player.stock[good] - UPKEEP.depotCapacity;
      if (overflow > 0) {
        // Sold to the store at half price, as far as the store wants it; the rest is lost.
        const price = Math.max(1, Math.floor(storeQuotes(state, good).buy / 2));
        const paid = Math.min(overflow, storeWants(state, good, price));
        player.stock[good] -= overflow;
        player.money += paid * price;
        state.store.stock[good] += paid;
        state.store.fund -= paid * price;
      }
    }
  }
  for (const good of GOODS) {
    // The store has proper storage, so its goods spoil much more slowly.
    state.store.stock[good] = Math.floor(state.store.stock[good] * (1 - GOOD_CONFIG[good].spoilage * PRICE.storeSpoilage));
  }

  const demand = monthlyDemand(state);

  // The export ship calls every few months and buys the store's surplus
  // (anything above two months of cover) at the export price, as far as
  // off-world buyers want it.
  if (state.month % GAME.exportShipEvery === 0) {
    for (const good of GOODS) {
      const keep = Math.ceil(demand[good] * PRICE.targetCover);
      const hold = (EXPORT_DEMAND[good] ?? 0) * state.players.length * GAME.exportShipEvery;
      const surplus = Math.min(hold, state.store.stock[good] - keep);
      if (surplus > 0) {
        state.store.stock[good] -= surplus;
        state.store.fund += Math.floor(surplus * exportPrice(state, good));
      }
    }
  }

  // The store orders imports for anything under one month of cover, but only
  // when the colony price is above what an import costs: a merchant doesn't
  // import at a loss.
  for (const good of GOODS) {
    if (demand[good] <= 0 || cover(state, good, demand) >= 1) continue;
    if (colonyPrice(state, good, demand) < importPrice(state, good)) continue;
    const want = Math.ceil(demand[good] * 2 - state.store.stock[good]);
    const unit = Math.ceil(importPrice(state, good));
    const affordable = Math.min(want, Math.floor((Math.max(0, state.store.fund) * PRICE.storeBudgetShare) / unit));
    if (affordable > 0) {
      state.store.pendingImports[good] += affordable;
      state.store.fund -= affordable * unit;
    }
  }

  // The store turns Alloy into MULEs, keeping a few in stock. Its small
  // smelter turns Smithore into Alloy when it runs short.
  const muleTarget = state.players.length + 2;
  while (state.store.mules < muleTarget) {
    if (state.store.stock.alloy < MULE.alloyPerMule) {
      if (state.store.stock.smithore < MULE.storeSmithorePerAlloy) break;
      state.store.stock.smithore -= MULE.storeSmithorePerAlloy;
      state.store.stock.alloy += 1;
    }
    state.store.stock.alloy -= MULE.alloyPerMule;
    state.store.mules++;
  }

  return [...shortages];
}
