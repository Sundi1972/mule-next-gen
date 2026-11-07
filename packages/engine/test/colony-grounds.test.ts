import { afterEach, describe, expect, it } from 'vitest';
import { COLONY } from '../src/config.js';
import { advancePhase, commission, commissionRefusal, createGame, PRESTIGE, RuleError, type GameState, type PrestigeId, type Project } from '../src/index.js';

/**
 * G-5 C48, RULE-32 (AM-16 A as Heiko reshaped it after WS6's mock): the colony builds on its own grounds, each new
 * object on the next place in a fixed growth order. No one picks the place, and no rule reads it.
 */

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const SLOTS = COLONY.groundsSlots;

afterEach(() => {
  COLONY.groundsSlots = SLOTS;
});

/** A politics game in planning with Lena governing and no election open. */
function governedGame(politics = true): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics });
  if (state.politics) state.politics = { ...state.politics, governor: 'lena', election: null };
  return state;
}

/** An object already in the colony at a stage that is not open, holding a place (or none). */
function holding(state: GameState, id: PrestigeId, stage: Project['stage'], slot: number | null): void {
  const row = PRESTIGE[id];
  state.colony!.projects.push({ id, stage, funded: { credits: row.credits, goods: { ...row.goods } }, monthsLeft: null, since: 1, plaque: {}, slot });
}

function slotOf(state: GameState, id: PrestigeId): number | null | undefined {
  return state.colony!.projects.find((p) => p.id === id)?.slot;
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

describe("T-AC-51 · RULE-32: growth-order places on the colony's grounds", () => {
  it('T-AC-51 · RULE-32: buildings take places 0, 1, 2… in commission order', () => {
    const state = governedGame();
    commissionAndBuild(state, 'park');
    commissionAndBuild(state, 'hospital');
    commission(state, 'lena', 'observatory');
    expect(state.colony!.projects.map((p) => [p.id, p.slot])).toEqual([
      ['park', 0],
      ['hospital', 1],
      ['observatory', 2],
    ]);
    expect(state.colony!.projects[2]).toMatchObject({ stage: 'commissioned', slot: 2 });
  });

  it('T-AC-51 · RULE-32: a closed or damaged building keeps its place, and the next takes the next free one', () => {
    const state = governedGame();
    holding(state, 'stadium', 'closed', 0);
    holding(state, 'observatory', 'damaged', 1);
    commission(state, 'lena', 'park');
    expect(slotOf(state, 'park')).toBe(2);
    expect(slotOf(state, 'stadium')).toBe(0);
    expect(slotOf(state, 'observatory')).toBe(1);
  });

  it('T-AC-51 · RULE-32: the next building fills the lowest free place, a gap before the end', () => {
    const state = governedGame();
    holding(state, 'stadium', 'closed', 0);
    holding(state, 'observatory', 'standing', 2);
    commission(state, 'lena', 'park');
    expect(slotOf(state, 'park')).toBe(1);
  });

  it('T-AC-51 · RULE-32: a project holding no place (slot null) leaves place 0 free', () => {
    const state = governedGame();
    holding(state, 'stadium', 'standing', null);
    commission(state, 'lena', 'park');
    expect(slotOf(state, 'park')).toBe(0);
  });

  it("T-AC-51 · RULE-32 guard: full grounds refuse with the message, and the catalogue says so", () => {
    COLONY.groundsSlots = 2;
    const state = governedGame();
    holding(state, 'stadium', 'standing', 0);
    holding(state, 'observatory', 'closed', 1);
    expect(commissionRefusal(state, 'park')).toBe("The colony's grounds are full");
    expect(refused(() => commission(state, 'lena', 'park'))).toBe("The colony's grounds are full");
    expect(state.colony!.projects).toHaveLength(2);
  });

  it('T-AC-51 · RULE-32 guard: with a place free the catalogue has no grounds refusal', () => {
    COLONY.groundsSlots = 2;
    const state = governedGame();
    holding(state, 'stadium', 'standing', 0);
    expect(commissionRefusal(state, 'park')).toBeNull();
  });

  it('T-AC-51 · RULE-32: politics off still refuses as today', () => {
    const state = governedGame(false);
    expect(refused(() => commission(state, 'lena', 'park'))).toBe("This game plays without the colony's council");
    expect(commissionRefusal(state, 'park')).toBe("This game plays without the colony's council");
    expect(state.colony).toBeNull();
  });

  it("T-AC-51 · RULE-32: today's checks still come first (an object the colony already has)", () => {
    const state = governedGame();
    holding(state, 'park', 'standing', 0);
    expect(refused(() => commission(state, 'lena', 'park'))).toBe('The colony already has a Park');
  });
});

/** Plays on to the next upkeep, where the colony funds and builds (RULE-21). */
function nextUpkeep(state: GameState): void {
  do advancePhase(state);
  while (state.phase !== 'upkeep');
}

describe("B-AC-31 (engine): a building on the colony's grounds builds once funded, with no wait for land", () => {
  it('B-AC-31: the Hospital takes place 0, the Park next takes place 1; the Park fully funded at an upkeep builds from it, stands after its build months, and no tile changes owner', () => {
    const state = governedGame();
    commissionAndBuild(state, 'hospital');
    commission(state, 'lena', 'park');
    expect(slotOf(state, 'hospital')).toBe(0);
    expect(slotOf(state, 'park')).toBe(1);

    // The fund covers the Park and the store has its Alloy, so the upkeep pays it in full.
    state.treasury.money = 10_000;
    state.store.stock.alloy = 10;
    const owners = state.tiles.map((t) => t.owner);

    nextUpkeep(state);
    const park = () => state.colony!.projects.find((p) => p.id === 'park')!;
    expect(park()).toMatchObject({ stage: 'building', monthsLeft: PRESTIGE.park.buildMonths, slot: 1, funded: { credits: PRESTIGE.park.credits, goods: PRESTIGE.park.goods } });
    for (let left = PRESTIGE.park.buildMonths - 1; left > 0; left--) {
      nextUpkeep(state);
      expect(park()).toMatchObject({ stage: 'building', monthsLeft: left });
    }
    nextUpkeep(state);
    expect(park()).toMatchObject({ stage: 'standing', slot: 1 });
    expect(state.tiles.map((t) => t.owner), 'the colony takes no map plot: every tile keeps its owner').toEqual(owners);
  });
});
