import { PRESTIGE } from '@mule/engine';
import { cx, objectLabel, PlotObjectMark } from '@mule/ui';
import { mapObject, NAME, owed, SLOTS, type GroundsObject } from './fixture';

export type Density = 'tv' | 'phone' | 'inset';

/** The 3×3 square in reading order: slots 1–4, the town hall, slots 5–8. */
const CELLS: (number | 'hall')[] = [1, 2, 3, 4, 'hall', 5, 6, 7, 8];

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

/**
 * The colony grounds: the town hall in the middle and its eight slots, each drawn with the map's own object mark
 * (PlotObjectMark, WS5's approved stage colours and corner chips), so an object reads the same here as it did on a plot.
 * `placing` turns each free slot into a button: the Governor's "place it here".
 */
export function Grounds({
  objects,
  density,
  fund,
  placing,
  onPlace,
  fresh,
  className,
}: {
  objects: GroundsObject[];
  density: Density;
  fund: number;
  placing?: string | null;
  onPlace?(slot: number): void;
  /** A slot that changed this month, ringed (the month end's "new this month"). */
  fresh?: number | null;
  className?: string;
}) {
  const tv = density === 'tv';
  const inset = density === 'inset';
  const bySlot = new Map(objects.map((o) => [o.slot, o]));
  const free = SLOTS - objects.length;
  return (
    <div className={cx('flex min-h-0 flex-col', tv ? 'gap-3' : 'gap-1.5', density === 'phone' && 'h-full', className)} data-testid={`grounds-${density}`}>
      {!inset && (
        <div className="flex items-baseline justify-between gap-2">
          <span className={cx('label-caps', tv ? 'text-sm!' : 'text-[10px]!')}>Colony grounds</span>
          <span data-num className={cx('font-mono text-ink-2', tv ? 'text-lg' : 'text-[11px]')} data-testid="grounds-free">
            {free} of {SLOTS} slots free
          </span>
        </div>
      )}
      <ol
        className={cx(
          'grid grid-cols-3 rounded-panel border border-holo-line bg-map-base',
          tv ? 'gap-x-2 gap-y-3 p-2' : inset ? 'aspect-square grid-rows-3 gap-0.5 p-0.5' : 'aspect-square min-h-0 flex-1 grid-rows-3 gap-1 self-start p-1',
        )}
        aria-label={`Colony grounds: the town hall and ${SLOTS} slots, ${free} free`}
        data-testid="grounds-board"
      >
        {CELLS.map((c) =>
          c === 'hall' ? (
            <li key="hall" className={cx('flex flex-col items-center justify-center self-start rounded-control border-2 border-holo bg-raised text-center', tv ? 'aspect-square' : 'h-full', inset ? 'border' : '')} data-testid="town-hall">
              {/* DS-GAP: @mule/ui has no town-hall glyph; the hall is named in words until one is drawn. */}
              {!inset && <span className={cx('font-display font-semibold leading-tight text-holo', tv ? 'text-xl' : 'text-[11px]')}>Town hall</span>}
              {!inset && (
                <span data-num className={cx('font-mono text-ink-2', tv ? 'text-base' : 'text-[10px]')} data-testid="town-hall-fund">
                  fund {fund} cr
                </span>
              )}
            </li>
          ) : (
            <SlotCell key={c} slot={c} object={bySlot.get(c)} density={density} placing={placing ?? null} {...(onPlace ? { onPlace } : {})} fresh={fresh === c} />
          ),
        )}
      </ol>
    </div>
  );
}

function SlotCell({ slot, object, density, placing, onPlace, fresh }: { slot: number; object: GroundsObject | undefined; density: Density; placing: string | null; onPlace?(slot: number): void; fresh: boolean }) {
  const tv = density === 'tv';
  const inset = density === 'inset';
  if (!object) {
    if (placing && onPlace)
      return (
        <li className="flex">
          <button
            type="button"
            onClick={() => onPlace(slot)}
            className="flex flex-1 flex-col items-center justify-center rounded-control border-2 border-dashed border-holo bg-holo-soft text-center font-display text-[11px] font-semibold leading-tight text-holo shadow-glow"
            aria-label={`Place the ${placing} on slot ${slot}`}
            data-testid={`place-${slot}`}
          >
            <span aria-hidden className="text-base leading-none">+</span>
            Place here
          </button>
        </li>
      );
    return (
      <li className={cx('relative flex items-end justify-start self-start rounded-control border border-dashed border-holo-faint', tv ? 'aspect-square p-1' : inset ? 'h-full' : 'h-full p-1')} aria-label={`Slot ${slot}, free`} data-testid={`slot-${slot}`} data-stage="free">
        {!inset && <span data-num className={cx('font-mono text-ink-3', tv ? 'text-sm' : 'text-[10px]')}>{slot}</span>}
      </li>
    );
  }
  const m = mapObject(object);
  const words = slotWords(object);
  return (
    <li className={cx('flex min-w-0 flex-col gap-1', !tv && 'h-full')} aria-label={`Slot ${slot}: ${objectLabel(m)}`} data-testid={`slot-${slot}`} data-stage={object.stage}>
      <span className={cx('relative rounded-control', tv ? 'aspect-square w-full' : 'h-full', fresh && 'ring-2 ring-holo shadow-glow')}>
        <PlotObjectMark object={m} density={tv ? 'tv' : 'phone'} at={`slot-${slot}`} />
        {density === 'phone' && (
          <span data-num className="absolute bottom-0.5 left-1 font-mono text-[10px] text-ink-3">
            {slot}
          </span>
        )}
      </span>
      {tv && (
        <span className="flex flex-col leading-tight">
          <span className="truncate font-display text-base font-semibold text-ink" data-testid={`slot-${slot}-name`}>
            {NAME[object.id]}
          </span>
          <span className={cx('text-sm leading-snug', words.tone)} data-testid={`slot-${slot}-words`}>
            {words.line}
          </span>
        </span>
      )}
    </li>
  );
}

/** The phone's list under the grounds: every object's slot and words, since the phone's slots are too small for them. */
export function GroundsList({ objects }: { objects: GroundsObject[] }) {
  if (objects.length === 0)
    return (
      <p className="text-xs leading-snug text-ink-2" data-testid="grounds-empty">
        Nothing built yet. The Governor commissions the colony's buildings and picks a slot for each.
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
              <span data-num className="w-3 shrink-0 font-mono text-ink-3">{o.slot}</span>
              <span className="font-semibold text-ink">{NAME[o.id]}</span>
              <span className={cx('min-w-0 truncate', w.tone)}>{w.line}</span>
            </li>
          );
        })}
    </ul>
  );
}
