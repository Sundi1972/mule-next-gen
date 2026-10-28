import { cx, GOOD_NAME, GoodIcon, Landscape, PlayerMark, SLOT_COLOR, SPECIAL_BADGE, SPECIAL_HANG, SpecialBadge, specialLabel, TERRAIN_NAME, useTheme, type Good, type HoloMapProps, type MapTile, type Slot, type Terrain } from '@mule/ui';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * Plots you can read from the couch (Heiko's playtest, 2026-10-28: "the plot that I selected must be clearer visible.
 * it is hard to see which plot belongs to which player and what is on them"). Today an owned plot is a 2-3 px outline
 * at 16% tint with a 7-12 px owner mark, and what's installed is a 10-20 px chip.
 *
 * Two looks for who owns a plot; the same big installed icon and the same strong selection in both:
 * - A · bold plots: every owned plot gets a thick border and a strong tint in its owner's colour, and a corner tab with
 *   the owner's creature, big enough to tell the species' shapes apart without colour.
 * - B · territories: a thick border only round the edge of each player's land, so whole holdings read as shapes, and a
 *   hatch pattern unique to each player inside, so ownership reads without colour.
 *
 * GRAFT TARGET: packages/ui/src/components/HoloMap.tsx (WS4 owns and reviews; named edits). Keeps the hooks CI reads:
 * the tile's aria-label "owned by player N", a [data-slot] element (PlayerMark) inside each owned plot, the special's
 * data-testid special-glyph-<x>-<y> with data-kind, and the owner's mark above a neighbour's special badge (z-[4] > z-[3]).
 */

export type PlotLook = 'A' | 'B';

/**
 * Every mark is a share of the plot's size, so it reads the same at any width: the installed disc fills most of the plot,
 * the owner's tab a third of it, the border a twelfth. A TV plot is about 47 px at the TV's map width, a sideways phone's
 * about 26 px.
 */
const SHARE = { border: 1 / 12, tab: 0.46, mark: 0.36, disc: 0.62, icon: 0.44, ring: 1 / 9 };

/** The size of one plot, in css px, as drawn now. */
function usePlotSize(width: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [plot, setPlot] = useState(30);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setPlot(el.getBoundingClientRect().width / width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return { ref, plot };
}

/** Each seat's hatch, different in angle or kind, so plots tell owners apart without colour (B). */
function hatch(slot: Slot, color: string, tv: boolean): string {
  const a = `color-mix(in srgb, ${color} 34%, transparent)`;
  const w = tv ? 4 : 2;
  const gap = tv ? 11 : 6;
  const lines = (deg: number) => `repeating-linear-gradient(${deg}deg, ${a} 0 ${w}px, transparent ${w}px ${gap}px)`;
  switch (slot) {
    case 0:
      return lines(45);
    case 1:
      return lines(-45);
    case 2:
      return lines(0);
    case 3:
      return lines(90);
    case 4:
      return `radial-gradient(${a} ${w * 0.7}px, transparent ${w * 0.7 + 0.5}px) 0 0 / ${gap}px ${gap}px`;
    default:
      return `${lines(45)}, ${lines(-45)}`;
  }
}

export function PlotMap({
  width,
  height,
  tiles,
  selected,
  focusSlot,
  onTile,
  density = 'phone',
  hideGround = true,
  className,
  look,
}: Omit<HoloMapProps, 'cursor' | 'avatars' | 'showOutput'> & { look: PlotLook }) {
  const tv = density === 'tv';
  const { ref, plot } = usePlotSize(width);
  const px = (share: number, min = 1) => Math.max(min, Math.round(plot * share));
  const z = { border: px(SHARE.border, 2), tab: px(SHARE.tab), mark: px(SHARE.mark), disc: px(SHARE.disc), icon: px(SHARE.icon), ring: px(SHARE.ring, 2) };
  const theme = useTheme();
  const terrain = useMemo(() => {
    const grid: (Terrain | undefined)[] = new Array(width * height);
    for (const t of tiles) grid[t.y * width + t.x] = t.terrain;
    return grid;
  }, [tiles, width, height]);
  const ownerAt = useMemo(() => {
    const m = new Map<string, Slot | null>();
    for (const t of tiles) m.set(`${t.x},${t.y}`, t.owner);
    return (x: number, y: number) => m.get(`${x},${y}`) ?? null;
  }, [tiles]);

  return (
    <div ref={ref} className={cx('relative isolate overflow-hidden rounded-panel border border-map-edge bg-map-base shadow-map', className)} style={{ aspectRatio: `${width} / ${height}` }} data-testid={`plot-map-${look}`}>
      <Landscape width={width} height={height} terrain={terrain} theme={theme} className="absolute inset-0" />
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${height}, minmax(0, 1fr))` }}>
        {tiles.map((t) => {
          const isSelected = !!selected && selected.x === t.x && selected.y === t.y;
          const color = t.owner === null ? null : SLOT_COLOR[t.owner];
          const faded = focusSlot !== undefined && t.owner !== null && t.owner !== focusSlot;
          const label = [TERRAIN_NAME[t.terrain], t.special ? specialLabel(t.special) : '', t.owner !== null ? `owned by player ${t.owner + 1}` : t.terrain === 'store' ? '' : 'free', t.good ? GOOD_NAME[t.good] : '']
            .filter(Boolean)
            .join(', ');
          const Tag = onTile ? 'button' : 'div';
          // B: which sides face land that isn't this owner's, for the territory's edge.
          const edge = color && look === 'B'
            ? {
                top: ownerAt(t.x, t.y - 1) !== t.owner,
                right: ownerAt(t.x + 1, t.y) !== t.owner,
                bottom: ownerAt(t.x, t.y + 1) !== t.owner,
                left: ownerAt(t.x - 1, t.y) !== t.owner,
              }
            : null;
          return (
            <Tag
              key={`${t.x},${t.y}`}
              {...(onTile ? { type: 'button' as const, onClick: () => onTile(t as MapTile) } : {})}
              aria-label={label}
              className={cx('relative flex items-center justify-center transition-opacity', faded && 'opacity-45', onTile && 'cursor-pointer', isSelected && 'z-[6]')}
              data-testid={`map-plot-${t.x}-${t.y}`}
              {...(isSelected ? { 'data-selected': true } : {})}
            >
              {color && look === 'A' && (
                <span aria-hidden className="absolute inset-[2%] rounded-[10%]" style={{ boxShadow: `inset 0 0 0 ${z.border}px ${color}`, background: `color-mix(in srgb, ${color} 30%, transparent)` }} />
              )}
              {color && edge && t.owner !== null && (
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background: hatch(t.owner, color, tv),
                    borderStyle: 'solid',
                    borderColor: color,
                    borderTopWidth: edge.top ? z.border : 0,
                    borderRightWidth: edge.right ? z.border : 0,
                    borderBottomWidth: edge.bottom ? z.border : 0,
                    borderLeftWidth: edge.left ? z.border : 0,
                  }}
                />
              )}
              {color && t.owner !== null && (
                // z-[4]: above the special badge layer (z-[3]), so a neighbour's badge never covers the owner's mark.
                <span
                  className={cx('absolute left-[4%] top-[4%] z-[4] flex items-center justify-center rounded-[30%] bg-map-chip shadow-chip')}
                  style={{ width: look === 'A' ? z.tab : z.tab * 0.75, height: look === 'A' ? z.tab : z.tab * 0.75, boxShadow: `0 0 0 ${tv ? 2 : 1}px ${color}` }}
                  data-testid={`owner-${t.x}-${t.y}`}
                >
                  <PlayerMark slot={t.owner} size={look === 'A' ? z.mark : z.mark * 0.75} glow={false} />
                </span>
              )}
              {t.terrain === 'store' && <span className={cx('relative rounded-chip bg-map-chip font-mono font-bold text-holo shadow-chip', tv ? 'px-2 py-0.5 text-sm' : 'px-1 text-[8px]')}>STORE</span>}
              {t.good && (
                <span
                  className="relative z-[2] flex items-center justify-center rounded-full bg-map-chip shadow-chip"
                  style={{ width: z.disc, height: z.disc, boxShadow: `0 0 0 ${tv ? 3 : 2}px var(--color-g-${t.good})` }}
                  data-testid={`installed-${t.x}-${t.y}`}
                >
                  <GoodIcon good={t.good as Good} size={z.icon} />
                </span>
              )}
              {t.special && (
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
                // The same strong selection in both looks: a bright double ring, lifted, with a pin above it.
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
                    className={cx('pointer-events-none absolute bottom-full left-1/2 z-[6] mb-1 -translate-x-1/2 whitespace-nowrap rounded-chip bg-holo font-mono font-bold text-on-holo shadow-glow', tv ? 'px-2 py-0.5 text-sm' : 'px-1 text-[8px]')}
                    data-testid="selected-pin"
                  >
                    {tv ? 'SELECTED ▾' : '▾'}
                  </span>
                </>
              )}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
