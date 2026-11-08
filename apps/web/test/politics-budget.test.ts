import type { BudgetLine } from '@mule/engine';
import { COLONY, lineCredits, spareOf } from '@mule/engine';
import type { BudgetView, ColonyView, MuleView, MyView, OverruleView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { document, FakeElement } from './fake-dom';
import type { TableClient } from '../src/net/client';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * Slice 5's phone screens on the politics sub-tabs (S5-PR-6): the budget and the tax overrule, drawn from the sub-tab
 * bodies in a fake DOM. Taps call the handler React gave the element; what is sent is what the client was handed.
 */

const hub = vi.hoisted(() => ({ focus: null as string | null }));
vi.mock('../src/phone/hub/Hub', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/phone/hub/Hub')>()),
  useHub: () => ({ desk: 'council', tool: 'look', focus: hub.focus, openDesk: () => {}, pickTool: () => {}, takeFocus: () => {} }),
}));

let ClientProvider: typeof import('../src/net/react').ClientProvider;
let PhoneGameProvider: typeof import('../src/phone/game').PhoneGameProvider;
let POLITICS_TABS: typeof import('../src/phone/hub/politics/slots').POLITICS_TABS;
let OVERRULE_STAGE: typeof import('../src/phone/hub/politics/slots').OVERRULE_STAGE;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ({ ClientProvider } = await import('../src/net/react'));
  ({ PhoneGameProvider } = await import('../src/phone/game'));
  ({ POLITICS_TABS, OVERRULE_STAGE } = await import('../src/phone/hub/politics/slots'));
  (document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement }).createElementNS ??= (_ns, tag) => document.createElement(tag);
  (document.documentElement as unknown as { dataset?: object }).dataset ??= {};
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 0;
});

const PLAYERS: PlayerView[] = [aPlayer({ id: 's1', name: 'Lena', slot: 0 }), aPlayer({ id: 's2', name: 'Ossa', slot: 1 }), aPlayer({ id: 's3', name: 'Kai', slot: 2 })];
const FUND = COLONY.reserve + 1000;

type Lines = { projects: number; welfare: number };
const line = (id: BudgetLine, share: number, start: number): BudgetView['lines'][number] =>
  id === 'projects'
    ? { line: id, share, start, maxShare: 100, step: 5, credits: lineCredits(id, share, spareOf(FUND)), maxCredits: null }
    : { line: id, share, start, maxShare: 20, step: 5, credits: lineCredits(id, share, spareOf(FUND)), maxCredits: 200 };

const budgetOf = (now: Lines, start: Lines, extra: Partial<BudgetView> = {}): BudgetView => ({
  lines: [line('projects', now.projects, start.projects), line('welfare', now.welfare, start.welfare)],
  kept: 100 - now.projects - now.welfare,
  welfareTo: 's3',
  setBy: null,
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
  clockMs: 0,
  revealMs: 4000,
  total: 3,
  needed: 2,
  result: null,
  ...extra,
});

const politics = (extra: Partial<PoliticsView> = {}): PoliticsView =>
  ({
    governor: 's1',
    sheriff: null,
    term: [1, 3],
    next: 4,
    baron: null,
    tax: { percent: 5, start: 5, low: 0, high: 10 },
    fund: FUND,
    pay: { governor: 50 },
    weights: PLAYERS.map(({ id }) => ({ id, votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } })),
    candidates: { governor: [] },
    promises: {},
    promise: null,
    promiseFrom: 5,
    election: null,
    proposal: null,
    council: null,
    laws: {},
    retry: {},
    budget: budgetOf({ projects: 60, welfare: 10 }, { projects: 60, welfare: 10 }),
    overrule: null,
    ...extra,
  }) as unknown as PoliticsView;

const colony = { gauges: { wealth: 0, environment: 30, prestige: 0, happiness: 60, band: 'content' }, lastGauges: null, fund: FUND, ledger: null, projects: [], catalogue: [], score: null } as unknown as ColonyView;

const mine = (id: string, extra: Partial<NonNullable<MyView['politics']>> = {}): MyView =>
  ({ id, species: 'zipwing', stock: {}, needs: {}, monthNeeds: {}, droneOrder: [], politics: { running: null, ballot: {}, canRun: {}, paid: 0, reputation: 50, ...extra } }) as unknown as MyView;

const viewFor = (id: string, pol: PoliticsView, my: Partial<NonNullable<MyView['politics']>> = {}): MuleView => ({ ...aMuleView({ month: 4, players: PLAYERS, me: mine(id, my), politics: pol }), colony });

const sent: unknown[] = [];
const client = { subscribe: () => () => {}, getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }), serverNow: () => 0, intent: (i: unknown) => void sent.push(i) } as unknown as TableClient;

let root: Root | null = null;
let host: FakeElement;

function mount(subId: string | ComponentType, game: MuleView): void {
  const self = game.players.find((p) => p.id === game.me!.id)!;
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', boards: 1, game, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: false, connected: true, color: p.slot })) };
  const Body: ComponentType = typeof subId === 'string' ? POLITICS_TABS.find((t) => t.id === subId)!.Body : subId;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host as unknown as HTMLElement);
  act(() => root!.render(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: { table, view: game, me: game.me!, self, slot: self.slot as Slot }, children: createElement(Body) }) })));
}

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  root = null;
  sent.length = 0;
});

function find(testid: string, node: FakeElement = host): FakeElement | undefined {
  if (node.getAttribute('data-testid') === testid) return node;
  for (const child of node.childNodes) {
    const hit = child instanceof FakeElement ? find(testid, child) : undefined;
    if (hit) return hit;
  }
  return undefined;
}
function byTestid(testid: string): FakeElement {
  const found = find(testid);
  expect(found, `an element with data-testid="${testid}"`).toBeDefined();
  return found!;
}
function props(el: FakeElement): Record<string, unknown> {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  expect(key, 'a React element').toBeDefined();
  return (el as unknown as Record<string, Record<string, unknown>>)[key!]!;
}
const tap = (testid: string) => act(() => (props(byTestid(testid)).onClick as (e?: unknown) => void)({ currentTarget: byTestid(testid) }));
const text = (testid: string) => byTestid(testid).textContent.replace(/\s+/g, ' ').trim();
const isDisabled = (testid: string) => props(byTestid(testid)).disabled === true;
/** The test ids under the host, in the order they are drawn. */
function drawn(node: FakeElement = host): string[] {
  const own = node.getAttribute('data-testid');
  return [...(own ? [own] : []), ...node.childNodes.flatMap((c) => (c instanceof FakeElement ? drawn(c) : []))];
}

describe('S5-B-AC-1 (component): the Governor sets the budget on the Budget sub-tab', () => {
  const standing = { projects: 60, welfare: 10 };
  const game = () => viewFor('s1', politics({ budget: budgetOf(standing, { projects: 60, welfare: 0 }, { setBy: 's1' }) }));

  it('S5-B-AC-1: each line shows its share and its credits at today\'s fund, and what stays in the fund', () => {
    mount('budget', game());
    expect(text('budget-spare')).toContain(`${spareOf(FUND).toLocaleString('en')} cr`);
    expect(text('budget-share-projects')).toBe('60%');
    expect(text('budget-share-welfare')).toBe('10%');
    expect(text('budget-share-kept')).toBe('30%');
    expect(text('budget-pays-projects')).toContain(`up to ${lineCredits('projects', 60, spareOf(FUND))} cr`);
    expect(text('budget-pays-welfare')).toContain(`${lineCredits('welfare', 10, spareOf(FUND))} cr`);
    expect(text('budget-line-kept')).toContain('Kept in the fund');
    expect(text('budget-line-welfare')).toContain('was 0%');
  });

  it('S5-B-AC-1: the steppers move by step within maxShare, the draft shows the credits lineCredits gives, and the Commission stays on the sub-tab', () => {
    mount('budget', game());
    expect(find('budget-commission'), 'the Commission sits under Projects').toBeDefined();
    tap('budget-up-welfare');
    expect(text('budget-share-welfare')).toBe('15%');
    expect(text('budget-pays-welfare')).toContain(`${lineCredits('welfare', 15, spareOf(FUND))} cr`);
    expect(text('budget-share-kept')).toBe('25%');
    tap('budget-up-welfare');
    tap('budget-up-welfare');
    expect(text('budget-share-welfare'), 'stops at maxShare 20').toBe('20%');
    expect(isDisabled('budget-up-welfare')).toBe(true);
    tap('budget-down-welfare');
    expect(text('budget-share-welfare')).toBe('15%');
  });

  it('S5-B-AC-1: Set sends exactly the shares shown', () => {
    mount('budget', game());
    expect(isDisabled('budget-set'), 'nothing to set while the draft is the standing budget').toBe(true);
    tap('budget-down-projects');
    tap('budget-up-welfare');
    const shown = { projects: parseInt(text('budget-share-projects')), welfare: parseInt(text('budget-share-welfare')) };
    expect(shown).toEqual({ projects: 55, welfare: 15 });
    tap('budget-set');
    expect(sent).toEqual([{ type: 'setBudget', shares: { ...shown, security: 0 } }]);
  });

  it('S5-B-AC-1: Welfare 0% still names who it would go to (AM-8), and a Welfare share names the recipient', () => {
    mount('budget', viewFor('s1', politics({ budget: budgetOf({ projects: 60, welfare: 0 }, { projects: 60, welfare: 0 }) })));
    expect(text('budget-pays-welfare')).toContain('Kai');
    tap('budget-up-welfare');
    expect(text('budget-pays-welfare')).toContain('to Kai');
  });

  it('S5-B-AC-1 (negative): a phone that is not the Governor has no steppers and no Set', () => {
    mount('budget', viewFor('s2', politics()));
    expect(find('budget-steppers')).toBeUndefined();
    expect(find('budget-set')).toBeUndefined();
    expect(find('gov-budget')).toBeUndefined();
    expect(find('budget-commission')).toBeUndefined();
  });
});

describe('S5-B-AC-1 (component): everyone else sees the budget as set', () => {
  it('S5-B-AC-1: the shares, who set them, what changed this month and who Welfare goes to', () => {
    const budget = budgetOf({ projects: 60, welfare: 10 }, { projects: 100, welfare: 0 }, { setBy: 's1' });
    mount('budget', viewFor('s2', politics({ budget })));
    expect(text('council-budget-by')).toBe('changed by Lena');
    expect(text('council-budget-share-projects')).toContain('100% → 60%');
    expect(text('council-budget-share-welfare')).toContain('0% → 10%');
    expect(text('council-budget-pays-welfare')).toContain('to Kai');
    expect(text('council-budget-kept')).toContain('Kept in the fund');
  });

  it('S5-B-AC-1: a budget nobody has set says it is as the game began', () => {
    mount('budget', viewFor('s2', politics({ budget: budgetOf({ projects: 100, welfare: 0 }, { projects: 100, welfare: 0 }) })));
    expect(text('council-budget-by')).toBe('as the game began');
  });
});

describe('S5-B-AC-3 (component): calling an overrule on the tax from the Laws sub-tab', () => {
  const moved = { percent: 9, start: 5, low: 0, high: 10 };
  const canCall = { tax: true as const, budget: 'notYet' as const, confidence: 'sheriffOnly' as const };

  it('S5-B-AC-3: a moved tax shows Call to anyone the engine allows; Call sends callOverrule tax', () => {
    mount('laws', viewFor('s2', politics({ tax: moved }), { canOverrule: canCall }));
    expect(text('overrule-call-change')).toBe('Up from 5% when the month began.');
    tap('overrule-call-button');
    expect(sent).toEqual([{ type: 'callOverrule', target: 'tax' }]);
  });

  it('S5-B-AC-3: no button for a refused caller, whatever the web might guess; the engine\'s refusal decides', () => {
    mount('laws', viewFor('s2', politics({ tax: moved }), { canOverrule: { ...canCall, tax: 'notNow' } }));
    expect(find('overrule-call-button')).toBeUndefined();
    expect(text('overrule-call-refused')).toBe('Call an overrule once the votes are over');
  });

  it('S5-B-AC-3: a tax as the month began shows no call at all', () => {
    mount('laws', viewFor('s2', politics(), { canOverrule: { ...canCall, tax: 'unchanged' } }));
    expect(find('overrule-call')).toBeUndefined();
  });

  it('S5-B-AC-3: the caller sees Withdraw, which sends callOverrule null', () => {
    mount('laws', viewFor('s2', politics({ tax: moved, overrule: overruleOf({ caller: 's2' }) }), { canOverrule: { ...canCall, tax: 'called' } }));
    expect(find('overrule-call-button')).toBeUndefined();
    tap('overrule-withdraw');
    expect(sent).toEqual([{ type: 'callOverrule', target: null }]);
  });

  it('S5-B-AC-3: another player sees who called it, and no Call or Withdraw', () => {
    mount('laws', viewFor('s3', politics({ tax: moved, overrule: overruleOf({ caller: 's2' }) }), { canOverrule: { ...canCall, tax: 'called' } }));
    expect(text('overrule-called-other')).toContain('Ossa called an overrule vote');
    expect(find('overrule-withdraw')).toBeUndefined();
    expect(find('overrule-call-button')).toBeUndefined();
  });

  it('S5-B-AC-3: the Governor never sees the call; while it stands the tax is frozen and its row is gone', () => {
    mount('laws', viewFor('s1', politics({ tax: moved, overrule: overruleOf() })));
    expect(find('overrule-call')).toBeUndefined();
    expect(text('gov-frozen-words')).toContain('Ossa called an overrule vote on the tax');
    expect(text('gov-frozen-value')).toBe('9%');
    expect(find('gov-tax'), 'the tax row is hidden while frozen').toBeUndefined();
    expect(find('tax-confirm')).toBeUndefined();
  });

  it('S5-B-AC-3: with no call the Governor keeps the tax row and no frozen card', () => {
    mount('laws', viewFor('s1', politics({ tax: moved })));
    expect(find('gov-tax')).toBeDefined();
    expect(find('gov-tax-frozen')).toBeUndefined();
  });
});

describe('S5-B-AC-3 (component): the overrule ballot and its reveal', () => {
  const ballot = (over: Partial<OverruleView> = {}) => politics({ tax: { percent: 9, start: 5, low: 0, high: 10 }, overrule: overruleOf({ stage: 'ballot', done: ['s2'], voted: ['s2'], waitingFor: ['s1', 's3'], ...over }) });

  it('S5-B-AC-3: the ballot comes first in Laws, which opens on it', () => {
    const tab = POLITICS_TABS.find((t) => t.id === 'laws')!;
    const game = viewFor('s3', ballot());
    expect(tab.first?.({ view: game, me: game.me!, self: game.players[2]! })).toBe(true);
    mount('laws', game);
    expect(find('overrule-ballot')).toBeDefined();
    const ids = drawn();
    expect(ids.indexOf('overrule-ballot')).toBeGreaterThan(-1);
    expect(ids.indexOf('overrule-ballot')).toBeLessThan(ids.indexOf('council-tax'));
  });

  it('S5-B-AC-3: start against now, what it needs, who has voted but never how, and Yes and No send voteOverrule', () => {
    mount('laws', viewFor('s3', ballot()));
    expect(text('overrule-start-now')).toBe('5% at the month’s start → 9% now');
    expect(text('overrule-needed')).toContain('needs 2 of 3 votes');
    expect(text('overrule-cast')).toContain('1 of 3');
    expect(text('overrule-cast')).toContain('Never shown: how');
    tap('overrule-yes');
    tap('overrule-no');
    expect(sent).toEqual([
      { type: 'voteOverrule', yes: true },
      { type: 'voteOverrule', yes: false },
    ]);
  });

  it('S5-B-AC-3: the voter\'s own choice stays shown, and no one else\'s is', () => {
    mount('laws', viewFor('s3', ballot(), { overruleBallot: false }));
    expect(props(byTestid('overrule-no'))['aria-pressed']).toBe(true);
    expect(props(byTestid('overrule-yes'))['aria-pressed']).toBe(false);
  });

  it('S5-B-AC-3: the caller\'s ballot starts at Yes and the Governor\'s at No, and they are told so', () => {
    mount('laws', viewFor('s2', ballot(), { overruleBallot: true }));
    expect(text('overrule-preset')).toContain('starts at Yes');
  });

  it.each([
    [true, 'Overruled', 'the tax goes back to 5%'],
    [false, 'It stands', 'tax stands at 9%'],
  ])('S5-B-AC-3: at the reveal (passed %s) the totals and the verdict show: %s', (passed, stamp, words) => {
    // The reveal takes the hub's stage, as the law vote's does; the sub-tab holds the open ballot only.
    mount(OVERRULE_STAGE.Body, viewFor('s3', ballot({ stage: 'reveal', result: { passed, yes: passed ? 2 : 1, no: passed ? 1 : 2 } })));
    expect(text('overrule-stamp')).toBe(stamp);
    expect(text('overrule-verdict')).toContain(words);
    expect(text('overrule-verdict')).toContain(`Yes ${passed ? 2 : 1} · needed 2`);
    expect(find('overrule-yes')).toBeUndefined();
  });
});

describe('S5-C10: the sub-tabs carry the budget and the overrule', () => {
  it('S5-C10: Budget is a sub-tab for every seat while politics plays', () => { // trace-allow: S5-C10 is a spec change id, the sub-tab wiring has no AC id of its own; S5-B-AC-1 and -3 are proved in the tests above
    const budget = POLITICS_TABS.find((t) => t.id === 'budget')!;
    for (const id of ['s1', 's2']) {
      const game = viewFor(id, politics());
      expect(budget.show?.({ view: game, me: game.me!, self: game.players.find((p) => p.id === id)! }), id).toBe(true);
    }
    const off = aMuleView({ month: 4, players: PLAYERS, me: mine('s1'), politics: null });
    expect(budget.show?.({ view: off, me: off.me!, self: off.players[0]! })).toBe(false);
  });
});
