import {
  AI_VALUE,
  airPoints,
  crewOf,
  DEV_STEER,
  DEV_WALK,
  DEVELOPMENT,
  FACTORY,
  factoryFit,
  floorConfig,
  GOOD_CONFIG,
  isFactory,
  monthNeeds,
  mulePrice,
  mulePriceFor,
  monthsToExperience,
  needsOf,
  outfitCostFor,
  pace,
  playerEventChance,
  POLLUTION,
  PRICE,
  PROCESSED_GOODS,
  rawOutput,
  RECIPES,
  SPECIES_PERK,
  STRATEGIST,
  storeForSale,
  storeQuotes,
  storeSellLine,
  tileIndex,
  UPKEEP,
  walkSeconds,
  WALK,
  energyOffOrder,
  energyUseOf,
  type AiLevelConfig,
  type AiPersonaWeights,
  type GameState,
  type Good,
  type Outfit,
  type ProcessedGood,
  type Stock,
  type Tile,
} from '@mule/engine';
import { standPoint, tripSeconds } from './floor-time.js';
import { belief, outlook, productionsLeft, type Outlook } from './outlook.js';

/** Who is thinking: the seat, its persona and its level. */
export interface Mind {
  me: string;
  personaId: string;
  persona: AiPersonaWeights;
  levelId: string;
  level: AiLevelConfig;
  /** Seeded per seat: breaks ties between plots it values the same, so seats don't all follow the map's order. */
  salt?: number;
}

export interface Yield {
  made: number;
  energy: number;
  /** Factory inputs other than Energy, per run. */
  inputs: Partial<Stock>;
  air: number;
  crew: number;
}

/** What an outfit would make on a tile for this player, on the ground the seat knows (the observation's). */
export function yieldOf(obs: GameState, tile: Tile, outfit: Outfit, me: string): Yield {
  const index = obs.tiles.indexOf(tile);
  const probe: Tile = { ...tile, owner: me, outfit, runMonths: tile.outfit === outfit ? tile.runMonths : 0 };
  obs.tiles[index] = probe;
  try {
    const air = airPoints(probe);
    if (outfit === 'greenBelt') return { made: 0, energy: 0, inputs: {}, air: 0, crew: UPKEEP.crew.greenBelt };
    if (isFactory(outfit)) {
      const fit = factoryFit(obs, probe, outfit, me);
      const { energy: _e, ...inputs } = RECIPES[outfit].inputs;
      return { made: fit.output, energy: fit.energy, inputs, air, crew: UPKEEP.crew.factory };
    }
    return { made: rawOutput(obs, probe), energy: energyUseOf(obs, probe), inputs: {}, air, crew: UPKEEP.crew.raw };
  } finally {
    obs.tiles[index] = tile;
  }
}

/** What the seat counts one colony air point as costing, rising as the air gets dirtier. */
export function airUnitCost(obs: GameState): number {
  return STRATEGIST.airCost * (1 + obs.air / POLLUTION.bands[1].from);
}

/** A good's price with `extra` more units in the colony. */
export type PriceOf = (good: Good, extra?: number) => number;

/** What a seller keeps of a sale at `price` once the sales tax has gone to the colony fund. */
export const afterTax = (obs: GameState, price: number) => price * (1 - obs.treasury.salesTax);

/** The sale price that leaves a seller `kept` after the sales tax. */
export const beforeTax = (obs: GameState, kept: number) => kept / Math.max(0.01, 1 - obs.treasury.salesTax); // literal-ok: keeps the division finite at a 100% tax

/**
 * What the seat's own plots supply of a good next month, by the outlook: what they make, but for Energy what the plants
 * have left after paying their own use (AM-17 R2, PM ruling A: monthNeeds leaves that use out, so supply must too).
 */
export function ownSupply(obs: GameState, me: string, made: Stock, good: Good): number {
  if (good !== 'energy') return made[good];
  const plantsUse = obs.tiles.filter((t) => t.owner === me && t.outfit === 'energy').reduce((n, t) => n + energyUseOf(obs, t), 0);
  return Math.max(0, made.energy - plantsUse);
}

/** Net credits a month from running this outfit here, at the given prices (the outlook's by default, its own extra supply included). */
export function monthlyNet(obs: GameState, o: Outlook, y: Yield, outfit: Outfit, mind: Mind, price?: PriceOf): number {
  const full = mind.level.fullScoring;
  if (outfit === 'greenBelt') return full ? POLLUTION.greenBeltAir * airUnitCost(obs) - STRATEGIST.greenBeltCost : -STRATEGIST.greenBeltCost;
  const P: PriceOf = price ?? ((g, extra = 0) => o.price(g, extra));
  // A plant pays its own use from what it makes (AM-17 R2): only the rest is its to sell or to use.
  const made = outfit === 'energy' ? Math.max(0, y.made - y.energy) : y.made;
  let revenue = afterTax(obs, made * P(outfit, made));
  if (full && (outfit === 'food' || outfit === 'water' || outfit === 'energy') && AI_VALUE.unit) {
    revenue += ownUseGain(obs, o, outfit, made, afterTax(obs, P(outfit, made)), mind);
  } else if (full && (outfit === 'food' || outfit === 'water' || outfit === 'energy')) {
    // The units that cover its own shortfall are worth what going short would cost it, and pay no tax.
    const short = Math.max(0, monthNeeds(obs, mind.me)[outfit] - ownSupply(obs, mind.me, o.made, outfit));
    const own = Math.min(made, short);
    const floor = obs.store.refPrice[outfit] * STRATEGIST.selfSupply;
    revenue += own * Math.max(0, floor - afterTax(obs, P(outfit, made)));
  }
  const energy = outfit === 'energy' ? 0 : y.energy * P('energy', -y.energy);
  const inputs = (Object.entries(y.inputs) as [Good, number][]).reduce((n, [g, q]) => n + q * P(g, -q), 0);
  const crew = full ? y.crew * (P('food') / UPKEEP.crewPerFood + P('water') / UPKEEP.crewPerWater) : 0;
  const air = full ? y.air * airUnitCost(obs) : 0;
  return revenue - energy - inputs - crew - air;
}

/** Sum of discount^i over the months a MULE installed now will run, up to the horizon. */
export function annuity(obs: GameState): number {
  return weights(obs).reduce((n, w) => n + w.now + w.long, 0);
}

/**
 * Per month a MULE installed now will run: how much that month counts
 * (discounted), at next month's forecast price (the first month) or at the
 * outlook's later price (the months after).
 */
function weights(obs: GameState): { now: number; long: number }[] {
  const months = Math.min(productionsLeft(obs), STRATEGIST.horizon);
  const out: { now: number; long: number }[] = [];
  for (let i = 0; i < months; i++) {
    const d = Math.pow(STRATEGIST.discount, i);
    out.push(i === 0 ? { now: d, long: 0 } : { now: 0, long: d });
  }
  return out;
}

/** Credits gained by buying, outfitting and installing a MULE: its running value, less the price, plus what the developed plot adds to the final score. */
export function installGain(obs: GameState, o: Outlook, tile: Tile, outfit: Outfit, mind: Mind): { gain: number; cost: number; net: number; y: Yield } {
  const y = yieldOf(obs, tile, outfit, mind.me);
  const net = monthlyNet(obs, o, y, outfit, mind);
  // With look-ahead the later months use the rolled-forward prices; without, next month's price lasts (Rookie's mistake).
  const long = mind.level.lookAhead ? monthlyNet(obs, o, y, outfit, mind, (g, extra = 0) => o.later(g, extra)) : net;
  const running = weights(obs).reduce((n, w) => n + w.now * net + w.long * long, 0);
  const cost = (tile.outfit ? 0 : mulePriceFor(obs, mind.me)) + outfitCostFor(obs, mind.me, outfit);
  const residual = productionsLeft(obs) > 0 && !tile.outfit ? mulePrice(obs) * STRATEGIST.residual : 0;
  return { gain: running - cost + residual, cost, net, y };
}

/**
 * True when the factory could run: every input other than Energy comes from
 * the seat's own plots, or its stock lasts STRATEGIST.factoryInputMonths
 * months of runs while the household, the new factory's crew included, eats
 * and drinks from the same stock and what is left spoils between months.
 */
export function canFeed(obs: GameState, me: string, outfit: Outfit): boolean {
  if (!isFactory(outfit)) return true;
  const p = obs.players.find((q) => q.id === me)!;
  const crew = crewOf(obs, me) + UPKEEP.crew.factory;
  const household: Partial<Stock> = {
    food: UPKEEP.baseFood + Math.ceil(crew / UPKEEP.crewPerFood),
    water: UPKEEP.baseWater + Math.ceil(crew / UPKEEP.crewPerWater),
  };
  return (Object.entries(RECIPES[outfit].inputs) as [Good, number][]).every(([g, q]) => {
    if (g === 'energy' || obs.tiles.some((t) => t.owner === me && t.outfit === g)) return true;
    let carry = p.stock[g];
    for (let m = 0; m < STRATEGIST.factoryInputMonths; m++) {
      carry -= (household[g] ?? 0) + q;
      if (carry < 0) return false;
      carry = Math.floor(carry * (1 - GOOD_CONFIG[g].spoilage));
    }
    return true;
  });
}

/**
 * The seconds the seat's month of walking takes, fed and well: a round trip from the corral for each MULE it leads a
 * month, to its own plots on average (to any plot while it holds none). Hunger and sickness stretch these seconds.
 */
export function monthWalkSeconds(obs: GameState, mind: Mind): number {
  const me = mind.me;
  const p = obs.players.find((q) => q.id === me)!;
  const own = obs.tiles.filter((t) => t.owner === me);
  const plots = own.length > 0 ? own : obs.tiles.filter((t) => t.terrain !== 'store');
  const zip = p.species === 'zipwing' ? SPECIES_PERK.zipwingSpeed : 1;
  if (DEV_STEER.on) {
    // On the arcade floor, at RULE-2's speed: from the corral out to the plot leading the MULE and back to the corral.
    const cfg = floorConfig();
    const w = { pace: zip, bot: p.isAi };
    const corral = standPoint('corral', cfg.hall);
    const floorTrips = plots.reduce((n, t) => n + tripSeconds(obs, cfg, w, corral, tileIndex(obs.width, t.x, t.y), true, 'corral'), 0);
    return (mind.level.mulesPerMonth * floorTrips) / plots.length;
  }
  const trips = plots.reduce((n, t) => {
    const i = tileIndex(obs.width, t.x, t.y);
    return n + walkSeconds(obs, me, 'corral', i) + walkSeconds(obs, me, i, 'corral');
  }, 0);
  // walkSeconds is at today's pace; undo hunger and sickness, keep a Zipwing's speed.
  const healthy = pace(obs, me) / (p.species === 'zipwing' ? SPECIES_PERK.zipwingSpeed : 1);
  return (mind.level.mulesPerMonth * trips * healthy) / plots.length;
}

/** What a second of development time is worth to the seat: the pub's rate at least, more while it has land to develop. */
export function secondValue(obs: GameState, me: string): number {
  const p = obs.players.find((q) => q.id === me)!;
  const pubRate = (DEVELOPMENT.pub.start + obs.month * DEVELOPMENT.pub.perMonth) / Math.max(1, DEVELOPMENT.fullSeconds);
  const idle = obs.tiles.some((t) => t.owner === me && !t.outfit);
  return Math.max(pubRate, idle && p.money > mulePriceFor(obs, me) ? STRATEGIST.secondValue.busy : STRATEGIST.secondValue.idle);
}

/** Units of `good` to hold so that `n` are left after the month's spoilage, within what the depot keeps. */
export function keptUnits(good: Good, n: number): number {
  return Math.ceil(Math.min(n, UPKEEP.depotCapacity) / (1 - GOOD_CONFIG[good].spoilage));
}

/**
 * The units of a good the seat must hold at the auction to be whole next month. In the engine's order: upkeep eats its
 * Food and drinks its Water, then every good spoils and the depot keeps what it can; next development is hungry under
 * the household's Food, and next production turns off a plot short of its Energy, or halves a farm whose owner is
 * short of Water. Water counts only for a seat with a farm to water: without one, going short costs it nothing. 0 for
 * other goods.
 */
export function wholeNextMonth(obs: GameState, me: string, good: Good): number {
  if (good === 'food') return needsOf(obs, me).food + keptUnits(good, needsOf(obs, me).food);
  if (good === 'energy') return keptUnits(good, monthNeeds(obs, me).energy);
  const farms = obs.tiles.some((t) => t.owner === me && (UPKEEP.irrigated as readonly string[]).includes(t.outfit ?? ''));
  if (good === 'water' && farms) return needsOf(obs, me).water + keptUnits(good, needsOf(obs, me).water);
  return 0;
}

/**
 * Cash the seat keeps back: a floor plus what next month's Food, Water and
 * Energy shortfall would cost, times its reserve weight. A short unit counts
 * at most a few times its reference price, so a price spike doesn't freeze
 * all its cash. `except` leaves out a good: the one a new farm would make.
 */
export function cashReserve(obs: GameState, mind: Mind, o?: Outlook, except?: Good): number {
  if (AI_VALUE.unit) return monthReserve(obs, mind, o, except);
  const p = obs.players.find((q) => q.id === mind.me)!;
  const need = monthNeeds(obs, mind.me);
  let cost = 0;
  for (const g of ['food', 'water', 'energy'] as const) {
    if (g === except) continue;
    const short = Math.max(0, need[g] - p.stock[g] - (o ? ownSupply(obs, mind.me, o.made, g) : 0));
    cost += short * Math.min(obs.store.posted[g] * (1 + PRICE.storeSpread), obs.store.refPrice[g] * STRATEGIST.reservePriceCap);
  }
  return Math.round((STRATEGIST.cashFloor + cost) * mind.persona.reserve);
}

/**
 * The value of each unit of a good the seat could hold after the auction,
 * most valuable first: the units next month needs are worth what going short
 * would cost (development time for Food, half a farm for Water, for Energy
 * what the plot it keeps on loses turned off (AM-17), a factory's run for its
 * inputs, sickness for Medicine), the
 * rest what they fetch next month after spoilage, and nothing past what the
 * depot keeps. `keep` values a unit the seat already holds (its sell floor);
 * `buy` values one more (its buy ceiling), which needs a reason to speculate.
 * Food and Energy the household and plots need can't be sold at any price.
 */
export interface UnitValues {
  good: Good;
  keep: number[];
  buy: number[];
  /** Units next month's needs take, spoilage included. */
  block: number;
  /** Next month's need as the status screen shows it. */
  need: number;
  /** Units it never sells: the Food and Energy it needs. strategist.ts goodPlan raises it for STRATEGIST.buyShortfall. */
  floorUnits: number;
}

export function unitValues(obs: GameState, o: Outlook, good: Good, mind: Mind): UnitValues {
  if (AI_VALUE.unit) return modelValues(obs, o, good, mind);
  const me = mind.me;
  const need = monthNeeds(obs, me)[good];
  const full = mind.level.fullScoring;
  const spoil = full ? GOOD_CONFIG[good].spoilage : 0;
  const keepRate = 1 - spoil;
  const mine = obs.tiles.filter((t) => t.owner === me && t.outfit && t.outfit !== 'greenBelt');
  const P = (g: Good) => (o.final ? obs.store.posted[g] : o.price(g));
  const sec = secondValue(obs, me);

  // Units next month's needs take, and what each is worth to the seat (`perUnit`, where the units differ).
  let block = 0;
  let use = 0;
  let perUnit: number[] | null = null;
  if (good === 'food' && need > 0) {
    // Eaten at upkeep, then what is left (after spoilage) keeps next month's walking at full pace.
    const eat = needsOf(obs, me).food;
    block = eat + Math.ceil(eat / keepRate);
    use = (monthWalkSeconds(obs, mind) * (1 / DEV_WALK.hungerPaceMin - 1) * sec) / block;
  } else if (good === 'water' && need > 0) {
    const farms = mine.filter((t) => UPKEEP.irrigated.includes(t.outfit as never));
    const drink = needsOf(obs, me).water;
    if (farms.length > 0) {
      block = drink + Math.ceil(drink / keepRate);
      use = (farms.reduce((n, t) => n + rawOutput(obs, t), 0) * (1 - UPKEEP.shortOutputShare) * afterTax(obs, P('food'))) / block;
    }
  } else if (good === 'energy') {
    // AM-17: the plants' net output covers the plots first; a unit short keeps on the plot energyOffOrder would turn
    // off at that point, worth what that plot loses turned off, over each unit of its use. Next month, so no cold snap.
    const order = energyOffOrder(obs, me, 1);
    const net = mine.filter((t) => t.outfit === 'energy').reduce((n, t) => n + Math.max(0, rawOutput(obs, t) - energyUseOf(obs, t)), 0);
    // What a plot loses turned off, a unit of its use at a time. An approximation until #385: it leaves out the inputs
    // a turned-off factory saves, and that one whose 20% rounds to 0 makes nothing (and takes nothing).
    const lost = (good: Good, full: number, use: number) => Array<number>(use).fill(afterTax(obs, (1 - UPKEEP.offOutputShare) * full * P(good)) / use);
    // Each unit of use, from the plot that goes off last (the back of the order) to the one that goes off first; then
    // the factories the stock can't feed now, which run in production's second pass on what is left, so are covered last.
    const listed = new Set(order.map((p) => p.tile));
    const unfed = PROCESSED_GOODS.flatMap((g) => mine.filter((t) => t.outfit === g && !listed.has(t)));
    const units = [
      ...order.flatMap((p) => lost(p.tile.outfit as Good, p.full, p.use)).reverse(),
      ...unfed.flatMap((t) => lost(t.outfit as Good, factoryFit(obs, t, t.outfit as ProcessedGood, me).output, energyUseOf(obs, t))),
    ];
    const short = Math.max(0, units.length - net);
    if (short > 0) {
      block = Math.ceil(short / keepRate);
      // The seat's k-th unit covers the plots' (net + k)-th; the units spoilage takes count as the last one short.
      perUnit = Array.from({ length: block }, (_, k) => units[net + Math.min(k, short - 1)]!);
    }
  } else if (good === 'medicine' && need > 0) {
    block = Math.ceil(need / keepRate);
    // A Medicine cures the sickness it may roll at development start, keeping the month's walking at full pace.
    const sick = playerEventChance(obs, 'sickness', 'development', me);
    use = sick * monthWalkSeconds(obs, mind) * (1 / DEV_WALK.sickPace - 1) * sec;
  }
  // Factory inputs: a factory's run is worth its output, shared over its inputs.
  for (const t of mine) {
    if (!isFactory(t.outfit!)) continue;
    const q = RECIPES[t.outfit].inputs[good];
    if (!q || good === 'energy') continue;
    const units = Object.values(RECIPES[t.outfit].inputs).reduce((n, x) => n + (x ?? 0), 0);
    const each = afterTax(obs, factoryFit(obs, t, t.outfit, me).output * P(t.outfit)) / units;
    const add = Math.ceil(q / keepRate);
    use = (use * block + each * add) / Math.max(1, block + add);
    block += add;
  }

  // Beyond the block: resale next month, after spoilage, the sales tax and the depot limit.
  const { sell: resale, buy: resaleBuy, room } = carryOf(obs, o, good, mind);
  const length = Math.max(block, room) + 1;
  const floorUnits = good === 'food' || good === 'energy' ? Math.min(block, need) : 0;

  const keep: number[] = [];
  const buy: number[] = [];
  for (let k = 0; k < length; k++) {
    if (k < block) {
      const worth = perUnit?.[k] ?? use;
      keep.push(k < floorUnits ? Infinity : Math.max(worth, resale));
      buy.push(Math.max(worth, resaleBuy));
    } else if (k < room) {
      keep.push(resale);
      buy.push(resaleBuy);
    } else {
      keep.push(0);
      buy.push(0);
    }
  }
  keep.sort((a, b) => b - a);
  buy.sort((a, b) => b - a);
  return { good, keep, buy, block, need, floorUnits };
}

/**
 * What a unit the seat holds past its needs fetches next month: resale after spoilage, the sales tax and the
 * forecast's risk (`sell`), and the less a seat pays for one only to resell it (`buy`); `room` is how many units it
 * can hold before the depot limit takes them, after what upkeep eats.
 */
function carryOf(obs: GameState, o: Outlook, good: Good, mind: Mind): { sell: number; buy: number; room: number } {
  const full = mind.level.fullScoring;
  const keepRate = 1 - (full ? GOOD_CONFIG[good].spoilage : 0);
  const P = (g: Good) => (o.final ? obs.store.posted[g] : o.price(g));
  const haircut = full ? 1 - STRATEGIST.forecastHaircut * mind.persona.risk : 1;
  const sell = afterTax(obs, P(good)) * keepRate * haircut;
  const buy = sell * Math.min(1, mind.persona.speculate) * (1 - STRATEGIST.resaleRisk * mind.persona.risk);
  // literal-ok: 0.05 keeps the division finite for a good that all spoils; 99 stands for no depot limit (Rookie ignores it)
  const depot = full ? Math.ceil(UPKEEP.depotCapacity / Math.max(0.05, keepRate)) : 99;
  const eaten = good === 'food' || good === 'water' ? needsOf(obs, mind.me)[good] : 0;
  return { sell, buy, room: eaten + depot };
}

// --- The resource-utility model, switched on by AI_VALUE.unit ------------------

/**
 * The chance the seat needs each unit it could hold after the auction: every unit under `sure` is needed; a unit from
 * `sure` up to `target` is needed only if its own plants make less than forecast; none past `target`.
 */
export interface UnitNeed {
  sure: number;
  target: number;
}

/** What the seat's Energy plants leave over their own use for its other plots. */
function plantsNet(obs: GameState, me: string): number {
  return obs.tiles.filter((t) => t.owner === me && t.outfit === 'energy').reduce((n, t) => n + Math.max(0, rawOutput(obs, t) - energyUseOf(obs, t)), 0);
}

/** Units of a good the seat's factories turn in a month (Energy aside: it is the plots' use). */
function factoryUse(obs: GameState, me: string, good: Good): number {
  if (good === 'energy') return 0;
  return obs.tiles.filter((t) => t.owner === me && t.outfit && isFactory(t.outfit)).reduce((n, t) => n + (RECIPES[t.outfit as ProcessedGood].inputs[good] ?? 0), 0);
}

/**
 * The units that keep the seat whole next month (wholeNextMonth), plus what its factories turn after spoilage. Energy
 * its plants are forecast to supply is needed only at the forecast's risk; without a look-ahead the seat can't count
 * on them, and every unit is needed.
 */
export function unitNeed(obs: GameState, mind: Mind, good: Good): UnitNeed {
  const me = mind.me;
  if (good === 'energy') {
    const target = wholeNextMonth(obs, me, good);
    if (!mind.level.lookAhead) return { sure: target, target };
    return { sure: keptUnits(good, Math.max(0, monthNeeds(obs, me).energy - plantsNet(obs, me))), target };
  }
  const household = good === 'medicine' ? keptUnits(good, monthNeeds(obs, me).medicine) : wholeNextMonth(obs, me, good);
  const target = household + keptUnits(good, factoryUse(obs, me, good));
  return { sure: target, target };
}

/** A factory short of its experience bonus, with the game long enough to reach it, waits a month more turned off. */
function experienceMissed(obs: GameState, tile: Tile): number {
  const months = monthsToExperience(tile);
  if (!tile.outfit || !isFactory(tile.outfit) || months === 0) return 0;
  return productionsLeft(obs) > months ? FACTORY.experienceBonus : 0;
}

/**
 * Each unit of the plots' Energy use, from the unit covered first (the back of energyOffOrder) to the one covered
 * last, at what going without it costs: the plot it keeps on loses (1 − offOutputShare) of its output turned off, and
 * a factory short of its experience a month of it, spread over the plot's use. Factories the stock can't feed now run
 * last on what is left, so their units come last.
 */
function energyUnits(obs: GameState, o: Outlook, mind: Mind): number[] {
  return cached(o, obs, `energy:${mind.me}`, () => energyUnitsOf(obs, o, mind));
}

/**
 * Damage rows the model reads many times in one decision, kept for the outlook and the observation they were read
 * with, so a row is never read for another seat's view or another moment.
 */
const rows = new WeakMap<Outlook, WeakMap<GameState, Map<string, number[]>>>();

function cached(o: Outlook, obs: GameState, key: string, make: () => number[]): number[] {
  let byObs = rows.get(o);
  if (!byObs) rows.set(o, (byObs = new WeakMap()));
  let at = byObs.get(obs);
  if (!at) byObs.set(obs, (at = new Map()));
  let row = at.get(key);
  if (!row) at.set(key, (row = make()));
  return row;
}

function energyUnitsOf(obs: GameState, o: Outlook, mind: Mind): number[] {
  const me = mind.me;
  // Next month's production: no cold snap is known ahead, so every use counts once.
  const order = energyOffOrder(obs, me, 1);
  const listed = new Set(order.map((p) => p.tile));
  const unfed = PROCESSED_GOODS.flatMap((g) => obs.tiles.filter((t) => t.owner === me && t.outfit === g && !listed.has(t)));
  const plots = [
    ...order.map((p) => ({ tile: p.tile, use: p.use, full: p.full })).reverse(),
    ...unfed.map((t) => ({ tile: t, use: energyUseOf(obs, t), full: factoryFit(obs, t, t.outfit as ProcessedGood, me).output })),
  ];
  return plots.flatMap(({ tile, use, full }) => {
    const price = afterTax(obs, belief(obs, o, tile.outfit as Good));
    const lost = (1 - UPKEEP.offOutputShare) * full * price + experienceMissed(obs, tile) * price;
    return Array<number>(use).fill(lost / use);
  });
}

/**
 * What each unit a factory turns is worth to the seat: the run's output after tax over the recipe's inputs, averaged
 * over its factories that take the good by how much each takes. 0 when none takes it.
 */
function inputWorth(obs: GameState, o: Outlook, good: Good, me: string): number {
  let units = 0;
  let worth = 0;
  for (const t of obs.tiles) {
    if (t.owner !== me || !t.outfit || !isFactory(t.outfit)) continue;
    const q = RECIPES[t.outfit].inputs[good];
    if (!q || good === 'energy') continue;
    const all = Object.values(RECIPES[t.outfit].inputs).reduce((n, x) => n + (x ?? 0), 0);
    worth += (q * afterTax(obs, factoryFit(obs, t, t.outfit, me).output * belief(obs, o, t.outfit))) / all;
    units += q;
  }
  return units > 0 ? worth / units : 0;
}

/**
 * What going without each unit the seat holds would cost it, before the floor (replaceCost), unit 0 first. Energy: the
 * share of a unit of use that survives spoilage, at what that unit of use keeps on (energyUnits), the seat's own
 * plants covering the first units. Food: the walking hunger slows, over the household's units. Water: the
 * (1 − UPKEEP.shortOutputShare) of what its irrigated farms make that a month short loses, over the household's
 * units. Medicine: the walking sickness slows, for each unit. A factory input: its share of the run.
 */
function heldDamage(obs: GameState, o: Outlook, good: Good, mind: Mind, need: UnitNeed): number[] {
  return cached(o, obs, `held:${mind.me}:${mind.levelId}:${good}:${need.sure}:${need.target}`, () => heldDamageOf(obs, o, good, mind, need));
}

function heldDamageOf(obs: GameState, o: Outlook, good: Good, mind: Mind, need: UnitNeed): number[] {
  const me = mind.me;
  const keepRate = 1 - GOOD_CONFIG[good].spoilage;
  if (good === 'energy') {
    const units = energyUnits(obs, o, mind);
    const net = mind.level.lookAhead ? plantsNet(obs, me) : 0;
    // A unit needed for sure covers the plots above what the plants make; one beyond covers the plants' share. Each held
    // unit brings keepRate of a unit of use to production.
    return Array.from({ length: need.target }, (_, h) => (units[h < need.sure ? net + Math.floor(h * keepRate) : Math.floor((h - need.sure) * keepRate)] ?? 0) * keepRate);
  }
  const household = good === 'medicine' ? keptUnits(good, monthNeeds(obs, me).medicine) : wholeNextMonth(obs, me, good);
  const sec = secondValue(obs, me);
  let worth = 0;
  if (household > 0 && good === 'food') worth = (monthWalkSeconds(obs, mind) * (1 / DEV_WALK.hungerPaceMin - 1) * sec) / household;
  if (household > 0 && good === 'water') worth = waterDamage(obs, o, me) / household;
  if (household > 0 && good === 'medicine') worth = playerEventChance(obs, 'sickness', 'development', me) * monthWalkSeconds(obs, mind) * (1 / DEV_WALK.sickPace - 1) * sec;
  const input = inputWorth(obs, o, good, me);
  return Array.from({ length: need.target }, (_, h) => (h < household ? worth : input));
}

/**
 * What a month short of Water costs the seat: its irrigated farms lose (1 − UPKEEP.shortOutputShare) of their output. Water's
 * own turn-off order (AM-18) replaces this when the engine has it.
 */
function waterDamage(obs: GameState, o: Outlook, me: string): number {
  const farms = obs.tiles.filter((t) => t.owner === me && UPKEEP.irrigated.includes(t.outfit as never));
  return farms.reduce((n, t) => n + rawOutput(obs, t), 0) * (1 - UPKEEP.shortOutputShare) * afterTax(obs, belief(obs, o, 'food'));
}

/**
 * What a needed unit is never valued below while the store sells the good: having it now, at the store's ask today, or
 * buying it back next month, whichever is more. The damage falls before next month's auction, so the buy-back alone
 * can't avert it. None if the store sells none.
 */
function replaceCost(obs: GameState, o: Outlook, good: Good): number {
  if (storeForSale(obs, good) <= 0) return 0;
  const today = (obs.auction?.good === good ? storeSellLine(obs) : storeQuotes(obs, good).sell) ?? 0;
  return Math.max(today, belief(obs, o, good) * (1 + PRICE.storeSpread) * AI_VALUE.shortFloorMarkup);
}

/**
 * What going without the k-th unit short of the seat's target costs, k = 0 first, the unit whose plot goes off first;
 * never below what having it costs (replaceCost). Past the target, nothing is lost: that cost alone.
 */
export function shortCosts(obs: GameState, o: Outlook, good: Good, mind: Mind, length: number): number[] {
  const need = unitNeed(obs, mind, good);
  const damage = heldDamage(obs, o, good, mind, need);
  const replace = replaceCost(obs, o, good);
  return Array.from({ length }, (_, k) => Math.max(replace, k < need.target ? damage[need.target - 1 - k]! : 0));
}

/**
 * Each unit's value as the model sets it: the chance it is needed times what going without it costs, plus the rest
 * times what it fetches later, most valuable first.
 */
function modelValues(obs: GameState, o: Outlook, good: Good, mind: Mind): UnitValues {
  const need = unitNeed(obs, mind, good);
  const S = shortCosts(obs, o, good, mind, need.target);
  const carry = carryOf(obs, o, good, mind);
  const risky = Math.min(1, AI_VALUE.forecastRisk * mind.persona.risk);
  const keep: number[] = [];
  const buy: number[] = [];
  for (let h = 0; h < Math.max(need.target, carry.room) + 1; h++) {
    const q = h < need.sure ? 1 : h < need.target ? risky : 0;
    const short = h < need.target ? S[need.target - 1 - h]! : 0;
    const kept = h < carry.room ? 1 : 0;
    keep.push(q * short + (1 - q) * carry.sell * kept);
    buy.push(q * short + (1 - q) * carry.buy * kept);
  }
  keep.sort((a, b) => b - a);
  buy.sort((a, b) => b - a);
  const floorUnits = good === 'food' || good === 'energy' ? need.sure : 0;
  return { good, keep, buy, block: need.target, need: monthNeeds(obs, mind.me)[good], floorUnits };
}

/**
 * What a new plot's units that cover the seat's own shortfall add over selling them: each is worth what going without
 * it costs. A plant's cover the plots above what its plants already make; a farm's or well's, the household's units.
 */
function ownUseGain(obs: GameState, o: Outlook, good: 'food' | 'water' | 'energy', made: number, price: number, mind: Mind): number {
  const replace = replaceCost(obs, o, good);
  if (good === 'energy') {
    const units = energyUnits(obs, o, mind);
    const net = plantsNet(obs, mind.me);
    const own = Math.min(made, Math.max(0, units.length - net));
    let gain = 0;
    for (let i = 0; i < own; i++) gain += Math.max(0, Math.max(replace, units[net + i]!) - price);
    return gain;
  }
  // Only units the seat needs count: a well's drink units are worth nothing to a seat with no farm to water.
  const target = unitNeed(obs, mind, good).target;
  if (target === 0) return 0;
  const own = Math.min(made, Math.max(0, target - ownSupply(obs, mind.me, o.made, good)));
  const [cost = replace] = shortCosts(obs, o, good, mind, 1);
  return own * Math.max(0, cost - price);
}

/** The month's cash plan (RULE-5): which needed units of the goods still to be auctioned the seat's money buys first. */
export interface CashPlan {
  /** Units funded, and what they cost, per good. */
  funded: Partial<Record<Good, number>>;
  cost: Partial<Record<Good, number>>;
  /** Money left after every funded unit. */
  left: number;
  /** The shadow price of cash: what the last funded unit gains per credit, 0 when every needed unit is funded. */
  lambda: number;
  /** Needed units worth at least their ask, funded or not, and what they would all cost. */
  needed: number;
  wanted: number;
}

/**
 * Ranks every needed unit (below the good's target) worth at least its expected ask, across `goods`, by value per
 * credit, ties in `goods`' order, and funds every one in that order that the money still covers; one that doesn't fit
 * is skipped and the ranking goes on.
 */
export function cashPlan(obs: GameState, mind: Mind, goods: readonly Good[], valuesOf: (good: Good) => UnitValues, askOf: (good: Good) => number): CashPlan {
  const p = obs.players.find((q) => q.id === mind.me)!;
  const units: { good: Good; at: number; ratio: number; ask: number }[] = [];
  goods.forEach((good, at) => {
    const v = valuesOf(good);
    const ask = askOf(good);
    for (let k = p.stock[good]; k < v.block; k++) if ((v.buy[k] ?? 0) >= ask) units.push({ good, at, ratio: v.buy[k]! / ask, ask });
  });
  units.sort((a, b) => b.ratio - a.ratio || a.at - b.at);
  const plan: CashPlan = { funded: {}, cost: {}, left: p.money, lambda: 0, needed: units.length, wanted: units.reduce((n, u) => n + u.ask, 0) };
  let n = 0;
  let last: number | null = null;
  for (const u of units) {
    if (u.ask > plan.left) continue;
    plan.left -= u.ask;
    plan.funded[u.good] = (plan.funded[u.good] ?? 0) + 1;
    plan.cost[u.good] = (plan.cost[u.good] ?? 0) + u.ask;
    last = u.ratio;
    n++;
  }
  if (n < units.length) plan.lambda = (last ?? units[0]!.ratio) - 1;
  return plan;
}

/** The month's cash plan off the auction: every good, at the belief's prices. */
function monthPlan(obs: GameState, mind: Mind, o?: Outlook, except?: Good): CashPlan {
  const look = o ?? outlook(obs, mind.me, { lookAhead: mind.level.lookAhead });
  const goods = WALK.order.filter((g) => g !== except);
  return cashPlan(obs, mind, goods, (g) => unitValues(obs, look, g, mind), (g) => belief(obs, look, g) * (1 + PRICE.storeSpread));
}

/** The cash the month's needed units take at the belief's prices, as far as the money goes: the model's reserve off the auction. */
function monthReserve(obs: GameState, mind: Mind, o?: Outlook, except?: Good): number {
  return Math.round(Object.values(monthPlan(obs, mind, o, except).cost).reduce((n, c) => n + (c ?? 0), 0));
}

/**
 * The cash every needed unit of the month would take at the belief's prices, funded or not: with the model on, what a
 * seat's money must reach before it stops listing land to sell; today's cash reserve with it off.
 */
export function monthNeedsCost(obs: GameState, mind: Mind): number {
  return AI_VALUE.unit ? Math.round(monthPlan(obs, mind).wanted) : cashReserve(obs, mind);
}
