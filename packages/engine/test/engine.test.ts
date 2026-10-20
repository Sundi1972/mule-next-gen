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

function plainTile(state: GameState, x: number, y: number, terrain: Tile['terrain'] = 'plains'): Tile {
  const tile = state.tiles[y * state.width + x]!;
  Object.assign(tile, { terrain, traits: [], peaks: 0, crystite: 0, owner: null, outfit: null });
  return tile;
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
  it('stay between the export floor and the import cap while imports are affordable', () => {
    const state = newGame();
    state.store.stock.food = 0;
    expect(colonyPrice(state, 'food')).toBe(Math.round(importPrice(state, 'food')));
    state.store.stock.food = 10_000;
    expect(colonyPrice(state, 'food')).toBe(Math.round(exportPrice(state, 'food')));
  });

  it('break through the import cap when the colony cannot pay for imports', () => {
    const state = newGame();
    state.store.stock.food = 0;
    state.store.fund = 0;
    expect(colonyPrice(state, 'food')).toBeGreaterThan(importPrice(state, 'food'));
  });

  it('react more strongly to a Food shortage than an Alloy shortage', () => {
    const state = newGame();
    // One month of cover each, with no money for imports so neither is capped.
    state.store.fund = 0;
    state.store.stock.food = 22;
    state.store.stock.alloy = 4;
    const prices = allPrices(state);
    expect(prices.food / 30).toBeGreaterThan(prices.alloy / 90);
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
    expect(produced.p0!.food).toBe(Math.floor(full / 2));
  });

  it('runs factories only when the inputs are in stock', () => {
    const state = newGame();
    const tile = plainTile(state, 0, 0, 'wasteland');
    tile.owner = 'p0';
    tile.outfit = 'alloy';
    const p0 = state.players[0]!;
    p0.stock.smithore = 0;
    expect(runProduction(state).p0!.alloy).toBe(0);
    p0.stock.smithore = 2;
    p0.stock.energy = 1;
    expect(runProduction(state).p0!.alloy).toBe(2);
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
  it('plays a full AI game with sane prices', () => {
    const state = playAiGame(7, 4);
    expect(state.phase).toBe('gameOver');
    for (const report of state.history) {
      for (const price of Object.values(report.prices)) {
        expect(price).toBeGreaterThan(0);
        expect(price).toBeLessThan(2000);
      }
    }
  });
});
