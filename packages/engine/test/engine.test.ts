import { describe, expect, it } from 'vitest';
import {
  advanceGrant,
  advancePhase,
  GAME,
  grantDone,
  postPrices,
  PRICE,
  storeQuotes,
  buyMule,
  claimPlot,
  colonyPrice,
  createGame,
  shipPrice,
  startAuction,
  installMule,
  isGameOver,
  monthlyDemand,
  mulePrice,
  outfitMule,
  rawOutput,
  runProduction,
  RuleError,
  type GameState,
  type Good,
  type Tile,
} from '../src/index.js';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false }));

function newGame(n = 4): GameState {
  return createGame({ seed: 42, players: players(n) });
}

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

function plainTile(state: GameState, x: number, y: number, terrain: Tile['terrain'] = 'plains', ground: Partial<Tile['ground']> = {}): Tile {
  const tile = state.tiles[y * state.width + x]!;
  Object.assign(tile, { terrain, traits: [], peaks: 0, ground: { ...flatGround, ...ground }, owner: null, outfit: null, pollution: 0, filter: false, runMonths: 0 });
  return tile;
}

/** Empties a good from the whole colony: the store's shelf and every player's depot. */
function emptyColony(state: GameState, good: Good): void {
  state.store.stock[good] = 0;
  for (const p of state.players) p.stock[good] = 0;
}

/** Moves the land grant's light to this tile, as the server's clock would. */
function light(state: GameState, tile: Tile): void {
  state.grant!.order[state.grant!.step] = state.tiles.indexOf(tile);
}

describe('createGame', () => {
  it('accepts 2 to 6 players and sizes the map by player count', () => {
    expect(() => createGame({ seed: 1, players: players(1) })).toThrow(RuleError);
    expect(() => createGame({ seed: 1, players: players(7) })).toThrow(RuleError);
    expect(newGame(2).width).toBe(13);
    expect(newGame(4).width).toBe(15);
    expect(newGame(6).width).toBe(19);
  });

  it('is deterministic for a given seed', () => {
    expect(newGame().tiles).toEqual(newGame().tiles);
  });

  it.each([2, 4, 6])('every seat of a %i-seat game starts with 2 Food (Heiko, 5 Nov)', (n) => {
    expect(newGame(n).players.map((p) => p.stock.food)).toEqual(Array.from({ length: n }, () => 2));
  });

  it.each([2, 4, 6])('every seat of a %i-seat game starts with 2 Energy (Heiko, 5 Nov)', (n) => {
    expect(newGame(n).players.map((p) => p.stock.energy)).toEqual(Array.from({ length: n }, () => 2));
  });

  it.each([
    [2, 8],
    [4, 16],
    [6, 24],
  ])("a %i-seat game's store starts with %i Food, 4 a seat (Heiko, 5 Nov)", (n, food) => {
    expect(newGame(n).store.stock.food).toBe(food);
  });

  it.each([
    [2, 20],
    [4, 40],
    [6, 60],
  ])("a %i-seat game's store starts with %i Energy, 10 a seat (S1 lever (c), PM ruling 7 Nov)", (n, energy) => {
    expect(newGame(n).store.stock.energy).toBe(energy);
  });

  it("the store starts with 40 Medicine (S2 lever B, PM ruling 8 Nov)", () => {
    expect(newGame(4).store.stock.medicine).toBe(40);
  });

  describe("FM-species-by-chair: a seat's default species follows the seed, not the chair", () => {
    /** DEFAULT_SPECIES's order, written out: an n-seat game deals from its first n. */
    const ORDER = ['zipwing', 'bramblet', 'gearling', 'mollox', 'glimmer', 'quibbit'];
    const firstN = (n: number) => ORDER.slice(0, n).sort();

    it.each([2, 3, 4, 5, 6])('FM-species-by-chair: in a %i-seat game, over seeds 0..n-1, chair 0 plays each of the first n species once', (n) => {
      const chairZero = Array.from({ length: n }, (_, seed) => createGame({ seed, players: players(n) }).players[0]!.species);
      expect([...chairZero].sort()).toEqual(firstN(n));
    });

    it.each([2, 3, 4, 5, 6])('FM-species-by-chair: a %i-seat game where nobody picked plays the first n species, one each, whatever the seed', (n) => {
      for (const seed of [0, 1, 2, 3, 4, 5, 2_147_483_646, -1]) {
        const species = createGame({ seed, players: players(n) }).players.map((p) => p.species);
        expect([...species].sort(), `seed ${seed}: ${species.join(',')}`).toEqual(firstN(n));
      }
    });

    it('FM-species-by-chair: a seat that picked a species keeps it under every seed', () => {
      for (const seed of [0, 1, 2, 3]) {
        const seats = players(4).map((p, i) => (i === 1 ? { ...p, species: 'glimmer' as const } : p));
        expect(createGame({ seed, players: seats }).players[1]!.species).toBe('glimmer');
      }
    });
  });
});

describe('prices', () => {
  it('let a good only off-world buyers want cost no more than they pay', () => {
    const state = newGame();
    emptyColony(state, 'crystite');
    for (let i = 0; i < 8; i++) postPrices(state);
    expect(colonyPrice(state, 'crystite')).toBe(state.store.offWorld.crystite);
  });

  it('post no store sell price for a good the store does not have', () => {
    const state = newGame();
    state.store.stock.electronics = 0;
    expect(storeQuotes(state, 'electronics').sell).toBeNull();
    expect(shipPrice(state, 'food')).toBeNull();
  });

  it("FM-store-spread-float: the store sells at its posted price plus its band's spread, rounded up, in its quotes and at the auction", () => {
    // [posted, sells at]: 15% more (the normal band), rounded up, worked by hand. 1 + 0.15 in floating point is a hair
    // under 1.15, so 100 × 1.15 lands a hair under 115, which must still sell at 115.
    const rows = [
      [100, 115], [180, 207], [200, 230], [220, 253], [340, 391], [360, 414], [380, 437], [400, 460],
      [7, 9], [25, 29], [33, 38], [50, 58], [51, 59], [90, 104], [99, 114],
    ];
    const seen = rows.map(([posted]) => {
      const state = newGame();
      state.store.posted.smithore = posted!;
      state.store.stock.smithore = 20;
      state.players[0]!.stock.smithore = 5;
      const quote = storeQuotes(state, 'smithore').sell;
      state.phase = 'auction';
      startAuction(state, ['smithore']);
      return [posted, quote, state.auction!.good === 'smithore' ? state.auction!.storeSell : 'skipped'];
    });
    expect(seen).toEqual(rows.map(([posted, sells]) => [posted, sells, sells]));
  });

  it("FM-store-spread-float: the store buys at its posted price less its band's spread, rounded down, in its quotes and at the auction", () => {
    // [posted, buys at]: 30% less, rounded down, worked by hand, under a swept spread (`pnpm sim -- --set
    // PRICE.bandSpread.normal.under=0.3`). 1 - 0.3 is a hair under 0.7 in floating point, so 90 × 0.7 lands a hair under
    // 63 and used to round down one credit too low, as the sell side's 1 + 0.1 did one too high.
    const rows = [
      [90, 63], [170, 119], [180, 126], [100, 70], [10, 7], [7, 4], [33, 23], [1, 1],
    ];
    const live = PRICE.bandSpread.normal.under;
    PRICE.bandSpread.normal.under = 0.3; // literal-ok: a swept spread where the float bites
    try {
      const seen = rows.map(([posted]) => {
        const state = newGame();
        state.store.posted.smithore = posted!;
        // Posted in the normal band, whose spread is the swept one; a new record, as postPrices writes it.
        state.store.band = { ...state.store.band, smithore: 'normal' };
        state.store.stock.smithore = 0;
        state.players[0]!.stock.smithore = 5;
        const quote = storeQuotes(state, 'smithore').buy;
        state.phase = 'auction';
        startAuction(state, ['smithore']);
        return [posted, quote, state.auction!.good === 'smithore' ? state.auction!.storeBuy : 'skipped'];
      });
      expect(seen).toEqual(rows.map(([posted, buys]) => [posted, buys, buys]));
    } finally {
      PRICE.bandSpread.normal.under = live;
    }
  });

  it('make MULEs dearer when Alloy is scarce', () => {
    const state = newGame();
    const cheap = mulePrice(state);
    state.store.posted.alloy *= 3;
    state.store.posted.smithore *= 3;
    expect(mulePrice(state)).toBeGreaterThan(cheap);
    state.store.muleFactor = 1.15;
    expect(mulePrice(state)).toBeGreaterThan(cheap * 1.15);
  });

});

describe('production', () => {
  it('rewards clusters of plots producing the same good', () => {
    const state = newGame();
    const a = plainTile(state, 0, 0);
    const b = plainTile(state, 1, 0);
    a.owner = b.owner = 'p0';
    a.outfit = 'energy';
    const alone = rawOutput(state, a);
    b.outfit = 'energy';
    expect(rawOutput(state, a)).toBe(alone + 1);
  });

  it('halves Food farms whose owner is short of Water', () => {
    const state = newGame();
    const tile = plainTile(state, 0, 0, 'river');
    tile.owner = 'p0';
    tile.outfit = 'food';
    const p0 = state.players[0]!;
    p0.stock.energy = 5;
    const full = rawOutput(state, tile);
    p0.stock.water = 0;
    expect(runProduction(state).produced.p0!.food).toBe(Math.floor(full / 2));
    p0.stock.water = 5;
    expect(runProduction(state).produced.p0!.food).toBe(full);
  });

  it('runs factories only when the inputs are in stock', () => {
    const state = newGame();
    const tile = plainTile(state, 0, 0, 'crater');
    tile.owner = 'p0';
    tile.outfit = 'alloy';
    const p0 = state.players[0]!;
    p0.stock.smithore = 0;
    expect(runProduction(state).produced.p0!.alloy).toBe(0);
    p0.stock.smithore = 2;
    p0.stock.energy = 2;
    expect(runProduction(state).produced.p0!.alloy).toBe(2);
    expect(p0.stock.smithore).toBe(0);
  });
});

describe('land grant', () => {
  it('FM-grant-stall: a land grant where nobody presses ends after GAME.grantSweeps sweeps', () => {
    const state = createGame({ seed: 4, players: players(4) });
    while (state.phase !== 'landGrant') advancePhase(state);
    let steps = 0;
    while (!grantDone(state) && steps++ < 10_000) advanceGrant(state);
    expect(grantDone(state)).toBe(true);
    expect(state.grant!.sweep).toBe(GAME.grantSweeps);
    // Free land is left and nobody claimed: the sweep limit ended it, not the land or the claims.
    expect(state.tiles.some((t) => t.terrain !== 'store' && !t.owner)).toBe(true);
    expect(state.players.every((p) => p.claimsThisGrant === 0)).toBe(true);
  });
});

describe('month flow', () => {
  it('lets a player claim, buy, outfit and install a MULE', () => {
    const state = newGame();
    advancePhase(state); // landGrant
    const tile = state.tiles.find((t) => t.terrain === 'plains')!;
    light(state, tile);
    claimPlot(state, 'p0', tile.x, tile.y);
    expect(() => claimPlot(state, 'p1', tile.x, tile.y)).toThrow(RuleError);
    advancePhase(state); // development
    buyMule(state, 'p0');
    outfitMule(state, 'p0', 'energy');
    installMule(state, 'p0', tile.x, tile.y);
    expect(tile.outfit).toBe('energy');
    advancePhase(state); // production
    expect(state.history).toHaveLength(1);
  });

  it('ends three months after the last free plot is claimed', () => {
    const state = newGame();
    state.landRanOutMonth = 4;
    state.month = 6;
    expect(isGameOver(state)).toBe(false);
    state.month = 7;
    expect(isGameOver(state)).toBe(true);
  });
});
