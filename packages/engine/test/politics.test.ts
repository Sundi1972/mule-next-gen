import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, player, TAX, voteWeight, type GameState, type Politics } from '../src/index.js';

const SEATS = ['lena', 'brix', 'ossa', 'ai1'];

function newGame(options: { politics?: boolean; seats?: string[] } = {}): GameState {
  const seats = options.seats ?? SEATS;
  return createGame({ seed: 7, players: seats.map((id) => ({ id, name: id, isAi: false })), politics: options.politics });
}

function politicsOf(state: GameState): Politics {
  expect(state.politics).not.toBeNull();
  return state.politics!;
}

/** Plays the rest of the month with nobody acting, up to the next planning phase. */
function toNextPlanning(state: GameState): void {
  const month = state.month;
  do advancePhase(state);
  while (state.phase !== 'planning' && state.phase !== 'gameOver');
  expect(state.month).toBe(month + 1);
}

/** Hands `count` more free plots to a player. */
function give(state: GameState, id: string, count: number): void {
  const free = state.tiles.filter((t) => t.owner === null && t.terrain !== 'store');
  for (const tile of free.slice(0, count)) tile.owner = id;
}

describe('C1, C2: the host option and the month opening', () => {
  it('C1: politics off leaves the game as before', () => {
    expect(newGame().politics).not.toBeNull();

    const state = newGame({ politics: false });
    expect(state.politics).toBeNull();
    expect(state.treasury.salesTax).toBe(TAX.salesTax);

    state.treasury.money = 500;
    toNextPlanning(state);
    const taxesPaid = Object.values(state.treasury.paid).reduce((sum, paid) => sum + paid, 0);
    expect(state.politics).toBeNull();
    expect(state.treasury.salesTax).toBe(TAX.salesTax);
    expect(state.treasury.money).toBe(500 + taxesPaid);
  });

  it('RULE-5 row 1: the one player with strictly the most plots becomes the Land Baron when planning opens', () => {
    const state = newGame();
    expect(politicsOf(state).baron).toBeNull();
    give(state, 'lena', 3);
    give(state, 'brix', 2);
    expect(politicsOf(state).baron).toBeNull();

    toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('lena');
  });

  it('RULE-5 row 2: in a tie for most plots the current Baron keeps the title', () => {
    const state = newGame();
    give(state, 'brix', 3);
    toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('brix');

    give(state, 'lena', 3);
    toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('brix');
  });

  it('RULE-5 row 3: a tie without the current Baron, or nobody owning land, leaves no Baron', () => {
    const state = newGame();
    toNextPlanning(state);
    expect(politicsOf(state).baron).toBeNull();

    give(state, 'lena', 3);
    toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('lena');

    give(state, 'brix', 4);
    give(state, 'ossa', 4);
    toNextPlanning(state);
    expect(politicsOf(state).baron).toBeNull();
  });
});

describe('C4: vote weight', () => {
  it('RULE-4: vote weight parts', () => {
    const state = newGame();
    give(state, 'lena', 23);
    give(state, 'brix', 9);
    toNextPlanning(state);
    expect(politicsOf(state).baron).toBe('lena');
    state.treasury.paid = { lena: 650, ossa: 900 };

    expect(voteWeight(state, 'lena')).toEqual({ total: 6, parts: { base: 1, land: 2, reputation: 0, baron: 1, taxes: 2 } });
    expect(voteWeight(state, 'brix')).toEqual({ total: 1, parts: { base: 1, land: 0, reputation: 0, baron: 0, taxes: 0 } });
    expect(voteWeight(state, 'ossa').parts.taxes).toBe(2);

    for (const [reputation, part] of [[70, 1], [69, 0], [30, 0], [29, -1]] as const) {
      player(state, 'brix').reputation = reputation;
      expect(voteWeight(state, 'brix').parts.reputation).toBe(part);
      expect(voteWeight(state, 'brix').total).toBe(1 + part);
    }
  });
});
