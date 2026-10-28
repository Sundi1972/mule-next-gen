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
  pirateRaid: { length: 7.2, focus: 'store', zoom: 1.8, lands: 3.05, step: 0.55, reveal: 5.9 },
  // The store catches, burns with its stock, and the fire dies to smoke; then what was lost.
  storeFire: { length: 5.8, focus: 'store', zoom: 1.8, lands: 3.2, step: 0.5, reveal: 4.6 },
  // An angry mob gathers in the west, marches on the store and loots it, smashes the stadium, and scatters.
  riot: { length: 7, focus: { x: 6, y: 5 }, zoom: 1.35, lands: 3.4, step: 0.5, reveal: 5.8, jolt: 4.5 },
};
