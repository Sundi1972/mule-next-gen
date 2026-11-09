/** The colony's five objects, as the design system draws them; the same ids as the engine's catalogue. */
export type ObjectKind = 'park' | 'hospital' | 'observatory' | 'stadium' | 'spaceport';

/** The five glyphs of the colony's objects, 24×24 and stroked like the hub's desk icons (WS8's colony mock). */
const GLYPH: Record<ObjectKind, string> = {
  park: 'M12 3l-5 7h3l-4 6h12l-4-6h3zM12 16v5M5 21h14',
  hospital: 'M4 21V7l8-4 8 4v14M10 21v-5h4v5M12 8v6M9 11h6',
  stadium: 'M3 9c0-2 4-4 9-4s9 2 9 4v6c0 2-4 4-9 4s-9-2-9-4zM3 9c0 2 4 4 9 4s9-2 9-4M7 12v5M17 12v5',
  observatory: 'M4 21h16M6 21v-6a6 6 0 0 1 12 0v6M12 9V3M15 5l4-2M9 17h6',
  spaceport: 'M12 3c3 3 4 7 3 11H9C8 10 9 6 12 3zM9 14l-3 4h12l-3-4M12 18v3M4 21h16',
};

export function ObjectGlyph({ kind, size = 24, className }: { kind: ObjectKind; size?: number | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={GLYPH[kind]} />
    </svg>
  );
}
