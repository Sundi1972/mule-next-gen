import { describe, expect, it } from 'vitest';
import { POLITICS, TAX, type ElectionHow } from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { playGame } from '../src/play.js';

/** How each office was won, and the sales tax in percent, read as each land grant opens, over one played game. */
function playedPolitics(seed: number) {
  const how: ElectionHow[] = [];
  const taxes: number[] = [];
  playGame(seed, simSeats(4, 'trader', seed, null), {
    onPhase: (s) => {
      if (s.phase !== 'landGrant' || !s.politics) return;
      taxes.push(Math.round(s.treasury.salesTax * 100));
      const result = s.politics.election?.result;
      if (result) for (const office of POLITICS.offices) how.push(result[office]!.how);
    },
  });
  // Four elections a game, each filling every office.
  return { filled: how.length === 4 * POLITICS.offices.length && how.every(Boolean), voteWin: how.includes('votes'), taxMoved: taxes.some((t) => t !== Math.round(TAX.salesTax * 100)) };
}

// Local only (MULE_FULL=1, `pnpm test:full`): four games, judged game by game. The CI tier plays one pinned game.
const full = process.env.MULE_FULL === '1';
const PINNED = 2;
const SEEDS = [1, 2, 3, 4];

describe('the sim plays politics', () => {
  it(`UBER-AC-1, T-AC-63: in one game (seed ${PINNED}) AI seats declare and vote, so every election fills every office, one is won by votes, and a Governor moves the tax`, () => {
    expect(playedPolitics(PINNED)).toEqual({ filled: true, voteWin: true, taxMoved: true });
  }, 30_000); // one full game: about 1.5 s locally, with room for a slow runner

  it.runIf(full)('UBER-AC-1, T-AC-63: over four games every game fills every office, and at least two each show a vote win and a tax move', () => {
    const games = SEEDS.map(playedPolitics);
    expect(games.map((g) => g.filled), 'every game fills every office').toEqual(SEEDS.map(() => true));
    expect(games.filter((g) => g.voteWin).length, 'games with an office won by votes').toBeGreaterThanOrEqual(2);
    expect(games.filter((g) => g.taxMoved).length, 'games where the Governor moved the tax').toBeGreaterThanOrEqual(2);
  }, 60_000); // four full games: about 6 s locally
});
