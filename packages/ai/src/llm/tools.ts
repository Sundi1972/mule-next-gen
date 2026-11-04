import { allPrices, observe, scoreParts, type GameState, type Phase, type PlayerId } from '@mule/engine';
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
    description: 'Plays your playbook with these edits over one month on a copy of what you can see, and returns your Worth after it.',
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
/** The tools offered to the model: whatIf waits for the one-month engine sim it plays on, so it is not offered yet. */
export const OFFERED: readonly ToolDef[] = TOOL_DEFS.filter((d) => d.name !== 'whatIf');

export function toolsFor(state: GameState, seat: PlayerId): { definitions: readonly ToolDef[]; run(name: string, input: unknown): ToolResult } {
  const obs = observe(state, seat);
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
    // The one-month engine sim to play it on is not there yet: it answers so, and the loop goes on.
    whatIf: (input) => (Array.isArray(input.edits) ? error('unavailable') : error('bad_input')),
  };

  return {
    definitions: OFFERED,
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
