import { GOOD_CONFIG, PRICE, UPKEEP, WALK } from './config.js';
import { colonyPrice, driftReference, monthlyDemand, shipInPort, shipPrice, storeForSale, storeWants, taxSale } from './economy.js';
import { RuleError } from './errors.js';
import { monthNeeds } from './production.js';
import type { AuctionSide, GameState, Good, LiveAuction, SkipReason, StatusRow } from './types.js';
import { stepBoard, takeSide, tradePossible, type WalkMarket } from './walk.js';

/**
 * The goods auction, played live as in the original M.U.L.E. Goods come up
 * one at a time. For each, a status screen shows what every player had,
 * used, made and now holds; then everyone declares Buyer, Seller or Pass;
 * then they walk on the board (see walk.ts): sellers start at the top and
 * walk down to ask less, buyers start at the bottom and walk up to bid
 * more. The store's selling line is near the top, its buying line near the
 * bottom, and the export ship stands at its price while it is in port.
 *
 * Goods nobody can trade are skipped without a screen of their own, and a
 * good ends early once every player on the board is done or no trade is
 * possible any more. Everything is a pure function of the game state and
 * the time step, so the server, the simulator and the tests run the same auction.
 */

export interface Trade {
  good: Good;
  buyer: string;
  seller: string;
  quantity: number;
  price: number;
}

export const STORE_ID = 'store';
export const SHIP_ID = 'ship';

function live(state: GameState): LiveAuction {
  if (state.phase !== 'auction' || !state.auction || !state.auction.good) throw new RuleError('The auction is not running');
  return state.auction;
}

/** The store's selling line, while it has stock to sell. */
export function storeSellLine(state: GameState): number | null {
  const a = state.auction;
  return a?.good && storeForSale(state, a.good) > 0 ? a.storeSell : null;
}

/** The store's buying line, while it still wants the good and can pay. */
export function storeBuyLine(state: GameState): number | null {
  const a = state.auction;
  return a?.good && a.storeBudget > 0 && state.store.capital >= a.storeBuy ? a.storeBuy : null;
}

/** What the export ship pays for the next unit, while it is in port and wants this good. */
export function shipLine(state: GameState): number | null {
  const a = state.auction;
  return a?.good && shipInPort(state) ? shipPrice(state, a.good) : null;
}

/** The good that is up, as a market for the walk board: players' stock and money, the store and the ship, and the sales tax. */
export function goodsMarket(state: GameState): WalkMarket {
  const a = state.auction!;
  const good = a.good!;
  const players = new Map(state.players.map((p) => [p.id, p]));
  const seats = new Map(state.players.map((p, i) => [p.id, i]));
  return {
    units: (id) => players.get(id)?.stock[good] ?? 0,
    money: (id) => players.get(id)?.money ?? 0,
    houseSells: { id: STORE_ID, price: () => storeSellLine(state) },
    houseBuys: [
      { id: SHIP_ID, price: () => shipLine(state) },
      { id: STORE_ID, price: () => storeBuyLine(state) },
    ],
    floor: () => storeBuyLine(state),
    first: (id) => players.get(id)?.species === 'quibbit',
    seat: (id) => seats.get(id) ?? 0,
    trade(buyer, seller, price) {
      const b = players.get(buyer);
      const s = players.get(seller);
      if (b) {
        b.money -= price;
        b.stock[good]++;
      } else if (buyer === STORE_ID) {
        state.store.capital -= price;
        state.store.stock[good]++;
        a.storeBudget--;
      } else {
        state.ship.hold[good] = (state.ship.hold[good] ?? 0) - 1;
        state.ship.bought[good] = (state.ship.bought[good] ?? 0) + 1;
      }
      if (s) {
        s.stock[good]--;
        s.money += taxSale(state, s.id, price);
      } else {
        state.store.capital += price;
        state.store.stock[good]--;
      }
    },
  };
}

/** Opens the auction: the first good that anyone can trade comes up. Goods come up in the configured order unless given. */
export function startAuction(state: GameState, goods: readonly Good[] = WALK.order): void {
  state.auction = {
    queue: [...goods],
    good: null,
    stage: 'over',
    clockMs: 0,
    elapsed: 0,
    ticks: 0,
    storeBuy: 0,
    storeSell: 0,
    storeBudget: 0,
    lo: 0,
    hi: 0,
    speed: WALK.minSpeed,
    walkers: [],
    deals: [],
    turns: {},
    units: 0,
    done: [],
    status: [],
    skipped: [],
    between: { units: 0, value: 0 },
    ai: {},
  };
  nextGood(state, []);
}

/** The status screen's rows for a good: had, used, made, now, need and what would spoil. */
export function statusRows(state: GameState, good: Good): StatusRow[] {
  const report = state.history.at(-1);
  const current = report?.month === state.month;
  return state.players.map((p) => {
    const now = p.stock[good];
    const made = current ? (report.produced[p.id]?.[good] ?? 0) : 0;
    const had = current ? (report.before[p.id]?.[good] ?? now) : now;
    const need = monthNeeds(state, p.id)[good];
    const rest = Math.max(0, now - need);
    const kept = Math.min(UPKEEP.depotCapacity, Math.floor(rest * (1 - GOOD_CONFIG[good].spoilage)));
    return { id: p.id, had, used: Math.max(0, had + made - now), made, now, need, spoils: rest - kept };
  });
}

/** Seller with units to spare, Buyer when short, Pass with none and no need (or exactly enough). */
export function defaultSide(state: GameState, playerId: string, good: Good): AuctionSide {
  const p = state.players.find((q) => q.id === playerId)!;
  const need = monthNeeds(state, playerId)[good];
  return p.stock[good] > need ? 'seller' : p.stock[good] < need ? 'buyer' : 'pass';
}

/**
 * Why a good is skipped before its status screen, or null when it comes up:
 * when no player holds any and the store has none to sell, or when nobody
 * could buy (no player needs it and can afford it, and neither the store nor
 * the ship will buy it).
 */
function skipBefore(state: GameState, good: Good, storeBuy: number, storeBudget: number): SkipReason | null {
  const forSale = storeForSale(state, good) > 0;
  if (!forSale && state.players.every((p) => p.stock[good] <= 0)) return 'nobody has any';
  const someoneBuys =
    storeBudget > 0 ||
    (shipInPort(state) && shipPrice(state, good) !== null) ||
    state.players.some((p) => p.stock[good] < monthNeeds(state, p.id)[good] && p.money >= storeBuy);
  return someoneBuys ? null : 'nobody buys';
}

function nextGood(state: GameState, skipped: LiveAuction['skipped']): void {
  const a = state.auction!;
  const demand = monthlyDemand(state);
  for (let good = a.queue.shift(); good !== undefined; good = a.queue.shift()) {
    const posted = colonyPrice(state, good);
    const storeBuy = Math.max(1, Math.floor(posted * (1 - PRICE.storeSpread)));
    const storeSell = Math.ceil(posted * (1 + PRICE.storeSpread));
    const budget = Math.max(0, Math.min(storeWants(state, good, storeBuy, demand), Math.floor(Math.max(0, state.store.capital) / storeBuy)));
    const reason = skipBefore(state, good, storeBuy, budget);
    if (reason) {
      // Nothing traded: the reference price still drifts toward the off-world price.
      driftReference(state, good, null);
      skipped.push({ good, reason });
      continue;
    }
    const ship = shipInPort(state) ? shipPrice(state, good) : null;
    const prices = [storeBuy, storeSell, posted, ...(ship !== null ? [ship] : [])];
    const low = Math.min(...prices);
    const high = Math.max(...prices);
    const margin = (high - low) * WALK.boardMargin + posted * 0.1;
    const lo = Math.max(0, Math.floor(low - margin));
    const hi = Math.ceil(high + margin);
    Object.assign(a, {
      good,
      stage: 'status',
      clockMs: WALK.statusMs,
      elapsed: 0,
      storeBuy,
      storeSell,
      storeBudget: budget,
      lo,
      hi,
      speed: Math.max(WALK.minSpeed, (hi - lo) / WALK.crossSeconds),
      walkers: [],
      deals: [],
      turns: {},
      units: 0,
      done: [],
      status: statusRows(state, good),
      skipped,
      between: { units: 0, value: 0 },
      ai: {},
    } satisfies Partial<LiveAuction>);
    return;
  }
  Object.assign(a, { good: null, stage: 'over', clockMs: 0, walkers: [], deals: [], status: [], skipped } satisfies Partial<LiveAuction>);
}

/** Closes the good that is up, teaching the market what players paid each other, and brings up the next. */
function finishGood(state: GameState, skipped?: SkipReason): void {
  const a = state.auction!;
  // Only trades between players teach the market something: the store and the ship trade at their own prices.
  if (a.good) driftReference(state, a.good, a.between.units > 0 ? a.between.value / a.between.units : null);
  nextGood(state, a.good && skipped ? [{ good: a.good, reason: skipped }] : []);
}

/** Ends the auction at once: goods still to come trade nothing. Used when the phase is cut short. */
export function endAuction(state: GameState): void {
  const a = state.auction;
  if (!a) return;
  while (a.stage !== 'over') {
    a.queue.forEach((g) => driftReference(state, g, null));
    a.queue = [];
    finishGood(state);
  }
}

/**
 * Takes a side for the good that is up: Buyer, Seller or Pass. During the
 * declare it sets where you start; during the walk you may switch, and your
 * creature jumps back to the new side's start edge (top for a seller,
 * bottom for a buyer), so a switch never trades at once. Pass leaves the board.
 */
export function declareRole(state: GameState, playerId: string, side: AuctionSide): void {
  const a = live(state);
  if (a.stage !== 'declare' && a.stage !== 'walk') throw new RuleError('Wait for the declare');
  const p = state.players.find((q) => q.id === playerId);
  if (!p) throw new RuleError(`Unknown player ${playerId}`);
  if (side === 'seller' && p.stock[a.good!] <= 0) throw new RuleError('You have none to sell');
  const w = a.walkers.find((x) => x.id === playerId);
  if (!w || w.side === side) return;
  takeSide(a, goodsMarket(state), playerId, side);
  if (a.stage === 'walk') auctionDone(state, playerId, false);
}

/** Hold up, hold down or stand still. Only during the walk, and only on the board. */
export function setWalk(state: GameState, playerId: string, dir: -1 | 0 | 1): void {
  const a = live(state);
  if (a.stage !== 'walk') throw new RuleError('Not walking yet');
  const w = a.walkers.find((x) => x.id === playerId);
  if (!w || w.side === 'pass') throw new RuleError('You passed on this good');
  w.dir = dir;
}

/** Done with this stage, or not done after all. */
export function auctionDone(state: GameState, playerId: string, done = true): void {
  const a = state.auction;
  if (state.phase !== 'auction' || !a || a.stage === 'over') return;
  const has = a.done.includes(playerId);
  if (done && !has) a.done.push(playerId);
  if (!done && has) a.done = a.done.filter((id) => id !== playerId);
}

function startDeclare(state: GameState): void {
  const a = state.auction!;
  const market = goodsMarket(state);
  a.stage = 'declare';
  a.clockMs = WALK.declareMs;
  a.done = [];
  a.walkers = state.players.map((p) => ({ id: p.id, side: 'pass', price: 0, dir: 0, since: 0 }));
  for (const p of state.players) takeSide(a, market, p.id, defaultSide(state, p.id, a.good!));
}

/**
 * Advances the live auction by dt ms of game time. The status screen and
 * the declare run on their own clocks and end early once every player is
 * done. The walk ends when its clock runs out, when every player still on
 * the board is done, or when no trade is possible any more. Returns every
 * unit traded in this step.
 */
export function stepAuction(state: GameState, dt: number): Trade[] {
  const a = state.auction;
  if (state.phase !== 'auction' || !a || a.stage === 'over' || !a.good) return [];
  const good = a.good;

  if (a.stage === 'status' || a.stage === 'declare') {
    a.ticks++;
    a.clockMs -= dt;
    if (a.clockMs > 0 && !state.players.every((p) => a.done.includes(p.id))) return [];
    if (a.stage === 'status') {
      startDeclare(state);
      return [];
    }
    Object.assign(a, { stage: 'walk', clockMs: WALK.goodMs, done: [], elapsed: 0 } satisfies Partial<LiveAuction>);
    // Everyone passed, or every seller lacks a buyer or every buyer a seller: nothing to walk for.
    if (!tradePossible(a, goodsMarket(state))) finishGood(state, 'nobody trading');
    return [];
  }

  const market = goodsMarket(state);
  const trades = stepBoard(a, market, dt).map((s): Trade => ({ good, quantity: 1, ...s }));
  const onBoard = a.walkers.filter((w) => w.side !== 'pass');
  if (a.clockMs <= 0 || onBoard.every((w) => a.done.includes(w.id)) || !tradePossible(a, market)) finishGood(state);
  return trades;
}
