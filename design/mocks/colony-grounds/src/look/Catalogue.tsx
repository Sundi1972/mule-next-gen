import { Button, cx } from '@mule/ui';
import { useEffect, useState } from 'react';

/**
 * Every building in every stage, straight from the game's art manifest (apps/web/public/art/colony, linked into this
 * mock as /art), so the page shows exactly what ships and fills in as pictures are published.
 */
type Entry = { day: string; dusk: string; glow: string | null };
type Manifest = { pictures: Record<string, Record<string, Entry | object>> };
type View = 'day' | 'dusk' | 'lit';

const KINDS: [string, string][] = [
  ['hall', 'Town hall'],
  ['park', 'Park'],
  ['hospital', 'Hospital'],
  ['observatory', 'Observatory'],
  ['stadium', 'Stadium · 2×2'],
  ['spaceport', 'Spaceport · 2×2'],
];
const STAGES: [string, string][] = [
  ['site', 'Site'],
  ['build1', 'Building'],
  ['build2', 'Building, later'],
  ['standing', 'Standing'],
  ['closed', 'Closed'],
  ['damaged', 'Damaged'],
];

/** One stage's picture; "lit" lays the glow pass over dusk the way the live layer will, by adding light. */
function Cell({ entry, view, alt }: { entry: Entry; view: View; alt: string }) {
  const base = `/art/colony/${view === 'day' ? entry.day : entry.dusk}`;
  return (
    <div className="relative h-full w-full">
      <img src={base} alt={alt} className="absolute inset-0 h-full w-full object-contain object-bottom" />
      {view === 'lit' && entry.glow && (
        <img src={`/art/colony/${entry.glow}`} alt="" className="absolute inset-0 h-full w-full object-contain object-bottom mix-blend-screen" />
      )}
    </div>
  );
}

export function Catalogue() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [view, setView] = useState<View>('day');
  useEffect(() => {
    fetch('/art/colony/manifest.json')
      .then((r) => r.json())
      .then(setManifest)
      .catch(() => setManifest({ pictures: {} }));
  }, []);
  return (
    <div className="flex flex-col gap-3" data-testid="catalogue">
      <div className="flex items-center gap-2">
        <span className="label-caps">Light</span>
        {(['day', 'dusk', 'lit'] as const).map((v) => (
          <Button key={v} size="md" variant={v === view ? 'holo' : 'outline'} onClick={() => setView(v)} data-testid={`cat-${v}`}>
            {v === 'day' ? 'Day' : v === 'dusk' ? 'Dusk' : 'Dusk, lights on'}
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-panel border border-holo-line bg-[#070b12]">
        <table className="w-full table-fixed text-center text-sm">
          <thead className="label-caps text-ink-2">
            <tr>
              <th className="w-36 p-2 text-left">Building</th>
              {STAGES.map(([, label]) => (
                <th key={label} className="p-2">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {KINDS.map(([kind, label]) => {
              const pics = manifest?.pictures[kind];
              return (
                <tr key={kind} className="border-t border-holo-line" data-testid={`cat-row-${kind}`}>
                  <th className="p-2 text-left font-display text-base text-ink">{label}</th>
                  {STAGES.map(([stage]) => {
                    const entry = pics?.[stage] as Entry | undefined;
                    return (
                      <td key={stage} className={cx('h-72 p-1 align-bottom', kind === 'spaceport' && 'h-[26rem]')}>
                        {entry ? (
                          <Cell entry={entry} view={view} alt={`${label}, ${stage}, ${view}`} />
                        ) : (
                          <span className="text-xs text-ink-3">{!manifest ? '…' : !pics ? 'not rendered yet' : '—'}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** The kit-dressed local renders beside the shipped pictures. Never published: they exist only on this Mac. */
export function KitCompare() {
  const pairs: [string, string, string][] = [
    ['hospital', 'site', 'Hospital · site'],
    ['spaceport', 'build1', 'Spaceport · building'],
  ];
  const [gone, setGone] = useState<Record<string, boolean>>({});
  return (
    <div className="grid grid-cols-2 gap-4" data-testid="kit-compare">
      {pairs.map(([kind, stage, label]) => (
        <figure key={kind} className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-3">
          <figcaption className="font-display text-lg">{label}</figcaption>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <span className="label-caps">Our build only (ships today)</span>
              <img src={`/art/colony/${kind}/${stage}-day@800.webp`} alt={`${label}, our build`} className="aspect-square w-full object-contain" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="label-caps">With KitBash3D props (local only)</span>
              {gone[kind] ? (
                <div className="grid aspect-square place-items-center text-xs text-ink-3">only on Heiko’s Mac, not published</div>
              ) : (
                <img
                  src={`/kit-look/${kind}/${stage}-day.png`}
                  alt={`${label}, with kit props`}
                  className="aspect-square w-full object-contain"
                  onError={() => setGone((g) => ({ ...g, [kind]: true }))}
                />
              )}
            </div>
          </div>
        </figure>
      ))}
    </div>
  );
}
