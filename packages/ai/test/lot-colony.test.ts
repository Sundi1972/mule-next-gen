import { describe, expect, it } from 'vitest';
import { advancePhase, COLONY_SELLER, commission, createGame, createRng, list, lotDone, setLotWalk, stepLandAuction, type GameState } from '@mule/engine';
import { LotHand } from '../src/hands/lot.js';
import { AiSeat } from '../src/seat.js';

/**
 * C30 (G-5 RULE-28) and the AI's land hand: the colony bids as a proxy, leading at one over the best player up to its
 * cap, and a player who reaches the cap takes the lot. So an AI whose limit is the colony's cap matches it there and
 * wins, rather than stopping one short because "one more than the leader" would pass its limit.
 */
function colonyBidsOnBrixsPlot(cap: number): GameState {
  const state = createGame({ seed: 7, players: ['lena', 'brix', 'ossa', 'kai'].map((id) => ({ id, name: id, isAi: id === 'ossa' })), politics: true });
  state.politics = { ...state.politics!, governor: 'lena', election: null };
  state.treasury.money = 10_000;
  commission(state, 'lena', 'park');
  state.colony!.projects[0]!.maxBid = cap;
  for (const p of state.players) p.money = 5_000;
  Object.assign(state.tiles[state.width + 2]!, { terrain: 'plains', owner: 'brix', outfit: null, runMonths: 0 });
  list(state, 'brix', { item: { kind: 'plot', x: 2, y: 1 }, minimum: 100, unsold: 'keep' });
  while (state.phase !== 'landAuction') {
    advancePhase(state);
    state.listings = state.listings.filter((l) => l.seller !== COLONY_SELLER);
  }
  return state;
}

describe('C30: the AI land hand against the colony’s proxy bid', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i + 1))('an AI whose limit is the colony’s cap bids the cap and takes the lot (rng %i)', (rng) => {
    const state = colonyBidsOnBrixsPlot(300);
    const seat = new AiSeat({ id: 'ossa', name: 'ossa', persona: 'trader', level: 'trader', seed: 3 });
    const hand = new LotHand(seat.mind, createRng(rng));
    const internals = hand as unknown as { limit: number };
    const act = (a: { type: string; dir?: -1 | 0 | 1; done?: boolean }) => {
      if (a.type === 'walk') setLotWalk(state, 'ossa', a.dir!);
      if (a.type === 'done') lotDone(state, 'ossa', a.done);
      return true;
    };
    for (let i = 0; i < 200_000 && state.landAuction?.stage !== 'result'; i++) {
      hand.tick(state, 10, act as never);
      // The hand sets its limit from the plot's worth on its first tick of the lot; the test holds it at the cap.
      internals.limit = 300;
      // The people at the table stand still and are done, so only the AI and the colony bid.
      if (state.landAuction?.stage === 'walk') for (const id of ['lena', 'kai']) lotDone(state, id);
      stepLandAuction(state, 10);
    }
    expect(state.landAuction!.result).toEqual({ kind: 'sold', buyer: 'ossa', price: 300 });
  });
});
