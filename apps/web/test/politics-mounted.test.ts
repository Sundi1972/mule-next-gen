import { document, FakeElement } from './fake-dom';
import type { TaxPromise } from '@mule/engine';
import type { ElectionView, MuleView, MyView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { createElement, type ComponentType } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';

/*
 * The election screens mounted in a fake DOM, for what a server render can't show: what a tap does, and what the
 * ballot forgets when it closes. Taps call the handler React gave the element; the fake DOM dispatches no events.
 */

let ClientProvider: typeof import('../src/net/react').ClientProvider;
let PhoneGameProvider: typeof import('../src/phone/game').PhoneGameProvider;
let Hub: typeof import('../src/phone/hub/Hub').Hub;
let HUB_SLOTS: typeof import('../src/phone/hub/today').HUB_SLOTS;
let ElectionDay: typeof import('../src/phone/hub/politics/ElectionDay').ElectionDay;
let forgetPicks: typeof import('../src/phone/hub/politics/ElectionDay').forgetPicks;
let GovernorDesk: typeof import('../src/phone/hub/politics/Governor').GovernorDesk;

beforeAll(async () => {
  // react-dom/client, imported after the fake DOM, mounts into it; the screens come after both.
  ({ ClientProvider } = await import('../src/net/react'));
  ({ PhoneGameProvider } = await import('../src/phone/game'));
  ({ Hub } = await import('../src/phone/hub/Hub'));
  ({ HUB_SLOTS } = await import('../src/phone/hub/today'));
  ({ ElectionDay, forgetPicks } = await import('../src/phone/hub/politics/ElectionDay'));
  ({ GovernorDesk } = await import('../src/phone/hub/politics/Governor'));
  // The fake document makes no SVG namespace; a PlayerMark's svg is an element like any other here.
  const doc = document as unknown as { createElementNS?: (ns: string, tag: string) => FakeElement };
  doc.createElementNS ??= (_ns, tag) => document.createElement(tag);
  // Nor a dataset, where the hub's theme toggle reads the theme.
  (document.documentElement as unknown as { dataset?: object }).dataset ??= {};
});

const player = (id: string, name: string, slot: number): PlayerView => ({ id, name, isAi: false, color: '', species: 'zipwing', money: 1000, worth: 0, plots: 0, ready: false, doneDeveloping: false, condition: null, colonist: null, slot });
const PLAYERS = [player('s1', 'Lena', 0), player('s2', 'Ossa', 1), player('s3', 'Kai', 2)];
const stock = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };
const HOLD: TaxPromise = { kind: 'hold' };
const CAP_4: TaxPromise = { kind: 'cap', percent: 4 };

const politics = (extra: Partial<PoliticsView>): PoliticsView => ({
  governor: null,
  sheriff: null,
  term: null,
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

const me = (ballot: MyView['politics'] extends infer P ? (P extends { ballot: infer B } ? B : never) : never = {}): MyView => ({
  id: 's1',
  species: 'zipwing',
  stock,
  carriedMule: null,
  installedThisTurn: false,
  worthParts: { money: 0, goods: 0, plots: 0, land: 0, mules: 0, muleValue: 0, office: 0, cut: 0 },
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
  politics: { running: null, ballot, canRun: { governor: 'closed' }, paid: 0, reputation: 50 },
});

const game = (p: PoliticsView, mine: MyView, month = 4): MuleView => ({
  finished: false,
  month,
  maxMonths: 12,
  phase: 'planning',
  phaseEndsAt: null,
  width: 1,
  height: 1,
  tiles: [],
  lit: null,
  players: PLAYERS,
  me: mine,
  market: [],
  storeMules: 0,
  mulePrice: 0,
  colonists: 0,
  air: { level: 22, band: 'clean' },
  ship: { arrives: 3, inPort: false, wants: null },
  treasury: { money: 0, salesTax: 0.05 },
  news: [],
  scores: null,
  auction: null,
  listings: [],
  lotSlots: { used: 0, max: 4 },
  landAuction: null,
  production: null,
  politics: p,
});

const ballotDay = (election: Partial<ElectionView> = {}): ElectionView => ({
  stage: 'ballot',
  ceremony: null,
  candidates: { governor: ['s1', 's2'] },
  promises: { s1: CAP_4, s2: HOLD },
  voted: [],
  done: [],
  waitingFor: ['s1', 's2', 's3'],
  result: {},
  ...election,
});

/** Month 4's ballot, Lena and Ossa on it, with Lena's ballot as the server holds it. */
const ballot = (mine: Partial<Record<'governor', string>> = {}) => game(politics({ election: ballotDay() }), me(mine));

/** Lena Governor since month 4 on a promise of at most 4%, the tax at 5% where the month opened. */
const governing = () => game(politics({ governor: 's1', term: [4, 6], promise: CAP_4, promiseFrom: 5 }), me());

/** Every intent the phone sent. */
const sent: unknown[] = [];
const client = {
  subscribe: () => () => {},
  getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
  serverNow: () => 0,
  intent: (intent: unknown) => void sent.push(intent),
} as unknown as TableClient;

const tableOf = (view: MuleView, code: string): TableView<MuleView> => ({
  code,
  status: 'playing',
  hostId: 's1',
  seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })),
  boards: 1,
  game: view,
});

const onPhone = (view: MuleView, screen: ComponentType, code = 'MULE') =>
  createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: { table: tableOf(view, code), view, me: view.me!, self: view.players[0]!, slot: 0 as Slot }, children: createElement(screen) }) });

let root: Root | null = null;
let host: FakeElement;

/** Mounts a screen on Lena's phone, in room `code`. */
function mount(view: MuleView, screen: ComponentType, code = 'MULE'): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host as unknown as HTMLElement);
  flushSync(() => root!.render(onPhone(view, screen, code)));
}

/** Draws the mounted screen again from a new view, as a broadcast does. */
function rerender(view: MuleView, screen: ComponentType): void {
  flushSync(() => root!.render(onPhone(view, screen)));
}

function unmount(): void {
  root?.unmount();
  root = null;
}

afterEach(() => {
  unmount();
  forgetPicks();
  sent.length = 0;
});

/** The mounted element carrying this data-testid. */
function byTestid(testid: string, under: FakeElement = host): FakeElement {
  const found = (function find(node: FakeElement): FakeElement | undefined {
    if (node.getAttribute('data-testid') === testid) return node;
    for (const child of node.childNodes) {
      const hit = child instanceof FakeElement ? find(child) : undefined;
      if (hit) return hit;
    }
    return undefined;
  })(under);
  expect(found, `an element with data-testid="${testid}"`).toBeDefined();
  return found!;
}

/** The handlers React gave a mounted element. */
function handlers(el: FakeElement): Record<string, () => void> {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  expect(key, 'a React element').toBeDefined();
  return (el as unknown as Record<string, Record<string, () => void>>)[key!]!;
}

const tap = (testid: string) => flushSync(() => handlers(byTestid(testid)).onClick!());

/** Lena picks a ballot option, a candidate's id or 'abstain'. */
const pick = (option: string) => flushSync(() => handlers(radio(option)).onChange!());
const radio = (option: string) => byTestid(`ballot-governor-${option}`).findAll('input')[0]!;
const checked = (option: string) => (radio(option) as unknown as { checked?: boolean }).checked === true;

describe('the secret ballot, mounted (C66, AM-21)', () => {
  it("C66, AM-21: another room's ballot opens with nothing chosen and Cast my vote off, once the last one closed", () => {
    mount(ballot(), ElectionDay);
    pick('abstain');
    expect(checked('abstain')).toBe(true);
    unmount();
    const html = renderToStaticMarkup(onPhone(ballot(), () => createElement(Hub, { slots: HUB_SLOTS }), 'ZORP'));
    for (const option of ['s1', 's2', 'abstain']) expect(html.slice(html.indexOf(`data-testid="ballot-governor-${option}"`)).match(/<input[^>]*>/)![0], option).not.toMatch(/checked/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="ready"[^>]*>Cast my vote</);
  });

  it.each(['s2', 'abstain'])("C66, AM-21: changing a vote the server holds shows the new pick at once, before the server's view comes back (to %s)", (option) => {
    mount(ballot({ governor: 's1' }), ElectionDay);
    expect(checked('s1')).toBe(true);
    pick(option);
    expect(checked(option), option).toBe(true);
    expect(checked('s1')).toBe(false);
    expect(sent).toEqual([{ type: 'vote', office: 'governor', candidate: option === 'abstain' ? null : option }]);
  });

  it('C66, AM-21: once the server holds the changed vote, it stays shown', () => {
    mount(ballot({ governor: 's1' }), ElectionDay);
    pick('abstain');
    rerender(ballot(), ElectionDay);
    expect(checked('abstain')).toBe(true);
  });

  it("C66, AM-21: a vote changed elsewhere since this phone's pick shows the server's", () => {
    mount(ballot({ governor: 's1' }), ElectionDay);
    pick('s2');
    rerender(ballot({ governor: 's2' }), ElectionDay);
    rerender(ballot({ governor: 's1' }), ElectionDay);
    expect(checked('s1')).toBe(true);
    expect(checked('s2')).toBe(false);
  });

  /** The option the ballot shows checked, or none. */
  const shown = () => ['s1', 's2', 'abstain'].filter(checked);

  it("C66, AM-21: while this phone's votes travel, the server's answers to the earlier ones never replace the latest (s1 held, then s2 and back to s1)", () => {
    mount(ballot({ governor: 's1' }), ElectionDay);
    pick('s2');
    pick('s1');
    rerender(ballot({ governor: 's2' }), ElectionDay);
    expect(shown(), 'the answer to s2').toEqual(['s1']);
    rerender(ballot({ governor: 's1' }), ElectionDay);
    expect(shown(), 'the answer to s1').toEqual(['s1']);
  });

  it("C66, AM-21: while this phone's votes travel, the server's answers to the earlier ones never replace the latest (s1, s2, s1); a change elsewhere after the last shows", () => {
    mount(ballot(), ElectionDay);
    pick('s1');
    pick('s2');
    pick('s1');
    for (const answer of ['s1', 's2', 's1']) {
      rerender(ballot({ governor: answer }), ElectionDay);
      expect(shown(), `the answer ${answer}`).toEqual(['s1']);
    }
    rerender(ballot({ governor: 's2' }), ElectionDay);
    expect(shown(), 'a change elsewhere').toEqual(['s2']);
  });

  it("C66, AM-21: while this phone's votes travel, the server's answers to the earlier ones never replace the latest (s1, then Abstain)", () => {
    mount(ballot(), ElectionDay);
    pick('s1');
    pick('abstain');
    rerender(ballot({ governor: 's1' }), ElectionDay);
    expect(shown(), 'the answer to s1').toEqual(['abstain']);
    rerender(ballot(), ElectionDay);
    expect(shown(), 'the answer to Abstain').toEqual(['abstain']);
  });
});

describe("the Governor's Set, mounted (E-7)", () => {
  const off = (testid: string) => byTestid(testid).getAttribute('disabled') !== null;

  it("E-7: Set is off while the tax it sent is on its way", () => {
    mount(governing(), GovernorDesk);
    tap('tax-down');
    tap('tax-confirm');
    expect(sent).toEqual([{ type: 'setTax', percent: 4 }]);
    expect(byTestid('tax-confirm').textContent).toBe('Set 4%');
    expect(off('tax-confirm')).toBe(true);
  });

  it('E-7: a tax that never came back can be sent again: stepping away and back opens Set', () => {
    mount(governing(), GovernorDesk);
    tap('tax-down');
    tap('tax-confirm');
    tap('tax-up');
    tap('tax-down');
    expect(off('tax-confirm')).toBe(false);
    tap('tax-confirm');
    expect(sent).toEqual([
      { type: 'setTax', percent: 4 },
      { type: 'setTax', percent: 4 },
    ]);
  });
});
