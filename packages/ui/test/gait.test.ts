import { describe, expect, it } from 'vitest';
import { boardGait, cycleSeconds, motionOf, type BoardTrack, type Encounter, type GaitInput } from '../src/index';

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

  it.each([
    // the walker's track at its last render, its price now, the clock now (ms) → motion, and when its price last moved
    ['the first render stands: no move seen yet', null, 50, 1000, 'idle', null],
    ['its price moved since the last render: it walks', { at: 50, movedAt: null }, 49, 1000, 'walk', 1000],
    ['its price holds 100 ms after a move: still walking between the 10 Hz steps', { at: 49, movedAt: 1000 }, 49, 1100, 'walk', 1000],
    ['its price holds 299 ms after a move: still walking', { at: 49, movedAt: 1000 }, 49, 1299, 'walk', 1000],
    ['its price holds 300 ms after a move: it stands', { at: 49, movedAt: 1000 }, 49, 1300, 'idle', 1000],
    ['a walker that stood moves again: it walks', { at: 49, movedAt: 1000 }, 48, 5000, 'walk', 5000],
  ] as [string, BoardTrack | null, number, number, string, number | null][])('M-9: on the walk board, %s', (_, prev, at, now, motion, movedAt) => {
    const next = boardGait(prev, at, now);
    expect(next.motion).toBe(motion);
    expect(next.track).toEqual({ at, movedAt });
  });
});
