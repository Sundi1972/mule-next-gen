import { GAME, GOOD_CONFIG, MULE, POLLUTION, PRICE, UPKEEP } from './config.js';
import { monthlyDemand, planShip, shipInPort, shipPrice } from './economy.js';
import { airBand } from './pollution.js';
import { needsOf } from './production.js';
import { GOODS, type GameState, type Good } from './types.js';

/**
 * End of month: players and colonists eat, goods spoil, anything above the
 * home depot is lost, the export ship takes the store's surplus and
 * leaves, and the store builds MULEs. Nothing is imported: the colony lives
 * on what its players make. Returns the goods the store ran out of before
 * its colonists had enough, and whether colonists went short at all (also
 * when the price was more than their wages pay).
 */
export function runUpkeep(state: GameState): { shortages: Good[]; hungry: boolean } {
  const shortages = new Set<Good>();

  // Players. Energy for plots was already paid in production.
  for (const player of state.players) {
    const needs = needsOf(state, player.id);
    player.stock.food = Math.max(0, player.stock.food - needs.food);
    player.stock.water = Math.max(0, player.stock.water - needs.water);
  }

  // Colonists buy their Food and Water from the store at its selling price,
  // out of wages paid from off-world. When the shelf is empty or the price is
  // more than they can pay, they go short.
  const colonistNeed = state.colonists / UPKEEP.colonistsPerUnit;
  let fed = true;
  for (const good of ['food', 'water'] as const) {
    // The store's selling price; the share it kept back is theirs to buy.
    const price = Math.ceil(state.store.posted[good] * (1 + PRICE.storeSpread));
    const budget = colonistNeed * (UPKEEP.colonistBudget[good] ?? 0);
    const bought = Math.min(colonistNeed, state.store.stock[good], budget / price);
    if (bought < colonistNeed) fed = false;
    if (state.store.stock[good] < colonistNeed) shortages.add(good);
    state.store.stock[good] = Math.max(0, state.store.stock[good] - bought);
    state.store.capital += Math.round(bought * price);
  }
  // In Collapse colonists leave whatever they eat.
  const growth = airBand(state.air).name === 'collapse' ? 1 - POLLUTION.collapseLeave : fed ? UPKEEP.colonistGrowth.fed : UPKEEP.colonistGrowth.hungry;
  state.colonists = Math.round(state.colonists * growth);

  // Spoilage, then anything above the home depot is lost. Selling it in time
  // is the player's own decision.
  for (const player of state.players) {
    for (const good of GOODS) {
      player.stock[good] = Math.min(UPKEEP.depotCapacity, Math.floor(player.stock[good] * (1 - GOOD_CONFIG[good].spoilage)));
    }
  }
  for (const good of GOODS) {
    // The store has proper storage, so its goods spoil much more slowly.
    state.store.stock[good] = Math.floor(state.store.stock[good] * (1 - GOOD_CONFIG[good].spoilage * PRICE.storeSpoilage));
  }

  // The export ship takes the store's surplus last, after the players sold to
  // it at the auction, then leaves and announces its next call.
  if (shipInPort(state)) {
    const demand = monthlyDemand(state);
    for (const good of state.ship.goods) {
      let surplus = state.store.stock[good] - Math.ceil(demand[good] * PRICE.targetCover);
      for (let price = shipPrice(state, good); surplus > 0 && price !== null; price = shipPrice(state, good)) {
        state.store.stock[good]--;
        state.store.capital += price;
        state.ship.hold[good] = (state.ship.hold[good] ?? 0) - 1;
        state.ship.bought[good] = (state.ship.bought[good] ?? 0) + 1;
        surplus--;
      }
    }
    state.ship = planShip(state.seed, state.month + GAME.exportShipEvery, state.players.length);
  }

  // The store builds MULEs from Smithore, enough for every plot claimed next
  // month plus a few.
  const muleTarget = state.players.length * GAME.claimsPerGrant + MULE.spareInCorral;
  const build = Math.max(0, Math.min(muleTarget - state.store.mules, Math.floor(state.store.stock.smithore / MULE.smithorePerMule)));
  state.store.stock.smithore -= build * MULE.smithorePerMule;
  state.store.mules += build;

  return { shortages: [...shortages], hungry: !fed };
}
