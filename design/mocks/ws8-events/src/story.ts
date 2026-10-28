import type { EventKey } from './catalogue';

/**
 * Each event's own story: how long it plays, where the camera goes, and when its changes land. Display timing, not
 * balance. Seconds are at the TV's pace; a phone alone plays them at SOLO_PACE. The scenes themselves are stories.tsx.
 */
export interface StoryTime {
  /** How long the story plays, before the settle. */
  length: number;
  /** Where the camera flies in: the store, the event's origin (a plot), or a point between tiles. None: the whole map. */
  focus?: 'store' | 'origin' | { x: number; y: number };
  /** How close it comes, as a scale of the map. */
  zoom?: number;
  /** Seconds into the play when its first change lands, and between one change and the next. */
  lands: number;
  step?: number;
  /** Seconds into the play when the camera pulls back and the card of what was lost comes up. */
  reveal?: number;
  /** Seconds into the play when the screen shakes (a riot smashing the stadium). */
  jolt?: number;
}

export const STORY: Partial<Record<EventKey, StoryTime>> = {
  // The ship comes in, lands, the crates go aboard (one player's Crystite at a time), it lifts off and goes.
  pirateRaid: { length: 7.6, focus: 'store', zoom: 1.8, lands: 3.3, step: 0.6, reveal: 6.2 },
  // The store catches and burns with everything it holds, shelf by shelf and the MULEs; the fire dies to smoke; then
  // what was lost.
  storeFire: { length: 6.4, focus: 'store', zoom: 1.8, lands: 1.7, step: 0.4, reveal: 5.2 },
  // An angry mob gathers in the west, marches on the store and loots it, smashes the stadium, and scatters.
  riot: { length: 7, focus: { x: 6, y: 5 }, zoom: 1.35, lands: 3.4, step: 0.5, reveal: 5.8, jolt: 4.5 },

  // The Federation's cruiser over the colony: a tenth of each player's credits flies from their land to the fund.
  federationTax: { length: 5, lands: 2.2, step: 0.35, reveal: 4.2 },
  // The cruiser drops a pod on each of the two poorest players' land; it bursts into credits.
  federationGrant: { length: 5, lands: 2.8, step: 0.3, reveal: 4.2 },
  // A shuttle lands at the store and new colonists file out to their homes; or they file in and it leaves.
  immigrationWave: { length: 6, focus: 'store', zoom: 1.7, lands: 4.2, reveal: 4.9 },
  emigrationWave: { length: 6, focus: 'store', zoom: 1.7, lands: 4.6, reveal: 5 },
  // Bunting over the store, colonists dancing, fireworks; the mood climbs.
  festival: { length: 5.6, focus: 'store', zoom: 1.6, lands: 2.6, step: 0.5, reveal: 4.6 },
  // Placards go up on every plot of the good, and the strikers march on the store.
  generalStrike: { length: 5, lands: 0.8, step: 0.3, reveal: 4.2 },
  // A pink haze from the store; everyone without Medicine sneezes and is sick; Medicine shields the rest.
  epidemic: { length: 4.6, focus: 'store', zoom: 1.9, lands: 1.8, step: 0.45, reveal: 3.9 },
  // The store's staff picket it, and the corral gate slams shut on the MULEs.
  storeStrike: { length: 4.6, focus: 'store', zoom: 1.9, lands: 2.6, reveal: 3.7 },
  // Smog over the colony; volunteers sweep out from the store and clear it; the air gauge drops.
  volunteerCleanup: { length: 5.2, lands: 3.6, reveal: 4.3 },

  // Spotlights: the camera goes to the plot.
  colonyPlot: { length: 3.8, focus: 'origin', zoom: 2, lands: 1.7, reveal: 3 },
  muleTheft: { length: 4.2, focus: 'origin', zoom: 2, lands: 2.2, reveal: 3.4 },
  bumperHarvest: { length: 3.2, focus: 'origin', zoom: 2, lands: 1.4, reveal: 2.5 },
  cavernCollapse: { length: 3.6, focus: 'origin', zoom: 2, lands: 1.9, reveal: 2.9, jolt: 1.7 },
  walkout: { length: 4.2, focus: { x: 9.5, y: 2.5 }, zoom: 1.8, lands: 2.4, step: 0.25, reveal: 3.4 },
  loyalCrew: { length: 3.2, focus: 'origin', zoom: 2, lands: 1.6, reveal: 2.5 },
};
