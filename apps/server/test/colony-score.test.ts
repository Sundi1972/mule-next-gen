import { colonyScore, playerStanding, type GameState } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, pressThroughSidePick, readyAll, seats } from './fake-context.js';

/**
 * C31 B-AC-27 (G-5 spec RULE-25): at game over every screen's colony view carries the colony score, its three terms,
 * the factor and the total; every month before it, too, as the state stands (AM-12). Each player's standing is their Worth with their plaques beside it: the
 * view's `worth` and their entries on the projects' plaques.
 */
function playToTheEnd(politics: boolean) {
  const fake = fakeContext();
  const game = new MuleGame(fake.ctx, 7, { maxMonths: 1, politics });
  game.start(seats);
  const views: MuleView[] = [];
  for (let i = 0; i < 200_000 && game.viewFor(null).phase !== 'gameOver'; i++) {
    const phase = game.viewFor(null).phase;
    if (phase === 'planning' || phase === 'upkeep') readyAll(game);
    pressThroughSidePick(game);
    if (i % 50 === 0) views.push(game.viewFor(null));
    fake.advance(100);
  }
  const state: GameState = game['state']!;
  return { game, state, views };
}

describe('C31 B-AC-27: the colony score on every screen at game over', () => {
  it('at game over the TV and every phone carry the colony score as RULE-25 scores the final state; every view before it carries one too (AM-12)', () => {
    const { game, state, views } = playToTheEnd(true);
    expect(state.phase).toBe('gameOver');
    const expected = colonyScore(state)!;
    expect(expected.total).toBeGreaterThan(0);
    for (const seat of [null, 's1', 's2']) expect(game.viewFor(seat).colony!.score, `seen by ${seat ?? 'the TV'}`).toEqual(expected);
    expect(views.length).toBeGreaterThan(0);
    for (const v of views) expect(v.colony?.score?.total, `month ${v.month}, ${v.phase}`).toBeGreaterThan(0);
  });

  it("each player's standing: the view's Worth, with their plaques beside it on the projects' plaques", () => {
    const { game, state } = playToTheEnd(true);
    // A month is too short for anyone to give, so the test hangs two donors' entries on a standing park's plaque.
    state.colony!.projects.push({ id: 'park', stage: 'standing', funded: { credits: 420, goods: {} }, monthsLeft: null, plot: null, since: 1, plaque: { s1: 120, s2: 40 }, maxBid: null });
    const view = game.viewFor(null);
    expect(playerStanding(state, 's1').plaques).toBe(120);
    for (const p of view.players) {
      const plaques = view.colony!.projects.flatMap((x) => x.plaque).filter((e) => e.playerId === p.id).reduce((n, e) => n + e.value, 0);
      expect({ worth: p.worth, plaques }).toEqual(playerStanding(state, p.id));
    }
  });

  it('without the council, game over has no colony view and so no score', () => {
    const { game } = playToTheEnd(false);
    expect(game.viewFor(null).colony).toBeNull();
  });
});
