import { describe, expect, it } from 'vitest';
import {
  buildFloor,
  createGame,
  DEV_STEER,
  floorConfig,
  HALL,
  speedOf,
  stepFloor,
  type DevFloor,
  type FloorColonist,
  type FloorConfig,
  type FloorInput,
  type GameState,
  type Terrain,
} from '../src/index.js';

const LAND: Record<string, Terrain> = { '.': 'plains', '^': 'mountains', s: 'swamp', '~': 'lake', S: 'store' };

/** Plains with a mountain, a swamp and a lake along the top, and the store in the middle. */
const MAP = [
  '.^s~~.......',
  '............',
  '............',
  '.....S......',
  '............',
  '............',
  '............',
];

/** A fed Zipwing ('zip') and an AI Bramblet ('bot') on MAP. */
function game(): GameState {
  const state = createGame({
    seed: 3,
    players: [
      { id: 'zip', name: 'Zip', isAi: false, species: 'zipwing' },
      { id: 'bot', name: 'Bot', isAi: true, species: 'bramblet' },
    ],
  });
  const template = state.tiles[0]!;
  state.width = MAP[0]!.length;
  state.height = MAP.length;
  state.tiles = MAP.flatMap((row, y) => [...row].map((ch, x) => ({ ...template, x, y, terrain: LAND[ch]!, owner: null, outfit: null })));
  return state;
}

const withSteer = (cfg: FloorConfig, steer: Partial<FloorConfig['steer']>): FloorConfig => ({ ...cfg, steer: { ...cfg.steer, ...steer } });

/** The floor with one colonist changed. */
const placed = (floor: DevFloor, id: string, change: Partial<FloorColonist>): DevFloor => ({
  ...floor,
  colonists: floor.colonists.map((c) => (c.id === id ? { ...c, ...change } : c)),
});

const onTile = (x: number, y: number): Partial<FloorColonist> => ({ space: 'map', x: x + 0.5, y: y + 0.5 });
const leading: Partial<FloorColonist> = { lead: { good: null, x: 0.5, y: 1.5 } };

describe('the dev floor: speed', () => {
  it("T-AC-2: speeds per RULE-2's examples", () => {
    const state = game();
    const cfg = floorConfig(HALL);
    const floor = buildFloor(state, cfg);
    const rows: [string, string, Partial<FloorColonist>, Partial<FloorConfig['steer']>, number, number][] = [
      ['plains, a fed Zipwing, no MULE', 'zip', onTile(0, 1), {}, 1.5625, 9],
      ['mountains', 'zip', onTile(1, 0), {}, 0.625, 9],
      ['swamp', 'zip', onTile(2, 0), {}, 0.78, 2],
      ['leading a MULE on plains', 'zip', { ...onTile(0, 1), ...leading }, {}, 1.41, 2],
      ['bitten, on plains', 'zip', { ...onTile(0, 1), bitten: true }, {}, 0.78, 2],
      ['a lake, worked from its shore: 0 blocks', 'zip', onTile(3, 0), {}, 0, 9],
      ['a lake, waded', 'zip', onTile(3, 0), { lakeMode: 'wade' }, 0.47, 2],
      ['mountains, impassable', 'zip', onTile(1, 0), { mountainsImpassable: true }, 0, 9],
      ['an AI Bramblet on plains, bots at 0.8', 'bot', onTile(0, 1), { botSpeed: 0.8 }, 1, 9],
      // The hall: 8.893 units from the left door's spot to the corral's, in floorSeconds 3: 2.9643 units a second.
      ['in the hall: door to corral in 3 s, × the Zipwing', 'zip', { space: 'hall', x: 8, y: 6 }, {}, 3.7054, 4],
      ['in the hall, leading a MULE', 'zip', { space: 'hall', x: 8, y: 6, ...leading }, {}, 3.3349, 4],
    ];
    for (const [label, id, change, steer, expected, digits] of rows) {
      const c = placed(floor, id, change).colonists.find((x) => x.id === id)!;
      expect(speedOf(c, state, withSteer(cfg, steer)), label).toBeCloseTo(expected, digits);
    }

    // Held for one second: the distance walked is the speed, a diagonal no faster, and a lake never entered.
    const second = (start: Partial<FloorColonist>, input: FloorInput): FloorColonist => {
      let f = placed(floor, 'zip', start);
      for (let t = 0; t < 1_000 / DEV_STEER.tickMs; t++) f = stepFloor(f, state, { zip: input }, DEV_STEER.tickMs, cfg);
      return f.colonists.find((c) => c.id === 'zip')!;
    };
    const right = second(onTile(0, 5), { x: 1, y: 0, act: false });
    expect([right.x, right.y], 'held right on plains').toEqual([expect.closeTo(2.0625, 9), 5.5]);
    const diagonal = second(onTile(0, 5), { x: 1, y: -1, act: false });
    expect(Math.hypot(diagonal.x - 0.5, diagonal.y - 5.5), 'held up and right on plains').toBeCloseTo(1.5625, 9);
    const shore = second(onTile(3, 1), { x: 0, y: -1, act: false });
    expect(Math.floor(shore.y), 'held up into the lake: stays on its shore').toBe(1);
    expect(shore.y, 'held up into the lake: walked up to it').toBeLessThan(1.3);

    // Leading is the game's carriedMule: a MULE won at the land auction leads from the start, one bought from the next tick.
    const won = game();
    won.players[0]!.carriedMule = 'empty';
    const fromStart = placed(buildFloor(won, cfg), 'zip', onTile(0, 1)).colonists[0]!;
    expect(speedOf(fromStart, won, cfg), 'a MULE won at the land auction').toBeCloseTo(1.41, 2);
    const bought = game();
    let f = placed(buildFloor(bought, cfg), 'zip', onTile(0, 1));
    bought.players[0]!.carriedMule = 'empty';
    f = stepFloor(f, bought, {}, DEV_STEER.tickMs, cfg);
    expect(speedOf(f.colonists[0]!, bought, cfg), 'a MULE bought at the corral').toBeCloseTo(1.41, 2);
  });
});
