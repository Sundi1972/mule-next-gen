import { airBand, DEV_WALK, DEVELOPMENT, foodShare, hungerPace, needsOf, POLLUTION, sickPace, type GameState } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/** Nine working farms give a crew of nine, so s1 needs 5 Food a month. */
const FARMS = 9;

/**
 * s1 holds 2 Food against a need of 5 and the corral is empty when development starts. A Medicine cures the
 * sickness roll, so s1 is hungry and well.
 */
function hungryWithAnEmptyCorral() {
  const { ctx, advance } = fakeContext();
  const game = new MuleGame(ctx, 7);
  game.start(seats);
  const state = (game as unknown as { state: GameState }).state;
  const free = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null);
  for (const t of free.slice(0, FARMS)) Object.assign(t, { owner: 's1', outfit: 'food' });
  const s1 = state.players.find((p) => p.id === 's1')!;
  s1.stock.food = 2;
  s1.stock.medicine = 1;
  state.store.mules = 0;
  const planning = game.viewFor(null);
  readyAll(game);
  while (game.viewFor(null).phase === 'landGrant') advance(GRANT_TICK_MS);
  expect(game.viewFor(null).phase).toBe('development');
  return { game, state, planning, ctx, advance };
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

  it("B-AC-9: every screen sees each seat's condition in development, never in planning or production (the month end keeps it, C20): its hunger × sickness pace, species aside, and why it is sick", () => {
    const { game, state, planning, ctx, advance } = hungryWithAnEmptyCorral();
    const want = { foodShare: foodShare(state, 's1'), foodNeed: needsOf(state, 's1').food, sick: false, sickBecause: null, conditionPace: hungerPace(state, 's1') };
    expect(want.conditionPace).toBeCloseTo(0.52);
    for (const viewer of ['s1', 's2', null]) expect(game.viewFor(viewer).players.find((p) => p.id === 's1')!.condition).toEqual(want);
    expect(game.viewFor('s1').me!.hungry).toBe(true);
    // A fed seat walks at full pace; outside development nobody has a condition.
    expect(game.viewFor(null).players.find((p) => p.id === 's2')!.condition).toMatchObject({ foodShare: 1, conditionPace: sickPace(state, 's2') });
    expect(planning.players.map((p) => p.condition)).toEqual([null, null, null]);
    // Hungry and sick: the two slow-downs multiply. In clean air, with no pollution of its own, it is sick by chance.
    state.players.find((p) => p.id === 's1')!.sick = true;
    expect(airBand(state.air).name).toBe('clean');
    const sick = { ...want, sick: true, sickBecause: 'chance', conditionPace: want.conditionPace * DEV_WALK.sickPace };
    expect(game.viewFor('s2').players.find((p) => p.id === 's1')!.condition).toEqual(sick);
    state.air = POLLUTION.airMax;
    expect(game.viewFor('s2').players.find((p) => p.id === 's1')!.condition).toEqual({ ...sick, sickBecause: 'air' });
    // Once development ends, at the one clock's end, nobody has a condition.
    advance(game.viewFor('s1').me!.devEndsAt! - ctx.now());
    expect(game.viewFor(null).phase).not.toBe('development');
    expect(game.viewFor(null).players.map((p) => p.condition)).toEqual([null, null, null]);
  });
});
