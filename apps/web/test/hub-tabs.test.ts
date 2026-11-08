import { document, FakeElement } from './fake-dom';
import { ceremonyBeats, type ElectionResult } from '@mule/engine';
import type { CouncilView, ElectionView, OverruleView, MuleView, MyView, PlayerView, PoliticsView, TableView, TileView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import type { AgendaSlot, HubNav, PlotPickSlot, ReadyBarWords, TabHubSlots } from '../src/phone/hub/slots';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * SB-2: the planning hub as tabs (the approved hub-tabs mock), mounted in a fake DOM with the real slots: Overview ·
 * Council (Governor) · Colony · Talk, the one map, the "?" sheet, and the doors today's desks and tools open, which must
 * land on their tab, sub-tab or tool. Taps call the handler React gave the element; the fake DOM dispatches no events.
 */

let ClientProvider: typeof import('../src/net/react').ClientProvider;
let PhoneGameProvider: typeof import('../src/phone/game').PhoneGameProvider;
let Hub: ComponentType<{ slots: TabHubSlots }>;
let TodayState: typeof import('../src/phone/hub/state').TodayState;
let TAB_SLOTS: TabHubSlots;
let useHub: () => HubNav;
let DESK_DOORS: typeof import('../src/phone/hub/Hub').DESK_DOORS;
let OFFICES_BANNER: typeof import('../src/phone/hub/politics/slots').OFFICES_BANNER;
let OVERRULE_CALL_LINE: typeof import('../src/phone/hub/politics/budget/OverruleCall').OVERRULE_CALL_LINE;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ({ ClientProvider } = await import('../src/net/react'));
  ({ PhoneGameProvider } = await import('../src/phone/game'));
  ({ TodayState } = await import('../src/phone/hub/state'));
  const hub = await import('../src/phone/hub/Hub');
  Hub = hub.Hub as unknown as ComponentType<{ slots: TabHubSlots }>;
  useHub = hub.useHub as unknown as () => HubNav;
  DESK_DOORS = hub.DESK_DOORS;
  ({ OFFICES_BANNER } = await import('../src/phone/hub/politics/slots'));
  ({ OVERRULE_CALL_LINE } = await import('../src/phone/hub/politics/budget/OverruleCall'));
  ({ TAB_SLOTS } = (await import('../src/phone/hub/today')) as unknown as { TAB_SLOTS: TabHubSlots });
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
  // A browser's element scrolls itself into view (Talk's chat does on mount); the fake DOM's does nothing.
  (FakeElement.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView ??= () => {};
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
function game({ self = 's1', pol = politics(), sheriff = false, month = 5, mine = {} }: { self?: string; pol?: PoliticsView | null; sheriff?: boolean; month?: number; mine?: Partial<NonNullable<MyView['politics']>> } = {}): MuleView {
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
    politics: pol && {
      running: null,
      ballot: {},
      canRun: { governor: true },
      paid: 0,
      reputation: 50,
      ...mine,
      ...(sheriff ? { sheriff: { canAct: true as const, guards: [], max: 2, investigationsLeft: 1, fineable: [], steps: [], multiplier: 1 } } : {}),
    },
  };
  return aMuleView({ month, width: 4, height: 1, tiles: TILES, players: PLAYERS, me, politics: pol });
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
  return createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: { table, view, me: view.me!, self, slot: self.slot as Slot }, children: createElement(TodayState, { children: createElement(Hub, { slots: withProbe(slots) }) }) }) });
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
/** Every testid under `node`, in document order. */
const testidsIn = (node: FakeElement): (string | null)[] => node.childNodes.flatMap((c) => (c instanceof FakeElement ? [c.getAttribute('data-testid'), ...testidsIn(c)] : []));
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

  it('C66, E-1 (D5): "Throw your hat in the ring" leads This month, strong, a door into Elections that opens the promise', () => { // trace-allow: an existing test whose title changed with SB-3 (its door or stage moved into a sub-tab); its id was never an AC id
    mount(game());
    const rows = byTestid('agenda-box').findAll('button').map((b) => b.getAttribute('data-testid'));
    expect(rows[0]).toBe('agenda-run');
    expect(byTestid('agenda-run').getAttribute('class')).toMatch(/border-holo bg-holo-soft/);
    expect(text('agenda-run-tab')).toBe('Council');
    tap('agenda-run');
    expect(selected('sub-elections')).toBe(true);
    byTestid('promise-sheet');
  });

  it('B-AC-14 (D5, #751): This month is always two lines of two: a quiet line when nothing waits, four rows at most, and past four three rows and "+N more" naming the rest, which pages to them and back', () => {
    const row = (key: string): AgendaSlot => ({ key, title: () => `Title ${key}`, sub: () => '', opens: { desk: 'colony' } });
    const rows = () => byTestid('agenda-box').findAll('button').map((b) => b.getAttribute('data-testid'));
    mount(game(), { ...TAB_SLOTS, agenda: [] });
    expect(text('agenda-empty')).toBe('Nothing waits on you this month.');
    expect(rows()).toEqual([]);
    rerender(game(), { ...TAB_SLOTS, agenda: ['a', 'b', 'c', 'd'].map(row) });
    expect(findTestid('agenda-empty')).toBeUndefined();
    expect(rows()).toEqual(['agenda-a', 'agenda-b', 'agenda-c', 'agenda-d']);
    rerender(game(), { ...TAB_SLOTS, agenda: ['a', 'b', 'c', 'd', 'e'].map(row) });
    expect(rows()).toEqual(['agenda-a', 'agenda-b', 'agenda-c', 'agenda-more']);
    expect(text('agenda-more')).toBe('+2 moreTitle d · Title e');
    tap('agenda-more');
    expect(rows()).toEqual(['agenda-d', 'agenda-e', 'agenda-back']);
    tap('agenda-back');
    expect(rows()[0]).toBe('agenda-a');
    expect(byTestid('agenda-box').getAttribute('class'), 'the height is the box\'s, never its rows\'').toMatch(/\bh-19\b.*grid-rows-2|grid-rows-2.*\bh-19\b/);
  });

  // [the door today's code opens, on whose phone, where it must land]
  it.each<[string, (n: HubNav) => void, string, { tab: string; sub?: string; tool?: string; focus?: string | null; shows?: string }]>([
    ["openDesk('colony')", (n) => n.openDesk('colony'), 's1', { tab: 'colony' }],
    ["openDesk('talk', 'whisper:s2')", (n) => n.openDesk('talk', 'whisper:s2'), 's1', { tab: 'talk', focus: 'whisper:s2' }],
    // On the Governor's phone, where Council is not the only sub-tab. Elections takes the focus as it opens; what the door promised is the promise sheet, open.
    ["openDesk('elections', 'run')", (n) => n.openDesk('elections', 'run'), 's2', { tab: 'politics', sub: 'elections', shows: 'promise-sheet' }],
    ["openDesk('laws') on the Governor's phone", (n) => n.openDesk('laws'), 's2', { tab: 'politics', sub: 'laws' }],
    ["openDesk('budget') on the Governor's phone", (n) => n.openDesk('budget'), 's2', { tab: 'politics', sub: 'budget' }],
    ["openDesk('market')", (n) => n.openDesk('market'), 's1', { tab: 'overview', tool: 'list' }],
    // The old desk ids have no sub-tab of that name any more: their doors land on the first one shown.
    ["openDesk('council'), a desk id with no sub-tab", (n) => n.openDesk('council'), 's2', { tab: 'politics', sub: 'laws' }],
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
    if (to.shows) byTestid(to.shows);
  });

  it("C17 (DESK_DOORS, interim until SB-4): the Sheriff's Guard door turns Overview's one map to Guard, and Done goes back to the Sheriff's sub-tab", () => {
    mount(game({ self: 's3', pol: politics({ sheriff: 's3' }), sheriff: true }));
    go((n) => n.open({ tab: 'politics', sub: 'sheriff' }));
    go((n) => {
      n.pickTool('look');
      n.openDesk('sheriff', 'guard');
    });
    expect(selected('tab-overview'), 'Guard is on the Overview map').toBe(true);
    byTestid('guard-map', byTestid('hub-map'));
    tap('guard-back');
    expect(selected('tab-politics'), 'Done goes back to the Sheriff').toBe(true);
    expect(selected('sub-sheriff')).toBe(true);
  });

  it("C17 (D6, SB-4 ready): WS8's Sheriff sub-tab and Guard pick, registered in one line each, run in the hub: Guard a plot hands Overview's map the pick, and Done goes back to the Sheriff", async () => {
    const { GUARD_PICK, SHERIFF_SUB } = await import('../src/phone/hub/politics/Sheriff');
    const slots: TabHubSlots = { ...TAB_SLOTS, politicsTabs: TAB_SLOTS.politicsTabs.map((t) => (t.id === SHERIFF_SUB.id ? SHERIFF_SUB : t)), picks: [GUARD_PICK] };
    mount(game({ self: 's3', pol: politics({ sheriff: 's3' }), sheriff: true }), slots);
    go((n) => n.open({ tab: 'politics', sub: 'sheriff' }));
    tap('guard-open-map');
    expect(selected('tab-overview')).toBe(true);
    expect(nav!.pick).toBe('guard');
    byTestid('guard-map', byTestid('hub-map'));
    expect(findTestid('map-tools'), 'the pick draws its own bar').toBeUndefined();
    tap('guard-back');
    expect(nav!.pick).toBeNull();
    expect(selected('tab-politics')).toBe(true);
    expect(selected('sub-sheriff')).toBe(true);
  });

  it('C17 (DESK_DOORS): every This month row in TAB_SLOTS has a door, and a door into a sub-tab names one TAB_SLOTS draws', () => {
    const drawn = TAB_SLOTS.politicsTabs.map((t) => t.id);
    const rows = TAB_SLOTS.agenda.map((a) => [a.key, a.opens] as const);
    expect(rows.length).toBeGreaterThan(0);
    for (const [key, opens] of rows) {
      if ('tool' in opens) continue;
      const door = DESK_DOORS[opens.desk]?.(opens.focus);
      expect(door, `agenda-${key}: desk "${opens.desk}" has a door`).toBeDefined();
      if (door?.sub) expect(drawn, `agenda-${key}: its sub-tab "${door.sub}"`).toContain(door.sub);
    }
  });

  it("C17 (D6, the hub's nav): a sub-tab and a plot pick whose bodies call useHub() draw on first render, and start, end and return from the pick", () => {
    function StandSub() {
      const n = useHub();
      return createElement('button', { 'data-testid': 'stand-guard', onClick: () => n.startPick('stand-pick') }, n.sub);
    }
    function StandMap() {
      const n = useHub();
      return createElement('button', { 'data-testid': 'stand-done', onClick: () => (n.endPick(), n.open({ tab: 'politics', sub: 'stand' })) }, n.pick);
    }
    const slots: TabHubSlots = {
      ...TAB_SLOTS,
      politicsTabs: [...TAB_SLOTS.politicsTabs, { id: 'stand', label: () => 'Stand', Body: StandSub }],
      picks: [{ id: 'stand-pick', label: 'Standing in', hint: () => 'tap', back: { tab: 'politics', sub: 'stand', label: 'Stand' }, ownBar: true, Map: StandMap }],
    };
    mount(game(), slots);
    go((n) => n.open({ tab: 'politics', sub: 'stand' }));
    expect(text('stand-guard'), 'the sub-tab reads the open sub-tab').toBe('stand');
    tap('stand-guard');
    expect(selected('tab-overview')).toBe(true);
    expect(text('stand-done'), "the pick's map reads the pick").toBe('stand-pick');
    byTestid('stand-done', byTestid('hub-map'));
    tap('stand-done');
    expect(nav!.pick).toBeNull();
    expect(selected('sub-stand')).toBe(true);
  });

  it("B-AC-14 (D3): the Sheriff's sub-tab is its holder's alone: no other phone's Council tab draws it", () => {
    mount(game());
    tap('tab-politics');
    expect(findTestid('sub-sheriff'), "Lena's Council tab").toBeUndefined();
    rerender(game({ self: 's3', pol: politics({ sheriff: 's3' }), sheriff: true }));
    tap('tab-politics');
    byTestid('sub-sheriff');
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

  it('E-9 (D8): a sub-tab that asks first opens nothing by itself; while another tab or sub-tab is open the Now line is a door to it, and inside it Now is plain', () => {
    const asking = () => game({ self: 's2', pol: politics({ election: { stage: 'announce', ceremony: null, candidates: { governor: ['s2', 's3'] }, promises: {}, voted: [], done: [], waitingFor: ['s1'], result: {} }, next: 5 }) });
    mount(asking());
    expect(selected('tab-overview'), 'planning opens on Overview, whatever asks').toBe(true);
    tap('tab-politics');
    expect(selected('sub-laws'), 'the tab opens where it was, not on the asking sub-tab').toBe(true);
    tap('now-go');
    expect(selected('tab-politics')).toBe(true);
    expect(selected('sub-elections')).toBe(true);
    expect(findTestid('now-go'), 'inside its own sub-tab, a plain Now').toBeUndefined();
    tap('sub-laws');
    rerender(asking());
    expect(selected('sub-laws'), 'picked away, the asking sub-tab does not take it back').toBe(true);
    byTestid('now-go');
    tap('tab-colony');
    byTestid('now-go');
  });

  it('C66 (frame): the election ceremony takes the whole stage, the tabs hidden', () => { // trace-allow: an existing test whose title changed with SB-3 (its door or stage moved into a sub-tab); its id was never an AC id
    const ceremony: ElectionView = { stage: 'ceremony', ceremony: null, candidates: { governor: ['s2', 's3'] }, promises: {}, voted: [], done: [], waitingFor: [], result: {} };
    mount(game({ pol: politics({ election: ceremony, next: 5 }) }));
    byTestid('hub-situation');
    expect(findTestid('tabs-a')).toBeUndefined();
  });

  it("C66 (frame): the first stage shown takes the stage in place of the tabs, the tool row, the map and This month; its Rail sits under Now; the shell's phase and the ready bar's words are its own", () => {
    const marker = (testid: string) => () => createElement('p', { 'data-testid': testid });
    const words: ReadyBarWords = { ready: 'Cast my vote', done: 'You voted', waiting: 'Still waiting for', all: 'Everyone has voted.', confirm: (names) => `Close the ballot without ${names}?`, canReady: false, label: 'VOTED' };
    const stage = (on: boolean): TabHubSlots => ({
      ...TAB_SLOTS,
      stage: [{ id: 'hidden', show: () => false, Body: marker('hidden-card') }, { id: 'day', show: () => on, phase: () => 'Election day', Body: marker('day-card'), Rail: marker('run-block') }, { id: 'later', show: () => on, Body: marker('later-card') }],
      readyWords: [() => null, () => (on ? words : null), () => ({ ...words, ready: 'Not this one' })],
    });
    mount(game(), stage(true));
    byTestid('day-card', byTestid('hub-situation'));
    for (const gone of ['hidden-card', 'later-card', 'tabs-a', 'map-tools', 'hub-map', 'agenda']) expect(findTestid(gone), gone).toBeUndefined();
    const rail = byTestid('guide');
    expect(rail.textContent).toContain('Election day');
    const order = testidsIn(rail);
    expect(order.indexOf('now'), 'Now, then the Rail').toBeLessThan(order.indexOf('run-block'));
    expect(text('ready')).toBe('Cast my vote');
    expect(byTestid('ready').getAttribute('disabled'), 'not live').not.toBeNull();
    expect(text('ready-count')).toBe('0 / 3 VOTED');

    rerender(game(), stage(false));
    expect(findTestid('day-card'), 'with none shown, planning').toBeUndefined();
    byTestid('tab-body-overview');
    expect(rail.textContent).toContain('Planning');
    expect(text('ready')).toBe('Not this one');
  });
});

describe('SB-3: politics as sub-tabs, only the reveals take the stage', () => {
  const election = (stage: ElectionView['stage']): ElectionView => ({ stage, ceremony: null, candidates: { governor: ['s2', 's3'] }, promises: {}, voted: [], done: [], waitingFor: ['s1', 's2', 's3'], result: {} });
  const council = (stage: CouncilView['stage']): CouncilView => ({ stage, proposal: { kind: 'enact', law: 'landTax', setting: 10 }, proposer: 's2', impact: {}, voted: [], done: [], waitingFor: ['s1'], clockMs: 0, revealMs: 4000, result: stage === 'reveal' ? { passed: true, yes: 2, no: 1, tie: false } : null });
  const overrule = (stage: OverruleView['stage']): OverruleView =>
    ({ target: 'tax', caller: 's3', stage, restores: { tax: 5 }, stands: { tax: 9 }, voted: [], done: [], waitingFor: ['s1'], clockMs: 0, revealMs: 4000, total: 3, needed: 2, result: stage === 'reveal' ? { passed: true, yes: 2, no: 1 } : null }) as unknown as OverruleView;
  const cases: [string, Partial<PoliticsView>][] = [
    ['the election ceremony', { election: election('ceremony'), next: 5 }],
    ['the law reveal', { council: council('reveal') }],
    ['the overrule reveal', { overrule: overrule('reveal') }],
  ];

  it.each(cases)('SB-3 (S5-B-AC-3): %s takes the whole stage, the tabs hidden', (_, pol) => {
    mount(game({ pol: politics(pol) }));
    byTestid('hub-situation');
    expect(findTestid('tabs-a')).toBeUndefined();
  });

  it.each<[string, Partial<PoliticsView>, string, string]>([
    ['the election announce', { election: election('announce'), next: 5 }, 'elections', 'announce'],
    ['the election ballot', { election: election('ballot'), next: 5 }, 'elections', 'ballot-governor'],
    ['the law ballot', { council: council('ballot') }, 'laws', 'phone-ballot'],
    ['the overrule ballot', { overrule: overrule('ballot') }, 'laws', 'overrule-ballot'],
  ])('SB-3 (S5-B-AC-3): %s does not take the stage; it is in its sub-tab', (_, pol, sub, ballotCard) => {
    mount(game({ pol: politics(pol) }));
    byTestid('tabs-a');
    expect(findTestid('hub-situation')).toBeUndefined();
    go((n) => n.open({ tab: 'politics', sub }));
    expect(selected(`sub-${sub}`)).toBe(true);
    expect(findTestid(ballotCard, byTestid(`sub-body-${sub}`)), `the ballot sits in sub-body-${sub}`).toBeDefined();
  });

  it('S5-B-AC-3 (hub): an open overrule ballot shows its Now line and the ready bar, and the reveal takes the stage', () => {
    mount(game({ pol: politics({ overrule: overrule('ballot') }) }));
    expect(text('now')).toContain('Undo the Governor’s tax?');
    expect(text('ready')).toBe('Cast my vote');
    rerender(game({ pol: politics({ overrule: overrule('reveal') }) }));
    byTestid('hub-situation');
  });

  it.each<[string, string, { sub: string; focus?: string }]>([
    ['law', 's1', { sub: 'laws' }],
    ['run', 's1', { sub: 'elections', focus: 'run' }],
    ['governor', 's2', { sub: 'laws' }],
  ])('SB-3: the This month row "%s" opens its sub-tab', (key, _self, to) => {
    const row = TAB_SLOTS.agenda.find((a) => a.key === key)!;
    expect('desk' in row.opens ? DESK_DOORS[row.opens.desk]?.(row.opens.focus) : undefined).toMatchObject({ tab: 'politics', ...to });
  });
});

describe('SB-3 part 2: the real hub reaches every politics action', () => {
  const cap = { kind: 'cap', percent: 8 } as const;
  const hold = { kind: 'hold' } as const;
  const announce = (stage: 'announce' | 'ballot') =>
    politics({ next: 7, candidates: { governor: ['s1', 's2'] }, promises: { s1: cap, s2: hold }, election: { stage, ceremony: null, candidates: { governor: ['s1', 's2'] }, promises: { s1: cap, s2: hold }, voted: [], done: [], waitingFor: ['s1', 's2', 's3'], result: {} } });
  const RUN_ACTIONS = ['run-office', 'run-governor', 'change-promise', 'promise-run', 'withdraw', 'agenda-run'];
  const openElections = () => {
    tap('tab-politics');
    tap('sub-elections');
  };

  it("T-AC-66 (hub): month 1's announce takes a run, in the Elections sub-tab: the run block, its change-promise live", () => {
    mount(game({ pol: announce('announce'), month: 1, mine: { running: 'governor', canRun: { governor: true } } }));
    openElections();
    byTestid('run-office');
    expect(byTestid('change-promise').getAttribute('disabled')).toBeNull();
  });

  it.each(['announce', 'ballot'] as const)('T-AC-67 (hub): from month 4 the %s shows no Run anywhere on the phone: not in This month, not in Elections', (stage) => {
    mount(game({ pol: announce(stage), month: 4, mine: { running: 'governor', canRun: { governor: 'closed' } } }));
    for (const gone of RUN_ACTIONS) expect(findTestid(gone), `${gone} on Overview`).toBeUndefined();
    openElections();
    for (const gone of RUN_ACTIONS) expect(findTestid(gone), `${gone} in Elections`).toBeUndefined();
  });

  it('SB-3 (E-1): while an election is open the "Throw your hat in the ring" row is gone from This month; the Elections Now door carries it', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
    mount(game({ pol: announce('announce'), month: 1, mine: { running: 'governor', canRun: { governor: true } } }));
    expect(findTestid('agenda-run')).toBeUndefined();
    rerender(game({ pol: politics({ next: 7 }), month: 1, mine: { canRun: { governor: true } } }));
    byTestid('agenda-run');
  });

  it.each<[string, string, string]>([
    ['the new Governor', 's1', 'sub-laws'],
    ['another phone', 's3', 'sub-elections'],
  ])('SB-3 (M14, M17): once the election is over the offices line opens %s on its sub-tab', (_, self, sub) => {
    const over = politics({ governor: 's1', election: { stage: 'over', ceremony: null, candidates: {}, promises: {}, voted: [], done: [], waitingFor: [], result: {} } });
    mount(game({ self, pol: over }), { ...TAB_SLOTS, banners: [OFFICES_BANNER] });
    expect(nav!.tab).toBe('politics');
    expect(selected(sub), `${sub} is open`).toBe(true);
  });

  it('SB-3 (M18): the new Governor’s "To your Governor’s desk" in the reveal opens Laws, on the tax', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
    const result: ElectionResult = { governor: { winner: 's1', how: 'votes', tallies: [{ id: 's1', votes: 2 }, { id: 's2', votes: 1 }] } };
    const beats = ceremonyBeats(['s1', 's2', 's3'], result);
    const total = beats.total / 1000;
    const reached: Record<string, { beat: string; at: number }> = {};
    for (const { office, at } of beats.offices) reached[office] = { beat: 'end', at: at.end / 1000 };
    const ceremony = { seconds: total, total, reached } as unknown as ElectionView['ceremony'];
    const pol = politics({ governor: 's2', election: { stage: 'ceremony', ceremony, candidates: { governor: ['s1', 's2'] }, promises: {}, voted: [], done: [], waitingFor: [], result }, next: 7 });
    mount(game({ self: 's1', pol }));
    tap('companion-to-governor');
    // The stage holds the screen until the server ends the election; the door has moved the place meanwhile.
    rerender(game({ self: 's1', pol: politics({ governor: 's1', election: null, next: 7 }) }));
    expect(nav!.tab).toBe('politics');
    expect(selected('sub-laws')).toBe(true);
    byTestid('gov-tax');
  });

  it('SB-3 (M15): the overrule call line opens Laws', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
    const called = politics({ governor: 's2', tax: { percent: 9, start: 5, low: 0, high: 10 }, overrule: { target: 'tax', caller: 's3', stage: 'called', restores: { tax: 5 }, stands: { tax: 9 }, voted: [], done: [], waitingFor: [], clockMs: 0, revealMs: 4000, total: 3, needed: 2, result: null } as unknown as OverruleView });
    mount(game({ pol: called }), { ...TAB_SLOTS, underNow: [...TAB_SLOTS.underNow, OVERRULE_CALL_LINE] });
    tap('overrule-call-line');
    expect(nav!.tab).toBe('politics');
    expect(selected('sub-laws')).toBe(true);
  });

  it('S3-RULE-12 (O-2): Abstain stands across a sub-tab switch: the ballot keeps the pick and Cast my vote stays live', () => { // trace-allow: S3-RULE-12 row 2 (Abstain stands) is a rule id, not an AC id; found in the #734 owner review
    mount(game({ pol: announce('ballot'), month: 4, mine: { canRun: { governor: 'closed' } } }));
    openElections();
    const radio = (id: string) => byTestid(`ballot-governor-${id}`).findAll('input')[0]!;
    act(() => (props(radio('abstain')).onChange as () => void)());
    expect((radio('abstain') as unknown as { checked?: boolean }).checked).toBe(true);
    tap('sub-laws');
    tap('sub-elections');
    expect((radio('abstain') as unknown as { checked?: boolean }).checked, 'Abstain is still picked').toBe(true);
    expect(byTestid('ready').getAttribute('disabled'), 'Cast my vote is live').toBeNull();
  });
});
