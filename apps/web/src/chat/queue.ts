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

/**
 * When each line's bubble shows on one screen (spec RULE-9): one at a time, in order of receipt. With `phase`, only
 * lines received in that phase get one: a phase change ends every bubble and drops the queue.
 */
export function bubbleSchedule<T extends { at: number; phase?: number }>(lines: readonly T[], phase?: number): Scheduled<T>[] {
  const out: Scheduled<T>[] = [];
  let free = -Infinity;
  for (const line of lines) {
    if (phase !== undefined && line.phase !== phase) continue;
    const from = Math.max(line.at, free);
    if (from - line.at > BUBBLE_MAX_WAIT_MS) continue;
    const prev = out.at(-1);
    if (prev && prev.to > from) prev.to = from;
    out.push({ line, from, to: from + BUBBLE_MAX_MS });
    free = from + BUBBLE_MIN_MS;
  }
  return out;
}

/** The bubble showing at `now`, if any. */
export function bubbleAt<T>(schedule: readonly Scheduled<T>[], now: number): Scheduled<T> | undefined {
  return schedule.find((b) => b.from <= now && now < b.to);
}
