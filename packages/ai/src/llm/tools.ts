import { allPrices, BRAIN, observe, scoreParts, type GameState, type Phase, type Playbook, type PlayerId } from '@mule/engine';
import { playMonthFrom, type MonthSeat } from '../play.js';
import type { PlanEdit } from '../playbook/index.js';
import { MOVES } from './moves-stub.js';

/**
 * The game's tools for Claude while it writes a seat's strategy and playbook (C9). Each definition is MCP-shaped, so a
 * real MCP server later wraps them unchanged. Each answer comes from the seat's observation, or the board's public
 * rows, in process: no model or network call, and no change to the game.
 */
export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

/** A tool's answer as the API takes it: JSON text, and is_error with a code instead of the reason a handler failed. */
export interface ToolResult {
  content: string;
  is_error?: true;
}

/** Every phase a move can be sent in; the type keeps it complete when the engine adds one. */
const PHASE_SET: { readonly [P in Exclude<Phase, 'gameOver'>]: true } = {
  planning: true,
  landGrant: true,
  landAuction: true,
  development: true,
  production: true,
  auction: true,
  upkeep: true,
};
const PHASES = Object.keys(PHASE_SET) as Phase[];

export const TOOL_DEFS: readonly ToolDef[] = [
  {
    name: 'legalMoves',
    description:
      'The moves of a phase (the current one by default): what each does, when it may be sent, and what it costs you now; and the store prices now.',
    input_schema: { type: 'object', properties: { phase: { type: 'string', enum: [...PHASES] } } },
  },
  {
    name: 'worth',
    description: 'Your Worth now, line by line, as the game counts it at the end: money, goods, land, MULEs, office, and the Collapse cut.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'standings',
    description: "Every seat's Worth now, as the board shows it: a total per seat, best first.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'whatIf',
    description:
      'Plays your playbook with these edits over one month on a copy of what you can see, and returns your Worth after it, with any edit the rules refused (the draft value played instead). A few plays per answer.',
    input_schema: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          items: { type: 'object', properties: { path: { type: 'string' }, to: {}, reason: { type: 'string' } }, required: ['path', 'to'] },
        },
      },
      required: ['edits'],
    },
  },
];

const ok = (value: unknown): ToolResult => ({ content: JSON.stringify(value) });
const error = (code: string): ToolResult => ({ content: JSON.stringify({ error: code }), is_error: true });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The tools for one seat, fixed at the moment they are made: the observation is taken now, so a game that moves on
 * while the model thinks changes no answer. `run` never throws.
 */
/** The tools offered to the model with a month sim for whatIf: all of them. Without one, whatIf is left out. */
export const OFFERED: readonly ToolDef[] = TOOL_DEFS;
const WITHOUT_SIM: readonly ToolDef[] = TOOL_DEFS.filter((d) => d.name !== 'whatIf');

/** What whatIf plays the month with: every player's seat, and the seat's playbook for the month with edits applied. */
export interface WhatIfSim {
  seats: readonly MonthSeat[];
  /** The playbook the edits make of the seat's draft, stamped for the month played, and the edits the rules refused. */
  playbook(edits: readonly PlanEdit[]): { playbook: Playbook; rejected: NonNullable<Playbook['rejected']> };
}

const isEdit = (e: unknown): e is PlanEdit => isObject(e) && typeof e.path === 'string' && 'to' in e;

export function toolsFor(state: GameState, seat: PlayerId, sim?: WhatIfSim): { definitions: readonly ToolDef[]; run(name: string, input: unknown): ToolResult } {
  const obs = observe(state, seat);
  let played = 0;
  // Public on every row of the board, so read from the game itself: the totals only.
  const standings = state.players
    .map((p) => ({ seat: p.id, name: p.name, worth: scoreParts(state, p.id).total }))
    .sort((a, b) => b.worth - a.worth);

  const handlers: Record<string, (input: Record<string, unknown>) => ToolResult> = {
    legalMoves: (input) => {
      const phase = input.phase === undefined ? obs.phase : input.phase;
      if (typeof phase !== 'string' || !(PHASES as readonly string[]).includes(phase)) return error('bad_input');
      const moves = Object.values(MOVES)
        .filter((m) => (m.phases as readonly string[]).includes(phase))
        .map((m) => ({ type: m.type, does: m.does(), legalWhen: m.legalWhen(), cost: m.cost ? m.cost(obs, seat) : null }));
      return ok({ phase, prices: allPrices(obs), moves });
    },
    worth: () => ok(scoreParts(obs, seat)),
    standings: () => ok(standings),
    // The month is played on what the seat can see, every rival as the engine would play it, with no production event.
    whatIf: (input) => {
      if (!Array.isArray(input.edits) || !input.edits.every(isEdit)) return error('bad_input');
      if (!sim) return error('unavailable');
      if (played >= BRAIN.whatIfsPerWrite) return error('limit');
      played++;
      const edits = input.edits.map((e) => ({ path: e.path, to: e.to, reason: typeof e.reason === 'string' ? e.reason : '' }));
      const { playbook, rejected } = sim.playbook(edits);
      const seats = sim.seats.map((s) => (s.id === seat ? { ...s, playbook } : s));
      // observe() zeroes the seed: the month's dice are none of the live game's.
      const month = playMonthFrom(obs, seats, 0);
      return ok({ month: month.month, worth: scoreParts(month.state, seat), rejected });
    },
  };

  return {
    definitions: sim ? OFFERED : WITHOUT_SIM,
    run(name, input) {
      const handler = handlers[name];
      if (!handler) return error('unknown_tool');
      if (!isObject(input)) return error('bad_input');
      try {
        return handler(input);
      } catch {
        return error('tool_failed');
      }
    },
  };
}
