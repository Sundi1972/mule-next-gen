import { PRESTIGE } from '@mule/engine';
import { cx } from '@mule/ui';
import { NAME, owed, type GroundsObject } from './fixture';

/** A slot's state in words, the build site's own phrasing (apps/web Colony.tsx), short enough for one slot. */
export function slotWords(o: GroundsObject): { line: string; tone: string } {
  const p = PRESTIGE[o.id];
  switch (o.stage) {
    case 'commissioned':
      return { line: `Waiting for ${owed(o)}`, tone: 'text-ink-2' };
    case 'building': {
      const left = p.buildMonths - (o.built ?? 0);
      return { line: left === 1 ? 'Stands this month end' : `Stands in ${left} months`, tone: 'text-warn' };
    }
    case 'standing':
      return { line: `Standing · ${p.upkeep} cr a month`, tone: 'text-ink-2' };
    case 'closed':
      return { line: 'Closed: upkeep missed', tone: 'text-alert' };
    case 'damaged':
      return { line: `Damaged: repair ${p.repairCost} cr`, tone: 'text-alert' };
  }
}

/** The phone's list under the grounds: every object's slot and words, since the phone's slots are too small for them. */
export function GroundsList({ objects }: { objects: GroundsObject[] }) {
  if (objects.length === 0)
    return (
      <p className="text-xs leading-snug text-ink-2" data-testid="grounds-empty">
        Nothing built yet. The Governor commissions the colony's buildings; each goes up at the next place round the town hall.
      </p>
    );
  return (
    <ul className="flex flex-col gap-1" data-testid="grounds-list">
      {[...objects]
        .sort((a, b) => a.slot - b.slot)
        .map((o) => {
          const w = slotWords(o);
          return (
            <li key={o.id} className="flex items-baseline gap-1.5 text-xs leading-snug" data-testid={`list-${o.id}`}>
              <span data-num className="w-4 shrink-0 font-mono text-ink-3">{o.slot + 1}</span>
              <span className="font-semibold text-ink">{NAME[o.id]}</span>
              <span className={cx('min-w-0 truncate', w.tone)}>{w.line}</span>
            </li>
          );
        })}
    </ul>
  );
}
