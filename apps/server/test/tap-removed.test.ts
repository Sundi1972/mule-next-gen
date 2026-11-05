import { DEV_STEER, type DevFloor } from '@mule/engine';
import type { MuleIntent } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/**
 * C14 (PR-12): the tap walk is gone. Every game steers its development, whatever options it was built with, so a record
 * made before the removal (its options say `devSteer: false`) replays on the floor; the colonist view carries no walk;
 * and a development tap is refused.
 */
function inDevelopment(options: Record<string, unknown>) {
  const fake = fakeContext();
  const game = new MuleGame(fake.ctx, 7, options as ConstructorParameters<typeof MuleGame>[2]);
  game.start(seats);
  readyAll(game);
  for (let i = 0; i < 10_000 && game.viewFor(null).phase !== 'development'; i++) fake.advance(100);
  expect(game.viewFor(null).phase).toBe('development');
  return { game, ...fake };
}

describe('C14: no tap walk left', () => {
  it("C14-1: a game built with an old record's devSteer: false still steers its development", () => {
    const flag = DEV_STEER.on;
    DEV_STEER.on = false;
    try {
      const { game } = inDevelopment({ devSteer: false });
      expect(() => game.handle(seats[0]!.id, { type: 'steer', x: 1, y: 0 })).not.toThrow();
      expect((game as unknown as { steering: { floor: DevFloor } | null }).steering).not.toBeNull();
    } finally {
      DEV_STEER.on = flag;
    }
  });

  it('C14-2: the colonist view has no walk; it keeps at and assayUntil', () => {
    const { game } = inDevelopment({});
    const colonist = game.viewFor(seats[0]!.id).players.find((p) => p.id === seats[0]!.id)!.colonist!;
    expect(colonist).not.toHaveProperty('walk');
    expect(colonist).toHaveProperty('at');
    expect(colonist).toHaveProperty('assayUntil');
  });

  it('C14-3: a development tap is refused in words: the floor plays every move through a press', () => {
    const { game } = inDevelopment({});
    for (const tap of [{ type: 'buyMule' }, { type: 'pub' }, { type: 'outfit', outfit: 'food' }, { type: 'analyse', x: 0, y: 0 }]) {
      expect(() => game.handle(seats[0]!.id, tap as unknown as MuleIntent), tap.type).toThrow(/walk there and press the button/);
    }
  });
});
