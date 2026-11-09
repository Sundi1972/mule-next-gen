import { describe, expect, it } from 'vitest';
import { gameOverNews } from '../src/mule-game.js';

/** The game-over line names every player tied for first, as the screens show a shared win. */
describe('the game-over news', () => {
  it('one winner is named alone', () => {
    expect(gameOverNews([{ id: 'lena', name: 'Lena', score: 900 }, { id: 'ossa', name: 'Ossa', score: 700 }])).toEqual({ text: 'Game over. Lena wins the colony!', who: ['lena'] });
  });

  it('a tie for first names every tied player, in seat order, and no one behind them', () => {
    expect(gameOverNews([{ id: 'lena', name: 'Lena', score: 900 }, { id: 'ossa', name: 'Ossa', score: 700 }, { id: 'brix', name: 'Brix', score: 900 }])).toEqual({ text: 'Game over. Lena and Brix share the win!', who: ['lena', 'brix'] });
    expect(gameOverNews([{ id: 'a', name: 'A', score: 5 }, { id: 'b', name: 'B', score: 5 }, { id: 'c', name: 'C', score: 5 }]).text).toBe('Game over. A, B and C share the win!');
  });
});
