import { ADJACENCY, FACTORY, FACTORY_FIT, GROWN_BASE, GROWN_MIN, POLLUTION, RECIPES, SPECIES_PERK, THIN_VEIN_MONTHS, TRAIT_EFFECT, UPKEEP } from './config.js';
import { eventOutput, planEvent } from './events.js';
import { neighbours } from './map.js';
import { airBand, runPollution } from './pollution.js';
import { relicFit, settleSpecials, specialBonus } from './specials.js';
import { addStock, emptyStock, hasStock } from './stock.js';
import {
  GROWN_GOODS,
  MINED_GOODS,
  PROCESSED_GOODS,
  RAW_GOODS,
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
  if (size >= 2) return ADJACENCY.neighbour;
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

/**
 * Runs one production phase. Order matters and mirrors the design:
 * 1. Energy plots produce first, so their output can power the rest;
 * 2. every other working raw plot needs its Energy, or produces half, and a
 *    farm whose owner is short of Water produces half again;
 * 3. factories convert inputs from the owner's stock, Alloy first because
 *    Electronics needs it; in an Energy shortage they are served last;
 * 4. special fields settle (ruins pay, a mined cavern may collapse), then
 *    pollution spreads and the air gauge moves.
 * Returns what each player produced and the air points each caused.
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
  const event = planEvent(state);
  const hit = new Map(event?.plots.map((p) => [p.index, p]));
  const credit = (tile: Tile, good: Good, parts: Part[]) => {
    const plot = hit.get(indexOf.get(tile)!);
    if (event && plot) {
      // The event comes last, on top of everything else that made this month's output.
      const before = parts.reduce((n, p) => n + p.delta, 0);
      plot.delta = eventOutput(event.key, before, plot.order === 0) - before;
      parts.push({ why: 'event', delta: plot.delta, event: event.key });
    }
    const made = parts.reduce((n, p) => n + p.delta, 0);
    playerById.get(tile.owner!)!.stock[good] += made;
    produced[tile.owner!]![good] += made;
    lines.push({ tile: indexOf.get(tile)!, good, made, parts });
    ran.add(tile);
  };
  /** Cuts what the parts add up to to UPKEEP.shortOutputShare, rounding down, as a part of its own. */
  const halve = (parts: Part[], why: Part['why']) => {
    const made = parts.reduce((n, p) => n + p.delta, 0);
    if (made > 0) parts.push({ why, delta: Math.floor(made * UPKEEP.shortOutputShare) - made });
  };

  for (const tile of working.filter((t) => t.outfit === 'energy')) credit(tile, 'energy', rawOutputParts(state, tile));

  // Who is short of Water is decided before anything runs, so a well
  // harvested this month waters next month's crops, not this month's.
  const dry = new Set(state.players.filter((p) => p.stock.water < needsOf(state, p.id).water).map((p) => p.id));

  for (const tile of working.filter((t) => t.outfit !== 'energy' && isRaw(t.outfit!))) {
    const owner = playerById.get(tile.owner!)!;
    const good = tile.outfit as RawGood;
    const parts = rawOutputParts(state, tile);
    const energy = energyUseOf(state, tile);
    if (owner.stock.energy >= energy) owner.stock.energy -= energy;
    else halve(parts, 'noEnergy');
    if (dry.has(owner.id) && UPKEEP.irrigated.includes(good)) halve(parts, 'noWater');
    credit(tile, good, parts);
  }

  for (const good of PROCESSED_GOODS) {
    for (const tile of working.filter((t) => t.outfit === good)) {
      const owner = playerById.get(tile.owner!)!;
      const fit = factoryFit(state, tile, good, owner.id);
      const inputs = { ...RECIPES[good].inputs, energy: fit.energy };
      if (!hasStock(owner.stock, inputs)) continue;
      addStock(owner.stock, inputs, -1);
      credit(tile, good, [{ why: 'factory', delta: fit.output }]);
    }
  }

  // Green belts don't produce, but they count as running.
  for (const tile of working) {
    if (tile.outfit === 'greenBelt') ran.add(tile);
    tile.runMonths = ran.has(tile) ? tile.runMonths + 1 : 0;
  }

  settleSpecials(state, lines);
  const pollutionBy = runPollution(state);
  return { produced, pollutionBy, lines, events: event ? [event] : [] };
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
    if (!isFactory(t.outfit)) continue;
    for (const [g, q] of Object.entries(RECIPES[t.outfit].inputs) as [Good, number][]) if (g !== 'energy') need[g] += q;
  }
  if (airBand(state.air).sickPace < 1) need.medicine = 1;
  return need;
}
