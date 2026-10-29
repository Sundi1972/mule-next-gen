# WS1 · The event model: every event on its own dice

**Status:** goal gate passed (PM, 28 Oct): §0 as written; the measured spread and the air finding go to Heiko as
information. Next: the plan. Input: Heiko's approved **M.U.L.E. Event Catalogue** (Claude Doc, project
96559f00-c6d7-41f2-8d1b-bc911b9383fc, rev 16, 28 Oct 2026; the meteor strike added the same day) and his four rulings
of 28 Oct on its decisions: (1) keep the catalogue's amount; (2) own pollution counts per air point; (3) build wave 1,
then wave 2, then G-5, then Later; (4) the catch-up lean, bad events weighted toward the richest and good ones toward
the poorest. **Owner:** WS1 (`packages/engine/src/events.ts`, the `EVENTS` config block). **Class:** Standard (the PM, 28
Oct: two PRs, no new sole owner, MonthEvent gains `phase` without breaking). **Scope of this spec:** wave 1. Waves 2,
G-5 and Later each get an amendment and their own PR.

## §0 · Business Goals & Value `[handoff]`

**G-1 · "We just throw a dice for each event and see whether it fires. So we can have multiple events happening in
the same turn."** (Heiko, 28 Oct)
- **Who benefits:** the players at a table, who meet a month that can bring several things at once; and Heiko, who
  balances events by editing one table row each.
- **Today:** at most one event a month, from one dice (`EVENTS.chance` 0.5, then one of ten by weight), all in
  production. Measured: events in about 45% of months (the sim's events line, 40 games a set). Bad luck lands on the
  leader's land by a coin flip (`targetBias`), not by wealth. Sickness is the only per-player roll (R1, AM-14).
  `verified_by: read` (events.ts::planEvent, production.ts::runProduction) and `executed` (sim).
- **Finding: the air never reached Smoggy in any AI game.** In 120 sim games (seeds 1-40, 101-140, 201-240, politics
  on, `MonthReport.air`, the gauge after production) the gauge moved at all in 20-35% of games; the median month is
  0, the median game's highest is 0, the p90 game's highest 3-8, and the highest month anywhere 22 (Smoggy starts at
  30). So in today's AI games every air raise in the catalogue (sickness, acid rain, drought in Toxic air) and every
  pollution band never fires, and a measured "troubled colony" needs the air forced (§7 R-1). This matters for G-5's
  proof too. Not fixed here: the PM raises it with Heiko. `verified_by: executed` (scratch airgauge.ts).
- **Value:** each event has its own odds, phase and influences in config, so a new event or a retune is a table row,
  not code. Wave 1 changes no effect, so its games can be compared against today's.
- **UBER-AC-1:** the sim report prints events per month, by phase and for the whole month, with the share of months
  with 0, 1, 2, 3 and 4+ events; with wave 1 built, a month averages about 1.0 events in clean air and about 2.0 in
  Smoggy air or worse (Heiko's ruling (1) keeps the catalogue's amount; the band is set from the measured spread).
  Because AI colonies never go Smoggy (the finding above), the troubled half is measured with the air forced to
  Smoggy and every player causing 5 air points a month (the catalogue's troubled colony), until they do.

**Non-goals** `[review-only]`
- Wave 2's thirteen new events, the Goal 5 mood events and every row under "Later" (each its own amendment and PR).
  Wave 2 includes the **meteor strike** (Heiko, 28 Oct): a colony event in production, 2% a month. It hits any tile on
  the map at random, owned or not. An installation there is destroyed and makes nothing this month, and the tile
  becomes a crater with Crystite at the top of today's scale. The crater is a WS5 special field, and the event row
  calls it. Two wave-2 effects ruled by Heiko (28 Oct; chances and phases as catalogued, colony rows at 1% in the goods
  auction, before trading opens; AM-4):
  - **Pirate raid** ("pirates take all crystite"): every player's Crystite AND the store's Crystite stock go to 0.
  - **Store fire** ("store fire burns all store storage, not only food, all the storage that the store had"): the
    store's whole stock of every good goes to 0, and the corral's built MULEs too (PM ruling B, 28 Oct: "all the
    storage the store had"); upkeep rebuilds the corral only from what the store holds after that auction; prices
    follow the empty store as usual.
  Wave 2's sim report shows how often each fires, the loss per game, and the MULE price and plots developed in the
  month after a fire; a balance check they break goes to Heiko as options, never a silent tune.
- Changing any event's effect (wave 1 moves events onto their own dice only).
- Showing several events on the screens: the phone and TV read `events[0]` today (`table/TvProduction.tsx`,
  `phone/Production.tsx`). WS6 owns that surface; wave 1 needs it before it reaches a table (§9).
- The colony plot offered at the land grant (lots.ts, WS3's): it already has its own 10% dice and stays as it is.
- Defences, forecasts and storylines (the catalogue's "Later").

**Rough cost** `[review-only]`: the chosen approach about 2 PRs (the roller with wave 1; the sim spread line can ride
with it), 1-2 days of agent time plus WS6's screen change. The thin baseline: half a day.

## §0.1 · Decision Record `[review-only]`

- **Chosen: one roller over a table of rows.** Each event is a row in `EVENTS.colony` or `EVENTS.player` with its
  phases (a chance each), raises and lowers in points, protections, excludes, "only if" and its effect parameters. At
  the start of each phase the roller rolls every colony row for that phase once and every player row once a player,
  seeded, and applies what fires in table order. Sickness (R1) is already the first player row and moves for free.
  Estimate: 2 PRs.
- **Thin baseline: keep `planEvent` and let it pick up to N events.** Estimate: half a day. **It loses because** it
  cannot roll per player (pest swarm, wildfire, bumper harvest and sickness are each player's own dice in the
  catalogue), cannot roll in other phases (sickness at development start, wave 2's planning and upkeep events), and
  keeps one chance for all events, while the catalogue gives each event its own chance and influences. Checkable: the
  catalogue rows (Who = "Each player"; phases other than production).

## §0.2 · Constraints `[handoff]`

```
HC-1  Every number is a row field in EVENTS in config.ts; no literal in events.ts or the phase hooks.
                                              source: PM ruling 2026-10-28 (configurable balance)  breach: fatal
HC-2  A what-if copy never rolls, and no event rolls in month 1.  source: catalogue; T-AC-2      breach: fatal
HC-3  A seed replays the same events: every roll is seeded from (seed, month, phase, event, player or plot).
                                              source: CLAUDE.md (pure engine, seeded RNG)          breach: fatal
HC-4  Wave 1 changes no event's effect: buildEvent/eventOutput stay as they are for each event.
                                              source: Heiko's ruling (3)                           breach: needs a decision
HC-5  The chance stays between 0 and the row's cap (90% unless the row says less).
                                              source: catalogue, "How events roll"                 breach: fatal
```

## §1 · Solution Design `[handoff]`

```
C1 · ADDED · the event table and its roller

today        One production event a month: events.ts::planEvent rolls EVENTS.chance, then one of EVENTS.weights.
             Sickness alone uses EVENTS.player + playerEventChance/rollPlayerEvent (R1, WS1-C21).
             anchors: events.ts::planEvent, events.ts::playerEventChance, config.ts::EVENTS   verified_by: read
tomorrow     EVENTS.colony and EVENTS.player hold one row each per event: phases { <phase>: base }, raises and lowers
             (by influence, in points), protections, excludes, onceAMonth, cap, effect params. New
             events.ts::rollPhase(state, phase) rolls the phase's colony rows once and its player rows once a player,
             and returns what fired, in table order. Cavern collapse uses the same row dice once a cavern plot, after
             production's output (C4).
logic        → §2 RULE-1 (the chance), RULE-2 (what fires)
seam         events.ts, beside planEvent and the R1 player roll it generalises
senior       junior would: a switch per event with its own odds in code · senior does: one roller over config
             rows, one influence vocabulary shared by every row, so wave 2 and G-5 add rows, not code
mechanism    sprout (planEvent stays until C2 switches production over)
depends_on   none
```

```
C2 · MODIFIED · production rolls each event on its own dice

today        production.ts::runProduction calls planEvent once and applies at most one MonthEvent.
             anchors: production.ts::runProduction (const event = planEvent(state))       verified_by: read
tomorrow     runProduction calls rollPhase(state, 'production') and applies every event that fired, one after the
             other on the same plots (effects stack; output never below 0). The ten events keep their buildEvent and
             eventOutput (HC-4). planEvent, EVENTS.chance and EVENTS.weights go.
seam         production.ts::runProduction (WS1's file)
pin          T-AC-3 (each event's delta), T-AC-4 (the pest spread) and T-AC-5 (line sums) of the WS1 events spec
             keep passing with their assertions unchanged, forced through the rows; its T-AC-6 (targetBias) goes
             with C3
depends_on   C1
```

```
C3 · MODIFIED · personal events roll per player, and bad luck leans on wealth

today        pest swarm, wildfire and bumper harvest are colony picks; pickStart starts a bad one on the leader's
             land with chance targetBias, a good one on the trailing player's.
             anchors: events.ts::pickStart, EVENTS.targetBias                               verified_by: read
tomorrow     each rolls per player and starts on that player's plots; the richest and poorest (cash plus land)
             read the rows' wealth-rank raises and lowers (Heiko's ruling (4), the catch-up lean). targetBias goes.
depends_on   C1
```

```
C4 · MODIFIED · cavern collapse rolls on the table

today        specials.ts (WS5's) collapses a cavern that produced Crystite with its own 6% roll.
             anchors: specials.ts (crystalCavern, collapses)                                verified_by: read
tomorrow     a row in EVENTS.colony (cavernCollapse), rolled once per cavern plot that produced Crystite this
             month, after production's output, through events.ts's row dice; specials.ts::collapses asks it instead
             of its own hash, and EFFECT.collapseChance moves into the row. Named edits in WS5's file and config
             block; WS5 reviews. Each collapse is also a MonthEvent in MonthReport.events, after the output
             events (AM-3): key cavernCollapse, kind quake, scope personal, player = the cavern's owner,
             plots [{index, order 0, good 'crystite', delta 0}], phase 'production'. EventKey gains
             'cavernCollapse' (a named edit in WS3's types.ts, WS3 reviews); eventOutput gets a no-op entry.
pin          specials.test.ts T-AC-6 (WS5's) keeps passing, its assertions unchanged (AM-8): the same (seed, month, plot) collapses the
             same; never on a what-if copy; only in a month the cavern is mined; independent of the month's other
             events (a month with a production event collapses at the same rate); about 6% a mined cavern-month,
             within ±30%. The roller's seed for a cavern is its own (seed, month, plot), never shared with another row.
depends_on   C1
```

```
C5 · MODIFIED · the month report and the sim count every event

today        MonthReport.events holds 0 or 1 event; the sim prints events in N% of months.
tomorrow     MonthReport.events holds every production MonthEvent that fired, each with phase 'production',
             cavern collapses last (AM-3); sickness stays on Player.sick. The sim counts all three by phase and prints
             events per month by phase and for the month, and the share of months with 0, 1, 2, 3, 4+ (UBER-AC-1).
             `pnpm sim -- --air smoggy|toxic` counts each month as if the air were that band and every player had
             caused 5 air points (measure only; the games play on unforced).
seam         packages/ai/src/sim.ts (WS1's), its onEachPhase hook
depends_on   C2
```

## §2 · The Logic `[handoff]`

```
RULE-1 · An event's chance                                                    shape: formula

chance = min(cap, max(0, base(phase) + Σ raises − Σ lowers)), then protections
  base(phase)   the row's chance for this phase; a phase the row doesn't list rolls nothing
  raises/lowers by influence, in points: air band; own pollution (perPoint a point last month, up to a max);
                wealth rank (the richest, the poorest: cash plus land); last month's events (a flood after a
                drought); prices; what the player holds; mood and buildings (G-5, absent until then: mood Content)
  protections   cancel (holding Medicine cancels sickness and uses one) or cut (a hospital halves an epidemic)
unknown         a missing influence reads 0; no last month (month 2) means no last-month raise; a wealth tie for
                the richest or the poorest goes to the first tied player in seat order (as pickStart picks today)
examples        dust storm in any air 5% · drought in Toxic air 7% · sickness for a player who caused 5 air points,
                clean air: 3 + 15 = 18% · the same player in Collapse with 20 points: 3 + 50 + 40 = 93 → 90%
```

**Wave 1's rows** (the catalogue, rev 16; every number a row field in `EVENTS`, HC-1; each row's cap is 90%):

| Row | Table · who | Phase: base | Raises (points) | Lowers, prevents | Only if (today's `buildEvent`) |
|---|---|---|---|---|---|
| dustStorm | colony | production 5 | — | never with a solar flare | an Energy plot works |
| drought | colony | production 5 | Toxic +2, Collapse +4 | never with a flood | a Food or Water plot works |
| acidRain | colony | production 1 | Smoggy +4, Toxic +8, Collapse +12 | — | an Energy or Food plot works |
| solarFlare | colony | production 5 | — | — | an Energy plot works |
| cometPass | colony | production 5 | — | — | a Water plot works |
| flood | colony · river plots | production 5 | +10 the month after a drought | — | someone farms on the river |
| volcanicAsh | colony · one area | production 4 | — | — | a plot works within `EVENTS.volcanicAsh.radius` of a volcano or mountain |
| cavernCollapse | colony · each cavern plot | production 6, after output | — | — | the cavern produced Crystite this month |
| pestSwarm | player | production 1.5 | the richest +1 | the poorest −1 | the player has a Food plot |
| wildfire | player | production 1.5 | the richest +1; +3 during or after a drought | — | the player has a Food plot |
| bumperHarvest | player | production 1.5 | the poorest +1.5 | the richest −1 | the player has a working plot |
| sickness | player | development 3 | Smoggy +15, Toxic +30, Collapse +50; own pollution +3 a point, at most +40 | holding Medicine cancels it and uses one; a hospital −5 (G-5) | — |

"During a drought" means a drought fired this phase: colony rows roll first. "The richest" and "the poorest" rank cash
plus land at `GAME.plotScore` a plot.

```
RULE-2 · What fires in a phase                                                shape: sequence

1  month 1 or a what-if copy → nothing
2  colony rows for the phase roll once each, in table order; then player rows once a player, in seat order
3  a row whose "only if" finds nothing to hit fires nothing (a flood needs a river farm; pests need a Food plot)
4  excludes: if both of a pair fired, the seeded dice keep one (drought/flood, dust storm/solar flare)
5  onceAMonth (default true): a row that fired earlier this month doesn't fire again
6  effects apply in the order fired; two on one plot both apply; output never below 0. Each event's
   plots[].delta is its own change, worked on the output the earlier events left; a plot the event
   reaches is listed even when its delta is 0, so the screens rebuild a plot by adding deltas in order
seeds           each roll from (seed, month, phase, row key, and the player or plot), so a replay is exact
```

## §3 · Contracts & Data Models `[handoff]`

MonthEvent · MODIFIED · not breaking: gains `phase: Phase` (a named edit in WS3's `types.ts`, WS3 reviews; produced
by C2). MonthReport.events may now hold several events, in the order they fired; readers
that take `events[0]` keep working but show only the first (WS6, §9). Example: a production month with a drought
and a pest swarm on p2's farms gives two MonthEvents, both phase 'production', in that order. Stacking (RULE-2
step 6): a plot's `delta` in each event is that event's own change on what the earlier events left, and a plot an
event reaches is listed even at delta 0. A Food plot making 1 hit by a drought and then acid rain lists −1, then 0.
EventKey · MODIFIED · not breaking (PR-2, AM-3): gains 'cavernCollapse', a named edit in WS3's `types.ts`. A
collapse is listed last in MonthReport.events, after the output events; the screens read `kind` ('quake').

## §4 · Failure & Ops `[handoff]`

No external dependency: the roller is in-process and seeded.

## §5 · Delivery `[handoff]`

Code-only; no existing state to reach.

## §6 · Acceptance Criteria `[handoff]`

| AC | Given / when / then | observed_at | negative | changes |
|---|---|---|---|---|
| UBER-AC-1 | Given wave 1, when the sim runs three sets, then it prints events per month by phase and month, and a month averages about 1.0 (clean) / 2.0 (Smoggy or worse) | the sim report | today's report: one dice, 0.45 a month | C5 |
| T-AC-1 | The chance by table: base, each influence, the clamp to 0 and to the cap, a phase not listed (RULE-1 examples) | events.ts::eventChance | — | C1 |
| T-AC-2 | No roll in month 1 or on a what-if copy; the same seed fires the same events | rollPhase | — | C1 |
| T-AC-3 | Two events on one plot both apply, in order, never below 0; an excluded pair keeps one | the month report's events and the plot's output | — | C2 |
| T-AC-4 | A personal event fires only on its own player's plots; the richest player's bad odds and the poorest's good odds rise by their rows' points | rollPhase / the report | — | C3 |
| T-AC-5 | Each of the ten events and cavern collapse has the same effect as today on the same plots (pins the WS1 events spec's T-AC-3, T-AC-4, T-AC-5; cavern collapse by EM-T-AC-5 and WS5's T-AC-6) | eventOutput / the plots | a row at 0 never fires; a cavern that made no Crystite never collapses | C2, C4 |

## §7 · Risks & Spikes `[review-only]`

- **R-1 · The budget is calculated, not measured.** The catalogue's 1.0 / 2.0 for wave 1 are computed from first
  guesses for a fixed calm and troubled colony. Mitigation: the spread script (measure only, no game change) rolls
  every wave-1 row against the states of real sim games and reports the spread before any code changes the game.
  **Measured** (scratch eventspread.ts, 40 games a set, politics on; the land grant counts today's own 10% dice):

  | Colony | Land grant | Development (sickness) | Production | Month | Months with 0 / 1 / 2 / 3 / 4+ |
  |---|---|---|---|---|---|
  | Natural, clean air (seeds 1, 101, 201) | 0.11-0.14 | 0.18-0.23 | 0.48-0.56 | **0.78-0.92** | about 40 / 38 / 17 / 3 / 1% |
  | Forced Smoggy, everyone 5 points (101) | 0.11 | 1.25 | 0.53 | **1.89** | 11 / 30 / 30 / 19 / 10% |
  | Forced Toxic, everyone 5 points (101) | 0.11 | 1.79 | 0.60 | **2.50** | 3 / 18 / 32 / 27 / 20% |
  | Forced Smoggy, one player 15 points (101) | 0.11 | 1.14 | 0.53 | **1.78** | 13 / 30 / 32 / 18 / 7% |

  Against the catalogue's 1.0 calm and 2.0 troubled for wave 1, calm measures a little under (0.78-0.92) and
  Smoggy close (1.89); Toxic overshoots (2.50). In bad air, sickness is most of it: 1.25 of Smoggy's 1.89 and 1.79
  of Toxic's 2.50, so in a Smoggy colony each player rolls about one sick month in three before Medicine. Today's
  one dice gives events in 45-46% of months. The forced runs change no game: the colonies play on as today, and
  only the counting uses the forced air and points.
- **R-2 · More bad events can push a check.** Two production events can now strike together. Mitigation: the PR's
  rows are the gate; a check that moves goes to Heiko with options.
- **R-3 · Toxic air overshoots the budget.** Forced Toxic measures 2.50 events a month, against the catalogue's
  implied ~2.0; almost all of the excess is sickness (1.79 of the 2.50). Not a blocker: Toxic never happens in
  today's AI games. Mitigation: retune in wave-1 tuning once colonies can reach Toxic air, by lowering
  `EVENTS.player.sickness.air.toxic`, Heiko's call.
- **R-4 · "Last month" in a phase after production (wave 2).** `events.ts`'s influences read last month as the
  newest report, `state.history.at(-1)`, as sickness always has. That is right for development and production, but
  production files this month's report, so a wave-2 row rolled in auction or upkeep would read this month's as "last
  month". Wave 1 has no such row. Mitigation: the first wave-2 row after production reads the newest report with
  `month < state.month`, and moves T-AC-24's fixture (which files a month-1 report while the state is in month 1)
  with it. Found at Task 3's review, 28 Oct.

## §8 · Amendments `[review-only]`

```
AM-1 · 2026-10-28 · plan time (WS1's self-review, codebase drift on trunk e998205)

target    §1 C1, C2, C4, C5 · §2 (wave 1's rows) · §3 · §6 · §9
did       grounded every anchor against the merged tree before planning.
          C1: in wave 1 only production calls rollPhase. startDevelopment keeps its rollPlayerEvent call for
          sickness, the same row and the same dice, so wave 1 needs no edit in WS3's game.ts. The rows carry the
          dice. Each event's effect parameters stay at EVENTS.<key> (dustStorm.cut and the rest), so HC-4 holds
          with no rename.
          C4: a cavern collapses only when it produced Crystite this month (specials.ts::settleSpecials reads
          production's lines), so it cannot be rolled at the phase start. It rolls after output through the same row
          dice, from (seed, month, phase, row, plot). EFFECT.collapseChance (WS5's block) moves to the row: a named
          edit in WS5's config block and specials.ts.
          C5: a collapse is not a MonthEvent and sickness lives on Player.sick, so MonthReport.events holds the
          production MonthEvents (each with phase 'production'), and the sim counts all three by phase. The troubled
          half of UBER-AC-1 is measured with `pnpm sim -- --air smoggy|toxic`, which counts each month as if the air
          were that band and every player had caused 5 air points. Measure only: the games play on unforced.
          §3: MonthEvent is in WS3's types.ts, so `phase` is a named edit there (WS3 reviews, as for the events spec,
          SEAMS 2026-10-21). apps/server/src/mule-game.ts (WS3's) maps events field by field, so `phase` reaches the
          screens only with the view change that WS6 builds behind §9's gate. The screens that read events[0] are
          apps/web/src/table/TvProduction.tsx:12 and apps/web/src/phone/Production.tsx:17 and :88; no ProductionMap
          reader.
          §6: the pins are the WS1 events spec's T-AC-3 (each event's delta), T-AC-4 (the pest spread) and T-AC-5
          (line sums), forced through the rows instead of EVENTS.weights and targetBias. That spec's T-AC-6
          (targetBias) is superseded by C3, its T-AC-2 "never twice in a row" and its RULE-1 one dice by RULE-2, and
          its B-AC-1, T-AC-1 and T-AC-8 (EVENTS.chance, the 30-60% band) by UBER-AC-1; it gets an amendment saying
          so. T-AC-1 already names tests in three specs, so this spec's tests are titled EM-T-AC-n.
          RULE-1 had no line for a wealth tie; it now goes to the first tied player in seat order, today's pickStart.
          §0.1's reason was checked and holds: the catalogue's pest swarm, wildfire, bumper harvest and sickness roll
          for each player, and sickness rolls in development.
goal      G-1 (the same goal; the slices are accurate to the code)
```

```
AM-2 · 2026-10-28 · Task 2's freeze point, WS8's review (primary reviewer, PM ruling)

target    §2 RULE-2 step 6 · §3
did       wrote down the stacking rule the screens rebuild a plot from: each event's plots[].delta is
          its own change, worked on the output the earlier events left, and a plot the event reaches
          is listed even when its delta is 0. Both already hold in the code: buildEvent lists every
          plot an event reaches with delta 0, and production.ts::runProduction fills
          delta = eventOutput(key, before) − before, with before summing the parts so far, so
          chaining events (Task 6) keeps the rule. EM-T-AC-3 asserts the delta-0 entry.
because   WS8 asked for it at the freeze point: the screens add a plot's deltas in order, and must
          know whether a plot at 0 is listed
goal      G-1 (unchanged; the contract is clearer, not different)
```

```
AM-3 · 2026-10-28 · PM ruling A, on WS8's review of the freeze point

target    §1 C4, C5 · §3 · supersedes AM-1's "a collapse is not a MonthEvent"
did       a cavern collapse is a MonthEvent in production, after the output events: key cavernCollapse,
          kind quake, scope personal, player = the cavern's owner, plots [{index, order 0, good
          'crystite', delta 0}] (this month's Crystite is already made), phase 'production'.
          EventKey gains 'cavernCollapse': a named edit in WS3's types.ts, which WS3 reviews in PR-2
          with eventOutput's no-op entry. The collapse itself (C4, WS5's T-AC-6 pins) is unchanged.
          Lands in PR-2 (Task 9); PR-1 is unchanged.
because   Heiko's catalogue lists cavern collapse as one of its 35 events, and he wants events
          announced on the TV and on a phone alone; a badge that vanishes silently fails both
          (PM, 28 Oct). The screens would otherwise have to diff tiles to find it.
goal      G-1 (unchanged)
```

```
AM-4 · 2026-10-28 · Heiko's ruling on two wave-2 effects (through the PM)

target    §0 Non-goals (the wave-2 note) · the catalogue's pirate raid and store fire rows
did       recorded the new effects for wave 2's amendment and PR:
          pirate raid: every player's Crystite and the store's Crystite stock go to 0 (the catalogue said
          "the Crystite the players hold"); store fire: the store's whole stock of every good goes to 0
          (the catalogue said "one good"). Chances, raises and the phase stay as catalogued (colony, 1%,
          the goods auction before trading opens). A store fire empties the corral too (PM ruling B,
          28 Oct): Store.mules goes to 0 with the stock, and upkeep rebuilds the corral only from what
          the store holds after that auction (upkeep.ts builds a MULE from each Smithore).
          Wave 1 is unchanged: neither row is in it.
because   Heiko, 28 Oct: "pirates take all crystite"; "store fire burns all store storage, not only food,
          all the storage that the store had". WS8 updates the animations to match.
goal      G-1 (unchanged); wave 2's rows carry the new effects, its sim report shows each one's rate, its
          loss per game, and the MULE price and plots developed in the month after a fire; a balance check
          it breaks goes to Heiko as options
```

```
AM-5 · 2026-10-29 · the event payload agreed with WS8 (primary reviewer), for the approved gallery
        (Heiko, 29 Oct: "Living weather" is the design to build)

target    §3 MonthEvent (Task 2's contract)
did       wave 1 needs nothing new: the contract at ws1-events-roller 605749d is what the gallery builds against.
          One field goes: MonthEvent.when ('afterProduction'). Screens read `phase`; when to show an event inside its
          phase is display timing, the show's (EVENT_SHOW in config.ts, WS8's block by PM ruling). Its readers are its
          definition (types.ts, WS3's file: a named edit) and buildEvent's value (events.ts); nothing else.
          Cavern collapse (AM-3) needs no new field: the key and plots[0] (Crystite, delta 0).
          Wave 2 adds, each with the row that needs it, as a named contract change WS8 reviews:
          effects?: { on: player id | 'store' | 'colony'; what; delta; pct?; good?; turns? }[] for changes off the map
          (pirate raid, store fire, tax and grant, the festival, the strikes), in fired order with AM-2's stacking;
          plots[].becomes? ('crater' | 'plain' | 'idle'); plots[].muleLost?; plots[].pending? (the general strike).
          WS8's working types: design/mocks/ws8-events/src/events.ts on origin/ws8-events.
          The production show's files are WS6's; WS8 builds the event segment into them as named edits WS6 reviews,
          and owns packages/ui/src/events/**. Contract hunks go to WS8, with WS6 copied.
because   WS8, 29 Oct: "for wave 1 the contract at 605749d is enough"; `when` duplicates `phase`.
goal      G-1 unchanged
```

```
AM-6 · 2026-10-29 · Heiko's ruling on R-2 (via the PM): "b"

target    §2 wave 1's rows (the production bases) · UBER-AC-1 · R-2, R-3
said      the catalogue's production bases (dust storm, drought, solar flare, comet pass, flood 5%; volcanic ash 4%;
          acid rain 1%; pest swarm, wildfire, bumper harvest 1.5% a player); UBER-AC-1 ~1.0 a month clean, ~2.0 Smoggy.
did       every production base ×1.6, the catalogue's relative odds kept: dust storm, drought, solar flare, comet pass,
          flood 8%; volcanic ash 6.4%; acid rain 1.6%; pest swarm, wildfire, bumper harvest 2.4% a player. Raises,
          lowers, follows, caps and excludes are unchanged; sickness stays at 3% (Heiko's catalogue ruling (2)).
          Measured (Task 8; roller against its base b3774fa, 40 games a cell, seeds 1, 101, 201, politics on and off;
          the only check that ever misses is "Colonists short of Food or Water", under 15%):

          option                                  events a month clean / Smoggy / Toxic    shortage, six cells (mean)
          base today                              -                                        9 16 15 23 14 13 (15.0)
          A  the catalogue                        0.66-0.73 / 1.79-1.86 / 2.47-2.54        14 16 21 19 13 13 (16.0)
          B  every production base x1.6  CHOSEN   0.93-1.01 / 2.02-2.15 / 2.71-2.83        10 15 23 21 15 19 (17.2)
          C  x1.6 on the four that can't lower    0.79-0.82 / 1.88-1.99 / 2.56-2.68        12 15 21 18 13 14 (15.5)
             Food or Water (dust, flare, comet, bumper)
          C' the same four x2.4                   0.95-0.99 / 2.04-2.15 / 2.72-2.85        14 13 19 17 11 10 (14.0)

          UBER-AC-1 passes with B. R-2: under B the shortage check moves from ok to MISS in two cells (seed 201,
          politics on 14→15%, off 13→19%); Heiko accepts it: food supply is its own follow-up, and the check already
          misses in half the cells before the event model. R-3: Toxic air at 2.7-2.8 a month, reported, not tuned.
because   Heiko, via the PM: "b". The liveliness he asked for, with his catalogue's relative odds; the shortage pressure
          is a food-supply question, not an event one.
goal      G-1 (unchanged); UBER-AC-1 met
```

```
AM-7 · 2026-10-29 · PR-1's boundary review: HC-2 and sickness

target    §0.2 HC-2 · §2 RULE-2 step 1
said      HC-2 "A what-if copy never rolls, and no event rolls in month 1"; RULE-2 step 1 "month 1 or a what-if copy →
          nothing".
did       both bind the phase roller: rollPhase rolls nothing in month 1 or on a what-if copy, for every row it rolls.
          Sickness is outside rollPhase (AM-1 keeps it on Player.sick) and keeps the roll it has had every month since
          the balance spec's Task 13, month 1 included: the balance spec's T-AC-24 fixture relies on it and the sim
          counts it. No behaviour changes; the text now says what the code has done since before this spec.
because   the boundary review found the spec and the code disagreeing on month-1 sickness; it predates the event model
          and shipped with Heiko's sickness ruling, so the spec follows the code. Gating sickness to month 2 would be a
          balance change of its own, measured first.
goal      G-1 unchanged
```

```
AM-8 · 2026-10-29 · Task 9's implementer, measured (a spec claim found false)

target    §1 C4 pin · §6 T-AC-5's cavern clause
said      "specials.test.ts T-AC-6 (WS5's) keeps passing unchanged".
did       T-AC-6 keeps every assertion and number; two reads in its fixture change, a named edit WS5 reviews:
          its setup sets "every production row" to 0 except volcanic ash, which now takes the cavern row with them
          (measured: collapse rate 0, "expected 0 to be greater than 0.0419"); and it sorts months by "any event
          fired", which a collapse now is (AM-3; measured: event months 0.1097 against "less than 0.078"). The setup
          skips rows rolled per plot after output, and a month has an event when an output event fired.
          The cavern's own dice, rate and guards are C4's as written.
because   the pin predates AM-3, which made a collapse a MonthEvent; keeping the test unedited would take the row out
          of EVENTS.colony (C4) and the event out of runProduction's events (AM-3) instead.
goal      G-1 unchanged
```

## §9 · Ownership Boundaries `[handoff]`

No ownership change: events.ts and EVENTS remain WS1's. Named edits: `specials.ts` (WS5, C4), any phase hook in
`game.ts` (WS3) for later waves. WS6 owns showing several events on the phone and TV (readers of `events[0]`), and
wave 1 reaches a table only with that change. That is a gate in the plan: the contract WS6 builds against is §3's
`MonthEvent.phase` and a `MonthReport.events` that holds several events a phase; the PM routes it to WS6.
