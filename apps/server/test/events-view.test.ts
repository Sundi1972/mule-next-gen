import { EVENT_SHOW, type EventKey, type GameState, type MonthEvent, type MonthReport, type Phase } from '@mule/engine';
import type { EventView, MuleView } from '@mule/protocol';
import { beforeAll, describe, expect, it } from 'vitest';
// Types only, erased at run time: the show's own shapes, which @mule/ui keeps structural so it never imports the protocol.
import type { ShowEventView, ShowTimeline } from '../../../packages/ui/src/events/types.js';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, seats } from './fake-context.js';

/** A month event of `key` that hit one plot; its words and shape don't matter to how long it plays. */
function event(key: EventKey, phase: Phase = 'production'): MonthEvent {
  return {
    key,
    kind: 'storm',
    title: key,
    line: `${key} happens.`,
    scope: 'colony',
    origin: { x: 0, y: 0 },
    plots: [{ index: 0, order: 0, good: 'food', delta: -1 }],
    sign: 'bad',
    phase,
  };
}

/**
 * Plays month 1 on the fake clock until upkeep, with the production report's events replaced by `keys`' events in that
 * order, so a test can name a mix no seed is known to fire. Returns the first view each phase showed, read the moment
 * the phase was announced, and the clock then: phaseEndsAt − at is the length that phase was given.
 */
function playMonth(keys: EventKey[], phaseScale = 1, phaseOf: Partial<Record<EventKey, Phase>> = {}) {
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
  state.history.push = (...reports: MonthReport[]) => push(...reports.map((r) => ({ ...r, events: keys.map((k) => event(k, phaseOf[k])) })));
  readyAll(game);
  for (let i = 0; i < 100_000 && !first.has('upkeep'); i++) fake.advance(100);
  const length = (phase: string) => {
    const seen = first.get(phase);
    if (!seen) throw new Error(`month 1 never showed ${phase}`);
    return seen.view.phaseEndsAt! - seen.at;
  };
  const endsAt = (phase: string) => first.get(phase)?.view.phaseEndsAt;
  /** The first view a phase showed and the clock then, when the phase was entered. */
  const seen = (phase: string) => {
    const at = first.get(phase);
    if (!at) throw new Error(`month 1 never showed ${phase}`);
    return at;
  };
  return { production: first.get('production')!.view.production!, length, endsAt, seen };
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
    return { report: seen.report, view: seen.view, at: seen.at, production: seen.view.production!, length: seen.view.phaseEndsAt! - seen.at };
  };
}

describe('the event show on real engine months: the view plays exactly what the month report fired', () => {
  let month: ReturnType<typeof playRealMonths>;
  beforeAll(() => {
    month = playRealMonths(QUIET_MONTH);
  });

  it('T-AC-1, T-AC-2: a real month firing comet pass and pest swarm runs production 24 200 ms, each event its own share', () => {
    const { report, production, length } = month(TWO_EVENT_MONTH);
    expect(report.events?.map(({ key, scope }) => ({ key, scope }))).toEqual([
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
    expect(report.events?.map((e) => e.key)).toEqual(['solarFlare']);
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

/**
 * Where the production show's intro starts, in ms into the phase at full pace: the client's own SHOW.eventAt, read at
 * run time so the server's start and the client's timeline cannot drift apart. The path is a variable so the server's
 * typecheck does not compile the client's JSX.
 */
const CLIENT_TIMELINE: string = '../../../packages/ui/src/components/ProductionMap.tsx';
const { SHOW } = (await import(CLIENT_TIMELINE)) as { SHOW: { eventAt: number } };
const PRODUCTION_SHOW_AT = SHOW.eventAt * 1000;

describe('T-AC-10: the view carries the current phase\'s events, when their show starts and how long it plays', () => {
  let month: ReturnType<typeof playRealMonths>;
  beforeAll(() => {
    month = playRealMonths(QUIET_MONTH);
  });

  it('T-AC-10: the view carries the phase\'s events with startsAt and showMs: a real comet pass and pest swarm, as production lists them', () => {
    const { view, at, production } = month(TWO_EVENT_MONTH);
    expect(view.events!.map(({ key, phase, weight, playMs }) => ({ key, phase, weight, playMs }))).toEqual([
      { key: 'cometPass', phase: 'production', weight: 'headline', playMs: 7_000 },
      { key: 'pestSwarm', phase: 'production', weight: 'spotlight', playMs: 5_200 },
    ]);
    // One shape for every phase: production's own list is the same list, field for field.
    expect(view.events).toEqual(production.events);
    // RULE-1: the 1 800 ms intro and 12 200 ms of stories; the intro starts 4.8 s into production, where the client plays it.
    expect(view.eventShow).toEqual({ startsAt: at + PRODUCTION_SHOW_AT, showMs: 14_000, introMs: 1_800, endsAt: at + PRODUCTION_SHOW_AT + 14_000, held: false });
    expect(view.eventShow!.startsAt).toBeLessThan(view.phaseEndsAt!);
  });

  it('T-AC-10: a personal event names the player whose land it started on; a colony event names nobody', () => {
    const { view, report } = month(TWO_EVENT_MONTH);
    const swarmOwner = report.events![1]!.player;
    expect(swarmOwner).toMatch(/^s\d$/);
    expect(view.events!.map(({ key, scope, player }) => ({ key, scope, player }))).toEqual([
      { key: 'cometPass', scope: 'colony', player: undefined },
      { key: 'pestSwarm', scope: 'personal', player: swarmOwner },
    ]);
    expect('player' in view.events![0]!).toBe(false);
  });

  it('T-AC-10: the view carries the phase\'s events with startsAt and showMs: a real lone solar flare', () => {
    const { view, at, production } = month(ONE_EVENT_MONTH);
    expect(view.events).toEqual(production.events);
    expect(view.events!.map((e) => e.key)).toEqual(['solarFlare']);
    expect(view.eventShow).toEqual({ startsAt: at + PRODUCTION_SHOW_AT, showMs: 8_800, introMs: 1_800, endsAt: at + PRODUCTION_SHOW_AT + 8_800, held: false });
  });

  it('T-AC-10: a real quiet month carries no events and no show', () => {
    const { view } = month(QUIET_MONTH);
    expect(view.events).toEqual([]);
    expect(view.eventShow).toBeNull();
  });

  it('T-AC-10: the show starts on the server clock at the table\'s pace; showMs and playMs stay at full pace', () => {
    const { seen } = playMonth(['drought', 'pestSwarm'], 0.1);
    const { view, at } = seen('production');
    expect(view.eventShow).toEqual({ startsAt: at + PRODUCTION_SHOW_AT * 0.1, showMs: 14_000, introMs: 1_800, endsAt: at + (PRODUCTION_SHOW_AT + 14_000) * 0.1, held: false });
    expect(view.events!.map((e) => e.playMs)).toEqual([7_000, 5_200]);
  });

  it('T-AC-10: when the cap bites, showMs is the cap and the intro and the shares add up to it', () => {
    const { seen } = playMonth(['dustStorm', 'drought', 'acidRain', 'solarFlare', 'flood']);
    const { view } = seen('production');
    expect(view.eventShow!.showMs).toBe(EVENT_SHOW.capMs);
    expect(view.eventShow!.introMs + view.events!.reduce((sum, e) => sum + e.playMs, 0)).toBe(EVENT_SHOW.capMs);
  });

  it('T-AC-10: a phase with no events carries none: production\'s events reach neither the phases before it nor the auction or the month end', () => {
    const { seen } = playMonth(['dustStorm']);
    expect(seen('production').view.events).toHaveLength(1);
    for (const phase of ['landGrant', 'development', 'auction', 'upkeep']) {
      expect({ phase, events: seen(phase).view.events, show: seen(phase).view.eventShow }).toEqual({ phase, events: [], show: null });
    }
  });

  it('T-AC-10: an event the auction fired is the auction\'s: listed when the auction opens, its show starting then, and not production\'s', () => {
    const { seen, length } = playMonth(['drought', 'pestSwarm'], 1, { pestSwarm: 'auction' });
    const production = seen('production').view;
    expect(production.events!.map(({ key, phase }) => ({ key, phase }))).toEqual([{ key: 'drought', phase: 'production' }]);
    expect(production.production!.events).toEqual(production.events);
    // Production stretches for its own drought only: 15 000 + (1 800 + 7 000 − 4 800).
    expect(length('production')).toBe(19_000);
    const auction = seen('auction');
    expect(auction.view.events!.map(({ key, phase, weight, playMs }) => ({ key, phase, weight, playMs }))).toEqual([
      { key: 'pestSwarm', phase: 'auction', weight: 'spotlight', playMs: 5_200 },
    ]);
    expect(auction.view.eventShow).toEqual({ startsAt: auction.at, showMs: 7_000, introMs: 1_800, endsAt: auction.at + 7_000, held: true });
  });

  it('T-AC-10: last month\'s report lends next month nothing: an event filed for planning in month 1 is not month 2\'s planning', () => {
    let game: MuleGame | null = null;
    const fake = fakeContext({});
    game = new MuleGame(fake.ctx, 7);
    game.start(seats);
    const state = (game as unknown as { state: GameState }).state;
    const push = state.history.push.bind(state.history);
    state.history.push = (...reports: MonthReport[]) => push(...reports.map((r) => ({ ...r, events: [event('drought', 'planning')] })));
    readyAll(game);
    for (let i = 0; i < 100_000 && game.viewFor(null).month < 2; i++) {
      if (game.viewFor(null).phase === 'upkeep') readyAll(game);
      fake.advance(100);
    }
    const view = game.viewFor(null);
    expect({ month: view.month, phase: view.phase }).toEqual({ month: 2, phase: 'planning' });
    expect(state.history.at(-1)!.events!.map((e) => e.phase)).toEqual(['planning']);
    expect(view.events).toEqual([]);
    expect(view.eventShow).toBeNull();
  });

  it('T-AC-10: the protocol\'s view fits the show\'s own shapes without a cast', () => {
    const { view } = month(TWO_EVENT_MONTH);
    // Compile-time contract: if EventView and the show's ShowEventView disagree, typecheck fails here.
    const one: EventView = view.events![0]!;
    const shown: ShowEventView = one;
    const listed: ShowEventView[] = view.events!;
    const timeline: ShowTimeline = { events: view.events!, introMs: view.eventShow!.introMs };
    expect(shown.key).toBe('cometPass');
    expect(listed).toHaveLength(2);
    expect(timeline.events).toBe(view.events);
  });
});
