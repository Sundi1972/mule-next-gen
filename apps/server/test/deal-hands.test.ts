import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POLITICS, WALK, type DealCard, type GameState } from '@mule/engine';
import type { SeatInfo } from '@tabletop/core';
import { MuleGame } from '../src/mule-game.js';
import { fakeContext, throughSidePicks } from './fake-context.js';

/** S3-C11 with S3-C13: every AI seat's DealHand plays through planning, and is flushed before planning ends. */

/** Two people and one built-in computer seat; no API key anywhere in this file. */
const TABLE: SeatInfo[] = [
  { id: 's1', name: 'Heiko', isAi: false, color: 0 },
  { id: 's2', name: 'Lena', isAi: false, color: 1 },
  { id: 's3', name: 'The Accountant', isAi: true, color: 2 },
];
const HUMANS = ['s1', 's2'];

beforeEach(() => {
  for (const level of ['log', 'info', 'warn'] as const) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

// The casts reach MuleGame's private engine state and its votes check: the tests set up and read the cards there.
const stateOf = (game: MuleGame) => (game as unknown as { state: GameState }).state;
const votesOpen = (game: MuleGame) => (game as unknown as { electionOpen(): boolean }).electionOpen();

/** A started game run through the month's election into planning proper: the clock alone moves from here on. */
function inPlanningProper() {
  const fake = fakeContext({ table: TABLE });
  const game = new MuleGame(fake.ctx, 10, { politics: true });
  game.start(TABLE);
  const step = throughSidePicks(game, (ms) => fake.advance(ms));
  for (let t = 0; t < 10 * 60_000 && votesOpen(game); t += WALK.tickMs) {
    if (t % 1000 === 0) for (const h of HUMANS) game.handle(h, { type: 'ready' });
    step(WALK.tickMs);
  }
  expect(stateOf(game).phase, 'the premise: planning proper').toBe('planning');
  expect(votesOpen(game), 'the premise: the votes are over').toBe(false);
  return { game, step };
}

/** Heiko offers the computer seat a pact, and the card's id. */
function offerToAi(game: MuleGame): string {
  game.handle('s1', { type: 'offerDeal', offer: { to: 's3', terms: { kind: 'pact' }, months: 3 } });
  return stateOf(game).politics!.deals.at(-1)!.id;
}

const cardIn = (game: MuleGame, seat: string, id: string): DealCard | undefined => game.viewFor(seat).me!.deals!.cards.find((c) => c.id === id);

describe('S3-B-AC-3 (server): a computer seat answers a card before planning ends, with no API key', () => {
  it('S3-B-AC-3: offered a card, the AI answers it when every human presses Ready at once, so the card ends accepted or declined, never expired', () => {
    const { game } = inPlanningProper();
    const id = offerToAi(game);

    // Every human in one turn: no tick runs between the offer and planning's end.
    for (const h of HUMANS) game.handle(h, { type: 'ready' });

    expect(stateOf(game).phase, 'the premise: planning ended').not.toBe('planning');
    expect(['active', 'declined']).toContain(cardIn(game, 's1', id)!.status);
  });

  it('S3-B-AC-3: a proposer below POLITICS.ai.deals.refuseBelow is declined (S3-RULE-9 row 1)', () => {
    const { game } = inPlanningProper();
    stateOf(game).players.find((p) => p.id === 's1')!.reputation = POLITICS.ai.deals.refuseBelow - 1;
    const id = offerToAi(game);

    for (const h of HUMANS) game.handle(h, { type: 'ready' });

    expect(cardIn(game, 's1', id)!.status).toBe('declined');
  });
});

describe('S3-T-AC-10: the server flushes every DealHand before planning ends', () => {
  it.each([
    ['every Ready (checkAllReady)', (game: MuleGame) => HUMANS.forEach((h) => game.handle(h, { type: 'ready' }))],
    ['the host’s Continue (continuePlanning)', (game: MuleGame) => game.handle('s1', { type: 'continue' })],
  ])('when planning ends by %s, the card offered to the AI is answered, not left open to expire', (_how, end) => {
    const { game } = inPlanningProper();
    const id = offerToAi(game);
    expect(stateOf(game).politics!.deals.find((d) => d.id === id)!.status, 'the premise: not yet answered').toBe('offered');

    end(game);

    expect(stateOf(game).phase, 'the premise: planning ended').not.toBe('planning');
    expect(stateOf(game).politics!.deals.find((d) => d.id === id)!.status).not.toMatch(/^(offered|expired)$/);
  });

  it('S3-T-AC-10: a card offered to the AI in planning proper is answered by its ticks, before anyone presses Ready', () => {
    const { game, step } = inPlanningProper();
    const id = offerToAi(game);

    for (let t = 0; t < 60_000 && stateOf(game).politics!.deals.find((d) => d.id === id)!.status === 'offered'; t += WALK.tickMs) step(WALK.tickMs);

    expect(stateOf(game).phase).toBe('planning');
    expect(['active', 'declined']).toContain(stateOf(game).politics!.deals.find((d) => d.id === id)!.status);
  });

  it.todo('S3-T-AC-10: a muted AI seat’s offer to the player who muted it is refused (waits for WS2’s mute on trunk)');
});
