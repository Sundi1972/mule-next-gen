/**
 * Hands-refusals fix (deep4 diaries, sonnet error 3): Claude's routes were refused by the hands in ways its brief never
 * warned of. 16 installs ended "stale: the walk takes Infinity s" on plots the brief called "idle": lakes whose only
 * open neighbour is a corner, so a shore stand exists (unreachablePlot says reachable) but the floor's walk, which
 * moves on sides, finds no path to it. The brief and whatIf must treat a plot the floor's walk never reaches as one no
 * MULE can be installed on. And an auction brief must come back when a sweep sets Energy to spoil whole.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  AI_LEVELS,
  AI_PERSONAS,
  createGame,
  floorConfig,
  GOOD_CONFIG,
  tileAt,
  tileIndex,
  type GameState,
  type LandGrantPlay,
  type Playbook,
  type Strategy,
} from '@mule/engine';
import { doorTable } from '../src/floor-time.js';
import { unreachablePlot } from '../src/hands/develop.js';
import { landBrief, phaseBrief } from '../src/llm/brief.js';
import { toolsFor, type WhatIfSim } from '../src/llm/tools.js';
import { PERSONAS } from '../src/personas.js';
import type { LandDraft } from '../src/playbook/index.js';
import type { Mind } from '../src/value.js';

const mind: Mind = { me: 'p0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader, salt: 3 };
const STRATEGY: Strategy = { kind: 'builder', moneyMaker: 'water', monopolyTarget: null, cashFloor: 0, landTarget: { plots: 6, byMonth: 6 }, stances: {}, reason: 'Grow steady.' };
const LAKE_MARK = 'lake: no MULE can be installed';

const game = (seed: number, ids = ['p0', 'p1', 'p2', 'p3']) => createGame({ seed, players: ids.map((id, i) => ({ id, name: `Seat ${i}`, isAi: true })) });

/** Ground truth from the floor itself: no door of the store has a walk to the plot that ends. */
const noWalk = (state: GameState, plot: number) => [...doorTable(state, floorConfig()).values()].every((walks) => walks[plot]!.seconds === Infinity);

/** The brief's one line that starts with `head`. */
const lineOf = (text: string, head: string) => text.split('\n').find((l) => l.startsWith(head))!;

/** A Water MULE onto `plot`, then the pub. */
const waterOn = (plot: number) => [{ act: 'buyMule' }, { act: 'outfit', outfit: 'water' }, { act: 'install', plot }, { act: 'pub' }];

describe('hands-refusals fix: a plot the floor never walks to is one no MULE can be installed on', () => {
  it('hands-refusals fix: the land brief marks a lake whose only shore is a corner (seed 4, plot 25: 2-4 AI 1 routed onto it six months) wherever it names it, and a cut-off plains plot too', () => {
    const state = game(4);
    const corner = tileIndex(state.width, 10, 1);
    // The deep4 case: a shore stand exists, so the hands' lake check passes, but no walk reaches it.
    expect(state.tiles[corner]!.terrain).toBe('lake');
    expect(unreachablePlot(state, corner)).toBe(false);
    expect(noWalk(state, corner)).toBe(true);

    // Free and ranked: the land plans and the draft ranking mark it.
    const landGrant: LandGrantPlay = { ranked: [{ plot: corner, value: 40 }], pressShare: { start: 0.8, end: 0.4 }, deny: [], planB: [], claims: 1 };
    const draft: LandDraft = { strategy: STRATEGY, landGrant };
    expect(lineOf(landBrief(state, mind, PERSONAS.trader, draft, []).text, 'Ranked:')).toBe(`Ranked: plot ${corner} ${LAKE_MARK} (40 cr)`);

    // Owned: the seat's plot line marks it in place of idle, and the drafted route's install on it is marked.
    state.tiles[corner]!.owner = 'p0';
    const route = { route: waterOn(corner) as NonNullable<Playbook['development']>['route'], timeBudgetMs: 30_000, ifSoldOut: 'pub' as const };
    const text = landBrief(state, mind, PERSONAS.trader, { strategy: STRATEGY, landGrant: { ...landGrant, ranked: [] } }, [], {}, route).text;
    expect(lineOf(text, 'Seat 0 (you):')).toBe(`Seat 0 (you): 1 plot — plot ${corner} ${LAKE_MARK}`);
    expect(lineOf(text, 'Route:')).toBe(`Route: buy a MULE, outfit it for Water, install it on plot ${corner} (${LAKE_MARK}), the pub.`);

    // Seed 14's plains pocket: land, so not a lake, and no walk reaches it either.
    const pocket = game(14);
    const plains = tileIndex(pocket.width, 13, 6);
    expect(pocket.tiles[plains]!.terrain).toBe('plains');
    expect(noWalk(pocket, plains)).toBe(true);
    pocket.tiles[plains]!.owner = 'p0';
    const pocketText = landBrief(pocket, mind, PERSONAS.trader, { strategy: STRATEGY, landGrant: { ...landGrant, ranked: [] } }, []).text;
    expect(lineOf(pocketText, 'Seat 0 (you):')).toBe(`Seat 0 (you): 1 plot — plot ${plains} cut off: no MULE can be installed`);
  });

  it("hands-refusals fix: whatIf refuses a route MULE onto a plot no walk reaches, on its install step, with why, where the hands would refuse it a turn later as 'the walk takes Infinity s'", async () => {
    const state = game(4, ['a', 'b', 'c', 'd']);
    const corner = tileIndex(state.width, 10, 1);
    tileAt(state.tiles, state.width, 10, 1)!.owner = 'a';
    expect(noWalk(state, corner)).toBe(true);
    const sim: WhatIfSim = {
      seats: state.players.map((p, i) => ({ id: p.id, persona: 'trader', level: 'trader', seed: 500 + i })),
      playbook: () => ({
        playbook: { v: 1, seat: 'a', month: state.month, phase: 'planning', strategy: { ...STRATEGY, reason: 'test' }, by: 'engine' } satisfies Playbook,
        rejected: [],
      }),
    };
    const answer = JSON.parse((await toolsFor(state, 'a', sim).run('whatIf', { edits: [{ path: '/development/route', to: waterOn(corner) }] })).content) as {
      rejected: { path: string; to: unknown; why: string }[];
    };
    expect(answer.rejected).toEqual([{ path: '/development/route/2', to: { act: 'install', plot: corner }, why: `route step 2: lake: no walk reaches plot ${corner}` }]);
  });
});

describe('hands-refusals fix: a sweep that spoils Energy whole', () => {
  const saved = GOOD_CONFIG.energy.spoilage;
  afterEach(() => {
    GOOD_CONFIG.energy.spoilage = saved;
  });

  it("hands-refusals fix: with GOOD_CONFIG.energy.spoilage at 1 the auction brief comes back, and its Energy line says no holding covers next month's use", () => {
    const state = game(7);
    // A Food plot, so next production uses Energy.
    const plot = state.tiles.findIndex((t) => t.terrain === 'plains');
    Object.assign(state.tiles[plot]!, { owner: 'p0', outfit: 'food' });
    GOOD_CONFIG.energy.spoilage = 1;
    const draft: Playbook = {
      v: 1,
      seat: 'p0',
      month: 1,
      phase: 'auction',
      strategy: STRATEGY,
      auction: { energy: { role: 'buyer', hold: 3, walkAway: 70, start: 40, concedeCrPerS: 3, bluff: false, vsRival: 'hold' } },
      by: 'engine',
    };
    const text = phaseBrief(state, mind, PERSONAS.trader, draft, 'auction', []).text;
    expect(text.match(/Energy — [^\n]*/)?.[0]).toMatch(/100% of what you hold spoils at upkeep.*no holding covers it/);
  });
});
