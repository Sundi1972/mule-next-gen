import { advancePhase, boxOf, COLONY_SELLER, createGame, DEV_STEER, HALL, type GameState } from '@mule/engine';
import type { MuleIntent } from '@mule/protocol';
import type { GameContext, SeatInfo } from '@tabletop/core';
import { afterEach, beforeEach } from 'vitest';
import { MuleGame } from '../src/mule-game.js';

/** The three seats these server tests play with. */
export const seats = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Mia', isAi: false, color: 1 },
  { id: 's3', name: 'The Baron', isAi: true, color: 2 },
];

/** Two human seats whose species walk at different paces: Lena a Zipwing, Ossa a Mollox. */
export const walkers: SeatInfo[] = [
  { id: 's1', name: 'Lena', isAi: false, color: 0, pick: 'zipwing' },
  { id: 's2', name: 'Ossa', isAi: false, color: 1, pick: 'mollox' },
];

/**
 * Plays month 1 into development on the fake clock, seed 7. `prepare` runs once while planning is open, to set the
 * state up as a test needs it; then every human is Ready. With `claimer`, that seat claims the first plot lit in the
 * land grant, returned as `plot`. The clock runs from the start, as in any month after the first, unless
 * `firstMonthWaits` keeps month 1's rule: then it waits for every first MULE (A-1).
 */
export function toDevelopment(options: { players?: SeatInfo[]; phaseScale?: number; claimer?: string; firstMonthWaits?: boolean; prepare?: (state: GameState) => void; onChanged?: (at: number) => void } = {}) {
  const rule = DEV_STEER.month1WaitsForFirstMule;
  DEV_STEER.month1WaitsForFirstMule = options.firstMonthWaits ?? false;
  try {
    return playToDevelopment(options);
  } finally {
    DEV_STEER.month1WaitsForFirstMule = rule;
  }
}

/**
 * For a describe block whose tests are about the development clock itself, met in month 1 for convenience: month 1's
 * clock runs from the start, as it does in every later month, instead of waiting for every first MULE (A-1).
 */
export function clockRunsInMonth1(): void {
  let rule = DEV_STEER.month1WaitsForFirstMule;
  beforeEach(() => {
    rule = DEV_STEER.month1WaitsForFirstMule;
    DEV_STEER.month1WaitsForFirstMule = false;
  });
  afterEach(() => {
    DEV_STEER.month1WaitsForFirstMule = rule;
  });
}

function playToDevelopment(options: { players?: SeatInfo[]; phaseScale?: number; claimer?: string; prepare?: (state: GameState) => void; onChanged?: (at: number) => void }) {
  const fake = fakeContext({ table: options.players ?? seats, onChanged: options.onChanged });
  const game = new MuleGame(fake.ctx, 7, options.phaseScale === undefined ? undefined : { phaseScale: options.phaseScale });
  game.start(options.players ?? seats);
  // The game keeps its engine state private; a test reaches it to arrange its ground truth.
  const state = (game as unknown as { state: GameState }).state;
  options.prepare?.(state);
  readyAll(game);
  let plot: { x: number; y: number } | null = null;
  for (let i = 0; i < 10_000 && game.viewFor(null).phase !== 'development'; i++) {
    const lit: { x: number; y: number } | null = options.claimer && !plot && game.viewFor(null).phase === 'landGrant' ? game.viewFor(options.claimer).lit : null;
    if (lit) {
      game.handle(options.claimer!, { type: 'claim', ...lit });
      plot = lit;
    }
    if (game.viewFor(null).phase !== 'development') fake.advance(100);
  }
  if (game.viewFor(null).phase !== 'development') throw new Error('month 1 never reached development');
  return { game, state, plot, ...fake };
}

/**
 * Every human seat presses Ready, as their phones would, so planning, which has no clock, moves on. It stops once
 * the phase changes, so no Ready lands in the next one (where it could end the land grant early).
 */
export function readyAll(game: MuleGame): void {
  const phase = game.viewFor(null).phase;
  for (const p of game.viewFor(null).players) {
    if (game.viewFor(null).phase !== phase) return;
    if (!p.isAi) game.handle(p.id, { type: 'ready' });
  }
}

/**
 * A good's side pick, the auction's status screen, has no clock (A-7): it waits for every Done or the host's Continue.
 * At a status screen with a human not yet Done, every such human presses Ready, as their phones would; with `host`,
 * that seat moves on for them instead (Ready, then Continue). Anywhere else it does nothing. Returns whether it pressed.
 */
export function pressThroughSidePick(game: MuleGame, how: { host: string } | 'ready' = 'ready'): boolean {
  // Read from the engine first: this runs on every step, and building a view each time is what costs.
  const inside = game as unknown as { state: GameState | null; heldUntil: number | null };
  const state = inside.state;
  if (state?.phase !== 'auction' || state.auction?.stage !== 'status') return false;
  // While an event's show holds the table nobody may press (the server refuses it): press once the hold has ended.
  if (inside.heldUntil !== null) return false;
  const view = game.viewFor(null);
  const a = view.auction;
  if (view.phase !== 'auction' || a?.stage !== 'status') return false;
  const idle = view.players.filter((p) => !p.isAi && !a.walkers.find((w) => w.id === p.id)?.done);
  if (idle.length === 0) return false;
  if (how === 'ready') for (const p of idle) game.handle(p.id, { type: 'ready' });
  else {
    game.handle(how.host, { type: 'ready' });
    // With the host the only one idle, its Ready was enough: there is nobody to move on for.
    if (idle.some((p) => p.id !== how.host)) game.handle(how.host, { type: 'continue' });
  }
  return true;
}

/** `advance`, pressing through any side pick first (pressThroughSidePick), for a test that plays through the auction idly. */
export function throughSidePicks(game: MuleGame, advance: (ms: number) => void, how: { host: string } | 'ready' = 'ready'): (ms: number) => void {
  return (ms) => {
    pressThroughSidePick(game, how);
    advance(ms);
  };
}

/** The first human seat of a table: who hosts it while every phone is connected. */
export function firstHuman(table: { id: string; isAi: boolean }[]): string | null {
  return table.find((s) => !s.isAi)?.id ?? null;
}

/**
 * A game context with a manual clock. `waits` is the wait each scheduled timer
 * was given; `onChanged` is called with the clock's time on every `changed()`;
 * `frames` holds every payload the game sent through `frame()`, in order.
 * The host is `table`'s first human seat (`seats` by default) unless `host` names
 * another or none; `setHost` passes hosting on, as the room does when a phone drops.
 */
export function fakeContext(options: { onChanged?: (at: number) => void; table?: { id: string; isAi: boolean }[]; host?: string | null } = {}) {
  let now = 0;
  let host = options.host === undefined ? firstHuman(options.table ?? seats) : options.host;
  const waits: number[] = [];
  const frames: unknown[] = [];
  const timers: { at: number; fn: () => void }[] = [];
  const ctx: GameContext = {
    now: () => now,
    schedule: (ms, fn) => {
      waits.push(ms);
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
      };
    },
    changed: () => options.onChanged?.(now),
    frame: (payload) => void frames.push(payload),
    hostId: () => host,
  };
  const advance = (ms: number) => {
    now += ms;
    for (let due = timers.filter((t) => t.at <= now); due.length > 0; due = timers.filter((t) => t.at <= now)) {
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i < 0) continue; // A timer an earlier one cancelled doesn't run.
        timers.splice(i, 1);
        t.fn();
      }
    }
  };
  /** Moves the clock on without firing a timer, as a held room does (Room.hold): the due ones fire at the next advance. */
  const hold = (ms: number) => {
    now += ms;
  };
  const setHost = (id: string | null) => {
    host = id;
  };
  return { ctx, advance, hold, waits, frames, setHost };
}

/**
 * A development tap that lets the fake clock run until the colonist has got there and finished any assay, so the
 * move has applied when it returns, as it had when moves were instant.
 */
export function tapThere(game: MuleGame, fake: { ctx: GameContext; advance: (ms: number) => void }, seatId: string, intent: MuleIntent): void {
  game.handle(seatId, intent);
  const colonist = () => game.viewFor(null).players.find((p) => p.id === seatId)?.colonist;
  const walk = colonist()?.walk;
  if (walk) fake.advance(walk.arrivesAt - fake.ctx.now());
  const assay = colonist()?.assayUntil;
  if (assay) fake.advance(assay - fake.ctx.now());
}

/** A point a colonist steers to: map tiles when `space` is 'map', hall units when 'hall'. */
export interface SteerPoint {
  space: 'map' | 'hall';
  x: number;
  y: number;
}

/** A stick component as a phone sends it: in steps of 1/8, the vector no longer than 1 (protocol `steer`). */
const STICK_STEPS = 8;
const stick = (x: number, y: number) => {
  const length = Math.hypot(x, y) || 1;
  const round = (v: number, f: (n: number) => number) => f((v / length) * STICK_STEPS) / STICK_STEPS;
  const near = { x: round(x, Math.round), y: round(y, Math.round) };
  return Math.hypot(near.x, near.y) <= 1 ? near : { x: round(x, Math.trunc), y: round(y, Math.trunc) };
};

/**
 * The steering twin of tapThere (arcade spec C15): steers the seat's colonist through `route`, point by point, one
 * steer intent each time its direction changes, letting the fake clock run one development tick (`tickMs` real ms)
 * between looks, until it stands within `within` of the last point; then it lets go of the stick. Where it stands is
 * read from the shared view, as the TV reads it. Time moves only through the fake clock, so only the game's own
 * ctx.schedule timers run (HC-9). Returns the ticks it took; throws when a point is in another space than the
 * colonist (go through a door with pressAct first) or is not reached in `maxTicks`.
 */
export function steerTo(
  game: Pick<MuleGame, 'handle' | 'viewFor'>,
  fake: { advance: (ms: number) => void },
  seatId: string,
  route: readonly SteerPoint[],
  { tickMs = DEV_STEER.tickMs, within = 0.2, maxTicks = 2_000 }: { tickMs?: number; within?: number; maxTicks?: number } = {},
): number {
  const where = () => {
    const c = game.viewFor(null).players.find((p) => p.id === seatId)?.colonist;
    if (c?.x === undefined || c.y === undefined || !c.space) throw new Error(`${seatId} has no steered colonist`);
    return { space: c.space, x: c.x, y: c.y };
  };
  let sent = { x: 0, y: 0 };
  const steer = (x: number, y: number) => {
    if (x === sent.x && y === sent.y) return;
    sent = { x, y };
    game.handle(seatId, { type: 'steer', x, y });
  };
  let ticks = 0;
  for (const point of route) {
    for (;;) {
      const at = where();
      if (at.space !== point.space) throw new Error(`${seatId} is in the ${at.space}, the point is in the ${point.space}`);
      const dx = point.x - at.x;
      const dy = point.y - at.y;
      if (Math.hypot(dx, dy) <= within) break;
      if (ticks++ >= maxTicks) throw new Error(`${seatId} did not reach (${point.x}, ${point.y}) in ${maxTicks} ticks; stands at (${at.x}, ${at.y})`);
      const s = stick(dx, dy);
      steer(s.x, s.y);
      fake.advance(tickMs);
    }
  }
  steer(0, 0);
  return ticks;
}

/** The one button, pressed as a phone presses it, and one development tick for the tick to apply it. */
export function pressAct(game: Pick<MuleGame, 'handle'>, fake: { advance: (ms: number) => void }, seatId: string, { tickMs = DEV_STEER.tickMs }: { tickMs?: number } = {}): void {
  game.handle(seatId, { type: 'act' });
  fake.advance(tickMs);
}

/**
 * A seat ends its turn as a phone does with walking on: from its start outside a store door, in (Act), along the
 * walkway to the pub's room, and Act there. Its turn is over when this returns.
 */
export function steerToThePub(game: Pick<MuleGame, 'handle' | 'viewFor'>, fake: { advance: (ms: number) => void }, seatId: string): void {
  const pub = boxOf('pub');
  pressAct(game, fake, seatId);
  steerTo(game, fake, seatId, [
    { space: 'hall', ...HALL.spots.pub },
    { space: 'hall', x: (pub.x0 + pub.x1) / 2, y: (pub.y0 + pub.y1) / 2 },
  ]);
  pressAct(game, fake, seatId);
}

/** The first seed whose month-1 roll brings a colony lot for these seats, found by playing the engine, never by mocking its RNG. */
export function colonySeed(players: { id: string; name: string; isAi: boolean }[] = seats): number {
  for (let seed = 1; seed < 1_000; seed++) {
    const state = createGame({ seed, players });
    while (state.phase !== 'landGrant') advancePhase(state);
    advancePhase(state);
    if (state.landAuction?.lot?.seller === COLONY_SELLER) return seed;
  }
  throw new Error('no colony seed under 1000');
}
