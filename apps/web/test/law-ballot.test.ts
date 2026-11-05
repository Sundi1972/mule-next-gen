import { document, FakeElement } from './fake-dom';
import { POLITICS, type LawImpact } from '@mule/engine';
import type { CouncilView, MuleView, MyView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * C46: next month's law ballot on the phone (the approved ws8-desks mock, c4f4cc42), in the real planning hub mounted
 * in a fake DOM: it takes the hub's stage as the election does; then the reveal; and the laws in force on the Council
 * desk. Taps call the handler React gave the element.
 */

let ClientProvider: typeof import('../src/net/react').ClientProvider;
let PhoneGameProvider: typeof import('../src/phone/game').PhoneGameProvider;
let Planning: typeof import('../src/phone/Planning').Planning;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ({ ClientProvider } = await import('../src/net/react'));
  ({ PhoneGameProvider } = await import('../src/phone/game'));
  ({ Planning } = await import('../src/phone/Planning'));
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
  (document.documentElement as unknown as { dataset?: object }).dataset ??= {};
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 0;
  (globalThis as { MutationObserver?: unknown }).MutationObserver ??= class {
    observe() {}
    disconnect() {}
  };
  (FakeElement.prototype as unknown as { getBoundingClientRect?: () => object }).getBoundingClientRect ??= () => ({ x: 0, y: 0, top: 0, left: 0, width: 844, height: 390, right: 844, bottom: 390 });
});

const NO_GOODS = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };
const PLAYERS: PlayerView[] = [aPlayer({ id: 's1', name: 'Lena', slot: 0 }), aPlayer({ id: 's2', name: 'Ossa', slot: 1 }), aPlayer({ id: 's3', name: 'Kai', slot: 2 })];
/** Each seat's vote weight, distinct, so "Your vote weighs N" can only come from its own row. */
const WEIGHT: Record<string, number> = { s1: 2, s2: 3, s3: 1 };
/** Each seat's cost of the land tax, distinct, so "For you" can only come from its own row. */
const IMPACT: Record<string, LawImpact> = { s1: { cost: 30 }, s2: { cost: 50 }, s3: { cost: 0 } };
const LAND_TAX_10 = { kind: 'enact', law: 'landTax', setting: 10 } as const;

const council = (extra: Partial<CouncilView> = {}): CouncilView => ({
  stage: 'ballot',
  proposal: LAND_TAX_10,
  proposer: 's1',
  impact: IMPACT,
  voted: ['s1'],
  done: [],
  waitingFor: ['s1', 's2', 's3'],
  clockMs: 0,
  revealMs: POLITICS.council.revealMs,
  result: null,
  ...extra,
});

const politics = (extra: Partial<PoliticsView> = {}): PoliticsView => ({
  governor: 's1',
  sheriff: null,
  term: [1, 3],
  next: 4,
  baron: null,
  tax: { percent: 5, start: 5, low: 0, high: 10 },
  fund: 0,
  pay: { governor: 50 },
  weights: PLAYERS.map(({ id }) => ({ id, votes: WEIGHT[id]!, parts: { base: 1, land: WEIGHT[id]! - 1, reputation: 0, baron: 0, taxes: 0 } })),
  candidates: { governor: [] },
  promises: {},
  promise: null,
  promiseFrom: 5,
  election: null,
  proposal: null,
  council: null,
  laws: {},
  retry: {},
  ...extra,
});

const me = (id: string, pol: PoliticsView | null, lawBallot: boolean | null): MyView => ({
  id,
  species: 'zipwing',
  stock: { ...NO_GOODS },
  carriedMule: null,
  installedThisTurn: false,
  worthParts: { money: 0, goods: 0, plots: 0, land: 0, mules: 0, muleValue: 0, office: 0, donated: 0, cut: 0 },
  claimsLeft: 0,
  hungry: false,
  sick: false,
  needs: { food: 0, water: 0 },
  monthNeeds: { ...NO_GOODS },
  devEndsAt: null,
  devSeconds: 50,
  produced: null,
  mulePrice: 150,
  outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
  droneOrder: [],
  politics: pol && { running: null, ballot: {}, canRun: { governor: 'closed' }, paid: 0, reputation: 50, lawBallot },
});

const MONTH = 4;

/** Seat `id`'s view; a seat in the council's `done` is Ready, as the server has it while the vote is open. */
function viewFor(id: string, pol: PoliticsView | null, lawBallot: boolean | null = null): MuleView {
  const done = pol?.council?.stage === 'ballot' ? pol.council.done : [];
  return aMuleView({ month: MONTH, players: PLAYERS.map((p) => ({ ...p, ready: done.includes(p.id) })), me: me(id, pol, lawBallot), politics: pol });
}

const sent: unknown[] = [];
const STATE = { status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
const client = {
  subscribe: () => () => {},
  getState: () => STATE,
  serverNow: () => 0,
  intent: (intent: unknown) => void sent.push(intent),
} as unknown as TableClient;

let root: Root | null = null;
let host: FakeElement;

/** Lena (s1) is the host. */
function mount(view: MuleView): void {
  const self = view.players.find((p) => p.id === view.me!.id)!;
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', boards: 1, game: view, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host as unknown as HTMLElement);
  act(() => root!.render(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: { table, view, me: view.me!, self, slot: self.slot as Slot }, children: createElement(Planning) }) })));
}

function unmount(): void {
  const r = root;
  if (r) act(() => r.unmount());
  root = null;
}

afterEach(() => {
  unmount();
  sent.length = 0;
});

function findTestid(testid: string, node: FakeElement = host): FakeElement | undefined {
  if (node.getAttribute('data-testid') === testid) return node;
  for (const child of node.childNodes) {
    const hit = child instanceof FakeElement ? findTestid(testid, child) : undefined;
    if (hit) return hit;
  }
  return undefined;
}
function byTestid(testid: string): FakeElement {
  const found = findTestid(testid);
  expect(found, `an element with data-testid="${testid}"`).toBeDefined();
  return found!;
}
function props(el: FakeElement): Record<string, unknown> {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  expect(key, 'a React element').toBeDefined();
  return (el as unknown as Record<string, Record<string, unknown>>)[key!]!;
}
/** The aria-labels of every image under `node`: a PlayerMark's is its player's name. */
function marks(node: FakeElement): string[] {
  const own = node.getAttribute('role') === 'img' ? [node.getAttribute('aria-label') ?? ''] : [];
  return [...own, ...node.childNodes.flatMap((c) => (c instanceof FakeElement ? marks(c) : []))];
}
const tap = (testid: string) => act(() => (props(byTestid(testid)).onClick as (e?: unknown) => void)({ currentTarget: byTestid(testid) }));
const text = (testid: string) => byTestid(testid).textContent.replace(/\s+/g, ' ').trim();
const isDisabled = (testid: string) => props(byTestid(testid)).disabled === true;

describe('B-AC-46-7: the law ballot takes the hub’s stage', () => {
  it("B-AC-46-7: Ossa's phone shows the proposal in words, her own cost and her own weight, and no This month", () => {
    mount(viewFor('s2', politics({ council: council() })));
    byTestid('phone-ballot');
    expect(text('ballot-proposal')).toBe('Land tax 10 cr a plot');
    expect(text('ballot-for-you')).toBe('For you: about 50 cr a month.');
    expect(text('ballot-weight')).toBe('Your vote weighs 3');
    expect(findTestid('agenda'), "the stage holds the phone: no This month").toBeUndefined();
    expect(text('ready'), 'the ready bar is Done').toBe('Done');
    expect(isDisabled('ready'), 'Done waits for a vote').toBe(true);
    expect(text('council-rail')).toContain('Laws in force');
  });

  it("B-AC-46-7: Kai's For you is his own: nothing; his weight is his own: 1", () => {
    mount(viewFor('s3', politics({ council: council() })));
    expect(text('ballot-for-you')).toBe('For you: nothing.');
    expect(text('ballot-weight')).toBe('Your vote weighs 1');
  });

  it('B-AC-46-7: Yes and No send voteLaw with yes true and false', () => {
    mount(viewFor('s2', politics({ council: council() })));
    tap('ballot-no');
    tap('ballot-yes');
    expect(sent).toEqual([
      { type: 'voteLaw', yes: false },
      { type: 'voteLaw', yes: true },
    ]);
  });

  it("B-AC-46-7: the Governor's ballot starts at Yes, so Done is live", () => {
    mount(viewFor('s1', politics({ council: council() }), true));
    expect(props(byTestid('ballot-yes'))['aria-pressed']).toBe(true);
    expect(props(byTestid('ballot-no'))['aria-pressed']).toBe(false);
    expect(isDisabled('ready')).toBe(false);
  });

  it('B-AC-46-7: who has voted shows as marks, never how anyone voted', () => {
    mount(viewFor('s2', politics({ council: council({ voted: ['s1', 's3'], done: ['s3'], waitingFor: ['s1', 's2'] }) })));
    const voted = byTestid('ballot-voted');
    expect(marks(voted)).toEqual(['Lena', 'Kai']);
    expect(text('ballot-voted')).toContain('2 of 3');
    expect(text('ballot-voted')).not.toMatch(/\b(yes|no)\b/i);
  });
});

describe('B-AC-46-8: Done in the ballot, and the host’s Continue', () => {
  it("B-AC-46-8: once Ossa has voted she is Done, and Now is the ballot's own: whom it waits for, not planning's words", () => {
    mount(viewFor('s2', politics({ council: council({ voted: ['s1', 's2'], done: ['s2'], waitingFor: ['s1', 's3'] }) }), false));
    expect(text('now-title')).toBe('You voted. Waiting for 2: Lena and Kai');
    expect(text('now')).not.toContain('Plan your month');
    expect(text('now')).not.toContain('Planning has no clock');
    expect(text('ballot-waiting')).toContain('Waiting for 2: Lena and Kai');
    expect(text('you-are-ready')).toBe('You voted');
  });

  it('B-AC-46-8: before she votes, Now asks for the vote', () => {
    mount(viewFor('s2', politics({ council: council() })));
    expect(text('now-title')).toBe('Vote on the law');
  });

  it('B-AC-46-8: the host, Done, sees Continue during the ballot, with its confirm', () => {
    mount(viewFor('s1', politics({ council: council({ done: ['s1'], waitingFor: ['s2', 's3'] }) }), true));
    tap('continue');
    expect(text('continue-confirm')).toContain('Close the vote now? The votes as they stand are counted, and the result is shown.');
    expect(text('continue-confirm')).not.toContain('won’t count');
    tap('continue-now');
    expect(sent).toEqual([{ type: 'continue' }]);
  });

  it('B-AC-46-8 (negative): during the reveal the host has no Continue, and Now says the result is showing', () => {
    mount(viewFor('s1', politics({ council: council({ stage: 'reveal', voted: ['s1', 's2', 's3'], done: ['s1', 's2', 's3'], waitingFor: [], result: { passed: true, yes: 5, no: 1, tie: false } }) })));
    expect(findTestid('continue')).toBeUndefined();
    expect(text('now-title')).toBe('The result');
    expect(findTestid('ready') && text('ready'), "the reveal's ready bar is not the ballot's Done").not.toBe('Done');
    expect(findTestid('you-are-ready') && text('you-are-ready')).not.toBe('You voted');
  });

  it("B-AC-46-8: in an election month, the new Governor's Now during the open ballot is the ballot's, not the sales tax", () => {
    const pol = politics({ term: [MONTH, MONTH + 2], election: { stage: 'over', ceremony: null, candidates: {}, promises: {}, voted: [], done: [], waitingFor: [], result: {} }, council: council() });
    mount(viewFor('s1', pol, true));
    expect(text('now-title')).toBe('Vote on the law');
  });
});

describe('B-AC-46-9: the reveal on the phone', () => {
  const reveal = (result: NonNullable<CouncilView['result']>) => politics({ council: council({ stage: 'reveal', voted: ['s1', 's2', 's3'], done: ['s1', 's2', 's3'], waitingFor: [], result }) });

  it('B-AC-46-9: passed, with the totals and the law in force', () => {
    mount(viewFor('s2', reveal({ passed: true, yes: 7, no: 3, tie: false })));
    expect(text('phone-stamp')).toBe('Passed');
    expect(text('phone-reveal-line')).toBe('Passed 7 to 3 · Land tax 10 cr a plot is in force from now');
  });

  it('B-AC-46-9: failed, with the totals and the month it can come back', () => {
    mount(viewFor('s2', reveal({ passed: false, yes: 3, no: 7, tie: false })));
    expect(text('phone-stamp')).toBe('Failed');
    expect(text('phone-reveal-line')).toBe(`Failed 7 to 3 · it can come back in month ${MONTH + POLITICS.council.retryMonths + 1}`);
  });

  it("B-AC-46-9: a tie says the Governor's vote decides", () => {
    mount(viewFor('s2', reveal({ passed: true, yes: 3, no: 3, tie: true })));
    expect(text('phone-reveal-line')).toBe('3 to 3 · the Governor’s vote decides · Land tax 10 cr a plot is in force from now');
  });
});

describe('B-AC-46-11: the laws in force on the Council desk', () => {
  const pending = { by: 's1', month: MONTH, proposal: LAND_TAX_10, impact: IMPACT };

  it("B-AC-46-11: a pending proposal is on the Council desk, with this seat's own For you", () => {
    mount(viewFor('s2', politics({ proposal: pending })));
    tap('desk-council');
    expect(text('council-pending')).toContain('Lena proposes Land tax 10 cr a plot');
    expect(text('council-pending-for-you')).toBe('For you: about 50 cr a month.');
    unmount();
    mount(viewFor('s3', politics({ proposal: pending })));
    tap('desk-council');
    expect(text('council-pending-for-you')).toBe('For you: nothing.');
  });

  it('B-AC-46-11 (negative): no card with nothing pending, nor while a vote is open', () => {
    mount(viewFor('s2', politics()));
    tap('desk-council');
    expect(findTestid('council-pending')).toBeUndefined();
    unmount();
    mount(viewFor('s2', politics({ proposal: pending, council: council() })));
    expect(findTestid('council-pending')).toBeUndefined();
  });

  it('B-AC-46-11: each law in force is a chip with its setting and "since month N"', () => {
    mount(viewFor('s2', politics({ laws: { landTax: { setting: 10, since: 3 }, exportTax: { setting: 20, since: 2 } } })));
    tap('desk-council');
    expect(text('law-chip-landTax')).toBe('Land tax 10 cr · since month 3');
    expect(text('law-chip-exportTax')).toBe('Export tax 20% · since month 2');
    expect(findTestid('law-chip-pollutionTax')).toBeUndefined();
  });

  it('B-AC-46-11: with none in force the strip says so', () => {
    mount(viewFor('s2', politics()));
    tap('desk-council');
    expect(text('laws-none')).toBe('none yet');
    expect(findTestid('law-chip-landTax')).toBeUndefined();
  });
});

describe('B-AC-46-12 (negative): with politics off, or no council, the hub is today’s', () => {
  it('B-AC-46-12: politics off: no ballot, no laws in force, planning’s Now', () => {
    mount(viewFor('s2', null));
    expect(findTestid('phone-ballot')).toBeUndefined();
    expect(findTestid('laws-in-force')).toBeUndefined();
    expect(text('now-title')).toBe('Plan your month, then press Ready');
  });

  it.each<[string, CouncilView | null]>([
    ['no council', null],
    ['the council over', council({ stage: 'over', result: { passed: true, yes: 5, no: 1, tie: false }, waitingFor: [] })],
  ])('B-AC-46-12: %s: no ballot on the stage, This month and planning’s Now', (_, c) => {
    mount(viewFor('s2', politics({ council: c })));
    expect(findTestid('phone-ballot')).toBeUndefined();
    expect(findTestid('phone-reveal')).toBeUndefined();
    byTestid('agenda');
    expect(text('now-title')).toBe('Plan your month, then press Ready');
    expect(text('ready')).toBe("I'm ready");
  });
});
