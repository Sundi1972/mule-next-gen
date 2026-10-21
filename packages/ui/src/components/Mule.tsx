import { useId } from 'react';
import { GoodIcon } from './GoodIcon';
import type { Good } from './tokens';

export type MuleState = 'idle' | 'walk' | 'installed';

/** What a MULE was outfitted for: a good, or a green belt. */
export type MuleGood = Good | 'greenBelt';

const PUPIL = '#0f1d2b';

/**
 * The MULE as a character (spec C19): a small mechanical dromedary in the colonists' family, with their big eye,
 * soft outline and 1.2 unit stroke. Its hump is a cargo pod with a round window: dark when the MULE is empty, lit in
 * the good's colour with the good's glyph once outfitted. A saddle cloth in its owner's colour says whose it is; a
 * store MULE has none.
 *
 * States: idle (breathes, blinks), walk (legs swing in pairs), installed (kneels, the pod pulses as it works).
 * MuleIcon stays as the glyph in text and chips. Colours come from the --color-mule-* tokens; the keyframes mule-*
 * hold still under reduced motion (theme.css).
 */
export function Mule({
  size = 48,
  state = 'idle',
  good = null,
  owner,
  facing = 'right',
  className,
}: {
  size?: number;
  state?: MuleState;
  /** What it was outfitted for; null for an empty MULE. */
  good?: MuleGood | null;
  /** The owner's colour (a SLOT_COLOR); omit for a store MULE. */
  owner?: string | undefined;
  facing?: 'left' | 'right';
  className?: string | undefined;
}) {
  const id = useId().replace(/:/g, '');
  const metal = 'var(--color-mule-metal)';
  const shade = 'var(--color-mule-shade)';
  const belly = 'var(--color-mule-belly)';
  const glow = good === 'greenBelt' ? 'var(--color-ok)' : good ? `var(--color-g-${good})` : 'var(--color-raised)';
  const kneel = state === 'installed';
  const walk = state === 'walk';
  const legStroke = { stroke: shade, strokeWidth: 2.2, strokeLinecap: 'round' as const, fill: 'none' };
  // A leg: hip, knee, hoof; or folded under the body when it kneels.
  const leg = (x: number, back: boolean) =>
    kneel ? (
      <path d={`M${x} 27 l${back ? -3 : 3} 4 l${back ? 5 : -5} 1`} {...legStroke} />
    ) : (
      <>
        <path d={`M${x} 26 L${x + (back ? -0.8 : 0.8)} 31 L${x} 35.5`} {...legStroke} />
        <circle cx={x + (back ? -0.8 : 0.8)} cy={31} r={1.1} fill={metal} stroke={shade} strokeWidth={0.8} />
        <rect x={x - 1.8} y={35.2} width={3.6} height={1.8} rx={0.9} fill={shade} />
      </>
    );
  const swing = (reverse: boolean) => (walk ? (reverse ? 'animate-[mule-step_0.5s_ease-in-out_infinite_reverse]' : 'animate-[mule-step_0.5s_ease-in-out_infinite]') : undefined);
  return (
    <svg
      viewBox="0 0 48 40"
      width={size}
      height={(size * 40) / 48}
      className={className}
      aria-hidden
      style={{ overflow: 'visible' }}
      data-mule-state={state}
      data-good={good ?? 'empty'}
    >
      <defs>
        <radialGradient id={`pod-${id}`} cx="0.45" cy="0.4" r="0.7">
          <stop offset="0" stopColor={glow} stopOpacity={good ? 1 : 0.6} />
          <stop offset="1" stopColor={glow} stopOpacity={good ? 0.55 : 0.25} />
        </radialGradient>
      </defs>
      <ellipse cx={22} cy={kneel ? 34.5 : 38} rx={15} ry={1.7} fill={PUPIL} opacity={0.18} />
      <g transform={facing === 'left' ? 'translate(48 0) scale(-1 1)' : undefined}>
        <g className={kneel ? undefined : walk ? 'animate-[mule-bob_0.5s_ease-in-out_infinite]' : 'animate-[mule-breathe_2.6s_ease-in-out_infinite]'} style={{ transformOrigin: '22px 30px' }}>
          <g transform={kneel ? 'translate(0 3)' : undefined}>
            {/* Back legs behind the body, front pair in front, each pair swinging opposite when it walks. */}
            <g className={swing(false)} style={{ transformOrigin: '12px 26px' }}>
              {leg(11, true)}
            </g>
            <g className={swing(true)} style={{ transformOrigin: '29px 26px' }}>
              {leg(29, false)}
            </g>
            {/* The tail: a short cable with a plug. */}
            <path d="M7.5 19 C4.5 19.5 3.5 22 4.5 24" stroke={shade} strokeWidth={1.3} fill="none" strokeLinecap="round" />
            <rect x={3.3} y={23.6} width={2.4} height={2.2} rx={0.6} fill={shade} />
            {/* The body: a rounded barrel with a lighter belly plate and two rivets. */}
            <rect x={7} y={16} width={27} height={12} rx={6} fill={metal} stroke={shade} strokeWidth={1.2} />
            <path d="M11 25.5 H30" stroke={belly} strokeWidth={2.4} strokeLinecap="round" />
            <circle cx={10.5} cy={20} r={0.6} fill={shade} />
            <circle cx={31} cy={20} r={0.6} fill={shade} />
            {/* The saddle cloth in the owner's colour; a store MULE has none. */}
            {owner && (
              <path
                d="M13.2 16.4 H27.8 V20.2 Q26.6 21.6 25.4 20.2 Q24.2 21.6 23 20.2 Q21.8 21.6 20.6 20.2 Q19.4 21.6 18.2 20.2 Q17 21.6 15.8 20.2 Q14.6 21.6 13.2 20.2 Z"
                fill={owner}
                stroke={shade}
                strokeWidth={0.7}
                data-part="saddle"
              />
            )}
            {/* The hump: a cargo pod with a round window, lit by the good once outfitted. */}
            <path d="M13.5 17 C13.5 6.5 27.5 6.5 27.5 17 Z" fill={metal} stroke={shade} strokeWidth={1.2} />
            <circle cx={20.5} cy={12.6} r={4.3} fill={`url(#pod-${id})`} stroke={shade} strokeWidth={1} className={kneel && good ? 'animate-[mule-work_1.4s_ease-in-out_infinite]' : undefined} />
            {good === 'greenBelt' ? (
              // A sprout: the green belt's glyph.
              <path d="M20.5 15.6 V11.4 M20.5 12.6 C18.6 12.6 17.8 11.2 18 9.9 C19.6 9.9 20.5 11 20.5 12.6 M20.5 11.6 C22.4 11.6 23.2 10.2 23 8.9 C21.4 8.9 20.5 10 20.5 11.6" stroke={PUPIL} strokeWidth={0.8} fill="none" strokeLinecap="round" />
            ) : good ? (
              <g transform="translate(17 9.1)">
                <GoodIcon good={good} size={7} color={PUPIL} />
              </g>
            ) : (
              <path d="M18.6 11 Q20.5 10 22.4 11" stroke="#fff" strokeOpacity={0.5} strokeWidth={0.7} fill="none" />
            )}
            {/* Front legs, in front of the body. */}
            <g className={swing(true)} style={{ transformOrigin: '15px 26px' }}>
              {leg(15, true)}
            </g>
            <g className={swing(false)} style={{ transformOrigin: '32px 26px' }}>
              {leg(32, false)}
            </g>
            {/* The neck, ribbed like a hose, up to the head. */}
            <path d="M31.5 19 C35 17 35.5 13 37.5 10" stroke={shade} strokeWidth={4.6} fill="none" strokeLinecap="round" />
            <path d="M31.5 19 C35 17 35.5 13 37.5 10" stroke={metal} strokeWidth={3} fill="none" strokeLinecap="round" />
            <path d="M33.4 17.4 l1.6 1 M34.8 15 l1.6 0.6 M35.9 12.6 l1.6 0.4" stroke={shade} strokeWidth={0.6} strokeLinecap="round" />
            {/* The head: ears like antennas, a big eye, a grille muzzle and a blush. */}
            <path d="M38.2 4.6 L37.2 1.4 M41.2 4.4 L42 1.2" stroke={shade} strokeWidth={1} strokeLinecap="round" />
            <circle cx={37.2} cy={1.3} r={0.9} fill={owner ?? 'var(--color-holo)'} />
            <circle cx={42} cy={1.1} r={0.9} fill={owner ?? 'var(--color-holo)'} />
            <rect x={35} y={4} width={9.5} height={8.6} rx={3.6} fill={metal} stroke={shade} strokeWidth={1.2} />
            <rect x={42} y={7.6} width={5} height={4.6} rx={1.8} fill={belly} stroke={shade} strokeWidth={1} />
            <path d="M43.6 9.1 H46 M43.6 10.6 H46" stroke={shade} strokeWidth={0.5} strokeLinecap="round" />
            <circle cx={39.6} cy={10.6} r={0.9} fill="#ff8fa3" opacity={0.6} />
            {/* Kneeling at work it closes its eye, content; otherwise it blinks now and then. */}
            {!kneel && (
              <g className="animate-[mule-blink_4.2s_linear_infinite]" style={{ transformOrigin: '39.5px 7.6px' }}>
                <circle cx={39.5} cy={7.6} r={2.3} fill="#fff" stroke={shade} strokeWidth={0.5} />
                <circle cx={40.1} cy={7.9} r={1.25} fill={PUPIL} />
                <circle cx={40.4} cy={7.3} r={0.45} fill="#fff" />
              </g>
            )}
            {kneel && <path d="M37.2 7.4 Q39.5 6.2 41.8 7.4" stroke={PUPIL} strokeWidth={0.9} fill="none" strokeLinecap="round" />}
          </g>
        </g>
      </g>
    </svg>
  );
}
