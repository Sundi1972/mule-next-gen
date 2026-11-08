import { useRef } from 'react';

/** How long an event holds the TV as a moment before it folds, in ms of server time (WS6 ruling 8 Nov, WS4 accepted). */
export const TV_MOMENT_MS = 8_000;

/**
 * Whether an event is a moment at `now`: the TV first saw it at `firstSeen` (server ms) and TV_MOMENT_MS have not yet
 * passed. Null when the screen opened on it, which is old news; undefined when it has never been seen.
 */
export function isMoment(firstSeen: number | null | undefined, now: number, holdMs = TV_MOMENT_MS): boolean {
  return firstSeen !== null && firstSeen !== undefined && now - firstSeen < holdMs;
}

/**
 * Whether the event `key` (null: none) is a moment on this screen at server time `now`. The event the screen opens on is
 * old news; one that arrives while it is up is a moment for TV_MOMENT_MS, then folds. Keys stay remembered, and an event
 * that leaves the screen has had its moment, so one that goes and comes back is not a moment twice, even inside its time.
 */
export function useMoment(key: string | null, now: number): boolean {
  const seen = useRef<Map<string, number | null> | null>(null);
  const last = useRef<string | null>(null);
  if (seen.current === null) {
    seen.current = new Map();
    if (key !== null) seen.current.set(key, null);
  }
  if (last.current !== null && last.current !== key) seen.current.set(last.current, null);
  last.current = key;
  if (key !== null && !seen.current.has(key)) seen.current.set(key, now);
  return key !== null && isMoment(seen.current.get(key), now);
}
