import { boxOf, DEV_STEER, DEVELOPMENT, doorOutside, floorConfig, HALL, pathTo, RuleError, tileIndex, type GameState, type HallDoor, type HallPlace, type Outfit } from '@mule/engine';
import type { SeatInfo } from '@tabletop/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, pressAct, pressThroughSidePick, readyAll, steerTo, tapThere, toDevelopment, walkers, type SteerPoint } from './fake-context.js';

/**
 * Heiko's ruling of 2026-11-05 ("Yes, always count"): month 1's development clock counts down from the start, as in
 * every other month. It replaces A-1 / AM-33, which held the clock full until every seat had its first MULE.
 */
const LENA = 's1';
const OSSA = 's2';
const FULL_MS = DEVELOPMENT.fullSeconds * 1_000;

/** A free plot next to the store, so a walk there is short. */
function plotNearStore(state: GameState, skip = 0): number {
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  const near = state.tiles.filter((t) => t.terrain !== 'store' && t.owner === null && Math.abs(t.x - store.x) + Math.abs(t.y - store.y) <= 2);
  const t = near[skip]!;
  return tileIndex(state.width, t.x, t.y);
}

/**
 * A seat's plot on the store's row, two tiles out on its own door's side (Lena's colonist starts at the left door,
 * Ossa's at the right), clear of the door's reach; `out` more tiles further out for another.
 */
function plotBeside(state: GameState, id: string, out = 0): number {
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  return tileIndex(state.width, id === LENA ? store.x - 2 - out : store.x + 2 + out, store.y);
}

// --- Steered development, walked as dev-steer.test.ts walks it: steerTo and pressAct, nothing tapped. ---

/** A steered development as these tests drive it: the game, its fake clock, and its engine state for the map's routes. */
type Floor = { game: MuleGame; advance: (ms: number) => void; state: GameState };
type Spot = { x: number; y: number };

/** Where a seat's colonist stands, as the TV reads it. */
function standing(g: Floor, seat: string): SteerPoint {
  const c = g.game.viewFor(null).players.find((p) => p.id === seat)!.colonist!;
  return { space: c.space!, x: c.x!, y: c.y! };
}

/** The one button, once its words say `verb`: pressed as a phone presses it. */
function press(g: Floor, seat: string, verb: string): void {
  expect(g.game.viewFor(seat).me?.reach?.verb, `${seat}'s button`).toMatch(verb);
  pressAct(g.game, g, seat);
}

/** In the hall: onto the walkway, along it, and into `place` (a door's own spot, else the middle of its room). */
function hallTo(g: Floor, seat: string, place: HallPlace): void {
  const walkway = HALL.floor[0]!;
  const y = (walkway.y0 + walkway.y1) / 2;
  const box = boxOf(place);
  const to = place === 'doorL' || place === 'doorR' ? HALL.spots[place] : { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
  const at = standing(g, seat);
  steerTo(g.game, g, seat, [{ space: 'hall', x: at.x, y }, { space: 'hall', x: to.x, y }, { space: 'hall', ...to }]);
}

/** On the map: by the engine's quickest route (pathTo, the AI's own), tile centre by tile centre, to `to`. */
function mapTo(g: Floor, seat: string, to: Spot, within?: number): void {
  const path = pathTo(g.state, standing(g, seat), to, floorConfig());
  if (!path) throw new Error(`no route for ${seat} to (${to.x}, ${to.y})`);
  const turns = path.tiles.slice(1, -1).map((t): SteerPoint => ({ space: 'map', x: Math.floor(t.x) + 0.5, y: Math.floor(t.y) + 0.5 }));
  steerTo(g.game, g, seat, [...turns, { space: 'map', ...to }], within === undefined ? {} : { within });
}

/** The store door on a point's side of the store. */
const doorFor = (g: Floor, at: Spot): HallDoor => (at.x < g.state.tiles.find((t) => t.terrain === 'store')!.x ? 'doorL' : 'doorR');

/** Into the store from wherever on the map the colonist stands: to the nearer door's mouth, and ENTER STORE. */
function goIn(g: Floor, seat: string): void {
  const at = standing(g, seat);
  if (at.space === 'hall') return;
  mapTo(g, seat, doorOutside(g.state, doorFor(g, at), floorConfig()), 0.1);
  press(g, seat, 'ENTER STORE');
}

/** Out of the store by the door on the plot's side, and across the map to the middle of the plot. */
function walkToPlot(g: Floor, seat: string, plot: Spot): void {
  if (standing(g, seat).space === 'hall') {
    hallTo(g, seat, doorFor(g, plot));
    press(g, seat, 'LEAVE');
  }
  mapTo(g, seat, { x: plot.x + 0.5, y: plot.y + 0.5 });
}

/** BUY MULE at the corral and OUTFIT at `outfit`'s shopfront; the colonist stays in the hall. */
function buyAndOutfit(g: Floor, seat: string, outfit: Outfit): void {
  goIn(g, seat);
  hallTo(g, seat, 'corral');
  press(g, seat, 'BUY MULE');
  hallTo(g, seat, outfit);
  press(g, seat, 'OUTFIT');
}

/** Out with the MULE on its lead to the plot, and INSTALL there. */
function installOn(g: Floor, seat: string, plot: Spot): void {
  walkToPlot(g, seat, plot);
  press(g, seat, 'INSTALL');
}

/** In by the nearer door, to the pub, and PUB · END TURN. */
function toThePub(g: Floor, seat: string): void {
  goIn(g, seat);
  hallTo(g, seat, 'pub');
  press(g, seat, 'PUB · END TURN');
}

/**
 * Month 1 as the game ships it, on the fake clock, seed 7: Lena (the host) and Ossa each own a plot beside the store,
 * then every human is Ready. Nothing here sets a month-1 rule: the clock is whatever the shipped config makes it.
 */
function firstMonth(prepare?: (state: GameState) => void) {
  const fake = fakeContext({ table: walkers });
  const game = new MuleGame(fake.ctx, 7);
  game.start(walkers);
  const state = (game as unknown as { state: GameState }).state;
  const plots: Record<string, number> = {};
  for (const id of [LENA, OSSA]) {
    plots[id] = plotBeside(state, id);
    state.tiles[plots[id]!]!.owner = id;
  }
  prepare?.(state);
  readyAll(game);
  for (let i = 0; i < 10_000 && game.viewFor(null).phase !== 'development'; i++) fake.advance(100);
  if (game.viewFor(null).phase !== 'development') throw new Error('month 1 never reached development');
  const g = { game, state, ...fake };
  const xy = (id: string) => ({ x: plots[id]! % state.width, y: Math.floor(plots[id]! / state.width) });
  const installFirst = (id: string) => {
    buyAndOutfit(g, id, 'food');
    installOn(g, id, xy(id));
  };
  return { ...g, xy, installFirst };
}

describe("Heiko 5 Nov, 'Yes, always count': month 1's development clock counts down from the start", () => {
  it('month 1: the full clock starts as development opens, though nobody has a MULE yet', () => {
    const { game, ctx } = firstMonth();
    const view = game.viewFor(LENA);
    expect({ devEndsAt: view.me?.devEndsAt ?? null, phaseEndsAt: view.phaseEndsAt }).toEqual({ devEndsAt: ctx.now() + FULL_MS, phaseEndsAt: ctx.now() + FULL_MS });
  });

  it('month 1: with its first MULE in, a seat buys a second at once while the other has none', () => {
    const g = firstMonth();
    g.installFirst(LENA);
    const corral = g.game.viewFor(null).storeMules;
    goIn(g, LENA);
    hallTo(g, LENA, 'corral');
    press(g, LENA, 'BUY MULE');
    expect({ leads: g.game.viewFor(LENA).me!.carriedMule, corral: g.game.viewFor(null).storeMules }).toEqual({ leads: 'empty', corral: corral - 1 });
    expect(g.game.viewFor(null).news.join(' | ')).not.toContain('Waiting for the others');
  });

  it('month 1: development ends when the full clock runs out, though Ossa never installs a MULE', () => {
    const g = firstMonth();
    const opened = g.ctx.now();
    g.installFirst(LENA);
    toThePub(g, LENA);
    for (let i = 0; i < 20_000 && g.game.viewFor(null).phase === 'development'; i++) g.advance(100);
    expect(g.game.viewFor(null).phase).not.toBe('development');
    expect(g.ctx.now() - opened, 'the full clock, never a wait on Ossa').toBeLessThanOrEqual(FULL_MS + 100);
  });

  it("the host's Continue is not a development move: it is refused, and the clock is unchanged", () => {
    const { game } = firstMonth();
    const before = game.viewFor(LENA).phaseEndsAt;
    expect(() => game.handle(LENA, { type: 'continue' })).toThrow(RuleError);
    expect(game.viewFor(LENA).phaseEndsAt).toBe(before);
  });
});

describe('month 1 with AI seats ends on its own clock (WS1’s stall seeds)', () => {
  // Each row plays whole AI months on the fake clock: the outcome is fixed by the seed, but the wall time is not, and a
  // loaded CI runner took 5.2 s against vitest's 5 s default. The budget is for the runner, not for the game.
  const SLOW_ROW_MS = 30_000;
  // The server's planning ends on a human's Ready, so a table of AIs alone never leaves it: one idle human sits in.
  const table: SeatInfo[] = [{ id: 'h', name: 'Hal', isAi: false, color: 4 }, ...['Ada', 'Bo', 'Cy', 'Di'].map((name, i) => ({ id: `a${i}`, name, isAi: true, color: i }))];

  it.each([103, 233, 3])('seed %i: four AI seats, politics on, idle Hal owning a plot: month 1 development lasts one full clock', (seed) => {
    const fake = fakeContext({ table });
    const game = new MuleGame(fake.ctx, seed, { politics: true });
    game.start(table);
    const state = (game as unknown as { state: GameState }).state;
    let devFrom: number | null = null;
    let devMs = 0;
    for (let i = 0; i < 20_000; i++) {
      const { month, phase } = game.viewFor(null);
      if (month !== 1) break;
      if (phase === 'planning' && !state.tiles.some((t) => t.owner === 'h')) state.tiles[plotNearStore(state, 0)]!.owner = 'h';
      if (phase === 'planning' || phase === 'landGrant' || phase === 'upkeep') readyAll(game);
      if (phase === 'development' && devFrom === null) devFrom = fake.ctx.now();
      if (phase !== 'development' && devFrom !== null && devMs === 0) devMs = fake.ctx.now() - devFrom;
      // A good's side pick (A-7) waits for the idle human too.
      pressThroughSidePick(game);
      fake.advance(100);
    }
    expect(game.viewFor(null).month, 'month 1 ended').toBe(2);
    expect(devMs, 'at most the full clock and the last walks settling, never a wait on idle Hal').toBeLessThanOrEqual(FULL_MS + 10_000);
  }, SLOW_ROW_MS);
});

describe("a seat that can't pay is told why (the tap path)", () => {
  let was = DEV_STEER.on;
  beforeAll(() => {
    was = DEV_STEER.on;
    DEV_STEER.on = false;
  });
  afterAll(() => {
    DEV_STEER.on = was;
  });

  it("month 1: Lena with no money taps BUY MULE and the news says 'Not enough money'", () => {
    const g = toDevelopment({ players: walkers, prepare: (state) => void (state.players.find((p) => p.id === LENA)!.money = 0) });
    tapThere(g.game, g, LENA, { type: 'buyMule' });
    const news = g.game.viewFor(null).news.join(' | ');
    expect(news).toContain('Not enough money');
    expect(news).not.toContain('Waiting for the others');
  });
});
