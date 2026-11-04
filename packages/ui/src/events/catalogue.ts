import type { ShowEventKey } from './types';

/**
 * The events of the M.U.L.E. Event Catalogue as the show draws them: how each one moves, and what it looks like in
 * words. Display data only; the rules are the engine's.
 */

/**
 * The motion family a show draws. Several events share one; the event only says which, and where.
 */
export type EventMotion =
  | 'sweep' // a front crosses the map from an edge, plot by plot (dust, drought, acid rain, flare, comet)
  | 'spread' // from one plot to the plots joined to it (pests, fire)
  | 'source' // out from a map feature (the river's flood, the volcano's ash)
  | 'strike' // from the sky onto one tile (meteor)
  | 'plot' // on one plot, no travel (bumper harvest, cavern collapse, MULE theft)
  | 'colonists' // on the colonists at the store (sickness, epidemic)
  | 'store' // at the store (store fire)
  | 'ledger' // money or goods moving between the players, the colony fund and the store (taxes, grants, rats...)
  | 'colony'; // a colony gauge moves: its colonists (immigration)

export interface EventEntry {
  key: ShowEventKey;
  motion: EventMotion;
  /** How it moves, in words. */
  look: string;
}

/**
 * Keyed by ShowEventKey, each entry carrying its own key: a mislabelled entry is a compile error. A key with no entry
 * moves as 'plot' (motionOf): no travel, the generic card.
 */
export const EVENT_ENTRY = {
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
  cavernCollapse: { key: 'cavernCollapse', motion: 'plot', look: 'The cavern badge cracks and sinks; dust puffs up and the plot is plain.' },
  sickness: { key: 'sickness', motion: 'colonists', look: 'The sick tag pops onto the colonist and their slot; one roll call names everyone sick.' },
  // Wave 2, the gallery's rows (design/mocks/ws8-events src/catalogue.ts).
  federationTax: { key: 'federationTax', motion: 'ledger', look: 'A Federation seal stamps the colony bar; a tenth of every player’s credits lifts off their slot into the colony fund.' },
  federationGrant: { key: 'federationGrant', motion: 'ledger', look: 'Credits drop from the Federation seal into the two poorest players’ slots.' },
  immigrationWave: { key: 'immigrationWave', motion: 'colony', look: 'A shuttle sets down at the store and colonists file out; the colony’s head count ticks up.' },
  inheritance: { key: 'inheritance', motion: 'ledger', look: 'A sealed letter drops into the player’s slot and opens into credits.' },
  muleTheft: { key: 'muleTheft', motion: 'plot', look: 'A shadow crosses one plot and its MULE is gone; the plot greys to idle.' },
  epidemic: { key: 'epidemic', motion: 'colonists', look: 'A pink haze rolls out from the store over the colonists; the sick tag lands on everyone without Medicine, marked “2 turns”.' },
  coldSnap: { key: 'coldSnap', motion: 'sweep', look: 'Frost creeps in from the north over every plot; plots left short of Energy dim and lose output.' },
  meteorStrike: { key: 'meteorStrike', motion: 'strike', look: 'A fireball falls onto one tile; the screen shakes, the MULE is lost, and a crater is left.' },
  pirateRaid: { key: 'pirateRaid', motion: 'ledger', look: 'A pirate ship lands at the store; the store’s Crystite and every player’s goes up its ramp in crates, and it lifts off.' },
  storeFire: { key: 'storeFire', motion: 'store', look: 'The store goes up in flames; shelf after shelf burns to 0, then the MULE corral, and the prices jump.' },
  ratsInSilo: { key: 'ratsInSilo', motion: 'ledger', look: 'Rats scurry across the player’s slot; half the Food chip goes.' },
  crookedAccountant: { key: 'crookedAccountant', motion: 'ledger', look: 'The ledger snaps shut and a tenth of the player’s credits slips away.' },
  packageFromHome: { key: 'packageFromHome', motion: 'ledger', look: 'A parcel drops into the player’s slot and opens: +3 Food.' },
} satisfies { [K in ShowEventKey]?: EventEntry & { key: K } };

/** How an event moves: its entry's motion, or 'plot' (no travel) for a key with no entry yet. */
export const motionOf = (key: ShowEventKey): EventMotion => (EVENT_ENTRY as { [K in ShowEventKey]?: EventEntry })[key]?.motion ?? 'plot';

/** Whether an event's change is off the map (money, held goods, the store, the colony's gauges): its card says it. */
export const offMap = (key: ShowEventKey) => ['ledger', 'colony', 'store'].includes(motionOf(key));

/**
 * Each event's own story: where the camera goes and when its change lands. Seconds are proportions of the gallery's
 * play at the TV's pace; the segment's real length is always the server's (playMs).
 */
export interface StoryTime {
  /** How long the story plays, before the settle. */
  length: number;
  /** Where the camera flies in: the event's origin (a plot) or the store. None: the whole map. */
  focus?: 'origin' | 'store';
  /** How close it comes, as a scale of the map. */
  zoom?: number;
  /** Seconds into the play when its first change lands, and between one change and the next. */
  lands: number;
  step?: number;
  /** Seconds into the play when the camera pulls back and the card of what changed comes up. */
  reveal?: number;
  /** Seconds into the play when the ground jolts: the camera shakes for a moment. */
  jolt?: number;
}

export const STORY: Partial<Record<ShowEventKey, StoryTime>> = {
  // The ship comes in, lands, the crates go aboard (one holder's Crystite at a time), it lifts off and goes.
  pirateRaid: { length: 7.6, focus: 'store', zoom: 1.8, lands: 3.3, step: 0.6, reveal: 6.2 },
  // The store catches and burns with everything it holds, shelf by shelf and the MULEs; the fire dies to smoke; then
  // what was lost.
  storeFire: { length: 6.4, focus: 'store', zoom: 1.8, lands: 1.7, step: 0.4, reveal: 5.2 },
  // The Federation's cruiser over the colony: a tenth of each player's credits flies from their land to the fund.
  federationTax: { length: 5, lands: 2.2, step: 0.35, reveal: 4.2 },
  // The cruiser drops a pod on each of the two poorest players' land; it bursts into credits.
  federationGrant: { length: 5, lands: 2.8, step: 0.3, reveal: 4.2 },
  // A shuttle lands at the store and new colonists file out to their homes.
  immigrationWave: { length: 6, focus: 'store', zoom: 1.7, lands: 4.2, reveal: 4.9 },
  // A pink haze from the store; everyone without Medicine sneezes and is sick; Medicine shields the rest.
  epidemic: { length: 4.6, focus: 'store', zoom: 1.9, lands: 1.8, step: 0.45, reveal: 3.9 },

  // Spotlight: the camera goes to the plot.
  muleTheft: { length: 4.2, focus: 'origin', zoom: 2, lands: 2.2, reveal: 3.4 },
  bumperHarvest: { length: 3.2, focus: 'origin', zoom: 2, lands: 1.4, reveal: 2.5 },
  cavernCollapse: { length: 3.6, focus: 'origin', zoom: 2, lands: 1.9, reveal: 2.9, jolt: 1.7 },
};
