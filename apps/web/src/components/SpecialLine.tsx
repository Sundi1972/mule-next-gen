import type { TileView } from '@mule/protocol';
import { SPECIAL_NAME, SpecialBadge } from '@mule/ui';
import { specialEffect } from '../game/derive';

/** A plot card's special line, first under the plot's name: the badge, the kind in bold, and what it does. Nothing for a plain plot. */
export function SpecialLine({ special }: { special: TileView['special'] }) {
  if (!special) return null;
  return (
    <p className="flex items-center gap-2 rounded-control bg-raised px-2.5 py-1.5 text-sm text-ink" data-testid="special-line" data-kind={special.kind}>
      <SpecialBadge special={special} density="phone" />
      <span>
        <strong className="font-semibold">{SPECIAL_NAME[special.kind]}:</strong> {specialEffect(special)}
      </span>
    </p>
  );
}
