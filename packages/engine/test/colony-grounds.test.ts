import { afterEach, describe, expect, it } from 'vitest';
import { COLONY } from '../src/config.js';
import { advancePhase, commission, commissionRefusal, createGame, PRESTIGE, RuleError, type GameState, type PrestigeId, type Project } from '../src/index.js';

/**
 * G-5 C48, RULE-32 amended by AM-18 (RULE-32b): the colony builds on its own grounds, a square with the town hall in
 * the middle. Each building takes a block the size of its footprint: the Stadium and the Spaceport upgrade 2×2, the
 * rest 1×1. The first free block wins, in a fixed order: the ring of its farthest cell from the hall, then the ring of
 * its nearest, then clockwise from north by its centre. Project.slot is the block's top-left cell, y × size + x.
 */

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const SIZE = COLONY.grounds.size;

afterEach(() => {
  COLONY.grounds.size = SIZE;
});

/** A politics game in planning with Lena governing and no election open. */
function governedGame(politics = true): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics });
  if (state.politics) state.politics = { ...state.politics, governor: 'lena', election: null };
  return state;
}

/** A cell's slot on today's grounds. */
const at = (x: number, y: number) => y * COLONY.grounds.size + x;

/** An object already in the colony at a stage that is not open, holding the block anchored at `slot` (or none). */
function holding(state: GameState, id: PrestigeId, stage: Project['stage'], slot: number | null): void {
  const row = PRESTIGE[id];
  state.colony!.projects.push({ id, stage, funded: { credits: row.credits, goods: { ...row.goods } }, monthsLeft: null, since: 1, plaque: {}, slot });
}

/** Where a project's block is anchored, as (x, y). */
function anchorOf(state: GameState, id: PrestigeId): [number, number] | null {
  const slot = state.colony!.projects.find((p) => p.id === id)?.slot;
  if (slot === null || slot === undefined) return null;
  return [slot % COLONY.grounds.size, Math.floor(slot / COLONY.grounds.size)];
}

/** Commission, then let it stand, so the next commission is open. */
function commissionAndBuild(state: GameState, id: PrestigeId): void {
  commission(state, 'lena', id);
  state.colony!.projects.find((p) => p.id === id)!.stage = 'standing';
}

function refused(run: () => void): string {
  try {
    run();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return 'accepted';
}

describe("RULE-32b: footprints on the colony's grounds (AM-18)", () => {
  it('RULE-32b footprints: the Stadium and the Spaceport upgrade are 2×2, the Park, the Hospital and the Observatory 1×1', () => {
    expect(Object.fromEntries((Object.keys(PRESTIGE) as PrestigeId[]).map((id) => [id, PRESTIGE[id].footprint]))).toEqual({
      park: { w: 1, h: 1 },
      hospital: { w: 1, h: 1 },
      observatory: { w: 1, h: 1 },
      stadium: { w: 2, h: 2 },
      spaceport: { w: 2, h: 2 },
    });
    expect(COLONY.grounds.size).toBe(5);
  });

  it("RULE-32b example (the AI's order, most prestige first): Spaceport (2,0) 2×2 · Stadium (3,2) 2×2 · Observatory (2,3) · Hospital (1,3) · Park (1,2)", () => {
    const state = governedGame();
    for (const id of ['spaceport', 'stadium', 'observatory', 'hospital', 'park'] as const) commissionAndBuild(state, id);
    expect(state.colony!.projects.map((p) => [p.id, anchorOf(state, p.id)])).toEqual([
      ['spaceport', [2, 0]],
      ['stadium', [3, 2]],
      ['observatory', [2, 3]],
      ['hospital', [1, 3]],
      ['park', [1, 2]],
    ]);
  });

  it('RULE-32b row 1: politics off refuses as commission does today, and no grounds exist', () => {
    const state = governedGame(false);
    expect(refused(() => commission(state, 'lena', 'stadium'))).toBe("This game plays without the colony's council");
    expect(commissionRefusal(state, 'stadium')).toBe("This game plays without the colony's council");
    expect(state.colony).toBeNull();
  });

  it('RULE-32b row 2: with no free block of its footprint, commission refuses with the words, and the catalogue says the same', () => {
    // A 3×3 grounds: every 2×2 block covers the hall in the middle, so the Stadium has no room; a 1×1 still fits.
    COLONY.grounds.size = 3;
    const state = governedGame();
    const words = "There is no room on the colony's grounds for the Stadium";
    expect(commissionRefusal(state, 'stadium')).toBe(words);
    expect(refused(() => commission(state, 'lena', 'stadium'))).toBe(words);
    expect(state.colony!.projects).toEqual([]);
    expect(commissionRefusal(state, 'park')).toBeNull();
  });

  it('RULE-32b row 2: a 1×1 is refused only once every cell but the hall is taken', () => {
    COLONY.grounds.size = 3;
    const state = governedGame();
    const ring = [0, 1, 2, 3, 5, 6, 7, 8];
    ring.slice(0, 7).forEach((slot) => holding(state, 'observatory', 'standing', slot));
    expect(commissionRefusal(state, 'park')).toBeNull();
    holding(state, 'hospital', 'closed', ring[7]!);
    expect(commissionRefusal(state, 'park')).toBe("There is no room on the colony's grounds for the Park");
  });

  it('RULE-32b row 3: the first commission takes the first block in the order, and slot is its top-left cell, y × 5 + x', () => {
    const state = governedGame();
    commissionAndBuild(state, 'hospital');
    commission(state, 'lena', 'park');
    // Ring 1, clockwise from north: the cell above the hall, then the one up and to the right.
    expect(state.colony!.projects.map((p) => [p.id, p.slot])).toEqual([
      ['hospital', at(2, 1)],
      ['park', at(3, 1)],
    ]);
    expect(at(2, 1)).toBe(7);
  });

  it("RULE-32b row 3: a block's cells are all taken, so a 1×1 never lands inside a 2×2", () => {
    const state = governedGame();
    commissionAndBuild(state, 'spaceport');
    commission(state, 'lena', 'park');
    // The Spaceport at (2,0) covers (2,0), (3,0), (2,1) and (3,1): the Park goes on round to (3,2).
    expect(anchorOf(state, 'spaceport')).toEqual([2, 0]);
    expect(anchorOf(state, 'park')).toEqual([3, 2]);
  });

  it('RULE-32b row 3: ring 2 only once ring 1 is full, starting clockwise from north', () => {
    const state = governedGame();
    for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]]) holding(state, 'observatory', 'standing', at(x!, y!));
    commission(state, 'lena', 'park');
    expect(anchorOf(state, 'park')).toEqual([2, 0]);
  });

  it('RULE-32b: a closed or damaged building keeps its block, and the next takes the first block still free', () => {
    const state = governedGame();
    holding(state, 'spaceport', 'closed', at(2, 0));
    holding(state, 'hospital', 'damaged', at(1, 2));
    commission(state, 'lena', 'stadium');
    expect(anchorOf(state, 'stadium')).toEqual([3, 2]);
    expect(anchorOf(state, 'spaceport')).toEqual([2, 0]);
    expect(anchorOf(state, 'hospital')).toEqual([1, 2]);
  });

  it('RULE-32b: a project holding no block (slot null) takes no cells', () => {
    const state = governedGame();
    holding(state, 'stadium', 'standing', null);
    commission(state, 'lena', 'park');
    expect(anchorOf(state, 'park')).toEqual([2, 1]);
  });

  it("RULE-32b: today's checks still come first (an object the colony already has)", () => {
    const state = governedGame();
    holding(state, 'park', 'standing', at(2, 1));
    expect(refused(() => commission(state, 'lena', 'park'))).toBe('The colony already has a Park');
  });
});

/** Plays on to the next upkeep, where the colony funds and builds (RULE-21). */
function nextUpkeep(state: GameState): void {
  do advancePhase(state);
  while (state.phase !== 'upkeep');
}

describe("B-AC-31 (engine): a building on the colony's grounds builds once funded, with no wait for land", () => {
  it("B-AC-31: the Hospital takes the first block, the Park the next; the Park fully funded at an upkeep builds from it, stands after its build months, and no tile changes owner", () => {
    const state = governedGame();
    commissionAndBuild(state, 'hospital');
    commission(state, 'lena', 'park');
    expect(anchorOf(state, 'hospital')).toEqual([2, 1]);
    expect(anchorOf(state, 'park')).toEqual([3, 1]);

    // The fund covers the Park and the store has its Alloy, so the upkeep pays it in full.
    state.treasury.money = 10_000;
    state.store.stock.alloy = 10;
    const owners = state.tiles.map((t) => t.owner);

    nextUpkeep(state);
    const park = () => state.colony!.projects.find((p) => p.id === 'park')!;
    expect(park()).toMatchObject({ stage: 'building', monthsLeft: PRESTIGE.park.buildMonths, slot: at(3, 1), funded: { credits: PRESTIGE.park.credits, goods: PRESTIGE.park.goods } });
    for (let left = PRESTIGE.park.buildMonths - 1; left > 0; left--) {
      nextUpkeep(state);
      expect(park()).toMatchObject({ stage: 'building', monthsLeft: left });
    }
    nextUpkeep(state);
    expect(park()).toMatchObject({ stage: 'standing', slot: at(3, 1) });
    expect(state.tiles.map((t) => t.owner), 'the colony takes no map plot: every tile keeps its owner').toEqual(owners);
  });
});
