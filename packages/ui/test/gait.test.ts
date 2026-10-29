import { describe, expect, it } from 'vitest';
import { cycleSeconds, limpLatch, motionOf, type Encounter, type GaitInput } from '../src/index';

/** A fed colonist on the plains, walking alone; the spec's lead and bitten paces (arcade-walking RULE-2, RULE-4). */
const walker: GaitInput = { moving: true, encounter: null, pace: 1, terrain: 1, lead: false, limp: false, leadPace: 0.9, bittenPace: 0.5 };

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
  ] as const)('M-1: moving %s, encounter %s, bitten %s → %s', (moving, encounter, limp, motion) => {
    expect(motionOf({ moving, encounter: encounter as Encounter, limp })).toBe(motion);
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
    ['bitten: half speed and 1.3× the stride', { limp: true }, 1.3],
    ['standing breathes on the MULE’s rhythm, whatever the pace', { moving: false, pace: 0.3 }, 2.6],
    ['the fight jabs on the wolf’s lunge, whatever the pace', { encounter: 'fight', pace: 0.3 }, 1.6],
  ] as [string, Partial<GaitInput>, number][])('M-2: %s', (_, change, seconds) => {
    expect(cycleSeconds({ ...walker, ...change })).toBeCloseTo(seconds, 6);
  });

  it.each([
    // prev (limp, encounter, speed) → now (encounter, speed, healed) → limping
    ['caught: the chase ends and the speed falls by half', [false, 'chase', 1], [null, 0.5, false], true],
    ['got away: the chase ends at the same speed', [false, 'chase', 1], [null, 1, false], false],
    ['the chase ends at exactly 0.8 of the speed: not a bite', [false, 'chase', 1], [null, 0.8, false], false],
    ['the chase ends just under 0.8 of the speed: a bite', [false, 'chase', 1], [null, 0.79, false], true],
    ['a fight that ends with the speed falling is not a chase: no latch', [false, 'fight', 1], [null, 0.5, false], false],
    ['still limping while nothing heals it', [true, null, 0.5], [null, 0.5, false], true],
    ['healed at the store or an own plot', [true, null, 0.5], [null, 1, true], false],
    ['caught and healed in the same frame: healed wins', [false, 'chase', 1], [null, 0.5, true], false],
  ] as [string, [boolean, Encounter, number], [Encounter, number, boolean], boolean][])('M-3: %s', (_, [limp, encounter, speed], [nowEnc, nowSpeed, healed], limping) => {
    expect(limpLatch({ limp, encounter, speed }, { encounter: nowEnc, speed: nowSpeed, healed })).toBe(limping);
  });
});
