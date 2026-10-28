import type { Good, Outfit, Phase, Player } from './types.js';

/**
 * A seat's playbook: the plan the AI plays a phase by, in real time, without a model call. The engine always drafts a
 * complete, legal one; Claude may send edits to it, each with a reason, and a validator clamps every edit to bounds the
 * rules allow (an edit it refuses keeps the draft's value and is listed in `rejected`). The final playbook goes into
 * the game record, so a replay plays it without a call.
 *
 * Money is in whole credits; durations are milliseconds and end in `Ms`; a rate names its unit. Paths in `edits`,
 * `rejected` and `PhaseOutcome.items` are JSON Pointers into the playbook, e.g. `/auction/food/walkAway`.
 */

export type PlayerId = Player['id'];
/** A plot's index in `GameState.tiles`, `grid.ts::tileIndex`; the phone's intents carry {x, y} instead. */
export type PlotIndex = number;
/** The timed phases a playbook plays. */
export type PlayPhase = Extract<Phase, 'landGrant' | 'landAuction' | 'development' | 'auction'>;

/** The seat's game plan: what it plays for and how it reads the other players. */
export interface Strategy {
  kind: 'builder' | 'specialist' | 'monopolist' | 'landBaron' | 'politician' | 'spoiler';
  /** The good it outfits for profit; null when it has none. */
  moneyMaker: Good | null;
  /** The good it tries to corner; null when it tries none. */
  monopolyTarget: Good | null;
  /** Credits it keeps in hand; buying the Food and Energy it must have may go below it. */
  cashFloor: number;
  /** How many plots it aims to own, and by which month. */
  landTarget: { plots: number; byMonth: number };
  stances: Record<PlayerId, 'ally' | 'neutral' | 'rival' | 'target'>;
  /** Why, in character, at most 140 characters. */
  reason: string;
}

/** What the seat does in planning, before the land grant. */
export interface PlanningPlay {
  /** Plots to fly a geo drone over, in order. */
  drone?: PlotIndex[];
  /** Plots, or the MULE on one, to put up in the land auction, as the phone's `list` intent does. */
  list?: { item: 'plot' | 'mule'; plot: PlotIndex; minimum: number; unsold: 'store' | 'keep' }[];
}

/** How the seat claims in the land grant. Each value is in credits, net of walking, over the months left. */
export interface LandGrantPlay {
  ranked: { plot: PlotIndex; value: number }[];
  /**
   * The least share of the best free plot's value a lit plot must reach to be claimed, read against how far the
   * pass has gone (the lit step over the pass's length): it falls from `start` to `end`, with 0 ≤ end ≤ start ≤ 1,
   * so a seat that loses its best plots still claims.
   */
  pressShare: { start: number; end: number };
  /** Plots to take before a rival does, up to a cost. */
  deny: { plot: PlotIndex; rival: PlayerId; maxCost: number }[];
  /** Plots to claim when the ranked ones are gone. */
  planB: PlotIndex[];
  claims: 0 | 1 | 2;
  /** Two plots it wants together. */
  pair?: [PlotIndex, PlotIndex];
}

/** The seat's moves in development, in order. */
export interface DevelopmentPlay {
  route: { act: 'buyMule' | 'outfit' | 'install' | 'analyse' | 'filter' | 'pub'; plot?: PlotIndex; outfit?: Outfit }[];
  /** The time it plans to spend on the route. */
  timeBudgetMs: number;
  /** What it does when the corral has no MULE left. */
  ifSoldOut: 'pub' | 'analyse' | 'stop';
}

/** How the seat trades one good in the auction. Prices are credits a unit. */
export interface GoodPlay {
  role: 'buyer' | 'seller' | 'out';
  /** Units it holds at the end: a seller keeps them, a buyer buys up to them. */
  hold: number;
  /** The worst price it accepts: a buyer's highest, a seller's lowest. */
  walkAway: number;
  /** The price it walks to first, before it moves toward `walkAway`. */
  start: number;
  /** How fast it moves toward `walkAway`, in credits a second of the auction clock. */
  concedeCrPerS: number;
  /** Declares a side it doesn't mean to trade. */
  bluff: boolean;
  /** How it meets a rival on its side of the board. */
  vsRival: 'hold' | 'undercut1' | 'yield';
  /** `vsRival` for named rivals. */
  per?: Partial<Record<PlayerId, 'hold' | 'undercut1' | 'yield'>>;
  market?: {
    /** Buy the store's line in the auction, up to these units, at most this price. */
    buyOutStore?: { upTo: number; maxPrice: number };
    /** Units to have in stock for the export ship's month. */
    forShip?: { units: number; month: number };
  };
}

export interface Playbook {
  v: 1;
  seat: PlayerId;
  month: number;
  phase: PlayPhase | 'planning' | 'month';
  strategy: Strategy;
  planning?: PlanningPlay;
  landGrant?: LandGrantPlay;
  development?: DevelopmentPlay;
  auction?: Partial<Record<Good, GoodPlay>>;
  /** Reserved for buying from the store outside the auction. */
  store?: never;
  /** Claude's notes on each rival; nothing plays from free text. */
  rivalReads?: Record<PlayerId, string[]>;
  /** Claude's notes for later months; nothing plays from free text. */
  lessons?: string[];
  /** Who wrote it: the engine's draft, or the draft with Claude's edits. */
  by: 'engine' | 'llm';
  edits?: { path: string; from: unknown; to: unknown; reason: string }[];
  rejected?: { path: string; to: unknown; why: string }[];
}

/**
 * How a phase went against the seat's playbook, from public facts only: each planned value beside what happened,
 * and what each rival did that a table could see.
 */
export interface PhaseOutcome {
  seat: PlayerId;
  month: number;
  phase: PlayPhase;
  items: { path: string; expected: unknown; actual: unknown; note?: string }[];
  rivals: Record<
    PlayerId,
    {
      claimed?: PlotIndex[];
      traded?: { good: Good; side: 'buyer' | 'seller'; price: number; qty: number }[];
      /** Goods it declared a side for and traded none of. */
      declaredButIdle?: Good[];
    }
  >;
}
