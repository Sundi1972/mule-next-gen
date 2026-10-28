import type { EventKey, GameState, MonthEvent, MonthReport } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { describe, expect, it } from 'vitest';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/** A month event of `key` that hit one plot; its words and shape don't matter to how long it plays. */
function event(key: EventKey): MonthEvent {
  return {
    key,
    kind: 'storm',
    title: key,
    line: `${key} happens.`,
    scope: 'colony',
    origin: { x: 0, y: 0 },
    plots: [{ index: 0, order: 0, good: 'food', delta: -1 }],
    sign: 'bad',
    when: 'afterProduction',
  };
}

/**
 * Plays month 1 on the fake clock until upkeep, with the production report's events replaced by `keys`' events in that
 * order (a seed fires at most one event today). Returns the first view each phase showed, read the moment the phase
 * was announced, and the clock then: phaseEndsAt − at is the length that phase was given.
 */
function playMonth(keys: EventKey[], phaseScale = 1) {
  const first = new Map<string, { view: MuleView; at: number }>();
  let game: MuleGame | null = null;
  const fake = fakeContext({
    onChanged: (at) => {
      const view = game?.viewFor(null);
      if (view && !first.has(view.phase)) first.set(view.phase, { view, at });
    },
  });
  game = new MuleGame(fake.ctx, 7, { phaseScale });
  game.start(seats);
  // The game keeps its engine state private; the test reaches it to arrange the month's events.
  const state = (game as unknown as { state: GameState }).state;
  const push = state.history.push.bind(state.history);
  state.history.push = (...reports: MonthReport[]) => push(...reports.map((r) => ({ ...r, events: keys.map(event) })));
  readyAll(game);
  for (let i = 0; i < 100_000 && !first.has('upkeep'); i++) fake.advance(100);
  const length = (phase: string) => {
    const seen = first.get(phase);
    if (!seen) throw new Error(`month 1 never showed ${phase}`);
    return seen.view.phaseEndsAt! - seen.at;
  };
  return { production: first.get('production')!.view.production!, length };
}

describe('the event show: production lasts long enough for every event, and the view says how long each plays', () => {
  // A lone dust storm is a 7 000 ms headline, longer than the 4 800 ms window, so by RULE-1 it adds 2 200: the spec's
  // "one dust storm → 15 000" example contradicts its own formula and values (flagged to the lead).
  it.each([
    { scale: 1, keys: [] as EventKey[], ms: 15_000 },
    { scale: 1, keys: ['dustStorm'] as EventKey[], ms: 17_200 },
    { scale: 1, keys: ['drought', 'pestSwarm'] as EventKey[], ms: 22_400 },
    { scale: 1, keys: ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'flood'] as EventKey[], ms: 40_200 },
    { scale: 0.1, keys: [] as EventKey[], ms: 1_500 },
    { scale: 0.1, keys: ['dustStorm'] as EventKey[], ms: 1_720 },
    { scale: 0.1, keys: ['drought', 'pestSwarm'] as EventKey[], ms: 2_240 },
    { scale: 0.1, keys: ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'flood'] as EventKey[], ms: 4_020 },
  ])('T-AC-1: at phaseScale $scale, a month with $keys runs production $ms ms and the view says so', ({ scale, keys, ms }) => {
    const { production, length } = playMonth(keys, scale);
    expect(length('production')).toBe(ms);
    expect(production.lengthMs).toBe(ms);
  });

  it('T-AC-1: after five headlines, upkeep still runs its own 8 000 ms (800 at phaseScale 0.1)', () => {
    const five: EventKey[] = ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'flood'];
    expect(playMonth(five, 1).length('upkeep')).toBe(8_000);
    expect(playMonth(five, 0.1).length('upkeep')).toBe(800);
  });

  it('T-AC-2: drought, pest swarm and bumper harvest are listed in fired order as headline 7 000, spotlight 5 200, spotlight 5 200', () => {
    const { production } = playMonth(['drought', 'pestSwarm', 'bumperHarvest']);
    expect(production.events.map(({ key, phase, weight, playMs }) => ({ key, phase, weight, playMs }))).toEqual([
      { key: 'drought', phase: 'production', weight: 'headline', playMs: 7_000 },
      { key: 'pestSwarm', phase: 'production', weight: 'spotlight', playMs: 5_200 },
      { key: 'bumperHarvest', phase: 'production', weight: 'spotlight', playMs: 5_200 },
    ]);
  });

  it('T-AC-2: when the cap bites, five headlines share it equally, 6 000 each, unscaled at phaseScale 0.1', () => {
    const five: EventKey[] = ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'flood'];
    const { production } = playMonth(five, 0.1);
    expect(production.events.map(({ key, weight, playMs }) => ({ key, weight, playMs }))).toEqual(
      five.map((key) => ({ key, weight: 'headline', playMs: 6_000 })),
    );
  });

  it('T-AC-2: a quiet month lists no events', () => {
    expect(playMonth([]).production.events).toEqual([]);
  });
});
