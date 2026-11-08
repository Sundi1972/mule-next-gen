import { describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, allPrices, BRAIN, createGame, GOODS, type GameState, type DevelopmentPlay, type LandGrantPlay, type PhaseOutcome, type Strategy } from '@mule/engine';
import { PERSONAS } from '../src/personas.js';
import { GOOD_NAME } from '../src/strategist.js';
import type { Mind } from '../src/value.js';
import { landBrief, phaseBrief } from '../src/llm/brief.js';
import { replySchema, type Feedback } from '../src/llm/writer.js';
import type { LandDraft, PhaseFact } from '../src/playbook/index.js';
import type { TableTalk } from '../src/decider.js';
import { relationMemory, type SocialInput } from '../src/social/index.js';

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
/** Public notices between the seats: p1 sold p0 Food, p2 bought a plot from p0. */
const NOTICES: PhaseFact[] = [
  { month: 1, phase: 'auction', kind: 'trade', good: 'food', buyer: 'p0', seller: 'p1', price: 31, qty: 2 },
  { month: 2, phase: 'landAuction', kind: 'sale', item: 'plot', plot: 7, seller: 'p0', buyer: 'p2', price: 160 },
];

const briefFor = (state: GameState, me: string) => landBrief(state, mindOf(me), PERSONAS.trader, draftOf(12), TALK).text;
/** The same land brief with the social section, built from the seat's memory of NOTICES and no reads of its own yet. */
const socialBriefFor = (state: GameState, me: string, talk: readonly TableTalk[] = TALK, reads: SocialInput['reads'] = {}) =>
  landBrief(state, mindOf(me), PERSONAS.trader, draftOf(12), talk, {}, null, null, false, { memory: relationMemory(state, me, NOTICES, new Map()), reads }).text;

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
    // With the social section, its parts follow the character in a fixed order, and the talk is quoted once, inside it.
    const social = socialBriefFor(state, 'p0');
    expect(socialBriefFor(state, 'p0')).toBe(social);
    const socialOrder = [...order, 'Social.', 'The other players:', 'Politics:', 'The last lines you heard', '<table_talk>', 'Decide where you stand with each player'];
    const socialAt = socialOrder.map((h) => social.indexOf(h));
    expect(socialAt.every((i) => i >= 0), JSON.stringify(socialAt)).toBe(true);
    expect([...socialAt].sort((a, b) => a - b)).toEqual(socialAt);
    expect(social.split('<table_talk>')).toHaveLength(2);
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
    // Only what the brief, observe and the outlook's shortage check read of a month's report.
    const past = (month: number, food: number) => ({ month, before: {}, produced: {}, prices: { ...allPrices(state), food }, shortages: [] }) as unknown as GameState['history'][number];
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

  it("T-AC-A2: a Rookie seat is told it never aims for a monopoly; a Trader seat is told 'monopolist' is open to it, and neither is offered a monopoly target (B fix 5)", () => {
    const state = table();
    const rookie = landBrief(state, mindOf('p0', 'rookie'), PERSONAS.trader, draftOf(12), []);
    const trader = landBrief(state, mindOf('p0', 'trader'), PERSONAS.trader, draftOf(12), []);
    expect(rookie.corners).toBe(false);
    expect(trader.corners).toBe(true);
    expect(rookie.text).toMatch(/never aims for a monopoly/);
    expect(trader.text).toMatch(/may corner a good: Strategy\.kind 'monopolist'/);
    for (const b of [rookie, trader]) expect(b.text).not.toContain('monopolyTarget');
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

  it('T-AC-A10: the edits the rules clamped or refused and the ones the writer refused last time are in the next brief, by path and why, each kind only when there is one', () => {
    const text = brief(OUTCOME, {
      rejected: [{ path: '/landGrant/claims', to: 9, why: 'at most 2' }],
      refused: [{ path: '/landGrant/ranked', cause: 'plan_not_offered' }],
    });
    expect(text).toContain('Last time: the rules clamped or refused /landGrant/claims (at most 2); your reply was refused at /landGrant/ranked (plan_not_offered).');
    // One kind alone names only that kind: never a 'none'.
    const rulesOnly = brief(OUTCOME, { rejected: [{ path: '/landGrant/claims', to: 9, why: 'at most 2' }], refused: [] });
    expect(rulesOnly).toContain('Last time: the rules clamped or refused /landGrant/claims (at most 2).');
    const replyOnly = brief(OUTCOME, { rejected: [], refused: [{ path: null, cause: 'not_json' }] });
    expect(replyOnly).toContain('Last time: your reply was refused at the reply (not_json).');
    for (const t of [rulesOnly, replyOnly]) expect(t.split('\n').find((l) => l.startsWith('Last time:'))).not.toMatch(/\bnone\b/);
    expect(brief(OUTCOME, { rejected: [], refused: [] })).not.toContain('Last time:');
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

describe("C1 (PM ruling, 5 Nov, option C): the month's land brief also carries the draft development and offers its paths", () => {
  const DEV: DevelopmentPlay = { route: [{ act: 'buyMule' }, { act: 'outfit', outfit: 'energy' }, { act: 'install', plot: 12 }], timeBudgetMs: 25_000, ifSoldOut: 'analyse' };

  it('C1: with a development draft the land brief shows it after the land grant and offers the land paths, then the development paths', () => {
    const brief = landBrief(table(), mindOf('p0'), PERSONAS.trader, draftOf(12), TALK, {}, DEV);
    expect(brief.text).toContain('Your draft development:');
    expect(brief.text).toContain(`Route: buy a MULE, outfit it for ${GOOD_NAME.energy}, install it on plot 12.`);
    expect(brief.text).toContain('Time budget: 25 s of your development time.');
    expect(brief.text).toContain('- /development/route:');
    expect(brief.text.indexOf('Your draft land grant:')).toBeLessThan(brief.text.indexOf('Your draft development:'));
    expect(brief.text.indexOf('Your draft development:')).toBeLessThan(brief.text.indexOf('What you may change:'));
    expect(brief.offers.map((o) => o.path)).toEqual(['/landGrant/ranked', '/development/route', '/development/timeBudgetMs', '/development/ifSoldOut']);
    expect(brief.strategyOffered).toBe(true);
  });

  it('C1: without one the land brief is as before: no development section, the land paths only', () => {
    const brief = landBrief(table(), mindOf('p0'), PERSONAS.trader, draftOf(12), TALK);
    expect(brief.text).not.toContain('Your draft development:');
    expect(brief.text).not.toContain('/development/');
    expect(brief.offers.map((o) => o.path)).toEqual(['/landGrant/ranked']);
  });
});

/**
 * The ten playbook fields play never reads (WS9 ruling, 6 Nov, via the PM), as Claude would meet them: a path's last
 * key, a field name, or a draft line's label. None may reach a brief, its offers or its reply schema.
 */
const UNREAD = /\b(claims|deny|planB|pair|landTarget|stances|buyOutStore|forShip|cashFloor|pressShare|monopolyTarget)\b|Press share|Plan B|Claims:|Deny:|Pair:/;

describe('B fix 5: Claude is offered and shown only the settings play reads (WS9 ruling, 6 Nov)', () => {
  const DEV: DevelopmentPlay = { route: [{ act: 'buyMule' }, { act: 'install', plot: 12 }], timeBudgetMs: 25_000, ifSoldOut: 'pub' };
  // A draft whose unread fields all carry something, so a line that still showed one would show it.
  const full = (): LandDraft => ({
    strategy: { ...STRATEGY, monopolyTarget: 'smithore', cashFloor: 345, stances: { p1: 'rival' } },
    landGrant: { ...draftOf(12).landGrant, deny: [{ plot: 3, rival: 'p1', maxCost: 99 }], planB: [4, 5], pair: [12, 13] },
  });

  it.each(['rookie', 'trader'] as const)('B fix 5: a %s land brief offers only the ranking and the development, and its text and reply schema name none of the ten fields', (level) => {
    const brief = landBrief(table(), mindOf('p0', level), PERSONAS.trader, full(), TALK, {}, DEV);
    expect(brief.offers.map((o) => o.path)).toEqual(['/landGrant/ranked', '/development/route', '/development/timeBudgetMs', '/development/ifSoldOut']);
    expect(brief.text).not.toMatch(UNREAD);
    expect(brief.text).not.toContain('345');
    const schema = replySchema(brief.corners, brief.offers, brief.strategyOffered);
    expect(Object.keys(schema.properties.strategy!.properties)).toEqual(['kind', 'moneyMaker', 'reason']);
    expect(JSON.stringify(schema)).not.toMatch(UNREAD);
  });

  it('B fix 5: the development and auction briefs show the strategy without the unread fields', () => {
    const state = table();
    const { strategy } = full();
    const base = { v: 1 as const, seat: 'p0', month: 1, strategy, by: 'engine' as const };
    const dev = phaseBrief(state, mindOf('p0'), PERSONAS.trader, { ...base, phase: 'development', development: DEV }, 'development', TALK);
    const food = { role: 'seller' as const, hold: 4, walkAway: 20, start: 40, concedeCrPerS: 2, bluff: false, vsRival: 'hold' as const };
    const auction = phaseBrief(state, mindOf('p0'), PERSONAS.trader, { ...base, phase: 'auction', auction: { food } }, 'auction', TALK);
    for (const b of [dev, auction]) {
      expect(b.text).toContain(`Your strategy: builder, moneyMaker ${GOOD_NAME.food}.`);
      expect(b.text).not.toMatch(UNREAD);
    }
  });
});


describe('T-AC-B5 (prompt): the social section (spec B C1)', () => {
  it('T-AC-B5 (prompt): the social section carries each other player\'s public position, relationship facts, the AI\'s last recorded standing and aims, the politics and the heard lines addressed to it or the table, in a fixed order, capped; never a rival\'s goods or a whisper between two others', () => {
    const state = createGame({ seed: 7, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: true })), politics: true });
    Object.assign(state, { tiles: table().tiles, players: table().players.map((p, i) => ({ ...p, reputation: state.players[i]!.reputation })) });
    state.politics!.candidates.governor = ['p1', 'p2'];
    state.politics!.promises.p1 = { kind: 'cap', percent: 9 };
    const talk: TableTalk[] = [
      { from: 'Seat 1', text: 'Food for votes?', to: 'me' },
      { from: 'Seat 2', text: 'The Governor has done nothing.' },
    ];
    const reads: SocialInput['reads'] = { p1: { month: 2, stance: 'ally', notes: ['sells me Food', 'wants my vote'] } };
    const text = socialBriefFor(state, 'p0', talk, reads);

    // Each other player, by name and id, in seat order: position, what the seat knows, and its own last read.
    const players = text.slice(text.indexOf('The other players:'), text.indexOf('Politics:'));
    expect(players.indexOf('Seat 1 (id p1)')).toBeLessThan(players.indexOf('Seat 2 (id p2)'));
    expect(players.indexOf('Seat 2 (id p2)')).toBeLessThan(players.indexOf('Seat 3 (id p3)'));
    expect(players).not.toContain('Seat 0 (id p0)');
    expect(players).toMatch(/Seat 1 \(id p1\): 2 plots, worth \d+\. Reputation \d+\./);
    expect(players).toContain(`What you know of Seat 1: sold you 2 ${GOOD_NAME.food} at 31 in month 1; runs for Governor and promises to cap the sales tax at 9%.`);
    expect(players).toContain('What you know of Seat 2: bought plot 7 for 160 from you in month 2; runs for Governor and no tax promise.');
    expect(players).toContain('What you know of Seat 3: nothing between you yet.');
    expect(players).toContain('Your read of Seat 1 (month 2): stance ally; "sells me Food"; "wants my vote".');
    expect(players).toContain('Your read of Seat 2: none recorded yet.');
    // The politics, and the heard lines: a whisper to the seat marked as one, a table line as it was said.
    expect(text).toContain('Candidates for Governor: Seat 1 (promises to cap the sales tax at 9%), Seat 2 (no tax promise).');
    expect(text).toContain('<table_talk>\nSeat 1 (whispered to you): "Food for votes?"\nSeat 2: "The Governor has done nothing."\n</table_talk>');
    // No rival's goods, nothing p0 has not analysed.
    for (const [other, count] of Object.entries(OWN)) if (other !== 'p0') expect(text).not.toContain(String(count));
    const hidden = structuredClone(state);
    hidden.tiles.forEach((t, i) => {
      if (t.terrain === 'store' || hidden.players[0]!.analysed.includes(i)) return;
      for (const g of Object.keys(t.ground) as (keyof typeof t.ground)[]) t.ground[g] = 4;
    });
    expect(socialBriefFor(hidden, 'p0', talk, reads)).toBe(text);
    // The heard lines are only what the seat was handed: what it heard, to it or the table (a whisper between two
    // others is never handed to it, B-AC-B5); the section adds no line of its own.
    expect(text.match(/^Seat \d.*: ".*"$/gm)).toHaveLength(talk.length);
  });

  it('T-AC-B5 (prompt): each part stays within its BRAIN.social cap', () => {
    const state = table();
    const many: PhaseFact[] = Array.from({ length: BRAIN.social.factsPerPlayer + 2 }, (_, i) => ({ month: 1, phase: 'auction', kind: 'trade', good: 'food', buyer: 'p0', seller: 'p1', price: 20 + i, qty: 1 }));
    const talk = Array.from({ length: BRAIN.social.heardLines + 3 }, (_, i) => ({ from: 'Seat 1', text: `line ${i}` }));
    const reads = { p1: { month: 1, stance: 'rival' as const, notes: Array.from({ length: BRAIN.social.readsPerPlayer + 2 }, (_, i) => `note ${i}`) } };
    const { text } = landBrief(state, mindOf('p0'), PERSONAS.trader, draftOf(12), talk, {}, null, null, false, { memory: relationMemory(state, 'p0', many, new Map()), reads });
    const known = text.split('\n').find((l) => l.includes('What you know of Seat 1'))!;
    expect(known.match(/ at \d+/g)).toHaveLength(BRAIN.social.factsPerPlayer);
    expect(known).toContain('and 2 more');
    const read = text.split('\n').find((l) => l.includes('Your read of Seat 1'))!;
    expect(read.match(/"note \d+"/g)).toHaveLength(BRAIN.social.readsPerPlayer);
    expect(text.match(/"line \d+"/g)).toHaveLength(BRAIN.social.heardLines);
    expect(text).toContain(`"line ${BRAIN.social.heardLines + 2}"`);
  });

  it('T-AC-B5 (prompt): the social brief offers a stance and notes for every other player and lets the reply carry messages to them; the brief without it offers neither', () => {
    const state = table();
    const brief = landBrief(state, mindOf('p0'), PERSONAS.trader, draftOf(12), TALK, {}, null, null, false, { memory: relationMemory(state, 'p0', [], new Map()), reads: {} });
    const others = ['p1', 'p2', 'p3'];
    expect(brief.offers.map((o) => o.path)).toEqual(['/landGrant/ranked', ...others.map((p) => `/strategy/stances/${p}`), ...others.map((p) => `/rivalReads/${p}`)]);
    expect(brief.messageTo).toEqual(others);
    const plain = landBrief(state, mindOf('p0'), PERSONAS.trader, draftOf(12), TALK);
    expect(plain.offers.map((o) => o.path)).toEqual(['/landGrant/ranked']);
    expect(plain.messageTo).toBeUndefined();
  });
});
