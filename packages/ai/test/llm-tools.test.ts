import { describe, expect, it } from 'vitest';
import { BRAIN, createGame, tileAt, tileIndex, type GameState, type Playbook } from '@mule/engine';
import { unreachablePlot } from '../src/hands/develop.js';
import { OFFERED, TOOL_DEFS, toolsFor, type ToolResult, type WhatIfSim } from '../src/llm/tools.js';

const fixture = (): GameState =>
  createGame({
    seed: 7,
    players: [
      { id: 'a', name: 'Ada', isAi: true },
      { id: 'b', name: 'Bo', isAi: false },
      { id: 'c', name: 'Cy', isAi: false },
    ],
  });

/** One sample input per tool, the shape its input_schema asks for. */
const SAMPLE: Record<string, unknown> = {
  legalMoves: {},
  worth: {},
  standings: {},
  whatIf: { edits: [] },
};

/** The month sim for seat `a` of `state`: every player a Trader with its own seed; its playbook a bare strategy, and every edit refused. */
const simFor = (state: GameState): WhatIfSim => ({
  seats: state.players.map((p, i) => ({ id: p.id, persona: 'trader', level: 'trader', seed: 500 + i })),
  playbook: (edits) => ({
    playbook: {
      v: 1,
      seat: 'a',
      month: state.phase === 'upkeep' ? state.month + 1 : state.month,
      phase: 'planning',
      strategy: { kind: 'builder', moneyMaker: null, monopolyTarget: null, cashFloor: 0, landTarget: { plots: 3, byMonth: 3 }, stances: {}, reason: 'test' },
      by: 'engine',
    } satisfies Playbook,
    rejected: edits.map((e) => ({ path: e.path, to: e.to, why: 'out of bounds' })),
  }),
});

/** What every tool answers seat `a`, by tool name. */
async function answers(state: GameState): Promise<Record<string, ToolResult>> {
  const tools = toolsFor(state, 'a', simFor(state));
  const out: Record<string, ToolResult> = {};
  for (const d of TOOL_DEFS) out[d.name] = await tools.run(d.name, SAMPLE[d.name]);
  return out;
}

const parsed = async (answer: Promise<ToolResult>) => JSON.parse((await answer).content) as unknown;

describe("Claude's tools (C9)", () => {
  it('T-AC-A9: every tool is MCP-shaped and has a sample here', () => {
    expect(TOOL_DEFS.map((d) => d.name).sort()).toEqual(Object.keys(SAMPLE).sort());
    for (const d of TOOL_DEFS) {
      expect(d.description, d.name).toMatch(/\S/);
      expect(d.input_schema, d.name).toMatchObject({ type: 'object' });
    }
  });

  it("T-AC-A9: no tool result carries another seat's goods or unanalysed ground: changing only those changes no answer but standings' public totals", async () => {
    const plain = fixture();
    const hidden = fixture();
    // A rival's goods, moved between the two rivals so the colony's total (public, as market cover) stays the same,
    // and a plot nobody analysed: distinctive values, so a leak is unmistakable.
    plain.players.find((p) => p.id === 'b')!.stock.crystite = 4_711;
    hidden.players.find((p) => p.id === 'c')!.stock.crystite = 4_711;
    const unanalysed = hidden.tiles.findIndex((t) => t.terrain !== 'store' && t.owner === null);
    hidden.tiles[unanalysed]!.ground = { ...hidden.tiles[unanalysed]!.ground, crystite: 4 };
    hidden.tiles[unanalysed]!.traits = ['hotSpring'];

    const a = await answers(plain);
    const b = await answers(hidden);
    for (const name of Object.keys(a)) {
      if (name === 'standings') continue;
      expect(b[name], name).toEqual(a[name]);
      expect(b[name]!.content, name).not.toContain('4711');
    }
    // Standings are each seat's public Worth, as every row of the board shows it: totals only, never their goods.
    const rows = JSON.parse(b.standings!.content) as Record<string, unknown>[];
    for (const row of rows) expect(Object.keys(row).sort(), JSON.stringify(row)).toEqual(['name', 'seat', 'worth']);
  });

  it('T-AC-A9: no tool, whatIf included, changes the live game state', async () => {
    const state = fixture();
    const before = structuredClone(state);
    const tools = toolsFor(state, 'a', simFor(state));
    for (const d of TOOL_DEFS) await tools.run(d.name, SAMPLE[d.name]);
    await tools.run('nope', {});
    await tools.run('worth', 'not an object');
    expect(state).toEqual(before);
  });

  it('whatIf is offered only with a month sim to play on; without one it answers unavailable', async () => {
    const state = fixture();
    expect(toolsFor(state, 'a').definitions.map((d) => d.name).sort()).toEqual(['legalMoves', 'standings', 'worth']);
    expect(await toolsFor(state, 'a').run('whatIf', { edits: [] })).toMatchObject({ is_error: true });
    expect(toolsFor(state, 'a', simFor(state)).definitions).toEqual(OFFERED);
    expect(OFFERED.map((d) => d.name).sort()).toEqual(['legalMoves', 'standings', 'whatIf', 'worth']);
  });

  it('whatIf plays the month on what the seat can see and answers its Worth after it, the same for the same edits', async () => {
    const state = fixture();
    const tools = toolsFor(state, 'a', simFor(state));
    const first = await tools.run('whatIf', { edits: [] });
    expect(first.is_error).toBeUndefined();
    const answer = JSON.parse(first.content) as { month: number; worth: { total: number } };
    expect(answer.month).toBe(1);
    expect(typeof answer.worth.total).toBe('number');
    expect(await tools.run('whatIf', { edits: [] })).toEqual(first);
  });

  it("whatIf hands the month back to the sim's pause between its steps, and answers the same Worth as played straight through", async () => {
    const state = fixture();
    let pauses = 0;
    const paused: WhatIfSim = { ...simFor(state), pause: () => { pauses++; return Promise.resolve(); } };
    const straight = await toolsFor(state, 'a', simFor(state)).run('whatIf', { edits: [] });
    expect(await toolsFor(state, 'a', paused).run('whatIf', { edits: [] })).toEqual(straight);
    // A month is many ticks: a pause at each is what lets the server's other rooms tick between them.
    expect(pauses).toBeGreaterThan(100);
  });

  it('whatIf names the edits the validator refused, so the Worth it answers is not taken for theirs', async () => {
    const state = fixture();
    const answer = (await parsed(toolsFor(state, 'a', simFor(state)).run('whatIf', { edits: [{ path: '/strategy/cashFloor', to: -5 }] }))) as {
      rejected: { path: string; why: string }[];
    };
    expect(answer.rejected).toEqual([{ path: '/strategy/cashFloor', to: -5, why: 'out of bounds' }]);
  });

  it('B fix 4 (a): whatIf plays a route on "granted" as play does: on the plot the seat gained in the month, else cut with why, never refused as no such plot', async () => {
    const state = fixture();
    const route = [{ act: 'buyMule' }, { act: 'outfit', outfit: 'food' }, { act: 'install', plot: 'granted' }];
    const answer = (await parsed(toolsFor(state, 'a', simFor(state)).run('whatIf', { edits: [{ path: '/development/route', to: route }] }))) as {
      rejected: { path: string; why: string }[];
    };
    const onRoute = answer.rejected.filter((r) => r.path === '/development/route');
    expect(onRoute.map((r) => r.why).filter((why) => /no such plot/.test(why))).toEqual([]);
    for (const r of onRoute) expect(r.why).toBe('no plot was granted this month, so steps 0 on are dropped');
  });

  it('whatIf plays at most BRAIN.whatIfsPerWrite months for one set of tools, then answers limit', async () => {
    const state = fixture();
    const tools = toolsFor(state, 'a', simFor(state));
    for (let i = 0; i < BRAIN.whatIfsPerWrite; i++) expect((await tools.run('whatIf', { edits: [] })).is_error).toBeUndefined();
    expect(await parsed(tools.run('whatIf', { edits: [] }))).toEqual({ error: 'limit' });
  });

  it('a sim whose playbook throws answers tool_failed, never an exception', async () => {
    const state = fixture();
    const sim: WhatIfSim = {
      ...simFor(state),
      playbook: () => {
        throw new Error('refused');
      },
    };
    expect(await parsed(toolsFor(state, 'a', sim).run('whatIf', { edits: [] }))).toEqual({ error: 'tool_failed' });
  });

  it('T-AC-A9: an unknown tool or a malformed input answers is_error with a code, never an exception', async () => {
    const tools = toolsFor(fixture(), 'a');
    expect(await tools.run('nope', {})).toMatchObject({ is_error: true });
    expect(await parsed(tools.run('nope', {}))).toEqual({ error: 'unknown_tool' });
    expect(await tools.run('whatIf', { edits: 'not a list' })).toMatchObject({ is_error: true });
  });
});

describe('hands fix 1: whatIf refuses a route MULE the hands would refuse (routeVeto)', () => {
  /** Seed 4's four-seat map (route-veto.test.ts's), seat `a` holding the plot at (x, y): (10, 0) is lake ringed by lake, (10, 1) lake with a free shore. */
  function lakeTable(x: number, y: number): { state: GameState; plot: number } {
    const state = createGame({ seed: 4, players: ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id.toUpperCase(), isAi: true })) });
    tileAt(state.tiles, state.width, x, y)!.owner = 'a';
    return { state, plot: tileIndex(state.width, x, y) };
  }

  const waterOn = (plot: number) => [{ act: 'buyMule' }, { act: 'outfit', outfit: 'water' }, { act: 'install', plot }, { act: 'pub' }];

  async function whatIfRoute(state: GameState, route: unknown): Promise<{ path: string; to: unknown; why: string }[]> {
    const answer = (await parsed(toolsFor(state, 'a', simFor(state)).run('whatIf', { edits: [{ path: '/development/route', to: route }] }))) as {
      rejected: { path: string; to: unknown; why: string }[];
    };
    return answer.rejected;
  }

  it("hands fix 1: a MULE on a lake plot no shore reaches is refused with the hands' reason, on its install step", async () => {
    const { state, plot } = lakeTable(10, 0);
    expect(state.tiles[plot]!.terrain).toBe('lake');
    expect(unreachablePlot(state, plot)).toBe(true);
    const rejected = await whatIfRoute(state, waterOn(plot));
    expect(rejected).toEqual([{ path: '/development/route/2', to: { act: 'install', plot }, why: `route step 2: lake: no shore reaches plot ${plot}` }]);
  });

  it('hands fix 1: a MULE on a lake plot a shore reaches is not refused', async () => {
    const { state, plot } = lakeTable(10, 1);
    expect(state.tiles[plot]!.terrain).toBe('lake');
    expect(unreachablePlot(state, plot)).toBe(false);
    expect(await whatIfRoute(state, waterOn(plot))).toEqual([]);
  });
});
