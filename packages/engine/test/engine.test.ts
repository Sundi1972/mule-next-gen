import { describe, expect, it } from 'vitest';
import {
  advancePhase,
  postPrices,
  storeQuotes,
  buyMule,
  claimPlot,
  colonyPrice,
  createGame,
  shipPrice,
  targetPrice,
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
});

describe('prices', () => {
  it('target high when the shelf is empty and low in a glut', () => {
    const state = newGame();
    emptyColony(state, 'food');
    expect(targetPrice(state, 'food')).toBeGreaterThan(state.store.refPrice.food * 10);
    state.store.stock.food = 10_000;
    expect(targetPrice(state, 'food')).toBeLessThan(state.store.refPrice.food / 10);
  });

  it('move toward the target with momentum, and keep climbing while a shortage lasts', () => {
    const state = newGame();
    emptyColony(state, 'food');
    const ref = state.store.refPrice.food;
    const start = colonyPrice(state, 'food');
    // A cheap good climbs by half its reference price, a dear one by half its price.
    const step = (p: number) => Math.round(p + 0.5 * Math.max(p, ref));
    postPrices(state);
    expect(colonyPrice(state, 'food')).toBe(step(start));
    postPrices(state);
    expect(colonyPrice(state, 'food')).toBe(step(step(start)));
    for (let i = 0; i < 6; i++) postPrices(state);
    expect(colonyPrice(state, 'food')).toBeGreaterThan(ref * 10);
  });

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

  it('react more strongly to a Food shortage than an Alloy shortage', () => {
    const state = newGame();
    // One month of cover each.
    const demand = monthlyDemand(state);
    emptyColony(state, 'food');
    emptyColony(state, 'alloy');
    state.store.stock.food = demand.food;
    state.store.stock.alloy = demand.alloy;
    expect(targetPrice(state, 'food') / 30).toBeGreaterThan(targetPrice(state, 'alloy') / 90);
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
    expect(state.store.capital).toBeGreaterThan(0);
    for (const report of state.history) {
      for (const price of Object.values(report.prices)) {
        expect(price).toBeGreaterThan(0);
        expect(Number.isFinite(price)).toBe(true);
      }
    }
  });
});
