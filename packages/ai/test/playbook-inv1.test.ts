import { describe, expect, it } from 'vitest';
import { advancePhase, AI_LEVELS, MS_PER_SECOND, stableJson, type AiLevelId, type GameState, type Phase, type Playbook } from '@mule/engine';
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

  it('T-AC-3: a draft value forced out of bounds is rejected, by its path', async () => {
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

    const { playbook, rejected } = seat!.validator()(state, seat!.id, forced, []);
    expect(rejected.map((r) => r.path)).toEqual(['/development/timeBudgetMs']);
    expect(rejected[0]!.why).toBe(`clamped to ${bound}: the seat's development time`);
    expect(playbook.development!.timeBudgetMs).toBe(bound);
  });
});
