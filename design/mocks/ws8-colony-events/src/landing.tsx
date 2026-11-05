import { cx } from '@mule/ui';
import { EventDeltaChip } from '../../../../packages/ui/src/events/glyphs';
import { useLayoutEffect, useState, type RefObject } from 'react';
import { ramp } from '../../../../packages/ui/src/events/fx';
import { c26Words, type C26Effect } from './fixture';

/**
 * The gauge landing (C26, graft target C34's ColonyGauges): a change to one of the colony's gauges leaves the event's
 * card as a chip, flies across the screen and lands on its gauge in the header, whose number then counts to its new
 * value. DS-GAP: the show has no cross-screen flight; ProductionMap's goods fly to `data-fly-target` the same way, and
 * this measures the same way (screen pixels back into the frame's own).
 */

export const FLIGHT = 0.9;
/** How long a gauge's number takes to count once its chip lands. */
export const COUNT = 0.8;

/** One flight: the effect, the card chip it leaves from, the gauge it lands on, and when it leaves. */
export interface Flight {
  f: C26Effect;
  from: string;
  to: string;
  leaves: number;
}

type Box = { x: number; y: number };

/** The middle of every element named, in the frame's own pixels from its top-left. */
function useCentres(root: RefObject<HTMLElement>, ids: string[], when: boolean): Record<string, Box> {
  const [at, setAt] = useState<Record<string, Box>>({});
  useLayoutEffect(() => {
    if (!when || !root.current) return;
    const r = root.current.getBoundingClientRect();
    const scale = r.width / root.current.offsetWidth || 1;
    const next: Record<string, Box> = {};
    for (const id of ids) {
      const el = root.current.querySelector(`[data-testid="${id}"]`);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      next[id] = { x: (b.left + b.width / 2 - r.left) / scale, y: (b.top + b.height / 2 - r.top) / scale };
    }
    if (JSON.stringify(next) !== JSON.stringify(at)) setAt(next);
  });
  return at;
}

/** The chips in flight, over the whole frame. With reduced motion nothing travels: the chip shows on its gauge as it lands. */
export function GaugeFlights({ root, flights, t, reduced, size = 'tv' }: { root: RefObject<HTMLElement>; flights: Flight[]; t: number; reduced: boolean; size?: 'tv' | 'phone' }) {
  const ids = flights.flatMap((l) => [l.from, l.to]);
  const live = flights.some((l) => t >= l.leaves - 0.3 && t < l.leaves + FLIGHT + COUNT + 0.6);
  const at = useCentres(root, ids, live);
  return (
    <div className="pointer-events-none absolute inset-0 z-40" data-testid="gauge-flights">
      {flights.map((l) => {
        const a = at[l.from];
        const b = at[l.to];
        if (!a || !b) return null;
        const k = ramp(t, l.leaves, FLIGHT);
        const shown = reduced ? t >= l.leaves + FLIGHT && t < l.leaves + FLIGHT + COUNT + 0.6 : t >= l.leaves && t < l.leaves + FLIGHT + 0.25;
        if (!shown) return null;
        // An arc: up and over, so the chip reads as travelling, not sliding.
        const e = k * k * (3 - 2 * k);
        const x = reduced ? b.x : a.x + (b.x - a.x) * e;
        const y = reduced ? b.y : a.y + (b.y - a.y) * e - Math.sin(Math.PI * e) * 80;
        return (
          <span key={l.from} className={cx('absolute', reduced && 'animate-[ev-fade_0.3s_ease-out]')} style={{ left: x, top: y, transform: `translate(-50%, -50%) scale(${reduced ? 1 : 1.3 - 0.4 * e})`, opacity: reduced ? 1 : 1 - ramp(t, l.leaves + FLIGHT, 0.25) }} data-testid={`flight-${l.f.what}`}>
            <EventDeltaChip delta={l.f.delta > 0 === (l.f.what !== 'air') ? 1 : -1} text={c26Words(l.f)} size={size} className={size === 'tv' ? 'text-xl!' : ''} />
          </span>
        );
      })}
    </div>
  );
}

/** A gauge's value at `t`: its old value until its chip lands, then counting to the new one. */
export function countAt(t: number, from: number, to: number, landsAt: number, reduced: boolean): number {
  if (reduced) return t >= landsAt ? to : from;
  return Math.round(from + (to - from) * ramp(t, landsAt, COUNT));
}
