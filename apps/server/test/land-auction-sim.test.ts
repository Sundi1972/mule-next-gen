import { playGame, simSeats } from '@mule/ai';
import { freePlots, LOTS } from '@mule/engine';
import { describe, expect, it } from 'vitest';

/** The sim's own seats (pnpm sim's defaults: 4 strategist seats at trader, personas rotating). */
const SEEDS = [101, 102, 103, 104];
const PLAYERS = 4;

/** Tier 2 (lean CI): four whole sim games, run beside the sim smoke on PRs into trunk, and by `pnpm test:full`. */
const TIER2 = process.env.MULE_TIER2 === '1' || process.env.MULE_FULL === '1';

describe.runIf(TIER2)('T-AC-7: the simulator plays the land auction', () => {
  it('T-AC-7: the simulator plays the land auction (every game ends, colony lots near colonyPlotChance of months with free land, some sold, one count per bell)', () => {
    const total = { sold: 0, unsold: 0, colonyOffered: 0, colonySold: 0, stalled: 0 };
    let months = 0;
    let freeMonths = 0;
    for (const seed of SEEDS) {
      const played = playGame(seed, simSeats(PLAYERS, 'trader', seed), {
        onPhase: (s) => {
          if (s.phase === 'landGrant' && freePlots(s).length > 0) freeMonths++;
        },
      });
      expect(played.state.phase).toBe('gameOver');
      for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += played.lots[k];
      months += played.state.history.length;
    }
    expect(total.stalled).toBe(0);
    expect(total.colonyOffered).toBeLessThanOrEqual(months);
    expect(total.colonyOffered).toBeGreaterThanOrEqual(Math.floor(LOTS.colonyPlotChance * freeMonths * 0.4));
    expect(total.colonyOffered).toBeLessThanOrEqual(Math.ceil(LOTS.colonyPlotChance * freeMonths * 2));
    expect(total.colonySold).toBeGreaterThan(0);
    expect(total.sold + total.unsold).toBeLessThanOrEqual(LOTS.maxLotsPerMonth * months);
  }, 30_000);
});
