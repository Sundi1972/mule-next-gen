import { document, FakeElement } from './fake-dom';
import type { DealCard } from '@mule/engine';
import type { MuleView, OverruleView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { TV_MOMENT_MS } from '../src/table/moments';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * SB-5a and SB-5b (the tabbed hub's TV planning, mock hub-tabs src/tv/TvPlanning.tsx CHANGE 2; WS6 ruling 8 Nov, PM ruling
 * 8 Nov): a card broken while the TV is up is a moment. Its banner (WS7's TvDeals) overlays the top of the map box, out of
 * flow, so the body's scale never moves for it, and folds after TV_MOMENT_MS; the news column keeps the server's line.
 */

const PLAYERS: PlayerView[] = [
  aPlayer({ id: 's1', name: 'Lena', slot: 0, reputation: 72 }),
  aPlayer({ id: 's2', name: 'Kai', slot: 1, reputation: 40 }),
  aPlayer({ id: 's3', name: 'Ossa', slot: 2, reputation: 25, isAi: true }),
];
const BROKE: DealCard = { id: 'deal-k', from: 's1', to: 's2', terms: { kind: 'pact' }, offered: 1, until: 4, status: 'broken', brokenBy: 's2', settled: 3 };
const NEWS = 'Kai broke a pact with Lena. Reputation −20.';
const START = 100_000;
const O: DealCard = { ...BROKE, id: 'deal-o', brokenBy: 's3', from: 's3' };
const CALL: OverruleView = {
  target: 'tax', caller: 's1', stage: 'called', restores: { tax: 5 }, stands: { tax: 9 }, voted: [], done: [], waitingFor: [],
  clockMs: 4000, revealMs: 4000, total: 3, needed: 2, result: null,
};

function politics(brokenDeals: DealCard[], overrule: OverruleView | null = null): PoliticsView {
  return {
    governor: null, sheriff: null, term: null, next: 4, baron: null,
    tax: { percent: 5, start: 5, low: 0, high: 10 }, fund: 0, pay: { governor: 50 },
    weights: [], candidates: { governor: [] }, promises: {}, promise: null, promiseFrom: null, election: null,
    brokenDeals, reputationReasons: {}, ...(overrule ? { overrule } : {}),
  };
}

/** The room as the TV's store holds it, with these cards broken. */
function room(brokenDeals: DealCard[], overrule: OverruleView | null = null) {
  const game: MuleView = aMuleView({ phase: 'planning', month: 3, players: PLAYERS, me: null, politics: politics(brokenDeals, overrule), news: brokenDeals.length ? [NEWS] : [] });
  const seats = game.players.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot, ...(p.isAi ? { kind: 'builtin' as const } : {}) }));
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats, boards: 1, game };
  return { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
}

/** The TV mounted in the fake DOM, on a server clock the test moves; `show` sends the room a new view. */
function theTv(brokenDeals: DealCard[]) {
  let state = room(brokenDeals);
  let clock = START;
  const listeners = new Set<() => void>();
  const client = {
    subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
    getState: () => state,
    serverNow: () => clock,
    watch: () => {},
  } as unknown as TableClient;
  const host = document.createElement('div') as unknown as FakeElement;
  document.body.appendChild(host as never);
  root = createRoot(host as unknown as Element);
  act(() => root!.render(createElement(ClientProvider, { client, children: createElement(TableApp, { room: 'MULE' }) })));
  return {
    html: () => outer(host),
    show(next: DealCard[], overrule: OverruleView | null = null) {
      state = room(next, overrule);
      act(() => listeners.forEach((l) => l()));
    },
    /** Moves the server clock and lets the screen's clock tick. */
    at(ms: number) {
      clock = START + ms;
      act(() => vi.advanceTimersByTime(500));
    },
  };
}

let root: Root | null = null;
beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (document.documentElement as unknown as { dataset?: object }).dataset ??= {};
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, t) => document.createElement(t) as unknown as FakeElement;
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('MutationObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});
afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  root = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The fake DOM as markup, enough for the readers below. */
function outer(node: FakeElement): string {
  const attrs = [...node.attributes].map(([k, v]) => ` ${k}="${v}"`).join('');
  const inner = node.childNodes.map((c) => (c instanceof FakeElement ? outer(c) : c.textContent)).join('');
  return `<${node.tagName.toLowerCase()}${attrs}>${inner}</${node.tagName.toLowerCase()}>`;
}

/** The markup of the element carrying this data-testid, through its matching closing tag. */
function element(html: string, testid: string): string {
  const open = html.match(new RegExp(`<([a-z]+)[^>]*data-testid="${testid}"[^>]*>`));
  expect(open, `an element with data-testid="${testid}"`).not.toBeNull();
  const tag = open![1]!;
  let depth = 0;
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, 'g');
  re.lastIndex = open!.index!;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(open!.index!, m.index + m[0].length);
  }
  throw new Error(`no closing tag for ${testid}`);
}

describe('SB-5a/5b: a card broken while the TV is up is a moment over the planning map', () => {
  it('the banner overlays the map box, out of flow, not under the header', () => {
    const tv = theTv([]);
    tv.show([BROKE]);
    const html = tv.html();
    const box = element(html, 'tv-map-box');
    expect(box).toMatch(/^<div[^>]*class="[^"]*\brelative\b/);
    const moment = element(box, 'tv-moment');
    // Out of flow, over the map's top, above the map's own layers.
    expect(moment).toMatch(/^<div[^>]*class="[^"]*\babsolute\b[^"]*\binset-x-0\b[^"]*\btop-0\b/);
    expect(moment).toContain('data-testid="tv-break-banner"');
    expect(moment).toContain('data-testid="tv-break-deal-k"');
    // The moment comes after the map in the box, so it draws over it.
    expect(box.indexOf('data-testid="holo-map"')).toBeLessThan(box.indexOf('data-testid="tv-moment"'));
    // Not in the planning header, where it would push the body down and scale it.
    const header = html.slice(html.indexOf('data-testid="tv-planning"'), html.indexOf('data-testid="tv-map-box"'));
    expect(header).not.toContain('tv-break-banner');
  });

  it(`the banner shows for ${TV_MOMENT_MS / 1000} s of server time, then folds; the news line stays`, () => {
    const tv = theTv([]);
    tv.show([BROKE]);
    expect(tv.html()).toContain('data-testid="tv-break-banner"');
    tv.at(TV_MOMENT_MS - 600);
    expect(tv.html(), 'just inside its time').toContain('data-testid="tv-break-banner"');
    tv.at(TV_MOMENT_MS);
    expect(tv.html(), 'its time up').not.toContain('data-testid="tv-moment"');
    expect(tv.html()).toContain(NEWS);
  });

  it('a break the screen opens on is old news: no banner, the news line only', () => {
    const html = theTv([BROKE]).html();
    expect(html).not.toContain('data-testid="tv-break-banner"');
    expect(html).toContain(NEWS);
  });

  it('a second card broken while the first shows is a moment of its own, the newest first, and folds on its own time', () => {
    const tv = theTv([]);
    tv.show([BROKE]);
    tv.at(TV_MOMENT_MS - 1000);
    tv.show([BROKE, O]);
    tv.at(TV_MOMENT_MS + 1000);
    const banner = element(tv.html(), 'tv-break-banner');
    expect(banner.indexOf('data-testid="tv-break-deal-o"'), 'the newest break leads').toBeGreaterThanOrEqual(0);
    expect(banner.indexOf('data-testid="tv-break-deal-o"')).toBeLessThan(banner.indexOf('data-testid="tv-break-deal-k"'));
    tv.at(2 * TV_MOMENT_MS - 1000);
    expect(tv.html(), "the second break's time up").not.toContain('data-testid="tv-moment"');
  });

  it("a third break in the month is in the banner, which names the newest two", () => {
    const tv = theTv([]);
    tv.show([BROKE]);
    tv.show([BROKE, O]);
    // Offered first, broken last: the view's order is not the order they broke in.
    tv.show([{ ...BROKE, id: 'deal-a', brokenBy: 's1', from: 's1', to: 's3' }, BROKE, O]);
    const banner = element(tv.html(), 'tv-break-banner');
    expect(banner).toContain('data-testid="tv-break-deal-a"');
    expect(banner).toContain('data-testid="tv-break-deal-o"');
    expect(banner).not.toContain('data-testid="tv-break-deal-k"');
  });

  it('a call withdrawn and called again by the same player that month is a moment once, on the whole TV (PM ruling 8 Nov)', () => {
    const tv = theTv([]);
    tv.show([], CALL);
    expect(tv.html()).toContain('data-testid="tv-overrule-call"');
    tv.at(2000);
    tv.show([]);
    tv.at(3000);
    tv.show([], CALL);
    expect(tv.html(), 'called again inside the first call\'s time').not.toContain('data-testid="tv-overrule-call"');
    expect(element(tv.html(), 'tv-promise-row')).toContain('data-testid="tv-overrule-called-line"');
  });

  it('with no break this month, the box draws no moment', () => {
    const tv = theTv([]);
    expect(tv.html()).not.toContain('data-testid="tv-moment"');
    tv.show([{ ...BROKE, settled: 2 }]);
    expect(tv.html()).not.toContain('tv-break-banner');
  });
});
