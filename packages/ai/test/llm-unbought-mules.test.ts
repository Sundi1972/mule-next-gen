/**
 * Unbought-MULEs fix (deep4, fix 4): what a seat's own hands did in a development no route was adopted for, in the
 * words the next land brief gives Claude. On the floor a refused buy comes back as the floor's reason ('offered dim',
 * 'no time'), which the brief must turn into why: the corral sold out, or the clock ran out. The server test
 * (brain-unbought-mules) proves the brief line end to end on tap-to-walk, which has no 'no time'; this table covers the
 * floor's reasons.
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '@mule/engine';
import type { DevLogEntry } from '../src/hands/develop.js';
import { handsDevelopment } from '../src/llm/kept.js';

const buy = (ok: boolean, why?: string): DevLogEntry => ({ label: 'Buy a MULE at the corral', ok, at: 0, action: { type: 'buyMule' }, ...(why ? { why } : {}) });
const outfit = (ok: boolean, why?: string): DevLogEntry => ({ label: 'Outfit it as a Food MULE', ok, at: 0, action: { type: 'outfit', outfit: 'food' }, ...(why ? { why } : {}) });

describe('unbought-mules fix: a refused buy on the hands\' own path, in the brief\'s words', () => {
  it.each([
    { name: 'the clock ran out before the corral', why: 'no time', corral: 4, said: 'no time was left' },
    { name: 'tap-to-walk: the buy walked off ok, its outfit refused with the corral empty', log: [buy(true), outfit(false)], corral: 0, said: 'the corral was sold out' },
    { name: 'the counter was dim and the corral is empty now', why: 'offered dim', corral: 0, said: 'the corral was sold out' },
    { name: 'the counter was dim with MULEs still in the corral', why: 'offered dim', corral: 3, said: 'the corral turned it down' },
    { name: 'a refusal with no reason off the floor, the corral empty now', why: undefined, corral: 0, said: 'the corral was sold out' },
  ])('unbought-mules fix: FM-dev-outcome-today: $name', ({ why, log, corral, said }) => {
    const state = createGame({ seed: 10, players: [{ id: 'p0', name: 'Ada', isAi: true }, { id: 'p1', name: 'Bo', isAi: true }] });
    state.store.mules = corral;

    const hands = handsDevelopment(state, 'p0', log ?? [buy(false, why)]);

    expect(hands).toEqual({ month: state.month, bought: 0, installed: [], refused: [said] });
  });
});
