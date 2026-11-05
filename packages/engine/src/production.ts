import { ADJACENCY, EVENTS, FACTORY, FACTORY_FIT, GROWN_BASE, GROWN_MIN, POLLUTION, RECIPES, SPECIES_PERK, THIN_VEIN_MONTHS, TRAIT_EFFECT, UPKEEP } from './config.js';
import { applyEvents, eventOutput, plotEvent, rollAfterOutput, rollPhase } from './events.js';
import { neighbours } from './map.js';
import { airBand, runPollution } from './pollution.js';
import { formMeteorCrater, relicFit, settleSpecials, specialBonus } from './specials.js';
import { addStock, emptyStock, hasStock } from './stock.js';
import {
  GROWN_GOODS,
  MINED_GOODS,
  PROCESSED_GOODS,
  RAW_GOODS,
  type EventKey,
  type GameState,
  type Good,
  type MinedGood,
  type MonthEvent,
  type Outfit,
  type ProcessedGood,
  type ProductionLine,
  type RawGood,
  type Stock,
  type Tile,
} from './types.js';

export function isFactory(good: Outfit): good is ProcessedGood {
  return (PROCESSED_GOODS as readonly string[]).includes(good);
}

export function isRaw(good: Outfit): good is RawGood {
  return (RAW_GOODS as readonly string[]).includes(good);
}

export function isMined(good: Outfit): good is MinedGood {
  return (MINED_GOODS as readonly string[]).includes(good);
}

/** Size of the connected cluster of plots with the same owner and outfit. */
export function clusterSize(state: GameState, tile: Tile): number {
  if (!tile.owner || !tile.outfit) return 0;
  const seen = new Set<Tile>([tile]);
  const queue = [tile];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const n of neighbours(state.tiles, state.width, current)) {
      if (!seen.has(n) && n.owner === tile.owner && n.outfit === tile.outfit) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen.size;
}

export function adjacencyBonus(state: GameState, tile: Tile): number {
  const size = clusterSize(state, tile);
  if (size >= ADJACENCY.clusterSize) return ADJACENCY.cluster;
  if (size >= 2) return ADJACENCY.neighbour; // literal-ok: the plot and one own neighbour, what ADJACENCY.neighbour means
  return 0;
}

/**
 * Output of a raw-goods plot before the Energy check: the ground rating,
 * then traits, the owner's species, a special field, adjacency and pollution.
 */
export function rawOutput(state: GameState, tile: Tile): number {
  return rawOutputParts(state, tile).reduce((n, p) => n + p.delta, 0);
}

type Part = ProductionLine['parts'][number];

/** The same output as `rawOutput`, part by part, so the month report can say why a plot made what it made. */
export function rawOutputParts(state: GameState, tile: Tile): Part[] {
  const good = tile.outfit;
  if (!good || !isRaw(good)) return [];
  const species = state.players.find((p) => p.id === tile.owner)?.species;
  const parts: Part[] = [];
  const add = (why: Part['why'], delta: number) => {
    if (delta !== 0) parts.push({ why, delta });
  };
  if (isMined(good)) {
    // A deposit of 0 means there is nothing to mine.
    if (tile.ground[good] <= 0) return [{ why: 'ground', delta: 0 }];
    parts.push({ why: 'ground', delta: tile.ground[good] });
    if (tile.traits.includes('thinVein')) add('trait', -Math.floor(tile.runMonths / THIN_VEIN_MONTHS));
    if (species === 'mollox') add('species', SPECIES_PERK.molloxMine);
  } else {
    parts.push({ why: 'ground', delta: Math.max(GROWN_MIN, GROWN_BASE + tile.ground[good]) });
    if (good === 'food' && species === 'bramblet') add('species', SPECIES_PERK.brambletFood);
  }
  for (const trait of tile.traits) add('trait', TRAIT_EFFECT[trait]?.[good] ?? 0);
  add('special', specialBonus(state, tile, good));
  const sum = () => parts.reduce((n, p) => n + p.delta, 0);
  if (sum() > 0) add('cluster', adjacencyBonus(state, tile));
  add('pollution', -pollutionLoss(state, tile, good));
  if (sum() < 0) add('floor', -sum());
  return parts;
}

/** What pollution takes from a plot making this good: 1 per plot level, plus farm and well losses in toxic air. */
export function pollutionLoss(state: GameState, tile: Tile, good: Good): number {
  if (!POLLUTION.sensitive.includes(good)) return 0;
  let loss = tile.pollution;
  if ((good === 'food' || good === 'water') && airBand(state.air).from >= POLLUTION.bands[2].from) loss += POLLUTION.toxicFarmLoss;
  return loss;
}

export interface FitLine {
  tone: 'good' | 'bad' | 'note';
  text: string;
}

export interface FactoryFit {
  /** Units one month's run makes. */
  output: number;
  /** Energy one run needs, after a feeder plot's saving. */
  energy: number;
  /** Everything that helps or hurts, as the phone lists it before you install. */
  lines: FitLine[];
}

/**
 * How well a factory works on a plot for its owner: terrain, a neighbouring
 * plot that makes one of its inputs, an industrial park, experience, a
 * touching alien relic and pollution (for Medicine). The same numbers drive production and the fit
 * the phone shows before you install.
 */
export function factoryFit(state: GameState, tile: Tile, good: ProcessedGood, owner: string): FactoryFit {
  const recipe = RECIPES[good];
  const lines: FitLine[] = [];
  let output = recipe.output;
  let energy = recipe.inputs.energy ?? 0;

  const fit = FACTORY_FIT[good][tile.terrain];
  if (fit) {
    output += fit[0];
    lines.push({ tone: fit[0] > 0 ? 'good' : 'bad', text: `${fit[1]}: ${fit[0] > 0 ? '+1' : '-1'}` });
  } else {
    lines.push({ tone: 'note', text: tile.terrain === 'plains' ? 'Plains suit any factory' : 'Neutral ground' });
  }

  const around = neighbours(state.tiles, state.width, tile).filter((t) => t.owner === owner && t.outfit);
  const feeder = around.find((t) => t.outfit && t.outfit !== 'energy' && t.outfit in recipe.inputs);
  if (feeder && energy > 0) {
    energy = Math.max(0, energy - FACTORY.feederEnergySaving);
    lines.push({ tone: 'good', text: `Next to your ${feeder.outfit} plot: saves 1 Energy` });
  }
  if (around.some((t) => t.outfit === good)) {
    output += FACTORY.parkBonus;
    lines.push({ tone: 'good', text: 'Next to the same factory: industrial park, +1' });
  }
  if (tile.outfit === good && tile.runMonths >= FACTORY.experienceMonths) {
    output += FACTORY.experienceBonus;
    lines.push({ tone: 'good', text: `Running for ${tile.runMonths} months: experience, +1` });
  }
  const relic = relicFit(state, tile);
  if (relic) {
    output += relic.bonus;
    lines.push(relic.line);
  }
  const loss = pollutionLoss(state, tile, good);
  if (loss > 0) {
    output -= loss;
    lines.push({ tone: 'bad', text: `Polluted plot: -${loss}` });
  }
  return { output: Math.max(0, output), energy, lines };
}

/** Crew working a player's land: 1 per raw plot, 2 per factory, none on a green belt. */
export function crewOf(state: GameState, playerId: string): number {
  let crew = 0;
  for (const t of state.tiles) {
    if (t.owner !== playerId || !t.outfit) continue;
    crew += t.outfit === 'greenBelt' ? UPKEEP.crew.greenBelt : isFactory(t.outfit) ? UPKEEP.crew.factory : UPKEEP.crew.raw;
  }
  return crew;
}

/** Food and Water a player's household and crew need this month. */
export function needsOf(state: GameState, playerId: string): { food: number; water: number } {
  const crew = crewOf(state, playerId);
  return {
    food: UPKEEP.baseFood + Math.ceil(crew / UPKEEP.crewPerFood),
    water: UPKEEP.baseWater + Math.ceil(crew / UPKEEP.crewPerWater),
  };
}

/** Energy a working plot burns a month: by good for raw plots, by recipe for factories. */
export function energyUseOf(state: GameState, tile: Tile): number {
  if (!tile.owner || !tile.outfit || tile.outfit === 'greenBelt') return 0;
  if (isFactory(tile.outfit)) return factoryFit(state, tile, tile.outfit, tile.owner).energy;
  return UPKEEP.energyUse[tile.outfit as RawGood];
}

/** Water a working plot uses a month: by good for raw plots, by recipe for factories (a recipe's Water is its use). */
export function waterUseOf(_state: GameState, tile: Tile): number {
  if (!tile.owner || !tile.outfit || tile.outfit === 'greenBelt') return 0;
  if (isFactory(tile.outfit)) return RECIPES[tile.outfit].inputs.water ?? 0;
  return UPKEEP.waterUse[tile.outfit as RawGood];
}

/** The two base resources every working plot uses, and whose shortage turns plots off. */
export type BaseGood = 'energy' | 'water';

/** One plot in a turn-off list: its use of the base good this month and its full output. */
export interface OffPlot {
  tile: Tile;
  use: number;
  full: number;
}
/** AM-17's name for an entry of the Energy list. */
export type EnergyOffPlot = OffPlot;

/** A plot that makes a base good: it pays its own use from its own output and is never turned off. */
export function isBaseProducer(tile: Tile): boolean {
  return tile.outfit === 'energy' || tile.outfit === 'water';
}

/** A plot's use of a base good this month; `cold` multiplies Energy only. */
export function baseUseOf(state: GameState, tile: Tile, good: BaseGood, cold = 1): number {
  return good === 'energy' ? energyUseOf(state, tile) * cold : waterUseOf(state, tile);
}

/**
 * An owner's working plots but its base producers (Energy and Water plots), in turn-off order for `good`: biggest use
 * first, then the one whose full output is worth least at the store's posted price, then tile order. A factory whose
 * inputs other than Energy and Water are not in stock is left out: it runs in production's second pass. `cold`
 * multiplies every Energy use (not Water). `skip` leaves out plots already turned off for the other good.
 */
export function baseOffOrder(
  state: GameState,
  playerId: string,
  good: BaseGood,
  cold = coldFactor(state.monthEvents),
  skip: ReadonlySet<Tile> = new Set(),
): OffPlot[] {
  const owner = state.players.find((p) => p.id === playerId);
  if (!owner) return [];
  const at = new Map(state.tiles.map((t, i) => [t, i]));
  const worth = (p: OffPlot) => state.store.posted[p.tile.outfit as Good] * p.full;
  return state.tiles
    .filter((t) => t.owner === playerId && t.outfit && t.outfit !== 'greenBelt' && !isBaseProducer(t) && !skip.has(t))
    .filter((t) => !isFactory(t.outfit!) || hasStock(owner.stock, feedOf(t.outfit)))
    .map((tile) => ({
      tile,
      use: baseUseOf(state, tile, good, cold),
      full: isFactory(tile.outfit!) ? factoryFit(state, tile, tile.outfit, playerId).output : rawOutput(state, tile),
    }))
    .sort((a, b) => b.use - a.use || worth(a) - worth(b) || at.get(a.tile)! - at.get(b.tile)!);
}

/** AM-17's Energy turn-off list (WS9's spec names it): baseOffOrder for Energy. */
export function energyOffOrder(state: GameState, playerId: string, cold = coldFactor(state.monthEvents)): EnergyOffPlot[] {
  return baseOffOrder(state, playerId, 'energy', cold);
}

/** Water an owner's household and crew drink at upkeep, kept back from the plots: the household drinks first. */
export function drinkReserve(state: GameState, playerId: string): number {
  return needsOf(state, playerId).water;
}

/** The factor every Energy use is multiplied by when a cold snap is among `events`, else 1. */
function coldFactor(events: readonly MonthEvent[]): number {
  return events.some((e) => e.key === 'coldSnap') ? EVENTS.colony.coldSnap.factor : 1;
}

/** The plots turned off from the front of `order` (energyOffOrder) until the uses of the rest fit `stock` (AM-17). */
function turnedOff(order: readonly EnergyOffPlot[], stock: number): Set<Tile> {
  let need = order.reduce((n, p) => n + p.use, 0);
  const off = new Set<Tile>();
  for (const p of order) {
    if (need <= stock) break;
    off.add(p.tile);
    need -= p.use;
  }
  return off;
}

/** `n` cut to UPKEEP.offOutputShare, rounded half up: a plot making 3 or 4 still gives 1. */
const offShare = (n: number) => Math.round(n * UPKEEP.offOutputShare);

/** What a turned-off factory takes of an input: UPKEEP.offOutputShare of it, rounded up, so nothing is made from nothing. */
const offInput = (n: number) => Math.ceil(n * UPKEEP.offOutputShare);

/** A factory's recipe inputs but its Energy and Water, the base goods it uses. */
export function feedOf(good: ProcessedGood): Partial<Stock> {
  const { energy: _e, water: _w, ...feed } = RECIPES[good].inputs;
  return feed;
}

/**
 * Runs one production phase. Order matters and mirrors the design:
 * 1. Energy plots produce first and each pays its own Energy from its own output, never from the stock (AM-17);
 * 2. an owner whose Energy can't cover the uses of all its other plots turns plots off, biggest use first, until the
 *    rest fit (turnedOff); a plot turned off makes UPKEEP.offOutputShare of its output and pays no Energy. A factory
 *    whose non-Energy inputs are not in stock is not in the list: it waits for the second pass (5);
 * 3. every other working raw plot pays its Energy, and a farm whose owner is short of Water produces half;
 * 4. factories convert inputs from the owner's stock, Alloy first because Electronics needs it; one turned off
 *    makes its share from the same share of its non-Energy inputs (rounded up), or 0 without them (and takes none
 *    when its share of output rounds to 0), and gains no experience that month;
 * 5. the second pass, in the same factory order: a factory left out of the list runs on the inputs this month made
 *    and the Energy left over; with its inputs but too little Energy it is turned off; without its inputs it does not
 *    run, as before;
 * 6. special fields settle (ruins pay, a mined cavern may collapse), then
 *    pollution spreads and the air gauge moves.
 * Every event the phase fires (rollPhase) works on the plots it reaches, on
 * top of what made each plot's output. Returns what each player produced, the
 * air points each caused, each plot's line and the events: those the phase
 * fired, then each cavern collapse, which changes no output.
 */
export function runProduction(state: GameState): {
  produced: Record<string, Stock>;
  pollutionBy: Record<string, number>;
  lines: ProductionLine[];
  events: MonthEvent[];
} {
  const produced: Record<string, Stock> = {};
  for (const player of state.players) produced[player.id] = emptyStock();

  const working = state.tiles.filter((t) => t.owner && t.outfit);
  const playerById = new Map(state.players.map((p) => [p.id, p]));
  const indexOf = new Map(state.tiles.map((t, i) => [t, i]));
  const ran = new Set<Tile>();
  const lines: ProductionLine[] = [];
  const events = rollPhase(state, 'production');
  applyEvents(state, events);
  // A cold snap multiplies every plot's Energy need for this run only.
  const cold = coldFactor(events);
  const reaching = new Map<number, { key: EventKey; plot: MonthEvent['plots'][number] }[]>();
  for (const { key, plots } of events) {
    for (const plot of plots) {
      const list = reaching.get(plot.index) ?? [];
      list.push({ key, plot });
      reaching.set(plot.index, list);
    }
  }
  const credit = (tile: Tile, good: Good, parts: Part[]) => {
    // The events come last, in the order they fired, each on the output the ones before it left.
    for (const { key, plot } of reaching.get(indexOf.get(tile)!) ?? []) {
      const before = parts.reduce((n, p) => n + p.delta, 0);
      plot.delta = eventOutput(key, before, plot.order === 0) - before;
      parts.push({ why: 'event', delta: plot.delta, event: key });
    }
    const made = parts.reduce((n, p) => n + p.delta, 0);
    playerById.get(tile.owner!)!.stock[good] += made;
    produced[tile.owner!]![good] += made;
    lines.push({ tile: indexOf.get(tile)!, good, made, parts });
    ran.add(tile);
  };
  type OffWhy = 'energyOff' | 'waterOff';
  /** Cuts what the parts add up to to the turned-off share, as a part of its own. */
  const switchOff = (parts: Part[], why: OffWhy) => {
    const made = parts.reduce((n, p) => n + p.delta, 0);
    if (made > 0) parts.push({ why, delta: offShare(made) - made });
  };
  const use = (tile: Tile) => energyUseOf(state, tile) * cold;
  const drink = new Map(state.players.map((p) => [p.id, drinkReserve(state, p.id)]));
  /** Water an owner may give its plots: what it holds above what the household will drink. */
  const spare = (owner: { id: string; stock: Stock }) => Math.max(0, owner.stock.water - drink.get(owner.id)!);
  /** Runs a factory: on, from its full inputs, Energy and Water, or not at all without them; off, from its share of inputs. */
  const runFactory = (tile: Tile, good: ProcessedGood, offWhy: OffWhy | undefined) => {
    const owner = playerById.get(tile.owner!)!;
    const fit = factoryFit(state, tile, good, owner.id);
    const feed = feedOf(good);
    const parts: Part[] = [{ why: 'factory', delta: fit.output }];
    if (offWhy) {
      // Turned off it still files its line: the share it made, or 0 when the factories before it took its inputs. A
      // share that rounds to 0 takes no inputs: nothing is spent for nothing.
      const share = Object.fromEntries(Object.entries(feed).map(([g, q]) => [g, offInput(q)]));
      if (offShare(fit.output) === 0) parts.push({ why: offWhy, delta: 0 - fit.output });
      else if (hasStock(owner.stock, share)) {
        addStock(owner.stock, share, -1);
        switchOff(parts, offWhy);
      } else parts.push({ why: offWhy, delta: 0 - fit.output });
      credit(tile, good, parts);
      return;
    }
    const water = waterUseOf(state, tile);
    const inputs = { ...feed, energy: fit.energy * cold };
    if (!hasStock(owner.stock, inputs) || spare(owner) < water) return;
    addStock(owner.stock, { ...inputs, water }, -1);
    credit(tile, good, parts);
  };

  // Base producers first. Each pays its own use from what it just made, never more than that, so it never draws the
  // stock for its own good; it is never turned off.
  for (const tile of working.filter((t) => t.outfit === 'energy')) {
    credit(tile, 'energy', rawOutputParts(state, tile));
    const made = lines.at(-1)!.made;
    playerById.get(tile.owner!)!.stock.energy -= Math.min(Math.max(0, made), use(tile));
  }
  for (const tile of working.filter((t) => t.outfit === 'water')) {
    credit(tile, 'water', rawOutputParts(state, tile));
    const made = lines.at(-1)!.made;
    playerById.get(tile.owner!)!.stock.water -= Math.min(Math.max(0, made), waterUseOf(state, tile));
  }
  // Cross-use: a well takes its Energy, a plant its Water (above the household's drink), from the stock before any other
  // plot, as much as is there; short, it still runs.
  for (const tile of working.filter((t) => t.outfit === 'water')) {
    const owner = playerById.get(tile.owner!)!;
    owner.stock.energy -= Math.min(Math.max(0, owner.stock.energy), use(tile));
  }
  for (const tile of working.filter((t) => t.outfit === 'energy')) {
    const owner = playerById.get(tile.owner!)!;
    owner.stock.water -= Math.min(spare(owner), waterUseOf(state, tile));
  }

  // The turn-off passes, per owner: Energy then Water (UPKEEP.waterPassFirst swaps them). A plot off in the first pass
  // is not in the second's list: it uses neither good.
  const off = new Map<Tile, OffWhy>();
  const listed = new Set<Tile>();
  const passes: BaseGood[] = UPKEEP.waterPassFirst ? ['water', 'energy'] : ['energy', 'water'];
  for (const owner of state.players) {
    for (const good of passes) {
      const order = baseOffOrder(state, owner.id, good, cold, new Set(off.keys()));
      for (const { tile } of order) listed.add(tile);
      const stock = good === 'energy' ? owner.stock.energy : spare(owner);
      for (const tile of turnedOff(order, stock)) off.set(tile, good === 'energy' ? 'energyOff' : 'waterOff');
    }
  }

  for (const tile of working.filter((t) => !isBaseProducer(t) && isRaw(t.outfit!))) {
    const owner = playerById.get(tile.owner!)!;
    const good = tile.outfit as RawGood;
    const parts = rawOutputParts(state, tile);
    const why = off.get(tile);
    if (why) switchOff(parts, why);
    else {
      owner.stock.energy -= use(tile);
      owner.stock.water -= waterUseOf(state, tile);
    }
    credit(tile, good, parts);
  }

  for (const good of PROCESSED_GOODS) {
    for (const tile of working.filter((t) => t.outfit === good && listed.has(t))) runFactory(tile, good, off.get(tile));
  }
  // The second pass: the factories left out of the lists, on this month's inputs and the Energy and Water the rest left.
  for (const good of PROCESSED_GOODS) {
    for (const tile of working.filter((t) => t.outfit === good && !listed.has(t))) {
      const owner = playerById.get(tile.owner!)!;
      if (!hasStock(owner.stock, feedOf(good))) continue;
      const noEnergy = owner.stock.energy < factoryFit(state, tile, good, owner.id).energy * cold;
      const noWater = spare(owner) < waterUseOf(state, tile);
      const why: OffWhy | undefined = UPKEEP.waterPassFirst
        ? noWater ? 'waterOff' : noEnergy ? 'energyOff' : undefined
        : noEnergy ? 'energyOff' : noWater ? 'waterOff' : undefined;
      if (why) off.set(tile, why);
      runFactory(tile, good, why);
    }
  }

  // Green belts don't produce, but they count as running. A factory turned off gains no experience that month: its
  // count holds. A raw plot turned off still counts, so a thin vein wears as it mines.
  for (const tile of working) {
    if (tile.outfit === 'greenBelt') ran.add(tile);
    if (off.has(tile) && isFactory(tile.outfit!)) continue;
    tile.runMonths = ran.has(tile) ? tile.runMonths + 1 : 0;
  }

  for (const index of settleSpecials(state, lines)) events.push(plotEvent(state, 'cavernCollapse', index));
  const pollutionBy = runPollution(state);
  // A meteor strikes after the month ran (AM-1 1a): the plot made its output and its pollution counts; then its MULE
  // is lost and it becomes a crater.
  for (const strike of rollAfterOutput(state)) {
    for (const { index } of strike.plots) formMeteorCrater(state, state.tiles[index]!.x, state.tiles[index]!.y);
    events.push(strike);
  }
  return { produced, pollutionBy, lines, events };
}

/** Raw goods a plot is rated for, best first, from the ground card. */
export function rankGround(tile: Tile): { good: RawGood; rating: number }[] {
  return [...GROWN_GOODS, ...MINED_GOODS]
    .map((good) => ({ good, rating: tile.ground[good] }))
    .sort((a, b) => b.rating - a.rating);
}

/**
 * What a player needs of each good for next month: Food and Water for the
 * household and crew, Energy for their plots and factories, the inputs their
 * factories turn, and a Medicine against sickness when the air is bad. The
 * auction's status screen measures surplus and shortage against this.
 */
export function monthNeeds(state: GameState, playerId: string): Stock {
  const need = emptyStock();
  const { food, water } = needsOf(state, playerId);
  need.food = food;
  need.water = water;
  for (const t of state.tiles) {
    if (t.owner !== playerId || !t.outfit || t.outfit === 'greenBelt') continue;
    need.energy += energyUseOf(state, t);
    need.water += waterUseOf(state, t);
    if (!isFactory(t.outfit)) continue;
    for (const [g, q] of Object.entries(RECIPES[t.outfit].inputs) as [Good, number][]) if (g !== 'energy' && g !== 'water') need[g] += q;
  }
  if (airBand(state.air).sickens) need.medicine = 1;
  return need;
}
