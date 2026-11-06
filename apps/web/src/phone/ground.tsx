import type { TileView } from '@mule/protocol';
import { cx, GOOD_NAME, GoodTag, groundDots, type Good } from '@mule/ui';

const RAW = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'] as const satisfies readonly Good[];

/** The private result of a geo analysis: every raw good on 0–3 dots. */
export function GroundCard({ ground }: { ground: NonNullable<TileView['ground']> }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-control bg-raised px-2.5 py-2" data-testid="ground">
      <span className="label-caps col-span-2 flex justify-between">
        Underground <span className="text-holo">Only you</span>
      </span>
      {RAW.map((g) => {
        const n = groundDots(g, ground[g]);
        return (
          <span key={g} className={cx('flex items-center gap-1.5', n === 0 && 'opacity-50')} title={GOOD_NAME[g]}>
            <GoodTag good={g} className="flex-1 text-[11px]" />
            <span className="flex gap-0.5" aria-label={`${GOOD_NAME[g]} ${n} of 3`}>
              {[1, 2, 3].map((i) => (
                <span key={i} className="size-2 rounded-full" style={{ background: i <= n ? `var(--color-g-${g})` : 'var(--color-holo-line)' }} />
              ))}
            </span>
          </span>
        );
      })}
    </div>
  );
}
