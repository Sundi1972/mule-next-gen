import { type GameState, type MonthEvent } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

/** A new game in month 1's planning, and its private engine state, which a test reaches to arrange the month. */
function newGame() {
  const fake = fakeContext({});
  const game = new MuleGame(fake.ctx, 7);
  game.start(seats);
  return { game, state: (game as unknown as { state: GameState }).state, ...fake };
}

/** A planning event that changed things off the map and on it: the contract's every optional field. */
const offMap = (state: GameState): MonthEvent => ({
  key: 'meteorStrike',
  kind: 'strike',
  title: 'Meteor strike',
  line: 'A stand-in.',
  scope: 'local',
  origin: { x: 2, y: 1 },
  plots: [{ index: 1 * state.width + 2, order: 0, good: 'food', delta: 0, becomes: 'crater', muleLost: true }],
  effects: [
    { on: 's1', what: 'money', delta: -25 },
    { on: 'store', what: 'crystite', delta: -4 },
  ],
  sign: 'bad',
  phase: 'planning',
});

describe("C1, C4: the server shows this month's events from the month's own list", () => {
  it("an event the month keeps for planning is planning's, in every seat's view, with its effects and what its plot became", () => {
    const { game, state } = newGame();
    state.monthEvents.push(offMap(state));
    for (const seat of [null, 's1', 's2']) {
      const [view] = game.viewFor(seat).events!;
      expect(view).toMatchObject({
        key: 'meteorStrike',
        phase: 'planning',
        hits: [{ x: 2, y: 1, order: 0, delta: 0, becomes: 'crater', muleLost: true }],
        effects: [
          { on: 's1', what: 'money', delta: -25 },
          { on: 'store', what: 'crystite', delta: -4 },
        ],
      });
    }
  });

  it('an event with no effects and plain hits carries neither field', () => {
    const { game, state } = newGame();
    const { effects: _, ...plain } = offMap(state);
    state.monthEvents.push({ ...plain, plots: [{ index: 0, order: 0, good: 'food', delta: -1 }] });
    const [view] = game.viewFor(null).events!;
    expect(view).not.toHaveProperty('effects');
    expect(view!.hits).toStrictEqual([{ x: 0, y: 0, order: 0, delta: -1 }]);
  });
});
