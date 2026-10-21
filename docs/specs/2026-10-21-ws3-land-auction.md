# WS3 · Land auction: plots and MULEs sold at a live auction

**Lane:** WS3 Auctions · **Class:** Programme · **Status:** DRAFT. §0 is approved; the D1–D8 design is approved with the PM's edits. Mocks are in review: the walk layout (A/B) is with Heiko, and the remaining screens come after his pick. **Serves Mission Goal G-3.**
**Branch:** `ws3-auctions` (base `feat/strategist` 145925e) · **Mocks:** `design/mocks/land-auction/` · **Rulings:** relayed by the PM ("Mule next-gen"), 2026-10-21.

---

## §0 · Business Goals & Value `[handoff: goal lines and proofs]` `[review-only: who / today / value / cost]`

Approved as drafted on 2026-10-21 (PM, for Heiko). Both goals trace to Mission G-3: a family plays a whole game at the kitchen table, with land and MULEs sold at live auctions.

**G-1 · A player can turn a plot or a MULE they no longer want into money, at a live auction everyone at the table can bid in.**
- *Who benefits:* every player at the kitchen table, seller and bidders alike.
- *Today:* impossible. `MuleIntent` has no listing move, land changes hands only through the free land grant, and the only MULE a player holds is the one led during development, which runs off at its end. A plot on bad ground or a misplaced MULE is stuck for the whole game. (verified_by: read: `packages/protocol/src/index.ts::MuleIntent`, `packages/engine/src/game.ts::claimPlot`, `packages/engine/src/game.ts::advancePhase`)
- *Value:* a bad bet becomes cash, and the plot that completes a rival's cluster gets fought over in front of everyone. That is the table moment `docs/design/00-concept.md` ("The asset auction") promises.
- **UBER-AC-1:** in a seeded game, a human lists a plot with a minimum in planning. At the land auction, two other seats bid on phone and /table, and the plot goes to the highest bidder at their bid. The money moves, less sales tax.

**G-2 · AI seats bid on every lot like a sensible player and never hold the game up.**
- *Who benefits:* a family playing with fewer humans than seats.
- *Today:* AI hands exist only for the land grant (`packages/ai/src/seat.ts::AiSeat`) and the goods auction (`packages/ai/src/hands/auction.ts::AuctionHand`). (verified_by: read)
- *Value:* a listing gets real competition even with one human, so the seller gets a fair price.
- **UBER-AC-2:** in a seeded server test where every AI seat bids on a listed plot and a listed MULE, no AI pays more than its `plotValue`/`muleValue` (stubbed until WS1 exports them), and the phase ends on its own clock with `ANTHROPIC_API_KEY` unset.

**Non-goals:**
- Colony plots under the hammer (00-concept's "three or four more each month"). The lots are shaped so the colony can be a seller, and `LOTS.colonyPlots` stays 0. Switching it on is a later, measured change agreed with WS1, because it moves G-1's land supply. *Needs its own spec.*
- AI seats listing their own lots: that needs WS1's sell-side value.
- Direct trades between players, deal cards, and selling plot upgrades on their own.
- Balance numbers outside the LOTS block.

**Rough cost:** the chosen approach is about 4 PRs (engine · protocol, server and AI hand · web screens behind approved mocks · e2e steps). The thin baseline is about 3 PRs (§0.1).

### §0.1 · Decision Record `[review-only]`

- **Chosen (approach 2), ~4 PRs.** The land auction gets its own phone screen `LandAuction.tsx` and table view `TvLandAuction.tsx`, as new WS3 files with one route line each. Each lot gets an intro and a sold/unsold moment, and listing gets a Sell tab in Planning.
- **Thin baseline (approach 1), ~3 PRs.** Draw lots inside the existing goods `Auction.tsx` and `TvAuction`, branching on what is sold, and put listing in Planning's Colony tab. **It loses because** both screens are written around a good: they read `auction.good` unconditionally, render `StatusTable` and the Buyer/Seller/Pass switch, and draw store and ship lines (check: `apps/web/src/phone/Auction.tsx::Auction`, `apps/web/src/table/TableApp.tsx::TvAuction`). A lot has none of these, so every line gets a branch. `TvAuction` also lives in `TableApp.tsx`, which WS4 owns.
- **Large (approach 3), 6+ PRs.** Put the goods and land auctions on one shared stage machine, plus a developer view of AI limit lines. Rejected because it rewrites the working goods auction and serves no Mission Goal.
- **Sale rule (Q2).** The original's land auction: buyers walk up, and the highest bid at or over the minimum wins at the bell. The goods rule, where a lot sells the moment a bid meets the ask, loses because with one unit the first buyer to touch the ask takes it at the ask, so bidders never outbid each other.

### §0.2 · Constraints `[handoff]`

```
HC-1  packages/engine stays pure: no I/O, no Date.now(), no Math.random(). Seeded RNG only.
      source: CLAUDE.md                                           breach: fatal
HC-2  Every number lives in config.ts's LOTS block (WALK numbers are reused, not copied).
      source: CLAUDE.md, SEAMS.md                                  breach: fatal
HC-3  An AI never bids above min(money − cashReserve, plotValue | muleValue), and never
      above its money. The lot hand makes no LLM call.
      source: SEAMS.md WS1→WS3 contract, PM edit 2 (2026-10-21)    breach: fatal
HC-4  Edit only WS3's owned paths, plus the named edits E1–E4 (§9).
      source: SEAMS.md                                             breach: needs decision
HC-5  No standing servers: tests own their stack; the mock is served on :5313 only while
      under review.
      source: CLAUDE.md (2026-08-10), PM                           breach: needs decision
HC-6  Rules errors throw RuleError, which the server turns into a message for the player.
      source: CLAUDE.md                                            breach: fatal
```

---

## §1 · Solution Design `[handoff]`

The engine owns everything about lots in one new module, `packages/engine/src/lots.ts`. `game.ts` only calls into it from the phase flow. The server steps it on the existing auction tick, the AI gets one more hand, and the web gets one new screen per surface.

```
C1 · ADDED · listing a plot or a MULE in planning
today        none. MuleIntent has no listing; GameState has no listings.
             anchors: packages/protocol/src/index.ts::MuleIntent, packages/engine/src/types.ts::GameState
             verified_by: read
tomorrow     MUST let a player list a plot they own, or the MULE on one, with a minimum and an
             unsold choice ('store' | 'keep'), during planning only. MUST let them unlist it
             during planning. MUST hold listings on GameState, in listing order.
logic        → §2 RULE-1
seam         packages/engine/src/lots.ts (new): listPlot/listMule/unlist — beside game.ts,
             because the phase and the board need the same state
senior       junior would: add listing fields to Tile. · senior does: keep one Listing list
             on GameState, which C3 consumes in order and which carries a 'colony' seller for
             later. A Tile flag can't express "the MULE on this plot", or listing order.
mechanism    sprout
call sites   new; reached from apps/server/src/mule-game.ts::MuleGame (C7, intents list/unlist)
reuse check  grep -rni -e listing -e forSale -e "for sale" -e "'sale'" packages/*/src apps/*/src
             (run 2026-10-21) → economy.ts::storeForSale (the store's goods stock, unrelated) and
             HoloMap's flag 'sale' (a drawing flag, reused by C9/C10). No listing code. Nearest neighbour:
             game.ts::orderGeoDrone (a planning-phase order on GameState), whose shape this follows.
depends_on   C5 (data: LOTS numbers)
```

```
C2 · MODIFIED · a landAuction phase after the land grant, skipped when nothing is listed
today        ORDER is planning → landGrant → development → production → auction → upkeep.
             anchors: packages/engine/src/game.ts::advancePhase, packages/engine/src/types.ts::Phase
             verified_by: read
tomorrow     MUST add 'landAuction' to Phase, between 'landGrant' and 'development'.
             MUST pass straight through to 'development' when there are no listings.
             MUST clear the month's listings when the phase ends.
logic        → §2 RULE-2
seam         game.ts::advancePhase — the one place phases change
senior       junior would: have the server decide to skip the phase. · senior does: skip in
             the engine, so the sim (packages/ai/src/play.ts) and the tests never see an empty
             landAuction and need no change while the AI doesn't list.
mechanism    in_place
call sites   game.ts::advancePhase is called from apps/server/src/mule-game.ts::MuleGame
             (nextPhase), packages/ai/src/play.ts (sim loop), packages/engine/test/*.test.ts
             (toPhase), apps/server/test/mule-game.test.ts. (grep; the repo is not prism-indexed)
pin          the existing phase order when nothing is listed: packages/engine/test/rules.test.ts
             toPhase walks it today; add an explicit "no listings ⇒ landGrant → development" test.
depends_on   C1 (data)
atomicity    must ship with C6's Phase in the view and E1 (PHASE_NAME), or apps/web stops typechecking
```

```
C3 · ADDED · one lot at a time on the walk board; highest bid at the bell wins
today        walk.ts's board is generic over "a lot with a seller minimum", but only the goods
             auction uses it, and it trades the moment a bid meets an ask.
             anchors: packages/engine/src/walk.ts::stepBoard, packages/engine/src/walk.ts::WalkMarket,
             packages/engine/src/auction.ts::stepAuction
             verified_by: read
tomorrow     MUST run each listing as a lot: intro → walk → result, then the next lot.
             MUST make every eligible non-seller a buyer, and resolve at the bell to the
             highest bid ≥ minimum (tie: first there, then seat order).
             MUST move the plot (with its MULE, filter, run months) or the MULE (into the
             winner's hand), pay through taxSale, or apply the unsold choice.
logic        → §2 RULE-3, RULE-4, RULE-5
seam         lots.ts: startLandAuction / stepLandAuction / lotDone, with LandAuction extends WalkBoard
senior       junior would: copy auction.ts's stage machine and write a second walker. · senior
             does: reuse stepBoard for movement and the clock, with a WalkMarket that has no
             sellers and no houses (units() = 0, houseSells null, houseBuys []), so stepBoard
             never trades and can't sell on meet. lots.ts adds only the money cap and the
             resolution at the bell.
mechanism    sprout (over walk.ts, unchanged)
call sites   new; stepped from apps/server/src/mule-game.ts (C7) and from engine tests
reuse check  stepBoard / takeSide / tradePossible in walk.ts are the movement, clock and board
             (reused). auction.ts's live()/finishGood are goods-specific (not reused: a lot has no
             status screen, declare, store or ship).
depends_on   C1 (data), C5 (data)
```

```
C4 · MODIFIED · the geo drone may fly over listed plots
today        orderGeoDrone rejects any owned plot: "The drone only flies over free plots".
             anchors: packages/engine/src/game.ts::orderGeoDrone
             verified_by: read
tomorrow     MUST accept a plot that is listed this month, owned or not. Results arrive at the
             land grant as today, before the land auction.
logic        → §2 RULE-1 (row "drone")
seam         game.ts::orderGeoDrone, its single owner check
senior       junior would: show the seller's analysis to bidders. · senior does: keep analyses
             private and let each bidder buy their own reading.
mechanism    in_place
call sites   apps/server/src/mule-game.ts::MuleGame.handle ('drone'), apps/web/src/phone/Planning.tsx (DroneMap)
pin          a free plot is still accepted; an owned, unlisted plot is still refused (new tests)
depends_on   C1 (data)
```

```
C5 · ADDED · the LOTS block in config.ts
today        none. WALK holds the goods auction's numbers.  anchors: packages/engine/src/config.ts::WALK
             verified_by: read
tomorrow     MUST hold perPlayer (2), maxLotsPerMonth (4), introMs (3000), walkMs (12000),
             resultMs (2500), boardLow/boardHigh (board range as shares of the minimum),
             storePlotShare (2/3 of GAME.plotScore), storeMuleShare (0.5), colonyPlots (0).
seam         config.ts, a new LOTS block (WS3's, per SEAMS.md)
senior       junior would: put a fixed storePlotPrice of 200. · senior does: take a share of
             GAME.plotScore (WS1's PR #11), so it can't drift past the score if the score changes.
             storePlotShare and storeMuleShare are flagged to WS1 as touching land supply.
mechanism    sprout
call sites   lots.ts (C1, C3), mule-game.ts (C7 view), web screens (C9–C11, via the view only)
depends_on   none (GAME.plotScore landed with WS1's PR #11, merged into feat/strategist at aa84a1b)
```

```
C6 · MODIFIED · the protocol carries listings, lot slots and the live land auction
today        MuleView has `auction` for goods only; no listing intents.
             anchors: packages/protocol/src/index.ts::MuleView, packages/protocol/src/index.ts::MuleIntent
             verified_by: read
tomorrow     MUST add intents list / unlist; MUST add MuleView.listings, lotSlots, landAuction
             (§3). Walk and Done reuse the existing 'walk' and 'ready' intents.
seam         packages/protocol/src/index.ts (WS3's)
mechanism    in_place (additive)
call sites   apps/server/src/mule-game.ts (viewFor, handle), apps/web/src/** (through usePhoneGame / TableView)
depends_on   C1, C3 (data shapes)
```

```
C7 · MODIFIED · the server runs the land auction
today        handle() routes intents by type; enterPhase schedules a timer per phase, the
             auction its own tick; checkAllReady skips the auction.
             anchors: apps/server/src/mule-game.ts::MuleGame, apps/server/src/mule-game.ts::PHASE_MS
             verified_by: read
tomorrow     MUST route list/unlist; route 'ready' and 'walk' to lots.ts during landAuction.
             MUST run landAuction on a tick like the goods auction (WALK.tickMs, no phaseEndsAt),
             count away players as done, and step each AI's LotHand. MUST put each lot's result
             in the news and build MuleView.landAuction. MUST honour WS4's test-only phaseScale
             as the goods auction tick does (dt / phaseScale after the stall clamp, to the hands
             and to stepLandAuction), so the e2e stays fast.
logic        → §2 RULE-4 (done), RULE-6 (AI)
seam         mule-game.ts: handle, enterPhase, a new scheduleLandAuctionTick beside scheduleAuctionTick
senior       junior would: give landAuction a PHASE_MS timeout. · senior does: let the lots'
             own clocks end it, as the goods auction does, and exclude it from PHASE_MS and
             checkAllReady, so a slow phone can't end a lot early.
mechanism    in_place
call sites   server.ts constructs MuleGame (unchanged by WS3); kept on merge: WS2's edits
             (constructor brain, start() decider/onDecision, heard(), brain.finish on gameOver)
             and WS4's (maxMonths/phaseScale options, species in start(), `picks: SPECIES` in
             server.ts, phaseScale in scheduleAuctionTick and startDevelopment).
pin          apps/server/test/mule-game.test.ts (existing phase walk) stays green with no listings
depends_on   C2, C3, C6 (contract), C8
```

```
C8 · ADDED · AI seats bid on lots
today        AI hands: develop and goods auction only.  anchors: packages/ai/src/hands/auction.ts::AuctionHand
             verified_by: read
tomorrow     MUST bid up to limit = max(0, min(money − cashReserve(obs, mind), value)), where
             value is plotValue(obs, mind, index) or muleValue(obs, mind). It re-aims after the
             level's reaction time, stops when leading needs more than its limit, and never
             makes an LLM call.
logic        → §2 RULE-6
seam         packages/ai/src/hands/lot.ts (new, WS3), held per AI seat in mule-game.ts and fed
             by AiSeat's public brain/mind — seat.ts (WS1's) is untouched.
senior       junior would: reuse AuctionHand with a fake good. · senior does: a separate,
             smaller hand, since the lot has one side and one unit and ends at the bell; it
             reuses AuctionHand's reaction-time and jitter idea and the level's reactMs.
mechanism    sprout
call sites   mule-game.ts (C7); later packages/ai/src/play.ts once colony plots exist (non-goal)
reuse check  plotValue/muleValue don't exist yet (WS1 confirmed 2026-10-21) → stubs in lot.ts:
             plot = GAME.plotScore + mulePrice if it has a MULE; MULE = mulePrice. Replaced by
             WS1's exports, same signatures.
depends_on   C3 (data); WS1 plotValue/muleValue (contract, stubbable); WS1 cashReserve (exists)
```

```
C9 · MODIFIED · Planning gets a Sell tab
today        three tabs: Colony, Geo drone, Chat.  anchors: apps/web/src/phone/Planning.tsx::Planning
             verified_by: read
tomorrow     MUST add a 'Sell' tab: the month's public line-up with slots left, then pick one of
             your plots, choose plot or MULE, minimum, unsold choice, list / unlist.
ux           mock design/mocks/land-auction/src/screens/PhoneSell.tsx · routes #sell-empty,
             #sell, #sell-full · approved at <commit, pending> · GRAFT TARGET:
             apps/web/src/phone/Planning.tsx
mechanism    fill_scaffold
depends_on   C6 (contract)
```

```
C10 · ADDED · the phone's land auction screen
today        none; the phone routes by phase.  anchors: apps/web/src/phone/PhoneApp.tsx::PhoneApp
             verified_by: read
tomorrow     MUST show the lot's intro, the walk and the result, and the seller's own view.
             One route line in PhoneApp.tsx (SEAMS allows it).
ux           mock design/mocks/land-auction/src/screens/PhoneWalkA.tsx | PhoneWalkB.tsx — walk
             layout pending Heiko's pick; intro, result and seller view built after it ·
             GRAFT TARGET: new apps/web/src/phone/LandAuction.tsx (+ lot parts into
             apps/web/src/components/AuctionParts.tsx; Hold exported from Auction.tsx, E3)
mechanism    fill_scaffold
depends_on   C6 (contract), C12 (done)
```

```
C11 · ADDED · the big screen's land auction
today        TableApp shows the goods auction in TvAuction; nothing for lots.
             anchors: apps/web/src/table/TableApp.tsx::TvGame
             verified_by: read
tomorrow     MUST show the lot lit on the map with its seller, minimum and the live board, then
             the result. One route line in TableApp.tsx; TvHeader exported (E2).
ux           mock pending (built to the walk choice) · GRAFT TARGET: new apps/web/src/table/TvLandAuction.tsx
mechanism    fill_scaffold
depends_on   C6 (contract)
```

```
C12 · MODIFIED · the walk board draws extra price lines — DONE (b23655a, WS4 reviewed as 12f4ecf before a rebase)
today        only storeBuys, storeSells and shipPays.  anchors: packages/ui/src/components/WalkBoard.tsx::WalkBoard
tomorrow     optional `lines?: { id; label; price }[]`, drawn like the store's; callers unchanged.
mechanism    in_place
```

```
C13 · ADDED · e2e auction steps
tomorrow     MUST provide, in apps/web/e2e/auction-steps.ts, functions WS4's smoke.ts hooks call:
             list a plot on one phone in planning, bid on two seats, and assert owner and money
             after the bell (UBER-AC-1).
seam         apps/web/e2e/auction-steps.ts (new, WS3) — smoke.ts stays WS4's
mechanism    sprout
depends_on   C7, C9, C10
```

---

## §2 · The Logic `[handoff]`

```
RULE-1 · Can this listing be made?                              shape: decision table
inputs  phase · item.kind (plot|mule) · tile.owner · tile.outfit · listed (this plot,
        either kind) · mine (this player's listings) · total (all listings) · minimum
first match wins
  #  when                                              then
  1  phase ≠ planning                                  RuleError "Listings are made in planning"
  2  tile is the store, or not a plot                  RuleError "Not a plot"
  3  tile.owner ≠ player                               RuleError "Not your plot"
  4  item.kind = mule and tile.outfit is null          RuleError "No MULE on that plot"
  5  listed                                            RuleError "That plot is already up for auction"
  6  mine ≥ LOTS.perPlayer                             RuleError "You can list 2 lots a month"
  7  total ≥ LOTS.maxLotsPerMonth                      RuleError "The auction is full this month"
  8  minimum not a whole number ≥ 1                    RuleError "Pick a minimum of 1 or more"
  9  otherwise                                         append the listing; storePays fixed now
unlist: only the seller, only in planning; else RuleError.
drone (C4): a plot is a drone target when it is free OR listed this month.
examples  list own plot 250/keep → listed · 5th listing in a month → "full" · list the MULE
          of a plot whose plot is listed → "already up" · list in landGrant → refused
```

```
RULE-2 · Entering and leaving the land auction                  shape: sequence
  advancePhase from landGrant:
    listings = 0        → phase = development (as today; no landAuction state)
    listings > 0        → phase = landAuction; first lot comes up in its intro
  last lot's result ends → stage 'over' → the server calls advancePhase → development;
                            listings cleared
  endLandAuction (phase cut short, e.g. a test): every remaining lot resolves "unsold, kept"
                            — nobody's money or land moves without a bell.
examples  no listings → landGrant → development · 1 listing → landAuction → development
```

```
RULE-3 · Who is a buyer on this lot                             shape: decision table
inputs  player = seller? · money ≥ minimum? · lot is a MULE and player.carriedMule ≠ null?
  #  when                                   then
  1  player is the seller                   not on the board (watches)
  2  money < minimum                        aside 'money' (shown as PASS)
  3  MULE lot and already leading a MULE    aside 'mule'
  4  otherwise                              buyer, starting at board lo (under the minimum)
evaluated_at  the lot's intro → walk switch; not re-evaluated mid-walk (money can't change
              during a walk: there are no trades until the bell)
```

```
RULE-4 · When a lot's walk ends                                 shape: decision table
  #  when                                                     then
  1  clock ≤ 0                                                bell → RULE-5
  2  every buyer pressed Done (or is away)                    bell → RULE-5
  3  no buyers at all (everyone aside)                        bell at once → RULE-5 (no leader)
  4  otherwise                                                keep walking
Movement: lots.ts calls stepBoard with the lot market (no sellers, no houses), then caps each
buyer's price at their money. Walking again takes back a Done (as at the goods auction).
```

```
RULE-5 · Resolution at the bell                                 shape: decision table
inputs  leader = highest rounded bid ≥ minimum (tie: earliest `since`, then seat order) | none
        unsold ∈ {store, keep} · store.capital ≥ storePays?
  #  when                              then
  1  leader                            winner.money −= bid; seller.money += taxSale(bid)
                                       (colony seller: store.capital += bid).
                                       plot: owner = winner; MULE, filter, runMonths stay.
                                       MULE: tile.outfit = null, runMonths = 0;
                                             winner.carriedMule = outfit (runs off if not
                                             installed in development — existing rule).
  2  none, unsold = keep               nothing moves
  3  none, unsold = store, store pays  plot: seller.money += storePays; owner = null, outfit = null,
                                             store.mules++ (its MULE back to the corral).
                                       MULE: seller.money += storePays; tile.outfit = null,
                                             runMonths = 0; store.mules++.
                                       store.capital −= storePays.
  4  none, unsold = store, store can't pay   as row 2 (kept)
storePays: plot = round(LOTS.storePlotShare × GAME.plotScore); MULE = round(LOTS.storeMuleShare
           × mulePrice), both fixed at listing time.
unknown   leader none means "no bid reached the minimum", NOT "no buyers". Both resolve the same.
invariant  money is conserved: winner's loss = seller's gain + tax (+ store side on rows 3).
           A plot never ends with two owners; a MULE never ends both on a plot and in a hand.
examples  bids 310 (Ossa) and 290 (Lena), min 250 → Ossa pays 310, Brix gets 294 (5% tax,
          round(15.5) = 16)
          · 250 = 250 → sold at 250 · both 300, Lena first → Lena · 240 < 250, keep → nothing
          · unsold store, capital 100 < 200 → kept · MULE to a bidder who leads one → never a buyer
```

```
RULE-6 · How an AI bids                                         shape: formula + rules
limit = max(0, min(money − cashReserve(obs, mind), value))
        value = plotValue(obs, mind, index) | muleValue(obs, mind)     (stub until WS1)
limit < minimum or not a buyer           → stand still, press Done
leading                                  → stand still
not leading and leaderBid + 1 ≤ limit    → walk up until its rounded bid > leaderBid
otherwise                                → stop, press Done
It re-aims only after the level's reactMs plus seeded jitter, and starts after a seeded delay,
so there is no fixed habit to read.
```

---

## §3 · Contracts & Data Models `[handoff]`

The machine-readable proposal is `design/mocks/land-auction/src/proto.ts`; the mock is typed against it. All changes are ADDED and non-breaking for existing consumers, except `Phase`, which gains a member (→ E1 in `derive.ts`).

| contract | change_kind | breaking | produced by |
|---|---|---|---|
| `MuleIntent` + `{type:'list', item:{kind,x,y}, minimum, unsold}` · `{type:'unlist', id}` | ADDED | no | C6 |
| `MuleView.listings: ListingView[]` (public) | ADDED | no | C6 |
| `MuleView.lotSlots: {used, max}` | ADDED | no | C6 |
| `MuleView.landAuction: LandAuctionView \| null` | ADDED | no | C6 |
| `Phase` + `'landAuction'` (engine, mirrored in the view) | MODIFIED | for `Record<Phase,…>` users: derive.ts PHASE_NAME (E1), mule-game.ts PHASE_MS | C2 |
| `GameState.listings`, `GameState.landAuction` (engine) | ADDED | no | C1, C3 |
| `WalkBoard` `lines?` | ADDED | no | C12 (done) |

Worked example: `ListingView` `{ id: 'l2', seller: 'brix', item: { kind: 'plot', x: 5, y: 3 }, minimum: 250, unsold: 'keep', storePays: 200 }`. `LandAuctionView` mid-walk: `design/mocks/land-auction/src/fixture.ts::WALK`.

## §4 · Failure & Ops `[handoff]`

| Question | Answer |
|---|---|
| A dependency unavailable? | The only external one is the LLM (WS2), and the lot hand never calls it (RULE-6): it can't stall with the key unset (UBER-AC-2). A dropped phone counts as Done (C7). |
| Which errors retry or are poison? | Intents are validated by RULE-1 and RuleError; the player sees the message, and nothing retries. |
| Idempotency? | A repeat `list` hits RULE-1 row 5; a repeat `ready` is a no-op; `walk` sets a direction (idempotent). |
| What can race? | Intents and the tick run on one server event loop; the bell is evaluated in the tick only, after that tick's intents. |
| What still works when it breaks? | Skipped when empty (RULE-2), so a game where nobody lists is untouched. |
| How does an operator know it's in use? | Each lot's result goes into the news; the server test and e2e steps exercise it. |

## §5 · Delivery `[handoff]`

Code-only, with no existing state to reach: games are in memory, and a game started before deploy has no listings, so RULE-2 skips the phase.

## §6 · Acceptance Criteria `[handoff]`

Observed at the server's `viewFor` (MuleView) and the engine's GameState after a step, never on a helper's return value. On phone and /table, observed by the e2e steps (C13).

| id | criterion | → | negative case |
|---|---|---|---|
| B-AC-1 | Given planning and Lena owns plot 6·4 · When she lists it at 250, keep · Then every seat's view shows it in `listings`, and lotSlots.used rises by 1 | C1 C6 C9 | Ossa can't list Lena's plot |
| B-AC-2 | Given a listed plot (min 250) and buyers Ossa and Lena · When the bell rings with Ossa at 310 and Lena at 290 · Then Ossa owns the plot with its MULE, Ossa −310, Brix +294, and the news names the sale | C3 C7 C10 C11 | a 240 bid never wins a 250 lot |
| B-AC-3 | Given a lot nobody bid the minimum on · When the bell rings · Then with 'keep' nothing moves, and with 'store' the seller gets storePays, the plot is free and the corral has one more MULE | C3 | store short of capital → kept |
| B-AC-4 | Given a listed MULE · When Lena wins it · Then the seller's plot has no outfit and Lena leads that MULE into development, where it runs off if not installed | C3 | a bidder already leading a MULE is never a buyer |
| B-AC-5 | Given nobody listed anything · When the land grant ends · Then the game goes straight to development | C2 | — |
| B-AC-6 | Given 4 lots are listed this month · When a fifth is listed · Then the player sees "The auction is full this month", and the view shows no slots left | C1 C9 | a 2nd lot from one player is fine while slots remain |
| B-AC-7 | Given AI seats and listed lots, with ANTHROPIC_API_KEY unset · When the land auction runs · Then each AI bids no more than its limit, and the phase ends on its own clocks | C8 C7 | an AI with money − reserve < minimum never bids |
| T-AC-1 (serves B-AC-2) | stepLandAuction is a pure function of state and dt: the same seed and intents replay to the same owners and money | C3 | — |
| T-AC-2 (serves B-AC-2, B-AC-3) | Each RULE-5 example, as an engine test, asserts the money-conservation invariant | C3 | — |
| T-AC-3 (serves all) | RULE-1's every row as a test, incl. the drone row (C4) | C1 C4 | — |
| T-AC-4 (serves B-AC-7) | A seeded server test with 3 AI seats, one listed plot and one listed MULE: winners paid ≤ stub value, the phase reached development, and no LLM call was made | C8 C7 | — |
| T-AC-5 (serves B-AC-5) | The existing server phase-walk test is green unchanged | C2 C7 | — |

Invariants, asserted by every engine test: money is conserved across a lot; a plot never has two owners; a MULE is never both on a plot and in a hand.

## §7 · Risks & Spikes `[review-only]`

- **AI values during landAuction:** `packages/ai/src/outlook.ts` holds `BEFORE_PRODUCTION = {planning, landGrant, development}`. Without 'landAuction' in it, an AI would value a plot during the auction as if this month's production were past. Mitigation: E4, WS1 adds the entry in its next PR (ruled 2026-10-21); C8 does not merge before it.
- **The sim never runs lots:** `packages/ai/src/play.ts` has no 'landAuction' case. That's safe while AIs don't list (RULE-2 skips the phase); colony plots will need a case. Mitigation: noted in the colony-plots non-goal; T-AC-5 pins the skip.
- **Pace:** 4 lots × ~17.5 s ≈ 70 s. Mitigation: LOTS.maxLotsPerMonth (PM edit 1); Done on every buyer ends a walk early (RULE-4).
- **WS1's value functions are not in yet:** plotValue/muleValue are stubs (GAME.plotScore has landed). Mitigation: one helper reads each, so the switch is one line.
- No spike needed.

## §8 · Amendments `[review-only]`

None yet.

## §9 · Ownership Boundaries `[handoff]`

```
### Ownership: listings and the land auction
- Sole owner:      packages/engine/src/lots.ts
- Read contract:   GameState.listings / GameState.landAuction (engine); MuleView.listings /
                   lotSlots / landAuction (everyone else)
- Write contract:  lots.ts functions only (list, unlist, startLandAuction, stepLandAuction,
                   lotDone, setLotWalk, endLandAuction); game.ts calls them from advancePhase
- Enforcement:     SEAMS.md ownership (WS3) + engine tests that drive the phase only through
                   these functions; documentation-only beyond that → recorded as debt here
```

Named edits outside WS3's paths (each PM-approved, additive):
- **E1** `apps/web/src/game/derive.ts::PHASE_NAME`: one line, `landAuction: 'Land auction'` (WS4 agreed).
- **E2** `apps/web/src/table/TableApp.tsx`: export `TvHeader` (WS4 agreed).
- **E3** `apps/web/src/phone/Auction.tsx`: export `Hold` (WS3's own file).
- **E4** `packages/ai/src/outlook.ts::BEFORE_PRODUCTION`: add `'landAuction'`. Ruled (a): WS1 adds it in its next PR, before WS3's AI-hand PR; WS3 stubs around it until then.
