import { afterEach, describe, expect, it } from 'vitest';
import { advancePhase, AI_LEVELS, AI_PERSONAS, createGame, DEV_STEER, floorConfig, observe, STRATEGIST, tileIndex, type GameState, type Tile } from '@mule/engine';
import { unreachablePlot } from '../src/hands/develop.js';
import { draftPlaybook } from '../src/playbook/draft.js';
import { developDecision, ENERGY_FIRST } from '../src/strategist.js';
import type { Mind } from '../src/value.js';

/**
 * Energy first on the arcade floor (PM, 8 Nov): the rule holds only while a reachable Energy install exists. A lake no
 * shore reaches is no plant to wait for, so the seat chooses as if the rule never fired.
 */

const mind: Mind = { me: 'ai2', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader };
const players = [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true }));
const steering = DEV_STEER.on;
const saved = STRATEGIST.energyFirst;
afterEach(() => {
  DEV_STEER.on = steering;
  STRATEGIST.energyFirst = saved;
});

/** Seed 4's month-1 development: ai2 holds the lake ringed by lake at (10, 0), rich for power, and one plain near the store, rich farmland and poor for power. */
function table(): { state: GameState; lake: number; plain: number } {
  const state = createGame({ seed: 4, players });
  while (state.phase !== 'development') advancePhase(state);
  for (const t of state.tiles) if (t.owner === 'ai2') t.owner = null;
  const lake = tileIndex(state.width, 10, 0);
  const plain = state.tiles.findIndex((t) => t.owner === null && t.terrain === 'plains' && !t.special && Math.abs(t.y - 4) <= 1 && Math.abs(t.x - 7) <= 2);
  const me = state.players.find((p) => p.id === 'ai2')!;
  const ground = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };
  Object.assign(state.tiles[lake]!, { owner: 'ai2', traits: [], ground: { ...ground, energy: 4 }, pollution: 0 } satisfies Partial<Tile>);
  Object.assign(state.tiles[plain]!, { owner: 'ai2', traits: [], ground: { ...ground, food: 4, energy: -4 }, pollution: 0 } satisfies Partial<Tile>);
  me.analysed.push(lake, plain);
  DEV_STEER.on = true;
  STRATEGIST.energyFirst = true;
  return { state, lake, plain };
}

const route = (state: GameState) => draftPlaybook({ state, seat: 'ai2', mind, seed: 102, phase: 'development' }).development!.route;
const vetoOf = (state: GameState, key: string) => developDecision(observe(state, 'ai2'), mind, 0).all.find((c) => c.key === key)?.veto;

describe('Energy first on the floor: the rule holds only while a reachable Energy install exists', () => {
  it('a reachable plant and an unreachable one: the seat installs the reachable plant, not the farm it would rather have', () => {
    const { state, lake, plain } = table();
    expect(unreachablePlot(state, lake, floorConfig()), 'the case: no shore reaches the lake').toBe(true);
    expect(unreachablePlot(state, plain, floorConfig())).toBe(false);
    state.players.find((p) => p.id === 'ai2')!.money = 3000;
    // The case: both plants are allowed, so the rule fires for the plain's plant and rules out its farm.
    expect(vetoOf(state, `install:energy:${lake}`)).toBeNull();
    expect(vetoOf(state, `install:energy:${plain}`)).toBeNull();
    expect(vetoOf(state, `install:food:${plain}`)).toBe(ENERGY_FIRST);

    expect(route(state)).toContainEqual({ act: 'install', plot: plain });
    expect(route(state)).toContainEqual({ act: 'outfit', outfit: 'energy' });
    // Negative case: with the rule off the same seat farms the plain.
    STRATEGIST.energyFirst = false;
    expect(route(state)).toContainEqual({ act: 'outfit', outfit: 'food' });
  });

  it("the only plant allowed is the unreachable lake's: the seat farms its plain, not stops", () => {
    const { state, lake, plain } = table();
    const me = state.players.find((p) => p.id === 'ai2')!;
    // The cash where the plain's poor plant can't keep the upkeep reserve and its farm can: found, not guessed.
    const fits = (money: number) => {
      me.money = money;
      return vetoOf(state, `install:energy:${lake}`) === null && ![null, ENERGY_FIRST].includes(vetoOf(state, `install:energy:${plain}`) ?? null) && vetoOf(state, `install:food:${plain}`) === ENERGY_FIRST;
    };
    let money = 0;
    while (money <= 3000 && !fits(money)) money += 5;
    expect(money, 'the case exists: only the lake plant is allowed, and the rule rules out the farm').toBeLessThanOrEqual(3000);
    fits(money);

    const r = route(state);
    expect(r).toContainEqual({ act: 'install', plot: plain });
    expect(r).toContainEqual({ act: 'outfit', outfit: 'food' });
    expect(r).not.toContainEqual({ act: 'install', plot: lake });
  });
});
