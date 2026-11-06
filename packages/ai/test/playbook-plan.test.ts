import { describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, type AiPersonaId, type Strategy } from '@mule/engine';
import { planMind } from '../src/playbook/plan.js';
import type { Mind } from '../src/value.js';

const mindOf = (persona: AiPersonaId): Mind => ({
  me: 'ai0',
  personaId: persona,
  persona: { ...AI_PERSONAS[persona] },
  levelId: 'trader',
  level: AI_LEVELS.trader,
  salt: 7,
});

describe('the plan mind (C12, RULE-14)', () => {
  it.each<[AiPersonaId, Strategy['kind'], Record<string, number>]>([
    ['trader', 'monopolist', { risk: 1, greed: 1.1, reserve: 1, spite: 0, speculate: 1.68, corner: 1, patience: 1.2 }],
    ['trader', 'politician', { risk: 1, greed: 1.1, reserve: 1, spite: 0, speculate: 1.4, corner: 0.4, patience: 1 }],
    ['cautious', 'builder', { risk: 1.6, greed: 0.8, reserve: 1.92, spite: 0, speculate: 0.15, corner: 0, patience: 1.4 }],
    ['saboteur', 'spoiler', { risk: 0.9, greed: 0.9, reserve: 1, spite: 2.25, speculate: 0.6, corner: 0.6, patience: 0.9 }],
  ])("T-AC-16: RULE-14's formula and example; politician ({}) leaves the weights unchanged (%s as %s)", (persona, kind, weights) => {
    const mind = mindOf(persona);
    const before = structuredClone(mind);

    const planned = planMind(mind, { kind });

    for (const [w, v] of Object.entries(weights)) expect(planned.persona[w as keyof Mind['persona']], w).toBeCloseTo(v, 10);
    expect({ ...planned, persona: null }).toEqual({ ...before, persona: null });
    // The seat's own mind stays the persona's: the land hand and today's path read it.
    expect(mind).toEqual(before);
  });
});
