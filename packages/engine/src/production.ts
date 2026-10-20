import {
  ADJACENCY,
  BASE_OUTPUT,
  FACTORY_TERRAIN_BONUS,
  RECIPES,
  TERRAIN_BONUS,
  TRAIT_EFFECT,
  UPKEEP,
} from './config.js';
import { neighbours } from './map.js';
import { addStock, emptyStock, hasStock } from './stock.js';
import { PROCESSED_GOODS, type GameState, type Good, type ProcessedGood, type Stock, type Tile } from './types.js';

export function isFactory(good: Good): good is ProcessedGood {
  return (PROCESSED_GOODS as readonly Good[]).includes(good);
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

/** Output of a raw-goods plot before the energy check. */
export function rawOutput(state: GameState, tile: Tile): number {
  const good = tile.outfit;
  if (!good || isFactory(good)) return 0;
  let output: number;
  if (good === 'crystite') {
    output = tile.crystite;
  } else {
    output = BASE_OUTPUT + (TERRAIN_BONUS[tile.terrain][good] ?? 0);
    if (good === 'smithore') output += tile.peaks;
  }
  for (const trait of tile.traits) output += TRAIT_EFFECT[trait][good] ?? 0;
  if (output > 0) output += adjacencyBonus(state, tile);
  return Math.max(0, output);
}

/** How many units a factory makes per run, including terrain bonus. */
export function factoryRunOutput(tile: Tile, good: ProcessedGood): number {
  return RECIPES[good].output + (FACTORY_TERRAIN_BONUS[tile.terrain]?.[good] ?? 0);
}

/**
 * Runs one production phase. Order matters and mirrors the design:
 * 1. raw plots produce, and Energy lands in stock first;
 * 2. every working non-Energy plot needs 1 Energy, or produces half;
 * 3. factories convert inputs from the owner's stock.
 * Returns what each player produced.
 */
export function runProduction(state: GameState): Record<string, Stock> {
  const produced: Record<string, Stock> = {};
  for (const player of state.players) produced[player.id] = emptyStock();

  const working = state.tiles.filter((t) => t.owner && t.outfit);
  const playerById = new Map(state.players.map((p) => [p.id, p]));

  // 1. Energy plots first, so their output can power the rest.
  for (const tile of working.filter((t) => t.outfit === 'energy')) {
    const amount = rawOutput(state, tile);
    playerById.get(tile.owner!)!.stock.energy += amount;
    produced[tile.owner!]!.energy += amount;
  }

  // 2. Other raw plots, paying their Energy.
  for (const tile of working.filter((t) => t.outfit !== 'energy' && !isFactory(t.outfit!))) {
    const owner = playerById.get(tile.owner!)!;
    let amount = rawOutput(state, tile);
    if (owner.stock.energy >= UPKEEP.energyPerPlot) owner.stock.energy -= UPKEEP.energyPerPlot;
    else amount = Math.floor(amount / 2);
    owner.stock[tile.outfit!] += amount;
    produced[tile.owner!]![tile.outfit!] += amount;
  }

  // 3. Factories, Alloy first because Electronics needs it.
  for (const good of PROCESSED_GOODS) {
    for (const tile of working.filter((t) => t.outfit === good)) {
      const owner = playerById.get(tile.owner!)!;
      const recipe = RECIPES[good];
      if (!hasStock(owner.stock, recipe.inputs)) continue;
      addStock(owner.stock, recipe.inputs, -1);
      const amount = factoryRunOutput(tile, good);
      owner.stock[good] += amount;
      produced[tile.owner!]![good] += amount;
    }
  }

  return produced;
}
