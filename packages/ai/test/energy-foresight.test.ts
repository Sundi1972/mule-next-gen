import { describe, expect, it } from 'vitest';
import { advancePhase, cloneForSim, createGame, nextPostedPrice, observe, type GameState } from '@mule/engine';
import { outlook } from '../src/outlook.js';

/**
 * Energy foresight (Heiko, 8 Nov, Energy A): the forecast reads Energy short, so a seat values a plant higher, when the
 * status quo turns plots off for Energy that the store's shelf could not have powered. Nobody trades in the status
 * quo, so a seat short while the store holds plenty is no colony shortage: that seat would buy.
 */
const players = [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI${i}`, isAi: true }));

/** Month 1's development, ai0 running three Smithore mines (2 Energy each) with no Energy of its own; the store holds `shelf`. */
function minesWithoutPower(shelf: number): GameState {
  const state = createGame({ seed: 3, players });
  while (state.phase !== 'development') advancePhase(state);
  for (const t of state.tiles.filter((t) => !t.owner && t.terrain === 'plains').slice(0, 3)) Object.assign(t, { owner: 'ai0', outfit: 'smithore' });
  for (const p of state.players) p.stock.energy = 0;
  state.store.stock.energy = shelf;
  return state;
}

/** The store's price the month after its colonists went short of Energy: the severe band (pricing RULE-6 row 2). */
function severe(state: GameState): number {
  return nextPostedPrice(cloneForSim(state), 'energy', undefined, ['energy']);
}

describe('Energy foresight: the forecast reads Energy short when the shelf could not power the plots turned off', () => {
  it('T-AC-E1: a shelf the plots turned off would empty by the forecast\'s month: the later price is the price after a shortage', () => {
    // 16 on the shelf posts 50 now; the three mines lack 6 a month, so the seat buying it empties the shelf by then.
    // Without the seats' buying in the status quo the shelf stays full and the forecast read 50.
    const draining = minesWithoutPower(16);
    const o = outlook(observe(draining, 'ai0'), 'ai0', { lookAhead: true });
    expect(o.price('energy'), 'the premise: Energy posts under the severe band now').toBeLessThan(severe(draining));
    expect(o.later('energy')).toBeGreaterThanOrEqual(severe(draining));
  });

  it('T-AC-E1 (negative): the same plots off with a full shelf are no shortage: the seat would buy, the later price stays a market price', () => {
    const full = minesWithoutPower(200);
    expect(outlook(observe(full, 'ai0'), 'ai0', { lookAhead: true }).later('energy')).toBeLessThan(severe(full) / 2);
  });
});
