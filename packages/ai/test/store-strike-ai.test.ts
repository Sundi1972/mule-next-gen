import { afterEach, describe, expect, it } from 'vitest';
import { AI_LEVELS, AI_PERSONAS, createGame, EVENTS, firePhase, observe, type EventRow, type GameState } from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { playGame, playMonthFrom } from '../src/play.js';
import { developDecision } from '../src/strategist.js';
import type { Mind } from '../src/value.js';

// G-5 C26 PR-B: an AI seat and the store strike (the store sells no MULEs this turn), named on from the engine's
// FM-C26-n.

type Row = EventRow & { phases: Record<string, number> };
const rows = () => [...Object.values(EVENTS.colony), ...Object.values(EVENTS.player)] as unknown as Row[];
const saved = rows().map((row) => ({ row, phases: { ...row.phases }, cap: row.cap }));
afterEach(() => {
  for (const { row, phases, cap } of saved) Object.assign(row, { phases, cap });
});

/** Only the store strike rolls, certain; every other row at 0. */
function strikeOnly() {
  for (const [key, row] of [...Object.entries(EVENTS.colony), ...Object.entries(EVENTS.player)] as [string, Row][]) {
    row.phases = Object.fromEntries(Object.keys(row.phases).map((p) => [p, key === 'storeStrike' ? 1 : 0]));
    if (key === 'storeStrike') row.cap = 1;
  }
}

const mind: Mind = { me: 'ai0', personaId: 'trader', persona: AI_PERSONAS.trader, levelId: 'trader', level: AI_LEVELS.trader };

/** A politics game in development, ai0 owning three free plots, this development's events fired. */
function developing(): GameState {
  const state = createGame({ seed: 3, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true })) });
  state.month = EVENTS.firstMonth;
  for (const t of state.tiles.filter((t) => t.owner === null && t.terrain !== 'store').slice(0, 3)) t.owner = 'ai0';
  state.phase = 'development';
  firePhase(state, 'development');
  return state;
}

describe('C26 PR-B: an AI seat in a store strike', () => {
  it('FM-C26-10: during a store strike the strategist plans no MULE: every install is vetoed, so it keeps the cash; with no strike it would buy', () => {
    const plain = developDecision(observe(developing(), 'ai0'), mind, 0);
    expect(plain.options[0]!.action.kind).toBe('install');
    strikeOnly();
    const struck = developing();
    expect(struck.monthEvents.map((e) => e.key)).toEqual(['storeStrike']);
    const list = developDecision(observe(struck, 'ai0'), mind, 0);
    const installs = list.all.filter((c) => c.action.kind === 'install');
    expect(installs.length).toBeGreaterThan(0);
    expect(installs.every((c) => c.veto === 'the store is on strike')).toBe(true);
    expect(list.options.map((c) => c.action.kind)).toEqual(['stop']);
  });

  it('FM-C26-11: a month played through a store strike installs no MULE in development and runs on to the next month, never stuck on the refusal', () => {
    let planning: GameState | null = null;
    playGame(4, simSeats(3, 'trader', 4), {
      maxMonths: 4,
      onPhase: (s) => {
        if (s.month === 2 && s.phase === 'planning') planning ??= structuredClone(s);
      },
    });
    const start = planning!;
    const seats = start.players.map((p, i) => ({ id: p.id, persona: 'trader' as const, level: 'trader' as const, seed: 1_000 + i }));
    const working = (s: GameState) => s.tiles.filter((t) => t.owner && t.outfit).length;
    const twin = playMonthFrom(start, seats, 9).state;
    expect(working(twin), 'with no strike the seats install MULEs').toBeGreaterThan(working(start));
    strikeOnly();
    const played = playMonthFrom(start, seats, 9).state;
    expect(played.history.find((h) => h.month === 2)!.events!.map((e) => e.key)).toContain('storeStrike');
    expect(working(played)).toBe(working(start));
    expect(played.month).toBe(3);
  });
});
