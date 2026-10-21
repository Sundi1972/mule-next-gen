/** Shows a bubble at most this long. */
export const BUBBLE_MAX_MS = 4_500;
/** A bubble shows at least this long before the next line's bubble takes over. */
export const BUBBLE_MIN_MS = 2_000;
/** A line that would wait longer than this for its bubble gets none: the ticker carries it. */
export const BUBBLE_MAX_WAIT_MS = 4_000;

export interface Scheduled<T> {
  line: T;
  from: number;
  to: number;
}

/** When each line's bubble shows on one screen (spec RULE-9). */
export function bubbleSchedule<T extends { at: number }>(lines: readonly T[], phaseFrom = -Infinity): Scheduled<T>[] {
  void lines;
  void phaseFrom;
  throw new Error('NotImplemented: bubble-schedule');
}
