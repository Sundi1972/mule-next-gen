import { colonistMedicineNeed, electronicsComfort, grownColonists, moodBand, nextSickShare, severity, sickShare, type ColonistMonth } from './colony.js';
import { GAME, GOOD_CONFIG, HAPPINESS, HARDSHIP, HEALTH, MULE, POLLUTION, PRICE, UPKEEP } from './config.js';
import { corralTarget, festivalFood, monthlyDemand, planShip, shipInPort, shipPrice } from './economy.js';
import { airBand } from './pollution.js';
import { needsOf } from './production.js';
import { GOODS, type GameState, type Good, type MonthReport } from './types.js';

/**
 * RULE-1, the colonists' meal of one good: they take their need from the shelf, as far as it holds it, and pay
 * nothing. `short` is the share of their need they went without, 0 to 1; 0 when they need none. A player's household
 * and crews eat from the player's stock the same way.
 */
export function colonistMeal(need: number, stock: number): { took: number; short: number } {
  const took = Math.min(need, Math.max(0, stock));
  return { took, short: need > 0 ? (need - took) / need : 0 };
}

/**
 * The colony's growth factor this month from `short`, how short its colonists went (needs RULE-5): Collapse air drives
 * them out whatever they ate; fed or within the tolerance it grows, past it it shrinks in proportion to the share
 * missing. The mood's band adds its migration, read before this month's mood steps. Never below 0. Sickness slows it
 * further (grownColonists).
 */
export function growthRate(state: GameState, short: number): number {
  if (airBand(state.air).name === 'collapse') return Math.max(0, 1 - POLLUTION.collapseLeave);
  const meal = short <= HARDSHIP.tolerance ? UPKEEP.colonistGrowth.fed : 1 - UPKEEP.colonistShrinkPerShortfall * short;
  const migration = state.colony ? HAPPINESS.migration[moodBand(state.colony.happiness)] : 0;
  return Math.max(0, meal + migration);
}

/**
 * End of month: players and colonists eat, goods spoil, anything above the
 * home depot is lost, the export ship takes the store's surplus and
 * leaves, and the store builds MULEs. Nothing is imported: the colony lives
 * on what its players make. Returns the goods the store ran out of before
 * its colonists had enough, whether colonists went short at all, and how they fared at their meal, for the colony's
 * sick share and mood.
 */
export function runUpkeep(state: GameState): { shortages: Good[]; hungry: boolean; colonistMonth: ColonistMonth } {
  const shortages = new Set<Good>();

  // Players. Energy for plots was already paid in production. The household eats first, then the crews, from what is
  // left; how short the household went of Food makes the player hungry next development (needs C15), how short the
  // crews went slows next month's production (needs C14).
  for (const player of state.players) {
    const needs = needsOf(state, player.id);
    const crewShort = { food: 0, water: 0 };
    for (const good of ['food', 'water'] as const) {
      const base = good === 'food' ? UPKEEP.baseFood : UPKEEP.baseWater;
      const home = colonistMeal(base, player.stock[good]);
      const crews = colonistMeal(needs[good] - base, player.stock[good] - home.took);
      player.stock[good] = Math.max(0, player.stock[good] - home.took - crews.took);
      crewShort[good] = crews.short;
      if (good === 'food') player.householdShort = home.short;
    }
    player.crewShort = crewShort;
  }

  // Colonists take their Food and Water from the store, free, as far as its shelf holds them (needs C1, RULE-1):
  // they hold no money and the meal moves none (HC-2). The store kept their month back from the players (HC-3).
  const colonistBase = state.colonists / UPKEEP.colonistsPerUnit;
  const meal: NonNullable<MonthReport['colonistMeal']> = { colonists: state.colonists, food: { need: 0, took: 0 }, water: { need: 0, took: 0 } };
  const colonistMonth: ColonistMonth = { short: { food: 0, water: 0, medicine: 0 }, comfort: 0 };
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
    colonistMonth.short[good] = short;
  }
  // With colony health on, they take their Medicine and Electronics the same way: free, as far as the shelf holds them.
  if (HEALTH.enabled && state.colony) {
    const medicine = colonistMeal(colonistMedicineNeed(state), state.store.stock.medicine);
    state.store.stock.medicine -= medicine.took;
    colonistMonth.short.medicine = medicine.short;
    // Reported like Food and Water, so the store's price and the computer players' outlook see it; not `fed`.
    if (medicine.short > 0) shortages.add('medicine');
    const electronics = electronicsComfort(state.colonists, state.store.stock.electronics);
    state.store.stock.electronics -= electronics.took;
    colonistMonth.comfort = electronics.met;
  }
  // The month's report keeps the meal for the month-end line (C6). A what-if shares the real report: it writes nothing.
  const report = state.history.at(-1);
  if (report?.month === state.month && !state.whatIf) report.colonistMeal = meal;
  // In Collapse colonists leave whatever they eat or ail. Otherwise the month's new sick share, the one runColony
  // writes from the same meal, slows their growth here, so the export ship and the fund below read the final size.
  const rate = growthRate(state, severity(colonistMonth.short));
  const ailing = HEALTH.enabled && state.colony && airBand(state.air).name !== 'collapse';
  state.colonists = grownColonists(state.colonists, rate, ailing ? nextSickShare(sickShare(state)!, colonistMonth.short) : 0);

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

  return { shortages: [...shortages], hungry: !fed, colonistMonth };
}
