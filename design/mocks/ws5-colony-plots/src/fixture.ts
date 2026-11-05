import { createGame } from '@mule/engine';
import type { MapTile, Slot } from '@mule/ui';
import type { PlotObject, PlotStage } from './objects';

/** A real map from the engine (seed 7, four seats), so the objects sit on real land beside real owners' plots. */
const game = createGame({
  seed: 7,
  players: [
    { id: 'heiko', name: 'Heiko', isAi: false },
    { id: 'mia', name: 'Mia', isAi: false },
    { id: 'kai', name: 'Kai', isAi: true },
    { id: 'lena', name: 'Lena', isAi: true },
  ],
});
export const WIDTH = game.width;
export const HEIGHT = game.height;

const store = game.tiles.findIndex((t) => t.terrain === 'store');
const at = (i: number) => ({ x: i % WIDTH, y: Math.floor(i / WIDTH) });
const storeAt = at(store);

/** Owned plots around the store, as a month 3 table might look, with MULEs on some of them. */
const OWNED: { dx: number; dy: number; slot: Slot; good?: MapTile['good'] }[] = [
  { dx: -1, dy: 0, slot: 0, good: 'food' },
  { dx: -2, dy: 0, slot: 0, good: 'energy' },
  { dx: 1, dy: 0, slot: 1, good: 'smithore' },
  { dx: 0, dy: -1, slot: 2, good: 'energy' },
  { dx: 0, dy: 1, slot: 3, good: 'food' },
  { dx: 2, dy: 1, slot: 1 },
];

/** The colony's three plot objects, a tile index each (ColonyView.projects[].plot), at a stage the index page picks. */
export const OBJECT_PLOTS = {
  park: store + 2 * WIDTH - 2,
  stadium: store - 2 * WIDTH + 3,
  spaceport: store - 1 + 3 * WIDTH,
} as const;

export type Stages = Record<keyof typeof OBJECT_PLOTS, PlotStage>;

const BUILD_MONTHS = { park: 1, stadium: 3, spaceport: 3 } as const;

export function objectsFor(stages: Stages): Map<number, PlotObject> {
  const out = new Map<number, PlotObject>();
  for (const kind of Object.keys(OBJECT_PLOTS) as (keyof typeof OBJECT_PLOTS)[]) {
    const stage = stages[kind];
    out.set(OBJECT_PLOTS[kind], { kind, stage, buildMonths: BUILD_MONTHS[kind], ...(stage === 'building' ? { built: 1 } : {}) });
  }
  return out;
}

/** The map's tiles: the engine's land, the owners and MULEs above, and the objects' plots free of both (the colony's). */
export function tiles(): MapTile[] {
  return game.tiles.map((t, i) => {
    const { x, y } = at(i);
    const owned = OWNED.find((o) => storeAt.x + o.dx === x && storeAt.y + o.dy === y);
    return {
      x,
      y,
      terrain: t.terrain,
      owner: owned ? owned.slot : null,
      ...(owned?.good ? { good: owned.good } : {}),
      ...(t.special ? { special: t.special } : {}),
    };
  });
}
