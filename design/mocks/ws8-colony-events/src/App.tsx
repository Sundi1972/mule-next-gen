import { useEffect, useState, type ReactNode } from 'react';
import { Gallery } from './gallery';
import { GovernorPhone, GovernorPhonePage, OtherPhonePage, PhoneFestivalAlone } from './screens-phone';
import { TvFestival, TvMoodFall, TvProductionStrike, TvRiot, TvStrikePlanning } from './screens-tv';

/** Every screen and state, by hash: #/tv-strike and so on. Each is labelled with the phase whose show it plays in. */
const SCREENS: { id: string; group: string; phase: string; title: string; note: string; render: () => ReactNode }[] = [
  { id: 'tv-strike', group: '1 · General strike, announced', phase: 'Planning · TV', title: 'The announcement, waiting for the Governor', note: 'The headline card, strikers walk out of the store to every Food plot, each gets “STRIKE · 20%”; the header’s badge reads ColonyView.strike; the rail waits for Kai.', render: () => <TvStrikePlanning outcome="waiting" /> },
  { id: 'phone-gov-a', group: '2 · General strike, the phones', phase: 'Planning · phone', title: 'Governor’s phone, variant A: the Now card', note: 'Two buttons in the hub’s Now slot, the fund before and after, what an unpaid strike costs. Shut until the votes close (scrub past “votes close”); the buttons work.', render: () => <GovernorPhonePage variant="A" /> },
  { id: 'phone-gov-b', group: '2 · General strike, the phones', phase: 'Planning · phone', title: 'Governor’s phone, variant B: a sheet', note: 'The same as a sheet over the hub, each choice a big tile. “Later” folds it to a Now card that reopens it.', render: () => <GovernorPhonePage variant="B" /> },
  { id: 'phone-other', group: '2 · General strike, the phones', phase: 'Planning · phone', title: 'Everyone else’s phone', note: 'An alert line under Now; once Kai pays, it says so.', render: () => <OtherPhonePage /> },
  { id: 'tv-strike-paid', group: '3 · The Governor’s decision on the TV', phase: 'Planning · TV', title: 'Paid', note: 'No event and no story (C26): the badge turns “PAID · −240 cr” from strike.paid, the strikers are gone, the Wealth gauge’s fund note drops, the news line says who paid.', render: () => <TvStrikePlanning outcome="paid" /> },
  { id: 'tv-strike-unpaid', group: '3 · The Governor’s decision on the TV', phase: 'Planning · TV', title: 'Not paid', note: 'Planning ends unpaid: the strikers stay on their plots.', render: () => <TvStrikePlanning outcome="unpaid" /> },
  { id: 'tv-production-unpaid', group: '4 · Production, the events step', phase: 'Production · TV', title: 'Not paid: the strike lands', note: 'Production’s own generalStrike MonthEvent, like a walkout: every Food plot’s bars drop to 20% under “STRIKE −80%”, then the goods fly. Real ProductionMap and timeline.', render: () => <TvProductionStrike paid={false} /> },
  { id: 'tv-production-paid', group: '4 · Production, the events step', phase: 'Production · TV', title: 'Paid: no strike event', note: 'A quiet month: straight from the plots filling to the flight.', render: () => <TvProductionStrike paid /> },
  { id: 'tv-festival', group: '5 · Festival', phase: 'Planning · TV', title: 'Festival: Mood +10 lands on Happiness, 64 → 74', note: 'Bunting and a crowd at the store; the changes card; “Mood +10” flies to the Happiness gauge and its number counts, “Prestige +2” to Prestige; Food demand stays a store chip.', render: () => <TvFestival from={64} to={74} /> },
  { id: 'tv-festival-flip', group: '5 · Festival', phase: 'Planning · TV', title: 'Festival with a band change, 72 → 82', note: 'The same landing; the band flips Content → Thriving with a pulse as the count crosses 80.', render: () => <TvFestival from={72} to={82} /> },
  { id: 'phone-festival', group: '5 · Festival', phase: 'Planning · phone alone', title: 'Festival on a phone alone', note: 'The phone plays the show itself; the desk’s gauges aren’t on screen, so the rail’s result line names the mood.', render: () => <PhoneFestivalAlone /> },
  { id: 'tv-riot-park', group: '6 · Riot', phase: 'Month end (upkeep) · TV', title: 'Riot: the park is hit', note: 'A crowd at the store, a third of each shelf goes (the store fire’s shelves, calm); the park’s plot gets HIT, its build-site row turns Damaged, Prestige counts 5 → 3.', render: () => <TvRiot object="park" /> },
  { id: 'tv-riot-hospital', group: '6 · Riot', phase: 'Month end (upkeep) · TV', title: 'Riot: the hospital, which has no plot', note: 'No HIT on the map: the build-site row and the Prestige gauge (5 → 2) carry it.', render: () => <TvRiot object="hospital" /> },
  { id: 'tv-mood-fall', group: '7 · The month end’s mood fall', phase: 'Month end · TV', title: 'Happiness 44 → 31, Restless → Unhappy', note: 'Not an event (RULE-20’s drift): the gauge counts from lastGauges to gauges and its band flips with a pulse. No reasons: the wire has none.', render: () => <TvMoodFall /> },
  { id: 'gallery', group: '8 · The other rows', phase: 'Their own phases', title: 'Emigration, clean-up, store strike, walkout, loyal crew, blamed', note: 'Each one’s card, chip and result frame by an existing motion, named on the row. No new stories.', render: () => <Gallery /> },
];

const DECISIONS = [
  'Each event plays in the show of the phase that rolled it (C26): festival, strike, emigration and blame in planning, the store strike in development, walkout and loyal crew in production, riot and clean-up at the month end.',
  'The strike is a state, not a story: ColonyView.strike drives a badge in the TV header and the Governor’s card; only its announcement and an unpaid production strike are events.',
  'Paid is no event: the badge turns “PAID · −240 cr”, the strikers go, the fund note drops and one news line names who paid. No ledger animation.',
  'A colony change lands where the table already looks: a chip leaves the event’s card and lands on its gauge in the header, which then counts; a band change flips with a pulse.',
  'Strikers stand on the struck plots in planning, so the cost of not paying is on the map before anyone decides; in production they are the walkout pattern, bars to 20%.',
  'The riot reuses the store fire’s shelves without the fire; a damaged object shows on its plot (HIT) when it has one, and always on the build site and the Prestige gauge.',
  'The month end’s mood drift is the gauge alone: from last month’s value to this month’s, no reasons.',
  'The Governor decides only after the votes (payStrike’s rule): both choices are shown shut until then, with “After the votes”.',
];

function useHash() {
  const [hash, setHash] = useState(() => location.hash.replace(/^#\/?/, ''));
  useEffect(() => {
    const on = () => setHash(location.hash.replace(/^#\/?/, ''));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const screen = SCREENS.find((s) => s.id === hash);
  if (screen) {
    return (
      <div className="flex min-h-full flex-col items-start gap-3 bg-void p-6 text-ink" key={screen.id}>
        <a href="#/" className="text-sm text-holo underline" data-testid="back">
          ← All colony-event screens
        </a>
        <div className="flex flex-col">
          <span className="label-caps" data-testid="page-phase">
            {screen.group} · {screen.phase}
          </span>
          <h1 className="font-display text-2xl font-semibold">{screen.title}</h1>
          <p className="max-w-4xl text-sm text-ink-2">{screen.note}</p>
        </div>
        {screen.render()}
      </div>
    );
  }
  const groups = [...new Set(SCREENS.map((s) => s.group))];
  return (
    <div className="flex min-h-full flex-col gap-6 bg-void p-8 text-ink" data-testid="index">
      <header className="flex flex-col gap-1">
        <span className="label-caps">G-5 · C26–C28 · C37 · WS8 mocks</span>
        <h1 className="font-display text-4xl font-semibold">The colony’s mood in the event show</h1>
        <p className="font-semibold text-warn" data-testid="status">
          For review: not approved yet.
        </p>
        <p className="max-w-3xl text-base text-ink-2">The general strike, the festival and the riot as stories, the gauge landing, the month end’s mood fall, and the other six rows by existing motions, on WS1’s frozen C26 contract.</p>
      </header>
      <section className="flex max-w-4xl flex-col gap-2 rounded-panel border border-holo-line bg-panel p-5" data-testid="decisions">
        <h2 className="label-caps">Design decisions</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm">
          {DECISIONS.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-2" data-testid="variants">
        <h2 className="label-caps">The open question: the Governor’s card, A or B (after the votes; the buttons work)</h2>
        <div className="flex flex-wrap gap-6">
          {(['A', 'B'] as const).map((v) => (
            <div key={v} className="flex flex-col gap-1">
              <a href={`#/phone-gov-${v.toLowerCase()}`} className="font-semibold text-holo underline" data-testid={`variant-${v}`}>
                {v === 'A' ? 'A · in the Now card' : 'B · a sheet over the hub'}
              </a>
              <div className="overflow-hidden" style={{ width: 844 * 0.72, height: 390 * 0.72 }}>
                <div className="origin-top-left" style={{ transform: 'scale(0.72)' }}>
                  <GovernorPhone variant={v} votesOver />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      {groups.map((g) => (
        <section key={g} className="flex flex-col gap-2">
          <h2 className="label-caps">{g}</h2>
          <ul className="flex flex-col gap-1">
            {SCREENS.filter((s) => s.group === g).map((s) => (
              <li key={s.id}>
                <a href={`#/${s.id}`} className="font-semibold text-holo underline" data-testid={`link-${s.id}`}>
                  {s.title}
                </a>
                <span className="text-sm text-ink-3"> · {s.phase}</span>
                <span className="text-sm text-ink-2"> · {s.note}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
