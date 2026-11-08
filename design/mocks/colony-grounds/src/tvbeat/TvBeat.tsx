import { ColonyGrounds, GroundsOpener, type ColonyGroundsProps, type GroundsColony, type GroundsManifest, type Light, type OpenerState } from '@mule/ui';
import { useEffect, useState } from 'react';
// The game's own manifest loader and Grounds (validation, the plate dropped when unsound), read, not copied.
import { Grounds, loadGroundsManifest } from '../../../../../apps/web/src/components/Grounds';
import { Scaled } from '../../../../../apps/web/src/components/Scaled';

/**
 * The colony grounds as the game shows them, for review shots against look.html.
 *
 *   ?view=beat (default)  the real ColonyGrounds on the 1280 × 720 TV canvas; ?beat=monthend (dusk) or ?beat=newmonth (day)
 *   ?view=opener          the real GroundsOpener (spec C5), its still: no lean-in, the caption naming the change; scaled to
 *                         the window as the TV scales its 1280 × 720 canvas, so a 1920 × 1080 shot is the TV's own
 *   ?view=phone           ColonyGrounds size="phone" 390 px wide, as the phone's Colony desk mounts it
 *   ?light=day|dusk       for each view
 *   ?colony=<json>        the projects (any layout); ?width=<px> the phone desk's width
 *
 * The colony is a month-12 game placed on WS7's 5 × 5 grounds (RULE-32b: x right, y down, the hall at (2,2)).
 */
const STADIUM = { x: 3, y: 2, w: 2, h: 2 };
export const COLONY: GroundsColony = {
  gauges: { happiness: 72, wealth: 2_000 },
  projects: [
    { id: 'park', name: 'Park', stage: 'standing', monthsLeft: null, buildMonths: 1, place: { x: 1, y: 2, w: 1, h: 1 } },
    { id: 'hospital', name: 'Hospital', stage: 'standing', monthsLeft: null, buildMonths: 2, place: { x: 2, y: 3, w: 1, h: 1 } },
    { id: 'stadium', name: 'Stadium', stage: 'standing', monthsLeft: null, buildMonths: 3, place: STADIUM },
    { id: 'spaceport', name: 'Spaceport', stage: 'building', monthsLeft: 1, buildMonths: 3, place: { x: 2, y: 0, w: 2, h: 2 } },
    { id: 'observatory', name: 'Observatory', stage: 'commissioned', monthsLeft: null, buildMonths: 2, place: { x: 1, y: 1, w: 1, h: 1 } },
  ],
};

/** Month 12's end as useGroundsOpener hands it over: the 3 s still (as with reduced motion), the Stadium just standing. */
const STILL: OpenerState = {
  kind: 'still',
  ms: 3_000,
  baseline: true,
  playing: false,
  changes: [{ id: 'stadium', name: 'Stadium', from: 'building', to: 'standing', place: STADIUM }],
};

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'beat';
const lightParam = params.get('light');
// ?colony=<JSON of GroundsColony['projects']>: any layout, for the visibility measure (review-loop/visibility.mjs);
// ?width=<px>: the phone desk's width (the hub's tab is 353)
const colonyParam = params.get('colony');
if (colonyParam) COLONY.projects = JSON.parse(colonyParam) as GroundsColony['projects'];
const phoneWidth = Number(params.get('width') ?? 390);

/** The opener always asks for dusk (RULE-1); the day shot swaps only the light, everything else as the game draws it. */
const DayScene = (props: Omit<ColonyGroundsProps, 'manifest'>) => <Grounds {...props} light="day" />;

function Opener({ light }: { light: Light }) {
  return (
    <main className="h-screen w-screen bg-void" data-light={light}>
      <Scaled width={1280} height={720}>
        <GroundsOpener opener={STILL} colony={COLONY} month={12} Scene={light === 'day' ? DayScene : Grounds} />
      </Scaled>
    </main>
  );
}

function Phone({ light }: { light: Light }) {
  return (
    <main className="min-h-screen bg-void" data-light={light}>
      <div style={{ width: phoneWidth }} data-testid="phone-desk">
        <Grounds colony={COLONY} size="phone" light={light} />
      </div>
    </main>
  );
}

function Beat({ light }: { light: Light }) {
  const [manifest, setManifest] = useState<GroundsManifest | null>(null);
  useEffect(() => {
    void loadGroundsManifest().then(setManifest);
  }, []);
  const dusk = light === 'dusk';
  return (
    <main className="grid min-h-screen place-items-center bg-void p-6">
      <div className="relative h-[720px] w-[1280px] overflow-hidden bg-table text-ink" data-testid="tv-grounds-beat">
        <ColonyGrounds colony={COLONY} size="tv" manifest={manifest} light={light} className="absolute inset-0 h-full w-full" />
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

export function TvBeat() {
  if (view === 'opener') return <Opener light={lightParam === 'day' ? 'day' : 'dusk'} />;
  if (view === 'phone') return <Phone light={lightParam === 'dusk' ? 'dusk' : 'day'} />;
  const light: Light = lightParam === 'day' || lightParam === 'dusk' ? lightParam : params.get('beat') === 'newmonth' ? 'day' : 'dusk';
  return <Beat light={light} />;
}
