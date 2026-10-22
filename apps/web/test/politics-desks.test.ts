import { POLITICS, type CanRun, type ElectionHow, type Office, type TaxPromise } from '@mule/engine';
import type { ElectionView, MuleView, MyView, PlayerView, PoliticsView } from '@mule/protocol';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { ColonyDesk } from '../src/phone/hub/desks';
import { ColonyWithFacts } from '../src/phone/hub/politics/Colony';
import { CouncilDesk, PromisePicker } from '../src/phone/hub/politics/Council';
import { GovernorDesk } from '../src/phone/hub/politics/Governor';
import { electionNow } from '../src/phone/hub/politics/slots';
import { TvElection } from '../src/table/TvElection';

const player = (id: string, name: string, slot: number): PlayerView => ({ id, name, isAi: false, color: '', species: 'zipwing', money: 1000, plots: 0, ready: false, doneDeveloping: false, slot });
const PLAYERS = [player('s1', 'Lena', 0), player('s2', 'Ossa', 1), player('s3', 'Kai', 2), player('s4', 'Brix', 3)];
const stock = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };

const election = (extra: Partial<ElectionView> = {}): ElectionView => ({
  stage: 'nominate',
  seconds: 14,
  total: 20,
  candidates: { governor: [], sheriff: [] },
  promises: {},
  voted: [],
  done: [],
  result: null,
  ...extra,
});

const politics = (extra: Partial<PoliticsView> = {}): PoliticsView => ({
  governor: null,
  sheriff: null,
  term: null,
  next: 4,
  baron: null,
  tax: { percent: 5, start: 5, low: 0, high: 10 },
  fund: 0,
  pay: { governor: 50, sheriff: 30 },
  weights: PLAYERS.map(({ id }) => ({ id, votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } })),
  election: election(),
  ...extra,
});

const me = (extra: Partial<NonNullable<MyView['politics']>> = {}): MyView => ({
  id: 's1',
  species: 'zipwing',
  stock: { ...stock, food: 9 },
  carriedMule: null,
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
  politics: { running: null, ballot: {}, canRun: { governor: true, sheriff: true }, ...extra },
});

function view(p: PoliticsView | null, mine = me()): MuleView {
  return {
    finished: false,
    month: 1,
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
  };
}

const client = {
  subscribe: () => () => {},
  getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
  serverNow: () => 0,
  intent: () => {},
} as unknown as TableClient;

/** A desk as Lena's phone draws it, from this view. */
function onPhone(game: MuleView, desk: () => ReactElement | null): string {
  const table = { code: 'MULE', status: 'playing' as const, hostId: 's1', seats: [], boards: 1, game };
  const value = { table, view: game, me: game.me!, self: PLAYERS[0]!, slot: 0 as const };
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: createElement(desk) }) }));
}

function onTv(game: MuleView): string {
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvElection, { game }) }));
}

/** The opening tag of the element carrying this data-testid, or undefined. */
const tagOf = (html: string, testid: string) => html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>`))?.[0];

/** The text inside the element carrying this data-testid, tags stripped. Assumes no element of the same tag nests in it. */
function textOf(html: string, testid: string): string {
  const open = tagOf(html, testid);
  expect(open, `an element with data-testid="${testid}"`).toBeDefined();
  const tag = /^<([a-z]+)/.exec(open!)![1]!;
  const from = html.indexOf(open!) + open!.length;
  return html
    .slice(from, html.indexOf(`</${tag}>`, from))
    .replace(/<[^>]+>/g, '')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const disabled = (html: string, testid: string) => /\sdisabled=""/.test(tagOf(html, testid) ?? '');

/** The markup from the element carrying this data-testid up to the next element whose testid starts with `next`. */
function chunkOf(html: string, testid: string, next: string): string {
  const open = tagOf(html, testid);
  expect(open, `an element with data-testid="${testid}"`).toBeDefined();
  const from = html.indexOf(open!) + open!.length;
  const end = html.indexOf(`data-testid="${next}`, from);
  return html.slice(from, end < 0 ? undefined : end);
}

/** The promise picker as Lena's phone draws it when she taps "Run for Governor", at this tax. */
function picker(percent: number): string {
  const Picker = () => createElement(PromisePicker, { onRun: () => {}, onCancel: () => {} });
  return onPhone(view(politics({ tax: { percent, start: percent, low: 0, high: 15 } })), Picker);
}

const CAP_8: TaxPromise = { kind: 'cap', percent: 8 };
const HOLD: TaxPromise = { kind: 'hold' };

describe('the politics desks', () => {
  it.each<[string, Record<Office, CanRun>, Record<Office, string | null>]>([
    ['both open', { governor: true, sheriff: true }, { governor: null, sheriff: null }],
    ['two Governor terms in a row', { governor: 'termLimit', sheriff: true }, { governor: '2 Governor terms in a row', sheriff: null }],
    ['candidates closed', { governor: 'closed', sheriff: 'closed' }, { governor: 'Candidates are closed', sheriff: 'Candidates are closed' }],
  ])('RULE-2: a seat that may not run sees why on the run button (%s)', (_, canRun, why) => {
    const html = onPhone(view(politics(), me({ canRun })), CouncilDesk);
    for (const office of ['governor', 'sheriff'] as const) {
      const button = `run-${office}`;
      expect(disabled(html, button), `${button} disabled`).toBe(why[office] !== null);
      if (why[office] === null) expect(textOf(html, button)).not.toMatch(/closed|in a row/);
      else expect(textOf(html, button)).toBe(why[office]);
    }
    expect(tagOf(html, 'cannot-run') !== undefined).toBe(why.governor !== null || why.sheriff !== null);
  });

  it.each<[ElectionHow, Office, string]>([
    ['votes', 'governor', 'Won on votes.'],
    ['unopposed', 'governor', 'Elected unopposed: no ballot for this office.'],
    ['appointed', 'governor', 'Nobody ran: the richest player is appointed.'],
    ['appointed', 'sheriff', 'Nobody ran: the richest player who isn’t Governor is appointed.'],
    ['baron', 'sheriff', 'A tie: Ossa, the Land Baron, broke it.'],
    ['tieRule', 'governor', 'Tied: most plots wins, then seat order.'],
  ])('RULE-3: the TV and the phones say how an office was won (%s, %s)', (how, office, line) => {
    const other: Office = office === 'governor' ? 'sheriff' : 'governor';
    const tallies = how === 'appointed' || how === 'unopposed' ? [] : [{ id: 's2', votes: 2 }, { id: 's3', votes: 2 }];
    const result = { [office]: { winner: 's2', how, tallies }, [other]: { winner: 's3', how: 'votes' as const, tallies: [{ id: 's3', votes: 1 }] } } as Record<Office, { winner: string; how: ElectionHow; tallies: { id: string; votes: number }[] }>;
    const game = view(politics({ baron: 's2', election: election({ stage: 'reveal', seconds: 2, total: 6, result }) }));
    expect(textOf(onTv(game), `how-${office}`)).toBe(line);
    expect(textOf(onPhone(game, CouncilDesk), 'phone-election-result')).toContain(line);
  });

  it.each<[{ percent: number; start: number; low: number; high: number }, { down: boolean; up: boolean }]>([
    [{ percent: 5, start: 5, low: 0, high: 10 }, { down: false, up: false }],
    [{ percent: 10, start: 5, low: 0, high: 10 }, { down: false, up: true }],
    [{ percent: 10, start: 15, low: 10, high: 15 }, { down: true, up: false }],
    [{ percent: 0, start: 3, low: 0, high: 8 }, { down: true, up: false }],
  ])("RULE-6: the Governor's tax steps stop at the bounds the view gives (%j)", (tax, stopped) => {
    const html = onPhone(view(politics({ governor: 's1', election: null, tax })), GovernorDesk);
    expect(textOf(html, 'tax-value')).toBe(`${tax.percent}%`);
    expect(disabled(html, 'tax-down'), 'tax-down disabled').toBe(stopped.down);
    expect(disabled(html, 'tax-up'), 'tax-up disabled').toBe(stopped.up);
    expect(textOf(html, 'gov-tax')).toContain(`This month ${tax.low}–${tax.high}%`);
  });

  it.each<[number, string]>([
    [6, '3'],
    [4.2, '2'],
    [3.05, '1'],
  ])("AM-8: while the result is withheld the TV counts down the reveal's first part (%s s left → %s)", (seconds, shown) => {
    const html = onTv(view(politics({ election: election({ stage: 'reveal', seconds, total: 6 }) })));
    expect(tagOf(html, 'ballot-reveal')).toBeUndefined();
    expect(textOf(html, 'ballot-countdown')).toContain(shown);
    expect(textOf(html, 'ballot-countdown').match(/\d+/)?.[0]).toBe(shown);
  });

  it("C11: with politics off the Colony desk is exactly WS6's; with it on, the colony facts follow it", () => {
    const off = view(null, { ...me(), politics: null });
    expect(onPhone(off, ColonyWithFacts)).toBe(onPhone(off, ColonyDesk));
    expect(onPhone(off, ColonyWithFacts)).not.toContain('colony-facts');

    const on = view(politics({ governor: 's2', baron: 's2', tax: { percent: 8, start: 5, low: 0, high: 10 }, fund: 840 }));
    const html = onPhone(on, ColonyWithFacts);
    expect(html.startsWith(onPhone(on, ColonyDesk))).toBe(true);
    expect(textOf(html, 'tax-readonly')).toBe('Sales tax 8% (set by Ossa, +3) · colony fund 840 cr');
    expect(textOf(html, 'land-baron')).toContain('Land Baron Ossa');
  });

  it('RULE-10, C12: the promise picker opens with nothing chosen, so "Run" waits for a promise', () => {
    const html = picker(5);
    expect(tagOf(html, 'promise-pick')).toMatch(/role="radiogroup"/);
    expect(textOf(html, 'promise-pick')).toContain('Tax today: 5%.');
    expect(html.match(/<input[^>]*type="radio"[^>]*>/g)!.some((r) => /checked/.test(r))).toBe(false);
    expect(disabled(html, 'promise-run'), 'promise-run disabled').toBe(true);
    expect(textOf(html, 'promise-run')).toBe('Pick a promise to run');
    expect(textOf(html, 'promise-hold')).toBe('Hold the tax');
    expect(disabled(html, 'promise-cancel'), 'promise-cancel disabled').toBe(false);
  });

  it.each<[number, { minus: boolean; plus: boolean; lower: boolean }]>([
    [5, { minus: false, plus: false, lower: false }],
    [POLITICS.tax.min, { minus: true, plus: false, lower: true }],
    [POLITICS.tax.max, { minus: false, plus: true, lower: false }],
  ])("RULE-10, C12: the cap starts at today's tax (%s%%) and stops at the tax's bounds; Lower is refused at 0%%", (percent, stopped) => {
    const html = picker(percent);
    expect(textOf(html, 'promise-cap-value')).toBe(`${percent}%`);
    expect(disabled(html, 'promise-cap-minus'), 'promise-cap-minus disabled').toBe(stopped.minus);
    expect(disabled(html, 'promise-cap-plus'), 'promise-cap-plus disabled').toBe(stopped.plus);
    const lower = chunkOf(html, 'promise-lower', 'promise-');
    expect(/\sdisabled=""/.test(lower.match(/<input[^>]*>/)![0]), 'the Lower radio disabled').toBe(stopped.lower);
    if (stopped.lower) expect(textOf(html, 'promise-lower')).toBe(`Lower the taxThe tax is already ${POLITICS.tax.min} %.`);
    else expect(textOf(html, 'promise-lower')).toBe('Lower the tax');
  });

  it("C12: after running, the line names the office and, for Governor, the promise; a Sheriff's line has none", () => {
    const gov = onPhone(view(politics({ election: election({ candidates: { governor: ['s1'], sheriff: [] }, promises: { s1: CAP_8 } }) }), me({ running: 'governor' })), CouncilDesk);
    expect(textOf(gov, 'running')).toBe('You run for Governor, promising “Tax no higher than 8%”; one office at a time.Withdraw');
    expect(tagOf(gov, 'promise-pick')).toBeUndefined();
    const sheriff = onPhone(view(politics({ election: election({ candidates: { governor: [], sheriff: ['s1'] } }) }), me({ running: 'sheriff' })), CouncilDesk);
    expect(textOf(sheriff, 'running')).toBe('You run for Sheriff; one office at a time.Withdraw');
  });

  it('B-AC-6, RULE-10: every ballot quotes each Governor candidate\'s promise; a Sheriff candidate has no line, not an empty quote', () => {
    // s3's stray promise would be a server bug; the Sheriff ballot never draws one.
    const promises = { s1: CAP_8, s2: HOLD, s3: { kind: 'lower' } as TaxPromise };
    const game = view(politics({ election: election({ stage: 'ballot', candidates: { governor: ['s1', 's2'], sheriff: ['s3', 's4'] }, promises }) }));
    const html = onPhone(game, CouncilDesk);
    expect(textOf(html, 'promise-s1')).toBe('“Tax no higher than 8%”');
    expect(textOf(html, 'promise-s2')).toBe('“Hold the tax”');
    expect(tagOf(html, 'promise-s3')).toBeUndefined();
    expect(tagOf(html, 'promise-s4')).toBeUndefined();
    expect(html).not.toContain('“”');
  });

  it("B-AC-6, RULE-10: the TV's result quotes each Governor candidate's promise under the name; Sheriff rows have none", () => {
    const result = {
      governor: { winner: 's1', how: 'votes' as const, tallies: [{ id: 's1', votes: 3 }, { id: 's2', votes: 1 }] },
      sheriff: { winner: 's3', how: 'votes' as const, tallies: [{ id: 's3', votes: 2 }, { id: 's4', votes: 2 }] },
    };
    const promises = { s1: CAP_8, s2: HOLD, s3: { kind: 'lower' } as TaxPromise };
    const html = onTv(view(politics({ election: election({ stage: 'reveal', seconds: 2, total: 6, result, promises }) })));
    const row = (office: Office, id: string) => chunkOf(html, `result-${office}-${id}`, 'result-').replace(/<[^>]+>/g, '');
    expect(row('governor', 's1')).toContain('Lena“Tax no higher than 8%”');
    expect(row('governor', 's2')).toContain('Ossa“Hold the tax”');
    expect(row('sheriff', 's3')).not.toMatch(/[“”]/);
    expect(chunkOf(html, 'result-sheriff-s4', 'how-').replace(/<[^>]+>/g, '')).not.toMatch(/[“”]/);
  });

  it("C12: Now at nominate says a Governor candidate promises something about the tax", () => {
    const game = view(politics());
    expect(electionNow({ view: game, me: game.me!, self: PLAYERS[0]! })?.detail).toBe(
      'Election month: Governor and Sheriff. A Governor candidate promises something about the tax. Then the secret ballot, then the result on every screen at once.',
    );
  });
});
