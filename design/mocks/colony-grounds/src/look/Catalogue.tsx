import { Button, cx } from '@mule/ui';
import { useEffect, useState } from 'react';

/**
 * Every building in every stage, straight from the game's art manifest (apps/web/public/art/colony, linked into this
 * mock as /art), so the page shows exactly what ships and fills in as pictures are published.
 */
type Entry = { day: string; dusk: string; glow: string | null };
type Manifest = { pictures: Record<string, Record<string, Entry | object>> };
type View = 'day' | 'dusk' | 'lit';
type Source = 'ours' | 'kit';
/** The shipped art, or the kit-dressed preview publish (local only, gitignored: design/art/colony/out/kit-pub). */
const ROOT: Record<Source, string> = { ours: '/art/colony', kit: '/kit-look' };

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
function Cell({ entry, view, alt, root }: { entry: Entry; view: View; alt: string; root: string }) {
  const base = `${root}/${view === 'day' ? entry.day : entry.dusk}`;
  return (
    <div className="relative h-full w-full">
      <img src={base} alt={alt} className="absolute inset-0 h-full w-full object-contain object-bottom" />
      {view === 'lit' && entry.glow && (
        <img src={`${root}/${entry.glow}`} alt="" className="absolute inset-0 h-full w-full object-contain object-bottom mix-blend-screen" />
      )}
    </div>
  );
}

export function Catalogue() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [view, setView] = useState<View>('day');
  const [source, setSource] = useState<Source>('ours');
  useEffect(() => {
    setManifest(null);
    fetch(`${ROOT[source]}/manifest.json`)
      .then((r) => r.json())
      .then(setManifest)
      .catch(() => setManifest({ pictures: {} }));
  }, [source]);
  return (
    <div className="flex flex-col gap-3" data-testid="catalogue">
      <div className="flex items-center gap-2">
        <span className="label-caps">Pictures</span>
        {(['ours', 'kit'] as const).map((v) => (
          <Button key={v} size="md" variant={v === source ? 'holo' : 'outline'} onClick={() => setSource(v)} data-testid={`src-${v}`}>
            {v === 'ours' ? 'Ours (ships today)' : 'With kit props (only on this Mac)'}
          </Button>
        ))}
      </div>
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
                          <Cell entry={entry} view={view} alt={`${label}, ${stage}, ${view}`} root={ROOT[source]} />
                        ) : (
                          <span className="text-xs text-ink-3">{!manifest ? '…' : !pics ? (source === 'kit' ? 'no kit render yet' : 'not rendered yet') : '—'}</span>
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
