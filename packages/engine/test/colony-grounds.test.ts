import { afterEach, describe, expect, it } from 'vitest';
import { COLONY } from '../src/config.js';
import { commission, commissionRefusal, createGame, PRESTIGE, RuleError, type GameState, type PrestigeId, type Project } from '../src/index.js';

/** G-5 C48, RULE-32: the colony builds on its own grounds, a slot chosen when the Governor commissions. */

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

/** An object already in the colony at a stage that is not open, holding a slot. */
function holding(state: GameState, id: PrestigeId, stage: Project['stage'], slot: number | null): void {
  const row = PRESTIGE[id];
  state.colony!.projects.push({ id, stage, funded: { credits: row.credits, goods: { ...row.goods } }, monthsLeft: null, plot: null, since: 1, plaque: {}, maxBid: null, slot });
}

function slotOf(state: GameState, id: PrestigeId): number | null | undefined {
  return state.colony!.projects.find((p) => p.id === id)?.slot;
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

describe("T-AC-51 · RULE-32: the colony's grounds", () => {
  it('T-AC-51 · RULE-32 row 1: politics off still refuses as today, slot or none', () => {
    const state = governedGame(false);
    expect(refused(() => commission(state, 'lena', 'park', 2))).toBe("This game plays without the colony's council");
    expect(refused(() => commission(state, 'lena', 'park'))).toBe("This game plays without the colony's council");
    expect(state.colony).toBeNull();
  });

  it("T-AC-51 · RULE-32 row 2: a slot outside the grounds is refused", () => {
    const state = governedGame();
    for (const slot of [-1, SLOTS, SLOTS + 3, 1.5]) {
      expect(refused(() => commission(state, 'lena', 'park', slot))).toBe(`There is no slot ${slot} on the colony's grounds`);
    }
    expect(state.colony!.projects).toEqual([]);
  });

  it('T-AC-51 · RULE-32 row 2: the groundsSlots config sets the edge, no literal 8', () => {
    COLONY.groundsSlots = 3;
    const state = governedGame();
    expect(refused(() => commission(state, 'lena', 'park', 3))).toBe("There is no slot 3 on the colony's grounds");
    commission(state, 'lena', 'park', 2);
    expect(slotOf(state, 'park')).toBe(2);
  });

  it('T-AC-51 · RULE-32 row 3: a taken slot is refused with the name of what stands there', () => {
    const state = governedGame();
    holding(state, 'spaceport', 'standing', 4);
    expect(refused(() => commission(state, 'lena', 'park', 4))).toBe('The Spaceport upgrade stands there');
    expect(state.colony!.projects).toHaveLength(1);
  });

  it('T-AC-51 · RULE-32 row 3: a slot the Governor commissioned is taken for the next commission', () => {
    const state = governedGame();
    commission(state, 'lena', 'park', 2);
    state.colony!.projects[0]!.stage = 'standing';
    expect(refused(() => commission(state, 'lena', 'hospital', 2))).toBe('The Park stands there');
  });

  it('T-AC-51 · RULE-32 row 3: a closed or a damaged object keeps its slot', () => {
    const state = governedGame();
    holding(state, 'stadium', 'closed', 0);
    holding(state, 'observatory', 'damaged', 1);
    expect(refused(() => commission(state, 'lena', 'park', 0))).toBe('The Stadium stands there');
    expect(refused(() => commission(state, 'lena', 'park', 1))).toBe('The Observatory stands there');
    commission(state, 'lena', 'park');
    expect(slotOf(state, 'park')).toBe(2);
  });

  it('T-AC-51 · RULE-32 row 4: a free slot is accepted and the project records it', () => {
    const state = governedGame();
    commission(state, 'lena', 'park', 5);
    expect(state.colony!.projects).toHaveLength(1);
    expect(state.colony!.projects[0]).toMatchObject({ id: 'park', stage: 'commissioned', slot: 5 });
  });

  it('T-AC-51 · RULE-32 AI Governor: no slot named takes the lowest free one', () => {
    const state = governedGame();
    commission(state, 'lena', 'park');
    expect(slotOf(state, 'park')).toBe(0);

    const gaps = governedGame();
    holding(gaps, 'stadium', 'standing', 0);
    holding(gaps, 'observatory', 'standing', 2);
    holding(gaps, 'spaceport', 'standing', 1);
    holding(gaps, 'hospital', 'standing', 4);
    commission(gaps, 'lena', 'park');
    expect(slotOf(gaps, 'park')).toBe(3);
  });

  it('T-AC-51 · RULE-32: a project sited on a map plot before the change (slot null) holds no slot', () => {
    const state = governedGame();
    holding(state, 'stadium', 'standing', null);
    commission(state, 'lena', 'park');
    expect(slotOf(state, 'park')).toBe(0);
  });

  it("T-AC-51 · RULE-32 guard: no free slot refuses with the grounds full, and the catalogue says so", () => {
    COLONY.groundsSlots = 2;
    const state = governedGame();
    holding(state, 'stadium', 'standing', 0);
    holding(state, 'observatory', 'closed', 1);
    expect(commissionRefusal(state, 'park')).toBe("The colony's grounds are full");
    expect(refused(() => commission(state, 'lena', 'park'))).toBe("The colony's grounds are full");
    expect(state.colony!.projects).toHaveLength(2);
  });

  it("T-AC-51 · RULE-32: today's checks still come first (an object the colony already has)", () => {
    const state = governedGame();
    holding(state, 'park', 'standing', 0);
    expect(refused(() => commission(state, 'lena', 'park', 0))).toBe('The colony already has a Park');
  });
});
