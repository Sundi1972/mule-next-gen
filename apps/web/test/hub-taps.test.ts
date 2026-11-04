import { document, FakeElement } from './fake-dom';
import { DEVELOPMENT } from '@mule/engine';
import type { MuleView, MyView, PlayerView, TableView, TileView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * The planning hub mounted in a fake DOM, for what a server render can't show: what a tap does (UX audit H-2, H-3,
 * H-4, H-7). Taps call the handler React gave the element; the fake DOM dispatches no events.
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
  // The fake DOM paints nothing: a frame never comes, so what waits for one (a scroll into view) does not run.
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 0;
  // Nor does it watch the theme's attribute: the theme stays as it starts.
  (globalThis as { MutationObserver?: unknown }).MutationObserver ??= class {
    observe() {}
    disconnect() {}
  };
  // Nor does it lay out: every box is a phone held sideways, so the shell draws the phone's layout.
  (FakeElement.prototype as unknown as { getBoundingClientRect?: () => object }).getBoundingClientRect ??= () => ({ x: 0, y: 0, top: 0, left: 0, width: 844, height: 390, right: 844, bottom: 390 });
});

const NO_GOODS = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };
const PLAYERS: PlayerView[] = [aPlayer({ id: 's1', name: 'Lena', slot: 0, worth: 2_000 }), aPlayer({ id: 's2', name: 'Ossa', slot: 1, worth: 3_000 })];
/** A row of four plots: three free, the last Ossa's. */
const TILES: TileView[] = [0, 1, 2, 3].map((x) => ({ x, y: 0, terrain: 'plains', peaks: 0, owner: x === 3 ? 's2' : null, outfit: null, pollution: 0, filter: false }));

const ME: MyView = {
  id: 's1',
  species: 'zipwing',
  stock: { ...NO_GOODS, food: 2 },
  carriedMule: null,
  installedThisTurn: false,
  worthParts: { money: 1_000, goods: 100, plots: 3, land: 900, mules: 0, muleValue: 0, office: 0, cut: 0 },
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
  politics: null,
};

const VIEW: MuleView = aMuleView({ month: 2, width: 4, height: 1, tiles: TILES, players: PLAYERS, me: ME, politics: null });

const sent: unknown[] = [];
/** One snapshot, the same object on every read, as a store must give. */
const STATE = { status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
const client = {
  subscribe: () => () => {},
  getState: () => STATE,
  serverNow: () => 0,
  intent: (intent: unknown) => void sent.push(intent),
} as unknown as TableClient;

const onPhone = (view: MuleView) => {
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', boards: 1, game: view, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) };
  return createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: { table, view, me: view.me!, self: view.players[0]!, slot: 0 as Slot }, children: createElement(Planning) }) });
};

let root: Root | null = null;
let host: FakeElement;

function mount(view: MuleView): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host as unknown as HTMLElement);
  act(() => root!.render(onPhone(view)));
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

function handlers(el: FakeElement): Record<string, () => void> {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  expect(key, 'a React element').toBeDefined();
  return (el as unknown as Record<string, Record<string, () => void>>)[key!]!;
}

const tap = (testid: string) => act(() => (handlers(byTestid(testid)).onClick as (e?: unknown) => void)({ currentTarget: byTestid(testid) }));
const text = (testid: string) => byTestid(testid).textContent;
const openDesk = () => [...host.findAll('button')].find((b) => b.getAttribute('aria-selected') === 'true')?.getAttribute('data-testid');
/** Where an element comes in the document, for "before" and "after". */
function order(testid: string): number {
  let i = 0;
  let at = -1;
  const walk = (n: FakeElement) => {
    if (n.getAttribute('data-testid') === testid && at < 0) at = i;
    i++;
    for (const c of n.childNodes) if (c instanceof FakeElement) walk(c);
  };
  walk(host);
  return at;
}

describe('the planning hub, tapped (UX audit)', () => {
  it('H-2: a tap on the needs strip opens the Colony desk, where the full list is', () => {
    mount(VIEW);
    tap('desk-market');
    expect(openDesk()).toBe('desk-market');
    tap('needs-strip');
    expect(openDesk()).toBe('desk-colony');
    expect(findTestid('this-month')).toBeDefined();
  });

  it('H-3: with the drone open the rail says "Tap up to 2 free plots", above the desks; its button counts the plots and says the second costs nothing extra', () => {
    mount(VIEW);
    tap('tool-drone');
    expect(text('drone-hint')).toBe(`Tap up to ${DEVELOPMENT.dronePlots} free plots`);
    expect(text('drone-panel')).toContain('Only you');
    expect(order('drone-panel'), 'the drone takes the rail, the desks after it').toBeLessThan(order('desks'));
    expect(text('drone-send')).toBe('Pick a free plot for the drone');
    expect(findTestid('drone-one-more')).toBeUndefined();

    tap('map-plot-1-0');
    expect(text('drone-send')).toBe(`Send the drone · 1 of ${DEVELOPMENT.dronePlots} plots · ${DEVELOPMENT.droneFee} cr`);
    expect(text('drone-one-more')).toBe('Pick 1 more: it costs nothing extra.');
    expect(text('drone-pick')).toContain('Plot');

    tap('map-plot-3-0');
    expect(text('drone-send'), "Ossa's plot is not free: no pick").toContain('1 of');
    tap('map-plot-2-0');
    expect(text('drone-send')).toBe(`Send the drone · 2 of ${DEVELOPMENT.dronePlots} plots · ${DEVELOPMENT.droneFee} cr`);
    expect(findTestid('drone-one-more'), 'both plots picked: nothing more to say').toBeUndefined();

    tap('drone-send');
    expect(sent).toEqual([{ type: 'drone', plots: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }]);
  });

  it('H-3 (negative): once the drone is sent its button leaves the footer and the rail says it is on its way', () => {
    mount({ ...VIEW, me: { ...ME, droneOrder: [{ x: 1, y: 0 }] } });
    tap('tool-drone');
    expect(text('drone-hint')).toBe('Your drone is on its way');
    expect(findTestid('drone-send')).toBeUndefined();
  });

  it('H-4: a tap on "2nd of 2" opens the standings, and Close shuts them', () => {
    mount(VIEW);
    expect(findTestid('standings-sheet')).toBeUndefined();
    expect(text('standing-rank')).toBe('2nd of 2');
    tap('standing');
    expect(findTestid('standings-sheet')).toBeDefined();
    expect(findTestid('standing-s1')).toBeDefined();
    expect(findTestid('standing-s2')).toBeDefined();
    tap('standings-close');
    expect(findTestid('standings-sheet')).toBeUndefined();
  });

  it('H-7: the folded Now card opens to its whole with one tap and folds again with one more', () => {
    mount(VIEW);
    expect(byTestid('now').tagName).toBe('BUTTON');
    tap('now');
    expect(byTestid('now').tagName).toBe('SECTION');
    tap('now-fold');
    expect(byTestid('now').tagName).toBe('BUTTON');
  });
});
