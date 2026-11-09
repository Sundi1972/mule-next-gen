import { cx } from '@mule/ui';
import { useState, type ReactNode } from 'react';
import { ClientProvider } from '../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../apps/web/src/phone/game';
import { Hub } from '../../../../apps/web/src/phone/hub/Hub';
import { TodayState } from '../../../../apps/web/src/phone/hub/state';
import { clientFor, viewFor, type Seat } from './fixture';
import { HUB_SLOTS } from '../../../../apps/web/src/phone/hub/today';
import { FRAME_SLOTS } from './slots';

/** ?today shows the hub as built, for comparison. */
const SLOTS = new URLSearchParams(location.search).has('today') ? HUB_SLOTS : FRAME_SLOTS;

/** Where every politics piece lives (P0). One line each; the slice mocks fill the dashed slots. */
const PLACES: [string, string, string][] = [
  ['P1–P3', 'Deal cards', 'Talk desk: Chat (whispers, “Attach a card”, an offered card in its thread) and My cards. No new tab.'],
  ['P4', 'Reputation', 'A small chip after a name wherever names are listed with room: standings, ready list, ballots, whispers, a card’s proposer, the TV’s ready list and league. Not in one-line tickers or the walking names strip.'],
  ['P5', 'Broken card, public', 'TV month end’s colony panel and the news: “a signed card was broken”, and whose reputation fell. Who made which card stays secret.'],
  ['P6', 'Sabotage', 'Where its target is, Only you: a power-line cut from Look on a rival’s plot, a market rumour from the Market desk; one secret order a month, its cost and odds in the rail. No tool button (a fifth squeezes the map at 667 from 157 px to 65), no Shadows tab, not in Talk (that is other people’s words).'],
  ['P7–P8', 'Sheriff', 'An office desk, the holder’s alone and first, as the Governor’s is. Opening it turns the map to Guard, a desk-only tool with no button in the column; the marks show on the Sheriff’s map only. Governor and Sheriff are never one seat, so a seat sees one office desk at most.'],
  ['P9', 'Sheriff election', 'Election day’s rows, as built.'],
  ['P10', 'Caught!', 'Production’s event show (WS8’s visuals), the dark plot on the map, a month-end line.'],
  ['P11', 'Sabotage ban', 'The fifth law in the Governor’s list and the council ballot.'],
  ['P12', 'Budget', 'Governor desk: Projects, Security, Welfare, reserve; commissioning moves under Projects.'],
  ['P13', 'Overrule', 'Council desk: “Call an overrule vote” (tax or budget), monthly; the vote is today’s law ballot.'],
  ['P14–P15', 'Budget on the TV', 'TV planning’s side column under the offices line; the overrule reveal is TvCouncil’s; the month end says what each line spent, and Welfare’s player.'],
];

const SEATS: [Seat, string][] = [['lena', 'Lena · no office'], ['governor', 'Ossa · Governor'], ['sheriff', 'Brix · Sheriff']];

function Phone({ seat, w, h }: { seat: Seat; w: number; h: number }) {
  const { view, me, self, table, slot } = viewFor(seat);
  return (
    <figure className="flex flex-col gap-1" data-testid={`phone-${w}`}>
      <figcaption className="label-caps text-[10px]! text-ink-2">{w} × {h}</figcaption>
      {/* The device's screen, not a design value: the two phones every screen is drawn for. */}
      <div className="overflow-hidden rounded-panel border border-holo-line bg-void" style={{ width: w, height: h }}>
        <ClientProvider client={clientFor(seat)}>
          <PhoneGameProvider value={{ table, view, me, self, slot }}>
            <TodayState>
              <Hub slots={SLOTS} />
            </TodayState>
          </PhoneGameProvider>
        </ClientProvider>
      </div>
    </figure>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export default function App() {
  const [seat, setSeat] = useState<Seat>('lena');
  return (
    <main className="flex min-h-dvh flex-col gap-8 bg-table p-6 text-ink" data-testid="index">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold">Politics RC · P0, where everything lives</h1>
        <p className="max-w-3xl text-sm text-ink-2">
          The real planning hub (today’s desks and tools) with a dashed slot for every new piece. No new desk tab: a seat sees at
          most five, as today, and the map’s tools column keeps its four buttons. Switch whose phone it is to see the office desks;
          ?today shows the hub as built. The slice mocks (P1–P3, P12–P13 WS6; P6–P8, P11 WS8) fill the slots and keep this frame.
        </p>
      </header>
      <Section title="Whose phone">
        <div role="radiogroup" aria-label="Whose phone" className="flex flex-wrap gap-2">
          {SEATS.map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={seat === id} onClick={() => setSeat(id)} data-testid={`seat-${id}`}
              className={cx('h-11 rounded-control border px-4 text-sm font-semibold', seat === id ? 'border-holo bg-holo-soft' : 'border-holo-line text-ink-2')}>
              {label}
            </button>
          ))}
        </div>
      </Section>
      <Section title="The phone, held sideways">
        <div className="flex flex-wrap items-start gap-6">
          <Phone key={`${seat}-844`} seat={seat} w={844} h={390} />
          <Phone key={`${seat}-667`} seat={seat} w={667} h={375} />
        </div>
      </Section>
      <Section title="The laptop">
        <Phone key={`${seat}-1280`} seat={seat} w={1280} h={760} />
      </Section>
      <Section title="Where each piece lives">
        <table className="max-w-5xl text-left text-sm" data-testid="places">
          <tbody>
            {PLACES.map(([id, what, where]) => (
              <tr key={id} className="border-t border-holo-line align-top" data-testid={`place-${id}`}>
                <td className="py-2 pr-3 font-mono text-holo">{id}</td>
                <td className="py-2 pr-3 font-semibold">{what}</td>
                <td className="py-2 text-ink-2">{where}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </main>
  );
}
