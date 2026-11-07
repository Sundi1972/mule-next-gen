import { POLITICS } from '@mule/engine';
import { Button, cx } from '@mule/ui';
import { useMemo, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';
import { ClientProvider } from '../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../apps/web/src/phone/game';
import { Hub } from '../../../../apps/web/src/phone/hub/Hub';
import { TodayState } from '../../../../apps/web/src/phone/hub/state';
import { TvCouncil } from '../../../../apps/web/src/table/TvCouncil';
import { TvElection } from '../../../../apps/web/src/table/TvElection';
import { boardClient, clientFor, mockTable, SEAT_NAME, viewFor, type MockTable, type Seat } from './fixture';
import { BAND_WORDS, RepChip } from './proposed/parts';
import type { Variant } from './proposed/phone-parts';
import { WaitingFor } from './proposed/ReadyBar';
import { PhoneMonthEndDeals } from './proposed/Results';
import { TvMonthEndDeals, TvPlanning } from './proposed/TableApp';
import { screenOf, SCREENS, type Screen, type State } from './scenarios';
import { Harness, SLOTS } from './slots';

// ---- Where we are: ?screen=&state=&w=&v=, or ?solo=<seat> for one phone at the window's own size ----

const Q = new URLSearchParams(location.search);
const VARIANT: Variant = Q.get('v') === 'b' ? 'b' : 'a';
const WIDTH = Number(Q.get('w') ?? 667);

/** The phones every screen is drawn for, held sideways, and the laptop. Device frames: the only raw sizes. */
const DEVICES: [number, number, string][] = [
  [844, 390, '844 × 390'],
  [667, 375, '667 × 375'],
  [1280, 760, 'Laptop 1280'],
];
const heightOf = (w: number) => DEVICES.find(([dw]) => dw === w)?.[1] ?? 375;
/** index.css: --rail is clamp(232px, 31vw, 300px) of the DEVICE's width; a boxed phone on a wide page must say so itself. */
const railOf = (w: number) => Math.min(300, Math.max(232, Math.round(w * 0.31)));

function href(over: Record<string, string | number | null>): string {
  const q = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(over)) {
    if (v === null) q.delete(k);
    else q.set(k, String(v));
  }
  return `?${q.toString()}`;
}

// ---- A phone and the TV on the mock table ----

function PhoneBody({ store, seat, variant, focus, standings }: { store: MockTable; seat: Seat; variant: Variant; focus: string | null; standings: boolean }) {
  const world = useSyncExternalStore(store.subscribe, store.get);
  const sv = useMemo(() => viewFor(seat, world), [seat, world]);
  const client = useMemo(() => clientFor(store, seat), [store, seat]);
  const [open, setOpen] = useState(standings);
  const ask = useMemo(() => ({ focus, standings: open, setStandings: setOpen }), [focus, open]);
  // The header's "2nd of 4" opens the proposed standings sheet, not today's.
  const capture = (e: MouseEvent) => {
    if ((e.target as Element).closest('[data-testid="standing"]')) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
    }
  };
  return (
    <div className="h-full w-full" onClickCapture={capture}>
      <ClientProvider client={client}>
        <PhoneGameProvider value={sv}>
          <TodayState>
            <Harness.Provider value={ask}>{world.stage === 'monthEnd' ? <PhoneMonthEndDeals month={world.month} /> : <Hub slots={SLOTS[variant]} />}</Harness.Provider>
          </TodayState>
        </PhoneGameProvider>
      </ClientProvider>
    </div>
  );
}

function Phone({ store, seat, w, variant, focus, standings, solo }: { store: MockTable; seat: Seat; w: number; variant: Variant; focus: string | null; standings: boolean; solo: string }) {
  const h = heightOf(w);
  return (
    <figure className="flex flex-col gap-1" data-testid={`phone-${seat}-${w}`}>
      <figcaption className="flex items-baseline gap-2 text-xs text-ink-2">
        <span className="label-caps text-[10px]!">{SEAT_NAME[seat]}’s phone</span>
        <span className="font-mono">
          {w} × {h}
        </span>
        <a className="text-holo underline" href={solo} data-testid={`solo-link-${seat}`}>
          open alone at the window’s size
        </a>
      </figcaption>
      {/* The device's screen: its width and height, and the rail its width gives. */}
      <div className="relative overflow-hidden rounded-panel border border-holo-line bg-void" style={{ width: w, height: h, ['--rail' as string]: `${railOf(w)}px` }}>
        <PhoneBody store={store} seat={seat} variant={variant} focus={focus} standings={standings} />
      </div>
    </figure>
  );
}

function TvScreen({ store }: { store: MockTable }) {
  const world = useSyncExternalStore(store.subscribe, store.get);
  const { view, table } = useMemo(() => viewFor(null, world), [world]);
  if (world.stage === 'monthEnd') return <TvMonthEndDeals game={view} month={world.month} />;
  if (world.stage === 'ballot') return <TvElection table={table} game={view} />;
  if (world.stage === 'lawBallot') return <TvCouncil game={view} />;
  return <TvPlanning table={table} game={view} />;
}

function Tv({ store, w = 960 }: { store: MockTable; w?: number }) {
  const client = useMemo(() => boardClient(store), [store]);
  const k = w / 1280;
  return (
    <figure className="flex flex-col gap-1" data-testid="tv">
      <figcaption className="flex items-baseline gap-2 text-xs text-ink-2">
        <span className="label-caps text-[10px]!">The TV</span>
        <span className="font-mono">1280 × 720, shown at {Math.round(k * 100)}%</span>
        <a className="text-holo underline" href={href({ tvsolo: 1 })} data-testid="solo-link-tv">
          open alone at full size
        </a>
      </figcaption>
      {/* The TV's screen, scaled to the page: a device frame. */}
      <div className="overflow-hidden rounded-panel border border-holo-line bg-table" style={{ width: w, height: 720 * k }}>
        <div style={{ width: 1280, height: 720, transform: `scale(${k})`, transformOrigin: 'top left' }}>
          <ClientProvider client={client}>
            <TvScreen store={store} />
          </ClientProvider>
        </div>
      </div>
    </figure>
  );
}

// ---- Specimens: the chip's bands, and the ready bar's names at the rail's width ----

function Bands({ store }: { store: MockTable }) {
  const world = useSyncExternalStore(store.subscribe, store.get);
  const { view } = useMemo(() => viewFor('lena', world), [world]);
  const seats = view.players.filter((p) => !p.isAi).map((p) => ({ id: p.id, name: p.name, slot: p.slot, isAi: false, ready: false, away: false }));
  return (
    <div className="flex flex-wrap items-start gap-8" data-testid="bands">
      <table className="text-left text-sm">
        <thead className="text-xs text-ink-3">
          <tr>
            <th className="pr-4 font-normal">Player</th>
            <th className="pr-4 font-normal">Phone</th>
            <th className="pr-4 font-normal">TV</th>
            <th className="font-normal">Band, in words</th>
          </tr>
        </thead>
        <tbody>
          {view.players.map((p) => (
            <tr key={p.id} className="border-t border-holo-faint" data-testid={`band-${p.id}`}>
              <td className="py-2 pr-4 font-semibold">{p.name}</td>
              <td className="pr-4">
                <RepChip view={view} id={p.id} testid={`band-${p.id}-phone`} />
              </td>
              <td className="pr-4">
                <RepChip view={view} id={p.id} tv testid={`band-${p.id}-tv`} />
              </td>
              <td className="text-ink-2">{BAND_WORDS[(p.reputation ?? 50) >= POLITICS.weight.repHigh ? 'good' : (p.reputation ?? 50) < POLITICS.weight.repLow ? 'low' : 'fair']}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <figure className="flex flex-col gap-1" data-testid="ready-specimen">
        <figcaption className="text-xs text-ink-2">
          <span className="label-caps text-[10px]!">The ready bar’s names</span> at the 667 phone’s rail (232 px), as ReadyBar draws them
        </figcaption>
        <div className="flex flex-col gap-1.5 rounded-panel border border-holo-line bg-void/60 px-3 pb-1.5 pt-1.5" style={{ width: railOf(667) }}>
          <WaitingFor view={view} seats={seats} me="lena" />
          <Button size="lg" className="w-full">
            I’m ready
          </Button>
        </div>
      </figure>
    </div>
  );
}

// ---- Pages ----

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-table p-6 text-ink" data-testid="page">
      {children}
    </main>
  );
}

function Section({ title, children, testid }: { title: ReactNode; children: ReactNode; testid?: string }) {
  return (
    <section className="flex flex-col gap-3" data-testid={testid}>
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Pill({ on, href: to, children, testid }: { on: boolean; href: string; children: ReactNode; testid: string }) {
  return (
    <a href={to} aria-current={on ? 'page' : undefined} className={cx('inline-flex h-9 items-center rounded-control border px-3 text-sm font-semibold', on ? 'border-holo bg-holo-soft text-ink' : 'border-holo-line text-ink-2 hover:border-holo')} data-testid={testid}>
      {children}
    </a>
  );
}

function StateView({ screen, state, variant, w }: { screen: Screen; state: State; variant: Variant; w: number }) {
  const store = useMemo(() => mockTable(state.world()), [state]);
  const seats = Object.keys(state.phones) as Seat[];
  return (
    <div className="flex flex-col gap-4" data-testid={`state-${screen.id}-${state.id}`}>
      {state.id === 'bands' && <Bands store={store} />}
      <div className="flex flex-wrap items-start gap-6">
        {seats.map((seat) => (
          <Phone
            key={`${seat}-${w}-${variant}`}
            store={store}
            seat={seat}
            w={w}
            variant={variant}
            focus={state.phones[seat] ?? null}
            standings={state.standings?.includes(seat) ?? false}
            solo={href({ solo: seat })}
          />
        ))}
      </div>
      {state.tv && <Tv store={store} />}
    </div>
  );
}

function ScreenPage({ screen }: { screen: Screen }) {
  const state = screen.states.find((s) => s.id === Q.get('state')) ?? screen.states[0]!;
  return (
    <Shell>
      <header className="flex flex-col gap-2">
        <a href="?" className="text-sm text-holo underline" data-testid="back">
          ← Index
        </a>
        <h1 className="font-display text-2xl font-semibold">
          <span className="font-mono text-holo">{screen.piece}</span> · {screen.title}
        </h1>
        <p className="text-sm text-ink-2">Graft target: {screen.graft}</p>
      </header>
      <nav className="flex flex-col gap-2" aria-label="States and sizes">
        <div className="flex flex-wrap gap-1.5" data-testid="state-switcher">
          {screen.states.map((s) => (
            <Pill key={s.id} on={s.id === state.id} href={href({ state: s.id })} testid={`go-${s.id}`}>
              {s.label}
            </Pill>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label-caps text-[10px]!">Size</span>
          {DEVICES.map(([dw, , label]) => (
            <Pill key={dw} on={dw === WIDTH} href={href({ w: dw })} testid={`size-${dw}`}>
              {label}
            </Pill>
          ))}
          {screen.composer && (
            <>
              <span className="label-caps ml-4 text-[10px]!">Composer</span>
              <Pill on={VARIANT === 'a'} href={href({ v: 'a' })} testid="variant-a">
                A · sheet over the rail
              </Pill>
              <Pill on={VARIANT === 'b'} href={href({ v: 'b' })} testid="variant-b">
                B · card inline in the thread
              </Pill>
            </>
          )}
        </div>
      </nav>
      <p className="max-w-4xl text-sm" data-testid="state-note">
        {state.note}
      </p>
      <StateView screen={screen} state={state} variant={VARIANT} w={WIDTH} />
    </Shell>
  );
}

/** One phone, or the TV, at the window's own size: what the 667 × 375 measurements load. */
function Solo({ seat }: { seat: Seat | null }) {
  const screen = screenOf(Q.get('screen')) ?? SCREENS[0]!;
  const state = screen.states.find((s) => s.id === Q.get('state')) ?? screen.states[0]!;
  const store = useMemo(() => mockTable(state.world()), [state]);
  if (!seat) {
    const client = boardClient(store);
    return (
      <div className="h-dvh w-dvw overflow-hidden bg-table" data-testid="solo-tv">
        <ClientProvider client={client}>
          <TvScreen store={store} />
        </ClientProvider>
      </div>
    );
  }
  return (
    <div className="h-dvh w-dvw overflow-hidden bg-void" data-testid={`solo-${seat}`}>
      <PhoneBody store={store} seat={seat} variant={VARIANT} focus={state.phones[seat] ?? null} standings={state.standings?.includes(seat) ?? false} />
    </div>
  );
}

// ---- The index ----

const DECISIONS: [string, string][] = [
  ['Where', 'Everything lives where P0 put it: the Talk desk’s Chat and My cards, no new tab, no new tool; a deal starts from its player (a whisper, a name, a standings row).'],
  ['Composer', 'Two variants of + Deal, below; my pick is A, the sheet over the rail.'],
  ['Kinds', 'Two cards, one tap each, nothing to type: Pact (1, 3 or 6 months) or My vote (a declared Governor candidate, or yes/no on the next law vote).'],
  ['Refusals', 'A choice the engine would refuse is replaced by the engine’s own words before the send; a refusal that still comes back shows in the composer, where she tapped.'],
  ['AI seats', 'Sending to an AI seat with a name under 30 is warned, not blocked: the seat’s answer is the rule, and it answers in seconds.'],
  ['Incoming', 'A card offered to you leads “This month” (“1 deal offer”, Only you), badges the Talk tab, and sits at the foot of the pair’s whisper with both names’ chips, Accept and Decline.'],
  ['Thread', 'Cards sit at the thread’s foot, not between lines: a card has no time of its own (finding F-5).'],
  ['My cards', 'Grouped by what you must do: answer, waiting (Withdraw, offers left), active (what it binds, until when), settled (with the month).'],
  ['Chip', 'The number always; a star at 70+, a dashed edge and a warning under 30, so the band reads in greyscale; +3 / −10 flashes on it for a few seconds when it moves.'],
  ['Chip, where', 'Standings, every name in a card, the whisper line, the ready bar’s others, the TV’s waiting box, ready list and league. Not in one-line tickers, the walking names, the whisper pills or the offices line.'],
  ['Chip, tap', 'Opens the player’s card: the band in words, what moved it in public (broken cards, unrest; kept cards never), and Whisper / + Deal. The TV and the footer’s chips are labels.'],
  ['Ballots', '“You promised Brix your vote” under the ballot’s legend, PROMISED on the candidate, picked on her phone only; she casts as she likes.'],
  ['TV break', 'A red banner under the planning header, in the news’s words, with the drop (50 → 40) beside the breaker’s chip; it holds for that planning.'],
  ['Month end', 'The month’s broken cards in one dashed list, under the colony panel on the TV and under the league on the phone.'],
  ['AI mark', 'Heiko, 8 Nov: a computer seat’s name on a deal card carries a quiet “· AI” (the Talk list’s mark): card label, names, lines, My cards, the TV banner and month end. Not after a possessive; the label carries it there.'],
  ['Words', 'No pronouns anywhere: “Lena broke a promise to Brix: a vote for Brix” (finding F-3).'],
];

const FINDINGS: [string, string][] = [
  ['F-1', 'S3-C17 names apps/web/src/chat/Chat.tsx’s whisper input; the phone’s whisper input and thread are apps/web/src/phone/parts.tsx::Chat. The named edit should move to that file and its owner.'],
  ['F-2', 'The frame’s 667 phone drew a 300 px rail. --rail is clamp(232px, 31vw, 300px) of the device, so a real 667 × 375 phone has a 232 px rail and the short: variant on. This mock pins the rail per device and measures with each phone alone in a 667 × 375 window.'],
  ['F-3', 'The spec’s table words the break “Lena broke her promise to Brix”; the game does not know players’ pronouns. Drawn in S3-RULE-11’s neutral form: “Lena broke a promise to Brix: a vote for Brix”.'],
  ['F-4', 'A promised vote is picked on the phone only (§0.1). In this mock “Cast my vote” and the law vote’s Done stay greyed on that preselect (today’s ready bar reads the server’s ballot and ElectionDay’s pick store, not the promise), and the ready press sends no vote of its own: cast as-is, the player would count as “no ballot cast”, which breaks the card. The build must count the preselect as a pick and send it on Cast.'],
  ['F-5', 'DealCard carries no time, only months, so a card can’t sit between the whisper lines it answers. Drawn at the thread’s foot.'],
  ['F-6', 'The composer’s sheet (A) and the player’s card cover the shell from inside the desk; the hub has no slot for a sheet over the rail. The mock portals into game-shell; the build may want a rail-sheet slot in Hub.'],
  ['F-7', 'useHub() throws outside the hub; the player’s card asks whether it is inside one (for + Deal). The mock catches the throw; Hub.tsx should export a non-throwing twin.'],
  ['F-8', 'The TV and the month end show a broken card’s drop (50 → 40) by working back from the move; at the clamp (a name at 5 breaking a pact) the “before” would be wrong. A `was` on the broken card, or the drop in the news’s data, would fix it.'],
  ['F-9', 'At 667 × 375 the rail’s scroll body is 176 px (844: 195). The incoming card is 238 px and the Talk desk’s chat box (P0’s, 240 px) is taller than the body too: both scroll; the thread lands on Accept / Decline. If that is not good enough, the agenda’s door could open the card in A’s sheet.'],
  ['F-10', 'P4 names the TV’s “players strip”: in planning the TV draws the ready list (chips drawn there); Players, the strip other phases draw, takes the same chip in the same place (not drawn here).'],
];

function VariantCard({ v, title, children }: { v: Variant; title: string; children: ReactNode }) {
  const state = SCREENS.find((s) => s.id === 'composer')!.states[0]!;
  const store = useMemo(() => mockTable(state.world()), [state]);
  return (
    <div className="flex flex-col gap-2" data-testid={`variant-${v}-card`}>
      <h3 className="font-display text-base font-semibold">{title}</h3>
      <Phone store={store} seat="lena" w={667} variant={v} focus="compose:brix:pact" standings={false} solo={`?screen=composer&state=pact&v=${v}&solo=lena`} />
      <div className="max-w-[667px] text-sm leading-snug text-ink-2">{children}</div>
      <a className="text-sm text-holo underline" href={`?screen=composer&state=pact&v=${v}`} data-testid={`variant-${v}-states`}>
        Every composer state in variant {v.toUpperCase()} →
      </a>
    </div>
  );
}

function Index() {
  return (
    <Shell>
      <header className="flex flex-col gap-2" data-testid="index">
        <h1 className="font-display text-2xl font-semibold">Politics RC · slice 3 · deal cards and reputation (P1–P5)</h1>
        <p className="max-w-4xl text-sm text-ink-2">
          A promise across the table becomes a card one tap accepts; breaking it costs a name everyone sees. Drawn in P0’s frame (the real planning hub; option A, 7 Nov), month 5 at a four-seat table: Lena, Brix and Kai on phones, Ossa an AI seat. Every
          phone here is the real hub with the proposed pieces in it, on one mock table: a card Lena offers lands on Brix’s phone. Spec: WS7’s 2026-11-07 slice-3 deals, “What the table sees”.
        </p>
      </header>
      <Section title="The hardest screen: + Deal, two ways" testid="variants">
        <p className="max-w-4xl text-sm text-ink-2">Both at 667 × 375 (232 px rail), open on a pact for Brix. Both send the same card and read the same refusals; only where the composer lives differs.</p>
        <div className="flex flex-wrap items-start gap-8">
          <VariantCard v="a" title="A · a sheet over the rail">
            The whole rail, header to Ready, becomes the composer; the map stays in view. Every choice and Offer fit at once, with no scroll, and a big target for Offer. It hides the whisper while open: the words that led to the card are one
            Close away.
          </VariantCard>
          <VariantCard v="b" title="B · the card, inline in the thread">
            The input turns into a dashed draft of the card itself, at the thread’s foot: what you build is what Brix receives, beside the words that asked for it. At 667 it outgrows the rail’s scroll body: the kinds, the choice and Offer
            never show together, and Now and the desks scroll away.
          </VariantCard>
        </div>
        <p className="max-w-4xl text-sm font-semibold" data-testid="recommendation">
          Recommended: A. On the 667 phone the rail’s scroll body is about a third of the screen tall; B’s draft does not fit in it, A fits whole. B’s honest strength, seeing the card as Brix will, is kept in A by the sent card in the thread.
        </p>
      </Section>
      <Section title="Key decisions" testid="decisions">
        <ul className="flex max-w-5xl flex-col gap-1 text-sm">
          {DECISIONS.map(([k, d]) => (
            <li key={k} className="flex gap-3" data-testid={`decision-${k}`}>
              <span className="w-24 shrink-0 font-semibold">{k}</span>
              <span className="text-ink-2">{d}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Every screen and state" testid="screens">
        <table className="max-w-6xl text-left text-sm">
          <tbody>
            {SCREENS.map((s) => (
              <tr key={s.id} className="border-t border-holo-line align-top" data-testid={`screen-${s.id}`}>
                <td className="py-2 pr-3 font-mono text-holo">{s.piece}</td>
                <td className="py-2 pr-3">
                  <a className="font-semibold underline" href={`?screen=${s.id}`} data-testid={`open-${s.id}`}>
                    {s.title}
                  </a>
                  <div className="text-xs text-ink-3">{s.graft}</div>
                </td>
                <td className="py-2">
                  <span className="flex flex-wrap gap-x-3 gap-y-1">
                    {s.states.map((st) => (
                      <a key={st.id} className="text-holo underline" href={`?screen=${s.id}&state=${st.id}`} data-testid={`open-${s.id}-${st.id}`}>
                        {st.label}
                      </a>
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Findings for the PM and WS7" testid="findings">
        <ul className="flex max-w-5xl flex-col gap-1 text-sm">
          {FINDINGS.map(([k, d]) => (
            <li key={k} className="flex gap-3" data-testid={`finding-${k}`}>
              <span className="w-10 shrink-0 font-mono text-warn">{k}</span>
              <span className="text-ink-2">{d}</span>
            </li>
          ))}
        </ul>
      </Section>
    </Shell>
  );
}

export default function App() {
  if (Q.has('tvsolo')) return <Solo seat={null} />;
  const solo = Q.get('solo') as Seat | null;
  if (solo) return <Solo seat={solo} />;
  const screen = screenOf(Q.get('screen'));
  return screen ? <ScreenPage screen={screen} /> : <Index />;
}
