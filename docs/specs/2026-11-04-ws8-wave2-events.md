# WS8 · Wave 2: thirteen events across the month, rules and stories

Class: **Standard** (one lane, two PRs, named edits in WS1's, WS3's and WS5's files; no new sole owner).
Builds on: `docs/specs/2026-10-28-ws1-event-model.md` (the roller, AM-4, AM-5) and
`docs/specs/2026-10-29-ws8-event-show.md` (the show, the hold, C12).
Ruling (PM, 4 Nov): WS1 is on the arcade critical path, so WS8 writes the wave-2 rules as named edits in WS1's event
files; every number is a named `config.ts` value; WS1 OKs the SHAs; the rows as the catalogue has them, no new
balancing.

## §0 · Business Goals & Value

**G-1 · Every phase can surprise you** `[handoff]`
- Who benefits: the players at the table.
- Today: every random event fires in production, plus sickness at development start (`EVENTS` in
  `packages/engine/src/config.ts`; verified_by: read). Planning, the goods auction and the month end never change by
  chance, so after a few months the shape of a month is known before it starts.
- Value: Heiko's approved gallery ("Living weather", 29 Oct) shows thirteen more events across planning,
  development, production, the goods auction and the month end. Heiko's "steer to completion, a functional playable
  game first" (4 Nov) puts them in milestone 1.
- **UBER-AC-1:** in a 40-game sim (`pnpm sim`, seeds 1/101/201, politics on and off), every wave-2 key fires at
  least once, each in its catalogued phase, and the sim report lists each key's rate a month, its loss per game, and
  the MULE price and plots developed in the month after a store fire.

**G-2 · You see what happened, where it happened** `[handoff]`
- Who benefits: the players, on the TV and on a phone alone.
- Value: each wave-2 event plays the gallery's story in its own phase, and the phase waits for it (RULE-4 of the
  show spec, unchanged).
- **UBER-AC-2:** a goods-auction month with a pirate raid: the TV plays the pirate ship before trading opens, and
  nobody can bid until it ends (the show spec's B-AC-3, moved here).

**Non-goals** `[review-only]`
- New balancing. A balance check that wave 2 breaks goes to Heiko as options (AM-4's rule), never a silent tune.
- The Goal-5 rows (emigration, festival, general strike, walkout, loyal crew, store strike, riot, volunteer
  clean-up, blamed for unrest): chance 0% in the gallery, not wave 2.
- Warnings, hedges, chains, insurance, vaults (the catalogue's "Later").
- AI awareness of wave-2 events: the strategist plays on as today.

**Rough cost** `[review-only]`: the rules PR about 1.5 days of agent time; the stories PR about 2 days; the thin
baseline (rules with the generic bulletin card, no stories) about 1.5 days.

## §0.1 · Decision Record `[review-only]`

- **Chosen: the rules as rows in WS1's table, plus one store for the month's events, then the gallery's stories.**
  Every row is an `EventRow` in `EVENTS.colony` / `EVENTS.player` (the vocabulary the roller already reads), and each
  phase that rolls calls `rollPhase` at its start, as production and sickness do. Estimate: 2 PRs.
- **Thin baseline: the rules with no stories (the show's generic bulletin card for every wave-2 key).** About 1.5
  days. **It loses because** Heiko approved the gallery's stories as the design to build (29 Oct, "Living weather"),
  and the show spec's C12 already promises them; checkable in `design/mocks/ws8-events` (`#event-pirateRaid`). It is
  still how PR-A ships: PR-A is the baseline, PR-B adds the stories.

## §0.2 · Constraints `[handoff]`

```
HC-1  Every number is a field of its EVENTS row in config.ts: chances, shares, amounts. No literal in events.ts,
      game.ts, auction.ts, upkeep.ts, production.ts or the server.                  source: WS1 HC-1 · breach: fatal
HC-2  The engine stays pure: seeded dice only (rowDice), no Date.now, no Math.random. A replay from seed and
      actions gives the same events.                                                 source: CLAUDE.md · breach: fatal
HC-3  Wave 1's rolls do not move: every wave-1 row keeps its own dice (rowDice seeds by key, phase and roller), so
      adding rows never changes which wave-1 events fire. Proven by the sim's wave-1 rates staying identical.
                                                                                     source: WS1 §2 · breach: fatal
HC-4  No new balancing: the chances are the catalogue's (design/mocks/ws8-events/src/catalogue.ts, wave 'wave2'),
      the two production rows ×1.6 as Heiko ruled for every production base (AM-1).
                                                                                     source: PM 4 Nov · breach: decision
HC-5  An event's effect on cash or goods never drives a number below 0.              source: rules · breach: fatal
```

## §1 · Solution Design `[handoff]`

```
C1 · MODIFIED · the month keeps every event it fires, in any phase

today        rollPhase is called only in production (production.ts::runProduction); its events reach the month
             report (game.ts::advancePhase pushes history with `events`). Sickness makes no MonthEvent. The server
             reads this month's events from the report (mule-game.ts::phaseEvents), which does not exist before
             production. · anchors: packages/engine/src/events.ts::rollPhase, game.ts::advancePhase,
             apps/server/src/mule-game.ts::phaseEvents · verified_by: read
tomorrow     MUST: GameState.monthEvents: MonthEvent[] holds every event fired this month in fired order; it is
             emptied when the month opens (advancePhase → planning, before rollPhase('planning')); production's
             report records production's events as today, and at upkeep the report's events become the whole
             month's (so the sim counts every phase). MUST: the server reads this month's events from
             state.monthEvents, filtered by phase.
seam         types.ts::GameState (WS3), game.ts::advancePhase (WS3), mule-game.ts::phaseEvents (WS3)
senior       junior would: push off-production events into the previous month's report, or keep a second list
             on the server · senior does: one engine list the replay rebuilds, read by one server function
mechanism    in_place
call sites   phaseEvents (server, its only reader); sim's report counter (packages/ai/src/sim.ts:207 and :246
             read history[].events, unchanged). A what-if clone (observe.ts::cloneForSim) shares the array but
             never pushes to it: rollPhase returns [] when state.whatIf (events.ts:259), and the planning reset
             assigns a new array rather than clearing in place.
pin          events-view.test.ts (production's events in the view, seed 404) and the sim's byte-identical
             wave-1 output (HC-3)
depends_on   none
```

```
C2 · ADDED · thirteen rows and their effects

today        EVENTS has 11 rows (10 production + sickness) · verified_by: read
tomorrow     MUST: the 13 rows of RULE-2 in EVENTS.colony / EVENTS.player, each with its catalogued phase and
             chance and its effect parameters; events.ts's SHAPE gains each key's kind, title, scope, sign, line;
             buildEvent gains each key's targeting (RULE-3); one pure function per phase applies what fired
             (RULE-4).
seam         packages/engine/src/config.ts::EVENTS (WS1's block), packages/engine/src/events.ts (WS1)
senior       junior would: a switch in game.ts per event with literal amounts · senior does: rows in the one
             table, effects in events.ts beside buildEvent, the phase hooks only call rollPhase + apply
mechanism    sprout (new rows and new apply functions beside the existing ones)
call sites   rollPhase (planning, development, production, auction, upkeep), buildEvent, plotEvent
pin          T-AC-1..T-AC-4 of WS1's event model (production's rolls), the sim's wave-1 rates (HC-3)
depends_on   C1 (data)
```

```
C3 · MODIFIED · each phase rolls at its start

today        only production rolls (production.ts); sickness rolls per player in game.ts::startDevelopment
tomorrow     MUST: planning rolls at openPlanning's end (politics.ts, WS7's: a named edit), development after
             sickness in startDevelopment, the goods auction before postPrices in advancePhase, upkeep before
             runUpkeep in advancePhase; production's existing roll gains coldSnap (before output) and
             meteorStrike (after output, like cavernCollapse). Each site: `const fired = rollPhase(state, phase);
             applyPhaseEvents(state, phase, fired); state.monthEvents.push(...fired)`.
seam         game.ts::advancePhase and ::startDevelopment (WS3), politics.ts::openPlanning (WS7),
             production.ts::runProduction (WS1)
mechanism    in_place (one call each)
pin          first-mule.test.ts (month 1 still ends), planning.test.ts, the land-auction and auction suites
depends_on   C1, C2
```

```
C4 · MODIFIED · the event contract carries changes off the map (AM-5's agreed shape)

today        MonthEvent.plots[] has index, order, good, delta, was?, becomes?: 'plain' (types.ts ~250); no effects
tomorrow     MUST: MonthEvent.effects?: { on: string | 'store' | 'colony'; what: Good | 'money' | 'mules' |
             'colonists' | 'energyNeed'; delta: number }[] in fired order; plots[].becomes widens to
             'plain' | 'crater' | 'idle'; plots[].muleLost?: true. EventView mirrors them (protocol), and
             monthEventView maps them.
seam         types.ts::MonthEvent (WS3), protocol EventView (WS3), mule-game.ts::monthEventView (WS3)
mechanism    in_place, additive
pin          events-view.test.ts
depends_on   none (stubbable: PR-A's tests use it first)
```

```
C5 · ADDED · the stories (the show spec's C12)

today        packages/ui/src/events has the wave-1 stories and cavernCollapse; a wave-2 key would fall back to
             the bulletin card (catalogue.ts's unknown-key line)
tomorrow     MUST: each wave-2 key plays its gallery story, grafted from design/mocks/ws8-events/src
             (stories.tsx, stories-plots.tsx, vignettes.tsx, scene.tsx); LOST / TAKEN chips from copy.ts::hitText;
             EffectChip for changes off the map.
ux           design/mocks/ws8-events · #event-<key>[/phone] · GRAFT TARGET: packages/ui/src/events/**
seam         packages/ui/src/events/** (WS8)
mechanism    fill_scaffold
depends_on   C4 (contract), C2 (real events for the e2e)
```

## §2 · The Logic `[handoff]`

```
RULE-1 · where a phase rolls, and what its events act on                 shape: table

  phase        rolls at                                           acts before
  planning     the end of openPlanning (the month is open)        the election and the planning screens
  development  after sickness, in startDevelopment                the development clocks (the show holds them)
  production   coldSnap: with the production rows, before output   the output (energy need ×2)
               meteorStrike: after output, with cavernCollapse    nothing this month: the plot made what it made,
                                                                  then the strike destroys its MULE (catalogue: "makes
                                                                  nothing this month" — see RULE-3 note)
  auction      before postPrices                                  prices, the store's stock, the first good
  upkeep       before runUpkeep                                   upkeep's eating and spoilage

unknown      a phase with no row in RULE-2 rolls nothing; rollPhase returns [] (today's behaviour). Month 1 rolls
             nothing in any phase (EVENTS.firstMonth = 2, config.ts:1083), so the first planning event can come in
             month 2.
```

```
RULE-2 · the rows (chance a roll; the catalogue's; HC-4)                 shape: table

  key                phase(s)               roller   chance        effect params (config names)
  federationTax      planning               colony   0.02          share 0.10 of each player's cash → colony fund
  federationGrant    planning               colony   0.02          amount 150 to each of the `count` 2 poorest
  immigrationWave    planning               colony   0.02          colonists ×(1 + growth 0.10), for good
  inheritance        planning               player   0.015         min 100 … max 300, more for the poorer (RULE-3)
  muleTheft          development, upkeep    player   0.01 each     one installed MULE taken; the plot stands idle
  epidemic           development            colony   0.005         each player without Medicine sick this turn and next
  coldSnap           production             colony   0.032         every plot's energy need × factor 2 this month
  meteorStrike       production             colony   0.032         one tile at random (not the store): crater
  pirateRaid         auction                colony   0.01          every player's and the store's Crystite → 0
  storeFire          auction                colony   0.01          the store's stock of every good → 0, its MULEs → 0
  ratsInSilo         upkeep                 player   0.015         lose share 0.5 of held Food (floor)
  crookedAccountant  upkeep                 player   0.01          lose share 0.10 of cash (floor)
  packageFromHome    upkeep                 player   0.015         +amount 3 Food

  every row: cap 0.9 (the table's convention), no raises or lowers (the catalogue gives none), so R-4 of the
  event model ("last month" after production) cannot bite: no wave-2 row reads a report.
  muleTheft lists two phases, so it can fire twice in one month (the catalogue's "1% here and 1% in upkeep");
  rowDice seeds by phase, so the two rolls are independent.
```

```
RULE-3 · targeting and only-if (buildEvent)                               shape: table, first match wins

  key                only if                                     picks (rowDice)
  federationGrant    at least one player                         the `count` lowest by wealth (cash + land, as the
                                                                 wealth influence ranks), a tie to the first seat
  inheritance        —                                           amount = min + (max − min) × r, r = the player's
                                                                 rank from the richest / (players − 1); 1 player → max
  muleTheft          the player has a plot with an outfit         one such plot, uniform
  epidemic           —                                           (no pick)
  meteorStrike       —                                           any tile but the store, uniform; owned or not
  ratsInSilo         the player holds ≥ 2 Food                   —
  crookedAccountant  the player holds ≥ 10 credits               —
  others             —                                           —
  a row whose only-if fails fires nothing (buildEvent returns null, as today).

  note  meteorStrike rolls after output, so the struck plot's MULE has already produced this month; the catalogue's
        "an installation on it is destroyed and makes nothing this month" is read as: destroyed now, so it makes
        nothing until the owner outfits the plot again. Moving the roll before output would change wave-1's
        production order (HC-3).
```

```
RULE-4 · what each fired event does (applyPhaseEvents), in fired order     shape: table

  key                state change                                                     effects[] / plots[]
  federationTax      each p: t = floor(p.money × share); p.money −= t; treasury.money += t   {on p, money, −t} per p with t>0
  federationGrant    each picked p: p.money += amount (the Federation pays: no source) {on p, money, +amount}
  immigrationWave    state.colonists = round(colonists × (1 + growth))                 {on colony, colonists, +n}
  inheritance        p.money += amount                                                 {on p, money, +amount}
  muleTheft          tile.outfit = null, runMonths = 0, filter = false                 plots [{index, good, delta 0,
                                                                                         becomes 'idle', muleLost}]
  epidemic           each p: Medicine ≥ 1 → use one; else p.sick = true and            {on p, medicine, −1} for each
                     p.sickNext = true                                                  cured; the sick reach the roll
                                                                                         call through Player.sick
  coldSnap           production's energy need ×factor for this run only                {on colony, energyNeed, +100}
  meteorStrike       formMeteorCrater(state, x, y) (WS5's)                             plots [{index, good, delta 0,
                                                                                         becomes 'crater', muleLost if it
                                                                                         had an outfit}]
  pirateRaid         every p.stock.crystite = 0; store.stock.crystite = 0             {on p|store, crystite, −n} n>0
  storeFire          every good: store.stock[g] = 0; store.mules = 0                  {on store, g, −n} n>0;
                                                                                         {on store, mules, −m} m>0
  ratsInSilo         p.stock.food −= floor(food × share)                               {on p, food, −n}
  crookedAccountant  p.money −= floor(money × share)                                   {on p, money, −n}
  packageFromHome    p.stock.food += amount                                            {on p, food, +amount}

  sickNext: at the next startDevelopment, a player with sickNext is sick unless they then hold a Medicine (used);
  sickNext is cleared there. Sickness's own roll still runs; one Medicine cures being sick this turn, whatever the
  cause. A player sick by the epidemic shows in the roll call with the reason "the epidemic" (SICK_BECAUSE gains it).

boundaries   every amount floors to whole credits / units; nothing goes below 0 (HC-5).
outcome      an event with no effect on anyone (a tax when everyone has < 10 credits) still fires and still shows.
examples     tax with cash 0, 9, 250 → 0, 0, 25 taken; grant with 4 players → the two poorest +150;
             inheritance, 4 players → poorest 300, richest 100, the middle two 233 and 166;
             a store fire with corral 3 → store stock all 0, corral 0, upkeep rebuilds from Smithore after.
```

## §3 · Contracts & Data Models `[handoff]`

- `GameState.monthEvents: MonthEvent[]` — ADDED, not breaking (cloneForSim copies it; createGame sets []).
- `Player.sickNext: boolean` — ADDED, not breaking (createGame sets false).
- `MonthEvent.effects?`, `plots[].becomes` widened, `plots[].muleLost?` — ADDED / MODIFIED, not breaking (AM-5's
  agreed shape). `EventKey` gains the 13 keys; `EventKind` gains the gallery's proposed motion families for them:
  'ledger' (tax, grant, inheritance, pirate raid, rats, accountant, package), 'colony' (immigration), 'plot' (MULE
  theft), 'colonists' (epidemic), 'sweep' (cold snap), 'strike' (meteor), 'store' (store fire) — read from
  `design/mocks/ws8-events/src/catalogue.ts`'s `motion` field, which `scenarios.ts` labels "PROPOSED kind".
- Protocol `EventView`: `effects?`, `hits[].becomes?`, `hits[].muleLost?` — ADDED.

## §6 · Acceptance Criteria `[handoff]`

| AC | Promise | Observed at | Changes |
|---|---|---|---|
| B-AC-1 (G-2) | A pirate raid in the goods auction: the TV plays the pirate ship before trading opens; a bid during it gets "The event is still playing"; after it, every player and the store hold 0 Crystite | e2e (TV + phone) and the server's view | C1-C5 |
| B-AC-2 (G-2) | A store fire with no board: the phone alone plays the fire; after it the store shows 0 of every good and the corral 0 | e2e phone | C1-C5 |
| T-AC-1 (G-1) | Forcing each wave-2 key fires it in its phase with the RULE-4 state change and effects, in every seat's view | server test, one case per key | C1-C4 |
| T-AC-2 (HC-3) | The sim's wave-1 rates are identical before and after (`pnpm sim` output for wave-1 keys byte-identical) | sim | C2 |
| T-AC-3 (HC-5) | A tax, theft, rats or accountant on a player with 0 of the thing leaves 0, and the event still shows | engine test | C2 |
| T-AC-4 (G-1) | A replay from seed and actions reproduces every wave-2 event (game record) | server replay test | C1 |
| T-AC-5 (RULE-4) | An epidemic leaves a player without Medicine sick this development and the next; with one Medicine, cured and the Medicine gone | engine test | C2, C3 |

## §9 · Ownership Boundaries `[handoff]`

No ownership change. Named edits, each OK'd by its owner on the SHA:

| File | Owner | Edit |
|---|---|---|
| packages/engine/src/config.ts `EVENTS` | WS1 | 13 rows |
| packages/engine/src/events.ts | WS1 | SHAPE, buildEvent targeting, applyPhaseEvents |
| packages/engine/src/production.ts | WS1 | coldSnap's energy need; meteorStrike after output |
| packages/engine/src/types.ts | WS3 | monthEvents, sickNext, MonthEvent.effects/becomes/muleLost, keys |
| packages/engine/src/game.ts | WS3 | the roll calls in advancePhase and startDevelopment; monthEvents reset |
| packages/engine/src/politics.ts | WS7 | one roll call at openPlanning's end |
| packages/protocol/src/index.ts, apps/server/src/mule-game.ts | WS3 | EventView fields; phaseEvents reads monthEvents; monthEventView maps; SICK_BECAUSE 'epidemic' |
| packages/engine/src/specials.ts | WS5 | none (formMeteorCrater called as is) |

## §8 · Amendments `[review-only]`

```
AM-1 · 2026-11-04 · Heiko's ruling on the six readings (relayed by the PM: "I go with your picks", the PM's picks)

target    RULE-2 (coldSnap, meteorStrike chances), RULE-3's meteor note, RULE-2's muleTheft note, RULE-4 (epidemic,
          federationGrant, inheritance)
did       1 (a) the meteor strikes after production's output: the MULE produced this month, then is destroyed.
          2 (b) cold snap and meteor strike at the catalogue's 2% ×1.6 = 0.032, as the 29 Oct ruling (WS1 AM-6)
            did for every production base; both named config values. The PM's pick; WS8 had recommended (a).
          3 (a) MULE theft can fire twice a month: 1% in development, 1% at the month end.
          4 (a) epidemic: sick next development only if the player then still holds no Medicine.
          5 (a) the Federation grant is new money (no source).
          6 (a) inheritance by wealth rank: the poorest 300, the richest 100, linear between.
because   Heiko, 4 Nov, through the PM.
goal      G-1 unchanged
```
