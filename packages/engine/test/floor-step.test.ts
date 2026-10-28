import { describe, expect, it } from 'vitest';
import {
  buildFloor,
  createGame,
  createRng,
  DEV_STEER,
  floorConfig,
  stepFloor,
  type DevFloor,
  type FloorInput,
  type GameState,
  type HallPlan,
  type Terrain,
} from '../src/index.js';

const LAND: Record<string, Terrain> = { '.': 'plains', '^': 'mountains', s: 'swamp', '~': 'lake', f: 'forest', S: 'store' };

/** The store at 5·3 with open plains on both sides of it, lakes, mountains, swamp and forest around. */
const MAP = [
  '..f.....^^...',
  '..f..~~.^^...',
  '.....~~......',
  '.s...S.......',
  '.s........~..',
  '....^^....~..',
  '.............',
];

const HALL: HallPlan = {
  width: 16,
  height: 12,
  floor: [
    { x0: 1, y0: 4, x1: 15, y1: 8 },
    { x0: 0, y0: 5, x1: 1, y1: 7 },
    { x0: 15, y0: 5, x1: 16, y1: 7 },
  ],
  doors: { L: { x0: 0, y0: 5, x1: 1, y1: 7 }, R: { x0: 15, y0: 5, x1: 16, y1: 7 } },
};

const SEED = 29;
/** A development turn's worth of ticks: 50 s at DEV_STEER.tickMs. */
const TICKS = 1_000;

/** Four seats on MAP: 'a' a Zipwing, 'b' leading a MULE, 'c' an AI seat, 'd' a Bramblet. */
function game(seed: number): GameState {
  const state = createGame({
    seed,
    players: [
      { id: 'a', name: 'A', isAi: false, species: 'zipwing' },
      { id: 'b', name: 'B', isAi: false, species: 'gearling' },
      { id: 'c', name: 'C', isAi: true, species: 'mollox' },
      { id: 'd', name: 'D', isAi: false, species: 'bramblet' },
    ],
  });
  const template = state.tiles[0]!;
  state.width = MAP[0]!.length;
  state.height = MAP.length;
  state.tiles = MAP.flatMap((row, y) => [...row].map((ch, x) => ({ ...template, x, y, terrain: LAND[ch]!, owner: null, outfit: null })));
  return state;
}

type Script = Record<string, FloorInput>[];

const go = (x: number, y: number): FloorInput => ({ x, y, act: false });

/**
 * 'a' walks right from outside the store's left door, through the hall and out of its right door to the map's edge,
 * back the same way, then down, then stands; the others wander, from the seed, with sticks past full and in between.
 */
function script(seed: number): Script {
  const rng = createRng(seed);
  const sticks = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];
  const wander = () => go(rng.pick(sticks), rng.pick(sticks));
  const held: Record<string, FloorInput> = { b: wander(), c: wander(), d: wander() };
  return Array.from({ length: TICKS }, (_, t) => {
    if (t % 20 === 0) for (const id of Object.keys(held)) held[id] = wander();
    const a = t < 200 ? go(1, 0) : t < 400 ? go(-1, 0) : t < 600 ? go(0, 1) : go(0, 0);
    return { a, ...held };
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** Every floor of a turn played from the seed, the game and the inputs frozen so that a write to either throws. */
function play(seed: number, inputs: Script): { state: GameState; floors: DevFloor[] } {
  const state = game(seed);
  const cfg = floorConfig(HALL);
  const start = buildFloor(state, cfg);
  let floor: DevFloor = { ...start, colonists: start.colonists.map((c) => (c.id === 'b' ? { ...c, lead: { good: 'food', x: c.x, y: c.y } } : c)) };
  deepFreeze(state);
  deepFreeze(inputs);
  const floors = [deepFreeze(floor)];
  for (const tick of inputs) {
    floor = deepFreeze(stepFloor(floor, state, tick, DEV_STEER.tickMs, cfg));
    floors.push(floor);
  }
  return { state, floors };
}

/** Why a colonist stands where it may not: on a lake, in the store's walls, off the map or off the hall's floor. */
function misplaced(state: GameState, floor: DevFloor): string[] {
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  return floor.colonists.flatMap((c) => {
    const where = `tick ${floor.tick} ${c.id} at ${c.space} ${c.x.toFixed(3)},${c.y.toFixed(3)}`;
    if (c.space === 'hall') {
      return HALL.floor.some((r) => c.x >= r.x0 && c.x <= r.x1 && c.y >= r.y0 && c.y <= r.y1) ? [] : [`${where}: off the hall's floor`];
    }
    if (c.x < 0 || c.y < 0 || c.x > state.width || c.y > state.height) return [`${where}: off the map`];
    if (state.tiles[Math.floor(c.y) * state.width + Math.floor(c.x)]?.terrain === 'lake') return [`${where}: on a lake`];
    if (c.x > store.x && c.x < store.x + 1 && c.y > store.y && c.y < store.y + 1) return [`${where}: in the store's walls`];
    return [];
  });
}

describe('the dev floor: the step', () => {
  it('T-AC-1: a seed and a per-tick input script step to identical floors', () => {
    const inputs = script(SEED);
    const first = play(SEED, inputs);
    const again = play(SEED, script(SEED));
    expect(again.floors).toEqual(first.floors);

    // The script walks every kind of move: 'a' through both doors and back, so the hall is stepped too.
    const spaces = first.floors.map((f) => f.colonists[0]!.space).filter((s, i, all) => i === 0 || s !== all[i - 1]);
    expect(spaces, "'a' in and out of the hall, twice").toEqual(['map', 'hall', 'map', 'hall', 'map']);
    expect(first.floors.flatMap((f) => misplaced(first.state, f))).toEqual([]);

    // One input changed at one tick: 'a', standing still in the corner, steps right once.
    const changed = inputs.map((tick, t) => (t === 700 ? { ...tick, a: go(1, 0) } : tick));
    const nudged = play(SEED, changed).floors.at(-1)!;
    expect(nudged.colonists[0]!.x).toBeGreaterThan(first.floors.at(-1)!.colonists[0]!.x);
    expect(nudged).not.toEqual(first.floors.at(-1));
  });
});
