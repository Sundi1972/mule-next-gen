import type { Ground } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { dotsOf } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { analyseCard } from '../src/phone/arcade/analyse';
import { AnalyseCard } from '../src/phone/arcade/parts';
import { devView, lenasMe, TILES } from './fixtures/arcade';

/**
 * T-AC-4: RULE-3, when the Analyse card shows, as a pure function over the previous view and this one. Lena's
 * development on the arcade's table; 9·6 (x 8, y 5) is a free plot she analyses, 12·3 (x 11, y 2) another.
 */
const GROUND: Ground = { food: 2, water: 0, energy: 1, smithore: 0, crystite: 1, rareEarth: 0 };
const FREE = { x: 8, y: 5 };
const OTHER = { x: 11, y: 2 };

/** Lena's view with these plots' ground known to her. */
function knowing(plots: { x: number; y: number }[], over: Partial<MuleView> = {}, droneFound?: { x: number; y: number }[]): MuleView {
  const tiles = TILES.map((t) => (plots.some((p) => p.x === t.x && p.y === t.y) ? { ...t, ground: GROUND } : t));
  return devView(lenasMe(droneFound ? { droneFound } : {}), { tiles, ...over });
}

describe('T-AC-4: RULE-3, the Analyse card, over two views', () => {
  it('row 4: a plot whose ground arrives in this view during development opens its card', () => {
    expect(analyseCard(null, knowing([]), knowing([FREE]))).toEqual(FREE);
  });

  it('row 4: a newer plot replaces the card shown; a view with nothing new keeps it', () => {
    const first = analyseCard(null, knowing([]), knowing([FREE]));
    expect(analyseCard(first, knowing([FREE]), knowing([FREE, OTHER]))).toEqual(OTHER);
    expect(analyseCard(first, knowing([FREE]), knowing([FREE]))).toEqual(FREE);
  });

  it('row 1: outside development no card, and a card shown goes', () => {
    for (const phase of ['planning', 'landGrant', 'production'] as const) {
      expect(analyseCard(null, knowing([], { phase }), knowing([FREE], { phase })), phase).toBeNull();
      expect(analyseCard(FREE, knowing([], { phase }), knowing([OTHER], { phase })), `${phase}, a card shown`).toBeNull();
    }
  });

  it("row 2: a plot in the player's droneFound gives no card", () => {
    expect(analyseCard(null, knowing([]), knowing([FREE], {}, [FREE]))).toBeNull();
    expect(analyseCard(null, knowing([]), knowing([FREE, OTHER], {}, [FREE])), 'the plot not the drone found still shows').toEqual(OTHER);
  });

  it('row 3: the first view since the page loaded (a rejoin mid-development) gives no card, its ground already known', () => {
    expect(analyseCard(null, null, knowing([FREE]))).toBeNull();
  });

  it('first row wins: a drone plot outside development, on the first view, gives no card', () => {
    expect(analyseCard(null, null, knowing([FREE], { phase: 'planning' }, [FREE]))).toBeNull();
  });
});

describe('C5: the Analyse card says what Analyse found', () => {
  const card = (ground: Ground) =>
    renderToStaticMarkup(createElement(AnalyseCard, { t: { ...TILES[5 * 15 + 8]!, ground }, at: { left: 0, top: 0 }, onClose: () => {} })).replaceAll('<!-- -->', '');

  it('names the plot as analysed, says what it is best for and any Crystite, draws every good’s dots, marked Only you', () => {
    const html = card(GROUND);
    const words = html.replace(/<[^>]+>/g, '');
    expect(words).toContain('9·6 · Plains analysed');
    expect(words).toContain('best for Food · Crystite 1');
    for (const [good, n] of Object.entries(dotsOf(GROUND))) expect(html, good).toContain(`data-testid="dots-${good}" data-n="${n}"`);
    expect(html).toContain('Only you');
    expect(html).toMatch(/<button[^>]*data-testid="analyse-card"/);
  });

  it('a plot where nothing makes more than the floor says so', () => {
    expect(card({ food: -2, water: -1, energy: -2, smithore: 0, crystite: 0, rareEarth: 0 })).toContain('nothing worth working');
  });
});
