import { createGame, PRESTIGE, type Good, type PrestigeId } from '@mule/engine';
import type { MapObject, MapTile, Slot } from '@mule/ui';

/**
 * The colony grounds (WS7's AM-16 option A, working rules relayed by the PM, 6 Nov): a 3×3 square, the town hall in the
 * middle and 8 slots round it. The Governor picks a slot when commissioning; the AI Governor takes the first free one.
 * In G-5 a slot's place reads nothing (adjacency is a later option), so the slots are numbered, not named.
 */
export const SLOTS = 8;

/** A slot's object, as ColonyProjectView carries it plus the slot it was given (the new field option A adds). */
export interface GroundsObject {
  id: PrestigeId;
  stage: MapObject['stage'];
  slot: number;
  /** Building: months built so far. */
  built?: number;
  /** Commissioned: what the fund and the players have put in so far. */
  funded?: { credits: number; goods: Partial<Record<Good, number>> };
}

export const NAME: Record<PrestigeId, string> = Object.fromEntries(Object.entries(PRESTIGE).map(([id, p]) => [id, p.name])) as Record<PrestigeId, string>;

export function mapObject(o: GroundsObject): MapObject {
  return { kind: o.id, name: NAME[o.id], stage: o.stage, buildMonths: PRESTIGE[o.id].buildMonths, ...(o.built !== undefined ? { built: o.built } : {}) };
}

/** Month 12 of a busy game: one object at every stage, three slots still free. Month 1: nothing yet. */
export const MONTH_12: GroundsObject[] = [
  { id: 'park', stage: 'standing', slot: 1 },
  { id: 'hospital', stage: 'closed', slot: 2 },
  { id: 'observatory', stage: 'damaged', slot: 4 },
  { id: 'stadium', stage: 'building', slot: 5, built: 2 },
  { id: 'spaceport', stage: 'commissioned', slot: 7, funded: { credits: 900, goods: { alloy: 1 } } },
];

export const FUND = { 1: 0, 12: 640 } as const;
export type Month = 1 | 12;

export const PLAYERS = [
  { id: 'heiko', name: 'Heiko', slot: 0 as Slot },
  { id: 'mia', name: 'Mia', slot: 1 as Slot },
  { id: 'kai', name: 'Kai', slot: 2 as Slot },
  { id: 'lena', name: 'Lena', slot: 3 as Slot },
];

/** A real map from the engine (seed 7, four seats), as WS5's colony-plots mock draws it. */
const game = createGame({ seed: 7, players: PLAYERS.map((p, i) => ({ id: p.id, name: p.name, isAi: i >= 2 })) });
export const WIDTH = game.width;
export const HEIGHT = game.height;
const store = game.tiles.findIndex((t) => t.terrain === 'store');
export const STORE_AT = { x: store % WIDTH, y: Math.floor(store / WIDTH) };

const OWNED: { dx: number; dy: number; slot: Slot; good?: MapTile['good'] }[] = [
  { dx: -1, dy: 0, slot: 0, good: 'food' },
  { dx: -2, dy: 0, slot: 0, good: 'energy' },
  { dx: 1, dy: 0, slot: 1, good: 'smithore' },
  { dx: 0, dy: -1, slot: 2, good: 'energy' },
  { dx: 0, dy: 1, slot: 3, good: 'food' },
  { dx: 2, dy: 1, slot: 1 },
  { dx: -2, dy: 2, slot: 2, good: 'crystite' },
  { dx: 3, dy: -2, slot: 3, good: 'food' },
];

/** The planet map: the engine's land and the players' plots. Under option A no colony object sits on it. */
export function tiles(month: Month): MapTile[] {
  const owned = month === 1 ? OWNED.slice(0, 4) : OWNED;
  return game.tiles.map((t, i) => {
    const x = i % WIDTH;
    const y = Math.floor(i / WIDTH);
    const o = owned.find((p) => STORE_AT.x + p.dx === x && STORE_AT.y + p.dy === y);
    return { x, y, terrain: t.terrain, owner: o ? o.slot : null, ...(o?.good ? { good: o.good } : {}), ...(t.special ? { special: t.special } : {}) };
  });
}

/** What a slot's object needs to start building, in words: what is still owed. */
export function owed(o: GroundsObject): string {
  const p = PRESTIGE[o.id];
  const credits = p.credits - (o.funded?.credits ?? 0);
  const goods = (Object.entries(p.goods) as [Good, number][])
    .map(([g, n]) => [g, n - (o.funded?.goods[g] ?? 0)] as const)
    .filter(([, n]) => n > 0)
    .map(([g, n]) => `${n} ${GOOD_WORD[g]}`);
  return [credits > 0 ? `${credits} cr` : null, ...goods].filter(Boolean).join(' · ');
}

const GOOD_WORD: Record<Good, string> = { food: 'Food', water: 'Water', energy: 'Energy', smithore: 'Smithore', crystite: 'Crystite', rareEarth: 'Rare earth', alloy: 'Alloy', electronics: 'Electronics', medicine: 'Medicine' };
