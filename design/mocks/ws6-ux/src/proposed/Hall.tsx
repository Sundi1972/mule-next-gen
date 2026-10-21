import type { Good } from '@mule/engine';
import { Creature, cx, GOOD_NAME, GoodIcon, SLOT_COLOR, useSeatSpecies, type Slot } from '@mule/ui';
import type { CSSProperties, ReactNode } from 'react';
import { slotOf } from '../../../../../apps/web/src/game/derive';
import { VIEW } from '../fixture';
import { Mule } from './Mule';

/**
 * The store, with love (Heiko 2026-10-22, AM-8: "I don't need the map when we
 * are in the store. Let's use all the real estate to make the store look good…
 * it needs some love").
 *
 * The same hall as D1 (one hall, two rows), now a place: six shopfronts along
 * the back wall, each under an awning in its good's colour with a lit sign; a
 * tiled floor with a walkway; along the front the works (three fitting bays
 * under a chimney), the green belt as a little greenhouse, the corral as a pen
 * of real MULEs, and the pub, warm and amber; an airlock door to the colony at
 * each end. It fills whatever stage it is given, phone or laptop.
 *
 * GRAFT TARGET: packages/ui/src/components/Store.tsx::StoreInterior (WS6's hall,
 * WS4 reviews). Keeps the scaffold's data-testids: store-hall, row-outfitters,
 * row-services, booth-<room>, fit-<good>, door-L/R, visitor-<id>, tap-here.
 */

export type Spot = 'doorL' | 'doorR' | 'works' | 'greenBelt' | 'corral' | 'pub' | 'food' | 'water' | 'energy' | 'smithore' | 'crystite' | 'rareEarth';

const OUTFITTERS = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'] as const satisfies readonly Good[];
const FITS = [
  { good: 'alloy' as const, name: 'Smelter' },
  { good: 'electronics' as const, name: 'Electronics' },
  { good: 'medicine' as const, name: 'Medicine lab' },
];

/** The rooms' left/right edges in % of the hall, and the floor spot in front of each. */
const TOP = { y0: 3, y1: 39 };
const BOT = { y0: 60, y1: 97 };
const X0 = 9;
const X1 = 91;
const COL = (X1 - X0) / 6;
const BOTTOM: Record<'works' | 'greenBelt' | 'corral' | 'pub', [number, number]> = { works: [9, 36], greenBelt: [37, 46], corral: [47, 73], pub: [74, 91] };
export const SPOT: Record<Spot, { x: number; y: number }> = {
  ...(Object.fromEntries(OUTFITTERS.map((g, i) => [g, { x: X0 + COL * (i + 0.5), y: 46 }])) as Record<(typeof OUTFITTERS)[number], { x: number; y: number }>),
  works: { x: 22.5, y: 54 },
  greenBelt: { x: 41.5, y: 54 },
  corral: { x: 60, y: 54 },
  pub: { x: 82.5, y: 54 },
  doorL: { x: 4.5, y: 50 },
  doorR: { x: 95.5, y: 50 },
};

/** Seconds to walk between two spots: the hall's width in about 2 s (R1 placeholder). */
export function walkSeconds(a: { x: number; y: number }, b: { x: number; y: number }, zipwing = false): number {
  const d = Math.hypot((a.x - b.x) / 100, ((a.y - b.y) / 100) * 0.5);
  return Math.max(0.3, d * 2) / (zipwing ? 2 : 1);
}

export interface Visitor {
  id: string;
  at: { x: number; y: number };
  walk: number;
  time: number;
  leading: 'empty' | Good | null;
  me?: boolean;
  moving?: boolean;
}

const box = (x0: number, x1: number, y0: number, y1: number): CSSProperties => ({ left: `${x0}%`, width: `${x1 - x0}%`, top: `${y0}%`, height: `${y1 - y0}%` });

/** A room you can walk to: a real button, glowing when the guide points at it, legible and saying why when closed. */
function Room({
  testid,
  style,
  onTap,
  disabled,
  next,
  lock,
  className,
  children,
}: {
  testid: string;
  style: CSSProperties;
  onTap?: (() => void) | undefined;
  disabled: boolean;
  next: boolean;
  lock?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  // A room with its own tap is a button; the works holds its own fit buttons, so it is a plain container.
  const Tag = onTap ? 'button' : 'div';
  return (
    <Tag
      {...(onTap ? { type: 'button' as const, onClick: onTap, disabled } : { 'aria-disabled': disabled })}
      className={cx(
        'group absolute flex flex-col overflow-hidden rounded-panel border text-center transition-[opacity,filter,box-shadow]',
        disabled ? (lock !== undefined ? 'border-holo-faint opacity-75 saturate-[0.6]' : 'border-holo-faint opacity-45') : 'border-holo-line enabled:hover:border-holo',
        next && !disabled && 'z-[1] border-2 border-holo animate-[beckon_1.6s_ease-in-out_infinite]',
        className,
      )}
      style={style}
      data-testid={testid}
      {...(next && !disabled ? { 'data-next': true } : {})}
    >
      {children}
      {next && !disabled && (
        <span className="absolute left-1/2 top-1 z-[2] -translate-x-1/2 rounded-full bg-holo px-2 font-mono text-[10px] font-bold leading-4 text-on-holo shadow-glow" data-testid="tap-here">
          TAP
        </span>
      )}
      {disabled && lock && (
        <span className="shrink-0 bg-void/60 px-1 py-px font-mono text-[7px] uppercase leading-tight text-ink-2 @min-[1100px]:py-0.5 @min-[1100px]:text-[11px]">{lock}</span>
      )}
    </Tag>
  );
}

/** A scalloped awning in a colour. */
function Awning({ color }: { color: string }) {
  return (
    <svg aria-hidden viewBox="0 0 60 10" preserveAspectRatio="none" className="h-[16%] min-h-3 w-full shrink-0">
      <path d="M0 0 H60 V5 Q57.5 10 55 5 Q52.5 10 50 5 Q47.5 10 45 5 Q42.5 10 40 5 Q37.5 10 35 5 Q32.5 10 30 5 Q27.5 10 25 5 Q22.5 10 20 5 Q17.5 10 15 5 Q12.5 10 10 5 Q7.5 10 5 5 Q2.5 10 0 5 Z" fill={color} />
      <path d="M10 0 V5 M20 0 V5 M30 0 V5 M40 0 V5 M50 0 V5" stroke="#000" strokeOpacity={0.18} strokeWidth={4} />
    </svg>
  );
}

export function Hall({
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
  /** Laptop and up: bigger type and creatures. */
  wide?: boolean;
  overlay?: ReactNode;
}) {
  const can = (s: Spot) => !open || open.includes(s);
  const tap = (s: Spot, fit?: Good) => (onSpot ? () => onSpot(s, fit) : undefined);
  const nx = (s: Spot) => next.includes(s);
  const name = wide ? 'text-lg' : 'text-[11px]';
  const price = cx('font-mono font-bold', wide ? 'text-base' : 'text-[10px]');
  return (
    <div
      className="relative h-full w-full select-none overflow-hidden rounded-sheet border border-holo-line"
      style={{
        // The floor: soft tiles under a warm ceiling light, all from tokens.
        background:
          'radial-gradient(ellipse 60% 45% at 50% 50%, color-mix(in srgb, var(--color-warn) 10%, transparent), transparent 70%), repeating-linear-gradient(90deg, transparent 0 46px, var(--color-holo-faint) 46px 47px), repeating-linear-gradient(0deg, transparent 0 46px, var(--color-holo-faint) 46px 47px), var(--color-table)',
      }}
      data-testid="store-hall"
    >
      {/* The back wall behind the shopfronts. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-[42%] border-b-2 border-holo-line bg-raised/50" />
      {/* The walkway between the rows. */}
      <div aria-hidden className="absolute inset-x-[8%] top-[43%] h-[14%] rounded-full border border-dashed border-holo-faint bg-panel/30" />

      <div data-testid="row-outfitters">
        {OUTFITTERS.map((g, i) => (
          <Room key={g} testid={`booth-${g}`} style={box(X0 + COL * i + 0.4, X0 + COL * (i + 1) - 0.4, TOP.y0, TOP.y1)} onTap={tap(g)} disabled={!can(g)} next={nx(g)} lock={locks?.[g]} className="bg-panel">
            <Awning color={`var(--color-g-${g})`} />
            <span className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1" data-shop={g}>
              <span className="grid place-items-center rounded-full p-1.5" style={{ background: `color-mix(in srgb, var(--color-g-${g}) 18%, transparent)`, boxShadow: `0 0 18px color-mix(in srgb, var(--color-g-${g}) 35%, transparent)` }}>
                <GoodIcon good={g} size={wide ? 40 : 20} />
              </span>
              <span className={cx('font-display font-semibold leading-tight', name)}>{GOOD_NAME[g]}</span>
              <span data-num className={cx(price, 'rounded-chip bg-void/50 px-1.5 text-ink')}>
                {prices[g]} cr
              </span>
            </span>
          </Room>
        ))}
      </div>

      <div data-testid="row-services">
        {/* The works: three fitting bays under a chimney. */}
        <Room testid="booth-works" style={box(BOTTOM.works[0], BOTTOM.works[1], BOT.y0, BOT.y1)} disabled={!can('works')} next={nx('works')} lock={locks?.works} className="bg-panel">
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

        {/* The green belt: a little greenhouse. */}
        <Room testid="booth-greenBelt" style={box(BOTTOM.greenBelt[0], BOTTOM.greenBelt[1], BOT.y0, BOT.y1)} onTap={tap('greenBelt')} disabled={!can('greenBelt')} next={nx('greenBelt')} lock={locks?.greenBelt} className="bg-ok/10">
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

        {/* The corral: a pen of real MULEs. */}
        <Room testid="booth-corral" style={box(BOTTOM.corral[0], BOTTOM.corral[1], BOT.y0, BOT.y1)} onTap={tap('corral')} disabled={!can('corral') || mules === 0} next={nx('corral')} lock={locks?.corral} className="bg-holo-soft">
          <span className="relative flex flex-1 items-end justify-center gap-0 overflow-hidden px-1 pt-3" data-shop="corral">
            {/* The fence. */}
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

        {/* The pub: warm light, a sign. */}
        <Room
          testid="booth-pub"
          style={{ ...box(BOTTOM.pub[0], BOTTOM.pub[1], BOT.y0, BOT.y1), background: 'radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--color-warn) 30%, transparent), color-mix(in srgb, var(--color-warn) 8%, var(--color-panel)) 70%)' }}
          onTap={tap('pub')}
          disabled={!can('pub')}
          next={nx('pub')}
          lock={locks?.pub}
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

      <Door side="L" onTap={tap('doorL')} next={nx('doorL')} wide={wide} />
      <Door side="R" onTap={tap('doorR')} next={nx('doorR')} wide={wide} />

      {visitors.map((v) => (
        <HallWalker key={v.id} v={v} wide={wide} />
      ))}
      {overlay}
    </div>
  );
}

/** An airlock door out to the colony. */
function Door({ side, onTap, next, wide }: { side: 'L' | 'R'; onTap: (() => void) | undefined; next: boolean; wide: boolean }) {
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={!onTap}
      className={cx(
        'absolute top-[30%] flex h-[40%] w-[7%] flex-col items-center justify-center gap-1 rounded-panel border-2 border-dashed border-holo-line bg-void/60 text-holo enabled:hover:bg-holo-soft',
        side === 'L' ? 'left-[0.6%]' : 'right-[0.6%]',
        next && 'border-solid border-holo bg-holo-soft animate-[beckon_1.6s_ease-in-out_infinite]',
      )}
      aria-label="Out to the colony"
      data-testid={`door-${side}`}
      {...(next ? { 'data-next': true } : {})}
    >
      <span className={cx('font-display font-bold', wide ? 'text-3xl' : 'text-base')}>{side === 'L' ? '←' : '→'}</span>
      <span className={cx('font-mono font-bold leading-tight [writing-mode:vertical-rl]', wide ? 'text-xs' : 'text-[7px]')}>TO THE COLONY</span>
    </button>
  );
}

/** A colonist on the floor with its time bar, leading its MULE (the character, not the glyph). */
export function HallWalker({ v, wide }: { v: Visitor; wide: boolean }) {
  const slot = (slotOf(VIEW, v.id) ?? 0) as Slot;
  const species = useSeatSpecies(slot);
  const left = v.at.x > 50;
  return (
    <div
      className="pointer-events-none absolute z-[3] flex -translate-x-1/2 -translate-y-[80%] flex-col items-center"
      style={{ left: `${v.at.x}%`, top: `${v.at.y}%`, transition: `left ${v.walk}s linear, top ${v.walk}s linear` }}
      data-testid={`visitor-${v.id}`}
    >
      <span className={cx('mb-0.5 overflow-hidden rounded-full bg-void/70', wide ? 'h-2 w-14' : 'h-1 w-8')}>
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(1, v.time)) * 100}%`, background: SLOT_COLOR[slot] }} />
      </span>
      <span className={cx('flex items-end', left ? 'flex-row-reverse' : '', v.moving && 'animate-[waddle_0.36s_ease-in-out_infinite]')}>
        <span className={cx('rounded-full', v.me && 'ring-2 ring-holo ring-offset-1 ring-offset-table')}>
          <Creature species={species} color={SLOT_COLOR[slot]} size={wide ? 52 : 28} />
        </span>
        {v.leading && <Mule size={wide ? 60 : 32} state={v.moving ? 'walk' : 'idle'} good={v.leading === 'empty' ? null : v.leading} owner={SLOT_COLOR[slot]} facing={left ? 'left' : 'right'} />}
      </span>
    </div>
  );
}
