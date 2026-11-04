import { describe, expect, it } from 'vitest';
import { createGame, EVENTS, GAME, grantees, inheritanceAmount, type GameState } from '../src/index.js';

/** A game of `cash.length` players holding these credits and no land. */
function withCash(cash: number[]): GameState {
  const state = createGame({ seed: 5, players: cash.map((_, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false })) });
  state.players.forEach((p, i) => (p.money = cash[i]!));
  return state;
}

describe('RULE-3: the wave-2 picks', () => {
  it('inheritance: by wealth rank, the poorest the most and the richest the least, linear between (AM-1 6a)', () => {
    const { min, max } = EVENTS.player.inheritance;
    const state = withCash([900, 50, 400, 600]);
    expect(state.players.map((p) => inheritanceAmount(state, p.id))).toEqual([
      min,
      max,
      Math.floor(min + ((max - min) * 2) / 3),
      Math.floor(min + (max - min) / 3),
    ]);
    // The spec's numbers at today's config: 100, 300, 233 and 166.
    expect(state.players.map((p) => inheritanceAmount(state, p.id))).toEqual([100, 300, 233, 166]);
  });

  it('inheritance: land counts in wealth, at GAME.plotScore a plot', () => {
    const state = withCash([500, 500 - GAME.plotScore * 2 + 1]);
    state.tiles.filter((t) => t.terrain !== 'store').slice(0, 2).forEach((t) => (t.owner = 'p1'));
    expect(state.players.map((p) => inheritanceAmount(state, p.id))).toEqual([EVENTS.player.inheritance.max, EVENTS.player.inheritance.min]);
  });

  it('inheritance: players tied on worth share the mean of their ranks\' amounts, rounded down, with no seat bias (AM-3)', () => {
    const { min, max } = EVENTS.player.inheritance;
    const at = (rank: number) => min + ((max - min) * rank) / 3;
    const state = withCash([500, 300, 500, 100]);
    const tied = Math.floor((at(0) + at(1)) / 2);
    expect(state.players.map((p) => inheritanceAmount(state, p.id))).toEqual([tied, Math.floor(at(2)), tied, max]);
    // Today's config: 100 and 166.67 share 133.
    expect(tied).toBe(133);
  });

  it('inheritance: a lone player gets the most', () => {
    const state = withCash([0, 0]);
    state.players.pop();
    expect(inheritanceAmount(state, 'p0')).toBe(EVENTS.player.inheritance.max);
  });

  it("grant: the `count` poorest, a tie going to the first seat", () => {
    expect(EVENTS.colony.federationGrant.count).toBe(2);
    expect(grantees(withCash([300, 100, 200, 100])).map((p) => p.id)).toEqual(['p1', 'p3']);
    expect(grantees(withCash([100, 300, 100, 100])).map((p) => p.id)).toEqual(['p0', 'p2']);
    // Fewer players than the count: every one of them.
    const two = withCash([10, 20]);
    EVENTS.colony.federationGrant.count = 3;
    try {
      expect(grantees(two).map((p) => p.id)).toEqual(['p0', 'p1']);
    } finally {
      EVENTS.colony.federationGrant.count = 2;
    }
  });
});
