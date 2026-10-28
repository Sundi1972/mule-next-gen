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

**Feature branch:** `ws1-events`, cut from `ws1-balance` and stacked on it (PM, 2026-10-28: build now, not after
#109): the roller generalises R1's `EVENTS.player` row and `rollPlayerEvent`, which are on `ws1-balance`. PR-1 and
PR-2 merge into `ws1-events`. Its PR into `feat/strategist` opens only after #109 merges, with `ws1-events` rebased
onto `feat/strategist` then, and goes through the gate below.

| PR | Sub-branch | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------------------------|--------------|--------------------|--------------------|-------------------|
| PR-1 | `ws1-events-roller` | Tasks 1-8 (C1, C2, C3, C5) | UBER-AC-1, T-AC-1..4, T-AC-5 (the ten events) | `MonthEvent.phase`; `MonthReport.events` with several events in the order fired | `EVENTS.player`, `rollPlayerEvent` (R1) | No |
| PR-2 | `ws1-events-cavern` | Task 9 (C4) | T-AC-5 (cavern collapse) | none | PR-1's row dice | No |

Built through subagents (PM, 2026-10-28), each task in its own worktree, so WS1's merge duties on #109 are not
delayed. In order: PR-2 needs PR-1's dice, and PR-1's rows decide whether R-2 sends options to Heiko. Two PRs because
PR-2 is a named edit in WS5's file and block, with WS5 as its reviewer.

**PR-1 authority**
- `may_edit`: `packages/engine/src/{events,production}.ts`, the `EVENTS` block of `packages/engine/src/config.ts`,
  `packages/engine/test/events.test.ts`, `packages/ai/src/sim.ts` (report lines only, not the checks),
  `packages/ai/test/balance.test.ts` (T-AC-7's forcing only), `docs/specs/2026-10-21-ws1-events.md` (its amendment),
  this spec and this plan, and `packages/engine/test/config-guard.test.ts` (the PENDING list only: Task 3's fix takes
  `events.ts` off it, Task 6 `production.ts`).
- Named edit, WS3 reviews: `packages/engine/src/types.ts::MonthEvent` (`phase`).
- `must_not_edit`: `packages/engine/src/game.ts` (WS3's; wave 1 needs no edit there), `packages/engine/src/specials.ts`
  and the `EFFECT` block (WS5's, PR-2's named edit), `apps/server/**` and `apps/web/**` (WS3's view and WS6's screens,
  behind the table gate), the sim's nine checks.

**PR-2 authority**
- `may_edit`: `packages/engine/src/events.ts`, the `EVENTS` block, `packages/engine/test/events.test.ts`,
  `packages/engine/src/production.ts` (the collapse's MonthEvent after the output events, AM-3; PR-1 has merged by then).
- Named edits, WS5 reviews: `packages/engine/src/specials.ts::collapses`, `EFFECT.collapseChance` in `config.ts` (it
  moves into the row).
- Named edit, WS3 reviews (AM-3, PM ruling A): `packages/engine/src/types.ts::EventKey` gains `'cavernCollapse'`.
- `must_not_edit`: `packages/engine/test/specials.test.ts` (WS5's T-AC-6 pins stay unedited and green), `game.ts`,
  `apps/**`.

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

**Contention**

| path | touched by | resolution |
|---|---|---|
| `packages/engine/src/events.ts` | PR-1, PR-2 | **serialised** — PR-2 branches from PR-1's merge |
| `config.ts` `EVENTS` block | PR-1, PR-2 | **serialised** — PR-2 adds the cavern row after PR-1's rows |
| `packages/engine/test/events.test.ts` | PR-1, PR-2 | **serialised** |

**Freeze point:** Task 2 publishes the contract the screens build against (`MonthEvent.phase`; several events per
phase in `MonthReport.events`, in the order fired). PM ruling, 28 Oct: WS8 is its primary reviewer. WS8's gallery
models events per phase and mirrors this contract, so the later build grafts onto it (Heiko picked direction B,
Living weather, plus phone-only play). WS1 sends the hunk to WS8, with WS6 copied as an FYI only (the production show's
owner; no action). The screens are built in parallel with Tasks 3-9.

**Named edits beyond the authority lists (PM-approved, 28 Oct):** a required `phase` breaks two `MonthEvent`
literals in WS6's `apps/server/test/production-view.test.ts` (born in WS6's production view, 583d3dc; SEAMS line 480;
first named here as WS3's, corrected by WS3); Task 2 adds `phase: 'production'` to them, and WS6 reviews them. WS3
reviews the types.ts hunk.

---

## Phase P1 — PR-1: every production event on its own dice

### Task 1: Retire today's one-dice ACs in the WS1 events spec — C2, C3

**Depends on:** none · **Spec sections consumed:** §8 AM-1 (§6 paragraph)
**Files:** Modify: `docs/specs/2026-10-21-ws1-events.md` (§8, a new amendment)

- [x] **Step 1: Write the amendment** in the WS1 events spec, superseding its RULE-1 (one dice), T-AC-2's "never
      twice in a row", T-AC-6 (targetBias; replaced by C3), and B-AC-1, T-AC-1 and T-AC-8 (`EVENTS.chance`, the
      30-60% band; replaced by this spec's UBER-AC-1). T-AC-3, T-AC-4, T-AC-5 and T-AC-7 stay as pins, forced
      through the rows. Point at this spec.
- [x] **Step 2: Commit** `docs(ws1): the events spec's one-dice ACs are superseded by the event model`
      Done 28 Oct: 363edf2, review fix 0542388 (on `ws1-events-t12` with Task 2).

### Task 2: The contract — `MonthEvent.phase` (C2's contract, the freeze point)

**Depends on:** none · **ACs verified:** T-AC-5 (strengthened pin) · **Spec sections consumed:** §3
**Files:** Modify: `packages/engine/src/types.ts::MonthEvent` (named edit, WS3 reviews), `packages/engine/src/events.ts::buildEvent`; Test: `packages/engine/test/events.test.ts`

- [x] **Step 1: Strengthen the WS1 events spec's `T-AC-3: each event changes exactly the plots it hits…`** (R6, not a
      new test): every event in the report carries `phase: 'production'`. Altitude: the month report.
- [x] **Step 2: Run it; expect FAIL** (`phase` undefined).
      Run: `pnpm --filter @mule/engine exec vitest run test/events.test.ts -t "T-AC-3"`
- [x] **Step 3: Implement** `phase: Phase` on `MonthEvent` per spec §3; `buildEvent` sets `'production'`.
- [x] **Step 4: Run events.test.ts and `pnpm typecheck`; expect PASS / exit 0.**
- [x] **Step 5: Commit** (red then green); send WS3 the types.ts hunk and WS6 the production-view.test.ts fixture lines;
      send WS8 the contract hunk (primary reviewer) with WS6 copied as an FYI; tell the PM the contract is frozen.
      Done 28 Oct: red 6046578, green 0582373; WS3 OK on types.ts at 0582373 (on condition that CI's check is green on
      the PR head); WS6 OK on the fixture lines at 0582373; WS8 OK on the contract (asks settled as AM-2 and AM-3).

### Task 3: The rows and the chance — C1 (RULE-1)

**Depends on:** Task 2 · **ACs verified:** T-AC-1 · **Spec sections consumed:** §1 C1, §2 RULE-1, wave 1's rows
**Files:** Modify: `EVENTS` in `config.ts`, `packages/engine/src/events.ts`; Test: `packages/engine/test/events.test.ts`

- [x] **Step 1: Add the rows to config first**, per spec §2's wave-1 table (`EVENTS.colony.<key>`,
      `EVENTS.player.<key>`, `EVENTS.excludes`), keeping `planEvent` and its knobs, so the red is an assertion and
      never a TypeError. Sickness's existing row stays.
- [x] **Step 2: Write `EM-T-AC-1: an event's chance is its phase's base plus its raises minus its lowers, between 0 and its cap`**
      at `events.ts::eventChance` (one table test, R3a pure core). Rows, by hand: dust storm, any air, 5%; drought
      in Toxic 7%; acid rain in Collapse 13%; flood the month after a drought 15%; pest swarm richest 2.5%, poorest
      0.5%; bumper harvest poorest 3%, richest 0.5%; wildfire richest during a drought 5.5%; sickness clean with 5
      points 18%; Collapse with 20 points 93→90%; a forced row summing below 0 → 0; a phase the row doesn't list → 0.
      Stub `eventChance` with `throw new Error('NotImplemented: eventChance')`.
      Amended at Task 3's review (28 Oct): the rows are test-local `EventRow`s shaped like the catalogue's, with these
      same values and expected literals, so a retune in config never turns EM-T-AC-1 red (G-1: a retune is one row
      edit; no change detector). Three more rows: a tie for the poorest goes to the first seat; a wildfire-like row
      the month after a drought (lastMonth only); a flood-like row two months after a drought reads nothing. The real
      rows' match to the catalogue is a review check; `satisfies EventRow` makes a misspelt row field a type error.
      `events.ts` comes off the guard's PENDING list in this task's fix (four markers), so HC-1 is enforced from here.
- [x] **Step 3: Run it; expect FAIL** with `NotImplemented: eventChance`.
- [x] **Step 4: Implement C1's chance** per RULE-1. The ranks read cash plus land at `GAME.plotScore` a plot; a tie goes to
      the first in seat order. Sickness's `playerEventChance` reads the same function.
- [x] **Step 5: Run events.test.ts; expect PASS, the balance spec's T-AC-24 unchanged.**
- [x] **Step 6: Commit** red then green.
      Done 28 Oct: red d61f3e4, green 0d69afd; review fixes 4323e17, 260665c, b84b0c4, 000dfde.

### Task 4: The roller — C1 (RULE-2)

**Depends on:** Task 3 · **ACs verified:** T-AC-2 · **Spec sections consumed:** §1 C1, §2 RULE-2
**Files:** Modify: `packages/engine/src/events.ts` (new `rollPhase`); Test: `packages/engine/test/events.test.ts`

- [x] **Step 1: Write `EM-T-AC-2: no event in month 1 or on a what-if copy, and a seed replays the same events`** at
      `rollPhase(state, 'production')`, with every row forced to 1: month 1 → nothing; `cloneForSim` → nothing; the
      same state rolled twice → the same keys and players in the same order (colony rows first, then players in seat
      order). Negative: a different seed over 40 months differs somewhere.
- [x] **Step 2: Run; expect FAIL** (`NotImplemented: rollPhase` stub).
- [x] **Step 3: Implement C1's roller** per RULE-2 steps 1, 2, 3 and 5; step 5 (once a month) holds by construction in
      wave 1, so no state is built for it. Seeds per HC-3: `(seed, month, phase, row, player)`, through the
      FNV-1a seed sickness uses. The excludes are step 4, proved in Task 6.
- [x] **Step 4: Run; expect PASS.** **Step 5: Commit** red then green.
      Done 28 Oct: red 592db82, green 431b449; strengthened 75ad821, refactor 1d8e6d7; review fix 2158c40 (the
      review's probes P1-P5 folded into EM-T-AC-2: sickness's dice as the oracle, a drought feeding wildfire's
      `firedThisPhase`, all four directions, seats' pests differ, development rolls nothing). Plan gap: P2's property
      (a later row reads this phase's fired events) has no AC id of its own, so it rides EM-T-AC-2. The roller is at
      2158c40 and also carries the merge of `ws1-events` (23736cf).

### Task 5: Personal events roll per player, and lean on wealth — C3

**Depends on:** Task 4 · **ACs verified:** T-AC-4 · **Spec sections consumed:** §1 C3, §2 RULE-1 (wealth rank)
**Files:** Modify: `packages/engine/src/events.ts` (`buildEvent` for a given player; `pickStart` and `EVENTS.targetBias` go); Test: `packages/engine/test/events.test.ts`

- [x] **Step 1: Write `EM-T-AC-4: a personal event starts on its own player's plots, and the richest and poorest read their rows' points`**
      at the month report.
      - Pest swarm forced for p2 only: `event.player === 'p2'`, and the order-0 plot is p2's. The spread is today's (HC-4): a pest reaches joined Food plots of anyone, a wildfire only its owner's.
      - A player with no Food plot fires no pest swarm.
      - The ranks: the richest p1 rolls pest at base +1, the poorest bumper at base +1.5 (read through `eventChance` on the report's state).
      Built at `rollPhase`'s return (production calls it from Task 6), on test-local rows: a wealth point is the only
      thing raising a row above 0, so the rank group proves the lean and the own-plot start in one assertion.
- [x] **Step 2: Run; expect FAIL** (today's `pickStart` starts anywhere).
- [x] **Step 3: Implement C3.** Delete the WS1 events spec's `T-AC-6` test (superseded, Task 1; R7). Re-force its
      `T-AC-4` pest test through the rows instead of `targetBias`, with the assertions unchanged.
- [x] **Step 4: Run events.test.ts; expect PASS.** **Step 5: Commit** red then green.
      Done 29 Oct: red 19b21cc, green 2eede4a (`EVENTS.targetBias` removed here); review fix 50bd61a (EM-T-AC-4 checks
      the start is drawn among the roller's own plots: a start fixed to the first plot survived). Roller at 50bd61a.

### Task 6: Production applies every event that fired — C2

**Depends on:** Tasks 4, 5 · **ACs verified:** T-AC-3, T-AC-5 (the ten events) · **Spec sections consumed:** §1 C2, §2 RULE-2 (4, 6), HC-4
**Files:** Modify: `packages/engine/src/production.ts::runProduction`, `events.ts` (remove `planEvent`), `EVENTS` (remove `chance`, `weights`; `targetBias` went in Task 5); Test: `events.test.ts`, `packages/ai/test/balance.test.ts`

From Task 5's review: with `planEvent` gone, `buildEvent`'s no-player arm goes too (a personal key needs its player)
and its docstring loses "otherwise on anyone's"; EM-T-AC-3's re-forced T-AC-3 pins that a bumper harvest reaches only
its start plot (HC-4; that mutant survives today).

- [x] **Step 1: Write `EM-T-AC-3: two events on one plot both apply in order, never below 0, and an excluded pair keeps one`**
      at the month report and the plot's line, with rows forced.
      - Drought and acid rain on a Food plot that makes 1: both listed in that order, and the plot makes 0, not −1.
        The plot's deltas are −1 (drought), then 0 (acid rain), and acid rain still lists the plot (spec §8 AM-2).
      - Drought and flood: exactly one listed, the same one on replay.
      - The line's parts still sum to `made`; the events spec's T-AC-5 INV is the pin.
- [x] **Step 2: Run; expect FAIL** (production applies at most one event).
- [x] **Step 3: Implement C2.** `runProduction` calls `rollPhase(state, 'production')` and chains `eventOutput` per
      event, in order. Remove `planEvent`, `EVENTS.chance` and `EVENTS.weights`. Delete the events spec's two `T-AC-2`
      tests: never twice in a row is superseded, and the what-if case is EM-T-AC-2's. Re-force its `T-AC-3` test (each
      key, one at a time) and the `T-AC-7` outlook test in balance.test.ts through the rows (all at 1 against all at
      0), with the assertions unchanged (HC-4 pin). Take `production.ts` off the guard's PENDING list: each literal
      moves into a config block or is marked `// literal-ok: <reason>` (the balance plan's PENDING clean-up, 28 Oct,
      left it to this task; `events.ts` came off in Task 3's fix). Rewrite the top-of-`EVENTS` docstring, which still
      describes planEvent's one event a month. Make `excludes` and every row's `follows` keys name real rows: the
      EM-T-AC-3 test that first reads `excludes` also asserts each excludes member and each follows key is a key of
      `EVENTS.colony` or `EVENTS.player` (a misspelt key would otherwise never fire). The excludes (RULE-2 step 4)
      resolve among the colony rows, which both pairs are, before any player row reads `firedThisPhase`: an excluded
      drought has not fired, so it never raises wildfire (lead's ruling at Task 4's review). EM-T-AC-3 asserts it.
- [x] **Step 4: Run `pnpm typecheck && pnpm test`; expect exit 0.** **Step 5: Commit** red then green.
      Done 29 Oct: red 450d848, green 4fe335e; fix round 1: b6c94d7 (WS5 named edit to specials.test.ts T-AC-6, which
      leaned on `EVENTS.chance` 0.5 for its event months: it arranges volcanic ash at 0.5; WS5 OK'd it directly),
      263f595 (`withEveryRowAt` keeps the excludes; EM-T-AC-2 opts out), e9054e3; fix round 2 (review): fe5e500,
      c5bc06e (EM-T-AC-3 covers every pair, across months, a lone member, the pair's own dice, where the event parts sit,
      and the two config facts the split needs: excludes members are colony rows, no colony row follows one thisPhase).
      Roller at c5bc06e. `production.ts` is off PENDING (the list is empty). Tests +1 ~2 −2.

### Task 6a: `MonthEvent.when` goes — the contract per spec §8 AM-5 (WS8, 29 Oct)

**Depends on:** Task 6 · **Files:** Modify: `packages/engine/src/types.ts::MonthEvent` (named edit, WS3 reviews),
`events.ts::buildEvent`; any test literal that sets `when` (grep `packages/` and `apps/`; another lane's test gets a
named edit its owner OKs)

- [x] Remove `when` from `MonthEvent` and from `buildEvent`; typecheck finds every reader (AM-5 names two)
- [x] `pnpm typecheck && pnpm test` exit 0; send the hunk to WS8 (primary reviewer) and WS3 (types.ts), WS6 copied;
      tell WS8 the real report carries several events (Task 6), so the gallery grafts onto it
      Done 29 Oct: 6c6c1db (four deletions; WS6's two test literals were a named edit too). OKs, each direct: WS8
      (primary), WS6 (its test lines), WS3 (types.ts). Merged into the roller with a merge commit, 7b69cf7, so the OK'd
      SHA holds; typecheck 0 and `pnpm test` exit 0 on the merge. WS8 confirmed Task 6's report fits its PR-1.

### Task 7: The month report and the sim count every event — C5

**Depends on:** Task 6, and the balance plan's PENDING clean-up merged (it cleans `sim.ts`; `ws1-events` takes it in
before this task, so the two never edit sim.ts at once) · **ACs verified:** UBER-AC-1 (the report) · **Spec sections consumed:** §1 C5, §0 UBER-AC-1
**Files:** Modify: `packages/ai/src/sim.ts` (report lines and its `onEachPhase` hook; not the checks)

- [x] **Step 1: Implement C5's report lines.** Events a month by phase (development: players sick at its start;
      production: `MonthReport.events`, and caverns that collapsed) and for the month, with months at 0 / 1 / 2 / 3 / 4+.
      `--air smoggy|toxic` counts each month as if the air were that band and every player had caused 5 points, on an
      unflagged copy of the state. It is measure only: the game plays on unforced.
- [x] **Step 2: Positive control:** with every row at 0, the report prints 0.00 in every phase and 100% of months at 0.
      With rows at 1, it prints the row count. Then restore.
- [x] **Step 3: Run `pnpm sim -- --games 40 --seed 1` and `-- --air smoggy`; expect the new lines; the checks print as before.**
- [x] **Step 4: Commit** `feat(ai): the sim counts events a month by phase, and in forced air (UBER-AC-1)`
      Done 29 Oct: 33fc412, review fix 4ecd78e (both counts count sickness rolls that hit: a Medicine cure is the event's
      effect). Roller at 4ecd78e. Seed 1, 40 games: 0.67 a month clean (development 0.24, production 0.43), 1.84 in
      forced Smoggy, 2.54 in forced Toxic (almost all sickness) — Task 8's starting point against ~1.0 / ~2.0.
      Controls: rows at 0 → 0.00 and 100% at 0; rows at 1 → development 4.00 (one row × 4 players), production 15.43
      (17 firable after the excludes × 11 of 12 months, less rolls that found no plot). Existing lines byte-identical.

### Task 8: Rows — UBER-AC-1 and R-2

**Depends on:** Task 7 · **ACs verified:** UBER-AC-1

- [x] **Step 1: Run three sets × politics off and on, 40 games a cell** (`pnpm sim -- --games 40 --seed {1,101,201} [--politics off]`),
      plus `--air smoggy` and `--air toxic` on each set.
- [x] **Step 2: Compare.** UBER-AC-1 passes when clean air averages about 1.0 a month and forced Smoggy about 2.0. The
      references are R-1's measured spread (0.78-0.92; 1.89) and today's 45-46% of months.
- [x] **Step 3: R-2.** A check that moves from ok to MISS goes to the PM as options for Heiko, before the PR is marked ready.
      R-3 (Toxic at about 2.5) is reported, not tuned.
- [x] **Step 4: Record the rows** in the PR body and in spec §8 (a new amendment's "because").
      Done 29 Oct: measured against the roller's base b3774fa (not trunk, which had moved: #139, #151, #152 touch
      specials, game and config). A, the catalogue: 0.7 / 1.8 a month, no check moved. Options B, C and C′ measured at
      the PM's ask; Heiko ruled "b": every production base ×1.6, his relative odds kept (spec §8 AM-6, with the
      table). 5d5ec4d sets the rows; they reproduce the measured --set run line for line from the checks on; every
      package green. UBER-AC-1 met: 0.93-1.01 clean, 2.02-2.15 Smoggy. R-2: the shortage check flips in two cells,
      accepted (food supply is its own follow-up, in the balance plan). R-3: Toxic 2.7-2.8, reported.

### PR-1 merge gate

Before suggesting merge of `ws1-events-roller` into `ws1-events`:

- [x] Every AC the PR claims has a green test or its rows: UBER-AC-1 (rows), EM-T-AC-1..4, the pins T-AC-3, T-AC-4, T-AC-5, T-AC-7
- [x] Tests are named after the AC id; `trace-check.sh origin/feat/strategist...HEAD` reports no untraced test
- [x] Each failing-test commit precedes its passing commit
- [x] The contract (`MonthEvent.phase`, several events) is exercised by a consumer: EM-T-AC-3 reads the report as the screens will
- [x] WS3 OK on the types.ts hunk (given at 0582373, conditional on CI's check green on the PR head); WS6 OK on the
      production-view.test.ts fixture lines (given at 0582373)
- [x] No new `@ts-ignore` / `eslint-disable` without a reason on the same line; every new number is in `EVENTS` (HC-1)
- [x] `pnpm typecheck && pnpm test` exit 0 on the sub-branch; CI green

Done 29 Oct. PR-1 is #162, `ws1-events-roller` aeccb57 into `ws1-events`, merged at fc1c2eb under the lane rule.
- The PR boundary review (at 5d5ec4d) found the code matching the spec and AM-1..AM-7, and every item above passing
  locally: trace-check over the PR 4 added, 3 removed, every one traced; each task's red commit before its green
  (the SDD ledger names both SHAs); the literal guard's PENDING list empty, so HC-1 holds on events.ts and production.ts.
- Its one blocker, C-1, was the CI Tier-1 e2e: on seed 1 the new rows fire no event in month 2, which B-AC-7's show
  needs (measured red locally; the base passed). Fixed by 56508dd + aeccb57, a named edit in WS4's `smoke.ts` that
  makes the show seed's dust storm certain (its row at 100%, cap included, put back when the game ends), which WS4
  OK'd directly, and 3eee4a4 (the ci.yml comment). Local seed-1 e2e:core exit 0, "a storm event hitting 1".
  Its importants went to AM-7 (sickness rolls in month 1; HC-2 scoped to rollPhase) and to Task 9's notes below.
- Owner OKs: WS3 types.ts (0582373, 6c6c1db; its condition met by CI's `check` green on aeccb57), WS6
  production-view.test.ts (0582373, 6c6c1db), WS5 specials.test.ts (b6c94d7), WS4 smoke.ts (56508dd + aeccb57),
  WS8 the contract and dropping `when`.
- CI on aeccb57: `check` and `e2e` green; `sim` and `e2e-regression` skipped (Tier 2 runs only into
  `feat/strategist` or `main`).

## Phase P2 — PR-2: cavern collapse on the table

### Task 9: Cavern collapse rolls on the table — C4

**Depends on:** PR-1 merged into `ws1-events` · **ACs verified:** T-AC-5 (cavern collapse) · **Spec sections consumed:** §1 C4, §3, §8 AM-1, AM-3
**Files:** Modify: `EVENTS` (the `cavernCollapse` row), `events.ts` (`SHAPE`, `eventOutput`'s no-op entry), `production.ts` (the collapse's MonthEvent, after the output events); named edits `packages/engine/src/specials.ts::collapses` and `EFFECT.collapseChance` (WS5 reviews), `packages/engine/src/types.ts::EventKey` gains `'cavernCollapse'` (WS3 reviews, AM-3); Test: `packages/engine/test/events.test.ts` (with `RULE_3`'s cavernCollapse entry)

From Task 6's review: EM-T-AC-3's key check reads `RULE_3`'s keys as "the rows rollPhase rolls", so cavernCollapse
joins `RULE_3` without becoming a row `rollPhase` rolls at the phase start (the note above); and its pair-independence
check runs one way round only (a pair seeded from the second member's row seed would survive): run it both ways. WS5
asked for the specials.ts/EFFECT hunk on its SHA to check T-AC-6's five rules (T-AC-6 as WS5 OK'd it at b6c94d7).

From PR-1's boundary review (29 Oct), for this task:
- `packages/ai/src/sim.ts` joins the files: once a collapse is a MonthEvent, drop the tile diff (`caveIns`,
  `cavernsOf`) or each collapse counts twice; relabel "Events in N% of months" to say it counts production events.
- `types.ts`: with the EventKey hunk, `MonthReport.events`' doc becomes "The production events that fired this month,
  in the order they fired" ("none in most months" stopped being true at AM-6's rows); WS3 reviews both.
- EM-T-AC-3's config facts gain "every row lists exactly one phase" (RULE-2 step 5 holds by construction only while
  that does); `e.phase` joins the map EM-T-AC-3 reads, so one consumer test reads the whole contract; the config-fact
  checks move to their own `it` under EM-T-AC-3's id.
- The row dice are seeded in two places and this task adds a third: extract one helper. `PlayerEventKey` now covers
  production rows: narrow it, or make `rollPlayerEvent`'s and `playerEventChance`'s docs say they skip the only-if
  and `firedThisPhase`. `buildEvent`'s `owner` is always `player` now: use `player`.
- For routing the table gate: the screens' `events[0]` readers include ProductionMap.tsx (two) and the web e2e's
  production-steps.ts (two), besides those AM-1 names.

At dispatch (29 Oct, codebase drift since plan time):
- `EFFECT.collapseChance` has two more readers, both WS4's: `apps/web/src/game/derive.ts` (the cavern's plot-card line)
  and `apps/web/test/specials.test.ts` (B-AC-9). They join the files as named edits WS4 reviews; they read the row's
  production base, and the line the phone shows doesn't change.
- The cavern row's base is 0.06, `EFFECT.collapseChance` moved: AM-6's ×1.6 covered the rows that existed, and C4 pins
  today's 6% (WS5's T-AC-6).
- `settleSpecials` returns the caverns that collapsed (WS5's file, with `collapses`), so production announces them
  without diffing tiles.

- [x] **Step 1: Write `EM-T-AC-5: cavern collapse rolls on its row, with today's effect`** at the tiles after
      production.
      - With the row forced to 1, every cavern that produced Crystite becomes a plain plot, and one mined on Crystite 0 or farmed for Food stays.
      - With the row at 0, none collapses.
      - A what-if copy never collapses.
      - Each collapse is in the month report as a MonthEvent after the output events (AM-3): key `cavernCollapse`,
        kind `quake`, scope `personal`, `player` the owner, `plots` [{index, order 0, good 'crystite', delta 0}],
        phase 'production'; with the row at 0, no such event.
- [x] **Step 2: Run; expect FAIL** (collapse still reads `EFFECT.collapseChance`).
- [x] **Step 3: Implement C4.** `collapses` asks the row dice from `(seed, month, 'production', 'cavernCollapse', plot)`.
      Its "produced Crystite this month" check and its what-if guard stay. `EFFECT.collapseChance` goes. Production
      lists each collapse as a MonthEvent after the output events (AM-3); `eventOutput` gets a no-op entry.
      `rollPhase` must not roll `cavernCollapse` at the phase start: its rows are picked by "key is in SHAPE", which
      the cavern row joins here, but C4 rolls it once per mined cavern plot after output. EM-T-AC-2's key literal goes
      red if it slips (Task 4's review).
- [x] **Step 4: Run `specials.test.ts`, its assertions unedited (AM-8: two fixture reads change, a named edit WS5
      reviews); expect WS5's T-AC-6 green at 200 seeds and with MULE_FULL=1** (replay; about 6% within ±30%; the same
      rate with or without a production event; each plot its own fate; unmined never). Then run events.test.ts and
      `pnpm typecheck && pnpm test`.
- [x] **Step 5: Commit** red then green; send WS5 the specials.ts and EFFECT hunks, WS3 the EventKey hunk and WS4 the
      derive.ts and web specials.test.ts hunks; tell WS8
      the ruling with the hunk (PM, 28 Oct).

### PR-2 merge gate

- [x] EM-T-AC-5 green; WS5's T-AC-6 green, its assertions unedited (AM-8); WS5 OK on the specials.ts, EFFECT and
      T-AC-6 fixture hunks; WS3 OK on the
      EventKey hunk (AM-3); WS4 OK on the derive.ts and web specials.test.ts hunks
- [x] Each failing-test commit precedes its passing commit; trace-check clean; `pnpm typecheck && pnpm test` exit 0; CI green
- [x] The rows of Task 8 re-run on one set (seeds 1-40, politics on): the cavern line moves only by its new dice

Done 29 Oct. PR-2 is #168, `ws1-events-cavern` 28e67a1 into `ws1-events`, merged at 607d33d under the lane rule.
- Commits: red 3772b7d, green abbc4e0, the T-AC-6 fixture d29a8fc (AM-8), the mock 010976f, review round 1 d1e0391..28e67a1.
  Twice the implementer stopped on a false claim of the brief, and the lead ruled: T-AC-6 can't stay unedited (AM-8), and
  `collapseChance` had a fourth reader, WS5's map-gallery mock (the lead's grep had covered `packages` and `apps` only).
- EM-T-AC-5 green; T-AC-6 red unedited ("expected 0 to be greater than 0.0419"), green with the fixture at 200 and 400
  seeds. Positive controls: `rowsOf` without the perPlot skip turns EM-T-AC-2 red through `buildEvent`'s throw (with
  `return null` instead, all tests stay green, so the throw is the guard); dropping the "produced Crystite" check turns
  EM-T-AC-5 and T-AC-6 red.
- Review (logic/contract, 31 mutants): one Important, EM-T-AC-5 missing the cap and `settleSpecials` returning a ruin,
  fixed by strengthening it (both mutants red after); Minors fixed: an import cycle (pollution.ts now imports
  `neighbours` from grid.js), a neutral throw message, T-AC-7's reset keeping perPlot, three comments. Declined: golden
  dice values (a change detector; EM-T-AC-2's replay holds HC-3). Survivors left: the two seed-order mutants, a gap
  PR-1 already had.
- trace-check 3 added, 1 removed, all traced; `pnpm typecheck` and `pnpm test` exit 0; CI on 28e67a1: check and e2e
  green. Sim, seed 1, 40 games, politics on: production 0.74 → 0.73 events a month, `cavernCollapse 5` in the events
  line, every check ok; the collapses now count once, from the report.
- Owner OKs, direct, at 28e67a1: WS5 (specials.ts, `specialEffect`, T-AC-6's fixture, the mock), WS3 (types.ts), WS4
  (derive.ts, B-AC-9). WS8 told the collapse event's shape.
- For later (WS4, not a condition): the plot card shows the cavern row's base as its chance; a row that gains an
  influence needs the card's copy changed with it.

## Gate: wave 1 reaches a table (`ws1-events` → `feat/strategist`)

- [x] #109 merged into `feat/strategist`; `ws1-events` synced with it (merged, not rebased, so the task SHAs hold):
      trunk b3774fa at 946ab96, typecheck 0 and the suite green
- [ ] **The events gallery is built** (Heiko, 29 Oct: "Living weather" approved as the design to build; WS8 writes the
      build spec and names its files): merged into `feat/strategist`, or merges with this branch. The phone and TV show
      every event of a phase, and the view (WS3's `mule-game.ts`) carries `phase`. The event payloads are agreed with
      WS8 against Task 2's contract (`MonthEvent`, several a phase in the order fired; AM-2's delta-0 plots; AM-3's
      collapse); any field the gallery needs beyond it is a named change to that contract. The PM routes it.
- [ ] `ws1-events` synced with today's trunk (aae54c4 or later: #151's meteor crater, #164's playbook types, #166's
      one-pass grant). WS5 named the conflicts to expect, all text: specials.ts (imports, `formMeteorCrater`,
      `PlacedSpecialKind`), config.ts (`MAP.meteorCrater` beside `specialEffect`), the map-gallery mock (a `meteorCrater`
      line under `crystalCavern`), specials.test.ts (B-AC-10 and its imports). Keep both sides (the crater never goes
      through `settleSpecials`); send WS5 the merge SHA for those hunks. Re-run the rows after the sync: #166 alone moved
      the shortage check (balance plan, the AM-19 (b) re-measure)
- [ ] PR-1's and PR-2's rows in the PR body; R-2's options settled by Heiko if any check moved
- [ ] Heiko's OK through the PM

## Pre-implementation checklist

- [x] Spec approved: goal gate passed (PM, 28 Oct); class Standard; §8 AM-1 records the plan-time corrections
- [ ] Upstream merged: #109 (R1) in `feat/strategist` (the roller generalises its `EVENTS.player` and `rollPlayerEvent`).
      Open by design: the build is stacked on `ws1-balance`, which carries R1; this box gates only the PR into
      `feat/strategist`
- [x] The PM's go to build (2026-10-28): now, stacked on `ws1-balance`, through subagents; #128 and WS4's P0 merge first
- [x] Branch policy: `ws1-events` from `ws1-balance`; PR-1 and PR-2 into it; to `feat/strategist` only after #109
      merges, rebased then, through the gate above
- [x] Base `ws1-balance` @ `149b2eb` green (later commits there are docs only): `pnpm typecheck` 0 · `pnpm test`
      tabletop 132 · ui 46 · engine 264 (+1 skipped) · ai 59 · web 151 · server 153 (+1 skipped)
- [x] No spike: R-1 was measured (spec §7)
- [ ] Effort to the PM: 1-2 days for both PRs, plus WS6's screen change
