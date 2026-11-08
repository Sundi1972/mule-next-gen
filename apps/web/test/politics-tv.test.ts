import { POLITICS, type DealCard, type TaxPromise } from '@mule/engine';
import type { BudgetView, MuleView, OverruleView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { TvDeals } from '../src/table/TvDeals';
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

describe("the TV's break banner (S3-C20)", () => {
  /** Month 8's table: Ossa is a computer seat; reputations as after the breaks below. */
  const SEATS: PlayerView[] = [
    { ...player('lena', 'Lena', 0), reputation: 40 },
    { ...player('ossa', 'Ossa', 1), isAi: true, reputation: 62 },
    { ...player('brix', 'Brix', 2), reputation: 61 },
    { ...player('kai', 'Kai', 3), reputation: 44 },
  ];
  const card = (over: Partial<DealCard> & Pick<DealCard, 'id' | 'from' | 'to' | 'terms'>): DealCard => ({ offered: 5, until: 8, status: 'broken', brokenBy: over.from, settled: 8, ...over });
  const LENA_VOTE = card({ id: 'deal-b3x8re', from: 'lena', to: 'brix', terms: { kind: 'vote', office: 'governor', candidate: 'brix' } });
  const OSSA_LAW = card({ id: 'deal-z5n1yq', from: 'ossa', to: 'kai', terms: { kind: 'vote', law: true, yes: true } });
  const LENA_PACT = card({ id: 'deal-q7k2m9', from: 'lena', to: 'brix', terms: { kind: 'pact' } });

  const atMonth = (brokenDeals: DealCard[] | undefined, month = 8): MuleView => ({ ...game(politics({ ...(brokenDeals ? { brokenDeals } : {}) }), month), players: SEATS });
  const banner = (g: MuleView) => renderToStaticMarkup(createElement(TvDeals, { game: g })).replaceAll('<!-- -->', '');
  const marks = (html: string) => html.match(/data-testid="ai-mark"/g)?.length ?? 0;

  it('S3-B-AC-2: when a card in politics.brokenDeals is new, TvDeals shows a banner naming who broke a promise to whom, what was promised and the drop', () => {
    const html = banner(atMonth([LENA_VOTE]));
    expect(html).toContain('data-testid="tv-break-banner"');
    expect(textOf(html, 'tv-break-deal-b3x8re')).toContain('A promise was broken');
    expect(textOf(html, 'tv-break-deal-b3x8re-words')).toBe('Lena broke a promise to Brix: a vote for Brix');
    // The breaker's name now, and what it was before the break: the move POLITICS gives a broken vote card.
    expect(textOf(html, 'tv-break-deal-b3x8re-drop')).toMatch(new RegExp(`^${40 - POLITICS.reputation.moves.voteBroken}→40`));
    expect(marks(html), 'Lena is a person: no AI mark').toBe(0);
  });

  it("S3-B-AC-2: the drop is the view's reputation and POLITICS' move, never a typed number: a pact's, and a retuned move", () => {
    expect(textOf(banner(atMonth([LENA_PACT])), 'tv-break-deal-q7k2m9-drop')).toMatch(new RegExp(`^${40 - POLITICS.reputation.moves.pactBroken}→40`));
    expect(textOf(banner(atMonth([LENA_PACT])), 'tv-break-deal-q7k2m9')).toContain('A pact was broken');
    expect(textOf(banner(atMonth([LENA_PACT])), 'tv-break-deal-q7k2m9-words')).toBe('Lena broke a pact with Brix');
    const moves = POLITICS.reputation.moves as { voteBroken: number };
    const was = moves.voteBroken;
    try {
      moves.voteBroken = -7;
      expect(textOf(banner(atMonth([LENA_VOTE])), 'tv-break-deal-b3x8re-drop')).toMatch(/^47→40/);
    } finally {
      moves.voteBroken = was;
    }
  });

  it('S3-B-AC-2: a computer seat that breaks a promise is named "Ossa · AI" on the banner, from players[].isAi; a person\'s name has no mark', () => {
    const html = banner(atMonth([OSSA_LAW, LENA_VOTE]));
    expect(textOf(html, 'tv-break-deal-z5n1yq-words')).toBe('Ossa · AI broke a promise to Kai: a yes on the law');
    expect(textOf(html, 'tv-break-deal-b3x8re-words')).toBe('Lena broke a promise to Brix: a vote for Brix');
    // The mark follows the seat, not the name: a person and a computer seat may share one.
    const twins = { ...atMonth([LENA_VOTE]), players: SEATS.map((p) => (p.id === 'lena' || p.id === 'brix' ? { ...p, name: 'Sam', isAi: p.id === 'brix' } : p)) };
    expect(textOf(banner(twins), 'tv-break-deal-b3x8re-words')).toBe('Sam broke a promise to Sam · AI: a vote for Sam · AI');
  });

  it.each<[string, MuleView]>([
    ['a kept card: brokenDeals holds none', atMonth([])],
    ['a card broken in an earlier month', atMonth([{ ...LENA_VOTE, settled: 6 }])],
    ['an older server with no brokenDeals', atMonth(undefined)],
    ['a game without politics', { ...game(null, 8), players: SEATS }],
  ])('S3-B-AC-2: no new broken card, no banner (%s)', (_, g) => {
    expect(banner(g)).toBe('');
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

describe('S5-B-AC-1 (component): the budget line on the TV', () => {
  const moved = () => withPolitics({ budget: budgetOf([80, 60, 10, 0]) });

  it('S5-B-AC-1 (component): the shares in order, Welfare naming who it goes to, and what is kept', () => {
    const html = drawn(moved(), TvBudgetLine);
    expect(textOf(html, 'tv-budget-projects')).toContain('Projects');
    expect(textOf(html, 'tv-budget-projects')).toContain('80%');
    expect(textOf(html, 'tv-budget-welfare')).toMatch(/Welfare.*10%.*→.*Kai/);
    expect(textOf(html, 'tv-budget-kept')).toContain('10%');
    expect(html.indexOf('tv-budget-projects')).toBeLessThan(html.indexOf('tv-budget-welfare'));
    expect(html.indexOf('tv-budget-welfare')).toBeLessThan(html.indexOf('tv-budget-kept'));
  });

  it('S5-B-AC-1 (component): a moved share carries ▲ or ▼ and says what it was; there is no "(was N%)" on the TV', () => {
    const html = drawn(moved(), TvBudgetLine);
    expect(textOf(html, 'tv-budget-move-projects')).toBe('▲');
    expect(tagOf(html, 'tv-budget-move-projects')).toContain('aria-label="up from 60%"');
    expect(textOf(html, 'tv-budget-move-welfare')).toBe('▲');
    expect(textOf(html, 'tv-budget-move-kept')).toBe('▼');
    expect(tagOf(html, 'tv-budget-move-kept')).toContain('aria-label="down from 40%"');
    expect(html).not.toMatch(/was \d/);
  });

  it('S5-B-AC-1 (component): Welfare at 0% names nobody', () => {
    const html = drawn(withPolitics({ budget: budgetOf([60, 60, 0, 0]) }), TvBudgetLine);
    expect(textOf(html, 'tv-budget-welfare')).toContain('0%');
    expect(textOf(html, 'tv-budget-welfare')).not.toContain('Kai');
    expect(textOf(html, 'tv-budget-welfare')).not.toContain('→');
  });

  it('S5-B-AC-1 (component): a share that did not move has no arrow', () => {
    const html = drawn(withPolitics({ budget: budgetOf([60, 60, 10, 10]) }), TvBudgetLine);
    expect(tagOf(html, 'tv-budget-move-projects')).toBeUndefined();
    expect(tagOf(html, 'tv-budget-move-welfare')).toBeUndefined();
    expect(tagOf(html, 'tv-budget-move-kept')).toBeUndefined();
  });

  it('S5-B-AC-1 (component): a line the colony does not offer yet (Security) is not drawn', () => {
    const b = budgetOf([80, 60, 10, 0]);
    b.lines.push({ line: 'security', share: 0, start: 0, maxShare: 30, step: 5, credits: 0, maxCredits: 300 });
    expect(tagOf(drawn(withPolitics({ budget: b }), TvBudgetLine), 'tv-budget-security')).toBeUndefined();
  });

  it('S5-B-AC-1 (component): nothing is drawn without a budget', () => {
    expect(drawn(withPolitics({}), TvBudgetLine)).toBe('');
    expect(drawn(game(null, 4), TvBudgetLine)).toBe('');
  });
});

describe('S5-B-AC-3 (component): the overrule call on the TV', () => {
  it('S5-B-AC-3 (component): while a call stands in planning it names the caller, start to now and what it needs', () => {
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
  ])('S5-B-AC-3 (component): nothing is drawn when %s', (_, g) => {
    expect(drawn(g, TvOverruleCall)).toBe('');
  });
});

describe('S5-B-AC-3 (component): the overrule ballot on the TV', () => {
  const ballot = (extra: Partial<OverruleView> = {}) => withPolitics({ tax: { percent: 9, start: 5, low: 0, high: 10 }, overrule: overruleOf({ stage: 'ballot', ...extra }) });

  it('S5-B-AC-3 (component): the question, start against now, and what it needs', () => {
    const html = drawn(ballot(), TvOverrule);
    expect(tagOf(html, 'tv-overrule-ballot')).toBeDefined();
    expect(textOf(html, 'tv-overrule-question-words')).toBe('Undo the Governor’s tax?');
    expect(textOf(html, 'tv-overrule-start-now')).toContain('5%');
    expect(textOf(html, 'tv-overrule-start-now')).toContain('9%');
    expect(textOf(html, 'tv-overrule-needed')).toBe('It needs 2 of 3 votes');
  });

  it('S5-B-AC-3 (component): it shows who has cast and how many, and never how: a registered vote that is not Done does not count', () => {
    const html = drawn(ballot({ voted: ['s1', 's2'], done: ['s2'] }), TvOverrule);
    expect(textOf(html, 'tv-overrule-cast-count')).toBe('Voted 1 of 3');
    expect(textOf(html, 'tv-overrule-cast-s2')).toContain('VOTED ✓');
    expect(textOf(html, 'tv-overrule-cast-s1')).toContain('VOTING');
    expect(textOf(html, 'tv-overrule-cast-s3')).toContain('VOTING');
    expect(tagOf(html, 'tv-overrule-yes')).toBeUndefined();
  });

  it('S5-B-AC-3 (component): the budget line sits at the foot of the ballot', () => {
    const g = withPolitics({ tax: { percent: 9, start: 5, low: 0, high: 10 }, overrule: overruleOf({ stage: 'ballot' }), budget: budgetOf([60, 60, 10, 10]) });
    expect(tagOf(drawn(g, TvOverrule), 'tv-budget-line')).toBeDefined();
  });

  it('S5-B-AC-3 (component): a ballot stage with a result already in is still the ballot, not the stamp', () => {
    const html = drawn(ballot({ result: { passed: true, yes: 2, no: 1 } }), TvOverrule);
    expect(tagOf(html, 'tv-overrule-ballot')).toBeDefined();
    expect(tagOf(html, 'tv-overrule-stamp')).toBeUndefined();
    expect(tagOf(html, 'tv-overrule-reveal')).toBeUndefined();
  });

  it.each([
    ['no overrule', withPolitics({})],
    ['a call that has not opened its ballot', withPolitics({ overrule: overruleOf() })],
    ['a finished vote', withPolitics({ overrule: overruleOf({ stage: 'over' as OverruleView['stage'] }) })],
  ])('S5-B-AC-3 (component): nothing is drawn for %s', (_, g) => {
    expect(drawn(g, TvOverrule)).toBe('');
  });
});

describe('S5-B-AC-3 (component): the overrule reveal on the TV', () => {
  const reveal = (passed: boolean, yes: number, no: number) =>
    withPolitics({ tax: { percent: 9, start: 5, low: 0, high: 10 }, overrule: overruleOf({ stage: 'reveal', result: { passed, yes, no } }) });

  it.each([
    [true, 2, 1, 'Overruled', 'Yes 2 · needed 2: Overruled, the tax goes back to 5%'],
    [false, 1, 2, 'It stands', 'Yes 1 · needed 2: The Governor’s tax stands at 9%'],
  ])('S5-B-AC-3 (component): passed %s shows the totals and the verdict', (passed, yes, no, stamp, line) => {
    const html = drawn(reveal(passed, yes, no), TvOverrule);
    expect(tagOf(html, 'tv-overrule-reveal')).toBeDefined();
    expect(textOf(html, 'tv-overrule-stamp')).toBe(stamp);
    expect(textOf(html, 'tv-overrule-verdict')).toBe(line);
    expect(textOf(html, 'tv-overrule-yes')).toBe(String(yes));
    expect(textOf(html, 'tv-overrule-no')).toBe(String(no));
    expect(textOf(html, 'tv-overrule-bar-needed-label')).toBe('↑ needed 2 of 3');
    // The mark stands at needed of all the table's votes (S5-RULE-8), not at half.
    expect(tagOf(html, 'tv-overrule-bar-needed')).toContain(`left:${(2 / 3) * 100}%`);
    expect(tagOf(html, 'tv-overrule-bar-reveal')).toContain(`data-passed="${passed}"`);
    expect(tagOf(html, 'tv-overrule-cast')).toBeUndefined();
  });
});
