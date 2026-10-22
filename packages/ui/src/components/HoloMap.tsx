import { useMemo } from 'react';
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
 * The colony map: a painted landscape with a fine plot grid over it. Owned plots glow in
 * their owner's colour; output and geo analysis results float above the land as chips.
 */
export function HoloMap({ width, height, tiles, cursor, selected, avatars = [], showOutput = false, focusSlot, onTile, density = 'phone', hideGround = false, className }: HoloMapProps) {
  const tv = density === 'tv';
  const theme = useTheme();
  const terrain = useMemo(() => {
    const grid: (Terrain | undefined)[] = new Array(width * height);
    for (const t of tiles) grid[t.y * width + t.x] = t.terrain;
    return grid;
  }, [tiles, width, height]);

  return (
    <div
      className={cx('relative overflow-hidden rounded-panel border border-map-edge bg-map-base shadow-map', className)}
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
          const isSelected = selected && selected.x === t.x && selected.y === t.y;
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
              className={cx('relative flex items-center justify-center transition-opacity', faded && 'opacity-40', onTile && 'cursor-pointer')}
            >
              {!!t.pollution && (
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{ background: `radial-gradient(circle at 50% 55%, rgb(110 82 40 / ${0.25 + t.pollution * 0.18}), rgb(110 82 40 / ${0.12 + t.pollution * 0.12}) 80%)` }}
                />
              )}
              {owner && (
                <span
                  aria-hidden
                  className="absolute inset-[3%] rounded-[14%]"
                  style={{
                    boxShadow: `inset 0 0 0 ${tv ? 3 : 2}px ${owner}, 0 0 ${tv ? 18 : 10}px color-mix(in srgb, ${owner} 45%, transparent)`,
                    background: `color-mix(in srgb, ${owner} 16%, transparent)`,
                  }}
                />
              )}
              {owner && t.owner !== null && (
                <PlayerMark slot={t.owner} size={tv ? 12 : 7} className={cx('absolute', tv ? 'left-1.5 top-1.5' : 'left-[3px] top-[3px]')} />
              )}
              {t.terrain === 'store' && (
                <span className={cx('relative rounded-chip bg-map-chip font-mono font-bold text-holo shadow-chip', tv ? 'px-2 py-0.5 text-xs' : 'px-1 text-[7px]')}>STORE</span>
              )}
              {t.good && (
                <span className={cx('relative flex items-center rounded-full bg-map-chip shadow-chip', tv ? 'gap-1 px-2 py-1' : 'flex-col px-[3px] py-[2px]')}>
                  <GoodIcon good={t.good} size={tv ? 20 : 10} />
                  {showOutput && t.output !== undefined && (
                    <span data-num className={cx('font-mono font-bold leading-none text-ink', tv ? 'text-lg' : 'text-[8px]')}>
                      +{t.output}
                    </span>
                  )}
                </span>
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
                // Above every plot's chips, its neighbours' too, and never in the way of a tap: the tap goes to the plot beneath.
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
              {isSelected && <span aria-hidden className="pointer-events-none absolute inset-[3%] rounded-[14%] border-2 border-holo-strong shadow-glow" />}
              {isCursor && (
                <span aria-hidden className="pointer-events-none absolute inset-[2%] overflow-hidden rounded-[14%] border-[3px] border-holo bg-holo-soft shadow-glow">
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
