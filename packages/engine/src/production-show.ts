import { PRODUCTION_SHOW } from './config.js';

/**
 * The production show's timeline in Heiko's order C (ws6-ux spec AM-19, RULE-3): good by good for every player at
 * once, then every bonus at once, then every loss at once, then the month's events, then the goods fly into the
 * silos. Pure: the server sets production's length from it, and the screens play the same times.
 */
export interface ProductionShowTimes {
  /** When each good's turn starts, in PRODUCTION_SHOW.order among the goods made. */
  goodAtMs: number[];
  bonusAtMs: number;
  lossAtMs: number;
  /** When the month's events start, or null in a quiet month. */
  eventsAtMs: number | null;
  flightAtMs: number;
  /** When plot i of n takes off for its silo, i in harvest order. */
  flyAtMs: (i: number, n: number) => number;
  /** When the silos stand full. */
  holdAtMs: number;
  endMs: number;
}

/** The show for a month with `goodsMade` distinct goods and `eventsMs` of events (0: a quiet month). */
export function productionShow(goodsMade: number, eventsMs: number): ProductionShowTimes {
  const S = PRODUCTION_SHOW;
  const goodAtMs = Array.from({ length: goodsMade }, (_, g) => S.introMs + g * S.goodBeatMs);
  const bonusAtMs = S.introMs + goodsMade * S.goodBeatMs + S.gapMs;
  const lossAtMs = bonusAtMs + S.allAtOnceMs;
  const lossEndMs = lossAtMs + S.allAtOnceMs;
  const eventsAtMs = eventsMs > 0 ? lossEndMs + S.gapMs : null;
  const flightAtMs = (eventsAtMs !== null ? eventsAtMs + eventsMs : lossEndMs) + S.gapMs;
  const holdAtMs = flightAtMs + S.flightsMs + S.flightMs;
  return {
    goodAtMs,
    bonusAtMs,
    lossAtMs,
    eventsAtMs,
    flightAtMs,
    flyAtMs: (i, n) => (n <= 1 ? flightAtMs : flightAtMs + S.flightsMs * Math.pow(i / (n - 1), S.flightEase)),
    holdAtMs,
    endMs: holdAtMs + S.holdMs,
  };
}

/** Production's length, in ms at full pace: the show's end. */
export const productionShowMs = (goodsMade: number, eventsMs: number): number => productionShow(goodsMade, eventsMs).endMs;

/** When the month's events start in production, in ms from the phase's start. */
export const productionEventAtMs = (goodsMade: number): number => productionShow(goodsMade, 1).eventsAtMs!;
