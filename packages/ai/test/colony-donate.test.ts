import { afterEach, describe, expect, it } from 'vitest';
import { commission, createGame, observe, player, POLITICS, PRESTIGE, type AiPersonaId, type GameState } from '@mule/engine';
import { donationFor, standingOf } from '../src/colony-donate.js';
import { applyAction } from '../src/play.js';
import { AiSeat } from '../src/seat.js';
import { cashReserve } from '../src/value.js';

const SEATS = ['ai0', 'ai1', 'ai2', 'ai3'];
const ME = 'ai0';

/** A politics game in planning, the votes over, ai1 governing and the hospital commissioned unless told otherwise. */
function table({ politics = true, commissioned = true } = {}): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: true })), politics });
  if (state.politics) state.politics = { ...state.politics, governor: 'ai1', election: null };
  if (commissioned && state.colony) commission(state, 'ai1', 'hospital');
  return state;
}

const seatAs = (persona: AiPersonaId) => new AiSeat({ id: ME, name: ME, persona, level: 'trader', seed: 11 });

/**
 * Puts the seat's money at its reserve plus `spare` (negative: under it), and returns that money. Its larder is emptied
 * first, so the reserve is large enough that a trader ignoring it would give at least the least gift.
 */
function giveSpare(state: GameState, seat: AiSeat, spare: number): number {
  for (const good of ['food', 'water', 'energy'] as const) player(state, ME).stock[good] = 0;
  const money = cashReserve(observe(state, ME), seat.mind) + spare;
  const { share, minCredits } = POLITICS.ai.colony.donate;
  expect((money - spare) * share.trader, 'a trader ignoring its reserve would give at least the least gift').toBeGreaterThanOrEqual(minCredits);
  player(state, ME).money = money;
  return money;
}

const hospital = (state: GameState) => state.colony?.projects.find((p) => p.id === 'hospital');

interface Row {
  name: string;
  persona: AiPersonaId;
  spare: number;
  politics?: boolean;
  commissioned?: boolean;
  /** Credits the hospital still needs before planning; unset, its full price. */
  needs?: number;
  /** What the seat gives, by its plaque and the project's funded credits; 0, it gives nothing. */
  gives: number;
}

const ROWS: Row[] = [
  { name: 'a trader with 1000 cr spare gives a tenth', persona: 'trader', spare: 1_000, gives: 100 },
  { name: 'a saboteur never donates', persona: 'saboteur', spare: 1_000, gives: 0 },
  { name: 'money at its reserve: nothing', persona: 'trader', spare: 0, gives: 0 },
  { name: 'money under its reserve: nothing', persona: 'trader', spare: -10, gives: 0 },
  { name: 'politics off: nothing', persona: 'trader', spare: 1_000, politics: false, gives: 0 },
  { name: 'no commissioned object: nothing', persona: 'trader', spare: 1_000, commissioned: false, gives: 0 },
  { name: 'a project needing 15 cr gets 15, never more', persona: 'trader', spare: 1_000, needs: 15, gives: 15 },
];

describe('AI seats donate toward commissioned objects (G-5 C28)', () => {
  it.each(ROWS)('T-AC-C28: in planning with a commissioned object and spare cash, a trader AI seat donates; the plaque and funded credits show it after planning ($name)', (row) => {
    const state = table({ politics: row.politics ?? true, commissioned: row.commissioned ?? true });
    const seat = seatAs(row.persona);
    if (row.needs !== undefined) hospital(state)!.funded.credits = PRESTIGE.hospital.credits - row.needs;
    const fundedBefore = hospital(state)?.funded.credits ?? 0;
    const money = giveSpare(state, seat, row.spare);

    seat.planMonth(state, (a) => applyAction(state, ME, a));

    const donations = seat.planningLog().filter((s) => s.action.type === 'donate');
    expect(donations.length, 'at most one donation a planning').toBeLessThanOrEqual(1);
    expect(hospital(state)?.plaque[ME] ?? 0).toBe(row.gives);
    expect((hospital(state)?.funded.credits ?? 0) - fundedBefore).toBe(row.gives);
    expect(player(state, ME).money).toBe(money - row.gives);
    if (row.gives === 0) expect(donations).toEqual([]);
  });
});

describe('donationFor and the standing it reads', () => {
  const standing = { ...POLITICS.ai.colony.donate.standing };
  afterEach(() => {
    POLITICS.ai.colony.donate.standing = { ...standing };
  });

  it('T-AC-C28 (pure): the share of cash above the reserve by persona, times the standing factor, floored; null under the least gift', () => {
    POLITICS.ai.colony.donate.standing = { leading: 2, trailing: 0.5 };
    const cases: [AiPersonaId, number, 'leading' | 'trailing', number | null][] = [
      ['trader', 1_000, 'leading', 200],
      ['trader', 1_000, 'trailing', 50],
      ['cautious', 1_000, 'trailing', 75],
      ['aggressive', 1_000, 'trailing', 25],
      ['aggressive', 333, 'trailing', null], // 333 × 0.05 × 0.5 = 8.3, under the 10 cr least gift
      ['trader', 101, 'leading', 20], // 101 × 0.1 × 2 = 20.2, floored
      ['saboteur', 1_000, 'leading', null],
    ];
    for (const [persona, spare, at, want] of cases) {
      const state = table();
      const seat = seatAs(persona);
      giveSpare(state, seat, spare);
      const got = donationFor(observe(state, ME), seat.mind, at);
      expect(got, `${persona}, ${spare} cr spare, ${at}`).toEqual(want === null ? null : { id: 'hospital', credits: want });
    }
  });

  it("T-AC-C28 (pure): a seat leads when no rival's Worth is above its own, a tie included; else it trails", () => {
    const cases: [Record<string, number>, 'leading' | 'trailing'][] = [
      [{ ai0: 900, ai1: 500, ai2: 500, ai3: 500 }, 'leading'],
      [{ ai0: 500, ai1: 500, ai2: 500, ai3: 500 }, 'leading'],
      [{ ai0: 500, ai1: 500, ai2: 501, ai3: 500 }, 'trailing'],
    ];
    for (const [money, want] of cases) {
      const state = table();
      for (const id of SEATS) player(state, id).money = money[id]!;
      expect(standingOf(observe(state, ME), ME), JSON.stringify(money)).toBe(want);
    }
  });
});
