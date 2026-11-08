/**
 * Unbought-MULEs fix (deep4, fix 4): what a seat's own hands did in a development no route was adopted for, in the
 * words the next land brief gives Claude. On the floor (steered walking, the live mode) a step comes back with the
 * floor's reason: 'no time' when the clock rules it out before the walk starts, 'hurry' or 'hurry after a pack' when
 * the clock cuts a walk under way (develop.ts hurry), 'offered dim' at a dim counter. The brief must turn each into why:
 * the clock ran out, or the corral sold out; and a MULE bought before the clock cut its outfit or install was bought.
 * The server test (brain-unbought-mules) proves the brief line end to end; this table covers the floor's reasons.
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '@mule/engine';
import type { DevLogEntry } from '../src/hands/develop.js';
import { handsDevelopment } from '../src/llm/kept.js';

const buy = (ok: boolean, why?: string): DevLogEntry => ({ label: 'Buy a MULE at the corral', ok, at: 0, action: { type: 'buyMule' }, ...(why ? { why } : {}) });
const outfit = (ok: boolean, why?: string): DevLogEntry => ({ label: 'Outfit it as a Food MULE', ok, at: 0, action: { type: 'outfit', outfit: 'food' }, ...(why ? { why } : {}) });
const install = (ok: boolean, why?: string): DevLogEntry => ({ label: 'Install it on plot 1·1 (plains)', ok, at: 0, action: { type: 'install', x: 0, y: 0 }, ...(why ? { why } : {}) });

const NONE = { bought: 0, installed: [], refused: [], unfinished: [], stopped: null };

describe("unbought-mules fix: the hands' own development, in the brief's words", () => {
  it.each([
    { name: 'the clock ran out before the walk to the corral', log: [buy(false, 'no time')], corral: 4, said: { refused: ['no time was left'] } },
    { name: "the floor's clock cut the walk to the corral (hurry)", log: [buy(false, 'hurry')], corral: 4, said: { refused: ['no time was left'] } },
    { name: 'a pack slowed the walk and the clock cut it, the corral empty by then', log: [buy(false, 'hurry after a pack')], corral: 0, said: { refused: ['no time was left'] } },
    { name: 'tap-to-walk: the buy walked off ok, its outfit refused with no reason and the corral empty', log: [buy(true), outfit(false)], corral: 0, said: { refused: ['the corral was sold out'] } },
    { name: 'the counter was dim and the corral is empty now', log: [buy(false, 'offered dim')], corral: 0, said: { refused: ['the corral was sold out'] } },
    { name: 'the counter was dim with MULEs still in the corral', log: [buy(false, 'offered dim')], corral: 3, said: { refused: ['the corral turned it down'] } },
    { name: 'a refusal with no reason off the floor, the corral empty now', log: [buy(false)], corral: 0, said: { refused: ['the corral was sold out'] } },
    {
      name: 'a MULE bought on the floor, the clock cut the walk to the outfitter',
      log: [buy(true), outfit(false, 'hurry')],
      corral: 3,
      said: { bought: 1, unfinished: ['time ran out before a bought MULE was outfitted'] },
    },
    {
      name: 'a MULE bought and outfitted, the clock cut the walk to its plot',
      log: [buy(true), outfit(true), install(false, 'hurry after a pack')],
      corral: 3,
      said: { bought: 1, unfinished: ['time ran out before a bought MULE was installed'] },
    },
  ])('unbought-mules fix: FM-dev-outcome-today: $name', ({ log, corral, said }) => {
    const state = createGame({ seed: 10, players: [{ id: 'p0', name: 'Ada', isAi: true }, { id: 'p1', name: 'Bo', isAi: true }] });
    state.store.mules = corral;

    const hands = handsDevelopment(state, 'p0', log);

    expect(hands).toEqual({ month: state.month, ...NONE, ...said });
  });
});
