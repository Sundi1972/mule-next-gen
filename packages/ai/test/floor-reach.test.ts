import { describe, expect, it } from 'vitest';
import { createGame, floorConfig, terrainShare, tileAt, type GameState } from '@mule/engine';
import { installable, standPoint, tripSeconds } from '../src/floor-time.js';

const players = [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true }));
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/** The map with plot `index` held by ai0, as the plans weigh a plot for the seat that would hold it. */
const heldBy = (state: GameState, index: number): GameState => ({ ...state, tiles: state.tiles.map((t, i) => (i === index ? { ...t, owner: 'ai0' } : t)) });

describe('one reachability rule: the plans, the hands and the gate call a plot reachable only where a walk reaches it (PM, 7 Nov; deep4 D1)', () => {
  it('FM-floor-unreachable: across seeds 1-60, no plot installable calls reachable walks to Infinity from the store', () => {
    const cfg = floorConfig();
    const infinite: string[] = [];
    let cornerOnly = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const state = createGame({ seed, players });
      state.tiles.forEach((t, i) => {
        const held = heldBy(state, i);
        const dryAt = (ds: readonly (readonly [number, number])[]) =>
          ds.some(([dx, dy]) => {
            const u = tileAt(state.tiles, state.width, t.x + dx, t.y + dy);
            return !!u && terrainShare(u.terrain, cfg) > 0;
          });
        // deep4's shape: a lake whose only dry neighbour touches it at a corner. Reach offers it from there, so it stays reachable.
        if (t.terrain === 'lake' && !dryAt(SIDES) && dryAt(CORNERS)) {
          cornerOnly++;
          expect(installable(held, cfg, 'ai0', i), `seed ${seed} plot ${i}: a corner-only lake`).toBe(true);
        }
        if (!installable(held, cfg, 'ai0', i)) return;
        const seconds = tripSeconds(held, cfg, { pace: 1, bot: true }, standPoint('corral', cfg.hall), i, true, 'pub', { me: 'ai0', press: 'install' });
        if (!Number.isFinite(seconds)) infinite.push(`seed ${seed} plot ${i} (${t.x},${t.y}) ${t.terrain}`);
      });
    }
    expect(cornerOnly).toBe(41);
    expect(infinite).toEqual([]);
  });
});
