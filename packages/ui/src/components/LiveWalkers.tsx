import { DEV_STEER, WOLVES } from '@mule/engine';
import { ConditionTag, type Condition, type PaceRule } from './Condition';
import { Creature } from './Creature';
import { Mule, type MuleGood } from './Mule';
import { cycleSeconds, motionOf, type Encounter, type Facing, type GaitInput } from './motion/gait';
import type { CreatureWrap, Species } from './species';
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

/** Each colonist's share of a unit as drawn: a plot on the map, a unit of the hall's plan. */
const SPRITE = { map: 0.62, hall: 0.95 } as const;

/**
 * Colonists drawn on one spot fan out so each stays visible: within `within` units of each other (a chain of near ones
 * is one group), they are drawn side by side, `step` apart, in seat order. A step is half a sprite, so each shows at
 * least half of itself. Drawing only: where each stands, on the wire and in your own prediction, is unchanged.
 */
export const FAN = { within: 0.3, step: { map: SPRITE.map / 2, hall: SPRITE.hall / 2 } } as const;

/**
 * The drawing offset of each colonist that shares a spot, in the space's units; one alone, or apart, has none. `points`
 * come in seat order, which is the order across. Every screen that draws a space calls this over the same colonists, so
 * a walker and the hall's own visitor move aside by the same rule.
 */
export function fanOut(points: readonly { id: string; x: number; y: number }[], space: 'map' | 'hall'): Map<string, { dx: number; dy: number }> {
  const group = points.map((_, i) => i);
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i]!)));
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const [a, b] = [points[i]!, points[j]!];
      if (Math.hypot(a.x - b.x, a.y - b.y) <= FAN.within) group[root(j)] = root(i);
    }
  const members = new Map<number, number[]>();
  points.forEach((_, i) => members.set(root(i), [...(members.get(root(i)) ?? []), i]));
  const out = new Map<string, { dx: number; dy: number }>();
  for (const idx of members.values()) {
    if (idx.length < 2) continue;
    idx.forEach((i, k) => out.set(points[i]!.id, { dx: (k - (idx.length - 1) / 2) * FAN.step[space], dy: 0 }));
  }
  return out;
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
  /**
   * Who shares a spot, from fanOut over everyone drawn in this space, in seat order. Defaults to fanOut over `walkers`;
   * a stage that draws one colonist elsewhere (the hall's own visitor) passes the one it computed over all of them.
   */
  fan?: ReadonlyMap<string, { dx: number; dy: number }>;
  /** The device time (Date.now) these positions are for, written as each colonist's data-at. */
  at?: number;
  /** Wraps each colonist's mark, for a screen that hangs something on it (a speech bubble). */
  wrapCreature?: CreatureWrap;
}

/**
 * Every colonist in one space at its exact position this frame (arcade spec C13): a layer of its own over a map or the
 * store's hall, positioned on every render with no CSS easing, since easing between 20 Hz frames would draw a live
 * walk as a lag, and by transform only, never left and top. HoloMap's own avatars ease over 700 ms between plots; this
 * layer is for steering. Each walker moves by
 * #195's gait (motionOf, cycleSeconds), its MULE on the same stride. Pointer-transparent: the stage under it takes the
 * mouse and the taps.
 */
export function LiveWalkers({ walkers, space, cols, rows, cell, density, names = false, rule, fan = fanOut(walkers, space), at: drawnAt, wrapCreature = (_, mark) => mark }: LiveWalkersProps) {
  const map = space === 'map';
  const size = Math.round(cell * SPRITE[space]);
  const muleSize = Math.round(size * (map ? 1.35 : 1.1));
  // Each walker rides a layer the size of the space, moved by transform alone: a translate's % is of the layer's own
  // size, which is the space's, so no frame lays anything out and nothing needs measuring (#195's walk board's lesson).
  const at = (x: number, y: number) => ({ transform: `translate(${(x / cols) * 100}%, ${(y / rows) * 100}%)` });
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
        // Drawn aside when it shares a spot; its MULE keeps beside it. data-x and data-y still say where it stands.
        const off = fan.get(w.id) ?? { dx: 0, dy: 0 };
        return (
          <div key={w.id}>
            {w.lead && (
              <div className="absolute inset-0" style={at(w.lead.x + off.dx, w.lead.y + off.dy)} data-testid={`mule-${w.id}`} data-good={w.lead.good ?? 'empty'}>
                <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-[80%]">
                  <Mule size={muleSize} state={w.moving ? 'walk' : 'idle'} good={w.lead.good} owner={w.slot} facing={w.facing} cycle={stride} />
                </div>
              </div>
            )}
            <div
              className="absolute inset-0"
              style={at(w.x + off.dx, w.y + off.dy)}
              data-testid={`colonist-${w.id}`}
              data-x={w.x.toFixed(3)}
              data-y={w.y.toFixed(3)}
              data-at={drawnAt}
              data-space={space}
              data-moving={w.moving || undefined}
              data-bitten={w.bitten || undefined}
              data-fanned={off.dx !== 0 || off.dy !== 0 || undefined}
            >
              <div className="absolute left-0 top-0 flex -translate-x-1/2 -translate-y-[85%] flex-col items-center">
                {wrapCreature(
                  w.id,
                  <span
                    role="img"
                    aria-label={w.name}
                    className={cx('relative block rounded-full', w.mine && 'ring-2 ring-holo ring-offset-1 ring-offset-table')}
                    // PlayerMark's edge and, on your own, its glow in your colour.
                    style={{ filter: w.mine ? `drop-shadow(0 0 1px var(--color-mark-edge)) drop-shadow(0 0 ${Math.round(size / 3)}px color-mix(in srgb, ${color} var(--mark-glow), transparent))` : 'drop-shadow(0 0 1px var(--color-mark-edge))' }}
                  >
                    <Creature species={w.species} color={color} size={size} motion={motionOf(gait)} cycle={stride} facing={w.facing} />
                    {rule && w.condition !== undefined && <ConditionTag id={w.id} condition={w.condition} rule={rule} size={density} />}
                  </span>,
                )}
                {names && (
                  <span className={cx('mt-0.5 whitespace-nowrap rounded-chip bg-map-chip px-1 font-mono font-bold leading-tight text-ink shadow-chip', density === 'tv' ? 'text-xs' : 'text-[10px]')} data-testid={`colonist-name-${w.id}`}>
                    {w.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
