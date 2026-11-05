import { cx } from '@mule/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PhoneShow, TvShow, useClock, humans, everyoneAsked, type Asked } from './Show';
import { actAt, PACE, timeline, type Order } from './timeline';

/** Routes are hash tokens (#a, #b), so a link opens one variant directly. */
function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const on = () => setHash(window.location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

const DECISIONS = [
  'Three acts, one after the other (Heiko, 5 Nov): 1 Harvest, every plot makes its base output one after the next; 2 Bonuses and losses, each landing on its own plot; 3 Into the silos, the goods fly from each plot to its owner’s silo.',
  'The month’s events keep WS8’s show, unchanged, between the bonuses and the flight: they are the month’s biggest bonus or loss, and they play after the plots’ own.',
  'Each plot rings in its owner’s colour while it works, its bars rise one unit at a time and its count sits bottom right, big enough to read from the couch.',
  'A cluster bonus draws a green line to the neighbours it comes from, then the extra unit arrives glowing. A loss rings the plot red and its units fall away in grey.',
  'The steps start slow and speed up, so the first plots read one by one and a big colony still finishes in time: about 18 s in a quiet month, against 15 s today. Every length is one named config value.',
  'The silos run along the TV’s foot, one per player, and fill as goods land. They show this month’s harvest only, never what anyone already holds. On the phone, your silo is your stock strip, counting in.',
  'Speed up: everyone taps ⏩ on their phone; the computer players always agree. Once every person has tapped, the rest plays 3× faster (about 6 s). It is never a skip: the table still sees what happened. A phone alone keeps today’s tap-the-map skip.',
  'The question for Heiko: A, the harvest scans the map in reading order, or B, it goes player by player with each player’s silo lit while theirs make.',
];

function Page({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-full bg-table p-6 text-ink">
      <a href="#" className="label-caps text-holo">← All screens</a>
      <h1 className="mt-2 font-display text-3xl font-semibold">{title}</h1>
      <div className="mt-4 flex flex-col gap-6">{children}</div>
    </main>
  );
}

function Index() {
  return (
    <Page title="Production show: three acts">
      <ol className="flex max-w-4xl list-decimal flex-col gap-2 pl-5 text-base leading-snug text-ink-2" data-testid="decisions">
        {DECISIONS.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ol>
      <ul className="flex flex-wrap gap-3" data-testid="screens">
        <li><a className="rounded-control border border-holo px-3 py-2 text-holo" href="#a">A · reading order: TV and phone</a></li>
        <li><a className="rounded-control border border-holo px-3 py-2 text-holo" href="#b">B · player by player: TV and phone</a></li>
        <li><a className="rounded-control border border-holo-line px-3 py-2" href="#a-event">A with an event</a></li>
        <li><a className="rounded-control border border-holo-line px-3 py-2" href="#b-event">B with an event</a></li>
      </ul>
    </Page>
  );
}

/** One variant: the TV and Lena's phone on one clock, with the controls a reviewer needs. */
function Variant({ order, withEvent }: { order: Order; withEvent: boolean }) {
  const tl = useMemo(() => timeline(order, withEvent), [order, withEvent]);
  const clock = useClock(tl.acts.end);
  const [asked, setAsked] = useState<Asked>({});
  const ask = (id: string) => {
    const next = { ...asked, [id]: true };
    setAsked(next);
    if (everyoneAsked(next)) clock.speedUp();
  };
  const restart = () => {
    setAsked({});
    clock.restart();
  };
  const act = actAt(tl, clock.t);
  return (
    <Page title={`${order === 'scan' ? 'A · reading order' : 'B · player by player'}${withEvent ? ', with an event' : ''}`}>
      <div className="flex flex-wrap items-center gap-3 font-mono text-xs" data-testid="controls">
        <button type="button" className="rounded-control border border-holo px-2 py-1 text-holo" onClick={clock.playing ? clock.pause : clock.play}>
          {clock.playing ? 'pause' : 'play'}
        </button>
        <button type="button" className="rounded-control border border-holo-line px-2 py-1" onClick={restart}>
          play again
        </button>
        <input type="range" min={0} max={tl.acts.end} step={0.05} value={clock.t} onChange={(e) => clock.seek(Number(e.target.value))} className="w-64" aria-label="Scrub the show" />
        <span data-num className="w-28 text-ink-3">
          {clock.t.toFixed(1)} / {tl.acts.end.toFixed(1)} s · {act}
        </span>
        <span className="text-ink-3">at the table:</span>
        {humans.map((p) => (
          <button key={p.id} type="button" disabled={asked[p.id]} onClick={() => ask(p.id)} className={cx('rounded-chip border px-2 py-0.5', asked[p.id] ? 'border-holo bg-holo-soft text-ink' : 'border-holo-faint text-ink-2')}>
            {p.name} taps ⏩
          </button>
        ))}
        {clock.fast && <span className="text-holo">playing {PACE.fast}× faster</span>}
      </div>
      <section className="flex flex-col gap-2">
        <span className="label-caps">The TV (1280 × 720, shown at 75%)</span>
        <div className="max-w-full overflow-x-auto">
          <div className="overflow-hidden rounded-panel border border-holo-line" style={{ width: 960, height: 540 }} data-testid="tv-frame">
            <div className="origin-top-left scale-[0.75]" style={{ width: 1280, height: 720 }}>
              <TvShow order={order} withEvent={withEvent} t={clock.t} asked={asked} fast={clock.fast} />
            </div>
          </div>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <span className="label-caps">Lena’s phone, sideways (844 × 390), with the TV in the room</span>
        <div className="max-w-full overflow-x-auto">
          <div className="h-[390px] w-[844px] overflow-hidden rounded-sheet border border-holo-line shadow-map" data-testid="phone-frame">
            <PhoneShow order={order} withEvent={withEvent} t={clock.t} asked={asked} onAsk={() => ask('lena')} />
          </div>
        </div>
      </section>
    </Page>
  );
}

export default function App() {
  const hash = useHash();
  if (hash === 'a') return <Variant key="a" order="scan" withEvent={false} />;
  if (hash === 'b') return <Variant key="b" order="player" withEvent={false} />;
  if (hash === 'a-event') return <Variant key="ae" order="scan" withEvent />;
  if (hash === 'b-event') return <Variant key="be" order="player" withEvent />;
  return <Index />;
}
