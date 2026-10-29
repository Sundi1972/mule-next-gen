import { EVENT_SHOW, type EventKey, type GameState, type MonthEvent, type MonthReport } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { beforeAll, describe, expect, it } from 'vitest';
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
    phase: 'production',
  };
}

/**
 * Plays month 1 on the fake clock until upkeep, with the production report's events replaced by `keys`' events in that
 * order, so a test can name a mix no seed is known to fire. Returns the first view each phase showed, read the moment
 * the phase was announced, and the clock then: phaseEndsAt − at is the length that phase was given.
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
  const endsAt = (phase: string) => first.get(phase)?.view.phaseEndsAt;
  return { production: first.get('production')!.view.production!, length, endsAt };
}

/** Four seats as the seed search played them: two humans who only press Ready, and two AIs. */
const fourSeats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Mia', isAi: false, color: 1 },
  { id: 's3', name: 'The Baron', isAi: true, color: 2 },
  { id: 's4', name: 'Vex', isAi: true, color: 3 },
];
// Found by playing seeds 1-120 through months 1-4 on fourSeats, as playRealMonths does, and reading each production's report.
// The seats (even their names) and the AIs' play move what fires, so these months hold only for fourSeats.
const REAL_SEED = 26;
/** Production fires a colony comet pass, then a personal pest swarm. */
const TWO_EVENT_MONTH = 2;
/** Production fires a colony solar flare and nothing else. */
const ONE_EVENT_MONTH = 3;
/** Production fires nothing. */
const QUIET_MONTH = 4;

/**
 * Plays REAL_SEED on the fake clock through production of `lastMonth`, humans pressing Ready where the game waits and
 * nothing else, the engine's reports untouched. Returns, for each month, its production report and the production view
 * and length the moment production was announced.
 */
function playRealMonths(lastMonth: number) {
  const months = new Map<number, { view: MuleView; at: number; report: MonthReport }>();
  let game: MuleGame | null = null;
  const fake = fakeContext({
    table: fourSeats,
    onChanged: (at) => {
      const view = game?.viewFor(null);
      if (!view || view.phase !== 'production' || months.has(view.month)) return;
      const state = (game as unknown as { state: GameState }).state;
      months.set(view.month, { view, at, report: state.history.at(-1)! });
    },
  });
  game = new MuleGame(fake.ctx, REAL_SEED);
  game.start(fourSeats);
  for (let i = 0; i < 1_000_000 && !months.has(lastMonth); i++) {
    const phase = game.viewFor(null).phase;
    if (phase === 'planning' || phase === 'upkeep') readyAll(game);
    fake.advance(100);
  }
  return (month: number) => {
    const seen = months.get(month);
    if (!seen) throw new Error(`seed ${REAL_SEED} never reached production of month ${month}`);
    return { report: seen.report, production: seen.view.production!, length: seen.view.phaseEndsAt! - seen.at };
  };
}

describe('the event show on real engine months: the view plays exactly what the month report fired', () => {
  let month: ReturnType<typeof playRealMonths>;
  beforeAll(() => {
    month = playRealMonths(QUIET_MONTH);
  });

  it('T-AC-1, T-AC-2: a real month firing comet pass and pest swarm runs production 24 200 ms, each event its own share', () => {
    const { report, production, length } = month(TWO_EVENT_MONTH);
    expect(report.events.map(({ key, scope }) => ({ key, scope }))).toEqual([
      { key: 'cometPass', scope: 'colony' },
      { key: 'pestSwarm', scope: 'personal' },
    ]);
    expect(production.events.map(({ key, phase, weight, playMs }) => ({ key, phase, weight, playMs }))).toEqual([
      { key: 'cometPass', phase: 'production', weight: 'headline', playMs: 7_000 },
      { key: 'pestSwarm', phase: 'production', weight: 'spotlight', playMs: 5_200 },
    ]);
    // RULE-1: a 1 800 ms intro and 12 200 ms of stories make a 14 000 ms show, 9 200 past the 4 800 window.
    expect(production.introMs).toBe(1_800);
    expect(length).toBe(24_200);
    expect(production.lengthMs).toBe(length);
    expect(production.introMs + production.events.reduce((sum, e) => sum + e.playMs, 0)).toBe(14_000);
  });

  it('T-AC-1, T-AC-2: a real month firing only a solar flare runs production 19 000 ms, the flare a 7 000 ms headline', () => {
    const { report, production, length } = month(ONE_EVENT_MONTH);
    expect(report.events.map((e) => e.key)).toEqual(['solarFlare']);
    expect(production.events.map(({ key, weight, playMs }) => ({ key, weight, playMs }))).toEqual([{ key: 'solarFlare', weight: 'headline', playMs: 7_000 }]);
    expect(production.introMs).toBe(1_800);
    expect(length).toBe(19_000);
    expect(production.lengthMs).toBe(19_000);
  });

  it('T-AC-1, T-AC-2: a real quiet month runs production its 15 000 ms and lists no events', () => {
    const { report, production, length } = month(QUIET_MONTH);
    expect(report.events).toEqual([]);
    expect(production.events).toEqual([]);
    expect(production.introMs).toBe(0);
    expect(length).toBe(15_000);
  });
});

describe('the event show: production lasts long enough for every event, and the view says how long each plays', () => {
  // A lone dust storm plays the 1 800 ms intro and its 7 000 ms, past the 4 800 ms window, so it lasts 19 000 (spec AM-5).
  // The five headlines, and two headlines with three spotlights, hit the 30 000 ms cap: 29 600 of stories alone would
  // fit under it, so the second row caps only because the cap counts the intro.
  const capped: EventKey[] = ['drought', 'dustStorm', 'pestSwarm', 'wildfire', 'bumperHarvest'];
  it.each([
    { scale: 1, keys: [] as EventKey[], ms: 15_000 },
    { scale: 1, keys: ['dustStorm'] as EventKey[], ms: 19_000 },
    { scale: 1, keys: ['drought', 'pestSwarm'] as EventKey[], ms: 24_200 },
    { scale: 1, keys: ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'flood'] as EventKey[], ms: 40_200 },
    { scale: 1, keys: capped, ms: 40_200 },
    { scale: 0.1, keys: [] as EventKey[], ms: 1_500 },
    { scale: 0.1, keys: ['dustStorm'] as EventKey[], ms: 1_900 },
    { scale: 0.1, keys: ['drought', 'pestSwarm'] as EventKey[], ms: 2_420 },
    { scale: 0.1, keys: ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'flood'] as EventKey[], ms: 4_020 },
    { scale: 0.1, keys: capped, ms: 4_020 },
  ])('T-AC-1: at phaseScale $scale, a month with $keys runs production $ms ms and the view says so', ({ scale, keys, ms }) => {
    const { production, length } = playMonth(keys, scale);
    expect(length('production')).toBe(ms);
    expect(production.lengthMs).toBe(ms);
  });

  it('T-AC-1: when the cap bites the intro keeps its 1 800 ms and the events share the rest, adding up to the cap exactly', () => {
    const { production } = playMonth(capped);
    // 28 200 ms left after the intro, cut from 29 600 in proportion and rounded on the running total.
    expect(production.introMs).toBe(1_800);
    expect(production.events.map((e) => e.playMs)).toEqual([6_669, 6_669, 4_954, 4_954, 4_954]);
    expect(production.introMs + production.events.reduce((sum, e) => sum + e.playMs, 0)).toBe(30_000);
  });

  it('T-AC-1: after five headlines, the month end still has no clock: the show never times upkeep (WS4 C20, Q4)', () => {
    const five: EventKey[] = ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'flood'];
    expect(playMonth(five, 1).endsAt('upkeep')).toBeNull();
    expect(playMonth(five, 0.1).endsAt('upkeep')).toBeNull();
  });

  it('T-AC-2: drought, pest swarm and bumper harvest are listed in fired order as headline 7 000, spotlight 5 200, spotlight 5 200', () => {
    const { production } = playMonth(['drought', 'pestSwarm', 'bumperHarvest']);
    expect(production.events.map(({ key, phase, weight, playMs }) => ({ key, phase, weight, playMs }))).toEqual([
      { key: 'drought', phase: 'production', weight: 'headline', playMs: 7_000 },
      { key: 'pestSwarm', phase: 'production', weight: 'spotlight', playMs: 5_200 },
      { key: 'bumperHarvest', phase: 'production', weight: 'spotlight', playMs: 5_200 },
    ]);
    // The intro plays once before them, its own length.
    expect(production.introMs).toBe(1_800);
    // A key the weight table lacks plays as a headline, in the view and in production's length.
    const unknown = playMonth(['pirateRaid' as EventKey]);
    expect(unknown.production.events.map(({ weight, playMs }) => ({ weight, playMs }))).toEqual([{ weight: 'headline', playMs: 7_000 }]);
    expect(unknown.length('production')).toBe(19_000);
  });

  it('T-AC-2: when the cap bites, five headlines share what the intro leaves of it equally, 5 640 each, unscaled at phaseScale 0.1', () => {
    const five: EventKey[] = ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'flood'];
    const { production } = playMonth(five, 0.1);
    expect(production.introMs).toBe(1_800);
    expect(production.events.map(({ key, weight, playMs }) => ({ key, weight, playMs }))).toEqual(
      five.map((key) => ({ key, weight: 'headline', playMs: 5_640 })),
    );
    // An uneven cut: 40 200 ms of stories into the 28 200 the intro leaves of 30 000, rounded on the running total.
    const uneven = playMonth([...five, 'pestSwarm']).production;
    expect(uneven.events.map((e) => e.playMs)).toEqual([4_910, 4_911, 4_910, 4_911, 4_910, 3_648]);
    expect(uneven.introMs + uneven.events.reduce((sum, e) => sum + e.playMs, 0)).toBe(30_000);
  });

  it('T-AC-1: with headlines tuned to 0 ms, a lone dust storm plays 0 ms after its intro and production keeps its 15 000 ms', () => {
    const headlineMs = EVENT_SHOW.playMs.headline;
    EVENT_SHOW.playMs.headline = 0;
    try {
      const { production, length } = playMonth(['dustStorm']);
      expect(production.events.map((e) => e.playMs)).toEqual([0]);
      expect(production.introMs).toBe(1_800);
      expect(length('production')).toBe(15_000);
      expect(production.lengthMs).toBe(15_000);
    } finally {
      EVENT_SHOW.playMs.headline = headlineMs;
    }
  });

  it('T-AC-2: a quiet month lists no events and plays no intro', () => {
    const { production } = playMonth([]);
    expect(production.events).toEqual([]);
    expect(production.introMs).toBe(0);
  });
});
