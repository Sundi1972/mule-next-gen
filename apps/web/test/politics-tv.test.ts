import type { TaxPromise } from '@mule/engine';
import type { BudgetView, MuleView, OverruleView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { TvBudgetLine, TvOverruleCall } from '../src/table/TvBudgetLine';
import { TvOverrule } from '../src/table/TvOverrule';

const player = (id: string, name: string, slot: number): PlayerView => ({ id, name, isAi: false, color: '', species: 'zipwing', money: 1000, worth: 0, lastWorth: null, worthBeforeCut: null, plots: 0, ready: false, doneDeveloping: false, condition: null, colonist: null, slot });
const PLAYERS = [player('s1', 'Lena', 0), player('s2', 'Ossa', 1), player('s3', 'Kai', 2)];

const politics = (extra: Partial<PoliticsView>): PoliticsView => ({
  governor: null,
  sheriff: null,
  term: null,
  next: 7,
  baron: null,
  tax: { percent: 5, start: 5, low: 0, high: 10 },
  fund: 0,
  pay: { governor: 50 },
  weights: [],
  candidates: { governor: [] },
  promises: {},
  promise: null,
  promiseFrom: null,
  election: null,
  ...extra,
});

const game = (p: PoliticsView | null, month: number): MuleView => ({
  finished: false,
  month,
  maxMonths: 12,
  phase: 'planning',
  phaseEndsAt: null,
  width: 1,
  height: 1,
  tiles: [],
  lit: null,
  players: PLAYERS,
  me: null,
  market: [],
  storeMules: 0,
  mulePrice: 0,
  colonists: 0,
  air: { level: 22, band: 'clean' },
  lastAir: null,
  colonistsFed: null,
  ship: { arrives: 3, inPort: false, wants: null },
  treasury: { money: 0, salesTax: (p?.tax.percent ?? 5) / 100 },
  news: [],
  scores: null,
  auction: null,
  listings: [],
  lotSlots: { used: 0, max: 4 },
  landAuction: null,
  production: null,
  politics: p,
});

let state: { status: 'open'; role: 'board'; code: string; seatId: null; view: TableView<MuleView>; notice: null; chat: []; emotes: []; toasts: []; clockOffset: number };

// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

/** The TV's screen in planning for this game. */
function onTv(g: MuleView): string {
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: false, connected: true, color: p.slot })), boards: 1, game: g };
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, watch: () => {} } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TableApp, { room: 'MULE' }) })).replaceAll('<!-- -->', '');
}

const tagOf = (html: string, testid: string) => html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>`))?.[0];

/** The text inside the element carrying this data-testid, tags stripped, up to its own closing tag. */
function textOf(html: string, testid: string): string {
  const open = tagOf(html, testid);
  expect(open, `an element with data-testid="${testid}"`).toBeDefined();
  const tag = /^<([a-z][a-z0-9]*)/.exec(open!)![1]!;
  const from = html.indexOf(open!) + open!.length;
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  tags.lastIndex = from;
  let depth = 1;
  let end = from;
  for (let m = tags.exec(html); m && depth > 0; m = tags.exec(html)) {
    depth += m[1] ? -1 : 1;
    end = m.index;
  }
  return html.slice(from, end).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

const CAP_4: TaxPromise = { kind: 'cap', percent: 4 };
const HOLD: TaxPromise = { kind: 'hold' };
const LOWER: TaxPromise = { kind: 'lower' };

/** Month `month`, Ossa Governor since month 4 on `promise` from a tax of `from`, the tax at `percent` from this month's `start`. */
const governed = (promise: TaxPromise | null, percent: number, start: number, month = 5, from: number | null = 5) =>
  game(politics({ governor: 's2', term: [4, 6], promise, promiseFrom: from, tax: { percent, start, low: 0, high: 10 } }), month);

describe("the TV's planning header (T-AC-70, E-7)", () => {
  it.each<[string, MuleView, string, string]>([
    ['kept', governed(CAP_4, 4, 4), 'Governor Ossa · promised up to 4% · tax 4%, kept', 'text-ok'],
    ['broken', governed(CAP_4, 6, 6), 'Governor Ossa · promised up to 4% · tax 6%, promise broken', 'text-alert'],
    ['lower, kept against the tax when the term began', governed(LOWER, 4, 4), 'Governor Ossa · promised lower it · tax 4%, kept', 'text-ok'],
    ['hold, broken against the tax when the term began', governed(HOLD, 7, 7), 'Governor Ossa · promised keep it at 5% · tax 7%, promise broken', 'text-alert'],
    ['the new Governor has yet to set it', governed(CAP_4, 5, 5, 4, 5), 'Governor Ossa · promised up to 4% · tax still 5%', 'text-warn'],
  ])("T-AC-70: the TV's planning header says whether the Governor keeps their promise (%s)", (_, g, line, tone) => {
    const html = onTv(g);
    const header = html.indexOf('data-testid="tv-phase"');
    const promise = html.indexOf('data-testid="tv-governor-promise"');
    expect(header, 'the planning header').toBeGreaterThanOrEqual(0);
    expect(promise, 'the promise line under the header').toBeGreaterThan(header);
    expect(promise, 'the promise line before the map').toBeLessThan(html.indexOf('data-testid="holo-map"'));
    expect(textOf(html, 'tv-governor-promise')).toBe(line);
    expect(tagOf(html, 'tv-promise-status')).toContain(tone);
  });

  it("T-AC-70: with nobody Governor the TV's planning header has no promise line", () => {
    const html = onTv(game(politics({}), 2));
    expect(html).toContain('data-testid="tv-phase"');
    expect(tagOf(html, 'tv-governor-promise')).toBeUndefined();
  });

  it('T-AC-70: an appointed Governor made no promise: the TV names them, with nothing to keep', () => {
    const html = onTv(governed(null, 5, 5));
    expect(textOf(html, 'tv-governor-promise')).toBe('Governor Ossa');
    expect(tagOf(html, 'tv-promise-status')).toBeUndefined();
  });

  it('T-AC-70: a game without politics has no promise line', () => {
    expect(tagOf(onTv(game(null, 2)), 'tv-governor-promise')).toBeUndefined();
  });
});

/* Slice 5's TV parts (S5-C11): the budget line, the call, and the overrule ballot and reveal, each drawn from the view alone. */

const budgetOf = (lines: [number, number, number, number], extra: Partial<BudgetView> = {}): BudgetView => ({
  lines: [
    { line: 'projects', share: lines[0], start: lines[1], maxShare: 100, step: 5, credits: 0, maxCredits: null },
    { line: 'welfare', share: lines[2], start: lines[3], maxShare: 20, step: 5, credits: 0, maxCredits: 200 },
  ],
  kept: 100 - lines[0] - lines[2],
  welfareTo: 's3',
  setBy: 's2',
  frozen: false,
  ...extra,
});

const overruleOf = (extra: Partial<OverruleView> = {}): OverruleView => ({
  target: 'tax',
  caller: 's2',
  stage: 'called',
  restores: { tax: 5 },
  stands: { tax: 9 },
  voted: [],
  done: [],
  waitingFor: [],
  clockMs: 4000,
  revealMs: 4000,
  total: 3,
  needed: 2,
  result: null,
  ...extra,
});

const withPolitics = (extra: Partial<PoliticsView>, phase: MuleView['phase'] = 'planning'): MuleView => ({ ...game(politics({ governor: 's2', ...extra }), 4), phase });

/** A TV component drawn alone, in the room the TV reads. */
function drawn(g: MuleView, Part: (props: { game: MuleView }) => unknown): string {
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: false, connected: true, color: p.slot })), boards: 1, game: g };
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, watch: () => {} } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(Part as never, { game: g }) })).replaceAll('<!-- -->', '');
}

describe('S5-C11: the budget line on the TV', () => {
  const moved = () => withPolitics({ budget: budgetOf([80, 60, 10, 0]) });

  it('S5-C11: the shares in order, Welfare naming who it goes to, and what is kept', () => {
    const html = drawn(moved(), TvBudgetLine);
    expect(textOf(html, 'tv-budget-projects')).toContain('Projects');
    expect(textOf(html, 'tv-budget-projects')).toContain('80%');
    expect(textOf(html, 'tv-budget-welfare')).toMatch(/Welfare.*10%.*→.*Kai/);
    expect(textOf(html, 'tv-budget-kept')).toContain('10%');
    expect(html.indexOf('tv-budget-projects')).toBeLessThan(html.indexOf('tv-budget-welfare'));
    expect(html.indexOf('tv-budget-welfare')).toBeLessThan(html.indexOf('tv-budget-kept'));
  });

  it('S5-C11: a moved share carries ▲ or ▼ and says what it was; there is no "(was N%)" on the TV', () => {
    const html = drawn(moved(), TvBudgetLine);
    expect(textOf(html, 'tv-budget-move-projects')).toBe('▲');
    expect(tagOf(html, 'tv-budget-move-projects')).toContain('aria-label="up from 60%"');
    expect(textOf(html, 'tv-budget-move-welfare')).toBe('▲');
    expect(textOf(html, 'tv-budget-move-kept')).toBe('▼');
    expect(tagOf(html, 'tv-budget-move-kept')).toContain('aria-label="down from 40%"');
    expect(html).not.toMatch(/was \d/);
  });

  it('S5-C11: a share that did not move has no arrow', () => {
    const html = drawn(withPolitics({ budget: budgetOf([60, 60, 10, 10]) }), TvBudgetLine);
    expect(tagOf(html, 'tv-budget-move-projects')).toBeUndefined();
    expect(tagOf(html, 'tv-budget-move-welfare')).toBeUndefined();
    expect(tagOf(html, 'tv-budget-move-kept')).toBeUndefined();
  });

  it('S5-C11: a line the colony does not offer yet (Security) is not drawn', () => {
    const b = budgetOf([80, 60, 10, 0]);
    b.lines.push({ line: 'security', share: 0, start: 0, maxShare: 30, step: 5, credits: 0, maxCredits: 300 });
    expect(tagOf(drawn(withPolitics({ budget: b }), TvBudgetLine), 'tv-budget-security')).toBeUndefined();
  });

  it('S5-C11: nothing is drawn without a budget', () => {
    expect(drawn(withPolitics({}), TvBudgetLine)).toBe('');
    expect(drawn(game(null, 4), TvBudgetLine)).toBe('');
  });
});

describe('S5-C11: the overrule call on the TV', () => {
  it('S5-C11: while a call stands in planning it names the caller, start to now and what it needs', () => {
    const html = drawn(withPolitics({ overrule: overruleOf() }), TvOverruleCall);
    expect(textOf(html, 'tv-overrule-call-words')).toContain('Ossa calls an overrule vote on the Governor’s tax');
    expect(textOf(html, 'tv-overrule-call-tax')).toBe('5% → 9%');
    expect(textOf(html, 'tv-overrule-call-when')).toContain('needs 2 of 3 votes');
  });

  it.each([
    ['no overrule', withPolitics({})],
    ['the ballot is open', withPolitics({ overrule: overruleOf({ stage: 'ballot' }) })],
    ['the result is shown', withPolitics({ overrule: overruleOf({ stage: 'reveal', result: { passed: true, yes: 2, no: 1 } }) })],
    ['it is not planning', withPolitics({ overrule: overruleOf() }, 'development')],
  ])('S5-C11: nothing is drawn when %s', (_, g) => {
    expect(drawn(g, TvOverruleCall)).toBe('');
  });
});

describe('S5-C11: the overrule ballot on the TV', () => {
  const ballot = (extra: Partial<OverruleView> = {}) => withPolitics({ tax: { percent: 9, start: 5, low: 0, high: 10 }, overrule: overruleOf({ stage: 'ballot', ...extra }) });

  it('S5-C11: the question, start against now, and what it needs', () => {
    const html = drawn(ballot(), TvOverrule);
    expect(tagOf(html, 'tv-overrule-ballot')).toBeDefined();
    expect(textOf(html, 'tv-overrule-question-words')).toBe('Undo the Governor’s tax?');
    expect(textOf(html, 'tv-overrule-start-now')).toContain('5%');
    expect(textOf(html, 'tv-overrule-start-now')).toContain('9%');
    expect(textOf(html, 'tv-overrule-needed')).toBe('It needs 2 of 3 votes');
  });

  it('S5-C11: it shows who has cast and how many, and never how: a registered vote that is not Done does not count', () => {
    const html = drawn(ballot({ voted: ['s1', 's2'], done: ['s2'] }), TvOverrule);
    expect(textOf(html, 'tv-overrule-cast-count')).toBe('Voted 1 of 3');
    expect(textOf(html, 'tv-overrule-cast-s2')).toContain('VOTED ✓');
    expect(textOf(html, 'tv-overrule-cast-s1')).toContain('VOTING');
    expect(textOf(html, 'tv-overrule-cast-s3')).toContain('VOTING');
    expect(html).not.toMatch(/Yes\b.*\d.*No\b.*\d.*tv-overrule-cast/s);
    expect(tagOf(html, 'tv-overrule-yes')).toBeUndefined();
  });

  it('S5-C11: the budget line sits at the foot of the ballot', () => {
    const g = withPolitics({ tax: { percent: 9, start: 5, low: 0, high: 10 }, overrule: overruleOf({ stage: 'ballot' }), budget: budgetOf([60, 60, 10, 10]) });
    expect(tagOf(drawn(g, TvOverrule), 'tv-budget-line')).toBeDefined();
  });

  it.each([
    ['no overrule', withPolitics({})],
    ['a call that has not opened its ballot', withPolitics({ overrule: overruleOf() })],
    ['a finished vote', withPolitics({ overrule: overruleOf({ stage: 'over' as OverruleView['stage'] }) })],
  ])('S5-C11: nothing is drawn for %s', (_, g) => {
    expect(drawn(g, TvOverrule)).toBe('');
  });
});

describe('S5-C11: the overrule reveal on the TV', () => {
  const reveal = (passed: boolean, yes: number, no: number) =>
    withPolitics({ tax: { percent: 9, start: 5, low: 0, high: 10 }, overrule: overruleOf({ stage: 'reveal', result: { passed, yes, no } }) });

  it.each([
    [true, 2, 1, 'Overruled', 'Yes 2 · needed 2: Overruled, the tax goes back to 5%'],
    [false, 1, 2, 'It stands', 'Yes 1 · needed 2: The Governor’s tax stands at 9%'],
  ])('S5-C11: passed %s shows the totals and the verdict', (passed, yes, no, stamp, line) => {
    const html = drawn(reveal(passed, yes, no), TvOverrule);
    expect(tagOf(html, 'tv-overrule-reveal')).toBeDefined();
    expect(textOf(html, 'tv-overrule-stamp')).toBe(stamp);
    expect(textOf(html, 'tv-overrule-verdict')).toBe(line);
    expect(textOf(html, 'tv-overrule-yes')).toBe(String(yes));
    expect(textOf(html, 'tv-overrule-no')).toBe(String(no));
    expect(textOf(html, 'tv-overrule-bar-needed-label')).toBe('↑ needed 2 of 3');
    expect(tagOf(html, 'tv-overrule-bar-reveal')).toContain(`data-passed="${passed}"`);
    expect(tagOf(html, 'tv-overrule-cast')).toBeUndefined();
  });
});
