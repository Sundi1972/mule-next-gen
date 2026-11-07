import { describe, expect, it } from 'vitest';
import { gameOverNews } from '../src/mule-game.js';

/** The game-over line names every player tied for first, as the screens show a shared win. */
describe('the game-over news', () => {
  it('one winner is named alone', () => {
    expect(gameOverNews([{ name: 'Lena', score: 900 }, { name: 'Ossa', score: 700 }])).toBe('Game over. Lena wins the colony!');
  });

  it('a tie for first names every tied player, in seat order, and no one behind them', () => {
    expect(gameOverNews([{ name: 'Lena', score: 900 }, { name: 'Ossa', score: 700 }, { name: 'Brix', score: 900 }])).toBe('Game over. Lena and Brix share the win!');
    expect(gameOverNews([{ name: 'A', score: 5 }, { name: 'B', score: 5 }, { name: 'C', score: 5 }])).toBe('Game over. A, B and C share the win!');
  });
});
