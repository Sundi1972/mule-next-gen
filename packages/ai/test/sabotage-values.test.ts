import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auctionNeed, createGame, observe, POLITICS, score, type GameState, type Good, type SabotageOrder } from '@mule/engine';
import { captureCost, guardValue, investigateValue, lawWorth, sabotageGain } from '../src/politics-value.js';
import { yieldOf } from '../src/value.js';

/**
 * S4-C11 (slice 4 spec §10): WS1's values for sabotage, the Sheriff and the ban, in credits. The hands (S4-RULE-13) weigh
 * them; these rows pin what each value counts. A seat reads only its own observe() copy.
 */
const SEATS = ['ai0', 'ai1', 'ai2', 'ai3'];

const SAVED = { on: POLITICS.sabotage.on, offices: [...POLITICS.offices] };
beforeEach(() => {
  POLITICS.sabotage.on = true;
  POLITICS.offices = ['governor', 'sheriff'];
});
afterEach(() => {
  POLITICS.sabotage.on = SAVED.on;
  POLITICS.offices = [...SAVED.offices];
});

/**
 * Month 3's planning, the council over, ai1 Sheriff. ai1 and ai2 each own one working Crystite mine on like ground; ai1 is
 * the richest by far, ai0 next, ai2 and ai3 poorest. ai0 owns no plot.
 */
function table(): { state: GameState; lead: number; trail: number; spare: number[] } {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: true })) });
  state.month = 3;
  state.phase = 'planning';
  const free = state.tiles.map((t, i) => ({ t, i })).filter(({ t }) => t.terrain !== 'store' && t.owner === null);
  const ground = free[0]!.t;
  const give = (owner: string, outfit: Good) => {
    const { t, i } = free.shift()!;
    Object.assign(t, { owner, outfit, terrain: ground.terrain, ground: structuredClone(ground.ground), traits: [], special: undefined });
    return i;
  };
  const lead = give('ai1', 'crystite');
  const trail = give('ai2', 'crystite');
  const spare = free.map(({ i }) => i);
  const money = { ai0: 3_000, ai1: 9_000, ai2: 500, ai3: 400 } as Record<string, number>;
  for (const p of state.players) p.money = money[p.id]!;
  state.politics = { ...state.politics!, governor: 'ai0', sheriff: 'ai1', election: null, council: null, baron: null };
  return { state, lead, trail, spare };
}

const cutOn = (tile: number, by = 'ai0'): SabotageOrder => ({ id: '', by, month: 3, target: { kind: 'powerCut', tile }, cost: POLITICS.sabotage.orders.powerCut.cost, outcome: 'pending', culpritPublic: false });
const rumour = (good: Good, dir: 'up' | 'down'): SabotageOrder => ({ id: '', by: 'ai0', month: 3, target: { kind: 'rumour', good, dir }, cost: POLITICS.sabotage.orders.rumour.cost, outcome: 'pending', culpritPublic: false });
const doneCut = (id: string, tile: number, victim: string, partial: Partial<SabotageOrder> = {}): SabotageOrder => ({ id, by: null, month: 2, target: { kind: 'powerCut', tile }, cost: 0, outcome: 'done', culpritPublic: false, victim, good: 'crystite', worked: true, investigated: null, ...partial });

/** What the plot makes this month at its posted price, as the seat sees it. */
function plotWorth(obs: GameState, tile: number): number {
  const t = obs.tiles[tile]!;
  return yieldOf(obs, t, t.outfit!, t.owner!).made * obs.store.posted[t.outfit as Good];
}

describe('S4-C11: sabotageGain', () => {
  it("a power cut is worth the plot's output this month at the posted price, times the cut's odds of working, in full against a seat ahead of me", () => {
    const { state, lead } = table();
    const obs = observe(state, 'ai0');
    expect(score(obs, 'ai1'), 'the case: ai1 leads ai0').toBeGreaterThan(score(obs, 'ai0'));
    const worth = plotWorth(obs, lead);
    expect(worth, 'the case: the mine makes something').toBeGreaterThan(0);
    expect(sabotageGain(obs, 'ai0', cutOn(lead))).toBeCloseTo(POLITICS.sabotage.orders.powerCut.success * worth, 6);
  });

  it('against a seat behind me the same cut is worth POLITICS.ai.sabotage.behindWeight of that: little', () => {
    const { state, lead, trail } = table();
    const obs = observe(state, 'ai0');
    expect(plotWorth(obs, trail), 'the case: like plots').toBe(plotWorth(obs, lead));
    const ahead = sabotageGain(obs, 'ai0', cutOn(lead));
    expect(sabotageGain(obs, 'ai0', cutOn(trail))).toBeCloseTo(POLITICS.ai.sabotage.behindWeight * ahead, 6);
    expect(sabotageGain(obs, 'ai0', cutOn(trail)), 'little: behindWeight is below 1').toBeLessThan(ahead);
  });

  it("a rumour is worth the shift on my surplus less the strongest rival's, times its odds: up pays a seller, down the same seat loses it", () => {
    const { state, spare } = table();
    state.players.find((p) => p.id === 'ai0')!.stock.smithore = 30;
    // ai2 and ai3 each run an Alloy works, so they need Smithore and ai1, the strongest, does not: the rival matters.
    for (const [id, i] of [['ai2', spare[0]!], ['ai3', spare[1]!]] as const) Object.assign(state.tiles[i]!, { owner: id, outfit: 'alloy' });
    const obs = observe(state, 'ai0');
    const surplus = (id: string) => obs.players.find((p) => p.id === id)!.stock.smithore - auctionNeed(obs, id).smithore;
    expect(surplus('ai2'), 'the case: the other rivals hold a different surplus from the strongest').not.toBe(surplus('ai1'));
    expect(surplus('ai3')).not.toBe(surplus('ai1'));
    const { shift, success } = POLITICS.sabotage.orders.rumour;
    const expected = success * shift * obs.store.posted.smithore * (surplus('ai0') - surplus('ai1'));
    expect(expected, 'the case: ai0 holds more spare Smithore than the leader').toBeGreaterThan(0);
    expect(sabotageGain(obs, 'ai0', rumour('smithore', 'up'))).toBeCloseTo(expected, 6);
    expect(sabotageGain(obs, 'ai0', rumour('smithore', 'down'))).toBeCloseTo(-expected, 6);
  });
});

describe('S4-C11: captureCost', () => {
  it("is the standard fine times the ban's multiplier in force (the reputation part is reputationCost's, slice 3)", () => {
    const { state, lead } = table();
    const { standard } = POLITICS.sheriff.fine;
    expect(captureCost(observe(state, 'ai0'), 'ai0', cutOn(lead))).toBe(standard);
    state.politics!.laws.sabotageBan = { setting: 3, since: 2 };
    expect(captureCost(observe(state, 'ai0'), 'ai0', cutOn(lead))).toBe(3 * standard);
    expect(captureCost(observe(state, 'ai0'), 'ai0', rumour('food', 'up'))).toBe(3 * standard);
  });
});

describe('S4-C11: guardValue', () => {
  it("the leader's plot is worth guarding more than a like plot of the last seat, a plot making nothing is worth 0, and a case against its owner raises it", () => {
    const { state, lead, trail, spare } = table();
    const obs = observe(state, 'ai1');
    const leader = guardValue(obs, 'ai1', lead);
    const last = guardValue(obs, 'ai1', trail);
    expect(last).toBeGreaterThan(0);
    expect(leader).toBeGreaterThan(last);
    const empty = state.tiles.findIndex((t) => t.owner === null && t.terrain !== 'store');
    expect(guardValue(obs, 'ai1', empty)).toBe(0);
    // An owned plot that makes nothing (AM-8): no MULE, or a green belt.
    const [idle, belt] = spare;
    Object.assign(state.tiles[idle!]!, { owner: 'ai1', outfit: null });
    Object.assign(state.tiles[belt!]!, { owner: 'ai1', outfit: 'greenBelt' });
    for (const tile of [idle!, belt!]) expect(guardValue(observe(state, 'ai1'), 'ai1', tile), String(tile)).toBe(0);
    state.politics!.sabotage = [doneCut('sab-aaaaaa', trail, 'ai2')];
    expect(guardValue(observe(state, 'ai1'), 'ai1', trail)).toBeGreaterThan(last);
  });
});

describe('S4-C11: investigateValue', () => {
  it("is already times investigateOdds: my own case pays me the victim's share and my share of the fund's, a rival's case only the fund's; a solved case is worth 0", () => {
    const { state, lead, trail } = table();
    state.politics!.sabotage = [doneCut('sab-aaaaaa', lead, 'ai1'), doneCut('sab-bbbbbb', trail, 'ai2')];
    const obs = observe(state, 'ai1');
    const [mine, theirs] = obs.politics!.sabotage;
    const { investigateOdds, victimShare, fine } = POLITICS.sheriff;
    const fundShare = ((1 - victimShare) * fine.standard) / SEATS.length;
    expect(investigateValue(obs, 'ai1', mine!)).toBeCloseTo(investigateOdds * (victimShare * fine.standard + fundShare), 6);
    expect(investigateValue(obs, 'ai1', theirs!)).toBeCloseTo(investigateOdds * fundShare, 6);
    expect(investigateValue(obs, 'ai1', { ...theirs!, culpritPublic: true, by: 'ai3' })).toBe(0);
    // The Sheriff's own order, unseen by anyone else: it knows the culprit, so there is nothing to find.
    state.politics!.sabotage = [doneCut('sab-cccccc', trail, 'ai2', { by: 'ai1' })];
    const own = observe(state, 'ai1').politics!.sabotage[0]!;
    expect(own.by, 'the case: its own order shows its name to it').toBe('ai1');
    expect(investigateValue(observe(state, 'ai1'), 'ai1', own)).toBe(0);
  });
});

describe('S4-C11: the ban in lawWorth', () => {
  const ban = (setting: number) => ({ kind: 'enact' as const, law: 'sabotageBan' as const, setting });

  it('with no cases at all the ban is worth 0 to everyone (a yes on an enact, AM-6)', () => {
    const { state } = table();
    for (const id of SEATS) expect(lawWorth(observe(state, id), id, ban(2)), id).toBe(0);
  });

  it("the cuts I suffered, a month, times the share the ban deters (1 − 1/setting), less what the ban adds to my own orders' expected fines", () => {
    const { state, lead, trail } = table();
    state.politics!.sabotage = [doneCut('sab-aaaaaa', lead, 'ai1'), doneCut('sab-bbbbbb', trail, 'ai2', { by: 'ai1', culpritPublic: true })];
    const victim = observe(state, 'ai2');
    const suffered = plotWorth(victim, trail) / (state.month - 1);
    expect(lawWorth(victim, 'ai2', ban(2))).toBe(Math.round(suffered * (1 - 1 / 2)));
    expect(lawWorth(victim, 'ai2', ban(3))).toBe(Math.round(suffered * (1 - 1 / 3)));
    // ai1 suffered a cut too, and its own order counts at its odds of being caught (spec §10): every past order of its
    // own, a month, × the cut's detect × the standard fine × (setting − 1).
    const culprit = observe(state, 'ai1');
    const deters = Math.round((plotWorth(culprit, lead) / (state.month - 1)) * (1 - 1 / 2));
    const extraFines = Math.round((POLITICS.sabotage.orders.powerCut.detect / (state.month - 1)) * POLITICS.sheriff.fine.standard * (2 - 1));
    expect(lawWorth(culprit, 'ai1', ban(2))).toBe(deters - extraFines);
  });

  it("a seat's own orders nobody caught count too: a saboteur with three unseen cuts by month 4 loses by a ×2 ban (review of #770)", () => {
    const { state, trail } = table();
    state.month = 4;
    state.politics!.sabotage = ['sab-aaaaaa', 'sab-bbbbbb', 'sab-cccccc'].map((id, m) => doneCut(id, trail, 'ai2', { by: 'ai0', month: m + 1 }));
    const obs = observe(state, 'ai0');
    expect(obs.politics!.sabotage.every((o) => o.by === 'ai0' && !o.culpritPublic), 'the case: its own, unseen by anyone else').toBe(true);
    const expected = -Math.round(((3 * POLITICS.sabotage.orders.powerCut.detect) / (state.month - 1)) * POLITICS.sheriff.fine.standard * (2 - 1));
    expect(expected).toBeLessThan(0);
    expect(lawWorth(obs, 'ai0', ban(2))).toBe(expected);
  });

  it('a repeal of the ban in force is worth the negative of enacting it at that setting', () => {
    const { state, trail } = table();
    state.politics!.sabotage = [doneCut('sab-bbbbbb', trail, 'ai2')];
    const enact = lawWorth(observe(state, 'ai2'), 'ai2', ban(2));
    expect(enact).toBeGreaterThan(0);
    state.politics!.laws.sabotageBan = { setting: 2, since: 2 };
    expect(lawWorth(observe(state, 'ai2'), 'ai2', { kind: 'repeal', law: 'sabotageBan' })).toBe(-enact);
  });
});
