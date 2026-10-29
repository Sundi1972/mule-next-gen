import { DEVELOPMENT, EVENT_SHOW, EVENTS, RuleError, WALK, type EventKey, type GameState, type MonthEvent, type MonthReport, type Phase } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AI_DEV_TICK_MS, MuleGame } from '../src/mule-game.js';
import { fakeContext, readyAll, seats, toDevelopment } from './fake-context.js';

/** A month event of `key` that hit one plot; its words and shape don't matter to how long it plays. */
function event(key: EventKey, phase: Phase): MonthEvent {
  return { key, kind: 'storm', title: key, line: `${key} happens.`, scope: 'colony', origin: { x: 0, y: 0 }, plots: [{ index: 0, order: 0, good: 'food', delta: -1 }], sign: 'bad', phase };
}

/** The game's private engine state and AI seats, which a test reaches to arrange the month and to watch the hands. */
type Inside = { state: GameState; ai: Map<string, { developTick: (...args: unknown[]) => void; auctionTick: (...args: unknown[]) => void }> };

/** Counts every call an AI seat's hand makes to `method` from now on: a hand that does not tick cannot press. */
function countTicks(game: MuleGame, method: 'developTick' | 'auctionTick'): () => number {
  let n = 0;
  for (const seat of (game as unknown as Inside).ai.values()) {
    const tick = seat[method].bind(seat);
    seat[method] = (...args: unknown[]) => {
      n++;
      tick(...args);
    };
  }
  return () => n;
}

/** Expects `press` to be refused because the show is still on. */
function expectHeld(press: () => void): void {
  let refused: unknown = null;
  try {
    press();
  } catch (err) {
    refused = err;
  }
  expect(refused).toBeInstanceOf(RuleError);
  expect((refused as Error).message).toBe('The event is still playing');
}

/** The store's tile, where every colonist starts development: a sick bulletin's origin. */
function storeAt(state: GameState): { x: number; y: number } {
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  return { x: store.x, y: store.y };
}

/**
 * Forces the development sickness roll to hit every player for the test, so who falls sick is decided by who holds a
 * Medicine (it cures the roll), not by a seed. Restored after each test.
 */
const sickness = EVENTS.player.sickness;
const saved = { phases: { ...sickness.phases }, cap: sickness.cap };
function everyoneRollsSick(): void {
  sickness.phases.development = 1;
  sickness.cap = 1;
}
function nobodyRollsSick(): void {
  sickness.phases.development = 0;
  sickness.cap = 0;
}
afterEach(() => {
  sickness.phases.development = saved.phases.development;
  sickness.cap = saved.cap;
});

/** Month 1 into development with the seats in `sick` falling sick and the others cured by a Medicine. */
function sickAt(sick: string[], options: { phaseScale?: number; prepare?: (state: GameState) => void } = {}) {
  everyoneRollsSick();
  return toDevelopment({
    ...options,
    prepare: (state) => {
      for (const p of state.players) p.stock.medicine = sick.includes(p.id) ? 0 : 1;
      options.prepare?.(state);
    },
  });
}

describe('T-AC-10: development lists the players who fell sick at its start as bulletins of one roll call (C11)', () => {
  it('T-AC-10: one sick player is one bulletin playing the whole 4 000 ms roll call, with its reason line', () => {
    const { game, state } = sickAt(['s1']);
    const view = game.viewFor(null);
    expect(view.events).toEqual([
      {
        key: 'sickness',
        kind: 'sickness',
        title: 'Sickness',
        line: 'Heiko fell sick: bad luck.',
        sign: 'bad',
        scope: 'personal',
        player: 's1',
        origin: storeAt(state),
        hits: [],
        phase: 'development',
        weight: 'bulletin',
        playMs: EVENT_SHOW.rollCallMs,
      },
    ]);
    expect(view.eventShow).toMatchObject({ showMs: EVENT_SHOW.introMs + EVENT_SHOW.rollCallMs, introMs: EVENT_SHOW.introMs });
  });

  it('T-AC-10: two or three sick players share the one roll call in seat order, rounded on the running total; the show counts it once', () => {
    const { game } = sickAt(['s2', 's1']);
    const view = game.viewFor(null);
    expect(view.events!.map(({ player, weight, playMs }) => ({ player, weight, playMs }))).toEqual([
      { player: 's1', weight: 'bulletin', playMs: 2_000 },
      { player: 's2', weight: 'bulletin', playMs: 2_000 },
    ]);
    expect(view.eventShow).toMatchObject({ showMs: 5_800, introMs: 1_800 });
    // 4 000 / 3 rounded on the running total: 1 333, 2 667, 4 000.
    const three = sickAt(['s3', 's1', 's2']).game.viewFor(null);
    expect(three.events!.map(({ player, playMs }) => ({ player, playMs }))).toEqual([
      { player: 's1', playMs: 1_333 },
      { player: 's2', playMs: 1_334 },
      { player: 's3', playMs: 1_333 },
    ]);
    expect(three.events!.reduce((sum, e) => sum + e.playMs, 0)).toBe(EVENT_SHOW.rollCallMs);
    expect(three.eventShow).toMatchObject({ showMs: 5_800, introMs: 1_800 });
  });

  it('T-AC-10: the line says why: bad air, the player\'s own pollution, or bad luck', () => {
    const line = (prepare: (state: GameState) => void) => sickAt(['s2'], { prepare }).game.viewFor(null).events![0]!.line;
    expect(line(() => {})).toBe('Mia fell sick: bad luck.');
    expect(line((state) => (state.air = 40))).toBe('Mia fell sick: the air is bad.');
    // Last month's report says how much air Mia's plots fouled; this month has no report of its own yet.
    expect(line((state) => state.history.push({ month: 0, events: [], before: {}, produced: {}, pollutionBy: { s2: 20 } } as unknown as MonthReport))).toBe('Mia fell sick: their plots foul the air.');
  });

  it('T-AC-10: a player still sick from before is not listed: not after development, and not in a development where nobody fell sick', () => {
    const { game, state, advance } = sickAt(['s1']);
    expect(game.viewFor(null).events).toHaveLength(1);
    // The roll is over; month 2's development rolls again, and this time nobody falls sick.
    nobodyRollsSick();
    for (let i = 0; i < 100_000 && !(state.month === 2 && state.phase === 'development'); i++) {
      const phase = game.viewFor(null).phase;
      if (phase === 'planning' || phase === 'upkeep') readyAll(game);
      advance(100);
      // Heiko's sickness stays on his player until the next roll; no later phase of month 1 lists it.
      if (state.month === 1 && state.phase !== 'development') {
        expect(state.players[0]!.sick).toBe(true);
        expect({ phase: state.phase, events: game.viewFor(null).events }).toEqual({ phase: state.phase, events: [] });
      }
    }
    expect({ month: state.month, phase: state.phase }).toEqual({ month: 2, phase: 'development' });
    expect(game.viewFor(null).events).toEqual([]);
    expect(game.viewFor(null).eventShow).toBeNull();
  });
});

describe('T-AC-7: nobody acts while a timed phase\'s events play; the same press applies after the hold (C9, RULE-4 row 3)', () => {
  it('T-AC-7: during development\'s roll call an AI hand does not tick and a human\'s move is refused; after it both apply', () => {
    const { game, ctx, advance } = sickAt(['s1']);
    const ticks = countTicks(game, 'developTick');
    const show = game.viewFor(null).eventShow!;
    const heldUntil = show.startsAt + show.showMs;
    expect(ctx.now()).toBeLessThan(heldUntil);
    expectHeld(() => game.handle('s2', { type: 'buyMule' }));
    expectHeld(() => game.handle('s2', { type: 'pub' }));
    advance(heldUntil - 1 - ctx.now());
    expect(ticks()).toBe(0);
    expectHeld(() => game.handle('s2', { type: 'buyMule' }));
    // The clock starts when the show ends: development's whole time is still ahead.
    advance(1);
    expect(game.viewFor(null).phaseEndsAt).toBe(heldUntil + DEVELOPMENT.fullSeconds * 1_000);
    game.handle('s2', { type: 'buyMule' });
    expect(game.viewFor(null).players.find((p) => p.id === 's2')!.colonist!.walk).not.toBeNull();
    advance(AI_DEV_TICK_MS);
    expect(ticks()).toBeGreaterThan(0);
  });

  it('T-AC-7: phones dropped during the roll call do not end development before it starts, and are not forgotten when it does', () => {
    const { game, ctx, advance } = sickAt(['s1']);
    const { endsAt } = game.viewFor(null).eventShow!;
    game.connectionChanged('s1', false);
    game.connectionChanged('s2', false);
    advance(100);
    expect(game.viewFor(null).phase).toBe('development');
    // Every human is away when the show ends: nobody is waited for, so development ends then, not on its full clock.
    advance(endsAt - ctx.now());
    expect(game.viewFor(null).phase).not.toBe('development');
  });

  it('T-AC-7: a game disposed during the roll call starts nothing when the show would have ended', () => {
    const { game, ctx, advance } = sickAt(['s1']);
    const ticks = countTicks(game, 'developTick');
    let changed = 0;
    ctx.changed = () => changed++;
    const { endsAt } = game.viewFor(null).eventShow!;
    game.dispose();
    advance(endsAt - ctx.now() + AI_DEV_TICK_MS * 3);
    expect({ ticks: ticks(), phaseEndsAt: game.viewFor(null).phaseEndsAt, changed }).toEqual({ ticks: 0, phaseEndsAt: null, changed: 0 });
  });

  it('T-AC-7: at phaseScale 0.1 the hold lasts the show at the table\'s pace; showMs stays at full pace', () => {
    const { game, ctx, advance } = sickAt(['s1'], { phaseScale: 0.1 });
    const show = game.viewFor(null).eventShow!;
    expect(show.showMs).toBe(5_800);
    expect(show.endsAt).toBe(show.startsAt + 580);
    advance(show.endsAt - 1 - ctx.now());
    expectHeld(() => game.handle('s2', { type: 'buyMule' }));
    advance(1);
    expect(game.viewFor(null).phaseEndsAt).toBe(show.endsAt + DEVELOPMENT.fullSeconds * 100);
    game.handle('s2', { type: 'buyMule' });
  });
});

/**
 * Plays month 1 on the fake clock up to the moment `target` is entered, with the production report's events replaced
 * by `keys`' events, each filed for the phase `phaseOf` names (production by default). Returns the game there.
 */
function toPhase(target: Phase, keys: EventKey[], phaseOf: Partial<Record<EventKey, Phase>> = {}, phaseScale = 1) {
  let game: MuleGame | null = null;
  let enteredAt: number | null = null;
  const fake = fakeContext({
    onChanged: (at) => {
      if (enteredAt === null && game?.viewFor(null).phase === target) enteredAt = at;
    },
  });
  game = new MuleGame(fake.ctx, 7, { phaseScale });
  game.start(seats);
  const state = (game as unknown as Inside).state;
  const push = state.history.push.bind(state.history);
  state.history.push = (...reports: MonthReport[]) => push(...reports.map((r) => ({ ...r, events: keys.map((k) => event(k, phaseOf[k] ?? 'production')) })));
  readyAll(game);
  for (let i = 0; i < 100_000 && enteredAt === null; i++) fake.advance(100);
  if (enteredAt === null) throw new Error(`month 1 never reached ${target}`);
  return { game, state, enteredAt: enteredAt as number, ...fake };
}

describe('T-AC-7, T-AC-8: an auction that fired events opens only when their show is over (C9)', () => {
  beforeEach(nobodyRollsSick);

  it('T-AC-7: during an auction event\'s show an AI hand does not tick and a human\'s side is refused; after it the same press applies', () => {
    const { game, ctx, advance, enteredAt } = toPhase('auction', ['pestSwarm'], { pestSwarm: 'auction' });
    const ticks = countTicks(game, 'auctionTick');
    const show = game.viewFor(null).eventShow!;
    expect(show).toEqual({ startsAt: enteredAt, showMs: 7_000, introMs: 1_800, endsAt: enteredAt + 7_000 });
    expectHeld(() => game.handle('s1', { type: 'declare', side: 'pass' }));
    advance(show.endsAt - 1 - ctx.now());
    expectHeld(() => game.handle('s1', { type: 'declare', side: 'pass' }));
    expect(ticks()).toBe(0);
    advance(1);
    game.handle('s1', { type: 'declare', side: 'pass' });
    expect(game.viewFor(null).auction!.walkers.find((w) => w.id === 's1')!.side).toBe('pass');
    advance(WALK.tickMs);
    expect(ticks()).toBeGreaterThan(0);
  });

  it('T-AC-8: five headlines in the auction hold it only the cap, 30 000 ms', () => {
    const five: EventKey[] = ['dustStorm', 'drought', 'acidRain', 'solarFlare', 'flood'];
    const { game, ctx, advance, enteredAt } = toPhase('auction', five, Object.fromEntries(five.map((k) => [k, 'auction'])));
    expect(game.viewFor(null).eventShow).toMatchObject({ showMs: EVENT_SHOW.capMs, endsAt: enteredAt + EVENT_SHOW.capMs });
    advance(enteredAt + EVENT_SHOW.capMs - 1 - ctx.now());
    expectHeld(() => game.handle('s1', { type: 'ready' }));
    advance(1);
    game.handle('s1', { type: 'ready' });
  });

  it('T-AC-8: an auction with no events opens at once: the first AI tick comes one tick after it opens', () => {
    const { game, advance } = toPhase('auction', []);
    const ticks = countTicks(game, 'auctionTick');
    expect(game.viewFor(null).eventShow).toBeNull();
    game.handle('s1', { type: 'declare', side: 'pass' });
    advance(WALK.tickMs);
    expect(ticks()).toBeGreaterThan(0);
  });
});

describe('T-AC-8: an untimed phase and a phase without events are not held (RULE-4 rows 1, 2)', () => {
  it('T-AC-8: development with nobody sick starts at once: its clock runs from entry and a move applies', () => {
    nobodyRollsSick();
    const { game, enteredAt, ctx, advance } = toPhase('development', []);
    expect(game.viewFor(null).events).toEqual([]);
    expect(game.viewFor(null).eventShow).toBeNull();
    expect(game.viewFor(null).phaseEndsAt).toBe(enteredAt + DEVELOPMENT.fullSeconds * 1_000);
    expect(ctx.now()).toBe(enteredAt);
    const ticks = countTicks(game, 'developTick');
    game.handle('s1', { type: 'buyMule' });
    advance(AI_DEV_TICK_MS);
    expect(ticks()).toBeGreaterThan(0);
  });

  it('T-AC-8: planning is not held: its events play while people press Ready, and Ready moves the month on', () => {
    nobodyRollsSick();
    const { game, state, advance } = toPhase('upkeep', []);
    // Month 1's report stands in for a report month 2's planning fired an event into: no planning event fires today.
    const report = state.history.at(-1)!;
    report.month = 2;
    report.events = [event('drought', 'planning')];
    readyAll(game);
    advance(1);
    const view: MuleView = game.viewFor(null);
    expect({ month: view.month, phase: view.phase }).toEqual({ month: 2, phase: 'planning' });
    expect(view.eventShow).toMatchObject({ showMs: 8_800 });
    readyAll(game);
    expect(game.viewFor(null).phase).not.toBe('planning');
  });
});

describe('T-AC-10: eventShow.endsAt is where the show ends on the server clock, at the table\'s pace', () => {
  it.each([1, 0.1])('T-AC-10: at phaseScale %s, an auction show of 7 000 ms ends at startsAt + 7 000 × scale', (scale) => {
    nobodyRollsSick();
    const { game, enteredAt } = toPhase('auction', ['pestSwarm'], { pestSwarm: 'auction' }, scale);
    expect(game.viewFor(null).eventShow).toEqual({ startsAt: enteredAt, showMs: 7_000, introMs: 1_800, endsAt: enteredAt + Math.round(7_000 * scale) });
  });
});
