import { afterEach, describe, expect, it } from 'vitest';
import { auctionNeed, budgetCredits, COLONY, colonyPrestige, createGame, GOODS, HAPPINESS, observe, POLITICS, PRESTIGE, stillNeeds, storeForSale, storeQuotes, welfareRecipient, type GameState, type Project } from '@mule/engine';
import { endMonth } from '../src/outlook.js';
import { lineWorth, overruleWorth } from '../src/politics-value.js';

/**
 * S5-C9 (slice 5 spec §3.2): WS1's values for the Governor's budget and the tax overrule, in credits. The hands
 * (BudgetHand.split, OverruleHand.call and vote) weigh them; these rows pin what each value counts.
 */
const SEATS = ['ai0', 'ai1', 'ai2', 'ai3'];
const W = HAPPINESS.weights;

/** Month 3's planning, ai0 Governor; ai3 is poorest, so Welfare goes to it. */
function table(): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: true })) });
  state.month = 3;
  state.phase = 'planning';
  const money = { ai0: 3_000, ai1: 2_500, ai2: 2_000, ai3: 200 } as Record<string, number>;
  for (const p of state.players) p.money = money[p.id]!;
  state.politics = { ...state.politics!, governor: 'ai0', election: null, council: null, baron: null };
  return state;
}

/** A commissioned park with `funded` credits paid in. */
function park(funded = 0): Project {
  return { id: 'park', stage: 'commissioned', funded: { credits: funded, goods: { alloy: 1 } }, monthsLeft: null, since: 2, plaque: {} };
}

/** What a mood point is worth a month to `me`: POLITICS.ai.budget.moodPoint, times governorMood for the sitting Governor. */
function point(obs: GameState, me: string): number {
  const { moodPoint, governorMood } = POLITICS.ai.budget;
  return moodPoint * (obs.politics?.governor === me ? governorMood : 1);
}

describe('S5-B-AC-6 (S5-C9\'s values): lineWorth, welfare', () => {
  it('the recipient gains the credits and the mood they buy; anyone else only the mood; past welfareCap units it buys no more mood', () => {
    const obs = observe(table(), 'ai1');
    expect(welfareRecipient(obs), 'the case: the poorest gets it').toBe('ai3');
    const mood = (amount: number) => W.welfare * Math.min(amount / W.welfareUnit, W.welfareCap);
    expect(lineWorth(obs, 'ai3', 'welfare', 100)).toBeCloseTo(100 + mood(100) * point(obs, 'ai3'), 6);
    expect(lineWorth(obs, 'ai1', 'welfare', 100)).toBeCloseTo(mood(100) * point(obs, 'ai1'), 6);
    const capped = W.welfareUnit * W.welfareCap;
    expect(lineWorth(obs, 'ai1', 'welfare', capped * 2)).toBeCloseTo(lineWorth(obs, 'ai1', 'welfare', capped), 6);
    expect(lineWorth(obs, 'ai1', 'welfare', 0)).toBe(0);
  });

  it("a mood point is worth governorMood times more to the sitting Governor", () => {
    const obs = observe(table(), 'ai0');
    const governor = lineWorth(obs, 'ai0', 'welfare', 100);
    const other = lineWorth(observe(table(), 'ai1'), 'ai1', 'welfare', 100);
    expect(governor).toBeCloseTo(other * POLITICS.ai.budget.governorMood, 6);
  });
});

describe('S5-B-AC-6 (S5-C9\'s values): lineWorth, projects', () => {
  const savedBuys = COLONY.fundBuysGoods;
  afterEach(() => {
    COLONY.fundBuysGoods = savedBuys;
  });

  it("0 with no building commissioned; 0 when the one commissioned waits only for goods the fund can't buy: the switch off, or the store has none (AM-15)", () => {
    const state = table();
    expect(lineWorth(observe(state, 'ai1'), 'ai1', 'projects', 300)).toBe(0);
    state.colony!.projects = [{ ...park(PRESTIGE.park.credits), funded: { credits: PRESTIGE.park.credits, goods: {} } }];
    expect(stillNeeds(state.colony!.projects[0]!).credits, 'the case: its credits are paid').toBe(0);
    COLONY.fundBuysGoods = false;
    expect(lineWorth(observe(state, 'ai1'), 'ai1', 'projects', 300)).toBe(0);
    COLONY.fundBuysGoods = true;
    for (const g of Object.keys(stillNeeds(state.colony!.projects[0]!).goods) as (keyof typeof state.store.stock)[]) state.store.stock[g] = 0;
    expect(lineWorth(observe(state, 'ai1'), 'ai1', 'projects', 300)).toBe(0);
  });

  it("while the fund buys goods (AM-15), credits toward a building that waits only for goods pay their share of its cost: its credits plus its missing goods at the store's sell price", () => {
    const state = table();
    state.colony!.projects = [{ ...park(PRESTIGE.park.credits), funded: { credits: PRESTIGE.park.credits, goods: {} } }];
    const obs = observe(state, 'ai1');
    const missing = Object.entries(stillNeeds(obs.colony!.projects[0]!).goods) as [keyof typeof obs.store.stock, number][];
    expect(missing.length, 'the case: it waits for goods').toBeGreaterThan(0);
    const goods = missing.reduce((n, [g, m]) => n + Math.min(m, storeForSale(obs, g)) * (storeQuotes(obs, g).sell ?? 0), 0);
    expect(goods, 'the case: the store sells them').toBeGreaterThan(0);
    const room = Math.max(0, W.prestigeCap - colonyPrestige(obs));
    const mood = W.prestige * Math.min(PRESTIGE.park.prestige, room);
    const months = endMonth(obs) - obs.month;
    const worth = (amount: number) => (Math.min(amount, goods) / (PRESTIGE.park.credits + goods)) * months * mood * point(obs, 'ai1');
    expect(lineWorth(obs, 'ai1', 'projects', 10)).toBeCloseTo(worth(10), 6);
    expect(lineWorth(obs, 'ai1', 'projects', goods + 500)).toBeCloseTo(worth(goods), 6);
  });

  it("the share of the building it pays, times its prestige's mood for the months left, at the seat's mood point; credits past its need add nothing", () => {
    const state = table();
    state.colony!.projects = [park(10)];
    const obs = observe(state, 'ai1');
    const need = stillNeeds(obs.colony!.projects[0]!).credits;
    const room = Math.max(0, W.prestigeCap - colonyPrestige(obs));
    const mood = W.prestige * Math.min(PRESTIGE.park.prestige, room);
    const months = endMonth(obs) - obs.month;
    const worth = (amount: number) => (Math.min(amount, need) / PRESTIGE.park.credits) * months * mood * point(obs, 'ai1');
    expect(mood, 'the case: the park adds mood').toBeGreaterThan(0);
    expect(lineWorth(obs, 'ai1', 'projects', 100)).toBeCloseTo(worth(100), 6);
    expect(lineWorth(obs, 'ai1', 'projects', need)).toBeCloseTo(worth(need), 6);
    expect(lineWorth(obs, 'ai1', 'projects', need + 500)).toBeCloseTo(worth(need), 6);
  });
});

describe('S5-B-AC-6 (S5-C9\'s values): overruleWorth, the tax', () => {
  /** ai1 holds 20 Smithore it needn't keep; ai0 raised the tax from 5% to 10% this planning. */
  function raised(): GameState {
    const state = table();
    state.players.find((p) => p.id === 'ai1')!.stock.smithore = 20;
    state.politics!.taxAtStart = 0.05;
    state.treasury.salesTax = 0.1;
    return state;
  }
  /** What `id` is expected to sell at this month's auctions, at the posted prices, from what `obs` shows. */
  const sales = (obs: GameState, id: string) => {
    const p = obs.players.find((q) => q.id === id)!;
    return GOODS.reduce((sum, g) => sum + Math.max(0, p.stock[g] - auctionNeed(obs, id)[g]) * obs.store.posted[g], 0);
  };

  it("undoing a raise saves the seat the raise on its expected sales, less its part of the fund's lost income through the budget's lines", () => {
    const state = raised();
    const obs = observe(state, 'ai1');
    const delta = 0.1 - 0.05;
    const lost = delta * obs.players.reduce((sum, p) => sum + sales(obs, p.id), 0);
    const credits = budgetCredits(obs);
    const through = lineWorth(obs, 'ai1', 'projects', credits.projects) - lineWorth(obs, 'ai1', 'projects', Math.max(0, credits.projects - lost));
    expect(sales(obs, 'ai1'), 'the case: ai1 sells').toBeGreaterThan(0);
    expect(overruleWorth(obs, 'ai1', 'tax')).toBeCloseTo(delta * sales(obs, 'ai1') - through, 6);
    expect(overruleWorth(obs, 'ai1', 'tax')).toBeGreaterThan(0);
  });

  it("the fund's lost income reaches each line by its share and within its cap: Welfare full at its cap, a raise undone still pays the recipient", () => {
    // Review of #796 (I1): 80/20 with 2,000 spare puts Welfare at its 200 cap, and the raise's lost income leaves it there.
    const state = raised();
    state.politics!.budget = { month: 3, setBy: 'ai0', shares: { projects: 80, welfare: 20, security: 0 } };
    state.treasury.money = COLONY.reserve + 2_000;
    state.players.find((p) => p.id === 'ai3')!.stock.smithore = 20;
    const obs = observe(state, 'ai3');
    expect(welfareRecipient(obs), 'the case: ai3 gets Welfare').toBe('ai3');
    const delta = 0.1 - 0.05;
    const lost = delta * obs.players.reduce((sum, p) => sum + sales(obs, p.id), 0);
    const before = budgetCredits(obs);
    const after = budgetCredits({ ...obs, treasury: { ...obs.treasury, money: obs.treasury.money - lost } });
    expect([before.welfare, after.welfare], 'the case: Welfare stays at its cap').toEqual([POLITICS.budget.welfare.maxCredits, POLITICS.budget.welfare.maxCredits]);
    const through = (['projects', 'welfare'] as const).reduce((n, l) => n + lineWorth(obs, 'ai3', l, before[l]) - lineWorth(obs, 'ai3', l, after[l]), 0);
    expect(through, 'Welfare at its cap loses nothing').toBe(0);
    expect(overruleWorth(obs, 'ai3', 'tax')).toBeCloseTo(delta * sales(obs, 'ai3') - through, 6);
    expect(overruleWorth(obs, 'ai3', 'tax'), 'undoing the raise pays the seller it taxed').toBeGreaterThan(0);
  });

  it('undoing a cut costs a seller what it saves; with the tax unchanged it is worth 0; with no target given it values the tax', () => {
    const state = raised();
    state.politics!.taxAtStart = 0.1;
    state.treasury.salesTax = 0.05;
    const obs = observe(state, 'ai1');
    expect(overruleWorth(obs, 'ai1', 'tax')).toBeLessThan(0);
    expect(overruleWorth(obs, 'ai1')).toBe(overruleWorth(obs, 'ai1', 'tax'));
    state.treasury.salesTax = 0.1;
    expect(overruleWorth(observe(state, 'ai1'), 'ai1', 'tax')).toBe(0);
  });

  it("the budget and no-confidence targets are after RC: worth 0", () => {
    const obs = observe(raised(), 'ai1');
    expect(overruleWorth(obs, 'ai1', 'budget')).toBe(0);
    expect(overruleWorth(obs, 'ai1', 'confidence')).toBe(0);
  });
});
