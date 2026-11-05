import { document, FakeElement } from './fake-dom';
import { LAW_NAME, POLITICS, type LawId, type LawImpact } from '@mule/engine';
import type { MuleView, MyView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * C46: the Governor's law picker (picker A of the approved ws8-desks mock) and next month's vote on every other phone,
 * in the real planning hub mounted in a fake DOM. Taps call the handler React gave the element.
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
const LAW_IDS = Object.keys(POLITICS.laws) as LawId[];

/** Each candidate's cost, distinct per key and seat, so a figure on screen can only come from its own key. */
function candidatesFor(laws: PoliticsView['laws'] = {}): Record<string, Record<string, LawImpact>> {
  const out: Record<string, Record<string, LawImpact>> = {};
  LAW_IDS.forEach((law, li) =>
    POLITICS.laws[law].settings.forEach((s, si) => {
      out[`${law}:${s}`] = Object.fromEntries(PLAYERS.map((p, pi) => [p.id, { cost: 100 * li + 10 * si + pi + 1 }]));
    }),
  );
  for (const law of Object.keys(laws ?? {})) out[`repeal:${law}`] = Object.fromEntries(PLAYERS.map((p, pi) => [p.id, { cost: -(7 + pi) }]));
  return out;
}

const politics = (extra: Partial<PoliticsView> = {}): PoliticsView => ({
  governor: 's1',
  sheriff: null,
  term: [1, 3],
  next: 4,
  baron: null,
  tax: { percent: 5, start: 5, low: 0, high: 10 },
  fund: 0,
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
  ...extra,
});

const me = (id: string, pol: PoliticsView | null, governor = id === 's1'): MyView => ({
  id,
  species: 'zipwing',
  stock: { ...NO_GOODS },
  carriedMule: null,
  installedThisTurn: false,
  worthParts: { money: 0, goods: 0, plots: 0, land: 0, mules: 0, muleValue: 0, office: 0, cut: 0 },
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
  politics: pol && { running: null, ballot: {}, canRun: { governor: 'closed' }, paid: 0, reputation: 50, ...(governor && !pol.proposal && !pol.council ? { candidates: candidatesFor(pol.laws) } : {}) },
});

const viewFor = (id: string, pol: PoliticsView | null, month = 4): MuleView => aMuleView({ month, players: PLAYERS, me: me(id, pol), politics: pol });

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

function mount(view: MuleView): void {
  const self = view.players.find((p) => p.id === view.me!.id)!;
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', boards: 1, game: view, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) };
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host as unknown as HTMLElement);
  act(() => root!.render(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: { table, view, me: view.me!, self, slot: self.slot as Slot }, children: createElement(Planning) }) })));
}

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  root = null;
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
const tap = (testid: string) => act(() => (props(byTestid(testid)).onClick as (e?: unknown) => void)({ currentTarget: byTestid(testid) }));
const text = (testid: string) => byTestid(testid).textContent.replace(/\s+/g, ' ').trim();
const isDisabled = (testid: string) => props(byTestid(testid)).disabled === true;

describe("B-AC-46-1: the Governor's law picker", () => {
  it('B-AC-46-1: lists the four laws, each with the engine\'s settings as chips, in the Governor desk under the sales tax', () => {
    mount(viewFor('s1', politics()));
    expect(findTestid('gov-tax'), 'the sales tax stays').toBeDefined();
    byTestid('picker-a');
    for (const law of LAW_IDS) {
      expect(text(`law-row-${law}`)).toContain(LAW_NAME[law]);
      for (const s of POLITICS.laws[law].settings) expect(isDisabled(`law-${law}-${s}`), `${law} ${s}`).toBe(false);
    }
    expect(findTestid('for-each'), 'no preview before a pick').toBeUndefined();
    expect(isDisabled('propose')).toBe(true);
  });

  it("B-AC-46-1: a pick shows each player's figure from the view's candidates, the same numbers; Propose sends it", () => {
    const pol = politics();
    mount(viewFor('s1', pol));
    const [law, s] = ['landTax', POLITICS.laws.landTax.settings[1]!] as const;
    tap(`law-${law}-${s}`);
    const impact = candidatesFor()[`${law}:${s}`]!;
    for (const p of PLAYERS) expect(text(`for-each-${p.id}`)).toContain(`${impact[p.id]!.cost} cr a month`);
    expect(text('propose')).toBe(`Propose Land tax ${s} cr a plot for next month’s vote`);
    tap('propose');
    expect(sent).toEqual([{ type: 'propose', proposal: { kind: 'enact', law, setting: s } }]);
  });

  it('B-AC-46-1 (negative): a phone that is not the Governor has no picker and no Governor desk', () => {
    mount(viewFor('s2', politics()));
    expect(findTestid('desk-governor')).toBeUndefined();
    expect(findTestid('picker-a')).toBeUndefined();
  });
});

describe('B-AC-46-2: laws in force, three in force, and the retry wait', () => {
  it('B-AC-46-2: a law in force reads "since month N", its setting marked; Repeal sends a repeal, previewed from candidates', () => {
    const laws = { landTax: { setting: 10, since: 3 } };
    mount(viewFor('s1', politics({ laws })));
    expect(text('law-inforce-landTax')).toBe('in force since month 3');
    expect(isDisabled('law-landTax-10'), 'the setting in force').toBe(true);
    tap('law-repeal-landTax');
    expect(text('for-each-s2')).toContain('saves 8 cr');
    tap('propose');
    expect(sent).toEqual([{ type: 'propose', proposal: { kind: 'repeal', law: 'landTax' } }]);
  });

  it('B-AC-46-2: with three in force a new law asks "This replaces:", and carries replaces once picked', () => {
    const laws = { landTax: { setting: 10, since: 2 }, exportTax: { setting: 10, since: 2 }, pollutionTax: { setting: 20, since: 3 } };
    mount(viewFor('s1', politics({ laws })));
    tap('law-emissionCap-50');
    expect(text('replaces')).toContain(`${POLITICS.council.maxInForce} laws are in force: pick the one this replaces`);
    expect(isDisabled('propose')).toBe(true);
    tap('propose');
    expect(sent).toEqual([]);
    tap('replaces-exportTax');
    expect(isDisabled('propose')).toBe(false);
    tap('propose');
    expect(sent).toEqual([{ type: 'propose', proposal: { kind: 'enact', law: 'emissionCap', setting: 50, replaces: 'exportTax' } }]);
  });

  it("B-AC-46-2: a law in its retry wait is dimmed with the engine's words, and no setting can be picked", () => {
    // RULE-41 row 4: failed in month 3, back in month 3 + retryMonths + 1; the view carries that first month.
    const back = 3 + POLITICS.council.retryMonths + 1;
    mount(viewFor('s1', politics({ retry: { 'enact:pollutionTax': back } }), back - 1));
    expect(text('law-wait-pollutionTax')).toBe(`That proposal failed in month 3; it can come back in month ${back}`);
    for (const s of POLITICS.laws.pollutionTax.settings) expect(findTestid(`law-pollutionTax-${s}`)).toBeUndefined();
  });

  it('B-AC-46-2 (negative): from its comeback month the law can be picked again', () => {
    const back = 3 + POLITICS.council.retryMonths + 1;
    mount(viewFor('s1', politics({ retry: { 'enact:pollutionTax': back } }), back));
    expect(findTestid('law-wait-pollutionTax')).toBeUndefined();
    expect(isDisabled('law-pollutionTax-20')).toBe(false);
  });
});

describe('B-AC-46-3: a pending proposal on the desk', () => {
  const pending = { by: 's1', month: 4, proposal: { kind: 'enact', law: 'landTax', setting: 10 } as const, impact: { s1: { cost: 30 }, s2: { cost: 50 }, s3: { cost: 0 } } };

  it('B-AC-46-3: the desk shows the proposal with each cost, Change and Withdraw; Withdraw sends propose null', () => {
    mount(viewFor('s1', politics({ proposal: pending })));
    expect(text('pending-words')).toBe('You propose Land tax 10 cr a plot');
    expect(text('for-each-s2')).toContain('50 cr a month');
    expect(findTestid('picker-a')).toBeUndefined();
    tap('pending-withdraw');
    expect(sent).toEqual([{ type: 'propose', proposal: null }]);
  });

  it('B-AC-46-3: Change opens the picker on the pending pick, with a way to keep it', () => {
    mount(viewFor('s1', politics({ proposal: pending })));
    tap('pending-change');
    byTestid('picker-a');
    expect(props(byTestid('law-landTax-10'))['aria-pressed']).toBe(true);
    tap('change-cancel');
    byTestid('pending');
  });
});

describe("B-AC-46-4: next month's vote on every other phone", () => {
  const pending = { by: 's1', month: 4, proposal: { kind: 'enact', law: 'landTax', setting: 10 } as const, impact: { s1: { cost: 30 }, s2: { cost: 50 }, s3: { cost: 0 } } };

  it("B-AC-46-4: Ossa's This month has the agenda line, with her own For you figure", () => {
    mount(viewFor('s2', politics({ proposal: pending })));
    expect(text('agenda-law')).toContain('Next month’s vote');
    expect(text('agenda-law')).toContain('Lena proposes Land tax 10 cr a plot. For you: about 50 cr a month.');
  });

  it("B-AC-46-4: Kai's figure is his own: nothing", () => {
    mount(viewFor('s3', politics({ proposal: pending })));
    expect(text('agenda-law')).toContain('For you: nothing.');
  });

  it("B-AC-46-4 (negative): the Governor's own phone does not duplicate it; with nothing pending no phone has it", () => {
    mount(viewFor('s1', politics({ proposal: pending })));
    expect(findTestid('agenda-law')).toBeUndefined();
    act(() => root!.unmount());
    root = null;
    mount(viewFor('s2', politics()));
    expect(findTestid('agenda-law')).toBeUndefined();
  });
});

describe('B-AC-46-6 (negative): without politics', () => {
  it('B-AC-46-6: with politics off there is no Governor desk, no picker and no agenda line', () => {
    mount(viewFor('s1', null));
    expect(findTestid('desk-governor')).toBeUndefined();
    expect(findTestid('picker-a')).toBeUndefined();
    expect(findTestid('agenda-law')).toBeUndefined();
  });

  it("B-AC-46-6: while the votes are open the desk keeps today's sales tax and says when a law can be proposed", () => {
    mount(viewFor('s1', politics({ council: { stage: 'ballot', proposal: { kind: 'enact', law: 'landTax', setting: 10 }, proposer: 's1', impact: {}, voted: [], done: [], waitingFor: [], clockMs: 0, revealMs: 4000, result: null } })));
    expect(findTestid('picker-a')).toBeUndefined();
  });
});
