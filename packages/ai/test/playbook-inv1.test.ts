import { describe, expect, it } from 'vitest';
import { advancePhase, AI_LEVELS, createGame, MS_PER_SECOND, stableJson, type AiLevelId, type GameState, type Phase, type Playbook } from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { playGameAsync, type SeatSpec } from '../src/play.js';
import { playbookSource, type DraftPhase } from '../src/playbook/index.js';
import { AiSeat } from '../src/seat.js';

// Local only (MULE_FULL=1, `pnpm test:full`): 20 whole games. Tier 1 plays one, seed 1's: its month 5 is where a
// staple-floor fault first showed, and one game keeps the lean tier lean.
const full = process.env.MULE_FULL === '1';
const SEEDS = full ? Array.from({ length: 20 }, (_, i) => i + 1) : [1];
const enough = new Error('enough months played');
const LEVELS = Object.keys(AI_LEVELS) as AiLevelId[];
const DRAFT_POINTS: Partial<Record<Phase, DraftPhase>> = { planning: 'planning', development: 'development', auction: 'auction' };

/** The sim's persona rotation, each seat at a level of its own, so every level drafts in every game. */
const specsFor = (seed: number): SeatSpec[] => simSeats(4, 'trader', seed).map((s, i) => ({ ...s, level: LEVELS[(seed + i) % LEVELS.length]! }));

const seatsFor = (specs: SeatSpec[], seed: number) =>
  specs.map((s, i) => new AiSeat({ id: `ai${i}`, name: `AI ${i + 1}`, persona: s.persona, level: s.level, seed: seed * 31 + i }));

/**
 * Calls `at` with each phase's opening state (a copy: the game is untouched), for the game's first `months` months. It
 * gives the event loop a turn after each opening, so a whole game of drafts never blocks the vitest worker's messages.
 */
async function eachOpening(seed: number, specs: SeatSpec[], at: (opening: GameState) => void, months = Infinity): Promise<void> {
  let opened = false;
  try {
    await playGameAsync(seed, specs, {
      onPhase: (played) => {
        const opening = structuredClone(played);
        advancePhase(opening);
        if (opening.month > months) throw enough;
        at(opening);
        opened = true;
      },
      between: () => {
        if (!opened) return;
        opened = false;
        return new Promise((resolve) => setImmediate(resolve));
      },
    });
  } catch (err) {
    if (err !== enough) throw err;
  }
}

describe('INV-1 over seeded games (T-AC-3)', () => {
  it.each(SEEDS)('T-AC-3: the validator with no edits returns every draft unchanged (seed %i)', async (seed) => {
    const specs = specsFor(seed);
    const seats = seatsFor(specs, seed);
    const source = playbookSource(seats);
    const faults: string[] = [];
    let checked = 0;
    const check = (seat: AiSeat, opening: GameState, label: string, draft: Playbook) => {
      checked++;
      const { playbook, rejected } = seat.validator()(opening, seat.id, draft, []);
      if (draft.rejected !== undefined || rejected.length > 0 || stableJson(playbook) !== stableJson(draft)) {
        faults.push(`${seat.id} (${seat.mind.personaId}, ${seat.mind.levelId}) month ${opening.month} ${label}: ${JSON.stringify([...(draft.rejected ?? []), ...rejected])}`);
      }
    };

    await eachOpening(seed, specs, (opening) => {
      const phase = DRAFT_POINTS[opening.phase];
      for (const seat of seats) {
        // The planning draft point drafts after the land ask, so its land part reads the pending pick.
        if (phase === 'planning') seat.planMonth(opening);
        if (phase) check(seat, opening, phase, seat.draft(opening, phase));
        // WS2's draft at every phase it may ask in: this month's grant, or next month's once it has run.
        check(seat, opening, `source at ${opening.phase}`, source.draft(opening, seat.id).playbook);
      }
    });

    expect(faults).toEqual([]);
    expect(checked).toBeGreaterThan(0);
  }, 120_000);

  it('T-AC-3: a draft value forced out of bounds is clamped or replaced, by its path', async () => {
    // Clamped: a development budget past the seat's time.
    const specs = specsFor(1);
    const [seat] = seatsFor(specs, 1);
    let development: GameState | null = null;
    await eachOpening(1, specs, (opening) => {
      if (opening.phase === 'development') development ??= opening;
    }, 1);
    const state = development!;
    const draft = seat!.draft(state, 'development');
    const bound = state.players.find((p) => p.id === seat!.id)!.devSeconds * MS_PER_SECOND;
    const forced: Playbook = { ...draft, development: { ...draft.development!, timeBudgetMs: bound + 1 } };

    const clamped = seat!.validator()(state, seat!.id, forced, []);
    expect(clamped.rejected.map((r) => r.path)).toEqual(['/development/timeBudgetMs']);
    expect(clamped.rejected[0]!.why).toBe(`clamped to ${bound}: the seat's development time`);
    expect(clamped.playbook.development!.timeBudgetMs).toBe(bound);

    // Replaced: a stale or recorded playbook handed to a Rookie, with a monopoly it may never play, a stance from no
    // list, and a ranking with no free plot in it.
    const opening = createGame({ seed: 1, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
    const rookie = new AiSeat({ id: 'ai2', name: 'AI 3', persona: 'trader', level: 'rookie', seed: 7 });
    const planned = rookie.draft(opening, 'planning');
    const store = opening.tiles.findIndex((t) => t.terrain === 'store');
    const stale: Playbook = {
      ...planned,
      strategy: { ...planned.strategy, kind: 'monopolist', monopolyTarget: 'smithore', stances: { ...planned.strategy.stances, ai0: 'enemy' as 'rival' } },
      landGrant: { ...planned.landGrant!, ranked: [{ plot: store, value: 5 }] },
    };

    const { playbook, rejected } = rookie.validator()(opening, rookie.id, stale, []);
    expect(planned.strategy.kind).not.toBe('monopolist');
    expect(playbook.strategy).toMatchObject({ kind: planned.strategy.kind, monopolyTarget: null });
    // A stance is a field a playbook may lack: it is dropped, not replaced.
    expect(playbook.strategy.stances).not.toHaveProperty('ai0');
    expect(playbook.landGrant).toEqual(planned.landGrant);
    expect(playbook.by).toBe('engine');
    expect(rejected).toEqual([
      { path: '/strategy/kind', to: 'monopolist', why: `level never corners; the engine's draft plays ${planned.strategy.kind}` },
      { path: '/strategy/monopolyTarget', to: 'smithore', why: "level never corners; the engine's draft plays null" },
      { path: '/strategy/stances/ai0', to: 'enemy', why: 'no such stance' },
      { path: '/landGrant/ranked', to: [{ plot: store, value: 5 }], why: "no free plot left to rank; the engine's /landGrant plays" },
    ]);
  });
});
