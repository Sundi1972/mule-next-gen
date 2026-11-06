/**
 * B fix 4 (a): a route step may install on "granted", the plot the seat gains this month. The land write that carries
 * the development's edits is asked at upkeep, before the land grant, so it cannot name that plot by its index.
 */
import { describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, createGame, type GameState } from '@mule/engine';
import { PERSONAS } from '../src/personas.js';
import type { Mind } from '../src/value.js';
import { DEVELOPMENT_OFFERS, landBrief } from '../src/llm/brief.js';
import { newPlots, resolveGranted } from '../src/llm/granted.js';
import { writeReply } from '../src/llm/writer.js';

function table(): { state: GameState; free: number[] } {
  const state = createGame({ seed: 7, players: [0, 1].map((i) => ({ id: `p${i}`, name: `Seat ${i}`, isAi: true })) });
  const free = state.tiles.map((t, i) => (t.terrain === 'store' ? -1 : i)).filter((i) => i >= 0);
  return { state, free };
}

const ROUTE = 'B fix 4 (a): route';
const mind: Mind = { me: 'p0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader, salt: 3 };
const route = (install: number | 'granted', before: object[] = [{ act: 'analyse', plot: 3 }]) => [
  ...before,
  { act: 'buyMule' },
  { act: 'outfit', outfit: 'food' },
  { act: 'install', plot: install },
  { act: 'pub' },
];
const edit = (to: unknown) => ({ path: '/development/route', to, reason: ROUTE });

describe('B fix 4 (a): the plot a route installs on as "granted"', () => {
  it('B fix 4 (a): newPlots finds the plot the seat gained since, and none of a rival\'s', () => {
    const { state, free } = table();
    state.tiles[free[0]!]!.owner = 'p0';
    const before = new Set([free[0]!]);
    state.tiles[free[4]!]!.owner = 'p0';
    state.tiles[free[6]!]!.owner = 'p1';
    expect(newPlots(state, 'p0', before, [{ plot: free[4]! }])).toEqual([free[4]!]);
    expect(newPlots(state, 'p0', new Set([free[0]!, free[4]!]), [])).toEqual([]);
  });

  it('B fix 4 (a): two new plots: the one in the land ranking first, in ranking order, then the others (a land-auction win) by index', () => {
    const { state, free } = table();
    for (const i of [free[2]!, free[5]!, free[8]!]) state.tiles[i]!.owner = 'p0';
    const ranked = [{ plot: free[9]! }, { plot: free[8]! }, { plot: free[1]! }];
    expect(newPlots(state, 'p0', new Set(), ranked)).toEqual([free[8]!, free[2]!, free[5]!]);
  });

  it('B fix 4 (a): every "granted" step takes the first new plot; nothing is dropped', () => {
    const out = resolveGranted([edit(route('granted'))], [42, 17]);
    expect(out).toEqual({ edits: [edit(route(42))], dropped: [] });
  });

  it('B fix 4 (a): with no new plot, the route is cut at the start of the group holding the first "granted" step, and why is given', () => {
    const sent = route('granted');
    const out = resolveGranted([edit(sent)], []);
    expect(out.edits).toEqual([edit([{ act: 'analyse', plot: 3 }])]);
    expect(out.dropped).toEqual([{ path: '/development/route', to: sent, why: 'no plot was granted this month, so steps 1 on are dropped' }]);
  });

  it('B fix 4 (a): an analyse or filter step on "granted" is a group of its own: the cut starts at it', () => {
    const sent = [{ act: 'analyse', plot: 3 }, { act: 'filter', plot: 'granted' }, { act: 'analyse', plot: 'granted' }];
    const out = resolveGranted([edit(sent)], []);
    expect(out.edits).toEqual([edit([{ act: 'analyse', plot: 3 }])]);
    expect(out.dropped[0]!.why).toBe('no plot was granted this month, so steps 1 on are dropped');
  });

  it('B fix 4 (a): with no new plot and nothing of the route left, the route edit itself is removed and reported', () => {
    const sent = route('granted', []);
    const budget = { path: '/development/timeBudgetMs', to: 9_000, reason: 'Quick.' };
    const out = resolveGranted([edit(sent), budget], []);
    expect(out.edits).toEqual([budget]);
    expect(out.dropped).toEqual([{ path: '/development/route', to: sent, why: 'no plot was granted this month, so steps 0 on are dropped' }]);
  });

  it('B fix 4 (a): edits on other paths, and a route with no "granted" step, pass through unchanged', () => {
    const edits = [
      { path: '/development/timeBudgetMs', to: 9_000, reason: 'Quick.' },
      { path: '/development/ifSoldOut', to: 'pub', reason: 'Fine.' },
      edit(route(12)),
      { path: '/landGrant/ranked', to: [{ plot: 4, value: 1 }], reason: 'Plan A.' },
    ];
    expect(resolveGranted(edits, [])).toEqual({ edits, dropped: [] });
    expect(resolveGranted(edits, [42])).toEqual({ edits, dropped: [] });
  });
});

describe('B fix 4 (a): the brief and the writer take "granted"', () => {
  const routeOffer = DEVELOPMENT_OFFERS.find((o) => o.path === '/development/route')!;

  it('B fix 4 (a): a route step\'s plot may be an index, "granted" or null; the brief says what "granted" means', () => {
    const plot = (routeOffer.to as { items: { properties: { plot: unknown } } }).items.properties.plot;
    expect(plot).toEqual({ anyOf: [{ type: 'integer' }, { type: 'string', enum: ['granted'] }, { type: 'null' }] });
    const { state } = table();
    const strategy = { kind: 'builder', moneyMaker: 'food', monopolyTarget: null, cashFloor: 200, landTarget: { plots: 6, byMonth: 6 }, stances: {}, reason: 'Grow.' } as const;
    const draft = { strategy, landGrant: { ranked: [], pressShare: { start: 0.8, end: 0.4 }, deny: [], planB: [], claims: 1 } };
    const text = landBrief(state, mind, PERSONAS.trader, draft, [], {}, { route: [], timeBudgetMs: 1_000, ifSoldOut: 'pub' }).text;
    expect(text).toContain('plot may be "granted": this month\'s grant plot, else a plot won at this month\'s land auction');
  });

  it('B fix 4 (a): the writer passes "granted" through unchanged and drops the nulls', async () => {
    const brief = { text: '', plans: [], corners: true, strategy: {} as never, offers: DEVELOPMENT_OFFERS, strategyOffered: false };
    const to = [{ act: 'buyMule', plot: null, outfit: null }, { act: 'outfit', plot: null, outfit: 'food' }, { act: 'install', plot: 'granted', outfit: null }];
    const text = JSON.stringify({ edits: [{ path: '/development/route', to, reason: 'Farm it.' }], line: '' });
    const { reply } = await writeReply(async () => ({ text, stopReason: 'end_turn' }), { brief, system: 'S', waitMs: 1 });
    expect(reply.edits).toEqual([{ path: '/development/route', to: [{ act: 'buyMule' }, { act: 'outfit', outfit: 'food' }, { act: 'install', plot: 'granted' }], reason: 'Farm it.' }]);
  });
});

