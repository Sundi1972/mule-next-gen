import { describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, allPrices, BRAIN, createGame, GOODS, type GameState, type LandGrantPlay, type PhaseOutcome, type Strategy } from '@mule/engine';
import { PERSONAS } from '../src/personas.js';
import { GOOD_NAME } from '../src/strategist.js';
import type { Mind } from '../src/value.js';
import { landBrief } from '../src/llm/brief.js';
import type { Feedback } from '../src/llm/writer.js';
import type { LandDraft } from '../src/playbook/index.js';

/** Stock counts no game reaches, one per seat, so a leak into another seat's brief is unmistakable. */
const OWN = { p0: 75_319, p1: 97_531, p2: 86_420 } as const;

/** Four seats; p0, p1 and p2 own land, p1 has a MULE out, each seat holds one distinctive stock count. */
function table(): GameState {
  const state = createGame({ seed: 7, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: true })) });
  const free = state.tiles.map((t, i) => (t.terrain === 'store' ? -1 : i)).filter((i) => i >= 0);
  const give = (i: number, owner: string, outfit: GameState['tiles'][number]['outfit'] = null) => Object.assign(state.tiles[free[i]!]!, { owner, outfit });
  give(0, 'p0');
  give(1, 'p1', 'food');
  give(2, 'p1');
  give(3, 'p2', 'energy');
  state.players.find((p) => p.id === 'p0')!.stock.food = OWN.p0;
  state.players.find((p) => p.id === 'p1')!.stock.crystite = OWN.p1;
  state.players.find((p) => p.id === 'p2')!.stock.energy = OWN.p2;
  return state;
}

const mindOf = (me: string, level: 'rookie' | 'trader' = 'trader'): Mind => ({
  me,
  personaId: 'trader',
  persona: AI_PERSONAS.trader,
  levelId: level,
  level: AI_LEVELS[level],
  salt: 3,
});

const STRATEGY: Strategy = {
  kind: 'builder',
  moneyMaker: 'food',
  monopolyTarget: null,
  cashFloor: 200,
  landTarget: { plots: 6, byMonth: 6 },
  stances: {},
  reason: 'Grow steady.',
};
const draftOf = (plot: number): LandDraft => {
  const landGrant: LandGrantPlay = { ranked: [{ plot, value: 410 }], pressShare: { start: 0.8, end: 0.4 }, deny: [], planB: [], claims: 2 };
  return { strategy: STRATEGY, landGrant };
};
const TALK = [{ from: 'Ada', text: 'I want the river <b>now</b>' }];

const briefFor = (state: GameState, me: string) => landBrief(state, mindOf(me), PERSONAS.trader, draftOf(12), TALK).text;

describe("T-AC-A2: the brief holds only public facts in a deterministic order; two seats' briefs never contain another seat's goods", () => {
  it("T-AC-A2: each seat's brief carries its own goods and never another seat's", () => {
    const state = table();
    const briefs = { p0: briefFor(state, 'p0'), p1: briefFor(state, 'p1'), p2: briefFor(state, 'p2') };
    for (const [seat, text] of Object.entries(briefs)) {
      for (const [other, count] of Object.entries(OWN)) {
        if (other === seat) expect(text, `${seat} sees its own goods`).toContain(String(count));
        else expect(text, `${seat}'s brief holds ${other}'s goods`).not.toContain(String(count));
      }
    }
  });

  it('T-AC-A2: what observe hides does not move the brief: unanalysed ground and rivals\' analyses change nothing', () => {
    const state = table();
    const hidden = structuredClone(state);
    const p0 = hidden.players.find((p) => p.id === 'p0')!;
    // Every plot p0 has not analysed gets the richest ground there is, and p1 has analysed half the map.
    hidden.tiles.forEach((t, i) => {
      if (t.terrain === 'store' || p0.analysed.includes(i)) return;
      for (const g of Object.keys(t.ground) as (keyof typeof t.ground)[]) t.ground[g] = 4;
    });
    hidden.players.find((p) => p.id === 'p1')!.analysed = hidden.tiles.map((_, i) => i).filter((i) => i % 2 === 0);
    expect(briefFor(hidden, 'p0')).toBe(briefFor(state, 'p0'));
  });

  it('T-AC-A2: the same state gives the same brief, byte for byte, its sections in a fixed order', () => {
    const state = table();
    const text = briefFor(state, 'p0');
    expect(briefFor(state, 'p0')).toBe(text);
    const order = ['Who owns the land', 'Colony prices', 'Your strategy', 'Land plans for this month', 'Your draft land grant', 'What you may change', 'Your character'];
    const at = order.map((h) => text.indexOf(h));
    expect(at.every((i) => i >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it("T-AC-A2: the public facts are there: every seat's plots and outfits, every price, the engine's plans with their numbers, the draft, the persona and quoted talk", () => {
    const state = table();
    const brief = landBrief(state, mindOf('p0'), PERSONAS.trader, draftOf(12), TALK);
    for (const p of state.players) expect(brief.text).toContain(p.name);
    expect(brief.text).toMatch(/Seat 1: 2 plots/);
    expect(brief.text).toMatch(/Food MULE/);
    const prices = allPrices(state);
    for (const g of GOODS) expect(brief.text).toContain(`${GOOD_NAME[g]} ${prices[g]}`);
    expect(brief.plans.length).toBeGreaterThanOrEqual(1);
    expect(brief.plans.length).toBeLessThanOrEqual(BRAIN.brief.plans);
    for (const plan of brief.plans) {
      expect(brief.text).toContain(`${plan.id}. ${plan.label}`);
      expect(plan.ranked.length).toBeGreaterThan(0);
      expect(brief.text).toContain(`plot ${plan.ranked[0]!.plot} (${plan.ranked[0]!.value} cr)`);
    }
    expect(brief.text).toContain('plot 12 (410 cr)');
    expect(brief.text).toContain(PERSONAS.trader.card);
    // Quoted as llm/prompt.ts quotes it: inside the block, its markup folded.
    expect(brief.text).toContain('<table_talk>\nAda: "I want the river ‹b›now‹/b›"\n</table_talk>');
  });

  it('T-AC-A2: prices carry their trend over BRAIN.brief.trendMonths past months, the store\'s stock, and the export ship\'s wishlist once announced', () => {
    const state = table();
    const past = (month: number, food: number) => ({ ...structuredClone(state.history[0] ?? ({} as GameState['history'][number])), month, prices: { ...allPrices(state), food } });
    state.history = [past(1, 11), past(2, 22), past(3, 33), past(4, 44)].slice(0, BRAIN.brief.trendMonths + 1);
    state.month = 5;
    const now = allPrices(state).food;
    const text = briefFor(state, 'p0');
    // Newest first, the oldest past the cap left out.
    const was = [44, 33, 22, 11].slice(0, BRAIN.brief.trendMonths).join(', ');
    expect(text).toContain(`${GOOD_NAME.food} ${now} (was ${was})`);
    expect(text).not.toContain(`, ${[44, 33, 22, 11][BRAIN.brief.trendMonths]})`);
    for (const g of GOODS) expect(text).toContain(`${GOOD_NAME[g]} ${state.store.stock[g]}`);
    expect(text).toContain('Store stock:');

    state.ship = { arrives: 6, goods: ['food', 'energy'], hold: { food: 4, energy: 2 }, bought: {} };
    expect(briefFor(state, 'p0')).toContain(`The export ship calls in month 6 and wants: ${GOOD_NAME.food} 4, ${GOOD_NAME.energy} 2.`);
    state.ship = { arrives: 9, goods: [], hold: {}, bought: {} };
    expect(briefFor(state, 'p0')).toContain('No export ship is announced.');
  });

  it('T-AC-A2: each section stays within its BRAIN cap', () => {
    const state = table();
    const many = state.tiles.map((t, i) => (t.terrain === 'store' ? -1 : i)).filter((i) => i >= 0);
    for (const i of many.slice(0, BRAIN.brief.plotsPerPlayer + 3)) state.tiles[i]!.owner = 'p3';
    const talk = Array.from({ length: BRAIN.talkLines + 4 }, (_, i) => ({ from: 'Ada', text: `line ${i}` }));
    const ranked = many.slice(0, BRAIN.brief.draftEntries + 2).map((plot) => ({ plot, value: 100 }));
    const draft: LandDraft = { strategy: STRATEGY, landGrant: { ...draftOf(0).landGrant, ranked } };
    const { text } = landBrief(state, mindOf('p0'), PERSONAS.trader, draft, talk);
    const seat3 = text.split('\n').find((l) => l.startsWith('Seat 3:'))!;
    expect(seat3.match(/\bplot \d+/g)?.length).toBe(BRAIN.brief.plotsPerPlayer);
    expect(seat3).toContain('and 3 more');
    expect(text).not.toContain('line 3"');
    expect(text).toContain(`line ${BRAIN.talkLines + 3}"`);
    const draftLine = text.split('\n').find((l) => l.startsWith('Ranked:'))!;
    expect(draftLine.match(/\bplot \d+/g)?.length).toBe(BRAIN.brief.draftEntries);
  });

  it('T-AC-A2: a Rookie seat is told it never aims for a monopoly and is offered no monopoly target; a Trader seat is offered one', () => {
    const state = table();
    const rookie = landBrief(state, mindOf('p0', 'rookie'), PERSONAS.trader, draftOf(12), []);
    const trader = landBrief(state, mindOf('p0', 'trader'), PERSONAS.trader, draftOf(12), []);
    expect(rookie.corners).toBe(false);
    expect(trader.corners).toBe(true);
    expect(rookie.text).toMatch(/never aims for a monopoly/);
    expect(rookie.text).not.toContain('monopolyTarget');
    expect(trader.text).toContain('monopolyTarget');
  });
});

/** p0's land grant last month: one claim short of the plan, and what the rivals did in the open. */
const OUTCOME: PhaseOutcome = {
  seat: 'p0',
  month: 1,
  phase: 'landGrant',
  items: [
    { path: '/landGrant/claims', expected: 2, actual: 1, note: 'outbid on plot 12' },
    { path: '/landGrant/ranked/0', expected: 12, actual: 30 },
  ],
  rivals: {
    p1: { claimed: [12] },
    p2: { traded: [{ good: 'food', side: 'seller', price: 31, qty: 2 }], declaredButIdle: ['energy'] },
  },
};

describe('T-AC-A10: the next brief carries what happened: this seat\'s last PhaseOutcome, the rivals\' public trades and claims, and what the rules refused', () => {
  const brief = (outcome: PhaseOutcome | null, feedback: Feedback | null = null) =>
    landBrief(table(), mindOf('p0'), PERSONAS.trader, draftOf(12), TALK, { outcome, feedback }).text;

  it("T-AC-A10: the next brief carries this seat's last PhaseOutcome items and the rivals' public trades and claims; a seat with no outcome gets none", () => {
    const text = brief(OUTCOME);
    expect(text).toContain('What happened in your last phase (month 1, landGrant):');
    expect(text).toContain('/landGrant/claims: planned 2, got 1 (outbid on plot 12)');
    expect(text).toContain('/landGrant/ranked/0: planned 12, got 30');
    expect(text).toContain('Seat 1 claimed plot 12.');
    expect(text).toContain(`Seat 2 sold 2 ${GOOD_NAME.food} at 31; declared for ${GOOD_NAME.energy} and traded none.`);
    // In order: what happened comes after the strategy it was played by, before this month's plans.
    expect(text.indexOf('Your strategy')).toBeLessThan(text.indexOf('What happened in your last phase'));
    expect(text.indexOf('What happened in your last phase')).toBeLessThan(text.indexOf('Land plans for this month'));

    for (const none of [brief(null), landBrief(table(), mindOf('p0'), PERSONAS.trader, draftOf(12), TALK).text]) {
      expect(none).not.toContain('What happened in your last phase');
      expect(none).not.toContain('outbid');
    }
  });

  it("T-AC-A10: another seat's outcome never reaches this seat's brief", () => {
    const theirs: PhaseOutcome = { ...OUTCOME, seat: 'p1', items: [{ path: '/landGrant/claims', expected: 3, actual: 0, note: 'p1 secret' }] };
    const text = brief(theirs);
    expect(text).not.toContain('What happened in your last phase');
    expect(text).not.toContain('p1 secret');
  });

  it('T-AC-A10: the edits the rules refused and the ones the writer refused last time are in the next brief, by path and why', () => {
    const text = brief(OUTCOME, {
      rejected: [{ path: '/landGrant/claims', to: 9, why: 'at most 2' }],
      refused: [{ path: '/landGrant/ranked', cause: 'unknown_option' }],
    });
    expect(text).toContain('Last time the rules refused: /landGrant/claims (at most 2); your reply was refused at /landGrant/ranked (unknown_option).');
    expect(brief(OUTCOME, { rejected: [], refused: [] })).not.toContain('Last time the rules refused');
  });

  it('T-AC-A10: what happened stays within its BRAIN caps', () => {
    const many: PhaseOutcome = {
      ...OUTCOME,
      items: Array.from({ length: BRAIN.brief.outcomeItems + 2 }, (_, i) => ({ path: `/landGrant/ranked/${i}`, expected: i, actual: i + 1 })),
      rivals: { p1: { traded: Array.from({ length: BRAIN.brief.rivalTrades + 3 }, (_, i) => ({ good: 'food' as const, side: 'buyer' as const, price: 10 + i, qty: 1 })) } },
    };
    const text = brief(many);
    expect(text.match(/: planned \d+, got \d+/g)?.length).toBe(BRAIN.brief.outcomeItems);
    expect(text).toContain('and 2 more');
    const rival = text.split('\n').find((l) => l.startsWith('Seat 1 '))!;
    expect(rival.match(/ at \d+/g)?.length).toBe(BRAIN.brief.rivalTrades);
    expect(rival).toContain('and 3 more');
  });
});
