import { GAME, GOOD_CONFIG, MULE, POLLUTION, PRICE, UPKEEP } from './config.js';
import { corralTarget, festivalFood, monthlyDemand, planShip, shipInPort, shipPrice } from './economy.js';
import { airBand } from './pollution.js';
import { needsOf } from './production.js';
import { GOODS, type GameState, type Good, type MonthReport } from './types.js';

/**
 * RULE-1, the colonists' meal of one good: they take their need from the shelf, as far as it holds it, and pay
 * nothing. `short` is the share of their need they went without, 0 to 1; 0 when they need none.
 */
export function colonistMeal(need: number, stock: number): { took: number; short: number } {
  const took = Math.min(need, Math.max(0, stock));
  return { took, short: need > 0 ? (need - took) / need : 0 };
}

/**
 * End of month: players and colonists eat, goods spoil, anything above the
 * home depot is lost, the export ship takes the store's surplus and
 * leaves, and the store builds MULEs. Nothing is imported: the colony lives
 * on what its players make. Returns the goods the store ran out of before
 * its colonists had enough, and whether colonists went short at all.
 */
export function runUpkeep(state: GameState): { shortages: Good[]; hungry: boolean } {
  const shortages = new Set<Good>();

  // Players. Energy for plots was already paid in production.
  for (const player of state.players) {
    const needs = needsOf(state, player.id);
    player.stock.food = Math.max(0, player.stock.food - needs.food);
    player.stock.water = Math.max(0, player.stock.water - needs.water);
  }

  // Colonists take their Food and Water from the store, free, as far as its shelf holds them (needs C1, RULE-1):
  // they hold no money and the meal moves none (HC-2). The store kept their month back from the players (HC-3).
  const colonistBase = state.colonists / UPKEEP.colonistsPerUnit;
  const meal: NonNullable<MonthReport['colonistMeal']> = { colonists: state.colonists, food: { need: 0, took: 0 }, water: { need: 0, took: 0 } };
  let fed = true;
  for (const good of ['food', 'water'] as const) {
    // A festival month the colonists eat more Food (G-5 C26).
    const need = colonistBase + (good === 'food' ? festivalFood(state) : 0);
    const { took, short } = colonistMeal(need, state.store.stock[good]);
    if (short > 0) {
      fed = false;
      shortages.add(good);
    }
    state.store.stock[good] -= took;
    meal[good] = { need, took };
  }
  // The month's report keeps the meal for the month-end line (C6). A what-if shares the real report: it writes nothing.
  const report = state.history.at(-1);
  if (report?.month === state.month && !state.whatIf) report.colonistMeal = meal;
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
    // The colonists have eaten: a festival's extra Food is no longer demand.
    const demand = monthlyDemand(state, 0);
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

  // The store builds MULEs from Smithore, enough for next month's new land plus a few.
  const muleTarget = corralTarget(state.players.length);
  const build = Math.max(0, Math.min(muleTarget - state.store.mules, Math.floor(state.store.stock.smithore / MULE.smithorePerMule)));
  state.store.stock.smithore -= build * MULE.smithorePerMule;
  state.store.mules += build;

  return { shortages: [...shortages], hungry: !fed };
}
