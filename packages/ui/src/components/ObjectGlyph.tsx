import { cx } from './tokens';

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

/** A colony object on its plot, as the map draws it: the project's stage, and for a building site its months. */
export interface MapObject {
  kind: ObjectKind;
  /** The object's name, from the colony's view. */
  name: string;
  stage: 'commissioned' | 'building' | 'standing' | 'closed' | 'damaged';
  /** Building only: months built so far. */
  built?: number;
  buildMonths: number;
}

/** The plot's words for its object, in the build site's phrasing ("1 of 3 months built"). */
export function objectLabel(o: MapObject): string {
  if (o.stage === 'commissioned') return `${o.name}, site reserved: not building yet`;
  if (o.stage === 'building') return `${o.name}, building: ${o.built ?? 0} of ${o.buildMonths} months`;
  if (o.stage === 'standing') return `${o.name}, standing`;
  return `${o.name}, ${o.stage}: counts 0`;
}

/**
 * The stage's colour on the map. Building, closed and damaged are the build site's own (warn, alert). Standing is holo,
 * the colony's colour: beside players' plots the list's ok green reads as a green player's border. A reserved site is
 * holo too, told apart by its dashed outline, its faint glyph and its SITE chip.
 */
const BORDER: Record<MapObject['stage'], string> = { commissioned: 'border-holo border-dashed', building: 'border-warn border-dashed', standing: 'border-holo border-solid', closed: 'border-alert border-solid', damaged: 'border-alert border-solid' };
const INK: Record<MapObject['stage'], string> = { commissioned: 'text-holo opacity-30', building: 'text-warn', standing: 'text-holo', closed: 'text-alert opacity-45', damaged: 'text-alert opacity-45' };
/** The corner chip, in the map's flag style: what the colour can't say. */
const CHIP: Partial<Record<MapObject['stage'], { text: (o: MapObject) => string; tone: string }>> = {
  commissioned: { text: () => 'SITE', tone: 'bg-holo text-on-holo' },
  building: { text: (o) => `${o.built ?? 0}/${o.buildMonths}`, tone: 'bg-warn text-void' },
  closed: { text: () => 'SHUT', tone: 'bg-alert text-white' },
  damaged: { text: () => 'HIT', tone: 'bg-alert text-white' },
};

/**
 * The colony's ground (Heiko approved, design/mocks/ws5-colony-plots): the whole plot is the object's. A stage-coloured
 * inset border, a dark fill, the glyph large across it, and a corner chip. aria-hidden: the plot's own label names it.
 */
export function PlotObjectMark({ object, density, at, className }: { object: MapObject; density: 'phone' | 'tv'; at: string; className?: string }) {
  const tv = density === 'tv';
  const chip = CHIP[object.stage];
  return (
    <span aria-hidden className={cx('pointer-events-none absolute inset-0 z-[2] flex items-center justify-center', className)} data-testid={`plot-object-${at}`} data-kind={object.kind} data-stage={object.stage}>
      <span className={cx('absolute inset-[2%] rounded-[10%] bg-map-chip/60', tv ? 'border-[4px]' : 'border-2', BORDER[object.stage])} />
      <ObjectGlyph kind={object.kind} size="78%" className={cx('relative', INK[object.stage])} />
      {chip && (
        <span data-num className={cx('absolute right-0.5 top-0.5 z-[4] rounded-chip font-mono font-bold leading-tight shadow-chip', tv ? 'px-1 text-[11px]' : 'px-0.5 text-[10px]', chip.tone)}>
          {chip.text(object)}
        </span>
      )}
    </span>
  );
}
