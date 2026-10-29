import { document, FakeElement } from './fake-dom';
import { DEVELOPMENT } from '@mule/engine';
import type { EventShowView, MuleView, MyView, PlayerView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import type { PhoneGame } from '../src/phone/game';

/**
 * C11's status line through a held development (RULE-4): Develop mounts as the phase opens, but while the sickness
 * roll call plays the server holds the clock and the overlay covers the screen. The start-of-turn card, which
 * carries the sick line, has to run from the release, not from the mount.
 */

// The fake document has no dataset (the map's theme reads the page's), no layout, no MutationObserver and no animation frames.
Object.assign(document.documentElement, { dataset: {} });
Object.assign(FakeElement.prototype, { getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }), offsetWidth: 0, offsetHeight: 0, querySelectorAll: () => [] });
const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
Object.assign(globalThis, { MutationObserver: class { observe() {} disconnect() {} }, requestAnimationFrame: (f: () => void) => setTimeout(f, 16), cancelAnimationFrame: (id: number) => clearTimeout(id) });

const LENA = 's1';
const MOUNT = 1_000_000;
/** How long the roll call holds the clock in these rows: any show longer than the card does. */
const SHOW_MS = 8_000;
/** The roll call as the server sends it: it opens with the phase, and the clock starts as it ends. */
const ROLL_CALL: EventShowView = { startsAt: MOUNT, showMs: SHOW_MS, introMs: 1_800, endsAt: MOUNT + SHOW_MS, held: true };
/** The card's window in ms: Develop's FILL_CARD_SECONDS. */
const card = 2_200;
const W = 5;
const H = 3;

const lena = { id: LENA, name: 'Lena', isAi: false, color: '', slot: 0, species: 'mollox', money: 1000, worth: 0, plots: 1, ready: false, doneDeveloping: false, colonist: null, condition: { foodShare: 1, sick: true, sickBecause: 'chance', conditionPace: 0.5 } } as unknown as PlayerView;
const tiles = Array.from({ length: W * H }, (_, i) => ({ x: i % W, y: Math.floor(i / W), terrain: i === 7 ? 'store' : 'plains', owner: i === 0 ? LENA : null, outfit: null }));
const stock = { food: 5, water: 5, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };

/** Lena's phone in development: `devEndsAt` null while the server holds the clock, `show` the phase's event show if any. */
function game(devEndsAt: number | null, show: EventShowView | null): PhoneGame {
  const view = { phase: 'development', month: 4, maxMonths: 12, phaseEndsAt: null, width: W, height: H, tiles, players: [lena], storeMules: 10, news: [], air: { level: 80, band: 'clean' }, eventShow: show } as unknown as MuleView;
  const me = {
    id: LENA,
    stock,
    needs: { food: 3, water: 1 },
    monthNeeds: stock,
    carriedMule: null,
    devEndsAt,
    devSeconds: DEVELOPMENT.fullSeconds,
    mulePrice: 100,
    outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100 },
  } as unknown as MyView;
  return { table: { code: 'ABCD', status: 'playing', hostId: LENA, boards: 1, seats: [], game: null } as unknown as TableView<MuleView>, view, me, self: lena, slot: 0 };
}

// One state object: the client store hands React the same snapshot until something changes.
const state = { chat: [], view: null, seatId: LENA };
const client = {
  subscribe: () => () => undefined,
  getState: () => state,
  serverNow: () => Date.now(),
  intent: () => undefined,
  chat: () => undefined,
} as unknown as TableClient;

/** Whether an element carrying this data-testid is mounted under `node`. */
function shows(node: unknown, testid: string): boolean {
  if (!(node instanceof FakeElement)) return false;
  if (node.getAttribute('data-testid') === testid) return true;
  return node.childNodes.some((c) => shows(c, testid));
}

/** Develop mounted on a fake clock at MOUNT; `render` swaps the game, `at` moves the clocks to ms after the mount and lets the screen tick. */
async function mount(first: PhoneGame) {
  const { Develop } = await import('../src/phone/Develop');
  const { ClientProvider } = await import('../src/net/react');
  const { PhoneGameProvider } = await import('../src/phone/game');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host as unknown as HTMLElement);
  const render = (g: PhoneGame) => flushSync(() => root.render(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: g, children: createElement(Develop) }) })));
  render(first);
  const at = async (ms: number) => {
    vi.advanceTimersByTime(MOUNT + ms - Date.now());
    // React's scheduler runs the screen's tick on the real setImmediate it captured at load.
    await new Promise((done) => setImmediate(done));
  };
  return { host, root, render, at };
}

beforeEach(() => {
  vi.useFakeTimers({ now: MOUNT, toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("C11: the start-of-turn card in a development held for its events", () => {
  it.each([
    {
      row: 'held for a sickness roll call (no clock, show running), then released, runs from the release',
      first: game(null, ROLL_CALL),
      released: game(MOUNT + SHOW_MS + DEVELOPMENT.fullSeconds * 1000, ROLL_CALL),
      releasedAt: SHOW_MS,
    },
    {
      row: 'with no show to wait for (month 1 waiting on its first MULE has none), runs from the mount',
      first: game(MOUNT + DEVELOPMENT.fullSeconds * 1000, null),
      released: game(MOUNT + DEVELOPMENT.fullSeconds * 1000, null),
      releasedAt: 0,
    },
  ])('C11: a development $row', async ({ first, released, releasedAt }) => {
    const { host, root, render, at } = await mount(first);
    await at(releasedAt);
    render(released);
    await at(releasedAt + 100);
    expect(shows(host, 'fill-card'), 'the card is up just after the turn starts').toBe(true);
    expect(shows(host, 'sick-strikes'), 'with the sick line on it').toBe(true);
    await at(releasedAt + card - 200);
    expect(shows(host, 'fill-card'), 'still up just before its 2.2 s from the turn start are over').toBe(true);
    await at(releasedAt + card + 200);
    expect(shows(host, 'fill-card'), 'gone once they are').toBe(false);
    root.unmount();
  });
});
