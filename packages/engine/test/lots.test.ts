import { describe, expect, it } from 'vitest';
import { advancePhase, createGame, DEVELOPMENT, endLandAuction, list, mulePrice, orderGeoDrone, RuleError, unlist, type GameState, type Tile } from '../src/index.js';

const SEATS = ['brix', 'ossa', 'lena', 'tam'];

function newGame(): GameState {
  return createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
}

function own(state: GameState, x: number, y: number, owner: string | null, outfit: Tile['outfit'] = null): Tile {
  const tile = state.tiles[y * state.width + x]!;
  Object.assign(tile, { terrain: 'plains', owner, outfit, runMonths: 0 });
  return tile;
}

function toPhase(state: GameState, phase: GameState['phase']): void {
  for (let steps = 0; state.phase !== phase && steps < 10; steps++) advancePhase(state);
}

const plotAt = (x: number, y: number) => ({ kind: 'plot' as const, x, y });
const muleAt = (x: number, y: number) => ({ kind: 'mule' as const, x, y });
const keep = (item: ReturnType<typeof plotAt> | ReturnType<typeof muleAt>, minimum = 250) => ({ item, minimum, unsold: 'keep' as const });

function refused(fn: () => unknown, message: string): void {
  expect(fn).toThrow(RuleError);
  expect(fn).toThrow(message);
}

describe('T-AC-3: listing a plot or a MULE (RULE-1)', () => {
  it('T-AC-3: RULE-1 row 1 — a listing outside planning is refused, and nothing is listed', () => {
    const state = newGame();
    own(state, 0, 0, 'brix');
    toPhase(state, 'landGrant');
    refused(() => list(state, 'brix', keep(plotAt(0, 0))), 'Listings are made in planning');
    expect(state.listings).toEqual([]);
  });

  it('T-AC-3: RULE-1 row 2 — the store, or a square off the map, is not a plot', () => {
    const state = newGame();
    const store = state.tiles.find((t) => t.terrain === 'store')!;
    refused(() => list(state, 'brix', keep(plotAt(store.x, store.y))), 'Not a plot');
    refused(() => list(state, 'brix', keep(plotAt(state.width, 0))), 'Not a plot');
    expect(state.listings).toEqual([]);
  });

  it('T-AC-3: RULE-1 — a malformed kind or unsold is refused, and nothing is listed', () => {
    const state = newGame();
    own(state, 0, 0, 'brix', 'food');
    refused(() => list(state, 'brix', keep({ kind: 'house', x: 0, y: 0 } as never)), 'Not a plot');
    refused(() => list(state, 'brix', { item: plotAt(0, 0), minimum: 250, unsold: 'burn' as never }), 'Pick store or keep');
    expect(state.listings).toEqual([]);
  });

  it("T-AC-3: RULE-1 row 3 — Ossa can't list Lena's plot, nor a free one", () => {
    const state = newGame();
    own(state, 6, 4, 'lena');
    own(state, 1, 0, null);
    refused(() => list(state, 'ossa', keep(plotAt(6, 4))), 'Not your plot');
    refused(() => list(state, 'ossa', keep(plotAt(1, 0))), 'Not your plot');
    expect(state.listings).toEqual([]);
  });

  it('T-AC-3: RULE-1 row 4 — the MULE of a plot with no MULE is refused', () => {
    const state = newGame();
    own(state, 0, 0, 'brix');
    refused(() => list(state, 'brix', keep(muleAt(0, 0))), 'No MULE on that plot');
    expect(state.listings).toEqual([]);
  });

  it('T-AC-3: RULE-1 row 5 — the MULE of a plot already listed, or the plot twice, is refused', () => {
    const state = newGame();
    own(state, 0, 0, 'brix', 'food');
    list(state, 'brix', keep(plotAt(0, 0)));
    refused(() => list(state, 'brix', keep(muleAt(0, 0))), 'That plot is already up for auction');
    refused(() => list(state, 'brix', keep(plotAt(0, 0))), 'That plot is already up for auction');
    expect(state.listings).toHaveLength(1);
  });

  it('T-AC-3: RULE-1 row 6 — a third lot from one player is refused; their second was fine', () => {
    const state = newGame();
    for (const x of [0, 1, 2]) own(state, x, 0, 'brix');
    list(state, 'brix', keep(plotAt(0, 0)));
    list(state, 'brix', keep(plotAt(1, 0)));
    refused(() => list(state, 'brix', keep(plotAt(2, 0))), 'You can list 2 lots a month');
    expect(state.listings.map((l) => l.item.x)).toEqual([0, 1]);
  });

  it('T-AC-3: RULE-1 row 7 — the fifth lot in a month, from a third player, is refused as full', () => {
    const state = newGame();
    for (const [x, seller] of [[0, 'brix'], [1, 'brix'], [2, 'ossa'], [3, 'ossa'], [4, 'lena']] as const) own(state, x, 0, seller);
    list(state, 'brix', keep(plotAt(0, 0)));
    list(state, 'brix', keep(plotAt(1, 0)));
    list(state, 'ossa', keep(plotAt(2, 0)));
    list(state, 'ossa', keep(plotAt(3, 0)));
    refused(() => list(state, 'lena', keep(plotAt(4, 0))), 'The auction is full this month');
    expect(state.listings).toHaveLength(4);
  });

  it.each([0, -5, 2.5, Number.NaN])('T-AC-3: RULE-1 row 8 — a minimum of %s is refused', (minimum) => {
    const state = newGame();
    own(state, 0, 0, 'brix');
    refused(() => list(state, 'brix', { item: plotAt(0, 0), minimum, unsold: 'keep' }), 'Pick a minimum of 1 or more');
    expect(state.listings).toEqual([]);
  });

  it('T-AC-3: RULE-1 row 9 — own plot at 250/keep and a MULE are listed in order, with what the store would pay fixed now', () => {
    const state = newGame();
    own(state, 6, 4, 'lena');
    own(state, 5, 3, 'brix', 'smithore');
    const muleShare = Math.round(mulePrice(state) / 2);

    list(state, 'lena', keep(plotAt(6, 4)));
    list(state, 'brix', { item: muleAt(5, 3), minimum: 80, unsold: 'store' });
    state.store.muleFactor *= 2;

    expect(state.listings).toEqual([
      expect.objectContaining({ seller: 'lena', item: plotAt(6, 4), minimum: 250, unsold: 'keep', storePays: 200 }),
      expect.objectContaining({ seller: 'brix', item: { ...muleAt(5, 3), outfit: 'smithore' }, minimum: 80, unsold: 'store', storePays: muleShare }),
    ]);
    expect(new Set(state.listings.map((l) => l.id)).size).toBe(2);
  });

  it('T-AC-3: RULE-1 unlist — only the seller, only in planning', () => {
    const state = newGame();
    own(state, 0, 0, 'brix');
    own(state, 1, 0, 'brix');
    const first = list(state, 'brix', keep(plotAt(0, 0)));
    const second = list(state, 'brix', keep(plotAt(1, 0)));

    refused(() => unlist(state, 'ossa', first.id), 'Not your listing');
    refused(() => unlist(state, 'brix', 'nothing'), 'No such listing');
    unlist(state, 'brix', first.id);
    expect(state.listings.map((l) => l.id)).toEqual([second.id]);

    toPhase(state, 'landGrant');
    refused(() => unlist(state, 'brix', second.id), 'Listings are made in planning');
    expect(state.listings.map((l) => l.id)).toEqual([second.id]);
  });
});

describe('T-AC-3: the geo drone over listed plots (RULE-1 drone row, C4)', () => {
  it("T-AC-3: RULE-1 drone row — Ossa's drone flies over Lena's listed plot, and the reading is Ossa's alone", () => {
    const state = newGame();
    own(state, 6, 4, 'lena');
    list(state, 'lena', keep(plotAt(6, 4)));
    const money = state.players[1]!.money;

    orderGeoDrone(state, 'ossa', [{ x: 6, y: 4 }]);
    toPhase(state, 'landGrant');

    const index = 4 * state.width + 6;
    expect(state.players[1]!.money).toBe(money - DEVELOPMENT.droneFee);
    expect(state.players[1]!.analysed).toContain(index);
    expect(state.players[2]!.analysed).not.toContain(index);
  });

  it('T-AC-3: RULE-1 drone row pin — a free plot is still a drone target', () => {
    const state = newGame();
    own(state, 1, 0, null);
    orderGeoDrone(state, 'ossa', [{ x: 1, y: 0 }]);
    expect(state.players[1]!.droneOrder).toEqual([1]);
  });

  it('T-AC-3: RULE-1 drone row pin — an owned plot nobody listed is still refused, and nothing is paid', () => {
    const state = newGame();
    own(state, 6, 4, 'lena');
    const money = state.players[1]!.money;
    refused(() => orderGeoDrone(state, 'ossa', [{ x: 6, y: 4 }]), 'The drone only flies over free or listed plots');
    expect(state.players[1]!.money).toBe(money);
    expect(state.players[1]!.droneOrder).toEqual([]);
  });
});

describe('the land auction phase (RULE-2)', () => {
  it('B-AC-5: no listings ⇒ landGrant → development', () => {
    const state = newGame();
    toPhase(state, 'landGrant');
    advancePhase(state);
    expect(state.phase).toBe('development');
    expect(state.landAuction).toBeNull();
  });

  it('RULE-2 (serves B-AC-5): one listing ⇒ landGrant → landAuction, with that lot up first in its intro', () => {
    const state = newGame();
    own(state, 6, 4, 'lena');
    const listing = list(state, 'lena', keep(plotAt(6, 4)));
    toPhase(state, 'landGrant');
    advancePhase(state);
    expect(state.phase).toBe('landAuction');
    expect(state.landAuction).toMatchObject({ stage: 'intro', lot: listing, number: 1, count: 1, result: null });
  });

  it('RULE-2 (serves B-AC-3): endLandAuction resolves every remaining lot as kept, and leaving the phase clears the listings', () => {
    const state = newGame();
    own(state, 6, 4, 'lena');
    own(state, 5, 3, 'brix', 'food');
    list(state, 'lena', { item: plotAt(6, 4), minimum: 1, unsold: 'store' });
    list(state, 'brix', { item: muleAt(5, 3), minimum: 1, unsold: 'store' });
    toPhase(state, 'landAuction');
    const money = state.players.map((p) => p.money);
    const capital = state.store.capital;
    const corral = state.store.mules;

    endLandAuction(state);

    expect(state.landAuction?.stage).toBe('over');
    expect(state.players.map((p) => p.money)).toEqual(money);
    expect(state.store.capital).toBe(capital);
    expect(state.store.mules).toBe(corral);
    expect(state.tiles[4 * state.width + 6]).toMatchObject({ owner: 'lena' });
    expect(state.tiles[3 * state.width + 5]).toMatchObject({ owner: 'brix', outfit: 'food' });

    advancePhase(state);
    expect(state.phase).toBe('development');
    expect(state.listings).toEqual([]);
    expect(state.landAuction).toBeNull();
  });
});
