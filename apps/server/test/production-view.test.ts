import { emptyStock, type GameState, type MonthEvent, type ProductionLine } from '@mule/engine';
import { describe, expect, it } from 'vitest';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { fakeContext, seats } from './fake-context.js';

/** Stock numbers no plot could make in a month, so finding one in a view can only mean it leaked. */
const SECRET_FOOD = 7_919;
const SECRET_ENERGY = 104_729;

/** A game played on its own clocks until production starts. */
function inProduction() {
  const fake = fakeContext();
  const game = new MuleGame(fake.ctx, 7);
  game.start(seats);
  fake.advance(game.viewFor(null).phaseEndsAt! - fake.ctx.now());
  while (game.viewFor(null).phase === 'landGrant') fake.advance(GRANT_TICK_MS);
  // Small steps, so the AI seat develops its land.
  while (game.viewFor(null).phase === 'development') fake.advance(100);
  expect(game.viewFor(null).phase).toBe('production');
  const state: GameState = game['state']!;
  return { game, state, ...fake };
}

/**
 * Replaces the month's report with a known one: a Food farm of s1's at (3, 1)
 * with a cluster and a no-Water part, and an Energy plant of s2's at (5, 0)
 * that a quake hit for −2. Both players held secret stock before production.
 */
function knownMonth(state: GameState) {
  const farm = state.width + 3;
  const plant = 5;
  Object.assign(state.tiles[farm]!, { owner: 's1', outfit: 'food' });
  Object.assign(state.tiles[plant]!, { owner: 's2', outfit: 'energy' });
  const lines: ProductionLine[] = [
    { tile: farm, good: 'food', made: 2, parts: [{ why: 'ground', delta: 3 }, { why: 'cluster', delta: 1 }, { why: 'noWater', delta: -2 }, { why: 'floor', delta: 0 }] },
    { tile: plant, good: 'energy', made: 2, parts: [{ why: 'ground', delta: 4 }, { why: 'event', delta: -2, event: 'volcanicAsh' }] },
  ];
  const quake: MonthEvent = {
    key: 'volcanicAsh',
    kind: 'quake',
    title: 'Volcanic ash',
    line: 'Ash falls: plots near the volcano make 2 less.',
    scope: 'local',
    origin: { x: 6, y: 0 },
    plots: [{ index: plant, order: 0, good: 'energy', delta: -2 }],
    sign: 'bad',
    when: 'afterProduction',
  };
  const report = state.history.at(-1)!;
  report.lines = lines;
  report.events = [quake];
  report.before = {
    s1: { ...emptyStock(), food: SECRET_FOOD },
    s2: { ...emptyStock(), energy: SECRET_ENERGY },
    s3: emptyStock(),
  };
}

describe('the production view', () => {
  it("T-AC-5: the production view carries plots and events and never a player's stock", () => {
    const { game, state } = inProduction();
    knownMonth(state);

    for (const seat of [null, 's1']) {
      const view = game.viewFor(seat);
      expect(view.production).toEqual({
        lines: [
          { x: 5, y: 0, owner: 's2', good: 'energy', made: 4, parts: [] },
          { x: 3, y: 1, owner: 's1', good: 'food', made: 2, parts: [{ why: 'noWater', delta: -2 }, { why: 'cluster', delta: 1 }] },
        ],
        events: [
          {
            key: 'volcanicAsh',
            kind: 'quake',
            title: 'Volcanic ash',
            line: 'Ash falls: plots near the volcano make 2 less.',
            sign: 'bad',
            scope: 'local',
            origin: { x: 6, y: 0 },
            hits: [{ x: 5, y: 0, order: 0, delta: -2 }],
          },
        ],
      });
      const production = JSON.stringify(view.production);
      expect(production).not.toMatch(/before|stock/i);
      expect(production).not.toContain(String(SECRET_FOOD));
      expect(production).not.toContain(String(SECRET_ENERGY));
    }
    const tv = JSON.stringify(game.viewFor(null));
    expect(tv).not.toContain(String(SECRET_FOOD));
    expect(tv).not.toContain(String(SECRET_ENERGY));
  });

  it('B-AC-6: a plot shows at most two of its reasons, biggest first, never its ground, floor, factory or a zero', () => {
    const { game, state } = inProduction();
    knownMonth(state);
    const farm = state.history.at(-1)!.lines![0]!;
    farm.parts = [
      { why: 'ground', delta: 3 },
      { why: 'species', delta: 1 },
      { why: 'trait', delta: 0 },
      { why: 'pollution', delta: -1 },
      { why: 'cluster', delta: 2 },
      { why: 'factory', delta: 5 },
      { why: 'noEnergy', delta: -3 },
    ];
    farm.made = 2;
    const line = game.viewFor(null).production!.lines.find((l) => l.owner === 's1')!;
    expect(line.parts).toEqual([
      { why: 'noEnergy', delta: -3 },
      { why: 'cluster', delta: 2 },
    ]);
  });

  it('B-AC-6: the view has no production outside production and upkeep', () => {
    const { game, advance, ctx } = inProduction();
    expect(game.viewFor(null).production).not.toBeNull();
    advance(game.viewFor(null).phaseEndsAt! - ctx.now());
    expect(game.viewFor(null).phase).toBe('auction');
    expect(game.viewFor(null).production).toBeNull();
  });

  it('B-AC-6: a real month lists every working plot once, in reading order', () => {
    const { game, state } = inProduction();
    const report = state.history.at(-1)!;
    const lines = game.viewFor(null).production!.lines;
    expect(lines.length).toBeGreaterThan(0);
    expect(lines).toHaveLength(report.lines!.length);
    const order = lines.map((l) => l.y * state.width + l.x);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    for (const l of lines) expect(state.tiles[l.y * state.width + l.x]!.owner).toBe(l.owner);
  });
});
