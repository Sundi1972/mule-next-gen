import { cx } from '@mule/ui';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PhoneA, TvA } from './directions/A';
import { PhoneB, TvB } from './directions/B';
import { PhoneC, TvC } from './directions/C';
import { BEAT, GAPS, SCENARIOS, script, type Scenario } from './events';
import { EventGlyph, SignBadge } from './glyphs';
import { Controls, PhoneFrame, ShowProvider, TvFrame, useShowClock } from './stage';

type Dir = 'A' | 'B' | 'C';

const DIRECTIONS: { id: Dir; name: string; pitch: string; tv: () => JSX.Element; phone: () => JSX.Element; pros: string[]; cons: string[] }[] = [
  {
    id: 'B',
    name: 'Living weather',
    pitch: 'The event is the hero. The map dims, a big title card names it in the middle of the TV, then flies to where the event comes from and becomes it: a wall of dust, a crawling swarm, a meteor that shakes the screen. Every hit plot throws up its loss.',
    tv: TvB,
    phone: PhoneB,
    pros: ['The most dramatic: a look-up moment every time', 'Grows out of today’s production show (its nine event layers ship already), so the build reuses most of it', 'Each event looks like itself, so a family learns them by sight'],
    cons: ['Covers the map for about 2 s per headline event', 'Heaviest to draw: TV only (the phones never play it)'],
  },
  {
    id: 'A',
    name: 'Alert broadcast',
    pitch: 'The TV is a colony control room. An alert bar drops over the top of the map, then a scan line or a targeting reticle locks brackets and hazard stripes onto every plot it hits. A ticker in the header counts the phase’s alerts.',
    tv: TvA,
    phone: PhoneA,
    pros: ['The calmest and cheapest to draw', 'Never dims the map: the plots stay readable throughout', 'The ticker makes a three-event phase easy to follow'],
    cons: ['Every event looks alike apart from its glyph: less “cool”', 'Reads as interface more than as weather on a planet'],
  },
  {
    id: 'C',
    name: 'Dealt cards',
    pitch: 'Events are cards from the colony’s deck, as at a kitchen table. Each is dealt into the TV’s rail, a line runs from the card to where it strikes, and a token is stamped on every plot it hits. The month’s cards stay in view.',
    tv: TvC,
    phone: PhoneC,
    pros: ['Never covers the map', 'The month stays readable: every card is still on the table at the end', 'The phone holds the same card: “your hand”'],
    cons: ['The drama is in the rail, away from the map', 'Tokens on many plots (a colony-wide storm) get busy'],
  },
];

const PRINCIPLES = [
  'Three weights, so 1.6 to 3.3 events a month never feel like an interruption: a headline (colony events, the meteor) takes the TV for a moment; a spotlight (a player’s pest swarm, wildfire, bumper harvest) singles out that player’s land; a bulletin (sickness, later inheritance, rats…) gathers into one roll call and never covers the map.',
  'Every phase opens with what fired, then plays each event in the order it fired. A badge per event in the header shows the one playing and ticks off the ones done.',
  'Colour-blind safe: every event has its own glyph shape; good or bad is the badge’s shape (a diamond warns, a circle welcomes); a loss is a ▼ on hazard stripes, a gain a ▲ on a plain chip. Never colour alone.',
  'Reduced motion: nothing travels, shakes or loops; each event’s marks appear at once where they land. Switch it on in the controls on any page.',
  'The phones never play the weather. They buzz, name the event, say what it did to you (or that it missed you), and mark your own hit plots. Only small cards enter, so no heavy paint when a phase starts.',
  'Everything sits on Heiko’s approved plot look (WS6, A: bold plots) and WS6’s approved sick tag (variant B); bars are WS6’s production bars (R3).',
];

/** Routes: #<dir>-<scenario> (one direction, one scenario), #compare-<scenario> (all three at once). */
function useHash(): string {
  const [hash, setHash] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const on = () => {
      setHash(window.location.hash.slice(1));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const [dir, id] = hash.split('-') as [string, string | undefined];
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (scenario && dir === 'compare') return <Compare key={hash} scenario={scenario} />;
  const d = DIRECTIONS.find((x) => x.id === dir);
  if (d && scenario) return <Gallery key={hash} dir={d.id} scenario={scenario} />;
  return <Index />;
}

function useReduced() {
  return useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full bg-table p-6 text-ink">
      <a href="#" className="text-sm text-holo underline" data-testid="back">
        ← All event visuals
      </a>
      <div className="mt-3 flex flex-col gap-4">{children}</div>
    </div>
  );
}

/** One direction, one scenario: the TV and Lena's phone on one clock. */
function Gallery({ dir, scenario }: { dir: Dir; scenario: Scenario }) {
  const d = DIRECTIONS.find((x) => x.id === dir)!;
  const s = useMemo(() => script(scenario.phase, scenario.events), [scenario]);
  const clock = useShowClock(s.end);
  const [reduced, setReduced] = useReduced();
  const marks = s.segments.map((g) => ({ at: g.announceAt, label: g.events[0]!.key === 'sickness' ? 'sickness' : g.events[0]!.title.toLowerCase() }));
  const Tv = d.tv;
  const Phone = d.phone;
  return (
    <Page>
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col">
          <span className="label-caps">Direction {d.id} · {d.name}</span>
          <h1 className="font-display text-3xl font-semibold">{scenario.title}</h1>
          <p className="max-w-[760px] text-sm text-ink-2">{scenario.shows}</p>
        </div>
        <Switcher dir={dir} scenario={scenario.id} />
      </div>
      <Controls clock={clock} end={s.end} reduced={reduced} setReduced={setReduced} marks={marks} />
      <ShowProvider value={{ s, t: clock.t, reduced }}>
        <div className="flex flex-col gap-4" data-reduced={reduced}>
          <TvFrame>
            <Tv />
          </TvFrame>
          <div className="flex flex-wrap items-start gap-4">
            <PhoneFrame>
              <Phone />
            </PhoneFrame>
            <DataNotes scenario={scenario} />
          </div>
        </div>
      </ShowProvider>
    </Page>
  );
}

/** All three directions on one clock, for comparing. */
function Compare({ scenario }: { scenario: Scenario }) {
  const s = useMemo(() => script(scenario.phase, scenario.events), [scenario]);
  const clock = useShowClock(s.end);
  const [reduced, setReduced] = useReduced();
  const marks = s.segments.map((g) => ({ at: g.announceAt, label: g.events[0]!.key === 'sickness' ? 'sickness' : g.events[0]!.title.toLowerCase() }));
  return (
    <Page>
      <div className="flex flex-wrap items-end gap-6">
        <div className="flex flex-col">
          <span className="label-caps">All three directions, side by side</span>
          <h1 className="font-display text-3xl font-semibold">{scenario.title}</h1>
        </div>
        <Switcher dir="compare" scenario={scenario.id} />
      </div>
      <Controls clock={clock} end={s.end} reduced={reduced} setReduced={setReduced} marks={marks} />
      <ShowProvider value={{ s, t: clock.t, reduced }}>
        <div className="flex flex-wrap gap-4" data-reduced={reduced}>
          {DIRECTIONS.map((d) => (
            <div key={d.id} className="flex flex-col gap-1">
              <a href={`#${d.id}-${scenario.id}`} className="font-display text-lg font-semibold text-holo underline">
                {d.id} · {d.name}
              </a>
              <TvFrame scale={0.5}>
                <d.tv />
              </TvFrame>
            </div>
          ))}
        </div>
      </ShowProvider>
    </Page>
  );
}

function Switcher({ dir, scenario }: { dir: Dir | 'compare'; scenario: string }) {
  return (
    <div className="flex flex-col gap-1.5" data-testid="switcher">
      <div className="flex flex-wrap gap-1">
        {[...DIRECTIONS.map((d) => ({ id: d.id as Dir | 'compare', name: `${d.id} · ${d.name}` })), { id: 'compare' as const, name: 'Side by side' }].map((d) => (
          <a key={d.id} href={`#${d.id}-${scenario}`} className={cx('rounded-control border px-2.5 py-1 text-sm', d.id === dir ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2 hover:text-ink')}>
            {d.name}
          </a>
        ))}
      </div>
      <div className="flex flex-wrap gap-1">
        {SCENARIOS.map((s) => (
          <a key={s.id} href={`#${dir}-${s.id}`} className={cx('flex items-center gap-1.5 rounded-control border px-2.5 py-1 text-sm', s.id === scenario ? 'border-holo bg-holo-soft text-holo' : 'border-holo-line text-ink-2 hover:text-ink')}>
            {s.events.slice(0, 3).map((e, i) => (
              <EventGlyph key={i} k={e.key} size={14} />
            ))}
            {s.title}
          </a>
        ))}
      </div>
    </div>
  );
}

/** Which data fields drive what the scenario shows, and what the engine does not send yet. */
function DataNotes({ scenario }: { scenario: Scenario }) {
  const fields: Record<string, string[]> = {
    storm: ['scope colony → the whole map, headline weight', 'direction w + origin → the edge it blows in from', 'plots[].order and position → when the front reaches each plot', 'plots[].delta, good → the ▼ chip and the bars that fall away'],
    pests: ['scope personal + player → whose land is singled out', 'origin → where the swarm starts', 'plots[].order → farm to farm, in order', 'plots[].delta, good → the ▼ chip on each farm'],
    sick: ['PROPOSED sickness MonthEvent (phase development, player) → the roll call, in the order fired', 'PROPOSED because → the phone’s “why”', 'the pace (50%) → WS6’s approved tag and WS1’s DEV_WALK'],
    meteor: ['PROPOSED key meteorStrike, kind meteor → its own animation', 'origin → the plot it strikes', 'PROPOSED plots[].muleLost → the wreck, “LOST”', 'PROPOSED plots[].becomes crater → hands the plot to WS5’s crater badge'],
    sequence: ['MonthReport.events, several, in the order fired → the sequence', 'PROPOSED MonthEvent.phase → which phase plays which', 'each event’s own fields as above'],
  };
  return (
    <div className="flex max-w-[420px] flex-col gap-2 rounded-panel border border-holo-line bg-panel p-3 text-sm" data-testid="data-notes">
      <span className="label-caps">What drives it</span>
      <ul className="flex list-disc flex-col gap-1 pl-4 text-ink-2">
        {fields[scenario.id]!.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      <span className="text-xs text-ink-3">PROPOSED = not in MonthEvent yet; see the list on the index page.</span>
    </div>
  );
}

function Index() {
  return (
    <div className="min-h-full bg-table p-8 text-ink" data-testid="index">
      <span className="label-caps">WS8 · Event visuals · for Heiko · 28 Oct 2026</span>
      <h1 className="mt-1 font-display text-4xl font-semibold">How events look on the TV and the phones</h1>
      <p className="mt-2 max-w-3xl text-base text-ink-2">
        Three directions for the overall look, each shown on four events: a dust storm (the whole colony), a pest swarm (one player’s land), sickness (two players, as development starts) and the new meteor strike. Then all three in one production phase. Every page plays the TV and Lena’s phone on one clock: play, pause, scrub, slow it down, or switch on reduced motion.
      </p>

      <h2 className="label-caps mt-8">Pick a direction</h2>
      <div className="mt-3 grid max-w-[1400px] grid-cols-1 gap-4 lg:grid-cols-3" data-testid="directions">
        {DIRECTIONS.map((d) => (
          <section key={d.id} className={cx('flex flex-col gap-3 rounded-panel border-2 bg-panel p-5', d.id === 'B' ? 'border-holo shadow-glow' : 'border-holo-line')} data-testid={`direction-${d.id}`}>
            <span className="flex items-center gap-2">
              <span className="font-display text-3xl font-bold">{d.id}</span>
              <span className="font-display text-2xl font-semibold">{d.name}</span>
              {d.id === 'B' && <span className="ml-auto rounded-chip bg-holo px-2 py-0.5 font-mono text-xs font-bold text-on-holo">RECOMMENDED</span>}
            </span>
            <p className="text-sm leading-relaxed text-ink-2">{d.pitch}</p>
            <ul className="flex flex-col gap-0.5 text-sm">
              {d.pros.map((p) => (
                <li key={p} className="text-ok">+ <span className="text-ink-2">{p}</span></li>
              ))}
              {d.cons.map((c) => (
                <li key={c} className="text-warn">− <span className="text-ink-2">{c}</span></li>
              ))}
            </ul>
            <div className="mt-auto flex flex-col gap-1">
              {SCENARIOS.map((s) => (
                <a key={s.id} href={`#${d.id}-${s.id}`} className="flex items-center gap-2 font-display text-base font-semibold text-holo underline" data-testid={`link-${d.id}-${s.id}`}>
                  <span className="flex gap-0.5 text-ink-2">
                    {s.events.slice(0, 3).map((e, i) => (
                      <EventGlyph key={i} k={e.key} size={16} />
                    ))}
                  </span>
                  {s.title}
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="label-caps self-center">Side by side:</span>
        {SCENARIOS.map((s) => (
          <a key={s.id} href={`#compare-${s.id}`} className="rounded-control border border-holo-line px-2.5 py-1 text-sm text-holo underline">
            {s.title}
          </a>
        ))}
      </div>

      <h2 className="label-caps mt-8">My recommendation</h2>
      <p className="mt-2 max-w-3xl text-base leading-relaxed">
        <strong>B · Living weather</strong>, with C’s month log kept in the rail. You asked for cool and beautiful, and B is the one where the room looks up: each event looks like itself, so a family learns them by sight. It also grows out of what ships today (the production show’s nine event layers), so it is the cheapest to build well. The three weights keep it from wearing thin at three events a month: only headline events take the TV, and sickness never does.
      </p>

      <h2 className="label-caps mt-8">The same in every direction</h2>
      <ul className="mt-2 flex max-w-3xl list-disc flex-col gap-1.5 pl-5 text-sm text-ink-2" data-testid="principles">
        {PRINCIPLES.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>

      <h2 className="label-caps mt-8">Badges: shape says good or bad, glyph says which</h2>
      <div className="mt-3 flex flex-wrap items-center gap-6">
        {SCENARIOS.slice(0, 4).map((s) => (
          <span key={s.id} className="flex items-center gap-2 text-sm">
            <SignBadge ev={s.events[0]!} size={48} />
            {s.events[0]!.title}
          </span>
        ))}
        <span className="flex items-center gap-2 text-sm text-ink-3">
          <SignBadge ev={{ key: 'dustStorm', sign: 'good' }} size={48} />
          (a good event: round frame)
        </span>
      </div>

      <h2 className="label-caps mt-8">What the engine doesn’t send yet (for WS1, via the PM)</h2>
      <table className="mt-2 max-w-4xl text-left text-sm" data-testid="gaps">
        <tbody>
          {GAPS.map((g) => (
            <tr key={g.field} className="border-t border-holo-line align-top">
              <td className="py-1.5 pr-4 font-mono text-xs text-ink">{g.field}</td>
              <td className="py-1.5 text-ink-2">{g.why}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="label-caps mt-8">Timing (display only, not balance)</h2>
      <p className="mt-2 max-w-3xl text-sm text-ink-2">
        Each phase opens for {BEAT.intro} s with what fired; each event is announced for {BEAT.announce} s, plays (a storm 3.6 s, a meteor 3 s, a swarm about 1 s a farm), then settles for {BEAT.settle} s. A three-event production runs about 23 s of events.
      </p>
    </div>
  );
}
