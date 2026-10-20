import { GAME, GOOD_CONFIG, MULE, PRICE, UPKEEP } from './config.js';
import { cover, exportPrice, importPrice, monthlyDemand, storeQuotes } from './economy.js';
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
    player.hungry = player.stock.food < UPKEEP.food;
    player.stock.food = Math.max(0, player.stock.food - UPKEEP.food);
    player.stock.water = Math.max(0, player.stock.water - UPKEEP.water);
  }

  // Colonists eat from the colony store.
  const colonistNeed = state.colonists / UPKEEP.colonistsPerUnit;
  let fed = true;
  for (const good of ['food', 'water'] as const) {
    if (state.store.stock[good] < colonistNeed) {
      shortages.add(good);
      fed = false;
    }
    state.store.stock[good] = Math.max(0, state.store.stock[good] - colonistNeed);
  }
  state.colonists = Math.round(state.colonists * (fed ? 1.04 : 0.95));

  // Spoilage, then overflow above the depot is sold to the store at half price.
  for (const player of state.players) {
    for (const good of GOODS) {
      const kept = player.stock[good] * (1 - GOOD_CONFIG[good].spoilage);
      player.stock[good] = Math.floor(kept);
      const overflow = player.stock[good] - UPKEEP.depotCapacity;
      if (overflow > 0) {
        // Sold to the store at half price, as far as the fund can pay; the rest is lost.
        const price = Math.max(1, Math.floor(storeQuotes(state, good).buy / 2));
        const paid = Math.min(overflow, Math.floor(Math.max(0, state.store.fund) / price));
        player.stock[good] -= overflow;
        player.money += paid * price;
        state.store.stock[good] += overflow;
        state.store.fund -= paid * price;
      }
    }
  }
  for (const good of GOODS) {
    state.store.stock[good] = Math.floor(state.store.stock[good] * (1 - GOOD_CONFIG[good].spoilage));
  }

  const demand = monthlyDemand(state);

  // The export ship calls every few months and buys the store's surplus
  // (anything above two months of cover) at the export price.
  if (state.month % GAME.exportShipEvery === 0) {
    for (const good of GOODS) {
      const keep = Math.ceil(demand[good] * PRICE.targetCover);
      const surplus = state.store.stock[good] - keep;
      if (surplus > 0) {
        state.store.stock[good] -= surplus;
        state.store.fund += Math.floor(surplus * exportPrice(state, good));
      }
    }
  }

  // The store orders imports for anything under one month of cover.
  for (const good of GOODS) {
    if (demand[good] <= 0 || cover(state, good, demand) >= 1) continue;
    const want = Math.ceil(demand[good] * 2 - state.store.stock[good]);
    const unit = Math.ceil(importPrice(state, good));
    const affordable = Math.min(want, Math.floor(state.store.fund / unit));
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
