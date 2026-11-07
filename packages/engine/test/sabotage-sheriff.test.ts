import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGame, lawOffered, POLITICS, proposeLaw, RuleError, type GameState, type LawId, type LawProposal } from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const BAN: LawProposal = { kind: 'enact', law: 'sabotageBan', setting: POLITICS.laws.sabotageBan.settings[0]! };
const LAND_10: LawProposal = { kind: 'enact', law: 'landTax', setting: 10 };

/** Month 2's planning, no election, Lena governing. */
function governed(): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
  state.month = 2;
  state.politics = { ...state.politics!, governor: 'lena', election: null, laws: {} };
  return state;
}

/** Sabotage switched on (or off) for each test of the calling block; the config's value comes back after it. */
function sabotage(on: boolean): void {
  let saved: boolean;
  beforeEach(() => {
    saved = POLITICS.sabotage.on;
    POLITICS.sabotage.on = on;
  });
  afterEach(() => {
    POLITICS.sabotage.on = saved;
  });
}

describe('S4-B-AC-8 (off-switch): the sabotage ban exists only while sabotage is on', () => {
  describe('sabotage off, the default', () => {
    sabotage(false);

    it('S4-B-AC-8: S4-RULE-2 row 1 words: proposeLaw refuses the ban, enact or repeal, and changes nothing', () => {
      expect(POLITICS.sabotage.on).toBe(false);
      for (const proposal of [BAN, { kind: 'repeal', law: 'sabotageBan' } as LawProposal]) {
        const state = governed();
        const before = structuredClone(state.politics);
        expect(() => proposeLaw(state, 'lena', proposal)).toThrow(new RuleError('This game plays without sabotage'));
        expect(state.politics).toEqual(before);
      }
    });

    it('S4-B-AC-8: lawOffered lists the four older laws and not the ban', () => {
      const offered = (Object.keys(POLITICS.laws) as LawId[]).filter(lawOffered);
      expect(offered).toEqual(['exportTax', 'landTax', 'pollutionTax', 'emissionCap']);
    });

    it('S4-B-AC-8: the other laws are proposed as before', () => {
      const state = governed();
      proposeLaw(state, 'lena', LAND_10);
      expect(state.politics!.proposal).toMatchObject({ proposal: { law: 'landTax' } });
    });
  });

  describe('sabotage on', () => {
    sabotage(true);

    it('S4-B-AC-8: the ban is offered and proposable with sabotage on', () => {
      expect(lawOffered('sabotageBan')).toBe(true);
      const state = governed();
      proposeLaw(state, 'lena', BAN);
      expect(state.politics!.proposal).toMatchObject({ proposal: { law: 'sabotageBan' } });
    });
  });
});
