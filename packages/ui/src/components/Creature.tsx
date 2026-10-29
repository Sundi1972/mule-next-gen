import { memo, useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { GAIT, type Facing, type Motion } from './motion/gait';
import type { Species } from './species';
import { cx } from './tokens';

/** The creatures' pupil and line ink, shared with the MULE. */
export const PUPIL = '#0f1d2b';

function Eye({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill="#fff" />
      <circle cx={x + r * 0.2} cy={y + r * 0.15} r={r * 0.5} fill={PUPIL} />
      <circle cx={x + r * 0.35} cy={y - r * 0.15} r={r * 0.18} fill="#fff" />
    </>
  );
}

/** Each species as a small creature, drawn in its player's colour on a 32 unit grid. */
function parts(species: Species, body: string, shade: string, light: string): ReactNode {
  const b = { fill: body, stroke: shade, strokeWidth: 1.2 };
  switch (species) {
    case 'zipwing':
      return (
        <>
          <path d="M13 17 C6 7 1 12 2.5 19 C5.5 19.5 9 19.5 13 21Z" fill={light} stroke={shade} strokeWidth={1} />
          <path d="M19 17 C26 7 31 12 29.5 19 C26.5 19.5 23 19.5 19 21Z" fill={light} stroke={shade} strokeWidth={1} />
          <path d="M14 10 L11 4 M18 10 L21 4" stroke={shade} strokeWidth={1.2} strokeLinecap="round" />
          <circle cx={11} cy={4} r={1.5} fill={body} />
          <circle cx={21} cy={4} r={1.5} fill={body} />
          <path d="M16 30 L13.5 25 H18.5Z" fill={shade} />
          <ellipse cx={16} cy={18} rx={7} ry={9} {...b} />
          <Eye x={13.3} y={16} r={2.6} />
          <Eye x={18.7} y={16} r={2.6} />
        </>
      );
    case 'bramblet':
      return (
        <>
          <path d="M16 11 V5" stroke="#2f8f4a" strokeWidth={1.4} strokeLinecap="round" />
          <path d="M16 7 C12 2.5 7.5 4.5 8.5 8 C11 9.5 14 9 16 7Z" fill="#46b866" stroke="#2f8f4a" strokeWidth={0.8} />
          <path d="M16 6 C19 2 24 3 23.5 6.5 C21 8 18 7.8 16 6Z" fill="#5cc97a" stroke="#2f8f4a" strokeWidth={0.8} />
          <ellipse cx={11} cy={29} rx={3.2} ry={1.8} fill={shade} />
          <ellipse cx={21} cy={29} rx={3.2} ry={1.8} fill={shade} />
          <ellipse cx={16} cy={20} rx={10.5} ry={9.5} {...b} />
          <ellipse cx={16} cy={23} rx={6} ry={4.5} fill={light} opacity={0.55} />
          <Eye x={12.5} y={18} r={3} />
          <Eye x={19.5} y={18} r={3} />
          <path d="M13.5 24 Q16 26.3 18.5 24" stroke={PUPIL} strokeWidth={1.1} fill="none" strokeLinecap="round" />
        </>
      );
    case 'gearling':
      return (
        <>
          <path d="M16 9 V4.5" stroke={shade} strokeWidth={1.4} />
          <circle cx={16} cy={4} r={2.2} fill={light} stroke={shade} strokeWidth={1} />
          <rect x={2.5} y={15} width={4} height={7} rx={1.5} fill={shade} />
          <rect x={25.5} y={15} width={4} height={7} rx={1.5} fill={shade} />
          <rect x={10} y={26} width={4} height={4} rx={1} fill={shade} />
          <rect x={18} y={26} width={4} height={4} rx={1} fill={shade} />
          <rect x={5.5} y={9} width={21} height={18} rx={5} {...b} />
          <rect x={9} y={13} width={14} height={7} rx={3.5} fill="#fff" stroke={shade} strokeWidth={0.8} />
          <circle cx={18} cy={16.5} r={2.4} fill={PUPIL} />
          <circle cx={18.8} cy={15.8} r={0.7} fill="#fff" />
          <path d="M12 23.5 H20" stroke={shade} strokeWidth={1.4} strokeLinecap="round" strokeDasharray="1.6 1.4" />
        </>
      );
    case 'mollox':
      return (
        <>
          <circle cx={7} cy={11} r={3.4} {...b} />
          <circle cx={25} cy={11} r={3.4} {...b} />
          <ellipse cx={16} cy={19.5} rx={12.5} ry={10} {...b} />
          <path d="M4 26 l-1.5 3 M6.5 27 l-0.8 3.2 M9 27.5 l0 3" stroke={light} strokeWidth={1.5} strokeLinecap="round" />
          <path d="M28 26 l1.5 3 M25.5 27 l0.8 3.2 M23 27.5 l0 3" stroke={light} strokeWidth={1.5} strokeLinecap="round" />
          <ellipse cx={16} cy={22.5} rx={5} ry={3.6} fill={light} />
          <ellipse cx={16} cy={20.6} rx={1.9} ry={1.4} fill={PUPIL} />
          <circle cx={11.5} cy={16} r={1.7} fill={PUPIL} />
          <circle cx={20.5} cy={16} r={1.7} fill={PUPIL} />
          <circle cx={12} cy={15.5} r={0.5} fill="#fff" />
          <circle cx={21} cy={15.5} r={0.5} fill="#fff" />
        </>
      );
    case 'glimmer':
      return (
        <>
          {[8.5, 13.5, 18.5, 23.5].map((x, i) => (
            <path
              key={x}
              d={`M${x} 18 q${i % 2 ? 2 : -2} 3 0 6 q${i % 2 ? -2 : 2} 3 0 6`}
              stroke={body}
              strokeWidth={2.6}
              fill="none"
              strokeLinecap="round"
            />
          ))}
          <path d="M4.5 19 C4.5 9.5 9.5 4 16 4 C22.5 4 27.5 9.5 27.5 19 Q16 21.5 4.5 19Z" {...b} />
          <path d="M9 9.5 C10.5 7 12.5 6 15 5.8" stroke={light} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <Eye x={10.8} y={14} r={2.2} />
          <Eye x={16} y={11.6} r={2.4} />
          <Eye x={21.2} y={14} r={2.2} />
        </>
      );
    case 'quibbit':
      return (
        <>
          <ellipse cx={8} cy={28.5} rx={4} ry={1.8} fill={shade} />
          <ellipse cx={24} cy={28.5} rx={4} ry={1.8} fill={shade} />
          <ellipse cx={16} cy={21} rx={13.5} ry={8} {...b} />
          <circle cx={10} cy={12} r={5} {...b} />
          <circle cx={22} cy={12} r={5} {...b} />
          <ellipse cx={16} cy={24} rx={8} ry={3.6} fill={light} opacity={0.6} />
          <Eye x={10} y={12} r={3.2} />
          <Eye x={22} y={12} r={3.2} />
          <path d="M7.5 20 Q16 26.5 24.5 20" stroke={PUPIL} strokeWidth={1.2} fill="none" strokeLinecap="round" />
          <circle cx={27} cy={26} r={3.3} fill="#f2c94c" stroke="#a87b00" strokeWidth={0.9} />
          <path d="M27 24.4 V27.6" stroke="#a87b00" strokeWidth={0.9} />
        </>
      );
  }
}

/** The species drawing itself: a still SVG, the same for every caller. */
function Drawing({ species, color, size, className }: { species: Species; color: string; size: number; className?: string | undefined }) {
  const shade = `color-mix(in srgb, ${color} 62%, black)`;
  const light = `color-mix(in srgb, ${color} 45%, white)`;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} aria-hidden style={{ overflow: 'visible' }}>
      {parts(species, color, shade, light)}
    </svg>
  );
}

export interface CreatureProps {
  species: Species;
  color: string;
  size?: number;
  className?: string;
  /** What it does (gait.ts::motionOf). Any motion prop puts the drawing in its motion wrappers; none leaves it still. */
  motion?: Motion;
  facing?: Facing;
  /** Seconds per stride, or per breath standing (gait.ts::cycleSeconds). */
  cycle?: number;
  /** Bites taken so far: each new one plays the flinch. */
  flinch?: number;
  /** Your own strikes so far: each new one jabs. */
  strike?: number;
  /** The ground shadow under a moving creature (default on). */
  shadow?: boolean;
}

/**
 * A colonist creature. With no motion props it is the still drawing, as it always was. With any of them it moves as
 * variant A, "bob and waddle": the same drawing inside HTML wrappers that bob, squash, sway, lean and flip, so every
 * animation is a transform the compositor can run without repainting the creature (keyframes cm-* in theme.css).
 * Memoised: a board re-rendering at 20 Hz does not redraw an unchanged creature.
 */
export const Creature = memo(function Creature({ species, color, size = 32, className, motion, facing, cycle, flinch, strike, shadow }: CreatureProps) {
  if (motion === undefined && facing === undefined && cycle === undefined && flinch === undefined && strike === undefined) {
    return <Drawing species={species} color={color} size={size} className={className} />;
  }
  const m = motion ?? 'idle';
  return (
    <CreatureInMotion
      species={species}
      color={color}
      size={size}
      className={className}
      motion={m}
      facing={facing ?? 'right'}
      cycle={cycle ?? (m === 'idle' ? GAIT.idleCycle : m === 'fight' ? GAIT.fightCycle : GAIT.fullCycle)}
      flinch={flinch ?? 0}
      strike={strike ?? 0}
      shadow={shadow ?? true}
    />
  );
});

// The one-shot moments, played with the Web Animations API on their own wrappers (composited transforms).
const FLINCH: Keyframe[] = [
  { transform: 'none' },
  { transform: 'translateX(-14%) rotate(-14deg) scale(0.88, 1.1)', offset: 0.18 },
  { transform: 'translateX(6%) rotate(6deg) scale(1.04, 0.96)', offset: 0.45 },
  { transform: 'translateX(-3%) rotate(-3deg)', offset: 0.7 },
  { transform: 'none' },
];
const BITE: Keyframe[] = [
  { opacity: 0, transform: 'scale(0.4)' },
  { opacity: 1, transform: 'scale(1)', offset: 0.25 },
  { opacity: 0, transform: 'scale(1.5)' },
];
const STRIKE: Keyframe[] = [
  { transform: 'none' },
  { transform: 'translateX(-6%) rotate(-6deg)', offset: 0.3 },
  { transform: 'translateX(24%) rotate(12deg) scale(1.1, 0.92)', offset: 0.55 },
  { transform: 'none' },
];
const SWIPE: Keyframe[] = [
  { opacity: 0, transform: 'scale(0.6) rotate(-30deg)' },
  { opacity: 0, transform: 'scale(0.6) rotate(-30deg)', offset: 0.45 },
  { opacity: 1, transform: 'scale(1) rotate(0deg)', offset: 0.6 },
  { opacity: 0, transform: 'scale(1.15) rotate(15deg)' },
];
const FLINCH_MS = 450;
const STRIKE_MS = 380;

export function replays(_seen: number, _count: number, _reduced: boolean): boolean {
  throw new Error('NotImplemented: replays');
}

/** Plays the frames on each wrapper once whenever `count` moves on (not on mount), and never under reduced motion. */
function useOneShot(count: number, ms: number, plays: [RefObject<HTMLSpanElement | null>, Keyframe[]][]) {
  const seen = useRef(count);
  useEffect(() => {
    if (count === seen.current) return;
    seen.current = count;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    for (const [ref, frames] of plays) ref.current?.animate(frames, { duration: ms, easing: 'ease-out' });
    // `plays` holds refs and module constants, so only a new count replays.
  }, [count, ms]);
}

/**
 * The wrappers, outside in: cm-face (the facing flip) > cm-glance (looking back while running) > cm-lean (the static
 * lean into travel, also the reduced-motion pose) > cm-hit (the bite's flinch) > cm-hit (the own strike) > cm-body
 * (bob, breathe, limp, bounce) > cm-sway (side to side, the jab) > the drawing.
 */
function CreatureInMotion({
  species,
  color,
  size,
  className,
  motion,
  facing,
  cycle,
  flinch,
  strike,
  shadow,
}: Required<Omit<CreatureProps, 'className'>> & { className: string | undefined }) {
  const hit = useRef<HTMLSpanElement>(null);
  const bite = useRef<HTMLSpanElement>(null);
  const jab = useRef<HTMLSpanElement>(null);
  const swipe = useRef<HTMLSpanElement>(null);
  useOneShot(flinch, FLINCH_MS, [
    [hit, FLINCH],
    [bite, BITE],
  ]);
  useOneShot(strike, STRIKE_MS, [
    [jab, STRIKE],
    [swipe, SWIPE],
  ]);
  const style = { width: size, height: size, '--cycle': `${cycle.toFixed(3)}s` } as CSSProperties;
  return (
    <span aria-hidden className={cx('cm relative inline-block shrink-0', className)} style={style} data-motion={motion} data-facing={facing}>
      {shadow && <span className="cm-shadow" />}
      <span className="cm-face">
        <span className="cm-glance">
          <span className="cm-lean">
            <span ref={hit} className="cm-hit">
              <span ref={jab} className="cm-hit">
                <span className="cm-body">
                  <span className="cm-sway">
                    <Drawing species={species} color={color} size={size} className="block" />
                  </span>
                </span>
              </span>
            </span>
          </span>
        </span>
        {/* The fight's swipe, in the facing frame so it is always in front; and the own strike's, played once. */}
        <span className="cm-swipe" />
        <span ref={swipe} className="cm-swipe cm-swipe-once" />
      </span>
      <span ref={bite} className="cm-bite" />
    </span>
  );
}
