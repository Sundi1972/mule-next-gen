import { describe, expect, it } from 'vitest';
import { advancePhase, answerDeal, createGame, offerDeal, type DealCard, type GameState } from '../src/index.js';

/** S3-C8: the month's clock settles the cards. diplomacy.ts says how each settles; this pins when advancePhase asks it to. */

const SEATS = ['lena', 'brix', 'kai'];

function newGame(maxMonths = 12): GameState {
  return createGame({ seed: 7, maxMonths, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
}

const cardOf = (state: GameState, id: string): DealCard => state.politics!.deals.find((d) => d.id === id)!;

/** Advances phase by phase until `phase` is entered, at most a game's worth of steps. */
function into(state: GameState, phase: GameState['phase']): void {
  for (let i = 0; i < 200; i++) {
    advancePhase(state);
    if (state.phase === phase || state.phase === 'gameOver') return;
  }
  throw new Error(`never reached ${phase}`);
}

describe('S3-C8: offers expire as planning closes; pacts settle at the upkeep of their last month', () => {
  it('S3-RULE-1: a card nobody answered expires the moment planning closes, settled that month', () => {
    const state = newGame();
    const id = offerDeal(state, 'lena', { to: 'brix', terms: { kind: 'pact' }, months: 3 });
    expect(cardOf(state, id).status, 'the premise: offered in planning').toBe('offered');

    advancePhase(state);

    expect(state.phase).not.toBe('planning');
    expect(cardOf(state, id)).toMatchObject({ status: 'expired', settled: 1 });
  });

  it('S3-RULE-5: an accepted three-month pact stays active through month 2’s upkeep and settles kept at month 3’s', () => {
    const state = newGame();
    const id = offerDeal(state, 'lena', { to: 'brix', terms: { kind: 'pact' }, months: 3 });
    answerDeal(state, 'brix', id, true);
    expect(cardOf(state, id)).toMatchObject({ status: 'active', until: 3 });

    into(state, 'upkeep');
    expect(state.month).toBe(1);
    expect(cardOf(state, id).status, 'month 1’s upkeep').toBe('active');
    into(state, 'upkeep');
    expect(state.month).toBe(2);
    expect(cardOf(state, id).status, 'month 2’s upkeep').toBe('active');
    into(state, 'upkeep');

    expect(state.month).toBe(3);
    expect(cardOf(state, id)).toMatchObject({ status: 'kept', settled: 3 });
  });

  it('S3-RULE-5: a pact still running when the game ends settles kept at the last upkeep', () => {
    const state = newGame(2);
    const id = offerDeal(state, 'lena', { to: 'kai', terms: { kind: 'pact' }, months: 6 });
    answerDeal(state, 'kai', id, true);
    expect(cardOf(state, id).until, 'the premise: capped at the game’s end').toBe(2);

    into(state, 'gameOver');

    expect(cardOf(state, id)).toMatchObject({ status: 'kept', settled: 2 });
  });
});
