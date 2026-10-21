import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { nextStep, openShops, type DevelopState } from '../src/phone/next-step';

/** Lena in the store at the start of the turn's clock, nothing in tow, a free plot of hers at 5·7. */
const BASE: DevelopState = {
  filling: false,
  carry: null,
  place: 'store',
  atOwnPlot: false,
  installed: false,
  seconds: 40,
  freePlots: [{ x: 4, y: 6 }],
  from: { x: 6, y: 4 },
  ate: 5,
  devSeconds: 50,
  mulePrice: 142,
  mulesLeft: 5,
  pubPayout: 96,
};
const at = (s: Partial<DevelopState>) => nextStep({ ...BASE, ...s });
const text = (node: unknown) => renderToStaticMarkup(createElement(Fragment, null, node as never)).replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

describe('RULE-7: development says what to do next', () => {
  it('T-AC-9 row 1: while the card shows, you eat and your bar fills; the corral glows', () => {
    const r = at({ filling: true });
    expect(r.now).toMatchObject({ step: 1, of: 3, title: 'You eat and your time bar fills' });
    expect(r.next).toEqual(['corral']);
  });

  it('T-AC-9 row 2: with no MULE and none installed, buy one at the corral', () => {
    const r = at({});
    expect(r.now).toMatchObject({ step: 1, of: 3, title: 'Buy a MULE at the corral' });
    expect(r.next).toEqual(['corral']);
  });

  it('T-AC-9 row 3: an empty MULE glows the outfitter of the raw good with the largest shortfall', () => {
    const r = at({ carry: 'empty', month: { needs: { food: 3, water: 2, energy: 4, alloy: 9 }, have: { food: 3, water: 1, energy: 1, alloy: 0 } } });
    expect(r.now).toMatchObject({ step: 2, of: 3, title: 'Choose what your MULE makes' });
    // Alloy is short by more, but it is not a raw good: the works is never named for it.
    expect(r.next).toEqual(['energy']);
    expect(text(r.now.detail)).toContain("You're short of Energy: you need 4, you have 1.");
    // On a tie the first outfitter in the hall's order glows.
    const tie = at({ carry: 'empty', month: { needs: { water: 3, energy: 3, smithore: 3 }, have: { water: 1, energy: 1, smithore: 1 } } });
    expect(tie.next).toEqual(['water']);
    expect(text(tie.now.detail)).toContain("You're short of Water: you need 3, you have 1.");
  });

  it('T-AC-9 row 3 (negative): with no shortfall no outfitter glows, "any outfitter or the works"', () => {
    const r = at({ carry: 'empty', month: { needs: { food: 3, energy: 4 }, have: { food: 5, energy: 4 } } });
    expect(r.next).toEqual([]);
    expect(text(r.now.detail)).toContain('any outfitter or the works');
  });

  it('T-AC-9 row 3: while the view has no monthNeeds, nothing glows and Now still says what to do', () => {
    const r = at({ carry: 'empty' });
    expect(r.now).toMatchObject({ step: 2, of: 3, title: 'Choose what your MULE makes' });
    expect(r.next).toEqual([]);
    expect(text(r.now.detail)).not.toContain('short of');
  });

  it('T-AC-9 row 4: an outfitted MULE in the store glows both doors', () => {
    const r = at({ carry: 'energy' });
    expect(r.now).toMatchObject({ step: 3, of: 3, title: 'Walk out and install it' });
    expect(r.next).toEqual(['doorL', 'doorR']);
    // In the store, a plot of yours still selected on the map is not where you stand: row 4 comes first.
    const selected = at({ carry: 'energy', atOwnPlot: true });
    expect(selected.now.title).toBe('Walk out and install it');
    expect(selected.next).toEqual(['doorL', 'doorR']);
  });

  it('T-AC-9 row 5: on the map, not at a plot of yours, walk to your nearest plot with no MULE', () => {
    const r = at({ carry: 'energy', place: 'map', freePlots: [{ x: 0, y: 0 }, { x: 5, y: 5 }] });
    expect(r.now).toMatchObject({ step: 3, of: 3, title: 'Walk to your plot 6·6' });
    expect(r.plot).toEqual({ x: 5, y: 5 });
    expect(r.next).toEqual([]);
  });

  it('T-AC-9 unknown: row 5 with no plot of yours free glows nothing and says "Install on a plot of yours"', () => {
    const r = at({ carry: 'energy', place: 'map', freePlots: [] });
    expect(r.now.title).toBe('Install on a plot of yours');
    expect(r.plot).toBeNull();
    expect(r.next).toEqual([]);
  });

  it('T-AC-9 row 6: at a plot of yours, install your MULE here', () => {
    const r = at({ carry: 'energy', place: 'map', atOwnPlot: true });
    expect(r.now).toMatchObject({ step: 3, of: 3, title: 'Install your Energy MULE here' });
    expect(r.plot).toBeNull();
    const belt = at({ carry: 'greenBelt', place: 'map', atOwnPlot: true });
    expect(belt.now.title).toBe('Install your Green belt MULE here');
  });

  it('T-AC-9 row 7: once a MULE is installed and none is carried, the corral and the pub glow, with no step', () => {
    const r = at({ installed: true });
    expect(r.now.title).toBe('MULE installed. What next?');
    expect(r.now.step).toBeUndefined();
    expect(r.next).toEqual(['corral', 'pub']);
    expect(text(r.now.detail)).toContain('≈96 cr');
  });

  it('T-AC-9 warn: at 10 s or less Now turns amber and its text does not change', () => {
    const calm = at({ carry: 'empty', seconds: 11 });
    const late = at({ carry: 'empty', seconds: 8 });
    expect(calm.now.warn).toBe(false);
    expect(late.now.warn).toBe(true);
    expect(late.now.title).toBe(calm.now.title);
    expect(at({ seconds: 10 }).now.warn).toBe(true);
    // Every row warns, the stepless row 7 too.
    expect(at({ installed: true, seconds: 8 }).now.warn).toBe(true);
    expect(at({ installed: true, seconds: 30 }).now.warn).toBe(false);
  });

  it('T-AC-9 locks: no MULE closes the outfitters, works and green belt; any MULE closes the corral; the hall opens the rest', () => {
    const none = at({}).locks;
    for (const room of ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'works', 'greenBelt'] as const) expect(none[room]).toBe('needs a MULE');
    expect(none.corral).toBeUndefined();
    expect(at({ carry: 'empty' }).locks).toEqual({ corral: 'one at a time' });
    const outfitted = at({ carry: 'energy' }).locks;
    expect(outfitted.corral).toBe('one at a time');
    // The other rooms fade without a note.
    expect(outfitted.food).toBe('');
    expect(outfitted.works).toBe('');
    expect(outfitted.pub).toBeUndefined();
    // The hall opens exactly the rooms these locks leave unlocked.
    const sorted = (shops: string[]) => [...shops].sort();
    expect(sorted(openShops(at({}).locks))).toEqual(['corral', 'pub']);
    expect(sorted(openShops(at({ carry: 'empty' }).locks))).toEqual(sorted(['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'alloy', 'electronics', 'medicine', 'greenBelt', 'pub']));
    expect(openShops(at({ carry: 'energy' }).locks)).toEqual(['pub']);
  });
});
