import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  createGame,
  crewSickness,
  eventChance,
  EVENTS,
  GROWN_BASE,
  HEALTH,
  monthNeeds,
  needsOf,
  type GameState,
  type Outfit,
  type Phase,
  type ProductionLine,
  type Tile,
} from '../src/index.js';

/** Runs `body` with colony health switched on, and switches it back off whatever happens. */
function withHealth<T>(body: () => T): T {
  HEALTH.enabled = true;
  try {
    return body();
  } finally {
    HEALTH.enabled = false;
  }
}

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

/** A seed-42 politics game of four Gearlings (no species perk) and no special fields, the air clean. */
function newGame(politics = true): GameState {
  const state = createGame({ seed: 42, politics, players: ['p0', 'p1', 'p2', 'p3'].map((id) => ({ id, name: id, isAi: false, species: 'gearling' as const })) });
  for (const t of state.tiles) delete t.special;
  if (state.politics) state.politics = { ...state.politics, election: null };
  state.air = 0;
  return state;
}

function toPhase(state: GameState, phase: Phase): void {
  for (let steps = 0; state.phase !== phase && steps < 20; steps++) advancePhase(state);
  expect(state.phase).toBe(phase);
}

/** Lays p0's plots two tiles apart (no cluster, no feeder), skipping the store; each grown plot set to make `out`. */
function lay(state: GameState, plots: { good: Outfit; out: number }[]): Tile[] {
  const free = state.tiles.filter((t) => t.terrain !== 'store' && !t.owner && t.x % 2 === 0 && t.y % 2 === 0);
  return plots.map(({ good, out }, k) => {
    const tile = free[k]!;
    const ground = { ...flatGround, [good]: out - GROWN_BASE };
    Object.assign(tile, { terrain: 'plains', traits: [], peaks: 0, ground, owner: 'p0', outfit: good, pollution: 0, filter: false, runMonths: 0 });
    return tile;
  });
}

const p0 = (state: GameState) => state.players.find((p) => p.id === 'p0')!;

/**
 * Month 1 played to its production with p0 working `plots`, the colony's sick share at `sick`, and p0 holding `medicine`
 * Medicine and plenty of everything else once development has rolled its sickness. Returns p0's lines from the month
 * report and the Medicine p0 held before production and after it.
 */
function produce(plots: { good: Outfit; out: number }[], sick: number, medicine: number, crewShort = { food: 0, water: 0 }, energy = 200) {
  const state = newGame();
  const tiles = lay(state, plots);
  toPhase(state, 'development');
  state.colony!.sick = sick;
  Object.assign(p0(state).stock, { food: 50, water: 200, energy, medicine });
  p0(state).crewShort = crewShort;
  toPhase(state, 'production');
  const report = state.history.at(-1)!;
  const lines = tiles.map((tile) => report.lines!.find((l) => l.tile === state.tiles.indexOf(tile))!);
  for (const line of lines) expect(line.parts.some((p) => p.why === 'event'), `the premise: no event reaches plot ${line.tile}`).toBe(false);
  return { state, lines, medicine: { before: medicine, after: p0(state).stock.medicine } };
}

const sickPart = (line: ProductionLine) => line.parts.find((p) => p.why === 'crewSick');
const FARM = [{ good: 'food' as const, out: 4 }];

describe('needs C18: a sick colony reaches its players (RULE-14)', () => {
  /** p0's development sickness chance with the colony's sick share at `sick`. */
  const chance = (sick: number) => {
    const state = newGame();
    state.colony!.sick = sick;
    return eventChance(state, EVENTS.player.sickness, 'development', { player: 'p0' });
  };

  it("needs B-AC-16: health on and h 0.4, a player's development sickness chance is today's + 0.10, within the row's cap; h 0 leaves it unchanged", () => {
    const today = chance(0.4);
    expect(today, 'the premise: health off, the clean-air chance').toBeCloseTo(EVENTS.player.sickness.phases.development, 9);
    withHealth(() => {
      expect(chance(0.4)).toBeCloseTo(Math.min(EVENTS.player.sickness.cap, today + 0.1), 9);
      expect(chance(0), 'h 0: unchanged').toBe(today);
    });
  });

  it("needs T-AC-26: RULE-14's examples: h 0 → unchanged · h 0.4, clean air (0.03) → 0.13 · h 0.2 → +0.05; never above the row's cap; no other row moves", () => {
    withHealth(() => {
      expect(chance(0)).toBeCloseTo(0.03, 9);
      expect(chance(0.4)).toBeCloseTo(0.13, 9);
      expect(chance(0.2)).toBeCloseTo(0.03 + 0.05, 9);

      const cap = EVENTS.player.sickness.cap;
      try {
        EVENTS.player.sickness.cap = 0.1;
        expect(chance(0.4), 'within the row\'s cap').toBe(0.1);
      } finally {
        EVENTS.player.sickness.cap = cap;
      }

      // The spill adds to today's chance after its floor at 0: a row whose own terms fall below 0 still gets it.
      const row = EVENTS.player.sickness as typeof EVENTS.player.sickness & { wealth?: { richest: number; poorest: number } };
      try {
        row.wealth = { richest: -0.2, poorest: -0.2 };
        expect(chance(0.4), 'today 0, then + 0.10').toBeCloseTo(0.1, 9);
      } finally {
        delete row.wealth;
      }

      const other = newGame();
      const before = eventChance(other, EVENTS.player.muleTheft, 'development', { player: 'p0' });
      other.colony!.sick = 0.4;
      expect(eventChance(other, EVENTS.player.muleTheft, 'development', { player: 'p0' }), 'the sickness row only').toBe(before);
    });
    expect(HEALTH.playerSpill).toBe(0.1);
  });
});

describe('needs C18: a sick colony reaches its players\' crews (RULE-15)', () => {
  it('needs B-AC-17: h 0.3, a farm making 4 and no Medicine makes 3; with 1 Medicine it makes 4 and the depot holds one less', () => {
    withHealth(() => {
      const sick = produce(FARM, 0.3, 0);
      expect(sick.lines[0]!.made, '4 × 0.85 = 3.4 → 3').toBe(3);
      expect(sickPart(sick.lines[0]!)?.delta, 'the line names the cut').toBe(-1);

      const cured = produce(FARM, 0.3, 1);
      expect(cured.lines[0]!.made).toBe(4);
      expect(cured.lines[0]!.parts.filter((p) => p.why === 'crewSick')).toEqual([]);
      expect(cured.medicine.after, 'they took 1 Medicine').toBe(cured.medicine.before - 1);
    });
  });

  it('needs B-AC-17 (negative): h 0.19 cuts nothing and takes no Medicine; Energy plants are never cut; health off cuts nothing', () => {
    withHealth(() => {
      const below = produce(FARM, 0.19, 1);
      expect(below.lines[0]!.made).toBe(4);
      expect(below.medicine.after, 'no Medicine taken below crewSickFrom').toBe(1);

      const plant = produce([{ good: 'energy', out: 4 }], 0.3, 0);
      expect(plant.lines[0]!.made, 'an Energy plant makes its 4').toBe(4);
      expect(sickPart(plant.lines[0]!)).toBeUndefined();
    });
    const off = produce(FARM, 0.3, 0);
    expect(off.lines[0]!.made, 'health off: the farm makes its 4').toBe(4);
  });

  it("needs T-AC-26: RULE-15's rows, first match wins: health off or h < 0.2 none · ≥ 1 Medicine the cure · otherwise k = min(1, crewSpill × h)", () => {
    const at = (sick: number, medicine: number, politics = true) => {
      const state = newGame(politics);
      if (state.colony) state.colony.sick = sick;
      return crewSickness(state, { stock: { ...p0(state).stock, medicine } });
    };
    expect(at(0.3, 0), 'row 1: health off').toEqual({ cure: false, share: 0 });
    withHealth(() => {
      expect(at(0.19, 0), 'row 1: h below crewSickFrom').toEqual({ cure: false, share: 0 });
      expect(at(0.3, 0, false), 'row 1: no colony, no h').toEqual({ cure: false, share: 0 });
      expect(at(0.3, 1), 'row 2: they take a Medicine').toEqual({ cure: true, share: 0 });
      expect(at(0.3, 0), 'row 3').toEqual({ cure: false, share: 0.3 });
      expect(at(0.2, 0), 'row 3 from crewSickFrom itself').toEqual({ cure: false, share: 0.2 });
      const spill = HEALTH.crewSpill;
      try {
        HEALTH.crewSpill = 4;
        expect(at(0.3, 0).share, 'k is at most 1').toBe(1);
      } finally {
        HEALTH.crewSpill = spill;
      }
    });
    expect({ crewSickFrom: HEALTH.crewSickFrom, crewSpill: HEALTH.crewSpill, crewSickDrop: HEALTH.crewSickDrop }).toEqual({ crewSickFrom: 0.2, crewSpill: 1, crewSickDrop: 0.5 });
  });

  it("needs T-AC-26: the sick cut comes after RULE-12's crew factor and before the Energy turn-off", () => {
    withHealth(() => {
      // A farm making 8 whose crews got no Food: f 0.5 gives 4, then 0.85 gives 3.4 → 3. The other order gives 6.8 → 7, then 3.5 → 4.
      const { lines } = produce([{ good: 'food', out: 8 }], 0.3, 0, { food: 1, water: 0 });
      expect(lines[0]!.made).toBe(3);
      expect(lines[0]!.parts.map((p) => p.why)).toEqual(['ground', 'crewShort', 'crewSick']);

      // A farm making 8 with no Energy: 0.85 gives 6.8 → 7, then the turn-off's 20% gives 1.4 → 1. Turned off first: 1.6 → 2, then 1.7 → 2.
      const off = produce([{ good: 'food', out: 8 }], 0.3, 0, { food: 0, water: 0 }, 0).lines[0]!;
      expect(off.made).toBe(1);
      expect(off.parts.map((p) => p.why)).toEqual(['ground', 'crewSick', 'energyOff']);
    });
  });

  it("needs T-AC-26: needsOf's Medicine is +1 exactly when RULE-15 row 3 would apply without it, and monthNeeds carries it", () => {
    const need = (sick: number) => {
      const state = newGame();
      state.colony!.sick = sick;
      const row3 = crewSickness(state, { stock: { ...p0(state).stock, medicine: 0 } }).share > 0;
      return { medicine: needsOf(state, 'p0').medicine, row3, month: monthNeeds(state, 'p0').medicine };
    };
    expect(need(0.3), 'health off').toEqual({ medicine: 0, row3: false, month: 0 });
    withHealth(() => {
      for (const sick of [0, 0.1, 0.19, 0.2, 0.3, 0.4]) {
        const n = need(sick);
        expect(n.medicine, `h ${sick}`).toBe(n.row3 ? 1 : 0);
        expect(n.month, `h ${sick}: the auction and the AI read it through monthNeeds`).toBe(n.medicine);
      }
      expect(need(0.3).medicine).toBe(1);
      expect(need(0.19).medicine).toBe(0);
    });
  });

  it('needs T-AC-26: no copy of the cure in packages/ai: it reads the Medicine through monthNeeds', () => {
    const src = fileURLToPath(new URL('../../ai/src', import.meta.url));
    const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) => f.endsWith('.ts'));
    const read = (f: string) => readFileSync(join(src, f), 'utf8');
    expect(files.filter((f) => /\bmonthNeeds\b/.test(read(f))), 'the scan reads the AI: it finds where the AI asks the need').toContain('value.ts');
    expect(files.filter((f) => /\b(crewSickFrom|crewSpill|crewSickDrop|crewSickness|sickShare)\b/.test(read(f))), 'no copy of the cure').toEqual([]);
  });
});
