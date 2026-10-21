import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  allPrices,
  buyMule,
  claimPlot,
  colonyPrice,
  createGame,
  exportPrice,
  importPrice,
  installMule,
  isGameOver,
  monthlyDemand,
  mulePrice,
  outfitMule,
  rawOutput,
  runAuction,
  runProduction,
  RuleError,
  type GameState,
  type Tile,
} from '../src/index.js';
import { playAiGame } from '../src/sim.js';

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
});

describe('prices', () => {
  it('have no floor and no cap: only supply and demand', () => {
    const state = newGame();
    state.store.stock.food = 0;
    expect(colonyPrice(state, 'food')).toBeGreaterThan(importPrice(state, 'food') * 10);
    state.store.stock.food = 10_000;
    expect(colonyPrice(state, 'food')).toBeLessThan(exportPrice(state, 'food'));
  });

  it('react more strongly to a Food shortage than an Alloy shortage', () => {
    const state = newGame();
    // One month of cover each.
    const demand = monthlyDemand(state);
    state.store.stock.food = demand.food;
    state.store.stock.alloy = demand.alloy;
    const prices = allPrices(state);
    expect(prices.food / 30).toBeGreaterThan(prices.alloy / 90);
  });

  it('make MULEs dearer when Alloy is scarce', () => {
    const state = newGame();
    state.store.stock.alloy = 20;
    const cheap = mulePrice(state);
    state.store.stock.alloy = 1;
    expect(mulePrice(state)).toBeGreaterThan(cheap);
  });

  it('let players trade with each other at any price they agree on', () => {
    const state = newGame();
    state.players[0]!.stock.food = 5;
    state.players[1]!.money = 10_000;
    const trades = runAuction(state, 'food', [
      { playerId: 'p0', side: 'sell', quantity: 1, limit: 4000 },
      { playerId: 'p1', side: 'buy', quantity: 1, limit: 6000 },
    ]);
    expect(trades[0]).toMatchObject({ seller: 'p0', buyer: 'p1', price: 5000 });
  });
});

describe('the store', () => {
  it('buys only what it can use and can afford', () => {
    const state = newGame();
    state.players[0]!.stock.water = 500;
    const trades = runAuction(state, 'water', [{ playerId: 'p0', side: 'sell', quantity: 500, limit: 1 }]);
    const bought = trades.reduce((n, t) => n + t.quantity, 0);
    expect(bought).toBeGreaterThan(0);
    expect(bought).toBeLessThan(500);
    expect(state.store.fund).toBeGreaterThanOrEqual(0);
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

  it('halves output of plots whose owner has no Energy', () => {
    const state = newGame();
    const tile = plainTile(state, 0, 0, 'river');
    tile.owner = 'p0';
    tile.outfit = 'food';
    const p0 = state.players[0]!;
    p0.stock.energy = 0;
    const full = rawOutput(state, tile);
    const produced = runProduction(state);
    expect(produced.produced.p0!.food).toBe(Math.floor(full / 2));
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
    p0.stock.energy = 1;
    expect(runProduction(state).produced.p0!.alloy).toBe(2);
    expect(p0.stock.smithore).toBe(0);
  });
});

describe('auction', () => {
  it('matches players first at the midpoint of their limits', () => {
    const state = newGame();
    const [seller, buyer] = state.players;
    seller!.stock.water = 5;
    const trades = runAuction(state, 'water', [
      { playerId: 'p0', side: 'sell', quantity: 5, limit: 20 },
      { playerId: 'p1', side: 'buy', quantity: 3, limit: 30 },
    ]);
    expect(trades[0]).toMatchObject({ buyer: 'p1', seller: 'p0', quantity: 3, price: 25 });
    expect(buyer!.stock.water).toBe(4 + 3);
  });

  it('never sells more than a player owns', () => {
    const state = newGame();
    state.players[0]!.stock.crystite = 2;
    state.players[1]!.money = 100_000;
    const trades = runAuction(state, 'crystite', [
      { playerId: 'p0', side: 'sell', quantity: 10, limit: 1 },
      { playerId: 'p1', side: 'buy', quantity: 10, limit: 500 },
    ]);
    expect(trades.reduce((n, t) => n + t.quantity, 0)).toBe(2);
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

describe('simulator', () => {
  it('plays a full AI game without the colony going broke', () => {
    const state = playAiGame(7, 4);
    expect(state.phase).toBe('gameOver');
    expect(state.store.fund).toBeGreaterThan(0);
    for (const report of state.history) {
      for (const price of Object.values(report.prices)) {
        expect(price).toBeGreaterThan(0);
        expect(Number.isFinite(price)).toBe(true);
      }
    }
  });
});
