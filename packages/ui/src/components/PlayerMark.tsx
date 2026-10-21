import { Creature } from './Creature';
import { SPECIES_NAME, useSeatSpecies, type Species } from './species';
import { cx, SLOT_COLOR, type Slot } from './tokens';

/** A player: their species as a little creature, in their colour. Colour is the main difference between players. */
export function PlayerMark({ slot, species, size = 16, glow = true, label, className }: { slot: Slot; species?: Species; size?: number; glow?: boolean; label?: string; className?: string }) {
  const seated = useSeatSpecies(slot);
  const kind = species ?? seated;
  const color = SLOT_COLOR[slot];
  return (
    <span
      role="img"
      aria-label={label ?? SPECIES_NAME[kind]}
      className={cx('inline-block shrink-0', className)}
      style={{ width: size, height: size, filter: glow ? `drop-shadow(0 0 1px var(--color-mark-edge)) drop-shadow(0 0 ${Math.round(size / 3)}px color-mix(in srgb, ${color} var(--mark-glow), transparent))` : 'drop-shadow(0 0 1px var(--color-mark-edge))' }}
    >
      <Creature species={kind} color={color} size={size} className="block" />
    </span>
  );
}
