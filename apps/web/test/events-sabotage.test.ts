import type { IncidentView, MuleView, MyView, PoliticsView } from '@mule/protocol';
import type { ShowEventView } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { ColonyPanel } from '../src/components/MonthEnd';
import { TvMonthEnd } from '../src/table/TableApp';
import { sabotageNews, sabotageNewsLine, sabotageSeat, withSabotageDetail } from '../src/events/sabotage';
import { aMuleView, aPlayer } from './fixtures/views';

/**
 * S4-C17 (S4-PR-7, WS8): sabotage's words off the show, the approved mock's (design/mocks/politics-p2 @ d6977e1a,
 * src/show/P10Page.tsx MONTH_END; Heiko, 8 Nov), from the views the server sends: the month end's news line, everyone's,
 * and what a phone knows for its own private line after the show.
 */

const PLAYERS = [aPlayer({ id: 'lena', name: 'Lena', slot: 0 }), aPlayer({ id: 'ossa', name: 'Ossa', slot: 1 }), aPlayer({ id: 'brix', name: 'Brix', slot: 2 })];
const MONTH = 4;

const incident = (over: Partial<IncidentView>): IncidentView => ({
  id: 'sab-x',
  month: MONTH,
  kind: 'powerCut',
  victim: 'ossa',
  at: { x: 12, y: 4 },
  good: 'smithore',
  worked: true,
  culprit: null,
  how: null,
  investigated: false,
  fine: null,
  ...over,
});
const rumour = (over: Partial<IncidentView>): IncidentView => incident({ kind: 'rumour', victim: null, at: null, good: 'food', dir: 'up', ...over });

/** Only the fields these words read: the Sheriff's seat and the month's public incidents. */
const politics = (incidents: IncidentView[], sheriff: string | null = 'brix') => ({ sheriff, sabotage: { incidents } }) as unknown as PoliticsView;
const mine = (id: string, ids: string[]): MyView => ({ id, politics: { sabotage: { mine: ids.map((i) => ({ ...incident({ id: i }), public: false, outcome: 'done' })) } } }) as unknown as MyView;
const atMonthEnd = (incidents: IncidentView[], me: MyView | null = null): MuleView => aMuleView({ players: PLAYERS, me, politics: politics(incidents), month: MONTH, phase: 'upkeep' });

describe('S4-C17 · the month end’s sabotage line, everyone’s (MONTH_END)', () => {
  const line = (i: IncidentView) => sabotageNewsLine(atMonthEnd([i]), i);

  it('S4-B-AC-2: a cut that worked unseen says "someone", never a name', () => {
    expect(line(incident({}))).toBe('Sabotage: someone cut the power to Ossa’s smithore plot.');
  });

  it('S4-B-AC-1: caught by a guard names Lena; the power stayed on', () => {
    expect(line(incident({ worked: false, culprit: 'lena', how: 'guard' }))).toBe('Sabotage: Lena was caught by a guard at Ossa’s plot. The power stayed on.');
  });

  it('a cut that worked but was seen', () => {
    expect(line(incident({ culprit: 'lena', how: 'caught' }))).toBe('Sabotage: Lena cut the power to Ossa’s smithore plot, and was seen.');
  });

  it('a rumour that took, unseen; and one caught', () => {
    expect(line(rumour({}))).toBe('Sabotage: a rumour moved Food’s opening price 25% up.');
    expect(line(rumour({ dir: 'down' }))).toBe('Sabotage: a rumour moved Food’s opening price 25% down.');
    expect(line(rumour({ worked: false, culprit: 'lena', how: 'caught' }))).toBe('Sabotage: Lena was caught starting a rumour on Food.');
  });

  it('a rumour that worked but was seen (WS6, 8 Nov): seen, then what it did, higher or lower', () => {
    expect(line(rumour({ culprit: 'lena', how: 'caught' }))).toBe('Sabotage: Lena was seen starting a rumour. Food opened 25% higher.');
    expect(line(rumour({ culprit: 'lena', how: 'caught', dir: 'down' }))).toBe('Sabotage: Lena was seen starting a rumour. Food opened 25% lower.');
  });

  it('one line per incident of this month only, in the view’s order', () => {
    const view = atMonthEnd([incident({ id: 'a' }), incident({ id: 'old', month: MONTH - 1, culprit: 'lena' }), rumour({ id: 'b' })]);
    expect(sabotageNews(view)).toEqual(['Sabotage: someone cut the power to Ossa’s smithore plot.', 'Sabotage: a rumour moved Food’s opening price 25% up.']);
  });

  it('no politics, or sabotage off: no lines', () => {
    expect(sabotageNews(aMuleView({ players: PLAYERS, me: null, politics: null }))).toEqual([]);
    expect(sabotageNews(aMuleView({ players: PLAYERS, me: null, politics: { sheriff: null, sabotage: null } as unknown as PoliticsView }))).toEqual([]);
  });

  it('an unseen incident never names anyone but its victim', () => {
    for (const i of [incident({}), rumour({})]) expect(line(i)).not.toMatch(/Lena|Brix/);
  });
});

describe('S4-C17 · what a phone knows for its own line after the show', () => {
  it('its own orders by id, from its own view', () => {
    expect(sabotageSeat(atMonthEnd([], mine('lena', ['sab-a', 'sab-b'])))).toEqual({ mine: ['sab-a', 'sab-b'], sheriff: false });
  });

  it('whether it is the Sheriff’s phone, from the public offices', () => {
    expect(sabotageSeat(atMonthEnd([], mine('brix', [])))).toEqual({ mine: [], sheriff: true });
  });

  it('the TV (no player) knows nothing private', () => {
    expect(sabotageSeat(atMonthEnd([]))).toBeUndefined();
  });

  /** Lena's phone at production with the laws in force and her own deal cards, as the server sends them. */
  const known = (laws: object, cards: object[]) =>
    sabotageSeat(aMuleView({ players: PLAYERS, month: MONTH, phase: 'production', me: { id: 'lena', politics: null, deals: { cards, offersLeft: 0, pactMonths: [] } } as unknown as MyView, politics: { sheriff: 'brix', laws, sabotage: { incidents: [] } } as unknown as PoliticsView }));
  const pact = (other: string, over: object) => ({ id: `deal-${other}`, from: 'lena', to: other, terms: { kind: 'pact' }, offered: MONTH - 1, until: MONTH + 1, status: 'active', brokenBy: null, settled: null, ...over });

  it('the caught loss it can know: no ban is ×1, a ban in force its setting', () => {
    expect(known({}, [])?.reputation).toEqual({ ban: 1, pacts: [], unsure: [] });
    expect(known({ sabotageBan: { setting: 2, since: 3 } }, [])?.reputation).toEqual({ ban: 2, pacts: [], unsure: [] });
  });

  it('the players it held a pact with this month: running, or broken by it this month (the reveal breaks it before the show)', () => {
    const cards = [
      pact('ossa', {}),
      { ...pact('brix', { status: 'broken', brokenBy: 'lena', settled: MONTH }), from: 'brix', to: 'lena' },
      pact('kai', { until: MONTH - 1, status: 'kept', settled: MONTH - 1 }),
      pact('mia', { status: 'broken', brokenBy: 'mia', settled: MONTH - 1 }),
      { ...pact('zed', {}), terms: { kind: 'vote', law: true, yes: true } },
    ];
    expect(known({}, cards)?.reputation?.pacts).toEqual(['ossa', 'brix']);
  });

  /**
   * Review of #750: month 5. In planning the Sheriff's investigation solves Lena's month-3 cut on Ossa, and that reveal
   * breaks their pact; in production Lena cuts Ossa again and is caught. The engine's pactBetween finds no pact left,
   * so this catch costs no 20 more, yet the card reads "broken by Lena in month 5" either way.
   */
  const may = (orders: object[], reasons: object[] | undefined, cards: object[]) =>
    sabotageSeat(
      aMuleView({
        players: PLAYERS,
        month: MONTH,
        phase: 'production',
        me: { id: 'lena', politics: { sabotage: { mine: orders } }, deals: { cards, offersLeft: 0, pactMonths: [] } } as unknown as MyView,
        politics: { sheriff: 'brix', laws: {}, sabotage: { incidents: [] }, ...(reasons ? { reputationReasons: { lena: reasons } } : {}) } as unknown as PoliticsView,
      }),
    )?.reputation;
  const broke = [pact('ossa', { offered: MONTH - 3, status: 'broken', brokenBy: 'lena', settled: MONTH })];
  const older = { ...incident({ id: 'sab-old', month: MONTH - 2, culprit: 'lena', how: 'investigation', investigated: true }), public: true, outcome: 'done' };
  const now = { ...incident({ id: 'sab-new', worked: false, culprit: 'lena', how: 'guard' }), public: true, outcome: 'caught' };

  it('an investigation broke the pact this month, before this catch: the phone cannot say the pact’s 20, so it names no number for Ossa', () => {
    // Two reveals dated this month: the investigation's and this catch's.
    const r = may([older, now], [{ kind: 'caught', month: MONTH }, { kind: 'caught', month: MONTH }], broke);
    expect(r?.unsure).toEqual(['ossa']);
  });

  it('the older order was solved in an earlier month: this month’s break is this catch’s, and the 20 counts', () => {
    const r = may([older, now], [{ kind: 'caught', month: MONTH - 1 }, { kind: 'caught', month: MONTH }], broke);
    expect(r).toMatchObject({ pacts: ['ossa'], unsure: [] });
  });

  it('a view without the reveal months cannot tell either way: no number for Ossa', () => {
    expect(may([older, now], undefined, broke)?.unsure).toEqual(['ossa']);
  });

  it('a pact still running is never unsure: the engine breaks it on this catch', () => {
    expect(may([older, now], undefined, [pact('ossa', {})])).toMatchObject({ pacts: ['ossa'], unsure: [] });
  });

  it('no older solved order on Ossa: nothing is ambiguous', () => {
    expect(may([now], undefined, broke)).toMatchObject({ pacts: ['ossa'], unsure: [] });
  });

  it('a view without its laws or its deal cards cannot know the loss: no reputation, so no number', () => {
    expect(sabotageSeat(atMonthEnd([], mine('lena', [])))?.reputation).toBeUndefined();
  });

  it('a phone with no politics: no orders, not the Sheriff', () => {
    expect(sabotageSeat(aMuleView({ players: PLAYERS, me: { id: 'lena', politics: null } as unknown as MyView, politics: null }))).toEqual({ mine: [], sheriff: false });
  });
});

describe('S4-C17 · the TV’s month end says each sabotage of the month (WS4 named edit, MonthEnd.tsx ColonyPanel)', () => {
  const words = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const client = { subscribe: () => () => {}, getState: () => ({ status: 'open', role: 'board', code: 'MULE', seatId: null, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }), serverNow: () => 0, intent: () => {} } as unknown as TableClient;
  const onTv = (game: MuleView) => renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvMonthEnd, { game }) }));

  const two = () => atMonthEnd([incident({ id: 'a', worked: false, culprit: 'lena', how: 'guard' }), rumour({ id: 'b' })]);
  /** The phone with no TV: its month end's colony panel, at compact density. */
  const compact = (game: MuleView) => renderToStaticMarkup(createElement(ColonyPanel, { view: game, density: 'compact' }));
  /** The colony panel's header row, through its closing tag. */
  const header = (html: string) => {
    const at = html.indexOf('data-testid="colony-panel"');
    return html.slice(at, html.indexOf('</header>', at));
  };

  it('PM ruling 8 Nov (TV-FIT): the TV draws no sabotage line, only a "Sabotage ×N" tag on the colony panel’s header row', () => {
    const html = onTv(two());
    expect(html).not.toContain('data-testid="sabotage-news"');
    expect(words(html)).not.toContain('Lena was caught');
    const row = header(html);
    expect(words(row)).toContain('Sabotage ×2');
    expect(row).toMatch(/class="[^"]*label-caps[^"]*text-alert[^"]*"[^>]*data-testid="sabotage-tag"/);
  });

  it('S4-B-AC-1: the phone’s month end keeps the full lines, one per incident, and no tag', () => {
    const html = compact(two());
    expect(words(html)).toContain('Sabotage: Lena was caught by a guard at Ossa’s plot. The power stayed on.');
    expect(words(html)).toContain('Sabotage: a rumour moved Food’s opening price 25% up.');
    expect(html).not.toContain('data-testid="sabotage-tag"');
  });

  it('a month with no sabotage: no tag on the TV, no lines on the phone', () => {
    expect(onTv(atMonthEnd([]))).not.toContain('data-testid="sabotage-tag"');
    expect(compact(atMonthEnd([]))).not.toContain('data-testid="sabotage-news"');
  });
});

describe('S4-C17 · a rumour’s good and direction, joined from the public incidents (withSabotageDetail)', () => {
  const ev = (key: 'marketRumour' | 'powerCut' | 'dustStorm', order?: string): ShowEventView => ({
    key,
    kind: key === 'dustStorm' ? 'storm' : 'sabotage',
    title: '',
    line: '',
    sign: 'bad',
    scope: 'colony',
    origin: { x: 0, y: 0 },
    hits: [],
    phase: 'production',
    weight: 'headline',
    playMs: 7000,
    ...(order ? { sabotage: { order, culprit: null, worked: true, guarded: false } } : {}),
  });

  it('a rumour takes its incident’s good and dir, matched by the order id', () => {
    const [out] = withSabotageDetail([ev('marketRumour', 'sab-d')], [rumour({ id: 'sab-x', good: 'energy' }), rumour({ id: 'sab-d', good: 'food', dir: 'down' })]);
    expect(out).toMatchObject({ good: 'food', dir: 'down' });
  });

  it('a rumour with no matching incident, a cut, and a colony event are left as they are', () => {
    const events = [ev('marketRumour', 'sab-z'), ev('powerCut', 'sab-a'), ev('dustStorm')];
    const out = withSabotageDetail(events, [incident({ id: 'sab-a' }), rumour({ id: 'sab-d' })]);
    expect(out).toEqual(events);
    expect(out[0]).not.toHaveProperty('good');
  });

  it('no incidents (sabotage off, or before the server serves them): the very same events', () => {
    const events = [ev('marketRumour', 'sab-d')];
    expect(withSabotageDetail(events, undefined)).toBe(events);
    expect(withSabotageDetail(events, [])).toBe(events);
  });
});

describe('S4-C17 · an incident with no good (WS7: `good` may be null on the wire)', () => {
  const noGood = null as unknown as IncidentView['good'];

  it('the join gives the rumour no good, so the whisper draws no icon and no tag', () => {
    const ev = { key: 'marketRumour', sabotage: { order: 'sab-d', culprit: null, worked: true, guarded: false } } as unknown as ShowEventView;
    const [out] = withSabotageDetail([ev], [rumour({ id: 'sab-d', good: noGood })]);
    expect(out).not.toHaveProperty('good');
  });

  it('the month end still words it, without a good', () => {
    const line = (i: IncidentView) => sabotageNewsLine(atMonthEnd([i]), i);
    expect(line(rumour({ good: noGood }))).toBe('Sabotage: a rumour moved an opening price 25% up.');
    expect(line(rumour({ good: noGood, worked: false, culprit: 'lena', how: 'caught' }))).toBe('Sabotage: Lena was caught starting a rumour.');
    expect(line(incident({ good: noGood }))).toBe('Sabotage: someone cut the power to Ossa’s plot.');
  });
});
