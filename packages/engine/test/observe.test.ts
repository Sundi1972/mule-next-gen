import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  castVote,
  cloneForSim,
  createGame,
  electionDone,
  list,
  observe,
  runFor,
  setLotWalk,
  stepElection,
  stepLandAuction,
  type GameState,
} from '../src/index.js';

const SEATS = ['brix', 'ossa', 'lena', 'tam'];

/** Brix's plot listed at 250, and the land auction on into its first walk. */
function walkingAuction(): GameState {
  const state = createGame({ seed: 11, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  Object.assign(state.tiles[3 * state.width + 5]!, { terrain: 'plains', owner: 'brix', outfit: null, runMonths: 0 });
  list(state, 'brix', { item: { kind: 'plot', x: 5, y: 3 }, minimum: 250, unsold: 'keep' });
  while (state.phase !== 'landAuction') advancePhase(state);
  for (let t = 0; state.landAuction!.stage !== 'walk' && t < 120_000; t += 10) stepLandAuction(state, 10);
  expect(state.landAuction!.stage).toBe('walk');
  return state;
}

describe('what-if copies', () => {
  it('FM-WS3-4: a land auction played on a cloneForSim copy leaves the real game’s auction and listings as they were', () => {
    const state = walkingAuction();
    const before = JSON.stringify({ landAuction: state.landAuction, listings: state.listings });
    const sim = cloneForSim(state);
    setLotWalk(sim, 'lena', 1);
    for (let i = 0; i < 400; i++) stepLandAuction(sim, 10);
    sim.listings.push({ ...sim.listings[0]! });
    // Positive control: the copy really moved, so an unchanged original means the two are apart.
    expect(JSON.stringify({ landAuction: sim.landAuction, listings: sim.listings })).not.toBe(before);
    expect(JSON.stringify({ landAuction: state.landAuction, listings: state.listings })).toBe(before);
  });
});

/** Month 1's election in its ballot stage: Brix and Ossa run for Governor, Lena votes Brix and Tam votes Ossa. */
function votedElection(): GameState {
  const state = createGame({ seed: 11, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  runFor(state, 'brix', 'governor', { kind: 'hold' });
  runFor(state, 'ossa', 'governor', { kind: 'hold' });
  for (const id of SEATS) electionDone(state, id);
  for (let t = 0; state.politics!.election!.stage === 'nominate' && t < 120_000; t += 10) stepElection(state, 10);
  expect(state.politics!.election!.stage).toBe('ballot');
  castVote(state, 'lena', 'governor', 'brix');
  castVote(state, 'tam', 'governor', 'ossa');
  return state;
}

describe('secret ballots', () => {
  it('T-AC-7: observe() for one seat and cloneForSim never expose or share another seat’s ballot, in any stage', () => {
    const state = votedElection();
    for (const stage of ['ballot', 'reveal', 'over'] as const) {
      for (let t = 0; state.politics!.election!.stage !== stage && t < 120_000; t += 10) stepElection(state, 10);
      expect(state.politics!.election!.stage).toBe(stage);
      // Each voter sees its own ballot and nobody else's; a seat that didn't vote sees none.
      expect(observe(state, 'lena').politics!.election!.ballots).toEqual({ lena: { governor: 'brix' } });
      expect(observe(state, 'tam').politics!.election!.ballots).toEqual({ tam: { governor: 'ossa' } });
      expect(observe(state, 'brix').politics!.election!.ballots).toEqual({});
      // Negative case: the real game keeps every ballot, and a what-if copy shares none of them.
      expect(Object.keys(state.politics!.election!.ballots).sort()).toEqual(['lena', 'tam']);
      const sim = cloneForSim(state);
      sim.politics!.election!.ballots.lena!.governor = 'ossa';
      expect(state.politics!.election!.ballots.lena).toEqual({ governor: 'brix' });
    }
  });
});
