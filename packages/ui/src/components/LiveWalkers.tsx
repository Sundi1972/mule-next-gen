import { DEV_STEER, WOLVES } from '@mule/engine';
import { ConditionTag, type Condition, type PaceRule } from './Condition';
import { Creature } from './Creature';
import { Mule, type MuleGood } from './Mule';
import { cycleSeconds, motionOf, type Encounter, type Facing, type GaitInput } from './motion/gait';
import type { Species } from './species';
import { cx, SLOT_COLOR, type Slot } from './tokens';

/** A colonist as the live layer draws it: where it stands this frame, in the space's own units. */
export interface LiveWalker {
  id: string;
  slot: Slot;
  species: Species;
  name: string;
  /** In map tiles on the map, in the hall plan's units in the hall. */
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  /** The MULE on its lead, where it trots. */
  lead: { good: MuleGood | null; x: number; y: number } | null;
  /** The wire's pace: hunger × sickness × the species perk. */
  pace: number;
  /** The ground's share of full speed under it; 1 in the hall. */
  terrain: number;
  bitten?: boolean;
  encounter?: Encounter;
  /** Its condition, for the tag at its shoulder; none draws no tag. */
  condition?: Condition | null;
  /** This screen's own colonist: ringed, and glowing. */
  mine?: boolean;
}

export interface LiveWalkersProps {
  walkers: LiveWalker[];
  space: 'map' | 'hall';
  /** The space's size in its units: the map's plots across and down, or HALL.w and HALL.h. */
  cols: number;
  rows: number;
  /** Pixels per unit, for the creatures' size. */
  cell: number;
  /** 'tv' is read across a room; 'wide' is the laptop's. */
  density: 'phone' | 'tv' | 'wide';
  /** Each colonist's name under it: the TV's, where nobody holds a phone to know who is who. */
  names?: boolean;
  /** The engine's DEV_WALK: with it, a walker with a condition shows its tag. */
  rule?: PaceRule;
}

/**
 * Every colonist in one space at its exact position this frame (arcade spec C13): a layer of its own over a map or the
 * store's hall, positioned on every render with no CSS easing, since easing between 20 Hz frames would draw a live
 * walk as a lag. HoloMap's own avatars ease over 700 ms between plots; this layer is for steering. Each walker moves by
 * #195's gait (motionOf, cycleSeconds), its MULE on the same stride. Pointer-transparent: the stage under it takes the
 * mouse and the taps.
 */
export function LiveWalkers({ walkers, space, cols, rows, cell, density, names = false, rule }: LiveWalkersProps) {
  const map = space === 'map';
  const size = Math.round(cell * (map ? 0.62 : 0.95));
  const muleSize = Math.round(size * (map ? 1.35 : 1.1));
  const at = (x: number, y: number) => ({ left: `${(x / cols) * 100}%`, top: `${(y / rows) * 100}%` });
  // The nearer the bottom, the nearer the viewer: drawn last.
  const ordered = [...walkers].sort((a, b) => a.y - b.y);
  return (
    <div className="pointer-events-none absolute inset-0 z-[7]" data-testid={`walkers-${space}`}>
      {ordered.map((w) => {
        const gait: GaitInput = {
          moving: w.moving,
          encounter: w.encounter ?? null,
          pace: w.pace,
          terrain: w.terrain,
          lead: !!w.lead,
          bitten: !!w.bitten,
          leadPace: DEV_STEER.leadPace,
          bittenPace: WOLVES.bittenPace,
          lungeSeconds: WOLVES.lungeEverySeconds,
        };
        const stride = cycleSeconds(gait);
        const color = SLOT_COLOR[w.slot];
        return (
          <div key={w.id}>
            {w.lead && (
              <div className="absolute -translate-x-1/2 -translate-y-[80%]" style={at(w.lead.x, w.lead.y)} data-testid={`mule-${w.id}`} data-good={w.lead.good ?? 'empty'}>
                <Mule size={muleSize} state={w.moving ? 'walk' : 'idle'} good={w.lead.good} owner={w.slot} facing={w.facing} cycle={stride} />
              </div>
            )}
            <div
              className="absolute flex -translate-x-1/2 -translate-y-[85%] flex-col items-center"
              style={at(w.x, w.y)}
              data-testid={`colonist-${w.id}`}
              data-x={w.x.toFixed(3)}
              data-y={w.y.toFixed(3)}
              data-space={space}
              data-moving={w.moving || undefined}
              data-bitten={w.bitten || undefined}
            >
              <span
                role="img"
                aria-label={w.name}
                className={cx('relative block rounded-full', w.mine && 'ring-2 ring-holo ring-offset-1 ring-offset-table')}
                // PlayerMark's edge and, on your own, its glow in your colour.
                style={{ filter: w.mine ? `drop-shadow(0 0 1px var(--color-mark-edge)) drop-shadow(0 0 ${Math.round(size / 3)}px color-mix(in srgb, ${color} var(--mark-glow), transparent))` : 'drop-shadow(0 0 1px var(--color-mark-edge))' }}
              >
                <Creature species={w.species} color={color} size={size} motion={motionOf(gait)} cycle={stride} facing={w.facing} />
                {rule && w.condition !== undefined && <ConditionTag id={w.id} condition={w.condition} rule={rule} size={density} />}
              </span>
              {names && (
                <span className={cx('mt-0.5 whitespace-nowrap rounded-chip bg-map-chip px-1 font-mono font-bold leading-tight text-ink shadow-chip', density === 'tv' ? 'text-xs' : 'text-[10px]')} data-testid={`colonist-name-${w.id}`}>
                  {w.name}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
