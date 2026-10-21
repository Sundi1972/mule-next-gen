import type { Good } from './tokens';

/** One small glyph per good, drawn in currentColor with a soft fill, so it reads on light and dark land alike. */
const PATHS: Record<Good, string> = {
  // A wheat ear.
  food: 'M12 21v-9 M12 12c-3-1-4-3.5-4-6 2.5 0 4 1.5 4 4 M12 12c3-1 4-3.5 4-6-2.5 0-4 1.5-4 4 M12 16c-3-1-4-3-4-5.5 2.5 0 4 1.5 4 4 M12 16c3-1 4-3 4-5.5-2.5 0-4 1.5-4 4 M12 8c0-2 0-3.5 0-5',
  // A drop.
  water: 'M12 3c3.5 4.6 6 7.8 6 11a6 6 0 0 1-12 0c0-3.2 2.5-6.4 6-11z',
  // A bolt.
  energy: 'M13.5 2.5 5.5 13.5h6l-1 8 8-11h-6z',
  // A faceted ore chunk.
  smithore: 'M4 15 7.5 7l7-2.5L20 10l-2.5 8-8.5 1.5z M7.5 7l3.5 6 9-3 M11 13l-2 6.5 M11 13l6.5 5',
  // A long crystal prism.
  crystite: 'M12 2l4.5 6-1.5 13h-6L7.5 8z M7.5 8h9 M12 2v19',
  // A lattice: rare earth.
  rareEarth: 'M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z M12 3v18 M4.2 7.5l15.6 9 M19.8 7.5l-15.6 9',
  // An ingot.
  alloy: 'M3 16l3-7h12l3 7z M6 9l2 7 M18 9l-2 7',
  // A chip.
  electronics: 'M7 7h10v10H7z M10 4v3 M14 4v3 M10 17v3 M14 17v3 M4 10h3 M4 14h3 M17 10h3 M17 14h3',
  // A capsule.
  medicine: 'M8.5 15.5l7-7a3.5 3.5 0 0 0-5-5l-7 7a3.5 3.5 0 0 0 5 5z M7 7l5 5',
};

export interface GoodIconProps {
  good: Good;
  size?: number;
  className?: string;
  /** Defaults to the good's own colour. */
  color?: string;
}

export function GoodIcon({ good, size = 16, className, color }: GoodIconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={{ color: color ?? `var(--color-g-${good})` }}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[good]} fill="currentColor" fillOpacity={0.22} />
    </svg>
  );
}
