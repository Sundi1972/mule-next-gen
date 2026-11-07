import { describe, expect, it } from 'vitest';
import { advancePhase, AI_PLANS, buildFloor, createGame, mulePriceFor, outfitCostFor, tileAt, tileIndex, type GameState } from '@mule/engine';
import { floorDevWalk } from '../src/floor-time.js';
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

  it("a swap while the seat leads a MULE fitted for another outfit is stale: the hand can't fit a led MULE again", () => {
    const state = development(4);
    const plot = ownPlains(state);
    state.tiles[plot]!.outfit = 'food';
    state.players.find((p) => p.id === ME)!.carriedMule = 'water';
    expect(routeVeto(state, mindOf(), { plot, outfit: 'energy' }, walkOf(state, LONG), simFloorConfig())).toBe(`stale: plot ${plot}`);
  });
});
