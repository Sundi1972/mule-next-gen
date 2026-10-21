import { ADJACENCY, FACTORY, FACTORY_FIT, GROWN_BASE, GROWN_MIN, POLLUTION, RECIPES, SPECIES_PERK, THIN_VEIN_MONTHS, TRAIT_EFFECT, UPKEEP } from './config.js';
import { neighbours } from './map.js';
import { airBand, runPollution } from './pollution.js';
import { addStock, emptyStock, hasStock } from './stock.js';
import {
  GROWN_GOODS,
  MINED_GOODS,
  PROCESSED_GOODS,
  RAW_GOODS,
  type GameState,
  type Good,
  type MinedGood,
  type Outfit,
  type ProcessedGood,
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
 * then traits, the owner's species, adjacency and pollution.
 */
export function rawOutput(state: GameState, tile: Tile): number {
  const good = tile.outfit;
  if (!good || !isRaw(good)) return 0;
  const species = state.players.find((p) => p.id === tile.owner)?.species;
  let output: number;
  if (isMined(good)) {
    // A deposit of 0 means there is nothing to mine.
    if (tile.ground[good] <= 0) return 0;
    output = tile.ground[good];
    if (tile.traits.includes('thinVein')) output -= Math.floor(tile.runMonths / THIN_VEIN_MONTHS);
    if (species === 'mollox') output += SPECIES_PERK.molloxMine;
  } else {
    output = Math.max(GROWN_MIN, GROWN_BASE + tile.ground[good]);
    if (good === 'food' && species === 'bramblet') output += SPECIES_PERK.brambletFood;
  }
  for (const trait of tile.traits) output += TRAIT_EFFECT[trait]?.[good] ?? 0;
  if (output > 0) output += adjacencyBonus(state, tile);
  output -= pollutionLoss(state, tile, good);
  return Math.max(0, output);
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
 * plot that makes one of its inputs, an industrial park, experience and
 * pollution (for Medicine). The same numbers drive production and the fit
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
 * 2. every other working raw plot needs 1 Energy, or produces half;
 * 3. factories convert inputs from the owner's stock, Alloy first because
 *    Electronics needs it; in an Energy shortage they are served last;
 * 4. pollution spreads and the air gauge moves.
 * Returns what each player produced and the air points each caused.
 */
export function runProduction(state: GameState): { produced: Record<string, Stock>; pollutionBy: Record<string, number> } {
  const produced: Record<string, Stock> = {};
  for (const player of state.players) produced[player.id] = emptyStock();

  const working = state.tiles.filter((t) => t.owner && t.outfit);
  const playerById = new Map(state.players.map((p) => [p.id, p]));
  const ran = new Set<Tile>();

  for (const tile of working.filter((t) => t.outfit === 'energy')) {
    const amount = rawOutput(state, tile);
    playerById.get(tile.owner!)!.stock.energy += amount;
    produced[tile.owner!]!.energy += amount;
    ran.add(tile);
  }

  for (const tile of working.filter((t) => t.outfit !== 'energy' && isRaw(t.outfit!))) {
    const owner = playerById.get(tile.owner!)!;
    const good = tile.outfit as RawGood;
    let amount = rawOutput(state, tile);
    const energy = energyUseOf(state, tile);
    if (owner.stock.energy >= energy) owner.stock.energy -= energy;
    else amount = Math.floor(amount / 2);
    owner.stock[good] += amount;
    produced[tile.owner!]![good] += amount;
    ran.add(tile);
  }

  for (const good of PROCESSED_GOODS) {
    for (const tile of working.filter((t) => t.outfit === good)) {
      const owner = playerById.get(tile.owner!)!;
      const fit = factoryFit(state, tile, good, owner.id);
      const inputs = { ...RECIPES[good].inputs, energy: fit.energy };
      if (!hasStock(owner.stock, inputs)) continue;
      addStock(owner.stock, inputs, -1);
      owner.stock[good] += fit.output;
      produced[tile.owner!]![good] += fit.output;
      ran.add(tile);
    }
  }

  // Green belts don't produce, but they count as running.
  for (const tile of working) {
    if (tile.outfit === 'greenBelt') ran.add(tile);
    tile.runMonths = ran.has(tile) ? tile.runMonths + 1 : 0;
  }

  const pollutionBy = runPollution(state);
  return { produced, pollutionBy };
}

/** Raw goods a plot is rated for, best first, from the ground card. */
export function rankGround(tile: Tile): { good: RawGood; rating: number }[] {
  return [...GROWN_GOODS, ...MINED_GOODS]
    .map((good) => ({ good, rating: tile.ground[good] }))
    .sort((a, b) => b.rating - a.rating);
}
