import { describe, expect, it } from 'vitest';
import { POLITICS, TAX, type ElectionHow } from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { playGame } from '../src/play.js';

/** How each office was won, and the sales tax in percent, read as each land grant opens, over a few played games. */
function playedPolitics(seeds: number[]) {
  const how: ElectionHow[] = [];
  const taxes: number[] = [];
  for (const seed of seeds) {
    playGame(seed, simSeats(4, 'trader', seed, null), {
      onPhase: (s) => {
        if (s.phase !== 'landGrant' || !s.politics) return;
        taxes.push(Math.round(s.treasury.salesTax * 100));
        const result = s.politics.election?.result;
        if (result) for (const office of POLITICS.offices) how.push(result[office]!.how);
      },
    });
  }
  return { how, taxes };
}

// One pinned game in CI: seed 1 has offices won by votes (5 of 8) and a tax off its start in 11 of 12 months, so it
// qualifies with room. If a change stops it qualifying, the test fails; it never skips. MULE_FULL=1 plays four.
const SEEDS = process.env.MULE_FULL === '1' ? [1, 2, 3, 4] : [1];

describe('the sim plays politics', () => {
  it('UBER-AC-1, T-AC-63: AI seats declare and vote, so every office is filled in every election and some are won by votes, not only appointed, and a Governor moves the tax', () => {
    const { how, taxes } = playedPolitics(SEEDS);
    // Four elections a game fill every office each time.
    expect(how).toHaveLength(SEEDS.length * 4 * POLITICS.offices.length);
    expect(how).toContain('votes');
    expect(taxes.some((t) => t !== Math.round(TAX.salesTax * 100))).toBe(true);
  }, 30_000); // up to four full games under MULE_FULL: about 5 s locally, over vitest's 5 s default
});
