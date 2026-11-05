import { DEV_STEER, DEVELOPMENT, EVENT_SHOW, EVENTS, RuleError, WALK, type EventKey, type GameState, type MonthEvent, type MonthReport, type Phase } from '@mule/engine';
import type { MuleView } from '@mule/protocol';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// The client's own reading of a sick line: the reason crosses the seam as prose, so the two must agree.
import { sickBecause } from '../../../packages/ui/src/events/sick.js';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, pressThroughSidePick, readyAll, seats, toDevelopment } from './fake-context.js';

/** A month event of `key` that hit one plot; its words and shape don't matter to how long it plays. */
function event(key: EventKey, phase: Phase): MonthEvent {
  return { key, kind: 'storm', title: key, line: `${key} happens.`, scope: 'colony', origin: { x: 0, y: 0 }, plots: [{ index: 0, order: 0, good: 'food', delta: -1 }], sign: 'bad', phase };
}

/** The game's private engine state and AI seats, which a test reaches to arrange the month and to watch the hands. */
type Hand = (...args: unknown[]) => unknown;
type Inside = { state: GameState; ai: Map<string, { developSteer: Hand; auctionTick: Hand }> };

/**
 * Counts every call an AI seat's hand makes to `method` from now on: a hand that does not tick cannot press. A steered
 * development asks each AI hand for its stick inside the server's tick (developSteer); the auction ticks its hands.
 */
function countTicks(game: MuleGame, method: 'developSteer' | 'auctionTick'): () => number {
  let n = 0;
  for (const seat of (game as unknown as Inside).ai.values()) {
    const tick = seat[method].bind(seat);
    seat[method] = (...args: unknown[]) => {
      n++;
      return tick(...args);
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

/** A human's move in a steered development (arcade C15): a push on the stick. Taps are refused while it steers. */
const STICK = { type: 'steer', x: 1, y: 0 } as const;

function whereIs(game: MuleGame, seatId: string): { x: number | undefined; y: number | undefined } {
  const c = game.viewFor(null).players.find((p) => p.id === seatId)!.colonist!;
  return { x: c.x, y: c.y };
}

/** The stick applies: one development tick later the colonist stands somewhere else. */
function movesOnStick(game: MuleGame, advance: (ms: number) => void, seatId: string): void {
  const before = whereIs(game, seatId);
  game.handle(seatId, STICK);
  advance(DEV_STEER.tickMs);
  expect(whereIs(game, seatId)).not.toEqual(before);
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
function sickAt(sick: string[], options: { phaseScale?: number; claimer?: string; prepare?: (state: GameState) => void } = {}) {
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

  it('T-AC-10: the phone reads each reason back out of the server\'s line, as the sick player\'s "Why:"', () => {
    const why = (prepare: (state: GameState) => void) => sickBecause(sickAt(['s2'], { prepare }).game.viewFor(null).events![0]!.line);
    expect(why(() => {})).toBe('bad luck');
    expect(why((state) => (state.air = 40))).toBe('the air is bad');
    expect(why((state) => state.history.push({ month: 0, events: [], before: {}, produced: {}, pollutionBy: { s2: 20 } } as unknown as MonthReport))).toBe('their plots foul the air');
  });

  it('T-AC-10: a player still sick from before is not listed: not after development, and not in a development where nobody fell sick', () => {
    const { game, state, advance } = sickAt(['s1']);
    expect(game.viewFor(null).events).toHaveLength(1);
    // The roll is over; month 2's development rolls again, and this time nobody falls sick.
    nobodyRollsSick();
    for (let i = 0; i < 100_000 && !(state.month === 2 && state.phase === 'development'); i++) {
      const phase = game.viewFor(null).phase;
      if (phase === 'planning' || phase === 'upkeep') readyAll(game);
      pressThroughSidePick(game);
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
  // These rows read development's own clock, met in month 1: it runs from the hold's end.

  it('T-AC-7: during development\'s roll call an AI hand does not tick and a human\'s move is refused; after it both apply', () => {
    const { game, ctx, advance } = sickAt(['s1']);
    const ticks = countTicks(game, 'developSteer');
    const show = game.viewFor(null).eventShow!;
    const heldUntil = show.startsAt + show.showMs;
    expect(ctx.now()).toBeLessThan(heldUntil);
    expectHeld(() => game.handle('s2', STICK));
    expectHeld(() => game.handle('s2', { type: 'act' }));
    advance(heldUntil - 1 - ctx.now());
    expect(ticks()).toBe(0);
    expectHeld(() => game.handle('s2', STICK));
    // The clock starts when the show ends: development's whole time is still ahead.
    advance(1);
    expect(game.viewFor(null).phaseEndsAt).toBe(heldUntil + DEVELOPMENT.fullSeconds * 1_000);
    movesOnStick(game, advance, 's2');
    advance(DEV_STEER.tickMs);
    expect(ticks()).toBeGreaterThan(0);
  });

  it('T-AC-7: phones dropped during the roll call do not end development before it starts, and are not forgotten when it does', () => {
    const { game, ctx, advance } = sickAt(['s1']);
    const { endsAt } = game.viewFor(null).eventShow!;
    game.connectionChanged('s1', false);
    game.connectionChanged('s2', false);
    advance(100);
    expect(game.viewFor(null).phase).toBe('development');
    // Every human is away when the show ends. Steered, development still waits for the AI colonist walking its turn
    // (98c6b1db): it does not end at the show's end, and its clock runs from there. The humans are not waited for, so
    // it is over by that clock at the latest.
    advance(endsAt - ctx.now());
    const endsBy = game.viewFor(null).phaseEndsAt;
    expect({ phase: game.viewFor(null).phase, endsBy }).toEqual({ phase: 'development', endsBy: endsAt + DEVELOPMENT.fullSeconds * 1_000 });
    advance(endsBy! - ctx.now());
    expect(game.viewFor(null).phase).not.toBe('development');
  });

  it('T-AC-7: a game disposed during the roll call starts nothing when the show would have ended', () => {
    const { game, ctx, advance } = sickAt(['s1']);
    const ticks = countTicks(game, 'developSteer');
    let changed = 0;
    ctx.changed = () => changed++;
    const { endsAt } = game.viewFor(null).eventShow!;
    game.dispose();
    advance(endsAt - ctx.now() + DEV_STEER.tickMs * 3);
    expect({ ticks: ticks(), phaseEndsAt: game.viewFor(null).phaseEndsAt, changed }).toEqual({ ticks: 0, phaseEndsAt: null, changed: 0 });
  });

  it('T-AC-7: at phaseScale 0.1 the hold lasts the show at the table\'s pace; showMs stays at full pace', () => {
    const { game, ctx, advance } = sickAt(['s1'], { phaseScale: 0.1 });
    const show = game.viewFor(null).eventShow!;
    expect(show.showMs).toBe(5_800);
    expect(show.endsAt).toBe(show.startsAt + 580);
    advance(show.endsAt - 1 - ctx.now());
    expectHeld(() => game.handle('s2', STICK));
    advance(1);
    expect(game.viewFor(null).phaseEndsAt).toBe(show.endsAt + DEVELOPMENT.fullSeconds * 100);
    movesOnStick(game, advance, 's2');
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
  for (let i = 0; i < 100_000 && enteredAt === null; i++) {
    pressThroughSidePick(game);
    fake.advance(100);
  }
  if (enteredAt === null) throw new Error(`month 1 never reached ${target}`);
  return { game, state, enteredAt: enteredAt as number, ...fake };
}

describe('T-AC-7, T-AC-8: an auction that fired events opens only when their show is over (C9)', () => {
  beforeEach(nobodyRollsSick);

  it('T-AC-7: during an auction event\'s show an AI hand does not tick and a human\'s side is refused; after it the same press applies', () => {
    const { game, ctx, advance, enteredAt } = toPhase('auction', ['pestSwarm'], { pestSwarm: 'auction' });
    const ticks = countTicks(game, 'auctionTick');
    const show = game.viewFor(null).eventShow!;
    expect(show).toEqual({ startsAt: enteredAt, showMs: 7_000, introMs: 1_800, endsAt: enteredAt + 7_000, held: true });
    // A side is a declare like any other: switching to Sell is held, then applies (everyone holds some here).
    const state = (game as unknown as { state: GameState }).state;
    state.players.find((p) => p.id === 's1')!.stock[state.auction!.good!] = 5;
    expectHeld(() => game.handle('s1', { type: 'declare', side: 'seller' }));
    advance(show.endsAt - 1 - ctx.now());
    expectHeld(() => game.handle('s1', { type: 'declare', side: 'seller' }));
    expect(ticks()).toBe(0);
    advance(1);
    game.handle('s1', { type: 'declare', side: 'seller' });
    expect(game.viewFor(null).auction!.walkers.find((w) => w.id === 's1')!.side).toBe('seller');
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
    game.handle('s1', { type: 'declare', side: 'buyer' });
    advance(WALK.tickMs);
    expect(ticks()).toBeGreaterThan(0);
  });
});

describe('T-AC-8: an untimed phase and a phase without events are not held (RULE-4 rows 1, 2)', () => {
  // Development's own clock, met in month 1: it runs from entry.

  it('T-AC-8: development with nobody sick starts at once: its clock runs from entry and a move applies', () => {
    nobodyRollsSick();
    const { game, enteredAt, ctx, advance } = toPhase('development', []);
    expect(game.viewFor(null).events).toEqual([]);
    expect(game.viewFor(null).eventShow).toBeNull();
    expect(game.viewFor(null).phaseEndsAt).toBe(enteredAt + DEVELOPMENT.fullSeconds * 1_000);
    expect(ctx.now()).toBe(enteredAt);
    const ticks = countTicks(game, 'developSteer');
    movesOnStick(game, advance, 's1');
    advance(DEV_STEER.tickMs);
    expect(ticks()).toBeGreaterThan(0);
  });

  it('T-AC-8: planning is not held: its events play while people press Ready, and Ready moves the month on', () => {
    nobodyRollsSick();
    const { game, advance } = toPhase('upkeep', []);
    // Month 2's planning fires a Federation tax for certain: a headline of its own.
    const tax = EVENTS.colony.federationTax;
    const was = { phases: { ...tax.phases }, cap: tax.cap };
    Object.assign(tax, { phases: { planning: 1 }, cap: 1 });
    try {
      readyAll(game);
      advance(1);
    } finally {
      Object.assign(tax, was);
    }
    const view: MuleView = game.viewFor(null);
    expect({ month: view.month, phase: view.phase }).toEqual({ month: 2, phase: 'planning' });
    expect(view.events!.map((e) => e.key)).toEqual(['federationTax']);
    expect(view.eventShow).toMatchObject({ showMs: 8_800, held: false });
    readyAll(game);
    expect(game.viewFor(null).phase).not.toBe('planning');
  });

  it('T-AC-8: the view says whether the server holds the phase for its show: development\'s roll call is held, the month end (no clock) is not', () => {
    const sick = sickAt(['s1']);
    expect(sick.game.viewFor(null).eventShow).toMatchObject({ held: true });
    expectHeld(() => sick.game.handle('s2', STICK));
    nobodyRollsSick();
    const { game } = toPhase('upkeep', ['drought'], { drought: 'upkeep' });
    expect(game.viewFor(null).eventShow).toMatchObject({ showMs: 8_800, held: false });
    game.handle('s1', { type: 'ready' });
  });
});

describe('T-AC-10: eventShow.endsAt is where the show ends on the server clock, at the table\'s pace', () => {
  it.each([1, 0.1])('T-AC-10: at phaseScale %s, an auction show of 7 000 ms ends at startsAt + 7 000 × scale', (scale) => {
    nobodyRollsSick();
    const { game, enteredAt } = toPhase('auction', ['pestSwarm'], { pestSwarm: 'auction' }, scale);
    expect(game.viewFor(null).eventShow).toEqual({ startsAt: enteredAt, showMs: 7_000, introMs: 1_800, endsAt: enteredAt + Math.round(7_000 * scale), held: true });
  });
});
