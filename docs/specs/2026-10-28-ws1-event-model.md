# WS1 · The event model: every event on its own dice

**Status:** DRAFT for the PM's goal gate (§0), then Heiko. Input: Heiko's approved **M.U.L.E. Event Catalogue**
(Claude Doc, project 96559f00-c6d7-41f2-8d1b-bc911b9383fc, rev 16, 28 Oct 2026) and his rulings of 28 Oct.
**Owner:** WS1 (`packages/engine/src/events.ts`, the `EVENTS` config block). **Class (proposed):** Standard; the PM
picks. **Scope of this spec:** wave 1. Waves 2, G-5 and Later each get an amendment and their own PR.

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
- Wave 2's twelve new events, the Goal 5 mood events and every row under "Later" (each its own amendment and PR).
- Changing any event's effect (wave 1 moves events onto their own dice only).
- Showing several events on the screens: the phone and TV read `events[0]` today (TvProduction.tsx, Production.tsx,
  ProductionMap.tsx). WS6 owns that surface; wave 1 needs it before it reaches a table (§9).
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
             events.ts::rollPhase(state, phase) rolls the phase's colony rows once and its player rows once a player
             (cavern collapse: once a cavern plot), and returns what fired, in table order.
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
pin          T-AC-3..T-AC-6 of the WS1 events spec (each event's effect) keep passing unchanged
depends_on   C1
```

```
C3 · MODIFIED · personal events roll per player, and bad luck leans on wealth

today        pest swarm, wildfire and bumper harvest are colony picks; pickStart starts a bad one on the leader's
             land with chance targetBias, a good one on the trailing player's.
             anchors: events.ts::pickStart, EVENTS.targetBias                               verified_by: read
tomorrow     each rolls per player and starts on that player's plots; the richest and poorest (cash plus land)
             read the rows' wealth-rank raises and lowers. targetBias goes.
depends_on   C1
```

```
C4 · MODIFIED · cavern collapse rolls on the table

today        specials.ts (WS5's) collapses a cavern that produced Crystite with its own 6% roll.
             anchors: specials.ts (crystalCavern, collapses)                                verified_by: read
tomorrow     a row in EVENTS.colony, once per cavern plot that produced Crystite this month; specials.ts asks
             rollPhase's answer instead of rolling. Named edit in WS5's file; WS5 reviews.
pin          specials.test.ts T-AC-6 (WS5's) keeps passing unchanged: the same (seed, month, plot) collapses the
             same; never on a what-if copy; only in a month the cavern is mined; independent of the month's other
             events (a month with a production event collapses at the same rate); about 6% a mined cavern-month,
             within ±30%. The roller's seed for a cavern is its own (seed, month, plot), never shared with another row.
depends_on   C1
```

```
C5 · MODIFIED · the month report and the sim count every event

today        MonthReport.events holds 0 or 1 event; the sim prints events in N% of months.
tomorrow     MonthReport.events holds every event that fired, each with its phase; the sim prints events per
             month by phase and for the month, and the share of months with 0, 1, 2, 3, 4+ (UBER-AC-1).
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
unknown         a missing influence reads 0; no last month (month 2) means no last-month raise
examples        dust storm in any air 5% · drought in Toxic air 7% · sickness for a player who caused 5 air points,
                clean air: 3 + 15 = 18% · the same player in Collapse with 20 points: 3 + 50 + 40 = 93 → 90%
```

```
RULE-2 · What fires in a phase                                                shape: sequence

1  month 1 or a what-if copy → nothing
2  colony rows for the phase roll once each, in table order; then player rows once a player, in seat order
3  a row whose "only if" finds nothing to hit fires nothing (a flood needs a river farm; pests need a Food plot)
4  excludes: if both of a pair fired, the seeded dice keep one (drought/flood, dust storm/solar flare)
5  onceAMonth (default true): a row that fired earlier this month doesn't fire again
6  effects apply in the order fired; two on one plot both apply; output never below 0
seeds           each roll from (seed, month, phase, row key, and the player or plot), so a replay is exact
```

## §3 · Contracts & Data Models `[handoff]`

MonthEvent · MODIFIED · not breaking: gains `phase: Phase`. MonthReport.events may now hold several events; readers
that take `events[0]` keep working but show only the first (WS6, §9). Example: a production month with a drought
and a pest swarm on p2's farms gives two MonthEvents, both phase 'production', in that order.

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
| T-AC-5 | Each of the ten events and cavern collapse has the same effect as today on the same plots (pins the WS1 events spec's T-AC-3..6) | eventOutput / the plots | — | C2, C4 |

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

## §8 · Amendments `[review-only]`

(none yet)

## §9 · Ownership Boundaries `[handoff]`

No ownership change: events.ts and EVENTS remain WS1's. Named edits: `specials.ts` (WS5, C4), any phase hook in
`game.ts` (WS3) for later waves. WS6 owns showing several events on the phone and TV (readers of `events[0]`), and
wave 1 reaches a table only with that change.
