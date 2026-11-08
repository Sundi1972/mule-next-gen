import type { ColonyView, CouncilView, ElectionView, MuleView, MyView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { document, type FakeElement } from './fake-dom';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { POLITICS_TABS } from '../src/phone/hub/politics/slots';
import type { HubSeat } from '../src/phone/hub/slots';

/* Only the open desk's focus is read from the hub, so the hub's navigation is a stub: these bodies are drawn outside a Hub. */
const hub = vi.hoisted(() => ({ focus: null as string | null, takeFocus: vi.fn() }));
vi.mock('../src/phone/hub/Hub', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/phone/hub/Hub')>()),
  useHub: () => ({ desk: 'council', tool: 'look', focus: hub.focus, openDesk: () => {}, pickTool: () => {}, takeFocus: hub.takeFocus }),
}));

const player = (id: string, name: string, slot: number): PlayerView => ({ id, name, isAi: false, color: '', species: 'zipwing', money: 1000, worth: 0, lastWorth: null, worthBeforeCut: null, plots: 0, ready: false, doneDeveloping: false, condition: null, colonist: null, slot });
const PLAYERS = [player('s1', 'Lena', 0), player('s2', 'Ossa', 1), player('s3', 'Kai', 2)];
const stock = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };

const mine = (): MyView =>
  ({
    id: 's1',
    species: 'zipwing',
    stock,
    needs: { food: 5, water: 3 },
    monthNeeds: { ...stock, food: 5, water: 3 },
    droneOrder: [],
    politics: { running: null, ballot: {}, canRun: { governor: true, sheriff: true }, paid: 0, reputation: 50 },
  }) as unknown as MyView;

const election = (stage: ElectionView['stage']): ElectionView => ({ stage, ceremony: null, candidates: { governor: ['s1', 's2'], sheriff: [] }, promises: {}, voted: [], done: [], waitingFor: [], result: {} });
const council = (): CouncilView => ({ stage: 'ballot', proposal: { kind: 'enact', law: 'landTax', setting: 10 }, proposer: 's2', impact: {}, voted: [], done: [], waitingFor: ['s1'], clockMs: 0, revealMs: 4000, result: null });
const pending = { by: 's2', month: 4, proposal: { kind: 'enact', law: 'landTax', setting: 10 } as const, impact: { s1: { cost: 30 }, s2: { cost: 50 }, s3: { cost: 0 } } };

const politics = (extra: Partial<PoliticsView> = {}): PoliticsView =>
  ({
    governor: 's2',
    sheriff: null,
    term: null,
    next: 4,
    baron: null,
    tax: { percent: 5, start: 5, low: 0, high: 10 },
    fund: 0,
    pay: { governor: 50 },
    weights: PLAYERS.map(({ id }) => ({ id, votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } })),
    candidates: { governor: [], sheriff: [] },
    promises: {},
    promise: null,
    promiseFrom: null,
    election: null,
    council: null,
    proposal: null,
    laws: {},
    ...extra,
  }) as unknown as PoliticsView;

const colony = { gauges: { wealth: 0, environment: 30, prestige: 0, happiness: 60, band: 'content' }, lastGauges: null, fund: 100, ledger: null, projects: [], catalogue: [], score: null } as unknown as ColonyView;

const view = (p: PoliticsView | null): MuleView =>
  ({ finished: false, month: 4, maxMonths: 12, phase: 'planning', phaseEndsAt: null, width: 1, height: 1, tiles: [], players: PLAYERS, me: mine(), market: [], air: { level: 22, band: 'clean' }, politics: p, colony }) as unknown as MuleView;

const client = { subscribe: () => () => {}, getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }), serverNow: () => 0, intent: () => {} } as unknown as TableClient;

/** Lena's phone (seat s1) in this game. */
const seatOf = (game: MuleView): HubSeat => ({ view: game, me: game.me!, self: game.players[0]! });

function sub(id: string) {
  return POLITICS_TABS.find((t) => t.id === id)!;
}

/** The sub-tab's body as Lena's phone draws it. */
function draw(id: string, game: MuleView): string {
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: false, connected: true, color: p.slot })), boards: 1, game };
  const value = { table, view: game, me: game.me!, self: game.players[0]!, slot: 0 as Slot };
  const Body: ComponentType = sub(id).Body;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: createElement(Body) }) })).replaceAll('<!-- -->', '');
}

const at = (html: string, testid: string) => html.indexOf(`data-testid="${testid}"`);

describe('SB-3: the politics sub-tabs', () => {
  it('SB-3: the sub-tabs are Laws, Budget, Elections, in that order, with no Badge (the tab row is SB-2)', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
    expect(POLITICS_TABS.map((t) => t.id)).toEqual(['laws', 'budget', 'elections']);
    expect(POLITICS_TABS.map((t) => t.label(seatOf(view(politics()))))).toEqual(['Laws', 'Budget', 'Elections']);
    expect(POLITICS_TABS.every((t) => t.Badge === undefined)).toBe(true);
  });

  it('SB-3: politics off, no sub-tab is shown', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
    const seat = seatOf(view(null));
    for (const t of POLITICS_TABS) expect(t.show?.(seat), t.id).toBe(false);
  });

  describe('on the Governor’s phone', () => {
    const game = view(politics({ governor: 's1' }));

    it('SB-3: Laws shows the Governor’s desk and the laws in force, and no pending law', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
      const html = draw('laws', view(politics({ governor: 's1', proposal: pending })));
      expect(html).toContain('data-testid="gov-tax"');
      expect(html).toContain('data-testid="laws-in-force"');
      expect(html).not.toContain('data-testid="council-pending"');
      expect(html).not.toContain('data-testid="council-tax"');
    });

    it('SB-3: Budget is shown and holds the Commission button', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
      expect(sub('budget').show?.(seatOf(game))).toBe(true);
      expect(draw('budget', game)).toContain('data-testid="commission-open"');
    });
  });

  describe('on another phone', () => {
    const game = view(politics({ governor: 's2', proposal: pending }));

    it('SB-3: Laws shows the tax line, the laws in force and the pending law, with no Governor’s desk and no overrule call', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
      const html = draw('laws', game);
      expect(html).toContain('data-testid="council-tax"');
      expect(html).toContain('data-testid="laws-in-force"');
      expect(html).toContain('data-testid="council-pending"');
      expect(html).not.toContain('data-testid="gov-tax"');
      expect(html).not.toMatch(/overrule/i);
    });

    it('SB-3: Budget is not shown until S5-PR-6 gives it a body', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
      expect(sub('budget').show?.(seatOf(game))).toBe(false);
    });

    it('SB-3: Elections shows the offices and running for office', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
      const html = draw('elections', view(politics({ governor: 's2' })));
      expect(html).toContain('data-testid="run-any-month"');
      expect(html).toContain('data-testid="offices-card"');
    });

    it('SB-3: a door that asks for a focus has it taken once, so pressing the door again asks again', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
      hub.focus = 'run';
      hub.takeFocus.mockClear();
      const game = view(politics({ governor: 's2' }));
      const value = { table: { code: 'MULE', status: 'playing', hostId: 's1', seats: [], boards: 1, game } as unknown as TableView<MuleView>, view: game, me: game.me!, self: game.players[0]!, slot: 0 as Slot };
      const Body = sub('elections').Body;
      const host = document.createElement('div');
      const root = createRoot(host as unknown as HTMLElement);
      (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
      (document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement }).createElementNS ??= (_ns, tag) => document.createElement(tag);
      (document.documentElement as unknown as { dataset?: object }).dataset ??= {};
      (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame ??= () => 0;
      try {
        act(() => root.render(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: createElement(Body) }) })));
        expect(hub.takeFocus).toHaveBeenCalledTimes(1);
      } finally {
        act(() => root.unmount());
        hub.focus = null;
      }
    });
  });

  describe('an open law ballot', () => {
    const game = view(politics({ council: council() }));

    it('SB-3: Laws opens first, and the ballot is the first thing in it', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
      expect(sub('laws').first?.(seatOf(game))).toBe(true);
      const html = draw('laws', game);
      expect(at(html, 'phone-ballot')).toBeGreaterThan(-1);
      expect(at(html, 'phone-ballot')).toBeLessThan(at(html, 'council-tax'));
      expect(at(html, 'phone-ballot')).toBeLessThan(at(html, 'laws-in-force'));
    });

    it('SB-3: on the Governor’s phone the ballot comes before the Governor’s desk', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
      const html = draw('laws', view(politics({ governor: 's1', council: council() })));
      expect(at(html, 'phone-ballot')).toBeGreaterThan(-1);
      expect(at(html, 'phone-ballot')).toBeLessThan(at(html, 'gov-tax'));
    });

    it('SB-3: with no ballot open Laws does not ask to open first', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
      expect(sub('laws').first?.(seatOf(view(politics())))).toBeFalsy();
    });
  });

  describe('an open election', () => {
    it.each(['announce', 'ballot'] as const)('SB-3: in %s Elections opens first and shows election day', (stage) => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
      const game = view(politics({ election: election(stage) }));
      expect(sub('elections').first?.(seatOf(game))).toBe(true);
      const html = draw('elections', game);
      expect(html).not.toContain('data-testid="run-any-month"');
      expect(html).toContain('data-testid="day-title"');
    });

    it('SB-3: during the ceremony Elections does not ask first', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
      expect(sub('elections').first?.(seatOf(view(politics({ election: election('ceremony') }))))).toBe(false);
    });

    it('SB-3: once the election is over Elections shows the offices and does not ask first', () => { // trace-allow: SB-3 has no spec AC ids; the PM-ruled scope of 8 Nov, proved against the approved hub-tabs mock
      const game = view(politics({ election: election('over') }));
      expect(sub('elections').first?.(seatOf(game))).toBeFalsy();
      expect(draw('elections', game)).toContain('data-testid="council-result"');
    });
  });
});
