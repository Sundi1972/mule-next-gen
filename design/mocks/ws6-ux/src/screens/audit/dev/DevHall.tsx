import type { Good } from '@mule/engine';
import { cx, GOOD_NAME, GoodIcon, MuleIcon } from '@mule/ui';
import type { CSSProperties, ReactNode } from 'react';
import { HallWalker, SPOT, type Spot, type Visitor } from '../../../proposed/Hall';
import { Mule } from '../../../proposed/Mule';
import { Dots } from './parts';

/**
 * The store hall after the UX audit: a FORK of proposed/Hall.tsx (the approved hall, #dev), which another builder may
 * be editing, so it is copied here and the copy carries the changes:
 *
 * - V-1 · walking you can see: the room the guide points at says "WALK 1.4s", not "TAP"; the doors say "WALK OUT";
 *   every room's name for a screen reader starts "Walk to …"; a tap draws a dotted path on the floor from your colonist
 *   to the room, and the room says "WALKING" until you arrive, when it acts.
 * - V-2 · your plots on the shops: under each outfitter's price, the plots of yours that suit its good (a dashed chip
 *   with a MULE when that plot already has one).
 *
 * GRAFT TARGET: the same as Hall's, packages/ui/src/components/Store.tsx::StoreInterior (WS6's hall, WS4 reviews).
 * Keeps its data-testids; adds booth-suits-<good>, suit-<good>-<plot>, hall-path, walking-to.
 */

const OUTFITTERS = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'] as const satisfies readonly Good[];
const FITS = [
  { good: 'alloy' as const, name: 'Smelter' },
  { good: 'electronics' as const, name: 'Electronics' },
  { good: 'medicine' as const, name: 'Medicine lab' },
];

const TOP = { y0: 3, y1: 39 };
const BOT = { y0: 60, y1: 97 };
const X0 = 9;
const X1 = 91;
const COL = (X1 - X0) / 6;
const BOTTOM: Record<'works' | 'greenBelt' | 'corral' | 'pub', [number, number]> = { works: [9, 36], greenBelt: [37, 46], corral: [47, 73], pub: [74, 91] };

const box = (x0: number, x1: number, y0: number, y1: number): CSSProperties => ({ left: `${x0}%`, width: `${x1 - x0}%`, top: `${y0}%`, height: `${y1 - y0}%` });

const ROOM_NAME: Record<Spot, string> = {
  food: 'Food outfitter', water: 'Water outfitter', energy: 'Energy outfitter', smithore: 'Smithore outfitter', crystite: 'Crystite outfitter', rareEarth: 'Rare earth outfitter',
  works: 'works', greenBelt: 'green belt', corral: 'corral', pub: 'pub', doorL: 'left door', doorR: 'right door',
};

/** A plot of yours that suits a shop's good: its name, and whether a MULE already stands on it. */
export type SuitMark = { id: string; name: string; mule: boolean };

/** A room you walk to: a real button; glowing, it says WALK and how long; tapped, WALKING until you arrive. */
function Room({
  spot,
  style,
  onTap,
  disabled,
  next,
  walking,
  walk,
  lock,
  wide,
  className,
  children,
  mark,
}: {
  spot: Spot;
  style: CSSProperties;
  onTap?: (() => void) | undefined;
  disabled: boolean;
  next: boolean;
  walking: boolean;
  walk: string;
  lock?: string | undefined;
  wide: boolean;
  className?: string;
  children: ReactNode;
  mark?: ReactNode;
}) {
  const Tag = onTap ? 'button' : 'div';
  const chip = walking ? 'WALKING' : next && !disabled ? `WALK ${walk}` : null;
  return (
    <Tag
      {...(onTap ? { type: 'button' as const, onClick: onTap, disabled, 'aria-label': `Walk to the ${ROOM_NAME[spot]} (${walk})${lock ? `. ${lock}` : ''}` } : { 'aria-disabled': disabled })}
      className={cx(
        'group absolute flex flex-col overflow-hidden rounded-panel border text-center transition-[opacity,filter,box-shadow]',
        disabled ? (lock !== undefined ? 'border-holo-faint opacity-75 saturate-[0.6]' : 'border-holo-faint opacity-45') : 'border-holo-line enabled:hover:border-holo',
        (next || walking) && !disabled && 'z-[1] border-2 border-holo animate-[beckon_1.6s_ease-in-out_infinite]',
        className,
      )}
      style={style}
      data-testid={`booth-${spot}`}
      {...(next && !disabled ? { 'data-next': true } : {})}
    >
      {children}
      {chip && (
        <span
          className={cx('absolute left-1/2 top-1 z-[2] -translate-x-1/2 whitespace-nowrap rounded-full bg-holo font-mono font-bold text-on-holo shadow-glow', wide ? 'px-2 text-xs leading-5' : 'px-1 text-[9px] leading-4')}
          data-testid={walking ? 'walking-to' : 'tap-here'}
        >
          {chip}
        </span>
      )}
      {disabled && lock && (
        <span className="shrink-0 bg-void/60 px-1 py-px font-mono text-[7px] uppercase leading-tight text-ink-2 @min-[1100px]/shell:py-0.5 @min-[1100px]/shell:text-[11px]" data-testid={`lock-${spot}`}>
          {lock}
        </span>
      )}
      {mark}
    </Tag>
  );
}

function Awning({ color }: { color: string }) {
  return (
    <svg aria-hidden viewBox="0 0 60 10" preserveAspectRatio="none" className="h-[16%] min-h-3 w-full shrink-0">
      <path d="M0 0 H60 V5 Q57.5 10 55 5 Q52.5 10 50 5 Q47.5 10 45 5 Q42.5 10 40 5 Q37.5 10 35 5 Q32.5 10 30 5 Q27.5 10 25 5 Q22.5 10 20 5 Q17.5 10 15 5 Q12.5 10 10 5 Q7.5 10 5 5 Q2.5 10 0 5 Z" fill={color} />
      <path d="M10 0 V5 M20 0 V5 M30 0 V5 M40 0 V5 M50 0 V5" stroke="var(--color-awning-stripe)" strokeOpacity={0.18} strokeWidth={4} />
    </svg>
  );
}

/** V-2: the plots of yours that suit this shop's good, under its price. */
function Suits({ good, marks, wide, mark }: { good: Good; marks: SuitMark[] | undefined; wide: boolean; mark?: ReactNode }) {
  if (!marks || marks.length === 0) return null;
  return (
    <span className={cx('relative flex flex-wrap justify-center gap-0.5', !!mark && 'pr-3')} aria-label={`Suits your ${marks.map((m) => `${m.name}${m.mule ? ', which has a MULE' : ''}`).join(' and ')}`} data-testid={`booth-suits-${good}`}>
      {marks.map((m) => (
        <span
          key={m.id}
          className={cx('flex items-center gap-0.5 whitespace-nowrap rounded-chip border font-mono font-bold', wide ? 'px-1.5 text-xs leading-5' : 'px-1 text-[9px] leading-[14px]', m.mule ? 'border-dashed border-ink-3 text-ink-2' : 'border-holo bg-holo-soft text-holo')}
          data-testid={`suit-${good}-${m.id}`}
        >
          {m.mule && <MuleIcon size={wide ? 13 : 9} />}
          {m.name}
        </span>
      ))}
      {mark}
    </span>
  );
}

export function DevHall({
  visitors,
  mules,
  mulePrice,
  prices,
  pubPayout,
  open,
  onSpot,
  next = [],
  locks,
  wide = false,
  walk,
  walking,
  path,
  suits,
  marks,
  overlay,
}: {
  visitors: Visitor[];
  mules: number;
  mulePrice: number;
  prices: Partial<Record<Good | 'greenBelt', number>>;
  pubPayout: number;
  open?: Spot[];
  onSpot?: (spot: Spot, fit?: Good) => void;
  next?: Spot[];
  locks?: Partial<Record<Spot, string>>;
  wide?: boolean;
  /** One walk across the floor at your pace, as the chips say it: "1.4s". */
  walk: string;
  /** The room you are walking to now. */
  walking: Spot | null;
  /** Your walk on the floor, in % of the hall, while it lasts. */
  path: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
  /** V-2: per outfitter, the plots of yours that suit its good. */
  suits?: Partial<Record<Good, SuitMark[]>>;
  /** Review furniture: numbered markers, by room; 'floor' for the path; 'suits-<good>' for a shop's plot marks. */
  marks?: Partial<Record<Spot | 'floor' | `suits-${Good}`, ReactNode>>;
  overlay?: ReactNode;
}) {
  const can = (s: Spot) => !open || open.includes(s);
  const tap = (s: Spot, fit?: Good) => (onSpot ? () => onSpot(s, fit) : undefined);
  const nx = (s: Spot) => next.includes(s);
  const name = wide ? 'text-lg' : 'text-[11px]';
  const price = cx('font-mono font-bold', wide ? 'text-base' : 'text-[10px]');
  const room = (s: Spot) => ({ spot: s, walk, wide, walking: walking === s, next: nx(s), disabled: !can(s), lock: locks?.[s], mark: marks?.[s] });
  return (
    <div
      className="relative h-full w-full select-none overflow-hidden rounded-sheet border border-holo-line"
      style={{
        background:
          'radial-gradient(ellipse 60% 45% at 50% 50%, color-mix(in srgb, var(--color-warn) 10%, transparent), transparent 70%), repeating-linear-gradient(90deg, transparent 0 46px, var(--color-holo-faint) 46px 47px), repeating-linear-gradient(0deg, transparent 0 46px, var(--color-holo-faint) 46px 47px), var(--color-table)',
      }}
      data-testid="store-hall"
    >
      <div aria-hidden className="absolute inset-x-0 top-0 h-[42%] border-b-2 border-holo-line bg-raised/50" />
      <div aria-hidden className="absolute inset-x-[8%] top-[43%] h-[14%] rounded-full border border-dashed border-holo-faint bg-panel/30" />

      <div data-testid="row-outfitters">
        {OUTFITTERS.map((g, i) => (
          <Room key={g} {...room(g)} style={box(X0 + COL * i + 0.4, X0 + COL * (i + 1) - 0.4, TOP.y0, TOP.y1)} onTap={tap(g)} className="bg-panel">
            <Awning color={`var(--color-g-${g})`} />
            <span className="flex flex-1 flex-col items-center justify-center gap-0.5 px-0.5" data-shop={g}>
              <span className="grid place-items-center rounded-full p-1" style={{ background: `color-mix(in srgb, var(--color-g-${g}) 18%, transparent)`, boxShadow: `0 0 18px color-mix(in srgb, var(--color-g-${g}) 35%, transparent)` }}>
                <GoodIcon good={g} size={wide ? 36 : 18} />
              </span>
              <span className={cx('font-display font-semibold leading-tight', name)}>{GOOD_NAME[g]}</span>
              <span data-num className={cx(price, 'rounded-chip bg-void/50 px-1.5 text-ink')}>
                {prices[g]} cr
              </span>
              <Suits good={g} marks={suits?.[g]} wide={wide} mark={marks?.[`suits-${g}`]} />
            </span>
          </Room>
        ))}
      </div>

      <div data-testid="row-services">
        <Room {...room('works')} style={box(BOTTOM.works[0], BOTTOM.works[1], BOT.y0, BOT.y1)} className="bg-panel">
          <span className="flex items-center justify-center gap-1.5 border-b border-holo-faint bg-raised/60 py-0.5">
            <svg aria-hidden viewBox="0 0 16 16" className={wide ? 'h-5 w-5' : 'h-3 w-3'}>
              <path d="M2 14V7l4 2V7l4 2V3h4v11z" fill="var(--color-ink-3)" />
            </svg>
            <span className={cx('label-caps', wide ? 'text-xs!' : 'text-[8px]!')}>The works · factory fits</span>
          </span>
          <span className="grid flex-1 grid-cols-3 gap-1 p-1">
            {FITS.map((f) => (
              <button
                key={f.good}
                type="button"
                disabled={!onSpot || !can('works')}
                onClick={tap('works', f.good)}
                aria-label={`Walk to the works (${walk}), then fit a ${f.name}`}
                className="flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-control border border-holo-faint bg-raised enabled:hover:border-holo"
                data-testid={`fit-${f.good}`}
              >
                <GoodIcon good={f.good} size={wide ? 30 : 16} />
                {wide && <span className="text-sm font-semibold">{f.name}</span>}
                <span data-num className={price}>
                  {prices[f.good]}
                </span>
              </button>
            ))}
          </span>
        </Room>

        <Room {...room('greenBelt')} style={box(BOTTOM.greenBelt[0], BOTTOM.greenBelt[1], BOT.y0, BOT.y1)} onTap={tap('greenBelt')} className="bg-ok/10">
          <svg aria-hidden viewBox="0 0 40 24" preserveAspectRatio="none" className="h-[22%] w-full">
            <path d="M0 24 L20 2 L40 24 Z" fill="var(--color-ok)" fillOpacity={0.35} stroke="var(--color-ok)" strokeWidth={1} />
            <path d="M20 2 V24 M10 13 H30" stroke="var(--color-ok)" strokeWidth={0.8} />
          </svg>
          <span className="flex flex-1 flex-col items-center justify-center px-0.5" data-shop="greenBelt">
            <span className={cx('font-semibold leading-tight', name)}>Green belt</span>
            <span data-num className={price}>
              {prices.greenBelt} cr
            </span>
          </span>
        </Room>

        <Room {...room('corral')} disabled={!can('corral') || mules === 0} style={box(BOTTOM.corral[0], BOTTOM.corral[1], BOT.y0, BOT.y1)} onTap={tap('corral')} className="bg-holo-soft">
          <span className="relative flex flex-1 items-end justify-center gap-0 overflow-hidden px-1 pt-3" data-shop="corral">
            <svg aria-hidden viewBox="0 0 100 20" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-[22%] w-full">
              <path d="M1 8 H99" stroke="var(--color-holo-line)" strokeWidth={2.5} />
              <path d="M2 2 V20 M98 2 V20" stroke="var(--color-holo)" strokeOpacity={0.6} strokeWidth={3} />
            </svg>
            {mules === 0 ? (
              <span className="mb-[18%] font-mono text-sm font-bold text-alert">SOLD OUT</span>
            ) : (
              Array.from({ length: Math.min(mules, 3) }, (_, i) => <Mule key={i} size={wide ? 84 : 30} facing={i % 2 ? 'left' : 'right'} className="relative -mx-1 mb-1" />)
            )}
          </span>
          <span className="flex items-baseline justify-center gap-2 bg-void/40 py-0.5">
            <span className={cx('font-semibold', name)}>MULE corral · {mules} left</span>
            <span data-num className={price}>
              {mulePrice} cr
            </span>
          </span>
        </Room>

        <Room
          {...room('pub')}
          style={{ ...box(BOTTOM.pub[0], BOTTOM.pub[1], BOT.y0, BOT.y1), background: 'radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--color-warn) 30%, transparent), color-mix(in srgb, var(--color-warn) 8%, var(--color-panel)) 70%)' }}
          onTap={tap('pub')}
        >
          <span className="flex flex-1 flex-col items-center justify-center gap-0.5" data-shop="pub">
            <svg aria-hidden viewBox="0 0 24 24" className={wide ? 'h-10 w-10' : 'h-5 w-5'}>
              <path d="M5 5h10v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" fill="var(--color-warn)" fillOpacity={0.5} stroke="var(--color-warn)" strokeWidth={1.5} />
              <path d="M15 8h2.5a2.5 2.5 0 0 1 0 5H15" fill="none" stroke="var(--color-warn)" strokeWidth={1.5} />
              <path d="M5 5c1-2 3-2 4-1 1-1.5 4-1.5 5 0" fill="none" stroke="var(--color-ink)" strokeWidth={1.2} />
            </svg>
            <span className={cx('font-display font-semibold', name)}>Pub</span>
            <span data-num className={cx(price, 'text-warn')}>≈{pubPayout} cr</span>
            <span className={cx('text-ink-2', wide ? 'text-sm' : 'text-[8px]')}>ends your turn</span>
          </span>
        </Room>
      </div>

      <Door side="L" onTap={tap('doorL')} next={nx('doorL')} walking={walking === 'doorL'} wide={wide} walk={walk} mark={marks?.doorL} />
      <Door side="R" onTap={tap('doorR')} next={nx('doorR')} walking={walking === 'doorR'} wide={wide} walk={walk} mark={marks?.doorR} />

      {/* V-1: the walk you just started, dotted on the floor from your colonist to the room. */}
      {path && (
        <div className="pointer-events-none absolute inset-0 z-[2]" data-testid="hall-path">
          <Dots points={[path.from, path.to]} size="size-1 @min-[1100px]/shell:size-1.5" />
          {marks?.floor && (
            <span className="absolute" style={{ left: `${(path.from.x + path.to.x) / 2}%`, top: `${(path.from.y + path.to.y) / 2}%` }}>
              {marks.floor}
            </span>
          )}
        </div>
      )}

      {visitors.map((v) => (
        <HallWalker key={v.id} v={v} wide={wide} />
      ))}
      {overlay}
    </div>
  );
}

/** An airlock door out to the colony: it says you walk out through it. */
function Door({ side, onTap, next, walking, wide, walk, mark }: { side: 'L' | 'R'; onTap: (() => void) | undefined; next: boolean; walking: boolean; wide: boolean; walk: string; mark?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!onTap}
      className={cx(
        'absolute top-[30%] flex h-[40%] w-[7%] flex-col items-center justify-center gap-1 rounded-panel border-2 border-dashed border-holo-line bg-void/60 text-holo enabled:hover:bg-holo-soft',
        side === 'L' ? 'left-[0.6%]' : 'right-[0.6%]',
        (next || walking) && 'border-solid border-holo bg-holo-soft animate-[beckon_1.6s_ease-in-out_infinite]',
      )}
      aria-label={`Walk out to the colony by the ${side === 'L' ? 'left' : 'right'} door (${walk})`}
      data-testid={`door-${side}`}
      {...(next ? { 'data-next': true } : {})}
    >
      <span className={cx('font-display font-bold', wide ? 'text-3xl' : 'text-base')}>{side === 'L' ? '←' : '→'}</span>
      <span className={cx('font-mono font-bold leading-tight [writing-mode:vertical-rl]', wide ? 'text-xs' : 'text-[7px]')}>{walking ? 'WALKING' : 'WALK OUT'}</span>
      {mark}
    </button>
  );
}

export { SPOT, type Spot, type Visitor };
