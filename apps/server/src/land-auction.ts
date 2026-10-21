import { lotLeader, LOTS, standing, type GameState, type Listing, type LotResult } from '@mule/engine';
import type { ListingView, LotWalkerView, MuleView } from '@mule/protocol';

/* The land auction as the screens and the news see it: pure functions of the game state and seat names. */

/** A listing as every screen sees it. A MULE lot names its outfit as listed, so it still shows once the bell takes the MULE off the plot. */
export function listingView(l: Listing): ListingView {
  const { id, seller, item, minimum, unsold, storePays } = l;
  return { id, seller, item: { ...item }, minimum, unsold, storePays };
}

/**
 * The land auction as every screen draws it: the lot that is up, its
 * clock, the board and the bidders. During the intro nobody stands on the
 * board yet, so the walkers are who will bid and who sits it out, by the
 * engine's own rule.
 */
export function landAuctionView(state: GameState): MuleView['landAuction'] {
  const a = state.landAuction;
  if (state.phase !== 'landAuction' || !a?.lot || a.stage === 'over') return null;
  const lot = a.lot;
  const walkers: LotWalkerView[] =
    a.stage === 'intro'
      ? standing(state, lot).map(({ id, aside }) => ({
          id,
          side: aside ? 'pass' : 'buyer',
          price: aside ? 0 : a.lo,
          at: aside ? 0 : a.lo,
          dir: 0,
          done: a.done.includes(id),
          ...(aside ? { aside } : {}),
        }))
      : a.walkers.map((w) => {
          const aside = a.aside[w.id];
          return { id: w.id, side: w.side, price: Math.round(w.price), at: w.price, dir: w.dir, done: a.done.includes(w.id), ...(aside ? { aside } : {}) };
        });
  // Bids are capped by money, not by hi, so a bid can pass the board's top.
  const bids = a.walkers.filter((w) => w.side === 'buyer').map((w) => w.price);
  return {
    lot: listingView(lot),
    stage: a.stage,
    seconds: Math.max(0, a.clockMs / 1_000),
    total: (a.stage === 'intro' ? LOTS.introMs : a.stage === 'walk' ? LOTS.walkMs : LOTS.resultMs) / 1_000,
    number: a.number,
    count: a.count,
    ...boardRange(a.lo, a.hi, [lot.minimum, ...bids]),
    speed: a.speed,
    walkers,
    leader: lotLeader(state),
    result: a.result,
    next: a.queue.map(listingView),
  };
}

/** The news line at a lot's bell: who bought it, or what happened to it unsold. */
export function lotNews(lot: Listing, result: LotResult, nameOf: (seatId: string) => string): string {
  const { x, y } = lot.item;
  const what = lot.item.kind === 'plot' ? `plot ${x}·${y}` : `the MULE on plot ${x}·${y}`;
  const seller = lot.seller === 'colony' ? 'the colony' : nameOf(lot.seller);
  return result.kind === 'sold'
    ? `${nameOf(result.buyer)} bought ${what} from ${seller} for ${result.price}.`
    : result.kind === 'store'
      ? `The store bought ${what} from ${seller} for ${result.price}.`
      : `Nobody bid ${lot.minimum} on ${what}: ${seller} keeps it.`;
}

/** A board's price range, lo to hi, grown by a margin at both ends once a value lies past either edge. Shared with the goods auction's board. */
export function boardRange(lo: number, hi: number, values: number[]): { lo: number; hi: number } {
  const top = Math.max(hi, ...values);
  const bottom = Math.min(lo, ...values);
  const pad = (top - bottom) * 0.08;
  return {
    lo: Math.max(0, Math.floor(top > hi || bottom < lo ? bottom - pad : bottom)),
    hi: Math.ceil(top > hi ? top + pad : top),
  };
}
