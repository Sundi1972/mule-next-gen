import type { Slot } from '../components/tokens';

/** The wave-1 events: the engine's EventKey union (packages/engine/src/types.ts), every one fired in production. */
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
  | 'bumperHarvest';

/** The engine's phases (packages/engine/src/types.ts Phase), so the protocol's views fit without a cast. */
export type ShowPhase = 'planning' | 'landGrant' | 'landAuction' | 'development' | 'production' | 'auction' | 'upkeep' | 'gameOver';

/**
 * How loud an event is on the TV. A headline takes the screen for a moment; a spotlight singles out a place on the
 * map (a player's land, one plot); bulletins never interrupt.
 */
export type ShowWeight = 'headline' | 'spotlight' | 'bulletin';

/**
 * One event as the server sends it (the protocol's ProductionEventView, structurally: @mule/ui does not import the
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
  hits: { x: number; y: number; order: number; delta: number }[];
  phase: ShowPhase;
  weight: ShowWeight;
  playMs: number;
}

export type ShowHit = ShowEventView['hits'][number];

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
