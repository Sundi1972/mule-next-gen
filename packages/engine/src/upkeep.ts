import { GAME, GOOD_CONFIG, HEALTH, MULE, POLLUTION, PRICE, UPKEEP } from './config.js';
import { electronicsNeed, healthOn, medicineNeed, nextSickShare, sickShare } from './health.js';
import { corralTarget, festivalFood, monthlyDemand, planShip, shipInPort, shipPrice } from './economy.js';
import { airBand } from './pollution.js';
import { ceilUse, plotsUse } from './production.js';
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
  // CREW prototype: the household eats first, then the crews eat their table share; what they lack is remembered.
  for (const player of state.players) {
    const use = plotsUse(state, player.id);
    const short = { food: 0, water: 0 };
    for (const good of ['food', 'water'] as const) {
      const base = good === 'food' ? UPKEEP.baseFood : UPKEEP.baseWater;
      player.stock[good] = Math.max(0, player.stock[good] - base);
      const crewNeed = ceilUse(use[good]);
      const eaten = Math.min(crewNeed, player.stock[good]);
      player.stock[good] -= eaten;
      short[good] = crewNeed > 0 ? (crewNeed - eaten) / crewNeed : 0;
    }
    player.crewShort = short;
  }

  // Colonists take their Food and Water from the store, free, as far as its shelf holds them (needs C1, RULE-1):
  // they hold no money and the meal moves none (HC-2). The store kept their month back from the players (HC-3).
  const colonistBase = state.colonists / UPKEEP.colonistsPerUnit;
  const meal: NonNullable<MonthReport['colonistMeal']> = { colonists: state.colonists, food: { need: 0, took: 0 }, water: { need: 0, took: 0 } };
  let fed = true;
  const colonistShort = { food: 0, water: 0 };
  for (const good of ['food', 'water'] as const) {
    // A festival month the colonists eat more Food (G-5 C26).
    const need = colonistBase + (good === 'food' ? festivalFood(state) : 0);
    const { took, short } = colonistMeal(need, state.store.stock[good]);
    if (short > 0) {
      fed = false;
      shortages.add(good);
    }
    colonistShort[good] = short;
    state.store.stock[good] -= took;
    meal[good] = { need, took };
  }
  // The month's report keeps the meal for the month-end line (C6). A what-if shares the real report: it writes nothing.
  const report = state.history.at(-1);
  if (report?.month === state.month && !state.whatIf) report.colonistMeal = meal;
  // HEALTH prototype: colonists take their Medicine free from the store; Electronics only a full month's want (bonus).
  const h = sickShare(state);
  const medNeed = medicineNeed(state);
  const medTaken = healthOn() ? Math.min(medNeed, state.store.stock.medicine) : 0;
  const sM = healthOn() ? (medNeed > 0 ? (medNeed - medTaken) / medNeed : 0) : medNeed > 0 ? Math.max(0, medNeed - state.store.stock.medicine) / medNeed : 0;
  if (healthOn()) {
    state.store.stock.medicine -= medTaken;
    if (sM > 1e-9) shortages.add('medicine');
  }
  const eNeed = electronicsNeed(state);
  const eTaken = Math.min(eNeed, state.store.stock.electronics);
  const eMet = eTaken >= eNeed - 1e-9;
  if (HEALTH.mode === 'healthE') state.store.stock.electronics -= eTaken;
  const hNext = healthOn() ? nextSickShare(h, colonistShort.food, colonistShort.water, HEALTH.freeMedicine ? 0 : sM) : h;
  state.health = { month: state.month, h: hNext, hBefore: h, sF: colonistShort.food, sW: colonistShort.water, sM, medNeed, medTaken, eNeed, eMet, eShare: eNeed > 0 ? eTaken / eNeed : 0 };

  // In Collapse colonists leave whatever they eat.
  const growth = airBand(state.air).name === 'collapse' ? 1 - POLLUTION.collapseLeave : (fed ? UPKEEP.colonistGrowth.fed : UPKEEP.colonistGrowth.hungry) - (healthOn() ? HEALTH.growthAtMax * (h / HEALTH.max) : 0);
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
