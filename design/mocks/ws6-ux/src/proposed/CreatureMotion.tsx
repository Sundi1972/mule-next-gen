/**
 * DS-GAP (WS6 → packages/ui/src/components/Creature.tsx, WS4 reviews): the colonist creatures in motion. Today's
 * Creature is a still SVG with no facing; a walking colonist only tilts as a whole (store-waddle). Proposed:
 * `motion`, `facing` and `cycle` (the stride's seconds, from gait.ts), in two variants for Heiko to pick:
 *
 * - A · "bob and waddle": the product's Creature, unchanged, inside four HTML wrappers that bob, squash, sway and
 *   lean. One keyframe set for all six species. Every animation is an HTML transform, so the browser can run it on
 *   the compositor without repainting the creature.
 * - B · "feet": each species redrawn in parts (the same geometry as Creature.tsx, grouped), its feet, arms, wings,
 *   ears or tentacles swinging in pairs like the MULE's legs (mule-step), the eyes blinking like the MULE's, plus a
 *   smaller bob on the wrapper. Animations on SVG parts repaint the creature each frame.
 *
 * Both share facing (the wrapper flips like Mule's `scale(-1 1)`, through a squash, so a turn reads as a turn), the
 * lean into travel, the glance back while running, the strike swipe, the bite flinch, and the reduced-motion poses.
 * Keyframes are cm-* in screens/motion/motion.css, to move into theme.css beside mule-*.
 */
import { Creature, PUPIL, type Species } from '@mule/ui';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { Facing, Motion } from '../screens/motion/gait';

export type MotionVariant = 'A' | 'B';

const EYE_WHITE = 'var(--color-eye-white)';

function Eye({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={EYE_WHITE} />
      <circle cx={x + r * 0.2} cy={y + r * 0.15} r={r * 0.5} fill={PUPIL} />
      <circle cx={x + r * 0.35} cy={y - r * 0.15} r={r * 0.18} fill={EYE_WHITE} />
    </>
  );
}

/** A moving part: its role picks the keyframes (motion.css), `o` is its pivot in the 32-unit grid. */
function Part({ role, o, b, children }: { role: string; o: [number, number]; b?: boolean; children: ReactNode }) {
  return (
    <g className={`${role.split(' ').map((r) => `cmB-${r}`).join(' ')}${b ? ' cmB-b' : ''}`} style={{ transformOrigin: `${o[0]}px ${o[1]}px` }}>
      {children}
    </g>
  );
}

/** The eyes: they blink (always, like the MULE), and glance back while running. */
function Eyes({ o, children }: { o: [number, number]; children: ReactNode }) {
  return (
    <g className="cmB-look">
      <Part role="blink" o={o}>
        {children}
      </Part>
    </g>
  );
}

/**
 * Variant B's species, part by part. The geometry is Creature.tsx's, element for element and in its drawing order, so
 * standing still B is the product's creature; only the grouping is new. Roles: foot (steps), limb (swings from a hip
 * or shoulder), wing (flaps), sprig (antennae, leaves, ears: wobbles), strike (the part that jabs in a fight).
 */
function parts(species: Species, body: string, shade: string, light: string): ReactNode {
  const b = { fill: body, stroke: shade, strokeWidth: 1.2 };
  switch (species) {
    case 'zipwing':
      return (
        <>
          <Part role="wing" o={[13, 19]}>
            <path d="M13 17 C6 7 1 12 2.5 19 C5.5 19.5 9 19.5 13 21Z" fill={light} stroke={shade} strokeWidth={1} />
          </Part>
          <Part role="wing strike" o={[19, 19]} b>
            <path d="M19 17 C26 7 31 12 29.5 19 C26.5 19.5 23 19.5 19 21Z" fill={light} stroke={shade} strokeWidth={1} />
          </Part>
          <Part role="sprig" o={[16, 10]}>
            <path d="M14 10 L11 4 M18 10 L21 4" stroke={shade} strokeWidth={1.2} strokeLinecap="round" />
            <circle cx={11} cy={4} r={1.5} fill={body} />
            <circle cx={21} cy={4} r={1.5} fill={body} />
          </Part>
          <Part role="tail" o={[16, 25]}>
            <path d="M16 30 L13.5 25 H18.5Z" fill={shade} />
          </Part>
          <ellipse cx={16} cy={18} rx={7} ry={9} {...b} />
          <Eyes o={[16, 16]}>
            <Eye x={13.3} y={16} r={2.6} />
            <Eye x={18.7} y={16} r={2.6} />
          </Eyes>
        </>
      );
    case 'bramblet':
      return (
        <>
          <Part role="sprig" o={[16, 11]}>
            <path d="M16 11 V5" stroke="#2f8f4a" strokeWidth={1.4} strokeLinecap="round" />
            <path d="M16 7 C12 2.5 7.5 4.5 8.5 8 C11 9.5 14 9 16 7Z" fill="#46b866" stroke="#2f8f4a" strokeWidth={0.8} />
            <path d="M16 6 C19 2 24 3 23.5 6.5 C21 8 18 7.8 16 6Z" fill="#5cc97a" stroke="#2f8f4a" strokeWidth={0.8} />
          </Part>
          <Part role="foot" o={[11, 29]}>
            <ellipse cx={11} cy={29} rx={3.2} ry={1.8} fill={shade} />
          </Part>
          <Part role="foot strike" o={[21, 29]} b>
            <ellipse cx={21} cy={29} rx={3.2} ry={1.8} fill={shade} />
          </Part>
          <ellipse cx={16} cy={20} rx={10.5} ry={9.5} {...b} />
          <ellipse cx={16} cy={23} rx={6} ry={4.5} fill={light} opacity={0.55} />
          <Eyes o={[16, 18]}>
            <Eye x={12.5} y={18} r={3} />
            <Eye x={19.5} y={18} r={3} />
          </Eyes>
          <path d="M13.5 24 Q16 26.3 18.5 24" stroke={PUPIL} strokeWidth={1.1} fill="none" strokeLinecap="round" />
        </>
      );
    case 'gearling':
      return (
        <>
          <Part role="sprig" o={[16, 9]}>
            <path d="M16 9 V4.5" stroke={shade} strokeWidth={1.4} />
            <circle cx={16} cy={4} r={2.2} fill={light} stroke={shade} strokeWidth={1} />
          </Part>
          <Part role="limb" o={[4.5, 15.5]}>
            <rect x={2.5} y={15} width={4} height={7} rx={1.5} fill={shade} />
          </Part>
          <Part role="limb strike" o={[27.5, 15.5]} b>
            <rect x={25.5} y={15} width={4} height={7} rx={1.5} fill={shade} />
          </Part>
          <Part role="foot" o={[12, 28]}>
            <rect x={10} y={26} width={4} height={4} rx={1} fill={shade} />
          </Part>
          <Part role="foot" o={[20, 28]} b>
            <rect x={18} y={26} width={4} height={4} rx={1} fill={shade} />
          </Part>
          <rect x={5.5} y={9} width={21} height={18} rx={5} {...b} />
          <rect x={9} y={13} width={14} height={7} rx={3.5} fill={EYE_WHITE} stroke={shade} strokeWidth={0.8} />
          <Eyes o={[18, 16.5]}>
            <circle cx={18} cy={16.5} r={2.4} fill={PUPIL} />
            <circle cx={18.8} cy={15.8} r={0.7} fill={EYE_WHITE} />
          </Eyes>
          <path d="M12 23.5 H20" stroke={shade} strokeWidth={1.4} strokeLinecap="round" strokeDasharray="1.6 1.4" />
        </>
      );
    case 'mollox':
      return (
        <>
          <Part role="sprig" o={[9, 13]}>
            <circle cx={7} cy={11} r={3.4} {...b} />
          </Part>
          <Part role="sprig" o={[23, 13]} b>
            <circle cx={25} cy={11} r={3.4} {...b} />
          </Part>
          <ellipse cx={16} cy={19.5} rx={12.5} ry={10} {...b} />
          <Part role="foot" o={[6.5, 26.5]}>
            <path d="M4 26 l-1.5 3 M6.5 27 l-0.8 3.2 M9 27.5 l0 3" stroke={light} strokeWidth={1.5} strokeLinecap="round" />
          </Part>
          <Part role="foot strike" o={[25.5, 26.5]} b>
            <path d="M28 26 l1.5 3 M25.5 27 l0.8 3.2 M23 27.5 l0 3" stroke={light} strokeWidth={1.5} strokeLinecap="round" />
          </Part>
          <ellipse cx={16} cy={22.5} rx={5} ry={3.6} fill={light} />
          <ellipse cx={16} cy={20.6} rx={1.9} ry={1.4} fill={PUPIL} />
          <Eyes o={[16, 16]}>
            <circle cx={11.5} cy={16} r={1.7} fill={PUPIL} />
            <circle cx={20.5} cy={16} r={1.7} fill={PUPIL} />
            <circle cx={12} cy={15.5} r={0.5} fill={EYE_WHITE} />
            <circle cx={21} cy={15.5} r={0.5} fill={EYE_WHITE} />
          </Eyes>
        </>
      );
    case 'glimmer':
      return (
        <>
          {[8.5, 13.5, 18.5, 23.5].map((x, i) => (
            <Part key={x} role={i === 3 ? 'limb strike' : 'limb'} o={[x, 18]} b={i % 2 === 1}>
              <path d={`M${x} 18 q${i % 2 ? 2 : -2} 3 0 6 q${i % 2 ? -2 : 2} 3 0 6`} stroke={body} strokeWidth={2.6} fill="none" strokeLinecap="round" />
            </Part>
          ))}
          <path d="M4.5 19 C4.5 9.5 9.5 4 16 4 C22.5 4 27.5 9.5 27.5 19 Q16 21.5 4.5 19Z" {...b} />
          <path d="M9 9.5 C10.5 7 12.5 6 15 5.8" stroke={light} strokeWidth={1.6} fill="none" strokeLinecap="round" />
          <Eyes o={[16, 13]}>
            <Eye x={10.8} y={14} r={2.2} />
            <Eye x={16} y={11.6} r={2.4} />
            <Eye x={21.2} y={14} r={2.2} />
          </Eyes>
        </>
      );
    case 'quibbit':
      return (
        <>
          <Part role="foot" o={[8, 28.5]}>
            <ellipse cx={8} cy={28.5} rx={4} ry={1.8} fill={shade} />
          </Part>
          <Part role="foot strike" o={[24, 28.5]} b>
            <ellipse cx={24} cy={28.5} rx={4} ry={1.8} fill={shade} />
          </Part>
          <ellipse cx={16} cy={21} rx={13.5} ry={8} {...b} />
          <circle cx={10} cy={12} r={5} {...b} />
          <circle cx={22} cy={12} r={5} {...b} />
          <ellipse cx={16} cy={24} rx={8} ry={3.6} fill={light} opacity={0.6} />
          <Eyes o={[16, 12]}>
            <Eye x={10} y={12} r={3.2} />
            <Eye x={22} y={12} r={3.2} />
          </Eyes>
          <path d="M7.5 20 Q16 26.5 24.5 20" stroke={PUPIL} strokeWidth={1.2} fill="none" strokeLinecap="round" />
          <Part role="coin" o={[27, 26]}>
            <circle cx={27} cy={26} r={3.3} fill="#f2c94c" stroke="#a87b00" strokeWidth={0.9} />
            <path d="M27 24.4 V27.6" stroke="#a87b00" strokeWidth={0.9} />
          </Part>
        </>
      );
  }
}

/** Variant B's creature: Creature's drawing, in moving parts. */
export function CreatureParts({ species, color, size }: { species: Species; color: string; size: number }) {
  const shade = `color-mix(in srgb, ${color} 62%, black)`;
  const light = `color-mix(in srgb, ${color} 45%, white)`;
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className="block" style={{ overflow: 'visible' }}>
      {parts(species, color, shade, light)}
    </svg>
  );
}

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

const reducedNow = (el: Element) => !!el.closest('[data-reduced]') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One-shot moments, played with the Web Animations API on their own wrappers: a bite (`flinch` counts bites; each new
 * one flinches) and your own strike (`strike` counts presses). Composited transforms, and nothing under reduced motion.
 */
function useOneShot(count: number, ref: React.RefObject<HTMLElement | null>, frames: Keyframe[], ms: number, extra?: { ref: React.RefObject<HTMLElement | null>; frames: Keyframe[] }) {
  const seen = useRef(count);
  useEffect(() => {
    if (count === seen.current) return;
    seen.current = count;
    const el = ref.current;
    if (!el || reducedNow(el)) return;
    el.animate(frames, { duration: ms, easing: 'ease-out' });
    extra?.ref.current?.animate(extra.frames, { duration: ms, easing: 'ease-out' });
  }, [count, ref, frames, ms, extra]);
}

/**
 * A colonist creature that moves. `cycle` is one stride's seconds (gait.ts::cycleSeconds): the CSS cycle follows it,
 * so a hungry colonist on a mountain visibly strides slower than a fed one on the plains.
 */
export function MovingCreature({
  species,
  color,
  size = 32,
  variant = 'A',
  motion = 'idle',
  facing = 'right',
  cycle,
  flinch = 0,
  strike = 0,
  glow = false,
  shadow = true,
  label,
  testid,
  className,
}: {
  species: Species;
  color: string;
  size?: number;
  variant?: MotionVariant;
  motion?: Motion;
  facing?: Facing;
  /** Seconds per stride (or per breath, standing). */
  cycle?: number;
  /** Bites taken so far: each new one plays the flinch. */
  flinch?: number;
  /** Your own strikes so far: each new one jabs (the fight stance jabs on its own rhythm for everyone else). */
  strike?: number;
  /** PlayerMark's glow, for the map. */
  glow?: boolean;
  shadow?: boolean;
  label?: string;
  testid?: string;
  className?: string;
}) {
  const hit = useRef<HTMLSpanElement>(null);
  const bite = useRef<HTMLSpanElement>(null);
  const jab = useRef<HTMLSpanElement>(null);
  const swipe = useRef<HTMLSpanElement>(null);
  useOneShot(flinch, hit, FLINCH, 450, { ref: bite, frames: BITE });
  useOneShot(strike, jab, STRIKE, 380, { ref: swipe, frames: SWIPE });
  const style = { width: size, height: size, '--cycle': `${(cycle ?? 0.5).toFixed(3)}s` } as CSSProperties;
  const filter = glow ? `drop-shadow(0 0 1px var(--color-mark-edge)) drop-shadow(0 0 ${Math.round(size / 3)}px color-mix(in srgb, ${color} var(--mark-glow), transparent))` : 'drop-shadow(0 0 1px var(--color-mark-edge))';
  return (
    <span
      role="img"
      aria-label={label ?? species}
      className={`cm relative inline-block shrink-0 ${className ?? ''}`}
      style={style}
      data-variant={variant}
      data-motion={motion}
      data-facing={facing}
      data-testid={testid}
    >
      {shadow && <span aria-hidden className="cm-shadow" />}
      <span className="cm-face">
        <span className="cm-glance">
          <span className="cm-lean">
            <span ref={hit} className="cm-hit">
              <span ref={jab} className="cm-hit">
                <span className="cm-body">
                  <span className="cm-sway" style={{ filter }}>
                    {variant === 'A' ? <Creature species={species} color={color} size={size} className="block" /> : <CreatureParts species={species} color={color} size={size} />}
                  </span>
                </span>
              </span>
            </span>
          </span>
        </span>
        {/* The strike's swipe, in the facing frame so it is always in front. */}
        <span aria-hidden className="cm-swipe" />
        <span ref={swipe} aria-hidden className="cm-swipe cm-swipe-once" />
      </span>
      <span ref={bite} aria-hidden className="cm-bite" />
    </span>
  );
}

/**
 * The MULE on its lead, in step: the product's Mule (packages/ui, unchanged) inside a wrapper that sets its stride to
 * the colonist's. DS-GAP: in a build Mule takes `cycle` itself and sets the duration of mule-step and mule-bob from it;
 * here motion.css overrides the two durations through --cycle.
 */
export function InStep({ cycle, children, testid }: { cycle: number; children: ReactNode; testid?: string }) {
  return (
    <span className="cm-mule inline-block" style={{ '--cycle': `${cycle.toFixed(3)}s` } as CSSProperties} data-testid={testid}>
      {children}
    </span>
  );
}
