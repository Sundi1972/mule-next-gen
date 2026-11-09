import { document, FakeElement } from './fake-dom';
import type { BudgetView, CouncilView, MuleView, OverruleView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { isMoment, TV_MOMENT_MS, useMoment } from '../src/table/moments';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * SB-5b (the tabbed hub's TV planning, mock hub-tabs src/tv/TvPlanning.tsx CHANGE 1 and 2; PM rulings 8 Nov), placing
 * WS7's slice-5 parts: the budget line on the Governor's-promise row; while an overrule call holds, that side reads
 * "Overrule called: tax frozen", and the call itself is an 8 s moment over the map; the overrule's ballot and reveal take
 * the screen, after the election and the law ballot.
 */

const PLAYERS: PlayerView[] = [
  aPlayer({ id: 's1', name: 'Lena', slot: 0, reputation: 72 }),
  aPlayer({ id: 's2', name: 'Kai', slot: 1, reputation: 50 }),
  aPlayer({ id: 's3', name: 'Ossa', slot: 2, reputation: 25, isAi: true }),
];
const BUDGET: BudgetView = {
  lines: [
    { line: 'projects', share: 80, start: 60, maxShare: 100, step: 5, credits: 0, maxCredits: null },
    { line: 'welfare', share: 10, start: 0, maxShare: 20, step: 5, credits: 0, maxCredits: 200 },
  ],
  kept: 10,
  welfareTo: 's3',
  setBy: 's2',
  frozen: false,
};
const overrule = (stage: OverruleView['stage'], extra: Partial<OverruleView> = {}): OverruleView => ({
  target: 'tax', caller: 's1', stage, restores: { tax: 5 }, stands: { tax: 9 }, voted: [], done: [], waitingFor: [],
  clockMs: 4000, revealMs: 4000, total: 3, needed: 2, result: null, ...extra,
});

function politics(extra: Partial<PoliticsView> = {}): PoliticsView {
  return {
    governor: 's2', sheriff: null, term: null, next: 4, baron: null,
    tax: { percent: 9, start: 5, low: 0, high: 10 }, fund: 0, pay: { governor: 50 },
    weights: [], candidates: { governor: [] }, promises: {}, promise: null, promiseFrom: null, election: null,
    brokenDeals: [], reputationReasons: {}, budget: BUDGET, ...extra,
  };
}

beforeAll(() => {
  // The fake DOM (for the mounted hook below) stands in for the browser's document: what the TV's parts read of it.
  (document.documentElement as unknown as { dataset?: object }).dataset ??= {};
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 0;
  (globalThis as { MutationObserver?: unknown }).MutationObserver ??= class {
    observe() {}
    disconnect() {}
  };
});

let state: unknown;
// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

function onTv(extra: Partial<PoliticsView> = {}): string {
  const game: MuleView = aMuleView({ phase: 'planning', month: 4, players: PLAYERS, me: null, politics: politics(extra) });
  const seats = game.players.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot, ...(p.isAi ? { kind: 'builtin' as const } : {}) }));
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats, boards: 1, game };
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, watch: () => {} } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TableApp, { room: 'MULE' }) })).replaceAll('<!-- -->', '');
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
const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('SB-5b: the budget and the overrule on the TV planning screen', () => {
  it("the budget line shares the Governor's-promise row, on its right", () => {
    const row = element(onTv(), 'tv-promise-row');
    expect(row).toMatch(/^<div[^>]*class="[^"]*\bflex\b[^"]*\bitems-center\b/);
    expect(row.indexOf('data-testid="tv-governor-promise"')).toBeGreaterThanOrEqual(0);
    expect(row.indexOf('data-testid="tv-governor-promise"')).toBeLessThan(row.indexOf('data-testid="tv-budget-line"'));
    expect(row).not.toContain('tv-overrule-called-line');
  });

  it('while a call holds, the row says "Overrule called: tax frozen" instead of the budget line', () => {
    const row = element(onTv({ overrule: overrule('called') }), 'tv-promise-row');
    expect(words(element(row, 'tv-overrule-called-line'))).toBe('Overrule called: tax frozen');
    expect(row).not.toContain('tv-budget-line');
  });

  it('a call the screen opens on is old news: no moment over the map', () => {
    expect(onTv({ overrule: overrule('called') })).not.toContain('data-testid="tv-overrule-call"');
  });

  it("the overrule's ballot and its reveal take the screen; a law ballot still open comes first", () => {
    for (const stage of ['ballot', 'reveal'] as const) {
      const html = onTv({ overrule: overrule(stage, stage === 'reveal' ? { result: { passed: true, yes: 2, no: 1 } } : {}) });
      expect(html, stage).toContain(`data-testid="tv-overrule-${stage}"`);
      expect(html, stage).not.toContain('data-testid="tv-planning"');
    }
    // A law ballot still open comes first; the overrule's ballot waits behind it.
    const council: CouncilView = { stage: 'ballot', proposal: { kind: 'repeal', law: 'landTax' }, proposer: 's1', impact: {}, voted: [], done: [], waitingFor: ['s1', 's2', 's3'], clockMs: 0, revealMs: 0, result: null };
    const both = onTv({ council, overrule: overrule('ballot') });
    expect(both).toContain('data-testid="tv-council-voted"');
    expect(both).not.toContain('data-testid="tv-overrule-ballot"');
  });
});

describe('SB-5b: a TV moment (moments.ts)', () => {
  it(`is a moment for ${TV_MOMENT_MS} ms of server time from when the screen first saw it; never when it was there already`, () => {
    expect(TV_MOMENT_MS).toBe(8000);
    expect(isMoment(1000, 1000)).toBe(true);
    expect(isMoment(1000, 1000 + TV_MOMENT_MS - 1)).toBe(true);
    expect(isMoment(1000, 1000 + TV_MOMENT_MS)).toBe(false);
    expect(isMoment(null, 1000)).toBe(false);
    expect(isMoment(undefined, 1000)).toBe(false);
  });

  describe('useMoment, mounted', () => {
    let root: Root | null = null;
    const host = document.createElement('div') as unknown as FakeElement;
    beforeAll(() => {
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    });
    afterEach(() => {
      const r = root;
      if (r) act(() => r.unmount());
      root = null;
    });
    const seen: boolean[] = [];
    function Probe({ k, now }: { k: string | null; now: number }) {
      seen.push(useMoment(k, now));
      return null;
    }
    const show = (k: string | null, now: number) => act(() => root!.render(createElement(Probe, { k, now })));

    it('an event that arrives while the screen is up is a moment until its time is up; one it opened on never is', () => {
      root = createRoot(host as unknown as Element);
      seen.length = 0;
      show('call:4:tax:s1', 0);
      show('call:4:tax:s1', 100);
      expect(seen.every((m) => !m), 'opened on: old news').toBe(true);
      seen.length = 0;
      show(null, 200);
      show('call:5:tax:s1', 1000);
      show('call:5:tax:s1', 1000 + TV_MOMENT_MS - 1);
      show('call:5:tax:s1', 1000 + TV_MOMENT_MS);
      expect(seen).toEqual([false, true, true, false]);
    });

    it('a call withdrawn and called again by the same player that month is not a moment twice (PM ruling 8 Nov)', () => {
      root = createRoot(host as unknown as Element);
      seen.length = 0;
      show(null, 0);
      show('call:4:tax:s1', 1000);
      show(null, 2000);
      // Called again inside the first call's time, and again after it: neither is a moment.
      show('call:4:tax:s1', 3000);
      show(null, 4000);
      show('call:4:tax:s1', 20_000);
      // Another player's call is a moment of its own.
      show(null, 21_000);
      show('call:4:tax:s2', 22_000);
      expect(seen).toEqual([false, true, false, false, false, false, false, true]);
    });
  });
});
