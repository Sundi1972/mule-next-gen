import { describe, expect, it, vi } from 'vitest';
import { AI_LEVELS, createGame, GAME, scoreParts } from '@mule/engine';
import type { AiAction } from '../src/actions.js';
import { ADVICE, defaultManual, seatBounds, type AdviceLine } from '../src/llm/manual.js';

/** Every AiAction type, listed here rather than read from the descriptors under test; the type keeps it complete. */
const EVERY_MOVE: { readonly [T in AiAction['type']]: true } = {
  claim: true,
  buyMule: true,
  outfit: true,
  install: true,
  analyse: true,
  filter: true,
  pub: true,
  declare: true,
  walk: true,
  run: true,
  vote: true,
  setTax: true,
  done: true,
};

/** The text under one `## ` heading, up to the next. */
function section(manual: string, heading: string): string {
  const start = manual.indexOf(`## ${heading}\n`);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  const rest = manual.slice(start + 1);
  const end = rest.indexOf('\n## ');
  return end < 0 ? rest : rest.slice(0, end);
}

/** The text under one move's `### ` heading, up to the next heading. */
function moveBlock(manual: string, type: string): string {
  const moves = section(manual, 'Moves');
  const start = moves.indexOf(`### ${type}\n`);
  expect(start, type).toBeGreaterThanOrEqual(0);
  const rest = moves.slice(start + 1);
  const end = rest.indexOf('\n### ');
  return end < 0 ? rest : rest.slice(0, end);
}

const fixture = () =>
  createGame({
    seed: 7,
    players: [
      { id: 'a', name: 'Ada', isAi: false },
      { id: 'b', name: 'Bo', isAi: true },
    ],
  });

describe('the manual of moves', () => {
  it('T-AC-A7: changing one config number (GAME.plotScore) changes the manual', () => {
    const saved = GAME.plotScore;
    const before = defaultManual();
    try {
      GAME.plotScore = saved + 7;
      const after = defaultManual();
      expect(after).not.toBe(before);
      expect(section(after, 'How the game is won')).toContain(String(saved + 7));
      expect(section(before, 'How the game is won')).toContain(String(saved));
    } finally {
      GAME.plotScore = saved;
    }
    expect(defaultManual()).toBe(before);
  });

  it("T-AC-A7: the default config's manual is byte-identical run to run, and from a fresh module", async () => {
    const first = defaultManual();
    expect(defaultManual()).toBe(first);
    vi.resetModules();
    const fresh = await import('../src/llm/manual.js');
    expect(fresh.defaultManual()).toBe(first);
  });

  it('T-AC-A7: every AiAction appears with what it does, when it is legal and what it costs, and Worth names every scoreParts line', () => {
    const manual = defaultManual();
    for (const type of Object.keys(EVERY_MOVE)) {
      const block = moveBlock(manual, type);
      expect(block, type).toMatch(/\nDoes: \S/);
      expect(block, type).toMatch(/\nLegal when: \S/);
      expect(block, type).toMatch(/\nCost: \S/);
    }
    const development = section(manual, 'How a month goes').split('\n').find((l) => l.startsWith('- development: '))!;
    for (const refusal of ['"Not allowed during <phase>"', '"Your development time is up"', '"Still walking"', '"Still assaying"']) {
      expect(development, refusal).toContain(refusal);
    }
    for (const type of ['buyMule', 'outfit', 'install', 'analyse', 'filter', 'pub']) {
      expect(moveBlock(manual, type), type).toContain('Legal when: the development checks above');
    }
    const won = section(manual, 'How the game is won');
    const state = fixture();
    for (const id of ['a', 'b']) {
      for (const part of Object.keys(scoreParts(state, id))) expect(won, part).toContain(`\n- ${part}: `);
    }
  });

  it('T-AC-A7: an advice line naming a move or playbook field that does not exist fails', () => {
    const advice = section(defaultManual(), 'When a move is smart');
    expect(ADVICE.length).toBeGreaterThan(0);
    for (const line of ADVICE) expect(advice).toContain(`${line.move} (${line.field}): `);

    const when = () => 'when it is a good idea';
    const noMove = { move: 'list', field: 'PlanningPlay.list', when } as unknown as AdviceLine;
    expect(() => defaultManual([...ADVICE, noMove])).toThrow(/list/);
    const noField = { move: 'claim', field: 'LandGrantPlay.grab', when } as unknown as AdviceLine;
    expect(() => defaultManual([...ADVICE, noField])).toThrow(/LandGrantPlay\.grab/);
    const noPlay = { move: 'claim', field: 'Shopping.list', when } as unknown as AdviceLine;
    expect(() => defaultManual([...ADVICE, noPlay])).toThrow(/Shopping\.list/);
  });

  it('HC-8: a level with corners false is told it never aims for a monopoly; a level that may corner is not, and the shared manual says neither', () => {
    expect(AI_LEVELS.rookie.corners).toBe(false);
    const rookie = seatBounds(AI_LEVELS.rookie);
    expect(rookie).toContain('never aims for a monopoly');
    expect(rookie).toContain("'monopolist'");
    // Never offered the field: its reply schema has no monopolyTarget (T-AC-A2).
    expect(rookie).not.toContain('monopolyTarget');
    for (const level of [AI_LEVELS.trader, AI_LEVELS.tycoon]) {
      expect(level.corners).toBe(true);
      expect(seatBounds(level)).not.toContain('never aims for a monopoly');
    }
    expect(defaultManual()).not.toContain('never aims for a monopoly');
  });

  it("T-AC-A7: the default config's manual is pinned, so the cached system block moves only with the config", () => {
    expect(defaultManual()).toMatchSnapshot();
  });
});
