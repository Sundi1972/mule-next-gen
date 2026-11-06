import { describe, expect, it } from 'vitest';
import { commission, createGame, donate, GOOD_CONFIG, player, PRESTIGE, RuleError, scoreParts, voteWeight, type GameState, type PrestigeId } from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

/** A politics game in planning with Lena governing, no election open, and the hospital commissioned. */
function fundingHospital(politics = true): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics });
  if (!state.politics) return state;
  state.politics = { ...state.politics, governor: 'lena', election: null };
  commission(state, 'lena', 'hospital');
  return state;
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

const hospital = (state: GameState) => state.colony!.projects.find((p) => p.id === 'hospital')!;

describe('donations and plaques', () => {
  it("B-AC-22: Kai donates 200 cr and 1 Electronics to the hospital; the project counts them, the plaque names Kai with their value, and Kai's vote weight's taxes part grows", () => {
    const state = fundingHospital();
    const kai = player(state, 'kai');
    kai.money = 1_000;
    kai.stock.electronics = 1;
    const weight = voteWeight(state, 'kai').parts.taxes;
    state.store.posted.electronics = 150; // the store's price today, not the reference price
    const value = 200 + 150;

    donate(state, 'kai', 'hospital', 200, { electronics: 1 });

    expect(hospital(state).funded).toEqual({ credits: 200, goods: { electronics: 1 } });
    expect(hospital(state).plaque).toEqual({ kai: value });
    expect(player(state, 'kai').money).toBe(800);
    expect(player(state, 'kai').stock.electronics).toBe(0);
    expect(state.treasury.paid.kai).toBe(value);
    expect(voteWeight(state, 'kai').parts.taxes).toBeGreaterThan(weight);
    expect(state.colony!.ledger.in.donation).toBe(200);
    expect(state.colony!.ledger.out.project).toBe(200);
  });

  it('AM-13 (PM ruling, option B): a gift is Worth-neutral: goods count at the store\'s price on the day, so buying cheap and donating gains nothing', () => {
    for (const price of [40, GOOD_CONFIG.electronics.refPrice, 300]) {
      const state = fundingHospital();
      const kai = player(state, 'kai');
      kai.money = 1_000;
      kai.stock.electronics = 1;
      state.store.posted.electronics = price;
      const held = (s: GameState) => scoreParts(s, 'kai').money + scoreParts(s, 'kai').goods;
      const before = held(state);
      donate(state, 'kai', 'hospital', 25, { electronics: 1 });
      const plaque = hospital(state).plaque.kai!;
      expect(plaque, `Electronics at ${price}: the plaque records exactly what left Kai's Worth`).toBe(before - held(state));
      expect(plaque).toBe(25 + price);
    }
  });

  it("T-AC-26: each of RULE-23's rows refuses with its message, or takes the gift", () => {
    expect(refused(() => donate(fundingHospital(false), 'kai', 'hospital', 10))).toBe("This game plays without the colony's council");

    const state = fundingHospital();
    const kai = player(state, 'kai');
    kai.money = 1_000;
    kai.stock.electronics = 0;
    const { credits } = PRESTIGE.hospital;

    const later = fundingHospital();
    later.phase = 'auction';
    expect(refused(() => donate(later, 'kai', 'hospital', 10))).toBe('Donate in planning');
    expect(refused(() => donate(state, 'kai', 'park' as PrestigeId, 10))).toBe('Nothing is being funded');
    expect(refused(() => donate(state, 'kai', 'hospital', 0))).toBe('Give at least 1 cr or 1 unit');
    expect(refused(() => donate(state, 'kai', 'hospital', 2.5))).toBe('Give at least 1 cr or 1 unit');
    expect(refused(() => donate(state, 'kai', 'hospital', -5, { electronics: 1 }))).toBe('Give at least 1 cr or 1 unit');
    expect(refused(() => donate(state, 'kai', 'hospital', 1_001))).toBe('You have 1000 cr');
    kai.money = 10_000;
    expect(refused(() => donate(state, 'kai', 'hospital', credits + 1))).toBe(`The Hospital needs only ${credits} cr more`);
    expect(refused(() => donate(state, 'kai', 'hospital', 0, { alloy: 1 }))).toBe('The Hospital needs no alloy');
    expect(refused(() => donate(state, 'kai', 'hospital', 0, JSON.parse('{"toString": 1}')))).toBe('That is not a good');
    expect(refused(() => donate(state, 'stranger', 'hospital', 10))).toBe('No such player');
    expect(refused(() => donate(state, 'kai', 'hospital', 0, { electronics: 2 }))).toBe('The Hospital still needs 1 electronics');
    expect(refused(() => donate(state, 'kai', 'hospital', 0, { electronics: 1 }))).toBe('You have 0 electronics');
    expect(refused(() => donate(state, 'kai', 'hospital', credits))).toBe('accepted');
    expect(hospital(state).plaque).toEqual({ kai: credits });
  });
});

