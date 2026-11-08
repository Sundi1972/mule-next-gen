import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  callOverrule,
  commission,
  createGame,
  createRng,
  observe,
  openOverrule,
  POLITICS,
  PRESTIGE,
  stillNeeds,
  voteWeight,
  type AiLevelId,
  type AiPersonaId,
  type GameState,
  type Good,
  type Rng,
} from '@mule/engine';
import type { Act, AiAction } from '../src/actions.js';
import { BudgetHand, OverruleHand } from '../src/hands/budget.js';
import { VoteHand } from '../src/hands/vote.js';
import { applyAction } from '../src/play.js';
import { lineWorth, overruleWorth } from '../src/politics-value.js';
import { AiSeat } from '../src/seat.js';
import type { Mind } from '../src/value.js';

// WS1's two values are 0 stubs until S5-PR-3, so each row sets what it compares: they are doubles here, and no row asserts on a stub's 0.
vi.mock('../src/politics-value.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/politics-value.js')>()),
  lineWorth: vi.fn(() => 0),
  overruleWorth: vi.fn(() => 0),
}));

const SEATS = ['ai0', 'ai1', 'ai2', 'ai3'];
const line = vi.mocked(lineWorth);
const worth = vi.mocked(overruleWorth);

const SAVED = { budget: structuredClone(POLITICS.budget), ai: structuredClone(POLITICS.ai) };
beforeEach(() => {
  line.mockReset().mockReturnValue(0);
  worth.mockReset().mockReturnValue(0);
});
afterEach(() => {
  Object.assign(POLITICS.budget, structuredClone(SAVED.budget));
  Object.assign(POLITICS.ai, structuredClone(SAVED.ai));
});

function mindOf(me: string, persona: AiPersonaId, level: AiLevelId = 'trader', seed = 1): Mind {
  return new AiSeat({ id: me, name: me, persona, level, seed }).mind;
}

/** Month 2's planning, no election, ai0 governing, a fund of `fund`; goods for every object on the store's shelf. */
function governed(fund = 2_100, seed = 7): GameState {
  const state = createGame({ seed, players: SEATS.map((id) => ({ id, name: id, isAi: true })) });
  state.month = 2;
  state.politics = { ...state.politics!, governor: 'ai0', election: null, baron: null };
  state.treasury.money = fund;
  for (const row of Object.values(PRESTIGE)) for (const [good, need] of Object.entries(row.goods) as [Good, number][]) state.store.stock[good] = Math.max(state.store.stock[good], need);
  return state;
}

/** Everything a hand sent through `act`, applied to the state as the server and the sim apply it. */
function recorder(state: GameState, id: string): { sent: AiAction[]; act: Act } {
  const sent: AiAction[] = [];
  return { sent, act: (action) => (sent.push(action), applyAction(state, id, action)) };
}

function counted(seed: number): Rng & { draws: () => number } {
  const rng = createRng(seed);
  let draws = 0;
  const tally = <F extends (...args: never[]) => unknown>(f: F) => ((...args: Parameters<F>) => (draws++, f(...args))) as F;
  return { next: tally(rng.next), int: tally(rng.int), pick: tally(rng.pick), chance: tally(rng.chance), weighted: tally(rng.weighted), draws: () => draws } as Rng & { draws: () => number };
}

const split = (state: GameState, me: string, persona: AiPersonaId, level: AiLevelId = 'trader') => {
  const { sent, act } = recorder(state, me);
  const acted = new BudgetHand(mindOf(me, persona, level)).split(observe(state, me), act);
  return { sent, acted };
};

describe('S5-C6: the AI Governor splits the fund (S5-RULE-11)', () => {
  it('S5-T-AC-13: with no building open, Welfare is filled step by step while its credits still add worth, and stops where its cap stops paying', () => {
    // 2,000 spare: 5% pays 100, 10% pays the 200 cap, 15% pays 200 again: the third step adds nothing.
    line.mockImplementation((_obs, _me, l, amount) => (l === 'welfare' ? amount * 10 : 0));
    const { sent } = split(governed(), 'ai0', 'trader');
    expect(sent).toEqual([{ type: 'setBudget', shares: { projects: 90, welfare: 10, security: 0 } }]);
  });

  it("S5-T-AC-13: it never takes the share that covers its own open buildings' credits, however much a line is worth", () => {
    const state = governed(100 + 4 * PRESTIGE.park.credits); // spare = 4 x the Park's credits: the Park alone needs 25%
    commission(state, 'ai0', 'park');
    const need = stillNeeds(state.colony!.projects[0]!).credits;
    const covering = Math.ceil((need * 100) / (state.treasury.money - 100) / POLITICS.budget.step) * POLITICS.budget.step;
    POLITICS.budget.welfare.maxShare = 95; // lifted for the case, so only the covering share can stop the fill
    POLITICS.budget.welfare.maxCredits = 1e9;
    line.mockImplementation((_obs, _me, l, amount) => (l === 'welfare' ? amount * 10 : 0));
    const { sent } = split(state, 'ai0', 'trader');
    expect(sent).toEqual([{ type: 'setBudget', shares: { projects: covering, welfare: 100 - covering, security: 0 } }]);
  });

  it('S5-T-AC-13: a split equal to the budget in force sends nothing (a no-op change would invite an overrule)', () => {
    const state = governed();
    line.mockImplementation((_obs, _me, l, amount) => (l === 'welfare' ? amount * 10 : 0));
    const first = recorder(state, 'ai0');
    new BudgetHand(mindOf('ai0', 'trader')).split(observe(state, 'ai0'), first.act);
    expect(first.sent).toHaveLength(1);
    const second = split(state, 'ai0', 'trader');
    expect(second.sent).toEqual([]);
    expect(second.acted).toBe(false);
  });

  it('S5-T-AC-13: with the budget never set, a split of Projects 100 is the budget in force and sends nothing', () => {
    POLITICS.ai.budget.base.aggressive.welfare = 0;
    expect(split(governed(), 'ai0', 'aggressive').sent).toEqual([]);
  });

  it("S5-T-AC-13: a Rookie sets its persona's base shares only, with no fill and no value called", () => {
    line.mockReturnValue(1e6);
    const { sent } = split(governed(), 'ai0', 'cautious', 'rookie');
    expect(sent).toEqual([{ type: 'setBudget', shares: { projects: 90, welfare: POLITICS.ai.budget.base.cautious.welfare, security: 0 } }]);
    expect(line).not.toHaveBeenCalled();
  });

  it('S5-T-AC-13: only the Governor splits; a seat with no politics, or a bystander, sends nothing and calls no value', () => {
    const state = governed();
    expect(split(state, 'ai1', 'trader').sent).toEqual([]);
    const off = governed();
    off.politics = null;
    expect(new BudgetHand(mindOf('ai0', 'trader')).split(observe(off, 'ai0'), () => true)).toBe(false);
    expect(line).not.toHaveBeenCalled();
  });

  it('S5-T-AC-13: it holds after an overrule passed against it this term: no new tax, no new split', () => {
    const state = governed();
    state.politics!.overruled = 1;
    const { sent, act } = recorder(state, 'ai0');
    new VoteHand(mindOf('ai0', 'trader'), createRng(1)).tick(state, 0, act);
    expect(sent.filter((a) => a.type === 'setTax' || a.type === 'setBudget')).toEqual([]);
  });

  it("S5-T-AC-13: it holds for the rest of the term after it saw a tax overrule pass, even in a month with no overrule on record", () => {
    const state = governed();
    const hand = new VoteHand(mindOf('ai0', 'trader'), createRng(1));
    state.politics!.overrule = { month: 2, target: 'tax', caller: 'ai1', stage: 'reveal', clockMs: 0, ballots: {}, done: [], result: { passed: true, yes: 3, no: 1, total: 4, needed: 3 } };
    hand.tick(state, 0, () => true);
    state.month = 3;
    state.politics!.overrule = null;
    const { sent, act } = recorder(state, 'ai0');
    hand.tick(state, 0, act);
    expect(sent.filter((a) => a.type === 'setTax' || a.type === 'setBudget')).toEqual([]);
  });
});

/** A month-2 planning in which ai0's tax moved off where the month began: the setting a seat may judge. */
function taxed(fund = 2_100): GameState {
  const state = governed(fund);
  state.politics!.taxAtStart = 0.1;
  state.treasury.salesTax = 0.2;
  return state;
}

const callBy = (state: GameState, me: string, persona: AiPersonaId, level: AiLevelId = 'trader') => {
  const { sent, act } = recorder(state, me);
  new OverruleHand(mindOf(me, persona, level)).call(observe(state, me), act);
  return sent;
};

describe('S5-C6: the AI calls and votes on the tax (S5-RULE-12)', () => {
  it('S5-T-AC-14: call row 1 - a Rookie never calls, and no seat calls where canOverrule is not true', () => {
    worth.mockReturnValue(1e6);
    expect(callBy(taxed(), 'ai1', 'trader', 'rookie')).toEqual([]);
    const unchanged = taxed();
    unchanged.treasury.salesTax = 0.1;
    expect(callBy(unchanged, 'ai1', 'trader')).toEqual([]);
    expect(callBy(taxed(), 'ai0', 'trader'), 'the Governor cannot overrule itself').toEqual([]);
  });

  it('S5-T-AC-14: call row 2 - a change that costs the seat less than minGain is not called, however many would gain', () => {
    worth.mockReturnValue(POLITICS.ai.overrule.minGain - 1);
    expect(callBy(taxed(), 'ai1', 'trader')).toEqual([]);
  });

  it('S5-T-AC-14: call row 3 - it calls when the players it judges would gain hold a majority of the votes', () => {
    const state = taxed();
    worth.mockImplementation((_obs, who) => (who === 'ai0' ? 0 : POLITICS.ai.overrule.minGain + 1));
    expect(callBy(state, 'ai1', 'trader')).toEqual([{ type: 'callOverrule', target: 'tax' }]);
  });

  it('S5-T-AC-14: call rows 4 and 5 - short of a majority it calls only as a protest, when its draw falls under longShot', () => {
    const gains = (who: string) => (who === 'ai1' ? POLITICS.ai.overrule.minGain + 1 : 0);
    worth.mockImplementation((_obs, who) => gains(who));
    const state = taxed();
    const weights = state.players.map((p) => voteWeight(state, p.id).total);
    expect(voteWeight(state, 'ai1').total * 2, 'the fixture: one seat is not a majority').toBeLessThanOrEqual(weights.reduce((a, b) => a + b, 0));
    POLITICS.ai.overrule.longShot.trader = 1;
    expect(callBy(state, 'ai1', 'trader')).toEqual([{ type: 'callOverrule', target: 'tax' }]);
    POLITICS.ai.overrule.longShot.trader = 0;
    expect(callBy(taxed(), 'ai1', 'trader')).toEqual([]);
  });

  it('S5-T-AC-14: it judges each Governor setting once: a refusal stands until the tax changes again', () => {
    const state = taxed();
    const hand = new OverruleHand(mindOf('ai1', 'trader'));
    const { sent, act } = recorder(state, 'ai1');
    worth.mockReturnValue(0);
    hand.call(observe(state, 'ai1'), act);
    worth.mockImplementation((_obs, who) => (who === 'ai0' ? 0 : POLITICS.ai.overrule.minGain + 1));
    hand.call(observe(state, 'ai1'), act);
    expect(sent, 'same setting, already judged').toEqual([]);
    state.treasury.salesTax = 0.25;
    hand.call(observe(state, 'ai1'), act);
    expect(sent).toEqual([{ type: 'callOverrule', target: 'tax' }]);
  });

  /** The ballot as planning ends: ai1 called it. */
  function open(): GameState {
    const state = taxed();
    callOverrule(state, 'ai1', 'tax');
    expect(openOverrule(state)).toBe(true);
    return state;
  }
  const voteBy = (state: GameState, me: string, persona: AiPersonaId, level: AiLevelId = 'trader') => {
    const { sent, act } = recorder(state, me);
    new OverruleHand(mindOf(me, persona, level)).vote(observe(state, me), act);
    return sent;
  };
  const cast = (yes: boolean): AiAction[] => [{ type: 'voteOverrule', yes }, { type: 'done', done: true }];

  it('S5-T-AC-14: vote rows 1, 2 and 6 - the Governor votes no, the caller yes, anyone else yes only where overruleWorth is above 0', () => {
    worth.mockReturnValue(1e6);
    expect(voteBy(open(), 'ai0', 'trader'), 'row 1, whatever it is worth').toEqual(cast(false));
    worth.mockReturnValue(-1e6);
    expect(voteBy(open(), 'ai1', 'trader'), 'row 2, whatever it is worth').toEqual(cast(true));
    worth.mockReturnValue(1);
    expect(voteBy(open(), 'ai2', 'trader')).toEqual(cast(true));
    worth.mockReturnValue(0);
    expect(voteBy(open(), 'ai2', 'trader')).toEqual(cast(false));
  });

  it("S5-T-AC-14: vote row 3 - a Rookie's ballot is a coin from the overrule's own stream", () => {
    POLITICS.ai.overrule.rookieYes = 1;
    expect(voteBy(open(), 'ai2', 'trader', 'rookie')).toEqual(cast(true));
    POLITICS.ai.overrule.rookieYes = 0;
    expect(voteBy(open(), 'ai2', 'trader', 'rookie')).toEqual(cast(false));
  });

  it('S5-T-AC-14: vote row 5 - in an unhappy colony a seat votes yes even for a small loss, up to unhappyTilt', () => {
    const state = open();
    state.colony!.happiness = 10; // literal-ok: Unrest, inside POLITICS.ai.colony.leanIn
    worth.mockReturnValue(-(POLITICS.ai.overrule.unhappyTilt - 1));
    expect(voteBy(state, 'ai2', 'trader')).toEqual(cast(true));
    worth.mockReturnValue(-(POLITICS.ai.overrule.unhappyTilt + 1));
    expect(voteBy(state, 'ai2', 'trader')).toEqual(cast(false));
    state.colony!.happiness = 90; // literal-ok: Thriving
    worth.mockReturnValue(-1);
    expect(voteBy(state, 'ai2', 'trader'), 'a happy colony keeps row 6').toEqual(cast(false));
  });

  it('S5-T-AC-14: a seat that has voted votes once; the ballot is not reopened for it', () => {
    const state = open();
    worth.mockReturnValue(1);
    const first = recorder(state, 'ai2');
    const hand = new OverruleHand(mindOf('ai2', 'trader'));
    hand.vote(observe(state, 'ai2'), first.act);
    hand.vote(observe(state, 'ai2'), first.act);
    expect(first.sent).toEqual(cast(true));
  });

  it("S5-T-AC-14: no hand reads state.seed: a copy with a scrambled seed gets the same call and the same ballots", () => {
    POLITICS.ai.overrule.longShot.aggressive = 0.5;
    POLITICS.ai.overrule.rookieYes = 0.5;
    worth.mockImplementation((_obs, who) => (who === 'ai1' ? 50 : 0));
    for (const month of [2, 3, 4, 5, 6, 7]) {
      const a = taxed();
      a.month = month;
      const b = structuredClone(a);
      b.seed = a.seed ^ 0x5bd1e995;
      expect(callBy(b, 'ai1', 'aggressive'), `month ${month}`).toEqual(callBy(a, 'ai1', 'aggressive'));
      const c = open();
      c.month = month;
      const d = structuredClone(c);
      d.seed = c.seed ^ 0x5bd1e995;
      expect(voteBy(d, 'ai2', 'trader', 'rookie'), `month ${month}`).toEqual(voteBy(c, 'ai2', 'trader', 'rookie'));
    }
  });

  it("S5-T-AC-14: the overrule stream leaves the election's and the council's draws unchanged", () => {
    POLITICS.ai.overrule.rookieYes = 0.5;
    const rookie = (draw: boolean) => {
      const state = taxed();
      if (draw) for (let m = 2; m < 12; m++) voteBy(open(), 'ai2', 'trader', 'rookie');
      state.politics!.council = { stage: 'ballot', clockMs: 0, proposal: { kind: 'enact', law: 'landTax', setting: 10 }, proposer: 'ai0', ballots: { ai0: true }, done: [], result: null };
      const rng = counted(5);
      const { sent, act } = recorder(state, 'ai2');
      new VoteHand(mindOf('ai2', 'trader', 'rookie'), rng).tick(state, 0, act);
      return { sent, draws: rng.draws() };
    };
    expect(rookie(true)).toEqual(rookie(false));
    expect(rookie(true).draws, "the hand's election rng is not touched by a council ballot or an overrule").toBe(0);
  });

  it('S5-T-AC-14: every input is observe(state, me): the hands refuse a mind with no seat salt, as every politics hand does', () => {
    const bare: Mind = { ...mindOf('ai1', 'trader') };
    delete bare.salt;
    worth.mockReturnValue(1);
    const state = taxed();
    POLITICS.ai.overrule.longShot.trader = 1;
    expect(() => new OverruleHand(bare).call(observe(state, 'ai1'), () => true)).toThrow(/salt/);
  });
});

describe('S5-C6: VoteHand drives the hands (S5-RULE-13)', () => {
  /** One tick of the hand; the colony acts at once. */
  function tick(state: GameState, me: string, persona: AiPersonaId = 'aggressive'): AiAction[] {
    const { sent, act } = recorder(state, me);
    new VoteHand(mindOf(me, persona), createRng(1)).tick(state, 0, act);
    return sent;
  }
  // The cheapest object is the Park: at commissionShare of its credits the fund is just enough to want it.
  const wants = Math.ceil(PRESTIGE.park.credits * POLITICS.ai.colony.commissionShare);
  const types = (sent: AiAction[]) => sent.map((a) => a.type);

  it('S5-T-AC-15: with the budget null, colonyActs commissions as it does today (the fund holds the share of the credits)', () => {
    POLITICS.ai.budget.base.aggressive.welfare = 0;
    expect(tick(governed(wants), 'ai0')).toContainEqual({ type: 'commission', id: 'park' });
  });

  it("S5-T-AC-15: colonyActs commissions only when the share of the credits is within budgetCredits(obs).projects", () => {
    POLITICS.ai.budget.base.aggressive.welfare = 20; // literal-ok: the line's max share; the Governor sets Projects 80
    const poor = governed(wants + 1); // 80% of the spare is below `wants`
    expect(types(tick(poor, 'ai0')), 'the split lands first, and the Park is beyond its Projects share').not.toContain('commission');
    const rich = governed(130); // literal-ok: 30 spare, 80% of it is 24 credits: the Park's 21 fit, the Hospital's 34 do not
    expect(tick(rich, 'ai0')).toContainEqual({ type: 'commission', id: 'park' });
  });

  it('S5-T-AC-15: the Governor sets the tax, then the budget, then proposes and commissions', () => {
    POLITICS.ai.budget.base.aggressive.welfare = 10;
    const sent = tick(governed(5_000), 'ai0');
    const order = types(sent);
    expect(order.indexOf('setBudget')).toBeGreaterThan(-1);
    expect(order.indexOf('setTax')).toBeLessThan(order.indexOf('setBudget'));
    expect(order.indexOf('setBudget')).toBeLessThan(order.indexOf('commission'));
  });

  it('S5-T-AC-15: VoteHand.tick calls an overrule on a tax that moved, and votes and presses Done when the ballot opens', () => {
    worth.mockImplementation((_obs, who) => (who === 'ai0' ? 0 : POLITICS.ai.overrule.minGain + 1));
    const state = taxed();
    expect(tick(state, 'ai1', 'trader')).toContainEqual({ type: 'callOverrule', target: 'tax' });
    expect(openOverrule(state)).toBe(true);
    expect(tick(state, 'ai2', 'trader')).toEqual([{ type: 'voteOverrule', yes: true }, { type: 'done', done: true }]);
  });

  it('S5-T-AC-15: with politics off no hand moves anything: no action, no value called, the state untouched', () => {
    const state = governed();
    state.politics = null;
    state.colony = null;
    const before = structuredClone(state);
    for (const me of SEATS) expect(tick(state, me)).toEqual([]);
    expect(state).toEqual(before);
    expect(line).not.toHaveBeenCalled();
    expect(worth).not.toHaveBeenCalled();
  });
});
