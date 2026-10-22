import { describe, expect, it } from 'vitest';
import { TAX, type ElectionHow } from '@mule/engine';
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
        if (result) how.push(result.governor.how, result.sheriff.how);
      },
    });
  }
  return { how, taxes };
}

describe('the sim plays politics', () => {
  it('UBER-AC-1: AI seats run and vote, so offices are won, not only appointed, and a Governor moves the tax', () => {
    const { how, taxes } = playedPolitics([1, 2, 3, 4]);
    // Four elections a game fill both offices each time.
    expect(how).toHaveLength(4 * 4 * 2);
    expect(how.some((h) => h !== 'appointed')).toBe(true);
    expect(taxes.some((t) => t !== Math.round(TAX.salesTax * 100))).toBe(true);
  });
});
