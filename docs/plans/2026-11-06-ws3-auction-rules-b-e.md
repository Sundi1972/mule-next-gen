# Auction rules B–E (spec AM-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Standard (the spec declares "Standard amendment").

## Goals: from spec §10 (AM-1). Reference, do not restate.

AM-1 has no §0 of its own. Its goals are Heiko's four asks quoted at the head of §10, each proved by its B-AC in
§10 "Acceptance criteria". The auto-trade goals G-1 and G-2 (§0) are already delivered; AM-1's four goals are numbered G-3 to G-6 here.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-3 (B) · selling stops at your need; selling short is a conscious hold (RULE-4) | the player selling a surplus | no accidental shortage next month | B-AC-B1, B-AC-B2 | **PR-1** |
| G-4 (C) · flip sides within the walk (RULE-5) | any player who over-sold | buy back without waiting a month | B-AC-C1 | **PR-1** |
| G-5 (D) · rest zones and hard edges (RULE-6) | every player standing still | never in a trade by accident | B-AC-D1, B-AC-D2 | **PR-2** |
| G-6 (E) · bidding past a sold-out store (RULE-7) | a buyer short of a sold-out good | can bid a seller out | B-AC-E1 | **PR-2** |

PR-2 comes after PR-1 because both edit the same walk code (`walk.ts::stepWalker`/`stepBoard`); PR-1 is useful on its own the day it lands. RULE-6 and RULE-7 ship together in PR-2: both are the board's zones around S and B, and RULE-7's sellers' zone is RULE-6's.

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- the land auction (its own rules, unchanged); the board's look (WS6's mock); new AI strategy beyond playing the new flow; balancing the speed curve (named values, tuned after play).

**Thin baseline (spec §0.1):** the spec records none (it has no §0.1). The thin alternative, "engine rules only, no screen change", fails G-B: the held seller would see nothing telling them how to sell on.
→ **PR-1 relationship:** shortest slice through the chosen approach. Engine stop, the view's `held`, the phone's one rail line per the mock, the AI's named edit, and one e2e.

**Constraints:** the project's standing rules travel with every task. `packages/engine` is pure, with no I/O, no `Date.now()` and no `Math.random()`. Every number is a named value in `config.ts` (WALK). Rules errors throw `RuleError`. A replay from seed plus intents must stay identical.

**Architecture:** the rules live in the walk's step functions (`packages/engine/src/walk.ts`) and the auction's good lifecycle (`auction.ts::nextGood`). The server copies the new board state into `AuctionView` (`apps/server/src/mule-game.ts`), and the phone and TV draw it per WS6's mock. The AI hand (`packages/ai/src/hands/auction.ts`, WS1) is clamped by the same engine rules and learns two new moves.

**Tech Stack:** TypeScript, vitest, Playwright e2e (`apps/web/e2e`), pnpm sim.

**Inputs:**
- Spec: `docs/specs/2026-11-05-ws3-auction-auto-trade.md`, §10 (AM-1) and §11 (AM-2, this plan's corrections)
- Consumed: §10 RULE-4 to RULE-7, "What the server sends", "Acceptance criteria", "Owners", Heiko's rulings; §11 AM-2.
- Not in AM-1: §0.1 (no thin baseline recorded), §4 (no failure/ops rows: an engine rule has none), §5 (no data migration: the record's shape is unchanged, per "What the server sends"), §7 (no spikes).
- N/A claims I checked: "record shape unchanged" holds. `held` and `downSince` derive from recorded `walk` intents and board ticks, and T-AC-1′ proves it.
- C1–C5 (§1) were built and merged before AM-1: <!-- plan-check: no-task C1 C2 C3 C4 C5 — the auto-trade changes, built and merged before AM-1 -->
- The auto-trade's own ACs are proved and merged: <!-- plan-check: no-task B-AC-1 B-AC-2 B-AC-3 B-AC-4 T-AC-2 T-AC-10 — the auto-trade's ACs, built and merged before AM-1 -->
- A-6 is the UX-audit item the spec supersedes, not a change: <!-- plan-check: no-task A-6 — superseded audit item, not a change -->
- AM-1's ACs are lettered (B-AC-B1 …), which plan-check's pattern does not match: checked by hand, each in a `- [ ]` step (self-review below).

---

## Phase 0: contracts (locked before their consumers)

Per §10 "What the server sends" and AM-2 items 2–3. Each PR adds only its own field.

| Contract | PR |
|---|---|
| `WalkerView.held?: true` (protocol), `Walker.held?`, `Walker.downSince?` (engine `types.ts`) | PR-1 |
| `AuctionView.zones: { buyersTop, sellersBottom, lo, hi }`, `LiveAuction.zones` | PR-2 |
| `AuctionView` store selling line while sold out = highest active bid, `bid: true` flag | PR-2 |
| WALK: `needStop`, `shortHoldMs` (PR-1); `soldOutBidding` (PR-2) | as listed |

## PR decomposition

Lane PRs go straight to `feat/strategist` (the PM batches them). There is one PR per wave, and the waves are serial,
because both PRs edit the walk code.

| PR | Sub-branch | Scope | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------|--------------|--------------------|--------------------|-------------------|
| PR-0 | `ws3-auction-rules-b-e` | spec AM-1 + AM-2, this plan, and the stale "(soon)" at `development.html:126` (docs) | — | — | — | No |
| PR-1 | `ws3-need-stop` | Tasks 1.1–1.8: RULE-4, RULE-5's e2e | B-AC-B1, B-AC-B2, B-AC-B3, B-AC-C1, T-AC-1′, T-AC-2′ (needStop) | `held`, `downSince`, WALK.needStop/shortHoldMs | auctionNeed (#439) | Yes |
| PR-2 | `ws3-board-zones` | Tasks 2.1–2.6 (RULE-6) and 3.1–3.7 (RULE-7): the board's zones around S and B | B-AC-D1, B-AC-D2, B-AC-E1, T-AC-E2, T-AC-2′ (soldOutBidding) | `zones`, line `bid` flag, WALK.soldOutBidding | `held` | Yes |

**Per-PR authority** (each PR, in its own wave):
- `may_edit`: `packages/engine/src/{walk,auction,types,config}.ts` (the WALK block only), `packages/engine/test/*`,
  `packages/protocol/src/index.ts`, `apps/server/src/mule-game.ts`, `apps/server/test/*`, `apps/web/e2e/auction-steps.ts`,
  `docs/rulebook/goods-auction.html` and `search-index.js` (by `build-index.mjs`).
- `may_edit_content`: `apps/web/src/phone/Auction.tsx`, `apps/web/src/components/AuctionParts.tsx` (built to the mock at
  cde3ff61: the composition and words are the mock's; wiring is ours).
- `must_not_edit`: `packages/ai/src/hands/auction.ts` (WS1's, one named-edit commit sent by SHA via the PM);
  `packages/ui/src/WalkBoard.tsx` (WS4's, a named edit by SHA); `design/mocks/*` (WS6's);
  `packages/engine/src/production.ts::monthNeeds` (closed ruling: unchanged); `packages/ai/src/sim.ts` (WS1's).

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

**Contention** (every path more than one PR touches):

| path | touched by | resolution |
|---|---|---|
| `walk.ts`, `auction.ts`, `types.ts`, WALK, protocol, `mule-game.ts` | PR-1, PR-2 | **serialised** (PR-2 cut from trunk after PR-1 merges) |
| `phone/Auction.tsx`, `AuctionParts.tsx`, `auction-steps.ts`, `goods-auction.html` | PR-1, PR-2 | **serialised** |
| `hands/auction.ts` (WS1) | PR-1, PR-2 | **serialised**, each a named edit |
| `WalkBoard.tsx` (WS4) | PR-1 (if the KEEPS mark needs it), PR-2 | **serialised**, each a named edit |

**Why each wave is safe:** one PR per wave, and the waves are serial, so there is no parallel contention.

**Dependency:** WS6's mock (cde3ff61) is not on trunk (AM-2 item 6). Each PR's screen task reads it with `git show cde3ff61:design/mocks/auction-rules/src/Screens.tsx`. The PM is asked to have WS6 land it before PR-1's screen task.

---

## PR-1: the need stop (RULE-4), and switching sides end to end (RULE-5)

### Task 1.1: config and contracts (RULE-4, AM-2 item 2)

**Files:** Modify `packages/engine/src/config.ts` (WALK), `packages/engine/src/types.ts` (`Walker`), `packages/protocol/src/index.ts` (`WalkerView`)

- [ ] **Step 1: Add WALK.needStop (true) and WALK.shortHoldMs (1000)** per §10 "Config", each with a doc line on what it governs. Add `Walker.held?: true` and `Walker.downSince?: number` (the board's `elapsed`) per AM-2 item 2, and `WalkerView.held?: true` per §10's table.
- [ ] **Step 2: `pnpm typecheck`.** Expected: exit 0.

### Task 1.2: B-AC-B1, B-AC-B3: the stop, and no stop at need 0

**ACs verified:** B-AC-B1, B-AC-B3 · **Spec:** §10 RULE-4 rows 1, 3, 4

- [ ] **Step 1: Write the failing tests `B-AC-B1: …` and `B-AC-B3: …`** in `packages/engine/test/need-stop.test.ts`.
  Altitude: engine promise (the walk's state is what the player gets; the server copies it).
  Observed at: the seller's stock and walker after ticks. B1: Heiko holds 12 Water and needs 4 by `auctionNeed`, so pick a state where it is 4; 8 sell, the 9th does not; the walker stands one step above the line, `dir 0`, `held`; nothing more sells over 5 s of ticks. B3: Smithore, need 0: all 6 sell.
  Traps: get the need from `auctionNeed`, never a literal; a seller who starts at or below need is stopped at the first unit (the "unknown" row). Add that as a third case in B1.
- [ ] **Step 2: Run** `cd packages/engine && npx vitest run test/need-stop.test.ts`. Expected: FAIL (it sells all 12).
- [ ] **Step 3: Implement RULE-4 rows 1, 3, 4 per §10 and AM-2 item 1** in `walk.ts`: before `market.trade` in the unit loop, at the seller-filter spot the grounding found (`nextUnit` or `activeSeller`). The need is fixed at the walk's start (`nextGood` stores each seller's `auctionNeed` for the good on the board). The stop also applies to a sale to another player (Heiko's ruling 1). Gate it on `WALK.needStop`.
- [ ] **Step 4: Run the tests again.** Expected: PASS. Run `npx vitest run` (engine). Expected: all green; any walk test whose seller sold below need fails here and gets fixed by giving its seller the stock, never by turning the stop off.
- [ ] **Step 5: Commit** the red test first, then the fix (two commits).

### Task 1.3: B-AC-B2: the conscious hold

**ACs verified:** B-AC-B2 (and its negative) · **Spec:** §10 RULE-4 row 2, AM-2 item 2

- [ ] **Step 1: Write the failing test `B-AC-B2: …`** in `need-stop.test.ts`. Hold ▼ (`walk down`) for `WALK.shortHoldMs` of board ticks: selling resumes below need, one unit at a time, and the speed-up restarts from the first unit. Negative: a `walkStep down`, and a hold of `shortHoldMs − tickMs`, each sell nothing and move nothing. Check it at two tick lengths.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement row 2:** `setWalk` stamps `downSince` on a `down` that is not already down, and any other walk intent or a step clears it. While `held`, the walker doesn't move until `elapsed − downSince ≥ shortHoldMs`, then sells on for the rest of this good. `held` survives `declareRole` (RULE-5 bullet 2).
- [ ] **Step 4: Run** the engine suite. Expected: PASS.
- [ ] **Step 5: Commit** red, then green.

### Task 1.4: T-AC-1′: the record replays a stop and a conscious press

- [ ] **Step 1: Write the failing test `T-AC-1′: …`** in `apps/server/test/` beside the existing replay tests (find them with `git grep -n "replay(" apps/server/test`). Record a game in which a seller is held and then holds ▼ through; it replays identical. Negative: delete the hold's `walk` intent from the record, and the replay is not identical.
- [ ] **Step 2: Run** `cd apps/server && npx vitest run <file>`. Expected: PASS for the positive case once 1.3 is in. If it passes before 1.3, the test is not exercising the stop: fix the test.
- [ ] **Step 3: Commit.**

### Task 1.5: the view and the phone (RULE-4 bullets, mock PhoneSale and TvSale)

**ACs verified:** B-AC-B1/B2 at the screen (driven in 1.7)

- [ ] **Step 1: Fill `WalkerView.held`** in `mule-game.ts` from the walker. Write the failing server test `B-AC-B1 (view): …`: the seller's own view and every other view carry `held: true` once stopped.
- [ ] **Step 2: Phone and TV, built to the mock:** `git show cde3ff61:design/mocks/auction-rules/src/Screens.tsx`, `PhoneSale` and `TvSale`. The KEEPS mark and the rail line are the mock's, in the words of WS6's "hold" copy ruling (AM-2 item 7); if the two disagree, ask the PM for WS6, don't choose. They are wired in `phone/Auction.tsx` and `AuctionParts.tsx` (`may_edit_content`). If the mark needs a change in `WalkBoard.tsx`, write it as a separate named-edit commit for WS4.
- [ ] **Step 3: `pnpm --filter @mule/web test` and typecheck.** Expected: green.
- [ ] **Step 4: Commit.**

### Task 1.6: the AI hand when it is held (named edit, WS1)

**Spec:** §10 RULE-4 "AI" bullet; AM-2 item 4

- [ ] **Step 1: Write the failing AI test `RULE-4 AI: …`** in `packages/ai/test/`. A held AI seller whose keep floor (`aim`/`steer`, AM-2 item 4) is at or above its need never presses ▼ again. One whose floor is below its need holds ▼ for `shortHoldMs` and sells on.
- [ ] **Step 2: Implement in `hands/auction.ts`** as ONE commit titled "named edit (WS1)". Send its SHA to the PM for WS1's OK before the PR leaves draft.
- [ ] **Step 3: `cd packages/ai && npx vitest run`.** Expected: green, FM-hurry-margin included. A seed-searched test that moves gets re-searched against trunk merged in.

### Task 1.7: front to back (B-AC-B1, B-AC-B2, B-AC-C1)

- [ ] **Step 1: Add the e2e steps** beside `readTheGoodsWalk` in `apps/web/e2e/auction-steps.ts`. B-AC-B1: a phone seller walks to the store's line and stops, the phone shows the KEEPS mark, and the server's stock agrees. B-AC-B2: hold ▼ 1 s and units sell on, with the server's count checked; a tap sells nothing. B-AC-C1: a seller trading at the store's line taps Buy; trading stops at once, the server has her as a buyer at the bottom edge, and walking up she buys. Negative: Sell holding none is refused. Each check reads the server truth (`untilServer`), not only the screen.
- [ ] **Step 2: Run** `cd apps/web && npx vite build && npx tsx e2e/auction-steps.ts` (it owns its server on port 0). Expected: exit 0.
- [ ] **Step 3: Commit.**

### Task 1.8: T-AC-2′ sim, rulebook

- [ ] **Step 1: T-AC-2′ (needStop): `pnpm sim -- --games 40 --seed 101`** on trunk and on the branch, plus `--set WALK.needStop=false` on the branch as the control. Put money, stock and shortages per seat, and units sold to the store, in the PR body, and send them to WS1 via the PM.
- [ ] **Step 2: Rulebook:** in `docs/rulebook/goods-auction.html` §B and §C, move the pill from Designed to "In the game" with the lane (WS3) and the PR number; describe the rules as built, with the example's numbers taken from the config. Run `node docs/rulebook/build-index.mjs`.
- [ ] **Step 3: Commit.**

### PR-1 merge gate

- [ ] Every AC in the table's PR-1 row has a green test named for it
- [ ] Red-test commits precede their fixes in history
- [ ] `held` is exercised by a consumer: the server test reads the view, and the e2e reads the phone
- [ ] Front to back: `auction-steps.ts` drives B-AC-B1, B2 and C1 and checks the server truth
- [ ] No new `@ts-ignore` or `eslint-disable` without a reason on the same line
- [ ] `pnpm typecheck && pnpm test` green; CI green (check, e2e, e2e-regression, sim)
- [ ] WS1's OK on the `hands/auction.ts` SHA (and WS4's on any `WalkBoard.tsx` SHA), via the PM
- [ ] Rulebook chapter updated and the index rebuilt
- [ ] One independent review; the line `Review: APPROVE at <sha>` is in the PR body

---

## PR-2: rest zones and hard edges (RULE-6)

### Task 2.1: zones fixed at the good's start (AM-2 item 3)

- [ ] **Step 1: Write the failing test `B-AC-D2: …`** in `packages/engine/test/rest-zones.test.ts`. With the store's budget spent and no ship, a seller holding ▼ stops at the old buying line B and never below it; a buyer resting below B never trades.
- [ ] **Step 2: Run it.** Expected: FAIL (`sellerFloor` falls to `lo + 1`).
- [ ] **Step 3: Implement** `LiveAuction.zones` in `auction.ts::nextGood`: B is the higher of `storeBuy` and the ship's price at that moment, S is `storeSell`, and `lo`/`hi` come from the board. In `walk.ts`, a seller stops at B (row 3, which replaces the fall to `lo + 1`).
- [ ] **Step 4: Run** the engine suite. Expected: green.
- [ ] **Step 5: Commit** red, then green.

### Task 2.2: B-AC-D1: hard edges

- [ ] **Step 1: Write the failing test `B-AC-D1: …`.** A buyer holding ▼ stops at `lo`, a seller holding ▲ stops at `hi`, and neither trades. Check both `walk` and `walkStep`, at two tick lengths.
- [ ] **Step 2: Run it.** Expected: FAIL (a buyer is clamped only at 0; a seller has no cap).
- [ ] **Step 3: Implement** RULE-6 rows 1–2 in `stepWalker`/`stepBoard`.
- [ ] **Step 4: Run** the engine and ai suites. Expected: green. An AI test that walked past an edge gets its target clamped (RULE-6 "AI" bullet), not the edge removed.
- [ ] **Step 5: Commit.**

### Task 2.3: the view's zones and the board drawing (mock PhoneRest)

- [ ] **Step 1: Fill `AuctionView.zones`** in `mule-game.ts`. Write the failing server test `B-AC-D1 (view): …`: zones equal the engine's.
- [ ] **Step 2: Draw the zones to the mock's `PhoneRest`.** The drawing is WS4's `WalkBoard.tsx` (a named-edit commit, its SHA sent to the PM); the wiring goes in `AuctionParts.tsx`.
- [ ] **Step 3: Run** the web tests and typecheck. Expected: green.
- [ ] **Step 4: Commit.**

### Task 2.4: front to back B-AC-D1

- [ ] **Step 1: Add the e2e step.** A phone buyer holds ▼ to the bottom edge, the board shows them in the buyers' zone, and the server has them at `lo` with no deal.
- [ ] **Step 2: Run** `npx tsx e2e/auction-steps.ts`. Expected: exit 0.
- [ ] **Step 3: Commit.**

### Task 2.5: rulebook §D

- [ ] **Step 1:** In `goods-auction.html` §D, move the pill from Designed to "In the game" (WS3, PR number), then run `build-index.mjs`. **Step 2:** Commit.

### Task 2.6: sim check

- [ ] **Step 1:** Run `pnpm sim` before and after, and put the auction lines and units sold to the store in the PR body. RULE-6 has no config switch; the hard edges are the rule.

---

## PR-2, continued: bidding past a sold-out store (RULE-7)

### Task 3.1: config and contract

- [ ] **Step 1:** Add `WALK.soldOutBidding` (true) and the selling line's `bid?: true` flag on `AuctionView` per §10's table. Run `pnpm typecheck`; expected exit 0.

### Task 3.2: T-AC-E2: a buyer never walks into a resting seller

- [ ] **Step 1: Write the failing property test `T-AC-E2: …`** in `packages/engine/test/sold-out-bids.test.ts`. Over generated tick lengths and resting asks above S, a buyer walking up with the store sold out stops one step below the lowest resting ask and never trades with a seller standing still.
- [ ] **Step 2: Run it.** Expected: FAIL (today the buyer meets the seller and they trade).
- [ ] **Step 3: Implement** RULE-7 rows 1–2 in `walk.ts`, gated on `soldOutBidding`. Buyers may go up to `hi − step`.
- [ ] **Step 4: Run** the engine suite. Expected: green.
- [ ] **Step 5: Commit** red, then green.

### Task 3.3: B-AC-E1 in the engine: the line shows the top bid; a seller walking down trades

- [ ] **Step 1: Write the failing test `B-AC-E1: …`.** Sold out: the line reads the highest active bid (a buyer who can pay it), or S when no bid is above S, and the store sells nothing. A seller walking down onto the bid trades at it, one unit at a time.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** rows 3–4 (`storeSellLine` while sold out). **Step 4:** Run the suite; expected green. **Step 5:** Commit red, then green.

### Task 3.4: the view, the label (mock PhoneSoldOut, TvSoldOut)

- [ ] **Step 1:** Fill the line and the `bid` flag in `mule-game.ts`. Write the server test `B-AC-E1 (view): …`.
- [ ] **Step 2:** Add the label "Highest bid N" to the mock (`PhoneSoldOut`, `TvSoldOut`): wiring in `AuctionParts.tsx`, and a `WalkBoard.tsx` change as a WS4 named edit.
- [ ] **Step 3:** Run the web tests. **Step 4:** Commit.

### Task 3.5: the AI's sold-out moves (named edit, WS1)

- [ ] **Step 1: Write the failing AI test `RULE-7 AI: …`.** A buyer short of a sold-out good walks up to its own price limit. A seller walks down onto the highest bid when that bid is at or over its reservation price.
- [ ] **Step 2: Implement in `hands/auction.ts`** as one named-edit commit, and send the SHA to the PM for WS1. **Step 3:** Run the ai suite; expected green.

### Task 3.6: front to back B-AC-E1, and its negative

- [ ] **Step 1: Add the e2e step.** With the store sold out of Water, Lena walks up past the old line, and every screen's line shows her bid. Brix, resting above, doesn't trade. He walks down to her bid and they trade, and the server's stock agrees.
- [ ] **Step 2: Run** `npx tsx e2e/auction-steps.ts`. Expected: exit 0. **Step 3:** Commit.

### Task 3.7: T-AC-2′ (soldOutBidding), rulebook §E

- [ ] **Step 1: T-AC-2′ (soldOutBidding):** Run `pnpm sim -- --games 40 --seed 101` before and after, with `--set WALK.soldOutBidding=false` as the control, and send the results to WS1 via the PM.
- [ ] **Step 2:** In `goods-auction.html` §E, move the pill to "In the game", then run `build-index.mjs`. **Step 3:** Commit.

### PR-2 merge gate

Same lines as PR-1's, with B-AC-D1, B-AC-D2, B-AC-E1, T-AC-E2 and T-AC-2′ (soldOutBidding), and the WS1 and WS4 OKs on their SHAs.

---

## Pre-implementation checklist

- [x] Spec approved: Heiko's rulings of 5 Nov ("build is a go"); AM-2 records plan-time corrections, none changing a ruling
- [ ] Upstream merged: #439 (`auctionNeed`); WS6's mock cde3ff61 on trunk, asked of the PM
- [x] Branch policy: lane PRs to `feat/strategist`, batched by the PM; never `main`
- [ ] Base `feat/strategist` @ `<sha at PR-1's cut>` green: `pnpm typecheck` 0 · engine · ai · server · web · ui · tabletop green ← run at the cut and paste the numbers
- [x] Repo access: lane allow rules for `gh pr` (5 Nov)
- [x] No spikes
- [ ] Effort to the PM: two PRs, about a day and two days of agent time, plus their WS1/WS4 OK round-trips
