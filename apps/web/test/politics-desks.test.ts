import { POLITICS, type CanRun, type CeremonyBeat, type ElectionHow, type Office, type TaxPromise } from '@mule/engine';
import type { ElectionView, MuleView, MyView, PlayerView, PoliticsView } from '@mule/protocol';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { ColonyDesk } from '../src/phone/hub/desks';
import { ColonyWithFacts } from '../src/phone/hub/politics/Colony';
import { CouncilDesk, PromisePicker } from '../src/phone/hub/politics/Council';
import { OfficesLine } from '../src/phone/hub/politics/Offices';
import { GovernorDesk } from '../src/phone/hub/politics/Governor';
import { electionNow } from '../src/phone/hub/politics/slots';
import { TvElection } from '../src/table/TvElection';

const player = (id: string, name: string, slot: number): PlayerView => ({ id, name, isAi: false, color: '', species: 'zipwing', money: 1000, worth: 0, plots: 0, ready: false, doneDeveloping: false, condition: null, colonist: null, slot });
const PLAYERS = [player('s1', 'Lena', 0), player('s2', 'Ossa', 1), player('s3', 'Kai', 2), player('s4', 'Brix', 3), player('s5', 'Pip', 4)];
const stock = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0, alloy: 0, electronics: 0, medicine: 0 };

const election = (extra: Partial<ElectionView> = {}): ElectionView => ({
  stage: 'announce',
  ceremony: null,
  candidates: { governor: [], sheriff: [] },
  promises: {},
  voted: [],
  done: [],
  waitingFor: [],
  result: {},
  ...extra,
});

/** The ceremony with the show at an office's beat, this many seconds of a 5-second show left. */
const at = (office: Office, beat: CeremonyBeat, left = 2): ElectionView['ceremony'] => ({ seconds: 5 - left, total: 5, reached: { [office]: { beat, at: 0 } } });

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
  candidates: { governor: [], sheriff: [] },
  promises: {},
  promise: null,
  election: election(),
  ...extra,
});

const me = (extra: Partial<NonNullable<MyView['politics']>> = {}): MyView => ({
  id: 's1',
  species: 'zipwing',
  stock: { ...stock, food: 9 },
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
  politics: { running: null, ballot: {}, canRun: { governor: true, sheriff: true }, paid: 0, reputation: 50, ...extra },
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

/** The text inside the element carrying this data-testid, tags stripped, up to its own closing tag. */
function textOf(html: string, testid: string): string {
  const open = tagOf(html, testid);
  expect(open, `an element with data-testid="${testid}"`).toBeDefined();
  const tag = /^<([a-z]+)/.exec(open!)![1]!;
  const from = html.indexOf(open!) + open!.length;
  const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  tags.lastIndex = from;
  let depth = 1;
  let end = from;
  for (let m = tags.exec(html); m && depth > 0; m = tags.exec(html)) {
    depth += m[1] ? -1 : 1;
    end = m.index;
  }
  return html
    .slice(from, end)
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

/** The Sheriff path: each test of the calling block runs with both offices elected, and the config's list comes back after it. */
function bothOffices(): void {
  let saved: Office[];
  beforeEach(() => {
    saved = POLITICS.offices;
    POLITICS.offices = ['governor', 'sheriff'];
  });
  afterEach(() => {
    POLITICS.offices = saved;
  });
}

const CAP_8: TaxPromise = { kind: 'cap', percent: 8 };
const HOLD: TaxPromise = { kind: 'hold' };

describe('the politics desks', () => {
  bothOffices();

  it.each<[string, Record<Office, CanRun>, Record<Office, string | null>]>([
    ['both open', { governor: true, sheriff: true }, { governor: null, sheriff: null }],
    ['two Governor terms in a row', { governor: 'termLimit', sheriff: true }, { governor: '2 Governor terms in a row', sheriff: null }],
    ['candidates closed', { governor: 'closed', sheriff: 'closed' }, { governor: 'Candidates are closed until the result', sheriff: 'Candidates are closed until the result' }],
  ])('T-AC-60, RULE-60: a seat that may not run sees why on the run button (%s)', (_, canRun, why) => {
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
    ['appointed', 'governor', 'Nobody ran: the richest player is appointed, by lot if several are.'],
    ['appointed', 'sheriff', 'Nobody ran: the richest player who isn’t Governor is appointed, by lot if several are.'],
    ['baron', 'sheriff', 'A tie: Ossa, the Land Baron, broke it.'],
    ['land', 'governor', 'A tie: the most plots won it.'],
    ['lot', 'governor', 'A tie: decided by lot.'],
  ])('RULE-3: the TV and the phones say how an office was won (%s, %s)', (how, office, line) => {
    const other: Office = office === 'governor' ? 'sheriff' : 'governor';
    const tallies = how === 'appointed' || how === 'unopposed' ? [] : [{ id: 's2', votes: 2 }, { id: 's3', votes: 2 }];
    const result = { [office]: { winner: 's2', how, tallies }, [other]: { winner: 's3', how: 'votes' as const, tallies: [{ id: 's3', votes: 1 }] } } as Record<Office, { winner: string; how: ElectionHow; tallies: { id: string; votes: number }[] }>;
    const game = view(politics({ baron: 's2', election: election({ stage: 'ceremony', ceremony: at('sheriff', 'winner'), result }) }));
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
    [3, '3'],
    [2.2, '3'],
    [0.05, '1'],
  ])("B-AC-62: before the first office's bars beat, with nothing shown, the TV counts down the show (%s s left → %s)", (left, shown) => {
    const html = onTv(view(politics({ election: election({ stage: 'ceremony', ceremony: at('governor', 'title', left), result: {} }) })));
    expect(tagOf(html, 'ballot-reveal')).toBeUndefined();
    expect(textOf(html, 'ballot-countdown').match(/\d+/)?.[0]).toBe(shown);
  });

  it("B-AC-62: the TV and the phones draw an office's totals only from its bars beat and its winner only from its winner beat", () => {
    const tallies = [{ id: 's1', votes: 3 }, { id: 's2', votes: 1 }];
    const bars = view(politics({ election: election({ stage: 'ceremony', ceremony: at('governor', 'bars'), result: { governor: { tallies } } }) }));
    const tv = onTv(bars);
    const row = (html: string, id: string) => chunkOf(html, `result-governor-${id}`, 'result-').replace(/<[^>]+>/g, '');
    expect(row(tv, 's1'), 'the bars beat draws the candidates and their totals').toMatch(/^Lena3(?!\d)/);
    expect(row(tv, 's2')).toMatch(/^Ossa1(?!\d)/);
    expect(tv, 'no winner in the bars beat').not.toContain('ELECTED');
    expect(tagOf(tv, 'how-governor')).toBeUndefined();
    expect(textOf(onPhone(bars, CouncilDesk), 'phone-election-result')).not.toContain('Governor');

    const winner = view(politics({ election: election({ stage: 'ceremony', ceremony: at('governor', 'winner'), result: { governor: { winner: 's1', how: 'votes', tallies } } }) }));
    expect(row(onTv(winner), 's1')).toMatch(/^Lena3ELECTED/);
    expect(textOf(onTv(winner), 'how-governor')).toBe('Won on votes.');
    expect(tagOf(onTv(winner), 'result-sheriff-s3'), 'the Sheriff comes after').toBeUndefined();
    expect(textOf(onPhone(winner, CouncilDesk), 'phone-election-result')).toMatch(/Governor\s*You\s*3 votes/);
    expect(textOf(onPhone(winner, CouncilDesk), 'phone-election-result')).not.toContain('Sheriff');
  });

  it("C11, H-5: with politics off the Colony desk is exactly WS6's; with it on, the colony fund comes before it and the colony facts after it", () => {
    const off = view(null, { ...me(), politics: null });
    expect(onPhone(off, ColonyWithFacts)).toBe(onPhone(off, ColonyDesk));
    expect(onPhone(off, ColonyWithFacts)).not.toContain('colony-facts');
    expect(onPhone(off, ColonyWithFacts)).not.toContain('fund-card');

    const on = view(politics({ governor: 's2', baron: 's2', tax: { percent: 8, start: 5, low: 0, high: 10 }, fund: 840 }));
    const html = onPhone(on, ColonyWithFacts);
    const desk = onPhone(on, ColonyDesk);
    expect(html.indexOf('data-testid="fund-card"')).toBeLessThan(html.indexOf(desk));
    expect(html.indexOf(desk)).toBeLessThan(html.indexOf('data-testid="colony-facts"'));
    expect(textOf(html, 'fund-in')).toBe('the 8% sales tax on every sale; Ossa, the Governor, sets it');
    expect(textOf(html, 'fund-out')).toBe('Governor 50 cr a month, Sheriff 30 cr a month');
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

  it('C4, RULE-4: the vote weights are two columns, Player and Votes, with the parts under the name and a zero part left out', () => {
    const weights = politics().weights.map((w) =>
      w.id === 's2' ? { id: 's2', votes: 4, parts: { base: 1, land: 1, reputation: -1, baron: 1, taxes: 2 } } : w.id === 's3' ? { id: 's3', votes: 2, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 1 } } : w,
    );
    const html = onPhone(view(politics({ weights })), CouncilDesk);
    const table = html.slice(html.indexOf('data-testid="vote-weights"'));
    expect(table.match(/<th\b/g)?.length, 'Player and Votes only').toBe(2);
    expect(textOf(html, 'weight-s2')).toBe('Ossa' + 'base 1 · land +1 · rep. −1 · Baron +1 · taxes +2' + '4');
    expect(textOf(html, 'weight-votes-s2')).toBe('4');
    expect(textOf(html, 'weight-s3'), 'zero parts left out').toBe('Kai' + 'base 1 · taxes +1' + '2');
  });

  it("C12, B-AC-60: in announce the desk lists the candidacy Politics holds; after running, the line names the office and, for Governor, the promise; a Sheriff's line has none", () => {
    const gov = onPhone(view(politics({ candidates: { governor: ['s1', 's2'], sheriff: [] }, promises: { s1: CAP_8, s2: HOLD } }), me({ running: 'governor' })), CouncilDesk);
    expect(textOf(gov, 'running')).toBe('You run for Governor, promising “Tax no higher than 8%”; one office at a time.Withdraw');
    expect(textOf(gov, 'candidates')).toBe('Governor: Lena, OssaSheriff: nobody yet');
    expect(tagOf(gov, 'promise-pick')).toBeUndefined();
    const sheriff = onPhone(view(politics({ candidates: { governor: [], sheriff: ['s1'] } }), me({ running: 'sheriff' })), CouncilDesk);
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
    const html = onTv(view(politics({ election: election({ stage: 'ceremony', ceremony: at('sheriff', 'winner'), result, promises }) })));
    const row = (office: Office, id: string) => chunkOf(html, `result-${office}-${id}`, 'result-').replace(/<[^>]+>/g, '');
    expect(row('governor', 's1')).toContain('Lena“Tax no higher than 8%”');
    expect(row('governor', 's2')).toContain('Ossa“Hold the tax”');
    expect(row('sheriff', 's3')).not.toMatch(/[“”]/);
    expect(chunkOf(html, 'result-sheriff-s4', 'how-').replace(/<[^>]+>/g, '')).not.toMatch(/[“”]/);
  });

  it('C12: a view missing a Governor candidate\'s promise (malformed or older view) draws no empty quote on the ballot or the TV', () => {
    // Defensive render only: the engine refuses every Governor run without a promise.
    const candidates = { governor: ['s1', 's5'], sheriff: [] };
    const ballot = onPhone(view(politics({ election: election({ stage: 'ballot', candidates, promises: { s1: CAP_8 } }) })), CouncilDesk);
    expect(textOf(ballot, 'promise-s1')).toBe('“Tax no higher than 8%”');
    expect(tagOf(ballot, 'promise-s5')).toBeUndefined();
    expect(ballot).not.toContain('“”');
    const result = {
      governor: { winner: 's1', how: 'votes' as const, tallies: [{ id: 's1', votes: 2 }, { id: 's5', votes: 1 }] },
      sheriff: { winner: 's3', how: 'appointed' as const, tallies: [] },
    };
    const tv = onTv(view(politics({ election: election({ stage: 'ceremony', ceremony: at('sheriff', 'winner'), candidates, result, promises: { s1: CAP_8 } }) })));
    expect(chunkOf(tv, 'result-governor-s5', 'how-').replace(/<[^>]+>/g, '')).not.toMatch(/[“”]/);
    expect(tv).not.toContain('“”');
  });

  it("B-AC-6, C12: Now at announce says a Governor candidate promises something about the tax", () => {
    const game = view(politics());
    expect(electionNow({ view: game, me: game.me!, self: PLAYERS[0]! })?.detail).toBe(
      'Election month: Governor and Sheriff. A Governor candidate promises something about the tax. Then the secret ballot, then the result on every screen at once.',
    );
  });
});

describe('T-AC-62: Governor only, the default POLITICS.offices', () => {
  it('T-AC-62: by default the desks and the TV draw one office: no Sheriff run button, candidate row, pay line, Now line or TV line', () => {
    expect(POLITICS.offices).toEqual(['governor']);
    const announce = view(politics({ candidates: { governor: ['s2'] }, pay: { governor: 50 } }), me({ canRun: { governor: true } }));
    const council = onPhone(announce, CouncilDesk);
    expect(tagOf(council, 'run-governor')).toBeDefined();
    expect(tagOf(council, 'run-sheriff')).toBeUndefined();
    expect(textOf(council, 'candidates')).toBe('Governor: Ossa');
    expect(electionNow({ view: announce, me: announce.me!, self: PLAYERS[0]! })?.detail).toMatch(/^Election month: Governor\. /);
    const colony = onPhone(announce, ColonyWithFacts);
    expect(textOf(colony, 'fund-out')).toBe('Governor 50 cr a month');
    expect(colony).not.toContain('Sheriff');

    const tv = onTv(view(politics({ election: election({ stage: 'ceremony', ceremony: at('governor', 'title'), candidates: { governor: ['s1', 's2'] } }) })));
    expect(textOf(tv, 'ballot-countdown')).toContain('Governor, revealed on every screen together');
    expect(tv).not.toContain('Sheriff');
  });
});

describe("the hub's politics parts in plain words (UX audit A-3)", () => {
  /** The view in month `n`, Governor only, with these politics. */
  const month = (n: number, extra: Partial<PoliticsView>): MuleView => ({ ...view(politics({ pay: { governor: 50 }, ...extra })), month: n });

  it.each<[string, string | null, string]>([
    ['with a Governor', 's3', 'the 6% sales tax on every sale; Kai, the Governor, sets it'],
    ['before anyone governs', null, 'the 6% sales tax on every sale'],
  ])('H-5: the Colony desk opens on the colony fund: how much it holds, what fills it and what it pays out each month (%s)', (_, governor, fundIn) => {
    const html = onPhone(month(4, { governor, term: governor ? [4, 6] : null, next: 7, election: election({ stage: 'over' }), tax: { percent: 6, start: 5, low: 0, high: 10 }, fund: 1240 }), ColonyWithFacts);
    expect(html.match(/data-testid="([^"]+)"/)?.[1], 'the first thing in the Colony desk').toBe('fund-card');
    expect(textOf(html, 'fund-total')).toBe('1,240 cr');
    expect(textOf(html, 'fund-in')).toBe(fundIn);
    expect(textOf(html, 'fund-out')).toBe('Governor 50 cr a month');
  });

  it("H-5: the Governor's desk names the tax as everyone reads it, in the fund card's In line", () => {
    const game = month(4, { governor: 's1', term: [4, 6], next: 7, election: null, tax: { percent: 7, start: 5, low: 0, high: 10 } });
    const said = /Everyone sees it in the colony fund: (the \d+% sales tax on every sale)\./.exec(textOf(onPhone(game, GovernorDesk), 'gov-tax'))?.[1];
    expect(said).toBe('the 7% sales tax on every sale');
    expect(textOf(onPhone(game, ColonyWithFacts), 'fund-in')).toBe(`${said}; Lena, the Governor, sets it`);
  });

  it.each<[string, MuleView, string | null, Office[]?]>([
    ["after this month's election", month(4, { governor: 's3', term: [4, 6], next: 7, election: election({ stage: 'over' }) }), 'Governor: Kai, until month 6 · Next election: month 7'],
    ['while this month\'s election is open, on the old term', month(4, { governor: 's2', term: [1, 3], next: 7, election: election({ stage: 'ballot' }) }), 'Governor: Ossa · Election: this month'],
    ['when the game ends before another election', month(10, { governor: 's3', term: [10, 12], next: null, election: null }), 'Governor: Kai, until month 12'],
    ['before anyone governs, with an election coming', month(2, { next: 4, election: null }), 'Next election: month 4'],
    ['with nothing to show', month(11, { next: null, election: null }), null],
    ['with a Sheriff', month(4, { governor: 's3', sheriff: 's4', term: [4, 6], next: 7, election: election({ stage: 'over' }) }), 'Governor: Kai, until month 6 · Sheriff: Brix, until month 6 · Next election: month 7', ['governor', 'sheriff']],
  ])("H-6: the hub's offices line says who governs until when, and when the next election is, in words (%s)", (_, game, line, offices = ['governor']) => {
    const saved = POLITICS.offices;
    POLITICS.offices = offices;
    try {
      const html = onPhone(game, OfficesLine);
      if (line === null) return expect(html).toBe('');
      expect(textOf(html, 'roadmap-offices')).toBe(line);
      expect(line, 'no codes').not.toMatch(/\bM\d|NEXT|ELECTION/);
    } finally {
      POLITICS.offices = saved;
    }
  });
});
