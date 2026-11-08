import { cx } from '@mule/ui';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ClientProvider } from '../../../../apps/web/src/net/react';
import { PhoneGameProvider } from '../../../../apps/web/src/phone/game';
import { Hub } from '../../../../apps/web/src/phone/hub/Hub';
import { TodayState } from '../../../../apps/web/src/phone/hub/state';
import { HUB_SLOTS } from '../../../../apps/web/src/phone/hub/today';
import { clientFor, mockTable, SEAT_LABEL, viewFor, type MockTable } from './fixture';
import { MEASURED } from './measured';
import { TabHub } from './proposed/Hub';
import type { ShellVariant } from './proposed/Shell';
import { BudgetVariantProvider } from './proposed/tabs/Politics';
import { TAB_SLOTS } from './proposed/today';
import { SCREENS, stateOf, type State } from './scenarios';

// ---- Where we are: ?screen=&state=&w=, or &solo=1 for one phone at the window's own size (how the numbers were measured) ----

const Q = new URLSearchParams(location.search);

/** The two phones every state is drawn for, held sideways. Device frames: the only raw sizes in the mock. */
const DEVICES: [number, number][] = [
  [667, 375],
  [844, 390],
];
/** index.css: --rail is clamp(232px, 31vw, 300px) of the DEVICE's width; a boxed phone on a wide page must say so itself. */
const railOf = (w: number) => Math.min(300, Math.max(232, Math.round(w * 0.31)));

const href = (p: Record<string, string>) => `?${new URLSearchParams(p).toString()}`;

/** The key decisions, one line each (also in the report to WS6). */
const DECISIONS: [string, string][] = [
  ['D1', 'Every tab keeps, in the rail: the phase as one slim stepper line, the one Now line with its “?”, money and the ready count (or clock) as today, and Ready bottom right. The stage-top explanation card is gone.'],
  ['D2', 'The “?” opens the old card in full as a sheet over the phone: the month’s steps, Now and Next, the offices line, Now’s own detail, and what you need this month.'],
  ['D3', 'Four tabs: Overview · Governor (Council on every phone but the Governor’s) · Colony · Talk. Badges: a count for offers (holo), VOTE for an open ballot (warn), “!” for a broken promise (alert).'],
  ['D4', 'Shell A, a 56 px tab column at the stage’s left edge, is built for every tab: it gives the map more at both phones (measured below). B, a 44 px bar under the stage, is drawn on Overview for the comparison.'],
  ['D5', 'Overview is the one map: the tool row (Look · Geo drone · My plots · Sell) above it, “This month” as compact rows under it, each opening its tab. The Market desk is the Sell tool’s rail panel.'],
  ['D6', 'A pick from another tab (the Sheriff’s Guard) turns Overview’s map to it: the tool row gives way to “Guarding · tap the plot…” and “Back to Sheriff”; the map is ringed in warn while it lasts.'],
  ['D7', 'Governor / Council: sub-tabs Laws · Budget · Elections, plus Sheriff while a Sheriff holds office. Laws holds the tax, the overrule call and its ballot, the laws in force, the law proposed. Budget holds the P3 budget (both variants, a switch to pick) and Commission under Projects.'],
  ['D8', 'A ballot (election, law, overrule) sits first in its sub-tab and badges the tab; the Now line becomes a door to it. Only a ceremony (a reveal) still takes the whole stage, tabs hidden, since the table watches it together.'],
  ['D9', 'A broken promise badges Talk, not Colony: the card lives in My cards and the only answer to it is words or a new card. Colony shows the public side (the reputation chip and its reasons) without a badge.'],
  ['D10', 'Colony: standings with reputation chips and “+ Deal” first, then the fund, the colony card (gauges, buildings, projects), the build site, what you need, the news, the ship and the facts; two columns at 844.'],
  ['D11', 'Talk: Chat and My cards; the thread has the whole stage. The composer (A) and an incoming offer open as the same sheet over the Talk stage. “+ Deal” on a whisper, a standings row or a player’s card all land here.'],
  ['D12', 'The month end and every other phase (land grant, development, the auctions, production) are unchanged: only the planning hub becomes tabs.'],
  ['D13', 'The overrule call moves from the Colony desk’s fund card (PM ruling, 7 Nov) to the tax line in Council › Laws, beside its ballot, as WS6 decided for the tabs. It is still “at the tax line”; the line under Now opens Laws.'],
  ['D14', 'The table chat (C20) keeps its place in the rail on every tab: the seat row and the ticker under the rail’s content, the bubble in the head. Talk is where the threads and whispers are.'],
  ['D15', 'The cast: Brix is the human Governor (runs again in month 8), Kai the Sheriff and the caller, Ossa the AI seat and Land Baron, Lena the phone with no office. One table gives every state.'],
];

/** What reshaping the real hub touches, file by file (apps/web/src/phone/…), with the slot or interface change each needs. */
const TOUCHES: [string, string][] = [
  ['hub/slots.ts', 'HubSlots → TabHubSlots (src/proposed/slots.ts): desks: DeskSlot[] becomes tabs: TabSlot[] + politicsTabs: SubTabSlot[]; new picks: PlotPickSlot[]; MapToolSlot.desk dropped; stage holds ceremonies only; lines go to the “?” sheet; beneath unused on a phone. HubPlace becomes { tab, sub, tool, focus, pick }; goTo/settle take a Door. AgendaSlot and DeskDoor unchanged (desk ids translate through DESK_DOORS).'],
  ['hub/Hub.tsx', 'HubNav gains tab, sub, pick, open(door), startPick(id), endPick(); openDesk/pickTool kept and translated (DESK_DOORS). Hub draws TabShell; HubStage, DeskTabs, DeskGroup, AgendaRow, MapTools leave for tabs/Overview.tsx; SituationStage for a ceremony only. New: the Now line as a door to a sub-tab that asks first; HelpSheet; export useHubIfAny (deals mock F-7).'],
  ['Shell.tsx', 'PhoneShell gains, for the hub only, tabs (column A) and a head slot (PhaseLine + NowLine) in place of now/foldNow; the phase row drops “Month n / m” (it moves to PhaseLine). New exports PhaseLine, NowLine. FallbackBubble and TableChat under stay. Every other phase’s PhoneShell is unchanged.'],
  ['hub/today.tsx', 'HUB_SLOTS → TAB_SLOTS: four tabs; politicsTabs; tools with list relabelled “Sell” and Panel: MarketDesk; agenda adds DEALS_AGENDA, OVERRULE_AGENDA, NEEDS_AGENDA, drops the drone and list rows, GOVERNOR_AGENDA shown to the Governor only; picks: WS8’s Guard; stage: the three reveals; nows/underNow/readyWords plus the overrule’s.'],
  ['hub/desks.tsx', 'ColonyDesk, ThisMonth, News stay (Colony tab). TalkDesk and ChatBadge are replaced by tabs/Talk.tsx (TalkTab, TalkBadge; the thread fills the stage, not 240 px). MarketDesk becomes the Sell tool’s rail Panel; MarketStrip stays in it.'],
  ['hub/tools.tsx', 'Unchanged: Look, My plots, Geo drone and Sell keep their Map, Panel and Action; Overview mounts them.'],
  ['hub/Roadmap.tsx, NeedsStrip.tsx', 'Unchanged components, moved: from the stage into the “?” sheet. A “Short 1 Energy” agenda row replaces the strip on the stage.'],
  ['hub/ReadyBar.tsx, Standings.tsx', 'ReadyBar unchanged. StandingsSheet stays behind “2nd of 4” (with the deals mock’s chip and + Deal); the Colony tab adds the league inline.'],
  ['hub/politics/slots.ts', 'COUNCIL_DESK and GOVERNOR_DESK become SubTabSlots: laws, budget, elections, sheriff (shown while a Sheriff holds office); first() on an open ballot. ELECTION_DAY_STAGE, COUNCIL_STAGE and the new OVERRULE_STAGE show for the ceremony/reveal only. OFFICES_BANNER moves to lines (the “?” sheet). GOVERNOR_AGENDA gains show(isGovernor).'],
  ['hub/politics/Council.tsx', 'CouncilDesk splits: LawsInForce + PendingLaw (export it) to Laws; CouncilBody (running, offices, results) to Elections.'],
  ['hub/politics/Governor.tsx', 'GovernorDesk (SalesTax + LawPicker) mounts in Laws unchanged; FrozenTax replaces SalesTax’s row while a call holds the tax (budget mock).'],
  ['hub/politics/Colony.tsx', 'ColonyWithFacts mounts in the Colony tab; Commission leaves for Budget’s Projects line (budget mock P12); the overrule call is not grafted into FundCard (it is in Laws, D13).'],
  ['hub/politics/Offices.tsx, LawBallot.tsx, ElectionDay.tsx', 'Bodies unchanged; Offices’ openDesk calls land through DESK_DOORS. CouncilRail and ElectionDayRail are used for the reveals only; during a ballot the rail keeps Now.'],
  ['phone/parts.tsx', 'Chat takes the deals mock’s four changes (whisper target, rep chip, DealsInThread, + Deal) and the AI mark on the recipient chips; its fixed 240 px wrapper goes.'],
  ['Planning.tsx', '<Hub slots={TAB_SLOTS} />.'],
  ['new: hub/tabs/{Overview, Politics, Colony, Talk}.tsx, hub/tabs/parts.tsx', 'The four tab bodies, the sub-tab row, TabBadge. The deals mock’s RailSheet anchors in the Talk stage, not the rail.'],
  ['not designed here', 'The laptop (from 1100 px): its rail is 400 px and has room for the desks as today. Tabs there, or desks? A decision for WS6 before the build.'],
];

/** Where the design system has no answer; each is marked DS-GAP: in the code. */
const GAPS: [string, string][] = [
  ['Tabs', '@mule/ui has no Tabs or segmented control. The tab column, the tab bar, the sub-tabs and Talk’s Chat / My cards are hand-rolled buttons with role="tab", as today’s DeskTabs are.'],
  ['Badge', 'No Badge component (a count or a word on a tab). TabBadge hand-rolls it, as ChatBadge does today. No on-warn or on-alert ink token: VOTE uses on-holo on warn, “!” ink on alert.'],
  ['Small button', 'Button’s smallest size is md (44 px). The 32 px tool chips and the 36 px sub-tabs are raw buttons, as the hub’s MapTools and DeskTabs are today.'],
  ['Sheet', 'No Sheet or Dialog component. The “?” sheet copies StandingsSheet’s overlay, its 600 px width included.'],
  ['Icons', 'No icon set. Tab icons are 24×24 stroked paths, as DeskSlot.icon is; Hub.tsx’s Glyph is not exported, so the mock has its own.'],
];

// ---- A phone on the mock table ----

function PhoneBody({ store, state, variant }: { store: MockTable; state: State; variant: ShellVariant }) {
  const world = useSyncExternalStore(store.subscribe, store.get);
  const sv = useMemo(() => viewFor(state.seat, world), [state.seat, world]);
  const client = useMemo(() => clientFor(store, state.seat), [store, state.seat]);
  return (
    <ClientProvider client={client}>
      <PhoneGameProvider value={sv}>
        <TodayState>
          <BudgetVariantProvider initial={state.budget ?? 'a'}>{state.today ? <Hub slots={HUB_SLOTS} /> : <TabHub slots={TAB_SLOTS} variant={variant} start={state.start} />}</BudgetVariantProvider>
        </TodayState>
      </PhoneGameProvider>
    </ClientProvider>
  );
}

/** The map's drawn size in this frame, measured live: MapFit's sized box inside [data-testid=hub-map]. */
function MapReadout({ frame }: { frame: React.RefObject<HTMLDivElement | null> }) {
  const [size, setSize] = useState<string>('');
  useEffect(() => {
    const measure = () => {
      const box = frame.current?.querySelector('[data-testid="hub-map"] [style*="width"]');
      const r = box?.getBoundingClientRect();
      setSize(r && r.height > 0 ? `${Math.round(r.width)} × ${Math.round(r.height)}` : '');
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (frame.current) ro.observe(frame.current);
    const t = setInterval(measure, 500);
    return () => {
      ro.disconnect();
      clearInterval(t);
    };
  }, [frame]);
  return size ? (
    <span className="font-mono text-holo" data-testid="map-readout">
      map {size}
    </span>
  ) : null;
}

function Phone({ state, w, h, label }: { state: State; w: number; h: number; label?: string }) {
  const store = useMemo(() => mockTable(state.world()), [state]);
  const frame = useRef<HTMLDivElement>(null);
  const variant = state.shell ?? 'a';
  return (
    <figure className="flex flex-col gap-1" data-testid={`phone-${state.id}-${w}`}>
      <figcaption className="flex flex-wrap items-baseline gap-x-2 text-xs text-ink-2">
        {label && <strong className="text-holo">{label}</strong>}
        <span className="label-caps text-[10px]!">{SEAT_LABEL[state.seat]}</span>
        <span className="font-mono">
          {w} × {h}
        </span>
        <MapReadout frame={frame} />
      </figcaption>
      {/* The device's screen: its width and height, and the rail its width gives. */}
      <div ref={frame} className="relative overflow-hidden rounded-panel border border-holo-line bg-void" style={{ width: w, height: h, ['--rail' as string]: `${railOf(w)}px` }}>
        <PhoneBody store={store} state={state} variant={variant} />
      </div>
    </figure>
  );
}

function Section({ title, id, children }: { title: ReactNode; id?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" id={id} data-testid={id ? `section-${id}` : undefined}>
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

// ---- The index ----

function Measurements() {
  return (
    <table className="text-left text-sm" data-testid="measurements">
      <thead className="text-xs text-ink-3">
        <tr>
          <th className="py-1 pr-4 font-normal">Phone</th>
          <th className="py-1 pr-4 font-normal">Today’s hub</th>
          <th className="py-1 pr-4 font-normal">A · tab column</th>
          <th className="py-1 pr-4 font-normal">B · tab bar</th>
        </tr>
      </thead>
      <tbody>
        {MEASURED.map((m) => (
          <tr key={m.phone} className="border-t border-holo-line" data-testid={`measured-${m.phone}`}>
            <td className="py-1.5 pr-4 font-mono">{m.phone}</td>
            {[m.today, m.a, m.b].map((x, i) => (
              <td key={i} className="py-1.5 pr-4 font-mono">
                {x.w} × {x.h} <span className="text-ink-3">· {x.area}</span>
                {i > 0 && <span className="ml-1 text-holo">({x.vsToday})</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Index() {
  const shell = SCREENS[0]!;
  const [a, b, today] = shell.states as [State, State, State];
  return (
    <main className="flex min-h-dvh flex-col gap-8 bg-table p-6 text-ink" data-testid="index">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold">The planning hub as tabs</h1>
        <p className="max-w-4xl text-sm text-ink-2">
          Heiko, 8 Nov: “I wouldn’t pack all of this in one screen. Make multiple screens.” The planning hub’s desks become four whole-stage tabs (Overview · Governor or Council · Colony · Talk), the explanation card hides behind a “?”, and
          the map gets the room. Month 5 at the politics table: Brix governs and raised the tax from 5% to 10%; Ossa · AI is the Land Baron; Kai is the Sheriff; Lena has two deal offers. Everything is clickable: the tabs, the tools, the doors in “This
          month”, the ballots, the composer. Every page links back here.
        </p>
      </header>
      <Section title="Key decisions" id="decisions">
        <ul className="flex max-w-5xl flex-col gap-1 text-sm" data-testid="decisions">
          {DECISIONS.map(([id, line]) => (
            <li key={id} className="flex gap-3" data-testid={`decision-${id}`}>
              <span className="w-8 shrink-0 font-mono text-holo">{id}</span>
              <span className="text-ink-2">{line}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="The map, measured (each phone alone at its own window size)" id="measured">
        <Measurements />
        <p className="max-w-4xl text-xs text-ink-3">
          The map’s drawn box (MapFit’s), in CSS px, Lena’s phone with two offers waiting, Look on. Measured by scripts/measure.mjs at the device’s viewport, so the shell’s “short” packing applies as on the phone. The live readout under each frame below is
          the same box inside this page, where that packing does not apply.
        </p>
      </Section>
      <Section title="The shell on Overview: A (tab column) against B (tab bar), and today" id="variants">
        {DEVICES.map(([w, h]) => (
          <div key={w} className="flex flex-wrap items-start gap-6">
            <Phone state={a} w={w} h={h} label="A · tab column" />
            <Phone state={b} w={w} h={h} label="B · tab bar" />
            <Phone state={today} w={w} h={h} label="Today" />
          </div>
        ))}
        <p className="max-w-4xl text-sm text-ink-2" data-testid="variants-note">
          <strong className="text-ink">A</strong> keeps the stage’s full height for the map and puts the tabs under the left thumb; the 56 px it takes from the width costs the map nothing at 667, where the map is bound by width either way, and less than B’s
          44 px of height at 844. <strong className="text-ink">B</strong> reads as a familiar phone tab bar, but in landscape height is the scarce dimension, and it sits under the stage where the right thumb is busy with Ready.
        </p>
      </Section>
      <Section title="What the build touches" id="touches">
        <table className="max-w-6xl text-left text-sm" data-testid="touches">
          <tbody>
            {TOUCHES.map(([file, change]) => (
              <tr key={file} className="border-t border-holo-line align-top" data-testid={`touch-${file}`}>
                <td className="w-64 py-2 pr-3 font-mono text-xs text-holo">{file}</td>
                <td className="py-2 text-ink-2">{change}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Design-system gaps (DS-GAP)" id="gaps">
        <ul className="flex max-w-5xl flex-col gap-1 text-sm" data-testid="gaps">
          {GAPS.map(([what, why]) => (
            <li key={what} className="flex gap-3" data-testid={`gap-${what}`}>
              <span className="w-28 shrink-0 font-semibold">{what}</span>
              <span className="text-ink-2">{why}</span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Every screen and state" id="screens">
        <table className="max-w-6xl text-left text-sm" data-testid="screens">
          <tbody>
            {SCREENS.map((s) => (
              <tr key={s.id} className="border-t border-holo-line align-top" data-testid={`screen-row-${s.id}`}>
                <td className="py-2 pr-3 font-semibold">{s.title}</td>
                <td className="py-2 pr-3 font-mono text-xs text-ink-3">{s.graft}</td>
                <td className="flex flex-wrap gap-x-3 gap-y-1 py-2">
                  {s.states.map((st) => (
                    <a key={st.id} className="text-holo underline-offset-2 hover:underline" href={href({ screen: s.id, state: st.id })} data-testid={`state-link-${s.id}-${st.id}`}>
                      {st.label}
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </main>
  );
}

// ---- A state's page ----

function StatePage({ screenId, stateId }: { screenId: string; stateId: string | null }) {
  const found = stateOf(screenId, stateId);
  if (!found) return <Index />;
  const [screen, state] = found;
  return (
    <main className="flex min-h-dvh flex-col gap-5 bg-table p-6 text-ink" data-testid={`screen-${screen.id}`} data-state={state.id}>
      <header className="flex flex-col gap-2">
        <a href="?" className="text-sm font-semibold text-holo" data-testid="back-to-index">
          ← Index
        </a>
        <h1 className="font-display text-2xl font-semibold">{screen.title}</h1>
        <p className="font-mono text-xs text-ink-3">GRAFT TARGET: {screen.graft}</p>
      </header>
      <nav aria-label="State" className="flex flex-wrap gap-2">
        {screen.states.map((s) => (
          <a
            key={s.id}
            href={href({ screen: screen.id, state: s.id })}
            aria-current={s.id === state.id ? 'page' : undefined}
            className={cx('flex h-11 items-center rounded-control border px-4 text-sm font-semibold', s.id === state.id ? 'border-holo bg-holo-soft text-ink' : 'border-holo-line text-ink-2 hover:border-holo')}
            data-testid={`state-${s.id}`}
          >
            {s.label}
          </a>
        ))}
      </nav>
      <p className="max-w-4xl text-sm text-ink-2" data-testid="state-note">
        {state.note}
      </p>
      <div className="flex flex-wrap items-start gap-6">
        {DEVICES.map(([w, h]) => (
          <Phone key={`${state.id}-${w}`} state={state} w={w} h={h} />
        ))}
      </div>
      <p className="text-xs text-ink-3">
        One phone alone at the window’s size:{' '}
        <a className="text-holo underline" href={href({ screen: screen.id, state: state.id, solo: '1' })} data-testid="solo-link">
          open solo
        </a>
      </p>
    </main>
  );
}

/** One phone filling the window: how scripts/measure.mjs measures, at the device's own viewport. */
function Solo({ screenId, stateId }: { screenId: string; stateId: string | null }) {
  const found = stateOf(screenId, stateId);
  const store = useMemo(() => (found ? mockTable(found[1].world()) : null), [found?.[1]]);
  if (!found || !store) return <Index />;
  return (
    <div className="h-dvh w-dvw" data-testid="solo">
      <PhoneBody store={store} state={found[1]} variant={found[1].shell ?? 'a'} />
    </div>
  );
}

export default function App() {
  const screen = Q.get('screen');
  if (!screen) return <Index />;
  return Q.has('solo') ? <Solo screenId={screen} stateId={Q.get('state')} /> : <StatePage screenId={screen} stateId={Q.get('state')} />;
}
