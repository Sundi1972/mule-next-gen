import { ColonyGrounds, type GroundsColony, type GroundsManifest } from '@mule/ui';
import { useEffect, useState } from 'react';

/**
 * The colony grounds as a full-width TV moment (PM ruling: no TV side panel). The real ColonyGrounds and the game's
 * own art manifest on the 1280 × 720 TV canvas. ?beat=monthend (dusk, what changed) or ?beat=newmonth (day).
 * The colony is a month-12 game placed on WS7's 5 × 5 grounds (RULE-32b: x right, y down, the hall at (2,2)).
 */
const COLONY: GroundsColony = {
  gauges: { happiness: 72 },
  projects: [
    { id: 'park', name: 'Park', stage: 'standing', monthsLeft: null, buildMonths: 1, place: { x: 1, y: 2, w: 1, h: 1 } },
    { id: 'hospital', name: 'Hospital', stage: 'standing', monthsLeft: null, buildMonths: 2, place: { x: 2, y: 3, w: 1, h: 1 } },
    { id: 'stadium', name: 'Stadium', stage: 'standing', monthsLeft: null, buildMonths: 3, place: { x: 3, y: 2, w: 2, h: 2 } },
    { id: 'spaceport', name: 'Spaceport', stage: 'building', monthsLeft: 1, buildMonths: 3, place: { x: 2, y: 0, w: 2, h: 2 } },
    { id: 'observatory', name: 'Observatory', stage: 'commissioned', monthsLeft: null, buildMonths: 2, place: { x: 1, y: 1, w: 1, h: 1 } },
  ],
};

export function TvBeat() {
  const beat = new URLSearchParams(location.search).get('beat') === 'newmonth' ? 'newmonth' : 'monthend';
  const [manifest, setManifest] = useState<GroundsManifest | null>(null);
  useEffect(() => {
    fetch('/art/colony/manifest.json')
      .then((r) => r.json())
      .then(setManifest)
      .catch(() => setManifest(null));
  }, []);
  const dusk = beat === 'monthend';
  return (
    <main className="grid min-h-screen place-items-center bg-void p-6">
      <div className="relative h-[720px] w-[1280px] overflow-hidden bg-table text-ink" data-testid="tv-grounds-beat">
        <ColonyGrounds colony={COLONY} size="tv" manifest={manifest} light={dusk ? 'dusk' : 'day'} className="absolute inset-0 h-full w-full" />
        <header className="pointer-events-none absolute inset-x-0 top-0 flex items-baseline justify-between bg-gradient-to-b from-black/70 to-transparent px-10 pt-6 pb-12">
          <h1 className="font-display text-4xl font-bold">{dusk ? 'End of month 12' : 'Month 13 begins'}</h1>
          <span className="label-caps text-ink-2">The colony grounds</span>
        </header>
        <footer className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-10 pt-12 pb-6 text-xl">
          {dusk ? (
            <p><strong>New this month:</strong> the Stadium stands. The Spaceport is one month from done.</p>
          ) : (
            <p><strong>Next to build:</strong> the Observatory's site is staked out. Fund it on your phone.</p>
          )}
        </footer>
      </div>
    </main>
  );
}
