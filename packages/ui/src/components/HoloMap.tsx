import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react';
import { GoodIcon } from './GoodIcon';
import { Landscape } from './Landscape';
import { PlayerMark } from './PlayerMark';
import { SPECIAL_HANG, SpecialBadge, specialBadgeBox } from './SpecialIcon';
import { useTheme } from './theme';
import { cx, GOOD_NAME, SLOT_COLOR, specialLabel, TERRAIN_NAME, type Good, type MapSpecial, type Slot, type Terrain } from './tokens';
import { bestOf, gemsIn, type Dots, type RawGood } from '../ground-dots';

export interface MapTile {
  x: number;
  y: number;
  terrain: Terrain;
  owner: Slot | null;
  good?: Good;
  /** Units produced last month, floated above the plot. */
  output?: number;
  peaks?: number;
  /** Marks a plot: being surveyed, hit by sabotage, or up for sale. */
  flag?: 'survey' | 'sabotage' | 'sale';
  /** What a geo analysis found here, only on the map of the player who ran it: each raw good's dots, 0 to 3. */
  ground?: Partial<Record<Good, number>>;
  /** Local pollution, 0 clean to 3 toxic. Drawn as a brown haze over the land. */
  pollution?: number;
  /** The plot's special field, public on every map: drawn as a badge on the plot's lower-right corner. */
  special?: MapSpecial;
}

export interface MapAvatar {
  slot: Slot;
  /** Position in tiles; fractions place the avatar between plots. */
  x: number;
  y: number;
  carrying?: Good | 'empty';
  name?: string;
}

export interface HoloMapProps {
  width: number;
  height: number;
  tiles: MapTile[];
  /** The land grant cursor. */
  cursor?: { x: number; y: number } | null;
  selected?: { x: number; y: number } | null;
  avatars?: MapAvatar[];
  showOutput?: boolean;
  /** Fade plots that don't belong to this player, to focus a phone on their own land. */
  focusSlot?: Slot;
  onTile?(tile: MapTile): void;
  /** 'tv' is drawn for reading from across a room, 'phone' for a thumb. */
  density?: 'phone' | 'tv';
  /** Hide geo analysis glyphs, for the public big screen. */
  hideGround?: boolean;
  className?: string;
}

/** Every mark is a share of the plot's size, so it reads the same at any width. */
const SHARE = { border: 1 / 12, tab: 0.46, mark: 0.36, disc: 0.62, icon: 0.44, ring: 1 / 9 };

/** Under this plot width, in px, the phone's dots chip drops its good's icon and keeps its dots, so it fits inside the plot. */
const SMALL_DOTS_PLOT = 16;

/** Whether a plot `plot` px wide draws the small dots chip: only on a phone, only under SMALL_DOTS_PLOT. */
export function smallDots(plot: number, density: 'phone' | 'tv'): boolean {
  return density === 'phone' && plot < SMALL_DOTS_PLOT;
}

/**
 * How far under its plot's middle the phone's full dots chip ends its dot row, in px. Follows the chip's classes in
 * HoloMap: 17 px tall (2 px padding, a 9 px icon, a 1 px gap, 3 px dots). The small chip sits at its plot's foot.
 */
const DOTS_FOOT = 6.5;

/** The room from a phone plot's edge to the dots of the plot above it, less half a pixel, in px. */
function dotsRoom(plot: number): number {
  return plot / 2 - DOTS_FOOT - 0.5;
}

/**
 * Under this phone plot width, in px, the selected ring and its glow are drawn inside the plot (WS6 ruling on SA-1372,
 * 7 Nov). Measured, not chosen: a phone chip's three dots (3 px, 1 px apart, 11 px across) sit centred, (P − 11) / 2 from
 * the plot's side, and outside its plot the ring reaches 6% of P plus its band and its 2 px edge, the glow at half
 * strength 8% of P plus 4 px. From 24 px both stop short of a side neighbour's dots; at 23.8 px the ring reaches them.
 * A right-column special's chip steps left by its badge's hang, so the plot beside it draws its ring inside at any size.
 * Inside, the ring may cover only its own plot's dots, which the rail shows in full beside the map.
 */
export const RING_INSIDE_PLOT = 24;

/**
 * The selected ring outside its plot, in px: how far its box reaches out (`inset`; null for 6% of the plot, as drawn on
 * a larger plot), its holo band and its void edge. Under dots the three together stop within dotsRoom: the box comes in
 * first, then the band thins. `inside` on a phone plot under RING_INSIDE_PLOT: the ring is then drawn inside its plot.
 */
export function selectionRing(plot: number, density: 'phone' | 'tv'): { inset: number | null; band: number; edge: number; inside: boolean } {
  const band = Math.max(2, Math.round(plot * SHARE.ring));
  const edge = density === 'tv' ? 3 : 2;
  if (density === 'phone' && plot < RING_INSIDE_PLOT) return { inset: 0, band, edge, inside: true };
  const room = dotsRoom(plot);
  if (density === 'tv' || plot * 0.06 + band + edge <= room) return { inset: null, band, edge, inside: false };
  const thin = Math.max(1, Math.min(band, room - edge));
  return { inset: Math.max(0, room - thin - edge), band: thin, edge, inside: false };
}

/**
 * The small phone plot's strip (WS6 ruling on SA-1372, 7 Nov), in px: on a plot under SMALL_DOTS_PLOT that shows its
 * dots, the chip (7 px) sits half a pixel over the foot, and the owner's tab, the gem and a special's badge share one row
 * above it, 1 px clear of the chip and 1 px apart, half a pixel in from the plot's top and sides. Their outlines are drawn
 * inside their boxes there, so the gaps are as clear as they look. Each is at least a
 * dot's 3 px: when they don't all fit, the badge goes first, then the gem. Two gems overlap by half, as elsewhere.
 */
export const SMALL_STRIP = { inset: 0.5, gap: 1, chipFoot: 0.5, chip: 7, overChip: 1, min: 3 };

export function smallStrip(plot: number, want: { tab: boolean; gems: number; badge: boolean }): { top: number; size: number; tab: boolean; gems: number; badge: boolean } {
  const { inset, gap, chipFoot, chip, overChip, min } = SMALL_STRIP;
  const height = Math.min(plot * SHARE.tab, plot - chipFoot - chip - overChip - inset);
  const fit = (tab: boolean, gems: number, badge: boolean) => {
    const items = Number(tab) + Number(gems > 0) + Number(badge);
    const units = Number(tab) + (gems > 1 ? 1.5 : gems) + Number(badge);
    return units === 0 ? height : Math.min(height, (plot - 2 * inset - (items - 1) * gap) / units);
  };
  let { badge, gems } = want;
  if (badge && fit(want.tab, gems, badge) < min) badge = false;
  if (gems > 0 && fit(want.tab, gems, badge) < min) gems = 0;
  return { top: inset, size: Math.max(0, fit(want.tab, gems, badge)), tab: want.tab, gems, badge };
}

/** The selection's pulsing glow: its box reaches 8% of the plot out; its box-shadow's blur and spread, in px. */
/** out: the uncapped glow's reach, as the glow span's -inset-[8%] class draws it: change both together. */
const GLOW = { out: 0.08, phone: { blur: 12, spread: 4 }, tv: { blur: 26, spread: 8 } };

/**
 * How far the selection's glow box reaches out of its plot under the dots of the plot above, in px (negative: it stays
 * inside), or null where its usual 8% stops short of them. A box-shadow's blur is a Gaussian of σ = blur / 2 across the
 * spread edge, so the glow is at half strength on that edge, `spread` outside the box: capped, that edge stops at dotsRoom.
 */
export function selectionGlow(plot: number, density: 'phone' | 'tv'): number | null {
  if (density === 'tv') return null;
  const room = dotsRoom(plot);
  return plot * GLOW.out + GLOW.phone.spread <= room ? null : room - GLOW.phone.spread;
}

/**
 * From this phone plot width, in px, the store's STORE sign is drawn (WS6 ruling on SA-1372, #636): under it the sign
 * (about 33 px of 10 px mono) would reach a side neighbour's dots. The store plot keeps its look and its label.
 */
export const STORE_SIGN_PLOT = 24;

/** How far inside the map's right or bottom edge an edge plot's special badge sits, in px, where it can't hang out. */
const BADGE_EDGE = 2;

/** Before paint in the browser; the server renderer (and the node tests) has nothing to measure and no paint. */
const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * One plot's width in css px, from the map's layout width. Never from its box on screen: a zoom or a scaled screen
 * transforms the map, and the marks inside with it, so a size taken from the screen would be scaled twice.
 * Read as an external store that a ResizeObserver reports to: React commits a store's change before the browser
 * paints, so a resize never shows a frame of stale marks. (@mule/ui has no react-dom, so no flushSync.)
 */
function usePlotSize(width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const subscribe = useCallback((changed: () => void) => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return () => {};
    const ro = new ResizeObserver(changed);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const plot = useSyncExternalStore(subscribe, () => (ref.current ? ref.current.clientWidth / width : 30), () => 30);
  // The first render has no map to read yet: read it again before the first paint.
  const [, remeasure] = useReducer((n: number) => n + 1, 0);
  useBeforePaint(remeasure, []);
  return { ref, plot };
}

/**
 * The colony map: a painted landscape with a fine plot grid over it. An owned plot is bordered and tinted in its owner's
 * colour, with a corner tab holding the owner's creature; an installed good sits on a disc ringed in the good's colour.
 * Geo analysis results float above the land as chips, and a found Crystite or Rare earth as a gem at the plot's top.
 */
export function HoloMap({ width, height, tiles, cursor, selected, avatars = [], showOutput = false, focusSlot, onTile, density = 'phone', hideGround = false, className }: HoloMapProps) {
  const tv = density === 'tv';
  const theme = useTheme();
  const { ref, plot } = usePlotSize(width);
  const px = (share: number, min = 1) => Math.max(min, Math.round(plot * share));
  const size = { border: px(SHARE.border, 2), tab: px(SHARE.tab), mark: px(SHARE.mark), disc: px(SHARE.disc), icon: px(SHARE.icon), ring: px(SHARE.ring, 2) };
  const terrain = useMemo(() => {
    const grid: (Terrain | undefined)[] = new Array(width * height);
    for (const t of tiles) grid[t.y * width + t.x] = t.terrain;
    return grid;
  }, [tiles, width, height]);
  const cells = useMemo(() => {
    const grid: (MapTile | undefined)[] = new Array(width * height);
    for (const t of tiles) grid[t.y * width + t.x] = t;
    return grid;
  }, [tiles, width, height]);
  const badge = specialBadgeBox(plot, density);
  const ring = selectionRing(plot, density);
  const glow = selectionGlow(plot, density);
  const small = smallDots(plot, density);
  const groundOf = (t: MapTile) => (!hideGround && t.ground ? bestGoods(t.ground, tv ? 2 : 1) : []);
  /** Whether the plot draws its dots chip: an installed good shows instead. */
  const showsDots = (t: MapTile) => !t.good && groundOf(t).length > 0;

  return (
    <div
      ref={ref}
      // isolate: the map is one layer to whatever sits over it (a zoom button, a production show), whatever z its marks take inside.
      className={cx('relative isolate overflow-hidden rounded-panel border border-map-edge bg-map-base shadow-map', className)}
      style={{ aspectRatio: `${width} / ${height}` }}
      data-testid="holo-map"
    >
      <Landscape width={width} height={height} terrain={terrain} theme={theme} className="absolute inset-0" />
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        {Array.from({ length: width - 1 }, (_, i) => (
          <line key={`v${i}`} x1={i + 1} x2={i + 1} y1={0} y2={height} stroke="var(--color-map-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {Array.from({ length: height - 1 }, (_, i) => (
          <line key={`h${i}`} y1={i + 1} y2={i + 1} x1={0} x2={width} stroke="var(--color-map-grid)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${height}, minmax(0, 1fr))` }}>
        {tiles.map((t) => {
          const isCursor = cursor && cursor.x === t.x && cursor.y === t.y;
          const isSelected = !!selected && selected.x === t.x && selected.y === t.y;
          const owner = t.owner === null ? null : SLOT_COLOR[t.owner];
          const faded = focusSlot !== undefined && t.owner !== null && t.owner !== focusSlot;
          // A faded plot fades its marks, never its selection.
          const fade = cx('transition-opacity', faded && 'opacity-45');
          // The map clips at its edge, so an edge plot's selection is drawn inside it, and on the top row the pin hangs below.
          const onEdge = t.x === 0 || t.y === 0 || t.x === width - 1 || t.y === height - 1;
          const ground = groundOf(t);
          const above = t.y > 0 ? cells[(t.y - 1) * width + t.x] : undefined;
          // The pin would hang over the dots of the plot it points from, above, or below on the top row: there the ring alone marks the selection.
          const under = t.y === 0 ? cells[width + t.x] : above;
          const pin = !under || !showsDots(under);
          const underDots = !!above && showsDots(above);
          // Inside the plot on the map's edge, which clips, and on a phone plot too small for a ring outside to miss its neighbours' dots,
          // or beside a right-column special, whose chip steps left towards this plot (RING_INSIDE_PLOT assumes centred dots).
          const right = t.x < width - 1 ? cells[t.y * width + t.x + 1] : undefined;
          const besideStepped = !tv && !small && !!right && right.x === width - 1 && !!right.special && showsDots(right);
          const inner = onEdge || ring.inside || besideStepped;
          const glowOut = !inner && underDots ? glow : null;
          const gems = !hideGround && t.ground ? gemsIn(t.ground) : [];
          // Under 16 px on a phone (SA-1372): the chip sits at the foot and the tab, the gem and the badge share the strip above it.
          const strip = small && showsDots(t) ? smallStrip(plot, { tab: t.owner !== null, gems: gems.length, badge: !!t.special }) : null;
          const at = `${t.x}-${t.y}`;
          const label = [
            TERRAIN_NAME[t.terrain],
            t.special ? specialLabel(t.special) : '',
            t.owner !== null ? `owned by player ${t.owner + 1}` : t.terrain === 'store' ? '' : 'free',
            t.good ? `${GOOD_NAME[t.good]}${t.output ? ` +${t.output}` : ''}` : '',
            ...ground.map(([g, n]) => `${GOOD_NAME[g]} ${n} of 3`),
            ...gems.map((g) => `${GOOD_NAME[g]} here`),
            t.pollution ? `pollution ${t.pollution} of 3` : '',
            t.flag ? FLAG_WORDS[t.flag] : '',
          ]
            .filter(Boolean)
            .join(', ');
          const Tag = onTile ? 'button' : 'div';
          return (
            <Tag
              key={`${t.x},${t.y}`}
              {...(onTile ? { type: 'button' as const, onClick: () => onTile(t), 'aria-label': label } : { 'aria-label': label })}
              className={cx('relative flex items-center justify-center', onTile && 'cursor-pointer', isSelected && 'z-[6]')}
              data-testid={`map-plot-${t.x}-${t.y}`}
              {...(isSelected ? { 'data-selected': true } : {})}
            >
              {/* The haze and the ground pips go under the owner's tint: background, showing through it. */}
              {!!t.pollution && (
                <span
                  aria-hidden
                  className={cx('absolute inset-0', fade)}
                  style={{ background: `radial-gradient(circle at 50% 55%, rgb(110 82 40 / ${0.25 + t.pollution * 0.18}), rgb(110 82 40 / ${0.12 + t.pollution * 0.12}) 80%)` }}
                />
              )}
              {/* On a small plot a flag takes the chip's place while it shows (SA-1372). */}
              {showsDots(t) && !(strip && t.flag) && (
                // The full chip (17 px) can stand taller than a 16 px plot: a tap on what overhangs goes to the plot beneath.
                <span
                  className={cx(
                    'pointer-events-none flex flex-col items-center rounded-control bg-map-chip/90 shadow-chip',
                    tv ? 'relative gap-0.5 px-1.5 py-1' : small ? 'absolute left-1/2 -translate-x-1/2 px-px py-[2px]' : 'relative px-[3px] py-[2px]',
                    fade,
                  )}
                  // In the right column the badge sits inside the plot instead of hanging out: the chip steps left by as much,
                  // except the small chip, which fills its plot's width and would step into the next plot.
                  style={small ? { bottom: SMALL_STRIP.chipFoot } : t.special && t.x === width - 1 ? { left: -(badge * SPECIAL_HANG + BADGE_EDGE) } : undefined}
                  data-testid={`map-dots-${t.x}-${t.y}`}
                >
                  {ground.map(([g, n]) => (
                    <span key={g} className={cx('flex items-center', tv ? 'gap-0.5' : 'flex-col gap-px')}>
                      {!small && <GoodIcon good={g} size={tv ? 16 : 9} />}
                      <Pips n={n} tv={tv} good={g} />
                    </span>
                  ))}
                </span>
              )}
              {owner && (
                <span aria-hidden className={cx('absolute inset-[2%] rounded-[10%]', fade)} style={{ boxShadow: `inset 0 0 0 ${size.border}px ${owner}`, background: `color-mix(in srgb, ${owner} 30%, transparent)` }} />
              )}
              {strip && (strip.tab || strip.gems > 0 || strip.badge) && (
                // z-[4], the tab's: above the badge layer of the plot up-left and the tint.
                <span className={cx('pointer-events-none absolute z-[4] flex items-center', fade)} style={{ left: strip.top, top: strip.top, height: strip.size, gap: SMALL_STRIP.gap }} data-testid={`map-strip-${at}`}>
                  {owner && t.owner !== null && (
                    <span
                      className="flex shrink-0 items-center justify-center rounded-[30%] bg-map-chip"
                      style={{ width: strip.size, height: strip.size, boxShadow: `inset 0 0 0 1px ${owner}` }}
                      data-testid={`owner-${at}`}
                    >
                      <PlayerMark slot={t.owner} size={(strip.size * SHARE.mark) / SHARE.tab} glow={false} />
                    </span>
                  )}
                  {strip.gems > 0 && (
                    <span className="flex shrink-0" data-testid={`map-gem-${at}`}>
                      {gems.map((g, i) => (
                        <MapGem key={g} good={g} nth={i} size={strip.size} unit="px" outlineInside />
                      ))}
                    </span>
                  )}
                  {strip.badge && t.special && (
                    <span className="relative flex shrink-0" data-testid={`special-glyph-${at}`} data-kind={t.special.kind}>
                      <SpecialBadge special={t.special} density={density} box={strip.size} halo={false} />
                    </span>
                  )}
                </span>
              )}
              {owner && t.owner !== null && !strip && (
                // z-[4]: above the badge layer, so a special's badge hung in from the plot up-left never covers the owner's tab.
                <span
                  className={cx('absolute left-[4%] top-[4%] z-[4] flex items-center justify-center rounded-[30%] bg-map-chip shadow-chip', fade)}
                  style={{ width: size.tab, height: size.tab, boxShadow: `0 0 0 ${tv ? 2 : 1}px ${owner}` }}
                  data-testid={`owner-${t.x}-${t.y}`}
                >
                  <PlayerMark slot={t.owner} size={size.mark} glow={false} />
                </span>
              )}
              {gems.length > 0 && !strip && (
                // Right of the tab, which is 46% wide at 4%; z-[4], the tab's, so a neighbour's special badge never covers it.
                <span
                  className={cx('pointer-events-none absolute top-[4%] z-[4] flex w-full', t.owner !== null ? 'left-[54%]' : 'left-[4%]', fade)}
                  data-testid={`map-gem-${t.x}-${t.y}`}
                >
                  {gems.map((g, i) => (
                    <MapGem key={g} good={g} nth={i} size={t.owner !== null && gems.length > 1 ? 30 : 40} unit="%" />
                  ))}
                </span>
              )}
              {/* Hidden on a phone plot under STORE_SIGN_PLOT, where it would cover its neighbours' dots (WS6, SA-1372). */}
              {t.terrain === 'store' && (tv || plot >= STORE_SIGN_PLOT) && (
                <span className={cx('relative rounded-chip bg-map-chip font-mono font-bold text-holo shadow-chip', tv ? 'px-2 py-0.5 text-sm' : 'px-0.5 text-[10px] tracking-tight')} data-testid="map-store">
                  STORE
                </span>
              )}
              {t.good && (
                <span
                  className={cx('relative z-[2] flex items-center justify-center rounded-full bg-map-chip shadow-chip', fade)}
                  style={{ width: size.disc, height: size.disc, boxShadow: `0 0 0 ${tv ? 3 : 2}px var(--color-g-${t.good})` }}
                  data-testid={`installed-${t.x}-${t.y}`}
                >
                  <GoodIcon good={t.good} size={size.icon} />
                  {showOutput && t.output !== undefined && (
                    // Centred on the disc's rim at its lower left, the corner the plot's badge leaves free: 50% ∓ 50%/√2.
                    <span
                      data-num
                      className={cx('absolute left-[15%] top-[85%] -translate-x-1/2 -translate-y-1/2 rounded-chip bg-map-chip px-0.5 font-mono font-bold leading-none text-ink', tv ? 'text-lg' : 'text-[8px]')}
                      style={{ boxShadow: `0 0 0 ${tv ? 2 : 1}px var(--color-g-${t.good})` }}
                    >
                      +{t.output}
                    </span>
                  )}
                </span>
              )}
              {t.flag && small && (
                // Under 16 px a flag is a 7×7 glyph chip in the dots chip's place, on any plot (PM ruling A, WS6's glyphs, SA-1372):
                // its word would cover a neighbour's dots. The plot's label carries the word.
                <span
                  className={cx('absolute left-1/2 z-[4] grid size-[7px] -translate-x-1/2 place-items-center rounded-[1.5px] shadow-chip', FLAG_TONE[t.flag], fade)}
                  style={{ bottom: SMALL_STRIP.chipFoot }}
                  data-testid={`map-flag-${at}`}
                >
                  <FlagGlyph flag={t.flag} />
                </span>
              )}
              {t.flag && !small && (
                // z-[4], after the tab: above the disc and the tab.
                <span
                  className={cx(
                    'absolute right-0.5 top-0.5 z-[4] rounded-chip font-mono font-bold leading-tight shadow-chip',
                    tv ? 'px-1 text-[11px]' : 'px-0.5 text-[10px]',
                    FLAG_TONE[t.flag],
                    fade,
                  )}
                  data-testid={`map-flag-${at}`}
                >
                  {t.flag === 'sabotage' ? 'OFF' : t.flag === 'sale' ? 'SALE' : 'SCAN'}
                </span>
              )}
              {/* Under 16 px a MULE's plot draws no badge: the MULE wins, as the strip drops the badge first (WS6, SA-1372). */}
              {t.special && !strip && !(small && t.good) && (
                // Above the plot's chips and its right and lower neighbours', under the owners' marks (z-[4]), and never in the way of a
                // tap: the tap goes to the plot beneath.
                <span aria-hidden className={cx('pointer-events-none absolute inset-0 z-[3]', fade)} data-testid={`special-glyph-${t.x}-${t.y}`} data-kind={t.special.kind}>
                  <SpecialBadge
                    special={t.special}
                    density={density}
                    box={badge}
                    className="absolute"
                    style={{
                      // On a small phone plot it stays inside too: hung out, it would sit on the next plot's chip at its foot (SA-1372).
                      right: t.x === width - 1 || small ? BADGE_EDGE : -badge * SPECIAL_HANG,
                      bottom: t.y === height - 1 || small ? BADGE_EDGE : -badge * SPECIAL_HANG,
                    }}
                  />
                </span>
              )}
              {isSelected && (
                <>
                  {/* The ring stays solid; only its glow breathes, so the selection never dims. */}
                  <span
                    aria-hidden
                    className={cx('pointer-events-none absolute z-[5] motion-safe:animate-pulse', inner ? 'inset-0 rounded-[10%]' : cx('rounded-[16%]', glowOut === null && '-inset-[8%]'))}
                    style={{
                      ...(glowOut !== null ? { inset: -glowOut } : {}),
                      boxShadow: `${inner ? 'inset ' : ''}0 0 ${GLOW[density].blur}px ${GLOW[density].spread}px var(--color-holo)`,
                    }}
                    data-testid="selected-glow"
                  />
                  <span
                    aria-hidden
                    className={cx('pointer-events-none absolute z-[5]', inner ? 'inset-0 rounded-[10%]' : cx('rounded-[14%]', ring.inset === null && '-inset-[6%]'))}
                    style={{
                      ...(!inner && ring.inset !== null ? { inset: -ring.inset } : {}),
                      boxShadow: inner
                        ? `inset 0 0 0 ${size.ring}px var(--color-holo-strong), inset 0 0 0 ${size.ring + (tv ? 3 : 2)}px var(--color-void)`
                        : `0 0 0 ${ring.band}px var(--color-holo-strong), 0 0 0 ${ring.band + ring.edge}px var(--color-void)`,
                    }}
                    data-testid="selected-ring"
                  />
                  {pin && (
                    <span
                      className={cx(
                        'pointer-events-none absolute left-1/2 z-[6] -translate-x-1/2 whitespace-nowrap rounded-chip bg-holo font-mono font-bold text-on-holo shadow-glow',
                        t.y === 0 ? 'top-full mt-1' : 'bottom-full mb-1',
                        tv ? 'px-2 py-0.5 text-sm' : 'px-1 text-[8px]',
                      )}
                      data-testid="selected-pin"
                    >
                      {t.y === 0 ? '▴' : '▾'}
                    </span>
                  )}
                </>
              )}
              {isCursor && (
                // z-[5]: the selection's level, so no tint, tab or badge dims the plot the grant lights.
                <span aria-hidden className="pointer-events-none absolute inset-[2%] z-[5] overflow-hidden rounded-[14%] border-[3px] border-holo bg-holo-soft shadow-glow">
                  <span className="absolute inset-x-0 h-1/3 animate-scan bg-holo/25" />
                </span>
              )}
            </Tag>
          );
        })}
      </div>
      {avatars.map((a) => (
        // z-[5]: above every plot's marks, under the selected plot (z-[6]), so a walker never hides the selection.
        <div
          key={a.slot}
          className="pointer-events-none absolute z-[5] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 transition-[left,top] duration-700 ease-out"
          style={{ left: `${((a.x + 0.5) / width) * 100}%`, top: `${((a.y + 0.5) / height) * 100}%` }}
        >
          <PlayerMark slot={a.slot} size={tv ? 38 : 18} label={a.name} className="drop-shadow-md" />
          {a.carrying && (
            <span className={cx('flex items-center gap-0.5 rounded-full bg-map-chip px-1 font-mono font-bold text-ink shadow-chip', tv ? 'text-[11px]' : 'text-[7px]')}>
              MULE{a.carrying !== 'empty' && <GoodIcon good={a.carrying} size={tv ? 12 : 8} />}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The plot's best goods with their dots, best first, each by bestOf so the map and the rail name the same one. The best
 * is shown even at 0 dots (analysed, nothing there); a runner-up only with a dot.
 */
function bestGoods(dots: Dots, count: number): [Good, number][] {
  const left = { ...dots };
  const out: [Good, number][] = [];
  for (let best = bestOf(left); best !== undefined && out.length < count && (out.length === 0 || left[best]! > 0); best = bestOf(left)) {
    out.push([best, left[best]!]);
    delete left[best];
  }
  return out;
}

/** A plot's flag: its chip's colours, and the words its plot's label says it with (WS6, SA-1372). */
const FLAG_TONE = { sabotage: 'bg-alert text-white', sale: 'bg-warn text-void', survey: 'bg-holo text-on-holo' } as const;
const FLAG_WORDS = { sabotage: 'switched off', sale: 'listed for sale', survey: 'drone scan' } as const;

/**
 * A flag's glyph on a small plot, 7×7 in the chip's text colour (WS6's paths, Jira SA-1372 comment 15290): OFF a cross,
 * SCAN a ring with a centre dot, SALE a gavel drawn as an upright T. They differ by shape, so they read in greyscale.
 */
function FlagGlyph({ flag }: { flag: 'survey' | 'sabotage' | 'sale' }) {
  return (
    <svg aria-hidden viewBox="0 0 7 7" width={7} height={7}>
      {flag === 'sabotage' && <path d="M2.1 2.1L4.9 4.9M4.9 2.1L2.1 4.9" stroke="currentColor" strokeWidth={1.15} strokeLinecap="round" />}
      {flag === 'survey' && (
        <>
          <circle cx="3.5" cy="3.5" r="2.05" fill="none" stroke="currentColor" strokeWidth={0.95} />
          <circle cx="3.5" cy="3.5" r="0.75" fill="currentColor" />
        </>
      )}
      {flag === 'sale' && (
        <>
          <rect x="1.4" y="1.5" width="4.2" height="1.6" rx="0.3" fill="currentColor" />
          <rect x="3" y="3.1" width="1" height="2.5" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/** A found Crystite or Rare earth, `size` wide (a share of the plot, or px in the small strip); a second gem overlaps the first by half. */
function MapGem({ good, nth, size, unit, outlineInside = false }: { good: RawGood; nth: number; size: number; unit: '%' | 'px'; outlineInside?: boolean }) {
  return (
    <span
      className={cx('relative grid aspect-square shrink-0 place-items-center rounded-full ring-1 ring-white/80', outlineInside ? 'ring-inset' : 'shadow-chip')}
      style={{ width: `${size}${unit}`, background: `var(--color-g-${good})`, marginLeft: nth > 0 ? `-${size / 2}${unit}` : 0, zIndex: 2 - nth }}
      data-testid={`gem-${good}`}
    >
      <GoodIcon good={good} color="white" className="h-[62%] w-[62%]" />
    </span>
  );
}

function Pips({ n, tv, good }: { n: number; tv: boolean; good: Good }) {
  return (
    <span className="flex gap-px" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cx('rounded-full', tv ? 'size-1.5' : 'size-[3px]')}
          style={{ background: i <= n ? `var(--color-g-${good})` : 'var(--color-map-grid)' }}
        />
      ))}
    </span>
  );
}
