import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  cloneForSim,
  COLONY_SELLER,
  createGame,
  freePlots,
  GAME,
  list,
  LOTS,
  lotDone,
  setLotWalk,
  stepLandAuction,
  type GameState,
  type Tile,
} from '../src/index.js';

const SEATS = ['brix', 'ossa', 'lena', 'tam'];
const DT = 10;
const SCAN = 400;

function newGame(seed: number): GameState {
  return createGame({ seed, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
}

function toPhase(state: GameState, phase: GameState['phase']): void {
  for (let steps = 0; state.phase !== phase && steps < 10; steps++) advancePhase(state);
}

/** Through the land grant, nobody claiming, and out of it. */
function leaveGrant(state: GameState): void {
  toPhase(state, 'landGrant');
  advancePhase(state);
}

const colonyLotUp = (state: GameState) => state.landAuction?.lot?.seller === COLONY_SELLER;

/** Seeds whose first month, with all land free and nothing listed, brings a colony lot. */
const colonySeeds = Array.from({ length: SCAN }, (_, i) => i + 1).filter((seed) => {
  const state = newGame(seed);
  leaveGrant(state);
  return colonyLotUp(state);
});
const COLONY_SEED = colonySeeds[0]!;
const QUIET_SEED = Array.from({ length: SCAN }, (_, i) => i + 1).find((seed) => !colonySeeds.includes(seed));

const tileOf = (state: GameState, x: number, y: number): Tile => state.tiles[y * state.width + x]!;
const plots = (state: GameState) => state.tiles.filter((t) => t.terrain !== 'store');
const money = (state: GameState) => Object.fromEntries(state.players.map((p) => [p.id, p.money]));
const live = (state: GameState) => state.landAuction!;
const buyers = (state: GameState) => live(state).walkers.filter((w) => w.side === 'buyer').map((w) => w.id);

function untilStage(state: GameState, stage: NonNullable<GameState['landAuction']>['stage']): void {
  for (let t = 0; live(state).stage !== stage && t < 120_000; t += DT) stepLandAuction(state, DT);
  expect(live(state).stage).toBe(stage);
}

function walkTo(state: GameState, id: string, bid: number): void {
  const w = () => live(state).walkers.find((x) => x.id === id)!;
  setLotWalk(state, id, 1);
  for (let i = 0; Math.round(w().price) < bid && i < 100_000; i++) stepLandAuction(state, DT);
  setLotWalk(state, id, 0);
  expect(Math.round(w().price)).toBe(bid);
}

function bell(state: GameState): void {
  for (const id of buyers(state)) lotDone(state, id);
  stepLandAuction(state, DT);
  expect(live(state).stage).toBe('result');
}

describe('T-AC-6: the colony sometimes puts a free plot up (RULE-7)', () => {
  it('T-AC-6: RULE-7 example roll under the chance with free land — one colony plot, lot 1, at the colony minimum, kept if unsold', () => {
    expect(colonySeeds.length).toBeGreaterThan(0);
    const state = newGame(COLONY_SEED);
    leaveGrant(state);
    expect(state.phase).toBe('landAuction');
    const lot = live(state).lot!;
    expect(lot).toMatchObject({ seller: COLONY_SELLER, minimum: Math.round(LOTS.colonyPlotShare * GAME.plotScore), unsold: 'keep' });
    expect(lot.item.kind).toBe('plot');
    const tile = tileOf(state, lot.item.x, lot.item.y);
    expect(tile.terrain).not.toBe('store');
    expect(tile.owner).toBeNull();
    expect(live(state)).toMatchObject({ number: 1, count: 1 });
  });

  it("T-AC-6: RULE-7 example roll under the chance — the colony's plot goes first, before the players' lots, and takes a slot", () => {
    const state = newGame(COLONY_SEED);
    const [a, b, c] = plots(state);
    const sellers = ['brix', 'brix', 'ossa'];
    [a!, b!, c!].forEach((t, i) => {
      t.owner = sellers[i]!;
      list(state, sellers[i]!, { item: { kind: 'plot', x: t.x, y: t.y }, minimum: 250, unsold: 'keep' });
    });
    leaveGrant(state);
    expect(live(state).lot!.seller).toBe(COLONY_SELLER);
    expect(live(state)).toMatchObject({ number: 1, count: 4 });
    expect(live(state).queue.map((l) => l.seller)).toEqual(sellers);
  });

  it('T-AC-6: RULE-7 example roll at or over the chance — no colony lot, and with nothing listed the game goes on to development', () => {
    expect(QUIET_SEED).toBeDefined();
    const state = newGame(QUIET_SEED!);
    leaveGrant(state);
    expect(state.phase).toBe('development');
    expect(state.landAuction).toBeNull();
  });

  // 1,000 fresh games, each dealing a full map (a few ms apiece), outlast the 5 s default on a busy machine.
  it('T-AC-6: RULE-7 row 1 — about colonyPlotChance of (seed, month) pairs with free land bring a colony lot, rolled per month and on varied plots', () => {
    const months = [1, 2, 3, 5, 8];
    const lots = Array.from({ length: SCAN / 2 }, (_, i) => i + 1).map((seed) =>
      months.map((month) => {
        const state = newGame(seed);
        state.month = month;
        leaveGrant(state);
        return colonyLotUp(state) ? live(state).lot!.item : null;
      }),
    );
    const share = lots.flat().filter(Boolean).length / (lots.length * months.length);
    expect(share).toBeGreaterThan(LOTS.colonyPlotChance * 0.7);
    expect(share).toBeLessThan(LOTS.colonyPlotChance * 1.3);
    // The month is in the roll: some seed has a colony lot in one month and not in another.
    expect(lots.some((row) => row.some(Boolean) && !row.every(Boolean))).toBe(true);
    // The plot is drawn, not the first free one.
    const picked = new Set(lots.flat().flatMap((item) => (item ? [`${item.x},${item.y}`] : [])));
    expect(picked.size).toBeGreaterThan(1);
  }, 30_000);

  it('T-AC-6: RULE-7 example roll under the chance, no free land — no colony lot', () => {
    const state = newGame(COLONY_SEED);
    for (const t of plots(state)) t.owner = 'tam';
    leaveGrant(state);
    expect(state.phase).toBe('development');
    expect(state.landAuction).toBeNull();
  });

  it('T-AC-6: RULE-7 example roll under the chance, 4 listings already — no colony lot; the players keep their slots', () => {
    const state = newGame(COLONY_SEED);
    const mine = plots(state).slice(0, 4);
    mine.forEach((t, i) => Object.assign(t, { owner: SEATS[i % 2] }));
    for (const [i, t] of mine.entries()) list(state, SEATS[i % 2]!, { item: { kind: 'plot', x: t.x, y: t.y }, minimum: 250, unsold: 'keep' });
    leaveGrant(state);
    expect(state.listings.map((l) => l.seller)).toEqual(['brix', 'ossa', 'brix', 'ossa']);
    expect(live(state).count).toBe(LOTS.maxLotsPerMonth);
  });

  it('T-AC-6: RULE-7 — the colony picks from the land still free after the grant', () => {
    const state = newGame(COLONY_SEED);
    toPhase(state, 'landGrant');
    const [left, ...taken] = freePlots(state);
    for (const t of taken) t.owner = 'lena';
    advancePhase(state);
    expect(live(state).lot!.item).toMatchObject({ x: left!.x, y: left!.y });
  });

  it('T-AC-6: same seed replays the same colony lot in the same month', () => {
    const first = newGame(COLONY_SEED);
    const again = newGame(COLONY_SEED);
    leaveGrant(first);
    leaveGrant(again);
    expect(again.listings).toEqual(first.listings);
  });

  it("T-AC-6: RULE-7 row 0 (AM-5) — a what-if copy leaving the land grant in a colony month lists nothing, and the real game still gets the colony's lot", () => {
    const state = newGame(COLONY_SEED);
    toPhase(state, 'landGrant');
    const sim = cloneForSim(state);
    advancePhase(sim);
    expect(sim.listings).toEqual([]);
    expect(sim.phase).toBe('development');
    advancePhase(state);
    expect(state.listings.map((l) => l.seller)).toEqual([COLONY_SELLER]);
  });

});

describe('B-AC-8: the colony plot at the land auction (RULE-5 row 1)', () => {
  it('B-AC-8: a sold colony plot pays the bid into store capital, no tax; unsold it stays free land', () => {
    const sold = newGame(COLONY_SEED);
    leaveGrant(sold);
    const { x, y } = live(sold).lot!.item;
    untilStage(sold, 'walk');
    expect(buyers(sold).sort()).toEqual([...SEATS].sort());
    const before = { money: money(sold), capital: sold.store.capital, fund: sold.treasury.money };
    walkTo(sold, 'ossa', 230);
    bell(sold);
    expect(live(sold).result).toEqual({ kind: 'sold', buyer: 'ossa', price: 230 });
    expect(tileOf(sold, x, y).owner).toBe('ossa');
    expect(money(sold)).toEqual({ ...before.money, ossa: before.money.ossa! - 230 });
    expect(sold.store.capital).toBe(before.capital + 230);
    expect(sold.treasury.money).toBe(before.fund);

    const kept = newGame(COLONY_SEED);
    leaveGrant(kept);
    untilStage(kept, 'walk');
    const unsold = { money: money(kept), capital: kept.store.capital, fund: kept.treasury.money };
    bell(kept);
    expect(live(kept).result).toEqual({ kind: 'kept' });
    expect(tileOf(kept, x, y).owner).toBeNull();
    expect(money(kept)).toEqual(unsold.money);
    expect(kept.store.capital).toBe(unsold.capital);
    expect(kept.treasury.money).toBe(unsold.fund);
  });
});
