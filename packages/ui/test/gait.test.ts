import { describe, expect, it } from 'vitest';
import { cycleSeconds, motionOf, type Encounter, type GaitInput } from '../src/index';

/** A fed colonist on the plains, walking alone; the spec's lead and bitten paces and the wolf's lunge (RULE-2, -4, -7). */
const walker: GaitInput = { moving: true, encounter: null, pace: 1, terrain: 1, lead: false, bitten: false, leadPace: 0.9, bittenPace: 0.5, lungeSeconds: 1.6 };

describe('the gait, from what the wire carries', () => {
  it.each([
    // moving, encounter, limp → motion. First match wins: a fight, then a chase, then standing, then the limp.
    [true, 'fight', true, 'fight'],
    [false, 'fight', false, 'fight'],
    [true, 'chase', true, 'run'],
    [true, 'chase', false, 'run'],
    [false, null, true, 'idle'],
    [false, 'choose', false, 'idle'],
    [true, 'choose', false, 'walk'],
    [true, null, false, 'walk'],
    [true, null, true, 'hurt'],
  ] as const)('M-1: moving %s, encounter %s, bitten %s → %s', (moving, encounter, bitten, motion) => {
    expect(motionOf({ moving, encounter: encounter as Encounter, bitten })).toBe(motion);
  });

  it.each([
    // What changes from a fed walker on the plains → one stride's seconds, derived by hand.
    ['full speed: the MULE’s own step', {}, 0.5],
    ['half the pace: twice the stride', { pace: 0.5 }, 1],
    ['a quick colonist (pace 1.25)', { pace: 1.25 }, 0.4],
    ['half pace on half-speed ground', { pace: 0.5, terrain: 0.5 }, 2],
    ['very slow: clamped to the slowest stride', { pace: 0.2 }, 2],
    ['very fast: clamped to the quickest stride', { pace: 2 }, 0.28],
    ['leading a MULE: 0.5 / 0.9', { lead: true }, 0.5 / 0.9],
    ['running from wolves: 0.6 of the walk', { encounter: 'chase' }, 0.3],
    ['running at half pace', { encounter: 'chase', pace: 0.5 }, 0.6],
    ['bitten: half speed and 1.3× the stride', { bitten: true }, 1.3],
    ['standing breathes on the MULE’s rhythm, whatever the pace', { moving: false, pace: 0.3 }, 2.6],
    ['the fight jabs on the wolf’s lunge, whatever the pace', { encounter: 'fight', pace: 0.3 }, 1.6],
    ['the fight’s rhythm is the lunge the caller passes, not a copy', { encounter: 'fight', lungeSeconds: 1.2 }, 1.2],
    ['a pace that is not a number strides at full speed, never NaN', { pace: Number.NaN }, 0.5],
  ] as [string, Partial<GaitInput>, number][])('M-2: %s', (_, change, seconds) => {
    expect(cycleSeconds({ ...walker, ...change })).toBeCloseTo(seconds, 6);
  });
});
