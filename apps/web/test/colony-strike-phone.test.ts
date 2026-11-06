import { document, FakeElement } from './fake-dom';
import type { ColonyView, CouncilView, ElectionView, MuleView, MyView, PlayerView, PoliticsView, TableView, TileView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * The general strike on the phones (G-5 C37, WS8's PR-E1), the planning hub mounted in a fake DOM: the Governor's Now
 * card with Pay and Let them strike, everyone else's line under Now, and the strikers on the hub's map.
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
const PLAYERS: PlayerView[] = [aPlayer({ id: 's1', name: 'Lena', slot: 0 }), aPlayer({ id: 's2', name: 'Kai', slot: 1 }), aPlayer({ id: 's3', name: 'Ossa', slot: 2 })];
const tile = (x: number, y: number, owner: string | null, outfit: TileView['outfit']): TileView => ({ x, y, terrain: 'plains', peaks: 0, owner, outfit, pollution: 0, filter: false });
/** Lena's and Ossa's Food farms, Kai's Energy plot, and free land. */
const TILES: TileView[] = [tile(0, 0, 's1', 'food'), tile(1, 0, 's2', 'energy'), tile(2, 0, 's3', 'food'), tile(3, 0, null, null)];

const ME: MyView = {
  id: 's1',
  species: 'zipwing',
  stock: NO_GOODS,
  carriedMule: null,
  installedThisTurn: false,
  worthParts: { money: 0, goods: 0, plots: 0, land: 0, mules: 0, muleValue: 0, office: 0, cut: 0, donated: 0 },
  claimsLeft: 0,
  hungry: false,
  sick: false,
  needs: { food: 0, water: 0 },
  monthNeeds: NO_GOODS,
  devEndsAt: null,
  devSeconds: 50,
  produced: null,
  mulePrice: 150,
  outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
  droneOrder: [],
  politics: { running: null, ballot: {}, canRun: { governor: 'closed' }, paid: 0, reputation: 50 },
};

const politics = (extra: Partial<PoliticsView> = {}): PoliticsView => ({
  governor: 's1',
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
  promiseFrom: null,
  election: null,
  ...extra,
});

const colony = (strike: ColonyView['strike']): ColonyView => ({
  gauges: { wealth: 26_400, environment: 34, prestige: 2, happiness: 44, band: 'restless' },
  lastGauges: null,
  fund: 2_340,
  ledger: null,
  projects: [],
  catalogue: [],
  strike,
  score: null,
});

const UNPAID = { good: 'food' as const, cost: 240, paid: false };
const PAID = { ...UNPAID, paid: true };

/** Month 5's planning, Lena's phone; `governor` holds the office. */
const view = (strike: ColonyView['strike'], p: Partial<PoliticsView> = {}, c: Partial<ColonyView> = {}): MuleView =>
  aMuleView({ players: PLAYERS, me: ME, politics: politics(p), month: 5, width: 4, height: 1, tiles: TILES, colony: { ...colony(strike), ...c } });
/** The same, with Lena Ready: her seat's ready flag is what the hub reads. */
const ready = (v: MuleView): MuleView => ({ ...v, players: v.players.map((p) => (p.id === 's1' ? { ...p, ready: true } : p)) });
const KAI_GOVERNS = { governor: 's2' };

/** Election day's secret ballot, Lena and Kai standing. */
const BALLOT: ElectionView = { stage: 'ballot', ceremony: null, candidates: { governor: ['s1', 's2'] }, promises: {}, voted: [], done: [], waitingFor: ['s1', 's2', 's3'], result: {} };

const COUNCIL: CouncilView = { stage: 'ballot', proposal: { kind: 'repeal', law: 'landTax' }, proposer: 's1', impact: {}, voted: [], done: [], waitingFor: ['s1', 's2', 's3'], clockMs: 0, revealMs: 0, result: null };

const sent: unknown[] = [];
const STATE = { status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
const client = { subscribe: () => () => {}, getState: () => STATE, serverNow: () => 0, intent: (intent: unknown) => void sent.push(intent) } as unknown as TableClient;

const onPhone = (v: MuleView) => {
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', boards: 1, game: v, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) };
  return createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: { table, view: v, me: v.me!, self: v.players[0]!, slot: 0 as Slot }, children: createElement(Planning) }) });
};

let root: Root | null = null;
let host: FakeElement;

function mount(v: MuleView): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host as unknown as HTMLElement);
  act(() => root!.render(onPhone(v)));
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

const props = (testid: string) => {
  const el = byTestid(testid);
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  expect(key, 'a React element').toBeDefined();
  return (el as unknown as Record<string, { onClick?: (e?: unknown) => void; disabled?: boolean }>)[key!]!;
};
const tap = (testid: string) => act(() => props(testid).onClick!({ currentTarget: byTestid(testid) }));
const text = (testid: string) => byTestid(testid).textContent.replace(/\s+/g, ' ').trim();

function strikers(): string[] {
  const out: string[] = [];
  const walk = (n: FakeElement) => {
    const m = /^striker-(\d+)-(\d+)$/.exec(n.getAttribute('data-testid') ?? '');
    if (m) out.push(`${m[1]},${m[2]}`);
    for (const c of n.childNodes) if (c instanceof FakeElement) walk(c);
  };
  walk(host);
  return out.sort();
}

describe("the general strike on the phones (C37)", () => {
  it("B-AC-37-2: the Governor's Now card names the strike, its cost and the fund before and after, and Pay sends payStrike", () => {
    mount(view(UNPAID));
    expect(text('strike-now')).toContain('General strike on Food');
    expect(text('unpaid-cost')).toBe('Unpaid: Food plots make 20% this month.');
    expect(text('fund-line')).toBe('Fund 2,340 → 2,100 cr');
    expect(text('pay-strike')).toBe('Pay the strikers 240 cr');
    expect(findTestid('after-votes')).toBeUndefined();
    expect(findTestid('strike-alert'), 'the Governor has the card, not the line').toBeUndefined();
    tap('pay-strike');
    expect(sent).toEqual([{ type: 'payStrike' }]);
  });

  it("B-AC-37-2: while the law ballot is open the Governor's Now is the vote's, and no strike card shows", () => {
    mount(view(UNPAID, { council: COUNCIL }));
    expect(text('now-title')).toBe('Vote on the law');
    expect(findTestid('strike-now')).toBeUndefined();
    expect(sent).toEqual([]);
  });

  it("B-AC-37-2: on election day the Governor's Now is the election's, and no strike card shows", () => {
    mount(view(UNPAID, { election: BALLOT }));
    expect(text('now-title')).toBe('Vote in secret');
    expect(findTestid('strike-now')).toBeUndefined();
  });

  it('B-AC-37-2: a Governor who is Ready can still pay: a pay line under Now sends payStrike', () => {
    mount(ready(view(UNPAID)));
    expect(findTestid('strike-now')).toBeUndefined();
    expect(text('strike-pay-line')).toBe('Pay the Food strikers 240 cr');
    tap('strike-pay-line');
    expect(sent).toEqual([{ type: 'payStrike' }]);
  });

  it('B-AC-37-2: a Ready Governor gets no pay line once the strike is paid, nor while the law ballot is open', () => {
    mount(ready(view(PAID)));
    expect(findTestid('strike-pay-line')).toBeUndefined();
    act(() => root!.render(onPhone(ready(view(UNPAID, { council: COUNCIL })))));
    expect(findTestid('strike-pay-line')).toBeUndefined();
  });

  it('B-AC-37-2: a fund short of the cost shows the fund as it is, with no negative figure; the engine refuses with its own words', () => {
    mount(view(UNPAID, {}, { fund: 100 }));
    expect(text('fund-line')).toBe('Fund 100 cr');
  });

  it("B-AC-37-2: Let them strike sends nothing and leaves the Governor a way to pay until planning ends", () => {
    mount(view(UNPAID));
    tap('let-strike');
    expect(sent).toEqual([]);
    expect(findTestid('strike-now')).toBeUndefined();
    expect(text('strike-let')).toContain('You let them strike');
    tap('pay-after-all');
    expect(sent).toEqual([{ type: 'payStrike' }]);
  });

  it("B-AC-37-2: once the server has it paid, the Governor's card says so with the fund after", () => {
    mount(view(PAID));
    expect(findTestid('pay-strike')).toBeUndefined();
    expect(text('strike-paid')).toContain('You paid the strikers · −240 cr');
    expect(text('strike-paid')).toContain('Fund 2,340 cr');
  });

  it('B-AC-37-2: a non-Governor gets no card but the alert line under Now, naming the Governor; once paid it says so', () => {
    mount(view(UNPAID, KAI_GOVERNS));
    expect(findTestid('strike-now')).toBeUndefined();
    expect(findTestid('now')).toBeDefined();
    expect(text('strike-alert')).toBe('General strike on Food: Kai decides whether the fund pays 240 cr');
    act(() => root!.render(onPhone(view(PAID, KAI_GOVERNS))));
    expect(text('strike-alert')).toBe('Kai pays the Food strikers 240 cr: the strike is off.');
  });

  it("B-AC-37-3: the phone's map has a striker on exactly the struck good's plots, gone once paid", () => {
    mount(view(UNPAID, KAI_GOVERNS));
    expect(strikers()).toEqual(['0,0', '2,0']);
    act(() => root!.render(onPhone(view(PAID, KAI_GOVERNS))));
    expect(strikers()).toEqual([]);
  });

  it('B-AC-37-5: with no strike this month, every phone is today’s: no card, no alert, no strikers', () => {
    for (const p of [{}, KAI_GOVERNS]) {
      mount(view(null, p));
      expect(findTestid('strike-now')).toBeUndefined();
      expect(findTestid('strike-alert')).toBeUndefined();
      expect(strikers()).toEqual([]);
      act(() => root!.unmount());
      root = null;
    }
  });

  it('B-AC-37-5: with politics off the hub is today’s', () => {
    mount(aMuleView({ players: PLAYERS, me: { ...ME, politics: null }, politics: null, month: 5, width: 4, height: 1, tiles: TILES }));
    expect(findTestid('strike-now')).toBeUndefined();
    expect(findTestid('strike-alert')).toBeUndefined();
    expect(strikers()).toEqual([]);
  });
});

