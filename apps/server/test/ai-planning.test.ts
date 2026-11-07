import { afterEach, describe, expect, it, vi } from 'vitest';
import { storePaysFor, type GameState } from '@mule/engine';
import { AiSeat } from '@mule/ai';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

const AI = 's3';

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Seed 7's standard table, started: month 1's planning opens at once. Just before the AI seat plans it, `arrange` sets
 * up what that seat holds, so planning opens on it.
 */
function startedWith(arrange: (state: GameState) => void) {
  const plan = AiSeat.prototype.planMonth;
  vi.spyOn(AiSeat.prototype, 'planMonth').mockImplementation(function (this: AiSeat, state, act) {
    if (this.id === AI) arrange(state);
    plan.call(this, state, act);
  });
  const fake = fakeContext();
  const game = new MuleGame(fake.ctx, 7, {});
  game.start(seats);
  const state = (game as unknown as { state: GameState }).state;
  return { game, state };
}

/** Gives the AI an idle plot and `money`; returns the plot. */
function idlePlot(money: number) {
  let plot = -1;
  const arrange = (state: GameState) => {
    plot = state.tiles.findIndex((t) => t.terrain === 'plains' && t.owner === null);
    Object.assign(state.tiles[plot]!, { owner: AI, outfit: null });
    state.players.find((p) => p.id === AI)!.money = money;
  };
  return { arrange, plot: () => plot };
}

describe("the server lets an AI seat act in planning (C15)", () => {
  it('T-AC-10: a keyless AI short of cash lists its idle plot in planning, through the checks a phone gets', () => {
    const own = idlePlot(10);
    const { state } = startedWith(own.arrange);
    expect(state.phase).toBe('planning');
    const { x, y } = state.tiles[own.plot()]!;
    expect(state.listings).toEqual([
      expect.objectContaining({ seller: AI, item: { kind: 'plot', x, y }, unsold: 'store', storePays: storePaysFor(state, 'plot') }),
    ]);
  });

  it('T-AC-10 (negative): a keyless AI with money over its reserve lists nothing', () => {
    const { state } = startedWith(idlePlot(5_000).arrange);
    expect(state.phase).toBe('planning');
    expect(state.listings).toEqual([]);
  });
});
