# WS3 Land Auction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Programme (spec header; agreed by the PM 2026-10-21).

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 [spec §0] | every player at the kitchen table | sell a plot or MULE at a live auction anyone can bid in | UBER-AC-1 | **PR-1** |
| G-2 [spec §0] | a family with fewer humans than seats | AI seats bid sensibly and never stall | UBER-AC-2 | **PR-2** |

AM-1 (the colony's occasional plot, spec §8) serves G-1 and G-2 more completely. It rides PR-3, after the core, as the PM ruled.

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- 00-concept's "three or four more each month" colony plots. Only the one occasional colony plot of AM-1 (spec §8) is in scope; more is a later, measured change agreed with WS1, because it moves G-1's land supply. *Needs its own spec.*
- AI seats listing their own lots: that needs WS1's sell-side value.
- Direct trades between players, deal cards, and selling plot upgrades on their own.
- Balance numbers outside the LOTS block.

**Thin baseline (spec §0.1):** draw lots inside the goods `Auction.tsx`/`TvAuction` and list from the Colony tab · ~3 PRs · lost because both screens are built around a good (`auction.good`, StatusTable, the declare switch, store and ship lines) and `TvAuction` sits in WS4's `TableApp.tsx`. Re-checked 2026-10-21 against `apps/web/src/phone/Auction.tsx::Auction` and `apps/web/src/table/TableApp.tsx::TvAuction`: still true.
→ **PR-1 relationship:** shortest vertical slice through the chosen approach that delivers G-1. Engine, protocol, server, phone and TV land together for plots **and** MULEs with both unsold choices, because the approved mocks (e3421df) show all of them, and the extra engine rules are small, pure and table-tested. Cutting them would ship screens that differ from what Heiko approved.

**Constraints:** spec §0.2 (HC-1 … HC-6) travel with every task.

**Architecture:** a new pure engine module `packages/engine/src/lots.ts` owns listings and the land auction (spec §9). `game.ts` calls it from the phase flow, and it reuses `walk.ts`'s `stepBoard` for movement and the clock. The server steps it on the existing auction tick and builds the view; the phone and TV screens graft the approved mocks. In PR-2 the AI gets a separate lot hand.

**Tech Stack:** TypeScript (strict), pnpm workspaces, vitest, React 18 + Tailwind 4 with `@mule/ui`, Playwright (e2e), and the in-repo `@tabletop/core` server.

**Inputs:**
- Spec: `docs/specs/2026-10-21-ws3-land-auction.md` (APPROVED, 7a92aca)
- Mocks: `design/mocks/land-auction/` at e3421df (Heiko-approved; artifact C9ouLiaXrSzRBsaQFtn4m6)
- Sections present and consumed: §0, §0.1, §0.2, §1 (C1–C13), §2 (RULE-1…6), §3, §4, §5, §6, §7, §9
- Sections declared N/A by the spec, with its stated reason: none. §5 says "code-only" (games are in memory), and §8 has no amendments yet.
- N/A claims I checked: §5 "code-only": confirmed, since the server holds games in memory (`apps/server/src/mule-game.ts::MuleGame` has no persistence). No CHANGELOG.md and no `architecture/` site exist in the repo (checked with `ls`), so those gate lines are N/A.

---

## Branching and PR decomposition

**Integration branch:** `ws3-auctions` (WS3's lane branch, base `origin/feat/strategist`). Lane PRs go **`ws3-auctions` → `feat/strategist`**, one per goal, each with the PM and Heiko's OK. Sub-branches are cut from `ws3-auctions` at or after e3421df (it contains the approved mocks) and merge back with `--no-ff` after WS3's review.

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------------------------|--------------|--------------------|--------------------|-------------------|
| PR-1 | `ws3-pr1-slice` | Tasks 1.1–1.11 (C1, C2, C3, C4, C5, C6, C7, C9, C10, C11, C13; E1, E2, E3) | UBER-AC-1, B-AC-1…6, T-AC-1, T-AC-2, T-AC-3, T-AC-5 | `MuleIntent` list/unlist; `MuleView.listings`, `lotSlots`, `landAuction`; `Phase` 'landAuction'; `GameState.listings`, `GameState.landAuction` | `WalkBoard` `lines?` (b23655a); `GAME.plotScore` | Yes |
| PR-2 | `ws3-pr2-ai` | Tasks 2.1–2.3 (C8) | UBER-AC-2, B-AC-7, T-AC-4 | (none) | PR-1's contracts; WS1 `cashReserve` (exists); WS1 `plotValue`/`muleValue` (stubbed); WS1 E4 | No |
| PR-3 | `ws3-pr3-colony` | Tasks 3.1–3.3 (C14, C15; spec §8 AM-1) | B-AC-8, T-AC-6, T-AC-7 | `LotHand` export from `@mule/ai` (for play.ts) | PR-1's contracts; PR-2's lot hand; WS1's agreement to E5 | No (the phone and TV already render a 'colony' seller from PR-1's graft of 3d5f9e3) |

<!-- plan-check: no-task C12 — done before the plan (b23655a, WS4-reviewed); PR-1 only consumes it -->

### Per-PR authority

Every handoff carries the standing authority line, verbatim:

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

**PR-1**
- `may_edit`: `packages/engine/src/{lots.ts (new),game.ts,types.ts,index.ts}` · `packages/engine/src/config.ts` (the LOTS block only) · `packages/engine/test/lots*.test.ts` (new) · `packages/protocol/src/index.ts` · `apps/server/src/mule-game.ts` · `apps/server/test/land-auction.test.ts` (new) · `apps/server/test/land-auction-wire.test.ts` (new, added in execution) · `apps/server/src/server.ts` (`isIntent`'s `list`/`unlist` cases, added in execution: the e2e found the wire refused them) · `apps/web/src/components/AuctionParts.tsx` · `apps/web/e2e/auction-steps.ts` (new)
- `may_edit_content`: `apps/web/src/phone/Planning.tsx` (Sell tab) and `apps/web/src/phone/Sell.tsx` (new in execution: the Sell tab moved out of Planning.tsx), `apps/web/src/phone/LandAuction.tsx` (new) and `apps/web/src/table/TvLandAuction.tsx` (new), grafted from `design/mocks/land-auction/src/screens/{PhoneSell,PhoneLandAuction,TvLandAuction}.tsx` at e3421df. Wire data, handlers and intents only; keep the composition, layout, tokens and every `data-testid`.
- Named one-liners only: `apps/web/src/game/derive.ts::PHASE_NAME` (E1, one entry) · `apps/web/src/table/TableApp.tsx` (E2: `export` on TvHeader, plus one route line) · `apps/web/src/phone/PhoneApp.tsx` (one route line) · `apps/web/src/phone/Auction.tsx` (E3: `export` on Hold)
- `must_not_edit`: `packages/ai/**` (WS1/WS2; WS3's lot hand is PR-2) · `packages/engine/src/{walk,auction,economy,observe}.ts` (walk.ts is reused unchanged; the rest are WS1's) · `packages/ui/**` (WS4; C12 is done) · `apps/web/e2e/{smoke,harness,screens}.ts` (WS4) · `design/mocks/**` (the approved spec of the screens)

**PR-3**
- `may_edit`: `packages/engine/src/{lots.ts,game.ts}` (colonyLot + its call in advancePhase) · `packages/engine/src/config.ts` (LOTS block only) · `packages/engine/test/lots-colony.test.ts` (new)
- Named edit only: `packages/ai/src/play.ts` (E5: one `'landAuction'` case, plus the lot counts in its report; WS1 reviews)
- `must_not_edit`: every other `packages/ai/**` file · `apps/web/**` (the colony wording shipped in PR-1's graft) · `apps/server/**` (C7 already runs any lot)

**PR-2**
- `may_edit`: `packages/ai/src/hands/lot.ts` (new) · `packages/ai/test/lot*.test.ts` (new; SEAMS gives `packages/ai/test/**` to WS1, so ask the PM for this one new file, or put the test in `apps/server/test/`, which is the default) · `apps/server/src/mule-game.ts` · `apps/server/test/land-auction-ai.test.ts` (new) · `packages/ai/src/index.ts` (one export line)
- `must_not_edit`: `packages/ai/src/{seat,strategist,value,outlook,play,sim}.ts` (WS1; E4 is WS1's own edit) · everything PR-1 `may_edit` outside mule-game.ts

### Contention

| path | touched by | resolution |
|---|---|---|
| `apps/server/src/mule-game.ts` | PR-1 (Task 1.7), PR-2 (Task 2.2); also WS2's and WS4's approved edits | **serialised**: PR-2 branches from PR-1 merged; merges keep the WS2/WS4 edits (spec §1 C7 call sites) |
| `apps/web/src/components/AuctionParts.tsx` | Task 1.9 (creates the lot parts), Task 1.10 (consumes them) | **serialised** within PR-1: 1.10 after 1.9 |
| `apps/web/src/game/derive.ts`, `apps/server/src/mule-game.ts` (PHASE_MS type) | Task 1.1 (the Phase change) | **same task**: the Phase member and both one-line fixes land in one commit (spec §1 C2 atomicity), or the build is red |
| `packages/engine/src/game.ts` | Tasks 1.3, 1.4 | **serialised**: 1.4 after 1.3 |
| `packages/engine/src/{lots.ts,game.ts,config.ts}` | PR-1, PR-3 | **serialised**: PR-3 branches from PR-2 merged |
| `packages/ai/src/play.ts` | PR-3 (E5); WS1's own PRs | **serialised** with WS1: one case, reviewed by WS1; rebase onto their latest before merging |

### Waves

- **Wave 1 = PR-1.** Tasks 1.1→1.6 run in order, since the engine is one module chain. After Task 1.6 freezes the protocol, Tasks 1.9 and 1.10 (phone, TV) can start. **Correction found in execution:** Task 1.7 (server) depends on Task 1.4, not 1.6, because it calls lots.ts's list/unlist and stepLandAuction. Task 1.8 (Sell tab) depends on Task 1.2 (the storePaysFor export). Once 1.4 is done, 1.7 and 1.8 run in parallel. They're safe together because their files are disjoint and both consume the frozen shape. Task 1.11 (e2e) runs last, after every branch is merged into ws3-pr1-slice.
- **Status (2026-10-21, session 2):**
  - **Engine:** 1.1–1.6 DONE at cc86b4a; ae90cff exports `standing()` and adds `storePaysAt`. Review: with fixes → fix round 1 DONE at bfd0942 (branch ws3-pr1-engfix); scoped re-review: all findings ADDRESSED, M12/M15/M18 now die.
  - **Screens:** 1.9, 1.10 COMPLETE at f21d181 (branch ws3-pr1-web); re-review: everything ADDRESSED.
  - **Server:** 1.7 COMPLETE. Review: with fixes (a dropped phone holding Up kept bidding; six surviving mutants) → fix round 1 at 6fb845a; re-review: READY. `listedOutfits` is gone (AM-2), `list()` takes the intent, and the land auction's clock honours `phaseScale` (c8294f1).
  - **Sell tab:** 1.8 COMPLETE (review fixes at f282496; the tab lives in `phone/Sell.tsx`).
  - **e2e:** 1.11 COMPLETE (f6e4172). It found a wire bug: `isIntent` refused `list`/`unlist`, fixed test-first (5f2ea12 → 9097208).
  - **PR-1: COMPLETE, merged into ws3-auctions** (#21 at 1520ce0, CI green). Goal check G-1 DELIVERED in a browser. Code review, maintainability review and render gate all closed. The lane is synced with feat/strategist c58bea1, which has the reading-order land grant (#23, Heiko's ruling).
  - **PR-2: in progress** on ws3-pr2-ai. WS1's real `plotValue`/`muleValue` are on feat/strategist (#17), so Task 2.1 imports them directly and **Task 2.3 is not needed**. WS1's E4 is merged, so PR-2's gate is met.
  - **Merge rule (PM, session 2):** sub-PR merges into ws3-auctions go to the PM, because Heiko hasn't typed that rule into this session.
  - **Standing ruling (Heiko via the PM):** no handovers; this session carries PR-1, PR-2 and PR-3.
- **Wave 2 = PR-2.** It starts when PR-1 is merged into `ws3-auctions`. **Freeze point:** the stubs for `plotValue`/`muleValue` have WS1's announced signatures `(obs, mind, index)` / `(obs, mind)` returning credits (WS1, 2026-10-21), so WS1's export later swaps in with one line.
- **Wave 3 = PR-3** (spec §8 AM-1). It starts when PR-2 is merged into `ws3-auctions`, because the sim needs the lot hand to play a colony lot. C14 and C15 ship together, so the sim is never handed a phase it can't play.
- No migration slot: there are no migrations (spec §5).

---

## PR-1 · Players list plots and MULEs and sell them at a live land auction (G-1)

### Task 1.1 — C5, C2 (types only): LOTS block, Phase and state types, build kept green

**Phase:** P1 · **Depends on:** none · **ACs verified:** none (scaffold; typecheck is the gate)
**Spec sections consumed:** §1 C5, §1 C2 (atomicity), §3

**Files:**
- Modify: `packages/engine/src/config.ts` (new `LOTS` block beside `packages/engine/src/config.ts::WALK`)
- Modify: `packages/engine/src/types.ts` (`packages/engine/src/types.ts::Phase` gains `'landAuction'` after `'landGrant'`; new `Listing`, `LotItem`, `LandAuction extends WalkBoard`, `LotResult`; `GameState.listings`, `GameState.landAuction`)
- Modify: `packages/engine/src/game.ts::createGame` (initialise `listings: []`, `landAuction: null`)
- Modify: `apps/web/src/game/derive.ts::PHASE_NAME` (E1: `landAuction: 'Land auction'`)
- Modify: `apps/server/src/mule-game.ts::PHASE_MS` (exclude `'landAuction'` from its key type, as `'auction'` is)

- [ ] **Step 1: Add the LOTS block per spec §1 C5.** Values: perPlayer 2, maxLotsPerMonth 4, introMs 3000, walkMs 12000, resultMs 2500, boardLow 0.7, boardHigh 2, storePlotShare 2/3, storeMuleShare 0.5. (AM-1 superseded the planned `colonyPlots 0`; PR-3 Task 3.1 adds colonyPlotChance and colonyPlotShare.) Each gets a one-line doc comment in the WALK block's style.
- [ ] **Step 2: Add the types per spec §3 and §2.** Shape them on `design/mocks/land-auction/src/proto.ts` (the view types), but as engine state: `LandAuction extends WalkBoard` with `queue`, `lot`, `stage: 'intro'|'walk'|'result'|'over'`, `done`, `result`, `number`, `count`.
- [ ] **Step 3: Apply E1 and the PHASE_MS key fix in the same commit**
- [ ] **Step 4: Run** `pnpm typecheck`. Expected: every package `Done`, exit 0.
- [ ] **Step 5: Run** `pnpm --filter @mule/engine --filter @mule/server test`. Expected: 52 and 12 passing, unchanged.
- [ ] **Step 6: Commit** `feat(engine): LOTS numbers and the land auction's types`

### Task 1.2 — C1, C4: listing in planning and the drone over listed plots

**Phase:** P1 · **Depends on:** 1.1 · **ACs verified:** T-AC-3
**Spec sections consumed:** §1 C1, §1 C4, §2 RULE-1

**Files:**
- Create: `packages/engine/src/lots.ts` (C1 seam: list / unlist)
- Modify: `packages/engine/src/game.ts::orderGeoDrone` (C4: listed plots are drone targets)
- Modify: `packages/engine/src/index.ts` (export line)
- Test: `packages/engine/test/lots.test.ts` (new)

- [ ] **Step 1: Write the failing tests `T-AC-3: RULE-1 row <n> …`, one per row of spec §2 RULE-1, plus the drone row and the two C4 pins** (free plot accepted; owned, unlisted plot refused)
  Altitude: unit. RULE-1 is a pure decision table with nine rows (test-driven-development R1). Observed at the thrown `RuleError` message and at `state.listings` after the call. Build state with `createGame` and the existing `toPhase` pattern from `packages/engine/test/rules.test.ts`. Trap: row 7 (full) must be reached with listings from **different** players, or row 6 fires first.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine test -- lots`. Expected: FAIL (`lots.js` missing).
- [ ] **Step 3: Implement C1 per spec §1 C1 and §2 RULE-1, and C4 per §1 C4.** Path: `packages/engine/src/lots.ts`, `game.ts::orderGeoDrone`. Mechanism: sprout (C1), in_place (C4). `storePays` is fixed at listing: plot `round(LOTS.storePlotShare × GAME.plotScore)`, MULE `round(LOTS.storeMuleShare × mulePrice(state))`. Export that one formula from lots.ts (Task 1.8's Sell tab shows it before a listing exists, and must not copy the numbers).
  Plan-drift corrections: none.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): list a plot or a MULE in planning (verifies T-AC-3)`

### Task 1.3 — C2: the landAuction phase, skipped when nothing is listed

**Phase:** P1 · **Depends on:** 1.2 · **ACs verified:** B-AC-5 (engine side), T-AC-5 (pin)
**Spec sections consumed:** §1 C2, §2 RULE-2

**Files:**
- Modify: `packages/engine/src/game.ts::advancePhase` (ORDER gains 'landAuction'; skip when empty; clear listings on leaving)
- Test: `packages/engine/test/lots.test.ts`

- [ ] **Step 1: Write the failing tests `B-AC-5: no listings ⇒ landGrant → development` and `RULE-2: one listing ⇒ landGrant → landAuction`, plus `RULE-2: endLandAuction resolves every remaining lot as kept`**
  Altitude: unit (engine phase flow; the server-side promise is pinned by T-AC-5 in Task 1.7). Observed at `state.phase` after `advancePhase`, and at owners and money after `endLandAuction`.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine test -- lots`. Expected: FAIL on the new tests.
- [ ] **Step 3: Implement C2 per spec §1 C2 and §2 RULE-2.** Mechanism: in_place. `advancePhase` calls `startLandAuction` from lots.ts (Task 1.4 fills it in; for now it creates the state with the first lot in its intro).
- [ ] **Step 4: Run** `pnpm --filter @mule/engine test`. Expected: all PASS, including the 52 existing tests (`rules.test.ts`'s `toPhase` walks the order and must pass unchanged).
- [ ] **Step 5: Commit** `feat(engine): land auction phase after the land grant (verifies B-AC-5)`

### Task 1.4 — C3: lots on the walk board, highest bid at the bell

**Phase:** P1 · **Depends on:** 1.3 · **ACs verified:** T-AC-1, T-AC-2
**Spec sections consumed:** §1 C3, §2 RULE-3, RULE-4, RULE-5, §6 invariants

**Files:**
- Modify: `packages/engine/src/lots.ts` (startLandAuction / stepLandAuction / lotDone / setLotWalk / endLandAuction)
- Test: `packages/engine/test/lots-auction.test.ts` (new)

- [ ] **Step 1: Write the failing tests**
  - `T-AC-2: RULE-5 example <name>` for each of spec §2 RULE-5's examples (310 vs 290 → Ossa 310, Brix +294; exactly 250 → sold; a tie goes to whoever was first; 240 < 250 with keep → nothing; store short of capital → kept; store buys a plot, which goes back to free land and its MULE to the corral; store buys a MULE). Each also asserts the three §6 invariants (money conserved, one owner, a MULE never both on a plot and in a hand).
  - `RULE-3: <row>` for each row: the seller is not on the board; money below the minimum ⇒ aside 'money'; a MULE lot with a MULE already in hand ⇒ aside 'mule'.
  - `RULE-4: <row>` for each row: the bell rings at 0 clock, when everyone is Done, and immediately when there are no buyers.
  - `T-AC-1: same seed and intents replay to the same owners and money`. Run a lot twice from a cloned state and compare.
  Altitude: unit, because the rules are a pure core with many combinations (R1) and the invariants are R2. Drive walks with `setLotWalk` plus `stepLandAuction(state, dt)` rather than poking prices, so the money cap is exercised. Trap: `stepBoard` must never record a trade on this board; assert `state.landAuction.deals` stays empty during the walk.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine test -- lots-auction`. Expected: FAIL.
- [ ] **Step 3: Implement C3 per spec §1 C3 and §2 RULE-3/4/5.** Mechanism: sprout over `packages/engine/src/walk.ts::stepBoard`, unchanged, with a `WalkMarket` that has no sellers or houses. Board range: `lo = floor(minimum × LOTS.boardLow)`, `hi = ceil(minimum × LOTS.boardHigh)`; speed as in auction.ts, `(hi − lo) / WALK.crossSeconds`. The sale pays through `packages/engine/src/economy.ts::taxSale`.
  Plan-drift corrections: none.
- [ ] **Step 4: Run** `pnpm --filter @mule/engine test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(engine): sell each lot to the highest bid at the bell (verifies T-AC-1, T-AC-2)`

### Task 1.5 — Gate: end of the engine part

- [ ] `pnpm --filter @mule/engine typecheck && pnpm --filter @mule/engine test`: exit 0, with the count (52 + new) recorded in the PR description
- [ ] `grep -n "Date.now\|Math.random" packages/engine/src/lots.ts` returns nothing (HC-1)
- [ ] `grep -n "[0-9]\{3,\}" packages/engine/src/lots.ts` shows no inline balance number (HC-2; ms and prices live in LOTS)

### Task 1.6 — C6: the protocol carries listings and the live land auction (contract freeze)

**Phase:** P2 · **Depends on:** 1.4 · **ACs verified:** none directly (contract; consumed by 1.7–1.10)
**Spec sections consumed:** §1 C6, §3

**Files:**
- Modify: `packages/protocol/src/index.ts::MuleIntent` (list, unlist) and `packages/protocol/src/index.ts::MuleView` (listings, lotSlots, landAuction), plus `ListingView`, `LotItemView`, `LotWalkerView`, `LotResultView`, `LandAuctionView`

- [ ] **Step 1: Implement C6: add the types per spec §3**, taken over from `design/mocks/land-auction/src/proto.ts` at e3421df (that file is the machine-readable contract).
- [ ] **Step 2: Run** `pnpm typecheck`. Expected: exit 0. The server doesn't fill the fields yet, so `viewFor` fails to compile until Task 1.7. **Plan-drift correction:** if it does, add `listings: [], lotSlots: { used: 0, max: LOTS.maxLotsPerMonth }, landAuction: null` to `viewFor` in this commit so the build stays green; Task 1.7 replaces them.
- [ ] **Step 3: Commit** `feat(protocol): listings and the land auction in the view`. The contract is frozen from here; a change is a plan update.

### Task 1.7 — C7: the server runs the land auction (parallel with 1.8–1.10)

**Phase:** P2 · **Depends on:** 1.6 · **Parallelizable with:** 1.8, 1.9, 1.10 · **ACs verified:** UBER-AC-1 (server half), B-AC-1, B-AC-2, B-AC-3, B-AC-4, B-AC-6, T-AC-5
**Spec sections consumed:** §1 C7, §2 RULE-4, §4

**Files:**
- Modify: `apps/server/src/mule-game.ts::MuleGame` (handle: list/unlist, plus ready/walk during landAuction; enterPhase: landAuction; new scheduleLandAuctionTick beside `scheduleAuctionTick`; viewFor: the three fields; news per lot; checkAllReady excludes landAuction)
- Test: `apps/server/test/land-auction.test.ts` (new)

- [ ] **Step 1: Write the failing tests UBER-AC-1, B-AC-1, B-AC-2, B-AC-3, B-AC-4, B-AC-6 and T-AC-5, observed at `game.viewFor(seat)` (spec §6 observed_at):**
  - `UBER-AC-1 / B-AC-2: three humans; Brix lists plot at 250 keep; Ossa and Lena walk; at the bell Ossa owns it, money moves less tax, news names the sale`
  - `B-AC-1: a listing shows in every seat's view and lotSlots.used rises`, with the negative case: Ossa can't list Lena's plot (RuleError surfaces)
  - `B-AC-3: unsold keep → nothing moves; unsold store → seller paid, plot free, corral +1`
  - `B-AC-4: a won MULE is in the winner's hand at development; the seller's plot has no outfit`
  - `B-AC-6: a fifth listing → "The auction is full this month"; view lotSlots shows 4/4`
  - `T-AC-5: with no listings the existing phase walk is unchanged`. The existing `apps/server/test/mule-game.test.ts` must stay green untouched, and the new test asserts landGrant → development.
  Altitude: promise, at the server boundary. Drive time with the existing test clock in `mule-game.test.ts` (its `advance` helper); seats are all human (the AI lot hand is PR-2). Trap: getting a plot to list means claiming one in month 1's grant; use the grant as the existing tests do, never by writing `tile.owner` directly.
- [ ] **Step 2: Run** `pnpm --filter @mule/server test -- land-auction`. Expected: FAIL.
- [ ] **Step 3: Implement C7 per spec §1 C7.** Mechanism: in_place. Honour WS4's `phaseScale` exactly as `scheduleAuctionTick` does (dt / phaseScale after the stall clamp). Keep the WS2 and WS4 edits listed in §1 C7 call sites.
- [ ] **Step 4: Run** `pnpm --filter @mule/server test`. Expected: all PASS (12 existing + new).
- [ ] **Step 5: Commit** `feat(server): run the land auction lot by lot (verifies UBER-AC-1, B-AC-1..4, B-AC-6, T-AC-5)`

### Task 1.8 — C9: Planning's Sell tab (parallel with 1.7)

**Phase:** P2 · **Depends on:** 1.6 · **ACs verified:** B-AC-1, B-AC-6 (UI half, via Task 1.11)
**Spec sections consumed:** §1 C9 (ux)

**Files:**
- Modify: `apps/web/src/phone/Planning.tsx::Planning` (fourth tab 'sell')

- [ ] **Step 1: Implement C9: graft `design/mocks/land-auction/src/screens/PhoneSell.tsx` (e3421df) into Planning.tsx as the Sell tab.** Mechanism: fill_scaffold. Replace the mock's local `listings` state with `view.listings`/`view.lotSlots`, and `list()`/UNLIST with `client.intent({type:'list'|'unlist', …})`. Keep the tablist's four tabs, the composition and every `data-testid`. `storePays` comes from the view's listing; for the unsaved form, use the same formula the engine uses (expose it from `@mule/engine` in Task 1.2 rather than duplicating the number).
- [ ] **Step 2: Run** `pnpm --filter @mule/web typecheck`. Expected: exit 0.
- [ ] **Step 3: Commit** `feat(web): sell a plot or a MULE from planning`

### Task 1.9 — C10: the phone's land auction screen (after 1.8; parallel with 1.7)

**Phase:** P2 · **Depends on:** 1.6 · **ACs verified:** B-AC-2 (UI half, via Task 1.11)
**Spec sections consumed:** §1 C10 (ux)

**Files:**
- Create: `apps/web/src/phone/LandAuction.tsx` (graft of `PhoneLandAuction.tsx`)
- Modify: `apps/web/src/components/AuctionParts.tsx` (graft of the mock's `parts.tsx`: lotWalkers, LotCard, LeaderBox, sellerName, lotWhat)
- Modify: `apps/web/src/phone/Auction.tsx` (E3: `export` on Hold; the mock's Hold copy is dropped)
- Modify: `apps/web/src/phone/PhoneApp.tsx` (one route line: `view.phase === 'landAuction' ? <LandAuction />`)

- [ ] **Step 1: Graft per spec §1 C10's ux.** Mechanism: fill_scaffold. `lot` comes from `view.landAuction`; `walk` sends `{type:'walk', dir}`; "Ready to bid" and "Done bidding" send `{type:'ready'}`. Keep the layout, every stage branch and every `data-testid`.
- [ ] **Step 2: Run** `pnpm --filter @mule/web typecheck`. Expected: exit 0.
- [ ] **Step 3: Commit** `feat(web): the land auction on the phone`

### Task 1.10 — C11: the big screen's land auction (after 1.9)

**Phase:** P2 · **Depends on:** 1.9 · **ACs verified:** UBER-AC-1 (TV half, via Task 1.11)
**Spec sections consumed:** §1 C11 (ux)

**Files:**
- Create: `apps/web/src/table/TvLandAuction.tsx` (graft of `TvLandAuction.tsx`)
- Modify: `apps/web/src/table/TableApp.tsx` (E2: `export` on TvHeader; one route line in `apps/web/src/table/TableApp.tsx::TvGame`, beside the auction's)

- [ ] **Step 1: Graft per spec §1 C11's ux.** The mock's `Header` is replaced by the exported TvHeader.
- [ ] **Step 2: Run** `pnpm --filter @mule/web typecheck`. Expected: exit 0.
- [ ] **Step 3: Commit** `feat(web): the land auction on the big screen`

### Task 1.11 — C13: e2e steps, front to back

**Phase:** P3 · **Depends on:** 1.7, 1.10 · **ACs verified:** UBER-AC-1 (browser), B-AC-2, B-AC-1
**Spec sections consumed:** §1 C13, §6 B-AC-1, B-AC-2

**Files:**
- Create: `apps/web/e2e/auction-steps.ts` (exported step functions for WS4's smoke.ts hooks; when run directly it plays the whole flow, following the `packages/ai/src/sim.ts` pattern `if (process.argv[1]?.endsWith(...)) main()`)

**Hooks contract (CT-3, WS4):** export the steps as WS4's `AuctionSteps` type from `apps/web/e2e/harness.ts` (`import type`, never from smoke.ts). `landAuction(ctx, month)` runs right after each month's land grant (months 1 and 2). `listedSale(ctx)` runs in month 2 planning, before "I'm ready", returns within ~2 s and leaves the phone on planning. No hook presses "I'm ready", the pub or Done, and every server wait goes through `phaseScale`. Also hold Up through one bell, then bid on lot 2 (the web review's deferred case).

- [ ] **Step 1: Implement C13: write the browser flow `UBER-AC-1: list, bid on two phones, sold at the bell` (also proves B-AC-1 and B-AC-2 in the browser).** Use the harness's `startServer`, `launch`, `PHONE` and `TV`: the test owns its server on a free port, never the rig (CLAUDE.md, ephemeral environments). Three phone contexts join one room by code, plus a TV. The seller claims a plot in month 1 and lists it in month 2 planning (Sell tab: `tab-sell`, then a map plot, then `list`). Two other phones hold Up (`hold-up`) to different heights. After the bell, assert on the phones (`result` data-kind sold, the buyer's `money` dropped by the bid) and on the TV (`tv-result`). `B-AC-1`: the other phones show the listing during planning (`listing-<id>`). (Corrected in execution: the TV's planning screen has no listing UI and no approved mock for one; B-AC-1 asks for every seat's view, which the phones are.)
  Altitude: promise, in a real browser against the real server (proving-acs, "Front to back").
- [ ] **Step 2: Run** `pnpm --filter @mule/web build && pnpm --filter @mule/web exec tsx e2e/auction-steps.ts`. Expected before 1.7–1.10: FAIL. After them: exit 0 with the harness's ✓ lines.
- [ ] **Step 3: Also run WS4's** `pnpm e2e`. Expected: unchanged, exit 0.
- [ ] **Step 4: Commit** `test(web): land auction front to back (verifies UBER-AC-1)`

### PR-1 merge gate

Before merging `ws3-pr1-slice` into `ws3-auctions`, and before raising the lane PR `ws3-auctions → feat/strategist`:

- [ ] Every AC in PR-1's "ACs verified" has a green test named after its ID
- [ ] The failing-test commit precedes each implementation commit
- [ ] Consumer-side contract test: the web screens compile against `@mule/protocol` and the e2e drives them against the real server
- [ ] Front to back: `auction-steps.ts` exits 0 (browser on the real server)
- [ ] `pnpm typecheck` exit 0 · `pnpm test` exit 0 · `pnpm sim -- --games 20 --players 4` exit 0, its numbers unchanged from base (no listings in sim ⇒ no lots; a change means the skip leaked)
- [ ] No new `@ts-ignore` / `eslint-disable`
- [ ] Mock render check: `node design/mocks/land-auction/review-loop/render-gate.mjs` comparing mock and built screen on their shared `data-testid`s, where the gate can reach both; otherwise a side-by-side screenshot of each approved state in the PR description
- [ ] The PM has the PR link and these results; Heiko's OK before merge into feat/strategist

---

## PR-2 · AI seats bid on lots (G-2)

**Gate before PR-2 merges:** WS1's E4 (`'landAuction'` in `packages/ai/src/outlook.ts::BEFORE_PRODUCTION`) is merged into feat/strategist (PM ruling, 2026-10-21).

### Task 2.1 — C8: the lot hand, capped

**Phase:** P4 · **Depends on:** PR-1 merged into ws3-auctions · **ACs verified:** B-AC-7 (limit half)
**Spec sections consumed:** §1 C8, §2 RULE-6, §0.2 HC-3

**Files:**
- Create: `packages/ai/src/hands/lot.ts` (LotHand + the plotValue/muleValue stubs behind one helper each)
- Modify: `packages/ai/src/index.ts` (one export line)
- Test: `apps/server/test/land-auction-ai.test.ts` (new; the default home, see PR-2 authority)

- [ ] **Step 1: Write the failing test `B-AC-7: an AI never bids above min(money − cashReserve, value)`, plus the negative case: an AI whose money − reserve is under the minimum never moves.** Altitude: unit on the limit, since HC-3 is a fatal invariant (R2). Observed at the AI walker's rounded price on every tick, never above the limit, across a seeded walk.
- [ ] **Step 2: Run** `pnpm --filter @mule/server test -- land-auction-ai`. Expected: FAIL.
- [ ] **Step 3: Implement C8 per spec §1 C8 and §2 RULE-6.** Mechanism: sprout. `cashReserve` is `packages/ai/src/value.ts::cashReserve(obs, mind)`; the stubs are plot `GAME.plotScore + mulePrice` if it has a MULE, and MULE `mulePrice`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(ai): AI seats bid on lots up to what they're worth (verifies B-AC-7)`

### Task 2.2 — C8 wiring: AI seats play the land auction on the server

**Phase:** P4 · **Depends on:** 2.1 · **ACs verified:** UBER-AC-2, T-AC-4
**Spec sections consumed:** §1 C7 (AI tick), §1 C8

**Files:**
- Modify: `apps/server/src/mule-game.ts` (one LotHand per AI seat, built from `AiSeat`'s public `brain`/`mind`; ticked in scheduleLandAuctionTick)
- Test: `apps/server/test/land-auction-ai.test.ts`

- [ ] **Step 1: Write the failing test `UBER-AC-2 / T-AC-4: 3 AI seats, a listed plot and a listed MULE, ANTHROPIC_API_KEY unset: winners paid ≤ stub value, the phase reached development on its own clocks, no LLM call`.** Altitude: promise, at `viewFor`. Trap: unset the key in the test (`delete process.env.ANTHROPIC_API_KEY`) and assert no call through the brain service (WS2's injectable `brain?: BrainService`; pass a stub that throws if called).
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement the wiring per spec §1 C7/C8.** `seat.ts` stays untouched.
- [ ] **Step 4: Run** `pnpm --filter @mule/server test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(server): AI seats bid at the land auction (verifies UBER-AC-2, T-AC-4)`

### Task 2.3 — Swap the stubs when WS1 exports plotValue/muleValue

- [ ] **Step 1:** when WS1's export lands in feat/strategist, rebase and replace each stub's helper body with the import (one line each)
- [ ] **Step 2: Run** `pnpm --filter @mule/server test`. Expected: PASS (B-AC-7 holds against the real values).
- [ ] **Step 3: Commit** `refactor(ai): bid on WS1's plot and MULE values`

### PR-2 merge gate

- [ ] B-AC-7, T-AC-4 and UBER-AC-2 are green and named
- [ ] Tests precede the implementation in history
- [ ] WS1's E4 is merged (the gate above)
- [ ] `pnpm typecheck` · `pnpm test` · `pnpm sim -- --games 20 --players 4` exit 0
- [ ] `auction-steps.ts` still exits 0 (PR-1's front-to-back, re-run)
- [ ] The PM has the PR link and these results; Heiko's OK before merge into feat/strategist

---

## PR-3 · The colony sometimes sells one free plot (spec §8 AM-1)

### Task 3.1 — C14: the colony's lot after the land grant

**Phase:** P5 · **Depends on:** PR-2 merged into ws3-auctions · **ACs verified:** T-AC-6, B-AC-8 (engine side)
**Spec sections consumed:** §1 C14, §1 C5 (colonyPlotChance, colonyPlotShare), §2 RULE-7, RULE-5 row 1

**Files:**
- Modify: `packages/engine/src/config.ts` (LOTS: colonyPlotChance 0.1, with Heiko's 1/10–1/8 range in its comment; colonyPlotShare 2/3)
- Modify: `packages/engine/src/lots.ts` (colonyLot), `packages/engine/src/game.ts::advancePhase` (call it on leaving landGrant, before RULE-2's skip)
- Test: `packages/engine/test/lots-colony.test.ts` (new)

- [ ] **Step 1: Write the failing tests `T-AC-6: RULE-7 example <name>`** for each RULE-7 example, plus `T-AC-6: same seed replays the same colony lot in the same month`, plus `B-AC-8: a sold colony plot pays the bid into store capital, no tax; unsold it stays free land`.
  Altitude: unit (pure, seeded). Find a seed and month whose roll is under 0.1 by scanning seeds in the test's setup, never by mocking the RNG, so the test exercises the real seeding. Trap: the roll must come from (seed, month) alone, never from an RNG shared with the grant, or the grant's order changes when a colony lot appears.
- [ ] **Step 2: Run** `pnpm --filter @mule/engine test -- lots-colony`. Expected: FAIL.
- [ ] **Step 3: Implement C14 per spec §1 C14 and §2 RULE-7.** Mechanism: sprout. Seed it like `newSweep` in game.ts, with a distinct multiplier.
- [ ] **Step 4: Run** `pnpm --filter @mule/engine test`. Expected: all PASS.
- [ ] **Step 5: Commit** `feat(engine): the colony sometimes puts a free plot up for auction (verifies T-AC-6)`

### Task 3.2 — C15: the simulator plays the land auction (E5)

**Phase:** P5 · **Depends on:** 3.1 · **ACs verified:** T-AC-7
**Spec sections consumed:** §1 C15

**Files:**
- Modify: `packages/ai/src/play.ts` (one `'landAuction'` case beside `'auction'`; a LotHand per seat; colony lots offered and sold in the report)
- Modify: `packages/ai/src/index.ts` (export LotHand, if PR-2 didn't)

- [ ] **Step 1: Write the check `T-AC-7` as a sim run.** Run `pnpm sim -- --games 40 --seed 101` and read its report. Expected: a line with colony lots offered and sold; offered ≈ 0.1 × months with free land; every game ends (no guard-limit exit). Altitude: promise. The sim is G-1's own measure (Mission G-1 runs this exact command).
- [ ] **Step 2: Run it before the edit.** Expected: no lot line, and colony lots are never played (the phase is skipped only when empty; with Task 3.1 and no case here, the sim's switch falls through, which this step makes visible).
- [ ] **Step 3: Implement C15 per spec §1 C15.** Mechanism: in_place, mirroring the `'auction'` case's loop.
- [ ] **Step 4: Run** `pnpm sim -- --games 40 --seed 101` and `pnpm sim -- --games 20 --players 4`. Expected: both exit 0, the lot line present, and the 10 checks reported. Record every ok/MISS beside the base's in the PR description; WS1 owns any move in them.
- [ ] **Step 5: Commit** `feat(ai): the simulator plays the land auction (verifies T-AC-7)`

### Task 3.3 — B-AC-8 at the server and on screen

**Phase:** P5 · **Depends on:** 3.1 · **ACs verified:** B-AC-8
- [ ] **Step 1: Write the failing server test `B-AC-8: a colony lot comes up first, every seat can bid, sale → store capital`** in `apps/server/test/land-auction.test.ts`, with a seed found as in Task 3.1. Observed at `viewFor`: `landAuction.lot.seller === 'colony'`, `number === 1`, and the TV's public view carries the same lot.
- [ ] **Step 2: Run, implement nothing new** (C7 already runs any lot). If it fails, the fix belongs in C14's seam, not the server.
- [ ] **Step 3: Commit** `test(server): the colony's lot at the land auction (verifies B-AC-8)`

### PR-3 merge gate

- [ ] T-AC-6, T-AC-7 and B-AC-8 are green and named; tests precede the implementation
- [ ] The colony intro and nobody-bid mock states (3d5f9e3) are approved by Heiko (PM relays)
- [ ] WS1 has reviewed the play.ts case (E5)
- [ ] `pnpm typecheck` · `pnpm test` · `pnpm sim -- --games 20 --players 4` exit 0; `pnpm sim -- --games 40 --seed 101` numbers recorded against the base
- [ ] The PM has the PR link and these results; Heiko's OK before merge into feat/strategist

---

## Risks → where they are handled (spec §7)

- AI values during landAuction (E4) → the PR-2 gate above.
- The sim must run lots → PR-1's and PR-2's gates check the sim's numbers are unchanged (the skip didn't leak); PR-3 ships C14 and C15 together (Task 3.2).
- Colony plots move land supply → T-AC-7 reports the rate (Task 3.2); WS1 tunes within 1/10–1/8.
- Pace (4 lots ≈ 70 s) → LOTS.maxLotsPerMonth in Task 1.1; RULE-4's early bell in Task 1.4 tests.
- WS1's value functions → the stubs behind one helper each (Task 2.1), swapped in Task 2.3.

## Pre-implementation checklist

- [x] Spec approved (Heiko through the PM, 2026-10-21; 7a92aca); mocks approved at e3421df
- [x] Upstream: `GAME.plotScore` merged (aa84a1b); `cashReserve` exists; plotValue/muleValue stubbable; E4 owed by WS1 before PR-2 merges
- [x] Branch policy: sub-branches → `ws3-auctions` → PR to `feat/strategist` (PM, 2026-10-21)
- [x] Base `ws3-auctions` @ 7a92aca green (measured 2026-10-21): `pnpm typecheck` exit 0 · `pnpm test` exit 0, with tabletop 7 · engine 52 · ai 4 · web 17 · server 12 = 92 passing · `pnpm sim -- --games 20 --players 4` exit 0, with 6 ok / 4 MISS (the misses are WS1's, e.g. colonists short in 45% of months and 56% of plots developed)
- [ ] `ws3-auctions` pushed to origin (needed for the lane PR)
- [ ] No spikes in spec §7
- [x] Estimate: PR-1 ≈ 11 tasks, PR-2 ≈ 3 tasks, PR-3 ≈ 3 tasks (spec §0 rough cost, plus AM-1)
- [ ] Heiko approves the colony plot's mock states (3d5f9e3) and the cap reading in RULE-7 row 3, before PR-3 (not before PR-1)
