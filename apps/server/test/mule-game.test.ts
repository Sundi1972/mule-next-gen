import type { GameContext } from '@tabletop/core';
import { describe, expect, it } from 'vitest';
import { AI_HANDS, boxOf, declareRole, DEV_STEER, doorOutside, floorConfig, HALL, pathTo, RuleError, WALK, type GameState, type HallDoor, type HallPlace } from '@mule/engine';
import { GOOD_NAME } from '@mule/ai';
import { GRANT_TICK_MS, MuleGame } from '../src/mule-game.js';
import { pressAct, readyAll, steerTo, type SteerPoint } from './fake-context.js';

/** A context with a manual clock, so phase timers run instantly. */
function fakeContext() {
  let now = 0;
  const timers: { at: number; fn: () => void }[] = [];
  const ctx: GameContext = {
    now: () => now,
    schedule: (ms, fn) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    changed: () => {},
    frame: () => {},
    hostId: () => 's1',
  };
  const advance = (ms: number) => {
    now += ms;
    for (let due = timers.filter((t) => t.at <= now); due.length > 0; due = timers.filter((t) => t.at <= now)) {
      for (const t of due) {
        // A timer an earlier one cancelled doesn't run.
        const i = timers.indexOf(t);
        if (i < 0) continue;
        timers.splice(i, 1);
        t.fn();
      }
    }
  };
  return { ctx, advance };
}

const seats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Mia', isAi: false, color: 1 },
  { id: 's3', name: 'The Big Spender', isAi: true, color: 2 },
];

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

/** In the hall: onto the walkway, along it, and into the middle of `place`'s room. */
function hallTo(g: Floor, seat: string, place: Exclude<HallPlace, HallDoor>): void {
  const walkway = HALL.floor[0]!;
  const y = (walkway.y0 + walkway.y1) / 2;
  const box = boxOf(place);
  const to = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
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

/** In by the nearer door, to the pub, and PUB · END TURN. */
function toThePub(g: Floor, seat: string): void {
  const at = standing(g, seat);
  if (at.space === 'map') {
    const door: HallDoor = at.x < g.state.tiles.find((t) => t.terrain === 'store')!.x ? 'doorL' : 'doorR';
    mapTo(g, seat, doorOutside(g.state, door, floorConfig()), 0.1);
    press(g, seat, 'ENTER STORE');
  }
  hallTo(g, seat, 'pub');
  press(g, seat, 'PUB · END TURN');
}

describe('MuleGame', () => {
  // The clock as such, met in month 1: it runs from the start, as in any later month.

  it('shows each player only their own stock and land secrets', () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    readyAll(game);
    const lit = game.viewFor('s1').lit!;
    game.handle('s1', { type: 'claim', x: lit.x, y: lit.y });
    const mine = game.viewFor('s1').tiles.find((t) => t.x === lit.x && t.y === lit.y)!;
    const theirs = game.viewFor('s2').tiles.find((t) => t.x === lit.x && t.y === lit.y)!;
    const board = game.viewFor(null);
    expect(mine.owner).toBe('s1');
    expect(mine.traits).toBeDefined();
    expect(mine.ground).toBeUndefined();
    expect(theirs.traits).toBeUndefined();
    expect(game.viewFor('s2').me?.id).toBe('s2');
    expect(board.me).toBeNull();
    expect(board.tiles.every((t) => t.traits === undefined && t.ground === undefined)).toBe(true);
  });

  it('B-AC-9: every view, phone and TV, carries each plot\'s special field; plain plots carry none', () => {
    const { ctx } = fakeContext();
    const game = new MuleGame(ctx, 93);
    game.start(seats);
    const state = (game as unknown as { state: GameState }).state;
    const specials = state.tiles.filter((t) => t.special);
    expect(specials.length).toBeGreaterThan(0);
    for (const viewer of ['s1', 's2', null]) {
      const tiles = game.viewFor(viewer).tiles;
      for (const t of state.tiles) expect(tiles[t.y * state.width + t.x]!.special).toEqual(t.special);
      expect(tiles.filter((t) => t.special)).toHaveLength(specials.length);
    }
  });

  it('moves the land grant light on a tick and only lets the lit plot be claimed', () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    readyAll(game);
    const first = game.viewFor('s1').lit!;
    const other = game.viewFor('s1').tiles.find((t) => t.terrain !== 'store' && !t.owner && (t.x !== first.x || t.y !== first.y))!;
    expect(() => game.handle('s1', { type: 'claim', x: other.x, y: other.y })).toThrow('not lit');
    advance(GRANT_TICK_MS);
    expect(game.viewFor('s1').lit).not.toEqual(first);
  });

  it("FM-one-clock: an assay keeps the colonist busy and never shortens the clock; its ground is the analyser's alone; the pub pays and ends only that turn; the clock ends development", () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    readyAll(game);
    while (game.viewFor('s1').phase === 'landGrant') advance(GRANT_TICK_MS);
    const g = { game, advance, state: (game as unknown as { state: GameState }).state };
    const view = game.viewFor('s1');
    expect(view.phase).toBe('development');
    const ends = view.me!.devEndsAt!;
    // A plot two tiles left of the store, on Heiko's door's side: he walks out to it and presses ANALYSE.
    const store = view.tiles.find((t) => t.terrain === 'store')!;
    const plot = { x: store.x - 2, y: store.y };
    mapTo(g, 's1', { x: plot.x + 0.5, y: plot.y + 0.5 });
    press(g, 's1', 'ANALYSE');
    const after = game.viewFor('s1');
    expect(after.me!.devEndsAt).toBe(ends);
    expect(after.tiles.find((t) => t.x === plot.x && t.y === plot.y)!.ground).toBeDefined();
    expect(game.viewFor('s2').tiles.find((t) => t.x === plot.x && t.y === plot.y)!.ground).toBeUndefined();
    expect(after.players.find((p) => p.id === 's1')!.colonist!.assayUntil, 'the assay keeps him busy').not.toBeNull();
    expect(after.me!.reach, 'his button is dim while he assays').toMatchObject({ verb: 'ASSAYING', enabled: false });
    // Mia goes to the pub for cash while she still has time.
    const money = after.players.find((p) => p.id === 's2')!.money;
    toThePub(g, 's2');
    expect(game.viewFor('s2').players.find((p) => p.id === 's2')!.money).toBeGreaterThan(money);
    expect(game.viewFor('s2').me!.reach, 'her turn is over').toMatchObject({ verb: 'IN THE PUB', enabled: false });
    // Heiko stands on his plot until the one clock runs out, which ends development.
    advance(ends - 1 - ctx.now());
    expect(game.viewFor('s1').phase).toBe('development');
    advance(1);
    expect(game.viewFor('s1').phase).toBe('production');
  });

  it('lets the AI player claim land, then buy, outfit and install a MULE through the same moves as a phone', () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    readyAll(game);
    while (game.viewFor('s1').phase === 'landGrant') advance(GRANT_TICK_MS);
    const owned = () => game.viewFor(null).tiles.filter((t) => t.owner === 's3');
    expect(owned().length).toBeGreaterThan(0);
    // The humans go straight to the pub; the AI keeps its own clock.
    const g = { game, advance, state: (game as unknown as { state: GameState }).state };
    toThePub(g, 's1');
    toThePub(g, 's2');
    expect(game.viewFor('s1').phase).toBe('development');
    // A tick at a time, as a room's timers fire: a longer jump is a late tick, and the floor drops what it can't catch up.
    for (let i = 0; i < 120_000 / DEV_STEER.tickMs && game.viewFor('s1').phase === 'development'; i++) advance(DEV_STEER.tickMs);
    expect(game.viewFor('s1').phase).toBe('production');
    expect(owned().some((t) => t.outfit !== null)).toBe(true);
  });

  it('tells each player their development time and what their plots made', () => {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    expect(game.viewFor('s1').me!.produced).toBeNull();
    readyAll(game);
    while (game.viewFor('s1').phase === 'landGrant') advance(GRANT_TICK_MS);
    const dev = game.viewFor('s1').me!;
    expect(dev.devSeconds).toBeGreaterThan(0);
    expect(dev.devEndsAt! - ctx.now()).toBe(dev.devSeconds * 1_000);
    while (game.viewFor('s1').phase === 'development') advance(1_000);
    expect(game.viewFor('s1').phase).toBe('production');
    const produced = game.viewFor('s1').me!.produced;
    expect(produced).not.toBeNull();
    expect(produced!.food).toBeGreaterThanOrEqual(0);
  });

  /** Plays through to the auction with the fake clock. */
  function toAuction() {
    const { ctx, advance } = fakeContext();
    const game = new MuleGame(ctx, 7);
    game.start(seats);
    readyAll(game);
    while (game.viewFor('s1').phase === 'landGrant') advance(GRANT_TICK_MS);
    while (game.viewFor('s1').phase === 'development') advance(1_000);
    while (game.viewFor('s1').phase === 'production') advance(1_000);
    expect(game.viewFor('s1').phase).toBe('auction');
    return { game, advance, ctx };
  }

  it('T-AC-3: runs the auction live on the server clock: status then walk, good by good, on the side picked during status', () => {
    const { game, advance } = toAuction();
    const view = game.viewFor(null);
    expect(view.phaseEndsAt).toBeNull();
    const first = view.auction!;
    expect(first.stage).toBe('status');
    // A-7: the side pick has no clock.
    expect(first.total).toBe(0);
    expect(first.status.map((r) => r.id)).toEqual(['s1', 's2', 's3']);
    expect(() => game.handle('s1', { type: 'walk', dir: 'up' })).toThrow('Not walking');
    game.handle('s1', { type: 'declare', side: 'buyer' });
    expect(game.viewFor(null).auction!.walkers.find((w) => w.id === 's1')!.side).toBe('buyer');
    // Both humans are done with the status screen; the AI is done by itself.
    game.handle('s1', { type: 'ready' });
    game.handle('s2', { type: 'ready' });
    advance(WALK.tickMs * 2);
    const walk = game.viewFor('s1').auction!;
    expect(walk.stage).toBe('walk');
    expect(walk.total).toBe(WALK.goodMs / 1_000);
    const before = walk.walkers.find((w) => w.id === 's1')!;
    expect(before.side).toBe('buyer');
    game.handle('s1', { type: 'walk', dir: 'up' });
    advance(1_000);
    const after = game.viewFor('s2').auction!.walkers.find((w) => w.id === 's1')!;
    expect(after.at).toBeGreaterThan(before.at);
    expect(after.dir).toBe(1);
  });

  it('moves on to upkeep once the last good is done; in the walk a dropped phone counts as done', () => {
    const { game, advance } = toAuction();
    game.connectionChanged('s2', false);
    for (let i = 0; i < 2_000 && game.viewFor('s1').phase === 'auction'; i++) {
      game.handle('s1', { type: 'ready' });
      // The side pick holds a dropped phone (A-7): the host moves on for it.
      if (game.viewFor(null).auction?.stage === 'status') game.handle('s1', { type: 'continue' });
      advance(WALK.tickMs);
    }
    expect(game.viewFor('s1').phase).toBe('upkeep');
    expect(game.viewFor('s1').auction).toBeNull();
  });

  describe('A-7 (G-7): the side pick waits for everyone; the host moves on for someone away', () => {
    const stage = (game: MuleGame) => game.viewFor(null).auction?.stage;
    const good = (game: MuleGame) => game.viewFor(null).auction?.good;

    it('B-AC-A7-1: the side pick does not end on a clock', () => {
      const { game, advance } = toAuction();
      const first = good(game);
      // Far past the old 8 s, and past every AI's decision wait: nobody has ended it.
      for (let t = 0; t < 60_000; t += WALK.tickMs) advance(WALK.tickMs);
      expect(stage(game)).toBe('status');
      expect(good(game)).toBe(first);
      expect(game.viewFor(null).auction!.seconds).toBe(0);
    });

    it('B-AC-A7-2: it ends once every seat has pressed Done, the AI included, by itself', () => {
      const { game, advance } = toAuction();
      const first = good(game);
      game.handle('s1', { type: 'ready' });
      advance(WALK.tickMs * 2);
      expect(stage(game), 'one person still to pick').toBe('status');
      game.handle('s2', { type: 'ready' });
      // The AI presses Done within its decision wait; nobody presses for it.
      for (let i = 0; i < 100 && stage(game) === 'status' && good(game) === first; i++) advance(WALK.tickMs);
      expect(stage(game) !== 'status' || good(game) !== first, 'the walk started, or the good moved on with nobody trading').toBe(true);
      const after = game.viewFor(null).auction;
      if (after && after.good === first) expect(after.stage).toBe('walk');
    });

    it("B-AC-A7-3: the host's Continue ends it, and the news names who was passed", () => {
      const { game, advance } = toAuction();
      const first = good(game)!;
      game.handle('s1', { type: 'ready' });
      game.handle('s1', { type: 'continue' });
      expect(game.viewFor(null).news[0]).toBe(`Heiko started the ${GOOD_NAME[first]} walk without Mia.`);
      // Before any tick: every walker is Done, the AI's too, so nothing is left to wait for.
      expect(game.viewFor(null).auction!.walkers.map((w) => [w.id, w.done])).toEqual([
        ['s1', true],
        ['s2', true],
        ['s3', true],
      ]);
      advance(WALK.tickMs);
      expect(stage(game) !== 'status' || good(game) !== first).toBe(true);
    });

    it("B-AC-A7-3 (F5): a Continue at a side pick where nobody can trade says it moved on, not that a walk started", () => {
      const { game } = toAuction();
      const first = good(game)!;
      // Everyone is a buyer (RULE-2) and none can pay: there is nobody to walk for.
      const state = (game as unknown as { state: GameState }).state;
      for (const p of state.players) p.money = 0;
      game.handle('s1', { type: 'continue' });
      expect(game.viewFor(null).news[0]).toBe(`Heiko moved on from ${GOOD_NAME[first]} without Mia.`);
    });

    it('B-AC-A7-3: a Continue with nobody left to wait for names nobody', () => {
      const { game } = toAuction();
      const before = game.viewFor(null).news;
      game.handle('s2', { type: 'ready' });
      game.handle('s1', { type: 'continue' });
      expect(game.viewFor(null).news).toEqual(before);
    });

    it('B-AC-A7-4: a non-host Continue throws RuleError and moves nothing on', () => {
      const { game, advance } = toAuction();
      const first = good(game);
      game.handle('s1', { type: 'ready' });
      expect(() => game.handle('s2', { type: 'continue' })).toThrow(RuleError);
      advance(WALK.tickMs * 2);
      expect(stage(game)).toBe('status');
      expect(good(game)).toBe(first);
    });

    it("B-AC-A7-4: the walk keeps its clock: the host's Continue is refused there", () => {
      const { game, advance } = toAuction();
      // Heiko buys from the store, so the good has a walk (with 2 Food each, nobody's numbers ask for one).
      game.handle('s1', { type: 'declare', side: 'buyer' });
      game.handle('s1', { type: 'ready' });
      game.handle('s2', { type: 'ready' });
      for (let i = 0; i < 100 && stage(game) === 'status'; i++) advance(WALK.tickMs);
      expect(stage(game)).toBe('walk');
      expect(() => game.handle('s1', { type: 'continue' })).toThrow(RuleError);
    });

    it('B-AC-A7-5: an away seat is held at the side pick, keeps its side, and the host moves on for it', () => {
      const { game, advance } = toAuction();
      const first = good(game)!;
      const side = game.viewFor(null).auction!.walkers.find((w) => w.id === 's2')!.side;
      game.connectionChanged('s2', false);
      // Heiko buys from the store, so there is a walk to start (with 2 Food each, nobody's numbers ask for one).
      game.handle('s1', { type: 'declare', side: 'buyer' });
      game.handle('s1', { type: 'ready' });
      for (let t = 0; t < 20_000; t += WALK.tickMs) advance(WALK.tickMs);
      const held = game.viewFor(null).auction!;
      expect(held.stage).toBe('status');
      expect(held.walkers.find((w) => w.id === 's2')).toMatchObject({ side, done: false });
      game.handle('s1', { type: 'continue' });
      expect(game.viewFor(null).news[0]).toBe(`Heiko started the ${GOOD_NAME[first]} walk without Mia.`);
      advance(WALK.tickMs);
      expect(stage(game) !== 'status' || good(game) !== first).toBe(true);
    });

    it('B-AC-A7-5: an away seat back before the host moves on picks as usual', () => {
      const { game, advance } = toAuction();
      const first = good(game);
      game.connectionChanged('s2', false);
      game.handle('s1', { type: 'ready' });
      advance(WALK.tickMs * 5);
      game.connectionChanged('s2', true);
      game.handle('s2', { type: 'ready' });
      for (let i = 0; i < 100 && stage(game) === 'status' && good(game) === first; i++) advance(WALK.tickMs);
      expect(stage(game) !== 'status' || good(game) !== first).toBe(true);
    });

    it('T-AC-A7-6 liveness: AIs and one idle human: the host alone takes the table through every good to upkeep', () => {
      const { game, advance } = toAuction();
      // Mia never touches her phone; Heiko, the host, presses Ready and then moves on for her, good by good.
      let moved = 0;
      for (let i = 0; i < 5_000 && game.viewFor(null).phase === 'auction'; i++) {
        if (stage(game) === 'status') {
          game.handle('s1', { type: 'ready' });
          game.handle('s1', { type: 'continue' });
          moved++;
        }
        advance(WALK.tickMs);
      }
      expect(game.viewFor(null).phase).toBe('upkeep');
      expect(moved).toBeGreaterThan(0);
    });

    it('T-AC-A7-6 liveness: with every person Done, AIs never hold a side pick past their decision wait', () => {
      const { game, advance } = toAuction();
      let longest = 0;
      for (let i = 0; i < 5_000 && game.viewFor(null).phase === 'auction'; ) {
        const g = good(game);
        let ticks = 0;
        while (stage(game) === 'status' && good(game) === g && i < 5_000) {
          game.handle('s1', { type: 'ready' });
          game.handle('s2', { type: 'ready' });
          advance(WALK.tickMs);
          ticks++;
          i++;
        }
        longest = Math.max(longest, ticks);
        while (stage(game) === 'walk' && i < 5_000) {
          game.handle('s1', { type: 'ready' });
          game.handle('s2', { type: 'ready' });
          advance(WALK.tickMs);
          i++;
        }
        // A good's close stage (A-5) is neither: step through it, and count the step, so the loop always ends.
        if (game.viewFor(null).phase === 'auction' && stage(game) !== 'status' && stage(game) !== 'walk') {
          advance(WALK.tickMs);
          i++;
        }
      }
      expect(game.viewFor(null).phase).toBe('upkeep');
      // The AI's decision wait, a tick to press Done and one to step: never the old 8 s, never forever.
      expect(longest * WALK.tickMs).toBeLessThanOrEqual(AI_HANDS.auction.decideWaitMs + WALK.tickMs * 3);
    });
  });
});

