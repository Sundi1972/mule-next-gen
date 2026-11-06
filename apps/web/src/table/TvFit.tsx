import { cx } from '@mule/ui';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/** How often a screen that re-renders every frame (development, production) is measured again. */
const REFIT_MS = 120;

/**
 * Its content at full size when it fits, scaled down as a whole when it doesn't, and back up when room returns. While
 * it fits, the content stretches to fill the box.
 *
 * With `gives`, a box inside marked data-fit-gives (planning's news) takes what room is left and clips, before anything
 * scales, down to what it keeps (data-fit-keep, the newest item); the content is held to the box's height instead of
 * growing past it, so it is measured again as it renders, its content being free to change without a resize (the
 * auction's side, whose deals come and go, is measured so for that, and gives nothing: every deal stays in sight). A box marked data-fit-spills does not grow with its content (size containment, as production's
 * map row): what spills past it at the height it would have is height the content still needs.
 */
export function FitHeight({ className, innerClassName, gives = false, children }: { className?: string; innerClassName?: string; gives?: boolean; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // A scale sets the content's width (100% / scale), so its wrapping, so its height. So each candidate scale is measured
  // at its own width, until the scale settles, all before paint; then the largest that fits at its own width is taken.
  // Measured at the old scale's width instead, the new scale clipped what wraps differently (B-AC-19, six seats).
  const current = useRef(1);
  const changes = useRef(0);
  const fit = useRef(() => {});
  fit.current = () => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    const room = b.clientHeight;
    // A box not laid out yet has no height to fit to (nor any outside a browser); a scale of 0 would set the width to Infinity%.
    if (!(room > 0)) return;
    // The content's own height, without the stretch: the stretch follows the scale, so measuring through it would keep
    // a shrunk scale from ever growing back.
    const size = gives ? 'height' : 'minHeight';
    const saved = [i.style[size], i.style.width] as const;
    // A giving box is measured at the height of what it keeps (data-fit-keep: the newest news item), its gap kept: what
    // it can give is all the rest of itself.
    const giving = gives ? [...i.querySelectorAll<HTMLElement>('[data-fit-gives]')].map((g) => [g, g.style.cssText] as const) : [];
    const spilling = [...i.querySelectorAll<HTMLElement>('[data-fit-spills]')];
    const heightAt = (s: number) => {
      i.style.width = `${100 / s}%`;
      i.style[size] = gives ? 'auto' : '0px';
      for (const [g, css] of giving) g.style.cssText = css;
      for (const [g] of giving) {
        const keep = [...g.querySelectorAll<HTMLElement>('[data-fit-keep]')].reduce((h, k) => h + k.offsetHeight, 0);
        g.style.cssText += `;flex:none;height:${keep}px`;
      }
      const natural = i.offsetHeight;
      if (spilling.length === 0) return natural;
      // A spilling box is read at the height the stretch gives it at this scale.
      i.style[size] = `${room / s}px`;
      for (const [g, css] of giving) g.style.cssText = css;
      const spill = Math.max(...spilling.map((el) => el.scrollHeight - el.clientHeight));
      return spill > 0.5 ? Math.max(natural, room / s + spill) : natural;
    };
    const tried: [number, number][] = [];
    let s = current.current;
    for (let k = 0; k < 8; k++) {
      const natural = heightAt(s);
      if (natural === 0) break;
      tried.push([s, natural]);
      const next = Math.min(1, room / natural);
      if (tried.some(([t]) => Math.abs(next - t) < 0.001)) break;
      s = next;
    }
    for (const [g, css] of giving) g.style.cssText = css;
    [i.style[size], i.style.width] = saved;
    if (tried.length === 0) return;
    // The largest scale whose content fits at its own width; if none did, the smallest any measure asked for.
    const fits = tried.filter(([t, n]) => t * n <= room + 0.5).map(([t]) => t);
    const next = fits.length > 0 ? Math.max(...fits) : Math.min(...tried.map(([, n]) => Math.min(1, room / n)));
    if (Math.abs(next - current.current) < 0.001) {
      changes.current = 0;
      return;
    }
    // Settled before paint, a change re-measures to the same scale. Three changes before the next frame would be a chase
    // (renders feeding renders blank the TV), so it stops there; the count starts again each frame.
    if (changes.current >= 3) return;
    if (changes.current === 0) requestAnimationFrame(() => (changes.current = 0));
    changes.current += 1;
    current.current = next;
    setScale(next);
  };
  // With `gives` the content can change without a resize, so renders measure, at most every REFIT_MS: the last change
  // is measured when that time is up.
  const last = useRef(-Infinity);
  const later = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useBeforePaint(() => {
    if (!gives) return;
    const wait = last.current + REFIT_MS - performance.now();
    if (wait <= 0) {
      last.current = performance.now();
      fit.current();
    } else
      later.current ??= setTimeout(() => {
        later.current = undefined;
        last.current = performance.now();
        fit.current();
      }, wait);
  });
  useEffect(() => () => clearTimeout(later.current), []);
  useBeforePaint(() => {
    const run = () => fit.current();
    run();
    const ro = new ResizeObserver(run);
    if (box.current) ro.observe(box.current);
    // Held to the box's height with `gives`, the content resizes only with the scale itself: renders measure it instead.
    if (inner.current && !gives) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={box} className={cx('min-h-0 overflow-hidden', className)} data-fit={scale.toFixed(3)}>
      <div ref={inner} className={cx('flex flex-col', innerClassName)} style={{ transform: `scale(${scale})`, transformOrigin: '0 0', width: `${100 / scale}%`, [gives ? 'height' : 'minHeight']: `${100 / scale}%` }}>
        {children}
      </div>
    </div>
  );
}

/**
 * A TV screen's body, under its header: everything after the header fits the height the header leaves, scaled down
 * as a whole when it would run past the screen's foot; the header itself never scales (PM ruling 6 Nov, rulebook
 * #tv-fit). Its children keep the screen's own gap, as they had as the screen's children.
 */
export function TvBody({ children }: { children: ReactNode }) {
  return (
    // It never clips: what floats over the screen (a speaker's bubble) may still reach into the screen's foot margin.
    <FitHeight className="flex-1 overflow-visible! [gap:inherit]" innerClassName="[gap:inherit]" gives>
      {children}
    </FitHeight>
  );
}
