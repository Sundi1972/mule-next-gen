# WS3 Follow-ups: Dropped Walkers, the Land Grant on a Reload, Installed This Turn, and Test Cleanups (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Weight:** Sketch: maintenance owed from earlier reviews, as a task list with one merge gate per PR. There is no new contract except `MyView.installedThisTurn`, which WS6 asked for and WS3 accepted. Two PRs, because their files are disjoint: PR-A touches the engine and server, PR-B the phone.

<!-- plan-check: no-task C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C15 — delivered (#37, #39, #69); these are review follow-ups and failure-mode fixes, not spec changes -->
<!-- plan-check: no-task B-AC-1 B-AC-2 B-AC-3 B-AC-4 B-AC-5 B-AC-6 B-AC-7 B-AC-8 B-AC-9 T-AC-1 T-AC-2 T-AC-3 T-AC-4 T-AC-5 T-AC-6 T-AC-7 T-AC-8 T-AC-9 — delivered; they stay green as pins -->

## Goals: lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 [spec §0] | every player at the kitchen table | a dropped or reloaded phone no longer moves a walker on its own or ends the land grant for everyone | UBER-AC-1 (pin) and each task's failure-mode test | **this plan** |
| G-2 [spec §0] | a family with fewer humans than seats | unchanged; the AI tests get faster and leaner | UBER-AC-2 (pin) | **this plan** |

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- 00-concept's "three or four more each month" colony plots. Only the one occasional colony plot of AM-1 (§8) is in scope; more is a later, measured change agreed with WS1, because it moves G-1's land supply. *Needs its own spec.*
- AI seats listing their own lots: that needs WS1's sell-side value.
- Direct trades between players, deal cards, and selling plot upgrades on their own.
- Balance numbers outside the LOTS block.

**Thin baseline (spec §0.1):** not reopened. These are fixes to delivered behaviour.

**Inputs:**
- Spec: `docs/specs/2026-10-21-ws3-land-auction.md` §4 (a dropped phone counts as Done).
- WS6's ask: `MyView.installedThisTurn` for the store's Now line (WS6 spec RULE-7 row 7). WS3 accepted it, and it is checked at viewFor.
- WS3's lane ledger: the FU-1, FU-2 and test-cleanup items, and the earlier reviews that raised them.

**Constraints:**
- The engine stays pure, and its numbers live in config.ts.
- WS4 must hear about FU-2 before PR-A merges: WS4's smoke reload check relied on the land-grant fast-forward.
- WS1 is sending named edits in game.ts and mule-game.ts (stray numbers into config). Whichever PR merges second rebases.

## Status (2026-10-22)

**PR-A: MERGED into the lane as #82 (`ws3-fu-a` @ 4486dbf).** The review was READY WITH FIXES, then fix round 1, a scoped re-review with no code findings, and fix round 2 (tests only). WS3 measured 4486dbf: typecheck, every test, and auction-steps green; removing the pass from `sitOut` turns 3 rows red. History:
- A.1: RED 718f2ab, fix a293055.
- A.2 (FU-2): RED 2a0fbf8, fix f9506ce. WS4 OK'd it.
- A.3: RED 14afadf, feat 942cb91. WS6 was told.
- A.4: 4d901fd the kick row · 10b89f6 RULE-7 speed-up, 2.1 s → 0.6 s, byte-identical · 394817f the `colonySeed` helper · c715585 bestPrices tests moved to `packages/ui/test`.
- **A.4 Step 2 was SKIPPED: the plan's premise is false.** `apps/server/test/setup.ts` exists only on ws2-brain (53045a3), not in this lane. The save/restore stays until that file reaches the lane; carried as a follow-up.
- **Fix round 1, from the review:**
  - **Important:** a dropped walker standing on a trade line keeps trading (it predates the PR; A.1's "makes no trade" doesn't hold). **WS3 ruling:** a phone that drops during a good sits the rest of it out: `declareRole(pass)` in status and walk, then `auctionDone`. A reconnect during the walk can rejoin through the walk picker. Test: a drop exactly on the store's sell line, and no trade from then on.
  - **Important:** a phone dropped on the status screen counts as Done (mutant M4 survives). A row where the walk starts next tick, plus a seat that dropped after passing.
  - **Minor:** `installedThisTurn` survives a second MULE (M10), and still holds at production and the next planning (M10b).
  - **Minor:** `engine/observe.ts` copies the field. That's outside PR-A and harmless, so it's left alone.
  - **WS4's ask:** a reconnect-mid-grant row, with claims intact and the player still able to claim.

**PR-B: MERGED into the lane as #78 (`ws3-fu1` @ 1075f37).** Review APPROVED. History:
- B.1: RED f007f97, then cc4fa74.
- B.2: ab21b21, a pin. It already passed on trunk, so Step 2 was skipped.
- B.3: RED 389639d, then 6e23345. WS4 OK'd the guard against both of its `host-dialog`s.
- B.4: 71b347f, the e2e.
- Fix round: RED d4a1133, then b919659. 9e98957 holds WS3's M16 test fix and a comment fix.

**Lane:** PR-A and PR-B reached trunk as #86 (c3f1ffe, Heiko: "merge"). Still open: A.4 Step 2 (waits for ws2-brain's setup.ts) and PR-B's hands-on goal check.

**Lean CI (2026-10-28, Heiko's directive; SEAMS ruling; WS4's `docs/plans/2026-10-28-lean-ci.md`):** WS3's part merged into the lane as #94.
- T-AC-7 moves to Tier 2 under `MULE_TIER2`.
- B-AC-7's long-tick sweep plays the short table only: 1.17 s → 0.61 s.
- RULE-7 row 1 samples 100 seeds: 0.84 s → under 0.5 s.
- Each trim kills the same mutants as before.
- WS3's Tier 1 unit time: about 15 s → 7.5 s locally.
- auction-steps.ts stays one Tier 2 game.
- #101 merged to trunk at 7fe5d0e (Heiko: "Yes, merge").
- Owed:
  - trim auction-steps.ts:439's three declare-text alternatives once WS4's FU-17 (#96) is on trunk;
  - #107 (the `PHASES` block and the `literal-ok` markers) is in the lane at fd9a556 and goes to trunk with the WS6-C13 batch.

**The settings guard (#117, trunk da4a56f), 2026-10-28:**
- The lane merged it; WS3's four marked files left its PENDING list in cabd80f, WS1's named-edit file.
- walk.ts and hands/lot.ts divide by WS1's `MS_PER_SECOND` (93ce2b4).

**Found in WS6-C13's review (round 1, 2026-10-28), not in that PR:**
- **Extract the walking state machine's pure parts** into `apps/server/src/dev-walking.ts`, as land-auction.ts and politics-view.ts are: `DevIntent`, `Colonist`, `walkTarget`, `placeName`, the order of due arrivals, `colonistView`. The timer wiring stays in `MuleGame`. mule-game.ts went from 881 to 1036 lines.
- **Extracting the walking parts is PR-C, below** (the PM's order, 2026-10-28).
- **`GRANT_TICK_MS` isn't scaled by `phaseScale`.** At phaseScale 0.1 on seed 7, the AI wins no land in month 1. This predates C13. **CLOSED, won't fix (PM ruling A, 2026-10-28):** WS4's T-AC-2 (phase-scale.test.ts) pins the tick at its real pace on purpose, so AI thumbs can still beat it, and that rule stands. Compressed-time games give AI seats little land; that is e2e runs and demos only, never a scale-1 game.
- **RULE-7 row 1's 30 s timeout** (WS5's 5b3f3c8): re-time it under load once WS5's #112 (maps 2.7× faster) is on trunk, and drop it if the row stays well inside vitest's 5 s default. **Blocked:** #112 is merged into ws5-maps only, not into trunk 9e433ca.
- **The FU-17 trim** (auction-steps.ts's three declare-text alternatives in `stageShown`). **Blocked:** WS4's #96 is merged into ws4-table only, not into trunk 9e433ca.
- **The AI's rule when humans finish development early** (parked by the PM): the pub path waits for AI seats, the Ready/drop path doesn't. Unify only on a PM ruling.

## PR-A: engine and server (`ws3-fu-a` from `ws3-auctions`)

**Authority:**
- `may_edit`:
  - `apps/server/src/mule-game.ts`;
  - `packages/engine/src/game.ts` (installMule and the development turn only);
  - `packages/engine/src/types.ts` (Player or GameState, for the installed flag only);
  - `packages/protocol/src/index.ts` (MyView only);
  - `apps/server/test/**`;
  - `packages/engine/test/lots-colony.test.ts`.
- **Named edit (WS4's file; WS4 asked for this):** `packages/ui/test/`, which gets the bestPrices tests moved from apps/web/test.
- `must_not_edit`: `apps/web/src/**`, which is PR-B's, and `packages/engine/src/{walk,auction,lots}.ts`, since nothing here changes their rules.

### Task A.1: a dropped phone's walker stops in the goods auction

- [x] **Step 1: Write the failing server test** in `apps/server/test/auction-units.test.ts` or a new goods-auction server test. During a good's walk, a human holds Up, then the phone drops. At viewFor: the walker's price no longer moves on later ticks, the seat counts as Done, and it makes no trade. This mirrors the land auction's rule (mule-game.ts about :537). Commit it as RED.
- [x] (superseded by fix round 1: the seat passes, which also stops it) **Step 2: Implement.** In the goods tick's away branch (about :503), stop the walker (`setWalk(state, seat.id, 0)`, with a RuleError caught as the land branch does) before `auctionDone`. Green, then commit.

### Task A.2: FU-2, a reload no longer ends the land grant for everyone

- [x] **Step 1: Write the failing server test.** The only human drops during the land grant. The grant goes on until its own end (the light's sweeps, `GAME.grantSweeps`, or its clock); it doesn't jump to the next phase at once. A dropped human just doesn't claim. Negative: once every seat has claimed or passed, the grant still ends as before. Commit it as RED.
- [x] **Step 2: Implement.** `checkAllReady` stops fast-forwarding `landGrant` on an away seat. Keep the fast-forward for planning, and for development's pub rule. Green, then commit.
- [x] **Step 3: Tell WS4** the SHA before the PR merges, and run `pnpm --filter @mule/web e2e`. If WS4's smoke reload check depended on the fast-forward, report it to WS4 and the PM; don't edit smoke.ts.

### Task A.3: `MyView.installedThisTurn` (WS6's ask)

- [x] **Step 1: Write the failing test at viewFor** (apps/server/test). After `installMule`, the seat's own `MyView.installedThisTurn` is true, and it stays true across a reload (a fresh view for the same seat). Other seats' views don't carry it. It resets to false when that seat's next development turn starts. Commit it as RED.
- [x] **Step 2: Implement.** Set a per-player flag in `game.ts::installMule`, reset it at the start of the seat's development turn, add the field to the protocol's MyView, and copy it in viewFor. Green, then commit. Tell WS6 the SHA.

### Task A.4: test cleanups owed from earlier reviews

- [x] **Step 1:** add a `server.test.ts` row: `{"t":"kick"}` with no seatId → "Bad message". This kills WS4's surviving parse mutant on `str(m.seatId)`.
- [ ] (SKIPPED: setup.ts is only on ws2-brain; carried) **Step 2:** drop the redundant key save/restore in `apps/server/test/land-auction-ai.test.ts` (about :346). `test/setup.ts` already deletes the key.
- [x] **Step 3:** speed up the RULE-7 row-1 test in `lots-colony.test.ts`: one game per seed plus `structuredClone` per month, keeping the 30 s timeout as headroom. Report the time before and after.
- [x] **Step 4:** export a `colonySeed` test helper from a shared server test module, so WS4's `handoff.test.ts` can import it.
- [x] **Step 5:** move the bestPrices tests from `apps/web/test` to `packages/ui/test`, beside the code. That's the named edit above.
- [x] **Step 6:** run trace-check, expecting tests moved, not lost, and commit.

### PR-A merge gate

- [x] A.1–A.3's tests are failure-mode or AC named, and each RED commit comes first
- [x] WS4 has seen FU-2's SHA, and the e2e (smoke, zoom, lobby) is green
- [x] WS6 has the `installedThisTurn` SHA
- [x] `pnpm typecheck` · `pnpm test` · `tsx e2e/auction-steps.ts` are green, and the sim is byte-identical to the base on seeds 101 and 1. These are fixes to dropped-phone paths the sim never takes; any difference is a finding.
- [x] A code review has come back clean

## PR-B: the phone, FU-1 (`ws3-fu1` from `ws3-auctions`)

**Authority:**
- `may_edit`:
  - `apps/web/src/phone/Auction.tsx`;
  - `apps/web/src/phone/LandAuction.tsx`;
  - a new `apps/web/src/phone/useWalkIntent.ts`;
  - `apps/web/src/components/AuctionParts.tsx` (only if useNewestFirst is touched);
  - `apps/web/test/**`;
  - `apps/web/e2e/auction-steps.ts` (B.4; WS3's file).
- `must_not_edit`: `apps/server/**`, `packages/**` (PR-A's), and `apps/web/e2e/{smoke,harness,screens}.ts` (WS4's).

### Task B.1: one walk-intent hook for both auctions, with the held-Up reset

- [x] **Step 1: Write the failing test** in apps/web/test. With Up held across the goods auction's switch to the next good, the next good's first press still moves the walker, as the land auction already guarantees at its bell. Commit it as RED.
- [x] **Step 2: Implement** a `useWalkIntent` hook in `phone/`, taken from LandAuction.tsx's controls, which have the reset. Use it in both screens and delete the copy in Auction.tsx. Green, then commit.

### Task B.2: Ready shows "Done · waiting" on the status screen

- [x] **Step 1: Test it.** Press Ready during a good's status, and the button reads "Done · waiting", driven from the view. If it already passes on trunk, keep it as a pin and skip Step 2.
- [x] (skipped: B.2 is a pin) **Step 2: Implement** the view or phone fix the test points to (FU-1's original finding: the walker's `done` was undefined at status). Green, then commit.

### Task B.3: arrow keys don't walk the player while a dialog is open (added: WS4's review)

WS4's PR-6 adds a "move to your phone" dialog (`role="dialog"`, `aria-modal`, testid `host-dialog`) that can stay open during either auction.

- [x] **Step 1: Write the failing unit rows.** While `[aria-modal="true"]` or `dialog[open]` is present, an arrow keydown sends no walk intent. Releasing a key that was already held still sends its stop.
- [x] **Step 2: Implement** the guard in the shared hook's core, then commit.

### Task B.4: the goods auction's held Up, front to back (added: the goal-check line)

- [x] **Step 1:** in `apps/web/e2e/auction-steps.ts` (WS3's), a phone holds Up through the end of one good's walk into the next good's walk. Its first press there moves its walker, asserted at viewFor. Positive control: the old Auction.tsx logic, or no reset in the hook, makes it red.

### PR-B merge gate

- [x] B.1 and B.2 tested, each RED commit first, or B.2 recorded as a pin
- [x] `pnpm typecheck` · `pnpm --filter @mule/web test` · build, then `tsx e2e/auction-steps.ts` · `pnpm --filter @mule/web e2e` are green
- [ ] (automated only: B.4 drives this in a real browser and asserts it at the server; no hands-on check yet, owed at UAT) A goal check in the browser: hold Up across a good's switch, and the next good's first press moves the walker
- [x] A code review has come back clean

## PR-C: the walking parts in their own file (`ws3-fu-walk` from `ws3-auctions`)

No behaviour change: a pure move, as land-auction.ts and politics-view.ts already sit beside `MuleGame`. The C13 suite (`apps/server/test/dev-walking.test.ts`, WS3's) is the pin, and it stays unedited.

**Authority:**
- `may_edit`: `apps/server/src/mule-game.ts`, and the new `apps/server/src/dev-walking.ts` (a split from WS3's mule-game.ts, so WS3's).
- `must_not_edit`: every test file, every other lane's file, `packages/**` (no engine, protocol or AI change), and the 25 importers of mule-game.js. Its exports (`MuleGame`, `GRANT_TICK_MS`, `PHASE_MS`, `DEFAULT_AI_LEVEL`, `AI_NAMES`, `AI_DEV_TICK_MS`) stay where they are.

### Task C.1: move the pure walking parts

**MERGED into the lane as #134 (1ec8d5b, head 9db7c57).** mule-game.ts went from 1118 to 1066 lines, and dev-walking.ts is 58. The colonist view takes the phase, not the clock, because its body never read the clock. The control turned 12 of 26 C13 rows red. CI check and e2e were green, and the lead reviewed it from the diff.

- [x] **Step 1:** move into `dev-walking.ts`: `DevIntent`, `Colonist`, `walkTarget`, `placeName`, the order of due arrivals (the sort inside `settleArrivals`), and the colonist view (the body of `colonistView`, as a function of the colonist and the clock). The timer wiring (scheduling, `settleArrivals`/`arrive`/`act` as methods, `devEndsAt`, the early end) stays in `MuleGame`.
- [x] **Step 2:** the pin. `dev-walking.test.ts`, `planning.test.ts` and the whole server suite pass unedited. **Positive control:** break `walkTarget` in its new home (one place returns the wrong target), watch dev-walking.test.ts go red, then restore.

### PR-C merge gate

- [x] `git diff --stat` shows only the two server source files; no test is edited
- [x] `pnpm typecheck` · `pnpm test` are green, and the server count is unchanged (153 +1 skipped)
- [x] The positive control went red, and the tree is clean after the restore
- [x] `pnpm --filter @mule/web build` and `pnpm --filter @mule/web e2e:core` are green (the walk is driven in the smoke)
- [x] A code review has come back clean

## PR-D: the FU-17 trim (`ws3-fu17-trim` from `ws3-auctions`)

WS4's FU-17 (#96, on trunk via #132) removed WalkBoard's dead declare block and narrowed its stage to `'walk'`. The three declare texts that `stageShown` in `apps/web/e2e/auction-steps.ts` (WS3's) looks for (`SELLERS START AT THE TOP`, `Done choosing`, `Buy, sell or pass?`) now exist nowhere in `apps/web/src` or `packages/ui/src`, so that check can't fire.

- [ ] **Step 1:** remove that check, the `text` it alone used, and the doc comment's "Any sign of a declare screen counts as one". Keep the `· buy or sell?` heading alternative, which names the good on the status screen (Auction.tsx:60). The server-side UBER-AC-1 check (no declare stage) stays.
- [ ] **Merge gate:** the grep is still empty at the head; `tsx e2e/auction-steps.ts` exits 0 with UBER-AC-1's ✓ (Tier 2, so run locally); typecheck 0; only auction-steps.ts changes; review clean.

## PR-E: RULE-7 row 1's timeout (`ws3-rule7-timeout` from `ws3-auctions`)

WS5's #112 (maps 2.7× faster) is on trunk via #133. Row 1 in `packages/engine/test/lots-colony.test.ts` (:110–128) still carries a `30_000` timeout as headroom (5b3f3c8).

- [ ] **Step 1:** time the row 5 times under the machine's normal load, recording each time and the load average. If every run is under 2.5 s, drop the timeout and the comment's headroom clause. Otherwise set it to about 2× the slowest run, in whole seconds, and say so in the comment.
- [ ] **Merge gate:** no assertion edited; `pnpm --filter @mule/engine test` green; typecheck 0; only lots-colony.test.ts changes; review clean.
