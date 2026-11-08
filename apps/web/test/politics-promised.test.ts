import { document, FakeElement } from './fake-dom';
import { POLITICS } from '@mule/engine';
import type { CouncilView, ElectionView, MuleView, MyPoliticsView, MyView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * S3-C21: a ballot this player promised (MyPoliticsView.promised) says so, and starts on the promised choice on this
 * phone only. S3-RULE-12 (AM-7): the press that makes the player Done sends that choice first when the phone holds no
 * pick of its own and the server no ballot. Both ballots mounted in the real planning hub, ready bar included, in a
 * fake DOM; what reaches the table is read at the client's intents, in order.
 */

let ClientProvider: typeof import('../src/net/react').ClientProvider;
let PhoneGameProvider: typeof import('../src/phone/game').PhoneGameProvider;
let Planning: typeof import('../src/phone/Planning').Planning;
let forgetPicks: typeof import('../src/phone/hub/politics/ElectionDay').forgetPicks;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  ({ ClientProvider } = await import('../src/net/react'));
  ({ PhoneGameProvider } = await import('../src/phone/game'));
  ({ Planning } = await import('../src/phone/Planning'));
  ({ forgetPicks } = await import('../src/phone/hub/politics/ElectionDay'));
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
const PLAYERS: PlayerView[] = [aPlayer({ id: 's1', name: 'Lena', slot: 0, reputation: 50 }), aPlayer({ id: 's2', name: 'Brix', slot: 1, reputation: 61 }), aPlayer({ id: 's3', name: 'Kai', slot: 2, reputation: 44 })];
const MONTH = 8;
type Promised = NonNullable<MyPoliticsView['promised']>;

/** Brix and Kai run for Governor; nobody has voted. */
const ballotDay = (): ElectionView => ({
  stage: 'ballot',
  ceremony: null,
  candidates: { governor: ['s2', 's3'] },
  promises: { s2: { kind: 'hold' }, s3: { kind: 'cap', percent: 4 } },
  voted: [],
  done: [],
  waitingFor: ['s1', 's2', 's3'],
  result: {},
});

/** Kai, the Governor, proposes a land tax of 10 for this month's law vote. */
const lawDay = (): CouncilView => ({
  stage: 'ballot',
  proposal: { kind: 'enact', law: 'landTax', setting: 10 },
  proposer: 's3',
  impact: { s1: { cost: 30 }, s2: { cost: 50 }, s3: { cost: 0 } },
  voted: [],
  done: [],
  waitingFor: ['s1', 's2', 's3'],
  clockMs: 0,
  revealMs: POLITICS.council.revealMs,
  result: null,
});

const politics = (extra: Partial<PoliticsView>): PoliticsView => ({
  governor: 's3',
  sheriff: null,
  term: [5, 7],
  next: 8,
  baron: null,
  tax: { percent: 5, start: 5, low: 0, high: 10 },
  fund: 0,
  pay: { governor: 50 },
  weights: PLAYERS.map(({ id }) => ({ id, votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } })),
  candidates: { governor: ['s2', 's3'] },
  promises: {},
  promise: null,
  promiseFrom: 5,
  election: null,
  proposal: null,
  council: null,
  laws: {},
  retry: {},
  brokenDeals: [],
  ...extra,
});

interface Seat {
  promised?: Promised | undefined;
  /** Lena's election ballot as the server holds it. */
  ballot?: Partial<Record<'governor', string>>;
  /** Lena's law ballot as the server holds it. */
  lawBallot?: boolean | null;
}

const me = (pol: PoliticsView, { promised, ballot = {}, lawBallot = null }: Seat): MyView => ({
  id: 's1',
  species: 'zipwing',
  stock: { ...NO_GOODS },
  carriedMule: null,
  installedThisTurn: false,
  worthParts: { money: 0, goods: 0, plots: 0, land: 0, mules: 0, muleValue: 0, office: 0, donated: 0, cut: 0 },
  claimsLeft: 0,
  hungry: false,
  sick: false,
  needs: { food: 0, water: 0 },
  monthNeeds: { ...NO_GOODS },
  devEndsAt: null,
  devSeconds: 50,
  produced: null,
  mulePrice: 150,
  outfitCosts: { food: 25, water: 25, energy: 50, smithore: 75, crystite: 100, rareEarth: 100, alloy: 150, electronics: 200, medicine: 150, greenBelt: 40 },
  droneOrder: [],
  deals: null,
  politics: pol && { running: null, ballot, canRun: { governor: 'closed' }, paid: 0, reputation: 50, lawBallot, ...(promised ? { promised } : {}) },
});

/** Lena's phone on election day's ballot. */
const electionFor = (seat: Seat = {}): MuleView => {
  const pol = politics({ election: ballotDay() });
  return aMuleView({ month: MONTH, players: PLAYERS, me: me(pol, seat), politics: pol });
};
/** Lena's phone on the law vote. */
const lawFor = (seat: Seat = {}): MuleView => {
  const pol = politics({ council: lawDay() });
  return aMuleView({ month: MONTH, players: PLAYERS, me: me(pol, seat), politics: pol });
};

const BRIX_VOTE: Promised = { election: { governor: { candidate: 's2', to: ['s2'] } }, law: null };
const LAW_YES: Promised = { election: {}, law: { yes: true, to: ['s2'] } };

const sent: unknown[] = [];
const STATE = { status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
const client = {
  subscribe: () => () => {},
  getState: () => STATE,
  serverNow: () => 0,
  intent: (intent: unknown) => void sent.push(intent),
} as unknown as TableClient;

let root: Root | null = null;
let host: FakeElement;

const onPhone = (view: MuleView) => {
  const self = view.players.find((p) => p.id === view.me!.id)!;
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', boards: 1, game: view, seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot })) };
  return createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value: { table, view, me: view.me!, self, slot: self.slot as Slot }, children: createElement(Planning) }) });
};

function mount(view: MuleView): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host as unknown as HTMLElement);
  act(() => root!.render(onPhone(view)));
}

/** A new view for the mounted phone, as a broadcast brings. */
const rerender = (view: MuleView) => act(() => root!.render(onPhone(view)));

afterEach(() => {
  const r = root;
  if (r) act(() => r.unmount());
  root = null;
  forgetPicks();
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
function props(el: FakeElement): Record<string, unknown> {
  const key = Object.keys(el).find((k) => k.startsWith('__reactProps$'));
  expect(key, 'a React element').toBeDefined();
  return (el as unknown as Record<string, Record<string, unknown>>)[key!]!;
}
const text = (testid: string) => byTestid(testid).textContent.replace(/\s+/g, ' ').trim();
const tap = (testid: string) => act(() => (props(byTestid(testid)).onClick as (e?: unknown) => void)({ currentTarget: byTestid(testid) }));
const isDisabled = (testid: string) => props(byTestid(testid)).disabled === true;
const radio = (option: string) => byTestid(`ballot-governor-${option}`).findAll('input')[0]!;
const pick = (option: string) => act(() => (props(radio(option)).onChange as () => void)());
const checked = (option: string) => props(radio(option)).checked === true;
const pressed = (testid: string) => props(byTestid(testid))['aria-pressed'] === true;

const vote = (candidate: string | null) => ({ type: 'vote', office: 'governor', candidate });
const READY = { type: 'ready' };

describe('S3-C21: the election ballot says "You promised"', () => {
  it('S3-B-AC-2: Lena\'s election ballot with MyPoliticsView.promised naming Brix says "You promised Brix your vote" and preselects Brix without sending a vote until she casts', () => {
    mount(electionFor({ promised: BRIX_VOTE }));

    expect(text('ballot-governor-promised')).toContain('You promised Brix your vote');
    expect(text('ballot-governor-promised'), 'what keeping and breaking it does, from POLITICS').toContain('Keep it: +3. Break it: −10, and the table sees it.');
    expect(text('ballot-governor-s2-promised')).toBe('PROMISED');
    expect(findTestid('ballot-governor-s3-promised'), 'only the promised candidate is tagged').toBeUndefined();
    expect(checked('s2'), 'Brix starts picked').toBe(true);
    expect(checked('s3')).toBe(false);
    expect(isDisabled('ready'), 'the preselect counts as a pick: Cast my vote is live').toBe(false);
    rerender(electionFor({ promised: BRIX_VOTE }));
    // S3-HC-2, §0.1's rejected preset: opening and drawing the ballot tell the table nothing.
    expect(sent).toEqual([]);
  });

  it('S3-B-AC-2: a promise of a vote for someone else names both: "You promised Kai your vote for Brix"', () => {
    mount(electionFor({ promised: { election: { governor: { candidate: 's2', to: ['s3'] } }, law: null } }));
    expect(text('ballot-governor-promised')).toContain('You promised Kai your vote for Brix');
    expect(sent).toEqual([]);
  });

  it('S3-B-AC-2: with no promise the ballot is today\'s: no line, nothing picked, Cast my vote off', () => {
    mount(electionFor());
    expect(findTestid('ballot-governor-promised')).toBeUndefined();
    expect(findTestid('ballot-governor-s2-promised')).toBeUndefined();
    expect(checked('s2') || checked('s3') || checked('abstain')).toBe(false);
    expect(isDisabled('ready')).toBe(true);
    expect(sent).toEqual([]);
  });

  // S3-RULE-12's rows on the election ballot: [row, the seat, the taps before Cast, what the table receives in order].
  const ROWS: [string, Seat, string[], unknown[]][] = [
    ['row 4: no own pick, no ballot: the promised vote, then Cast', { promised: BRIX_VOTE }, [], [vote('s2'), READY]],
    ['row 2: an own pick of another candidate stands; no promised vote', { promised: BRIX_VOTE }, ['s3'], [vote('s3'), READY]],
    ['row 2: an explicit Abstain stands; no promised vote', { promised: BRIX_VOTE }, ['abstain'], [vote(null), READY]],
    ['row 2: picking the promised candidate sends it once', { promised: BRIX_VOTE }, ['s2'], [vote('s2'), READY]],
    ['row 2: away from the promise and back: the latest pick, nothing more', { promised: BRIX_VOTE }, ['s3', 's2'], [vote('s3'), vote('s2'), READY]],
    ['row 3: no own pick, a ballot from another device: it stands', { promised: BRIX_VOTE, ballot: { governor: 's3' } }, [], [READY]],
    ['row 1: no promise: today\'s ballot', {}, ['s3'], [vote('s3'), READY]],
  ];

  it.each(ROWS)('S3-T-AC-16: with a promise and no pick, Cast my vote sends the promised choice, then the press · %s', (_row, seat, taps, expected) => {
    mount(electionFor(seat));
    expect(sent, 'nothing on open').toEqual([]);
    for (const t of taps) pick(t);
    // The server's answer to the last pick, as its broadcast brings it: it can't tell an abstention from no pick.
    const last = taps.at(-1);
    if (last) rerender(electionFor({ ...seat, ballot: last === 'abstain' ? {} : { governor: last } }));
    expect(isDisabled('ready'), 'Cast my vote is live').toBe(false);
    tap('ready');
    expect(sent).toEqual(expected);
  });

  it('S3-T-AC-16: row 3 shows the server\'s ballot, not the promise', () => {
    mount(electionFor({ promised: BRIX_VOTE, ballot: { governor: 's3' } }));
    expect(checked('s3')).toBe(true);
    expect(checked('s2')).toBe(false);
  });
});

describe('S3-C21: the law ballot says "You promised"', () => {
  it('S3-B-AC-2: Lena\'s law ballot with MyPoliticsView.promised.law naming Brix says "You promised Brix a yes" and preselects Yes without sending a vote until she is Done', () => {
    mount(lawFor({ promised: LAW_YES }));

    expect(text('ballot-promised')).toContain('You promised Brix a yes');
    expect(text('ballot-promised')).toContain('Keep it: +3. Break it: −10, and the table sees it.');
    expect(text('ballot-yes')).toContain('PROMISED');
    expect(text('ballot-no')).not.toContain('PROMISED');
    expect(pressed('ballot-yes'), 'Yes starts picked').toBe(true);
    expect(pressed('ballot-no')).toBe(false);
    expect(isDisabled('ready'), 'the preselect counts as a vote: Done is live').toBe(false);
    rerender(lawFor({ promised: LAW_YES }));
    expect(sent).toEqual([]);
  });

  it('S3-B-AC-2: with no law promise the law ballot is today\'s: no line, neither answer picked, Done off', () => {
    mount(lawFor({ promised: BRIX_VOTE }));
    expect(findTestid('ballot-promised')).toBeUndefined();
    expect(pressed('ballot-yes') || pressed('ballot-no')).toBe(false);
    expect(isDisabled('ready')).toBe(true);
    expect(sent).toEqual([]);
  });

  const voteLaw = (yes: boolean) => ({ type: 'voteLaw', yes });
  // S3-RULE-12's rows on the law ballot: [row, the seat, the taps before Done, what the table receives in order].
  const LAW_ROWS: [string, Seat, string[], unknown[]][] = [
    ['row 4: no own pick, no ballot: the promised yes, then Done', { promised: LAW_YES }, [], [voteLaw(true), READY]],
    ['row 2: an own No stands, even before the server shows it', { promised: LAW_YES }, ['ballot-no'], [voteLaw(false), READY]],
    ['row 2: tapping the promised Yes sends it once', { promised: LAW_YES }, ['ballot-yes'], [voteLaw(true), READY]],
    ['row 3: no own pick, a No from another device: it stands', { promised: LAW_YES, lawBallot: false }, [], [READY]],
    ['row 1: no law promise: today\'s ballot', { lawBallot: false }, [], [READY]],
  ];

  it.each(LAW_ROWS)("S3-T-AC-16: with a promise and no pick, the law ballot's Ready sends the promised choice, then the press · %s", (_row, seat, taps, expected) => {
    mount(lawFor(seat));
    expect(sent, 'nothing on open').toEqual([]);
    for (const t of taps) tap(t);
    expect(isDisabled('ready'), 'Done is live').toBe(false);
    tap('ready');
    expect(sent).toEqual(expected);
  });

  it("S3-T-AC-16: an own No shows over the promise at once, and after the server's answer", () => {
    mount(lawFor({ promised: LAW_YES }));
    tap('ballot-no');
    expect(pressed('ballot-no')).toBe(true);
    expect(pressed('ballot-yes')).toBe(false);
    rerender(lawFor({ promised: LAW_YES, lawBallot: false }));
    expect(pressed('ballot-no')).toBe(true);
  });
});
