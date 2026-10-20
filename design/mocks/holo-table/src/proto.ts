import { useEffect, useState } from 'react';
import { FREE_PLOTS } from './data';

/** Re-renders every `ms`, and returns the current time. */
export function useNow(ms = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** A phase timer that counts down and starts again, so the prototype never runs out of time. */
export function useCountdown(total: number): number {
  const now = useNow(250);
  const [start] = useState(() => Date.now());
  const elapsed = ((now - start) / 1000) % total;
  return total - elapsed;
}

/**
 * The land grant cursor, derived from the clock alone. Phone and big screen
 * compute it independently and agree, as they will against the server's
 * shared clock in the real game.
 */
export const CURSOR_STEP_MS = 650;
export function cursorAt(now: number) {
  const i = Math.floor(now / CURSOR_STEP_MS) % FREE_PLOTS.length;
  return FREE_PLOTS[i]!;
}

/**
 * The goods auction, also from the clock: each player's price drifts toward
 * the middle and back, as people move their sliders.
 */
export function auctionPositions(now: number) {
  const t = now / 1000;
  const wave = (speed: number, phase: number) => (Math.sin(t * speed + phase) + 1) / 2;
  return {
    sellers: [
      { slot: 0 as const, price: Math.round(84 + 10 * wave(0.9, 0)) },
      { slot: 1 as const, price: Math.round(78 + 12 * wave(0.7, 1.3)) },
      { slot: 2 as const, price: Math.round(90 + 8 * wave(1.1, 2.1)) },
    ],
    buyers: [
      { slot: 3 as const, price: Math.round(62 + 14 * wave(0.8, 0.4)) },
      { slot: 4 as const, price: Math.round(70 + 10 * wave(1.2, 2.6)) },
      { slot: 5 as const, price: Math.round(74 + 12 * wave(0.6, 1.9)) },
    ],
  };
}
