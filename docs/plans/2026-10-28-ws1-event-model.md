# WS1 · The event model (wave 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Standard (the PM, 28 Oct: two PRs, no new sole owner, MonthEvent gains `phase` without breaking).

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 [spec §0] | the players at a table; Heiko, who balances events by editing one table row each | every event on its own odds, phase and influences in config; several can fire in a month | UBER-AC-1 | **PR-1** |

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- Wave 2's thirteen new events, the Goal 5 mood events and every row under "Later" (each its own amendment and PR).
  Wave 2 includes the **meteor strike** (Heiko, 28 Oct): a colony event in production, 2% a month. It hits any tile on
  the map at random, owned or not. An installation there is destroyed and makes nothing this month, and the tile
  becomes a crater with Crystite at the top of today's scale. The crater is a WS5 special field, and the event row
  calls it.
- Changing any event's effect (wave 1 moves events onto their own dice only).
- Showing several events on the screens: the phone and TV read `events[0]` today (`table/TvProduction.tsx`,
  `phone/Production.tsx`). WS6 owns that surface; wave 1 needs it before it reaches a table (§9).
- The colony plot offered at the land grant (lots.ts, WS3's): it already has its own 10% dice and stays as it is.
- Defences, forecasts and storylines (the catalogue's "Later").

**Thin baseline (spec §0.1):** keep `planEvent` and let it pick up to N events · half a day · it cannot roll per
player, in other phases, or with each event's own chance and influences.
→ **PR-1 relationship:** the baseline lost for a true reason (checked at plan time, spec §8 AM-1: the catalogue's pest
swarm, wildfire, bumper harvest and sickness roll per player; sickness rolls in development). PR-1 is the shortest
slice through the chosen approach: the roller, production on it, per-player rows and the sim's count, which together
prove UBER-AC-1. PR-2 moves the one roll that lives in another lane's file.

**Constraints:** spec §0.2 (HC-1 … HC-5) travel with every task.

**Architecture:** one roller over config rows (spec §1 C1, §2 RULE-1 and RULE-2, wave 1's rows table). Production
calls it at its start and applies every event that fired, in order, on the same plots; each event keeps today's
`buildEvent` and `eventOutput`. Sickness keeps its development-start call to the same row dice, and cavern collapse
rolls through them after output.

**Tech Stack:** TypeScript, pnpm monorepo, vitest; `packages/engine` (pure, seeded RNG), `packages/ai` (the sim).

**Inputs:**
- Spec: `docs/specs/2026-10-28-ws1-event-model.md` (with §8 AM-1, the plan-time corrections)
- Sections present and consumed: §0, §0.1, §0.2, §1 (C1-C5), §2 (RULE-1, RULE-2, wave 1's rows), §3 (MonthEvent),
  §6 (UBER-AC-1, T-AC-1..5), §7 (R-1 measured, R-2, R-3), §9
- Sections declared N/A by the spec, with its stated reason: §4 ("No external dependency: the roller is in-process
  and seeded"), §5 ("Code-only; no existing state to reach")
- N/A claims I checked: §4 holds (no I/O in the engine). §5 holds: `MonthReport.events` is optional ("Absent in older
  reports"), and `phase` is added only to new reports.

<!-- plan-check: no-task C21 — the balance spec's sickness roll (R1, built), named only in this spec's C1 today -->
<!-- plan-check: no-task B-AC-1 T-AC-8 — the WS1 events spec's ACs, superseded by this spec (§8 AM-1, Task 1), not this spec's own -->

**Naming:** T-AC-1 already names tests in three WS1 specs, so this spec's tests are titled `EM-T-AC-n` (spec §8
AM-1). The WS1 events spec's pins keep their own titles (`T-AC-3`, `T-AC-4`, `T-AC-5`, `T-AC-7`).

---

## PR decomposition

**Feature branch:** `ws1-events`, cut from `feat/strategist` once #109 (R1) has merged: the roller generalises R1's
`EVENTS.player` row and `rollPlayerEvent`. It merges to `feat/strategist` only through the gate below.

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------------------------|--------------|--------------------|--------------------|-------------------|
| PR-1 | `ws1-events-roller` | Tasks 1-8 (C1, C2, C3, C5) | UBER-AC-1, T-AC-1..4, T-AC-5 (the ten events) | `MonthEvent.phase`; `MonthReport.events` with several events in the order fired | `EVENTS.player`, `rollPlayerEvent` (R1) | No |
| PR-2 | `ws1-events-cavern` | Task 9 (C4) | T-AC-5 (cavern collapse) | none | PR-1's row dice | No |

Built inline, in order: PR-2 needs PR-1's dice, and PR-1's rows decide whether R-2 sends options to Heiko. Two PRs
because PR-2 is a named edit in WS5's file and block, with WS5 as its reviewer.

**PR-1 authority**
- `may_edit`: `packages/engine/src/{events,production}.ts`, the `EVENTS` block of `packages/engine/src/config.ts`,
  `packages/engine/test/events.test.ts`, `packages/ai/src/sim.ts` (report lines only, not the checks),
  `packages/ai/test/balance.test.ts` (T-AC-7's forcing only), `docs/specs/2026-10-21-ws1-events.md` (its amendment),
  this spec and this plan.
- Named edit, WS3 reviews: `packages/engine/src/types.ts::MonthEvent` (`phase`).
- `must_not_edit`: `packages/engine/src/game.ts` (WS3's; wave 1 needs no edit there), `packages/engine/src/specials.ts`
  and the `EFFECT` block (WS5's, PR-2's named edit), `apps/server/**` and `apps/web/**` (WS3's view and WS6's screens,
  behind the table gate), the sim's nine checks.

**PR-2 authority**
- `may_edit`: `packages/engine/src/events.ts`, the `EVENTS` block, `packages/engine/test/events.test.ts`.
- Named edits, WS5 reviews: `packages/engine/src/specials.ts::collapses`, `EFFECT.collapseChance` in `config.ts` (it
  moves into the row).
- `must_not_edit`: `packages/engine/test/specials.test.ts` (WS5's T-AC-6 pins stay unedited and green),
  `packages/engine/src/production.ts`, `game.ts`.

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

**Contention**

| path | touched by | resolution |
|---|---|---|
| `packages/engine/src/events.ts` | PR-1, PR-2 | **serialised** — PR-2 branches from PR-1's merge |
| `config.ts` `EVENTS` block | PR-1, PR-2 | **serialised** — PR-2 adds the cavern row after PR-1's rows |
| `packages/engine/test/events.test.ts` | PR-1, PR-2 | **serialised** |

**Freeze point:** Task 2 publishes the contract WS6 builds against (`MonthEvent.phase`; several events per phase in
`MonthReport.events`, in the order fired). The PM routes it to WS6 once it lands, so WS6's screens are built in
parallel with Tasks 3-9.

---

## Phase P1 — PR-1: every production event on its own dice

### Task 1: Retire today's one-dice ACs in the WS1 events spec — C2, C3

**Depends on:** none · **Spec sections consumed:** §8 AM-1 (§6 paragraph)
**Files:** Modify: `docs/specs/2026-10-21-ws1-events.md` (§8, a new amendment)

- [ ] **Step 1: Write the amendment** in the WS1 events spec, superseding its RULE-1 (one dice), T-AC-2's "never
      twice in a row", T-AC-6 (targetBias; replaced by C3), and B-AC-1, T-AC-1 and T-AC-8 (`EVENTS.chance`, the
      30-60% band; replaced by this spec's UBER-AC-1). T-AC-3, T-AC-4, T-AC-5 and T-AC-7 stay as pins, forced
      through the rows. Point at this spec.
- [ ] **Step 2: Commit** `docs(ws1): the events spec's one-dice ACs are superseded by the event model`

### Task 2: The contract — `MonthEvent.phase` (C2's contract, the freeze point)

**Depends on:** none · **ACs verified:** T-AC-5 (strengthened pin) · **Spec sections consumed:** §3
**Files:** Modify: `packages/engine/src/types.ts::MonthEvent` (named edit, WS3 reviews), `packages/engine/src/events.ts::buildEvent`; Test: `packages/engine/test/events.test.ts`

- [ ] **Step 1: Strengthen the WS1 events spec's `T-AC-3: each event changes exactly the plots it hits…`** (R6, not a
      new test): every event in the report carries `phase: 'production'`. Altitude: the month report.
- [ ] **Step 2: Run it; expect FAIL** (`phase` undefined).
      Run: `pnpm --filter @mule/engine exec vitest run test/events.test.ts -t "T-AC-3"`
- [ ] **Step 3: Implement** `phase: Phase` on `MonthEvent` per spec §3; `buildEvent` sets `'production'`.
- [ ] **Step 4: Run events.test.ts and `pnpm typecheck`; expect PASS / exit 0.**
- [ ] **Step 5: Commit** (red then green); send WS3 the types.ts hunk, and tell the PM the contract is frozen (route to WS6).

### Task 3: The rows and the chance — C1 (RULE-1)

**Depends on:** Task 2 · **ACs verified:** T-AC-1 · **Spec sections consumed:** §1 C1, §2 RULE-1, wave 1's rows
**Files:** Modify: `EVENTS` in `config.ts`, `packages/engine/src/events.ts`; Test: `packages/engine/test/events.test.ts`

- [ ] **Step 1: Add the rows to config first**, per spec §2's wave-1 table (`EVENTS.colony.<key>`,
      `EVENTS.player.<key>`, `EVENTS.excludes`), keeping `planEvent` and its knobs, so the red is an assertion and
      never a TypeError. Sickness's existing row stays.
- [ ] **Step 2: Write `EM-T-AC-1: an event's chance is its phase's base plus its raises minus its lowers, between 0 and its cap`**
      at `events.ts::eventChance` (one table test, R3a pure core). Rows, by hand: dust storm, any air, 5%; drought
      in Toxic 7%; acid rain in Collapse 13%; flood the month after a drought 15%; pest swarm richest 2.5%, poorest
      0.5%; bumper harvest poorest 3%, richest 0.5%; wildfire richest during a drought 5.5%; sickness clean with 5
      points 18%; Collapse with 20 points 93→90%; a forced row summing below 0 → 0; a phase the row doesn't list → 0.
      Stub `eventChance` with `throw new Error('NotImplemented: eventChance')`.
- [ ] **Step 3: Run it; expect FAIL** with `NotImplemented: eventChance`.
- [ ] **Step 4: Implement C1's chance** per RULE-1. The ranks read cash plus land at `GAME.plotScore` a plot; a tie goes to
      the first in seat order. Sickness's `playerEventChance` reads the same function.
- [ ] **Step 5: Run events.test.ts; expect PASS, the balance spec's T-AC-24 unchanged.**
- [ ] **Step 6: Commit** red then green.

### Task 4: The roller — C1 (RULE-2)

**Depends on:** Task 3 · **ACs verified:** T-AC-2 · **Spec sections consumed:** §1 C1, §2 RULE-2
**Files:** Modify: `packages/engine/src/events.ts` (new `rollPhase`); Test: `packages/engine/test/events.test.ts`

- [ ] **Step 1: Write `EM-T-AC-2: no event in month 1 or on a what-if copy, and a seed replays the same events`** at
      `rollPhase(state, 'production')`, with every row forced to 1: month 1 → nothing; `cloneForSim` → nothing; the
      same state rolled twice → the same keys and players in the same order (colony rows first, then players in seat
      order). Negative: a different seed over 40 months differs somewhere.
- [ ] **Step 2: Run; expect FAIL** (`NotImplemented: rollPhase` stub).
- [ ] **Step 3: Implement C1's roller** per RULE-2 steps 1, 2, 3 and 5. Seeds per HC-3: `(seed, month, phase, row, player)`, through the
      FNV-1a seed sickness uses. The excludes are step 4, proved in Task 6.
- [ ] **Step 4: Run; expect PASS.** **Step 5: Commit** red then green.

### Task 5: Personal events roll per player, and lean on wealth — C3

**Depends on:** Task 4 · **ACs verified:** T-AC-4 · **Spec sections consumed:** §1 C3, §2 RULE-1 (wealth rank)
**Files:** Modify: `packages/engine/src/events.ts` (`buildEvent` for a given player; `pickStart` and `EVENTS.targetBias` go); Test: `packages/engine/test/events.test.ts`

- [ ] **Step 1: Write `EM-T-AC-4: a personal event starts on its own player's plots, and the richest and poorest read their rows' points`**
      at the month report.
      - Pest swarm forced for p2 only: `event.player === 'p2'`, and the order-0 plot is p2's. The spread is today's (HC-4): a pest reaches joined Food plots of anyone, a wildfire only its owner's.
      - A player with no Food plot fires no pest swarm.
      - The ranks: the richest p1 rolls pest at base +1, the poorest bumper at base +1.5 (read through `eventChance` on the report's state).
- [ ] **Step 2: Run; expect FAIL** (today's `pickStart` starts anywhere).
- [ ] **Step 3: Implement C3.** Delete the WS1 events spec's `T-AC-6` test (superseded, Task 1; R7). Re-force its
      `T-AC-4` pest test through the rows instead of `targetBias`, with the assertions unchanged.
- [ ] **Step 4: Run events.test.ts; expect PASS.** **Step 5: Commit** red then green.

### Task 6: Production applies every event that fired — C2

**Depends on:** Tasks 4, 5 · **ACs verified:** T-AC-3, T-AC-5 (the ten events) · **Spec sections consumed:** §1 C2, §2 RULE-2 (4, 6), HC-4
**Files:** Modify: `packages/engine/src/production.ts::runProduction`, `events.ts` (remove `planEvent`), `EVENTS` (remove `chance`, `weights`, `targetBias`); Test: `events.test.ts`, `packages/ai/test/balance.test.ts`

- [ ] **Step 1: Write `EM-T-AC-3: two events on one plot both apply in order, never below 0, and an excluded pair keeps one`**
      at the month report and the plot's line, with rows forced.
      - Drought and acid rain on a Food plot that makes 1: both listed in that order, and the plot makes 0, not −1.
      - Drought and flood: exactly one listed, the same one on replay.
      - The line's parts still sum to `made`; the events spec's T-AC-5 INV is the pin.
- [ ] **Step 2: Run; expect FAIL** (production applies at most one event).
- [ ] **Step 3: Implement C2.** `runProduction` calls `rollPhase(state, 'production')` and chains `eventOutput` per
      event, in order. Remove `planEvent`, `EVENTS.chance` and `EVENTS.weights`. Delete the events spec's two `T-AC-2`
      tests: never twice in a row is superseded, and the what-if case is EM-T-AC-2's. Re-force its `T-AC-3` test (each
      key, one at a time) and the `T-AC-7` outlook test in balance.test.ts through the rows (all at 1 against all at
      0), with the assertions unchanged (HC-4 pin).
- [ ] **Step 4: Run `pnpm typecheck && pnpm test`; expect exit 0.** **Step 5: Commit** red then green.

### Task 7: The month report and the sim count every event — C5

**Depends on:** Task 6 · **ACs verified:** UBER-AC-1 (the report) · **Spec sections consumed:** §1 C5, §0 UBER-AC-1
**Files:** Modify: `packages/ai/src/sim.ts` (report lines and its `onEachPhase` hook; not the checks)

- [ ] **Step 1: Implement C5's report lines.** Events a month by phase (development: players sick at its start;
      production: `MonthReport.events`, and caverns that collapsed) and for the month, with months at 0 / 1 / 2 / 3 / 4+.
      `--air smoggy|toxic` counts each month as if the air were that band and every player had caused 5 points, on an
      unflagged copy of the state. It is measure only: the game plays on unforced.
- [ ] **Step 2: Positive control:** with every row at 0, the report prints 0.00 in every phase and 100% of months at 0.
      With rows at 1, it prints the row count. Then restore.
- [ ] **Step 3: Run `pnpm sim -- --games 40 --seed 1` and `-- --air smoggy`; expect the new lines; the checks print as before.**
- [ ] **Step 4: Commit** `feat(ai): the sim counts events a month by phase, and in forced air (UBER-AC-1)`

### Task 8: Rows — UBER-AC-1 and R-2

**Depends on:** Task 7 · **ACs verified:** UBER-AC-1

- [ ] **Step 1: Run three sets × politics off and on, 40 games a cell** (`pnpm sim -- --games 40 --seed {1,101,201} [--politics off]`),
      plus `--air smoggy` and `--air toxic` on each set.
- [ ] **Step 2: Compare.** UBER-AC-1 passes when clean air averages about 1.0 a month and forced Smoggy about 2.0. The
      references are R-1's measured spread (0.78-0.92; 1.89) and today's 45-46% of months.
- [ ] **Step 3: R-2.** A check that moves from ok to MISS goes to the PM as options for Heiko, before the PR is marked ready.
      R-3 (Toxic at about 2.5) is reported, not tuned.
- [ ] **Step 4: Record the rows** in the PR body and in spec §8 (a new amendment's "because").

### PR-1 merge gate

Before suggesting merge of `ws1-events-roller` into `ws1-events`:

- [ ] Every AC the PR claims has a green test or its rows: UBER-AC-1 (rows), EM-T-AC-1..4, the pins T-AC-3, T-AC-4, T-AC-5, T-AC-7
- [ ] Tests are named after the AC id; `trace-check.sh origin/feat/strategist...HEAD` reports no untraced test
- [ ] Each failing-test commit precedes its passing commit
- [ ] The contract (`MonthEvent.phase`, several events) is exercised by a consumer: EM-T-AC-3 reads the report as the screens will
- [ ] WS3 OK on the types.ts hunk
- [ ] No new `@ts-ignore` / `eslint-disable` without a reason on the same line; every new number is in `EVENTS` (HC-1)
- [ ] `pnpm typecheck && pnpm test` exit 0 on the sub-branch; CI green

## Phase P2 — PR-2: cavern collapse on the table

### Task 9: Cavern collapse rolls on the table — C4

**Depends on:** PR-1 merged into `ws1-events` · **ACs verified:** T-AC-5 (cavern collapse) · **Spec sections consumed:** §1 C4, §8 AM-1
**Files:** Modify: `EVENTS` (the `cavernCollapse` row), `events.ts`; named edits `packages/engine/src/specials.ts::collapses` and `EFFECT.collapseChance` (WS5 reviews); Test: `packages/engine/test/events.test.ts`

- [ ] **Step 1: Write `EM-T-AC-5: cavern collapse rolls on its row, with today's effect`** at the tiles after
      production.
      - With the row forced to 1, every cavern that produced Crystite becomes a plain plot, and one mined on Crystite 0 or farmed for Food stays.
      - With the row at 0, none collapses.
      - A what-if copy never collapses.
- [ ] **Step 2: Run; expect FAIL** (collapse still reads `EFFECT.collapseChance`).
- [ ] **Step 3: Implement C4.** `collapses` asks the row dice from `(seed, month, 'production', 'cavernCollapse', plot)`.
      Its "produced Crystite this month" check and its what-if guard stay. `EFFECT.collapseChance` goes.
- [ ] **Step 4: Run `specials.test.ts` unedited; expect WS5's T-AC-6 green** (replay; about 6% within ±30%; the same
      rate with or without a production event; each plot its own fate; unmined never). Then run events.test.ts and
      `pnpm typecheck && pnpm test`.
- [ ] **Step 5: Commit** red then green; send WS5 the hunks.

### PR-2 merge gate

- [ ] EM-T-AC-5 green; WS5's T-AC-6 green and unedited; WS5 OK on the specials.ts and EFFECT hunks
- [ ] Each failing-test commit precedes its passing commit; trace-check clean; `pnpm typecheck && pnpm test` exit 0; CI green
- [ ] The rows of Task 8 re-run on one set (seeds 1-40, politics on): the cavern line moves only by its new dice

## Gate: wave 1 reaches a table (`ws1-events` → `feat/strategist`)

- [ ] **WS6's several-events surface** is merged into `feat/strategist`, or merges with this branch: the phone and
      TV show every event of a phase, and the view (WS3's `mule-game.ts`) carries `phase`. It is built against Task 2's
      contract; the PM routes it.
- [ ] PR-1's and PR-2's rows in the PR body; R-2's options settled by Heiko if any check moved
- [ ] Heiko's OK through the PM

## Pre-implementation checklist

- [x] Spec approved: goal gate passed (PM, 28 Oct); class Standard; §8 AM-1 records the plan-time corrections
- [ ] Upstream merged: #109 (R1) in `feat/strategist` (the roller generalises its `EVENTS.player` and `rollPlayerEvent`)
- [ ] The PM's go to build: its order puts the literal guard and `sim --set` before this
- [ ] Branch policy: `ws1-events` from `feat/strategist`; PR-1 and PR-2 into it; to `feat/strategist` through the gate above
- [ ] Base `ws1-balance` @ `3567408` green (measured 28 Oct; re-run on `feat/strategist` at pre-flight): `pnpm
      typecheck` 0 · `pnpm test` tabletop 131 · ui 46 · engine 262 (+1 skipped) · ai 57 · web 142 · server 102 (+1 skipped)
- [x] No spike: R-1 was measured (spec §7)
- [ ] Effort to the PM: 1-2 days for both PRs, plus WS6's screen change
