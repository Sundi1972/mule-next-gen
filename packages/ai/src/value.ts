import {
  airBand,
  airPoints,
  crewOf,
  DEVELOPMENT,
  factoryFit,
  GOOD_CONFIG,
  isFactory,
  isRaw,
  monthNeeds,
  mulePrice,
  mulePriceFor,
  needsOf,
  outfitCostFor,
  POLLUTION,
  rawOutput,
  RECIPES,
  STRATEGIST,
  UPKEEP,
  energyUseOf,
  type AiLevelConfig,
  type AiPersonaWeights,
  type GameState,
  type Good,
  type Outfit,
  type Stock,
  type Tile,
} from '@mule/engine';
import { productionsLeft, type Outlook } from './outlook.js';

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
export const beforeTax = (obs: GameState, kept: number) => kept / Math.max(0.01, 1 - obs.treasury.salesTax);

/** Net credits a month from running this outfit here, at the given prices (the outlook's by default, its own extra supply included). */
export function monthlyNet(obs: GameState, o: Outlook, y: Yield, outfit: Outfit, mind: Mind, price?: PriceOf): number {
  const full = mind.level.fullScoring;
  if (outfit === 'greenBelt') return full ? POLLUTION.greenBeltAir * airUnitCost(obs) - 5 : -5;
  const P: PriceOf = price ?? ((g, extra = 0) => o.price(g, extra));
  let revenue = afterTax(obs, y.made * P(outfit, y.made));
  if (full && (outfit === 'food' || outfit === 'water' || outfit === 'energy')) {
    // The units that cover its own shortfall are worth what going short would cost it, and pay no tax.
    const short = Math.max(0, monthNeeds(obs, mind.me)[outfit] - o.made[outfit]);
    const own = Math.min(y.made, short);
    const floor = obs.store.refPrice[outfit] * STRATEGIST.selfSupply;
    revenue += own * Math.max(0, floor - afterTax(obs, P(outfit, y.made)));
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

/** What a second of development time is worth to the seat: the pub's rate at least, more while it has land to develop. */
export function secondValue(obs: GameState, me: string): number {
  const p = obs.players.find((q) => q.id === me)!;
  const pubRate = (DEVELOPMENT.pub.start + obs.month * DEVELOPMENT.pub.perMonth) / Math.max(1, DEVELOPMENT.fullSeconds);
  const idle = obs.tiles.some((t) => t.owner === me && !t.outfit);
  return Math.max(pubRate, idle && p.money > mulePriceFor(obs, me) ? STRATEGIST.secondValue.busy : STRATEGIST.secondValue.idle);
}

/**
 * Cash the seat keeps back: a floor plus what next month's Food, Water and
 * Energy shortfall would cost, times its reserve weight. A short unit counts
 * at most a few times its reference price, so a price spike doesn't freeze
 * all its cash. `except` leaves out a good: the one a new farm would make.
 */
export function cashReserve(obs: GameState, mind: Mind, o?: Outlook, except?: Good): number {
  const p = obs.players.find((q) => q.id === mind.me)!;
  const need = monthNeeds(obs, mind.me);
  let cost = 0;
  for (const g of ['food', 'water', 'energy'] as const) {
    if (g === except) continue;
    const short = Math.max(0, need[g] - p.stock[g] - (o?.made[g] ?? 0));
    cost += short * Math.min(obs.store.posted[g] * 1.1, obs.store.refPrice[g] * STRATEGIST.reservePriceCap);
  }
  return Math.round((STRATEGIST.cashFloor + cost) * mind.persona.reserve);
}

/**
 * The value of each unit of a good the seat could hold after the auction,
 * most valuable first: the units next month needs are worth what going short
 * would cost (development time for Food, half a farm for Water, half a plot
 * for Energy, a factory's run for its inputs, sickness for Medicine), the
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
  /** Units it never sells: the Food and Energy it needs. */
  floorUnits: number;
}

export function unitValues(obs: GameState, o: Outlook, good: Good, mind: Mind): UnitValues {
  const me = mind.me;
  const need = monthNeeds(obs, me)[good];
  const full = mind.level.fullScoring;
  const spoil = full ? GOOD_CONFIG[good].spoilage : 0;
  const keepRate = 1 - spoil;
  const mine = obs.tiles.filter((t) => t.owner === me && t.outfit && t.outfit !== 'greenBelt');
  const P = (g: Good) => (o.final ? obs.store.posted[g] : o.price(g));
  const sec = secondValue(obs, me);

  // Units next month's needs take, and what each is worth to the seat.
  let block = 0;
  let use = 0;
  if (good === 'food' && need > 0) {
    // Eaten at upkeep, then what is left (after spoilage) buys next month's development time.
    const eat = needsOf(obs, me).food;
    block = eat + Math.ceil(eat / keepRate);
    use = ((DEVELOPMENT.fullSeconds - DEVELOPMENT.minSeconds) * sec) / block;
  } else if (good === 'water' && need > 0) {
    const farms = mine.filter((t) => UPKEEP.irrigated.includes(t.outfit as never));
    const drink = needsOf(obs, me).water;
    if (farms.length > 0) {
      block = drink + Math.ceil(drink / keepRate);
      use = (farms.reduce((n, t) => n + rawOutput(obs, t), 0) * 0.5 * afterTax(obs, P('food'))) / block;
    }
  } else if (good === 'energy') {
    const own = mine.filter((t) => t.outfit === 'energy').reduce((n, t) => n + rawOutput(obs, t), 0);
    const short = Math.max(0, need - own);
    if (short > 0) {
      block = Math.ceil(short / keepRate);
      const runs = mine
        .filter((t) => t.outfit !== 'energy')
        .reduce((n, t) => n + (isRaw(t.outfit!) ? 0.5 * rawOutput(obs, t) * P(t.outfit as Good) : factoryFit(obs, t, t.outfit as never, me).output * P(t.outfit as Good)), 0);
      use = afterTax(obs, runs) / Math.max(1, need);
    }
  } else if (good === 'medicine' && need > 0) {
    block = Math.ceil(need / keepRate);
    use = Math.max(airBand(obs.air).devPenalty, POLLUTION.bands[1].devPenalty) * sec;
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
  const haircut = full ? 1 - STRATEGIST.forecastHaircut * mind.persona.risk : 1;
  const resale = afterTax(obs, P(good)) * keepRate * haircut;
  const resaleBuy = resale * Math.min(1, mind.persona.speculate) * (1 - 0.1 * mind.persona.risk);
  const depot = full ? Math.ceil(UPKEEP.depotCapacity / Math.max(0.05, keepRate)) : 99;
  const eaten = good === 'food' || good === 'water' ? needsOf(obs, me)[good] : 0;
  const length = Math.max(block, eaten + depot) + 1;
  const floorUnits = good === 'food' || good === 'energy' ? Math.min(block, need) : 0;

  const keep: number[] = [];
  const buy: number[] = [];
  for (let k = 0; k < length; k++) {
    if (k < block) {
      keep.push(k < floorUnits ? Infinity : Math.max(use, resale));
      buy.push(Math.max(use, resaleBuy));
    } else if (k < eaten + depot) {
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
