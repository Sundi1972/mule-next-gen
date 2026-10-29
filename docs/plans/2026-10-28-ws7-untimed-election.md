# WS7 · the election is not time-bound · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Programme (an amendment, AM-18: one contract change across engine, AI, server, protocol and screens).

**Build gate:** start after #130 merges into trunk and #135 (AM-17, the fair tie-break) lands in `ws7-politics` (HC-65). This build comes before slice 2a's: the council follows the same model (spec §8 note).

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| P-1 [politics spec §0], as Heiko ruled (AM-18) | every player, most of all a newcomer | run any month; vote with no clock; a reveal ceremony per office | B-AC-63 (restates UBER-AC-2) | **PR-1** (rules, on today's desks); PR-3 (the ceremony screens, B-AC-63) |

The goal id is the politics spec's P-1; plan-check's `G-n` pattern does not match it (as in the slice-1 plan).

<!-- plan-check: no-task C40 C47 T-AC-40 B-AC-43 — slice 2a's ids, named only in the spec's id-continuation line and its §8 note on the council; not this amendment's changes -->

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- the screens before WS6's mock is approved;
- whether the Sheriff is elected at all (open with Heiko: the ceremony is generic over the offices that exist);
- the council's own timing (slice 2a, see the spec's §8 note);
- smart seats' votes (WS2's brain port, later).

**Thin baseline (spec §0.1):** lengthen the 20 s clocks · one config change · loses because Heiko ruled "not time bound" and wants running "anytime, even in no election months".
→ **PR-1 relationship:** the baseline lost for a true reason (checked: Heiko's ruling, quoted in spec §0). PR-1 is the shortest slice through the chosen approach. It ships the untimed rules on today's desks, renamed only, so a table can run in any month and vote with no clock before WS6's mock exists.

**Constraints:** spec §0.2 (HC-60 … HC-65) travel with every task.

**Architecture:** candidacy moves from the month's Election to Politics. An election month runs announce → ballot → ceremony → over in `politics.ts`. Only the ceremony steps on clocks. The server's tick drives the AI's pauses and the ceremony. Ready is Done, and the host's Continue moves past absent players.

**Tech Stack:** TypeScript pnpm monorepo; vitest; Playwright e2e; `pnpm sim`.

**Inputs:**
- Spec: `docs/specs/2026-10-28-ws7-untimed-election.md`
- Sections present and consumed: §0, §0.1, §0.2, §1 (C60-C67), §2 (RULE-60..64), §3, §4, §6, §7, §9
- Sections declared N/A: §5 ("Code-only; games live in server memory"): checked, true.

**Quality gates:**
- `pnpm typecheck` 0; `pnpm test` green; the config guard green.
- Inner loop: the single named test (`npx vitest run <file> -t '<AC-ID>'`).
- Smoke: `pnpm --filter @mule/web e2e:core`.
- Tier 2 (`e2e:regression`, which runs every e2e that calls `readyThroughTheElection`): run locally before PR-1 merges, since the stage names change for every lane's e2e.
- `pnpm sim` on all three seed sets; politics-off rows byte-identical (HC-63).

## PR decomposition

**Feature branch:** `ws7-politics`.

| PR | Sub-branch | Scope | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------|--------------|--------------------|--------------------|-------------------|
| PR-1 ✅ | `ws7-untimed` | Tasks 1.1-1.9 (C65, C60, C61, C62, C63, C64; WS1's play.ts loop) | B-AC-60, B-AC-61, B-AC-62, T-AC-60..64 | §3 engine and protocol shapes | — | Yes, rename only (today's desks on the new stage names) |
| PR-2 (WS1) | `ws1-untimed-rows` | Task 2.1 (C67) | T-AC-65 | — | PR-1 | No |
| PR-3 ✅ | `ws7-ceremony` | Tasks 3.0-3.9 (C60-C64 per AM-21, C66, C68, C69) | B-AC-63, T-AC-66..71 | AM-21's §3 shapes | PR-1's view; WS6's approved mock (23697e5b) | Yes |

**Waves:** 1 = PR-1 (atomic: every consumer of the stage names changes at once, C65's atomicity). 2 = PR-2 and PR-3 in parallel (disjoint files: WS1's rows vs WS7's desks), PR-3 only once WS6's mock is approved.

### Per-PR authority

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

| PR | may_edit | may_edit_content | must_not_edit |
|---|---|---|---|
| PR-1 | `packages/engine/src/politics.ts`, the POLITICS block, `packages/ai/src/hands/vote.ts`, `apps/server/src/politics-view.ts`, `apps/web/src/phone/hub/politics/*` (stage names only), `apps/web/src/table/TvElection.tsx` (stage names only), `apps/web/e2e/politics*.ts`, their tests. Named edits (SEAMS first): WS3 `packages/engine/src/types.ts`, `packages/protocol/src/index.ts`, `apps/server/src/mule-game.ts` (tick, continuePlanning), `apps/server/test/planning.test.ts` (Continue in the election); WS1 `packages/ai/src/play.ts` (the loop), `packages/engine/test/observe.test.ts` (the stage name); the other lanes' e2e only if `readyThroughTheElection` cannot keep their calls working | — | slice 2a's files; WS1's sim report (PR-2) |
| PR-2 | WS1's sim report and rows | — | the engine, server and web |
| PR-3 | `apps/web/src/phone/hub/politics/**`, `apps/web/src/table/TvElection.tsx`, `apps/web/test/politics-*.test.ts`, `apps/web/e2e/politics*.ts`, `packages/engine/src/politics.ts` + the POLITICS block + tests, `apps/server/src/politics-view.ts` + `apps/server/test/politics.test.ts`, `packages/ai/src/hands/vote.ts` + tests. Named edits (PM ruling 2026-10-29): WS6 `hub/slots.ts`, `hub/Hub.tsx`, `hub/ReadyBar.tsx`, `hub/ready.ts`; WS3 `packages/engine/src/types.ts`, `packages/protocol/src/index.ts`, `apps/server/src/mule-game.ts` (continuePlanning news); WS4 `apps/web/src/table/TableApp.tsx` (one route line, only if needed, confirm first) | WS6's approved election mock (wire data and handlers only; drop every IntentMarker) | anything else; WS1's sim rows |

### Contention

| path | touched by | resolution |
|---|---|---|
| `apps/server/src/mule-game.ts` | PR-1; slice 2a's PR-3 | **serialised**: this plan builds first; slice 2a's server PR rebases on it |
| `packages/engine/src/politics.ts` | PR-1; #135; slice 2a's PR-1 | **serialised**: #135 lands first (build gate), slice 2a after |
| `packages/ai/src/play.ts` | PR-1 (loop); PR-2 (none) | **seam moved**: the loop change is in PR-1 as WS1's named edit; PR-2 touches only the report |

---

## PR-1 · the untimed election on today's desks (`ws7-untimed`)

### Task 1.1: C65 — the contract (freeze point)

**ACs verified:** none (contract) · **Spec:** §3

- [x] **Step 1: Change C65's shapes in `packages/engine/src/types.ts` and `packages/protocol/src/index.ts`, and the POLITICS block, per spec §3 (named edits).**
- [x] **Step 2: Run `pnpm typecheck`. Expected: errors only at the consumers Tasks 1.2-1.6 change. List them in the task report.**
- [x] **Step 3: Commit `feat(C65): candidacy on Politics, the election's stages and ceremony (contract)`.**

### Task 1.2: C60 — run in any month's planning

**ACs verified:** T-AC-60 · **Spec:** §1 C60, §2 RULE-60

- [x] **Step 1: Write failing tests `T-AC-60: <RULE-60 row>` in `packages/engine/test/politics.test.ts`, one per row with its message.** Altitude: unit (a rule table). Negative: a run in development (row 1).
- [x] **Step 2: Run them; expected FAIL.**
- [x] **Step 3: Implement C60 per spec §1 C60 and RULE-60 in `packages/engine/src/politics.ts` (runFor, canRun). Mechanism: in_place.**
- [x] **Step 4: Run; expected PASS; RULE-10's promise tests unchanged (C60's pin).**
- [x] **Step 5: Commit `feat(C60): run for office in any month's planning (verifies T-AC-60)`.**

### Task 1.3: C61 and C62 — announce, ballot, ceremony

**ACs verified:** T-AC-61, T-AC-62 · **Spec:** §1 C61, C62, §2 RULE-61, RULE-62

- [x] **Step 1: Write failing tests `T-AC-61: <RULE-61 transition>`, including "no stage ends on a clock" (step a ballot by an hour of game time: still open) and AM-1's close. Also `T-AC-62: the ceremony steps each office of POLITICS.offices; a Governor-only list runs one office`.** Altitude: unit. Restate (do not drop) slice 1's RULE-1 rows that named the clocks.
- [x] **Step 2: Run; expected FAIL.**
- [x] **Step 3: Implement C61 and C62 per spec §1 and RULE-61, RULE-62 (openPlanning, stepElection, electionDone, closeBallot, takeOffice; the tally is AM-17's). Mechanism: in_place + sprout.**
- [x] **Step 4: Run `pnpm --filter @mule/engine test`; expected PASS.**
- [x] **Step 5: Commit `feat(C61, C62): the election waits for everyone, then reveals office by office (verifies T-AC-61, T-AC-62)`.**

### Task 1.4: C63 — the AI declares ahead and votes at its own pace

**ACs verified:** T-AC-63 · **Spec:** §1 C63, §2 RULE-63

- [x] **Step 1: Write failing tests `T-AC-63: <RULE-63 row>` in `packages/ai/test/vote-hand.test.ts`. Restate slice 1's rows that assumed the nominate clock.**
- [x] **Step 2: Run; expected FAIL.**
- [x] **Step 3: Implement C63 per spec §1 C63 and RULE-63. Mechanism: in_place.**
- [x] **Step 4: Run `pnpm --filter @mule/ai test`; expected PASS, including `play-politics.test.ts`'s UBER-AC-1 (both offices filled by votes).**
- [x] **Step 5: Commit `feat(C63): AI seats declare ahead of the election and vote at their own pace (verifies T-AC-63)`.**

### Task 1.5: C67's loop — the sim keeps playing (WS1 named edit)

- [x] **Step 1: Make `packages/ai/src/play.ts`'s planning loop step until the election is over and tick the vote hands in every month's planning (C67). Then run `pnpm sim` on all three seed sets. Expected: it finishes; politics-off rows byte-identical (HC-63); politics-on numbers go to WS1 for PR-2.**
- [x] **Step 2: Commit `feat(C67): the sim plays the untimed election (WS1 named edit)`.**

### Task 1.6: C64 — the server

**ACs verified:** B-AC-60, B-AC-61, B-AC-62, T-AC-64 · **Spec:** §1 C64, §2 RULE-61, RULE-64

- [x] **Step 1: Write failing tests in `apps/server/test/politics.test.ts`: `B-AC-60` (run in month 2, change in month 3, the month 4 announcement shows it, on every view), `B-AC-61` (no close while a human has not voted; closes on the last vote; the host's Continue closes and the news names them), `B-AC-62` (office by office; totals never before the bars step), `T-AC-64` (away is not Done; Continue refused in the ceremony).** Altitude: server (the promise is what each screen receives). Restate the clock rows of slice 1's C9 tests and WS3's planning.test.ts row for Continue in the election.
- [x] **Step 2: Run; expected FAIL.**
- [x] **Step 3: Implement C64 per spec §1 C64: the tick and continuePlanning (WS3 named edits), and `apps/server/src/politics-view.ts` per RULE-64.**
- [x] **Step 4: Run `pnpm --filter @mule/server test`; expected PASS.**
- [x] **Step 5: Commit `feat(C64): the server waits for every vote; the host's Continue moves past absent players (verifies B-AC-60, B-AC-61, B-AC-62, T-AC-64)`.**

### Task 1.7: today's desks and every lane's e2e on the new stage names

- [x] **Step 1: Rename the stages in the politics desks and `TvElection.tsx`, with no new layout (C66's interim). Keep `readyThroughTheElection` (politics-steps.ts) working: Ready in announce and ballot, then wait out the ceremony.**
- [x] **Step 2: Run `pnpm --filter @mule/web test`, then `pnpm --filter @mule/web e2e:core` and `e2e:regression` locally. Expected: green. Any other lane's e2e that still fails gets a named edit, recorded in SEAMS.**
- [x] **Step 3: Commit `fix(C66): today's desks and e2e helpers on the new election stages`.**

### Task 1.8: Governor only (AM-19, Heiko's ruling "Governor only for now")

- [x] **Step 1: `POLITICS.offices = ['governor']`, read at call time everywhere; the OFFICES constants removed; tests that need both offices use a `bothOffices()` helper. `pnpm sim` politics-off byte-identical.** Done at 0b77403.

### Task 1.9: the host's Continue on the client (PM ruling 2026-10-29)

- [x] **Step 1: `hostMayContinue(view)` in `apps/web/src/phone/hub/ready.ts` (true in planning proper, announce and ballot; never in the ceremony); ReadyBar's stage-specific confirm copy; TableApp's TV hint uses it. Continue marks every human not Done as Done, present or away.** Done at d0a4c03 (ready.ts), 383766a (ReadyBar), a6bd5a1 (TableApp).

### PR-1 merge gate

- [x] Every AC in PR-1's row has a green test named after its id; failing-test commits come first.
- [x] typecheck 0; `pnpm test` green; config guard green; smoke and Tier 2 green locally.
- [x] `pnpm sim` politics-off byte-identical; the politics-on report sent to WS1.
- [x] Named edits recorded in SEAMS and reviewed: WS3 (types, protocol, mule-game.ts, planning.test.ts), WS1 (play.ts, observe.test.ts).
- [x] CI green on the PR into `ws7-politics`.

### PR-1 record (done)

- **SHAs:** types e7dc633/42da203 · protocol 3735583/87d7c9e · mule-game 8412b5f · planning.test 25db5b0 · ready.ts d0a4c03 · ReadyBar 383766a · TableApp a6bd5a1 · Governor only 0b77403 · review: M7/M8 test d42078a, minors cac2d80.
- **Merges:** #148 into `ws7-politics` at 2200d28; lane PR #155 into `feat/strategist` at e40978c (Heiko's OK via the PM).
- **Review findings carried:** Important 1 (sim.ts's Politics line divides by 2, so "50%" filled with one office) → WS1's PR-2, using `POLITICS.offices.length`. Minor 4 (`canRun` says 'closed' outside planning) and Minor 6 (B-AC-60 asserted only in views) → PR-3. Minor 5 (`apps/web/e2e/hub-steps.ts:158`) → WS6's.
- **Extra named edits OK'd beyond the authority table:** `score-parts.test.ts` (WS4), auction-steps (WS3), smoke/table-steps (WS4), specials (WS5), `observe.test.ts`/`play.ts` (WS1), `planning-ready.test.ts` (WS6).
- **Measured at e2588ec (before #155):** typecheck 0; engine 280 · ai 120 (9 skipped) · server 226 (24 skipped) · web 236 · ui 46 · tabletop 148. Local `e2e/politics.ts` exit 0 on #148's head. Sim politics-on: 2520 cr / 8.0 terms before Governor only, 2399 cr / 4.0 terms after.

## PR-2 · WS1 re-measures (`ws1-untimed-rows`)

**Status: pending (WS1).** Includes Important 1 from PR-1's review.

### Task 2.1: C67 — the rows

- [ ] **Step 1: WS1 runs `pnpm sim` on all three seed sets and records the politics rows, and the checks pass (`T-AC-65`). Any tuning goes through POLITICS.ai with `pnpm sim --set`.**
- [ ] **Step 2: Commit and PR with the before/after table.**

## PR-3 · the election screens, stages 2 to 5 (`ws7-ceremony`)

**Status: done; merged into `ws7-politics` as #183 at 6d72ff2 (2026-10-29).** Heiko approved WS6's election mock 2026-10-29 (ws6-ux **23697e5b**, not ceedd23f); PM rulings (a), (b), (c) and month 1 (A) recorded as spec AM-21. Folds in PR-1's review Minors 4 and 6.

**Base:** `ws7-politics` at bb72b8e (trunk 6d30b69 + #170). The mock is the binding scaffold: never design a screen; a state it does not cover goes to the PM (WS6 decides).

**Gates for every screen task:** fits at 667×375 and 844×390 (as #170 measured); WS6 reviews fidelity on the SHA; the announce card's 15 px overflow is the mock's bug, not copied.

### Task 3.0: the contract (AM-21 §3) — freeze point

- [x] **Step 1: WS3 named edits in `types.ts` and protocol: `Politics.promise`, `Election.ceremony = { elapsedMs, totalMs }`, `MyView.politics.paid/.reputation`, the view's ceremony `{ seconds, total }` and offices reached. POLITICS.ceremony becomes RULE-62's named beats. `pnpm typecheck` lists the consumers. Commit per lane file.**

### Task 3.1: the engine (RULE-60 row 2, RULE-61, RULE-62, C68)

- [x] **Step 1: Failing tests in `packages/engine/test/politics.test.ts`: `T-AC-66` (month 1 announce run is on the ballot), `T-AC-67` (month 4 announce refuses), `T-AC-68` (a full ballot without Cast is not Done; Cast is), `T-AC-69` (beats from the tally, a tie beat for land/lot/baron), `T-AC-70` (the promise holds for the term). Restate T-AC-60/61/62 rows the rulings change.**
- [x] **Step 2: Implement in `politics.ts` (canRun, isElectionDone, stepCeremony + a pure `ceremonyBeats`, and C68 in takeOffice). Run engine tests; commit.**

### Task 3.2: the AI (RULE-63 rows 2-3b)

- [x] **Step 1: `T-AC-68` (ai): an AI-only ballot closes by itself; VoteHand acts in announce only in month 1. `packages/ai/test/vote-hand.test.ts`, `play-politics.test.ts` (UBER-AC-1). Implement in `hands/vote.ts`; commit.**

### Task 3.3: the server (RULE-64, C69)

- [x] **Step 1: Failing server tests: `T-AC-69` (totals and winner reach the views at their beats), `T-AC-70` (every view carries the promise), `T-AC-71` (the Continue's news per stage), restating B-AC-62's step rows. Implement `politics-view.ts`; C69 as the WS3 named edit in `mule-game.ts` continuePlanning; commit per file.**

### Task 3.4: the hub frame (WS6 named edits)

- [x] **Step 1: `hub/slots.ts` + `Hub.tsx`: a stage slot (election day's card takes the stage, phase title "Election day"), an agenda door that opens the promise sheet, desk tabs on one row with an office's desk first, Now folded on the Governor's phone. `ReadyBar.tsx` + `ready.ts`: per-stage words, the two confirm texts, "Still waiting for" (planning too), canReady, the "VOTED" label. Tests in `planning-ready.test.ts` (WS6's) extended by named edit; commit per file, WS6 reviews.**

### Task 3.5: C66 — the phone (routes #audit-election, -announce, -ballot, -governor)

- [x] **Step 1: Failing render tests in `apps/web/test/politics-desks.test.ts` from the mock's testids, including T-AC-66/67 (Run in month 1's announce only) and T-AC-70 (the promise line, kept or broken). Fill the scaffold in `hub/politics/**` (Council's RunForOffice, PromiseSheet, Field, the DayCard for announce and ballot, the VotesCard, ResultList, Governor desk, Offices strip and line, words). Commit.**

### Task 3.6: C66 — the reveal, TV and phone (route #audit-election-reveal)

- [x] **Step 1: Failing render tests: the beats at RULE-62's times (title, candidates, bars, tie, winner, summary), the phone beside a TV never ahead of it, the phone with no TV carrying the ceremony. Fill `TvElection.tsx` (announce, ballot, reveal) and the phone's reveal in `hub/politics/`. Confirm whether TableApp routes announce and ballot to TvElection; a named edit only if it does not. Commit.**

### Task 3.7: B-AC-63 — the politics e2e step

- [x] **Step 1: Restate UBER-AC-2's step in `apps/web/e2e/politics.ts` as `B-AC-63`: both humans run in month 1's announce, each phone casts, nothing closes until the last Cast, every screen shows the Governor's ceremony, the promise stays beside the tax, and the next sale is taxed at the new Governor's rate. `politics-steps.ts`'s `readyThroughTheElection` presses Cast. Measure each election screen at 667×375 and 844×390. Run politics.ts and politics-tie.ts; Tier 2 locally. Commit.**

### Task 3.8: the sim, before and after (T-AC-65)

- [x] **Step 1: `pnpm sim` politics on, seed sets 1 / 101 / 201 × 100 games, before (bb72b8e) and after; politics off byte-identical; no check regresses. The table goes to WS1 for review and to the PM.**

### PR-3 record (done)

- **Sub-branches merged into `ws7-ceremony`:**
  - core (3.0–3.3) 97cad6d;
  - hub frame (3.4) 2507dee;
  - A-3 (#179) b1f0ee5;
  - screens (3.5–3.7) 08cab96;
  - review fixes and promiseFrom (PM ruling A) c5b0822;
  - WS6 ruling (b) revert cfd7d80; the losing phone's words f314e70; WS3's nit f4e1a72.
- **Reviews:**
  - core code review APPROVE (40 mutants; the survivor killed by 2959ac3);
  - screens code review: all findings fixed;
  - WS6 fidelity OK at f314e70;
  - owner OKs: WS3 ×9, WS4 ×4, WS6 ×12.
- **Sim (3.8):** before = after on sets 1/101/201, politics off byte-identical. WS1 OK.
- **Exceptions to the gate:**
  - The Governor's desk at 667 and 844 sits under the footer under WS6's ruling (b). WS6's hub round 7f7f1814 redesigns it, and Task 3.9 builds it.
  - T-AC-70's TV part is narrowed (PM); Task 3.9 closes it.
  - The e2e no longer drives the ballot's host Continue (B-AC-61's proof is the server test).

### Task 3.9: follow-up — the compact Governor's desk and the TV's promise line (`ws7-gov-desk`)

- [x] **Step 1: Build WS6's 7f7f1814 (Heiko-approved): the compact desk block (E-7's order, the verdict chip, "Why 0–10%?"), and the TV planning header's `tv-governor-promise` line (WS4 named edit in TableApp, two lines). It closes T-AC-70's TV part.** Built: c9bf335, 243eca9, 806966f, 8b0970a.
- [ ] **Step 2: The desk's row above the footer at 667 and 844, once WS6's footer and ticker folds land (A-2). Without them it measured 23 px / 8 px under.**

### PR-3 merge gate

- [x] Every AC in PR-3's row green, named after its id; failing-test commits first.
- [x] B-AC-63 green in a real browser; WS6's fidelity review on the SHA; every election screen fits at 667×375 and 844×390.
- [x] Named edits each in their own commit, reviewed by their owner (WS6, WS3, WS4 if any).
- [x] `pnpm sim` before/after reviewed by WS1; typecheck 0; `pnpm test` green; Tier 2 green locally; CI green; code review clean.

## Pre-implementation checklist

- [x] Spec reviewed by the PM; Heiko's ruling quoted in §0
- [x] #130 merged into trunk; #135 (AM-17) in `ws7-politics`
- [x] SEAMS records PR-1's named edits (WS3, WS1) before it opens
- [x] Base `ws7-politics` green, measured at the pre-flight (last: afb2daf, typecheck 0 · engine 264 · ai 59 · server 153 · web 156 · #130's CI 4/4)
- [x] WS6's election mock approved by Heiko (for PR-3 only): 2026-10-29, ws6-ux 23697e5b
- [x] No spike
- [ ] Effort: PR-1 is large (one atomic contract change), PR-2 small (WS1), PR-3 medium
