import { GoodIcon } from './GoodIcon';

/** The ring's radius in the sparkle's 36-unit box. */
const R = 15;

/**
 * The glint's sparkle on a tile: a Crystite star that twinkles inside a ring that empties as its seconds run out.
 * `share` is the part of its time still left, 1 when it lights and 0 when it fades. Fills its box.
 */
export function GlintSparkle({ size, share }: { size: number; share: number }) {
  const ring = 2 * Math.PI * R;
  const left = Math.min(1, Math.max(0, share));
  return (
    <>
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx={18} cy={18} r={R} fill="color-mix(in srgb, var(--color-g-crystite) 18%, transparent)" stroke="var(--color-map-chip)" strokeWidth={3.5} />
        <circle cx={18} cy={18} r={R} fill="none" stroke="var(--color-g-crystite)" strokeWidth={3.5} strokeLinecap="round" strokeDasharray={`${ring * left} ${ring}`} data-testid="glint-ring" data-share={left.toFixed(3)} />
      </svg>
      <span className="relative grid place-items-center">
        <span aria-hidden className="absolute size-[140%] animate-[show-twinkle_0.6s_ease-in-out_infinite_alternate] rounded-[20%] bg-g-crystite/40 shadow-glow" />
        <GoodIcon good="crystite" size={Math.round(size * 0.5)} />
      </span>
    </>
  );
}
