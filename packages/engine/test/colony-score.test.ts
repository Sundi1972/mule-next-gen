import { describe, expect, it } from 'vitest';
import {
  colonyPrestige,
  colonyScore,
  colonyScoreOf,
  colonyWealth,
  COLONY_SCORE,
  commission,
  createGame,
  playerStanding,
  POLLUTION,
  score,
  type GameState,
} from '../src/index.js';

/**
 * C31 (G-5 spec RULE-25, AM-9): at game over the colony scores (wealth + environment + prestige) × a happiness factor,
 * a pure function of the final state (HC-27), and each player's standing is their Worth with their plaques beside it,
 * never added to it. T-AC-38.
 */
const SEATS = ['lena', 'brix', 'ossa', 'kai'];

function politicsGame(): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics: true });
  state.politics = { ...state.politics!, governor: 'lena', election: null };
  return state;
}

describe('C31: the colony score (RULE-25)', () => {
  it('T-AC-38: the spec’s example: wealth 26,400, air 34, prestige 2, happiness 64 → 36,960, term by term', () => {
    expect(colonyScoreOf({ wealth: 26_400, air: 34, prestige: 2, happiness: 64 })).toEqual({
      wealth: 26_400,
      environment: 6_600,
      prestige: 2_000,
      factor: 1.056,
      total: 36_960,
    });
  });

  it('T-AC-38: the factor’s ends: the same colony at happiness 0 scores × 0.8, at 100 × 1.2', () => {
    const at = (happiness: number) => colonyScoreOf({ wealth: 26_400, air: 34, prestige: 2, happiness });
    expect(at(0)).toMatchObject({ factor: COLONY_SCORE.factor.low, total: 28_000 });
    expect(at(100)).toMatchObject({ factor: COLONY_SCORE.factor.high, total: 42_000 });
  });

  it('T-AC-38: clean air is worth perCleanPoint a point below the worst; the dirtiest air is worth nothing', () => {
    expect(colonyScoreOf({ wealth: 0, air: POLLUTION.airMax, prestige: 0, happiness: 50 }).environment).toBe(0);
    expect(colonyScoreOf({ wealth: 0, air: 0, prestige: 0, happiness: 50 }).environment).toBe(COLONY_SCORE.perCleanPoint * POLLUTION.airMax);
  });

  it('on a real colony it reads the wealth gauge, the air, the standing prestige and the mood; a damaged object counts 0', () => {
    const state = politicsGame();
    state.treasury.money = 5_000;
    commission(state, 'lena', 'hospital');
    const hospital = state.colony!.projects[0]!;
    hospital.stage = 'standing';
    state.colony!.happiness = 64;
    state.air = 34;
    const standing = colonyScore(state)!;
    expect(standing).toEqual(colonyScoreOf({ wealth: colonyWealth(state), air: 34, prestige: colonyPrestige(state), happiness: 64 }));
    expect(standing.prestige).toBeGreaterThan(0);
    hospital.stage = 'damaged';
    expect(colonyScore(state)!.prestige).toBe(0);
  });

  it('a pure function of the state: the same state scores the same, twice, and scoring changes nothing', () => {
    const state = politicsGame();
    const before = JSON.stringify(state);
    expect(colonyScore(state)).toEqual(colonyScore(state));
    expect(JSON.stringify(state)).toBe(before);
  });

  it('T-AC-38: a game without the council has no colony score', () => {
    const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics: false });
    expect(colonyScore(state)).toBeNull();
  });
});

describe('C31: each player’s standing (RULE-25)', () => {
  it('is their Worth with their plaques beside it, the sum of their entries on every plaque, never added to the Worth', () => {
    const state = politicsGame();
    state.treasury.money = 5_000;
    commission(state, 'lena', 'park');
    state.colony!.projects[0]!.plaque = { brix: 120, ossa: 40 };
    state.colony!.permanentPrestige = 0;
    expect(playerStanding(state, 'brix')).toEqual({ worth: score(state, 'brix'), plaques: 120 });
    expect(playerStanding(state, 'kai')).toEqual({ worth: score(state, 'kai'), plaques: 0 });
  });
});
