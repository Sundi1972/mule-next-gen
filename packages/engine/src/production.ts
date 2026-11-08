import { ADJACENCY, CONSUMPTION, EVENTS, FACTORY, FACTORY_FIT, GROWN_BASE, GROWN_MIN, HEALTH, POLLUTION, RECIPES, SPECIES_PERK, THIN_VEIN_MONTHS, TRAIT_EFFECT, UPKEEP } from './config.js';
import { hardship, sickShare } from './colony.js';
import { applyEvents, eventOutput, plotEvent, rollAfterOutput, rollPhase, strikeEvent } from './events.js';
import { neighbours } from './map.js';
import { airBand, runPollution } from './pollution.js';
import { sabotageEvents } from './sabotage.js';
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
  if (tile.outfit === good && monthsToExperience(tile) === 0) {
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

/** Months a factory must still run in a row before it makes FACTORY.experienceBonus more; 0 once it does. */
export function monthsToExperience(tile: Tile): number {
  return Math.max(0, FACTORY.experienceMonths - tile.runMonths);
}

/** The outfit of every plot a player works. */
function outfitsOf(state: GameState, playerId: string): Outfit[] {
  return state.tiles.filter((t) => t.owner === playerId && t.outfit).map((t) => t.outfit!);
}

/** Crew working a player's land: 1 per raw plot, 2 per factory, none on a green belt. Read by the AI until WS1's needsWith switch. */
export function crewOf(state: GameState, playerId: string): number {
  return outfitsOf(state, playerId).reduce((n, o) => n + (o === 'greenBelt' ? UPKEEP.crew.greenBelt : isFactory(o) ? UPKEEP.crew.factory : UPKEEP.crew.raw), 0);
}

/** Slack under a sum of quarters before it is rounded up: the sum is exact, so this only guards the round-up. */
const QUARTER_SLACK = 1e-9; // literal-ok: a float tolerance (RULE-10's ε), not balance

export type Needs = { food: number; water: number; medicine: number };

/**
 * The Food and Water one plot's crew adds to its owner's need a month, before the estate's one round-up (needs C12,
 * RULE-10): the rate the computer players weigh a plot by. needsWith minus needsOf is the stepped marginal instead,
 * which jumps with how many plots the owner already works. Water is none: a plot takes its Water as it produces (AM-3).
 */
export function crewUpkeep(outfit: Outfit): { food: number; water: number } {
  return { food: CONSUMPTION[outfit].food, water: 0 };
}

/**
 * Food and Water a household working plots of these outfits needs, and the Medicine that keeps its crews well (needs
 * RULE-10, AM-3): the crews' Food summed over the plots and rounded up once; Water the household's alone.
 */
function needsOver(state: GameState, outfits: readonly Outfit[]): Needs {
  const crews = outfits.reduce((n, o) => n + CONSUMPTION[o].food, 0);
  return {
    food: UPKEEP.baseFood + Math.ceil(crews - QUARTER_SLACK),
    water: UPKEEP.baseWater,
    medicine: crewsFallSick(state) ? 1 : 0,
  };
}

/** Food and Water a player's household and crew need this month, and the Medicine that keeps the crews well (needs RULE-15). */
export function needsOf(state: GameState, playerId: string): Needs {
  return needsOver(state, outfitsOf(state, playerId));
}

/** needsOf as if the player worked one more plot of `outfit` (needs C12): what the AI weighs before it buys one. */
export function needsWith(state: GameState, playerId: string, outfit: Outfit): Needs {
  return needsOver(state, [...outfitsOf(state, playerId), outfit]);
}

/** Whether the colony is sick enough to make players' crews sick: health on and h at least HEALTH.crewSickFrom. */
function crewsFallSick(state: GameState): boolean {
  return HEALTH.enabled && (sickShare(state) ?? 0) >= HEALTH.crewSickFrom;
}

/**
 * A player's crews at production (needs RULE-15, first match wins): well while the colony is not sick enough; cured
 * when the player holds a Medicine, which they take; otherwise sick, `share` of them, min(1, crewSpill × h).
 */
export function crewSickness(state: GameState, player: { stock: Pick<Stock, 'medicine'> }): { cure: boolean; share: number } {
  if (!crewsFallSick(state)) return { cure: false, share: 0 };
  if (player.stock.medicine >= 1) return { cure: true, share: 0 };
  return { cure: false, share: Math.min(1, HEALTH.crewSpill * sickShare(state)!) };
}

/**
 * The share of its output every plot of a player but its Energy plants makes, from how short its crews went at the last
 * month end (needs RULE-12): 1 − crewDrop × g for each of Food and Water, multiplied, g the colonists' hardship curve.
 * Up to its tolerance short costs nothing.
 */
export function crewFactor(short: { food: number; water: number }): number {
  return (1 - UPKEEP.crewDrop * hardship(short.food)) * (1 - UPKEEP.crewDrop * hardship(short.water));
}

/** The share of its output a player's sick crews let a plot make (needs RULE-15): 1 while they are well or cured. */
function sickCrewShare(state: GameState, holdsMedicine: boolean): number {
  const { share } = crewSickness(state, { stock: { medicine: holdsMedicine ? 1 : 0 } });
  return 1 - HEALTH.crewSickDrop * share;
}

/**
 * The share of its output a player's crews let every plot but its Energy plants make this production: the short-fed
 * crews' factor times the sick crews', as if the player holds a Medicine or not. Production applies the two as parts
 * of their own, each rounded; the computer players weigh plots by this product rather than copy the rule.
 */
export function crewOutputShare(state: GameState, playerId: string, { medicine }: { medicine: boolean }): number {
  const owner = state.players.find((p) => p.id === playerId)!;
  return crewFactor(owner.crewShort ?? { food: 0, water: 0 }) * sickCrewShare(state, medicine);
}

/** Energy a working plot burns a month (needs RULE-10): CONSUMPTION's, on top of its recipe's for a factory. */
export function energyUseOf(state: GameState, tile: Tile): number {
  if (!tile.owner || !tile.outfit) return 0;
  const recipe = isFactory(tile.outfit) ? factoryFit(state, tile, tile.outfit, tile.owner).energy : 0;
  return recipe + CONSUMPTION[tile.outfit].energy;
}

/**
 * Whether AM-18's plot Water is on: the farm's Water (UPKEEP.waterUse.food) is its switch. Off, no plot uses Water, a
 * well is an ordinary raw plot, and a farm whose owner is short of Water makes UPKEEP.shortOutputShare, as before.
 */
export function plotWaterOn(): boolean {
  return UPKEEP.waterUse.food > 0;
}

/** Water a working plot uses a month (AM-18): by good for a raw plot, factoryWaterUse for a factory; none while off. */
export function waterUseOf(tile: Tile): number {
  if (!plotWaterOn() || !tile.owner || !tile.outfit || tile.outfit === 'greenBelt') return 0;
  if (isFactory(tile.outfit)) return UPKEEP.factoryWaterUse[tile.outfit];
  return UPKEEP.waterUse[tile.outfit as RawGood];
}

/** The two base goods every working plot uses, and whose shortage turns plots off (AM-17, AM-18). */
export type BaseGood = 'energy' | 'water';

/** A plot that makes a base good: it pays its own use of that good from its output and is never turned off. A well only with AM-18 on. */
export function isBaseProducer(tile: Tile): boolean {
  return tile.outfit === 'energy' || (tile.outfit === 'water' && plotWaterOn());
}

/** One plot in a turn-off list: its use of the base good this month and its full output. */
export interface OffPlot {
  tile: Tile;
  use: number;
  full: number;
}

/** AM-17's name for an entry of the Energy list. */
export type EnergyOffPlot = OffPlot;

/**
 * An owner's working plots but its wells and plants, in the turn-off order for base good `good`: biggest use first,
 * then the one whose full output is worth least at the store's posted price, then tile order (AM-17, AM-18 W3).
 * Factories are fed from the owner's stock in factory order, then tile order, each reserving its inputs (feedOf); one
 * the stock left can't feed is left out: it runs in production's second pass, after the raw plots and the listed
 * factories, on the inputs made this month and the Energy and Water left over, and so turns nothing else off. `cold`
 * multiplies every Energy use and is the caller's to give: production passes the cold snap's factor for the month it
 * runs; a reader valuing next month passes 1 (no snap is known ahead). `skip` leaves out plots already turned off for
 * the other good: a plot is never cut twice.
 */
export function baseOffOrder(state: GameState, playerId: string, good: BaseGood, cold: number, skip: ReadonlySet<Tile> = new Set()): OffPlot[] {
  const owner = state.players.find((p) => p.id === playerId);
  if (!owner) return [];
  const at = new Map(state.tiles.map((t, i) => [t, i]));
  const worth = (p: OffPlot) => state.store.posted[p.tile.outfit as Good] * p.full;
  const fed = new Set<Tile>();
  const left = { ...owner.stock };
  for (const g of PROCESSED_GOODS) {
    for (const tile of state.tiles.filter((t) => t.owner === playerId && t.outfit === g)) {
      if (!hasStock(left, feedOf(g))) continue;
      addStock(left, feedOf(g), -1);
      fed.add(tile);
    }
  }
  return state.tiles
    .filter((t) => t.owner === playerId && t.outfit && t.outfit !== 'greenBelt' && !isBaseProducer(t) && !skip.has(t))
    .filter((t) => !isFactory(t.outfit!) || fed.has(t))
    .map((tile) => ({
      tile,
      use: good === 'energy' ? energyUseOf(state, tile) * cold : waterUseOf(tile),
      full: isFactory(tile.outfit!) ? factoryFit(state, tile, tile.outfit, playerId).output : rawOutput(state, tile),
    }))
    .sort((a, b) => b.use - a.use || worth(a) - worth(b) || at.get(a.tile)! - at.get(b.tile)!);
}

/** AM-17's Energy turn-off list, as the AI and WS9 read it: baseOffOrder for Energy. */
export function energyOffOrder(state: GameState, playerId: string, cold: number): EnergyOffPlot[] {
  return baseOffOrder(state, playerId, 'energy', cold);
}

/** The factor every Energy use is multiplied by when a cold snap is among `events`, else 1. */
function coldFactor(events: readonly MonthEvent[]): number {
  return events.some((e) => e.key === 'coldSnap') ? EVENTS.colony.coldSnap.factor : 1;
}

/** The plots turned off from the front of `order` (baseOffOrder) until the uses of the rest fit `stock` (AM-17, AM-18). */
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

/** The part a turned-off plot files: for want of Energy (AM-17) or of Water (AM-18; the part the old dry farm filed). */
type OffWhy = 'energyOff' | 'waterOff';

/** `n` cut to UPKEEP.offOutputShare, rounded half up: a plot making 3 or 4 still gives 1. */
const offShare = (n: number) => Math.round(n * UPKEEP.offOutputShare);

/** What a turned-off factory takes of an input: UPKEEP.offOutputShare of it, rounded up, so nothing is made from nothing. */
const offInput = (n: number) => Math.ceil(n * UPKEEP.offOutputShare);

/** A factory's recipe inputs but its Energy, and with AM-18 on its Water: the base goods it uses. */
export function feedOf(good: ProcessedGood): Partial<Stock> {
  const { energy: _energy, ...feed } = RECIPES[good].inputs;
  if (plotWaterOn()) delete feed.water;
  return feed;
}

/**
 * Runs one production phase. Order matters and mirrors the design:
 * 0. every plot of a player but Energy plants makes crewFactor of its output, rounded half up, from how short its crews
 *    went at the last month end (needs C14), then the share its sick crews leave it (crewSickness: a player who holds a
 *    Medicine takes one and has none sick), rounded half up again, before any turn-off below cuts it;
 * 1. Energy plots and wells produce first and each pays its own use of its good from its own output, never from the
 *    stock (AM-17, AM-18 W5);
 * 2. an owner whose Energy can't cover the uses of all its other plots turns plots off, biggest use first, until the
 *    rest fit (turnedOff); then, of the plots still on, Water the same way, against what it holds over the household's
 *    drink, which is kept back (AM-18 W2, W3). A plot turned off makes UPKEEP.offOutputShare of its output and uses
 *    neither good. A factory whose inputs are not in stock is not in the lists: it waits for the second pass (5);
 * 3. every other working raw plot pays its Energy and Water;
 * 4. factories convert inputs from the owner's stock, Alloy first because Electronics needs it; one turned off
 *    makes its share from the same share of its inputs (rounded up), or 0 without them (and takes none
 *    when its share of output rounds to 0), and gains no experience that month;
 * 5. the second pass, in the same factory order: a factory left out of the lists runs on the inputs this month made
 *    and the Energy and Water left over; with its inputs but too little Energy, or else too little Water, it is turned
 *    off; without its inputs it does not run, as before;
 * 6. wells take their Energy and plants their Water last, from what the other plots left; short, they still run;
 * 7. special fields settle (ruins pay, a mined cavern may collapse), then
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
  // A general strike announced in planning and still unpaid (G-5 RULE-26): its good's plots make COLONY.strike.output,
  // last, on what everything else left; paid, the good produces in full and production files no strike.
  const strike = strikeEvent(state);
  if (strike) events.push(strike);
  events.push(...sabotageEvents(state));
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
  /** With AM-18 off: cuts what the parts add up to to UPKEEP.shortOutputShare, rounding down, as a part of its own. */
  const halve = (parts: Part[]) => {
    const made = parts.reduce((n, p) => n + p.delta, 0);
    if (made > 0) parts.push({ why: 'noWater', delta: Math.floor(made * UPKEEP.shortOutputShare) - made });
  };
  const crewFactorOf = new Map(state.players.map((p) => [p.id, crewFactor(p.crewShort ?? { food: 0, water: 0 })]));
  const sickFactorOf = new Map<string, number>();
  for (const p of state.players) {
    sickFactorOf.set(p.id, sickCrewShare(state, p.stock.medicine >= 1));
    if (crewSickness(state, p).cure) p.stock.medicine--;
  }
  /** Cuts what the parts add up to by a factor, rounded half up, as a part of its own. */
  const cutBy = (parts: Part[], factor: number, why: 'crewShort' | 'crewSick') => {
    const made = parts.reduce((n, p) => n + p.delta, 0);
    const delta = Math.round(made * factor) - made;
    if (made > 0 && delta !== 0) parts.push({ why, delta });
  };
  /** The owner's crews: short-fed crews' factor (needs C14), then sick crews' (needs RULE-15). */
  const crewCut = (tile: Tile, parts: Part[]) => {
    cutBy(parts, crewFactorOf.get(tile.owner!)!, 'crewShort');
    cutBy(parts, sickFactorOf.get(tile.owner!)!, 'crewSick');
  };
  /** Cuts what the parts add up to to the turned-off share, as a part of its own, named for the good it went without. */
  const switchOff = (parts: Part[], why: OffWhy) => {
    const made = parts.reduce((n, p) => n + p.delta, 0);
    if (made > 0) parts.push({ why, delta: offShare(made) - made });
  };
  const use = (tile: Tile) => energyUseOf(state, tile) * cold;
  // The household drinks first (AM-18 W2): what it drinks at upkeep is kept back from the plots.
  const drink = new Map(state.players.map((p) => [p.id, needsOf(state, p.id).water]));
  /** The Water an owner's plots may use: what it holds over the household's drink. */
  const spare = (owner: { id: string; stock: Stock }) => Math.max(0, owner.stock.water - drink.get(owner.id)!);
  /** Runs a factory: on, from its full inputs, Energy and Water, or not at all without them; off, from its share of inputs. */
  const runFactory = (tile: Tile, good: ProcessedGood, offWhy: OffWhy | undefined) => {
    const owner = playerById.get(tile.owner!)!;
    const fit = factoryFit(state, tile, good, owner.id);
    const feed = feedOf(good);
    const parts: Part[] = [{ why: 'factory', delta: fit.output }];
    crewCut(tile, parts);
    const made = parts.reduce((n, p) => n + p.delta, 0);
    if (offWhy) {
      // Turned off it still files its line. Its inputs are there: a listed factory's were reserved for it
      // (energyOffOrder), a second-pass one is turned off only when it holds them. A share of output that rounds to 0
      // takes no inputs: nothing is spent for nothing.
      const share = Object.fromEntries(Object.entries(feed).map(([g, q]) => [g, offInput(q)]));
      if (offShare(made) > 0 && hasStock(owner.stock, share)) {
        addStock(owner.stock, share, -1);
        switchOff(parts, offWhy);
      } else parts.push({ why: offWhy, delta: 0 - made });
      credit(tile, good, parts);
      return;
    }
    const inputs = { ...feed, energy: use(tile) };
    const water = waterUseOf(tile);
    if (!hasStock(owner.stock, inputs) || spare(owner) < water) return;
    addStock(owner.stock, { ...inputs, water: (inputs.water ?? 0) + water }, -1);
    credit(tile, good, parts);
  };

  // Plants and wells pay their own use from what they just made: never more than that, so they never draw the stock.
  for (const tile of working.filter((t) => t.outfit === 'energy')) {
    credit(tile, 'energy', rawOutputParts(state, tile));
    playerById.get(tile.owner!)!.stock.energy -= Math.min(Math.max(0, lines.at(-1)!.made), use(tile));
  }
  for (const tile of working.filter((t) => t.outfit === 'water' && isBaseProducer(t))) {
    const parts = rawOutputParts(state, tile);
    crewCut(tile, parts);
    credit(tile, 'water', parts);
    playerById.get(tile.owner!)!.stock.water -= Math.min(Math.max(0, lines.at(-1)!.made), waterUseOf(tile));
  }

  // Energy first, then Water over the plots Energy left on (AM-18 W3).
  const off = new Map<Tile, OffWhy>();
  const listed = new Set<Tile>();
  for (const owner of state.players) {
    const energyOrder = baseOffOrder(state, owner.id, 'energy', cold);
    for (const { tile } of energyOrder) listed.add(tile);
    const noEnergy = turnedOff(energyOrder, owner.stock.energy);
    for (const tile of noEnergy) off.set(tile, 'energyOff');
    for (const tile of turnedOff(baseOffOrder(state, owner.id, 'water', cold, noEnergy), spare(owner))) off.set(tile, 'waterOff');
  }

  // With AM-18 off, who is short of Water is decided before anything runs, so a well harvested this month waters next
  // month's crops, not this month's.
  const dry = new Set(plotWaterOn() ? [] : state.players.filter((p) => p.stock.water < needsOf(state, p.id).water).map((p) => p.id));

  for (const tile of working.filter((t) => !isBaseProducer(t) && isRaw(t.outfit!))) {
    const owner = playerById.get(tile.owner!)!;
    const parts = rawOutputParts(state, tile);
    crewCut(tile, parts);
    const why = off.get(tile);
    if (why) switchOff(parts, why);
    else {
      owner.stock.energy -= use(tile);
      owner.stock.water -= waterUseOf(tile);
    }
    if (dry.has(owner.id) && UPKEEP.irrigated.includes(tile.outfit as RawGood)) halve(parts);
    credit(tile, tile.outfit as RawGood, parts);
  }

  for (const good of PROCESSED_GOODS) {
    for (const tile of working.filter((t) => t.outfit === good && listed.has(t))) runFactory(tile, good, off.get(tile));
  }
  // The second pass: the factories left out of the lists, on this month's inputs and the Energy and Water left over.
  for (const good of PROCESSED_GOODS) {
    for (const tile of working.filter((t) => t.outfit === good && !listed.has(t))) {
      const owner = playerById.get(tile.owner!)!;
      if (!hasStock(owner.stock, feedOf(good))) continue;
      const noEnergy = owner.stock.energy < use(tile);
      const why: OffWhy | undefined = noEnergy ? 'energyOff' : spare(owner) < waterUseOf(tile) ? 'waterOff' : undefined;
      if (why) off.set(tile, why);
      runFactory(tile, good, why);
    }
  }

  // The cross-use comes last (AM-18 W5): a well's Energy and a plant's Water, from what the other plots left.
  for (const tile of working.filter((t) => t.outfit === 'water' && isBaseProducer(t))) {
    const owner = playerById.get(tile.owner!)!;
    owner.stock.energy -= Math.min(Math.max(0, owner.stock.energy), use(tile));
  }
  for (const tile of working.filter((t) => t.outfit === 'energy')) {
    const owner = playerById.get(tile.owner!)!;
    owner.stock.water -= Math.min(spare(owner), waterUseOf(tile));
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
 * factories turn, a Medicine against sickness when the air is bad and one for the crews when the colony is sick. The
 * auction's status screen measures surplus and shortage against this.
 */
export function monthNeeds(state: GameState, playerId: string): Stock {
  const need = emptyStock();
  const { food, water, medicine } = needsOf(state, playerId);
  need.food = food;
  need.water = water;
  for (const t of state.tiles) {
    if (t.owner !== playerId || !t.outfit || t.outfit === 'greenBelt') continue;
    // A plant or a well pays its own use from its own output (AM-17 R2, PM ruling A; AM-18 W5): it is nobody's need.
    if (t.outfit !== 'energy') need.energy += energyUseOf(state, t);
    if (t.outfit !== 'water') need.water += waterUseOf(t);
    if (!isFactory(t.outfit)) continue;
    for (const [g, q] of Object.entries(feedOf(t.outfit)) as [Good, number][]) need[g] += q;
  }
  need.medicine = medicine + (airBand(state.air).sickens ? 1 : 0);
  return need;
}
