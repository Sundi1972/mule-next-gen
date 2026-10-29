import type { IntentNoteData } from '../../../proposed/IntentNote';

/**
 * The audit's eight proposals for the goods auction (docs/research/2026-10-28-ws6-ux-audit.md §8, G-1…G-8), as the
 * review page explains them. Re-exported from AuctionAudit.tsx as AUCTION_NOTES. Each number on a screen is the
 * proposal's: ① is G-1.
 */
export const AUCTION_NOTES = {
  G1: {
    id: 'G1',
    n: 1,
    title: 'You choose how many, and letting go stops',
    what: 'At a store’s line the walk stops, and letting go there trades nothing. The rail asks “Buy how many?”, set to what you need (2), with − and +, and the button says “Buy 2 for 60 cr”; the units then stop at that number, or at once if you touch ▲ or ▼. Selling stops at your spare: going below it asks first, “This sells Water you need next month”. Try it: − and +, Buy, then Done.',
    serves: '3 and 6',
    intent: 'Know how much I must keep, and how much I can sell · Sell to or buy from the store, and know its price',
    why: 'Once you touched the store’s line it traded on by itself after you let go, until money or goods ran out: needing 2 Food the audit bought 5 (165 → 15 cr), and with 1 spare Water it sold all 3, leaving HAVE 0 · NEED 2.',
    rule: 'To the walk, which WS3 builds. Today a house’s line trades every tick while you stand on it (packages/engine/src/walk.ts, stepBoard), so letting go at the line keeps buying. Proposed: at a house’s line nothing trades until you choose how many and tap Buy or Sell, and it stops at that number; and letting go of ▲ or ▼ always stops trading, with a house or a player.',
  },
  G2: {
    id: 'G2',
    n: 2,
    title: '“Hold” said once',
    what: 'The walk buttons say “Hold ▲ to walk up” and “Hold ▼ to walk down”, the hint says it too, and a quick tap moves one step (1 cr). Try it: tap ▲, then hold it.',
    serves: '4',
    intent: 'Set my price by walking, and see the others’ prices',
    why: 'Up and Down had to be held: a tap did nothing, and the goods auction never said “hold” (the land auction does).',
  },
  G3: {
    id: 'G3',
    n: 3,
    title: 'The hint knows the store',
    what: 'The hint under your numbers names the price to walk to and who stands there: “Walk up to the store’s line at 30: it’s the only seller” on Food, “Walk down: the store pays 8, The Accountant bids 6” on Water, and the ship’s line when it pays the most.',
    serves: '5 and 6',
    intent: 'Make a deal with another player by meeting in the middle · Sell to or buy from the store, and know its price',
    why: 'The hint always said “Walk down to meet the highest bid”: it pointed at a player’s 6 when the store paid 8, and still said it after the audit had sold all its Water (HAVE 0 · NEED 2).',
    differs: 'the audit’s buying example, “Walk up to the store’s line at 10: it sells cheapest”, is Water’s price; Water is a sale in this fixture, so the buying hint is drawn on Food, where the store at 30 is the only seller.',
  },
  G4: {
    id: 'G4',
    n: 4,
    title: 'Prices from your side',
    what: 'The store’s prices say what you can do with them: “You can buy from the store at 30 · sell to it at 24”, over the board on the walk and under the table on the status screen. Under it, the phone explains the lines too: red is what sellers ask, green what buyers bid (amber the ship), and what you do: “Walk your bid up to a red line and you buy.”',
    serves: '6',
    intent: 'Sell to or buy from the store, and know its price',
    why: '“STORE SELLS 30 · STORE BUYS 24” is the store’s side, so “sells” meant “you can buy”; and only the TV explained the two lines (“Sellers push the red line down, buyers push the green line up”).',
    differs: 'the phone rail’s LOWEST ASK · HIGHEST BID readout gives way to the hint (G-3), which names the line to walk to; the readout counted players only, so on Food it read “LOWEST ASK —” while the store sold at 30. The TV keeps its readout (now counting the store and the ship, #ship) and the store’s side, “STORE SELLS 30”: it has no “you”.',
  },
  G5: {
    id: 'G5',
    n: 5,
    title: 'A receipt for each good',
    what: 'When a good closes, a receipt over the board: “Food: you bought 2 for 60 cr”, and for a sale the tax spelled out, “8 cr, less 10% sales tax: 7”. Under your money in the header, the month’s running total from the auction.',
    serves: '8',
    intent: 'See how much money I made or spent',
    why: 'A line flashed “The store → You · 1 unit”; there was no total per good and none at the end, and a sale paid 7 instead of 8 with no word about the 10% sales tax.',
    differs: 'the audit’s example, “you bought 5 for 150 cr”, is the runaway trade G-1 removes; here she buys the 2 she needs.',
    open: 'the receipt needs a moment on screen: a short close stage after each good (new, WS3; the land auction has one, 2.5 s), or the receipt carried onto the next good’s status screen (no new stage, but it competes with the next decision). The mock draws the close stage.',
  },
  G6: {
    id: 'G6',
    n: 6,
    title: 'The ship on the board',
    what: 'While the export ship is in port, every status screen says what it wants (“The ship wants 24 Crystite this month”), and on Crystite’s walk its line carries words, “The ship buys Crystite at 120”, on the phone and the TV. The phone’s hint and the TV’s readout count it as the best buyer.',
    serves: '7',
    intent: 'Know what the off-world ship wants',
    why: 'The auction never said what the ship wants; only the Colony desk did, in codes (“wants CRY 24 ALY 12 ORE 12”).',
  },
  G7: {
    id: 'G7',
    n: 7,
    title: 'Time to choose',
    what: 'The side-pick has no clock: it waits until everyone has picked (“2 / 3 PICKED” where the time bar was, “Waiting for Kai to pick”), and the host can move on for someone who is away, who then sits that good’s walk out. Your side still starts where your numbers point; Ready, today’s button under Buy and Sell, is the pick, and once pressed it gives way to who is still picking. Try it: Move on for Kai.',
    serves: '1 and 2',
    intent: 'Know which good is up · Decide whether I’m buying, selling or sitting it out',
    why: 'At real speed the side-pick lasted 8 s and each good’s walk 20 s, so goods passed while a newcomer looked away.',
    rule: 'Untimed, like planning and the election: Heiko’s call. WS3 builds it; the walk itself keeps its 20 s clock.',
  },
  G8: {
    id: 'G8',
    n: 8,
    title: 'Plain words',
    what: 'The status table says “Goes bad” for SPOILS and “Spare” for SURPLUS, and “short 2” for “−2 short”, on the phone, the laptop and the TV.',
    serves: '3 (cross-cutting)',
    intent: 'Know how much I must keep, and how much I can sell',
    why: '“SPOILS” and “SURPLUS” are words a 14-year-old doesn’t use.',
  },
} satisfies Record<string, IntentNoteData>;

export type AuctionNoteId = keyof typeof AUCTION_NOTES;
