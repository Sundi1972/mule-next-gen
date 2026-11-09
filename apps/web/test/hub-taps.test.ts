import { document, FakeElement } from './fake-dom';
import { DEVELOPMENT } from '@mule/engine';
import type { MuleView, MyView, PlayerView, TableView, TileView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { SCANNING_MS } from '../src/phone/plotInfo';
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
  politics: null,
};

const VIEW: MuleView = aMuleView({ month: 2, width: 4, height: 1, tiles: TILES, players: PLAYERS, me: ME, politics: null });
/** The view once Lena's drone has scanned plots 2·1 and 3·1: the drone used, their ground hers. */
const GROUND = { food: 3, water: 0, energy: 1, smithore: 2, crystite: 1, rareEarth: 0 };
const SCANNED: MuleView = {
  ...VIEW,
  tiles: TILES.map((t) => (t.x === 1 || t.x === 2 ? { ...t, ground: GROUND } : t)),
  me: { ...ME, droneOrder: [{ x: 1, y: 0 }, { x: 2, y: 0 }], droneFound: [{ x: 1, y: 0 }, { x: 2, y: 0 }] },
  players: [{ ...PLAYERS[0]!, money: PLAYERS[0]!.money - DEVELOPMENT.droneFee }, PLAYERS[1]!],
};

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
  it('H-2: a tap on the needs strip, in the "?" sheet, opens the Colony tab, where the full list is', () => {
    mount(VIEW);
    tap('help-open');
    tap('needs-strip');
    expect(findTestid('help-sheet'), 'the sheet gives way').toBeUndefined();
    expect(byTestid('tab-colony').getAttribute('aria-selected')).toBe('true');
    expect(findTestid('this-month', byTestid('tab-body-colony'))).toBeDefined();
  });

  it('H-3: with the drone open the rail says "Tap up to 2 free plots"; its button counts the plots and says the second costs nothing extra', () => {
    mount(VIEW);
    tap('tool-drone');
    expect(text('drone-hint')).toBe(`Tap up to ${DEVELOPMENT.dronePlots} free plots`);
    expect(text('drone-panel')).toContain('Only you');
    expect(text('drone-panel')).toContain(`The drone reads their ground from orbit, at once, for ${DEVELOPMENT.droneFee} cr. Only you see what it finds.`);
    expect(text('drone-panel'), 'its results come at Scan').not.toMatch(/land grant|on its way/i);
    expect(findTestid('drone-panel', byTestid('guide')), 'the drone takes the rail').toBeDefined();
    expect(text('scan')).toBe('Pick a free plot for the drone');
    expect(findTestid('drone-one-more')).toBeUndefined();

    tap('map-plot-1-0');
    expect(text('scan')).toBe(`Scan · 1 of ${DEVELOPMENT.dronePlots} plots · ${DEVELOPMENT.droneFee} cr`);
    expect(text('drone-one-more')).toBe('Pick 1 more: it costs nothing extra.');
    expect(text('drone-pick')).toContain('Plot');

    tap('map-plot-3-0');
    expect(text('scan'), "Ossa's plot is not free: no pick").toContain('1 of');
    tap('map-plot-2-0');
    expect(text('scan')).toBe(`Scan · 2 of ${DEVELOPMENT.dronePlots} plots · ${DEVELOPMENT.droneFee} cr`);
    expect(findTestid('drone-one-more'), 'both plots picked: nothing more to say').toBeUndefined();

    tap('scan');
    expect(sent).toEqual([{ type: 'drone', plots: [{ x: 1, y: 0 }, { x: 2, y: 0 }] }]);
  });

  it('C2: after Scan the picked plots keep their SCAN chip and the rail says "Scanning…" for a second, then the Drone report, closed by the month of the next drone; the footer gives its room to the report', () => {
    vi.useFakeTimers();
    try {
      mount(VIEW);
      tap('tool-drone');
      tap('map-plot-1-0');
      tap('map-plot-2-0');
      tap('scan');
      // The server's answer: the drone is used and both plots' ground is in this seat's view.
      act(() => root!.render(onPhone(SCANNED)));
      expect(text('drone-hint')).toBe('Scanning…');
      expect(text('scan')).toBe('Scanning…');
      expect(byTestid('scan').getAttribute('disabled'), 'no second Scan while it scans').not.toBeNull();
      for (const id of ['map-plot-1-0', 'map-plot-2-0']) expect(text(id), id).toContain('SCAN');
      expect(findTestid('scan-report')).toBeUndefined();

      act(() => void vi.advanceTimersByTime(SCANNING_MS));
      expect(findTestid('scan-report')).toBeDefined();
      for (const id of ['report-1-0', 'report-2-0']) expect(findTestid(id), id).toBeDefined();
      for (const id of ['map-plot-1-0', 'map-plot-2-0']) expect(text(id), `${id}: the chip gives way to what was found`).not.toContain('SCAN');
      expect(findTestid('scan')).toBeUndefined();
      expect(text('drone-used')).toBe('Next drone: month 3.');
      expect(findTestid('drone-used', byTestid('scan-report')), 'the next drone closes the report').toBeDefined();
      expect(text('actions'), "the footer holds only Ready's bar: its room goes to the report").not.toMatch(/drone|Scan/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('C2 (rejoin): a phone that opens planning with the drone already used shows the Drone report at once, from the view; no Scan and no "land grant"', () => {
    mount(SCANNED);
    tap('tool-drone');
    expect(findTestid('scan-report')).toBeDefined();
    expect(text('report-1-0')).toContain('2·1 · Plains');
    expect(text('report-1-0')).toContain('best for Food');
    expect(text('scan-report')).toContain('Only you');
    expect(findTestid('scan')).toBeUndefined();
    expect(findTestid('drone-hint')).toBeUndefined();
    expect(text('drone-used')).toBe('Next drone: month 3.');
    expect(host.textContent).not.toMatch(/on its way|read at the land grant/i);
  });

  it("C2 (pin): a picked special plot's drone rail says what the special is, first under the plot's name", () => {
    mount({ ...VIEW, tiles: TILES.map((t) => (t.x === 1 ? { ...t, special: { kind: 'oasis' } } : t)) });
    tap('tool-drone');
    tap('map-plot-1-0');
    expect(byTestid('drone-pick').textContent).toContain('Plot 2·1');
    expect(findTestid('special-line', byTestid('drone-pick'))?.getAttribute('data-kind')).toBe('oasis');
  });

  /** Lena owns 1·1, analysed with Crystite 2, and 2·1, not analysed, with a Food MULE; Ossa owns 4·1, its ground known too. */
  const OWNED: MuleView = {
    ...VIEW,
    tiles: TILES.map((t) =>
      t.x === 0 ? { ...t, owner: 's1', ground: { ...GROUND, crystite: 2 } } : t.x === 1 ? { ...t, owner: 's1', outfit: 'food' } : t.x === 3 ? { ...t, ground: GROUND } : t,
    ),
  };

  it('C3: My plots lists every plot of yours once, an analysed one with its dots and gem, the other "Not analysed"; never Ossa\'s', () => {
    mount(OWNED);
    tap('tool-plots');
    expect(text('my-plots')).toContain('My plots · 2');
    const rows = host.findAll('button').filter((b) => b.getAttribute('data-testid')?.startsWith('plot-row-')).map((b) => b.getAttribute('data-testid'));
    expect(rows).toEqual(['plot-row-0-0', 'plot-row-1-0']);
    const analysed = byTestid('plot-row-0-0');
    expect(findTestid('dots-food', analysed)?.getAttribute('data-n')).toBe('3');
    expect(findTestid('dots-crystite', analysed)?.getAttribute('data-n')).toBe('2');
    expect(findTestid('gem-crystite', analysed)).toBeDefined();
    expect(findTestid('gem-rareEarth', analysed)).toBeUndefined();
    expect(analysed.textContent).toContain('no MULE yet');
    const unknown = byTestid('plot-row-1-0');
    expect(unknown.textContent).toContain('Not analysed: walk to it in development and press Analyse.');
    expect(unknown.textContent).toContain('Food MULE');
    expect(findTestid('good-dots', unknown), 'unknown is not 0: no dots').toBeUndefined();
  });

  it('C3: a tap on a row selects its plot on the map; a tap on a plot of yours on the map selects its row; a tap elsewhere lets go', () => {
    mount(OWNED);
    tap('tool-plots');
    expect(host.findAll('*').some((e) => e.getAttribute('data-selected') !== null)).toBe(false);
    tap('plot-row-1-0');
    expect(byTestid('map-plot-1-0').getAttribute('data-selected')).not.toBeNull();
    expect(byTestid('plot-row-1-0').getAttribute('aria-pressed')).toBe('true');
    tap('map-plot-0-0');
    expect(byTestid('plot-row-0-0').getAttribute('aria-pressed')).toBe('true');
    expect(byTestid('plot-row-1-0').getAttribute('aria-pressed')).toBe('false');
    expect(byTestid('map-plot-0-0').getAttribute('data-selected')).not.toBeNull();
    tap('map-plot-3-0');
    expect(byTestid('plot-row-0-0').getAttribute('aria-pressed'), "Ossa's plot is not in the list: nothing selected").toBe('false');
    expect(byTestid('map-plot-3-0').getAttribute('data-selected')).toBeNull();
  });

  it("C8: Look shows a known plot's dots right after its land and owner, above its special and its MULE line", () => {
    mount({ ...VIEW, tiles: TILES.map((t) => (t.x === 0 ? { ...t, owner: 's1', outfit: 'food', special: { kind: 'oasis' }, ground: GROUND } : t)) });
    tap('tool-look');
    tap('map-plot-0-0');
    const look = text('look-plot') ?? '';
    const dots = text('ground') ?? '';
    expect(look.indexOf('YOURS')).toBeLessThan(look.indexOf(dots));
    expect(order('ground')).toBeLessThan(order('special-line'));
    expect(look.indexOf(dots)).toBeLessThan(look.indexOf('A MULE here makes Food.'));
    expect(findTestid('terrain-hint'), 'a known plot gives no hint').toBeUndefined();
  });

  it("C8: a plot you haven't analysed keeps its land's hint last, after its special", () => {
    mount({ ...VIEW, tiles: TILES.map((t) => (t.x === 0 ? { ...t, special: { kind: 'oasis' } } : t)) });
    tap('tool-look');
    tap('map-plot-0-0');
    expect(findTestid('ground')).toBeUndefined();
    expect(order('special-line')).toBeLessThan(order('terrain-hint'));
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

});
