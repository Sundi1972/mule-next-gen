import type { ColonyView } from '@mule/protocol';
import { cx, EventEffectChip, eventGaugeFlightsAt, useEventShow, type EventGaugeFlightTimes, type ShowEffect } from '@mule/ui';
import { useLayoutEffect, useState, type RefObject } from 'react';
import { LANDING, type GaugeChange, type GaugeId, type GaugeLanding } from '../components/Colony';

/**
 * The gauge landing over the TV's show (the colony events mock's landing.tsx): a change to a colony gauge leaves the
 * event's card as a chip, flies on an arc to its gauge in the header and lands, and the gauge counts to its new value.
 */

const GAUGE_OF: Partial<Record<ShowEffect['what'], GaugeId>> = { mood: 'happiness', prestige: 'prestige', air: 'environment' };
const valueOf = (colony: ColonyView, gauge: GaugeId): number | null => colony.gauges[gauge];

/** One chip's trip from the card to its gauge, on the show clock. */
type Flight = EventGaugeFlightTimes & { gauge: GaugeId };

/** The show's trips to the gauges this colony shows a number on. */
function useFlights(colony: ColonyView | null | undefined): Flight[] {
  const { s, reduced, grid } = useEventShow();
  if (!colony) return [];
  return eventGaugeFlightsAt(s, reduced, grid).flatMap((l) => {
    const gauge = GAUGE_OF[l.effect.what];
    return gauge && valueOf(colony, gauge) !== null ? [{ ...l, gauge }] : [];
  });
}

/**
 * Each gauge held at its value before the show's changes, stepping through them as their chips land. The view already
 * carries every change, so a gauge starts at its value less all of them.
 */
function landingOf(flights: Flight[], colony: ColonyView, t: number, reduced: boolean): GaugeLanding | undefined {
  if (!flights.length) return undefined;
  const changes = [...new Set(flights.map((l) => l.gauge))].map((gauge) => {
    const mine = flights.filter((l) => l.gauge === gauge).sort((a, b) => a.landsAt - b.landsAt);
    let at = valueOf(colony, gauge)! - mine.reduce((n, l) => n + l.effect.delta, 0);
    const steps: GaugeChange[] = mine.map((l) => ({ gauge, from: at, to: (at += l.effect.delta), landsAt: l.landsAt, chip: true }));
    return [...steps].reverse().find((c) => t >= c.landsAt) ?? steps[0]!;
  });
  return { changes, t, reduced };
}

/** The landing for the header's gauges under the enclosing show; nothing when no change in it moves a gauge. */
export function useShowLanding(colony: ColonyView | null | undefined): GaugeLanding | undefined {
  const { t, reduced } = useEventShow();
  const flights = useFlights(colony);
  return colony ? landingOf(flights, colony, t, reduced) : undefined;
}

type Point = { x: number; y: number };
const ramp = (t: number, from: number, length: number) => Math.min(1, Math.max(0, (t - from) / length));

/** The middle of each selected element under `root`, in the root's own (unscaled) pixels from its top-left. */
function useCentres(root: RefObject<HTMLElement>, selectors: string[], when: boolean): Record<string, Point> {
  const [at, setAt] = useState<Record<string, Point>>({});
  useLayoutEffect(() => {
    if (!when || !root.current) return;
    const r = root.current.getBoundingClientRect();
    // A scaled TV frame: measure in screen pixels, place in the frame's own.
    const scale = root.current.offsetWidth ? r.width / root.current.offsetWidth : 1;
    const next: Record<string, Point> = {};
    for (const sel of selectors) {
      const el = root.current.querySelector(sel);
      if (!el) continue;
      const b = el.getBoundingClientRect();
      next[sel] = { x: (b.left + b.width / 2 - r.left) / scale, y: (b.top + b.height / 2 - r.top) / scale };
    }
    if (JSON.stringify(next) !== JSON.stringify(at)) setAt(next);
  });
  return at;
}

/**
 * The chips in flight, over the whole of `root`, which holds both the card and the header. With reduced motion nothing
 * travels: the chip shows on its gauge as it lands.
 */
export function GaugeFlights({ root, colony }: { root: RefObject<HTMLElement>; colony: ColonyView | null | undefined }) {
  const { t, reduced } = useEventShow();
  const shown = useFlights(colony);
  const from = (l: Flight) => `[data-fly-from="${l.effect.what}"]`;
  const to = (l: Flight) => `[data-testid="gauge-${l.gauge}"]`;
  const live = shown.some((l) => t >= l.leaves - 0.3 && t < l.landsAt + LANDING.count + 0.6);
  const at = useCentres(root, shown.flatMap((l) => [from(l), to(l)]), live);
  return (
    <div className="pointer-events-none absolute inset-0 z-50" data-testid="gauge-flights">
      {shown.map((l, i) => {
        const a = at[from(l)];
        const b = at[to(l)];
        if (!a || !b) return null;
        const on = reduced ? t >= l.landsAt && t < l.landsAt + LANDING.count + 0.6 : t >= l.leaves && t < l.landsAt + 0.25;
        if (!on) return null;
        const k = ramp(t, l.leaves, l.landsAt - l.leaves);
        const e = k * k * (3 - 2 * k);
        // An arc: up and over, so the chip reads as travelling, not sliding.
        const x = reduced ? b.x : a.x + (b.x - a.x) * e;
        const y = reduced ? b.y : a.y + (b.y - a.y) * e - Math.sin(Math.PI * e) * 80;
        return (
          <span
            key={i}
            className={cx('absolute', reduced && 'animate-[ev-fade_0.3s_ease-out]')}
            style={{ left: x, top: y, transform: `translate(-50%, -50%) scale(${reduced ? 1 : 1.3 - 0.4 * e})`, opacity: reduced ? 1 : 1 - ramp(t, l.landsAt, 0.25) }}
            data-testid={`gauge-flight-${l.effect.what}`}
          >
            <EventEffectChip f={l.effect} size="tv" className="text-xl!" />
          </span>
        );
      })}
    </div>
  );
}
