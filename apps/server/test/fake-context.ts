import { advancePhase, COLONY_SELLER, createGame, DEV_STEER, type GameState } from '@mule/engine';
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
export function toDevelopment(options: { players?: SeatInfo[]; phaseScale?: number; claimer?: string; firstMonthWaits?: boolean; prepare?: (state: GameState) => void } = {}) {
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

function playToDevelopment(options: { players?: SeatInfo[]; phaseScale?: number; claimer?: string; prepare?: (state: GameState) => void }) {
  const fake = fakeContext({ table: options.players ?? seats });
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

/** The first human seat of a table: who hosts it while every phone is connected. */
export function firstHuman(table: { id: string; isAi: boolean }[]): string | null {
  return table.find((s) => !s.isAi)?.id ?? null;
}

/**
 * A game context with a manual clock. `waits` is the wait each scheduled timer
 * was given; `onChanged` is called with the clock's time on every `changed()`.
 * The host is `table`'s first human seat (`seats` by default) unless `host` names
 * another or none; `setHost` passes hosting on, as the room does when a phone drops.
 */
export function fakeContext(options: { onChanged?: (at: number) => void; table?: { id: string; isAi: boolean }[]; host?: string | null } = {}) {
  let now = 0;
  let host = options.host === undefined ? firstHuman(options.table ?? seats) : options.host;
  const waits: number[] = [];
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
    frame: () => {},
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
  return { ctx, advance, hold, waits, setHost };
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
