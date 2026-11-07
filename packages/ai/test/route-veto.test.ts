import { describe, expect, it } from 'vitest';
import { advancePhase, AI_PLANS, buildFloor, createGame, mulePriceFor, outfitCostFor, reachOf, tileAt, tileIndex, type GameState } from '@mule/engine';
import { floorDevWalk, installable, plotWalk, shoreStands } from '../src/floor-time.js';
import { simFloorConfig } from '../src/floor-turn.js';
import { routeVeto, unreachablePlot } from '../src/hands/develop.js';
import { AiSeat } from '../src/seat.js';

const ME = 'ai0';

/** Month 1's development of seed `seed`'s four-seat game, as the sim plays it. */
function development(seed: number): GameState {
  const state = createGame({ seed, players: [0, 1, 2, 3].map((i) => ({ id: `ai${i}`, name: `AI ${i + 1}`, isAi: true })) });
  while (state.phase !== 'development') advancePhase(state);
  for (const t of state.tiles) if (t.owner === ME) t.owner = null;
  return state;
}

/** Gives ai0 the plot at (x, y) and returns its index. */
function own(state: GameState, x: number, y: number): number {
  tileAt(state.tiles, state.width, x, y)!.owner = ME;
  return tileIndex(state.width, x, y);
}

describe('unreachablePlot: a lake plot no shore reaches can never get a MULE', () => {
  it('a lake plot ringed by lake (seed 4, plot 10) is unreachable', () => {
    const state = development(4);
    const plot = own(state, 10, 0);
    expect(state.tiles[plot]!.terrain).toBe('lake');
    expect(unreachablePlot(state, plot, simFloorConfig())).toBe(true);
  });

  it("a lake plot whose only shore is the seat's own land (seed 4, plot 25) is unreachable for it", () => {
    const state = development(4);
    const plot = own(state, 10, 1);
    own(state, 9, 2);
    expect(unreachablePlot(state, plot, simFloorConfig())).toBe(true);
  });

  it('a lake plot with a shore a seat can stand on (seed 4, plot 25) is reachable', () => {
    const state = development(4);
    const plot = own(state, 10, 1);
    expect(state.tiles[plot]!.terrain).toBe('lake');
    expect(unreachablePlot(state, plot, simFloorConfig())).toBe(false);
  });

  it('ordinary land is reachable', () => {
    const state = development(4);
    const land = state.tiles.findIndex((t) => t.terrain === 'plains');
    own(state, state.tiles[land]!.x, state.tiles[land]!.y);
    expect(unreachablePlot(state, land, simFloorConfig())).toBe(false);
  });

  it('a lake plot nobody holds is judged as if a seat held it: ringed by lake, unreachable; with a free shore, reachable', () => {
    const state = development(4);
    expect(unreachablePlot(state, tileIndex(state.width, 10, 0))).toBe(true);
    expect(unreachablePlot(state, tileIndex(state.width, 10, 1))).toBe(false);
  });

  it("a lake plot nobody holds, judged for a seat: whose only shore is that seat's own land (seed 4, plot 25), unreachable for it and reachable for another", () => {
    const state = development(4);
    const plot = tileIndex(state.width, 10, 1);
    own(state, 9, 2);
    expect(state.tiles[plot]!.owner).toBeNull();
    expect(unreachablePlot(state, plot, simFloorConfig(), ME), 'for ai0').toBe(true);
    expect(unreachablePlot(state, plot, simFloorConfig(), 'ai1'), 'for ai1').toBe(false);
  });
});

/** ai0's floor walk from where it stands at the start of development, with `left` seconds on the clock. */
function walkOf(state: GameState, left: number) {
  const cfg = simFloorConfig();
  const c = buildFloor(state, cfg).colonists.find((x) => x.id === ME)!;
  return floorDevWalk(state, cfg, c, left, 0);
}

const mindOf = () => new AiSeat({ id: ME, name: 'AI 1', persona: 'trader', level: 'trader', seed: 11 }).mind;

/** ai0's nearest free plains plot to the store, given to it. */
function ownPlains(state: GameState): number {
  const store = state.tiles.find((t) => t.terrain === 'store')!;
  const far = (i: number) => Math.abs(state.tiles[i]!.x - store.x) + Math.abs(state.tiles[i]!.y - store.y);
  const free = state.tiles.flatMap((t, i) => (t.terrain === 'plains' && t.owner === null ? [i] : [])).sort((a, b) => far(a) - far(b));
  state.tiles[free[0]!]!.owner = ME;
  return free[0]!;
}

describe("routeVeto: why the hands refuse a route MULE before it is bought, or null", () => {
  const LONG = 1_000;

  it('an own idle plot in reach, with the cash, is played', () => {
    const state = development(4);
    const plot = ownPlains(state);
    expect(routeVeto(state, mindOf(), { plot, outfit: 'food' }, walkOf(state, LONG), simFloorConfig())).toBeNull();
  });

  it("someone else's plot is stale", () => {
    const state = development(4);
    const plot = ownPlains(state);
    state.tiles[plot]!.owner = 'ai1';
    expect(routeVeto(state, mindOf(), { plot, outfit: 'food' }, walkOf(state, LONG), simFloorConfig())).toBe(`stale: plot ${plot}`);
  });

  it("on the floor, a lake plot no shore reaches says so, not the walk's Infinity", () => {
    const state = development(4);
    const plot = own(state, 10, 0);
    expect(routeVeto(state, mindOf(), { plot, outfit: 'water' }, walkOf(state, LONG), simFloorConfig())).toBe(`lake: no shore reaches plot ${plot}`);
  });

  it("on the floor, a lake plot a shore reaches (seed 4, plot 24) is played while the MULE the seat leads, fitted, has bolted", () => {
    const state = development(4);
    const plot = own(state, 9, 1);
    Object.assign(state.players.find((p) => p.id === ME)!, { carriedMule: 'water', muleBolted: true });
    expect(routeVeto(state, mindOf(), { plot, outfit: 'water' }, walkOf(state, LONG), simFloorConfig())).toBeNull();
  });

  it('where the game taps, the same lake plot is played: a tap installs on any lake', () => {
    const state = development(4);
    const plot = own(state, 10, 0);
    expect(routeVeto(state, mindOf(), { plot, outfit: 'water' })).toBeNull();
  });

  it("a walk longer than the clock is the walk's veto", () => {
    const state = development(4);
    const plot = ownPlains(state);
    expect(routeVeto(state, mindOf(), { plot, outfit: 'food' }, walkOf(state, 1), simFloorConfig())).toMatch(/^stale: the walk takes \d+ s, 1 s left$/);
  });

  it('a MULE that would take the cash under an adopted cash floor is stale', () => {
    const state = development(4);
    const plot = ownPlains(state);
    const money = state.players.find((p) => p.id === ME)!.money;
    const cashFloor = Math.min(money, AI_PLANS.bounds.cashFloorMax);
    const mind = { ...mindOf(), adopted: { month: state.month, cashFloor, pressShare: null, monopolyTarget: null } };
    expect(routeVeto(state, mind, { plot, outfit: 'food' }, walkOf(state, LONG), simFloorConfig())).toBe(`stale: under the cash floor of ${cashFloor} cr`);
  });
});

describe('routeVeto on an own plot that has a MULE: a different outfit is a swap, the same is stale', () => {
  const LONG = 1_000;
  /** ai0's money as a cash floor: any spend at all goes under it. */
  const floored = (state: GameState) => {
    const money = state.players.find((p) => p.id === ME)!.money;
    return { ...mindOf(), adopted: { month: state.month, cashFloor: money, pressShare: null, monopolyTarget: null } };
  };

  it('a MULE of another outfit is played, as a swap', () => {
    const state = development(4);
    const plot = ownPlains(state);
    state.tiles[plot]!.outfit = 'food';
    expect(routeVeto(state, mindOf(), { plot, outfit: 'energy' }, walkOf(state, LONG), simFloorConfig())).toBeNull();
  });

  it('a MULE of the same outfit is stale: nothing to swap', () => {
    const state = development(4);
    const plot = ownPlains(state);
    state.tiles[plot]!.outfit = 'food';
    expect(routeVeto(state, mindOf(), { plot, outfit: 'food' }, walkOf(state, LONG), simFloorConfig())).toBe(`stale: plot ${plot}`);
  });

  it('a swap is priced as a new MULE and its outfit: the old MULE pays nothing back', () => {
    const state = development(4);
    const plot = ownPlains(state);
    state.tiles[plot]!.outfit = 'food';
    const me = state.players.find((p) => p.id === ME)!;
    const cost = mulePriceFor(state, ME) + outfitCostFor(state, ME, 'energy');
    const mind = { ...mindOf(), adopted: { month: state.month, cashFloor: me.money - cost, pressShare: null, monopolyTarget: null } };
    expect(routeVeto(state, mind, { plot, outfit: 'energy' }, walkOf(state, LONG), simFloorConfig())).toBeNull();
    expect(routeVeto(state, floored(state), { plot, outfit: 'energy' }, walkOf(state, LONG), simFloorConfig())).toMatch(/^stale: under the cash floor/);
  });

  it('the MULE a swap put on the lead costs nothing more on an idle plot: it keeps its outfit', () => {
    const state = development(4);
    const [off, idle] = [ownPlains(state), ownPlains(state)];
    const me = state.players.find((p) => p.id === ME)!;
    const at = state.tiles[off]!;
    Object.assign(me, { carriedMule: 'food', takenMule: { x: at.x, y: at.y, outfit: 'food', runMonths: 0, swapped: true } });
    expect(routeVeto(state, floored(state), { plot: idle!, outfit: 'water' }, walkOf(state, LONG), simFloorConfig())).toBeNull();
  });

  it("a swap while the seat leads a MULE fitted for another outfit is stale: the hand never fits a led MULE again", () => {
    const state = development(4);
    const plot = ownPlains(state);
    state.tiles[plot]!.outfit = 'food';
    state.players.find((p) => p.id === ME)!.carriedMule = 'water';
    expect(routeVeto(state, mindOf(), { plot, outfit: 'energy' }, walkOf(state, LONG), simFloorConfig())).toBe(`stale: plot ${plot}`);
  });
});

describe('a lake plot whose only shore is a corner: the walk price agrees with unreachablePlot', () => {
  it('seed 4, plot 25, its only shore the corner (9,2): reachable, priced finite, and played', () => {
    const state = development(4);
    const plot = own(state, 10, 1);
    const walk = walkOf(state, 1_000);
    const legs = walk.floor!(plot, 'water');
    expect(unreachablePlot(state, plot, simFloorConfig())).toBe(false);
    expect([legs.there, legs.pub].every(Number.isFinite)).toBe(true);
    expect(routeVeto(state, mindOf(), { plot, outfit: 'water' }, walk, simFloorConfig())).toBeNull();
  });
});

describe('a lake plot is priced by the stands shoreStands returns for that seat and press', () => {
  const AROUND = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

  it("seed 1, every lake plot with one neighbour the seat's own: the priced install walk ends on a stand, where Reach offers that install", () => {
    // Seed 15, month 4 (FM-hurry-margin): ai3's lake (13,7) was priced through the corner (12,6), where Reach offers
    // its own lake (12,7) instead; the only stand was over 1 s farther, and the MULE was lost for want of time. Here
    // every neighbour, land or lake, is in turn the seat's own: no shore for its install, or a nearer lake of its own.
    const cfg = simFloorConfig();
    const base = development(1);
    const wrong: string[] = [];
    let checked = 0;
    for (const lake of base.tiles.filter((t) => t.terrain === 'lake')) {
      for (const [dx, dy] of AROUND) {
        const n = tileAt(base.tiles, base.width, lake.x + dx, lake.y + dy);
        if (!n || n.terrain === 'store') continue;
        const state = structuredClone(base);
        const plot = own(state, lake.x, lake.y);
        own(state, n.x, n.y);
        state.players.find((p) => p.id === ME)!.carriedMule = 'food';
        if (!installable(state, cfg, ME, plot)) continue;
        const floor = buildFloor(state, cfg);
        const c = floor.colonists.find((x) => x.id === ME)!;
        const walk = plotWalk(state, cfg, { ...c, lead: { good: null, x: c.x, y: c.y } }, plot, 'install');
        checked++;
        const stands = shoreStands(state, cfg, ME, lake, 'install').map(({ at }) => `${Math.floor(at.x)},${Math.floor(at.y)}`);
        const there = { ...floor, colonists: floor.colonists.map((x) => (x.id === ME ? { ...x, space: 'map' as const, x: walk.end.x, y: walk.end.y } : x)) };
        const reach = reachOf(there, state, ME, cfg);
        const offered = reach.kind === 'install' && reach.plot.x === lake.x && reach.plot.y === lake.y;
        const onStand = stands.includes(`${Math.floor(walk.end.x)},${Math.floor(walk.end.y)}`);
        if (!offered || !onStand) wrong.push(`lake (${lake.x},${lake.y}), own (${n.x},${n.y}): ends on (${Math.floor(walk.end.x)},${Math.floor(walk.end.y)}), stands [${stands.join(' ')}], Reach offers ${reach.kind}${'plot' in reach ? ` (${reach.plot.x},${reach.plot.y})` : ''}`);
      }
    }
    expect(checked, 'lake plots with a neighbour owned that still have a stand').toBeGreaterThan(20);
    expect(wrong, `of ${checked}`).toEqual([]);
  });
});
