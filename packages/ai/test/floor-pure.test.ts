import { describe, expect, it } from 'vitest';
import { DEV_STEER } from '@mule/engine';
import type { Decider } from '../src/decider.js';
import type { DecisionKind } from '../src/personas.js';
import { playGame, type SeatSpec } from '../src/play.js';

const specs: SeatSpec[] = (['trader', 'aggressive', 'cautious', 'saboteur'] as const).map((persona) => ({ persona, level: 'trader' }));

/** A decider that answers never, as a model whose reply is still pending, and counts what it is asked. */
function pendingDecider(asked: Map<DecisionKind, number>): Decider {
  return {
    name: 'pending',
    decide: (_shortlist, _persona, context) => {
      asked.set(context.kind, (asked.get(context.kind) ?? 0) + 1);
      return new Promise(() => {});
    },
  };
}

/** Plays a short AI-only game with `on` as DEV_STEER.on, every seat with a pending decider; what each kind was asked. */
function asked(on: boolean): Map<DecisionKind, number> {
  const saved = DEV_STEER.on;
  DEV_STEER.on = on;
  try {
    const counts = new Map<DecisionKind, number>();
    playGame(5, specs, { maxMonths: 2, politics: false, deciderFor: () => pendingDecider(counts) });
    return counts;
  } finally {
    DEV_STEER.on = saved;
  }
}

describe("the floor's AI input is a pure function of the game (arcade C9, WS3's condition 1, HC-4)", () => {
  it('HC-4: on the floor a develop decision never asks the decider, so no reply can be pending in a tick', { timeout: 60_000 }, () => {
    const floor = asked(true);
    expect(floor.get('land') ?? 0, 'the decider is wired: the land plan asks it').toBeGreaterThan(0);
    expect(floor.get('develop') ?? 0).toBe(0);
  });

  it('flag off: the tap hands still ask it, as today', { timeout: 60_000 }, () => {
    expect(asked(false).get('develop') ?? 0).toBeGreaterThan(0);
  });
});
