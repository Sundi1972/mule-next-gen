import { GAME, LOTS, WALK } from './config.js';
import { mulePrice, taxSale } from './economy.js';
import { RuleError } from './errors.js';
import { freePlots } from './game.js';
import { tileAt } from './map.js';
import { createRng } from './rng.js';
import type { GameState, LandAuction, Listing, LotItem, LotResult, Tile } from './types.js';
import { stepBoard, takeSide, type WalkMarket } from './walk.js';

/**
 * The land auction: plots and MULEs listed in planning, sold one lot at a
 * time after the land grant to the highest bid at or over the minimum.
 */

/** What the store pays for an unsold lot of this kind, today. A listing fixes it when it is made. */
export function storePaysFor(state: GameState, kind: LotItem['kind']): number {
  return storePaysAt(kind, mulePrice(state));
}

/** The same figure from a MULE price a screen already has (the view's mulePrice). */
export function storePaysAt(kind: LotItem['kind'], mulePriceNow: number): number {
  return kind === 'plot' ? Math.round(LOTS.storePlotShare * GAME.plotScore) : Math.round(LOTS.storeMuleShare * mulePriceNow);
}

/** True when this plot, or the MULE on it, is up for auction this month. */
export function isListed(state: { listings: readonly { item: { x: number; y: number } }[] }, x: number, y: number): boolean {
  return state.listings.some((l) => l.item.x === x && l.item.y === y);
}

function requirePlanning(state: GameState): void {
  if (state.phase !== 'planning') throw new RuleError('Listings are made in planning');
}

/** The plot at x, y. Throws RuleError for the store or a square off the map. */
export function plotAt(state: GameState, x: number, y: number): Tile {
  const tile = tileAt(state.tiles, state.width, x, y);
  if (!tile || tile.terrain === 'store') throw new RuleError('Not a plot');
  return tile;
}

/** What a player asks to list: the MULE's outfit is read off the plot. */
export interface ListRequest {
  item: { kind: LotItem['kind']; x: number; y: number };
  minimum: number;
  unsold: Listing['unsold'];
}

/** Lists a plot the player owns, or the MULE on it, for this month's land auction. Returns the listing. */
export function list(state: GameState, playerId: string, lot: ListRequest): Listing {
  requirePlanning(state);
  const { item, minimum, unsold } = lot;
  if (item.kind !== 'plot' && item.kind !== 'mule') throw new RuleError('Not a plot');
  const tile = plotAt(state, item.x, item.y);
  if (tile.owner !== playerId) throw new RuleError('Not your plot');
  if (item.kind === 'mule' && tile.outfit === null) throw new RuleError('No MULE on that plot');
  if (isListed(state, item.x, item.y)) throw new RuleError('That plot is already up for auction');
  if (state.listings.filter((l) => l.seller === playerId).length >= LOTS.perPlayer) throw new RuleError(`You can list ${LOTS.perPlayer} lots a month`);
  if (state.listings.length >= LOTS.maxLotsPerMonth) throw new RuleError('The auction is full this month');
  if (!Number.isInteger(minimum) || minimum < 1) throw new RuleError('Pick a minimum of 1 or more');
  if (unsold !== 'store' && unsold !== 'keep') throw new RuleError('Pick store or keep');
  // A plot is listed at most once a month, so its place names the listing.
  const listing: Listing = {
    id: `${item.kind}-${item.x}-${item.y}`,
    seller: playerId,
    // Nothing installs between planning and the land auction, so the outfit seen now is the one sold.
    item: item.kind === 'plot' ? { kind: 'plot', x: item.x, y: item.y } : { kind: 'mule', x: item.x, y: item.y, outfit: tile.outfit! },
    minimum,
    unsold,
    storePays: storePaysFor(state, item.kind),
  };
  state.listings.push(listing);
  return listing;
}

/** The seller of a plot the colony puts up. It is not a player: its proceeds go to store capital. */
export const COLONY_SELLER = 'colony';

/**
 * Sometimes puts one free plot up for the colony, first in the line-up (spec RULE-7).
 * Call on leaving the land grant, so the plot is still free. Returns the listing, or null.
 */
export function colonyLot(state: GameState): Listing | null {
  // An AI's look-ahead neither foresees the real colony lot nor imagines one from its zeroed seed.
  if (state.whatIf) return null;
  // Its own RNG from (seed, month) alone: sharing one would shift every draw after it when a colony lot appears.
  const rng = createRng((state.seed * 53 + state.month * 6_151) >>> 0); // literal-ok: rng salt, reshuffles replays only
  if (rng.next() >= LOTS.colonyPlotChance) return null;
  const free = freePlots(state);
  if (free.length === 0 || state.listings.length >= LOTS.maxLotsPerMonth) return null;
  const { x, y } = rng.pick(free);
  const listing: Listing = {
    id: `plot-${x}-${y}`,
    seller: COLONY_SELLER,
    item: { kind: 'plot', x, y },
    minimum: Math.round(LOTS.colonyPlotShare * GAME.plotScore),
    unsold: 'keep',
    // Unsold, it stays free land: the store never pays for it.
    storePays: 0,
  };
  // A new array, not unshift: cloneForSim shares this one with the real game.
  state.listings = [listing, ...state.listings];
  return listing;
}

/** Takes a listing back. Only its seller, and only in planning. */
export function unlist(state: GameState, playerId: string, id: string): void {
  requirePlanning(state);
  const listing = state.listings.find((l) => l.id === id);
  if (!listing) throw new RuleError('No such listing');
  if (listing.seller !== playerId) throw new RuleError('Not your listing');
  state.listings = state.listings.filter((l) => l !== listing);
}

// --- The land auction -------------------------------------------------------

/** No lot up and nobody on the board. */
const idleBoard = () => ({ lot: null, stage: 'over', clockMs: 0, walkers: [], done: [], aside: {} }) satisfies Partial<LandAuction>;

/** A walk not yet sped up, with no time put back and nobody who has led. */
const calmWalk = () => ({ fast: false, addedMs: 0, leaderId: null }) satisfies Partial<LandAuction>;

/** What every new lot starts from: nobody on the board, no deals, no result yet. */
const freshBoard = () =>
  ({ elapsed: 0, walkers: [], deals: [], turns: {}, units: 0, between: { units: 0, value: 0 }, done: [], aside: {}, result: null }) satisfies Partial<LandAuction>;

/** Opens the land auction: the month's first lot comes up in its intro. */
export function startLandAuction(state: GameState): void {
  state.landAuction = {
    ...idleBoard(),
    ...freshBoard(),
    queue: [...state.listings],
    ticks: 0,
    lo: 0,
    hi: 0,
    speed: WALK.minSpeed,
    number: 0,
    count: state.listings.length,
    ...calmWalk(),
  };
  nextLot(state);
}

function nextLot(state: GameState): void {
  const a = state.landAuction!;
  const lot = a.queue.shift();
  if (!lot) {
    Object.assign(a, idleBoard());
    return;
  }
  const lo = Math.floor(lot.minimum * LOTS.boardLow);
  const hi = Math.ceil(lot.minimum * LOTS.boardHigh);
  Object.assign(a, {
    ...freshBoard(),
    lot,
    stage: 'intro',
    clockMs: LOTS.introMs,
    lo,
    hi,
    speed: Math.max(WALK.minSpeed, (hi - lo) / WALK.crossSeconds),
    number: a.number + 1,
  } satisfies Partial<LandAuction>);
}

/** Where each player but the seller stands on this lot: a buyer, or aside for too little money or a MULE already in hand. */
export function standing(state: GameState, lot: Listing): { id: string; aside: 'money' | 'mule' | null }[] {
  return state.players
    .filter((p) => p.id !== lot.seller)
    .map((p) => ({ id: p.id, aside: p.money < lot.minimum ? 'money' : lot.item.kind === 'mule' && p.carriedMule !== null ? 'mule' : null }));
}

const seatOf = (state: GameState, id: string) => state.players.findIndex((p) => p.id === id);

/** The lot as a market for the walk board: buyers' money and seat order, and nobody to trade with, so stepBoard never trades. */
function lotMarket(state: GameState): WalkMarket {
  return {
    units: () => 0,
    money: (id) => state.players.find((p) => p.id === id)?.money ?? 0,
    houseSells: null,
    houseBuys: [],
    floor: () => null,
    first: () => false,
    seat: (id) => Math.max(0, seatOf(state, id)),
    trade: () => {},
  };
}

/** The highest rounded bid at or over the minimum and who holds it (first there, then seat order), or null if no bid reaches it. */
export function lotLeader(state: GameState): { id: string; bid: number } | null {
  const a = state.landAuction;
  if (!a?.lot) return null;
  const minimum = a.lot.minimum;
  const best = a.walkers
    .filter((w) => w.side === 'buyer' && Math.round(w.price) >= minimum)
    .sort((x, y) => Math.round(y.price) - Math.round(x.price) || x.since - y.since || seatOf(state, x.id) - seatOf(state, y.id))[0];
  return best ? { id: best.id, bid: Math.round(best.price) } : null;
}

function startWalk(state: GameState): void {
  const a = state.landAuction!;
  const players = standing(state, a.lot!);
  Object.assign(a, {
    ...calmWalk(),
    stage: 'walk',
    clockMs: LOTS.walkMs,
    elapsed: 0,
    done: [],
    walkers: players.map(({ id }) => ({ id, side: 'pass', price: 0, dir: 0, since: 0 })),
    aside: Object.fromEntries(players.flatMap((x) => (x.aside ? [[x.id, x.aside]] : []))),
  } satisfies Partial<LandAuction>);
  const market = lotMarket(state);
  for (const { id, aside } of players) if (!aside) takeSide(a, market, id, 'buyer');
}

/** Moves the lot to its winner, or applies the seller's unsold choice. */
function resolve(state: GameState, lot: Listing, leader: { id: string; bid: number } | null): LotResult {
  const tile = tileAt(state.tiles, state.width, lot.item.x, lot.item.y)!;
  const seller = state.players.find((p) => p.id === lot.seller);
  const clearMule = () => {
    tile.outfit = null;
    tile.runMonths = 0;
  };
  if (leader) {
    const winner = state.players.find((p) => p.id === leader.id)!;
    winner.money -= leader.bid;
    // The colony is not a player: its proceeds go to store capital, untaxed.
    if (seller) seller.money += taxSale(state, seller.id, leader.bid);
    else state.store.capital += leader.bid;
    if (lot.item.kind === 'plot') tile.owner = winner.id;
    else {
      winner.carriedMule = lot.item.outfit;
      clearMule();
    }
    return { kind: 'sold', buyer: winner.id, price: leader.bid };
  }
  // The store always pays, so listing to it is a sure exit; its capital may go negative.
  if (lot.unsold === 'store' && seller) {
    seller.money += lot.storePays;
    state.store.capital -= lot.storePays;
    if (tile.outfit) state.store.mules++;
    clearMule();
    if (lot.item.kind === 'plot') tile.owner = null;
    return { kind: 'store', price: lot.storePays };
  }
  return { kind: 'kept' };
}

function ringBell(state: GameState): LotResult {
  const a = state.landAuction!;
  const result = resolve(state, a.lot!, lotLeader(state));
  for (const w of a.walkers) w.dir = 0;
  Object.assign(a, { stage: 'result', clockMs: LOTS.resultMs, done: [], result } satisfies Partial<LandAuction>);
  return result;
}

const buyerIds = (a: LandAuction) => a.walkers.filter((w) => w.side === 'buyer').map((w) => w.id);

/** Hold up, hold down or stand still during a lot's walk. Walking takes back a Done. */
export function setLotWalk(state: GameState, playerId: string, dir: -1 | 0 | 1): void {
  const a = state.landAuction;
  if (state.phase !== 'landAuction' || a?.stage !== 'walk') throw new RuleError('Not walking yet');
  const w = a.walkers.find((x) => x.id === playerId);
  if (!w || w.side !== 'buyer') throw new RuleError("You can't bid on this lot");
  w.dir = dir;
  if (dir !== 0) lotDone(state, playerId, false);
}

/** Done with this lot's intro or walk, or not done after all. */
export function lotDone(state: GameState, playerId: string, done = true): void {
  const a = state.landAuction;
  if (state.phase !== 'landAuction' || !a || (a.stage !== 'intro' && a.stage !== 'walk')) return;
  const has = a.done.includes(playerId);
  if (done && !has) a.done.push(playerId);
  if (!done && has) a.done = a.done.filter((id) => id !== playerId);
}

/** Advances the land auction by dt ms of game time. Returns the result in the step its bell rings. */
export function stepLandAuction(state: GameState, dt: number): LotResult | null {
  const a = state.landAuction;
  if (state.phase !== 'landAuction' || !a?.lot || a.stage === 'over') return null;

  if (a.stage === 'intro') {
    a.ticks++;
    a.clockMs -= dt;
    const buyers = standing(state, a.lot).filter((x) => !x.aside);
    const allDone = buyers.length > 0 && buyers.every((x) => a.done.includes(x.id));
    if (a.clockMs > 0 && !allDone) return null;
    startWalk(state);
    return buyerIds(a).length === 0 ? ringBell(state) : null;
  }

  if (a.stage === 'result') {
    a.ticks++;
    a.clockMs -= dt;
    if (a.clockMs <= 0) nextLot(state);
    return null;
  }

  const money = new Map(state.players.map((p) => [p.id, p.money]));
  const before = new Map(a.walkers.map((w) => [w.id, { bid: Math.round(w.price), since: w.since }]));
  stepBoard(a, lotMarket(state), dt);
  for (const w of a.walkers) {
    if (w.side !== 'buyer') continue;
    w.price = Math.min(w.price, money.get(w.id)!);
    // Pressing against your money leaves your bid where it was, so it mustn't cost you your place as first there.
    const was = before.get(w.id)!;
    if (Math.round(w.price) === was.bid) w.since = was.since;
  }
  lateRules(state, a);
  if (a.clockMs <= 0 || buyerIds(a).every((id) => a.done.includes(id))) return ringBell(state);
  return null;
}

/**
 * After the walk has moved, and before the bell: the faster climb once the
 * lead passes the board's top, and the soft close. Running before the bell
 * lets an overtake in the step that empties the clock still win time.
 */
function lateRules(state: GameState, a: LandAuction): void {
  const leader = lotLeader(state);
  if (!a.fast && leader && leader.bid > a.hi) {
    a.fast = true;
    a.speed *= LOTS.fastClimb;
  }
  if (!leader) return;
  const overtake = a.leaderId !== null && a.leaderId !== leader.id;
  a.leaderId = leader.id;
  if (!overtake || a.clockMs >= LOTS.lateMs) return;
  // A long step can run the clock past zero; players only ever get back time counted from zero, so that is all the cap pays for.
  const left = Math.max(0, a.clockMs);
  const added = Math.min(LOTS.lateMs - left, LOTS.lateCapMs - a.addedMs);
  a.clockMs = left + added;
  a.addedMs += added;
}

/** Ends the land auction at once: every lot not yet at its bell is kept, so nothing moves without a bell, and the month's listings are gone. */
export function endLandAuction(state: GameState): void {
  state.landAuction = null;
  state.listings = [];
}
