import { DEV_WALK } from '@mule/engine';
import { feeling, hungerLevel, paceLine, paceRule, sickReason, waddleSeconds, type Condition } from '@mule/ui';
import { describe, expect, it } from 'vitest';

/** The engine's examples (T-AC-22): the pace is the server's, hunger × sickness. */
const FED: Condition = { foodShare: 1, sick: false, conditionPace: 1 };
const PECKISH: Condition = { foodShare: 0.8, sick: false, conditionPace: 0.84 };
const HUNGRY: Condition = { foodShare: 0.5, sick: false, conditionPace: 0.6 };
const STARVING: Condition = { foodShare: 0.2, sick: false, conditionPace: 0.36 };
const SICK: Condition = { foodShare: 1, sick: true, sickBecause: 'chance', conditionPace: 0.5 };
const HUNGRY_AND_SICK: Condition = { foodShare: 0.5, sick: true, sickBecause: 'air', conditionPace: 0.3 };
const STARVING_AND_SICK: Condition = { foodShare: 0, sick: true, sickBecause: 'pollution', conditionPace: 0.1 };
const FOOD = { ate: 5, need: 10 };
/** "8 points of walking speed per 10% of Food missing", from config. */
const POINTS = Math.round((1 - DEV_WALK.hungerPaceMin) * 10);

describe('a colonist’s condition, in words (AM-14)', () => {
  it('T-AC-12: the hunger level comes from foodShare and DEV_WALK.hungerLevels: peckish below hungryFrom, starving from starvingFrom', () => {
    const level = (foodShare: number) => hungerLevel({ foodShare, sick: false, conditionPace: 1 }, DEV_WALK);
    const { hungryFrom, starvingFrom } = DEV_WALK.hungerLevels;
    expect(level(1)).toBe(0);
    expect(level(0.99)).toBe(1);
    expect(level(1 - hungryFrom + 0.01)).toBe(1);
    expect(level(1 - hungryFrom)).toBe(2);
    expect(level(1 - starvingFrom + 0.01)).toBe(2);
    expect(level(1 - starvingFrom)).toBe(3);
    expect(level(0)).toBe(3);
    // Sickness is not hunger.
    expect(hungerLevel(SICK, DEV_WALK)).toBe(0);
  });

  it('T-AC-12: every label carries the pace: fed, peckish, hungry, starving, sick, and both', () => {
    const title = (c: Condition) => paceLine(c, DEV_WALK, FOOD).title;
    expect(title(FED)).toBe('Fed: full pace');
    expect(title(PECKISH)).toBe('Peckish: 84% pace');
    expect(title(HUNGRY)).toBe('Hungry: 60% pace');
    expect(title(STARVING)).toBe('Starving: 36% pace');
    expect(title(SICK)).toBe('Sick: 50% pace');
    expect(title(HUNGRY_AND_SICK)).toBe('Hungry and sick: 30% pace');
    expect(title(STARVING_AND_SICK)).toBe('Starving and sick: 10% pace');
    expect([FED, PECKISH, HUNGRY, STARVING, SICK, STARVING_AND_SICK].map((c) => paceLine(c, DEV_WALK, FOOD).tone)).toEqual(['ok', 'warn', 'warn', 'alert', 'alert', 'alert']);
    expect(feeling(STARVING_AND_SICK, DEV_WALK)).toBe('Starving and sick');
  });

  it('T-AC-12: the long-press rule says what hunger and sickness cost, its points from config', () => {
    expect(paceRule(HUNGRY, DEV_WALK, FOOD)).toEqual([`You ate 5 of the 10 Food you need. You lose ${POINTS} points of walking speed per 10% of Food missing.`]);
    expect(POINTS).toBe(8);
    expect(paceRule(SICK, DEV_WALK, FOOD)).toEqual(['Sick this month. Sickness halves your walking speed.']);
    expect(paceRule(HUNGRY_AND_SICK, DEV_WALK, FOOD)).toEqual([expect.stringMatching(/^You ate 5 of the 10/), 'Sick: the air is toxic. Sickness halves your walking speed.']);
    expect(paceRule(FED, DEV_WALK, FOOD)).toEqual([]);
    expect(paceLine(FED, DEV_WALK, FOOD).detail).toBe('You ate the 10 Food you need.');
    expect(paceLine(HUNGRY, DEV_WALK, FOOD).detail).toContain('Everyone has the same time; you just cover less ground.');
  });

  it('T-AC-12: the sick line says why from the view: the air, your own pollution, or chance; never the air when it does not know', () => {
    expect(sickReason('air')).toBe('Sick: the air is toxic.');
    expect(sickReason('pollution')).toBe('Sick: your own pollution fouled the air.');
    expect(sickReason('chance')).toBe('Sick this month.');
    expect(sickReason(null)).toBe('Sick this month.');
    expect(sickReason(undefined)).toBe('Sick this month.');
  });

  it('T-AC-12: a walking colonist waddles at 0.36 s divided by its condition pace', () => {
    expect(waddleSeconds(1)).toBeCloseTo(0.36);
    expect(waddleSeconds(HUNGRY.conditionPace)).toBeCloseTo(0.6);
    expect(waddleSeconds(STARVING_AND_SICK.conditionPace)).toBeCloseTo(3.6);
  });
});
