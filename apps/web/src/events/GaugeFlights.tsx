import type { ColonyView } from '@mule/protocol';
import { cx, EventEffectChip, eventGaugeChipsAt, EventGaugeDepartures, useEventShow, type ShowEffect } from '@mule/ui';
import { useLayoutEffect, useState, type ReactNode, type RefObject } from 'react';
import { LANDING, settlesAfter, type GaugeChange, type GaugeId, type GaugeLanding } from '../components/Colony';

/**
 * The gauge landing over the TV's show (the colony events mock's landing.tsx): a change to a colony gauge leaves the
 * event's card as a chip, flies on an arc to its gauge in the header and lands, and the gauge counts to its new value.
 */

/**
 * Seconds: the mock's wait on the card and flight; the shortest flight that still reads as one (a show cut to its cap
 * can leave less room than that); and how long the landed gauges rest, still, before the event's part of the show ends.
 */
const FLIGHT = { wait: 0.7, fly: 0.9, minFly: 0.4, rest: 0.1 } as const;

const GAUGE_OF: Partial<Record<ShowEffect['what'], GaugeId>> = { mood: 'happiness', prestige: 'prestige', air: 'environment' };
const valueOf = (colony: ColonyView, gauge: GaugeId): number | null => colony.gauges[gauge];

/** One chip's trip from the card to its gauge, on the show clock, and the gauge's numbers either side of it. */
interface Flight {
  effect: ShowEffect;
  change: GaugeChange;
  leaves: number;
}

/**
 * The show's trips to the gauges this colony shows a number on. Each keeps the mock's timing when it fits its segment;
 * otherwise it leaves earlier, though never before the card shows it, and only then flies faster, so that its count and
 * pulse are over before the segment ends. It never flies faster than minFly: in a show cut to its cap the pulse may
 * then finish under the next event. The view already carries every change, so a gauge starts at its value less all of
 * the show's changes to it.
 */
function useFlights(colony: ColonyView | null | undefined): Flight[] {
  const { s, reduced, grid } = useEventShow();
  if (!colony) return [];
  const chips = eventGaugeChipsAt(s, reduced, grid).flatMap((c) => {
    const gauge = GAUGE_OF[c.effect.what];
    return gauge && valueOf(colony, gauge) !== null ? [{ ...c, gauge }] : [];
  });
  const left = new Map<GaugeId, number>();
  for (const c of chips) left.set(c.gauge, (left.get(c.gauge) ?? valueOf(colony, c.gauge)!) - c.effect.delta);
  return chips.map((c) => {
    const from = left.get(c.gauge)!;
    left.set(c.gauge, from + c.effect.delta);
    const tail = settlesAfter({ gauge: c.gauge, from, to: from + c.effect.delta, landsAt: 0, chip: true }, reduced);
    const end = c.end - FLIGHT.rest;
    const leaves = Math.max(c.onCard, Math.min(c.onCard + FLIGHT.wait, end - FLIGHT.fly - tail));
    const landsAt = Math.max(leaves + FLIGHT.minFly, Math.min(leaves + FLIGHT.fly, end - tail));
    return { effect: c.effect, leaves, change: { gauge: c.gauge, from, to: from + c.effect.delta, landsAt, chip: true } };
  });
}

/** Each gauge held at its value before the show's changes, stepping through them as their chips land. */
function landingOf(flights: Flight[], t: number, reduced: boolean): GaugeLanding | undefined {
  if (!flights.length) return undefined;
  const changes = [...new Set(flights.map((l) => l.change.gauge))].map((gauge) => {
    const steps = flights.filter((l) => l.change.gauge === gauge).map((l) => l.change);
    return [...steps].reverse().find((c) => t >= c.landsAt) ?? steps[0]!;
  });
  return { changes, t, reduced };
}

/** The landing for the header's gauges under the enclosing show; nothing when no change in it moves a gauge. */
export function useShowLanding(colony: ColonyView | null | undefined): GaugeLanding | undefined {
  const { t, reduced } = useEventShow();
  return landingOf(useFlights(colony), t, reduced);
}

/** Tells the event's card when each gauge chip leaves it, so its place there fades as the chip flies. */
export function GaugeDepartures({ colony, children }: { colony: ColonyView | null | undefined; children: ReactNode }) {
  const departures = new Map(useFlights(colony).map((l) => [l.effect, l.leaves]));
  return <EventGaugeDepartures.Provider value={departures}>{children}</EventGaugeDepartures.Provider>;
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
  const to = (l: Flight) => `[data-testid="gauge-${l.change.gauge}"]`;
  const live = shown.some((l) => t >= l.leaves - 0.3 && t < l.change.landsAt + LANDING.count + 0.6);
  const at = useCentres(root, shown.flatMap((l) => [from(l), to(l)]), live);
  return (
    <div className="pointer-events-none absolute inset-0 z-50" data-testid="gauge-flights">
      {shown.map((l, i) => {
        const a = at[from(l)];
        const b = at[to(l)];
        if (!a || !b) return null;
        const lands = l.change.landsAt;
        const on = reduced ? t >= lands && t < lands + LANDING.count + 0.6 : t >= l.leaves && t < lands + 0.25;
        if (!on) return null;
        const k = lands > l.leaves ? ramp(t, l.leaves, lands - l.leaves) : 1;
        const e = k * k * (3 - 2 * k);
        // An arc: up and over, so the chip reads as travelling, not sliding.
        const x = reduced ? b.x : a.x + (b.x - a.x) * e;
        const y = reduced ? b.y : a.y + (b.y - a.y) * e - Math.sin(Math.PI * e) * 80;
        return (
          <span
            key={i}
            className={cx('absolute', reduced && 'animate-[ev-fade_0.3s_ease-out]')}
            style={{ left: x, top: y, transform: `translate(-50%, -50%) scale(${reduced ? 1 : 1.3 - 0.4 * e})`, opacity: reduced ? 1 : 1 - ramp(t, lands, 0.25) }}
            data-testid={`gauge-flight-${l.effect.what}`}
          >
            <EventEffectChip f={l.effect} size="tv" className="text-xl!" />
          </span>
        );
      })}
    </div>
  );
}
