import { cx } from '@mule/ui';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { mockTable, SEAT_LABEL, type MockTable } from './fixture';
import { PhoneBody } from './PhoneBody';
import { Prototype } from './Prototype';
import { MEASURED, SHERIFF_MEASURED } from './measured';
import { TV_NOTE, type TvFocus } from './tv/TvFor';
import { TV_FIT, TV_FLOOR } from './tv/measured';
import type { ShellVariant } from './proposed/Shell';
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

/** ?tabs=left | bottom: the tab position for every phone on the page (Heiko picks, PM ruling 8 Nov); else the state's own. */
const TABS_Q = Q.get('tabs');
const variantOf = (state: State): ShellVariant => (TABS_Q === 'bottom' ? 'b' : TABS_Q === 'left' ? 'a' : (state.shell ?? 'a'));

/** The key decisions, one line each (also in the report to WS6). */
const DECISIONS: [string, string][] = [
  ['D1', 'Every tab keeps, in the rail: the phase as one slim stepper line, the one Now line with its “?”, money and the ready count (or clock) as today, and Ready bottom right. The stage-top explanation card is gone.'],
  ['D2', 'The “?” opens the old card in full as a sheet over the phone: the month’s steps, Now and Next, the offices line, Now’s own detail, and what you need this month.'],
  ['D3', 'Four tabs: Overview · Governor (Council on every phone but the Governor’s) · Colony · Talk. Badges: a count for offers (holo), VOTE for an open ballot (warn), “!” for a broken promise (alert).'],
  ['D4', 'The tab position is one prop of the shell, tabs="left" (A, a 56 px column at the stage’s left edge, under the left thumb) or tabs="bottom" (B, a 44 px bar under the stage). Heiko picks (PM ruling, 8 Nov); every state shows both. WS6 recommends A: it gives the map more at both phones (measured above).'],
  ['D5', 'Overview is the one map: the tool row (Look · Geo drone · My plots · Sell) above it, “This month” as compact rows under it, each opening its tab. The Market desk is the Sell tool’s rail panel.'],
  ['D6', 'A pick from another tab turns Overview’s one map to it. The Sheriff’s Guard is WS8’s GuardMap there: the tool row gives way to its bar, “Guarding · 1 of 2 · Done · back to Sheriff”; a guarded plot wears a proposed GUARD flag (DS-GAP: HoloMap has none).'],
  ['D7', 'Governor / Council: sub-tabs Laws · Budget · Elections, plus Sheriff while a Sheriff holds office. Laws holds the tax, the overrule call and its ballot, the laws in force, the law proposed. Budget holds the P3 budget (both variants, a switch to pick) and Commission under Projects. Sheriff holds WS8’s case file, variant B.'],
  ['D8', 'A ballot (election, law, overrule) sits first in its sub-tab and badges the tab; the Now line becomes a door to it. Only a ceremony (a reveal) still takes the whole stage, tabs hidden, since the table watches it together.'],
  ['D9', 'A broken promise badges Talk, not Colony: the card lives in My cards and the only answer to it is words or a new card. Colony shows the public side (the reputation chip and its reasons) without a badge.'],
  ['D10', 'Colony: WS10’s colony picture leads the tab (D16), then standings with reputation chips and “+ Deal”, then the fund, the colony card (gauges, buildings, projects), the build site, what you need, the news, the ship and the facts; two columns at 844.'],
  ['D11', 'Talk: Chat and My cards; the thread has the whole stage. The composer (A) and an incoming offer open as the same sheet over the Talk stage. “+ Deal” on a whisper, a standings row or a player’s card all land here.'],
  ['D12', 'The month end stays outside the tabs, as every other phase does (land grant, development, the auctions, production): only the planning hub becomes tabs. The phone’s month end carries the full broken list under the league and the full paid-out line; the TV marks the breaker’s league row instead (PM ruling, 8 Nov).'],
  ['D13', 'The overrule call sits on the tax line under Laws (PM ruling 8 Nov; it matches Heiko’s 7 Nov pick, overrule via the law ballot). Colony is read-only.'],
  ['D14', 'The table chat (C20) keeps its place in the rail on every tab: the seat row and the ticker under the rail’s content, the bubble in the head. Talk is where the threads and whispers are.'],
  ['D15', 'The cast: Brix is the human Governor (runs again in month 8), Kai the Sheriff and the caller, Ossa the AI seat and Land Baron, Lena the phone with no office. One table gives every state.'],
  ['D16', 'The colony picture is WS10’s rendered grounds, mounted exactly as the phone colony desk does: <Grounds colony={view.colony} size="phone" light={view.phase === \'upkeep\' ? \'dusk\' : \'day\'} /> (apps/web/src/components/Grounds.tsx; PM ruling 8 Nov, per WS10). The real buildings at their stage on their plate, lit by wealth; screens never draw buildings. It leads the Colony tab in the desk’s 212 px box, letterboxed on wider stages; Overview shows no colony picture (its map is the land, not the grounds).'],
  ['D17', '“This month” under Overview’s map is a fixed box, two lines of two, so the map is the same size whatever the needs or the month say (PM height check, 8 Nov; scripts/measure-needs.mjs). The figures never moved it (the Short row is one truncated line, 1 or 120); the row count did, through the box’s height: at 844 (A) 506 × 304 with nothing waiting, 312 × 187 with five rows. Now: nothing waiting is a quiet line; past four, three rows and “+N more” naming what waits behind it, which turns the box’s page.'],
];

/**
 * What reshaping the real hub touches, file by file (apps/web/src/phone/… unless named), with the slot or interface
 * change each needs, and its owner as the PM ruled (8 Nov): WS6 hub/*; WS4 named edits; WS7 hub/politics/**; WS8 Sheriff.
 */
const TOUCHES: [string, string, string][] = [
  ['WS6', 'hub/slots.ts', 'HubSlots → TabHubSlots (src/proposed/slots.ts): desks: DeskSlot[] becomes tabs: TabSlot[] + politicsTabs: SubTabSlot[]; new picks: PlotPickSlot[] (with ownBar for a pick that draws its own bar); MapToolSlot.desk dropped; stage holds ceremonies only; lines go to the “?” sheet; beneath unused on a phone. HubPlace becomes { tab, sub, tool, focus, pick }; goTo/settle take a Door. AgendaSlot and DeskDoor unchanged (desk ids translate through DESK_DOORS).'],
  ['WS6', 'hub/Hub.tsx', 'HubNav gains tab, sub, pick, open(door), startPick(id), endPick(); openDesk/pickTool kept and translated (DESK_DOORS). Hub draws the shell with tabs="left" | "bottom"; HubStage, DeskTabs, DeskGroup, AgendaRow, MapTools leave for hub/tabs/Overview.tsx; SituationStage for a ceremony only. New: the Now line as a door to a sub-tab that asks first; HelpSheet; export useHubIfAny (deals mock F-7).'],
  ['WS6', 'hub/today.tsx', 'HUB_SLOTS → TAB_SLOTS: four tabs; politicsTabs; tools with list relabelled “Sell” and Panel: MarketDesk; agenda adds DEALS_AGENDA, OVERRULE_AGENDA, NEEDS_AGENDA, drops the drone and list rows, GOVERNOR_AGENDA shown to the Governor only; picks: the Sheriff’s Guard; stage: the three reveals; nows/underNow/readyWords plus the overrule’s.'],
  ['WS6', 'hub/desks.tsx', 'ColonyDesk, ThisMonth, News stay (Colony tab). TalkDesk and ChatBadge are replaced by hub/tabs/Talk.tsx (TalkTab, TalkBadge; the thread fills the stage, not 240 px). MarketDesk becomes the Sell tool’s rail Panel; MarketStrip stays in it.'],
  ['WS6', 'hub/tools.tsx', 'Unchanged: Look, My plots, Geo drone and Sell keep their Map, Panel and Action; Overview mounts them.'],
  ['WS6', 'hub/ReadyBar.tsx, hub/ready.ts', 'Unchanged; the overrule’s ready words join readyWords (the budget mock).'],
  ['WS6', 'new: hub/tabs/{Overview, Politics, Colony, Talk}.tsx, hub/tabs/parts.tsx', 'The four tab bodies, the sub-tab row, TabBadge. Roadmap and NeedsStrip (hub/, unchanged) are mounted in the “?” sheet instead of the stage; a “Short 1 Energy” agenda row replaces the strip on the stage.'],
  ['WS4', 'phone/Shell.tsx', 'Named edit. PhoneShell gains, for the hub only, a tabs region with a position prop (tabs="left": a 56 px column at the stage’s left edge; tabs="bottom": a 44 px bar under the stage) and a head slot (PhaseLine + NowLine) in place of now/foldNow; the phase row drops “Month n / m” (it moves to PhaseLine). New exports PhaseLine, NowLine. FallbackBubble and TableChat under stay. Every other phase is unchanged.'],
  ['WS4', 'hub/Standings.tsx', 'Named edit. StandingsSheet stays behind “2nd of 4”, with the deals mock’s chip and + Deal; the Colony tab adds the league inline (hub/tabs/Colony.tsx).'],
  ['WS4', 'phone/parts.tsx::Chat', 'Named edit. The deals mock’s four changes (whisper target, rep chip, DealsInThread, + Deal) and the AI mark on the recipient chips; its fixed 240 px wrapper goes.'],
  ['WS4', 'index.css --rail', 'Named edit, none needed: the rail keeps clamp(232px, 31vw, 300px) in both tab positions; the tabs take their room from the stage.'],
  ['WS4', 'packages/ui/src/components/HoloMap.tsx', 'Named edit. MapTile.flag gains \'guard\', with FLAG_TONE (proposed bg-ok / text-void), FLAG_WORDS (“guarded”), the GUARD chip and a small-plot glyph. The mock draws it as an overlay in its GuardMap copy (DS-GAP).'],
  ['WS4', 'phone/Results.tsx, components/MonthEnd.tsx', 'From the deals and budget mocks, unchanged here: the phone month end’s broken list (BrokenCards, “phone”) under the league, and the full paid-out line (FundLines). The month end stays outside the tabs.'],
  ['WS7', 'hub/politics/slots.ts', 'COUNCIL_DESK and GOVERNOR_DESK become SubTabSlots: laws, budget, elections, sheriff (shown while a Sheriff holds office); first() on an open ballot. ELECTION_DAY_STAGE, COUNCIL_STAGE and the new OVERRULE_STAGE show for the ceremony/reveal only. OFFICES_BANNER moves to lines (the “?” sheet). GOVERNOR_AGENDA gains show(isGovernor).'],
  ['WS7', 'hub/politics/Council.tsx', 'CouncilDesk splits: LawsInForce + PendingLaw (export it) to Laws; CouncilBody (running, offices, results) to Elections.'],
  ['WS7', 'hub/politics/Governor.tsx', 'GovernorDesk (SalesTax + LawPicker) mounts in Laws unchanged; FrozenTax replaces SalesTax’s row while a call holds the tax (budget mock).'],
  ['WS7', 'hub/politics/Colony.tsx', 'ColonyWithFacts mounts in the Colony tab; its Grounds moves to the tab’s head (D16); Commission leaves for Budget’s Projects line (budget mock P12); the overrule call is not grafted into FundCard (it is in Laws, D13).'],
  ['WS7', 'hub/politics/Offices.tsx, LawBallot.tsx, ElectionDay.tsx', 'Bodies unchanged; Offices’ openDesk calls land through DESK_DOORS. CouncilRail and ElectionDayRail are used for the reveals only; during a ballot the rail keeps Now.'],
  ['WS8', 'the Sheriff sub-tab', 'WS8’s case file, variant B (politics-p2 at d0a52c1a, folded), unchanged, as the Sheriff sub-tab’s body; its “Post a guard on the map” calls startPick(\'guard\'); its GuardMap is the Guard pick’s Map (ownBar), and Done sends guard {tiles} and opens the Sheriff sub-tab again.'],
  ['unruled', 'phone/Planning.tsx', '<Hub slots={TAB_SLOTS} />. Not in the ownership ruling; one line.'],
  ['—', 'the laptop (from 1100 px)', 'The laptop gets the same tabs, wider (PM ruling 8 Nov; not drawn).'],
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

function StatePhone({ store, state, variant }: { store: MockTable; state: State; variant: ShellVariant }) {
  return <PhoneBody store={store} seat={state.seat} variant={variant} start={state.start} budget={state.budget} today={state.today} />;
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
  const variant = variantOf(state);
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
        <StatePhone store={store} state={state} variant={variant} />
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
        <a href="?" className="text-sm font-semibold text-holo" data-testid="to-prototype">
          ← The prototype: one planning month, played through
        </a>
        <p className="text-sm font-semibold text-ok" data-testid="approved">
          APPROVED by Heiko 8 Nov ~06:10Z; tabs: left column. This mock is the binding scaffold for the build; where Heiko made no pick, the PM’s defaults stand (budget steppers and bar as drawn, the laptop gets the same tabs, the 8 s break folds to news, the TV
          waiting box up to 3 seats).
        </p>
        <h1 className="font-display text-2xl font-semibold">The planning hub as tabs · design notes</h1>
        <p className="max-w-4xl text-sm text-ink-2">
          Heiko, 8 Nov: “I wouldn’t pack all of this in one screen. Make multiple screens.” The planning hub’s desks become four whole-stage tabs (Overview · Governor or Council · Colony · Talk), the explanation card hides behind a “?”, and
          the map gets the room. Month 5 at the politics table: Brix governs and raised the tax from 5% to 10%; Ossa · AI is the Land Baron; Kai is the Sheriff; Lena has two deal offers. Everything is clickable: the tabs, the tools, the doors in “This
          month”, the ballots, the composer. Every page links back here.
        </p>
      </header>
      <Section title="Height is the scarce side" id="height">
        <p className="max-w-4xl text-sm text-ink-2" data-testid="height-argument">
          The phone is played held sideways only, so its height is what runs out first: 375 px on the small phone, 390 on the large one. A bottom tab bar (B) spends 44 of those 375 px on every tab; a left column (A) spends 56 px of width instead, where the
          map, bound by the stage’s width at 667 either way, loses nothing B would not lose more of. The map’s drawn size, measured:
        </p>
        <Measurements />
        <p className="max-w-4xl text-xs text-ink-3">
          The map’s drawn box (MapFit’s), in CSS px, Lena’s phone with two offers waiting, Look on, each phone alone at its own viewport (scripts/measure.mjs), so the shell’s “short” packing applies as on the phone. Today at 667 the stage-top card is 108 px
          and the needs strip 45; at 844, 76 and 27. Heiko picks the position (PM ruling, 8 Nov); every state below, and every step of the prototype, shows both.
        </p>
      </Section>
      <Section title="WS8’s case file in the Sheriff sub-tab, measured" id="sheriff-measured">
        <table className="text-left text-sm" data-testid="sheriff-measured">
          <thead className="text-xs text-ink-3">
            <tr>
              <th className="py-1 pr-4 font-normal">Phone</th>
              <th className="py-1 pr-4 font-normal">Tabs</th>
              <th className="py-1 pr-4 font-normal">Sub-tab (w × visible h)</th>
              <th className="py-1 pr-4 font-normal">Folded</th>
              <th className="py-1 pr-4 font-normal">Fine case open</th>
            </tr>
          </thead>
          <tbody>
            {SHERIFF_MEASURED.map((m) => (
              <tr key={`${m.phone}-${m.tabs}`} className="border-t border-holo-line font-mono" data-testid={`sheriff-measured-${m.phone}-${m.tabs}`}>
                <td className="py-1.5 pr-4">{m.phone}</td>
                <td className="py-1.5 pr-4 font-sans">{m.tabs}</td>
                <td className="py-1.5 pr-4">
                  {m.width} × {m.visible}
                </td>
                <td className={cx('py-1.5 pr-4', m.folded <= m.visible ? 'text-ok' : 'text-warn')}>
                  {m.folded} {m.folded <= m.visible ? '· one screen' : `· ${m.folded - m.visible} px over`}
                </td>
                <td className="py-1.5 pr-4">{m.fineOpen} · scrolls, Fine on screen</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="max-w-4xl text-xs text-ink-3">
          WS8’s variant B folded (d0a52c1a): every case one 44 px row with its next step on a chip, opened in place one at a time. With the left column (A) it fits the sub-tab in one screen at both phones; the bottom bar (B) takes 40 px of its height, so
          folded it runs 23 px over at 667 and 8 px at 844. Opened, the fine case scrolls itself into view, its button on screen.
        </p>
      </Section>
      <Section title="The TV, measured (mock-hub-tv)" id="tv-measured">
        <table className="text-left text-sm" data-testid="tv-measured">
          <thead className="text-xs text-ink-3">
            <tr>
              <th className="py-1 pr-4 font-normal">State</th>
              <th className="py-1 pr-4 font-normal">Beat</th>
              <th className="py-1 pr-4 font-normal">2 seats</th>
              <th className="py-1 pr-4 font-normal">4 seats</th>
              <th className="py-1 pr-4 font-normal">6 seats</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(TV_FIT).map(([state, { beat, fit }]) => (
              <tr key={state} className="border-t border-holo-line font-mono" data-testid={`tv-measured-${state}`}>
                <td className="py-1.5 pr-4 font-sans">{state}</td>
                <td className="py-1.5 pr-4">{beat}</td>
                {([2, 4, 6] as const).map((n) => (
                  <td key={n} className={cx('py-1.5 pr-4', fit[n] >= TV_FLOOR ? 'text-ok' : 'text-warn')}>
                    {fit[n].toFixed(3)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="max-w-4xl text-xs text-ink-3">
          The TV&rsquo;s fit (TV-FIT) at 1280 × 720, the guided path&rsquo;s own worlds at 2, 4 and 6 seats; the floor is {TV_FLOOR} (rulebook #tv-fit), held by every state. Measured by mock-hub-tv (src/tv/measured.ts, which also keeps the superseded
          placement A and the moment-vs-steady reads). On the guided page at its default table (the fixture’s four seats, scripts/measure-guided.mjs), the half-size TV reads the same 4-seat fits beat by beat, lowest 0.708 at the month end; it sits beside
          the phone from a 1680 px window (at 1440 it wraps under the phone), and the whole page fits 1920 × 1080 with no scroll (at 1680 × 1050 only the step list runs 24 px past). What the TV shows at each focus:
        </p>
        <ul className="flex max-w-5xl flex-col gap-1 text-sm" data-testid="tv-notes">
          {(Object.entries(TV_NOTE) as [TvFocus, string][]).map(([focus, line]) => (
            <li key={focus} className="flex gap-3" data-testid={`tv-note-${focus}`}>
              <span className="w-32 shrink-0 font-mono text-holo">{focus}</span>
              <span className="text-ink-2">{line}</span>
            </li>
          ))}
        </ul>
      </Section>
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
            {TOUCHES.map(([owner, file, change]) => (
              <tr key={file} className="border-t border-holo-line align-top" data-testid={`touch-${file}`}>
                <td className="w-16 py-2 pr-3 font-mono text-xs font-bold">{owner}</td>
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
        <a href="?notes=1" className="text-sm font-semibold text-holo" data-testid="back-to-index">
          ← Design notes
        </a>
        <h1 className="font-display text-2xl font-semibold">{screen.title}</h1>
        <p className="font-mono text-xs text-ink-3">GRAFT TARGET: {screen.graft}</p>
      </header>
      <nav aria-label="State" className="flex flex-wrap gap-2">
        {screen.states.map((s) => (
          <a
            key={s.id}
            href={href({ screen: screen.id, state: s.id, ...(TABS_Q ? { tabs: TABS_Q } : {}) })}
            aria-current={s.id === state.id ? 'page' : undefined}
            className={cx('flex h-11 items-center rounded-control border px-4 text-sm font-semibold', s.id === state.id ? 'border-holo bg-holo-soft text-ink' : 'border-holo-line text-ink-2 hover:border-holo')}
            data-testid={`state-${s.id}`}
          >
            {s.label}
          </a>
        ))}
      </nav>
      {!state.today && (
        <nav aria-label="Tab position" className="flex flex-wrap items-center gap-2" data-testid="tabs-toggle">
          <span className="label-caps text-[10px]!">Tabs</span>
          {(['left', 'bottom'] as const).map((t) => (
            <a
              key={t}
              href={href({ screen: screen.id, state: state.id, tabs: t })}
              aria-current={(variantOf(state) === 'b') === (t === 'bottom') ? 'true' : undefined}
              className={cx('flex h-11 items-center rounded-control border px-4 text-sm font-semibold', (variantOf(state) === 'b') === (t === 'bottom') ? 'border-holo bg-holo-soft text-ink' : 'border-holo-line text-ink-2 hover:border-holo')}
              data-testid={`tabs-${t}`}
            >
              {t === 'left' ? 'A · left column' : 'B · bottom bar'}
            </a>
          ))}
        </nav>
      )}
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
      <StatePhone store={store} state={found[1]} variant={variantOf(found[1])} />
    </div>
  );
}

/** The guided prototype is the landing page; ?notes=1 the design notes (decisions, measurements, files); ?screen= a state. */
export default function App() {
  const screen = Q.get('screen');
  if (Q.has('notes')) return <Index />;
  if (!screen) return <Prototype />;
  return Q.has('solo') ? <Solo screenId={screen} stateId={Q.get('state')} /> : <StatePage screenId={screen} stateId={Q.get('state')} />;
}
