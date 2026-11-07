import { describe, expect, it } from 'vitest';
import {
  callStrike,
  COLONY,
  createGame,
  monthLedger,
  payStrike,
  RuleError,
  strikeHolds,
  type GameState,
} from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'kai'];

/** Month 1's planning with Lena governing, no election open, `fund` in the colony fund. */
function governed(fund = 1_000, politics = true): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics });
  if (state.politics) state.politics = { ...state.politics, governor: 'lena', election: null };
  state.treasury.money = fund;
  return state;
}

function refused(run: () => void): string {
  try {
    run();
  } catch (err) {
    if (err instanceof RuleError) return err.message;
    throw err;
  }
  return 'paid';
}

describe('C37: the Governor pays off a general strike (RULE-26)', () => {
  it.each([
    { row: 1, why: 'politics off', make: () => governed(1_000, false), by: 'lena', then: "This game plays without the colony's council" },
    { row: 2, why: 'no strike', make: () => governed(), by: 'lena', then: 'There is no strike to pay off' },
    { row: 2, why: "last month's strike", make: () => {
      const s = governed();
      callStrike(s, 'food');
      s.month++;
      return s;
    }, by: 'lena', then: 'There is no strike to pay off' },
    { row: 3, why: 'not planning', make: () => {
      const s = governed();
      callStrike(s, 'food');
      s.phase = 'development';
      return s;
    }, by: 'lena', then: 'Pay the strikers once the votes are over' },
    { row: 3, why: 'the law ballot is open', make: () => {
      const s = governed();
      callStrike(s, 'food');
      s.politics = { ...s.politics!, council: { stage: 'ballot', clockMs: 0, proposal: { kind: 'enact', law: 'landTax', setting: 10 }, proposer: 'lena', ballots: { lena: true }, done: [], result: null } };
      return s;
    }, by: 'lena', then: 'Pay the strikers once the votes are over' },
    { row: 4, why: 'not the Governor', make: () => {
      const s = governed();
      callStrike(s, 'food');
      return s;
    }, by: 'kai', then: 'Only the Governor pays the strikers' },
    { row: 4, why: 'no Governor: nobody can pay', make: () => {
      const s = governed();
      s.politics = { ...s.politics!, governor: null };
      callStrike(s, 'food');
      return s;
    }, by: 'lena', then: 'Only the Governor pays the strikers' },
    { row: 5, why: 'already paid', make: () => {
      const s = governed();
      callStrike(s, 'food');
      payStrike(s, 'lena');
      return s;
    }, by: 'lena', then: 'The strikers are already paid' },
    { row: 6, why: 'the fund is short', make: () => {
      const s = governed(COLONY.strike.cost - 1);
      callStrike(s, 'food');
      return s;
    }, by: 'lena', then: `The fund has ${COLONY.strike.cost - 1} cr; the strikers want ${COLONY.strike.cost} cr` },
  ])('T-AC-35: RULE-26 row $row ($why)', ({ make, by, then }) => {
    const state = make();
    const fund = state.treasury.money;
    expect(refused(() => payStrike(state, by))).toBe(then);
    expect(state.treasury.money, 'a refusal moves no money').toBe(fund);
  });

  it('T-AC-35: RULE-26 row 7 — paid from the fund as strikePay, even to its last credit (the reserve does not apply), and the strike no longer holds', () => {
    const state = governed(COLONY.strike.cost);
    callStrike(state, 'food');
    expect(strikeHolds(state, 'food')).toBe(true);
    payStrike(state, 'lena');
    expect(state.treasury.money, 'the reserve does not hold any back').toBe(0);
    expect(state.colony!.strike).toMatchObject({ month: state.month, good: 'food', cost: COLONY.strike.cost, paid: true });
    expect(strikeHolds(state, 'food')).toBe(false);
    const ledger = monthLedger(state)!;
    expect(ledger.out.strikePay).toBe(COLONY.strike.cost);
    const sum = (xs: Record<string, number | undefined>) => Object.values(xs).reduce<number>((a, b) => a + (b ?? 0), 0);
    expect(COLONY.strike.cost + sum(ledger.in) - sum(ledger.out), "T-AC-20: the month's ledger still balances").toBe(state.treasury.money);
  });

  it('T-AC-35 (T-AC-20): with more in the fund than the strikers want, exactly the cost leaves, under strikePay alone', () => {
    const state = governed(1_000);
    callStrike(state, 'food');
    payStrike(state, 'lena');
    expect(state.treasury.money).toBe(1_000 - COLONY.strike.cost);
    expect(monthLedger(state)!.out).toEqual({ strikePay: COLONY.strike.cost });
  });

  it("T-AC-35: strikeHolds is true only for this month's struck good while unpaid; with politics off nothing holds", () => {
    const state = governed();
    expect(strikeHolds(state, 'food')).toBe(false);
    callStrike(state, 'energy');
    expect(strikeHolds(state, 'energy')).toBe(true);
    expect(strikeHolds(state, 'food')).toBe(false);
    state.month++;
    expect(strikeHolds(state, 'energy'), "last month's strike is over").toBe(false);

    const off = governed(1_000, false);
    callStrike(off, 'energy');
    expect(strikeHolds(off, 'energy')).toBe(false);
  });
});
