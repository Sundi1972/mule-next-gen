import { DEV_STEER, EVENT_SHOW, EVENTS, productionEventAtMs, productionShowMs, type EventKey, type EventRow, type GameState, type MonthEvent, type MonthReport, type Phase } from '@mule/engine';
import type { EventView, MuleView, ProductionView } from '@mule/protocol';
import { beforeAll, describe, expect, it } from 'vitest';
// Types only, erased at run time: the show's own shapes, which @mule/ui keeps structural so it never imports the protocol.
import type { ShowEventView, ShowTimeline } from '../../../packages/ui/src/events/types.js';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, pressThroughSidePick, readyAll, seats } from './fake-context.js';

/**
 * Production's length at full pace, RULE-3 of ws6-ux AM-19: from the goods its plots made and its events' whole show
 * (intro and every play), as the server sets it. The numbers themselves are the engine's productionShow, pinned by
 * T-AC-14; these rows hold that the server plays a month's events within that length.
 */
function showLength(production: ProductionView): number {
  const goods = new Set(production.lines.map((l) => l.good)).size;
  const eventsMs = production.events.length > 0 ? production.introMs + production.events.reduce((n, e) => n + e.playMs, 0) : 0;
  return productionShowMs(goods, eventsMs);
}

/** Where production's events start, in ms into the phase at full pace: after the harvest, the bonuses and the losses. */
const eventsAt = (production: ProductionView) => productionEventAtMs(new Set(production.lines.map((l) => l.good)).size);

/** A month event of `key` that hit one plot; its words and shape don't matter to how long it plays. */
function event(key: EventKey, phase: Phase = 'production', over: Partial<MonthEvent> = {}): MonthEvent {
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
    ...over,
  };
}

/** A built month's two stories: the colony's comet pass, then a pest swarm on s2's land, as the engine files them. */
const cometPass = () => event('cometPass', 'production', { kind: 'comet', title: 'Comet pass', sign: 'good', direction: 'n', plots: [{ index: 3, order: 0, good: 'water', delta: 2 }] });
const pestSwarm = () => event('pestSwarm', 'production', { kind: 'blight', title: 'Pest swarm', scope: 'personal', player: 's2', plots: [{ index: 5, order: 0, good: 'food', delta: -2 }] });

/**
 * Plays month 1 on the fake clock until upkeep, with the production report's events replaced by `keys`' events in that
 * order (a key, or an event built in full), so a test can name a mix no seed is known to fire. Returns the first view each phase showed, read the moment
 * the phase was announced, and the clock then: phaseEndsAt − at is the length that phase was given.
 */
function playMonth(keys: (EventKey | MonthEvent)[], phaseScale = 1, phaseOf: Partial<Record<EventKey, Phase>> = {}) {
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
  const events = () => keys.map((k) => (typeof k === 'string' ? event(k, phaseOf[k]) : structuredClone(k)));
  state.history.push = (...reports: MonthReport[]) => push(...reports.map((r) => ({ ...r, events: events() })));
  readyAll(game);
  // A good's side pick has no clock (A-7): the humans press Ready there.
  for (let i = 0; i < 100_000 && !first.has('upkeep'); i++) {
    pressThroughSidePick(game);
    fake.advance(100);
  }
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

/** Each built month, played once for every block that reads it. */
const once = <T,>(play: () => T) => {
  let played: T | null = null;
  return () => (played ??= play());
};
const twoEvents = once(() => playMonth([cometPass(), pestSwarm()]));
const loneComet = once(() => playMonth([cometPass()]));
const quietMonth = once(() => playMonth([]));

/** Four seats: two humans who only press Ready, and two AIs, so the seeded game below plays the AIs' turns too. */
const fourSeats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Mia', isAi: false, color: 1 },
  { id: 's3', name: 'The Baron', isAi: true, color: 2 },
  { id: 's4', name: 'Vex', isAi: true, color: 3 },
];
/** Any seed: the invariants below hold whatever its months fire, so a rules change that moves what fires cannot break them. */
const INVARIANT_SEED = 3;
const INVARIANT_MONTHS = 3;

/**
 * Plays `seed` on the fake clock through production of `lastMonth`, humans pressing Ready where the game waits and
 * nothing else, the engine's reports untouched. Returns each month's production view and the clock the moment
 * production was announced.
 */
function playSeededMonths(seed: number, lastMonth: number) {
  const months: { view: MuleView; at: number }[] = [];
  let game: MuleGame | null = null;
  const fake = fakeContext({
    table: fourSeats,
    onChanged: (at) => {
      const view = game?.viewFor(null);
      if (view?.phase === 'production' && !months.some((m) => m.view.month === view.month)) months.push({ view, at });
    },
  });
  game = new MuleGame(fake.ctx, seed);
  game.start(fourSeats);
  for (let i = 0; i < 1_000_000 && !months.some((m) => m.view.month === lastMonth); i++) {
    const phase = game.viewFor(null).phase;
    if (phase === 'planning' || phase === 'upkeep') readyAll(game);
    pressThroughSidePick(game);
    fake.advance(100);
  }
  return months;
}

describe('the event show on built months: the view plays exactly the events the month filed', () => {
  it('T-AC-1, T-AC-2: a month firing a colony comet pass, then a personal pest swarm, runs production its show, the events 14 000 ms of it, each event its own share', () => {
    const { production, length } = twoEvents();
    expect(production.events.map(({ key, scope, phase, weight, playMs }) => ({ key, scope, phase, weight, playMs }))).toEqual([
      { key: 'cometPass', scope: 'colony', phase: 'production', weight: 'headline', playMs: 7_000 },
      { key: 'pestSwarm', scope: 'personal', phase: 'production', weight: 'spotlight', playMs: 5_200 },
    ]);
    // RULE-1: a 1 800 ms intro and 12 200 ms of stories make a 14 000 ms show, inside production's (AM-19 RULE-3).
    expect(production.introMs).toBe(1_800);
    expect(length('production')).toBe(showLength(production));
    expect(production.lengthMs).toBe(length('production'));
    expect(production.introMs + production.events.reduce((sum, e) => sum + e.playMs, 0)).toBe(14_000);
  });

  it('T-AC-1, T-AC-2: a month firing only a comet pass runs production its show, the comet a 7 000 ms headline', () => {
    const { production, length } = loneComet();
    expect(production.events.map(({ key, weight, playMs }) => ({ key, weight, playMs }))).toEqual([{ key: 'cometPass', weight: 'headline', playMs: 7_000 }]);
    expect(production.introMs).toBe(1_800);
    expect(length('production')).toBe(showLength(production));
    expect(production.lengthMs).toBe(length('production'));
  });

  it('T-AC-1, T-AC-2: a quiet month runs production its quiet show and lists no events', () => {
    const { production, length } = quietMonth();
    expect(production.events).toEqual([]);
    expect(production.introMs).toBe(0);
    expect(length('production')).toBe(showLength(production));
  });
});

describe('the event show on a seeded game: invariants that hold whatever its months fire', () => {
  let months: ReturnType<typeof playSeededMonths>;
  beforeAll(() => {
    months = playSeededMonths(INVARIANT_SEED, INVARIANT_MONTHS);
  }, 60_000);

  it('T-AC-1, T-AC-10: every production plays its events inside its show, in listed order, and a quiet one shows no event span', () => {
    expect(months.map((m) => m.view.month)).toEqual(Array.from({ length: INVARIANT_MONTHS }, (_, i) => i + 1));
    for (const { view, at } of months) {
      const production = view.production!;
      const month = view.month;
      expect({ month, length: view.phaseEndsAt! - at }).toEqual({ month, length: showLength(production) });
      expect({ month, events: view.events }).toEqual({ month, events: production.events });
      if (production.events.length === 0) {
        expect({ month, show: view.eventShow, introMs: production.introMs }).toEqual({ month, show: null, introMs: 0 });
        continue;
      }
      const show = view.eventShow!;
      // The shares sum to the events' span: the intro and every event's playMs make showMs, endsAt − startsAt.
      expect({ month, span: show.introMs + production.events.reduce((n, e) => n + e.playMs, 0) }).toEqual({ month, span: show.showMs });
      expect({ month, span: show.endsAt - show.startsAt, introMs: production.introMs }).toEqual({ month, span: show.showMs, introMs: show.introMs });
      // The show starts once every loss has landed, and ends inside production.
      expect({ month, startsAt: show.startsAt }).toEqual({ month, startsAt: at + eventsAt(production) });
      expect(show.endsAt, `month ${month}`).toBeLessThanOrEqual(view.phaseEndsAt!);
      // Each event starts where the one before it ended, in production's listed order: never before the last.
      let startsAt = show.startsAt + show.introMs;
      for (const e of production.events) {
        expect({ month, key: e.key, phase: e.phase, playMs: e.playMs >= 0 }).toEqual({ month, key: e.key, phase: 'production', playMs: true });
        expect(startsAt + e.playMs, `month ${month}: ${e.key}`).toBeLessThanOrEqual(show.endsAt);
        startsAt += e.playMs;
      }
      expect({ month, last: startsAt }).toEqual({ month, last: show.endsAt });
    }
  });
});

describe('the event show: production lasts long enough for every event, and the view says how long each plays', () => {
  // A lone dust storm plays the 1 800 ms intro and its 7 000 ms, past the 4 800 ms window, so it lasts 19 000 (spec AM-5).
  // The five headlines, and two headlines with three spotlights, hit the 30 000 ms cap: 29 600 of stories alone would
  // fit under it, so the second row caps only because the cap counts the intro.
  const capped: EventKey[] = ['drought', 'dustStorm', 'pestSwarm', 'wildfire', 'bumperHarvest'];
  it.each([
    { scale: 1, keys: [] as EventKey[] },
    { scale: 1, keys: ['dustStorm'] as EventKey[] },
    { scale: 1, keys: ['drought', 'pestSwarm'] as EventKey[] },
    { scale: 1, keys: ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'flood'] as EventKey[] },
    { scale: 1, keys: capped },
    { scale: 0.1, keys: [] as EventKey[] },
    { scale: 0.1, keys: ['dustStorm'] as EventKey[] },
    { scale: 0.1, keys: ['drought', 'pestSwarm'] as EventKey[] },
    { scale: 0.1, keys: ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'flood'] as EventKey[] },
    { scale: 0.1, keys: capped },
  ])('T-AC-1: at phaseScale $scale, a month with $keys runs production its whole show and the view says so', ({ scale, keys }) => {
    const { production, length } = playMonth(keys, scale);
    expect(length('production')).toBe(showLength(production) * scale);
    expect(production.lengthMs).toBe(showLength(production) * scale);
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
    expect(unknown.length('production')).toBe(showLength(unknown.production));
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

  it('T-AC-1: with headlines tuned to 0 ms, a lone dust storm plays 0 ms after its intro and production lasts its show with that intro', () => {
    const headlineMs = EVENT_SHOW.playMs.headline;
    EVENT_SHOW.playMs.headline = 0;
    try {
      const { production, length } = playMonth(['dustStorm']);
      expect(production.events.map((e) => e.playMs)).toEqual([0]);
      expect(production.introMs).toBe(1_800);
      expect(length('production')).toBe(showLength(production));
      expect(production.lengthMs).toBe(showLength(production));
    } finally {
      EVENT_SHOW.playMs.headline = headlineMs;
    }
  });

  it('T-AC-2: a quiet month lists no events and plays no intro', () => {
    const { production } = quietMonth();
    expect(production.events).toEqual([]);
    expect(production.introMs).toBe(0);
  });
});


describe('T-AC-10: the view carries the current phase\'s events, when their show starts and how long it plays', () => {
  it('T-AC-10: the view carries the phase\'s events with startsAt and showMs: a comet pass and pest swarm, as production lists them', () => {
    const { view, at } = twoEvents().seen('production');
    const production = view.production!;
    expect(view.events!.map(({ key, phase, weight, playMs }) => ({ key, phase, weight, playMs }))).toEqual([
      { key: 'cometPass', phase: 'production', weight: 'headline', playMs: 7_000 },
      { key: 'pestSwarm', phase: 'production', weight: 'spotlight', playMs: 5_200 },
    ]);
    // One shape for every phase: production's own list is the same list, field for field.
    expect(view.events).toEqual(production.events);
    // RULE-1: the 1 800 ms intro and 12 200 ms of stories; the intro starts once every loss has landed (AM-19 RULE-3).
    const from = eventsAt(production);
    expect(view.eventShow).toEqual({ startsAt: at + from, showMs: 14_000, introMs: 1_800, endsAt: at + from + 14_000, held: false });
    expect(view.eventShow!.startsAt).toBeLessThan(view.phaseEndsAt!);
  });

  it('T-AC-10: a personal event names the player whose land it started on; a colony event names nobody', () => {
    const { view } = twoEvents().seen('production');
    expect(view.events!.map(({ key, scope, player }) => ({ key, scope, player }))).toEqual([
      { key: 'cometPass', scope: 'colony', player: undefined },
      { key: 'pestSwarm', scope: 'personal', player: 's2' },
    ]);
    expect('player' in view.events![0]!).toBe(false);
  });

  it('T-AC-10: the view carries the phase\'s events with startsAt and showMs: a lone comet pass', () => {
    const { view, at } = loneComet().seen('production');
    expect(view.events).toEqual(view.production!.events);
    expect(view.events!.map((e) => e.key)).toEqual(['cometPass']);
    const from = eventsAt(view.production!);
    expect(view.eventShow).toEqual({ startsAt: at + from, showMs: 8_800, introMs: 1_800, endsAt: at + from + 8_800, held: false });
  });

  it('T-AC-10: a quiet month carries no events and no show', () => {
    const { view } = quietMonth().seen('production');
    expect(view.events).toEqual([]);
    expect(view.eventShow).toBeNull();
  });

  it('T-AC-10: the show starts on the server clock at the table\'s pace; showMs and playMs stay at full pace', () => {
    const { seen } = playMonth(['drought', 'pestSwarm'], 0.1);
    const { view, at } = seen('production');
    const from = eventsAt(view.production!);
    expect(view.eventShow).toEqual({ startsAt: at + Math.round(from * 0.1), showMs: 14_000, introMs: 1_800, endsAt: at + Math.round((from + 14_000) * 0.1), held: false });
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
    // Production lasts its show with its own drought only: 1 800 + 7 000 of events.
    expect(length('production')).toBe(productionShowMs(new Set(production.production!.lines.map((l) => l.good)).size, 8_800));
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
      pressThroughSidePick(game);
      fake.advance(100);
    }
    const view = game.viewFor(null);
    expect({ month: view.month, phase: view.phase }).toEqual({ month: 2, phase: 'planning' });
    expect(state.history.at(-1)!.events!.map((e) => e.phase)).toEqual(['planning']);
    expect(view.events).toEqual([]);
    expect(view.eventShow).toBeNull();
  });

  it('T-AC-10: the protocol\'s view fits the show\'s own shapes without a cast', () => {
    const { view } = twoEvents().seen('production');
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

/**
 * Plays month 1 to production with the cavern collapse and the drought certain and every other row silent: s1 mines a
 * crystal cavern for Crystite and s2 farms one, which the drought reaches. Returns each seat's view and the board's.
 */
function playCollapse() {
  const rows: EventRow[] = [...Object.values(EVENTS.colony), ...Object.values(EVENTS.player)];
  const saved = rows.map((row) => structuredClone(row));
  const firstMonth = EVENTS.firstMonth;
  try {
    for (const row of rows) row.phases = {};
    EVENTS.colony.cavernCollapse.phases = { production: 1 };
    EVENTS.colony.drought.phases = { production: 1 };
    EVENTS.firstMonth = 1;
    let game: MuleGame | null = null;
    const fake = fakeContext({});
    game = new MuleGame(fake.ctx, 7);
    game.start(seats);
    const state = (game as unknown as { state: GameState }).state;
    const land = state.tiles.filter((t) => t.terrain !== 'store' && !t.owner);
    const [mined, farmed] = ([['s1', 'crystite'], ['s2', 'food']] as const).map(([owner, outfit], i) => {
      const tile = land[i * 6]!;
      Object.assign(tile, { owner, outfit, traits: [], pollution: 0, special: { kind: 'crystalCavern' } });
      Object.assign(tile.ground, { crystite: 3, food: 3 });
      return { x: tile.x, y: tile.y };
    }) as [{ x: number; y: number }, { x: number; y: number }];
    for (const p of state.players) Object.assign(p.stock, { energy: 10, water: 10 });
    readyAll(game);
    for (let i = 0; i < 100_000 && game.viewFor(null).phase !== 'production'; i++) fake.advance(100);
    const views = [null, ...seats.map((s) => s.id)].map((id) => ({ id, view: game.viewFor(id) }));
    return { views, mined, farmed };
  } finally {
    rows.forEach((row, i) => {
      for (const key of Object.keys(row) as (keyof EventRow)[]) delete (row as Partial<EventRow>)[key];
      Object.assign(row, saved[i]!);
    });
    EVENTS.firstMonth = firstMonth;
  }
}

describe('T-AC-11: a cavern collapse tells every screen what the plot was and what it becomes', () => {
  it("T-AC-11: a cavern collapse's hit carries was 'crystalCavern' and becomes 'plain' in every seat's view and the board; a drought hit carries neither", () => {
    const { views, mined, farmed } = playCollapse();
    for (const { id, view } of views) {
      expect({ id, phase: view.phase }).toEqual({ id, phase: 'production' });
      const collapse = view.events!.find((e) => e.key === 'cavernCollapse' && e.hits.some((h) => h.x === mined.x && h.y === mined.y));
      expect(collapse?.hits, `${id}'s view`).toEqual([{ ...mined, order: 0, delta: 0, was: 'crystalCavern', becomes: 'plain' }]);
      expect(view.production!.events).toEqual(view.events);
      const drought = view.events!.find((e) => e.key === 'drought');
      expect(drought?.hits.some((h) => h.x === farmed.x && h.y === farmed.y), `${id}: the drought reaches the farmed cavern`).toBe(true);
      // A drought takes no MULE, so its hits name no good either.
      for (const hit of drought!.hits) expect(['was' in hit, 'becomes' in hit, 'good' in hit]).toEqual([false, false, false]);
    }
  });
});
