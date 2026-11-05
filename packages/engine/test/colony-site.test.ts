import { describe, expect, it } from 'vitest';
import { COLONY_SELLER, commission, createGame, RuleError, setSiteBid, siteProject, type GameState, type PrestigeId } from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

/** Month 1's planning with Lena governing, no election open, a full fund, and `ids` commissioned in order. */
function governed(ids: PrestigeId[] = ['park'], politics = true): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics });
  if (!state.politics) return state;
  state.politics = { ...state.politics, governor: 'lena', election: null };
  state.treasury.money = 10_000;
  for (const id of ids) commission(state, 'lena', id);
  return state;
}

function refused(run: () => void): string {
  try {
    run();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return 'done';
}

const project = (state: GameState, id: PrestigeId) => state.colony!.projects.find((p) => p.id === id)!;
const freeTile = (state: GameState) => state.tiles.findIndex((t) => t.owner === null && t.terrain !== 'store');

describe("C21/C30: the colony's site for an object (RULE-28)", () => {
  it('T-AC-37: a new project has no bid, so the colony does not bid until the Governor sets one', () => {
    expect(project(governed(), 'park').maxBid).toBeNull();
  });

  it.each([
    { row: 1, why: 'politics off', make: () => governed([], false), by: 'lena', id: 'park' as PrestigeId, bid: 300 as number | null, then: "This game plays without the colony's council" },
    { row: 2, why: 'not planning', make: () => Object.assign(governed(), { phase: 'development' }), by: 'lena', id: 'park' as PrestigeId, bid: 300, then: 'Set the bid once the votes are over' },
    { row: 2, why: 'the law ballot is open', make: () => {
      const s = governed();
      s.politics = { ...s.politics!, council: { stage: 'ballot', clockMs: 0, proposal: { kind: 'enact', law: 'landTax', setting: 10 }, proposer: 'lena', ballots: { lena: true }, done: [], result: null } };
      return s;
    }, by: 'lena', id: 'park' as PrestigeId, bid: 300, then: 'Set the bid once the votes are over' },
    { row: 3, why: 'not the Governor', make: () => governed(), by: 'kai', id: 'park' as PrestigeId, bid: 300, then: "Only the Governor sets the colony's bid" },
    { row: 4, why: 'nothing commissioned', make: () => governed([]), by: 'lena', id: 'park' as PrestigeId, bid: 300, then: 'Nothing is waiting for a site' },
    { row: 4, why: 'a project already building', make: () => {
      const s = governed();
      project(s, 'park').stage = 'building';
      return s;
    }, by: 'lena', id: 'park' as PrestigeId, bid: 300, then: 'Nothing is waiting for a site' },
    { row: 5, why: 'an object that needs no plot', make: () => governed(['hospital']), by: 'lena', id: 'hospital' as PrestigeId, bid: 300, then: 'The Hospital needs no plot' },
    { row: 6, why: 'already sited', make: () => {
      const s = governed();
      siteProject(s, 'park', freeTile(s));
      return s;
    }, by: 'lena', id: 'park' as PrestigeId, bid: 300, then: 'The Park already has its site' },
    { row: 7, why: 'a bid not whole', make: () => governed(), by: 'lena', id: 'park' as PrestigeId, bid: 12.5, then: 'Bid a whole number of credits' },
    { row: 7, why: 'a bid below 0', make: () => governed(), by: 'lena', id: 'park' as PrestigeId, bid: -1, then: 'Bid a whole number of credits' },
    { row: 8, why: 'a bid', make: () => governed(), by: 'lena', id: 'park' as PrestigeId, bid: 300, then: 'done' },
    { row: 8, why: 'no bid', make: () => governed(), by: 'lena', id: 'park' as PrestigeId, bid: null, then: 'done' },
  ])('T-AC-37: setSiteBid, RULE-28 row $row ($why)', ({ make, by, id, bid, then }) => {
    const state = make();
    expect(refused(() => setSiteBid(state, by, id, bid))).toBe(then);
    if (then === 'done') expect(project(state, id).maxBid).toBe(bid);
  });

  it.each([
    { row: 1, why: 'politics off', make: () => governed([], false), id: 'park' as PrestigeId, then: 'Nothing is waiting for a site' },
    { row: 1, why: 'nothing commissioned', make: () => governed([]), id: 'park' as PrestigeId, then: 'Nothing is waiting for a site' },
    { row: 2, why: 'an object that needs no plot', make: () => governed(['hospital']), id: 'hospital' as PrestigeId, then: 'The Hospital needs no plot' },
    { row: 3, why: 'already sited', make: () => {
      const s = governed();
      siteProject(s, 'park', freeTile(s));
      return s;
    }, id: 'park' as PrestigeId, then: 'The Park already has its site' },
  ])('T-AC-37: siteProject, RULE-28 row $row ($why)', ({ make, id, then }) => {
    const state = make();
    const tiles = structuredClone(state.tiles);
    expect(refused(() => siteProject(state, id, freeTile(state)))).toBe(then);
    expect(state.tiles, 'a refusal changes no tile').toEqual(tiles);
  });

  it("T-AC-37: siteProject row 4 — the project gets its plot, and the tile becomes the colony's with no outfit", () => {
    const state = governed();
    const index = state.tiles.findIndex((t) => t.terrain !== 'store');
    Object.assign(state.tiles[index]!, { owner: 'brix', outfit: 'food' });
    siteProject(state, 'park', index);
    expect(project(state, 'park').plot).toBe(index);
    expect(state.tiles[index]).toMatchObject({ owner: COLONY_SELLER, outfit: null });
    expect(COLONY_SELLER).toBe('colony');
  });
});
