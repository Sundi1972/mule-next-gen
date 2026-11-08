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
  GOOD_CONFIG,
  tileAt,
  tileIndex,
  type GameState,
  type LandGrantPlay,
  type Playbook,
  type Strategy,
} from '@mule/engine';
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

/** The brief's one line that starts with `head`. */
const lineOf = (text: string, head: string) => text.split('\n').find((l) => l.startsWith(head))!;

/** A Water MULE onto `plot`, then the pub. */
const waterOn = (plot: number) => [{ act: 'buyMule' }, { act: 'outfit', outfit: 'water' }, { act: 'install', plot }, { act: 'pub' }];

describe('hands-refusals fix: a plot the floor never walks to is one no MULE can be installed on', () => {
  it('hands-refusals fix: FM-no-walk: the land brief marks a plot no walk reaches (seed 14\'s cut-off plains) wherever it names it, and no longer the corner-shore lake the hands now reach (seed 4, plot 25)', () => {
    // Seed 14's plains pocket: land, so not a lake, and no walk reaches it.
    const pocket = game(14);
    const plains = tileIndex(pocket.width, 13, 6);
    expect(pocket.tiles[plains]!.terrain).toBe('plains');
    expect(unreachablePlot(pocket, plains)).toBe(true);
    const landGrant: LandGrantPlay = { ranked: [{ plot: plains, value: 40 }], pressShare: { start: 0.8, end: 0.4 }, deny: [], planB: [], claims: 1 };
    expect(lineOf(landBrief(pocket, mind, PERSONAS.trader, { strategy: STRATEGY, landGrant }, []).text, 'Ranked:')).toBe(`Ranked: plot ${plains} cut off: no MULE can be installed (40 cr)`);
    pocket.tiles[plains]!.owner = 'p0';
    const route = { route: waterOn(plains) as NonNullable<Playbook['development']>['route'], timeBudgetMs: 30_000, ifSoldOut: 'pub' as const };
    const pocketText = landBrief(pocket, mind, PERSONAS.trader, { strategy: STRATEGY, landGrant: { ...landGrant, ranked: [] } }, [], {}, route).text;
    expect(lineOf(pocketText, 'Seat 0 (you):')).toBe(`Seat 0 (you): 1 plot — plot ${plains} cut off: no MULE can be installed`);
    expect(lineOf(pocketText, 'Route:')).toBe(`Route: buy a MULE, outfit it for Water, install it on plot ${plains} (cut off: no MULE can be installed), the pub.`);

    // The deep4 case (2-4 AI 1 routed onto it six months): a lake whose only shore is a corner. Since WS1's walk prices a
    // lake from its shore stands, corners included, the hands reach it, so the brief shows it as any idle plot.
    const state = game(4);
    const corner = tileIndex(state.width, 10, 1);
    expect(state.tiles[corner]!.terrain).toBe('lake');
    expect(unreachablePlot(state, corner)).toBe(false);
    state.tiles[corner]!.owner = 'p0';
    expect(lineOf(landBrief(state, mind, PERSONAS.trader, { strategy: STRATEGY, landGrant: { ...landGrant, ranked: [] } }, []).text, 'Seat 0 (you):')).toBe(`Seat 0 (you): 1 plot — plot ${corner} idle`);
  });

  it('hands-refusals fix: FM-no-walk: whatIf refuses a route MULE onto a plot no walk reaches, with why, and not one onto the corner-shore lake the hands now reach', async () => {
    const whatIf = async (state: GameState, me: string, plot: number) => {
      const sim: WhatIfSim = {
        seats: state.players.map((p, i) => ({ id: p.id, persona: 'trader', level: 'trader', seed: 500 + i })),
        playbook: () => ({
          playbook: { v: 1, seat: me, month: state.month, phase: 'planning', strategy: { ...STRATEGY, reason: 'test' }, by: 'engine' } satisfies Playbook,
          rejected: [],
        }),
      };
      const answer = JSON.parse((await toolsFor(state, me, sim).run('whatIf', { edits: [{ path: '/development/route', to: waterOn(plot) }] })).content) as {
        rejected: { path: string; to: unknown; why: string }[];
      };
      return answer.rejected;
    };
    const pocket = game(14, ['a', 'b', 'c', 'd']);
    const plains = tileIndex(pocket.width, 13, 6);
    tileAt(pocket.tiles, pocket.width, 13, 6)!.owner = 'a';
    // The playbook gate refuses it (validate.ts's install check, as unreachablePlot judges it), naming the step.
    expect(await whatIf(pocket, 'a', plains)).toEqual([{ path: '/development/route', to: waterOn(plains), why: `route: no walk reaches plot ${plains}, step 2` }]);

    const state = game(4, ['a', 'b', 'c', 'd']);
    const corner = tileIndex(state.width, 10, 1);
    tileAt(state.tiles, state.width, 10, 1)!.owner = 'a';
    expect(await whatIf(state, 'a', corner)).toEqual([]);
  });
});

describe('hands-refusals fix: a sweep that spoils Energy or Water whole', () => {
  const saved = { energy: GOOD_CONFIG.energy.spoilage, water: GOOD_CONFIG.water.spoilage };
  afterEach(() => {
    GOOD_CONFIG.energy.spoilage = saved.energy;
    GOOD_CONFIG.water.spoilage = saved.water;
  });

  it("hands-refusals fix: FM-energy-spoils-whole: with GOOD_CONFIG.energy.spoilage at 1 the auction brief comes back, and its Energy line says no holding covers next month's use", () => {
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

  it("hands-refusals fix: FM-water-spoils-whole: with GOOD_CONFIG.water.spoilage at 1 the auction brief comes back, and its Water line says it all spoils at upkeep, not that the depot is too small", () => {
    const state = game(7);
    // A Food plot, so next production checks Water.
    const plot = state.tiles.findIndex((t) => t.terrain === 'plains');
    Object.assign(state.tiles[plot]!, { owner: 'p0', outfit: 'food' });
    GOOD_CONFIG.water.spoilage = 1;
    const draft: Playbook = {
      v: 1,
      seat: 'p0',
      month: 1,
      phase: 'auction',
      strategy: STRATEGY,
      auction: { water: { role: 'buyer', hold: 3, walkAway: 70, start: 40, concedeCrPerS: 3, bluff: false, vsRival: 'hold' } },
      by: 'engine',
    };
    const line = phaseBrief(state, mind, PERSONAS.trader, draft, 'auction', []).text.match(/Water in units: [^\n]*/)?.[0];
    expect(line).toMatch(/100% of what is left after it spoils at upkeep, so no holding keeps your Food plot whole next month\.$/);
    expect(line).not.toMatch(/depot/);
  });
});
