import {
  cloneForSim,
  energyUseOf,
  GOOD_CONFIG,
  GROWN_BASE,
  isFactory,
  monthNeeds,
  PROCESSED_GOODS,
  RAW_GOODS,
  rawOutput,
  RECIPES,
  UPKEEP,
  type DevelopmentPlay,
  type GameState,
  type Outfit,
  type PlayerId,
  type RawGood,
} from '@mule/engine';
import { GOOD_NAME } from '../strategist.js';

/**
 * The Energy the brief's verdict weighs, as runProduction plays it (production.ts): each plant makes its output and pays
 * its own use from it, never more than it made; then the owner's other plots are turned off, biggest use first, until
 * their uses fit what the owner holds. So a plot stays on at a production when what the seat holds there, plus what its
 * plants put in, covers what its other plots and works use.
 */
export interface EnergyAt {
  /**
   * What the seat's plants put in its stock: each its output on its ground (rawOutput) less min(output, use). A plant's
   * ground is the one its last production line showed, or the analysed one; a plant with neither (new since) counts the
   * terrain's average, rounded down.
   */
  supply: number;
  /** What the seat's other plots and works use (monthNeeds' Energy). */
  need: number;
  /** MULEs the drafted route installs before that production, counted in both. */
  installs: number;
}

/**
 * What the next production weighs for the seat, its plots as they stand plus the MULEs `development` installs before
 * it. Events and a cold snap are rolled at the production, so they are not in it. A MULE the route installs on this
 * month's grant plot ("granted", not known yet) adds its outfit's use from config, and nothing to the supply.
 */
export function energyAt(obs: GameState, me: PlayerId, development: DevelopmentPlay | null = null): EnergyAt {
  const sim = cloneForSim(obs);
  learnPlantGround(sim, me);
  let unplaced = 0;
  let installs = 0;
  let carried: Outfit | null = null;
  for (const step of development?.route ?? []) {
    if (step.act === 'buyMule') carried = null;
    if (step.act === 'outfit') carried = step.outfit ?? null;
    if (step.act !== 'install' || !carried) continue;
    installs++;
    const tile = typeof step.plot === 'number' ? sim.tiles[step.plot] : undefined;
    if (tile) Object.assign(tile, { owner: me, outfit: carried, runMonths: 0 });
    else unplaced += nominalUse(carried);
    carried = null;
  }
  const supply = sim.tiles
    .filter((t) => t.owner === me && t.outfit === 'energy')
    .reduce((n, t) => {
      const made = Math.max(0, Math.floor(rawOutput(sim, t)));
      return n + made - Math.min(made, energyUseOf(sim, t));
    }, 0);
  return { supply, need: monthNeeds(sim, me).energy + unplaced, installs };
}

/**
 * Sets on `sim` the Energy ground each plant of the seat's showed at the last production. The seat's observation keeps
 * the terrain's average for a plot it has not analysed, but its own production line filed the ground's part of the
 * output, GROWN_BASE plus the rating (production.ts rawOutputParts), and Energy is a grown good. An analysed plot keeps
 * the ground the observation holds.
 */
function learnPlantGround(sim: GameState, me: PlayerId): void {
  const analysed = new Set(sim.players.find((p) => p.id === me)?.analysed ?? []);
  for (const line of sim.history.at(-1)?.lines ?? []) {
    const tile = sim.tiles[line.tile];
    if (!tile || tile.owner !== me || tile.outfit !== 'energy' || line.good !== 'energy' || analysed.has(line.tile)) continue;
    const ground = line.parts.find((p) => p.why === 'ground');
    if (ground) tile.ground = { ...tile.ground, energy: ground.delta - GROWN_BASE };
  }
}

/** The Energy an outfit's plot uses a production, from config: a plant pays its own, so it adds none. */
function nominalUse(outfit: Outfit): number {
  if (outfit === 'energy' || outfit === 'greenBelt') return 0;
  if (isFactory(outfit)) return RECIPES[outfit].inputs.energy ?? 0;
  return UPKEEP.energyUse[outfit as RawGood];
}

/** What upkeep leaves of `held` Energy for the next production, as runUpkeep plays it: spoilage rounded down, the depot cap. */
export const energyAfterUpkeep = (held: number) => Math.min(UPKEEP.depotCapacity, Math.floor(held * (1 - GOOD_CONFIG.energy.spoilage)));

/** The least Energy the seat may end the auction with and still hold `check` at the next production; null when the depot cannot keep it. */
export function energyToKeep(check: number): number | null {
  if (check > UPKEEP.depotCapacity) return null;
  let held = Math.max(0, check);
  while (energyAfterUpkeep(held) < check) held++;
  return held;
}

/** What each MULE adds to the use, from config: raw MULEs by good, works by recipe, a plant nothing. */
export function useRule(): string {
  const byUse = new Map<number, string[]>();
  for (const g of RAW_GOODS) {
    if (g === 'energy') continue;
    const use = UPKEEP.energyUse[g];
    byUse.set(use, [...(byUse.get(use) ?? []), GOOD_NAME[g]]);
  }
  const or = (names: string[]) => (names.length === 1 ? names[0]! : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`);
  const raw = [...byUse].map(([use, names]) => `a ${or(names)} MULE uses ${use}`).join(', ');
  const works = PROCESSED_GOODS.map((g) => `${GOOD_NAME[g]} ${RECIPES[g].inputs.energy ?? 0}`).join(', ');
  return `${raw}, a works what its recipe takes (${works}); an Energy MULE pays its own`;
}
