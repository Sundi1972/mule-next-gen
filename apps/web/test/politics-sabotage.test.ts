import { document, FakeElement } from './fake-dom';
import { GOODS, POLITICS } from '@mule/engine';
import type { DealCard } from '@mule/engine';
import type { IncidentView, MuleView, MyPoliticsView, MyView, PlayerView, PoliticsView, TableView, TileView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement, useState, type ComponentType, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * S4-PR-6 (WS8's part): the Sheriff's case file (S4-C15, P7 and P8) and the secret order (S4-C14, P6), mounted in the
 * real planning hub in a fake DOM. Each test asserts at promise altitude: what the player sees on their phone, and the
 * intent a tap sends. The binding basis is the approved mock, design/mocks/politics-p2 @ d6977e1a ("B folded").
 * Taps call the handler React gave the element; the fake DOM dispatches no events.
 */

let ClientProvider: typeof import('../src/net/react').ClientProvider;
let PhoneGameProvider: typeof import('../src/phone/game').PhoneGameProvider;
let Planning: typeof import('../src/phone/Planning').Planning;
let Sheriff: typeof import('../src/phone/hub/politics/Sheriff');
const scrolled = vi.fn();

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ({ ClientProvider } = await import('../src/net/react'));
  ({ PhoneGameProvider } = await import('../src/phone/game'));
  ({ Planning } = await import('../src/phone/Planning'));
  Sheriff = await import('../src/phone/hub/politics/Sheriff');
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
  (document.documentElement as unknown as { dataset?: object }).dataset ??= {};
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 0;
  (globalThis as { MutationObserver?: unknown }).MutationObserver ??= class {
    observe() {}
    disconnect() {}
  };
  (FakeElement.prototype as unknown as { getBoundingClientRect?: () => object }).getBoundingClientRect ??= () => ({ x: 0, y: 0, top: 0, left: 0, width: 844, height: 390, right: 844, bottom: 390 });
  (FakeElement.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView = scrolled;
});

const NO_GOODS = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };
const PLAYERS: PlayerView[] = [aPlayer({ id: 's1', name: 'Lena', slot: 0 }), aPlayer({ id: 's2', name: 'Ossa', slot: 1 }), aPlayer({ id: 's3', name: 'Kai', slot: 2 }), aPlayer({ id: 's4', name: 'Brix', slot: 3 })];

/**
 * A 4×2 colony. Row 1: Lena's food plot, Ossa's smithore plot, Kai's idle plot, a free plot. Row 2: Brix's food plot,
 * Kai's energy plot, a free plot, the store.
 */
const W = 4;
const at = (x: number, y: number) => y * W + x;
const plot = (x: number, y: number, owner: string | null, outfit: TileView['outfit'], terrain: TileView['terrain'] = 'plains'): TileView => ({ x, y, terrain, peaks: 0, owner, outfit, pollution: 0, filter: false });
const TILES: TileView[] = [
  plot(0, 0, 's1', 'food'),
  plot(1, 0, 's2', 'smithore'),
  plot(2, 0, 's3', null),
  plot(3, 0, null, null),
  plot(0, 1, 's4', 'food'),
  plot(1, 1, 's3', 'energy'),
  plot(2, 1, null, null),
  plot(3, 1, null, null, 'store'),
];

/** Five cases, each in a different state. Ids are opaque: no screen prints one. */
const OPEN_CUT: IncidentView = { id: 'q7f2', month: 3, kind: 'powerCut', victim: 's2', at: { x: 1, y: 0 }, good: 'smithore', worked: true, culprit: null, how: null, investigated: false, fine: null };
const OPEN_RUMOUR: IncidentView = { id: 'k1m9', month: 4, kind: 'rumour', victim: null, at: null, good: 'food', dir: 'up', worked: true, culprit: null, how: null, investigated: false, fine: null };
const GUARDED: IncidentView = { id: 'w3c8', month: 4, kind: 'powerCut', victim: 's3', at: { x: 1, y: 1 }, good: 'energy', worked: false, culprit: 's1', how: 'guard', investigated: false, fine: null };
const COLD: IncidentView = { id: 'p5d1', month: 2, kind: 'powerCut', victim: 's4', at: { x: 0, y: 1 }, good: 'food', worked: true, culprit: null, how: null, investigated: true, fine: null };
const CLOSED: IncidentView = { id: 'z8h4', month: 3, kind: 'powerCut', victim: 's1', at: { x: 0, y: 0 }, good: 'energy', worked: false, culprit: 's2', how: 'caught', investigated: false, fine: { due: 150, paid: 150, toVictim: 75, by: 'sheriff' } };
const INCIDENTS = [OPEN_CUT, OPEN_RUMOUR, GUARDED, COLD, CLOSED];

type Sheriff = NonNullable<MyPoliticsView['sheriff']>;
type Sab = NonNullable<MyPoliticsView['sabotage']>;
const STEPS = [...POLITICS.sheriff.fine.steps];
/** Brix's desk: one guard of two posted on Ossa's smithore plot, one investigation left, Lena's guarded cut to fine. */
const SHERIFF: Sheriff = { canAct: true, guards: [at(1, 0)], max: 2, investigationsLeft: 1, fineable: ['w3c8'], steps: STEPS, multiplier: 1 };
const NO_ORDER: Sab = { order: null, canOrder: true, owed: 0, mine: [] };
const TERMS = { powerCut: { cost: 120, success: 0.6, detect: 0.3 }, rumour: { cost: 60, success: 0.8, detect: 0.15 } };

const politics = (extra: Partial<PoliticsView> = {}): PoliticsView => ({
  governor: 's2',
  sheriff: 's4',
  term: [1, 3],
  next: 7,
  baron: null,
  tax: { percent: 5, start: 5, low: 0, high: 10 },
  fund: 500,
  pay: { governor: 50, sheriff: 30 },
  weights: PLAYERS.map(({ id }) => ({ id, votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } })),
  candidates: { governor: [], sheriff: [] },
  promises: {},
  promise: null,
  promiseFrom: null,
  election: null,
  laws: {},
  sabotage: { terms: TERMS, incidents: INCIDENTS, sheriff: { guards: 2, investigations: 1, investigationsLeft: 1 } },
  ...extra,
});

const pact = (from: string, to: string): DealCard => ({ id: 'deal-a1', from, to, terms: { kind: 'pact' }, offered: 3, until: 6, status: 'active', brokenBy: null, settled: null });

interface Seat {
  /** Whose phone: Lena unless named. */
  id?: string;
  sheriff?: Sheriff | null;
  sabotage?: Sab | null;
  pacts?: DealCard[];
  politics?: Partial<PoliticsView>;
}

/** The month-5 planning view of `id`'s phone. */
function viewOf({ id = 's1', sheriff = null, sabotage = NO_ORDER, pacts = [], politics: p = {} }: Seat = {}): MuleView {
  const me: MyView = {
    id,
    species: 'zipwing',
    stock: { ...NO_GOODS, food: 9 },
    carriedMule: null,
    installedThisTurn: false,
    worthParts: { money: 1_000, goods: 0, plots: 0, land: 0, mules: 0, muleValue: 0, office: 0, donated: 0, cut: 0 },
    claimsLeft: 0,
    hungry: false,
    sick: false,
    needs: { food: 5, water: 0 },
    monthNeeds: { ...NO_GOODS, food: 5 },
    devEndsAt: null,
    devSeconds: 50,
    produced: null,
    mulePrice: 150,
    outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
    droneOrder: [],
    politics: { running: null, ballot: {}, canRun: {}, paid: 0, reputation: 50, sheriff, sabotage },
    deals: { cards: pacts, offersLeft: 3, pactMonths: [1, 3, 6] },
  };
  return aMuleView({ month: 5, width: W, height: 2, tiles: TILES, players: PLAYERS, me, politics: politics(p) });
}

/** Brix's phone, the sitting Sheriff. */
const brix = (sheriff: Partial<Sheriff> = {}, extra: Omit<Seat, 'id' | 'sheriff'> = {}) => viewOf({ id: 's4', sheriff: { ...SHERIFF, ...sheriff }, ...extra });

const sent: unknown[] = [];
let toasts: { id: number }[] = [];
let state = { status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts, clockOffset: 0 };
const listeners = new Set<() => void>();
const client = {
  subscribe: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
  getState: () => state,
  serverNow: () => 0,
  intent: (intent: unknown) => void sent.push(intent),
} as unknown as TableClient;

/** The phone of `view.me`, drawing `screen`: today's planning hub unless another is named. */
const onPhone = (view: MuleView, screen: ComponentType = Planning) => {
  const self = view.players.find((p) => p.id === view.me!.id)!;
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', boards: 1, game: view, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) };
  return createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: { table, view, me: view.me!, self, slot: self.slot as Slot }, children: createElement(screen) }) });
};

let root: Root | null = null;
let host: FakeElement;

function mount(view: MuleView, screen?: ComponentType): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host as unknown as HTMLElement);
  act(() => root!.render(onPhone(view, screen)));
}

/** The server's next view, as a broadcast draws it. */
const answer = (view: MuleView) => act(() => root!.render(onPhone(view)));

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  root = null;
  sent.length = 0;
  scrolled.mockClear();
  toasts = [];
  state = { ...state, toasts };
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

/** Every element under `node` whose data-testid starts with `prefix`, in document order. */
function allTestids(prefix: string, node: FakeElement = host): string[] {
  const out: string[] = [];
  const walk = (n: FakeElement) => {
    const id = n.getAttribute('data-testid');
    if (id?.startsWith(prefix)) out.push(id);
    for (const c of n.childNodes) if (c instanceof FakeElement) walk(c);
  };
  walk(node);
  return out;
}

function handlers(el: FakeElement): Record<string, () => void> {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  expect(key, 'a React element').toBeDefined();
  return (el as unknown as Record<string, Record<string, () => void>>)[key!]!;
}

const has = (testid: string) => findTestid(testid) !== undefined;
const tap = (testid: string) => act(() => (handlers(byTestid(testid)).onClick as (e?: unknown) => void)({ currentTarget: byTestid(testid) }));
const text = (testid: string) => byTestid(testid).textContent.replace(/\s+/g, ' ').trim();
const off = (testid: string) => byTestid(testid).getAttribute('disabled') !== null;
const tag = (testid: string) => byTestid(testid).tagName;
const openDesk = () => [...host.findAll('button')].find((b) => b.getAttribute('role') === 'tab' && b.getAttribute('aria-selected') === 'true')?.getAttribute('data-testid');
/** The plot's words as a screen reader hears them, which carry its flag. */
const plotLabel = (x: number, y: number) => byTestid(`map-plot-${x}-${y}`).getAttribute('aria-label') ?? '';
/** The live cases' rows, top to bottom. */
const caseRows = () => allTestids('b-case-row-', byTestid('b-cases')).map((id) => id.replace('b-case-row-', ''));

describe("S4-C15, P7: the Sheriff's case file (B folded)", () => {
  it("S4-B-AC-10: only the sitting Sheriff has the Sheriff's desk; on their phone it comes first and is open", () => {
    mount(viewOf());
    expect(has('desk-sheriff'), "Lena's phone").toBe(false);
    expect(has('sheriff-desk-b')).toBe(false);
    act(() => root!.unmount());

    mount(brix());
    const tabs = allTestids('desk-', byTestid('desks'));
    expect(tabs[0]).toBe('desk-sheriff');
    expect(openDesk()).toBe('desk-sheriff');
    expect(text('sheriff-head')).toContain('Sheriff');
    expect(text('sheriff-head')).toContain('Only you');
    expect(text('sheriff-left')).toBe('1 investigation left');
  });

  it('S4-C15: every live case folds to one 44 px row with its next step on a chip; fineable first, then the open ones newest first', () => {
    mount(brix());
    expect(caseRows()).toEqual(['w3c8', 'k1m9', 'q7f2']);
    for (const id of caseRows()) {
      expect(tag(`b-case-row-${id}`), id).toBe('BUTTON');
      expect(byTestid(`b-case-row-${id}`).getAttribute('class'), `${id}: a 44 px row`).toContain('min-h-11');
      expect(byTestid(`b-case-row-${id}`).getAttribute('aria-expanded'), `${id}: folded`).toBe('false');
      expect(has(`b-case-body-${id}`), `${id}: no body while folded`).toBe(false);
    }
    expect(text('b-case-row-w3c8')).toBe('Cut: Kai’s energy plotM4Fine Lena');
    expect(text('b-case-row-k1m9')).toBe('Rumour: food upM4Investigate');
    expect(text('b-case-row-q7f2')).toBe('Cut: Ossa’s smithore plotM3Investigate');
    expect(text('b-history-toggle')).toBe('Show 2 closed or cold');
  });

  it('S4-C15: a tap opens one case in place, scrolled into view; opening another folds the first', () => {
    mount(brix());
    tap('b-case-row-q7f2');
    expect(byTestid('b-case-row-q7f2').getAttribute('aria-expanded')).toBe('true');
    expect(text('case-meta-q7f2')).toBe('Month 3 · plot 2·1 · it worked');
    expect(scrolled).toHaveBeenCalledWith({ block: 'nearest' });
    tap('b-case-row-w3c8');
    expect(has('b-case-body-w3c8')).toBe(true);
    expect(has('b-case-body-q7f2'), 'one open at a time').toBe(false);
    expect(text('case-meta-w3c8')).toBe('Month 4 · plot 2·2 · it failed · Your guard caught them.');
    tap('b-case-row-w3c8');
    expect(has('b-case-body-w3c8'), 'a second tap folds it').toBe(false);
  });

  it('S4-C15: a cold case wears no chip: in the closed-or-cold list, only the fined one says how it ended', () => {
    mount(brix());
    expect(has('b-history')).toBe(false);
    tap('b-history-toggle');
    expect(text('b-history-toggle')).toBe('Hide 2 closed or cold');
    expect(text('case-title-p5d1')).toBe('Power cut on Brix’s food plot');
    expect(has('case-chip-p5d1'), 'cold: no chip').toBe(false);
    expect(text('case-chip-z8h4')).toBe('Fined 150 cr');
  });

  it("S4-B-AC-4: Investigate sends {type:'investigate', order}; the verdict comes from the server's next view, and the case keeps its place", () => {
    mount(brix());
    tap('b-case-row-q7f2');
    expect(text('investigate-q7f2')).toBe('Investigate · 1 a month');
    tap('investigate-q7f2');
    expect(sent).toEqual([{ type: 'investigate', order: 'q7f2' }]);
    expect(has('investigate-result-q7f2'), 'no verdict before the server gives one').toBe(false);
    expect(off('investigate-q7f2'), 'no second tap while it is asked').toBe(true);

    // The server's answer: Kai did it, everyone sees it now, and the case can be fined.
    const solved = { ...OPEN_CUT, culprit: 's3', how: 'investigation' as const, investigated: true };
    answer(brix({ investigationsLeft: 0, fineable: ['w3c8', 'q7f2'] }, { politics: { sabotage: { terms: TERMS, incidents: [solved, OPEN_RUMOUR, GUARDED, COLD, CLOSED], sheriff: { guards: 2, investigations: 1, investigationsLeft: 0 } } } }));
    expect(text('investigate-result-q7f2')).toBe('Solved: it was Kai.Everyone sees it now.');
    expect(text('sheriff-left')).toBe('One investigation a month: used');
    expect(text('step-chip-q7f2')).toBe('Fine Kai');
    expect(has('fine-q7f2'), 'fine straight after').toBe(true);
    expect(caseRows(), 'the case keeps its place; only its step changes').toEqual(['w3c8', 'k1m9', 'q7f2']);
  });

  /** A refusal from the server: a toast arrives, then is dismissed after its time, as the client does. */
  function refuse(): void {
    act(() => {
      state = { ...state, toasts: [{ id: 7 }] };
      for (const l of listeners) l();
    });
    act(() => {
      state = { ...state, toasts: [] };
      for (const l of listeners) l();
    });
  }

  it('S4-C15: a refused investigation ends the wait for good, even once its toast is gone', () => {
    mount(brix());
    tap('b-case-row-q7f2');
    tap('investigate-q7f2');
    expect(off('investigate-q7f2')).toBe(true);
    refuse();
    expect(off('investigate-q7f2'), 'the refusal gives the button back').toBe(false);
    expect(text('investigate-q7f2')).toBe('Investigate · 1 a month');
  });

  it('S4-C15: a refused fine ends the wait for good, even once its toast is gone', () => {
    mount(brix());
    tap('b-case-row-w3c8');
    tap('fine-confirm-w3c8');
    expect(off('fine-confirm-w3c8')).toBe(true);
    refuse();
    expect(off('fine-confirm-w3c8'), 'the refusal gives the button back').toBe(false);
  });

  it('S4-B-AC-4: a trail gone cold says so in the case, and its row loses its chip', () => {
    mount(brix());
    tap('b-case-row-k1m9');
    tap('investigate-k1m9');
    expect(sent).toEqual([{ type: 'investigate', order: 'k1m9' }]);
    const cold = { ...OPEN_RUMOUR, investigated: true };
    answer(brix({ investigationsLeft: 0 }, { politics: { sabotage: { terms: TERMS, incidents: [OPEN_CUT, cold, GUARDED, COLD, CLOSED], sheriff: { guards: 2, investigations: 1, investigationsLeft: 0 } } } }));
    expect(text('investigate-result-k1m9')).toBe('The trail went cold.');
    expect(has('step-chip-k1m9')).toBe(false);
    expect(caseRows()).toEqual(['w3c8', 'k1m9', 'q7f2']);
  });

  it('S4-C15: with the month’s investigation used, the head says so and Investigate is off', () => {
    mount(brix({ investigationsLeft: 0 }));
    expect(text('sheriff-left')).toBe('One investigation a month: used');
    tap('b-case-row-q7f2');
    expect(text('investigate-q7f2')).toBe('No investigation left this month');
    expect(off('investigate-q7f2')).toBe(true);
  });

  it("S4-B-AC-3: the fine steps 50 to 300 by 50, says where the money goes and the standard fine if unfined, and sends {type:'fine', order, amount}", () => {
    mount(brix());
    tap('b-case-row-w3c8');
    expect(text('fine-value-w3c8')).toBe('100');
    tap('fine-up-w3c8');
    expect(text('fine-value-w3c8')).toBe('150');
    expect(text('fine-confirm-w3c8')).toBe('Fine Lena 150 cr');
    expect(text('fine-split-w3c8')).toBe(`75 cr to Kai, 75 cr to the colony fund. Not fined by the end of planning: the standard ${POLITICS.sheriff.fine.standard} cr.`);
    tap('fine-down-w3c8');
    tap('fine-down-w3c8');
    expect(text('fine-value-w3c8')).toBe('50');
    expect(off('fine-down-w3c8')).toBe(true);
    for (let i = 0; i < 5; i++) tap('fine-up-w3c8');
    expect(text('fine-value-w3c8')).toBe('300');
    expect(off('fine-up-w3c8')).toBe(true);
    tap('fine-down-w3c8');
    tap('fine-down-w3c8');
    tap('fine-down-w3c8');
    tap('fine-confirm-w3c8');
    expect(sent).toEqual([{ type: 'fine', order: 'w3c8', amount: 150 }]);

    // The server's answer: fined, off the fineable list; the case stays where it was and says so.
    const fined = { ...GUARDED, fine: { due: 150, paid: 150, toVictim: 75, by: 'sheriff' as const } };
    answer(brix({ fineable: [] }, { politics: { sabotage: { terms: TERMS, incidents: [OPEN_CUT, OPEN_RUMOUR, fined, COLD, CLOSED], sheriff: { guards: 2, investigations: 1, investigationsLeft: 1 } } } }));
    expect(text('fined-w3c8')).toBe('Fined Lena 150 cr. Everyone sees it at the month end.');
    expect(text('step-chip-w3c8')).toBe('Fined');
    expect(caseRows()).toEqual(['w3c8', 'k1m9', 'q7f2']);
  });

  it('S4-B-AC-8: under the sabotage ban the fine shows base × the ban, and the intent still sends the base', () => {
    mount(brix({ multiplier: 2 }));
    tap('b-case-row-w3c8');
    expect(text('fine-value-w3c8')).toBe('200');
    expect(text('fine-multiplier-w3c8')).toBe('100 × 2 ban');
    expect(text('fine-split-w3c8')).toContain(`the standard ${POLITICS.sheriff.fine.standard * 2} cr`);
    tap('fine-confirm-w3c8');
    expect(sent).toEqual([{ type: 'fine', order: 'w3c8', amount: 100 }]);
  });

  it("S4-B-AC-3: a rumour's whole fine goes to the colony fund", () => {
    const caught = { ...OPEN_RUMOUR, culprit: 's2', how: 'caught' as const };
    mount(brix({ fineable: ['k1m9'] }, { politics: { sabotage: { terms: TERMS, incidents: [caught], sheriff: { guards: 2, investigations: 1, investigationsLeft: 1 } } } }));
    tap('b-case-row-k1m9');
    expect(text('fine-split-k1m9')).toContain('All 100 cr to the colony fund: a rumour has no victim.');
  });

  it("S4-C15: while the votes are open the desk waits and says why; nothing to tap", () => {
    mount(brix({ canAct: 'votesOpen' }));
    expect(text('sheriff-waits-votesOpen')).toBe('Votes are open. Your guards, investigation and fines wait until they are counted, in case the colony elects someone else.');
    expect(has('b-cases')).toBe(false);
    expect(has('guard-open-map')).toBe(false);
  });

  it('S4-C15: no sabotage yet: the desk says there is nothing to investigate or fine', () => {
    mount(brix({ guards: [], fineable: [] }, { politics: { sabotage: { terms: TERMS, incidents: [], sheriff: { guards: 2, investigations: 1, investigationsLeft: 1 } } } }));
    expect(text('b-no-cases')).toBe('No open case: nothing to investigate or fine.');
    expect(has('b-history-toggle')).toBe(false);
  });

  it('S4-C15: the guards are one row: how many of how many, each plot by owner, and the way to the map', () => {
    mount(brix());
    expect(text('guard-count')).toBe('1/2');
    expect(text('guard-plot-1-0')).toBe('Ossa2·1');
    expect(text('guard-open-map')).toBe('Guard a plot');
    act(() => root!.unmount());
    mount(brix({ guards: [at(1, 0), at(0, 0)] }));
    expect(text('guard-count')).toBe('2/2');
    expect(text('guard-open-map')).toBe('Move guards');
  });
});

describe('S4-C15, P8: guarding on the one map', () => {
  it("S4-B-AC-10: Guard a plot turns the hub's map to Guard under its bar; a tap posts or lifts; Done sends {type:'guard', tiles} and goes back", () => {
    mount(brix());
    expect(has('guard-map')).toBe(false);
    tap('guard-open-map');
    expect(has('guard-map')).toBe(true);
    expect(text('guard-bar-words')).toBe('Guarding · 1 of 2');
    expect(text('guard-back')).toBe('Done · back to Sheriff');
    expect(text('guard-bar')).toContain('Only you');
    expect(plotLabel(1, 0)).toContain('guarded');
    expect(byTestid('map-flag-1-0').getAttribute('data-flag')).toBe('guard');

    tap('map-plot-3-0');
    expect(text('guard-hint')).toBe('Guards stand on players’ plots.');
    tap('map-plot-2-0');
    expect(text('guard-bar-words')).toBe('Guarding · 2 of 2');
    expect(plotLabel(2, 0)).toContain('guarded');
    tap('map-plot-0-0');
    expect(text('guard-hint')).toBe('All 2 guards are out. Tap a guarded plot to lift one.');
    tap('map-plot-1-0');
    expect(text('guard-bar-words')).toBe('Guarding · 1 of 2');
    expect(plotLabel(1, 0)).not.toContain('guarded');
    expect(sent, 'nothing is sent before Done').toEqual([]);

    tap('guard-back');
    expect(sent).toEqual([{ type: 'guard', tiles: [at(2, 0)] }]);
    expect(has('guard-map')).toBe(false);
    expect(openDesk()).toBe('desk-sheriff');
  });

  it('S4-B-AC-6: nobody but the Sheriff sees a guard: no other phone has the Guard map or a guarded plot', () => {
    for (const id of ['s1', 's2', 's3']) {
      mount(viewOf({ id }));
      expect(has('guard-map'), id).toBe(false);
      expect(has('guard-open-map'), id).toBe(false);
      for (const t of TILES) expect(plotLabel(t.x, t.y), `${id} ${t.x}-${t.y}`).not.toContain('guarded');
      act(() => root!.unmount());
      root = null;
    }
  });
});

/** Lena's phone with Look on plot x·y. */
function lookAt(x: number, y: number, seat: Seat = {}): void {
  mount(viewOf(seat));
  tap(`map-plot-${x}-${y}`);
  expect(has('look-plot')).toBe(true);
}

describe('S4-C14, P6: the power cut, under Look on a rival’s plot', () => {
  it("S4-B-AC-10: on a rival's working plot Look offers \"Sabotage this plot · Only you\"; the order shows its terms and sends {type:'sabotage', target}", () => {
    lookAt(1, 0);
    expect(tag('sabotage-door')).toBe('BUTTON');
    expect(text('sabotage-door')).toBe('Sabotage this plotOnly you');
    tap('sabotage-door');
    expect(text('order-effect')).toBe('Ossa’s smithore plot makes nothing this month.');
    expect(text('order-cost')).toBe('120 cr, paid at the month end');
    expect(text('order-success')).toBe('60% of the time');
    expect(text('order-detect')).toContain('30% of the time');
    expect(text('order-caught')).toBe('Your name on every screen, −10 reputation, and a fine.');
    expect(text('order-confirm')).toBe('Order in secret · 120 cr');
    tap('order-confirm');
    expect(sent).toEqual([{ type: 'sabotage', target: { kind: 'powerCut', tile: at(1, 0) } }]);
  });

  it('S4-B-AC-1: on a pact partner’s plot the caught cost adds the broken pact; the ban multiplies the caught loss', () => {
    lookAt(0, 1, { pacts: [pact('s1', 's4')] });
    tap('sabotage-door');
    expect(text('order-caught')).toBe('Your name on every screen, −30 reputation (your pact with Brix), and a fine.');
    act(() => root!.unmount());
    lookAt(1, 0, { politics: { laws: { sabotageBan: { setting: 2, since: 4 } } } });
    tap('sabotage-door');
    expect(text('order-caught')).toBe('Your name on every screen, −20 reputation, ×2 under the ban, and a fine.');
  });

  it('S4-C14: no door on your own plot, a free plot or the store', () => {
    lookAt(0, 0);
    expect(has('sabotage-door'), 'own').toBe(false);
    act(() => root!.unmount());
    lookAt(3, 0);
    expect(has('sabotage-door'), 'free').toBe(false);
  });

  it('S4-C14: an idle plot has no power to cut, and no order button', () => {
    lookAt(2, 0);
    tap('sabotage-door');
    expect(text('order-not-working')).toBe('No MULE works here, so there is no power to cut.');
    expect(has('order-confirm')).toBe(false);
    tap('order-cancel');
    expect(has('order-powercut')).toBe(false);
  });

  it("S4-C14: one order a month: the plot ordered says so with its cost and Withdraw (sends target null); another rival's plot says to withdraw it first", () => {
    const ordered: Sab = { ...NO_ORDER, order: { kind: 'powerCut', tile: at(1, 0) }, owed: 120 };
    lookAt(1, 0, { sabotage: ordered });
    expect(text('order-pending')).toContain('Ordered in secret');
    expect(text('order-pending-words')).toBe('The crew cuts the power when production starts. 120 cr at the month end.');
    tap('order-withdraw');
    expect(sent).toEqual([{ type: 'sabotage', target: null }]);
    tap('map-plot-1-1');
    expect(text('order-pending')).toContain('This month’s order');
    expect(text('order-pending-words')).toBe('You already ordered a power cut on Ossa’s smithore plot. One order a month: withdraw it to order this instead. 120 cr at the month end.');
    expect(has('sabotage-door')).toBe(false);
  });

  it('S4-C14: with sabotage off at the table there is no door', () => {
    lookAt(1, 0, { sabotage: null, politics: { sabotage: null } });
    expect(has('sabotage-door')).toBe(false);
    act(() => root!.unmount());
    lookAt(1, 0, { sabotage: { ...NO_ORDER, canOrder: 'off' } });
    expect(has('sabotage-door')).toBe(false);
  });

  it('S4-C14: out of planning the order is not offered, and says when it is', () => {
    lookAt(1, 0, { sabotage: { ...NO_ORDER, canOrder: 'notPlanning' } });
    tap('sabotage-door');
    expect(text('order-blocked')).toBe('Orders are placed in planning.');
    expect(has('order-confirm')).toBe(false);
  });
});

describe('S4-PR-11: the sitting Sheriff orders no sabotage (Heiko; S4-PR-9 refuses it)', () => {
  it("S4-PR-11: on the Sheriff's phone a rival's working plot has no sabotage door, and the market no rumour door", () => {
    lookAt(1, 0, { id: 's4', sheriff: SHERIFF });
    expect(has('sabotage-door'), 'Look on Ossa’s smithore plot').toBe(false);
    expect(has('order-powercut')).toBe(false);
    tap('desk-market');
    expect(has('rumour-door'), 'at the market').toBe(false);
    expect(has('order-rumour')).toBe(false);
  });

  it("S4-PR-11: at the same table a player who is not the Sheriff still has both doors", () => {
    for (const id of ['s1', 's3']) {
      lookAt(1, 0, { id });
      expect(has('sabotage-door'), id).toBe(true);
      tap('desk-market');
      expect(has('rumour-door'), id).toBe(true);
      act(() => root!.unmount());
      root = null;
    }
  });

  it("S4-PR-11: the Sheriff's own past orders stay listed under Your orders", () => {
    const mine: Sab['mine'] = [{ ...GUARDED, culprit: 's4', public: true, outcome: 'caught' }];
    mount(viewOf({ id: 's4', sheriff: SHERIFF, sabotage: { ...NO_ORDER, mine } }));
    tap('desk-market');
    expect(has('my-order-w3c8')).toBe(true);
    expect(has('rumour-door')).toBe(false);
  });
});

describe('S4-C14, P6: the rumour at the market, and your orders', () => {
  it("S4-C14: the Market desk offers \"Start a rumour · Only you\" on any of the nine goods, up or down, and sends {type:'sabotage', target}", () => {
    mount(viewOf());
    tap('desk-market');
    expect(text('rumour-door')).toBe('Start a rumourOnly you');
    tap('rumour-door');
    expect(allTestids('rumour-good-')).toEqual(GOODS.map((g) => `rumour-good-${g}`));
    expect(text('rumour-confirm')).toBe('Pick a good');
    expect(off('rumour-confirm')).toBe(true);
    tap('rumour-good-food');
    tap('rumour-down');
    expect(byTestid('rumour-good-food').getAttribute('aria-checked')).toBe('true');
    expect(text('rumour-effect')).toBe('Food opens 25% lower at this month’s auction.');
    expect(text('order-cost')).toBe('60 cr, paid at the month end');
    expect(text('order-caught')).toBe('Your name on every screen, −10 reputation, and a fine.');
    tap('rumour-confirm');
    expect(sent).toEqual([{ type: 'sabotage', target: { kind: 'rumour', good: 'food', dir: 'down' } }]);
  });

  it('S4-C14: a power cut already ordered takes the month’s one order: the market shows it with Withdraw', () => {
    mount(viewOf({ sabotage: { ...NO_ORDER, order: { kind: 'powerCut', tile: at(1, 0) }, owed: 120 } }));
    tap('desk-market');
    expect(has('rumour-door')).toBe(false);
    expect(text('order-pending-words')).toContain('You already ordered a power cut on Ossa’s smithore plot.');
    tap('order-withdraw');
    expect(sent).toEqual([{ type: 'sabotage', target: null }]);
  });

  it('S4-C14: "Your orders", newest first: how each came out, and whether anyone knows it was you', () => {
    // As WS7's projection sends them (politics-view.ts mySabotageView): `public` is isPublicOrder (done, caught or
    // culpritPublic), so a cut that worked unseen is public with no `how`; only `how` says the culprit is known.
    const mine: Sab['mine'] = [
      { ...COLD, investigated: false, culprit: 's1', public: true, outcome: 'done' },
      { ...GUARDED, public: true, outcome: 'caught' },
    ];
    mount(viewOf({ sabotage: { ...NO_ORDER, mine } }));
    tap('desk-market');
    expect(allTestids('my-order-', byTestid('my-orders')).filter((id) => !id.includes('known'))).toEqual(['my-order-w3c8', 'my-order-p5d1']);
    expect(text('my-order-w3c8')).toBe('Month 4: power cut on Kai’s plotEveryone knows it was you.Caught');
    expect(text('my-order-known-p5d1'), 'it worked and nobody saw: public, but not who').toBe('Nobody knows it was you.');
  });

  it("S4-C14: this month's pending power cut is in Your orders under its plot's owner (the engine names the victim only when it resolves)", () => {
    const pending: Sab['mine'][number] = { id: 'sab-a1b2c3', month: 5, kind: 'powerCut', victim: null, at: { x: 1, y: 0 }, good: 'smithore', worked: false, culprit: 's1', how: null, investigated: false, fine: null, public: false, outcome: 'pending' };
    mount(viewOf({ sabotage: { ...NO_ORDER, order: { kind: 'powerCut', tile: at(1, 0) }, owed: 120, mine: [pending] } }));
    tap('desk-market');
    expect(text('my-order-sab-a1b2c3')).toBe('Month 5: power cut on Ossa’s plotNobody knows it was you.Ordered');
  });

  it("S4-C14: a pending cut on a plot that has since lost its MULE has no crop (good null on the wire): its row shows no good's icon or name", () => {
    // WS7's #746 types IncidentView.good as Good | null; null only in the orderer's own list, for exactly this case.
    const pending = { id: 'sab-d4e5f6', month: 5, kind: 'powerCut', victim: null, at: { x: 2, y: 0 }, good: null, worked: false, culprit: 's1', how: null, investigated: false, fine: null, public: false, outcome: 'pending' } as unknown as Sab['mine'][number];
    mount(viewOf({ sabotage: { ...NO_ORDER, order: { kind: 'powerCut', tile: at(2, 0) }, owed: 120, mine: [pending] } }));
    tap('desk-market');
    expect(text('my-order-sab-d4e5f6')).toBe('Month 5: power cut on Kai’s plotNobody knows it was you.Ordered');
    expect(byTestid('my-order-sab-d4e5f6').findAll('svg'), "no good's icon").toHaveLength(0);
  });
});

/*
 * SB-4, the tabbed hub's slots (frozen SB-1a.2, 9fdfb927): the Sheriff sub-tab (SHERIFF_SUB) and the Guard pick
 * (GUARD_PICK). The tabbed hub that draws them is SB-2's, not on trunk yet. So these mount the slots' own components
 * under a test TabHubNav (the contract's NAV double) that stands in for the hub: it records each call and draws the
 * pick in place of the sub-tab while one is on, as the hub hands Overview's map to a pick.
 */
describe('SB-4: the Sheriff sub-tab and the Guard pick, for the tabbed hub', () => {
  type TabHubNav = import('../src/phone/hub/slots').TabHubNav;
  type Door = import('../src/phone/hub/slots').Door;
  const calls: unknown[][] = [];
  /** The contract's own double (hub-tab-slots.test.ts's NAV), today's moves included. */
  const NAV = {
    desk: 'colony',
    tool: 'look',
    focus: null,
    openDesk: () => {},
    pickTool: () => {},
    takeFocus: () => {},
    tab: 'overview',
    sub: 'laws',
    pick: null,
    open: (_door: Door) => {},
    startPick: (_id: string) => {},
    endPick: () => {},
  } satisfies TabHubNav;

  /** The stand-in hub: the Sheriff sub-tab, or while a pick is on that pick's map; every nav call recorded. */
  function TestHub(): ReactNode {
    const [pick, setPick] = useState<string | null>(null);
    const [door, setDoor] = useState({ tab: 'politics' as TabHubNav['tab'], sub: 'sheriff' });
    const nav: TabHubNav = {
      ...NAV,
      tab: pick ? 'overview' : door.tab,
      sub: door.sub,
      pick,
      open: (d) => (calls.push(['open', d]), setDoor({ tab: d.tab, sub: d.sub ?? door.sub })),
      startPick: (id) => (calls.push(['startPick', id]), setPick(id)),
      endPick: () => (calls.push(['endPick']), setPick(null)),
    };
    const slot = Sheriff.GUARD_PICK;
    const Body = pick === slot.id ? slot.Map : Sheriff.SHERIFF_SUB.Body;
    return createElement(Sheriff.PickNavProvider, { value: nav, children: createElement(Body) });
  }

  afterEach(() => void (calls.length = 0));

  const seat = (view: MuleView) => ({ view, me: view.me!, self: view.players.find((p) => p.id === view.me!.id)! });

  it('SB-4: the Sheriff sub-tab and the Guard pick are shown only to the seat that holds the office', () => {
    expect(Sheriff.SHERIFF_SUB.show!(seat(brix()))).toBe(true);
    expect(Sheriff.GUARD_PICK.show!(seat(brix()))).toBe(true);
    for (const id of ['s1', 's2', 's3']) {
      expect(Sheriff.SHERIFF_SUB.show!(seat(viewOf({ id }))), id).toBe(false);
      expect(Sheriff.GUARD_PICK.show!(seat(viewOf({ id }))), id).toBe(false);
    }
  });

  it("SB-4: the Guard pick's slot: its bar's verb, its hint, and the way back to the Sheriff sub-tab", () => {
    expect(Sheriff.SHERIFF_SUB.id).toBe('sheriff');
    expect(Sheriff.SHERIFF_SUB.label(seat(brix()))).toBe('Sheriff');
    const { id, label, hint, back, ownBar } = Sheriff.GUARD_PICK;
    expect({ id, label, hint: hint(seat(brix())), back, ownBar }).toEqual({ id: 'guard', label: 'Guarding', hint: 'Tap a plot to guard it', back: { tab: 'politics', sub: 'sheriff', label: 'Sheriff' }, ownBar: true });
  });

  it('SB-4: the sub-tab draws the folded case file; the waits and the case steps are as on the desk', () => {
    mount(brix(), TestHub);
    expect(has('sheriff-desk-b')).toBe(true);
    expect(caseRows()).toEqual(['w3c8', 'k1m9', 'q7f2']);
    tap('b-case-row-q7f2');
    tap('investigate-q7f2');
    expect(sent).toEqual([{ type: 'investigate', order: 'q7f2' }]);
    act(() => root!.unmount());
    mount(brix({ canAct: 'votesOpen' }), TestHub);
    expect(has('sheriff-waits-votesOpen')).toBe(true);
  });

  it("SB-4: Guard a plot starts the pick; a tap posts or lifts; Done sends {type:'guard', tiles}, ends the pick and opens the way back", () => {
    mount(brix(), TestHub);
    tap('guard-open-map');
    expect(calls).toEqual([['startPick', 'guard']]);
    expect(has('guard-map')).toBe(true);
    expect(has('sheriff-desk-b'), 'the pick has the map, not the sub-tab').toBe(false);
    expect(text('guard-bar-words')).toBe('Guarding · 1 of 2');
    expect(text('guard-back')).toBe('Done · back to Sheriff');

    tap('map-plot-2-0');
    expect(text('guard-bar-words')).toBe('Guarding · 2 of 2');
    expect(plotLabel(2, 0)).toContain('guarded');
    tap('map-plot-1-0');
    expect(text('guard-bar-words')).toBe('Guarding · 1 of 2');
    expect(plotLabel(1, 0)).not.toContain('guarded');
    expect(sent, 'nothing is sent before Done').toEqual([]);

    tap('guard-back');
    expect(sent).toEqual([{ type: 'guard', tiles: [at(2, 0)] }]);
    expect(calls.slice(1)).toEqual([['endPick'], ['open', { tab: 'politics', sub: 'sheriff' }]]);
    expect(has('guard-map')).toBe(false);
    expect(has('sheriff-desk-b'), 'back on the Sheriff sub-tab').toBe(true);
  });

  it('SB-4: off the Sheriff seat the sub-tab and the pick draw nothing', () => {
    mount(viewOf(), TestHub);
    expect(has('sheriff-desk-b')).toBe(false);
    expect(has('sheriff-head')).toBe(false);
  });
});
