import {
  allPrices,
  BRAIN,
  buyMule,
  DEV_STEER,
  floorConfig,
  installMule,
  observe,
  outfitMule,
  RuleError,
  scoreParts,
  type DevelopmentPlay,
  type GameState,
  type Phase,
  type Playbook,
  type PlayerId,
} from '@mule/engine';
import { routeVeto } from '../hands/develop.js';
import { monthSteps, type MonthSeat } from '../play.js';
import type { AiSeat } from '../seat.js';
import type { Mind } from '../value.js';
import type { PlanEdit } from '../playbook/index.js';
import { MOVES } from './moves-stub.js';
import { newPlots, ownedPlots, resolveGranted } from './granted.js';

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
  /** Awaited between the month's steps, so the caller can let other work run; without it the month plays straight through. */
  pause?: () => Promise<void> | undefined;
}

const isEdit = (e: unknown): e is PlanEdit => isObject(e) && typeof e.path === 'string' && 'to' in e;

const ROUTE_PATH = '/development/route';
/** A route MULE's three steps: its buyMule, outfit and install, as the rules' route grammar reads them. */
const MULE_STEPS = 3; // literal-ok: buyMule, outfit, install

/**
 * The MULEs of `route` the hands would refuse at development's start `at`, each named on its install step with
 * routeVeto's reason. Each is judged on the state as its turn comes: the MULEs before it bought, fitted and installed
 * by the engine's own moves. On the floor every development walks (C6), so a lake plot no shore reaches is refused,
 * as in play; the walk's clock is not known here, so a walk too long for it is not. A refused MULE is judged as
 * dropped: the pick the hands would queue in its place is not played, so a later MULE's cash floor may differ.
 */
function handsRefuse(at: GameState, mind: Mind, route: DevelopmentPlay['route']): NonNullable<Playbook['rejected']> {
  const refused: NonNullable<Playbook['rejected']> = [];
  const view = structuredClone(at);
  // With steering off a tap installs on any lake, so the lake refusal is the floor's only.
  const floor = DEV_STEER.on ? floorConfig() : undefined;
  for (let i = 0; i < route.length; i++) {
    if (route[i]!.act !== 'buyMule') continue;
    const outfit = route[i + 1]!.outfit!;
    const install = i + MULE_STEPS - 1;
    const plot = route[install]!.plot!;
    i = install;
    const veto = routeVeto(view, mind, { plot, outfit }, undefined, floor);
    if (veto) {
      refused.push({ path: `${ROUTE_PATH}/${install}`, to: route[install], why: `route step ${install}: ${veto}` });
      continue;
    }
    // As the hands play it: a MULE it leads is this one, not bought again; one fitted already keeps its outfit.
    const me = view.players.find((p) => p.id === mind.me)!;
    const tile = view.tiles[plot]!;
    try {
      if (me.carriedMule === null) buyMule(view, mind.me);
      if (me.carriedMule === 'empty') outfitMule(view, mind.me, outfit);
      installMule(view, mind.me, tile.x, tile.y);
    } catch (err) {
      if (!(err instanceof RuleError)) throw err;
    }
  }
  return refused;
}

/** Whether `kept` is the sent route or the part of it the validator kept (its first steps). */
function keptFrom(sent: unknown, kept: DevelopmentPlay['route']): boolean {
  return Array.isArray(sent) && kept.length <= sent.length && kept.every((step, i) => JSON.stringify(step) === JSON.stringify(sent[i]));
}

export function toolsFor(state: GameState, seat: PlayerId, sim?: WhatIfSim): { definitions: readonly ToolDef[]; run(name: string, input: unknown): Promise<ToolResult> } {
  const obs = observe(state, seat);
  // The seat's plots as the tools were made, when the write was asked: a route's "granted" plot is one gained since.
  const ownedAtAsk = ownedPlots(obs, seat);
  let played = 0;
  // Public on every row of the board, so read from the game itself: the totals only.
  const standings = state.players
    .map((p) => ({ seat: p.id, name: p.name, worth: scoreParts(state, p.id).total }))
    .sort((a, b) => b.worth - a.worth);

  const handlers: Record<string, (input: Record<string, unknown>) => ToolResult | Promise<ToolResult>> = {
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
    whatIf: async (input) => {
      if (!Array.isArray(input.edits) || !input.edits.every(isEdit)) return error('bad_input');
      if (!sim) return error('unavailable');
      if (played >= BRAIN.whatIfsPerWrite) return error('limit');
      played++;
      const edits = input.edits.map((e) => ({ path: e.path, to: e.to, reason: typeof e.reason === 'string' ? e.reason : '' }));
      // The development's edits go onto its draft as the month's development starts, as they do in play (AM-A17).
      const isDevelopment = (e: PlanEdit) => e.path.startsWith('/development/');
      const development = edits.filter(isDevelopment);
      const { playbook, rejected } = sim.playbook(edits.filter((e) => !isDevelopment(e)));
      const seats = sim.seats.map((s) => (s.id === seat ? { ...s, playbook } : s));
      const atDevelopment: NonNullable<Playbook['rejected']> = [];
      const editDevelopment = (s: AiSeat, draft: Playbook, at: GameState): readonly PlanEdit[] | null => {
        if (s.id !== seat || draft.phase !== 'development' || development.length === 0) return null;
        // A route's "granted" plot is the one the seat gained in the month played, as in play (B fix 4 a).
        const { edits: resolved, dropped } = resolveGranted(development, newPlots(at, seat, ownedAtAsk, playbook.landGrant?.ranked ?? []));
        atDevelopment.push(...dropped);
        if (resolved.length === 0) return null;
        const checked = s.validator()(at, seat, draft, resolved);
        atDevelopment.push(...checked.rejected);
        // The route the edits make, as the hands would play it: each MULE they would refuse is named (hands fix 1).
        // Only the sent route's kept steps are judged: a route refused outright leaves the draft's, which the model never sent.
        const sent = resolved.find((e) => e.path === ROUTE_PATH)?.to;
        const kept = checked.playbook.development?.route ?? [];
        if (keptFrom(sent, kept)) atDevelopment.push(...handsRefuse(at, s.mind, kept));
        return resolved;
      };
      // observe() zeroes the seed: the month's dice are none of the live game's.
      const steps = monthSteps(obs, seats, 0, { edits: editDevelopment });
      let step = steps.next();
      while (!step.done) {
        await sim.pause?.();
        step = steps.next();
      }
      return ok({ month: step.value.month, worth: scoreParts(step.value.state, seat), rejected: [...rejected, ...atDevelopment] });
    },
  };

  return {
    definitions: sim ? OFFERED : WITHOUT_SIM,
    async run(name, input) {
      const handler = handlers[name];
      if (!handler) return error('unknown_tool');
      if (!isObject(input)) return error('bad_input');
      try {
        return await handler(input);
      } catch {
        return error('tool_failed');
      }
    },
  };
}
