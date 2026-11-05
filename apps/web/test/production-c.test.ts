import { productionEventAtMs, productionShowMs } from '@mule/engine';
import type { MuleView, PlayerView, ProductionView, TileView } from '@mule/protocol';
import { ProductionMap, showEnd, showTime, showTimes, type MapTile } from '@mule/ui';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TableClient } from '../src/net/client';
import { ClientProvider } from '../src/net/react';
import { TvProduction } from '../src/table/TvProduction';

/**
 * The production show in Heiko's order C (ws6-ux spec AM-19, RULE-3), as the table sees it: good by good for every
 * player at once, then every bonus at once, then every loss at once, then the flight into each player's silo, and the
 * speed-up once every person has asked.
 */

const W = 6;
const H = 3;
const tiles: MapTile[] = Array.from({ length: W * H }, (_, i) => ({ x: i % W, y: Math.floor(i / W), terrain: 'plains', owner: null }));
const player = (id: string, name: string, slot: number): PlayerView => ({ id, name, isAi: false, color: '', species: 'zipwing', money: 1000, worth: 0, lastWorth: null, worthBeforeCut: null, plots: 0, ready: false, doneDeveloping: false, condition: null, colonist: null, slot });
const PLAYERS = [player('s1', 'Lena', 0), player('s2', 'Ossa', 1)];

/**
 * Lena's Food (1, 0) makes 3 and gains 1 beside her own Food; Ossa's Food (2, 0) makes 2; Ossa's Energy (4, 1) makes 3
 * and loses 1 to pollution; Lena's Water (2, 2) makes 2. Goods made, in RULE-3's order: Food, Water, Energy.
 */
function month(over: Partial<ProductionView> = {}): ProductionView {
  return {
    lines: [
      { x: 1, y: 0, owner: 's1', good: 'food', base: 3, made: 4, parts: [{ why: 'cluster', delta: 1 }] },
      { x: 2, y: 0, owner: 's2', good: 'food', base: 2, made: 2, parts: [] },
      { x: 4, y: 1, owner: 's2', good: 'energy', base: 3, made: 2, parts: [{ why: 'pollution', delta: -1 }] },
      { x: 2, y: 2, owner: 's1', good: 'water', base: 2, made: 2, parts: [] },
    ],
    events: [],
    lengthMs: productionShowMs(3, 0),
    introMs: 0,
    ...over,
  };
}

const mapAt = (production: ProductionView, t: number) => renderToStaticMarkup(createElement(ProductionMap, { width: W, height: H, tiles, production, t, slots: { s1: 0, s2: 1 }, tv: true }));

/** The markup of one plot's box, from its test id to the next plot's. */
function plot(html: string, x: number, y: number): string {
  const start = html.indexOf(`data-testid="plot-${x}-${y}"`);
  if (start < 0) return '';
  const next = html.indexOf('data-testid="plot-', start + 1);
  return html.slice(start, next < 0 ? undefined : next);
}
const stateOf = (html: string) => /data-state="(\w+)"/.exec(html)?.[1];
const countOf = (html: string) => Number(/data-testid="units"[^>]*>(\d+)</.exec(html)?.[1] ?? 0);
const badges = (html: string) => [...html.matchAll(/data-why="(\w+)"/g)].map((m) => m[1]);

function view(production: ProductionView, phaseEndsAt: number): MuleView {
  const tileViews: TileView[] = tiles.map((t) => ({ x: t.x, y: t.y, terrain: t.terrain as TileView['terrain'], peaks: 0, owner: null, outfit: null, pollution: 0, filter: false }));
  return {
    finished: false, month: 3, maxMonths: 12, lastAir: null, colonistsFed: null, phase: 'production', phaseEndsAt, width: W, height: H, tiles: tileViews, lit: null,
    players: PLAYERS, me: null, market: [], storeMules: 0, mulePrice: 0, colonists: 0, air: { level: 22, band: 'clean' }, ship: { arrives: 3, inPort: false, wants: null },
    treasury: { money: 0, salesTax: 0.05 }, news: [], scores: null, auction: null, listings: [], lotSlots: { used: 0, max: 4 }, landAuction: null, production, politics: null,
  } as MuleView;
}

/** The TV's production screen when the server's clock says `t` show seconds have passed (no speed-up). */
function tvAt(production: ProductionView, t: number, now?: number, phaseEndsAt = 5_000_000): string {
  const at = now ?? phaseEndsAt - production.lengthMs + t * 1000;
  const client = {
    subscribe: () => () => {},
    getState: () => ({ status: 'open', role: 'table', code: 'MULE', seatId: null, view: null, chat: [], emotes: [], toasts: [], clockOffset: 0 }),
    serverNow: () => at,
    intent: () => {},
  } as unknown as TableClient;
  return renderToStaticMarkup(createElement(ClientProvider, { client, children: createElement(TvProduction, { game: view(production, phaseEndsAt), production }) }));
}

describe('B-AC-6 (AM-19): good by good for every player at once, then every bonus, then every loss', () => {
  const m = month();
  const s = showTimes(m);

  it("every player's Food fills at once while Water and Energy wait dark; then Water; then Energy", () => {
    const food = mapAt(m, s.goodAt.food! + 0.5);
    expect(stateOf(plot(food, 1, 0))).not.toBe('waiting');
    expect(stateOf(plot(food, 2, 0))).not.toBe('waiting');
    expect(stateOf(plot(food, 2, 2))).toBe('waiting');
    expect(stateOf(plot(food, 4, 1))).toBe('waiting');
    const water = mapAt(m, s.goodAt.water! + 0.5);
    expect(stateOf(plot(water, 2, 2))).not.toBe('waiting');
    expect(stateOf(plot(water, 4, 1))).toBe('waiting');
    expect(s.goodAt.water).toBeGreaterThan(s.goodAt.food!);
    expect(s.goodAt.energy).toBeGreaterThan(s.goodAt.water!);
  });

  it('a plot counts up from its base, one unit at a time', () => {
    expect(countOf(plot(mapAt(m, s.goodAt.food! + 0.01), 1, 0))).toBe(1);
    expect(countOf(plot(mapAt(m, s.goodAt.food! + 0.6), 1, 0))).toBe(3);
  });

  it('every bonus lands at once, after the last good; every loss after the bonuses; no badge before its time', () => {
    const before = mapAt(m, s.bonusAt - 0.1);
    expect(countOf(plot(before, 1, 0))).toBe(3);
    expect(badges(plot(before, 1, 0))).toEqual([]);
    const bonuses = mapAt(m, s.bonusAt + 0.1);
    expect(countOf(plot(bonuses, 1, 0))).toBe(4);
    expect(badges(plot(bonuses, 1, 0))).toEqual(['cluster']);
    expect(countOf(plot(bonuses, 4, 1))).toBe(3);
    expect(badges(plot(bonuses, 4, 1))).toEqual([]);
    const losses = mapAt(m, s.lossAt + 0.1);
    expect(countOf(plot(losses, 4, 1))).toBe(2);
    expect(badges(plot(losses, 4, 1))).toEqual(['pollution']);
    expect(s.lossAt).toBeGreaterThan(s.bonusAt);
  });

  it("the TV's rail names the step: the good being harvested, then Bonuses, then Losses", () => {
    expect(tvAt(m, s.goodAt.water! + 0.2)).toMatch(/data-testid="act-harvest"[^]*?Water/);
    expect(tvAt(m, s.bonusAt + 0.2)).toMatch(/data-testid="act-bonus"[^>]*data-now="true"/);
    expect(tvAt(m, s.lossAt + 0.2)).toMatch(/data-testid="act-loss"[^>]*data-now="true"/);
  });

  it("the floor that lifts a plot back to 0 lands with its losses, never as a bonus: no green +1 and no badge of its own (#344 review)", () => {
    // Lena's farm makes 2, loses 3 to pollution, and the floor lifts it back to 0: it made nothing.
    const polluted = month({ lines: [{ x: 1, y: 0, owner: 's1', good: 'food', base: 2, made: 0, parts: [{ why: 'pollution', delta: -3 }, { why: 'floor', delta: 1 }] }] });
    const t = showTimes(polluted);
    const atBonus = plot(tvAt(polluted, t.bonusAt + 0.8), 1, 0);
    expect(countOf(atBonus), 'during the bonuses the farm stands at what it made before any part').toBe(2);
    expect(badges(atBonus)).toEqual([]);
    const afterLoss = plot(tvAt(polluted, t.lossAt + 1.2), 1, 0);
    expect(countOf(afterLoss)).toBe(0);
    expect(badges(afterLoss)).toEqual(['pollution']);
  });
});

describe('B-AC-8 (AM-19): the goods fly into each player’s silo', () => {
  const m = month();
  const s = showTimes(m);

  it("each plot's goods fly as one chip, and each silo shows what its player made, good by good", () => {
    expect(tvAt(m, s.flightAt + 0.3)).toContain('data-testid="flying-goods"');
    const full = tvAt(m, s.holdAt + 0.1);
    const silo = (id: string) => full.slice(full.indexOf(`data-testid="silo-${id}"`), full.indexOf('</div>', full.indexOf(`data-testid="silo-${id}"`) + 400));
    expect(silo('s1')).toMatch(/data-good="food"[^>]*>4</);
    expect(silo('s1')).toMatch(/data-good="water"[^>]*>2</);
    expect(silo('s2')).toMatch(/data-good="food"[^>]*>2</);
    expect(silo('s2')).toMatch(/data-good="energy"[^>]*>2</);
    expect(full).not.toContain('data-testid="flying-goods"');
  });
});

describe('B-AC-20 (AM-19): everyone taps Speed up, and the rest plays 3× faster', () => {
  it('one tap only says who is still to ask; nothing speeds up', () => {
    const one = month({ hurry: { asked: ['s1'], from: null } });
    const html = tvAt(one, 2);
    expect(html).toContain('data-testid="speed-up"');
    expect(html).toMatch(/1 of 2 asked[^<]*Ossa/);
  });

  it('once both have asked, the TV says so and its clock runs 3× from the moment they did', () => {
    const fast = month({ hurry: { asked: ['s1', 's2'], from: 4 } });
    const end = showEnd(fast);
    // The server moved the phase's end: from show second 4, the rest plays in a third of the time.
    const phaseEndsAt = 5_000_000;
    const at = (t: number) => phaseEndsAt - ((end - t) * 1000) / 3;
    expect(showTime(phaseEndsAt, at(7), fast.lengthMs, fast)).toBeCloseTo(7, 6);
    expect(showTime(phaseEndsAt, at(end), fast.lengthMs, fast)).toBeCloseTo(end, 6);
    expect(tvAt(fast, 0, at(7), phaseEndsAt)).toMatch(/data-testid="speed-up"[^]*?3× faster/);
  });

  it('without a speed-up the clock maps as before', () => {
    const m = month();
    expect(showTime(5_000_000, 5_000_000 - m.lengthMs + 3000, m.lengthMs, m)).toBeCloseTo(3, 6);
  });
});

describe('T-AC-14 (AM-19): the screens play the server’s timeline', () => {
  const drought = { key: 'drought', kind: 'drought', title: 'Drought', line: 'Less Water.', sign: 'bad', scope: 'colony', origin: { x: 0, y: 0 }, hits: [], phase: 'production', weight: 'headline', playMs: 7000 } as unknown as ProductionView['events'][number];
  for (const [name, events, introMs] of [['a quiet month', [], 0], ['a month with an event', [drought], 1800]] as const) {
    it(`${name}: the screens end at productionShowMs and start the events at productionEventAtMs`, () => {
      const m = month({ events: [...events], introMs });
      const eventsMs = events.length ? introMs + 7000 : 0;
      const s = showTimes(m);
      expect(showEnd(m) * 1000).toBeCloseTo(productionShowMs(3, eventsMs), 6);
      if (events.length) expect(s.eventsAt! * 1000).toBeCloseTo(productionEventAtMs(3), 6);
      else expect(s.eventsAt).toBeNull();
    });
  }
});
