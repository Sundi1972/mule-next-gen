import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GoodIcon } from './GoodIcon';
import { Landscape } from './Landscape';
import { PlayerMark } from './PlayerMark';
import { SPECIAL_BADGE, SPECIAL_HANG, SpecialBadge } from './SpecialIcon';
import { useTheme } from './theme';
import { cx, GOOD_NAME, SLOT_COLOR, specialLabel, TERRAIN_NAME, type Good, type MapSpecial, type Slot, type Terrain } from './tokens';

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
  /** What a geo analysis found here, only on the map of the player who ran it. Ratings 1 to 4. */
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

/**
 * Every mark is a share of the plot's size, so it reads the same at any width: the installed disc fills most of the
 * plot, the owner's tab nearly half of it, the border a twelfth.
 */
const SHARE = { border: 1 / 12, tab: 0.46, mark: 0.36, disc: 0.62, icon: 0.44, ring: 1 / 9 };

/** Before paint in the browser; the server renderer (and the node tests) has nothing to measure and no paint. */
const useBeforePaint = typeof document === 'undefined' ? useEffect : useLayoutEffect;

/**
 * One plot's width in css px, from the map's layout width. Never from its box on screen: a zoom or a scaled screen
 * transforms the map, and the marks inside with it, so a size taken from the screen would be scaled twice.
 */
function usePlotSize(width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [plot, setPlot] = useState(30);
  useBeforePaint(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setPlot(el.clientWidth / width);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return { ref, plot };
}

/**
 * The colony map: a painted landscape with a fine plot grid over it. An owned plot is bordered and tinted in its owner's
 * colour, with a corner tab holding the owner's creature; an installed good sits on a disc ringed in the good's colour.
 * Geo analysis results float above the land as chips.
 */
export function HoloMap({ width, height, tiles, cursor, selected, avatars = [], showOutput = false, focusSlot, onTile, density = 'phone', hideGround = false, className }: HoloMapProps) {
  const tv = density === 'tv';
  const theme = useTheme();
  const { ref, plot } = usePlotSize(width);
  const px = (share: number, min = 1) => Math.max(min, Math.round(plot * share));
  const z = { border: px(SHARE.border, 2), tab: px(SHARE.tab), mark: px(SHARE.mark), disc: px(SHARE.disc), icon: px(SHARE.icon), ring: px(SHARE.ring, 2) };
  const terrain = useMemo(() => {
    const grid: (Terrain | undefined)[] = new Array(width * height);
    for (const t of tiles) grid[t.y * width + t.x] = t.terrain;
    return grid;
  }, [tiles, width, height]);

  return (
    <div
      ref={ref}
      // isolate: the map is one layer to whatever sits over it (a zoom button, a production show), whatever z its marks take inside.
      className={cx('relative isolate overflow-hidden rounded-panel border border-map-edge bg-map-base shadow-map', className)}
      style={{ aspectRatio: `${width} / ${height}` }}
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
          const ground = !hideGround && t.ground ? (Object.entries(t.ground) as [Good, number][]).sort((a, b) => b[1] - a[1]).slice(0, tv ? 2 : 1) : [];
          const label = [
            TERRAIN_NAME[t.terrain],
            t.special ? specialLabel(t.special) : '',
            t.owner !== null ? `owned by player ${t.owner + 1}` : t.terrain === 'store' ? '' : 'free',
            t.good ? `${GOOD_NAME[t.good]}${t.output ? ` +${t.output}` : ''}` : '',
            ...ground.map(([g, n]) => `${GOOD_NAME[g]} ${n} of 4`),
            t.pollution ? `pollution ${t.pollution} of 3` : '',
          ]
            .filter(Boolean)
            .join(', ');
          const Tag = onTile ? 'button' : 'div';
          return (
            <Tag
              key={`${t.x},${t.y}`}
              {...(onTile ? { type: 'button' as const, onClick: () => onTile(t), 'aria-label': label } : { 'aria-label': label })}
              className={cx('relative flex items-center justify-center transition-opacity', faded && 'opacity-45', onTile && 'cursor-pointer', isSelected && 'z-[6]')}
              data-testid={`map-plot-${t.x}-${t.y}`}
              {...(isSelected ? { 'data-selected': true } : {})}
            >
              {/* The haze and the ground pips go under the owner's tint: background, showing through it. */}
              {!!t.pollution && (
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{ background: `radial-gradient(circle at 50% 55%, rgb(110 82 40 / ${0.25 + t.pollution * 0.18}), rgb(110 82 40 / ${0.12 + t.pollution * 0.12}) 80%)` }}
                />
              )}
              {!t.good && ground.length > 0 && (
                <span className={cx('relative flex flex-col items-center rounded-control bg-map-chip/90 shadow-chip', tv ? 'gap-0.5 px-1.5 py-1' : 'px-[3px] py-[2px]')}>
                  {ground.map(([g, n]) => (
                    <span key={g} className={cx('flex items-center', tv ? 'gap-0.5' : 'flex-col gap-px')}>
                      <GoodIcon good={g} size={tv ? 16 : 9} />
                      <Pips n={n} tv={tv} good={g} />
                    </span>
                  ))}
                </span>
              )}
              {owner && (
                <span aria-hidden className="absolute inset-[2%] rounded-[10%]" style={{ boxShadow: `inset 0 0 0 ${z.border}px ${owner}`, background: `color-mix(in srgb, ${owner} 30%, transparent)` }} />
              )}
              {owner && t.owner !== null && (
                // z-[4]: above the badge layer, so a special's badge hung in from the plot up-left never covers the owner's tab.
                <span
                  className="absolute left-[4%] top-[4%] z-[4] flex items-center justify-center rounded-[30%] bg-map-chip shadow-chip"
                  style={{ width: z.tab, height: z.tab, boxShadow: `0 0 0 ${tv ? 2 : 1}px ${owner}` }}
                  data-testid={`owner-${t.x}-${t.y}`}
                >
                  <PlayerMark slot={t.owner} size={z.mark} glow={false} />
                </span>
              )}
              {t.terrain === 'store' && (
                <span className={cx('relative rounded-chip bg-map-chip font-mono font-bold text-holo shadow-chip', tv ? 'px-2 py-0.5 text-sm' : 'px-1 text-[8px]')}>STORE</span>
              )}
              {t.good && (
                <span
                  className="relative z-[2] flex items-center justify-center rounded-full bg-map-chip shadow-chip"
                  style={{ width: z.disc, height: z.disc, boxShadow: `0 0 0 ${tv ? 3 : 2}px var(--color-g-${t.good})` }}
                  data-testid={`installed-${t.x}-${t.y}`}
                >
                  <GoodIcon good={t.good} size={z.icon} />
                  {showOutput && t.output !== undefined && (
                    // Centred on the disc's rim at its lower right: 50% + 50%/√2.
                    <span
                      data-num
                      className={cx('absolute left-[85%] top-[85%] -translate-x-1/2 -translate-y-1/2 rounded-chip bg-map-chip px-0.5 font-mono font-bold leading-none text-ink', tv ? 'text-lg' : 'text-[8px]')}
                      style={{ boxShadow: `0 0 0 ${tv ? 2 : 1}px var(--color-g-${t.good})` }}
                    >
                      +{t.output}
                    </span>
                  )}
                </span>
              )}
              {t.flag && (
                <span
                  className={cx(
                    'absolute right-0.5 top-0.5 rounded-chip px-1 font-mono font-bold leading-tight shadow-chip',
                    tv ? 'text-[11px]' : 'text-[7px]',
                    t.flag === 'sabotage' ? 'bg-alert text-white' : t.flag === 'sale' ? 'bg-warn text-void' : 'bg-holo text-on-holo',
                  )}
                >
                  {t.flag === 'sabotage' ? 'OFF' : t.flag === 'sale' ? 'SALE' : 'SCAN'}
                </span>
              )}
              {t.special && (
                // Above the plot's chips and its right and lower neighbours', under the owners' marks (z-[4]), and never in the way of a
                // tap: the tap goes to the plot beneath. A faded plot's opacity makes it its own layer, so there the overhang goes
                // under the right and lower neighbours.
                <span aria-hidden className="pointer-events-none absolute inset-0 z-[3]" data-testid={`special-glyph-${t.x}-${t.y}`} data-kind={t.special.kind}>
                  <SpecialBadge
                    special={t.special}
                    density={density}
                    className="absolute"
                    style={{
                      right: t.x === width - 1 ? 2 : -SPECIAL_BADGE[density].box * SPECIAL_HANG,
                      bottom: t.y === height - 1 ? 2 : -SPECIAL_BADGE[density].box * SPECIAL_HANG,
                    }}
                  />
                </span>
              )}
              {isSelected && (
                <>
                  {/* The ring stays solid; only its glow breathes, so the selection never dims. */}
                  <span aria-hidden className="pointer-events-none absolute -inset-[8%] z-[5] rounded-[16%] motion-safe:animate-pulse" style={{ boxShadow: `0 0 ${tv ? 26 : 12}px ${tv ? 8 : 4}px var(--color-holo)` }} />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -inset-[6%] z-[5] rounded-[14%]"
                    style={{ boxShadow: `0 0 0 ${z.ring}px var(--color-holo-strong), 0 0 0 ${z.ring + (tv ? 3 : 2)}px var(--color-void)` }}
                    data-testid="selected-ring"
                  />
                  <span
                    className={cx(
                      'pointer-events-none absolute bottom-full left-1/2 z-[6] mb-1 -translate-x-1/2 whitespace-nowrap rounded-chip bg-holo font-mono font-bold text-on-holo shadow-glow',
                      tv ? 'px-2 py-0.5 text-sm' : 'px-1 text-[8px]',
                    )}
                    data-testid="selected-pin"
                  >
                    {tv ? 'SELECTED ▾' : '▾'}
                  </span>
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
        <div
          key={a.slot}
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 transition-[left,top] duration-700 ease-out"
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

function Pips({ n, tv, good }: { n: number; tv: boolean; good: Good }) {
  return (
    <span className="flex gap-px" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cx('rounded-full', tv ? 'size-1.5' : 'size-[3px]')}
          style={{ background: i <= n ? `var(--color-g-${good})` : 'var(--color-map-grid)' }}
        />
      ))}
    </span>
  );
}
