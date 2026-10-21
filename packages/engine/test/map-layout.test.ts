import { describe, expect, it } from 'vitest';
import { budgetTerrain, layoutMap, placeRiver, type Sketch } from '../src/map-layout.js';
import { checkMap, createRng, MAP, zeroGround, type GameMap, type RuleId, type ShareTerrain, type Terrain, type Tile } from '../src/index.js';

const PLAYERS = [2, 3, 4, 5, 6];
const SEEDS = 200;

/** A map of the given terrain with zero ground everywhere: the ground rules always fire on it, so callers filter to layout rules. */
function zeroGroundMap(width: number, height: number, terrain: Terrain[]): GameMap {
  const tiles: Tile[] = terrain.map((t, i) => ({
    x: i % width,
    y: Math.floor(i / width),
    terrain: t,
    peaks: 0,
    ground: zeroGround(),
    traits: [],
    owner: null,
    outfit: null,
    pollution: 0,
    filter: false,
    runMonths: 0,
  }));
  return { width, height, tiles };
}

/** Every (players, seed, rule, detail) a stage's maps break among `rules`, over SEEDS seeds per player count. */
function failures(rules: RuleId[], build: (players: number, seed: number) => GameMap | string): string[] {
  const out: string[] = [];
  for (const players of PLAYERS) {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const map = build(players, seed);
      if (typeof map === 'string') {
        out.push(`${players}p seed ${seed}: ${map}`);
        continue;
      }
      for (const v of checkMap(map, players).violations.filter((v) => rules.includes(v.rule))) {
        out.push(`${players}p seed ${seed} ${v.rule}: ${v.detail}`);
      }
    }
  }
  return out;
}

/** The river stage's sketch with every free plot set to plains: only the river and store matter to S6 and S7. */
function riverMap(sketch: Sketch): GameMap {
  return zeroGroundMap(sketch.width, sketch.height, sketch.terrain.map((t) => t ?? 'plains'));
}

/** The budget laid onto the free plots in index order, or why it can't be: S1-S3 read only the counts. */
function budgetMap(sketch: Sketch, budget: Record<ShareTerrain, number>): GameMap | string {
  const free = sketch.terrain.filter((t) => t === null).length;
  const fill = (Object.keys(MAP.shares) as ShareTerrain[]).flatMap((t) => Array<Terrain>(budget[t]).fill(t));
  if (fill.length !== free) return `budget sums to ${fill.length} plots, free land is ${free}`;
  let next = 0;
  return zeroGroundMap(sketch.width, sketch.height, sketch.terrain.map((t) => t ?? fill[next++]!));
}

describe('map layout stages', () => {
  it('T-AC-5: river stage meets S6 and S7', () => {
    const broken = failures(['S6', 'S7'], (players, seed) => riverMap(placeRiver(players, createRng(seed))));
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: budget meets S1-S3', () => {
    const broken = failures(['S1', 'S2', 'S3'], (players, seed) => {
      const rng = createRng(seed);
      const sketch = placeRiver(players, rng);
      return budgetMap(sketch, budgetTerrain(sketch.terrain.filter((t) => t === null).length, rng));
    });
    expect(broken, broken.join('\n')).toEqual([]);
  });

  it('T-AC-5: regions meet S4 and S5', () => {
    // The whole layout, so the regions are checked on the real river and budget, and must keep S1-S3 and the river intact.
    const broken = failures(['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'], (players, seed) => {
      const layout = layoutMap(players, createRng(seed));
      return zeroGroundMap(layout.width, layout.height, layout.terrain);
    });
    expect(broken, broken.join('\n')).toEqual([]);
  });
});
