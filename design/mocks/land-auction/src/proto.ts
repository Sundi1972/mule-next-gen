import type { Outfit } from '@mule/engine';
import type { MuleView, WalkerView } from '@mule/protocol';

/**
 * PROPOSED protocol additions for the land auction (packages/protocol, WS3).
 * The mock types its fixtures against these, so the spec's contracts and the
 * screens cannot drift apart. Nothing here exists in @mule/protocol yet.
 */

/** What is for sale: a plot (with whatever stands on it), or the MULE off one of the seller's plots. */
export type LotItemView = { kind: 'plot'; x: number; y: number } | { kind: 'mule'; x: number; y: number; outfit: Outfit };

/** One listing, public from the moment it is made in planning. */
export interface ListingView {
  id: string;
  /** A player's id, or 'colony' for a colony plot (off until LOTS.colonyPlots > 0). */
  seller: string;
  item: LotItemView;
  minimum: number;
  /** If nobody bids the minimum: the store buys it at `storePays`, or the seller keeps it. */
  unsold: 'store' | 'keep';
  storePays: number;
}

/** A buyer on a lot's board. Everyone but the seller, if they can pay the minimum (and, for a MULE, has no MULE in hand). */
export interface LotWalkerView extends WalkerView {
  /** Why a player stands aside, for the names along the bottom. */
  aside?: 'money' | 'mule';
}

export type LotResultView = { kind: 'sold'; buyer: string; price: number } | { kind: 'store'; price: number } | { kind: 'kept' };

/** The land auction while it runs: one lot at a time. */
export interface LandAuctionView {
  lot: ListingView;
  stage: 'intro' | 'walk' | 'result';
  seconds: number;
  total: number;
  /** This lot's place in the month's line-up, from 1. */
  number: number;
  count: number;
  lo: number;
  hi: number;
  speed: number;
  walkers: LotWalkerView[];
  /** The highest bid at or above the minimum, and who holds it: what wins at the bell. */
  leader: { id: string; bid: number } | null;
  result: LotResultView | null;
  next: ListingView[];
}

/** MuleView, with the additions. */
export type LotsView = MuleView & {
  listings: ListingView[];
  /** The month's lot slots: LOTS.maxLotsPerMonth, and how many are taken. */
  lotSlots: { used: number; max: number };
  landAuction: LandAuctionView | null;
};

/** PROPOSED intents: `list` and `unlist` in planning. The walk reuses `walk`, and Done reuses `ready`. */
export type LotIntent =
  | { type: 'list'; item: { kind: 'plot' | 'mule'; x: number; y: number }; minimum: number; unsold: 'store' | 'keep' }
  | { type: 'unlist'; id: string };
