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

- [ ] **Step 1: Write the failing server test** in `apps/server/test/auction-units.test.ts` or a new goods-auction server test. During a good's walk, a human holds Up, then the phone drops. At viewFor: the walker's price no longer moves on later ticks, the seat counts as Done, and it makes no trade. This mirrors the land auction's rule (mule-game.ts about :537). Commit it as RED.
- [ ] **Step 2: Implement.** In the goods tick's away branch (about :503), stop the walker (`setWalk(state, seat.id, 0)`, with a RuleError caught as the land branch does) before `auctionDone`. Green, then commit.

### Task A.2: FU-2, a reload no longer ends the land grant for everyone

- [ ] **Step 1: Write the failing server test.** The only human drops during the land grant. The grant goes on until its own end (the light's sweeps, `GAME.grantSweeps`, or its clock); it doesn't jump to the next phase at once. A dropped human just doesn't claim. Negative: once every seat has claimed or passed, the grant still ends as before. Commit it as RED.
- [ ] **Step 2: Implement.** `checkAllReady` stops fast-forwarding `landGrant` on an away seat. Keep the fast-forward for planning, and for development's pub rule. Green, then commit.
- [ ] **Step 3: Tell WS4** the SHA before the PR merges, and run `pnpm --filter @mule/web e2e`. If WS4's smoke reload check depended on the fast-forward, report it to WS4 and the PM; don't edit smoke.ts.

### Task A.3: `MyView.installedThisTurn` (WS6's ask)

- [ ] **Step 1: Write the failing test at viewFor** (apps/server/test). After `installMule`, the seat's own `MyView.installedThisTurn` is true, and it stays true across a reload (a fresh view for the same seat). Other seats' views don't carry it. It resets to false when that seat's next development turn starts. Commit it as RED.
- [ ] **Step 2: Implement.** Set a per-player flag in `game.ts::installMule`, reset it at the start of the seat's development turn, add the field to the protocol's MyView, and copy it in viewFor. Green, then commit. Tell WS6 the SHA.

### Task A.4: test cleanups owed from earlier reviews

- [ ] **Step 1:** add a `server.test.ts` row: `{"t":"kick"}` with no seatId → "Bad message". This kills WS4's surviving parse mutant on `str(m.seatId)`.
- [ ] **Step 2:** drop the redundant key save/restore in `apps/server/test/land-auction-ai.test.ts` (about :346). `test/setup.ts` already deletes the key.
- [ ] **Step 3:** speed up the RULE-7 row-1 test in `lots-colony.test.ts`: one game per seed plus `structuredClone` per month, keeping the 30 s timeout as headroom. Report the time before and after.
- [ ] **Step 4:** export a `colonySeed` test helper from a shared server test module, so WS4's `handoff.test.ts` can import it.
- [ ] **Step 5:** move the bestPrices tests from `apps/web/test` to `packages/ui/test`, beside the code. That's the named edit above.
- [ ] **Step 6:** run trace-check, expecting tests moved, not lost, and commit.

### PR-A merge gate

- [ ] A.1–A.3's tests are failure-mode or AC named, and each RED commit comes first
- [ ] WS4 has seen FU-2's SHA, and the e2e (smoke, zoom, lobby) is green
- [ ] WS6 has the `installedThisTurn` SHA
- [ ] `pnpm typecheck` · `pnpm test` · `tsx e2e/auction-steps.ts` are green, and the sim is byte-identical to the base on seeds 101 and 1. These are fixes to dropped-phone paths the sim never takes; any difference is a finding.
- [ ] A code review has come back clean

## PR-B: the phone, FU-1 (`ws3-fu1` from `ws3-auctions`)

**Authority:**
- `may_edit`:
  - `apps/web/src/phone/Auction.tsx`;
  - `apps/web/src/phone/LandAuction.tsx`;
  - a new `apps/web/src/phone/useWalkIntent.ts`;
  - `apps/web/src/components/AuctionParts.tsx` (only if useNewestFirst is touched);
  - `apps/web/test/**`.
- `must_not_edit`: `apps/server/**`, `packages/**` (PR-A's), and `apps/web/e2e/{smoke,harness,screens}.ts` (WS4's).

### Task B.1: one walk-intent hook for both auctions, with the held-Up reset

- [ ] **Step 1: Write the failing test** in apps/web/test. With Up held across the goods auction's switch to the next good, the next good's first press still moves the walker, as the land auction already guarantees at its bell. Commit it as RED.
- [ ] **Step 2: Implement** a `useWalkIntent` hook in `phone/`, taken from LandAuction.tsx's controls, which have the reset. Use it in both screens and delete the copy in Auction.tsx. Green, then commit.

### Task B.2: Ready shows "Done · waiting" on the status screen

- [ ] **Step 1: Test it.** Press Ready during a good's status, and the button reads "Done · waiting", driven from the view. If it already passes on trunk, keep it as a pin and skip Step 2.
- [ ] **Step 2: Implement** the view or phone fix the test points to (FU-1's original finding: the walker's `done` was undefined at status). Green, then commit.

### PR-B merge gate

- [ ] B.1 and B.2 tested, each RED commit first, or B.2 recorded as a pin
- [ ] `pnpm typecheck` · `pnpm --filter @mule/web test` · build, then `tsx e2e/auction-steps.ts` · `pnpm --filter @mule/web e2e` are green
- [ ] A goal check in the browser: hold Up across a good's switch, and the next good's first press moves the walker
- [ ] A code review has come back clean
