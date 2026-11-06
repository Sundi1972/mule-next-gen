import { describe, expect, it } from 'vitest';
import { bestOf, dotsOf, gemsIn, groundDots } from '../src/index';

const GROWN = ['food', 'water', 'energy'] as const;
const MINED = ['smithore', 'crystite', 'rareEarth'] as const;

describe('T-AC-2: RULE-1, every row, as 0–3 dots', () => {
  it.each([
    ['row 1: a grown good at −2 or −1 draws 0', [-2, -1], 0],
    ['row 2: a grown good at 0 draws 1', [0], 1],
    ['row 3: a grown good at +1 draws 2', [1], 2],
    ['row 4: a grown good at +2 or +3 draws 3', [2, 3], 3],
  ] as const)('%s', (_, ratings, dots) => {
    for (const good of GROWN) for (const rating of ratings) expect(groundDots(good, rating), `${good} ${rating}`).toBe(dots);
  });

  it.each([
    ['row 5: a mined good at 0 draws 0', [0], [0]],
    ['row 6: a mined good at 1 or 2 draws 1 or 2', [1, 2], [1, 2]],
    ['row 7: a mined good at 3 or 4 draws 3 (a meteor crater’s 4 shows 3)', [3, 4], [3, 3]],
  ] as const)('%s', (_, ratings, dots) => {
    for (const good of MINED) ratings.forEach((rating, i) => expect(groundDots(good, rating), `${good} ${rating}`).toBe(dots[i]));
  });

  it('the five examples: food +3 → 3 · water −2 → 0 · energy 0 → 1 · crystite 4 → 3 · rareEarth 0 → 0', () => {
    expect(groundDots('food', 3)).toBe(3);
    expect(groundDots('water', -2)).toBe(0);
    expect(groundDots('energy', 0)).toBe(1);
    expect(groundDots('crystite', 4)).toBe(3);
    expect(groundDots('rareEarth', 0)).toBe(0);
  });

  it('dotsOf turns a whole ground into each raw good’s dots', () => {
    expect(dotsOf({ food: -2, water: 3, energy: 0, smithore: 4, crystite: 0, rareEarth: 1 })).toEqual({ food: 0, water: 3, energy: 1, smithore: 3, crystite: 0, rareEarth: 1 });
  });

  it('unknown ground (not analysed) has no dots at all, never a row of 0', () => {
    expect(dotsOf(undefined)).toBeUndefined();
  });
});

describe('T-AC-2: RULE-2, best and gems', () => {
  it('the example: ground crystite 2, food +3 → best Food, gem Crystite', () => {
    const dots = dotsOf({ food: 3, water: 0, energy: 0, smithore: 0, crystite: 2, rareEarth: 0 })!;
    expect(bestOf(dots)).toBe('food');
    expect(gemsIn(dots)).toEqual(['crystite']);
  });

  it('best breaks a tie in the outfitters’ order: Food, Water, Energy, Smithore, Crystite, Rare earth', () => {
    expect(bestOf({ water: 3, food: 3 })).toBe('food');
    expect(bestOf({ rareEarth: 2, crystite: 2, smithore: 2, energy: 2 })).toBe('energy');
    expect(bestOf({ rareEarth: 2, crystite: 2 })).toBe('crystite');
    expect(bestOf({ food: 1, rareEarth: 3 })).toBe('rareEarth');
  });

  it('gems are Crystite and Rare earth at 1 dot or more, both when both, none at 0', () => {
    expect(gemsIn({ crystite: 1, rareEarth: 3 })).toEqual(['crystite', 'rareEarth']);
    expect(gemsIn({ food: 3, smithore: 3, crystite: 0, rareEarth: 0 })).toEqual([]);
  });

  it('the other example: no ground → no gem, no best', () => {
    expect(gemsIn({})).toEqual([]);
    expect(bestOf({})).toBeUndefined();
  });
});
