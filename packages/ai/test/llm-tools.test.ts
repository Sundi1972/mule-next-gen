import { describe, expect, it } from 'vitest';
import { createGame, type GameState } from '@mule/engine';
import { OFFERED, TOOL_DEFS, toolsFor } from '../src/llm/tools.js';

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

/** What every tool answers seat `a`, by tool name. */
function answers(state: GameState): Record<string, { content: string; is_error?: boolean }> {
  const tools = toolsFor(state, 'a');
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
    const tools = toolsFor(state, 'a');
    for (const d of TOOL_DEFS) tools.run(d.name, SAMPLE[d.name]);
    tools.run('nope', {});
    tools.run('worth', 'not an object');
    expect(state).toEqual(before);
  });

  it('whatIf is defined but not offered until the one-month sim it plays on exists', () => {
    expect(OFFERED.map((d) => d.name).sort()).toEqual(['legalMoves', 'standings', 'worth']);
    expect(toolsFor(fixture(), 'a').definitions).toEqual(OFFERED);
  });

  it('T-AC-A9: an unknown tool or a malformed input answers is_error with a code, never an exception', () => {
    const tools = toolsFor(fixture(), 'a');
    expect(tools.run('nope', {})).toMatchObject({ is_error: true });
    expect(JSON.parse(tools.run('nope', {}).content)).toEqual({ error: 'unknown_tool' });
    expect(tools.run('whatIf', { edits: 'not a list' })).toMatchObject({ is_error: true });
  });
});
