# WS8 · The event show in the game

Spec class **Programme** (Heiko, 29 Oct, "Yes, as recommended"). Goal gate passed 29 Oct (PM). Lane WS8, branch
`ws8-events`. Binding scaffold: the Living weather gallery, `design/mocks/ws8-events/` at **de9d6b7**, phone fixes at **522ebac4** (AM-1) (Heiko approved it
as the design to build, "Yes, all eight", 29 Oct). Read against trunk `feat/strategist` b3774fa (merged into
`ws8-events` at bb15a2b) and WS1's event contract on `ws1-events-roller` 605749d.

## §0 · Business Goals & Value

**G-1 · Every event that hits the colony plays its own story on the TV, where it happens, so the table sees what hit
them and enjoys it.** `[handoff]`
- Who benefits `[review-only]`: everyone at the table (Heiko's words: "I would like to see the event and the event ux
  and the cool event animations"; "make this really entertaining and all should get their animations").
- Today `[review-only]`: in the game only production events show, and only the first one: the TV and the phone read
  `events[0]` (`apps/web/src/table/TvProduction.tsx` line 12, `apps/web/src/phone/Production.tsx` line 17;
  verified_by: read). With WS1's wave 1 a month averages about 1.0 events in clean air and 2.0 in smog (WS1
  UBER-AC-1), so the second event of a phase plays nowhere. An event outside production (sickness in development)
  shows only as a status line. The off-map stories (pirate ship, store fire, riot mob…) exist only in the gallery.
- Value `[review-only]`: the game looks and feels like the approved gallery; and WS1's wave 1 can reach a table (its
  table gate waits on this surface: critical path).
- Proof, **UBER-AC-1**: in a seeded game where one phase fires two events, the TV plays both stories in the order fired,
  and each card of losses matches the engine's month report, plot by plot and figure by figure.

**G-2 · A player alone on a phone, with no TV, sees every event played on the phone itself.** `[handoff]`
- Who benefits `[review-only]`: the solo player, or a table with no TV (Heiko: "it could be that a player is playing
  alone on his phone. how would that look then for him").
- Today `[review-only]`: with no TV the phone shows the same light card as with one, for production's first event
  only; the player never sees the weather or a story (verified_by: read, same files).
- Value `[review-only]`: solo and TV-less play get the full event experience; nothing is lost without a TV.
- Proof, **UBER-AC-2**: with no board connected (`TableView.boards === 0`), each event plays on the phone (shorter, tap
  to skip, reduced motion honoured) and ends on "what it did to you"; with a board connected, the phone shows only the
  light card.

**Non-goals** `[review-only]`
- Any event rule, chance or effect (WS1's event model and wave 2; pirate raid and store fire rules are WS1's AM-4).
- Redesigning anything: the gallery is the design; an implementer never designs a screen.
- Sound and stingers; events beyond the catalogue's 35; directions A and C.
- The phase screens themselves (planning hub, development, auctions, election): the show plays over them.

**Rough cost** `[review-only]`: chosen approach about 2 PRs, 3-4 days of agent time (PR-1: wave 1 and the table gate;
PR-2: every other phase and the wave-2 stories as WS1's rows land). Thin baseline: about 1 day.

## §0.1 · Decision Record `[review-only]`

- **Chosen (2 PRs, 3-4 agent-days):** the gallery's engine becomes one module, `packages/ui/src/events/**`, a pure
  function of the clock like the production show. Production hands its event segment to it (PR-1); one overlay on the
  TV and one on the phone play it over any other phase (PR-2). The server owns every length (EVENT_SHOW) and sends it
  in the view, so the clock it holds and the animation the screens play cannot disagree.
- **Thin baseline (about 1 day):** keep WS6's production show, loop its event layer over every event instead of
  `events[0]`, and a text card for other phases. **Loses because** the show's layers know 9 kinds only
  (`packages/ui/src/components/ProductionMap.tsx::EventKind`: storm, drought, flare, comet, flood, quake, blight, fire,
  bounty), none of which is a ship, a store or a mob, and Heiko approved the gallery's stories as the design; and its
  event window is a fixed 4.8 s (`SHOW.eventAt` 4.8 to `SHOW.flyStart` 9.6), too short for two stories.
- **Rejected middle:** a per-screen queue that plays each event once and acknowledges it. Loses because a phone that
  reconnects mid-show would replay or miss events; deriving the show from the server's clock (as the production show
  already does with `showTime`) needs no state on the client.

## §0.2 · Constraints `[handoff]`

```
HC-1  Build the screens FROM the gallery's files (design/mocks/ws8-events/src at de9d6b7): same layout, same
      motion, same copy, same data-testids. Never design a screen; a gap goes to WS8, not into the code.
                                                    source: Heiko's approval, 29 Oct     breach: fatal
HC-2  The engine stays pure: no Date.now(), no Math.random(), no I/O in packages/engine. EVENT_SHOW is numbers only.
                                                    source: CLAUDE.md                     breach: fatal
HC-3  Every show length comes from EVENT_SHOW through the view. No client computes a length the server did not send.
                                                    source: PM ruling, 29 Oct             breach: fatal
HC-4  While a show plays in a timed phase, nobody acts in it, human or AI; the hold is capped; untimed phases are not
      held; the sim (no clock) stays byte-identical.
                                                    source: PM ruling (a)-(d), 29 Oct     breach: fatal
HC-5  Edits in other lanes' files are the named edits of §9 only; the owner reviews them on our SHAs.
                                                    source: PM ruling, 29 Oct; SEAMS      breach: needs a decision
HC-6  Reduced motion is honoured on every screen: no camera, no shake; the result is still shown.
                                                    source: the gallery's principles      breach: fatal
```

## §1 · Solution Design `[handoff]`

PR-1 is C1-C7 (wave 1: every event fires in production, WS1's table gate). PR-2 is C8-C12 (every other phase and the
wave-2 stories, after WS1's wave-2 rows and `effects[]` land).

Reuse checks (self-review check 6), grep in packages/ and apps/ at bb15a2b: `EVENT_SHOW|playMs|rollCall` → nothing; the
nearest neighbours are `PHASES` (phase lengths, config.ts) and `SHOW` (the production show's timeline) — C1 sits beside
PHASES and C5 extends SHOW instead of replacing it. `EventLayer|EventCard` → ProductionMap.tsx only (9 kinds, one event):
C4 replaces its use, not its file. `ShellLayer` → phone/Shell.tsx: C10 reuses it. `ProductionEventView` → protocol:
C8 extracts EventView from it rather than adding a second shape.

```
C1 · ADDED · the show's lengths live in one config block

today        no event length exists anywhere but the production show's fixed timeline
             (packages/ui/src/components/ProductionMap.tsx::SHOW: eventAt 4.8 s, flyStart 9.6 s, end 15 s)
             verified_by: read
tomorrow     MUST: EVENT_SHOW holds each event's weight (headline | spotlight | bulletin) by key, the play length
             per weight in ms, the production show's existing event window (4 800 ms), and the hold's cap.
             MUST: numbers only, no logic.
logic        → §2 RULE-1
seam         packages/engine/src/config.ts — a new EVENT_SHOW block (WS8's block, PM ruling)
senior       junior would: hard-code lengths in the screens and again in the server · senior does: one block both
             read, the server sending each event's length in the view (HC-3), so the hold and the animation agree
mechanism    sprout
call sites   new; read by C2 (server) only — the client reads the lengths from the view
pin          none, because it is new
depends_on   —
```

```
C2 · MODIFIED · production runs long enough to play every event

today        the production phase lasts PHASES.productionMs × phaseScale whatever fired
             anchors: apps/server/src/mule-game.ts::startPhaseTimer, apps/server/src/mule-game.ts::PHASE_MS,
             packages/engine/src/config.ts::PHASES (productionMs 15 000)    verified_by: read
tomorrow     MUST: production lasts its base length plus the events' extra time (RULE-1), never more than the cap.
             MUST: a quiet month lasts exactly as today (AM-4: every wave-1 event plays longer than the 4.8 s window).
logic        → §2 RULE-1 · evaluated_at: entering production (runProduction has already run in advancePhase, so
             the month report holds the events) · writes: phaseEndsAt, productionMs
seam         mule-game.ts::startPhaseTimer — the one place production's length is set (productionMs feeds the view)
senior       junior would: raise PHASES.productionMs for everyone · senior does: extends only the months that need
             it, and keeps the quiet month byte-for-byte (the production-view and phase-scale tests)
mechanism    in_place
call sites   startPhaseTimer ← enterPhase, and the election tick when planning opens after an election (mule-game.ts,
             both with phase planning there; only enterPhase reaches production)
pin          apps/server/test/production-view.test.ts and apps/server/test/phase-scale.test.ts stay green unchanged
depends_on   C1 (data)
atomicity    ships with C3: the view's lengthMs and playMs must come from the same computation
```

```
C3 · MODIFIED · the production view carries every event with its phase, weight and length

today        productionView maps report.events to { key, kind, title, line, sign, scope, origin, from?, hits }
             anchors: apps/server/src/mule-game.ts::productionView, packages/protocol/src/index.ts::ProductionEventView
             verified_by: read
tomorrow     MUST: each event also carries phase, weight and playMs (from C1), in the order fired; MUST: the view's
             lengthMs is the length C2 set; SHOULD: nothing else changes in the view
seam         productionView (WS3's file, named edit) + ProductionEventView (WS3's protocol, named edit)
senior       junior would: let the client look the weight up in its own table · senior does: sends it, so a key the
             client does not know still plays at the right length (HC-3)
mechanism    in_place
call sites   productionView ← MuleGame view builder (mule-game.ts, the `production:` field); ProductionEventView ←
             ProductionView, TvProduction, phone Production, ProductionMap's ShowEvent (structural)
pin          production-view.test.ts fixtures gain the three fields (WS6 reviews); existing assertions unchanged
depends_on   C1 (data)
```

```
C4 · ADDED · the show module: the gallery's engine as a package

today        none_exists in packages/ui; the engine lives only in the mock (design/mocks/ws8-events/src: living.tsx,
             events.ts, story.ts, scene.tsx, stories.tsx, stories-plots.tsx, vignettes.tsx, glyphs.tsx, copy.ts,
             catalogue.ts, fx.tsx, phone.tsx)    verified_by: read
tomorrow     MUST: a pure function of the show clock t (as ProductionMap is); MUST: plays an ordered list of events,
             each in its own segment of the length the view gave it; MUST: draws over HoloMap, the map the
             production show already uses; MUST: holds the wave-1 events' looks and stories in PR-1 (dust storm,
             drought, acid rain, solar flare, comet pass, flood, volcanic ash, pest swarm, wildfire, bumper harvest)
             and the rest in PR-2 (C12); MUST: two sizes, TV and phone; MUST: reduced motion (HC-6)
seam         new: packages/ui/src/events/** (WS8 sole owner, §9), exported from packages/ui/src/index.ts
senior       junior would: rewrite the animations from screenshots · senior does: grafts the mock's files (they are
             real React on the same @mule/ui tokens), replacing only the mock's fixtures, its show-clock context and
             its borrowed PlotMap with the view, the caller's t and HoloMap
mechanism    fill_scaffold
call sites   new; called by ProductionMap (C5), TvProduction (C6), phone Production (C7); in PR-2 by C10
ux           design/mocks/ws8-events · routes #event-<key> and #event-<key>/phone, #together-<id>[/phone] ·
             states: with TV, phone only, reduced motion, several events in one phase · fixtures to replace:
             scenarios.ts, fixture.ts, stage.tsx's useShow · GRAFT TARGET: new: packages/ui/src/events/**
depends_on   C3 (contract, stubbable with fixture views)
```

```
C5 · MODIFIED · the production show plays every event, in fired order

today        ProductionMap takes events[0] only, plays it in the fixed window SHOW.eventAt..SHOW.flyStart, and a
             plot's final units add that one event's delta
             anchors: packages/ui/src/components/ProductionMap.tsx::ProductionMap, ::finalUnits, ::landed, ::showTime,
             ::SHOW, ::hitAt    verified_by: read
tomorrow     MUST: the event window grows to the events' total (RULE-1), and the goods fly after it; MUST: each event
             plays in turn through C4; MUST: a plot's final units add every event's delta in order, never below 0
             (AM-2); MUST: a quiet month's timeline is unchanged
logic        → §2 RULE-1, RULE-2
seam         ProductionMap.tsx (WS6's file, named edit) — the show's timeline and its event layer
senior       junior would: loop the old EventLayer · senior does: one timeline from the view's playMs, every reader
             of events[0] (ProductionMap's render, finalUnits, landed, harvest) moved together
mechanism    in_place
call sites   ProductionMap ← TvProduction, phone Production; finalUnits/landed/harvest/landing ← TvProduction,
             phone Production, ProductionMap's PlotBars; showTime ← TvProduction, phone Production
pin          a quiet month's frames (no events): apps/web/test/production-show.test.ts and the e2e production
             step stay green unchanged
depends_on   C3 (contract), C4
atomicity    ships with C6 and C7: they read the same timeline
```

```
C6 · MODIFIED · the TV's production screen shows each event's card as it plays

today        TvProduction shows one EventCard for events[0] and one line ("<title>: watch the map.")
             anchors: apps/web/src/table/TvProduction.tsx::TvProduction    verified_by: read
tomorrow     MUST: the card and the line follow the event that is playing, then its card of losses (the gallery's
             title card and effects card); MUST: the colony bar's chips as the gallery shows them
seam         TvProduction.tsx (WS6's file, named edit; sync with WS6's #139 first)
mechanism    in_place
call sites   TvProduction ← TableApp.tsx::TvGame (production branch)
ux           design/mocks/ws8-events · #event-dustStorm, #together-tg-storm (TV) · GRAFT TARGET: TvProduction.tsx
pin          the colony bar's landing (landed/landing) unchanged for a quiet month
depends_on   C5
```

```
C7 · MODIFIED · the phone plays the show itself when no TV is in the room

today        phone Production shows EventCard(events[0]) and one "what it did to you" line, TV or no TV
             anchors: apps/web/src/phone/Production.tsx::Production, ::eventOnYou    verified_by: read
tomorrow     MUST: with a board connected (TableView.boards > 0), the light card for each event as it plays, with a
             buzz and what it did to you; MUST: with none (boards === 0), the phone plays each event on its own map
             (shorter, the gallery's solo beat), a tap skips to the result, reduced motion honoured; MUST: the
             harvest strip unchanged; MUST: landscape at 844×390 and at 667×375, inside WS6's landscape phone
             shell: the show fills the shell's map box, the cards its rail (AM-1)
logic        → §2 RULE-3
seam         phone/Production.tsx (WS6's file, named edit); the table view from phone/game.tsx::usePhoneGame
senior       junior would: invent a "solo mode" flag · senior does: reads the count WS4's lobby already reads
             (apps/web/src/phone/Lobby.tsx, `view.boards > 0`), as the PM ruled
mechanism    in_place
call sites   Production ← phone/PhoneApp.tsx (production branch)
ux           design/mocks/ws8-events at 522ebac4 (landscape, AM-1) · #event-<key>/phone (phone only), #event-<key>
             (Lena's phone with a TV) · sizes 844×390 and 667×375 · GRAFT TARGET: phone/Production.tsx
pin          the harvest list (data-testid="harvest") unchanged
depends_on   C5
```

```
C8 · ADDED · the view carries the events of every phase (PR-2)

today        only production has a view of its events (productionView); MonthReport.events outside production
             reaches no screen    anchors: apps/server/src/mule-game.ts::productionView    verified_by: read
tomorrow     MUST: MuleView carries the current phase's events, in fired order, with phase, weight, playMs, the
             server time the show starts, and (from WS1's wave 2) effects, becomes, muleLost, pending; MUST: empty
             when nothing fired
seam         packages/protocol/src/index.ts::MuleView + a new EventView (WS3, named edit); built in mule-game.ts
             (WS3, named edit) beside productionView
senior       junior would: a second event shape beside ProductionEventView · senior does: one EventView that
             ProductionEventView becomes, so production and every other phase read one shape
mechanism    extract_interface
call sites   MuleView ← every screen through useClient; the builder ← MuleGame's view method
depends_on   WS1's wave-2 rows and MonthEvent.effects (data, not stubbable for the stories; stubbable for the view)
```

```
C9 · MODIFIED · a timed phase holds while its events play (PR-2)

today        enterPhase starts each phase's clocks (startPhaseTimer, scheduleAuctionTick, scheduleGrantTick,
             startDevelopment) at once; AI hands tick from then
             anchors: apps/server/src/mule-game.ts::enterPhase, ::startPhaseTimer    verified_by: read
tomorrow     MUST: in a timed phase whose events fired, the phase's clocks start after the hold; MUST: during the
             hold no intent is applied, human or AI (a RuleError for a human); MUST: the hold is capped; MUST: an
             untimed phase is not held
logic        → §2 RULE-4
seam         enterPhase (WS3's file, named edit) — the one place every phase's clocks start
senior       junior would: pause the timer but leave AI hands ticking · senior does: holds the start of every clock,
             so an AI cannot press while people watch (the PM's rule (a))
mechanism    wrap
call sites   enterPhase ← nextPhase, start (mule-game.ts)
pin          apps/server/test/mule-game.test.ts and phase-scale.test.ts green unchanged for a phase with no events;
             the sim byte-identical (it never builds a MuleGame)
depends_on   C1, C8
```

```
C10 · ADDED · one overlay on the TV and one on the phone play events over any phase (PR-2)

today        none_exists: TableApp and PhoneApp render the phase screen only
             anchors: apps/web/src/table/TableApp.tsx::TvGame, apps/web/src/phone/PhoneApp.tsx    verified_by: read
tomorrow     MUST: while the view's events are playing (server time inside their show), the TV overlay plays them
             over the phase screen; the phone shows the light card with a TV and plays them itself without one
             (RULE-3); MUST: production keeps its own show (C5) and the overlay stays out of it
seam         new: apps/web/src/events/** (WS8); one mount line in TableApp.tsx::TvGame and one in PhoneApp.tsx,
             beside EmoteBubbles in the shell's layer (apps/web/src/phone/Shell.tsx::ShellLayer) (WS4, named)
senior       junior would: wrap every phase screen · senior does: one layer each, the phone through the ShellLayer slot
             the shell already draws on every screen, so no phase screen is edited
mechanism    sprout
call sites   new
ux           design/mocks/ws8-events · #together-tg-auction[/phone], #event-pirateRaid[/phone] · GRAFT TARGET: new:
             apps/web/src/events/**
depends_on   C4, C8
```

```
C11 · MODIFIED · sickness is told in development's roll call (PR-2)

today        a sick player sees a status line on its own phone (phone/Develop.tsx, data-testid="sick-st…"); the TV and
             the other phones say nothing    anchors: apps/web/src/phone/Develop.tsx (read only)    verified_by: read
tomorrow     MUST: when players fall sick at development's start, the roll call plays each as a bulletin (the
             gallery's sneeze), on the TV and each phone; MUST: the status line stays
seam         C8's view lists them as bulletin events built from Player.sick and playerEventReason (WS1: sickness
             stays on Player.sick in wave 1)
mechanism    in_place
depends_on   C8, C10
```

```
C12 · ADDED · the wave-2 stories (PR-2)

today        the stories exist only in the gallery (stories.tsx, stories-plots.tsx, vignettes.tsx)
tomorrow     MUST: each wave-2 event plays the gallery's story as its row lands (pirate raid, store fire, riot and the
             rest): built in packages/ui/src/events/** from the mock's files, keyed by EventKey
seam         packages/ui/src/events/** (C4's module)
mechanism    fill_scaffold
ux           design/mocks/ws8-events · #event-<key>[/phone] for each · GRAFT TARGET: packages/ui/src/events/**
depends_on   WS1's wave-2 rows (data, not stubbable for a merge), C4
```

## §2 · The Logic `[handoff]`

```
RULE-1 · How long the events play, and how long production runs          shape: formula

inputs
  events     the month report's events of this phase, in fired order (MonthReport.events filtered by phase)
  weight(e)  EVENT_SHOW.weight[e.key]; a key missing from the table plays as a headline
  play(e)    EVENT_SHOW.playMs[weight(e)]   (bulletins of one phase share ONE roll call: EVENT_SHOW.rollCallMs)
  cap        EVENT_SHOW.capMs
  window     EVENT_SHOW.productionWindowMs = 4 800 (SHOW.flyStart − SHOW.eventAt, today's event window)

formula
  showMs      = min(cap, Σ play(e) over headlines and spotlights + (rollCallMs if any bulletin))
  production  = (PHASES.productionMs + max(0, showMs − window)) × phaseScale
  each event's playMs in the view = its share of showMs (play(e), cut in proportion when the cap bites)

unknown
  no events → showMs 0, production exactly PHASES.productionMs × phaseScale (today).
  a key with no weight → a headline: an event must never play shorter than its story because the table forgot it.

examples                                                     → §6
  no events → 15 000 ms · one dust storm → 15 000 + (7 000 − 4 800) = 17 200 ms (AM-4)
  drought + pest swarm → 15 000 + (their sum − 4 800) · five headlines → capped at cap
```

```
RULE-2 · A plot's units through the show                                    shape: sequence

1  before the event window: the plot's `made` (unchanged)
2  as each event reaches it, in fired order: add that event's delta for the plot (AM-2: worked on the output the
   earlier events left; a delta of 0 still counts as reached)
3  never below 0
4  the goods fly with the final units after the window
example  a Food plot making 1, a drought −1 then acid rain 0 → 1, 0, 0; flies 0
```

```
RULE-3 · What a phone shows for an event                                    shape: decision table

inputs   boards: TableView.boards (number ≥ 0) · reduced: the device's reduced-motion setting · skipped: the player
         tapped skip during this phase's show

  #   when                    then
  1   boards > 0              the light card per event as it plays, a buzz, "what it did to you"
  2   boards = 0, skipped     the result: the card of what it did to you, for every event of the show
  3   boards = 0, reduced     the phone's show without camera or shake, cards and figures as in 4
  4   boards = 0              the phone plays each event on its own map at the solo beat, then the result

unknown  boards is never absent in a TableView; a phone that has no table view yet shows nothing (it is not in a game)
examples → §6: TV in the room → card only · alone → the show · alone and tap → result · alone, reduced → no camera
```

```
RULE-4 · The hold in a phase that fired events (PR-2; PM ruling (a)-(d))    shape: decision table

inputs   timed: the phase has a clock (PHASE_MS not null, or the auction's/land auction's own clocks) ·
         showMs from RULE-1 · now: the server clock

  #   when                          then
  1   not timed (planning)          no hold; the events play over the phase while people act   — rule (c)
  2   timed, showMs = 0             no hold (today)
  3   timed, showMs > 0             every clock of the phase starts at now + showMs; until then every intent is
                                    refused (a human gets RuleError "The event is still playing"; an AI hand does
                                    not tick)                                                   — rule (a)
boundaries   showMs ≤ EVENT_SHOW.capMs by RULE-1                                                 — rule (b)
             production's events are not held this way: production's length grows instead (RULE-1)
             the sim builds no MuleGame and has no clock: its output is byte-identical         — rule (d)
examples → §6: an AI press during the auction's show is refused · five events hold only the cap · planning not held
```

## §3 · Contracts & Data Models `[handoff]`

- **EVENT_SHOW** (`packages/engine/src/config.ts`) · ADDED · not breaking · C1. Shape:
  `{ weight: Partial<Record<EventKey, 'headline' | 'spotlight' | 'bulletin'>>, playMs: { headline, spotlight },
  rollCallMs, productionWindowMs: 4_800, capMs }`. Values from the gallery's beats (story lengths plus intro, announce,
  settle and outro at the TV's pace); WS8 owns the block.
- **ProductionEventView** (`packages/protocol/src/index.ts`) · MODIFIED · not breaking (fields added) · C3. Adds
  `phase: Phase`, `weight`, `playMs: number`. Example: `{ key: 'drought', …, phase: 'production', weight: 'headline',
  playMs: 6400, hits: [...] }`.
- **EventView, MuleView.events** · ADDED · not breaking · C8 (PR-2). ProductionEventView becomes EventView; adds
  `startsAt` (server ms the show starts), and from WS1's wave 2 `effects?`, `hits[].becomes?`, `hits[].muleLost?`,
  `hits[].pending?` (shapes agreed with WS1, 29 Oct, as in the gallery's `events.ts::Effect` and `Hit`).
- **MonthEvent.when** · REMOVED by WS1 (its named edit; screens read `phase`). Not ours; listed so nothing reads it.

## §4 · Failure & Ops `[handoff]`

| Question | |
|---|---|
| Dependency unavailable? | No external dependency: in-process. A phone that drops and reconnects mid-show derives the show time from the server clock (`showTime`, `phaseEndsAt`, `startsAt`) and joins where the TV is (C5, C7, C10). |
| Retry / poison / page? | Not applicable: no remote call. A human intent during a hold gets a RuleError, which the server already turns into a message (C9). |
| Idempotency? | The show is a pure function of the view and the clock; replaying a view replays the same frames. |
| What can race? | An intent arriving as the hold ends: the server's own clock decides (one `ctx.schedule` starts the phase); the AI hands start in that same callback (C9). |
| What still works when this is broken? | The phase screens and the clocks: if the show throws, the screen under it still renders (an error boundary around the overlay and the event layer, C5, C10). |
| How does an operator know it works? | The month report's events are in the view (C3, C8); the TV shows `data-event=<key>` on the map while each plays. |

## §5 · Delivery `[handoff]`

Code-only; no existing state to reach. Games in progress pick up the new lengths at the next phase entry.

## §6 · Acceptance Criteria `[handoff]`

| AC | Given / when / then | observed_at | negative | changes |
|---|---|---|---|---|
| B-AC-1 (G-1) | Given a production month where a drought then a pest swarm fired, when the TV plays production, then both stories play in that order and each card of losses lists the report's plots and figures | the TV production screen (TvProduction rendered from a fixture view, the mock's data-testids) | a quiet month shows no event card | C4, C5, C6 |
| B-AC-2 (G-2) | Given no board is connected, when production plays, then each event plays on the phone's own map, a tap skips to the result, and the result says what it did to you | phone Production rendered with boards 0 | with boards 1 the phone shows only the light card | C7 |
| B-AC-3 (G-1, PR-2) | Given a goods auction month where pirates raid, when the auction opens, then the TV plays the pirate ship before trading opens and nobody can bid until it ends | the TV overlay and the server's refusal of a bid | an auction with no event opens at once | C8, C9, C10, C12 |
| B-AC-4 (G-2, PR-2) | Given no board, when a store fire fires in the auction, then the phone plays the store fire itself; with a board, the light card | phone overlay | — | C10, C12 |
| T-AC-1 (serves B-AC-1) | RULE-1's examples: no events → 15 000 ms; one dust storm → 17 200 ms; drought + pest swarm → 15 000 + (sum − 4 800); five headlines → the cap; × phaseScale | `MuleGame`'s view: `phaseEndsAt − now` and `production.lengthMs` | a phase other than production is not lengthened by this rule | C1, C2 |
| T-AC-2 (serves B-AC-1) | The production view lists every event of the month in fired order with phase, weight and playMs | `apps/server/test/events-view.test.ts` on `MuleGame`'s view | a month with no events lists none | C3 |
| T-AC-3 (serves B-AC-1) | RULE-2: a plot's units add every event's delta in order, never below 0; landed/harvest match | ProductionMap's exported `finalUnits`/`landed` and the rendered bars | a plot no event reached keeps `made` | C5 |
| T-AC-4 (serves B-AC-1) | At a time inside event i's segment the map shows event i (`data-event`), and the goods fly only after the last | rendered ProductionMap | quiet month: timeline as today | C5 |
| T-AC-5 (serves B-AC-2) | RULE-3's four rows, inside the shell at 844×390, 667×375 and 844 with a 47 px safe area (AM-1, AM-2) | rendered phone Production (boards 0/1, reduced on/off, a tap) | — | C7 |
| T-AC-6 (serves B-AC-1, B-AC-2) | The screens keep the gallery's data-testids for the views they graft (render gate against the mock) | `review-loop/render-gate.mjs`, mock vs build | — | C4, C6, C7 |
| T-AC-7 (serves B-AC-3) | RULE-4 row 3: an AI hand's press during the auction's show is not applied; a human's bid gets RuleError | `MuleGame` with a fake context | after the hold, the same press applies | C9 |
| T-AC-8 (serves B-AC-3) | RULE-4: five events hold only `capMs`; planning is not held | `MuleGame` clocks | — | C9 |
| T-AC-9 (serves B-AC-1, B-AC-3) | The sim's output (CI's run: `pnpm sim -- --games 4 --players 4`) is byte-identical before and after | the sim's printed report | — | C1, C9 |
| T-AC-10 (serves B-AC-3, B-AC-4) | The view carries the phase's events with startsAt, and effects as WS1 emits them | `events-view.test.ts` | a phase with no events: empty | C8, C11 |

Invariant (every test): a screen never shows a figure the month report does not hold.

## §7 · Risks & Spikes `[review-only]`

- **R-1 · WS1's Task 6 has not landed:** today's report holds one production event. Mitigation: PR-1 builds against
  fixture views (two and five events) and grafts onto the real report when WS1 says Task 6 is in; T-AC-1/2 re-run then.
- **R-2 · WS6's #139 touches TvProduction:** Mitigation: sync with trunk after #139 merges, before C6's edit (PM).
- **R-3 · The stories at phone size (landscape 844×390 and 667×375, AM-1):** at 667×375 a fixed 268 px rail leaves the
  map about 370 px wide. Checked in the gallery at both sizes (AM-1): readable, two collisions fixed at 522ebac4. The
  rail's width is WS6's shell's. Mitigation: the show sizes to the map box it is given, never a fixed width; T-AC-5 and
  T-AC-6 run at both sizes; screenshots at both reviewed by WS8 before the PR.
- **R-4 · Frame cost on the TV:** many layers redraw each frame. Mitigation: reuse `frameMs`/`useServerNow` as the
  production show does; the painted map renders once (`useMemo`, as ProductionMap does).
- **R-5 · EventKey has 10 keys (11 with cavern collapse), the gallery 35:** Mitigation: the module is keyed by
  `EventKey`; PR-1 builds the wave-1 keys, C12 adds each wave-2 key with its row; RULE-1's unknown line covers a key
  with no weight.
- **R-6 · Ownership by documentation only** (§9): no CODEOWNERS in the repo. Debt recorded here; the PM's SEAMS table and
  owner reviews are the enforcement.
- No spike needed: the gallery is the measured prototype (86 pages, scrubbed, 0 errors at de9d6b7).

## §8 · Amendments `[review-only]`

```
AM-1 · 2026-10-28 · lead · before PR-1 (the PM's check: the phone is landscape-only, 844×390 and the small 667×375)

target    §1 C7 (tomorrow, ux), §1 C10's phone part, §2 RULE-3, §6 T-AC-5, §7 R-3
said      phone sizes unstated, except R-3's 844×390. No phone scene was designed upright: the gallery's phone frame is
          844×390 landscape, as the product's phone is (PhoneApp is landscape-only, TurnSideways; the e2e harness's
          PHONE is 844×390). This amendment adds the small size and its two fixes.
did       the phone parts are landscape: 844×390 (reference) and 667×375 (small). C7 and C10's phone overlay render
          inside WS6's landscape phone shell: the show fills the shell's map box, the light card and the result its
          rail; nothing in the show has a fixed width. Checked the gallery at both sizes (frame pinned to the
          viewport, every phone-only page scrubbed): the light card fits both (#together-tg-auction); the phone-alone
          show fits 844×390; at 667×375 the skip hint covered the story panels, and the store fire's storage panel
          stayed under the card of losses (at both sizes). Fixed in the gallery at 522ebac4: the hint moves to the
          rail's foot (the whole map stays the tap target, data-testid="skip"; the hint is "skip-hint"), and story
          panels leave at their story's reveal. 43 phone-only pages, 0 console errors at 667×375.
because   the small landscape size (667×375) was never checked; G-2: a player alone on a phone sees every event on the phone itself, on the
          phones the game runs on
goal      G-2 (unchanged)
folded    C7 tomorrow + ux (scaffold 522ebac4) · R-3 rewritten · T-AC-5 runs at both sizes · the shell's frame is
          coordinated with WS6 (its rail width sets the map box)
```

```
AM-2 · 2026-10-28 · lead · before PR-1 (WS6's answer on the shell's frame; trunk e9fdc6b)

target    §1 C7, C10 (phone), §6 T-AC-5, §7 R-3
said      the show fills "the shell's map box"; sizes not pinned; the gallery's rail is 268 px
did       the frame is WS6's approved landscape shell (its PR-7), read in code: the rail is `--rail: clamp(232px, 31vw,
          300px)` (apps/web/src/index.css), 400 px from a 1 100 px shell (phone/Shell.tsx); the stage
          (`main[data-testid=stage]`) takes the rest, padded 10 px. So the show's box is about 562×370 at 844×390
          (rail 261.6) and about 415×355 at 667×375 (rail 232, not the gallery's 268: more map than the gallery
          showed). A notched phone held sideways loses about 47 px of stage width to the safe area. No header crosses
          the stage: phase, clock and money sit at the top of the rail. The light card and the result go in the rail
          (the shell's `rail` prop); the skip hint at the rail's foot; the whole stage is the tap target. Outside
          production the overlay mounts in ShellLayer beside EmoteBubbles and keeps clear of the rail with `--rail`,
          as the emotes do.
because   G-2: the show must fit the phones the game runs on, in the shell they run in
goal      G-2 (unchanged)
folded    T-AC-5 runs in the shell at 844×390 and 667×375 (and 844 with a 47 px safe area); R-3: the gallery's 268 px
          rail was the tighter case, so its 667 check stands
```

```
AM-3 · 2026-10-28 · lead · PR-1 Task 1 (codebase drift: the trunk base, ws8-show-pr1 @ 979875a2)

target    §1 C3, §6 T-AC-1/T-AC-2, §7 R-1
said      C3 copies MonthEvent.phase into the view; the report holds several events a phase
did       on the trunk base MonthEvent has no `phase` (it still has `when: 'afterProduction'`), and runProduction
          returns at most one event (packages/engine/src/production.ts, `events: event ? [event] : []`); WS1's
          contract (phase, several events) is on ws1-events, not yet in the trunk. So PR-1's view sets `phase` from
          the phase it shows (production), and T-AC-1/T-AC-2 arrange several events by setting the pushed month
          report's events in the test (a seed cannot produce two today). The graft onto WS1's real report (R-1)
          happens when ws1-events reaches the trunk: then the view reads MonthEvent.phase and T-AC-1/2 re-run on a
          real two-event month.
because   G-1: the TV must play every event the report holds; PR-1 cannot wait for WS1's merge, and must not merge
          WS1's unmerged branch into ours
goal      G-1 (unchanged)
folded    C3 reads as above for PR-1; R-1's graft stays a PR-1 merge-gate line (already in the plan)
```

```
AM-4 · 2026-10-28 · lead · PR-1 Task 1 (a false example, found by the implementer)

target    §2 RULE-1 examples, §1 C2 tomorrow, §6 T-AC-1
said      "one dust storm (≤ window) → 15 000 ms"; "a month whose events fit the 4.8 s window lasts as today"
did       the formula stands; the example was wrong: a headline plays 7 000 ms (C1's values), longer than the 4 800 ms
          window, so one dust storm gives 17 200 ms. No wave-1 event fits the window (headline 7 000, spotlight 5 200),
          so only a quiet month lasts exactly as today. That is what Heiko approved ("production grows only in months
          with events; quiet months unchanged").
because   G-1: each event plays its whole story; shrinking stories to fit the old window would cut them
goal      G-1 (unchanged)
folded    RULE-1 example, C2 tomorrow and T-AC-1 now say 17 200 for one dust storm
```

## §9 · Ownership Boundaries `[handoff]`

### Ownership: the event show
- Sole owner: WS8 — `packages/ui/src/events/**` (+ `events.css`), `apps/web/src/events/**`, the `EVENT_SHOW` block in
  `packages/engine/src/config.ts`, `apps/server/test/events-view.test.ts` (WS3 reviews), `apps/web/test/events-*.test.tsx`,
  `packages/ui/test/events*.test.ts`, `apps/web/e2e/events.ts` (the browser step; local tier), this spec and its plan (PM
  rulings).
- Read contract: the view (`ProductionEventView` → `EventView`, `MuleView.events`); `EVENT_SHOW` read by the server only.
- Write contract: named edits only, each reviewed by its owner on WS8's SHAs — WS4: `packages/ui/src/index.ts` (export),
  `packages/ui/src/theme.css` (@import), `apps/web/src/table/TableApp.tsx`, `apps/web/src/phone/PhoneApp.tsx` (one line
  each); WS3: `packages/protocol/src/index.ts`, `apps/server/src/mule-game.ts`; WS6: `ProductionMap.tsx`,
  `TvProduction.tsx`, `phone/Production.tsx`, `apps/server/test/production-view.test.ts`.
- Enforcement: `.handover/SEAMS.md` (PM-owned) and owner review on every PR; no CODEOWNERS (debt, §7 R-6).
