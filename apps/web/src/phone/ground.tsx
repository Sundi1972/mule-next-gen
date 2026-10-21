import type { TileView } from '@mule/protocol';
import { cx, GOOD_NAME, GoodIcon, type Good } from '@mule/ui';
import { groundPips } from '../game/derive';

const RAW: Good[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth'];

/** The private result of a geo analysis: every raw good, rated. */
export function GroundCard({ ground }: { ground: NonNullable<TileView['ground']> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-control bg-raised p-3" data-testid="ground">
      <span className="label-caps col-span-2 flex justify-between">
        Underground <span className="text-holo">Only you</span>
      </span>
      {RAW.map((g) => {
        const raw = ground[g as keyof typeof ground] ?? 0;
        const n = groundPips(g, raw);
        return (
          <span key={g} className={cx('flex items-center gap-2', n === 0 && 'opacity-50')}>
            <GoodIcon good={g} size={16} />
            <span className="flex-1 text-sm">{GOOD_NAME[g]}</span>
            <span className="flex gap-0.5" aria-label={`${n} of 4`}>
              {[1, 2, 3, 4].map((i) => (
                <span key={i} className="size-2 rounded-full" style={{ background: i <= n ? `var(--color-g-${g})` : 'var(--color-holo-line)' }} />
              ))}
            </span>
          </span>
        );
      })}
    </div>
  );
}

const TRAIT_TEXT: Record<NonNullable<TileView['traits']>[number], string> = {
  bedrock: 'Bedrock: hard to dig',
  sheltered: 'Sheltered from storms',
  hotSpring: 'Hot spring below',
  thinVein: 'Thin vein: mines run out',
  toxic: 'Toxic ground',
  unstable: 'Unstable ground',
  infested: 'Infested with pests',
  floodPlain: 'Flood plain',
};

export function Traits({ traits }: { traits: TileView['traits'] }) {
  if (!traits || traits.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {traits.map((t) => (
        <li key={t} className="rounded-chip bg-raised px-2 py-0.5 font-mono text-[11px] text-ink-2">
          {TRAIT_TEXT[t] ?? t}
        </li>
      ))}
    </ul>
  );
}
