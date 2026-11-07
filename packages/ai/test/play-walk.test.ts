import { describe, expect, it } from 'vitest';
import { advancePhase, createGame } from '@mule/engine';
import { applyAction, arrive, type DevClock } from '../src/play.js';

describe('the sim walks as the server does', () => {
  it('T-AC-27: while a colonist walks, the sim refuses every development action, an outfit too, as the server does', () => {
    const state = createGame({ seed: 3, players: [0, 1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: true })) });
    while (state.phase !== 'development') advancePhase(state);
    const p0 = state.players.find((p) => p.id === 'p0')!;
    const clock: DevClock = { left: 50, at: 'store' };
    const reach = () => {
      clock.left = clock.busy!.until;
      arrive(state, 'p0', clock);
    };
    // Buy a MULE at the corral: it is empty once the colonist gets there.
    expect(applyAction(state, 'p0', { type: 'buyMule' }, clock)).toBe(true);
    reach();
    expect(p0.carriedMule).toBe('empty');
    // Lead it to a plot next to the store: busy on the way, so an outfit is refused and the MULE stays empty.
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    expect(applyAction(state, 'p0', { type: 'install', x: store.x + 1, y: store.y }, clock)).toBe(true);
    expect(clock.busy).toBeDefined();
    expect(applyAction(state, 'p0', { type: 'outfit', outfit: 'food' }, clock)).toBe(false);
    expect(p0.carriedMule).toBe('empty');
    // Once there, it can be outfitted.
    reach();
    expect(clock.busy).toBeUndefined();
    expect(applyAction(state, 'p0', { type: 'outfit', outfit: 'food' }, clock)).toBe(true);
    expect(p0.carriedMule).toBe('food');
  });
});
