import type { ShowEventKey } from './types';

/**
 * The wave-1 events of Heiko's catalogue (the "M.U.L.E. Event Catalogue" Claude Doc, 28 Oct 2026), as the show draws
 * them: how each one moves, and what it looks like in words. Display data only; the rules are the engine's.
 */

/**
 * The motion family a show draws. Several events share one; the event only says which, and where.
 */
export type EventMotion =
  | 'sweep' // a front crosses the map from an edge, plot by plot (dust, drought, acid rain, flare, comet)
  | 'spread' // from one plot to the plots joined to it (pests, fire)
  | 'source' // out from a map feature (the river's flood, the volcano's ash)
  | 'plot'; // on one plot, no travel (bumper harvest)

export interface EventEntry {
  key: ShowEventKey;
  motion: EventMotion;
  /** How it moves, in words. */
  look: string;
}

/** Keyed by every ShowEventKey, so an event the show does not know is a compile error, never a missing entry. */
export const EVENT_ENTRY: Record<ShowEventKey, EventEntry> = {
  dustStorm: { key: 'dustStorm', motion: 'sweep', look: 'A wall of dust blows in from one edge and takes half of each Energy plot as it passes.' },
  drought: { key: 'drought', motion: 'sweep', look: 'Heat shimmer crosses the map; the ground cracks under each Food and Water plot.' },
  acidRain: { key: 'acidRain', motion: 'sweep', look: 'A sickly green rain front crosses the map; Energy and Food plots hiss as it passes.' },
  solarFlare: { key: 'solarFlare', motion: 'sweep', look: 'A golden wash crosses the map from the sun’s side; each Energy plot flares as it’s reached.' },
  cometPass: { key: 'cometPass', motion: 'sweep', look: 'A comet streaks across the sky; each Water plot glints as its tail passes.' },
  flood: { key: 'flood', motion: 'source', look: 'The river swells from its source and spills over the Food plots on its banks.' },
  volcanicAsh: { key: 'volcanicAsh', motion: 'source', look: 'The volcano puffs a plume; grey ash settles on the plots within 2 steps, nearest first.' },
  pestSwarm: { key: 'pestSwarm', motion: 'spread', look: 'A swarm crawls from farm to farm across the player’s joined Food plots.' },
  wildfire: { key: 'wildfire', motion: 'spread', look: 'One farm flares up and burns out; embers drift onto the farms joined to it.' },
  bumperHarvest: { key: 'bumperHarvest', motion: 'plot', look: 'One plot glows and its bars double.' },
};

export const EVENT_CATALOGUE: EventEntry[] = Object.values(EVENT_ENTRY);

/**
 * Each event's own story: where the camera goes and when its change lands. Seconds are proportions of the gallery's
 * play at the TV's pace; the segment's real length is always the server's (playMs).
 */
export interface StoryTime {
  /** How long the story plays, before the settle. */
  length: number;
  /** Where the camera flies in: the event's origin (a plot). */
  focus: 'origin';
  /** How close it comes, as a scale of the map. */
  zoom: number;
  /** Seconds into the play when its first change lands, and between one change and the next. */
  lands: number;
  step?: number;
  /** Seconds into the play when the camera pulls back. */
  reveal: number;
}

export const STORY: Partial<Record<ShowEventKey, StoryTime>> = {
  // Spotlight: the camera goes to the plot.
  bumperHarvest: { length: 3.2, focus: 'origin', zoom: 2, lands: 1.4, reveal: 2.5 },
};
