# WS6 C4: Sides Are Picked on the Status Screen (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Programme (WS6's spec). This plan builds one change of it, C4 (WS6-PR-2 for WS3), as one PR.

<!-- plan-check: no-task C1 C2 C3 C5 — WS6-PR-1, delivered by WS3's wave A plan (#44, #47) -->
<!-- plan-check: no-task C6 C7 C8 C9 C10 C11 C12 C13 C14 C15 C16 C17 C18 — other WS6 waves and other lanes, not C4 -->
<!-- plan-check: no-task B-AC-1 B-AC-2 B-AC-3 B-AC-5 T-AC-1 T-AC-2 — WS6-PR-1, delivered -->
<!-- plan-check: no-task B-AC-6 B-AC-7 B-AC-8 B-AC-9 B-AC-10 B-AC-11 B-AC-12 B-AC-13 B-AC-14 B-AC-15 T-AC-4 T-AC-5 T-AC-6 T-AC-7 T-AC-9 T-AC-10 — other WS6 changes, not C4 -->


## Goals: lifted from WS6 spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 (WS6 UX-1) | every player at the table, most of all the youngest and new ones, and the TV watchers | the auction read at a glance; a month loses up to 5 s per good | UBER-AC-1: its last clause is "the view never enters a stage called `declare`" | WS6-PR-1 delivered the lines, units and stock (#44, #47). **This PR** completes UBER-AC-1 |

**Non-goals (WS6 §0), lifted verbatim. A task serving one is cut:**
- The original's art, layout, names or trade dress (concepts only).
- The event engine itself: WS1 builds the ten events. This spec shows them.
- R1's numbers: WS1 measures walking speeds in the sim; Heiko approves them.
- A joystick or free steering: tap to walk only.

**Thin baseline (WS6 §0.1):** the two moving lines and units on the auction board, plus a static per-plot list on the harvest screen, with no store change and no animation. Estimated at about 2 PRs. It lost because Heiko ruled for the walk-in store and animated events.
→ **PR relationship:** this PR is the R2 slice of the chosen approach's first wave ("auction readability (no rule change beyond R2)"). It is a vertical slice: engine → AI → server → phone and TV → browser.

**Constraints:** WS6 §0.2 HC-1 to HC-9 travel with every task. The ones that bite here:
- HC-2: the TV never shows what a player holds, except the goods auction's status table;
- HC-5: build from the mock at 25a2512 and keep its data-testids;
- HC-7: phones stay silent.

**Architecture:** the engine's per-good stage machine drops its `declare` stage. Walkers are seeded with `defaultSide` when the status screen opens, `declareRole` is accepted during status, and the bell at the end of status starts the walk. The server, the AI hand and both screens follow the engine's stages. The phone's and TV's status screens gain Buy and Sell, grafted from the mock.

**Tech Stack:** pnpm monorepo, TypeScript strict, vitest, React 18 + Tailwind 4, Playwright via WS4's harness, @tabletop/core server.

**Inputs:**
- Spec: `docs/specs/2026-10-21-ws6-ux.md`. Consumed: §1 C4, §2 RULE-2, §3 (the `AuctionView.stage` row, which breaks: "all updated in C4"), §6 B-AC-4, T-AC-3 and T-AC-8, §7 R-2, §8 AM-1.
- Mock: `design/mocks/ws6-ux/src/screens/StatusDeclare.tsx` (`PhoneStatusDeclare`, `TvStatusDeclare`; state `#status`). It is the same at 25a2512 (HC-5) and 1b69e37 (`git diff` of the file and the fixture between them is empty).
- Ownership: `.handover/SEAMS.md`.
  - WS3 owns `packages/engine/src/auction.ts`, the WALK block of `config.ts`, `packages/protocol/**`, `apps/server/src/{mule-game,server}.ts` and `apps/web/src/phone/Auction.tsx`.
  - WS4 owns `apps/web/src/table/TableApp.tsx` and `apps/web/src/game/sound.ts`, so those are named edits.
  - WS1 owns `packages/ai/src/hands/auction.ts` and `packages/ai/src/play.ts` (WS6 §7 R-2: "WS1 owns the AI hand edit").
- N/A checked: no migration, no new contract beyond §3's row, no spike (WS6 §7: "No spike needed").

**Reading of RULE-2 row 4, recorded:** "during the walk switching side works as today". So the walk keeps today's Buy/Seller/Pass picker on the phone. The goods mock's walk has no picker; the mock shows layout, and the rule governs. Wave A placed the picker after `line-readout` (1216dd5), and that stays. WS4's FM-2 smoke, which clicks "Buyer" during the walk, is unaffected. This corrects a note in the wave A plan. **CLOSED (2026-10-22): WS6 confirms this reading. The walk keeps the picker, the mock simply doesn't draw it, and there is no spec change.**

## Status (2026-10-22)

- **C4.1 DONE** at dc08646 (RED 2ccd227), on `ws3-c4`. Review: READY WITH FIXES. The fix round is on `ws3-c4-engine-fix` from `ws3-c4`, followed by a scoped re-review.
  - **Important:** mutant M8 (a status-time side change takes back Done) survives. Strengthen `T-AC-3: declareRole works during status…` so a Done pressed earlier stays after a side change.
  - **Minors:**
    - the unreachable stage guard in declareRole (M14, equivalent) is deleted;
    - config.ts's history phrase reads "…and where each player picks a side for the walk";
    - types.ts's clockMs doc comment moves onto its field;
    - the redundant `:declare` assertion is deleted;
    - M9, which predates C4, is killed: `lets a player switch sides mid-walk…` asserts that a walk-time switch takes back Done;
    - `docs/technical-plan.md:54` is reworded to status → walk.
  - "Sell needs units" was already in the base; it is not new behaviour.
- **C4.2 DONE by WS1** at 3bcc3e3 on `ws3-c4`. WS1 reports the sim byte-identical to trunk 6df42d2 on seeds 1–40 and 101–140, and has signed off. **WS3 has not measured this:** C4.4 re-runs the sim on the merged branch.
- **C4.3 DONE** at 7181806 on `ws3-c4-screens`, based on dc08646 and not yet merged into `ws3-c4`. Review: READY. Fix round owed:
  - WS4's sound ruling (b) is folded in;
  - a `toggleSide` table test is added, titled `B-AC-4 (RULE-2 row 1): …`, which kills mutants M1 and M2 at pure-core altitude;
  - `toggleSide`'s docstring is trimmed to a pointer to RULE-2 row 1.

  Mutant M4 (the side read from local state, not the view) survives every test, so C4.4 Step 1 gains a surplus-player case.
- **WS4's rulings for this PR** (named edits; WS4 reviews them):
  - (a) C4.4 fixes `apps/web/e2e/screens.ts:127–134` ('Seller' plus 'Done choosing') and drops the dead 'Done choosing' match at `smoke.ts:256`;
  - (b) C4.3's fix round makes `sound.ts` tick during the status countdown as well as the walk. Status is 8 s, under WS4's 10 s threshold, so the tick covers the whole countdown. The comment at :141 becomes "the status countdown's last seconds and the walk".
- **CLOSED:** WS6 confirms the walk-picker reading (above).
- **Later the same day:** the C4.1 fix round was re-reviewed APPROVED. The C4.3 fix round (sound ruling (b), the `toggleSide` table) and C4.4 are DONE. C4.4's review was READY; its fix round adds a timing message for a tap that misses the bell.
  - **WS3 measured the sim:** byte-identical to trunk 6df42d2 on seeds 101 and 1.
  - **Render gate on `#status`:** 0 DIFFERS. Goal check in the browser: DELIVERED.
  - `ws3-c4` @ dc03028: typecheck 0, all suites green.
  - **Sub-PR #57 → `ws3-auctions`**, waiting on CI. The PM merges it.

---

## The PR

**Branch:** `ws3-c4` from `ws3-auctions`, with sub-PR → `ws3-auctions` and lane PR → `feat/strategist` (Heiko's OK through the PM).

| Task | Change | ACs | Contract | Owner | Depends on |
|---|---|---|---|---|---|
| C4.1 | engine stage machine, WALK, protocol stage type, server clock | T-AC-3 (engine half) | produces `AuctionView.stage: 'status' \| 'walk'` | WS3 | — |
| C4.2 | the AI hand declares during status | T-AC-3 (sim rows) | consumes C4.1 | **WS1** | C4.1 (typecheck is red between them) |
| C4.3 | phone and TV status screens with Buy and Sell; sound.ts stage check | B-AC-4 (UI half), T-AC-8 | consumes C4.1 | WS3 (+ WS4 named edits) | C4.1 |
| C4.4 | browser proof, render gate, sim report to WS1 | B-AC-4, UBER-AC-1 (last clause), T-AC-8, T-AC-3 sim rows | — | WS3 | C4.2, C4.3 merged into `ws3-c4` |

**Waves:**
- **Wave 1:** C4.1 alone. It produces the stage contract that every later task consumes. It cannot be stubbed, because a client written for `declare` does not compile against the new type.
- **Wave 2:** C4.2 (WS1) and C4.3 (WS3) in parallel. Their files are disjoint (`packages/ai/**` against `apps/web/**`), and both consume C4.1's frozen type.
- **Wave 3:** C4.4, after both are merged into `ws3-c4`.

`ws3-c4` is not green between C4.1 and C4.2: `hands/auction.ts` compares against `'declare'`. That's expected and never merged. C4.2 lands before any gate run is recorded.

### Authority

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

- `may_edit`:
  - C4.1: `packages/engine/src/auction.ts`, `packages/engine/src/types.ts` (LiveAuction's stage union and its doc lines only; added in execution, since the union lives there and not in auction.ts), `packages/engine/src/config.ts` (the WALK block, its doc included), `packages/engine/test/auction.test.ts`, `packages/protocol/src/index.ts` (the `AuctionView.stage` type), `apps/server/src/mule-game.ts`, and the `apps/server/test/` files that assert the stage: `mule-game.test.ts`, `auction-units.test.ts`, `phase-scale.test.ts`. Its fix round also rewords one sentence of `docs/technical-plan.md` (:54, the declare stage).
  - C4.3: `apps/web/src/components/AuctionParts.tsx` and a test file for `toggleSide`.
  - C4.4: `apps/web/e2e/auction-steps.ts`.
- `may_edit_content`: `apps/web/src/phone/Auction.tsx` (the status branch, grafted from `PhoneStatusDeclare`).
- **Named edits in other lanes' files:**
  - `apps/web/src/table/TableApp.tsx::TvAuction`, its status branch from `TvStatusDeclare` (WS4 reviews);
  - `apps/web/src/game/sound.ts:141–146`, where the stage check drops `'declare'` and ticks during status as well as the walk, per WS4's ruling (b) (WS4 reviews);
  - `apps/web/e2e/screens.ts:127–134` and `apps/web/e2e/smoke.ts:256`, in C4.4, per WS4's ruling (a) (WS4 reviews);
  - `packages/ai/src/hands/auction.ts` and `packages/ai/src/play.ts`, **written by WS1** (C4.2).
- `must_not_edit`: `packages/ui/**` (WalkBoard's own `'declare'` stage prop stays; after C4 no caller passes it, which is harmless), `apps/web/e2e/{smoke,harness,screens}.ts` (WS4's, except the two named lines above), `design/mocks/**`, `packages/engine/src/{walk,economy,lots}.ts` (the walk itself is the pin), `packages/ai/**` except WS1's C4.2.

### Contention

| path | touched by | resolution |
|---|---|---|
| `apps/web/src/phone/Auction.tsx` | C4.3; FU-1 (WS3's follow-up: `useWalkIntent` and the held-Up reset) | **serialised**: FU-1 starts after this PR merges |
| `packages/ai/src/hands/auction.ts` | C4.2 (WS1); WS2's Smart AI deciders | **WS1 decides**: it's their file; WS1 sequences against WS2 |
| `apps/web/e2e/auction-steps.ts` | C4.4; FU PR | **serialised** |
| `apps/server/src/mule-game.ts` | C4.1; WS7's election tick (approved named edit) | different hunks; the second to merge rebases |

### Task C4.1: C4, the engine drops the declare stage

**Depends on:** — · **ACs verified:** T-AC-3 (engine half) · **Spec:** WS6 §1 C4, §2 RULE-2, §3 stage row · **Tier:** logic/contract

- [x] **Step 1: Write the failing tests** in `packages/engine/test/auction.test.ts`, named `T-AC-3: …`, at engine altitude. Each asserts at the auction state after `stepAuction`:
  - (a) when a good's status opens, every walker already holds `defaultSide`: surplus → seller, short → buyer, even → pass;
  - (b) `declareRole` works during status. Tapping the chosen side again is the client's job (RULE-2 row 1), so the engine just takes the side sent;
  - (c) the status clock's end, or all players done, goes straight to `walk`, and `stage` is never `'declare'` at any step;
  - (d) the same seed and intents replay to the same trades;
  - negative: `declareRole` before the good is up still throws.

  Strengthen existing tests that assert the declare stage rather than adding beside them, and delete any that only test the stage being removed.
- [x] **Step 2: Run** `pnpm --filter @mule/engine exec vitest run test/auction.test.ts`. Expected: the new T-AC-3 cases FAIL (stage 'declare' seen, or RuleError "Wait for the declare").
- [x] **Step 3: Implement C4 per WS6 §1 C4 and §2 RULE-2** in `auction.ts`:
  - seed sides when the status opens, reusing `defaultSide` and `takeSide` from `startDeclare`;
  - remove `startDeclare` and the `'declare'` stage;
  - widen `declareRole`'s guard to status and walk.

  Also:
  - WALK: remove `declareMs`; `statusMs` 6000 → 8000 (spec's proposal; WS1 may retune).
  - Protocol: `AuctionView.stage: 'status' | 'walk'`.
  - Server: mule-game.ts:715's clock total drops its `declareMs` branch.

  `server.ts`'s `'declare'` intent parse stays: the intent is unchanged and now accepted in status. Mechanism: in_place.
- [x] **Step 4: Run** the engine tests, then `pnpm --filter @mule/server test`, and fix the server tests that assert the stage. Then run the walk's own tests unchanged; they are the pin. `pnpm typecheck` is expected RED only in `packages/ai` (C4.2) and `apps/web` (C4.3). Record that it's red in exactly those places.
- [x] **Step 5: Commit** the RED commit first (`test(engine): T-AC-3 sides are picked during status, no declare stage (RED)`), then `feat(engine): sides are picked on the status screen; the declare stage goes (verifies T-AC-3)`.

### Task C4.2: the AI hand declares during status (WS1)

**Depends on:** C4.1 · **ACs verified:** T-AC-3 (sim rows) · **Owner:** WS1, in its own files, on `ws3-c4`

- [x] **Step 1:** WS1 moves `hands/auction.ts`'s `'declare'` branch (lines 89–92) into its status handling, so the AI picks its side during status. It must not wait for a stage that no longer exists.
- [x] **Step 2:** `play.ts`'s `case 'declare'` still calls `declareRole`. WS1 confirms it needs no change, or changes it.
- [x] **Step 3:** `pnpm typecheck` for packages/ai is 0; `pnpm --filter @mule/ai test` is green.
- [x] **Step 4: T-AC-3's sim rows.** Run `pnpm sim -- --games 40 --seed 101` on `ws3-c4` and on the base. Any change in the 10 checks goes to WS1 (WS6 §7 R-2), and WS1 signs it off before merge.

### Task C4.3: C4, the status screens get Buy and Sell

**Depends on:** C4.1 · **ACs verified:** B-AC-4 (UI half, via C4.4), T-AC-8 (via C4.4) · **Spec:** WS6 §1 C4 ux, §2 RULE-2 · **Tier:** user-visible

- [x] **Step 1: Implement C4's screens by grafting** `PhoneStatusDeclare` and `TvStatusDeclare` (`git show 25a2512:design/mocks/ws6-ux/src/screens/StatusDeclare.tsx`) into `Auction.tsx`'s status branch and `TvAuction`'s status branch. Replace the mock's fixtures with the live view. Mechanism: fill_scaffold.
  - Buy and Sell come from `view.auction`'s own walker side, not local state: the engine seeded it.
  - A tap sends `{type: 'declare', side}`; tapping the chosen side again sends `pass` (RULE-2 row 1).
  - Sell is disabled at 0 units (row 2).
  - Keep `declare`, `side-*`, `side-now`, `status-store` and `tv-picked`.
  - Delete the phone's and TV's `stage === 'declare'` branches.
  - `sound.ts:146` drops `'declare'`.
  - The walk keeps today's picker after `line-readout`, per this plan's RULE-2 row 4 reading.
- [x] **Step 2: Run** `pnpm typecheck` (0 everywhere once C4.2 is in; until then, apps/web only), `pnpm --filter @mule/web test` and `build`. Expected: green.
- [x] **Step 3: Commit** `feat(web): Buy and Sell on the status screen; no declare screen`.

### Task C4.4: browser proof, render gate, sim

**Depends on:** C4.2 and C4.3 merged into `ws3-c4` · **ACs verified:** B-AC-4, UBER-AC-1 (last clause), T-AC-8, T-AC-3 sim rows · **Tier:** promise

- [x] **Step 1:** In `auction-steps.ts`'s direct run, against the server's view:
  - **B-AC-4:** a player with 0 units of the good starts the walk as a buyer if they do nothing; Sell is disabled for them; tapping Buy passes instead. Assert their walker's `side` in `viewFor` and on the phone.
  - **B-AC-4, the surplus side (from the C4.3 review, mutant M4):** a player with surplus opens status with `side-seller` checked. Tapping Buy from Sell lands on `buyer` in `viewFor`.
  - Replace `pickSide`'s Seller-after-Ready step at :408, and fix `screens.ts:127–134` and `smoke.ts:256` per WS4's ruling (a).
  - Re-run `pnpm sim -- --games 40 --seed 101` and `--seed 1` on the merged `ws3-c4` against trunk 6df42d2, and compare with WS1's claim.
  - **UBER-AC-1's last clause:** record every stage the phones and the TV render across month 1's goods; `declare` is never among them.
  - Replace the `WALK.declareMs` budget at :411 with `WALK.statusMs`.

  Altitude: promise, three phones and the TV. Run on seeds 25 and 7 and two random seeds.
- [x] **Step 2: Render gate (T-AC-8):** capture the mock's `#status` on phone and TV against the built status screen. `render-gate.mjs` must PASS, after renaming any `result` testid key first (known tool bug).
- [x] **Step 3: Commit** `test(web): sides are picked on the status screen, front to back (verifies B-AC-4)`.

### PR merge gate

- [x] T-AC-3 and B-AC-4 are green and AC-named; the RED commit precedes C4.1's implementation
- [x] The stage contract is exercised on the consumer side: the phone, the TV, the AI hand and the server all compile against `'status' | 'walk'`, and C4.4 drives them
- [x] Front to back: C4.4 drives the status screen in a real browser and asserts the server's walker sides
- [x] WS1 has written C4.2 and signed off T-AC-3's sim rows; WS4 has reviewed the TvAuction and sound.ts named edits
- [x] The render gate passes against `#status` at 25a2512
- [ ] `pnpm typecheck` · `pnpm test` · `pnpm --filter @mule/web e2e` · `tsx e2e/auction-steps.ts` are green (CI runs all of them)
- [x] Goal check in a browser: a person sees their side already picked on the status screen, changes it with one tap, and the walk starts with no Buyer/Seller/Pass screen between
- [ ] The PM has the PR link and results; Heiko's OK before the lane merges into feat/strategist

## Risks
- **WS6 R-2, the sim may shift** because the AI now declares during status: C4.2 Step 4 sends the rows to WS1 before merge.
- **Every client that renders `declare` breaks at compile time.** That is intended (the §3 row is breaking). The protection is C4.1's typecheck record and the consumer list in WS6 §1 C4's call sites, which every task covers.
- **A shorter month:** a good's status and declare took 11 s and will take 8 s. Every e2e budget that adds them is checked in C4.4.

## Pre-implementation checklist
- [x] WS6's spec C4 approved (Heiko approved WS6's screens; the PM relayed C4 to WS3 as WS6-PR-2)
- [x] WS1 agrees to write C4.2 on `ws3-c4` and names when (asked)
- [x] Base `ws3-auctions` @ b00686a green: the tree equals ff4ba58's. Measured there: `pnpm typecheck` 0 · `pnpm test` 0 (tabletop 39, ui 8, engine 114, ai 12, web 47, server 59) · `pnpm --filter @mule/web e2e` ok (smoke, zoom, lobby) · `tsx e2e/auction-steps.ts` ✓
- [x] The base sim, to compare against, is measured at C4.2 Step 4
