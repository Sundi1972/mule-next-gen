import { describe, expect, it } from 'vitest';
import { PHASES, WALK } from '@mule/engine';
import { GRANT_TICK_MS, MuleGame, PHASE_MS } from '../src/mule-game.js';
import { fakeContext, pressThroughSidePick, readyAll, seats, throughSidePicks } from './fake-context.js';

type Options = ConstructorParameters<typeof MuleGame>[2];

function started(options?: Options) {
  const fake = fakeContext();
  const game = new MuleGame(fake.ctx, 7, options);
  game.start(seats);
  return { game, ...fake };
}

/** Plays the given game through planning (everyone Ready) and the land grant, on its own clocks. */
function toDevelopment(options?: Options) {
  const g = started(options);
  readyAll(g.game);
  while (g.game.viewFor('s1').phase === 'landGrant') g.advance(GRANT_TICK_MS);
  expect(g.game.viewFor('s1').phase).toBe('development');
  return g;
}

/** Plays on until production opens; the clock stops on the step that opened it, so its timer starts at ctx.now(). */
function toProduction(options?: Options) {
  const g = toDevelopment(options);
  const step = 100;
  while (g.game.viewFor('s1').phase === 'development') g.advance(step);
  expect(g.game.viewFor('s1').phase).toBe('production');
  return g;
}

/** Plays on until the auction's status screen is up, before its first tick. It has no clock (A-7). */
function toAuction(options?: Options) {
  const g = toDevelopment(options);
  while (g.game.viewFor('s1').phase === 'development' || g.game.viewFor('s1').phase === 'production') g.advance(100);
  const auction = g.game.viewFor(null).auction!;
  expect(auction.stage).toBe('status');
  expect(auction.seconds).toBe(0);
  return g;
}

/**
 * Plays on until the first good's walk has just started, its clock full: both humans press Ready at the side pick and
 * the AI presses Done by itself. Retargets the status-clock rows below to the walk's clock, the auction's one clock
 * since A-7.
 */
function toWalk(options?: Options) {
  const g = toAuction(options);
  const good = g.game.viewFor(null).auction!.good;
  for (let i = 0; i < 1_000 && g.game.viewFor(null).auction?.stage === 'status'; i++) {
    pressThroughSidePick(g.game);
    g.advance(WALK.tickMs);
  }
  expect(g.game.viewFor(null).auction).toMatchObject({ good, stage: 'walk', seconds: WALK.goodMs / 1_000 });
  return g;
}

describe('phaseScale and maxMonths', () => {
  it('T-AC-2: with no options, production waits its full PHASES.productionMs and the game runs 12 months', () => {
    const { game, waits, advance, ctx } = toProduction();
    expect(waits).toContain(PHASES.productionMs);
    expect(game.viewFor(null).phaseEndsAt).toBe(ctx.now() + PHASES.productionMs);
    expect(game.viewFor(null).maxMonths).toBe(12);
    advance(PHASES.productionMs - 1);
    expect(game.viewFor(null).phase).toBe('production');
    advance(1);
    expect(game.viewFor(null).phase).not.toBe('production');
  });

  it('T-AC-2: phaseScale 0.1 makes production wait a tenth of PHASES.productionMs; the land grant keeps its real tick', () => {
    const g = started({ phaseScale: 0.1 });
    readyAll(g.game);
    // The land grant's light keeps its real pace, so AI thumbs can still beat it.
    expect(g.game.viewFor(null).phase).toBe('landGrant');
    expect(g.waits.at(-1)).toBe(GRANT_TICK_MS);
    const { game, waits, advance, ctx } = toProduction({ phaseScale: 0.1 });
    expect(waits).toContain(PHASES.productionMs * 0.1);
    expect(game.viewFor(null).phaseEndsAt).toBe(ctx.now() + PHASES.productionMs * 0.1);
    advance(PHASES.productionMs * 0.1 - 1);
    expect(game.viewFor(null).phase).toBe('production');
    advance(1);
    expect(game.viewFor(null).phase).not.toBe('production');
  });

  it.each([
    [undefined, 1_000],
    [1, 1_000],
    [0.1, 100],
  ])('T-AC-2: with phaseScale %s each development second lasts %i ms, on devEndsAt and the clock', (phaseScale, msPerSecond) => {
    const { game, ctx, waits } = toDevelopment(phaseScale === undefined ? undefined : { phaseScale });
    const view = game.viewFor('s1');
    const now = ctx.now();
    expect(view.me!.devEndsAt! - now).toBeCloseTo(view.me!.devSeconds * msPerSecond, 6);
    expect(view.phaseEndsAt! - now).toBeCloseTo(PHASE_MS.development * (phaseScale ?? 1), 6);
    expect(view.phaseEndsAt, 'the one development clock is the phase clock').toBe(view.me!.devEndsAt);
    // The one clock is checked the moment it runs out.
    expect(waits).toContainEqual(expect.closeTo(view.me!.devSeconds * msPerSecond, 6));
  });

  // The walk's clock is the auction's one clock since the side pick lost its own (A-7): the first row measures the
  // scaling there; the second says the side pick has no clock at any phaseScale.
  it.each([[undefined], [1], [0.1]])('T-AC-2: with phaseScale %s the auction walk clock runs tick / phaseScale, clamped for a stall before scaling', (phaseScale) => {
    const opts = phaseScale === undefined ? undefined : { phaseScale };
    const scale = phaseScale ?? 1;
    // Game seconds left on the walk after one tick, and after a 1 s stall clamped to three ticks.
    const afterTick = (WALK.goodMs - WALK.tickMs / scale) / 1_000;
    const afterStall = (WALK.goodMs - (WALK.tickMs * 3) / scale) / 1_000;
    const ticked = toWalk(opts);
    ticked.advance(WALK.tickMs);
    expect(ticked.game.viewFor(null).auction!.seconds).toBeCloseTo(afterTick, 6);

    const stalled = toWalk(opts);
    stalled.advance(1_000);
    expect(stalled.game.viewFor(null).auction!.seconds).toBeCloseTo(afterStall, 6);
  });

  it('T-AC-2 (A-7): under phaseScale 0.1 the side pick still has no clock: ten times the 8 s it once ran, it waits', () => {
    const { game, advance } = toAuction({ phaseScale: 0.1 });
    const good = game.viewFor(null).auction!.good;
    for (let t = 0; t < 80_000; t += WALK.tickMs) advance(WALK.tickMs);
    expect(game.viewFor(null).auction).toMatchObject({ good, stage: 'status', seconds: 0 });
  });

  it("T-AC-6: a production length set mid-production waits for the next production: this one's view keeps the length its timer was given, through upkeep", () => {
    const g = toDevelopment();
    while (g.game.viewFor(null).phase === 'development') g.advance(100);
    expect(g.game.viewFor(null).phase).toBe('production');
    const timer = g.game.viewFor(null).phaseEndsAt! - g.ctx.now();
    const saved = PHASES.productionMs;
    try {
      PHASES.productionMs = saved * 3;
      for (const viewer of ['s1', null]) expect(g.game.viewFor(viewer).production!.lengthMs, `seen by ${viewer ?? 'the TV'}`).toBe(timer);
      g.advance(timer - 1);
      expect(g.game.viewFor(null).phase).toBe('production');
      g.advance(1);
      expect(g.game.viewFor(null).phase).toBe('auction');
      const advance = throughSidePicks(g.game, g.advance);
      while (g.game.viewFor(null).phase === 'auction') advance(WALK.tickMs);
      expect(g.game.viewFor(null).phase).toBe('upkeep');
      expect(g.game.viewFor(null).production!.lengthMs, "upkeep still shows this month's show at its length").toBe(timer);
    } finally {
      PHASES.productionMs = saved;
    }
  });

  it('T-AC-6: production lasts 15 s (scaled by phaseScale, and the view says so) and ends early when all are ready', () => {
    const toProduction = () => {
      const g = toDevelopment();
      while (g.game.viewFor(null).phase === 'development') g.advance(100);
      expect(g.game.viewFor(null).phase).toBe('production');
      return g;
    };
    const timed = toProduction();
    expect(timed.game.viewFor(null).phaseEndsAt! - timed.ctx.now()).toBe(15_000);
    expect(timed.game.viewFor(null).production!.lengthMs).toBe(15_000);
    timed.advance(14_999);
    expect(timed.game.viewFor(null).phase).toBe('production');
    timed.advance(1);
    expect(timed.game.viewFor(null).phase).toBe('auction');

    // A faster game plays the same show, faster: the view says how long the phase was given.
    const fast = toDevelopment({ phaseScale: 0.1 });
    while (fast.game.viewFor(null).phase === 'development') fast.advance(10);
    expect(fast.game.viewFor(null).phase).toBe('production');
    expect(fast.game.viewFor(null).phaseEndsAt! - fast.ctx.now()).toBe(1_500);
    expect(fast.game.viewFor('s1').production!.lengthMs).toBe(1_500);

    const early = toProduction();
    early.game.handle('s1', { type: 'ready' });
    expect(early.game.viewFor(null).phase).toBe('production');
    early.game.handle('s2', { type: 'ready' });
    expect(early.game.viewFor(null).phase).toBe('auction');
  });

  it('T-AC-2: maxMonths reaches the game and every view', () => {
    const { game } = started({ maxMonths: 2 });
    expect(game.viewFor(null).maxMonths).toBe(2);
    expect(game.viewFor('s1').maxMonths).toBe(2);
  });

  it.each([0, -0.5, Number.NaN, 2])('T-AC-2: phaseScale %s is refused at construction', (phaseScale) => {
    const { ctx } = fakeContext();
    expect(() => new MuleGame(ctx, 7, { phaseScale })).toThrow(RangeError);
  });
});
