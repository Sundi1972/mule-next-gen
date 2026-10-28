import { ceremonyBeats, POLITICS, type CanRun, type CeremonyBeat, type ElectionHow, type ElectionResult, type Office, type TaxPromise } from '@mule/engine';
import type { ElectionView, MuleView, MyView, OfficeReveal, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import type { Slot } from '@mule/ui';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { PhoneGameProvider } from '../src/phone/game';
import { ColonyDesk } from '../src/phone/hub/desks';
import { AgendaRow, Hub } from '../src/phone/hub/Hub';
import { ColonyWithFacts } from '../src/phone/hub/politics/Colony';
import { CouncilBody } from '../src/phone/hub/politics/Council';
import { ElectionDay, forgetPicks, pickOn } from '../src/phone/hub/politics/ElectionDay';
import { GovernorDesk } from '../src/phone/hub/politics/Governor';
import { OfficesLine } from '../src/phone/hub/politics/Offices';
import { PromiseSheet } from '../src/phone/hub/politics/Run';
import { electionNow, electionReadyWords } from '../src/phone/hub/politics/slots';
import { HUB_SLOTS } from '../src/phone/hub/today';
import { TvElection } from '../src/table/TvElection';
import { drawnSlots } from '../src/phone/hub/slots';

const player = (id: string, name: string, slot: number, plots = 0): PlayerView => ({ id, name, isAi: false, color: '', species: 'zipwing', money: 1000, worth: 0, plots, ready: false, doneDeveloping: false, condition: null, colonist: null, slot });
const PLAYERS = [player('s1', 'Lena', 0), player('s2', 'Ossa', 1), player('s3', 'Kai', 2), player('s4', 'Brix', 3), player('s5', 'Pip', 4)];
const SEATS = PLAYERS.map((p) => p.id);
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

function view(p: PoliticsView | null, mine = me(), extra: Partial<MuleView> = {}): MuleView {
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
    ...extra,
  };
}

const client = {
  subscribe: () => () => {},
  getState: () => ({ status: 'open', role: 'player', code: 'MULE', seatId: 's1', view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
  serverNow: () => 0,
  intent: () => {},
} as unknown as TableClient;

/** The room around a game: Lena hosts; `boards` big screens; `away` seats dropped. */
const tableOf = (game: MuleView, boards = 1, away: string[] = [], code = 'MULE'): TableView<MuleView> => ({
  code,
  status: 'playing',
  hostId: 's1',
  seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: !away.includes(p.id), color: p.slot })),
  boards,
  game,
});

/** A component as Lena's phone draws it, from this view, in room `code`. */
function onPhone(game: MuleView, desk: () => ReactElement | null, boards = 1, code = 'MULE'): string {
  const value = { table: tableOf(game, boards, [], code), view: game, me: game.me!, self: game.players[0]!, slot: 0 as Slot };
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(PhoneGameProvider, { value, children: createElement(desk) }) })).replaceAll('<!-- -->', '');
}

/** Lena's whole planning hub, as the game draws it. */
function inHub(game: MuleView, boards = 1, code = 'MULE'): string {
  const hub = () => createElement(Hub, { slots: HUB_SLOTS });
  return onPhone(game, hub, boards, code);
}

function onTv(game: MuleView, away: string[] = []): string {
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvElection, { table: tableOf(game, 1, away), game }) })).replaceAll('<!-- -->', '');
}

/** The opening tag of the element carrying this data-testid, or undefined. */
const tagOf = (html: string, testid: string) => html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testid}"[^>]*>`))?.[0];

/** The text inside the element carrying this data-testid, tags stripped, up to its own closing tag. */
function textOf(html: string, testid: string): string {
  const open = tagOf(html, testid);
  expect(open, `an element with data-testid="${testid}"`).toBeDefined();
  const tag = /^<([a-z][a-z0-9]*)/.exec(open!)![1]!;
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
const CAP_4: TaxPromise = { kind: 'cap', percent: 4 };
const HOLD: TaxPromise = { kind: 'hold' };
const LOWER: TaxPromise = { kind: 'lower' };

/**
 * The ceremony as the server sends it at `seconds` of the show: each office's latest beat reached and when it began,
 * its totals from its bars beat, its winner and how from its winner beat (or its tie beat). Mirrors politics-view.ts.
 */
function ceremony(result: ElectionResult, seconds: number): Pick<ElectionView, 'ceremony' | 'result'> {
  const beats = ceremonyBeats(SEATS, result);
  const ms = seconds * 1000;
  const reached: NonNullable<ElectionView['ceremony']>['reached'] = {};
  const shown: Partial<Record<Office, OfficeReveal>> = {};
  for (const { office, at } of beats.offices) {
    const order: CeremonyBeat[] = ['title', 'candidates', 'bars', 'tie', 'winner', 'end'];
    const beat = order.filter((b) => at[b] !== null && at[b]! <= ms).at(-1);
    if (beat) reached[office] = { beat, at: at[beat]! / 1000 };
    if (ms >= (at.tie ?? at.winner)) shown[office] = structuredClone(result[office]!);
    else if (ms >= at.bars) shown[office] = { tallies: structuredClone(result[office]!.tallies) };
  }
  return { ceremony: { seconds, total: beats.total / 1000, reached }, result: shown };
}

/** When `beat` of the first office starts, in show seconds, plus `after`. */
function beatAt(result: ElectionResult, beat: Exclude<CeremonyBeat, 'tie'> | 'tie', after = 0.01): number {
  const at = ceremonyBeats(SEATS, result).offices[0]!.at[beat];
  return at! / 1000 + after;
}

const WON: ElectionResult = { governor: { winner: 's1', how: 'votes', tallies: [{ id: 's1', votes: 3 }, { id: 's2', votes: 1 }] } };
const TIED: ElectionResult = { governor: { winner: 's2', how: 'land', tallies: [{ id: 's1', votes: 2 }, { id: 's2', votes: 2 }] } };

/** Month 4's ceremony at `seconds`, Lena and Ossa on the stage, Lena running up to 8% and Ossa holding. */
function inCeremony(result: ElectionResult, seconds: number, extra: Partial<PoliticsView> = {}): MuleView {
  const e = election({ stage: 'ceremony', candidates: { governor: ['s1', 's2'] }, promises: { s1: CAP_8, s2: HOLD }, ...ceremony(result, seconds) });
  return view(politics({ election: e, pay: { governor: 50 }, next: 7, ...extra }), me(), { month: 4 });
}

describe('the Council desk (C66, E-1, E-6)', () => {
  bothOffices();

  it.each<[string, Record<Office, CanRun>, Record<Office, string | null>]>([
    ['both open', { governor: true, sheriff: true }, { governor: null, sheriff: null }],
    ['two Governor terms in a row', { governor: 'termLimit', sheriff: true }, { governor: '2 Governor terms in a row', sheriff: null }],
    ['candidates closed', { governor: 'closed', sheriff: 'closed' }, { governor: 'Candidates are closed until the result', sheriff: 'Candidates are closed until the result' }],
  ])('T-AC-60, RULE-60: a seat that may not run sees why on the run button (%s)', (_, canRun, why) => {
    const html = onPhone(view(politics({ election: null }), me({ canRun }), { month: 2 }), () => createElement(CouncilBody, { focus: null }));
    for (const office of ['governor', 'sheriff'] as const) {
      const button = `run-${office}`;
      expect(disabled(html, button), `${button} disabled`).toBe(why[office] !== null);
      if (why[office] === null) expect(textOf(html, button)).toBe(`Run for ${office === 'governor' ? 'Governor' : 'Sheriff'}`);
      else expect(textOf(html, button)).toBe(why[office]);
    }
  });

  it('C66, E-1: in any month the desk shows who runs so far, each Governor candidate on a promise as a change from today, and your candidacy with Change promise and Withdraw', () => {
    const game = view(politics({ election: null, candidates: { governor: ['s3', 's1'], sheriff: [] }, promises: { s3: CAP_8, s1: CAP_4 } }), me({ running: 'governor' }), { month: 2 });
    const html = onPhone(game, () => createElement(CouncilBody, { focus: null }));
    expect(textOf(html, 'run-any-month')).toBe('Any month, no clock. Next election: month 4. Whoever runs when it opens is on the ballot.');
    expect(textOf(html, 'so-far-governor-s3')).toBe("Kaiup to 8% (it's 5% now)");
    expect(textOf(html, 'so-far-governor-s1')).toBe("Youup to 4% (it's 5% now)");
    expect(textOf(html, 'so-far-sheriff')).toBe('nobody yet');
    expect(textOf(html, 'running')).toBe("You run for Governor, promising up to 4% (it's 5% now).Withdraw");
    expect(textOf(html, 'change-promise')).toBe('Change promise');
    expect(tagOf(html, 'run-governor')).toBeUndefined();
    expect(textOf(html, 'job-governor')).toBe('Sets the sales tax each month; the tax fills the colony fund. Paid 50 cr a month.');
    expect(textOf(html, 'job-term')).toBe(`A term lasts until the next election and adds ${POLITICS.termScore} to your final score.`);
  });

  it("C66, E-1: the agenda's door opens the desk on its focus: the promise sheet when you don't run, your candidacy when you do", () => {
    const game = view(politics({ election: null, candidates: { governor: ['s3'] }, promises: { s3: CAP_8 } }), me(), { month: 2 });
    expect(tagOf(onPhone(game, () => createElement(CouncilBody, { focus: 'run' })), 'promise-sheet')).toBeDefined();
    expect(tagOf(onPhone(game, () => createElement(CouncilBody, { focus: null })), 'promise-sheet')).toBeUndefined();
    const running = view(politics({ election: null, candidates: { governor: ['s1'] }, promises: { s1: CAP_4 } }), me({ running: 'governor' }), { month: 2 });
    const html = onPhone(running, () => createElement(CouncilBody, { focus: 'run' }));
    expect(tagOf(html, 'promise-sheet')).toBeUndefined();
    expect(tagOf(html, 'running')).toBeDefined();
  });

  it.each<[ElectionHow, ElectionResult[Office], string]>([
    ['votes', { winner: 's1', how: 'votes', tallies: [{ id: 's1', votes: 3 }, { id: 's2', votes: 1 }] }, 'Won on votes, 3 to 1.'],
    ['unopposed', { winner: 's2', how: 'unopposed', tallies: [{ id: 's2', votes: 0 }] }, 'Elected unopposed: nobody ran against them.'],
    ['appointed', { winner: 's2', how: 'appointed', tallies: [] }, 'Nobody ran, so the richest player is appointed.'],
    ['baron', { winner: 's2', how: 'baron', tallies: [{ id: 's1', votes: 2 }, { id: 's2', votes: 2 }] }, "A tie, 2 votes each, broken by the Land Baron's vote."],
    ['land', { winner: 's2', how: 'land', tallies: [{ id: 's1', votes: 3 }, { id: 's2', votes: 3 }] }, 'A tie, 3 votes each. Nobody is Land Baron to break it, so the most plots wins: Ossa has 7, you 5.'],
    ['lot', { winner: 's1', how: 'lot', tallies: [{ id: 's1', votes: 3 }, { id: 's2', votes: 3 }] }, 'A tie, 3 votes each, and the same plots, so it was decided by lot: you win.'],
  ])('E-6, RULE-3: once the election is over the Council desk keeps the whole result, and says how the office was won (%s)', (_, race, line) => {
    const players = PLAYERS.map((p) => (p.id === 's1' ? { ...p, plots: 5 } : p.id === 's2' ? { ...p, plots: 7 } : p));
    const game = view(politics({ governor: race!.winner, term: [4, 6], next: 7, election: election({ stage: 'over', result: { governor: race! } }) }), me(), { month: 4, players });
    const html = onPhone(game, () => createElement(CouncilBody, { focus: null }));
    expect(textOf(html, 'council-result')).toMatch(/^Election results · month 4/);
    expect(textOf(html, 'result-how-governor')).toBe(line);
    for (const t of race!.tallies) expect(textOf(html, `result-governor-${t.id}`)).toBe(`${t.id === 's1' ? 'You' : 'Ossa'}${t.votes} vote${t.votes === 1 ? '' : 's'}${t.id === race!.winner ? 'ELECTED' : ''}`);
  });
});

describe('the promise sheet (E-4, RULE-10)', () => {
  /** The sheet as Lena's phone draws it at this tax, running so far: Kai up to 8%. */
  function sheet(percent: number, start: TaxPromise | null = null): string {
    const game = view(politics({ election: null, tax: { percent, start: percent, low: 0, high: 15 }, candidates: { governor: ['s3'] }, promises: { s3: CAP_8 } }), me(), { month: 2 });
    return onPhone(game, () => createElement(PromiseSheet, { start, onRun: () => {}, onCancel: () => {} }));
  }

  it("C66, E-4: the sheet opens on a cap at today's tax, so Run names it; the field so far stands beside it", () => {
    const html = sheet(5);
    expect(tagOf(html, 'promise-sheet')).toMatch(/role="dialog"/);
    expect(textOf(html, 'promise-sheet')).toContain('The sales tax is 5% now.');
    expect(textOf(html, 'promise-field')).toBe("Running so far:Kai up to 8% (it's 5% now)");
    expect(textOf(html, 'promise-run')).toBe('Run · up to 5%');
    expect(textOf(html, 'promise-lower')).toBe('Lower it');
    expect(textOf(html, 'promise-hold')).toBe('Keep it at 5%');
    expect(disabled(html, 'promise-cancel')).toBe(false);
  });

  it('C66, E-1: changing a promise opens the sheet on the promise you hold', () => {
    expect(textOf(sheet(5, { kind: 'cap', percent: 9 }), 'promise-run')).toBe('Run · up to 9%');
    expect(textOf(sheet(5, HOLD), 'promise-run')).toBe('Run · keep it at 5%');
  });

  it.each<[number, { minus: boolean; plus: boolean; lower: boolean }]>([
    [5, { minus: false, plus: false, lower: false }],
    [POLITICS.tax.min, { minus: true, plus: false, lower: true }],
    [POLITICS.tax.max, { minus: false, plus: true, lower: false }],
  ])("RULE-10: the cap starts at today's tax (%s%%) and stops at the tax's bounds; Lower is refused at the lowest tax", (percent, stopped) => {
    const html = sheet(percent);
    expect(textOf(html, 'promise-cap-value')).toBe(`${percent}%`);
    expect(disabled(html, 'promise-cap-minus'), 'promise-cap-minus disabled').toBe(stopped.minus);
    expect(disabled(html, 'promise-cap-plus'), 'promise-cap-plus disabled').toBe(stopped.plus);
    const lower = html.slice(html.indexOf('data-testid="promise-lower"'));
    expect(/\sdisabled=""/.test(lower.match(/<input[^>]*>/)![0]), 'the Lower radio disabled').toBe(stopped.lower);
  });
});

describe('election day on the phone (C66, E-2)', () => {
  /** Month `month`'s announce: Lena and Ossa run, Lena up to 8% and Ossa holding, on Politics' candidacy. */
  const announce = (month: number, canRun: CanRun, extra: Partial<ElectionView> = {}) =>
    view(politics({ next: 7, pay: { governor: 50 }, candidates: { governor: ['s1', 's2'] }, promises: { s1: CAP_8, s2: HOLD }, election: election({ waitingFor: SEATS, ...extra }) }), me({ running: 'governor', canRun: { governor: canRun } }), { month });

  it("T-AC-66: month 1's announce takes a run: the rail under Now holds the run block, its button live", () => {
    const html = inHub(announce(1, true));
    const guide = html.slice(html.indexOf('data-testid="guide"'));
    expect(guide).toContain('data-testid="run-office"');
    expect(guide.indexOf('data-testid="now"')).toBeLessThan(guide.indexOf('data-testid="run-office"'));
    expect(disabled(html, 'change-promise')).toBe(false);
    expect(textOf(html, 'running')).toBe("You run for Governor, promising up to 8% (it's 5% now).Withdraw");
  });

  it('T-AC-67: from month 4 announce shows no Run: no run block, no run or promise button anywhere on the phone', () => {
    const html = inHub(announce(4, 'closed'));
    expect(tagOf(html, 'announce')).toBeDefined();
    for (const gone of ['run-office', 'run-governor', 'change-promise', 'promise-run', 'withdraw', 'agenda-run']) expect(html, gone).not.toContain(`data-testid="${gone}"`);
  });

  it('C66, E-2, E-4: the announcement takes the stage: election day, step 1, who runs on which promise, what the Governor does, then vote on your phone', () => {
    const html = inHub(announce(4, 'closed'));
    expect(html).toMatch(/>Election day</);
    expect(textOf(html, 'day-title')).toBe('Election day: Governor');
    expect(tagOf(html, 'election-step-1')).toMatch(/aria-current="step"/);
    expect(textOf(html, 'announce')).toContain('The colony elects its Governor for months 4 to 6. The candidates:');
    expect(textOf(html, 'announce-field-governor-s1')).toBe("Youup to 8% (it's 5% now)");
    expect(textOf(html, 'announce-field-governor-s2')).toBe('Ossakeep it at 5%');
    expect(tagOf(html, 'offices-card')).toBeDefined();
    expect(textOf(html, 'vote-on-phone')).toBe('Then vote, here or on your phone on your phone: in secret, with no clock.');
    expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*data-testid="ready"[^>]*>Ready to vote</);
  });

  it('C66, E-2: nobody running yet reads "nobody yet", not an empty list', () => {
    const html = inHub(view(politics({ next: 7, election: election() }), me({ canRun: { governor: 'closed' } }), { month: 4 }));
    expect(textOf(html, 'announce-field-governor')).toBe('Governornobody yet');
  });

  /** Month 4's ballot: Lena and Ossa on it, Kai has cast; Lena's ballot as given. */
  const ballot = (mine: Partial<Record<Office, string>> = {}, extra: Partial<PoliticsView> = {}) =>
    view(
      politics({ next: 7, pay: { governor: 50 }, election: election({ stage: 'ballot', candidates: { governor: ['s1', 's2'] }, promises: { s1: CAP_8, s2: HOLD }, done: ['s3'], waitingFor: ['s1', 's2', 's4', 's5'] }), ...extra }),
      me({ ballot: mine, paid: 120, canRun: { governor: 'closed' } }),
      { month: 4, players: PLAYERS.map((p) => (p.id === 's3' ? { ...p, ready: true } : p.id === 's1' ? { ...p, plots: 7 } : p)) },
    );

  it('C66, E-2, E-4: the ballot takes the stage: step 2, each candidate on a promise, Abstain, who has voted and never for whom', () => {
    const html = inHub(ballot());
    expect(tagOf(html, 'election-step-2')).toMatch(/aria-current="step"/);
    expect(textOf(html, 'ballot-governor-s1')).toBe("Youup to 8% (it's 5% now)");
    expect(textOf(html, 'ballot-governor-s2')).toBe('Ossakeep it at 5%');
    expect(textOf(html, 'ballot-governor-abstain')).toBe('Abstain');
    expect(textOf(html, 'voted')).toBe('Voted:Kai· 1 of 5. Never shown: for whom.');
    expect(html).toMatch(/data-testid="ready-count"[^>]*>1 \/ 5 VOTED</);
  });

  it("C66, AM-21: Cast my vote is the ballot's Ready, live only once every contested office is picked; a pick shows checked", () => {
    expect(inHub(ballot())).toMatch(/<button[^>]*disabled=""[^>]*data-testid="ready"[^>]*>Cast my vote</);
    const picked = inHub(ballot({ governor: 's2' }));
    expect(picked).toMatch(/<button(?![^>]*disabled="")[^>]*data-testid="ready"[^>]*>Cast my vote</);
    expect(picked.slice(picked.indexOf('data-testid="ballot-governor-s2"')).match(/<input[^>]*>/)![0]).toMatch(/checked/);
  });

  describe("this phone's picks, shown before the server's view comes back", () => {
    afterEach(() => forgetPicks());

    /** The input of this ballot option, as the hub draws it. */
    const radio = (html: string, option: string) => html.slice(html.indexOf(`data-testid="ballot-governor-${option}"`)).match(/<input[^>]*>/)![0];
    const cast = /<button(?![^>]*disabled="")[^>]*data-testid="ready"[^>]*>Cast my vote</;
    const LENA_4 = { room: 'MULE', seat: 's1', month: 4 };

    it('C66, AM-21: Abstain shows checked at once, and counts as a pick for Cast my vote', () => {
      pickOn(LENA_4, 'governor', '');
      const html = inHub(ballot());
      expect(radio(html, 'abstain')).toMatch(/checked/);
      expect(html).toMatch(cast);
    });

    it.each<[string, { room: string; seat: string; month: number }]>([
      ["the next election's", { ...LENA_4, month: 7 }],
      ["another room's", { ...LENA_4, room: 'ZORP' }],
    ])("C66, AM-21: %s ballot opens with nothing chosen and Cast my vote off", (_, other) => {
      pickOn(LENA_4, 'governor', '');
      const html = inHub({ ...ballot(), month: other.month }, 1, other.room);
      for (const option of ['s1', 's2', 'abstain']) expect(radio(html, option), option).not.toMatch(/checked/);
      expect(html).not.toMatch(cast);
    });

    it("C66, AM-21: another seat's abstention on this phone is not Lena's", () => {
      pickOn({ ...LENA_4, seat: 's2' }, 'governor', '');
      const html = inHub(ballot());
      expect(radio(html, 'abstain')).not.toMatch(/checked/);
      expect(html).not.toMatch(cast);
    });

    it("C66, AM-21: the server's ballot wins over this phone's pick for that office", () => {
      pickOn(LENA_4, 'governor', 's1');
      const html = inHub(ballot({ governor: 's2' }));
      expect(radio(html, 's2')).toMatch(/checked/);
      expect(radio(html, 's1')).not.toMatch(/checked/);
    });
  });

  it('C66, E-5: your votes in words: how many, why, and your own numbers', () => {
    const weights = politics().weights.map((w) => (w.id === 's1' ? { ...w, votes: 1 } : w));
    const html = inHub(ballot({}, { weights }));
    expect(textOf(html, 'votes-sentence')).toBe(
      `You have 1 vote. Everyone gets 1; +1 for every ${POLITICS.weight.plotsPerVote} plots; +1 with a good name (${POLITICS.weight.repHigh}+); +1 for every ${POLITICS.weight.taxPerVote} cr of tax you’ve paid, up to ${POLITICS.weight.taxCap}; +1 for the Land Baron.`,
    );
    expect(textOf(html, 'votes-mine')).toBe('You: 7 plots, a name of 50, 120 cr of tax paid, so none of the extras yet.');
  });

  it('C66, E-2, E-10: the ready bar speaks each stage: announce, the ballot, and planning\'s own once it is over', () => {
    const seat = (game: MuleView) => ({ view: game, me: game.me!, self: game.players[0]! });
    const a = electionReadyWords(seat(announce(4, 'closed')))!;
    expect([a.ready, a.done, a.waiting, a.all, a.confirm('Kai', 1)]).toEqual(['Ready to vote', "You're ready to vote", 'Still waiting for', 'Everyone is ready. The ballot opens.', 'Open the ballot for everyone now? Kai can still vote until it closes.']);
    const b = electionReadyWords(seat(ballot()))!;
    expect([b.ready, b.done, b.all, b.label, b.canReady, b.confirm('Kai', 1), b.confirm('Kai and Pip', 2)]).toEqual([
      'Cast my vote',
      'You voted',
      'Everyone has voted. The reveal starts.',
      'VOTED',
      false,
      'Close the ballot for everyone now? Kai’s vote won’t count, and the reveal starts.',
      'Close the ballot for everyone now? The votes of Kai and Pip won’t count, and the reveal starts.',
    ]);
    expect(electionReadyWords(seat(view(politics({ election: election({ stage: 'over' }) })))), 'over: planning\'s own').toBeNull();
  });

  it('C66, E-2: Now says each step of election day, and once you are done, whom it still waits for', () => {
    const now = (game: MuleView, ready = false) => electionNow({ view: game, me: game.me!, self: { ...game.players[0]!, ready } });
    expect(now(announce(4, 'closed'))).toEqual({ step: 1, of: 3, title: 'Election day: Governor', detail: 'Read who runs and on what promise, then tap Ready to vote. No clock: the ballot opens once everyone is ready.' });
    expect(now(announce(4, 'closed', { waitingFor: ['s2'] }), true)?.title).toBe("You're ready. Still waiting for Ossa");
    expect(now(ballot())).toMatchObject({ step: 2, title: 'Vote in secret' });
    expect(now(ballot(), true)?.title).toBe('You voted. Still waiting for Ossa, Brix and Pip');
  });
});

describe('the reveal (C66, RULE-62, B-AC-62)', () => {
  it("C66: the TV's ceremony starts on the office's title alone, then its candidates in seat order, with no totals yet", () => {
    const title = onTv(inCeremony(WON, beatAt(WON, 'title', 1)));
    expect(textOf(title, 'reveal-title')).toBe('The colony’s newGovernorsets the sales tax each month · 2 candidates');
    expect(tagOf(title, 'reveal-row-governor-s1')).toBeUndefined();
    const cands = onTv(inCeremony(WON, beatAt(WON, 'candidates', 1.1)));
    expect(textOf(cands, 'reveal-office')).toBe('Governor');
    expect(cands.indexOf('reveal-row-governor-s1')).toBeLessThan(cands.indexOf('reveal-row-governor-s2'));
    expect(textOf(cands, 'reveal-row-governor-s1')).toBe("Lenaup to 8% (it's 5% now)");
    expect(textOf(cands, 'reveal-count-governor-s1')).toBe('');
  });

  it('B-AC-62 (TV): from the bars beat the blocks grow one at a time, interleaved; no winner until its beat', () => {
    const block = POLITICS.ceremony.blockMs / 1000;
    const html = onTv(inCeremony(WON, beatAt(WON, 'bars', block + 0.01)));
    expect(textOf(html, 'reveal-count-governor-s1')).toBe('1');
    expect(textOf(html, 'reveal-count-governor-s2')).toBe('1');
    expect(html).not.toContain('ELECTED');
    expect(tagOf(html, 'reveal-congrats')).toBeUndefined();
    const all = onTv(inCeremony(WON, beatAt(WON, 'winner', -0.01)));
    expect(textOf(all, 'reveal-count-governor-s1')).toBe('3');
    expect(tagOf(all, 'reveal-congrats')).toBeUndefined();
  });

  it('B-AC-62 (TV): at the winner beat, the congratulations and how the office was won', () => {
    const html = onTv(inCeremony(WON, beatAt(WON, 'winner', 1)));
    expect(textOf(html, 'reveal-congrats')).toBe('Congratulations, Governor Lena!Won on votes, 3 to 1.');
    expect(textOf(html, 'reveal-row-governor-s1')).toContain('ELECTED');
    expect(textOf(html, 'reveal-row-governor-s2')).not.toContain('ELECTED');
  });

  it('C66, E-6: a tie is stamped at its beat and said by the rule that broke it, before the winner is congratulated', () => {
    const players = PLAYERS.map((p) => (p.id === 's1' ? { ...p, plots: 5 } : p.id === 's2' ? { ...p, plots: 7 } : p));
    const game = { ...inCeremony(TIED, beatAt(TIED, 'tie', 1.5)), players };
    const html = onTv(game);
    expect(textOf(html, 'reveal-tie')).toBe('A tie!A tie, 2 votes each. Nobody is Land Baron to break it, so the most plots wins: Ossa has 7, Lena 5.');
    expect(tagOf(html, 'reveal-congrats')).toBeUndefined();
  });

  it('C66, E-6, E-8: after the last office the whole result stays, the Land Baron named', () => {
    const html = onTv(inCeremony(WON, beatAt(WON, 'end', 0.2)));
    expect(textOf(html, 'summary-governor-s1')).toBe('Lena3');
    expect(textOf(html, 'summary-baron')).toBe('Land Baron: nobody yet. Whoever owns the most plots gets +1 vote and breaks ties.');
    expect(textOf(html, 'reveal-progress')).toBe('Governor: Lena ✓');
  });

  it('B-AC-62 (phone beside a TV): it says look up and holds each result until the TV has named the winner, then celebrates your own win', () => {
    const bars = onPhone(inCeremony(WON, beatAt(WON, 'bars', 2)), ElectionDay, 1);
    expect(tagOf(bars, 'phone-reveal-tv')).toBeDefined();
    expect(textOf(bars, 'look-up')).toBe('Look up: the result is on the TV');
    expect(textOf(bars, 'companion-governor')).toBe('Governoron the TV now…');
    expect(textOf(bars, 'companion-wait')).toContain('The votes are being counted on the TV');
    const won = onPhone(inCeremony(WON, beatAt(WON, 'winner', 0.5)), ElectionDay, 1);
    expect(textOf(won, 'companion-governor-s1')).toBe('You3ELECTED');
    expect(textOf(won, 'companion-governor')).toContain('Won on votes, 3 to 1.');
    expect(textOf(won, 'companion-mine')).toBe('Congratulations, Governor Lena!You set the sales tax next. You promised no higher than 8%.');
  });

  it("B-AC-62 (phone, no TV): the phone carries the TV's ceremony itself, beat for beat", () => {
    const at = beatAt(WON, 'bars', POLITICS.ceremony.blockMs / 1000 + 0.01);
    const solo = onPhone(inCeremony(WON, at), ElectionDay, 0);
    expect(tagOf(solo, 'phone-reveal-solo')).toBeDefined();
    expect(tagOf(solo, 'phone-reveal-tv')).toBeUndefined();
    const tv = onTv(inCeremony(WON, at));
    for (const id of ['s1', 's2']) expect(textOf(solo, `reveal-count-governor-${id}`)).toBe(textOf(tv, `reveal-count-governor-${id}`));
    expect(textOf(solo, 'reveal-row-governor-s1')).toMatch(/^You/);
  });
});

describe('the TV on election day (C66, E-2, E-5)', () => {
  it('C66, E-4, E-10: the announcement names who runs on which promise, and whom it still waits for, the away ones marked', () => {
    const game = view(politics({ next: 7, candidates: { governor: ['s1', 's2'] }, promises: { s1: CAP_8, s2: HOLD }, election: election({ done: ['s1', 's2', 's4', 's5'], waitingFor: ['s3'] }) }), me(), {
      month: 4,
      players: PLAYERS.map((p) => ({ ...p, ready: p.id !== 's3' })),
    });
    const html = onTv(game, ['s3']);
    expect(textOf(html, 'tv-day-title')).toBe('Governor');
    expect(textOf(html, 'tv-field-governor-s1')).toBe("Lenaup to 8% (it's 5% now)");
    expect(textOf(html, 'tv-vote-on-phone')).toContain('Still waiting forKaiAWAY· Lena, the host, can continue without Kai.');
  });

  it('C66, E-5: the ballot shows who has voted, never for whom, and everyone\'s votes in words', () => {
    const weights = politics().weights.map((w) => (w.id === 's2' ? { id: 's2', votes: 4, parts: { base: 1, land: 1, reputation: 0, baron: 1, taxes: 1 } } : w));
    const game = view(politics({ weights, election: election({ stage: 'ballot', candidates: { governor: ['s1', 's2'] }, promises: { s1: CAP_8, s2: HOLD }, done: ['s2', 's3'], waitingFor: ['s1', 's4', 's5'] }) }), me(), {
      month: 4,
      players: PLAYERS.map((p) => ({ ...p, ready: p.id === 's2' || p.id === 's3' })),
    });
    const html = onTv(game);
    expect(textOf(html, 'tv-voted-count')).toBe('Voted 2 of 5');
    expect(textOf(html, 'tv-weight-s2')).toBe('Ossa1+1·+1+14');
    expect(textOf(html, 'tv-ballot-governor')).toContain("Ossakeep it at 5%");
  });

  it('T-AC-62: by default the TV names one office: no Sheriff anywhere', () => {
    expect(POLITICS.offices).toEqual(['governor']);
    const tv = onTv(inCeremony(WON, beatAt(WON, 'winner', 1)));
    expect(tv).not.toContain('Sheriff');
  });
});

describe("the new Governor's promise (C68, E-7)", () => {
  /** Month `month`, Lena Governor since month 4 on `promise`, the tax at `percent` from this month's `start`. */
  const term = (promise: TaxPromise | null, percent: number, start: number, month = 4) =>
    view(politics({ governor: 's1', term: [4, 6], next: 7, promise, tax: { percent, start, low: 0, high: 10 }, election: month === 4 ? election({ stage: 'over' }) : null }), me(), { month });

  it.each<[string, TaxPromise, number, number, number, string]>([
    ['a cap kept', CAP_4, 4, 5, 4, 'Governor: Lena, until month 6 · promised up to 4% · tax 4%, kept · Next election: month 7'],
    ['a cap not yet set', CAP_4, 5, 5, 4, 'Governor: Lena, until month 6 · promised up to 4% · tax still 5% · Next election: month 7'],
    ['a cap broken', CAP_4, 6, 5, 4, 'Governor: Lena, until month 6 · promised up to 4% · tax 6%, promise broken · Next election: month 7'],
    ['a cap broken a month on', CAP_4, 5, 5, 5, 'Governor: Lena, until month 6 · promised up to 4% · tax 5%, promise broken · Next election: month 7'],
    ['lower, kept', LOWER, 4, 5, 4, 'Governor: Lena, until month 6 · promised lower it · tax 4%, kept · Next election: month 7'],
    ['hold, kept', HOLD, 5, 5, 5, 'Governor: Lena, until month 6 · promised keep it at 5% · tax 5%, kept · Next election: month 7'],
  ])("T-AC-70: every phone's offices line keeps the Governor's promise beside the tax, kept or broken (%s)", (_, promise, percent, start, month, line) => {
    expect(textOf(onPhone(term(promise, percent, start, month), OfficesLine), 'roadmap-offices')).toBe(line);
  });

  it("T-AC-70: an appointed Governor made no promise: the line has no promise part", () => {
    expect(textOf(onPhone(term(null, 5, 5), OfficesLine), 'roadmap-offices')).toBe('Governor: Lena, until month 6 · Next election: month 7');
  });

  it("T-AC-70, E-7: the Governor's desk keeps the promise above the tax; past it, it says so", () => {
    const over = onPhone(term(CAP_4, 5, 5), GovernorDesk);
    expect(textOf(over, 'gov-promise')).toBe('Sales taxYou promised: no higher than 4%');
    expect(textOf(over, 'gov-breaks')).toBe('5%: this breaks your promise.');
    expect(tagOf(over, 'tax-value')).toMatch(/text-alert/);
    expect(textOf(over, 'tax-confirm')).toBe('Set 5%');
    const within = onPhone(term(CAP_4, 3, 3), GovernorDesk);
    expect(textOf(within, 'gov-within')).toBe('Within your promise. Set it to make it count.');
    const set = onPhone(term(CAP_4, 4, 5), GovernorDesk);
    expect(textOf(set, 'gov-done')).toBe('Done: 4% from now on.');
    expect(disabled(set, 'tax-confirm')).toBe(true);
  });

  it.each<[{ percent: number; start: number; low: number; high: number }, { down: boolean; up: boolean }]>([
    [{ percent: 5, start: 5, low: 0, high: 10 }, { down: false, up: false }],
    [{ percent: 10, start: 5, low: 0, high: 10 }, { down: false, up: true }],
    [{ percent: 10, start: 15, low: 10, high: 15 }, { down: true, up: false }],
    [{ percent: 0, start: 3, low: 0, high: 8 }, { down: true, up: false }],
  ])("RULE-6: the Governor's tax steps stop at the bounds the view gives (%j)", (tax, stopped) => {
    const html = onPhone(view(politics({ governor: 's1', election: null, fund: 840, tax })), GovernorDesk);
    expect(textOf(html, 'tax-value')).toBe(`${tax.percent}%`);
    expect(disabled(html, 'tax-down'), 'tax-down disabled').toBe(stopped.down);
    expect(disabled(html, 'tax-up'), 'tax-up disabled').toBe(stopped.up);
    expect(textOf(html, 'gov-tax')).toContain(`This month ${tax.low}–${tax.high}%, from last month’s ${tax.start}%. The tax fills the colony fund (840 cr), which pays you 50 cr a month.`);
  });

  it("C66, E-7: the new Governor's Now says to set the tax, until when, and the promise", () => {
    const game = term(CAP_4, 5, 5);
    expect(electionNow({ view: game, me: game.me!, self: game.players[0]! })).toEqual({ title: 'Set the sales tax', detail: 'Then plan your month. You are the new Governor, until month 6. You promised no higher than 4%.' });
  });
});

describe('the hub door (E-1)', () => {
  it('C66, E-1: "Throw your hat in the ring" leads This month in any month before an election, and names your candidacy once you run', () => {
    /** "This month" as the hub draws it for Lena from HUB_SLOTS. */
    const agenda = (game: MuleView) => {
      const seat = { view: game, me: game.me!, self: game.players[0]! };
      return onPhone(game, () => createElement(AgendaRow, { items: drawnSlots(HUB_SLOTS, seat).agenda, seat, note: '', onOpen: () => {} }));
    };
    const game = view(politics({ election: null }), me(), { month: 2 });
    expect(textOf(agenda(game), 'agenda-run')).toBe('Throw your hat in the ringRun for Governor · election in month 4');
    expect(agenda(game).match(/data-testid="agenda-([^"]+)"/)?.[1], 'first, and drawn strong').toBe('run');
    expect(tagOf(agenda(game), 'agenda-run')).toMatch(/border-2 border-holo/);
    expect(HUB_SLOTS.agenda.find((a) => a.key === 'run')?.opens).toEqual({ desk: 'council', focus: 'run' });
    const running = view(politics({ election: null, candidates: { governor: ['s1'] }, promises: { s1: CAP_4 } }), me({ running: 'governor' }), { month: 2 });
    expect(textOf(agenda(running), 'agenda-run')).toBe('Throw your hat in the ringYou run for Governor · up to 4%');
    const last = view(politics({ election: null, next: null }), me(), { month: 11 });
    expect(agenda(last), 'no election ahead').not.toContain('agenda-run');
  });
});

describe('the Colony desk (C11, H-5, A-3)', () => {
  bothOffices();

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
