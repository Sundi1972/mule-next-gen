import { DEVELOPMENT, needsOf, type GameState } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/** Nine working farms give a crew of nine, so s1 needs 5 Food a month. */
const FARMS = 9;

/** s1 holds 2 Food against a need of 5 and the corral is empty when development starts. */
function hungryWithAnEmptyCorral() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  const state = (game as unknown as { state: GameState }).state;
  const free = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
  for (const t of free.slice(0, FARMS)) Object.assign(t, { owner: 's1', outfit: 'food' });
  state.players.find((p) => p.id === 's1')!.stock.food = 2;
  state.store.mules = 0;
  readyAll(game);
  while (game.viewFor(null).phase === 'landGrant') advance(GRANT_TICK_MS);
  expect(game.viewFor(null).phase).toBe('development');
  return { game, state };
}

describe('the store view at the start of development', () => {
  it("B-AC-9 / B-AC-10: a hungry seat and an empty corral reach the phone's view", () => {
    const { game, state } = hungryWithAnEmptyCorral();
    expect(needsOf(state, 's1').food).toBe(5);
    const view = game.viewFor('s1');
    expect(view.me!.stock.food).toBe(2);
    expect(view.me!.needs.food).toBe(5);
    expect(view.me!.hungry).toBe(true);
    expect(view.me!.devSeconds).toBe(DEVELOPMENT.fullSeconds);
    expect(view.storeMules).toBe(0);
  });
});
