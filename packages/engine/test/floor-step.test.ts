import { describe, expect, it } from 'vitest';
import {
  buildFloor,
  createGame,
  createRng,
  DEV_STEER,
  floorConfig,
  HALL,
  pathTo,
  stepFloor,
  type DevFloor,
  type FloorInput,
  type GameState,
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

const SEED = 29;
/** A development turn's worth of ticks: 50 s at DEV_STEER.tickMs. */
const TICKS = 1_000;

/** Four seats on the map drawn: 'a' a Zipwing, 'b' leading a MULE, 'c' an AI seat, 'd' a Bramblet. */
function game(seed: number, map: readonly string[] = MAP): GameState {
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
  state.width = map[0]!.length;
  state.height = map.length;
  state.tiles = map.flatMap((row, y) => [...row].map((ch, x) => ({ ...template, x, y, terrain: LAND[ch]!, owner: null, outfit: null })));
  state.players[1]!.carriedMule = 'food';
  return state;
}

type Script = Record<string, FloorInput>[];

const go = (x: number, y: number): FloorInput => ({ x, y, act: false });

/** 'd' from outside the store's right door: under the store and up into its wall, then into its side off the door. */
const D_LEGS: [number, FloorInput][] = [
  [20, go(0, 1)],
  [35, go(-1, 0)],
  [60, go(0, -1)],
  [80, go(1, 0)],
  [100, go(0, -1)],
  [180, go(-1, 0)],
];

/**
 * 'a' walks right from outside the store's left door, through the hall and out of its right door to the map's edge,
 * back the same way, then down, then stands. 'd' walks D_LEGS. Then they and the others wander, from the seed, with
 * sticks past full and in between.
 */
function script(seed: number): Script {
  const rng = createRng(seed);
  const sticks = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];
  const wander = () => go(rng.pick(sticks), rng.pick(sticks));
  const held: Record<string, FloorInput> = { b: wander(), c: wander(), d: wander() };
  return Array.from({ length: TICKS }, (_, t) => {
    if (t % 20 === 0) for (const id of Object.keys(held)) held[id] = wander();
    const a = t < 200 ? go(1, 0) : t < 400 ? go(-1, 0) : t < 600 ? go(0, 1) : go(0, 0);
    const d = D_LEGS.find(([until]) => t < until)?.[1] ?? held.d!;
    return { ...held, a, d };
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
  let floor = buildFloor(state, cfg);
  deepFreeze(state);
  deepFreeze(inputs);
  const floors = [deepFreeze(floor)];
  for (const tick of inputs) {
    floor = deepFreeze(stepFloor(floor, state, tick, DEV_STEER.tickMs, cfg));
    floors.push(floor);
  }
  return { state, floors };
}

/**
 * Why a colonist stands where it may not: on a lake, in the store's walls, off the map or off the hall's floor; or
 * its MULE is further behind than the lead reaches.
 */
function misplaced(state: GameState, floor: DevFloor): string[] {
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  return floor.colonists.flatMap((c) => {
    const where = `tick ${floor.tick} ${c.id} at ${c.space} ${c.x.toFixed(3)},${c.y.toFixed(3)}`;
    const rope = c.space === 'map' ? DEV_STEER.leadTiles : DEV_STEER.leadHallShare * HALL.w;
    if (c.lead && Math.hypot(c.lead.x - c.x, c.lead.y - c.y) > rope + 1e-9) return [`${where}: its MULE off its lead`];
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

    expect(first.floors.flatMap((f) => misplaced(first.state, f))).toEqual([]);
    // The script walks every kind of move: through both doors and back, and into the store's walls off the door.
    const spaces = (seat: number, until: number) =>
      first.floors.slice(0, until + 1).map((f) => f.colonists[seat]!.space).filter((s, i, all) => i === 0 || s !== all[i - 1]);
    expect(spaces(0, TICKS), "'a' in and out of the hall, twice").toEqual(['map', 'hall', 'map', 'hall', 'map']);
    expect(spaces(3, D_LEGS.at(-1)![0]), "'d' slid along the store's side onto its door, and through").toEqual(['map', 'hall', 'map']);
    const facing = (t: number) => first.floors[t]!.colonists[3]!.facing;
    expect([facing(30), facing(70)], "'d' faces the way it walks: left, then right").toEqual(['left', 'right']);

    // One input changed at one tick: 'a', standing still in the corner, steps right once.
    const changed = inputs.map((tick, t) => (t === 700 ? { ...tick, a: go(1, 0) } : tick));
    const nudged = play(SEED, changed).floors.at(-1)!;
    expect(nudged.colonists[0]!.x).toBeGreaterThan(first.floors.at(-1)!.colonists[0]!.x);
    expect(nudged).not.toEqual(first.floors.at(-1));
  });

  it('RULE-9, serving B-AC-1: the path goes round a lake, takes plains over mountains when equally short, and reaches a lake plot at its shore', () => {
    // From beside the store's door, 2·3, to a plot at 7·3, a lake between them: round it above or below, nine steps either way.
    const across = (above: string, below: string) => ['~~~~~~~~~', above, '....~....', '.S..~....', '....~....', below, '~~~~~~~~~'];
    const cfg = floorConfig(HALL);
    const from = { x: 2, y: 3 };
    const plot = { x: 7, y: 3 };
    const land = (state: GameState, p: { x: number; y: number }) => state.tiles[p.y * state.width + p.x]!.terrain;
    for (const [label, map, side] of [
      ['a mountain above', across('....^....', '.........'), 5],
      ['a mountain below', across('.........', '....^....'), 1],
    ] as const) {
      const state = game(SEED, map);
      const path = pathTo(state, from, plot, cfg)!;
      expect(path.tiles[0], label).toEqual(from);
      expect(path.tiles.at(-1), label).toEqual(plot);
      expect(path.tiles.some((p) => p.x === 4 && p.y === side), `${label}: round the lake on the plains side`).toBe(true);
      expect(path.tiles.map((p) => land(state, p)), label).not.toContain('lake');
      expect(path.tiles.map((p) => land(state, p)), label).not.toContain('mountains');
      expect(path.tiles.every((p, i) => i === 0 || Math.abs(p.x - path.tiles[i - 1]!.x) + Math.abs(p.y - path.tiles[i - 1]!.y) === 1), label).toBe(true);
      // Nine plains tiles entered at 1.25 tiles a second.
      expect(path.seconds, label).toBeCloseTo(7.2, 9);
    }

    // A lake plot is worked from its shore: the path ends on it, and the step into it costs nothing.
    const state = game(SEED, across('.........', '.........'));
    const shore = pathTo(state, from, { x: 4, y: 3 }, cfg)!;
    expect(shore.tiles).toEqual([from, { x: 3, y: 3 }, { x: 4, y: 3 }]);
    expect(shore.seconds).toBeCloseTo(0.8, 9);

    // Negative: a plot walled in by lakes has no path.
    expect(pathTo(game(SEED, ['.....', '..~..', '.~.~.', '..~..', 'S....']), { x: 0, y: 0 }, { x: 2, y: 2 }, cfg)).toBeNull();
  });
});
