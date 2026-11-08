import { document, FakeElement } from './fake-dom';
import type { ElectionView, MuleView, MyView, PlayerView, PoliticsView, TableView, TileView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import type { PlotPickSlot, TabHubNav as HubNav, TabHubSlots } from '../src/phone/hub/slots';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * SB-2: the planning hub as tabs (the approved hub-tabs mock), mounted in a fake DOM with the real slots: Overview ·
 * Council (Governor) · Colony · Talk, the one map, the "?" sheet, and the doors today's desks and tools open, which must
 * land on their tab, sub-tab or tool. Taps call the handler React gave the element; the fake DOM dispatches no events.
 */

let ClientProvider: typeof import('../src/net/react').ClientProvider;
let PhoneGameProvider: typeof import('../src/phone/game').PhoneGameProvider;
let Hub: ComponentType<{ slots: TabHubSlots }>;
let TAB_SLOTS: TabHubSlots;
let useHub: () => HubNav;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ({ ClientProvider } = await import('../src/net/react'));
  ({ PhoneGameProvider } = await import('../src/phone/game'));
  const hub = await import('../src/phone/hub/Hub');
  Hub = hub.Hub as unknown as ComponentType<{ slots: TabHubSlots }>;
  useHub = hub.useHub as unknown as () => HubNav;
  ({ TAB_SLOTS } = (await import('../src/phone/hub/today')) as unknown as { TAB_SLOTS: TabHubSlots });
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
const PLAYERS: PlayerView[] = [aPlayer({ id: 's1', name: 'Lena', slot: 0, worth: 2_000 }), aPlayer({ id: 's2', name: 'Brix', slot: 1, worth: 3_000 }), aPlayer({ id: 's3', name: 'Kai', slot: 2, worth: 1_000 })];
const TILES: TileView[] = [0, 1, 2, 3].map((x) => ({ x, y: 0, terrain: 'plains', peaks: 0, owner: x === 3 ? 's2' : null, outfit: null, pollution: 0, filter: false }));

const politics = (extra: Partial<PoliticsView> = {}): PoliticsView => ({
  governor: 's2',
  sheriff: null,
  term: [4, 6],
  next: 7,
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

/** Lena's phone (or `self`'s): 2 Food against a need of 5, so This month carries what she is short of. */
function game({ self = 's1', pol = politics() }: { self?: string; pol?: PoliticsView | null } = {}): MuleView {
  const me: MyView = {
    id: self,
    species: 'zipwing',
    stock: { ...NO_GOODS, food: 2 },
    carriedMule: null,
    installedThisTurn: false,
    worthParts: { money: 1_000, goods: 100, plots: 3, land: 900, mules: 0, muleValue: 0, office: 0, donated: 0, cut: 0 },
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
    politics: pol && { running: null, ballot: {}, canRun: { governor: true }, paid: 0, reputation: 50 },
  };
  return aMuleView({ month: 5, width: 4, height: 1, tiles: TILES, players: PLAYERS, me, politics: pol });
}

const STATE = { status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
const client = { subscribe: () => () => {}, getState: () => STATE, serverNow: () => 0, intent: () => {} } as unknown as TableClient;

let root: Root | null = null;
let host: FakeElement;
/** The hub's navigation as its components last saw it, from a probe in the rail under Now (drawn on every tab). */
let nav: HubNav | null = null;
function Probe() {
  nav = useHub();
  return null;
}
const withProbe = (slots: TabHubSlots): TabHubSlots => ({ ...slots, underNow: [...slots.underNow, { id: 'probe', Body: Probe }] });

const onPhone = (view: MuleView, slots: TabHubSlots) => {
  const self = view.players.find((p) => p.id === view.me!.id)!;
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', boards: 1, game: view, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) };
  return createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: { table, view, me: view.me!, self, slot: self.slot as Slot }, children: createElement(Hub, { slots: withProbe(slots) }) }) });
};

function mount(view: MuleView, slots: TabHubSlots = TAB_SLOTS): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host as unknown as HTMLElement);
  act(() => root!.render(onPhone(view, slots)));
}
const rerender = (view: MuleView, slots: TabHubSlots = TAB_SLOTS) => act(() => root!.render(onPhone(view, slots)));

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  root = null;
  nav = null;
});

function findTestid(testid: string, node: FakeElement = host): FakeElement | undefined {
  if (node.getAttribute('data-testid') === testid) return node;
  for (const child of node.childNodes) {
    const hit = child instanceof FakeElement ? findTestid(testid, child) : undefined;
    if (hit) return hit;
  }
  return undefined;
}
function byTestid(testid: string, under: FakeElement = host): FakeElement {
  const found = findTestid(testid, under);
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
const selected = (testid: string) => byTestid(testid).getAttribute('aria-selected') === 'true';
const pressed = (testid: string) => byTestid(testid).getAttribute('aria-pressed') === 'true';
/** The planning tabs, in their order. */
const tabs = () => byTestid('tabs-a').findAll('button').map((b) => b.getAttribute('data-testid'));
const go = (move: (n: HubNav) => void) => act(() => move(nav!));

describe('the tabbed planning hub (SB-2)', () => {
  it('B-AC-14 (D3, D5): planning opens on Overview, its tabs Overview · Council · Colony · Talk in that order, with the tool row, the map and This month on its stage', () => {
    mount(game());
    expect(tabs()).toEqual(['tab-overview', 'tab-politics', 'tab-colony', 'tab-talk']);
    expect(['tab-overview', 'tab-politics', 'tab-colony', 'tab-talk'].map(text)).toEqual(['Overview', 'Council', 'Colony', 'Talk']);
    expect(selected('tab-overview')).toBe(true);
    const stage = byTestid('tab-body-overview');
    for (const part of ['map-tools', 'hub-map', 'agenda']) byTestid(part, stage);
    expect(findTestid('desks'), "today's desk tabs are gone").toBeUndefined();
  });

  it("B-AC-14 (D3): the Governor's phone names the tab Governor; with politics off there is no such tab", () => {
    mount(game({ self: 's2' }));
    expect(text('tab-politics')).toBe('Governor');
    rerender(game({ pol: null }));
    expect(tabs()).toEqual(['tab-overview', 'tab-colony', 'tab-talk']);
  });

  it("B-AC-14 (D5): This month has a row for each door into a tab (what you are short of into Colony) and none for a map tool's own door; a row opens its tab", () => {
    mount(game());
    expect(text('agenda-needs')).toContain('Short 3 Food');
    expect(text('agenda-needs-tab')).toBe('Colony');
    expect(findTestid('agenda-drone'), "the drone's door is the tool row's").toBeUndefined();
    expect(findTestid('agenda-list'), "the Sell tool's door is the tool row's").toBeUndefined();
    tap('agenda-needs');
    expect(selected('tab-colony')).toBe(true);
    byTestid('tab-body-colony');
  });

  // [the door today's code opens, on whose phone, where it must land]
  it.each<[string, (n: HubNav) => void, string, { tab: string; sub?: string; tool?: string; focus?: string | null }]>([
    ["openDesk('colony')", (n) => n.openDesk('colony'), 's1', { tab: 'colony' }],
    ["openDesk('talk', 'whisper:s2')", (n) => n.openDesk('talk', 'whisper:s2'), 's1', { tab: 'talk', focus: 'whisper:s2' }],
    ["openDesk('council', 'run')", (n) => n.openDesk('council', 'run'), 's1', { tab: 'politics', sub: 'council', focus: 'run' }],
    ["openDesk('governor') on the Governor's phone", (n) => n.openDesk('governor'), 's2', { tab: 'politics', sub: 'governor' }],
    ["openDesk('market')", (n) => n.openDesk('market'), 's1', { tab: 'overview', tool: 'list' }],
    ["pickTool('drone')", (n) => n.pickTool('drone'), 's1', { tab: 'overview', tool: 'drone' }],
  ])("C17 (DESK_DOORS): today's %s lands on its tab, sub-tab or tool", (_door, move, self, to) => {
    mount(game({ self }));
    go((n) => n.open({ tab: 'talk' }));
    go(move);
    expect(selected(`tab-${to.tab}`), `the ${to.tab} tab is open`).toBe(true);
    expect(nav!.tab).toBe(to.tab);
    if (to.sub) expect(selected(`sub-${to.sub}`), `the ${to.sub} sub-tab is open`).toBe(true);
    if (to.tool) expect(pressed(`tool-${to.tool}`), `the ${to.tool} tool is on`).toBe(true);
    if (to.focus !== undefined) expect(nav!.focus).toBe(to.focus);
  });

  it("C17 (D6): startPick hands Overview's one map to the pick, its bar in place of the tool row; Back returns to its door, and endPick ends it", () => {
    const Map = () => createElement('div', { 'data-testid': 'test-pick-map' });
    const pick: PlotPickSlot = { id: 'test', label: 'Picking', hint: () => 'tap a plot', back: { tab: 'colony', label: 'Colony' }, Map };
    const slots = { ...TAB_SLOTS, picks: [pick] };
    mount(game(), slots);
    go((n) => n.open({ tab: 'colony' }));
    go((n) => n.startPick('test'));
    expect(selected('tab-overview')).toBe(true);
    expect(nav!.pick).toBe('test');
    expect(text('pick-bar-test')).toContain('Picking');
    byTestid('test-pick-map', byTestid('hub-map'));
    expect(findTestid('map-tools'), 'the tool row gives way to the pick').toBeUndefined();
    tap('pick-back');
    expect(selected('tab-colony'), 'Back goes where the pick came from').toBe(true);
    expect(nav!.pick).toBeNull();
    go((n) => n.startPick('test'));
    go((n) => n.endPick());
    expect(nav!.pick).toBeNull();
    byTestid('map-tools');
    expect(findTestid('test-pick-map')).toBeUndefined();
  });

  it('B-AC-12 (D1, D2): every tab keeps the phase line and the Now line with its "?"; the "?" opens the month in full (its steps, Now, what you need) and Close shuts it', () => {
    mount(game());
    for (const t of ['overview', 'politics', 'colony', 'talk']) {
      tap(`tab-${t}`);
      for (const part of ['phase-line', 'now', 'help-open']) byTestid(part);
    }
    expect(findTestid('roadmap'), 'the stage-top card is gone from the stage').toBeUndefined();
    tap('help-open');
    const sheet = byTestid('help-sheet');
    for (const part of ['roadmap', 'help-now', 'needs-strip']) byTestid(part, sheet);
    tap('help-close');
    expect(findTestid('help-sheet')).toBeUndefined();
  });

  it('E-9 (D8): the sub-tab that asks first is the one the tab opens on; from another tab the Now line is a door to it, and a sub-tab picked away from it stays', () => {
    mount(game({ self: 's2' }));
    expect(selected('tab-overview')).toBe(true);
    tap('now-go');
    expect(selected('tab-politics')).toBe(true);
    expect(selected('sub-governor')).toBe(true);
    tap('sub-council');
    rerender(game({ self: 's2' }));
    expect(selected('sub-council'), 'once picked away, the asking sub-tab does not take it back').toBe(true);
  });

  it('C66 (frame, until SB-3 moves the ballots): a ballot stage takes the whole stage, the tabs hidden', () => {
    const ballot: ElectionView = { stage: 'ballot', ceremony: null, candidates: { governor: ['s2', 's3'] }, promises: {}, voted: [], done: [], waitingFor: ['s1', 's2', 's3'], result: {} };
    mount(game({ pol: politics({ election: ballot, next: 5 }) }));
    byTestid('hub-situation');
    expect(findTestid('tabs-a')).toBeUndefined();
  });
});
