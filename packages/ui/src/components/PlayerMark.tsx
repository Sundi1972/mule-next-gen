import { cx, SLOT_CLIP, SLOT_COLOR, SLOT_SHAPE_NAME, type Slot } from './tokens';

/** A player's colour and shape. Shape always comes with colour, so colour-blind players can tell everyone apart. */
export function PlayerMark({ slot, size = 16, glow = true, label, className }: { slot: Slot; size?: number; glow?: boolean; label?: string; className?: string }) {
  const color = SLOT_COLOR[slot];
  return (
    <span
      role="img"
      aria-label={label ?? SLOT_SHAPE_NAME[slot]}
      className={cx('inline-block shrink-0', className)}
      style={{ width: size, height: size, filter: glow ? `drop-shadow(0 0 1px var(--color-mark-edge)) drop-shadow(0 0 ${Math.round(size / 2)}px color-mix(in srgb, ${color} var(--mark-glow), transparent))` : 'drop-shadow(0 0 1px var(--color-mark-edge))' }}
    >
      <span className="block h-full w-full" style={{ background: color, clipPath: SLOT_CLIP[slot] }} />
    </span>
  );
}
