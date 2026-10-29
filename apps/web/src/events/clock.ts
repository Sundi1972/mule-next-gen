import type { EventShowView, MuleView } from '@mule/protocol';
import type { ShowEventView } from '@mule/ui';

/**
 * When the current phase's events play over its screen (C10), read from the view: the overlays' one clock. Production
 * is never theirs: its map plays its own show (C5), so the overlay stays out of it.
 */

/** The show as the server times it. `endsAt` is the lead's ruling on AM-13 (startsAt + showMs × the table's phaseScale). */
type ShowTiming = EventShowView & { endsAt?: number };

export interface OverlayShow {
  /** The phase's events as the show draws them, in fired order. */
  events: ShowEventView[];
  introMs: number;
  /** Show seconds at full pace, from the intro's start: the clock the script runs on. */
  t: number;
  /** Where the show ends on that clock: the server's showMs. */
  end: number;
  /** The server holds the phase's clocks for the show: the overlay covers its screen. */
  held: boolean;
}

/**
 * The phase's show at `now` (server epoch ms), or null when nothing plays over the screen: no events, production,
 * a finished game, or the server clock outside [startsAt, endsAt). The server's clock runs at the table's pace, the
 * show's at full pace: t = (now − startsAt) × showMs / (endsAt − startsAt).
 */
export function overlayShowAt(view: MuleView, now: number): OverlayShow | null {
  const show = view.eventShow as ShowTiming | null | undefined;
  const events = (view.events ?? []) as ShowEventView[];
  if (!show || events.length === 0 || view.finished || view.phase === 'production' || !(show.showMs > 0)) return null;
  // Until the server sends endsAt, the show runs at full pace on the server's clock.
  const endsAt = show.endsAt ?? show.startsAt + show.showMs;
  if (!(endsAt > show.startsAt) || now < show.startsAt || now >= endsAt) return null;
  return { events, introMs: show.introMs, t: ((now - show.startsAt) * show.showMs) / (endsAt - show.startsAt) / 1000, end: show.showMs / 1000, held: show.held };
}
