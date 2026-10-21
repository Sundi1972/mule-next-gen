import { GAME, LOTS } from './config.js';
import { mulePrice } from './economy.js';
import { RuleError } from './errors.js';
import { tileAt } from './map.js';
import type { GameState, Listing, LotItem, Tile } from './types.js';

/**
 * The land auction's lots. In planning a player lists a plot they own, or
 * the MULE on one, with a minimum and what happens if nobody bids it. After
 * the land grant the lots come up one at a time in listing order.
 */

/** What the store pays for an unsold lot of this kind, today. A listing fixes it when it is made. */
export function storePaysFor(state: GameState, kind: LotItem['kind']): number {
  return kind === 'plot' ? Math.round(LOTS.storePlotShare * GAME.plotScore) : Math.round(LOTS.storeMuleShare * mulePrice(state));
}

/** True when this plot, or the MULE on it, is up for auction this month. */
export function isListed(state: GameState, x: number, y: number): boolean {
  return state.listings.some((l) => l.item.x === x && l.item.y === y);
}

function requirePlanning(state: GameState): void {
  if (state.phase !== 'planning') throw new RuleError('Listings are made in planning');
}

function lotPlot(state: GameState, x: number, y: number): Tile {
  const tile = tileAt(state.tiles, state.width, x, y);
  if (!tile || tile.terrain === 'store') throw new RuleError('Not a plot');
  return tile;
}

/** Lists a plot the player owns, or the MULE on it, for this month's land auction. Returns the listing. */
export function list(state: GameState, playerId: string, lot: { item: LotItem; minimum: number; unsold: Listing['unsold'] }): Listing {
  requirePlanning(state);
  const { item, minimum, unsold } = lot;
  const tile = lotPlot(state, item.x, item.y);
  if (tile.owner !== playerId) throw new RuleError('Not your plot');
  if (item.kind === 'mule' && tile.outfit === null) throw new RuleError('No MULE on that plot');
  if (isListed(state, item.x, item.y)) throw new RuleError('That plot is already up for auction');
  if (state.listings.filter((l) => l.seller === playerId).length >= LOTS.perPlayer) throw new RuleError(`You can list ${LOTS.perPlayer} lots a month`);
  if (state.listings.length >= LOTS.maxLotsPerMonth) throw new RuleError('The auction is full this month');
  if (!Number.isInteger(minimum) || minimum < 1) throw new RuleError('Pick a minimum of 1 or more');
  // A plot is listed at most once a month, so its place names the listing.
  const listing: Listing = {
    id: `${item.kind}-${item.x}-${item.y}`,
    seller: playerId,
    item: { kind: item.kind, x: item.x, y: item.y },
    minimum,
    unsold,
    storePays: storePaysFor(state, item.kind),
  };
  state.listings.push(listing);
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

export function startLandAuction(state: GameState): void {
  throw new Error('NotImplemented: startLandAuction');
}

export function endLandAuction(state: GameState): void {
  throw new Error('NotImplemented: endLandAuction');
}
