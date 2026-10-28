import type { MuleView } from '@mule/protocol';
import { Creature, SLOT_COLOR } from '@mule/ui';
import type { ReactNode } from 'react';
import { slotOf } from '../../../game/derive';

export function Section({ title, children, testid }: { title: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <section className="flex flex-col gap-1.5 @min-[1100px]/shell:gap-2" data-testid={testid}>
      <h3 className="label-caps flex items-center gap-1.5 @min-[1100px]/shell:text-xs!">{title}</h3>
      {children}
    </section>
  );
}

/** A player by name, with their creature in their seat's colour. */
export function Who({ view, id, size = 16 }: { view: Pick<MuleView, 'players'>; id: string; size?: number }) {
  const p = view.players.find((q) => q.id === id);
  if (!p) return null;
  return (
    <span className="inline-flex items-center gap-1 font-semibold">
      <Creature species={p.species} color={SLOT_COLOR[slotOf(view, id) ?? 0]} size={size} />
      {p.name}
    </span>
  );
}
