/** A stand-in playbook source on the frozen v1 types, until the engine drafts and validates playbooks itself. */
import { AI_LEVELS, AI_PERSONAS, GAME, observe, type GameState, type Playbook, type Strategy } from '@mule/engine';
import { landDecision, type Mind, type PlanEdit, type ValidatePlan } from '@mule/ai';
import type { MuleView } from '@mule/protocol';
import type { MuleIntent } from '@mule/protocol';
import type { Game, GameContext } from '@tabletop/core';
import { vi } from 'vitest';
import type { PlaybookSource } from '../src/brain/playbooks.js';

// No runtime import of the server's game here: a test may mock the playbooks module with this file's stub source.

/** The draft's press share: an edit out of bounds leaves this value. */
export const ENGINE_PRESS = { start: 0.9, end: 0.4 };

const draftStrategy = (state: GameState): Strategy => ({
  kind: 'builder',
  moneyMaker: null,
  monopolyTarget: null,
  cashFloor: 0,
  landTarget: { plots: 4, byMonth: state.maxMonths },
  stances: {},
  reason: 'The engine draft.',
});

/** Bounds chosen for the tests: claims 0..claimsPerGrant, press share 0 ≤ end ≤ start ≤ 1, a ranking as plot values. */
const BOUNDS: Record<string, (to: unknown) => boolean> = {
  '/landGrant/ranked': (to) => Array.isArray(to) && to.every((r) => Number.isInteger(r?.plot) && typeof r?.value === 'number'),
  '/landGrant/claims': (to) => Number.isInteger(to) && (to as number) >= 0 && (to as number) <= GAME.claimsPerGrant,
  '/landGrant/pressShare': (to) => {
    const p = to as { start?: unknown; end?: unknown } | null;
    return typeof p?.start === 'number' && typeof p.end === 'number' && p.end >= 0 && p.end <= p.start && p.start <= 1;
  },
};
const STRATEGY_FIELDS = ['kind', 'moneyMaker', 'monopolyTarget', 'cashFloor', 'reason'];

/** Each edit in bounds is set on a copy of the draft; any other is refused with its reason and the draft's value stays. */
export const boundsValidate: ValidatePlan = (_state, _seat, draft, edits: readonly PlanEdit[]) => {
  const playbook = structuredClone(draft);
  const rejected: NonNullable<Playbook['rejected']> = [];
  const applied: NonNullable<Playbook['edits']> = [];
  for (const e of edits) {
    const field = e.path.startsWith('/strategy/') ? e.path.slice('/strategy/'.length) : null;
    if (field !== null && STRATEGY_FIELDS.includes(field)) {
      const strategy = playbook.strategy as unknown as Record<string, unknown>;
      applied.push({ path: e.path, from: strategy[field], to: e.to, reason: e.reason });
      strategy[field] = e.to;
      continue;
    }
    const inBounds = BOUNDS[e.path];
    if (!inBounds?.(e.to) || !playbook.landGrant) {
      rejected.push({ path: e.path, to: e.to, why: 'out of bounds' });
      continue;
    }
    const key = e.path.slice('/landGrant/'.length) as 'ranked' | 'claims' | 'pressShare';
    applied.push({ path: e.path, from: playbook.landGrant[key], to: e.to, reason: e.reason });
    (playbook.landGrant as unknown as Record<string, unknown>)[key] = structuredClone(e.to);
  }
  return { playbook: { ...playbook, edits: applied }, rejected };
};

/** The seat's land ranking as a Trader of the trader persona would rank it, from its own observation. */
function rankingOf(state: GameState, seat: string) {
  const mind: Mind = { me: seat, personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader };
  const top = landDecision(observe(state, seat), mind).options[0];
  return (top?.action.ranking ?? []).map((s) => ({ plot: s.index, value: Math.round(s.value) }));
}

/** A source whose draft claims by the seat's own land ranking at ENGINE_PRESS, and whose validator is boundsValidate. */
export function stubSource(validate: ValidatePlan = boundsValidate): PlaybookSource {
  return {
    draft(state, seat) {
      const strategy = draftStrategy(state);
      const landGrant = { ranked: rankingOf(state, seat), pressShare: { ...ENGINE_PRESS }, deny: [], planB: [], claims: GAME.claimsPerGrant as 0 | 1 | 2 };
      const playbook: Playbook = { v: 1, seat, month: state.month, phase: 'landGrant', strategy, landGrant, by: 'engine' };
      return { playbook, land: { strategy: structuredClone(strategy), landGrant: structuredClone(landGrant) } };
    },
    validate,
  };
}

/** Game time per step of the table's clock. */
const STEP_MS = 100;
/** How long the people read planning and the month end before they all press Ready: neither has a clock. */
export const READ_MS = 3_000;

/**
 * Runs a table on the game's manual clock until `done` holds for the board's view, or game over: the people press
 * Ready READ_MS into planning and into the month end, and the model's replies settle between steps (vi's fake timers).
 * Returns each phase's start as the views showed it: month, phase, and the game time it opened.
 */
export async function runTable(game: Pick<Game<MuleIntent, MuleView>, 'viewFor' | 'handle'>, fake: { ctx: GameContext; advance: (ms: number) => void }, done: (view: MuleView) => boolean) {
  const starts: [number, string, number][] = [];
  let readFor = 0;
  for (let t = 0; t < 30 * 60_000; t += STEP_MS) {
    const view = game.viewFor(null);
    const last = starts.at(-1);
    if (!last || last[0] !== view.month || last[1] !== view.phase) {
      starts.push([view.month, view.phase, fake.ctx.now()]);
      readFor = 0;
    }
    if (view.phase === 'gameOver' || done(view)) break;
    readFor += STEP_MS;
    if ((view.phase === 'planning' || view.phase === 'upkeep') && readFor >= READ_MS) {
      for (const p of view.players) if (!p.isAi && game.viewFor(null).phase === view.phase) game.handle(p.id, { type: 'ready' });
    }
    fake.advance(STEP_MS);
    await vi.advanceTimersByTimeAsync(0);
  }
  return starts;
}
