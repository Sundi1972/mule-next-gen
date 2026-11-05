import { describe, expect, it } from 'vitest';
import { BRAIN, createGame, type GameState, type Playbook } from '@mule/engine';
import { OFFERED, TOOL_DEFS, toolsFor, type WhatIfSim } from '../src/llm/tools.js';

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
function answers(state: GameState): Record<string, { content: string; is_error?: boolean }> {
  const tools = toolsFor(state, 'a', simFor(state));
  return Object.fromEntries(TOOL_DEFS.map((d) => [d.name, tools.run(d.name, SAMPLE[d.name])]));
}

describe("Claude's tools (C9)", () => {
  it('T-AC-A9: every tool is MCP-shaped and has a sample here', () => {
    expect(TOOL_DEFS.map((d) => d.name).sort()).toEqual(Object.keys(SAMPLE).sort());
    for (const d of TOOL_DEFS) {
      expect(d.description, d.name).toMatch(/\S/);
      expect(d.input_schema, d.name).toMatchObject({ type: 'object' });
    }
  });

  it("T-AC-A9: no tool result carries another seat's goods or unanalysed ground: changing only those changes no answer but standings' public totals", () => {
    const plain = fixture();
    const hidden = fixture();
    // A rival's goods, moved between the two rivals so the colony's total (public, as market cover) stays the same,
    // and a plot nobody analysed: distinctive values, so a leak is unmistakable.
    plain.players.find((p) => p.id === 'b')!.stock.crystite = 4_711;
    hidden.players.find((p) => p.id === 'c')!.stock.crystite = 4_711;
    const unanalysed = hidden.tiles.findIndex((t) => t.terrain !== 'store' && t.owner === null);
    hidden.tiles[unanalysed]!.ground = { ...hidden.tiles[unanalysed]!.ground, crystite: 4 };
    hidden.tiles[unanalysed]!.traits = ['hotSpring'];

    const a = answers(plain);
    const b = answers(hidden);
    for (const name of Object.keys(a)) {
      if (name === 'standings') continue;
      expect(b[name], name).toEqual(a[name]);
      expect(b[name]!.content, name).not.toContain('4711');
    }
    // Standings are each seat's public Worth, as every row of the board shows it: totals only, never their goods.
    const rows = JSON.parse(b.standings!.content) as Record<string, unknown>[];
    for (const row of rows) expect(Object.keys(row).sort(), JSON.stringify(row)).toEqual(['name', 'seat', 'worth']);
  });

  it('T-AC-A9: no tool, whatIf included, changes the live game state', () => {
    const state = fixture();
    const before = structuredClone(state);
    const tools = toolsFor(state, 'a', simFor(state));
    for (const d of TOOL_DEFS) tools.run(d.name, SAMPLE[d.name]);
    tools.run('nope', {});
    tools.run('worth', 'not an object');
    expect(state).toEqual(before);
  });

  it('whatIf is offered only with a month sim to play on; without one it answers unavailable', () => {
    const state = fixture();
    expect(toolsFor(state, 'a').definitions.map((d) => d.name).sort()).toEqual(['legalMoves', 'standings', 'worth']);
    expect(toolsFor(state, 'a').run('whatIf', { edits: [] })).toMatchObject({ is_error: true });
    expect(toolsFor(state, 'a', simFor(state)).definitions).toEqual(OFFERED);
    expect(OFFERED.map((d) => d.name).sort()).toEqual(['legalMoves', 'standings', 'whatIf', 'worth']);
  });

  it("whatIf plays the month on what the seat can see and answers its Worth after it, the same for the same edits", () => {
    const state = fixture();
    const tools = toolsFor(state, 'a', simFor(state));
    const first = tools.run('whatIf', { edits: [] });
    expect(first.is_error).toBeUndefined();
    const answer = JSON.parse(first.content) as { month: number; worth: { total: number } };
    expect(answer.month).toBe(1);
    expect(typeof answer.worth.total).toBe('number');
    expect(tools.run('whatIf', { edits: [] })).toEqual(first);
  });

  it('whatIf names the edits the validator refused, so the Worth it answers is not taken for theirs', () => {
    const state = fixture();
    const answer = JSON.parse(toolsFor(state, 'a', simFor(state)).run('whatIf', { edits: [{ path: '/strategy/cashFloor', to: -5 }] }).content) as {
      rejected: { path: string; why: string }[];
    };
    expect(answer.rejected).toEqual([{ path: '/strategy/cashFloor', to: -5, why: 'out of bounds' }]);
  });

  it('whatIf plays at most BRAIN.whatIfsPerWrite months for one set of tools, then answers limit', () => {
    const state = fixture();
    const tools = toolsFor(state, 'a', simFor(state));
    for (let i = 0; i < BRAIN.whatIfsPerWrite; i++) expect(tools.run('whatIf', { edits: [] }).is_error).toBeUndefined();
    expect(JSON.parse(tools.run('whatIf', { edits: [] }).content)).toEqual({ error: 'limit' });
  });

  it('a sim whose playbook throws answers tool_failed, never an exception', () => {
    const state = fixture();
    const sim: WhatIfSim = { ...simFor(state), playbook: () => { throw new Error('refused'); } };
    expect(JSON.parse(toolsFor(state, 'a', sim).run('whatIf', { edits: [] }).content)).toEqual({ error: 'tool_failed' });
  });

  it('T-AC-A9: an unknown tool or a malformed input answers is_error with a code, never an exception', () => {
    const tools = toolsFor(fixture(), 'a');
    expect(tools.run('nope', {})).toMatchObject({ is_error: true });
    expect(JSON.parse(tools.run('nope', {}).content)).toEqual({ error: 'unknown_tool' });
    expect(tools.run('whatIf', { edits: 'not a list' })).toMatchObject({ is_error: true });
  });
});
