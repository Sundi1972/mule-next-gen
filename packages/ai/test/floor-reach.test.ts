import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, DEV_STEER, floorConfig, terrainShare, tileAt, tileIndex, type GameState } from '@mule/engine';
import { installable, standPoint, tripSeconds } from '../src/floor-time.js';
import { unreachablePlot } from '../src/hands/develop.js';
import { draftPlaybook } from '../src/playbook/draft.js';
import { validatorFor } from '../src/playbook/validate.js';
import { AiSeat } from '../src/seat.js';

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

  it('FM-floor-unreachable: the hands, the gate and the draft judge a plot shut in by lake as the plans do (seed 14)', () => {
    // Seed 14's month-1 development: ai2 holds a plains plot in the pocket at (13, 6) and a plains plot a walk reaches.
    const state = createGame({ seed: 14, players });
    while (state.phase !== 'development') advancePhase(state);
    for (const t of state.tiles) if (t.owner === 'ai2') t.owner = null;
    const pocket = tileIndex(state.width, 13, 6);
    state.tiles[pocket]!.owner = 'ai2';
    const open = state.tiles.findIndex((t, i) => t.terrain === 'plains' && t.owner === null && i !== pocket && installable(state, floorConfig(), 'ai2', i));
    state.tiles[open]!.owner = 'ai2';
    const mind = new AiSeat({ id: 'ai2', name: 'AI 3', persona: 'trader', level: 'trader', seed: 102 }).mind;
    const steering = DEV_STEER.on;
    try {
      DEV_STEER.on = true;
      expect([unreachablePlot(state, pocket, floorConfig()), unreachablePlot(state, open, floorConfig())]).toEqual([true, false]);
      const draft = draftPlaybook({ state, seat: 'ai2', mind, seed: 102, phase: 'development' });
      expect(draft.development!.route).not.toContainEqual({ act: 'install', plot: pocket });
      const route = [{ act: 'buyMule' }, { act: 'outfit', outfit: 'food' }, { act: 'install', plot: pocket }, { act: 'pub' }];
      const r = validatorFor({ mind, seed: 102 })(state, 'ai2', draft, [{ path: '/development/route', to: route, reason: 'a test edit' }]);
      expect(r.rejected.find((x) => x.path === '/development/route')?.why).toBe(`route: no walk reaches plot ${pocket}, step 2`);
    } finally {
      DEV_STEER.on = steering;
    }
  });
});
