import { EVENT_SHOW, PHASES } from '@mule/engine';
import type { MuleView, PlayerView, ProductionEventView, ProductionView, TileView } from '@mule/protocol';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TvProduction } from '../src/table/TvProduction';

const W = 6;
const H = 3;
/** The production show's event window opens 4.8 s in; the phase's intro plays first, then each event's segment. */
const EVENT_AT = 4.8;

const player = (id: string, name: string, slot: number): PlayerView => ({ id, name, isAi: false, color: '', species: 'zipwing', money: 1000, worth: 0, plots: 0, ready: false, doneDeveloping: false, condition: null, colonist: null, slot });
const PLAYERS = [player('s1', 'Lena', 0), player('s2', 'Ossa', 1)];

/** Lena farms (1, 0) and (4, 0); Ossa farms (2, 2) and runs a plant at (5, 2), which no event reaches. */
const OWNED: Record<string, [owner: string, outfit: 'food' | 'energy']> = { '1,0': ['s1', 'food'], '4,0': ['s1', 'food'], '2,2': ['s2', 'food'], '5,2': ['s2', 'energy'] };
const tiles: TileView[] = Array.from({ length: W * H }, (_, i) => {
  const x = i % W;
  const y = Math.floor(i / W);
  const [owner, outfit] = OWNED[`${x},${y}`] ?? [null, null];
  return { x, y, terrain: 'plains', peaks: 0, owner, outfit, pollution: 0, filter: false };
});
const lines: ProductionView['lines'] = [
  { x: 1, y: 0, owner: 's1', good: 'food', made: 4, parts: [] },
  { x: 4, y: 0, owner: 's1', good: 'food', made: 2, parts: [] },
  { x: 2, y: 2, owner: 's2', good: 'food', made: 3, parts: [] },
  { x: 5, y: 2, owner: 's2', good: 'energy', made: 2, parts: [] },
];

/** An event as the server sends it (RULE-1): its weight and its play length from the engine's own numbers. */
function fired(key: 'drought' | 'pestSwarm', extra: Pick<ProductionEventView, 'title' | 'scope' | 'origin'>, hits: [x: number, y: number, delta: number][]): ProductionEventView {
  const weight = EVENT_SHOW.weight[key]!;
  return {
    key,
    kind: key === 'drought' ? 'drought' : 'blight',
    line: `${extra.title} happens.`,
    sign: 'bad',
    ...extra,
    hits: hits.map(([x, y, delta], order) => ({ x, y, order, delta })),
    phase: 'production',
    weight,
    playMs: EVENT_SHOW.playMs[weight as 'headline' | 'spotlight'],
  };
}
// The drought takes 1 Food from Lena's (1, 0) and 2 from Ossa's (2, 2): −3 Food on 2 farms.
const drought = fired('drought', { title: 'Drought', scope: 'colony', origin: { x: 0, y: 0 } }, [
  [1, 0, -1],
  [2, 2, -2],
]);
// The pest swarm starts on Lena's (4, 0) and takes 1 Food there: Lena, −1 Food on 1 farm.
const pests = fired('pestSwarm', { title: 'Pest swarm', scope: 'personal', origin: { x: 4, y: 0 } }, [[4, 0, -1]]);

/** The month as the server builds it: the intro whenever an event fired, and production lengthened past the window (RULE-1). */
function month(events: ProductionEventView[]): ProductionView {
  const introMs = events.length > 0 ? EVENT_SHOW.introMs : 0;
  const lengthMs = PHASES.productionMs + Math.max(0, introMs + events.reduce((n, e) => n + e.playMs, 0) - EVENT_SHOW.productionWindowMs);
  return { lines, events, lengthMs, introMs };
}

function view(production: ProductionView, phaseEndsAt: number): MuleView {
  return {
    finished: false,
    month: 3,
    maxMonths: 12,
    phase: 'production',
    phaseEndsAt,
    width: W,
    height: H,
    tiles,
    lit: null,
    players: PLAYERS,
    me: null,
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
    production,
    politics: null,
  };
}

/**
 * The TV's production screen when the server's clock says `t` show seconds have passed: the phase ends at a fixed
 * moment, and the server's now is set back from it by the share of the phase still to play. The show's end in
 * seconds is the server's length (HC-3), so `t` maps onto the server's clock without the screen's own arithmetic.
 */
function tvAt(production: ProductionView, t: number): string {
  const phaseEndsAt = 5_000_000;
  const now = phaseEndsAt - production.lengthMs + t * 1000;
  const client = {
    subscribe: () => () => {},
    getState: () => ({ status: 'open', role: 'table', code: 'MULE', seatId: null, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
    serverNow: () => now,
    intent: () => {},
  } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvProduction, { game: view(production, phaseEndsAt), production }) }));
}

/** The markup inside the div carrying this attribute, by balancing its divs. */
function inside(html: string, attr: string): string {
  const open = html.indexOf(attr);
  if (open < 0) return '';
  const from = html.indexOf('>', open) + 1;
  let depth = 1;
  const tag = /<div[\s>]|<\/div>/g;
  tag.lastIndex = from;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(from, m.index);
  }
  return html.slice(from);
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
/** What the map is playing. */
const playing = (html: string) => [...html.matchAll(/data-event="([^"]+)"/g)].map((m) => m[1]);
/** The rail's card for the event playing now, by its key. */
const now = (html: string) => [...html.matchAll(/data-now="([^"]+)"/g)].map((m) => m[1]);
/** The rail's log of what already happened: each entry's key and its words. */
const log = (html: string) => [...html.matchAll(/data-log="([^"]+)"/g)].map((m) => ({ key: m[1], words: text(inside(html.slice(m.index), 'data-log=')) }));
/** The event chips on one player's slot of the colony bar. */
const chips = (html: string, id: string) => [...inside(html, `data-testid="slot-${id}"`).matchAll(/data-delta="(-?\d+)"/g)].map((m) => Number(m[1]));

describe("the TV's production screen follows the event that is playing", () => {
  const both = month([drought, pests]);
  // The intro plays 4.8..6.6, the drought (a headline) 6.6..13.6, the pest swarm (a spotlight) 13.6..18.8; the goods fly from 18.8.
  const droughtAt = EVENT_AT + EVENT_SHOW.introMs / 1000;
  const pestsAt = droughtAt + drought.playMs / 1000;
  const windowEnds = pestsAt + pests.playMs / 1000;

  it('B-AC-1: a drought then a pest swarm play in that order, each card naming the player, and the log lists what each did', () => {
    // Mid-drought: the map plays the drought, the rail's card is the drought's, and nothing is in the log yet.
    const mid = tvAt(both, droughtAt + 4);
    expect(playing(mid)).toEqual(['drought']);
    expect(now(mid)).toEqual(['drought']);
    expect(text(inside(mid, 'data-now="drought"'))).toContain('The whole colony');
    expect(log(mid)).toEqual([]);

    // The pest swarm's title card names Lena, never her seat id.
    const announced = text(inside(tvAt(both, pestsAt + 0.3), 'data-testid="title-card"'));
    expect(announced).toContain('Pest swarm');
    expect(announced).toContain('Lena');
    expect(announced).not.toContain('s1');

    // Mid-swarm: the swarm is the card; the drought moved to the log with what it did.
    const later = tvAt(both, pestsAt + 3);
    expect(playing(later)).toEqual(['pestSwarm']);
    expect(now(later)).toEqual(['pestSwarm']);
    expect(text(inside(later, 'data-now="pestSwarm"'))).toContain('Lena');
    expect(log(later)).toEqual([{ key: 'drought', words: 'Drought −3 Food on 2 farms' }]);

    // Both have settled, the goods not yet flown: the log keeps both, in fired order, each with the report's figures.
    const settled = tvAt(both, windowEnds - 0.05);
    expect(now(settled)).toEqual([]);
    expect(log(settled)).toEqual([
      { key: 'drought', words: 'Drought −3 Food on 2 farms' },
      { key: 'pestSwarm', words: 'Pest swarm Lena: −1 Food on 1 farm' },
    ]);
    // The colony bar's chips: Lena lost 1 to each event, Ossa 2 to the drought; nobody else's plot was reached.
    expect(chips(settled, 's1')).toEqual([-2]);
    expect(chips(settled, 's2')).toEqual([-2]);
    // Invariant: no figure the report does not hold: the log's numbers are exactly the two events' totals.
    expect([...text(inside(settled, 'data-testid="log"')).matchAll(/[−+]\d+/g)].map((m) => m[0])).toEqual(['−3', '−1']);
    // The old one-event card and its line are gone.
    expect(settled).not.toContain('data-testid="event-card"');
    expect(settled).not.toContain('watch the map');
  });

  it('B-AC-1: inside the phase’s intro no story plays yet, and the drought plays from the moment the intro ends', () => {
    // The intro's first moments: its card is up and the map plays nothing.
    const intro = tvAt(both, EVENT_AT + 0.1);
    expect(intro).toContain('data-testid="intro-card"');
    expect(playing(intro)).toEqual([]);
    expect(now(intro)).toEqual([]);
    expect(playing(tvAt(both, droughtAt - 0.1))).toEqual([]);
    // Just past the intro, the drought.
    expect(playing(tvAt(both, droughtAt + 0.05))).toEqual(['drought']);
  });

  it('B-AC-1: a quiet month shows no event card, no log entry and no chip', () => {
    const quiet = month([]);
    for (const t of [EVENT_AT + 1, 9]) {
      const html = tvAt(quiet, t);
      expect(playing(html), `at ${t}`).toEqual([]);
      expect(now(html), `at ${t}`).toEqual([]);
      expect(log(html), `at ${t}`).toEqual([]);
      expect(html).not.toContain('data-testid="event-card"');
      expect(chips(html, 's1')).toEqual([]);
      expect(chips(html, 's2')).toEqual([]);
    }
    expect(text(tvAt(quiet, 9))).toContain('A quiet month');
  });
});
