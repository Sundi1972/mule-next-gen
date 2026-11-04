import { describe, expect, it } from 'vitest';
import { GRANT_TICK_MS, MuleGame, PHASE_MS } from '../src/mule-game.js';
import { clockRunsInMonth1, fakeContext, readyAll, seats } from './fake-context.js';

const humans = ['s1', 's2'];

/** Plays to development, then lets the humans either go to the pub at once or sit idle. */
function developmentEnds(seed: number, humansGoToPub: boolean) {
  let game: MuleGame | null = null;
  const broadcasts: { at: number; phase: string }[] = [];
  const { ctx, advance } = fakeContext({
    onChanged: (at) => broadcasts.push({ at, phase: game!.viewFor(null).phase }),
  });
  game = new MuleGame(ctx, seed);
  game.start(seats);
  readyAll(game);
  while (game.viewFor(null).phase === 'landGrant') advance(GRANT_TICK_MS);
  expect(game.viewFor(null).phase).toBe('development');
  const aiEndsAt = game.viewFor('s3').me!.devEndsAt!;
  const humansEndAt = Math.max(...humans.map((id) => game!.viewFor(id).me!.devEndsAt!));
  if (humansGoToPub) for (const id of humans) game.handle(id, { type: 'pub' });
  expect(game.viewFor(null).phase).toBe('development');

  // Small steps, so a broadcast that only comes with production's own timer can't hide in one big jump.
  while (game.viewFor(null).phase === 'development') advance(10);
  const productionAt = ctx.now();
  expect(game.viewFor(null).phase).toBe('production');
  return { productionAt, aiEndsAt, humansEndAt, broadcasts };
}

describe('broadcasts', () => {
  // The clock as such, met in month 1: it runs from the start, as in any later month.
  clockRunsInMonth1();

  it('FM-1: when an AI\'s pub ends development, every screen hears production', () => {
    const { productionAt, aiEndsAt, broadcasts } = developmentEnds(7, true);
    // The AI ended development itself, at the pub, before its own clock ran out.
    expect(productionAt).toBeLessThan(aiEndsAt);
    const heard = broadcasts.filter((b) => b.phase === 'production');
    expect(heard.length).toBeGreaterThan(0);
    expect(heard[0]!.at).toBeLessThan(productionAt + PHASE_MS.production);
  });

  it('FM-1: when the clock ends development, every screen hears production', () => {
    const { productionAt, humansEndAt, broadcasts } = developmentEnds(7, false);
    // The last human's clock ran out; that is what ended development.
    expect(productionAt).toBeGreaterThanOrEqual(humansEndAt);
    const heard = broadcasts.filter((b) => b.phase === 'production');
    expect(heard.length).toBeGreaterThan(0);
    expect(heard[0]!.at).toBeLessThan(productionAt + PHASE_MS.production);
  });
});
