import { describe, expect, it } from 'vitest';
import {
  advanceGrant,
  advancePhase,
  allPrices,
  buyMule,
  claimPlot,
  colonyFailed,
  createGame,
  createRng,
  GAME,
  GOODS,
  grantDone,
  installMule,
  litPlot,
  mulePrice,
  outfitMule,
  player,
  POLLUTION,
  RuleError,
  score,
  scoreParts,
  visitPub,
  type GameState,
  type Rng,
} from '../src/index.js';

const COLLAPSE_AIR = POLLUTION.bands.find((b) => b.name === 'collapse')!.from;

/** score() as it stood before scoreParts existed, frozen as the oracle. */
function todaysScore(state: GameState, playerId: string): number {
  const p = player(state, playerId);
  const prices = allPrices(state);
  const goods = GOODS.reduce((sum, g) => sum + p.stock[g] * prices[g], 0);
  const plots = state.tiles.filter((t) => t.owner === playerId);
  const land = plots.length * GAME.plotScore + plots.filter((t) => t.outfit).length * mulePrice(state);
  const total = p.money + goods + land;
  return Math.round(colonyFailed(state) ? total * POLLUTION.collapseScore : total);
}

function ignoreRuleError(action: () => void): void {
  try {
    action();
  } catch (e) {
    if (!(e instanceof RuleError)) throw e;
  }
}

function playMonth(state: GameState, rng: Rng): void {
  advancePhase(state);
  while (!grantDone(state)) {
    const lit = litPlot(state);
    if (!lit) break;
    const claimer = state.players.find((p) => p.claimsThisGrant < GAME.claimsPerGrant && rng.chance(0.3));
    if (claimer) claimPlot(state, claimer.id, lit.x, lit.y);
    advanceGrant(state);
  }

  advancePhase(state);
  for (const p of state.players) {
    const bare = state.tiles.filter((t) => t.owner === p.id && !t.outfit);
    if (bare.length > 0 && rng.chance(0.7)) {
      const plot = rng.pick(bare);
      ignoreRuleError(() => {
        buyMule(state, p.id);
        outfitMule(state, p.id, rng.pick(GOODS));
        installMule(state, p.id, plot.x, plot.y);
      });
    }
    visitPub(state, p.id, rng.int(0, p.devSeconds));
  }

  // production, auction, upkeep, then the next planning or gameOver
  for (let i = 0; i < 4; i++) advancePhase(state);
}

/** Pushes a played state into the corners: Collapse air, fractional money, more land and MULEs, odd stock. */
function perturb(state: GameState, rng: Rng): void {
  state.air = rng.chance(0.4) ? rng.int(COLLAPSE_AIR, COLLAPSE_AIR + 40) : rng.int(0, COLLAPSE_AIR - 1);
  for (const p of state.players) {
    if (rng.chance(0.6)) p.money += rng.chance(0.3) ? rng.int(0, 40) + 0.5 : rng.next() * 100;
    for (const g of GOODS) if (rng.chance(0.3)) p.stock[g] = rng.int(0, 25);
  }
  for (const tile of state.tiles) {
    if (tile.terrain === 'store' || tile.owner || !rng.chance(0.1)) continue;
    tile.owner = rng.pick(state.players).id;
    if (rng.chance(0.5)) tile.outfit = rng.pick(GOODS);
  }
}

function endState(seed: number): GameState {
  const rng = createRng(seed);
  const players = Array.from({ length: rng.int(2, 6) }, (_, i) => ({ id: `p${i}`, name: `P${i}`, isAi: true }));
  const state = createGame({ seed, players });
  const lastMonth = rng.int(1, state.maxMonths);
  while (state.phase !== 'gameOver' && state.month <= lastMonth) playMonth(state, rng);
  perturb(state, rng);
  return state;
}

/** Player a: `plots` plots of which `mules` carry a MULE at 150, goods worth 610 (61 Food at 10). */
function workedExample(options: { money: number; air: number; plots: number; mules: number }): GameState {
  const state = createGame({
    seed: 7,
    players: [
      { id: 'a', name: 'A', isAi: false },
      { id: 'b', name: 'B', isAi: false },
    ],
  });
  state.air = options.air;
  state.store.posted.smithore = 30;
  state.store.muleFactor = 1;
  state.store.posted.food = 10;
  const a = player(state, 'a');
  a.money = options.money;
  for (const g of GOODS) a.stock[g] = 0;
  a.stock.food = 61;
  const plots = state.tiles.filter((t) => t.terrain !== 'store').slice(0, options.plots);
  plots.forEach((tile, i) => {
    tile.owner = 'a';
    tile.outfit = i < options.mules ? 'food' : null;
  });
  return state;
}

describe('T-AC-6: score parts add up and score() is unchanged', () => {
  const states = Array.from({ length: 200 }, (_, i) => endState(1000 + i * 7919));

  it('T-AC-6: for 200 seeded end states, every player: score() = scoreParts().total = today\'s formula, and the lines add up', () => {
    for (const state of states) {
      for (const p of state.players) {
        const parts = scoreParts(state, p.id);
        expect(score(state, p.id)).toBe(parts.total);
        expect(parts.total).toBe(todaysScore(state, p.id));
        expect(parts.money).toBe(Math.round(p.money));
        for (const line of Object.values(parts)) expect(Number.isInteger(line)).toBe(true);
        expect(parts.money + parts.goods + parts.land + parts.muleValue).toBe(parts.total + parts.cut);
        if (!colonyFailed(state)) expect(parts.cut).toBe(0);
      }
    }
  });

  it('T-AC-6 coverage: the 200 states cover Collapse, fractional and .5 money, MULE owners and finished games', () => {
    const collapse = states.filter((s) => colonyFailed(s)).length;
    const passed = states.length - collapse;
    const fractional = states.filter((s) => s.players.some((p) => !Number.isInteger(p.money))).length;
    const halfMoney = states.flatMap((s) => s.players).filter((p) => p.money % 1 === 0.5).length;
    const muleOwners = states.filter((s) => s.tiles.some((t) => t.owner && t.outfit)).length;
    const finished = states.filter((s) => s.phase === 'gameOver').length;
    expect(collapse).toBeGreaterThanOrEqual(40);
    expect(passed).toBeGreaterThanOrEqual(40);
    expect(fractional).toBeGreaterThanOrEqual(40);
    expect(halfMoney).toBeGreaterThanOrEqual(40);
    expect(muleOwners).toBeGreaterThanOrEqual(40);
    expect(finished).toBeGreaterThanOrEqual(5);
  });

  it('T-AC-6: RULE-3 example: 2140 money, 610 goods, 6 plots, 5 MULEs at 150, air passed → 5300, cut 0', () => {
    const state = workedExample({ money: 2140, air: 0, plots: 6, mules: 5 });
    expect(mulePrice(state)).toBe(150);
    expect(scoreParts(state, 'a')).toEqual({
      money: 2140,
      goods: 610,
      plots: 6,
      land: 1800,
      mules: 5,
      muleValue: 750,
      cut: 0,
      total: 5300,
    });
    expect(score(state, 'a')).toBe(5300);
  });

  it('T-AC-6: RULE-3 example: the same in Collapse → 4240, cut 1060', () => {
    const state = workedExample({ money: 2140, air: COLLAPSE_AIR, plots: 6, mules: 5 });
    expect(colonyFailed(state)).toBe(true);
    expect(scoreParts(state, 'a')).toEqual({
      money: 2140,
      goods: 610,
      plots: 6,
      land: 1800,
      mules: 5,
      muleValue: 750,
      cut: 1060,
      total: 4240,
    });
    expect(score(state, 'a')).toBe(4240);
  });

  // Each row's sum sits on a .5 edge where another grouping of the addition rounds the other way:
  // the first catches money + (goods + land), the second ((money + goods) + land) + muleValue.
  it.each([
    { money: 100.5 - 5 * 2 ** -44, plots: 6, mules: 0, today: 2511 },
    { money: 100.5 - 10 * 2 ** -44, plots: 8, mules: 7, today: 4160 },
  ])('T-AC-6: a sum on a floating-point rounding edge still scores exactly as today: $today', ({ money, plots, mules, today }) => {
    const state = workedExample({ money, air: 0, plots, mules });
    expect(todaysScore(state, 'a')).toBe(today);
    const parts = scoreParts(state, 'a');
    expect(parts.total).toBe(today);
    expect(parts.money + parts.goods + parts.land + parts.muleValue).toBe(today);
  });
});
