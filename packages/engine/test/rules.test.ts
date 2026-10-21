import { describe, expect, it } from 'vitest';
import {
  advanceGrant,
  advancePhase,
  airBand,
  analysePlot,
  buyMule,
  claimPlot,
  createGame,
  DEVELOPMENT,
  factoryFit,
  fitFilter,
  grantDone,
  litPlot,
  mulePrice,
  mulePriceFor,
  outfitMule,
  rawOutput,
  runAuction,
  runPollution,
  RuleError,
  score,
  takeTurns,
  visitPub,
  type GameState,
  type Species,
  type Tile,
} from '../src/index.js';

const flatGround = { food: 0, water: 0, energy: 0, smithore: 0, crystite: 0, rareEarth: 0 };

function newGame(species: Species[] = ['zipwing', 'bramblet', 'gearling', 'mollox']): GameState {
  return createGame({ seed: 42, players: species.map((s, i) => ({ id: `p${i}`, name: `P${i}`, isAi: false, species: s })) });
}

function plot(state: GameState, x: number, y: number, terrain: Tile['terrain'] = 'plains', ground: Partial<Tile['ground']> = {}): Tile {
  const tile = state.tiles[y * state.width + x]!;
  Object.assign(tile, { terrain, traits: [], ground: { ...flatGround, ...ground }, owner: null, outfit: null, pollution: 0, filter: false, runMonths: 0 });
  return tile;
}

function toPhase(state: GameState, phase: GameState['phase']): void {
  while (state.phase !== phase) advancePhase(state);
}

describe('ground and geo analysis', () => {
  it('produces from the hidden ground rating, and a 0 deposit mines nothing', () => {
    const state = newGame();
    const farm = plot(state, 0, 0, 'plains', { food: 2 });
    farm.owner = 'p0';
    farm.outfit = 'food';
    expect(rawOutput(state, farm)).toBe(4);
    const poor = plot(state, 2, 0, 'plains', { food: -2 });
    poor.owner = 'p0';
    poor.outfit = 'food';
    expect(rawOutput(state, poor)).toBe(1);
    const mine = plot(state, 4, 0, 'hills', { smithore: 0 });
    mine.owner = 'p0';
    mine.outfit = 'smithore';
    expect(rawOutput(state, mine)).toBe(0);
  });

  it('rolls ratings from terrain odds: hills are usually rich in Smithore, lakes never', () => {
    const state = createGame({ seed: 9, players: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `p${i}`, name: `P${i}`, isAi: true })) });
    const avg = (terrain: Tile['terrain']) => {
      const tiles = state.tiles.filter((t) => t.terrain === terrain);
      return tiles.reduce((n, t) => n + t.ground.smithore, 0) / Math.max(1, tiles.length);
    };
    expect(state.tiles.some((t) => t.terrain === 'mountains' || t.terrain === 'hills')).toBe(true);
    expect(avg('lake')).toBe(0);
    expect(Math.max(avg('hills'), avg('mountains'))).toBeGreaterThan(1.5);
  });

  it('lets a colonist analyse any plot, privately, and Mollox do it in half the time', () => {
    const state = newGame();
    toPhase(state, 'development');
    expect(analysePlot(state, 'p0', 0, 0)).toBe(DEVELOPMENT.analysisSeconds);
    expect(analysePlot(state, 'p3', 0, 0)).toBe(DEVELOPMENT.analysisSeconds / 2);
    expect(state.players[0]!.analysed).toEqual([0]);
    expect(state.players[1]!.analysed).toEqual([]);
  });
});

describe('species perks', () => {
  it('give Bramblets more Food, Mollox more ore and Gearlings cheaper MULEs', () => {
    const state = newGame();
    const farm = plot(state, 0, 0, 'plains', { food: 1 });
    farm.outfit = 'food';
    farm.owner = 'p0';
    const zipwing = rawOutput(state, farm);
    farm.owner = 'p1';
    expect(rawOutput(state, farm)).toBe(zipwing + 1);

    const mine = plot(state, 2, 0, 'hills', { smithore: 2 });
    mine.outfit = 'smithore';
    mine.owner = 'p0';
    const base = rawOutput(state, mine);
    mine.owner = 'p3';
    expect(rawOutput(state, mine)).toBe(base + 1);

    expect(mulePriceFor(state, 'p2')).toBeLessThan(mulePrice(state));
    expect(mulePriceFor(state, 'p0')).toBe(mulePrice(state));
  });
});

describe('the store sells in turns', () => {
  it('hands out one unit per buyer per round', () => {
    expect(takeTurns(8, [4, 3, 3])).toEqual([3, 3, 2]);
    expect(takeTurns(20, [4, 3, 3])).toEqual([4, 3, 3]);
    expect(takeTurns(0, [4])).toEqual([0]);
  });

  it('puts a Quibbit first in line, then whoever reached the price first', () => {
    const state = newGame(['zipwing', 'bramblet', 'quibbit', 'mollox']);
    state.store.stock.energy = 2;
    for (const p of state.players) p.money = 10_000;
    const trades = runAuction(state, 'energy', [
      { playerId: 'p0', side: 'buy', quantity: 2, limit: 9_999, at: 1 },
      { playerId: 'p1', side: 'buy', quantity: 2, limit: 9_999, at: 2 },
      { playerId: 'p2', side: 'buy', quantity: 2, limit: 9_999, at: 3 },
    ]);
    expect(trades.map((t) => t.buyer)).toEqual(['p2', 'p0']);
  });
});

describe('land grant', () => {
  it('lights free plots in a seeded random order and only the lit plot can be claimed', () => {
    const a = newGame();
    const b = newGame();
    toPhase(a, 'landGrant');
    toPhase(b, 'landGrant');
    expect(a.grant!.order).toEqual(b.grant!.order);
    const lit = litPlot(a)!;
    const other = a.tiles.find((t) => t !== lit && t.terrain !== 'store')!;
    expect(() => claimPlot(a, 'p0', other.x, other.y)).toThrow(RuleError);
    claimPlot(a, 'p0', lit.x, lit.y);
    expect(lit.owner).toBe('p0');
    expect(() => claimPlot(a, 'p1', lit.x, lit.y)).toThrow(RuleError);
    const next = advanceGrant(a)!;
    expect(next.owner).toBeNull();
    // The order is not just left to right.
    const xs = a.grant!.order.slice(0, 10).map((i) => i % a.width);
    expect([...xs].sort((m, n) => m - n)).not.toEqual(xs);
  });

  it('starts a fresh sweep after every free plot has lit, and ends when claims are used', () => {
    const state = newGame();
    toPhase(state, 'landGrant');
    const first = [...state.grant!.order];
    for (let i = 0; i < first.length; i++) advanceGrant(state);
    expect(state.grant!.sweep).toBe(1);
    expect(state.grant!.order).not.toEqual(first);
    for (const p of state.players) p.claimsThisGrant = 2;
    expect(grantDone(state)).toBe(true);
  });
});

describe('development', () => {
  it('gives the full time with enough Food and less without', () => {
    const state = newGame();
    state.players[0]!.stock.food = 10;
    state.players[1]!.stock.food = 0;
    toPhase(state, 'development');
    expect(state.players[0]!.devSeconds).toBe(DEVELOPMENT.fullSeconds);
    expect(state.players[1]!.devSeconds).toBe(DEVELOPMENT.minSeconds);
    expect(state.players[1]!.hungry).toBe(true);
  });

  it('costs sick colonists time in dirty air unless they take a Medicine', () => {
    const state = newGame();
    state.air = 40;
    state.players[0]!.stock.medicine = 1;
    toPhase(state, 'development');
    expect(state.players[0]!.devSeconds).toBe(DEVELOPMENT.fullSeconds);
    expect(state.players[0]!.stock.medicine).toBe(0);
    expect(state.players[1]!.devSeconds).toBe(DEVELOPMENT.fullSeconds - 5);
    expect(state.players[1]!.sick).toBe(true);
  });

  it('pays more at the pub with more time left, and ends the turn', () => {
    const state = newGame();
    toPhase(state, 'development');
    const early = visitPub(state, 'p0', 50);
    const late = visitPub(state, 'p1', 5);
    expect(early).toBeGreaterThan(late);
    expect(() => buyMule(state, 'p0')).toThrow(RuleError);
  });

  it('builds a green belt as a cheap outfit', () => {
    const state = newGame();
    toPhase(state, 'development');
    buyMule(state, 'p0');
    const before = state.players[0]!.money;
    outfitMule(state, 'p0', 'greenBelt');
    expect(before - state.players[0]!.money).toBe(20);
  });
});

describe('factories', () => {
  it('weigh terrain, a feeder plot, an industrial park and experience', () => {
    const state = newGame();
    const works = plot(state, 1, 1, 'tundra');
    works.owner = 'p0';
    works.outfit = 'electronics';
    expect(factoryFit(state, works, 'electronics', 'p0').output).toBe(2);
    works.terrain = 'river';
    expect(factoryFit(state, works, 'electronics', 'p0').output).toBe(0);

    const smelter = plot(state, 5, 1, 'plains');
    smelter.owner = 'p0';
    smelter.outfit = 'alloy';
    const feeder = plot(state, 6, 1, 'hills', { smithore: 3 });
    feeder.owner = 'p0';
    feeder.outfit = 'smithore';
    // A smelter burns 2 Energy; a Smithore mine beside it saves one.
    expect(factoryFit(state, smelter, 'alloy', 'p0').energy).toBe(1);
    const park = plot(state, 5, 2, 'plains');
    park.owner = 'p0';
    park.outfit = 'alloy';
    expect(factoryFit(state, smelter, 'alloy', 'p0').output).toBe(3);
    smelter.runMonths = 3;
    expect(factoryFit(state, smelter, 'alloy', 'p0').output).toBe(4);
  });
});

describe('pollution', () => {
  it('spreads from Rare earth mines to the plots around them and fills the air', () => {
    const state = newGame();
    const mine = plot(state, 3, 3, 'volcanic', { rareEarth: 3 });
    mine.owner = 'p0';
    mine.outfit = 'rareEarth';
    const farm = plot(state, 4, 3, 'plains', { food: 2 });
    farm.owner = 'p1';
    farm.outfit = 'food';
    const clean = rawOutput(state, farm);
    state.air = 20;
    const by = runPollution(state);
    expect(by.p0).toBe(4);
    expect(farm.pollution).toBe(1);
    expect(rawOutput(state, farm)).toBe(clean - 1);
    // 4 points in, and nature cleans 2 per player.
    expect(state.air).toBe(20 + 4 - 2 * 4);
  });

  it('stops spreading behind a filter and recovers on its own', () => {
    const state = newGame();
    const mine = plot(state, 3, 3, 'volcanic', { rareEarth: 3 });
    mine.owner = 'p0';
    mine.outfit = 'rareEarth';
    const next = plot(state, 4, 3);
    next.pollution = 2;
    state.players[0]!.stock.alloy = 1;
    toPhase(state, 'development');
    fitFilter(state, 'p0', 3, 3);
    const by = runPollution(state);
    expect(by.p0).toBe(2);
    expect(next.pollution).toBe(1);
  });

  it('cuts every score by a fifth when the colony ends in Collapse', () => {
    const state = newGame();
    const before = score(state, 'p0');
    state.air = 85;
    expect(airBand(state.air).name).toBe('collapse');
    expect(score(state, 'p0')).toBe(Math.round(before * 0.8));
  });
});
