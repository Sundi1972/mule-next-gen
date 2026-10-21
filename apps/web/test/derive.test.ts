import type { MuleView, PlayerView, TileView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { groundPips, mapTiles, secondsUntil, slotOf, standings } from '../src/game/derive';

const p = (id: string, money: number): PlayerView => ({ id, name: id, isAi: false, color: '', species: 'zipwing', money, plots: 0, ready: false, doneDeveloping: false });
const tile = (x: number, y: number, extra: Partial<TileView> = {}): TileView => ({ x, y, terrain: 'plains', peaks: 0, owner: null, outfit: null, pollution: 0, filter: false, ...extra });

function view(extra: Partial<MuleView> = {}): MuleView {
  return {
    finished: false,
    month: 1,
    maxMonths: 12,
    phase: 'planning',
    phaseEndsAt: null,
    width: 2,
    height: 1,
    tiles: [tile(0, 0, { owner: 's2', outfit: 'energy' }), tile(1, 0, { outfit: 'greenBelt', owner: 's1', ground: { food: -2, water: 3, energy: 0, smithore: 4, crystite: 0, rareEarth: 1 }, pollution: 2 })],
    lit: null,
    players: [p('s1', 500), p('s2', 900)],
    me: null,
    market: [],
    storeMules: 0,
    mulePrice: 0,
    colonists: 0,
    air: { level: 0, band: 'clean' },
    ship: { arrives: 3, inPort: false, wants: null },
    treasury: { money: 0, salesTax: 0 },
    news: [],
    scores: null,
    ...extra,
  };
}

describe('reading the view', () => {
  it('gives each seat its colour slot by place at the table', () => {
    expect(slotOf(view(), 's2')).toBe(1);
    expect(slotOf(view(), 'nobody')).toBeNull();
    expect(slotOf(view(), null)).toBeNull();
  });

  it('turns tiles into map tiles: owner slots, outfits as goods, ground on four pips', () => {
    const [a, b] = mapTiles(view());
    expect(a).toMatchObject({ owner: 1, good: 'energy' });
    expect(b!.good).toBeUndefined();
    expect(b).toMatchObject({ owner: 0, pollution: 2 });
    expect(b!.ground).toEqual({ food: 0, water: 4, energy: 1, smithore: 4, crystite: 0, rareEarth: 1 });
    expect(groundPips('smithore', 9)).toBe(4);
  });

  it('ranks by money, and by score once the game is over', () => {
    expect(standings(view()).map((s) => s.player.id)).toEqual(['s2', 's1']);
    const over = view({ scores: [{ id: 's1', score: 3000 }, { id: 's2', score: 1200 }] });
    expect(standings(over).map((s) => [s.player.id, s.value])).toEqual([['s1', 3000], ['s2', 1200]]);
  });

  it('counts down to a deadline on the server clock', () => {
    expect(secondsUntil(null, 0)).toBeUndefined();
    expect(secondsUntil(10_000, 7_500)).toBe(2.5);
    expect(secondsUntil(10_000, 12_000)).toBe(0);
  });
});
