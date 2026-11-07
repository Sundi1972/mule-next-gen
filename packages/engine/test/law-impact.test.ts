import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, lawImpact, PERCENT, player, POLITICS, type GameState, type LawId } from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

/** Month 1 after production, with `laws` in force: Lena owns 3 plots (one a Rare earth mine), Brix 1; last month's pollution and the ship's wishlist set. */
function board(laws: Partial<Record<LawId, number>> = {}): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  const inForce = Object.fromEntries(Object.entries(laws).map(([law, setting]) => [law, { setting, since: 1 }]));
  state.politics = { ...state.politics!, election: null, laws: inForce };
  while (state.phase !== 'auction') advancePhase(state);
  const free = state.tiles.filter((t) => t.owner === null && t.terrain !== 'store');
  for (const t of free.slice(0, 3)) t.owner = 'lena';
  free[0]!.outfit = 'rareEarth';
  free[3]!.owner = 'brix';
  state.history.at(-1)!.pollutionBy = { lena: 4, brix: 1 };
  // The ship still wants crystite; it has had all the food it came for, so Lena's food is no export.
  state.ship = { ...state.ship, hold: { crystite: 5, food: 0 } };
  state.store.offWorld.crystite = 120;
  player(state, 'lena').stock.crystite = 2;
  player(state, 'lena').stock.food = 4;
  player(state, 'brix').stock.crystite = 0;
  state.air = 55;
  return state;
}

describe("C43: what a law would cost each player, from public facts", () => {
  it('T-AC-49: RULE-45 — the land, pollution and export taxes and the emission cap, each player\'s monthly cost', () => {
    const state = board();
    expect(lawImpact(state, { kind: 'enact', law: 'landTax', setting: 10 })).toMatchObject({ lena: { cost: 30 }, brix: { cost: 10 }, ossa: { cost: 0 } });
    expect(lawImpact(state, { kind: 'enact', law: 'pollutionTax', setting: 20 })).toMatchObject({ lena: { cost: 80 }, brix: { cost: 20 }, kai: { cost: 0 } });
    expect(lawImpact(state, { kind: 'enact', law: 'exportTax', setting: 20 })).toMatchObject({ lena: { cost: Math.round((20 * 2 * 120) / PERCENT) }, brix: { cost: 0 } });
    expect(lawImpact(state, { kind: 'enact', law: 'emissionCap', setting: 50 })).toMatchObject({
      lena: { cost: POLITICS.ai.council.capPlotCost, capped: { blocksNow: true, plots: 1 } },
      brix: { cost: 0, capped: { blocksNow: true, plots: 0 } },
    });
    expect(lawImpact(state, { kind: 'enact', law: 'emissionCap', setting: 60 }).lena).toEqual({ cost: 0, capped: { blocksNow: false, plots: 1 } });
  });

  it('T-AC-49: a repeal shows the same numbers as savings, from the setting in force', () => {
    const state = board({ landTax: 20 });
    expect(lawImpact(state, { kind: 'repeal', law: 'landTax' })).toMatchObject({ lena: { cost: -60 }, brix: { cost: -20 } });
  });
});
