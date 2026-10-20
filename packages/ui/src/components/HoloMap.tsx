import { PlayerMark } from './PlayerMark';
import { cx, GOOD_CODE, GOOD_NAME, SLOT_COLOR, TERRAIN_NAME, type Good, type Slot, type Terrain } from './tokens';

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
  className?: string;
}

/** The colony map as a hologram: tinted glass plots on a faint grid, with numbers floating above owned land. */
export function HoloMap({ width, height, tiles, cursor, selected, avatars = [], showOutput = false, focusSlot, onTile, density = 'phone', className }: HoloMapProps) {
  const tv = density === 'tv';
  return (
    <div
      className={cx('relative overflow-hidden rounded-panel border border-holo-line bg-void', className)}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${height}, minmax(0, 1fr))` }}>
        {tiles.map((t) => {
          const isCursor = cursor && cursor.x === t.x && cursor.y === t.y;
          const isSelected = selected && selected.x === t.x && selected.y === t.y;
          const owner = t.owner === null ? null : SLOT_COLOR[t.owner];
          const faded = focusSlot !== undefined && t.owner !== focusSlot && t.terrain !== 'store';
          const label = [
            TERRAIN_NAME[t.terrain],
            t.owner !== null ? `owned by player ${t.owner + 1}` : t.terrain === 'store' ? '' : 'free',
            t.good ? `${GOOD_NAME[t.good]}${t.output ? ` +${t.output}` : ''}` : '',
          ]
            .filter(Boolean)
            .join(', ');
          const Tag = onTile ? 'button' : 'div';
          return (
            <Tag
              key={`${t.x},${t.y}`}
              {...(onTile ? { type: 'button' as const, onClick: () => onTile(t), 'aria-label': label } : { 'aria-label': label })}
              className={cx(
                'relative flex flex-col items-center justify-center gap-0.5 transition-opacity',
                faded && 'opacity-35',
                onTile && 'cursor-pointer hover:brightness-150',
              )}
              style={{
                background: `var(--color-t-${t.terrain})`,
                boxShadow: owner
                  ? `inset 0 0 0 2px ${owner}, inset 0 0 ${tv ? 22 : 14}px ${owner}`
                  : 'inset 0 0 0 0.5px var(--color-holo-faint)',
              }}
            >
              {t.terrain === 'store' && <span className={cx('font-mono font-bold text-holo', tv ? 'text-sm' : 'text-[9px]')}>STORE</span>}
              {t.terrain === 'mountains' && !t.good && (
                <span aria-hidden className={cx('font-mono text-ink-3', tv ? 'text-xs' : 'text-[8px]')}>
                  {'▲'.repeat(Math.max(1, t.peaks ?? 1))}
                </span>
              )}
              {t.good && (
                <>
                  <span className={cx('font-mono font-bold leading-none', tv ? 'text-sm' : 'text-[9px]')} style={{ color: owner ?? 'var(--color-holo)' }}>
                    {GOOD_CODE[t.good]}
                  </span>
                  {showOutput && t.output !== undefined && (
                    <span data-num className={cx('font-mono font-bold leading-none text-ink', tv ? 'text-xl' : 'text-xs')}>
                      +{t.output}
                    </span>
                  )}
                </>
              )}
              {t.flag && (
                <span
                  className={cx(
                    'absolute right-0.5 top-0.5 rounded-chip px-1 font-mono font-bold leading-tight',
                    tv ? 'text-[11px]' : 'text-[8px]',
                    t.flag === 'sabotage' ? 'bg-alert text-void' : t.flag === 'sale' ? 'bg-warn text-void' : 'bg-holo text-on-holo',
                  )}
                >
                  {t.flag === 'sabotage' ? 'OFF' : t.flag === 'sale' ? 'SALE' : 'SCAN'}
                </span>
              )}
              {isSelected && <span aria-hidden className="pointer-events-none absolute inset-0 border-2 border-holo-strong shadow-glow" />}
              {isCursor && (
                <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden border-2 border-holo-strong bg-holo-soft shadow-glow">
                  <span className="absolute inset-x-0 h-1/3 animate-scan bg-holo/30" />
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
          <PlayerMark slot={a.slot} size={tv ? 26 : 14} label={a.name} />
          {a.carrying && (
            <span className={cx('rounded-chip bg-void/80 px-1 font-mono font-bold text-ink', tv ? 'text-[11px]' : 'text-[8px]')}>
              {a.carrying === 'empty' ? 'MULE' : `MULE·${GOOD_CODE[a.carrying]}`}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
