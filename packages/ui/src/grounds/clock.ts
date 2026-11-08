import { useEffect, useState } from 'react';

/** Seconds since `on` turned true, from the page's frames; 0 while off. One clock for the opener, the walkers and the smoke. */
export function useSeconds(on: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    // Where the frame clock is missing (or half-stubbed) the view holds still rather than throw on unmount.
    if (!on || typeof requestAnimationFrame !== 'function' || typeof cancelAnimationFrame !== 'function') return;
    let frame = 0;
    let first: number | null = null;
    const tick = (now: number) => {
      first ??= now;
      setSeconds((now - first) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [on]);
  return on ? seconds : 0;
}
