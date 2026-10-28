import type { ShowEventView, ShowHit, ShowMode } from './types';

/** One event's stretch of the show, in seconds on the caller's clock. */
export interface EventSegment {
  events: ShowEventView[];
  pace: number;
  n: number;
  count: number;
  startAt: number;
  announceAt: number;
  playAt: number;
  settleAt: number;
  endAt: number;
}

export function eventSegments(_events: ShowEventView[], _start = 0, _mode: ShowMode = 'tv'): EventSegment[] {
  throw new Error('NotImplemented: eventSegments');
}

export function eventHitAt(_seg: EventSegment, _ev: ShowEventView, _h: ShowHit | null, _reduced: boolean): number {
  throw new Error('NotImplemented: eventHitAt');
}
