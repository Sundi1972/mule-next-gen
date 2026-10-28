import { describe, expect, it } from 'vitest';
import { GAME } from '@mule/engine';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll } from './fake-context.js';

// PR-F (Heiko option B): the land grant is one pass of the light over the free plots, with no phase clock.

/** Two humans and no AI, so nobody claims unless the test says so. */
const humans = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Mia', isAi: false, color: 1 },
];

/** A game on the fake clock, through planning and into the land grant. */
function inTheGrant() {
  const fake = fakeContext({ table: humans });
  const game = new MuleGame(fake.ctx, 7);
  game.start(humans);
  readyAll(game);
  expect(game.viewFor(null).phase).toBe('landGrant');
  const freePlots = game.viewFor(null).tiles.filter((t) => t.terrain !== 'store' && t.owner === null).length;
  return { game, freePlots, ...fake };
}

describe('the land grant is one pass with no clock', () => {
  it('the land grant shows no countdown: phaseEndsAt is null on the phone and on the TV', () => {
    const { game } = inTheGrant();
    expect(game.viewFor('s1').phaseEndsAt).toBeNull();
    expect(game.viewFor(null).phaseEndsAt).toBeNull();
  });

  it('with no claims, the grant ends after exactly one pass: one tick per free plot, not at a phase clock and not after more passes', () => {
    const { game, freePlots, advance } = inTheGrant();
    let ticks = 0;
    while (game.viewFor(null).phase === 'landGrant' && ticks <= freePlots * 3) {
      advance(GRANT_TICK_MS);
      ticks++;
    }
    expect(ticks).toBe(freePlots);
    expect(game.viewFor(null).phase).toBe('development');
  });

  it('negative: once every player has used their claims, the grant ends at once, before the pass completes', () => {
    const { game, freePlots, advance } = inTheGrant();
    let ticks = 0;
    for (const id of humans.flatMap((h) => Array.from({ length: GAME.claimsPerGrant }, () => h.id))) {
      const lit = game.viewFor(id).lit!;
      game.handle(id, { type: 'claim', x: lit.x, y: lit.y });
      if (game.viewFor(null).phase !== 'landGrant') break;
      advance(GRANT_TICK_MS);
      ticks++;
    }
    expect(game.viewFor(null).phase).toBe('development');
    expect(ticks).toBeLessThan(freePlots);
  });
});
