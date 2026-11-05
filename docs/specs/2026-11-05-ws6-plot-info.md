# WS6 · Plot info: scan and see, my plots, Analyse says what it found, one 0–3 scale

2026-11-05 · WS6-1 · class **Standard** (Heiko, 5 Nov, on WS6's recommendation: three PRs, one engine rule change by
WS3 and named edits in WS4's and WS2's files, no new contract, no new sole owner) · approach **B** (Heiko, 5 Nov:
"A plus My plots") · report **A, in the side rail** (Heiko, 5 Nov)

**The approved mock is this spec's screens.** The binding scaffold is `design/mocks/plot-info/` at **d3f64a51**
(branch `ws6-mock-auction-rules`; Heiko chose the report in the rail, `#scan-a`; `#scan-b` was set aside). Routes:
`#scan-a` (C2), `#plots` (C3), `#dev-plots` and `#store` (C4), `#analyse` (C5), `#gem` (C7). Where this text and the
mock disagree on layout, components or states, the mock wins. "How it works today", with pictures from the real build:
https://claude.ai/artifact/Ht3DuRAuhuJYLBRFEmubmU (WS6, 5 Nov; Heiko read it and agreed §0 from it).

---

## §0 · Business Goals & Value `[handoff: goal lines and proofs]` `[review-only: who / today / value / cost]`

From Heiko's five points at the table, 5 Nov: "I failed to use the drone … mark two plots first then click on scan and
then I would get a detailed report", "an easy way for me to always look at my lots and see the plots' resources (in
planning and during development)", "only when investing in geology … should I be seeing the resources … plots need
to have a clear marker when they have a special resource like crystite or rare earths", "every resource type should go
from 0 to max 3 per plot". He agreed these goals on 5 Nov ("Goals are right").

**G-1 · I can scan plots with the drone and see at once what they can produce.**
- **Who benefits:** every player in planning, deciding which plot to claim or bid on.
- **Today:** Heiko could not use the drone at the table (5 Nov). It reports only when the land grant starts, and then
  only for the plot lit at that moment (`game.ts::orderGeoDrone`; the land-grant step in `game.ts::advancePhase`,
  `apps/web/src/phone/LandGrant.tsx::droneFoundLine`). `verified_by: executed` (the real build, seed 7, pictures 2–3
  of the write-up).
- **Value:** the 60 cr buy an answer that same planning (which plot to claim next, which lot to bid on) instead of a
  mystery.
- **Proof, UBER-AC-1:** a new player marks two plots, taps Scan and reads both plots' ratings on the same screen
  before pressing Ready, without help.

**G-2 · I can always look at my plots and their resources, in planning and in development.**
- **Who benefits:** every player choosing which MULE to buy and where to put it.
- **Today:** Look shows one plot at a time, its ratings below the fold on a sideways phone; on the walking screen a
  plot's ratings show only while you stand on your own plot (`arcade/parts.tsx::PlotCard`), and the "Your plots" box
  only in the store with an empty MULE, at most 5 plots, in words (`arcade/parts.tsx::PlotsLegend`).
  `verified_by: executed` (pictures 4–5).
- **Value:** the turn's MULEs are planned in seconds instead of by tapping or walking plot to plot; fewer MULEs
  outfitted for the wrong good.
- **Proof, UBER-AC-2:** in planning and during development, one tap from anywhere shows every plot you own with each
  good's rating.

**G-3 · Once I've paid for geology I can read at a glance how good a plot is for each good, and special resources
stand out.**
- **Who benefits:** every player who used the drone or Analyse.
- **Today:** Analyse on a plot you don't own is never put into words; the map shows one good per analysed plot, so
  Crystite and Rare earth hide behind a plot's best good; grown goods run −2..+3 underneath, mined 0..4, drawn as 0–4
  pips (`derive.ts::groundPips`). `verified_by: executed` (picture 5) and `read`.
- **Value:** the geology paid for turns into a decision without arithmetic; the most valuable plots can't be missed.
- **Proof, UBER-AC-3:** shown one analysed plot, five of five testers say correctly which goods it is good for and
  whether it holds Crystite or Rare earth.

**Non-goals** (each needs its own ruling or spec):
- Ratings for other players or the TV: geology stays private (HC-1).
- New production numbers. Heiko's rule 4: the 0–3 scale is the screen's first; the hidden numbers move to 0–3 only if
  WS1's simulator says they hold, as their own piece.
- New ways to learn ratings beyond the drone and Analyse; a geologist anywhere but on the plot (Heiko's rule 3).
- How the computer players choose plots, beyond getting the drone's results earlier (C1).
- One-tap chat phrases mid-phase (PM backlog, 5 Nov).

**Rough cost:** approach B, about 3 PRs (one WS3 engine change of a few lines with its test; the rest phone screens).
The thin baseline, A, about 2 PRs.

## §0.1 · Decision Record `[review-only]`

- **Chosen, B (≈3 PRs):** Scan with an instant report in the rail; My plots in planning and development; a card after
  Analyse; the gem and a 0–3 pip on your map; one 0–3 scale on every screen.
- **Thin baseline, A (≈2 PRs):** the same without My plots. **Lost because** it builds no list of your plots, so
  UBER-AC-2 fails: today no screen lists them with ratings (Look is one plot; the store's box shows only with an empty
  MULE, five rows, words). Checkable in `tools.tsx::LookPanel` and `arcade/parts.tsx::PlotsLegend`.
- **C (≥5 PRs), set aside:** B plus a survey layer on the map, the drone over the TV, and new production numbers. Six
  bars in a ~50 px plot on the sideways phone are ~6 px each (`plot-info` mock, 844 × 390); the numbers wait for WS1.
- **Report, B on the map, set aside (Heiko, 5 Nov):** two callouts cover a sixth of the map, Lena's own plots included
  (`#scan-b`).

## §0.2 · Constraints `[handoff]`

```
HC-1  Ratings stay private: a plot's ground, its dots and its gem reach only the player who did the geology. Never
      the TV, never another phone (MuleGame.viewFor's "only the ground stays private").   source: Heiko rule 2 · breach: fatal
HC-2  No production number changes: ratings, yields and odds stay as config.ts has them; 0–3 is a display rule.
      source: Heiko rule 4 · breach: fatal (needs WS1's sim and Heiko)
HC-3  The drone's fee, plot count and the one-drone-per-planning rule come from config (DEVELOPMENT.droneFee,
      DEVELOPMENT.dronePlots), never inline.                                   source: CLAUDE.md · breach: decision
HC-4  The land's hints stay ("Often good for Water…"), for plots nobody analysed.   source: Heiko rule 1 · breach: decision
```

---

## §1 · Solution Design `[handoff]`

```
C1 · MODIFIED · the drone's results land at Scan, not at the land grant                      owner: WS3 (engine), named edits WS2

today        orderGeoDrone charges the fee and stores droneOrder; the land-grant step copies droneOrder into analysed,
             sets droneFound and clears droneOrder. The planning view has no ground for the plots until then.
             anchors: packages/engine/src/game.ts::orderGeoDrone · game.ts::advancePhase (the `next === 'landGrant'` block)
             · packages/ai/src/actions.ts::DESCRIBED (the drone's words: "their ground is known from the land grant on")
             · packages/ai/src/llm/moves-stub.ts, the drone line (on WS2's ws2-brain, not yet on trunk)
             verified_by: read (engine), executed (the real build)
tomorrow     orderGeoDrone also adds the plots to the player's analysed and sets droneFound, at once; the server's next
             view carries their ground to that player only. droneOrder still marks the drone used until the land
             grant clears it (one drone per planning). The land-grant step only clears droneOrder: it no longer adds
             to analysed or sets droneFound (game.ts::advancePhase, the `next === 'landGrant'` block), and the
             comments on types.ts::droneOrder and types.ts::droneFound ("what droneOrder held when the land grant
             started") say the results land at Scan. WS2's action text says the ground is known at once.
logic        → §2 RULE-4 · evaluated_at: the drone intent · writes: player.analysed, droneFound, money, store capital
seam         game.ts::orderGeoDrone — the one place a drone is paid for; the server's view already sends ground for analysed
senior       junior would: a server-side "scan" event that pushes a report message · senior does: reuse analysed, the
             field every screen already reads, so the report, the map and My plots all follow from one rule change
mechanism    in_place
call sites   apps/server/src/mule-game.ts (intent 'drone'); packages/ai/src/actions.ts (the AI's drone action)
pin          one drone per planning ('A drone is already on its way'), the fee charged once, only free or listed plots:
             engine tests for orderGeoDrone; LandGrant.tsx::droneFoundLine still finds droneFound while a drone plot is lit
depends_on   none
atomicity    with WS2's drone text, actions.ts::DESCRIBED and llm/moves-stub.ts, changed in the SAME PR that makes the
             game do it: Claude is never told something the game does not do yet
```

```
C2 · MODIFIED · Scan and the report, in the rail                                              owner: WS6

today        The Geo drone tool: tap up to 2 free plots, "Send the drone · 2 of 2 plots · 60 cr", then "Your drone is
             on its way … when the land grant starts". The hub's tile says "On its way · read at the land grant".
             anchors: apps/web/src/phone/hub/tools.tsx::DroneSend · tools.tsx::DronePanel · tools.tsx::useDrone ·
             apps/web/src/phone/hub/today.tsx::HUB_SLOTS (the drone tile's sub line)     verified_by: executed
tomorrow     The button reads "Scan · n of 2 plots · 60 cr". After it, the picked plots pulse for about a second
             ("Scanning…"), then the rail shows the Drone report: per plot its land, "best for …" with any Crystite or
             Rare earth, and every good's 0–3 dots (C6), with ONLY YOU. Then "One drone each planning". The hub tile
             says the drone was used this month.
logic        → §2 RULE-1, RULE-2 · the report shows once the view holds ground for every plot in droneOrder
seam         tools.tsx — the drone's map, panel and action are its tool already
senior       junior would: hold the report in client state from the click · senior does: derive it from the view
             (droneOrder plus the tiles' ground), so a rejoin mid-planning shows the same report
mechanism    in_place
call sites   the hub's tool slots (today.tsx::HUB_SLOTS 'drone')
pin          the specials line in the drone rail (e2e specials.ts B-AC-9); the "Pick n more" hint
ux           design/mocks/plot-info · #scan-a · states pick, scanning, report · fixtures to replace: plots.ts DRONE_PICKS,
             GROUND · GRAFT TARGET: apps/web/src/phone/hub/tools.tsx; new apps/web/src/phone/plotInfo.tsx (ScanReport,
             GoodDots, Dots, Gem, OnlyYou)
depends_on   C1 (data, not stubbable for the e2e; stubbable for the component), C6 (the dots)
```

```
C3 · ADDED · My plots, a planning tool beside Look                                             owner: WS6

today        none_exists: no screen lists your plots with ratings (Look is one plot, tools.tsx::LookPanel).
tomorrow     A "My plots" tool: the rail lists every plot the player owns, one compact row each — plot, land, its MULE
             (or "no MULE yet"), six good icons with 0–3 dots, the gem. A plot nobody analysed says "Not analysed:
             walk to it in development and press Analyse." Tapping a row selects the plot on the map; tapping one of
             your plots on the map selects its row.
reuse        neighbours checked: tools.tsx::LookPanel (one plot, a card) and arcade/parts.tsx::PlotsLegend (store only,
             words). Neither lists every plot with ratings; the row component is new and shared with C4.
seam         a new entry in today.tsx::HUB_SLOTS tools, its Map and Panel in tools.tsx
mechanism    sprout
call sites   today.tsx::HUB_SLOTS
ux           design/mocks/plot-info · #plots · GRAFT TARGET: tools.tsx (MyPlotsMap, MyPlotsPanel) using the new
             apps/web/src/phone/plotInfo.tsx's PlotRow (dense)
depends_on   C6
```

```
C4 · MODIFIED · My plots in development: the Plots chip, and the store's box with dots         owner: WS6

today        The walking screen shows a plot's ratings only on your own plot underfoot (PlotCard); the store's "Your
             plots" box (PlotsLegend) shows with an empty MULE, at most 5 rows, in words.
             anchors: apps/web/src/phone/arcade/Develop.tsx::ArcadeDevelop (the status: phone-status-right,
             phone-status-bar) · arcade/parts.tsx::PlotsLegend · arcade/parts.tsx::PlotCard     verified_by: executed
tomorrow     A "Plots ▸" chip in the walking screen's status opens the same list as C3 over the map's right side; the
             colonist keeps its place and the clock runs; the chip closes it. In the store, PlotsLegend's rows carry the
             dots (icons, dense) instead of the suits in words, unanalysed plots "analyse it", "+n more · Plots ▸
             shows all".
seam         Develop.tsx's status (already laid out per size in layout.ts) and parts.tsx's PlotsLegend
mechanism    in_place
pin          the hall's 844 and 667 fits (arcade-screens tests, PlotsLegend ≤ 5 rows above the button)
ux           design/mocks/plot-info · #dev-plots · #store · GRAFT TARGET: arcade/Develop.tsx, arcade/parts.tsx
depends_on   C3 (PlotRow), C6
```

```
C5 · ADDED · Analyse says what it found, any plot                                              owner: WS6

today        After Analyse the walking screen says nothing in words unless the plot is your own and you stand on it
             (PlotCard); on a free or another player's plot only the map's pip changes.
             anchors: arcade/parts.tsx::PlotCard · packages/engine/src/game.ts::analysePlot      verified_by: executed
tomorrow     When a plot's ground arrives in the player's view during development (RULE-3), a card opens beside the
             plot for 6 s: "9·6 · Plains analysed", "best for Food · Crystite 1", every good's dots, ONLY YOU. One
             card at a time; a tap closes it.
logic        → §2 RULE-3
reuse        PlotCard (own plot underfoot) stays; the card reuses the new plotInfo.tsx's GoodDots, not PlotCard, because it shows for
             any plot and away from the colonist
seam         arcade/Develop.tsx's map layer (beside PlotCard)
mechanism    sprout
ux           design/mocks/plot-info · #analyse · GRAFT TARGET: arcade/parts.tsx (AnalyseCard), arcade/Develop.tsx
depends_on   C6
```

```
C6 · MODIFIED · one 0–3 scale on every screen                                                  owner: WS6

today        groundPips draws 0–4 (a grown rating + 1; a mined rating as is). Callers: derive.ts::mapTiles,
             ground.tsx::GroundCard (4 dots), LandGrant.tsx::droneFoundLine, arcade/parts.tsx (PlotCard's dots),
             arcade/plots.ts (bestHere, suits ≥ 3, fit).                                       verified_by: read
tomorrow     groundDots (RULE-1) replaces groundPips everywhere; every dot row draws 3. suits keeps "3 or more", which
             RULE-1 maps to the same plots (grown +2/+3, mined 3/4). The engine's ratings are untouched (HC-2).
logic        → §2 RULE-1
seam         derive.ts::groundPips — the one place a rating becomes dots
mechanism    in_place (rename to groundDots)
call sites   the list above, enumerated by grep (the repo is not prism-indexed)
pin          arcade-screens and land-grant tests that read dots (their counts change from /4 to /3, deliberately)
depends_on   none
```

```
C7 · MODIFIED · the map: a 0–3 pip and the gem                                                  owner: WS4 (named edit), WS6 rules

today        HoloMap draws an analysed plot's best good with 4 pips (`Pips`), labelled "… n of 4"; nothing marks
             Crystite or Rare earth.  anchors: packages/ui/src/components/HoloMap.tsx::HoloMap · HoloMap.tsx::Pips ·
             HoloMap.tsx::MapTile (ground, "Ratings 1 to 4")                                   verified_by: read
tomorrow     Pips draws 3; the label says "of 3". A gem on the plot's top-left corner when its ground has Crystite or Rare
             earth at 1 or more (RULE-2), in that good's colour with its icon; both when both. Only tiles with ground get
             either, so the TV (no ground) never shows one.
logic        → §2 RULE-2
seam         HoloMap's marks — the map every phone and the TV draw
mechanism    in_place
ux           design/mocks/plot-info · #gem (the mock's proposed/PlotInfo.tsx MapMarks, laid over HoloMap) · GRAFT TARGET: HoloMap.tsx
depends_on   C6 (mapTiles passes dots)
```

```
C8 · MODIFIED · Look shows the dots first                                                       owner: WS6

today        LookPanel stacks the special's card above the ground card; on a sideways phone the ratings fall below the
             fold.  anchors: tools.tsx::LookPanel                                               verified_by: executed
tomorrow     The ground card (dots) comes right after the plot's land and owner, above the special and the MULE line.
mechanism    in_place
depends_on   C6
```

**PRs** (each usable at the table on its own): PR-1 C6, C1, C2 (G-1) · PR-2 C3, C4 (G-2) · PR-3 C5, C7, C8 (G-3).

---

## §2 · The Logic `[handoff]`

```
RULE-1 · A rating as 0–3 dots (Heiko's rule 4, the screen first)                     shape: decision table

inputs     good · RawGood · closed: food, water, energy, smithore, crystite, rareEarth
           rating · integer · grown −2..+3, mined 0..4 (config.ts GROWN_ODDS_MIN, MINERAL_ODDS)

  #   good                          rating           dots
  1   food, water, energy           −2 or −1         0      (makes 1 a month, the floor)
  2   food, water, energy           0                1      (makes 2)
  3   food, water, energy           +1               2      (makes 3)
  4   food, water, energy           +2 or +3         3      (makes 4–5)
  5   smithore, crystite, rareEarth 0                0      (nothing to mine)
  6   smithore, crystite, rareEarth 1, 2             1, 2
  7   smithore, crystite, rareEarth 3 or 4           3      (a meteor crater's 4 shows 3)

unknown    no ground for the plot (not analysed) means "not known", never 0: no dots are drawn, the land's hint shows (HC-4).
examples   food +3 → 3 · water −2 → 0 · energy 0 → 1 · crystite 4 → 3 · rareEarth 0 → 0
```

```
RULE-2 · The gem                                                                     shape: formula, per plot

gems(plot) = [g in (crystite, rareEarth) where dots(g, plot.ground[g]) ≥ 1]
           — empty when the plot has no ground in this view (so never on the TV, never on another player's plot)
best(plot) = the good with the most dots, Food, Water, Energy, Smithore, Crystite, Rare earth on a tie
examples   ground crystite 2, food +3 → best Food, gem Crystite · no ground → no gem, no pip
```

```
RULE-3 · When the Analyse card shows                                                 shape: decision table, per view

inputs     the plot whose ground is in this view but was not in the previous one; the phase; the source
several rows match → first wins

  #   when                                                      then
  1   the phase is not development                              no card (the drone's report is C2's)
  2   the plot is in this player's droneFound                   no card
  3   it is the first view since this page loaded (a rejoin)    no card
  4   otherwise                                                 card for 6 s; a newer one replaces it

examples   Analyse on free 9·6 → card · a rejoin mid-development → no card · the drone at Scan in planning → no card
```

```
RULE-4 · The drone (C1)                                                              shape: sequence

planning, intent drone(plots):  phase is planning · no drone this planning (droneOrder empty) · 1..dronePlots plots ·
  each free or listed · money ≥ droneFee  → money −= droneFee · store.capital += droneFee · droneOrder = plots ·
  analysed ∪= plots · droneFound = plots
landGrant start:  droneOrder = [] (droneFound kept for the month, H-3)
errors (unchanged):  'A drone is already on its way' · 'Pick 1 to 2 plots' · 'The drone only flies over free or listed
  plots' · 'Not enough money'
```

---

## §3 · Contracts & Data Models

No contract shape changes. The view's `TileView.ground`, `MyView.droneOrder` and `droneFound` keep their types; what
changes is when ground arrives (C1, at the drone intent instead of the land grant). `MapTile.ground` stays a
`Partial<Record<Good, number>>`, now 0–3 (its doc changes with C7).

## §4 · Failure & Ops

No external dependency: every change is in-process. A refused drone intent answers with today's RuleError words.

## §5 · Delivery

Code-only. A game in progress picks up the new rule at its next planning; a drone ordered before the deploy still
lands at the land grant (droneOrder is kept until then).

## §6 · Acceptance Criteria `[handoff]`

| id | Given · When · Then | changes | observed_at | negative |
|---|---|---|---|---|
| B-AC-1 (UBER-AC-1) | Given planning and two free plots picked in the Geo drone · When the player taps Scan · Then within 2 s the rail shows the Drone report with both plots, each good's 0–3 dots and its "best for" line, 60 cr are gone, before Ready | C1, C2, C6 | the phone's rail (`scan-report`) in a browser e2e, and the server's view for that seat holding both plots' ground | the TV view and the other seats' views hold no ground for those plots; a second Scan in the same planning is refused |
| B-AC-2 (UBER-AC-2) | Given a player owning plots, some analysed · When they open My plots in planning, or tap Plots on the walking screen · Then every plot they own is listed once, analysed ones with each good's 0–3 dots and the gem, the others with "Not analysed …" | C3, C4 | the rows (`plot-row-x-y`) on the phone in a browser e2e, against the view's owned tiles | another player's plot is never listed |
| B-AC-3 (UBER-AC-3) | Given development · When the player analyses a free plot holding Crystite · Then within 1 s of the assay's end a card shows that plot's dots and "best for … · Crystite n", and the map shows the Crystite gem on it | C5, C7, C6 | the phone's `analyse-card` and the map's gem in a browser e2e | the TV's map and another player's phone show no gem and no dots for that plot |
| T-AC-1 (serves B-AC-1) | orderGeoDrone adds the plots to analysed and droneFound at once, charges once, refuses a second order until the land grant clears droneOrder | C1 | engine unit test on the state | an owned unlisted plot is refused with today's words |
| T-AC-2 (serves B-AC-1..3) | RULE-1 as a pure function, every row | C6 | groundDots | an unanalysed plot draws no dots |
| T-AC-3 (serves B-AC-3) | RULE-2: HoloMap draws a gem only for tiles with ground and Crystite or Rare earth ≥ 1, and a 3-dot pip | C7 | the rendered map | a tile without ground (the TV) has no gem and no pip |
| T-AC-4 (serves B-AC-3) | RULE-3 as a pure function over two views, every row | C5 | the function's answer | a rejoin and a drone's plots give no card |

## §7 · Risks & Spikes `[review-only]`

- **R-1 · The computer players learn the drone's results in planning, not at the land grant.** Claude-driven players
  (packages/ai) may now pick land from them. Mitigation: WS1 runs `pnpm sim` on both seed sets before PR-1 merges, and
  WS2's action text says the truth (C1).
  WS1's read, 5 Nov: the strategist orders drones in its planning part and reads ground only at the grant, so none
  of its decisions sees different information; the 0–3 scale is display-only (HC-2). WS1 confirms with a
  byte-identical `pnpm sim` on both seed sets once PR-1 has a head. Claude-driven players stay WS2's to check (C1).
- **R-2 · Dot counts change in existing tests** (0–4 → 0–3). Mitigation: C6 changes them in the same PR, named.
- No spike needed.

## §8 · Amendments `[review-only]`

- 5 Nov, from the lane reads before approval: C1's land-grant step stops setting droneFound and the two types.ts
  comments change (WS3); WS2's drone text includes llm/moves-stub.ts and ships in the same PR as the engine change
  (WS2); R-1 records WS1's sim read (WS1).

## §9 · Ownership Boundaries

No ownership change: the engine's drone stays WS3's, HoloMap WS4's, packages/ai WS2's, the phone screens WS6's.
