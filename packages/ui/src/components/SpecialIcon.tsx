import type { CSSProperties } from 'react';
import { cx, SPECIAL_COLOR, type MapSpecial, type SpecialKind } from './tokens';

/** One symbol per special field, drawn like GoodIcon: currentColor strokes with a soft fill, on a 24 grid. */
const PATHS: Record<SpecialKind, string> = {
  // Two broken columns on a plinth, one still holding a cracked lintel.
  ruins: 'M3 21h18 M5.5 21V9.5h3.5V21 M4 9.5h7l1.5-2 M14.5 21v-6l1.5-1.5 1.5 1.2V21',
  // A cave mouth with a crystal standing in it.
  crystalCavern: 'M2.5 21c0-9 4.5-15 9.5-15s9.5 6 9.5 15z M12 20l-3-5 3-5.5 3 5.5z',
  // A jet shooting from a vent, widening as it rises, with spray thrown out to both sides.
  geyser: 'M6.5 21l2.5-4h6l2.5 4z M10.6 17 9 6.5C9 4.6 10.3 3 12 3s3 1.6 3 3.5L13.4 17z M5.5 8.5c-.8 1.6-.8 3.2.3 4.5 M18.5 8.5c.8 1.6.8 3.2-.3 4.5',
  // A palm over a pool.
  oasis: 'M12.5 19.5c.6-3.8.4-7-1-10 M11.5 9.5C9.5 7 6 7 4 9.2 M11.5 9.5c2-2.5 5.5-2.5 7.5-.3 M11.5 9.5C10.6 6.4 8 4.5 5.4 4.6 M11.5 9.5c1-3 3.5-4.9 6.1-4.8 M4 21c2.5-2 13.5-2 16 0z',
  // An artefact sending its power out to the four plots around it.
  relic: 'M12 7l5 5-5 5-5-5z M12 10.5v3 M12 2v2.5 M12 19.5V22 M2 12h2.5 M19.5 12H22',
  // A crater seen from above, struck in its centre, with the meteor's trail still in the sky. Both Crystite
  // kinds wear one colour, so this one is round and slanted where the cavern is a dome.
  meteorCrater: 'M4 14a6 6 0 1 0 12 0a6 6 0 1 0-12 0z M9 14a1 1 0 1 0 2 0a1 1 0 1 0-2 0z M13.5 10.5 21 3 M16.5 11.5 20.5 7.5 M12.5 7.5 16.5 3.5',
};

export interface SpecialIconProps {
  kind: SpecialKind;
  size?: number;
  className?: string;
}

/** A special field's symbol: a sibling of GoodIcon. Decorative; the plot or the line it sits in carries the name. */
export function SpecialIcon({ kind, size = 16, className }: SpecialIconProps) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className={className} style={{ color: SPECIAL_COLOR[kind] }} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[kind]} stroke="currentColor" strokeWidth={2} fill="currentColor" fillOpacity={0.22} />
    </svg>
  );
}

/**
 * The badge's size per density, in screen pixels. DS-GAP: there are no size tokens for map marks; HoloMap writes
 * each mark's size per density inline (PlayerMark 7/12, GoodIcon 10/20), and these follow that precedent.
 */
export const SPECIAL_BADGE = { phone: { box: 15, icon: 10, ring: 1.6 }, tv: { box: 21, icon: 14, ring: 2.2 } } as const;

/**
 * How far the badge hangs over its plot's lower-right corner, as a share of its size. At 6 players a TV plot is
 * 37 px and HoloMap's good chip nearly fills it, so a badge wholly inside the corner would cover the good; hung out
 * this far it only clips the chip's empty rounded corner and stays three-quarters in its own plot. On the map's
 * right or bottom edge it stays inside.
 */
export const SPECIAL_HANG = 0.25;

export interface SpecialBadgeProps {
  special: MapSpecial;
  density: 'phone' | 'tv';
  className?: string;
  style?: CSSProperties;
}

/** A special field's mark: a hexagonal chip (no other map chip has this shape) holding the kind's symbol. Decorative. */
export function SpecialBadge({ special, density, className, style }: SpecialBadgeProps) {
  const s = SPECIAL_BADGE[density];
  const color = SPECIAL_COLOR[special.kind];
  return (
    <span
      aria-hidden
      className={cx('inline-flex shrink-0 items-center justify-center', className ?? 'relative')}
      style={{ ...style, width: s.box, height: s.box, filter: 'drop-shadow(0 0 1px var(--color-mark-edge))' }}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="absolute inset-0 h-full w-full">
        <path d="M12 1.2 21.4 6.6v10.8L12 22.8 2.6 17.4V6.6z" fill="var(--color-map-chip)" stroke={color} strokeWidth={s.ring * (24 / s.box)} strokeLinejoin="round" />
      </svg>
      <SpecialIcon kind={special.kind} size={s.icon} className="relative" />
    </span>
  );
}
