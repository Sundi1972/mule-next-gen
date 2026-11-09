# WS3 AM-6 and AM-7: The Land Auction Climbs Faster, Closes Softly, and the Store Always Pays (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Weight:** Sketch, so this is a task list with one merge gate. The spec is the WS3 land-auction Programme spec, but this is two amendments to rules that already exist: one engine file, its config block and their tests. It needs no screen and no contract change. `AuctionView.speed` and `clockMs` already reach every screen.

<!-- plan-check: no-task C1 C2 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C15 — delivered by PR-1 to PR-3 (#37, #39); AM-6 and AM-7 change only C3's rules, with C7 and C8 as pins -->
<!-- plan-check: no-task B-AC-1 B-AC-2 B-AC-4 B-AC-5 B-AC-6 B-AC-7 B-AC-8 T-AC-1 T-AC-2 T-AC-3 T-AC-4 T-AC-5 T-AC-6 T-AC-7 — delivered; they stay green as pins -->

## Goals: lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-2 [spec §0] | a family with fewer humans than seats | AI seats bid sensibly: land goes to who wants it most, at about the runner-up's price (AM-6) | UBER-AC-2, B-AC-9, T-AC-9 | **this plan** |
| G-1 [spec §0] | every player at the kitchen table | listing "store" is a guaranteed exit (AM-7), and a human can push a plot further | UBER-AC-1, B-AC-3 | **this plan** |

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- 00-concept's "three or four more each month" colony plots. Only the one occasional colony plot of AM-1 (§8) is in scope; more is a later, measured change agreed with WS1, because it moves G-1's land supply. *Needs its own spec.*
- AI seats listing their own lots: that needs WS1's sell-side value.
- Direct trades between players, deal cards, and selling plot upgrades on their own.
- Balance numbers outside the LOTS block.

**Thin baseline (spec §0.1):** not reopened. The land auction exists; this tunes two of its rules, as Heiko ruled on measured options (AM-6 records them).

**Constraints:** the engine stays pure, with no clock and no `Math.random`. The numbers live in the LOTS block of `config.ts`. Errors are `RuleError`. `packages/engine/src/walk.ts` is the pin, since the goods auction shares `stepBoard`.

**Inputs:** spec `docs/specs/2026-10-21-ws3-land-auction.md` §2 RULE-4 (row 0, the speed line, the order within a step) and RULE-5 (AM-7), §6 B-AC-3, B-AC-9, T-AC-8 and T-AC-9, §8 AM-6 and AM-7. The measurements behind them are WS3's contested-lot probe, rounds 1–3. Its harness is `scratchpad/ws3-lots/measure2.template.ts` (scratch, not in the repo).

## Status (2026-10-22)

- **Task 1 DONE.** RED commit 4ce5eb2, then abee9d1. The review came back READY WITH FIXES: four rule edges had no pin (mutants E, F, I, K), and the cap counted time from below zero. Fix round 1 is c33da88 (RED), b52f7e7 and 3243366. Every named mutant now fails, and H is equivalent.
- **T-AC-9 measured on the real code (abee9d1), all four bars met:**
  - the highest-limit AI wins 99%;
  - price p10 is 4 under the runner-up's limit;
  - the clock decides 5%;
  - uncontested lots are identical to the rules-off run.

  The real code matches the emulation behind Heiko's decision on all 419 lots.
- **WS1 signed off the sim before/after.** Seed 101's store-capital MISS is retired by the unlimited-store ruling, and every other change is noise or an improvement.
- **Gates on 3243366, measured by WS3:** typecheck 0; tabletop 96, ui 8, engine 181, ai 14, web 81, server 65.
- **DELIVERED.** Sub-PR #69 is in the lane (9f9521e), synced with trunk 48ccf5a at 26ab54e. Heiko said "Yes, once green", and lane PR #71 merged to trunk as a4e743b.

## The PR

**Branch:** `ws3-am6` from `ws3-auctions`. The sub-PR goes into `ws3-auctions`, then the lane PR into `feat/strategist` with Heiko's OK through the PM.

**Authority:**

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

- `may_edit`:
  - `packages/engine/src/lots.ts`;
  - `packages/engine/src/types.ts` (LandAuction's fields only);
  - `packages/engine/src/config.ts` (the LOTS block only);
  - `packages/engine/test/lots-auction.test.ts` and `lots.test.ts`;
  - one new or extended test in `apps/server/test/land-auction*.test.ts`.
- `must_not_edit`:
  - `packages/engine/src/walk.ts` (the pin);
  - `packages/engine/src/auction.ts` and `economy.ts` (WS1's unlimited-money named edits are in flight there);
  - `packages/ai/**` (the lot hand reads `a.speed`, so it needs no change; if it seems to, stop and report);
  - `apps/web/**`.

**Contention:** `config.ts` is shared with WS1's store-money change, which edits PRICE and not LOTS. Different blocks, so whichever merges second rebases.

### Task 1: AM-6 and AM-7, tests first

**ACs verified:** T-AC-8, B-AC-3 (its new negative case), B-AC-9 · **Tier:** logic/contract

- [x] **Step 1: Write the failing tests.**
  - **Engine, `lots-auction.test.ts`, T-AC-8.** One `T-AC-8: …` test per RULE-4 example, asserting on `state.landAuction` after `stepLandAuction`:
    - the speed doubles once the leading rounded bid passes `hi`, and stays doubled;
    - a change of leader at 1.2 s left sets the clock to 2.0 s;
    - once 6 s have been added, an overtake adds nothing;
    - the first leader of a lot adds nothing;
    - one buyer climbing alone never adds time;
    - an overtake in the step that would ring the bell extends the clock, and the bell doesn't ring.

    Trap: drive the walk through `setLotWalk` and `stepLandAuction` only, never by poking `price`. Otherwise you test a state the rules can't reach.
  - **Engine, B-AC-3's test (`lots.test.ts` or `lots-auction.test.ts`, wherever "store short of capital → kept" lives today).** Strengthen it rather than add one beside it: a store with capital below `storePays` still buys the lot, the seller gets `storePays`, and `store.capital` goes negative. The money-conservation invariant still holds.
  - **Server, B-AC-9, at viewFor altitude** (a `land-auction*.test.ts` in apps/server). Two scripted human buyers walk a listed plot past `hi`.
    - Assert `view.landAuction.speed` doubles in every seat's view.
    - Then make the lead change with under 2 s left, and assert `view.landAuction.clockMs` is back near 2000.
    - Negative: a lot with one bidder ends on the same clock as before.
- [x] **Step 2: Run** `pnpm --filter @mule/engine exec vitest run test/lots-auction.test.ts test/lots.test.ts` and the new server test. Expected: the new rows FAIL. Commit as `test(engine): AM-6 the land auction climbs faster past its top and closes softly; AM-7 the store always pays (RED)`.
- [x] **Step 3: Implement C3 per spec RULE-4 (AM-6) and RULE-5 (AM-7)** in `lots.ts`, with `LOTS.fastClimb` 2, `LOTS.lateMs` 2000 and `LOTS.lateCapMs` 6000.
  - Add the LandAuction field(s) the soft close and the switch need, such as added time and whether the switch has fired. Reset them per lot in `startWalk`.
  - An overtake is a change of the rounded leader per `lotLeader`, from one buyer to another. Check it after the walk moves and caps, and before the bell rows.
  - AM-7: drop the capital gate at `lots.ts:230`.
  - Comments say why, not what, and never cite spec ids or dates.
- [x] **Step 4: Run** the engine, server and AI tests, then `pnpm typecheck`. Expected: green, with every pin unchanged (`walk.ts`'s and the goods auction's tests). Commit as `feat(engine): the land auction climbs faster past its top and closes softly; the store always pays (verifies T-AC-8, B-AC-9)`.

### Task 2: measure it (T-AC-9)

**ACs verified:** T-AC-9 · **Tier:** promise (measured)

- [x] **Step 1: Sim before and after.** Run `pnpm sim -- --games 40 --seed 101` and `--seed 1` on the branch and on its base, each tree with its own `pnpm install` and a resolve check. Send the diff to WS1 for sign-off.
- [x] **Step 2: The contested-lot probe on the real code.** Point the probe harness at the branch, with no overrides: the real rules now carry both fixes. Expected, against round 3's combo row:
  - the highest-limit AI wins at least 97%;
  - the price p10 is within 25 of the runner-up's limit;
  - the clock decides 10% or less;
  - uncontested lots are unchanged (median about 2.3 s).

  A miss is a finding to report, not a reason to retune.
- [x] **Step 3:** run `pnpm --filter @mule/web build`, then `tsx e2e/auction-steps.ts` (land lots with humans). Expected: green.

### Merge gate

- [x] T-AC-8, B-AC-9 and B-AC-3's strengthened case are green and AC-named, and the RED commit comes first
- [x] T-AC-9 measured: the probe meets its four bars, and WS1 has the sim before/after and has signed it off
- [x] `walk.ts` and the goods auction are untouched, and their tests are green unchanged
- [x] `pnpm typecheck` · `pnpm test` · `pnpm --filter @mule/web e2e` · `tsx e2e/auction-steps.ts` are green (CI runs all of them)
- [x] A code review with a mutation sweep on lots.ts's new branches has come back clean
- [x] The PM has the sub-PR link and the measurements; the lane PR waits for Heiko's OK
