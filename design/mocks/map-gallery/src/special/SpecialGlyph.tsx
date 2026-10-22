import type { CSSProperties } from 'react';
import { cx, HoloMap, type HoloMapProps } from '@mule/ui';
import { SPECIAL_COLOR, SPECIAL_KINDS, specialLabel, type MapSpecial, type SpecialKind, type SpecialTile } from './kinds';

/**
 * A special field's glyph on the colony map, in two variants for review.
 *
 *   A · Badge     a hexagonal chip pinned on the plot's lower-right corner, above the plot's other chips.
 *   B · Landmark  the land itself is marked: a glow, a ring and a large symbol, painted under the plot grid.
 *
 * GRAFT (PR-4) into packages/ui/src/components/HoloMap.tsx, for the variant Heiko picks:
 *   - `SpecialIcon` becomes a sibling of GoodIcon (packages/ui/src/components/SpecialIcon.tsx).
 *   - A: `Badge` is drawn inside each plot's <Tag>, after the flag and before the selection ring.
 *   - B: `LandLayer` is drawn between <Landscape> and the plot-grid <svg>.
 *   - Either way the plot's aria-label gains `specialLabel(t.special)`, and the glyph itself is aria-hidden there.
 * In this mock both are overlays on an untouched HoloMap (the gallery's MapCard pattern), so here each glyph
 * carries its own accessible name.
 */

export type Variant = 'badge' | 'landmark';
export type Density = NonNullable<HoloMapProps['density']>;

/** One symbol per kind, drawn like GoodIcon: currentColor strokes with a soft fill, on a 24 grid. */
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
};

export function SpecialIcon({ kind, size = 16, className, color, halo = false }: { kind: SpecialKind; size?: number; className?: string; color?: string; halo?: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} className={className} style={{ color: color ?? SPECIAL_COLOR[kind] }} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {halo && <path d={PATHS[kind]} stroke="var(--color-mark-edge)" strokeWidth={4.2} />}
      <path d={PATHS[kind]} stroke="currentColor" strokeWidth={2} fill="currentColor" fillOpacity={0.22} />
    </svg>
  );
}

/**
 * DS-GAP: there are no size tokens for map marks; HoloMap writes each mark's size per density inline
 * (PlayerMark 7/12, GoodIcon 10/20). These follow that precedent.
 */
const BADGE = { phone: { box: 15, icon: 10, ring: 1.6 }, tv: { box: 21, icon: 14, ring: 2.2 } } as const;

/**
 * The badge hangs a quarter of its size over the plot's lower-right corner. At 6 players a TV plot is
 * 37 px and HoloMap's good chip nearly fills it, so a badge wholly inside the corner would cover the
 * good; hung out this far it only clips the chip's empty rounded corner, and stays three-quarters in
 * its own plot, so it never reads as the neighbour's. On the map's right or bottom edge it stays inside.
 */
const HANG = 0.25;

/** The hexagonal chip, alone: the legend and the phone card draw it too. */
export function SpecialBadge({ special, density, className, style, labelled = false }: { special: MapSpecial; density: Density; className?: string; style?: CSSProperties; labelled?: boolean }) {
  const s = BADGE[density];
  const color = SPECIAL_COLOR[special.kind];
  return (
    <span
      {...(labelled ? { role: 'img', 'aria-label': specialLabel(special) } : { 'aria-hidden': true })}
      className={cx('inline-flex shrink-0 items-center justify-center', className ?? 'relative')}
      style={{ ...style, width: s.box, height: s.box, filter: 'drop-shadow(0 0 1px var(--color-mark-edge))' }}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="absolute inset-0 h-full w-full">
        {/* A pointy-top hexagon: no other map chip has this shape, so it says "special field" before the symbol is read. */}
        <path d="M12 1.2 21.4 6.6v10.8L12 22.8 2.6 17.4V6.6z" fill="var(--color-map-chip)" stroke={color} strokeWidth={s.ring * (24 / s.box)} strokeLinejoin="round" />
      </svg>
      <SpecialIcon kind={special.kind} size={s.icon} className="relative" />
    </span>
  );
}

/** Variant A over a whole map: one badge in each special plot's lower-right corner. */
export function BadgeLayer({ width, height, tiles, density }: { width: number; height: number; tiles: SpecialTile[]; density: Density }) {
  return (
    <div className="pointer-events-none absolute inset-px z-[3]" data-testid="special-layer-badge">
      {tiles.map((t) =>
        t.special ? (
          <span
            key={`${t.x},${t.y}`}
            className="absolute"
            data-testid={`special-glyph-${t.x}-${t.y}`}
            data-kind={t.special.kind}
            style={{ left: `${(t.x / width) * 100}%`, top: `${(t.y / height) * 100}%`, width: `${100 / width}%`, height: `${100 / height}%` }}
          >
            <SpecialBadge special={t.special} density={density} labelled className="absolute" style={{ right: t.x === width - 1 ? 2 : -BADGE[density].box * HANG, bottom: t.y === height - 1 ? 2 : -BADGE[density].box * HANG }} />
          </span>
        ) : null,
      )}
    </div>
  );
}

/** Ring stroke widths for variant B, in screen pixels per density (HoloMap's precedent, as above). */
const LAND = { phone: { ring: 1.6, edge: 3.4 }, tv: { ring: 2.6, edge: 5 } } as const;

/**
 * Variant B over a whole map, in plot units: a soft glow of the kind's colour pooled in the plot, a ring,
 * and the symbol across most of the plot. A relic also reaches into its four neighbours, which is what it
 * does. When the plot carries a centre chip (a MULE's good, or a geo analysis this screen shows), the symbol
 * moves up into the ring's crown so the chip does not hide it.
 */
export function LandLayer({ width, height, tiles, density, hideGround }: { width: number; height: number; tiles: SpecialTile[]; density: Density; hideGround: boolean }) {
  const px = LAND[density];
  const specials = tiles.filter((t): t is SpecialTile & { special: MapSpecial } => !!t.special);
  return (
    <svg className="pointer-events-none absolute inset-px z-[1] h-[calc(100%-2px)] w-[calc(100%-2px)]" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" data-testid="special-layer-landmark">
      <defs>
        {SPECIAL_KINDS.map((k) => (
          <radialGradient key={k} id={`special-glow-${k}`}>
            <stop offset="0%" stopColor={SPECIAL_COLOR[k]} stopOpacity={0.6} />
            <stop offset="65%" stopColor={SPECIAL_COLOR[k]} stopOpacity={0.22} />
            <stop offset="100%" stopColor={SPECIAL_COLOR[k]} stopOpacity={0} />
          </radialGradient>
        ))}
        <linearGradient id="special-beam" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={SPECIAL_COLOR.relic} stopOpacity={0.55} />
          <stop offset="100%" stopColor={SPECIAL_COLOR.relic} stopOpacity={0} />
        </linearGradient>
      </defs>
      {specials.map((t) => {
        const cx0 = t.x + 0.5;
        const cy0 = t.y + 0.5;
        const crowded = !!t.good || (!hideGround && !!t.ground);
        const color = SPECIAL_COLOR[t.special.kind];
        const icon = crowded ? 0.36 : 0.58;
        const iy = crowded ? t.y + 0.03 : cy0 - icon / 2;
        return (
          <g key={`${t.x},${t.y}`} role="img" aria-label={specialLabel(t.special)} data-testid={`special-glyph-${t.x}-${t.y}`} data-kind={t.special.kind}>
            {t.special.kind === 'relic' &&
              ([
                [0, -1],
                [1, 0],
                [0, 1],
                [-1, 0],
              ] as const).map(([dx, dy]) => {
                const nx = t.x + dx;
                const ny = t.y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) return null;
                const rot = dx === 1 ? -90 : dx === -1 ? 90 : dy === -1 ? 180 : 0;
                // A wedge of light from the relic's edge a third of a plot into the neighbour, fading as it goes.
                return (
                  <path
                    key={`${dx},${dy}`}
                    d={`M${cx0 - 0.13} ${cy0 + 0.46} L${cx0 + 0.13} ${cy0 + 0.46} L${cx0} ${cy0 + 0.8} Z`}
                    fill="url(#special-beam)"
                    transform={`rotate(${rot} ${cx0} ${cy0})`}
                  />
                );
              })}
            <circle cx={cx0} cy={cy0} r={0.5} fill={`url(#special-glow-${t.special.kind})`} />
            <circle cx={cx0} cy={cy0} r={0.37} fill="none" stroke="var(--color-mark-edge)" strokeWidth={px.edge} vectorEffect="non-scaling-stroke" />
            <circle cx={cx0} cy={cy0} r={0.37} fill="none" stroke={color} strokeWidth={px.ring} vectorEffect="non-scaling-stroke" />
            {crowded && <circle cx={cx0} cy={iy + icon / 2} r={icon / 2 + 0.03} fill="var(--color-map-chip)" />}
            <svg x={cx0 - icon / 2} y={iy} width={icon} height={icon} viewBox="0 0 24 24" overflow="visible">
              <path d={PATHS[t.special.kind]} fill="none" stroke="var(--color-mark-edge)" strokeWidth={4.4} strokeLinecap="round" strokeLinejoin="round" />
              <path d={PATHS[t.special.kind]} stroke={color} strokeWidth={2.2} fill={color} fillOpacity={0.3} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </g>
        );
      })}
    </svg>
  );
}

/** Variant B's mark alone, on a plain swatch: the legend and the phone card draw it. */
export function LandmarkSwatch({ kind, size }: { kind: SpecialKind; size: number }) {
  const color = SPECIAL_COLOR[kind];
  return (
    <svg aria-hidden viewBox="0 0 1 1" width={size} height={size} className="shrink-0">
      <defs>
        <radialGradient id={`swatch-glow-${kind}`}>
          <stop offset="0%" stopColor={color} stopOpacity={0.6} />
          <stop offset="65%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={0.5} cy={0.5} r={0.5} fill={`url(#swatch-glow-${kind})`} />
      <circle cx={0.5} cy={0.5} r={0.4} fill="none" stroke={color} strokeWidth={size > 30 ? 2.4 : 1.6} vectorEffect="non-scaling-stroke" />
      <svg x={0.2} y={0.2} width={0.6} height={0.6} viewBox="0 0 24 24">
        <path d={PATHS[kind]} stroke={color} strokeWidth={2.2} fill={color} fillOpacity={0.3} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </svg>
  );
}

/**
 * HoloMap with one variant's glyphs. Mock only: for B, the class below lifts HoloMap's plot grid and plot
 * layer above the land layer, so the overlay shows the graft's real order (Landscape, landmark, grid, plots)
 * without editing HoloMap. HoloMap's root sets no z-index, so its children stack in this wrapper's context.
 */
export function SpecialMap({ variant, tiles, ...map }: Omit<HoloMapProps, 'tiles'> & { variant: Variant; tiles: SpecialTile[] }) {
  const density = map.density ?? 'phone';
  return (
    <div className="relative isolate" data-testid={`special-map-${variant}-${density}`}>
      <HoloMap {...map} tiles={tiles} className={cx(map.className, variant === 'landmark' && '[&>.grid]:z-[2] [&>svg]:z-[2]')} />
      {variant === 'badge' ? (
        <BadgeLayer width={map.width} height={map.height} tiles={tiles} density={density} />
      ) : (
        <LandLayer width={map.width} height={map.height} tiles={tiles} density={density} hideGround={!!map.hideGround} />
      )}
    </div>
  );
}
