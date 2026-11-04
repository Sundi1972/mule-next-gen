import { cx } from '@mule/ui';

/** The objects that stand on a plot (spec C21's catalogue, needsPlot): the hospital and the observatory have none. */
export type PlotObjectKind = 'park' | 'stadium' | 'spaceport';
export type PrestigeId = PlotObjectKind | 'hospital' | 'observatory';
/** The stages a project holds its plot in: from the first month of building until the game ends. */
export type PlotStage = 'building' | 'standing' | 'closed' | 'damaged';

export const OBJECT_NAME: Record<PrestigeId, string> = {
  park: 'Park',
  hospital: 'Hospital',
  observatory: 'Observatory',
  stadium: 'Stadium',
  spaceport: 'Spaceport upgrade',
};

/**
 * DS-GAP (WS8's, carried verbatim from design/mocks/ws8-colony at b0f52001): the five object glyphs, 24×24, stroke 1.6,
 * round caps. C33 moves them into packages/ui beside SpecialIcon as a named edit for WS4; C34 then imports them there.
 */
const GLYPH: Record<PrestigeId, string> = {
  park: 'M12 3l-5 7h3l-4 6h12l-4-6h3zM12 16v5M5 21h14',
  hospital: 'M4 21V7l8-4 8 4v14M10 21v-5h4v5M12 8v6M9 11h6',
  stadium: 'M3 9c0-2 4-4 9-4s9 2 9 4v6c0 2-4 4-9 4s-9-2-9-4zM3 9c0 2 4 4 9 4s9-2 9-4M7 12v5M17 12v5',
  observatory: 'M4 21h16M6 21v-6a6 6 0 0 1 12 0v6M12 9V3M15 5l4-2M9 17h6',
  spaceport: 'M12 3c3 3 4 7 3 11H9C8 10 9 6 12 3zM9 14l-3 4h12l-3-4M12 18v3M4 21h16',
};

export function ObjectGlyph({ kind, size = 24, className }: { kind: PrestigeId; size?: number | string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={GLYPH[kind]} />
    </svg>
  );
}

/** What C33 adds to a map plot (HoloMap's MapTile gains `object`), derived from ColonyView.projects[].plot. */
export interface PlotObject {
  kind: PlotObjectKind;
  stage: PlotStage;
  /** Building only: months built so far and the catalogue's build months, for "1 of 3 months". */
  built?: number;
  buildMonths: number;
}

/** The words a screen reader hears for the plot's object, in the build site's own phrasing (WS8's pips: "1 of 3 months built"). */
export function objectLabel(o: PlotObject): string {
  const name = OBJECT_NAME[o.kind];
  if (o.stage === 'building') return `${name}, building: ${o.built ?? 0} of ${o.buildMonths} months`;
  if (o.stage === 'standing') return `${name}, standing`;
  return `${name}, ${o.stage}: counts 0`;
}

/**
 * The stage's colour, the build site's own (WS8's parts.tsx STAGE and ProjectRow), so the map and the list agree:
 * standing ok, building warn, closed and damaged alert.
 */
const STAGE_RING: Record<PlotStage, string> = {
  standing: 'ring-ok text-ok',
  building: 'ring-warn text-warn',
  closed: 'ring-alert text-alert',
  damaged: 'ring-alert text-alert',
};
/** The corner chip, in the map's flag style (HoloMap's OFF, SALE, SCAN): what a dimmed object is, or how far a site has come. */
const STAGE_CHIP: Partial<Record<PlotStage, { text: (o: PlotObject) => string; tone: string }>> = {
  building: { text: (o) => `${o.built ?? 0}/${o.buildMonths}`, tone: 'bg-warn text-void' },
  closed: { text: () => 'SHUT', tone: 'bg-alert text-white' },
  damaged: { text: () => 'HIT', tone: 'bg-alert text-white' },
};

/**
 * Variant A, "the object's disc": the object takes the plot's centre on the map's chip disc, where an installed MULE's
 * good would sit. A plot with an object makes nothing, so it never has a good disc to clash with. The ring is the
 * stage's colour, dashed while it is a site; closed and damaged fade. Sized as a share of the plot, as HoloMap's marks.
 */
export function ObjectDisc({ object, tv, className }: { object: PlotObject; tv: boolean; className?: string }) {
  const chip = STAGE_CHIP[object.stage];
  const faded = object.stage === 'closed' || object.stage === 'damaged';
  return (
    <span
      className={cx('relative z-[2] flex aspect-square w-[62%] items-center justify-center rounded-full bg-map-chip shadow-chip', className)}
      data-testid="plot-object"
      data-kind={object.kind}
      data-stage={object.stage}
    >
      <span
        aria-hidden
        className={cx(
          'absolute inset-0 rounded-full',
          tv ? 'border-[3px]' : 'border-2',
          object.stage === 'building' ? 'border-dashed' : 'border-solid',
          object.stage === 'standing' ? 'border-ok' : object.stage === 'building' ? 'border-warn' : 'border-alert',
        )}
      />
      <ObjectGlyph kind={object.kind} size="70%" className={cx(STAGE_RING[object.stage].split(' ')[1], faded && 'opacity-45')} />
      {chip && (
        <span
          data-num
          data-testid="plot-object-chip"
          className={cx('absolute left-[15%] top-[85%] -translate-x-1/2 -translate-y-1/2 rounded-chip px-0.5 font-mono font-bold leading-tight shadow-chip', tv ? 'text-[11px]' : 'text-[7px]', chip.tone)}
        >
          {chip.text(object)}
        </span>
      )}
    </span>
  );
}

/**
 * Variant B, "the colony's ground": the whole plot is the object's. A stage-coloured inset border over the land, like
 * an owner's plot, and the glyph large across it, no disc. Reads from further away; competes more with the land.
 */
export function ObjectGround({ object, tv, className }: { object: PlotObject; tv: boolean; className?: string }) {
  const chip = STAGE_CHIP[object.stage];
  const faded = object.stage === 'closed' || object.stage === 'damaged';
  return (
    <span className={cx('absolute inset-0 flex items-center justify-center', className)} data-testid="plot-object" data-kind={object.kind} data-stage={object.stage}>
      <span
        aria-hidden
        className={cx(
          'absolute inset-[2%] rounded-[10%] bg-map-chip/60',
          tv ? 'border-[4px]' : 'border-2',
          object.stage === 'building' ? 'border-dashed' : 'border-solid',
          object.stage === 'standing' ? 'border-ok' : object.stage === 'building' ? 'border-warn' : 'border-alert',
        )}
      />
      <ObjectGlyph kind={object.kind} size="78%" className={cx('relative', STAGE_RING[object.stage].split(' ')[1], faded && 'opacity-45')} />
      {chip && (
        <span
          data-num
          data-testid="plot-object-chip"
          className={cx('absolute right-0.5 top-0.5 z-[4] rounded-chip font-mono font-bold leading-tight shadow-chip', tv ? 'px-1 text-[11px]' : 'px-0.5 text-[8px]', chip.tone)}
        >
          {chip.text(object)}
        </span>
      )}
    </span>
  );
}
