import { POLLUTION, TERRAIN_ODDS as ENGINE_ODDS } from '@mule/engine';
import type { MuleView, PlayerView, TileView } from '@mule/protocol';
import { GOOD_NAME, type Good } from '@mule/ui';
import { describe, expect, it } from 'vitest';
import { colonyVerdict, groundPips, mapTiles, seatSpecies, secondsUntil, slotOf, standings, TERRAIN_ODDS } from '../src/game/derive';

const p = (id: string, money: number, slot: number): PlayerView => ({ id, name: id, isAi: false, color: '', slot, species: 'zipwing', money, plots: 0, ready: false, doneDeveloping: false });
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
    players: [p('s1', 500, 0), p('s2', 900, 1)],
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
    auction: null,
    listings: [],
    lotSlots: { used: 0, max: 4 },
    landAuction: null,
    production: null,
    politics: null,
    ...extra,
  };
}

describe('reading the view', () => {
  it("T-AC-13: gives each seat its colour slot by the seat's chosen colour, not its place at the table", () => {
    const chosen = view({ players: [p('s1', 500, 5), p('s2', 900, 2)] });
    expect(slotOf(chosen, 's1')).toBe(5);
    expect(slotOf(chosen, 's2')).toBe(2);
    expect(mapTiles(chosen).map((t) => t.owner)).toEqual([2, 5]);
    expect(standings(chosen).map((s) => [s.player.id, s.slot])).toEqual([['s2', 2], ['s1', 5]]);
    expect(slotOf(chosen, 'nobody')).toBeNull();
    expect(slotOf(chosen, null)).toBeNull();
  });

  it('T-AC-13: a room where nobody picked draws seat i in colour i, as before', () => {
    expect(view().players.map((q) => slotOf(view(), q.id))).toEqual([0, 1]);
    expect(standings(view()).map((s) => s.slot)).toEqual([1, 0]);
  });

  it('T-AC-13: each colour shows its own seat\'s species, whatever the seat\'s place at the table', () => {
    const chosen = view({ players: [{ ...p('s1', 500, 3), species: 'mollox' }, { ...p('s2', 900, 0), species: 'gearling' }] });
    const bySlot = seatSpecies(chosen);
    expect(bySlot[3]).toBe('mollox');
    expect(bySlot[0]).toBe('gearling');
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

  it('B-AC-3: colonyVerdict says failed only in Collapse, and "a fifth" is 1 − POLLUTION.collapseScore', () => {
    expect(colonyVerdict({ level: 86, band: 'collapse' })).toEqual({
      failed: true,
      title: 'The colony failed',
      line: 'The air ended in Collapse. The Federation cuts every score by a fifth.',
    });
    for (const band of ['clean', 'smoggy', 'toxic'] as const) {
      expect(colonyVerdict({ level: 79, band })).toEqual({ failed: false, title: 'The colony passed', line: 'The air stayed out of Collapse. Every score counts in full.' });
    }
    // The copy says "a fifth" in words; a new collapseScore has to change the copy with it.
    expect(1 - POLLUTION.collapseScore).toBeCloseTo(0.2, 10);
  });
});

const SMITHORE_PHRASE = {
  none: 'No Smithore.',
  low: 'Little Smithore.',
  medium: 'Some Smithore.',
  high: 'Good odds of Smithore.',
  veryHigh: 'Very good odds of Smithore.',
} as const;

/** The good names in the sentence that starts with `lead`, e.g. "Often good for Food, Water and Energy." */
function namesAfter(sentences: string[], lead: string): string[] {
  const s = sentences.find((x) => x.startsWith(lead));
  return s ? s.slice(lead.length, -1).split(/, | and /) : [];
}

describe('the terrain hint', () => {
  it.each(Object.entries(ENGINE_ODDS))("INV-1: every terrain hint says exactly what the engine's TERRAIN_ODDS says (%s)", (terrain, odds) => {
    const hint = TERRAIN_ODDS[terrain as keyof typeof TERRAIN_ODDS] ?? '';
    const sentences = hint.match(/[^.]+\./g)?.map((x) => x.trim()) ?? [];
    const rated = (level: 'good' | 'poor') => Object.entries(odds.grown).filter(([, l]) => l === level).map(([g]) => GOOD_NAME[g as Good]);
    const good = rated('good');
    const poor = rated('poor');

    expect(namesAfter(sentences, 'Often good for ').sort()).toEqual([...good].sort());
    expect(namesAfter(sentences, 'Poor for ').sort()).toEqual([...poor].sort());
    expect(sentences).toContain(SMITHORE_PHRASE[odds.mined.smithore]);
    expect(sentences).toHaveLength((good.length ? 1 : 0) + (poor.length ? 1 : 0) + 1);
    const listed = new Set([...good, ...poor, GOOD_NAME.smithore]);
    for (const name of Object.values(GOOD_NAME).filter((n) => !listed.has(n))) expect(hint).not.toContain(name);
  });
});
