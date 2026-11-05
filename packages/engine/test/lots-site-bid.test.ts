import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  COLONY,
  COLONY_SELLER,
  commission,
  createGame,
  list,
  lotDone,
  lotLeader,
  setLotWalk,
  stepLandAuction,
  type GameState,
  type PrestigeId,
  type Tile,
} from '../src/index.js';

/**
 * C30 (G-5 spec, RULE-28; AM-8): a commissioned park, stadium or spaceport upgrade that waits for its plot bids for
 * one at the land auction, from the fund, up to the maximum the Governor set. The colony bids as a proxy: it leads
 * at one credit over the best player's bid, never past its maximum (nor past what the fund can spare over its
 * reserve), so it pays no more than it must; a player who reaches its maximum takes the lot. When it wins, the fund
 * pays the price (fundOut 'siteBid') and siteProject makes the plot the colony's, bare.
 */
const SEATS = ['lena', 'brix', 'ossa', 'kai'];
const DT = 10;

/** Planning of month 1 with Lena governing and no vote open, a full fund, the park commissioned with `maxBid`. */
function governed(maxBid: number | null, ids: PrestigeId[] = ['park']): GameState {
  const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })), politics: true });
  state.politics = { ...state.politics!, governor: 'lena', election: null };
  state.treasury.money = 10_000;
  for (const id of ids) commission(state, 'lena', id);
  for (const p of state.colony!.projects) p.maxBid = maxBid;
  for (const p of state.players) p.money = 5_000;
  return state;
}

const tileOf = (state: GameState, x: number, y: number): Tile => state.tiles[y * state.width + x]!;
const live = (state: GameState) => state.landAuction!;
const walker = (state: GameState, id: string) => live(state).walkers.find((w) => w.id === id)!;
const money = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.money;
const project = (state: GameState, id: PrestigeId) => state.colony!.projects.find((p) => p.id === id)!;

/** Brix lists his plot at (x, y) for `minimum`; on into the land auction's walk of that lot. */
function brixLists(state: GameState, minimum = 100, x = 2, y = 1, kind: 'plot' | 'mule' = 'plot'): void {
  Object.assign(tileOf(state, x, y), { terrain: 'plains', owner: 'brix', outfit: kind === 'mule' ? 'food' : null, runMonths: 0 });
  list(state, 'brix', { item: { kind, x, y }, minimum, unsold: 'keep' });
  // No colony lot this month, so Brix's lot is the one up.
  state.listings = state.listings.filter((l) => l.seller !== COLONY_SELLER);
  while (state.phase !== 'landAuction') {
    advancePhase(state);
    state.listings = state.listings.filter((l) => l.seller !== COLONY_SELLER);
  }
  if (live(state).lot?.seller === COLONY_SELLER) throw new Error('a colony lot came up first');
  untilStage(state, 'walk');
}

function untilStage(state: GameState, stage: NonNullable<GameState['landAuction']>['stage']): void {
  for (let t = 0; live(state).stage !== stage && t < 120_000; t += DT) stepLandAuction(state, DT);
  expect(live(state).stage).toBe(stage);
}

function walkTo(state: GameState, id: string, bid: number): void {
  setLotWalk(state, id, 1);
  for (let i = 0; Math.round(walker(state, id).price) < bid && i < 100_000; i++) stepLandAuction(state, DT);
  setLotWalk(state, id, 0);
}

/** Every buyer presses Done: the bell rings on the next step. */
function bell(state: GameState) {
  for (const w of live(state).walkers) if (w.side === 'buyer') lotDone(state, w.id);
  stepLandAuction(state, DT);
  expect(live(state).stage).toBe('result');
  return live(state).result!;
}

describe('C30: the colony bids for an object’s site at the land auction (RULE-28)', () => {
  it('B-AC-26 (engine): with nobody else bidding, the colony takes the plot at its minimum; the fund pays, Brix is paid, the tile is the colony’s and bare', () => {
    const state = governed(300);
    brixLists(state, 100);
    expect(lotLeader(state)).toEqual({ id: COLONY_SELLER, bid: 100 });
    const brix = money(state, 'brix');
    const fund = state.treasury.money;
    const taxIn = state.colony!.ledger.in.salesTax ?? 0;
    expect(bell(state)).toEqual({ kind: 'sold', buyer: COLONY_SELLER, price: 100 });
    // The fund's site-bid line pays the price; the sale's tax comes back in as tax, as on any sale.
    const tax = Math.round(100 * state.treasury.salesTax);
    expect(state.colony!.ledger.out.siteBid).toBe(100);
    expect(money(state, 'brix')).toBe(brix + 100 - tax);
    expect(state.treasury.money).toBe(fund - 100 + tax);
    expect((state.colony!.ledger.in.salesTax ?? 0) - taxIn).toBe(tax);
    const tile = tileOf(state, 2, 1);
    expect(tile).toMatchObject({ owner: COLONY_SELLER, outfit: null });
    expect(project(state, 'park').plot).toBe(state.width + 2);
  });

  it('a proxy: it leads one credit over the best player, never past its maximum; a player at the maximum takes the lot and the colony pays nothing', () => {
    const state = governed(300);
    brixLists(state, 100);
    walkTo(state, 'ossa', 250);
    expect(lotLeader(state)).toEqual({ id: COLONY_SELLER, bid: 251 });
    walkTo(state, 'ossa', 300);
    expect(lotLeader(state)).toEqual({ id: 'ossa', bid: 300 });
    expect(bell(state)).toEqual({ kind: 'sold', buyer: 'ossa', price: 300 });
    expect(state.colony!.ledger.out.siteBid).toBeUndefined();
    expect(tileOf(state, 2, 1).owner).toBe('ossa');
    expect(project(state, 'park').plot).toBeNull();
  });

  it('wins at one over a player who stops short of its maximum', () => {
    const state = governed(300);
    brixLists(state, 100);
    walkTo(state, 'ossa', 180);
    expect(bell(state)).toEqual({ kind: 'sold', buyer: COLONY_SELLER, price: 181 });
    expect(state.colony!.ledger.out.siteBid).toBe(181);
  });

  it('bids no more than the fund can spare over its reserve, and not at all when that is under the minimum', () => {
    const capped = governed(300);
    capped.treasury.money = COLONY.reserve + 150;
    brixLists(capped, 100);
    walkTo(capped, 'ossa', 160);
    expect(lotLeader(capped)).toEqual({ id: 'ossa', bid: 160 });

    const poor = governed(300);
    poor.treasury.money = COLONY.reserve + 50;
    brixLists(poor, 100);
    expect(lotLeader(poor)).toBeNull();
  });

  it('does not bid with no bid set, for an object already sited, for an object that needs no plot, on a MULE lot or on its own lot', () => {
    const none = governed(null);
    brixLists(none, 100);
    expect(lotLeader(none)).toBeNull();

    const sited = governed(300);
    project(sited, 'park').plot = 0;
    brixLists(sited, 100);
    expect(lotLeader(sited)).toBeNull();

    const noPlot = governed(300, ['hospital']);
    brixLists(noPlot, 100);
    expect(lotLeader(noPlot)).toBeNull();

    const mule = governed(300);
    brixLists(mule, 100, 2, 1, 'mule');
    expect(lotLeader(mule)).toBeNull();
  });

  it('a plot with a MULE on it: the colony takes the plot bare and the MULE goes back to the corral, never out of the game', () => {
    const state = governed(300);
    const mules = () => state.store.mules + state.tiles.filter((t) => t.outfit).length + state.players.filter((p) => p.carriedMule).length;
    brixLists(state, 100);
    Object.assign(tileOf(state, 2, 1), { outfit: 'food', runMonths: 4 });
    const before = mules();
    const corral = state.store.mules;
    expect(bell(state)).toMatchObject({ buyer: COLONY_SELLER });
    expect(tileOf(state, 2, 1)).toMatchObject({ owner: COLONY_SELLER, outfit: null, runMonths: 0 });
    expect(state.store.mules).toBe(corral + 1);
    expect(mules()).toBe(before);
  });

  it('once it has won a site it bids on no later lot, though its maximum stays set (WS7, #334)', () => {
    const state = governed(300);
    Object.assign(tileOf(state, 5, 1), { terrain: 'plains', owner: 'kai', outfit: null, runMonths: 0 });
    list(state, 'kai', { item: { kind: 'plot', x: 5, y: 1 }, minimum: 100, unsold: 'keep' });
    brixLists(state, 100);
    // Kai listed first, so Kai's plot comes up first and the colony takes it.
    expect(live(state).lot!.seller).toBe('kai');
    expect(bell(state).kind).toBe('sold');
    expect(project(state, 'park')).toMatchObject({ plot: state.width + 5, maxBid: 300 });
    untilStage(state, 'walk');
    expect(live(state).lot!.seller).toBe('brix');
    expect(lotLeader(state)).toBeNull();
    expect(bell(state)).toEqual({ kind: 'kept' });
  });

  it('a game without the council never bids', () => {
    const state = createGame({ seed: 7, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
    brixLists(state, 100);
    expect(lotLeader(state)).toBeNull();
  });
});
