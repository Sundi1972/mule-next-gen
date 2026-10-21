import { describe, expect, it } from 'vitest';
import { advancePhase, cloneForSim, createGame, list, setLotWalk, stepLandAuction, type GameState } from '../src/index.js';

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
