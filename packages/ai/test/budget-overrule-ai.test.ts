import { describe, expect, it } from 'vitest';
import type { GameState, Overrule } from '@mule/engine';
import { playGame, type SeatSpec } from '../src/play.js';

/**
 * S5-B-AC-6 (slice 5 spec §6): four AI seats with no API key play the budget and the tax overrule by themselves. The
 * AI Governor sets a budget, AI seats call and vote on tax overrules, and every overrule ballot closes without a human.
 * Read at the promise: the game's own state as each phase ends, on seeded games.
 */
const MONTHS = 12;
const CLASSIC: SeatSpec[] = (['trader', 'aggressive', 'cautious', 'saboteur'] as const).map((persona) => ({ persona, level: 'trader' }));
const ROOKIES: SeatSpec[] = CLASSIC.map((s) => ({ ...s, level: 'rookie' }));

/** Each month's overrule as the phase ends, by month, its last stage kept; and whether a Governor's budget was ever in force. */
function played(seed: number, specs: SeatSpec[]): { overrules: Overrule[]; budgetSet: boolean } {
  const byMonth = new Map<number, Overrule>();
  let budgetSet = false;
  playGame(seed, specs, {
    politics: true,
    maxMonths: MONTHS,
    onPhase: (s: GameState) => {
      const o = s.politics?.overrule;
      if (o) byMonth.set(o.month, structuredClone(o));
      if (s.politics?.budget) budgetSet = true;
    },
  });
  return { overrules: [...byMonth.values()], budgetSet };
}

describe('S5-B-AC-6: AI seats play the budget and the overrule without a human', () => {
  it('S5-B-AC-6: four Classic AI seats with no API key: the AI Governor sets a budget, AI seats call and vote on tax overrules, and every overrule ballot closes without a human', { timeout: 300_000 }, () => {
    const games = [1, 2, 3].map((seed) => played(seed, CLASSIC));
    expect(games.every((g) => g.budgetSet), 'every game: the AI Governor set a budget').toBe(true);
    const all = games.flatMap((g) => g.overrules);
    expect(all.filter((o) => o.caller !== null && o.target === 'tax').length, 'AI seats called tax overrules').toBeGreaterThan(0);
    expect(all.every((o) => o.stage === 'over'), 'every ballot closed').toBe(true);
    expect(all.every((o) => Object.keys(o.ballots).length > 0), 'and seats voted on each').toBe(true);
  });

  it('S5-B-AC-6 negative: Rookie seats never call an overrule', { timeout: 300_000 }, () => {
    const games = [1, 2, 3].map((seed) => played(seed, ROOKIES));
    expect(games.flatMap((g) => g.overrules).filter((o) => o.caller !== null)).toEqual([]);
  });
});
