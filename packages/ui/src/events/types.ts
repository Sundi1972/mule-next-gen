import type { Good, Slot, SpecialKind } from '../components/tokens';

/** The events the show draws: the engine's EventKey union (packages/engine/src/types.ts). */
export type ShowEventKey =
  | 'dustStorm'
  | 'drought'
  | 'acidRain'
  | 'solarFlare'
  | 'cometPass'
  | 'flood'
  | 'volcanicAsh'
  | 'pestSwarm'
  | 'wildfire'
  | 'bumperHarvest'
  | 'cavernCollapse'
  | 'federationTax'
  | 'federationGrant'
  | 'immigrationWave'
  | 'inheritance'
  | 'muleTheft'
  | 'epidemic'
  | 'coldSnap'
  | 'meteorStrike'
  | 'pirateRaid'
  | 'storeFire'
  | 'ratsInSilo'
  | 'crookedAccountant'
  | 'packageFromHome'
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
  }[];
  /** What it changed off the map, in the order it changed it: a player's (by id), the store's or the colony's. */
  effects?: ShowEffect[];
  phase: ShowPhase;
  weight: ShowWeight;
  playMs: number;
  /** Whose event it is, when it is one player's and on no plot: a sick player (C11). */
  player?: string;
}

/** One change an event made off the map (the protocol's EventEffect, structurally): whose, of what, by how much. */
export interface ShowEffect {
  /** A player's id, 'store' or 'colony'. */
  on: string;
  what: Good | 'money' | 'mules' | 'colonists' | 'energyNeed';
  delta: number;
}

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

/** 'tv' runs at the TV's pace; 'solo' is a phone with no TV in the room, its motion quicker inside the same length. */
export type ShowMode = 'tv' | 'solo';
/** How big the show is drawn: across the room, or in a hand. */
export type ShowSize = 'tv' | 'phone';
