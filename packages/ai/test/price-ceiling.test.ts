import { describe, expect, it } from 'vitest';
import { GAME, GOOD_CONFIG, GOODS } from '@mule/engine';
import { simSeats } from '../src/lineup.js';
import { playGame } from '../src/play.js';

describe('price B-AC-3: the store never posts a price above 12× its reference', () => {
  // The sim's own first two games: 4 trader seats, a full game each.
  it.each([1, 2])('price B-AC-3: no posted price is above 12× its configured reference in a sim game (seed %i)', (seed) => {
    const over: string[] = [];
    let postings = 0;
    playGame(seed, simSeats(4, 'trader', seed), {
      onPhase: (state) => {
        if (state.phase !== 'auction') return;
        postings++;
        for (const good of GOODS) {
          const posted = state.store.posted[good];
          if (posted > 12 * GOOD_CONFIG[good].refPrice) over.push(`month ${state.month}: ${good} ${posted}`);
        }
      },
    });
    expect(postings, 'the game posted every month').toBe(GAME.maxMonths);
    expect(over).toEqual([]);
  });
});
