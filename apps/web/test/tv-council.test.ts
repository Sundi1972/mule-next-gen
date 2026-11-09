import { POLITICS, type LawImpact } from '@mule/engine';
import type { CouncilView, MuleView, PlayerView, PoliticsView, TableView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TableApp } from '../src/table/TableApp';
import { aMuleView, aPlayer } from './fixtures/views';

/*
 * C46: the TV's council panel (the approved ws8-desks mock, c4f4cc42, reveal A): the ballot, then the reveal with
 * totals only, the laws in force along its foot. Rendered through the real TableApp, as the TV draws it.
 */

const PLAYERS: PlayerView[] = [aPlayer({ id: 's1', name: 'Lena', slot: 0 }), aPlayer({ id: 's2', name: 'Ossa', slot: 1 }), aPlayer({ id: 's3', name: 'Kai', slot: 2 })];
const IMPACT: Record<string, LawImpact> = { s1: { cost: 30 }, s2: { cost: 50 }, s3: { cost: 0 } };
const MONTH = 4;

const council = (extra: Partial<CouncilView> = {}): CouncilView => ({
  stage: 'ballot',
  proposal: { kind: 'enact', law: 'landTax', setting: 10 },
  proposer: 's1',
  impact: IMPACT,
  voted: ['s1', 's3'],
  done: ['s3'],
  waitingFor: ['s1', 's2'],
  clockMs: 0,
  revealMs: POLITICS.council.revealMs,
  result: null,
  ...extra,
});

const politics = (extra: Partial<PoliticsView> = {}): PoliticsView => ({
  governor: 's1',
  sheriff: null,
  term: [1, 3],
  next: 7,
  baron: null,
  tax: { percent: 5, start: 5, low: 0, high: 10 },
  fund: 0,
  pay: { governor: 50 },
  weights: PLAYERS.map(({ id }) => ({ id, votes: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } })),
  candidates: { governor: [] },
  promises: {},
  promise: null,
  promiseFrom: 5,
  election: { stage: 'over', ceremony: null, candidates: {}, promises: {}, voted: [], done: [], waitingFor: [], result: {} },
  proposal: null,
  council: null,
  laws: { exportTax: { setting: 20, since: 2 } },
  retry: {},
  ...extra,
});

const game = (pol: PoliticsView | null): MuleView => aMuleView({ month: MONTH, players: PLAYERS, me: null, politics: pol });

let state: { status: 'open'; role: 'board'; code: string; seatId: null; view: TableView<MuleView>; notice: null; chat: []; emotes: []; toasts: []; clockOffset: number };

// The TV reads the room through useClientState, whose store has no server snapshot to render from.
vi.mock('../src/net/react', async (actual) => ({ ...(await actual<typeof import('../src/net/react')>()), useClientState: () => state }));

function onTv(g: MuleView): string {
  const table: TableView<MuleView> = { code: 'MULE', status: 'playing', hostId: 's1', seats: PLAYERS.map((p) => ({ id: p.id, name: p.name, isAi: false, connected: true, color: p.slot })), boards: 1, game: g };
  state = { status: 'open', role: 'board', code: 'MULE', seatId: null, view: table, notice: null, chat: [], emotes: [], toasts: [], clockOffset: 0 };
  const client = { subscribe: () => () => {}, getState: () => state, serverNow: () => 0, watch: () => {} } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TableApp, { room: 'MULE' }) })).replaceAll('<!-- -->', '');
}

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
  return html.slice(from, end).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

/** The reveal once its beat is over: the bar full and the stamp on. */
const revealed = (result: NonNullable<CouncilView['result']>) => game(politics({ council: council({ stage: 'reveal', voted: ['s1', 's2', 's3'], done: ['s1', 's2', 's3'], waitingFor: [], clockMs: POLITICS.council.revealMs, result }) }));

describe('B-AC-46-10: the TV council panel', () => {
  it("B-AC-46-10: the ballot shows the proposal, each player's cost and who has voted, the laws in force at its foot", () => {
    const html = onTv(game(politics({ council: council() })));
    expect(tagOf(html, 'tv-council-ballot')).toBeDefined();
    expect(textOf(html, 'tv-proposal-words')).toBe('Land tax 10 cr a plot');
    expect(textOf(html, 'tv-impact-s1')).toBe('Lena30 cr a month');
    expect(textOf(html, 'tv-impact-s2')).toBe('Ossa50 cr a month');
    expect(textOf(html, 'tv-impact-s3')).toBe('Kainothing');
    expect(textOf(html, 'tv-council-voted-count')).toBe('Voted 2 of 3');
    expect(textOf(html, 'tv-council-voted')).toContain('LenaVOTED ✓OssaVOTINGKaiVOTED ✓');
    expect(textOf(html, 'tv-laws')).toBe('Laws in forceExport tax 20% · since month 2');
    // RULE-42: the tally reads each vote's weight when the ballot closes, not as it stood at the election.
    expect(html).toContain('Each vote weighs by what its voter holds when the ballot closes: land, good name, taxes paid, the Land Baron.');
    expect(html).not.toContain('as it did at the election');
  });

  it('B-AC-46-10: the reveal shows the weighted totals, the stamp and the result line, and never a player beside a vote', () => {
    const html = onTv(revealed({ passed: true, yes: 7, no: 3, tie: false }));
    expect(tagOf(html, 'tv-council-reveal')).toBeDefined();
    expect(textOf(html, 'tv-yes')).toBe('7');
    expect(textOf(html, 'tv-no')).toBe('3');
    expect(textOf(html, 'tv-stamp')).toBe('Passed');
    expect(tagOf(html, 'tv-bar-yes')).toContain('width:70%');
    expect(textOf(html, 'tv-result-line')).toBe('Passed 7 to 3 · Land tax 10 cr a plot is in force from now');
    const panel = textOf(html, 'tv-reveal-a');
    for (const p of PLAYERS) expect(panel, `RULE-47: no ${p.name} in the reveal`).not.toContain(p.name);
    expect(textOf(html, 'tv-laws')).toContain('Export tax 20% · since month 2');
  });

  it('B-AC-46-10: a failed law says when it can come back', () => {
    const html = onTv(revealed({ passed: false, yes: 3, no: 7, tie: false }));
    expect(textOf(html, 'tv-stamp')).toBe('Failed');
    expect(textOf(html, 'tv-result-line')).toBe(`Failed 7 to 3 · it can come back in month ${MONTH + POLITICS.council.retryMonths + 1}`);
  });

  it("B-AC-46-10: a tie says the Governor's vote decides", () => {
    const html = onTv(revealed({ passed: true, yes: 3, no: 3, tie: true }));
    expect(textOf(html, 'tv-result-line')).toBe('Passed 3 to 3 · the Governor’s vote decides · Land tax 10 cr a plot is in force from now');
  });
});

describe('B-AC-46-10: the reveal starts where the room is', () => {
  it('B-AC-46-10: at clockMs 0 the bar is empty and the stamp not yet on', () => {
    const html = onTv(game(politics({ council: council({ stage: 'reveal', voted: ['s1', 's2', 's3'], done: ['s1', 's2', 's3'], waitingFor: [], clockMs: 0, result: { passed: true, yes: 7, no: 3, tie: false } }) })));
    expect(textOf(html, 'tv-yes')).toBe('0');
    expect(tagOf(html, 'tv-stamp')).toContain('opacity-0');
  });
});

describe('B-AC-46-12 (negative): with politics off, or no council, the TV is today’s', () => {
  it.each<[string, PoliticsView | null]>([
    ['politics off', null],
    ['no council', politics()],
    ['the council over', politics({ council: council({ stage: 'over', result: { passed: true, yes: 2, no: 1, tie: false }, waitingFor: [] }) })],
  ])('B-AC-46-12: %s: the planning screen, no council panel', (_, pol) => {
    const html = onTv(game(pol));
    expect(tagOf(html, 'tv-council-ballot')).toBeUndefined();
    expect(tagOf(html, 'tv-council-reveal')).toBeUndefined();
    expect(tagOf(html, 'holo-map'), "planning's map").toBeDefined();
  });
});
