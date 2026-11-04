import { cx } from './tokens';

/** What a wolf is doing: circling, crouched to lunge (the tell), lunging, open after a miss, hurt. */
export type WolfState = 'prowl' | 'tell' | 'lunge' | 'open' | 'hurt';

/**
 * A wolf, in the creatures' family (soft outline, one bright eye), from tokens only: the MULE's shade for the coat, its
 * metal for the belly, warn for the eye. The tell crouches with an alert outline; a hurt wolf is faded.
 */
export function WolfGlyph({ size, state, facing }: { size: number; state: WolfState; facing: 'left' | 'right' }) {
  const coat = 'var(--color-mule-shade)';
  const belly = 'var(--color-mule-metal)';
  const edge = state === 'tell' ? 'var(--color-alert)' : 'var(--color-void)';
  const crouch = state === 'tell' ? 'translate(0 3) scale(1 0.85)' : state === 'lunge' ? 'scale(1.15 0.9)' : '';
  return (
    // A faint alert glow: a dark coat must read on dark forest, and a wolf is danger.
    <svg
      viewBox="0 0 32 24"
      width={size}
      height={(size * 24) / 32}
      aria-hidden
      style={{ overflow: 'visible', filter: 'drop-shadow(0 0 2px var(--color-alert)) drop-shadow(0 1px 1px var(--color-mark-edge))' }}
      className={cx(state === 'hurt' && 'opacity-60')}
      data-testid="wolf-glyph"
    >
      <g transform={facing === 'left' ? 'translate(32 0) scale(-1 1)' : undefined}>
        <g transform={crouch} style={{ transformOrigin: '16px 20px' }}>
          <path d="M5 12 C1.5 10 1 6 3 4.5 C4.5 7.5 5.5 9.5 8 10.5Z" fill={coat} stroke={edge} strokeWidth={0.9} />
          {[8, 11, 18, 21].map((x) => (
            <rect key={x} x={x} y={15} width={2.2} height={7} rx={1} fill={coat} stroke={edge} strokeWidth={0.6} />
          ))}
          <ellipse cx={14.5} cy={12.5} rx={9} ry={5} fill={coat} stroke={edge} strokeWidth={state === 'tell' ? 1.6 : 0.9} />
          <ellipse cx={14.5} cy={15} rx={6} ry={1.8} fill={belly} opacity={0.45} />
          <path d="M21 8.5 L28 10.5 L31 13 L27.5 15 L21 15 Z" fill={coat} stroke={edge} strokeWidth={0.9} />
          <path d="M22 9 L23 3.5 L25.2 9 Z M25 9.5 L27.2 4.8 L28 10.4 Z" fill={coat} stroke={edge} strokeWidth={0.7} />
          <circle cx={26} cy={11.4} r={1.1} fill="var(--color-warn)" />
          {state === 'tell' && <path d="M27.5 14.4 L30.4 13.4" stroke="var(--color-eye-white)" strokeWidth={0.8} strokeLinecap="round" />}
        </g>
      </g>
    </svg>
  );
}
