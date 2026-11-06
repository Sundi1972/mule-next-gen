import { document, FakeElement } from './fake-dom';
import { PRESTIGE, type Good, type PrestigeId } from '@mule/engine';
import type { ColonyCatalogueView, ColonyProjectView, ColonyView, MuleView, MyView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement, type ComponentType } from 'react';
import type { Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';

/*
 * C35, the Colony desk's buttons, mounted in a fake DOM on the real ColonyWithFacts: what each phone sees, and the
 * intent each tap sends. Taps call the handler React gave the element; the fake DOM dispatches no events.
 */

let ClientProvider: typeof import('../src/net/react').ClientProvider;
let PhoneGameProvider: typeof import('../src/phone/game').PhoneGameProvider;
let ColonyWithFacts: typeof import('../src/phone/hub/politics/Colony').ColonyWithFacts;
let ColonyDesk: typeof import('../src/phone/hub/desks').ColonyDesk;
let createRoot: typeof import('react-dom/client').createRoot;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import('react-dom/client'));
  ({ ClientProvider } = await import('../src/net/react'));
  ({ PhoneGameProvider } = await import('../src/phone/game'));
  ({ ColonyWithFacts } = await import('../src/phone/hub/politics/Colony'));
  ({ ColonyDesk } = await import('../src/phone/hub/desks'));
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
  (document.documentElement as unknown as { dataset?: object }).dataset ??= {};
});

const player = (id: string, name: string, slot: number, money = 1000): PlayerView => ({ id, name, isAi: false, color: '', species: 'zipwing', money, worth: 0, lastWorth: null, worthBeforeCut: null, plots: 0, ready: false, doneDeveloping: false, condition: null, colonist: null, slot });
const stock = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };

const politics = (governor: string | null): PoliticsView => ({
  governor,
  sheriff: null,
  term: governor ? [1, 3] : null,
  next: 4,
  baron: null,
  tax: { percent: 5, start: 5, low: 0, high: 10 },
  fund: 840,
  pay: { governor: 50 },
  weights: ['s1', 's2'].map((id) => ({ id, votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } })),
  candidates: { governor: [] },
  promises: {},
  promise: null,
  promiseFrom: null,
  election: null,
});

const me = (held: Partial<Record<Good, number>> = {}): MyView => ({
  id: 's1',
  species: 'zipwing',
  stock: { ...stock, ...held },
  carriedMule: null,
  installedThisTurn: false,
  worthParts: { money: 0, goods: 0, plots: 0, land: 0, mules: 0, muleValue: 0, office: 0, donated: 0, cut: 0 },
  claimsLeft: 0,
  hungry: false,
  sick: false,
  needs: { food: 5, water: 3 },
  monthNeeds: { ...stock, food: 5, water: 3 },
  devEndsAt: null,
  devSeconds: 50,
  produced: null,
  mulePrice: 148,
  outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
  droneOrder: [],
  politics: { running: null, ballot: {}, canRun: { governor: 'closed' }, paid: 0, reputation: 50 },
});

/** A project at `stage`, from the engine's row, with what is in so far. */
function project(id: PrestigeId, stage: ColonyProjectView['stage'], extra: Partial<ColonyProjectView> = {}): ColonyProjectView {
  const row = PRESTIGE[id];
  return {
    id,
    name: row.name,
    stage,
    cost: { credits: row.credits, goods: { ...row.goods } },
    funded: { credits: 0, goods: {} },
    buildMonths: row.buildMonths,
    monthsLeft: null,
    plot: null,
    prestige: row.prestige,
    upkeep: row.upkeep,
    repairCost: stage === 'damaged' ? row.repairCost : null,
    plaque: [],
    maxBid: null,
    ...extra,
  };
}

/** The catalogue as the server words it: `refused` maps a row to its `why`. */
function catalogue(refused: Partial<Record<PrestigeId, string>> = {}): ColonyCatalogueView[] {
  return (Object.keys(PRESTIGE) as PrestigeId[]).map((id) => {
    const row = PRESTIGE[id];
    const why = refused[id] ?? null;
    return { id, name: row.name, credits: row.credits, goods: { ...row.goods }, buildMonths: row.buildMonths, needsPlot: row.needsPlot, prestige: row.prestige, upkeep: row.upkeep, commissionable: why === null, why };
  });
}

/** Not the config's: a store whose prices have moved, so a preview that ignored the view would show it. */
const REF_PRICE: Partial<Record<Good, number>> = { alloy: 120, electronics: 230, crystite: 105 };

const colonyOf = (projects: ColonyProjectView[], extra: Partial<ColonyView> = {}): ColonyView => ({
  gauges: { wealth: 4000, environment: 22, prestige: 0, happiness: null, band: null },
  lastGauges: null,
  fund: 840,
  ledger: null,
  projects,
  catalogue: catalogue(),
  refPrice: REF_PRICE,
  strike: null,
  score: null,
  ...extra,
});

/** Lena's (s1) view, Ossa (s2) beside her; `governor` holds the office. */
function game(colony: ColonyView | null, opts: { governor?: string | null; money?: number; held?: Partial<Record<Good, number>>; politicsOn?: boolean } = {}): MuleView {
  const { governor = 's1', money = 1000, held = {}, politicsOn = true } = opts;
  return {
    finished: false,
    month: 2,
    maxMonths: 12,
    phase: 'planning',
    phaseEndsAt: null,
    width: 1,
    height: 1,
    tiles: [],
    lit: null,
    players: [player('s1', 'Lena', 0, money), player('s2', 'Ossa', 1)],
    me: me(held),
    market: [],
    storeMules: 0,
    mulePrice: 0,
    colonists: 0,
    air: { level: 22, band: 'clean' },
    lastAir: null,
    colonistsFed: null,
    ship: { arrives: 3, inPort: false, wants: null },
    treasury: { money: 0, salesTax: 0.05 },
    news: [],
    scores: null,
    auction: null,
    listings: [],
    lotSlots: { used: 0, max: 4 },
    landAuction: null,
    production: null,
    politics: politicsOn ? politics(governor) : null,
    colony,
  };
}

const sent: unknown[] = [];
const client = {
  subscribe: () => () => {},
  getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
  serverNow: () => 0,
  intent: (intent: unknown) => void sent.push(intent),
} as unknown as TableClient;

const tableOf = (view: MuleView): TableView<MuleView> => ({
  code: 'MULE',
  status: 'playing',
  hostId: 's1',
  seats: view.players.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })),
  boards: 1,
  game: view,
});

const onPhone = (view: MuleView, screen: ComponentType) =>
  createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: { table: tableOf(view), view, me: view.me!, self: view.players[0]!, slot: 0 as Slot }, children: createElement(screen) }) });

let root: Root | null = null;
let host: FakeElement;

function mount(view: MuleView): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host as unknown as HTMLElement);
  act(() => root!.render(onPhone(view, ColonyWithFacts)));
}

/** Draws the mounted desk again from a new view, as a broadcast does. */
function rerender(view: MuleView): void {
  act(() => root!.render(onPhone(view, ColonyWithFacts)));
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

const has = (testid: string) => findTestid(testid) !== undefined;
const text = (testid: string) => byTestid(testid).textContent.replace(/\s+/g, ' ').trim();
const off = (testid: string) => byTestid(testid).getAttribute('disabled') !== null;

function tap(testid: string): void {
  const el = byTestid(testid);
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  expect(key, 'a React element').toBeDefined();
  act(() => (el as unknown as Record<string, Record<string, () => void>>)[key!]!.onClick!());
}

describe('C35: the Governor commissions a project (B-AC-35-1)', () => {
  it('B-AC-35-1: the Governor sees "Commission a project"; the list shows every catalogue row with cost, months, plot, prestige and upkeep', () => {
    mount(game(colonyOf([])));
    expect(text('commission-open')).toBe('Commission a project');
    tap('commission-open');
    for (const id of Object.keys(PRESTIGE) as PrestigeId[]) {
      const row = PRESTIGE[id];
      const shown = text(`cat-${id}`);
      expect(shown, id).toContain(row.name);
      expect(text(`cat-cost-${id}`), id).toContain(`${row.credits.toLocaleString('en')} cr`);
      for (const [, n] of Object.entries(row.goods)) expect(text(`cat-cost-${id}`), id).toContain(String(n));
      expect(shown, id).toContain(`${row.buildMonths} month${row.buildMonths > 1 ? 's' : ''} to build`);
      expect(shown, id).toContain(`+${row.prestige} prestige`);
      expect(shown, id).toContain(`upkeep ${row.upkeep} cr a month`);
      expect(shown.includes('Needs a plot'), id).toBe(row.needsPlot);
    }
  });

  it("B-AC-35-1: a row that isn't commissionable is disabled and shows the server's why, as the engine words it", () => {
    mount(game(colonyOf([], { catalogue: catalogue({ observatory: 'The colony already has a Observatory', stadium: 'The colony funds one project at a time' }) })));
    tap('commission-open');
    expect(off('cat-observatory')).toBe(true);
    expect(text('cat-why-observatory')).toBe('The colony already has a Observatory');
    expect(off('cat-stadium')).toBe(true);
    expect(text('cat-why-stadium')).toBe('The colony funds one project at a time');
    expect(off('cat-park')).toBe(false);
    expect(has('cat-why-park')).toBe(false);
  });

  it("B-AC-35-1: picking a row and Commission sends {type:'commission', id}", () => {
    mount(game(colonyOf([])));
    tap('commission-open');
    tap('cat-park');
    expect(text('commission-confirm-line')).toBe('Commission the Park: 420 cr and 2 Alloy, from the fund and donations');
    tap('commission-go');
    expect(sent).toEqual([{ type: 'commission', id: 'park' }]);
    expect(has('commission-news'), 'no news before the server has the project').toBe(false);
    // Refused: the server's next view still has no park, so still no news.
    rerender(game(colonyOf([])));
    expect(has('commission-news'), 'no news for a refused commission').toBe(false);
    rerender(game(colonyOf([project('park', 'commissioned')])));
    expect(text('commission-news')).toBe('News: Lena commissions a Park');
  });

  it('B-AC-35-1: a phone that is not the Governor has no Commission button', () => {
    mount(game(colonyOf([]), { governor: 's2' }));
    expect(has('commission-open')).toBe(false);
    expect(has('colony-desk-card')).toBe(true);
  });
});

describe('C35: anyone donates through the chips (B-AC-35-2)', () => {
  /** The park collecting: 100 of 420 cr in, no alloy yet, Lena 70 cr on its plaque. */
  const park = () => project('park', 'commissioned', { funded: { credits: 100, goods: {} }, plaque: [{ playerId: 's1', value: 70 }] });

  it('B-AC-35-2: a phone that is not the Governor sees Donate on a collecting project, and its chips', () => {
    mount(game(colonyOf([park()]), { governor: 's2', held: { alloy: 1 } }));
    tap('donate-park');
    expect(has('donate-chips')).toBe(true);
    expect(text('donate-missing')).toBe('needs 320 cr · 2 Alloy');
  });

  it('B-AC-35-2: "the rest" is the missing credits when the donor has more', () => {
    mount(game(colonyOf([park()]), { money: 1000 }));
    tap('donate-park');
    expect(text('chip-cr-rest')).toBe('the rest (320)');
  });

  it('B-AC-35-2: "the rest" is all the donor has when that is less than what is missing', () => {
    mount(game(colonyOf([park()]), { money: 200 }));
    tap('donate-park');
    expect(text('chip-cr-rest')).toContain('(200)');
    tap('chip-cr-rest');
    tap('donate-give');
    expect(sent).toEqual([{ type: 'donate', id: 'park', credits: 200 }]);
  });

  it('B-AC-35-2: a good chip shows only for a good the project is missing and the donor holds', () => {
    // Lena holds alloy (the park needs it) and electronics (it doesn't).
    mount(game(colonyOf([park()]), { held: { alloy: 1, electronics: 3 } }));
    tap('donate-park');
    expect(has('chip-good-alloy')).toBe(true);
    expect(has('chip-good-electronics')).toBe(false);
  });

  it('B-AC-35-2: no good chip for a missing good the donor does not hold', () => {
    mount(game(colonyOf([park()]), { held: {} }));
    tap('donate-park');
    expect(has('chip-good-alloy')).toBe(false);
  });

  it('B-AC-35-2: no good chip once the project has all of that good in', () => {
    mount(game(colonyOf([project('park', 'commissioned', { funded: { credits: 100, goods: { alloy: 2 } } })]), { held: { alloy: 4 } }));
    tap('donate-park');
    expect(has('chip-good-alloy')).toBe(false);
  });

  it("B-AC-35-2: the preview's plaque is the old value + credits + units × the view's reference price, and Give sends {type:'donate', id, credits, goods}", () => {
    mount(game(colonyOf([park()]), { held: { alloy: 1 } }));
    tap('donate-park');
    tap('chip-cr-100');
    tap('chip-good-alloy');
    // 70 + 100 + 1 × 120 (the view's refPrice for alloy, not the config's 90).
    expect(text('donate-preview')).toBe('Your plaque: 70 → 290 cr · counts toward your vote weight');
    expect(text('donate-give')).toBe('Give 100 cr and 1 Alloy');
    tap('donate-give');
    expect(sent).toEqual([{ type: 'donate', id: 'park', credits: 100, goods: { alloy: 1 } }]);
  });

  it('B-AC-35-2: "Other…" opens the steppers, each capped: credits at the rest, a good at the least of held and missing', () => {
    mount(game(colonyOf([park()]), { money: 1000, held: { alloy: 1 } }));
    tap('donate-park');
    tap('chip-other');
    expect(has('donate-steppers')).toBe(true);
    for (let i = 0; i < 100 && !off('step-cr-up'); i++) tap('step-cr-up');
    expect(text('step-cr-value')).toBe('320 cr');
    tap('step-alloy-up');
    expect(off('step-alloy-up'), 'Lena holds 1 alloy of the 2 missing').toBe(true);
    expect(text('step-alloy-value')).toBe('1');
    // 70 + 320 + 1 × 120.
    expect(text('donate-preview')).toContain('70 → 510 cr');
    tap('donate-give');
    expect(sent).toEqual([{ type: 'donate', id: 'park', credits: 320, goods: { alloy: 1 } }]);
  });

  it('B-AC-35-2: Give is off with nothing picked', () => {
    mount(game(colonyOf([park()])));
    tap('donate-park');
    expect(off('donate-give')).toBe(true);
    expect(text('donate-preview')).toBe('Give at least 1 cr or 1 unit');
  });
});

describe("C35: the Governor's site bid (B-AC-35-3)", () => {
  const park = (maxBid: number | null = null) => project('park', 'commissioned', { maxBid });

  it('B-AC-35-3: a chip and Set send setSiteBid {id, maxBid}', () => {
    mount(game(colonyOf([park()])));
    expect(text('bid-line-park')).toBe('No plot yet, and the colony doesn’t bid for one');
    tap('bid-open-park');
    tap('bid-chip-200');
    tap('bid-set');
    expect(sent).toEqual([{ type: 'setSiteBid', id: 'park', maxBid: 200 }]);
  });

  it('B-AC-35-3: "Other…" opens a stepper; its figure is what Set sends', () => {
    mount(game(colonyOf([park()])));
    tap('bid-open-park');
    tap('bid-chip-other');
    tap('bid-step-up');
    tap('bid-set');
    expect(sent).toEqual([{ type: 'setSiteBid', id: 'park', maxBid: 325 }]);
  });

  it('B-AC-35-3: "No bid" sends null', () => {
    mount(game(colonyOf([park(300)])));
    tap('bid-open-park');
    tap('bid-chip-none');
    tap('bid-set');
    expect(sent).toEqual([{ type: 'setSiteBid', id: 'park', maxBid: null }]);
  });

  it.each([['s1'], ['s2']])('B-AC-35-3: once set, the row says "Bids up to N cr at the land auction" (governor %s)', (governor) => {
    mount(game(colonyOf([park(300)]), { governor }));
    expect(text('bid-line-park')).toBe('Bids up to 300 cr at the land auction');
  });

  it('B-AC-35-3: only the Governor can set it', () => {
    mount(game(colonyOf([park()]), { governor: 's2' }));
    expect(has('bid-open-park')).toBe(false);
  });

  it('B-AC-35-3: a hospital needs no plot, so no bid line and no bid button', () => {
    mount(game(colonyOf([project('hospital', 'commissioned')])));
    expect(has('donate-hospital')).toBe(true);
    expect(has('bid-hospital')).toBe(false);
    expect(has('bid-line-hospital')).toBe(false);
  });

  it('B-AC-35-3: a park that has its plot has no bid line', () => {
    mount(game(colonyOf([project('park', 'commissioned', { plot: 12 })])));
    expect(has('bid-park')).toBe(false);
  });
});

describe('C35: the Governor repairs (B-AC-35-4)', () => {
  it("B-AC-35-4: a damaged row shows the fund after the repair and Repair sends {type:'repair', id}", () => {
    mount(game(colonyOf([project('park', 'damaged')], { fund: 840 })));
    expect(text('repair-fund-park')).toBe('Fund 840 → 690 cr');
    expect(off('repair-button-park')).toBe(false);
    tap('repair-button-park');
    expect(sent).toEqual([{ type: 'repair', id: 'park' }]);
    // At the boundary: a fund of exactly the repair's cost can pay it.
    rerender(game(colonyOf([project('park', 'damaged')], { fund: PRESTIGE.park.repairCost })));
    expect(off('repair-button-park'), 'fund === cost').toBe(false);
    expect(has('repair-short-park')).toBe(false);
    tap('repair-button-park');
    expect(sent).toEqual([{ type: 'repair', id: 'park' }, { type: 'repair', id: 'park' }]);
  });

  it("B-AC-35-4: when the fund can't afford it the button is off, with RULE-21's words", () => {
    mount(game(colonyOf([project('park', 'damaged')], { fund: 100 })));
    expect(off('repair-button-park')).toBe(true);
    expect(text('repair-short-park')).toBe('The fund has 100 cr; the repair costs 150 cr');
  });

  it('B-AC-35-4: only the Governor sees Repair', () => {
    mount(game(colonyOf([project('park', 'damaged')]), { governor: 's2' }));
    expect(has('repair-park')).toBe(false);
  });

  it('B-AC-35-4: a closed row has no button, only "Reopens when the fund pays its upkeep"', () => {
    mount(game(colonyOf([project('park', 'closed')])));
    expect(text('closed-line-park')).toBe('Reopens when the fund pays its upkeep');
    expect(has('repair-button-park')).toBe(false);
    expect(has('donate-park')).toBe(false);
  });

  it('B-AC-35-4: standing and building rows have no buttons', () => {
    mount(game(colonyOf([project('park', 'standing'), project('hospital', 'building', { monthsLeft: 1 })])));
    expect(has('actions-park')).toBe(false);
    expect(has('actions-hospital')).toBe(false);
    expect(has('repair-park')).toBe(false);
  });
});

describe('C35: with politics off (B-AC-35-5)', () => {
  const draw = (view: MuleView, screen: ComponentType) => renderToStaticMarkup(onPhone(view, screen));

  it("B-AC-35-5: with politics off (colony null) the Colony desk is today's", () => {
    const view = game(null, { politicsOn: false });
    expect(draw(view, ColonyWithFacts)).toBe(draw(view, ColonyDesk));
    expect(draw(view, ColonyWithFacts)).not.toContain('commission-open');
  });

  it('B-AC-35-5: with politics on but no colony, the Governor has no Commission button', () => {
    expect(draw(game(null), ColonyWithFacts)).not.toContain('commission-open');
  });
});
