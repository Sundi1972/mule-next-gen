import type { EventEffect, EventKey } from '@mule/engine';
import type { Good, Slot, SpecialKind } from '../components/tokens';

/** The colony's mood events C26's second engine PR adds (the protocol's ColonyEventKey); harmless once EventKey takes them. */
export type ColonyEventKey = 'storeStrike' | 'walkout' | 'loyalCrew' | 'riot' | 'volunteerCleanup';

/** The events the show draws: the engine's, C26's still to come, and development's sick players. */
export type ShowEventKey =
  | EventKey
  | ColonyEventKey
  // Not an EventKey: development's sick players, each sent as a bulletin (C11; the protocol's EventView widens to match).
  | 'sickness';

/** The engine's phases (packages/engine/src/types.ts Phase), so the protocol's views fit without a cast. */
export type ShowPhase = 'planning' | 'landGrant' | 'landAuction' | 'development' | 'production' | 'auction' | 'upkeep' | 'gameOver';

/**
 * How loud an event is on the TV. A headline takes the screen for a moment; a spotlight singles out a place on the
 * map (a player's land, one plot); bulletins never interrupt.
 */
export type ShowWeight = 'headline' | 'spotlight' | 'bulletin';

/**
 * One event as the server sends it (the protocol's EventView, structurally: @mule/ui does not import the
 * protocol). `playMs` is how long its segment of the show lasts; the show never computes a length of its own.
 */
export interface ShowEventView {
  key: ShowEventKey;
  kind: string;
  title: string;
  line: string;
  sign: 'good' | 'bad' | 'mixed';
  scope: 'colony' | 'local' | 'personal';
  origin: { x: number; y: number };
  from?: 'n' | 'e' | 's' | 'w';
  hits: {
    x: number;
    y: number;
    order: number;
    delta: number;
    /** The special field the plot had until this hit: the map keeps its badge until the hit lands. */
    was?: SpecialKind;
    /** What the plot is after this hit, when the hit changes what it is. */
    becomes?: 'plain' | 'crater' | 'idle';
    /** True when the hit destroyed or took the plot's MULE. */
    muleLost?: true;
    /** With muleLost: the good that MULE made; the map draws it on the plot until the hit lands. */
    good?: Good;
  }[];
  /** What it changed off the map, in the order it changed it: a player's (by id), the store's or the colony's. */
  effects?: ShowEffect[];
  phase: ShowPhase;
  weight: ShowWeight;
  playMs: number;
  /** Whose event it is, when it is one player's and on no plot: a sick player (C11). */
  player?: string;
  /** The colony's objects it damaged (a riot), by ObjectKind (types.ts stays free of .tsx imports). */
  objects?: { id: 'park' | 'hospital' | 'observatory' | 'stadium' | 'spaceport'; becomes: 'damaged' }[];
  /**
   * A sabotage order's effect (slice 4, the protocol's EventView.sabotage): the order's opaque id, its culprit only when
   * public (else null: the show names nobody), whether it worked, and whether a guard stood on the plot.
   */
  sabotage?: { order: string; culprit: string | null; worked: boolean; guarded: boolean };
  /**
   * A market rumour's good and which way it moves the price (the approved mock's fixture shape). The protocol's EventView
   * does not carry them yet: without them the whisper draws no good and no price tag.
   */
  good?: Good;
  dir?: 'up' | 'down';
}

/** One change an event made off the map: whose (a player's id, 'store' or 'colony'), of what, by how much. */
export type ShowEffect = EventEffect;

export type ShowHit = ShowEventView['hits'][number];

/** A phase's show as the server sends it: its events in fired order, and how long the intro before them plays, in ms. */
export interface ShowTimeline {
  events: ShowEventView[];
  introMs: number;
}

/** A seat at the table, for the words and the spotlight: who owns which plot comes from the map's tiles. */
export interface ShowPlayer {
  id: string;
  name: string;
  slot: Slot;
}

/**
 * What a phone knows of sabotage beyond the public event (slice 4): the ids of its own orders (MyView.politics.sabotage
 * .mine), and whether its player is the Sheriff. The phone's rail uses it for that player's private line after the show.
 */
export interface EventSabotageSeat {
  mine: readonly string[];
  sheriff: boolean;
  /**
   * What a caught order costs this player's reputation, as the engine's reveal takes it: the sabotage ban's setting in
   * force (1 with no ban), and the players this player held a pact with this month (each pact breaks: pactBroken more).
   * Absent when the phone's view cannot say: its line then gives no number, never a smaller one.
   */
  reputation?: {
    ban: number;
    pacts: readonly string[];
    /** Of those, the pacts whose break the view cannot place on this catch rather than an earlier reveal this month: no number. */
    unsure?: readonly string[];
  };
}

/** 'tv' runs at the TV's pace; 'solo' is a phone with no TV in the room, its motion quicker inside the same length. */
export type ShowMode = 'tv' | 'solo';
/** How big the show is drawn: across the room, or in a hand. */
export type ShowSize = 'tv' | 'phone';
