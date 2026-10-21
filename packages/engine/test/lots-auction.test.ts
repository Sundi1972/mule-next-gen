import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  COLONY_SELLER,
  createGame,
  list,
  LOTS,
  lotDone,
  mulePrice,
  RuleError,
  setLotWalk,
  stepLandAuction,
  type GameState,
  type Listing,
  type Tile,
} from '../src/index.js';

const SEATS = ['brix', 'ossa', 'lena', 'tam'];
const DT = 10;

function newGame(): GameState {
  return createGame({ seed: 11, players: SEATS.map((id) => ({ id, name: id, isAi: false })) });
}

function tileOf(state: GameState, x: number, y: number): Tile {
  return state.tiles[y * state.width + x]!;
}

function own(state: GameState, x: number, y: number, owner: string | null, outfit: Tile['outfit'] = null): Tile {
  return Object.assign(tileOf(state, x, y), { terrain: 'plains', owner, outfit, runMonths: outfit ? 3 : 0 });
}

const money = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.money;
const hand = (state: GameState, id: string) => state.players.find((p) => p.id === id)!.carriedMule;
const live = (state: GameState) => state.landAuction!;
const walker = (state: GameState, id: string) => live(state).walkers.find((w) => w.id === id)!;
const buyers = (state: GameState) => live(state).walkers.filter((w) => w.side === 'buyer').map((w) => w.id);

/** Planning listings, then on through the land grant into the land auction's first walk. */
function auction(state: GameState, lots: [string, Parameters<typeof list>[2]][]): void {
  for (const [seller, lot] of lots) list(state, seller, lot);
  while (state.phase !== 'landAuction') advancePhase(state);
  untilStage(state, 'walk');
}

function step(state: GameState): void {
  stepLandAuction(state, DT);
  expect(live(state).deals).toEqual([]);
}

function untilStage(state: GameState, stage: NonNullable<GameState['landAuction']>['stage']): void {
  for (let t = 0; live(state).stage !== stage && t < 120_000; t += DT) step(state);
  expect(live(state).stage).toBe(stage);
}

/** Holds up until the player's rounded bid reaches `bid`, then lets go. */
function walkTo(state: GameState, id: string, bid: number): void {
  setLotWalk(state, id, 1);
  for (let i = 0; Math.round(walker(state, id).price) < bid && i < 100_000; i++) step(state);
  setLotWalk(state, id, 0);
  expect(Math.round(walker(state, id).price)).toBe(bid);
}

/** Every buyer presses Done: the bell rings on the next step. */
function bell(state: GameState): void {
  for (const id of buyers(state)) lotDone(state, id);
  step(state);
  expect(live(state).stage).toBe('result');
}

/** Money in players' hands, the store and the colony fund, and every MULE on a plot, in a hand or in the corral. */
function totals(state: GameState) {
  return {
    money: state.players.reduce((n, p) => n + p.money, 0) + state.store.capital + state.treasury.money,
    mules: state.store.mules + state.tiles.filter((t) => t.outfit).length + state.players.filter((p) => p.carriedMule).length,
  };
}

const plot = (x: number, y: number, minimum: number, unsold: Listing['unsold'] = 'keep') => ({ item: { kind: 'plot' as const, x, y }, minimum, unsold });
const mule = (x: number, y: number, minimum: number, unsold: Listing['unsold'] = 'keep') => ({ item: { kind: 'mule' as const, x, y }, minimum, unsold });

describe('T-AC-2: resolution at the bell (RULE-5), money and MULEs conserved', () => {
  it('T-AC-2: RULE-5 example 310 vs 290 — Ossa pays 310 and owns the plot with its MULE, Brix gets 294', () => {
    const state = newGame();
    own(state, 5, 3, 'brix', 'food');
    auction(state, [['brix', plot(5, 3, 250)]]);
    const before = totals(state);

    walkTo(state, 'ossa', 310);
    walkTo(state, 'lena', 290);
    bell(state);

    expect(live(state).result).toEqual({ kind: 'sold', buyer: 'ossa', price: 310 });
    expect(money(state, 'ossa')).toBe(1000 - 310);
    expect(money(state, 'brix')).toBe(1000 + 294);
    expect(money(state, 'lena')).toBe(1000);
    expect(state.treasury.money).toBe(16);
    expect(tileOf(state, 5, 3)).toMatchObject({ owner: 'ossa', outfit: 'food', runMonths: 3 });
    expect(totals(state)).toEqual(before);
  });

  it('T-AC-2: RULE-5 example 250 = 250 — a bid of exactly the minimum sells', () => {
    const state = newGame();
    own(state, 5, 3, 'brix');
    auction(state, [['brix', plot(5, 3, 250)]]);
    const before = totals(state);

    walkTo(state, 'ossa', 250);
    bell(state);

    expect(live(state).result).toEqual({ kind: 'sold', buyer: 'ossa', price: 250 });
    expect(money(state, 'ossa')).toBe(750);
    expect(money(state, 'brix')).toBe(1000 + 237);
    expect(tileOf(state, 5, 3).owner).toBe('ossa');
    expect(totals(state)).toEqual(before);
  });

  it('T-AC-2: RULE-5 example both at 300, Lena first — Lena wins, though Ossa sits before her', () => {
    const state = newGame();
    own(state, 5, 3, 'brix');
    auction(state, [['brix', plot(5, 3, 250)]]);
    const before = totals(state);

    walkTo(state, 'lena', 300);
    walkTo(state, 'ossa', 300);
    bell(state);

    expect(live(state).result).toEqual({ kind: 'sold', buyer: 'lena', price: 300 });
    expect(money(state, 'lena')).toBe(700);
    expect(money(state, 'ossa')).toBe(1000);
    expect(tileOf(state, 5, 3).owner).toBe('lena');
    expect(totals(state)).toEqual(before);
  });

  it('T-AC-2: RULE-5 example 240 < 250 with keep — nothing moves', () => {
    const state = newGame();
    own(state, 5, 3, 'brix', 'food');
    auction(state, [['brix', plot(5, 3, 250)]]);
    const before = totals(state);
    const capital = state.store.capital;

    walkTo(state, 'ossa', 240);
    bell(state);

    expect(live(state).result).toEqual({ kind: 'kept' });
    expect(state.players.map((p) => p.money)).toEqual([1000, 1000, 1000, 1000]);
    expect(state.store.capital).toBe(capital);
    expect(tileOf(state, 5, 3)).toMatchObject({ owner: 'brix', outfit: 'food' });
    expect(totals(state)).toEqual(before);
  });

  it('T-AC-2: RULE-5 example unsold to the store, capital 100 < 200 — kept', () => {
    const state = newGame();
    own(state, 5, 3, 'brix', 'food');
    auction(state, [['brix', plot(5, 3, 250, 'store')]]);
    state.store.capital = 100;
    const before = totals(state);

    bell(state);

    expect(live(state).result).toEqual({ kind: 'kept' });
    expect(money(state, 'brix')).toBe(1000);
    expect(state.store.capital).toBe(100);
    expect(tileOf(state, 5, 3)).toMatchObject({ owner: 'brix', outfit: 'food' });
    expect(totals(state)).toEqual(before);
  });

  it('T-AC-2: RULE-5 example the store buys an unsold plot — free land again, its MULE back in the corral', () => {
    const state = newGame();
    own(state, 5, 3, 'brix', 'food');
    auction(state, [['brix', plot(5, 3, 250, 'store')]]);
    state.store.capital = 200;
    const corral = state.store.mules;
    const before = totals(state);

    walkTo(state, 'ossa', 240);
    bell(state);

    expect(live(state).result).toEqual({ kind: 'store', price: 200 });
    expect(money(state, 'brix')).toBe(1200);
    expect(money(state, 'ossa')).toBe(1000);
    expect(state.store.capital).toBe(0);
    expect(state.store.mules).toBe(corral + 1);
    expect(tileOf(state, 5, 3)).toMatchObject({ owner: null, outfit: null, runMonths: 0 });
    expect(totals(state)).toEqual(before);
  });

  it('T-AC-2: RULE-5 example the store buys an unsold MULE — off the plot, into the corral, the plot still Brix’s', () => {
    const state = newGame();
    own(state, 5, 3, 'brix', 'smithore');
    const pays = Math.round(mulePrice(state) / 2);
    auction(state, [['brix', mule(5, 3, 90, 'store')]]);
    const capital = state.store.capital;
    const corral = state.store.mules;
    const before = totals(state);
    const sold = { kind: 'mule', x: 5, y: 3, outfit: 'smithore' };
    expect(state.listings[0]!.item).toEqual(sold);

    bell(state);

    expect(live(state).lot!.item).toEqual(sold);
    expect(live(state).result).toEqual({ kind: 'store', price: pays });
    expect(money(state, 'brix')).toBe(1000 + pays);
    expect(state.store.capital).toBe(capital - pays);
    expect(state.store.mules).toBe(corral + 1);
    expect(tileOf(state, 5, 3)).toMatchObject({ owner: 'brix', outfit: null, runMonths: 0 });
    expect(totals(state)).toEqual(before);
  });

  it('T-AC-2: RULE-5 row 1, a MULE (serves B-AC-4) — Lena wins Brix’s MULE: it leaves the plot and she leads it', () => {
    const state = newGame();
    own(state, 5, 3, 'brix', 'smithore');
    auction(state, [['brix', mule(5, 3, 50)]]);
    const before = totals(state);
    const sold = { kind: 'mule', x: 5, y: 3, outfit: 'smithore' };
    expect(state.listings[0]!.item).toEqual(sold);

    walkTo(state, 'lena', 60);
    bell(state);

    expect(live(state).lot!.item).toEqual(sold);
    expect(live(state).result).toEqual({ kind: 'sold', buyer: 'lena', price: 60 });
    expect(hand(state, 'lena')).toBe('smithore');
    expect(tileOf(state, 5, 3)).toMatchObject({ owner: 'brix', outfit: null, runMonths: 0 });
    expect(money(state, 'brix')).toBe(1000 + 57);
    expect(totals(state)).toEqual(before);
  });

  it('T-AC-2: RULE-5 row 1, the colony as seller — every seat can bid, and the price goes to store capital untaxed', () => {
    const state = newGame();
    own(state, 5, 3, null);
    state.listings.push({ id: 'plot-5-3', seller: COLONY_SELLER, item: { kind: 'plot', x: 5, y: 3 }, minimum: 200, unsold: 'keep', storePays: 0 });
    auction(state, []);
    const capital = state.store.capital;
    const before = totals(state);

    expect(buyers(state)).toEqual(SEATS);
    walkTo(state, 'brix', 230);
    bell(state);

    expect(live(state).result).toEqual({ kind: 'sold', buyer: 'brix', price: 230 });
    expect(state.store.capital).toBe(capital + 230);
    expect(state.treasury.money).toBe(0);
    expect(tileOf(state, 5, 3).owner).toBe('brix');
    expect(totals(state)).toEqual(before);
  });
});

describe('who is a buyer on a lot (RULE-3)', () => {
  it('RULE-3 row 1 (serves B-AC-2): the seller is not on the board and cannot bid', () => {
    const state = newGame();
    own(state, 5, 3, 'brix');
    auction(state, [['brix', plot(5, 3, 250)]]);
    expect(live(state).walkers.map((w) => w.id)).toEqual(['ossa', 'lena', 'tam']);
    expect(() => setLotWalk(state, 'brix', 1)).toThrow(RuleError);
  });

  it('RULE-3 row 2 (serves B-AC-2): with less money than the minimum a player stands aside for money, and cannot walk; exactly the minimum bids', () => {
    const state = newGame();
    own(state, 5, 3, 'brix');
    state.players[2]!.money = 250;
    state.players[3]!.money = 249;
    auction(state, [['brix', plot(5, 3, 250)]]);
    expect(buyers(state)).toEqual(['ossa', 'lena']);
    expect(walker(state, 'tam').side).toBe('pass');
    expect(live(state).aside).toEqual({ tam: 'money' });
    expect(() => setLotWalk(state, 'tam', 1)).toThrow("You can't bid on this lot");
  });

  it('RULE-3 row 3 (serves B-AC-4): Lena, leading the MULE she won on lot 1, stands aside for lot 2’s MULE', () => {
    const state = newGame();
    own(state, 5, 3, 'brix', 'food');
    own(state, 6, 4, 'ossa', 'energy');
    auction(state, [
      ['brix', mule(5, 3, 50)],
      ['ossa', mule(6, 4, 50)],
    ]);
    walkTo(state, 'lena', 60);
    bell(state);
    untilStage(state, 'intro');
    untilStage(state, 'walk');

    expect(live(state).number).toBe(2);
    expect(buyers(state)).toEqual(['brix', 'tam']);
    expect(live(state).aside).toEqual({ lena: 'mule' });
  });
});

describe('when a lot’s walk ends (RULE-4)', () => {
  it('RULE-4 row 1 (serves B-AC-2): the bell rings when the walk clock runs out; Lena, held at her 280, got there first and wins', () => {
    const state = newGame();
    own(state, 5, 3, 'brix');
    state.players[2]!.money = 280;
    auction(state, [['brix', plot(5, 3, 250)]]);
    setLotWalk(state, 'lena', 1);
    for (let i = 0; i < 400; i++) step(state);
    expect(walker(state, 'lena').price).toBe(280);
    walkTo(state, 'ossa', 280);
    while (live(state).clockMs > DT) step(state);
    expect(live(state).stage).toBe('walk');

    step(state);

    expect(live(state).stage).toBe('result');
    expect(live(state).result).toEqual({ kind: 'sold', buyer: 'lena', price: 280 });
    expect(money(state, 'lena')).toBe(0);
  });

  it('RULE-4 row 2 (serves B-AC-2): the bell rings once every buyer is Done; walking again takes a Done back; Done also ends the intro', () => {
    const state = newGame();
    own(state, 5, 3, 'brix');
    list(state, 'brix', plot(5, 3, 250));
    while (state.phase !== 'landAuction') advancePhase(state);
    for (const id of ['ossa', 'lena', 'tam']) lotDone(state, id);
    step(state);
    expect(live(state).stage).toBe('walk');
    expect(live(state).clockMs).toBe(LOTS.walkMs);

    for (const id of ['ossa', 'lena', 'tam']) lotDone(state, id);
    setLotWalk(state, 'ossa', 1);
    step(state);
    expect(live(state).stage).toBe('walk');

    walkTo(state, 'ossa', 255);
    lotDone(state, 'ossa');
    step(state);
    expect(live(state).stage).toBe('result');
    expect(live(state).clockMs).toBe(LOTS.resultMs);
    expect(live(state).result).toEqual({ kind: 'sold', buyer: 'ossa', price: 255 });
  });

  it('RULE-4 row 3 (serves B-AC-3): with no buyers at all the bell rings as the walk starts, and nobody leads', () => {
    const state = newGame();
    own(state, 5, 3, 'brix');
    for (const p of state.players) if (p.id !== 'brix') p.money = 100;
    list(state, 'brix', plot(5, 3, 250, 'store'));
    while (state.phase !== 'landAuction') advancePhase(state);
    for (let t = DT; t < LOTS.introMs; t += DT) step(state);
    expect(live(state).stage).toBe('intro');

    step(state);

    expect(live(state).stage).toBe('result');

    expect(live(state).walkers.filter((w) => w.side === 'buyer')).toEqual([]);
    expect(live(state).result).toEqual({ kind: 'store', price: 200 });
    expect(live(state).clockMs).toBe(LOTS.resultMs);
  });

  it('RULE-2 (serves B-AC-2): after the last lot’s result the land auction is over, and advancing goes to development', () => {
    const state = newGame();
    own(state, 5, 3, 'brix');
    auction(state, [['brix', plot(5, 3, 250)]]);
    bell(state);
    untilStage(state, 'over');
    advancePhase(state);
    expect(state.phase).toBe('development');
  });
});

describe('T-AC-1: replay', () => {
  it('T-AC-1: same seed and intents replay to the same owners and money', () => {
    const state = newGame();
    own(state, 5, 3, 'brix', 'food');
    own(state, 6, 4, 'ossa');
    auction(state, [
      ['brix', plot(5, 3, 250)],
      ['ossa', plot(6, 4, 150, 'store')],
    ]);
    const copy = structuredClone(state);
    const play = (s: GameState) => {
      setLotWalk(s, 'ossa', 1);
      setLotWalk(s, 'lena', 1);
      for (let i = 0; i < 180; i++) step(s);
      setLotWalk(s, 'lena', 0);
      untilStage(s, 'intro');
      untilStage(s, 'walk');
      walkTo(s, 'tam', 160);
      untilStage(s, 'over');
    };

    play(state);
    play(copy);

    expect(copy.tiles.map((t) => t.owner)).toEqual(state.tiles.map((t) => t.owner));
    expect(copy.players.map((p) => p.money)).toEqual(state.players.map((p) => p.money));
    expect(copy).toEqual(state);
    expect(tileOf(state, 5, 3).owner).toBe('ossa');
    expect(tileOf(state, 6, 4).owner).toBe('tam');
  });
});
