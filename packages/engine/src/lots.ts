import type { GameState, Listing, LotItem } from './types.js';

export function storePaysFor(state: GameState, kind: LotItem['kind']): number {
  throw new Error('NotImplemented: storePaysFor');
}

export function list(state: GameState, playerId: string, lot: { item: LotItem; minimum: number; unsold: Listing['unsold'] }): Listing {
  throw new Error('NotImplemented: list');
}

export function unlist(state: GameState, playerId: string, id: string): void {
  throw new Error('NotImplemented: unlist');
}
