import { runAuction, type Order, type Trade } from './auction.js';
import { GAME, GOOD_CONFIG, MULE, START } from './config.js';
import { allPrices, mulePrice } from './economy.js';
import { generateMap, tileAt } from './map.js';
import { runProduction } from './production.js';
import { createRng } from './rng.js';
import { emptyStock } from './stock.js';
import { GOODS, type GameState, type Good, type Phase, type Player } from './types.js';
import { runUpkeep } from './upkeep.js';

export interface NewPlayer {
  id: string;
  name: string;
  isAi: boolean;
}

export class RuleError extends Error {}

export function createGame(options: { seed: number; players: NewPlayer[]; maxMonths?: number }): GameState {
  if (options.players.length < 2 || options.players.length > 6) {
    throw new RuleError('A game needs 2 to 6 players');
  }
  const rng = createRng(options.seed);
  const map = generateMap(options.players.length, rng);
  const refPrice = emptyStock();
  for (const good of GOODS) refPrice[good] = GOOD_CONFIG[good].refPrice;

  return {
    seed: options.seed,
    month: 1,
    maxMonths: options.maxMonths ?? GAME.maxMonths,
    phase: 'planning',
    ...map,
    players: options.players.map(
      (p): Player => ({
        ...p,
        money: START.money,
        stock: { ...emptyStock(), food: 6, water: 4, energy: 4 },
        carriedMule: null,
        reputation: 50,
        claimsThisGrant: 0,
        hungry: false,
      }),
    ),
    store: {
      stock: { ...START.storeStock },
      mules: START.storeMules,
      fund: START.storeFund,
      refPrice,
      offWorld: { ...refPrice },
      pendingImports: emptyStock(),
    },
    colonists: START.colonists,
    landRanOutMonth: null,
    history: [],
  };
}

function player(state: GameState, id: string): Player {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new RuleError(`Unknown player ${id}`);
  return p;
}

function requirePhase(state: GameState, phase: Phase): void {
  if (state.phase !== phase) throw new RuleError(`Not allowed during ${state.phase}`);
}

export function freePlots(state: GameState) {
  return state.tiles.filter((t) => t.owner === null && t.terrain !== 'store');
}

// --- Land grant -----------------------------------------------------------

export function claimPlot(state: GameState, playerId: string, x: number, y: number): void {
  requirePhase(state, 'landGrant');
  const p = player(state, playerId);
  if (p.claimsThisGrant >= GAME.claimsPerGrant) throw new RuleError('No claims left this month');
  const tile = tileAt(state.tiles, state.width, x, y);
  if (!tile || tile.terrain === 'store') throw new RuleError('Not a plot');
  if (tile.owner) throw new RuleError('Plot already taken');
  tile.owner = playerId;
  p.claimsThisGrant++;
  if (state.landRanOutMonth === null && freePlots(state).length === 0) state.landRanOutMonth = state.month;
}

// --- Development ----------------------------------------------------------

export function buyMule(state: GameState, playerId: string): void {
  requirePhase(state, 'development');
  const p = player(state, playerId);
  if (p.carriedMule) throw new RuleError('Already leading a MULE');
  if (state.store.mules <= 0) throw new RuleError('The store is out of MULEs');
  const price = mulePrice(state);
  if (p.money < price) throw new RuleError('Not enough money');
  p.money -= price;
  state.store.fund += price;
  state.store.mules--;
  p.carriedMule = 'empty';
}

export function outfitMule(state: GameState, playerId: string, good: Good): void {
  requirePhase(state, 'development');
  const p = player(state, playerId);
  if (!p.carriedMule) throw new RuleError('No MULE to outfit');
  const cost = MULE.outfitCost[good];
  if (p.money < cost) throw new RuleError('Not enough money');
  p.money -= cost;
  state.store.fund += cost;
  p.carriedMule = good;
}

export function installMule(state: GameState, playerId: string, x: number, y: number): void {
  requirePhase(state, 'development');
  const p = player(state, playerId);
  if (!p.carriedMule || p.carriedMule === 'empty') throw new RuleError('The MULE is not outfitted');
  const tile = tileAt(state.tiles, state.width, x, y);
  if (!tile || tile.owner !== playerId) throw new RuleError('Not your plot');
  // Installing over an existing MULE replaces it; the old one runs away, as in the original.
  tile.outfit = p.carriedMule;
  p.carriedMule = null;
}

// --- Phase flow -----------------------------------------------------------

const ORDER: Phase[] = ['planning', 'landGrant', 'development', 'production', 'auction', 'upkeep'];

/**
 * Moves to the next phase. Production and upkeep resolve on their own when
 * entered; the auction needs everyone's orders, so it resolves through
 * settleAuction() instead.
 */
export function advancePhase(state: GameState): void {
  if (state.phase === 'gameOver') return;
  const next = ORDER[(ORDER.indexOf(state.phase) + 1) % ORDER.length]!;
  state.phase = next;

  if (next === 'landGrant') {
    for (const p of state.players) p.claimsThisGrant = 0;
  }
  if (next === 'production') {
    // A MULE nobody installed runs away at the end of development.
    for (const p of state.players) p.carriedMule = null;
    const produced = runProduction(state);
    state.history.push({ month: state.month, produced, prices: allPrices(state), shortages: [], storeMules: state.store.mules });
  }
  if (next === 'upkeep') {
    const shortages = runUpkeep(state);
    const report = state.history.at(-1);
    if (report) report.shortages = shortages;
    if (isGameOver(state)) state.phase = 'gameOver';
  }
  if (next === 'planning') state.month++;
}

export function settleAuction(state: GameState, orders: Partial<Record<Good, Order[]>>): Trade[] {
  requirePhase(state, 'auction');
  const trades: Trade[] = [];
  for (const good of GOODS) trades.push(...runAuction(state, good, orders[good] ?? []));
  const report = state.history.at(-1);
  if (report) report.prices = allPrices(state);
  return trades;
}

export function isGameOver(state: GameState): boolean {
  if (state.month >= state.maxMonths) return true;
  return state.landRanOutMonth !== null && state.month >= state.landRanOutMonth + GAME.landRushMonths;
}

/** Final score: money, plus goods and land at today's colony prices. */
export function score(state: GameState, playerId: string): number {
  const p = player(state, playerId);
  const prices = allPrices(state);
  const goods = GOODS.reduce((sum, g) => sum + p.stock[g] * prices[g], 0);
  const plots = state.tiles.filter((t) => t.owner === playerId);
  const land = plots.length * 300 + plots.filter((t) => t.outfit).length * mulePrice(state);
  return Math.round(p.money + goods + land);
}
