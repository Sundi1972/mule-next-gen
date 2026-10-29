# Arcade walking in development — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or
> swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Spec class:** Programme (`docs/specs/2026-10-29-arcade-walking.md`).

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 [spec §0] | every player at the table, Heiko first | development is steered, live, by everyone at once | UBER-AC-1 | **PR-6** (behind the flag; reason below) |
| G-2 [spec §0] | the same | terrain is felt; the AI walks by the same rules | UBER-AC-2 | PR-4 (headless, the AI); PR-6 (a person steering) |
| G-3 [spec §0] | the same | three arcade moments, the AI in all, the TV shows them | UBER-AC-3 | PR-9 |

**Why G-1 is first delivered at PR-6, not PR-1 or PR-2:** the PM ruled one PR per owner, in §5's order (engine →
server, protocol and tabletop → AI and sim → screens → moments → switch → removal), and five lanes own the layers
G-1 crosses. Each of PR-1 to PR-5 unblocks at least two later PRs (the table below), and nobody can play G-1 before
the screens PR in any order, because the phone is the beneficiary's only window. The moments wait until G-1 and G-2
are playable, so value is not held back by G-3. G-1's goal check is at PR-6's boundary (Task 6.8). The PM confirmed the
one-owner PRs (29 Oct) with one change: they **build in parallel** against PR-0's frozen types, so G-1 is built
alongside PR-1 to PR-5 and only its merge waits for them (the build/merge table below).

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- the Wampus; a MULE running away on its own (it only bolts after a lost fight); colonists colliding; walking in
  other phases; balancing beyond the numbers Heiko ruled (WS1's sim sweeps them after the build).

**Thin baseline (spec §0.1):** keep today's event-time walk and only animate it · ≈ 3 PRs · it loses because it
does not deliver G-1: a tap-to-go walk cannot be steered (`walkTarget`'s one target per tap).
→ **PR-1 relationship:** the baseline lost for a true reason (checked: `apps/server/src/dev-walking.ts::Colonist`
still holds one `walk` per tap on trunk 6d30b69). PR-1 is the first slice of the chosen approach: the pure floor
every later PR calls.

**Constraints:** spec §0.2 (HC-1 … HC-10) travel with every task. HC-9 and HC-10 (the record seam) bind every server
task.

**Architecture:** one pure engine step (`packages/engine/src/floor/`) moves every colonist from steering inputs at a
fixed tick; the server runs that tick through `ctx.schedule` and streams a light frame; phones predict their own
colonist with the same step; the AI and the sim feed it the same inputs. Branch by abstraction: `DEV_STEER.on`
(false on trunk) picks the tick or today's walk until the switch PR.

**Tech Stack:** TypeScript (pnpm workspace), vitest, React + Tailwind (apps/web, packages/ui), the tabletop room
(packages/tabletop), tsx + Playwright e2e (apps/web/e2e).

**Inputs:**
- Spec: `docs/specs/2026-10-29-arcade-walking.md` at the plan's commit (AM-1 to AM-5).
- Sections present and consumed: §0, §0.1, §0.2, §1 (C1–C15), §2 (RULE-1–10), §3, §4, §5, §6 (B-AC-1–8,
  T-AC-1–10), §7 (S-1, S-2, R-1–R-4, W-1), §8, §9.
- Sections declared N/A by the spec: none.
- N/A claims checked: none to check. §5's "code-only; no stored state" checked: games are in memory (`MuleGame`).
- The approved scaffold: `design/mocks/ws6-ux/src/screens/arcade/` at **ceedd23f** (HC-6).

## Phase 0 · Contracts and spikes (before their consumers)

- **Frozen in PR-1:** `DevFloor`, `stepFloor`, `reachOf`, `pathTo`, the hall plan, the config blocks (spec §3, C1, C2,
  C3, C5). Every later PR consumes them.
- **Frozen in PR-0 (types only, WS3, first):** `MuleIntent` steer/act, `ColonistView` v2, `MyView.reach`/`banners`,
  `DevFrame` (spec §3, C7), as #164 froze the playbook. PR-3, PR-4, PR-6 and the moments wave build against it.
- **Frozen in PR-2:** the tabletop frame message and the `ctx` output it rides (C8). Its shape waits on WS3's answer
  on `ctx.frame` and on S-1.

### Spike S-1: the wire (WS3)

**Phase:** P0, before PR-2. **Timebox:** ½ day. **Stop condition:** frames ≤ 1 kB at 20 Hz and full views on change
fit, or the numbers say 10 Hz.
- [ ] **Step 1: Measure viewFor's size in development today, a 20 Hz frame to 4 phones and the TV over the rig's
  Wi-Fi, and phone → server → TV latency** (spec §7 S-1). The spike owns its own server on a free port, torn down
  when it ends; never the :8787 rig.
- [ ] **Step 2: Record the outcome** in `docs/research/2026-10-29-arcade-s1-wire.md` and send the PM the numbers;
  PR-2's frame shape and `DEV_STEER.tickMs` follow them.

### Spike S-2: feel (WS6)

**Phase:** P0, before PR-6's prediction (Task 6.3). **Timebox:** ½ day. **Stop condition:** Heiko or the PM plays it
on a phone over Wi-Fi.
- [ ] **Step 1: Build a throwaway server on a free port** running RULE-10's prediction against the mock's sim at
  DEV_STEER.tickMs, with injected latency; a phone on the same Wi-Fi steers (spec §7 S-2). Torn down when the spike
  ends; never the :8787 rig.
- [ ] **Step 2: The PM or Heiko plays it**; record the feel and the values of snapTiles, correctMs, interpolateMs
  in `docs/research/2026-10-29-arcade-s2-feel.md`. Confirmed → Task 6.3 uses those values; feels wrong → the PM and
  Heiko decide before Task 6.3.

### WS3's answer on `ctx.frame` (blocks PR-2)

- [ ] **Step 1: WS3 rules, via the PM,** whether a void `ctx.frame(payload)` counts as output under its record's §3
  (spec C8, HC-10). Yes → PR-2 as written. No → the frame rides `changed()` (S-1's numbers decide whether that fits),
  or a record amendment with WS1, WS2 and WS3 OKs; the spec's C8 is amended first (§8).

<!-- plan-check: no-task C18 C19 C20 — the WS6 UX spec's changes, named in the arcade spec only as history (next-step.ts's origin) and as the chat ticker that stays -->

## PR decomposition

**Branching:** no shared feature branch. Each PR is cut from trunk (`feat/strategist`) by its owner, lands green
behind `DEV_STEER.on = false`, and merges into trunk with Heiko's OK via the PM. Five lanes own the files, and the
flag keeps trunk releasable after every PR (§5).

| PR | Owner | Sub-branch | Scope (changes) | ACs verified | Contracts produced | Contracts consumed | Frontend? |
|----|-------|------------|-----------------|--------------|--------------------|--------------------|-----------|
| PR-0 | WS3 | `ws3-arcade-types` | C7 (types only) | C7's pin (every protocol consumer typechecks) | MuleIntent steer/act, ColonistView v2, MyView.reach, DevFrame | — | No |
| PR-1 | WS1 | `ws1-arcade-floor` | C5, C1, C2 (engine), C3 (rows 5–14), path.ts, §9 boundary test | T-AC-1 (engine), T-AC-2, T-AC-3 | DevFloor, stepFloor, reachOf, pathTo, hall plan, config | — | No |
| PR-2 | WS4 | `ws4-arcade-frame` | C8 | T-AC-4 (tabletop part) | the frame message | S-1, WS3's answer | No |
| PR-3 | WS3 | `ws3-arcade-tick` | C6, C15 (fake-context `steerTo`) | T-AC-1 (server), T-AC-4, T-AC-9 | — | PR-0, PR-1, PR-2 | No |
| PR-4 | WS1 | `ws1-arcade-ai` | C9, C10 | T-AC-1 (server = sim), T-AC-5 | — | PR-0, PR-1, PR-3 | No |
| PR-5 | WS4 | `ws4-arcade-hall` | C2 (Store.tsx), C15 (harness.ts steering step) | — (consumed by B-AC-1) | the e2e steering step | PR-1, PR-3; after WS4's small-phone PR | Yes (no behaviour change behind the flag) |
| PR-6 | WS6 | `ws6-arcade-screens` | C11, C12, C13, the PhoneApp/TableApp route lines | B-AC-1, B-AC-2, B-AC-3, B-AC-4, B-AC-8, T-AC-10 | — | PR-0 (builds); PR-3, PR-5 (merges); S-2 | Yes |
| PR-7 | WS3 | `ws3-arcade-payouts` | C4 (game.ts payouts), AM-2 (take, re-outfit) | — (consumed by PR-8) | the payout and re-outfit rules | PR-1 | No |
| PR-8 | WS1 | `ws1-arcade-moments` | C4 (floor moments), C3 (rows 1–4, 8a, 11a), C9 (the AI in the moments), AM-2's sweep | T-AC-6, T-AC-7, T-AC-8 | the moments' step outputs (beats, encounters) | PR-4, PR-7 | No |
| PR-9 | WS6 | `ws6-arcade-moments` | C11 and C12 (the moments' layers), C13 | B-AC-5, B-AC-6, B-AC-7 | — | PR-6, PR-8 | Yes |
| PR-10 | WS3, WS1, WS4, WS6, WS5 | one per owner: `ws3-arcade-tests`, `ws1-arcade-tests`, `ws4-arcade-tests`, `ws6-arcade-tests`, `ws5-arcade-tests` | C15 (every test that walks, walks by steering) | the pins of C14 | — | PR-5, PR-6 | Yes (e2e) |
| PR-11 | WS1 | `ws1-arcade-switch` | the switch (§5): `DEV_STEER.on = true` | UBER-AC-1, UBER-AC-2, UBER-AC-3 on the rig | — | PR-1 … PR-10 | Yes |
| PR-12 | WS6, with WS1, WS3 | `ws6-arcade-removal` | C14 | the C14 pins stay green | ColonistView v2 only (v1 fields removed) | PR-11 | Yes |

PR-0 unblocks every PR that reads the wire. Each of PR-1 to PR-5 unblocks two or more later PRs: PR-1 → PR-3,
PR-4, PR-7; PR-2 → PR-3, PR-6; PR-3 → PR-4, PR-6, PR-10; PR-4 → PR-8, PR-11; PR-5 → PR-6, PR-10.

**Build in parallel, merge in order** (PM ruling, 29 Oct). Building means coding and reviewing on the sub-branch
against frozen contracts and fixtures; merging is into trunk, in the order of the PR numbers.

| PR | may start building when | may merge after |
|----|-------------------------|-----------------|
| PR-0 | now | — (first) |
| PR-1 | now | PR-0 |
| PR-2 | S-1 recorded and WS3's ctx.frame answer | PR-1 |
| PR-3 | PR-0 merged (builds against PR-1's branch) | PR-1, PR-2 |
| PR-4 | PR-0 merged (builds against PR-1's and PR-3's branches) | PR-3 |
| PR-5 | WS4's small-phone PR merged | PR-4 |
| PR-6 | PR-0 merged: against PR-0's types and fixture frames, then S-2's values for the prediction (Task 6.2) | PR-3, PR-5 |
| PR-7 | now | PR-6 |
| PR-8 | PR-4's and PR-7's branches | PR-7 |
| PR-9 | PR-6's and PR-8's branches | PR-8 |
| PR-10 | PR-5 (WS4 first), then each owner | PR-9 |
| PR-11 | PR-10 merged | Heiko's OK on the rig |
| PR-12 | PR-11 merged | PR-11 |

A PR built against another's branch rebases onto trunk when that one merges, and re-runs its gates there; a red run
after the rebase is that PR's to fix before it merges. G-1 is therefore built in parallel with PR-1 to PR-5, and only
its merge waits for them.

**Waves (by merge):**
- **Wave 0: PR-0.** One PR, types only.
- **Wave 1: PR-1, PR-2, S-1, S-2.** Safe together: disjoint owned files (engine floor/config; tabletop; spikes on
  their own servers).
- **Wave 2: PR-3, then PR-4.** PR-4 consumes PR-3's server (T-AC-1's server = sim), so they merge in that order.
- **Wave 3: PR-5, then PR-6;** PR-7 builds alongside. Safe: PR-7 touches only game.ts, which no screen PR touches.
- **Wave 4: PR-8, then PR-9.**
- **Wave 5: PR-10,** WS4's part first (`harness.ts` is shared), then the others at once (disjoint files).
- **Wave 6: PR-11** on Heiko's OK; **PR-12** after it.

### Per-PR authority

The standing line, verbatim, in every handoff:

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is
> specified. If you need to change anything outside it — including because it appears impossible — stop and report
> to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see
> the whole graph.

| PR | may_edit | may_edit_content | must_not_edit |
|----|----------|------------------|---------------|
| PR-0 | `packages/protocol/src/index.ts` (types only; no runtime code) | — | `apps/server/**`, `apps/web/**` |
| PR-1 | `packages/engine/src/floor/**` (new), `packages/engine/src/config.ts` (the four blocks), `packages/engine/src/index.ts` (exports), `packages/engine/test/floor*.test.ts` (new) | — | `packages/engine/src/game.ts` (WS3's; PR-7), `dev-walk.ts` (stays until PR-12) |
| PR-2 | `packages/tabletop/src/room.ts`, `packages/tabletop/src/protocol.ts`, `packages/tabletop/test/**` | — | `apps/server/**` (PR-3) |
| PR-3 | `apps/server/src/dev-steer.ts` (new), `apps/server/src/mule-game.ts` (development), `apps/server/test/fake-context.ts`, `apps/server/test/dev-steer*.test.ts` (new) | — | `packages/engine/src/floor/**` (WS1's), `apps/server/src/dev-walking.ts` (stays until PR-12), `apps/web/**` |
| PR-4 | `packages/ai/src/hands/develop.ts`, `packages/ai/src/seat.ts`, `packages/ai/src/strategist.ts`, `packages/ai/src/value.ts`, `packages/ai/src/play.ts`, `packages/ai/src/sim.ts`, `packages/ai/test/**` (new arcade tests) | — | `apps/server/**`, `packages/engine/src/floor/**` except through a WS1 follow-up commit named in the PR |
| PR-5 | `packages/ui/src/components/Store.tsx` (WS4's own), `apps/web/e2e/harness.ts` | — | `apps/web/src/phone/**`, `apps/web/src/table/**` (PR-6) |
| PR-6 | `apps/web/src/phone/arcade/**` (new), `apps/web/src/table/TvDevelop.tsx` (new), new `packages/ui` pieces (map overlay, Joystick, ActionButton), `apps/web/e2e/screens.ts`, `apps/web/e2e/shell.ts`, `apps/web/e2e/store-steps.ts` (the B-AC steps), `apps/web/test/arcade*.test.ts` (new); named edits, WS4 reviewing: the development route line in `apps/web/src/phone/PhoneApp.tsx` and in `apps/web/src/table/TableApp.tsx` | `design/mocks/ws6-ux/src/screens/arcade/**` at ceedd23f, grafted: data flow, handlers, state wiring only; not composition, routes or tokens | `apps/web/src/phone/Develop.tsx` and `next-step.ts` (stay until PR-12), `Store.tsx` (WS4's) |
| PR-7 | `packages/engine/src/game.ts` (WS3's own), `packages/engine/test/rules*.test.ts` | — | `packages/engine/src/floor/**` |
| PR-8 | `packages/engine/src/floor/{wolves,glint,scramble}.ts` (new), `floor/reach.ts`, `packages/engine/src/config.ts` (WOLVES, GLINT, SCRAMBLE, reoutfitCost), `packages/ai/src/hands/develop.ts`, `packages/ai/test/**` | — | `packages/engine/src/game.ts` (PR-7, merged) |
| PR-9 | `apps/web/src/phone/arcade/**`, `apps/web/src/table/TvDevelop.tsx`, its `packages/ui` pieces (Wolf/Glint sprites), `apps/web/e2e/store-steps.ts` | the arcade mock at ceedd23f (as PR-6) | `apps/server/**`, `packages/engine/**` |
| PR-10 | each owner's own files only: WS3 `apps/server/test/**` and `apps/web/e2e/auction-steps.ts::goToThePub`; WS1 `packages/ai/test/play-walk.test.ts`, `balance.test.ts`; WS4 `harness.ts`, `smoke.ts`, `table-steps.ts`, `zoom.ts`; WS6 `store-steps.ts`, `screens.ts`, `shell.ts`; WS5 `specials.ts`, `special-steps.ts` | — | every other owner's files |
| PR-11 | `packages/engine/src/config.ts` (`DEV_STEER.on`) | — | everything else |
| PR-12 | WS6: removing `apps/web/src/phone/Develop.tsx` (a named edit, WS4 reviewing) and `next-step.ts`, `apps/web/test/next-step.test.ts`, `store-view.test.ts`; WS1: removing `packages/engine/src/dev-walk.ts`; WS3: removing `apps/server/src/dev-walking.ts` and ColonistView v1 fields in `packages/protocol/src/index.ts` | — | anything not removed by C14 |

### Contention

| path | touched by | resolution |
|---|---|---|
| `packages/engine/src/config.ts` | PR-1, PR-8, PR-11 | **serialised**: PR-1 adds the blocks; PR-8 the moments' values; PR-11 one line |
| `packages/engine/src/floor/reach.ts` | PR-1, PR-8 | **serialised**: rows 5–14 in PR-1, rows 1–4, 8a, 11a in PR-8 |
| `packages/ai/src/hands/develop.ts` | PR-4, PR-8 | **serialised** (waves 2 and 4) |
| `apps/web/src/phone/arcade/**`, `TvDevelop.tsx` | PR-6, PR-9 | **serialised** (waves 3 and 4) |
| `apps/web/e2e/store-steps.ts` | PR-6, PR-9, PR-10 (WS6) | **serialised**, one owner (WS6) |
| `apps/web/e2e/harness.ts` | PR-5, PR-10 (WS4) | **serialised**, one owner (WS4) |
| `packages/ui/src/components/Store.tsx` | WS4's small-phone PR, PR-5 | **serialised**: the size table first (PM ruling), then C2 |
| `packages/protocol/src/index.ts` | PR-0, PR-12 | **serialised** |
| `apps/server/src/mule-game.ts` | PR-3, PR-12 | **serialised** |
| `packages/engine/src/game.ts` | PR-7 only | — |

---

## PR-1 · The dev floor (WS1)

### Task 1.1 — C5: the walking numbers in config

**Depends on:** — **ACs verified:** (consumed by T-AC-2) **Spec sections consumed:** §1 C5, §2 RULE-7, HC-2

**Files:** Modify `packages/engine/src/config.ts`.

- [ ] **Step 1: Add DEV_STEER, WOLVES, GLINT, SCRAMBLE per spec §1 C5 and RULE-7's table** (`floorSeconds` 3,
  AM-7), with `DEV_STEER.on = false`, `reoutfitCost` and `month1WaitsForFirstMule` (AM-2, AM-3). Every number named (HC-2); `pnpm sim --set`
  reaches each.
- [ ] **Step 2: Run `pnpm typecheck`**. Expected: exit 0.
- [ ] **Step 3: Commit** `feat(engine): C5 the arcade walking numbers, off by default`.

### Task 1.2 — T-AC-2: speeds (red first)

**ACs verified:** T-AC-2 **Spec sections consumed:** §2 RULE-2, §6 T-AC-2

**Files:** Test `packages/engine/test/floor-speed.test.ts` (new).

- [ ] **Step 1: Write the failing test `T-AC-2: speeds per RULE-2's examples`.** Altitude: unit (a pure formula).
  Observed at: `speedOf`'s tiles per second. Negative case: lake 0 blocks. Expected values: plains 1.5625, mountains
  0.625, swamp 0.78, leading 1.41, bitten 0.78 tiles/s.
- [ ] **Step 2: Run `pnpm --filter @mule/engine exec vitest run test/floor-speed.test.ts`.** Expected: FAIL (module
  not found).

### Task 1.3 — C1: the floor and its pure step

**Depends on:** Task 1.1 **ACs verified:** T-AC-1 (engine part), T-AC-2 **Spec sections consumed:** §1 C1, §2 RULE-1,
RULE-2, HC-1, HC-4

**Files:** Create `packages/engine/src/floor/floor.ts`, `step.ts`, `speed.ts`; test `packages/engine/test/floor-step.test.ts`.

- [ ] **Step 1: Write the failing test `T-AC-1: a seed and a per-tick input script step to identical floors`.**
  Altitude: unit (determinism is a pure-core invariant). Negative case: one changed input at one tick changes the
  result.
- [ ] **Step 2: Run it.** Expected: FAIL (module not found).
- [ ] **Step 3: Implement C1 per spec §1 C1 and §2 RULE-1, RULE-2.** Mechanism: sprout. No Date.now, no Math.random
  (HC-1).
- [ ] **Step 4: Run T-AC-1 and T-AC-2.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): C1 the dev floor and its pure step (verifies T-AC-1, T-AC-2)`.

### Task 1.4 — C2: the hall plan (engine)

**Spec sections consumed:** §1 C2 **Files:** Create `packages/engine/src/floor/hall.ts`.

- [ ] **Step 1: Implement the hall plan per spec §1 C2**, extracted from Store.tsx's SPOT so the engine and the
  drawing share it (Store.tsx's own edit is PR-5).
- [ ] **Step 2: Commit** `feat(engine): C2 one floor plan for the store's hall`.

### Task 1.5 — T-AC-3 and C3: reach, rows 5–14

**Depends on:** Tasks 1.3, 1.4 (row 13's payout stubbed until Task 7.0's `pubPayoutFor`) **ACs verified:** T-AC-3 (rows 5–14, with 8b, 8c and row 10's swap, AM-9) **Spec sections consumed:** §1 C3, §2 RULE-3

**Files:** Create `packages/engine/src/floor/reach.ts`; test `packages/engine/test/floor-reach.test.ts`.

- [ ] **Step 1: Write the failing test `T-AC-3: Reach per RULE-3's table, one row each`** for rows 5–14 (rows 1–4,
  8a and 11a come in PR-8). Altitude: unit (a decision table). Negative case: money short → disabled, not hidden.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement C3 per spec §1 C3 and RULE-3**, calling game.ts's existing rules for money and stock
  (R-2: no money or stock math in floor/).
- [ ] **Step 4: Run T-AC-3.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): C3 the action button's reach (verifies T-AC-3)`.

### Task 1.6 — path.ts: a path over terrain cost

**Spec sections consumed:** §1 C9 seam, §2 RULE-9 **Files:** Create `packages/engine/src/floor/path.ts`; test in
`floor-step.test.ts`.

- [ ] **Step 1: Write the failing case `C9: a terrain-weighted path…`**: the path from the store to a plot avoids
  lakes and prefers plains over mountains when equally short. Altitude: unit.
- [ ] **Step 2: Implement `pathTo` per spec §1 C9 and RULE-9**; shared by the AI (PR-4) and the guide ring (PR-6).
- [ ] **Step 3: Commit** `feat(engine): a terrain-weighted path for the AI and the ring`.

### Task 1.7 — §9: the floor's boundary test

**Spec sections consumed:** §9 (enforcement: package boundary) **Files:** Test `packages/engine/test/floor-boundary.test.ts`.

- [ ] **Step 1: Write the test**: no file under `floor/` imports from `apps/` or `packages/ai`; nothing outside
  `floor/` assigns DevFloor fields. Positive control: add a forbidden import to a scratch floor file, watch it go
  red, remove it.
- [ ] **Step 2: Commit** `test(engine): the dev floor's package boundary`.

### PR-1 merge gate

- [ ] T-AC-1 (engine), T-AC-2, T-AC-3 (rows 5–14) green, named after their AC ids, tests before code in history
- [ ] `pnpm typecheck && pnpm test` exit 0; `pnpm sim` unchanged at DEV_STEER.on false (40 games identical to trunk)
- [ ] C2's pin: `apps/web/test/store-view.test.ts` B-AC-10 and T-AC-12 (the WS6 UX spec's) keep passing
- [ ] WS3 and WS6 reviewed (§9's reviewers); no new `@ts-ignore`/`eslint-disable` without a reason
- [ ] CI green; Heiko's OK via the PM for the trunk merge

## PR-2 · The frame channel (WS4)

### Task 2.1 — T-AC-4 (tabletop part) and C8

**Depends on:** S-1, WS3's answer on `ctx.frame` **ACs verified:** T-AC-4 (tabletop part) **Spec sections consumed:** §1
C8, §3 (the frame message), HC-10

**Files:** Modify `packages/tabletop/src/room.ts`, `protocol.ts`; test `packages/tabletop/test/frame.test.ts` (new).

- [ ] **Step 1: Write the failing test `T-AC-4: one frame per tick reaches every connection, dropped not queued for
  a slow one`.** Altitude: contract (the room's wire). Negative case: a full view is never queued behind a frame.
- [ ] **Step 2: Run `pnpm --filter @tabletop/core exec vitest run test/frame.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement C8 per spec §1 C8** in the shape WS3's answer and S-1 settled. Mechanism: sprout (a new
  message kind, like emote). Returns nothing to the game (HC-10).
- [ ] **Step 4: Run it, and the tabletop room tests (C8's pin).** Expected: PASS.
- [ ] **Step 5: Commit** `feat(tabletop): C8 a light frame channel (verifies T-AC-4, tabletop part)`.

### Task 2.2 — C8 (WS3's part, in this wave): the recorder and replay pass `frame` through

**Depends on:** Task 2.1 **Spec sections consumed:** §1 C8 (AM-8), HC-10 **Files:** WS3's record.ts and replay.ts
(its game record, on ws3-auctions or trunk by then), a WS3 test; WS6 reviews.

- [ ] **Step 1: Write the failing test row** "a recorded game's frames still reach a client" (altitude: contract,
  recorder to room); then pass `frame` through: to the room when recording, a no-op on replay. Run it: PASS. Commit.

### PR-2 merge gate

- [ ] T-AC-4 (tabletop part) green and named; the tabletop tests unchanged and green
- [ ] typecheck, test, CI green; WS3 reviewed; Heiko's OK via the PM

## PR-0 · The wire's types, frozen (WS3, first)

### Task 0.1 — C7: the protocol, types only

**Depends on:** — **Spec sections consumed:** §1 C7, §3 **Files:** Modify `packages/protocol/src/index.ts`.

- [ ] **Step 1: Add steer/act to MuleIntent, ColonistView v2's fields beside v1's (optional, so today's server
  sends none), MyView.reach and banners, and DevFrame per spec §3.** Types only; v1's fields stay until PR-12.
- [ ] **Step 2: `pnpm typecheck`** (C7's pin: every protocol consumer typechecks). Expected: exit 0.
- [ ] **Step 3: Commit** `feat(protocol): C7 steering in, positions out (types only)`.

### PR-0 merge gate

- [ ] typecheck, test, CI green; no runtime change (the server suite unchanged); WS6 and WS1 reviewed the shapes
  (the screens and the AI consume them); Heiko's OK via the PM

## PR-3 · The server tick (WS3)

### Task 3.2 — C15 (server part): `steerTo` in the fake context

**Spec sections consumed:** §1 C15 **Files:** Modify `apps/server/test/fake-context.ts`.

- [ ] **Step 1: Add `steerTo` beside `tapThere`** per spec §1 C15: it feeds steer intents tick by tick until the
  colonist reaches a target. Only through `ctx.schedule` (HC-9).
- [ ] **Step 2: Commit** `test(server): a steerTo helper beside tapThere`.

### Task 3.3 — T-AC-9, T-AC-4 (server part), T-AC-1 (server part): red first

**ACs verified:** T-AC-1, T-AC-4, T-AC-9 **Spec sections consumed:** §6, HC-3, HC-5, AM-3

**Files:** Test `apps/server/test/dev-steer.test.ts` (new).

- [ ] **Step 1: Write the failing tests:**
  - `T-AC-9: a seat away for the whole turn, development still ends at devEndsAt; a phone flooding steers at 100/s,
    the tick keeps its rate`, plus AM-3's month-1 case with the flag on: one seat away, the clock starts once the
    others' first MULEs are in (the rule itself is the audit build's PR, AM-6; this case pins that the tick keeps it).
  - `T-AC-4: full views only on change` (no full view on a tick where nothing changed).
  - `T-AC-1: the server's floor after a scripted turn equals stepFloor's`.
  Altitude: the server (the promise is the server's state and its sends). Traps: drive time only through the fake
  context's clock, never a real timer.
- [ ] **Step 2: Run `pnpm --filter @mule/server exec vitest run test/dev-steer.test.ts`.** Expected: FAIL.

### Task 3.4 — C6: the fixed tick, behind the flag

**Depends on:** PR-0, Tasks 3.2–3.3, PR-2 **Spec sections consumed:** §1 C6, §2 RULE-1, §4, HC-3, HC-5, HC-9, HC-10

**Files:** Create `apps/server/src/dev-steer.ts`; modify `apps/server/src/mule-game.ts` (startDevelopment, handle,
the tick, checkDevelopmentOver).

- [ ] **Step 1: Implement C6 per spec §1 C6 and RULE-1.** Mechanism: branch_by_abstraction (`DEV_STEER.on`). The
  tick runs only through `ctx.schedule` and reads only `ctx.now()` (HC-9); the frame leaves through PR-2's output
  (HC-10); each seat's inputs are buffered by `tick` and applied at their tick (RULE-10, AM-7); month 1's clock rule (AM-3, already on trunk from the audit build's own PR, AM-6) holds with the tick
  too; the per-phase log lines of §4.
- [ ] **Step 2: Run the Task 3.3 tests.** Expected: PASS. Run the whole server suite at `DEV_STEER.on = false`:
  unchanged.
- [ ] **Step 3: Commit** `feat(server): C6 development as a fixed tick, behind DEV_STEER.on (verifies T-AC-1, T-AC-4, T-AC-9)`.

### PR-3 merge gate

- [ ] T-AC-1 (server), T-AC-4, T-AC-9 green and named, tests first; the existing dev-walking tests green at the flag off
- [ ] C6's pin: `apps/server/test/dev-walking.test.ts`'s FM-one-clock and B-AC-11 rows hold at the flag off
- [ ] typecheck, test, CI green; WS1 and WS6 reviewed mule-game.ts; WS6 reviewed the protocol
- [ ] HC-9 checked by grep: no `setInterval`, `Date.now`, `performance.now` added under apps/server
- [ ] WS3's game record replays a development turn with the flag on (W-1: WS3 measures the record's size)
- [ ] Heiko's OK via the PM

## PR-4 · The AI and the sim walk the floor (WS1)

### Task 4.1 — T-AC-5 (red first)

**ACs verified:** T-AC-5 **Spec sections consumed:** §6 T-AC-5, RULE-8 **Files:** Test `packages/ai/test/play-arcade.test.ts` (new).

- [ ] **Step 1: Write the failing test `T-AC-5: in 20 seeded AI-only turns every AI colonist reaches the pub within
  50 s`.** Altitude: the sim (the promise is the AI's turn). Negative case: with botsSpareTime off, Kai misses turns
  (the glint is PR-8's, so this PR asserts the pub; PR-8 adds the glint clause).
- [ ] **Step 2: Run it.** Expected: FAIL.

### Task 4.2 — C9: the AI steers

**Depends on:** PR-1, PR-3 **Spec sections consumed:** §1 C9, RULE-8, RULE-9 **Files:** Modify
`packages/ai/src/hands/develop.ts`, `seat.ts` (developTick), `strategist.ts`, `value.ts`.

- [ ] **Step 1: Implement C9 per spec §1 C9**: the to-do list becomes steering inputs through `pathTo`; `act` when
  reach matches. Walks priced by the floor's speed, not walkSeconds, at the flag on only.
- [ ] **Step 2: Commit** `feat(ai): C9 the AI walks by the same rules`.

### Task 4.3 — C10: the sim plays the floor; T-AC-1 server = sim

**Spec sections consumed:** §1 C10, HC-4 **Files:** Modify `packages/ai/src/play.ts`, `sim.ts`; test in
`play-arcade.test.ts`.

- [ ] **Step 1: Write the failing case `T-AC-1: a seeded AI-only game ends in the same state in the sim and on the
  server`** (HC-4; the sim's twin of T-AC-27). Altitude: contract (server against sim).
- [ ] **Step 2: Implement C10 per spec §1 C10** (the report lines of §4: installs, pub times), and report spec §7
  W-2: pub reach and payout lost per seat at `floorSeconds` 3 against 2, 40 games, sent to the PM for Heiko.
- [ ] **Step 3: Run T-AC-1 and T-AC-5.** Expected: PASS.
- [ ] **Step 4: Commit** `feat(ai): C10 the sim plays the same floor (verifies T-AC-1, T-AC-5)`.

### PR-4 merge gate

- [ ] T-AC-1 (server = sim), T-AC-5 green and named; `pnpm sim` at the flag off identical to trunk
- [ ] typecheck, test, CI green; WS2 reviewed the hands, WS3 the sim; Heiko's OK via the PM

## PR-5 · The hall plan in the store, and the e2e steering step (WS4)

**After WS4's small-phone PR merges** (one writer on Store.tsx, PM ruling).

### Task 5.1 — C2: Store.tsx draws from the hall plan

**Depends on:** PR-1 **Spec sections consumed:** §1 C2 **Files:** Modify `packages/ui/src/components/Store.tsx`.

- [ ] **Step 1: Implement C2's Store.tsx side per spec §1 C2**: the plan from `floor/hall.ts`, visitors at free
  positions. Today's screens unchanged at the flag off (render gate: `#store` against the approved mock).
- [ ] **Step 2: Commit** `feat(ui): C2 the store draws the shared hall plan`.

### Task 5.2 — C15: the harness's steering step

**Depends on:** PR-3 **Spec sections consumed:** §1 C15 **Files:** Modify `apps/web/e2e/harness.ts`.

- [ ] **Step 1: Add the steering step per spec §1 C15**: it holds the phone's keys or stick toward a target until
  the frame says the colonist is there. Consumed by PR-6's B-AC steps and PR-10.
- [ ] **Step 2: Commit** `test(e2e): a steering step in the harness`.

### PR-5 merge gate

- [ ] typecheck, test, e2e (smoke, shell) green at the flag off; the store's render gate clean
- [ ] WS6 reviewed Store.tsx and the steering step; CI green; Heiko's OK via the PM

## PR-6 · The phone, the laptop and the TV (WS6)

The scaffold is binding: `design/mocks/ws6-ux/src/screens/arcade/` at ceedd23f (HC-6). The branch is based on a
commit that contains it.

### Task 6.1 — B-AC-1, B-AC-3, B-AC-4, B-AC-8: the failing browser steps

**ACs verified:** B-AC-1, B-AC-3, B-AC-4, B-AC-8 **Spec sections consumed:** §6

**Files:** Modify `apps/web/e2e/store-steps.ts` (the steps), `apps/web/e2e/shell.ts` (667×375 and 844×390).

- [ ] **Step 1: Write the failing steps:**
  - `B-AC-1`: one phone sideways, no TV, the stick and the button only: store, corral, outfit, out with the MULE,
    install on an own plot, pub; assert the server's money and the plot's outfit (front to back). Negative: a
    press with nothing in reach changes nothing.
  - `B-AC-3`: the laptop's arrow keys and SPACE, and the mouse held on a spot; the page never scrolls. Negative:
    keys with the page unfocused do nothing.
  - `B-AC-4`: at 667×375 and 844×390 nothing overflows and the controls cover 0 px² of the store, own plots and the
    target (positive control: move the stick over a plot, watch it go red).
  - `B-AC-8`: a phone drops mid-turn: its colonist stops, the turn ends on the clock, and on reconnect it steers again.
  Altitude: promise (a real browser, the server's state). The test owns its stack on free ports, never the rig.
- [ ] **Step 2: Run them at `DEV_STEER.on = true`** (the e2e sets it for its own server). Expected: FAIL.

### Task 6.2 — T-AC-10: the prediction (red first)

**Depends on:** S-2 **ACs verified:** T-AC-10 **Files:** Test `apps/web/test/arcade-predict.test.ts` (new).

- [ ] **Step 1: Write the failing test `T-AC-10: the phone's prediction stays within snapTiles of the server over a
  scripted turn at 100 ms simulated latency`**, with inputs stamped by tick (RULE-10, AM-7; S-2's harness in
  `docs/research/2026-10-29-arcade-s2-feel.md` is the reference). Altitude: unit (a pure loop the browser cannot time). Negative:
  beyond snapTiles it snaps.

### Task 6.3 — C11: steer, act, see the whole map

**Depends on:** PR-3, PR-5, Tasks 6.1–6.2 **Spec sections consumed:** §1 C11, RULE-3, RULE-9, RULE-10, S-2's values

**Files:** Create `apps/web/src/phone/arcade/**`, the new `packages/ui` pieces (Joystick, ActionButton); named edit
in `apps/web/src/phone/PhoneApp.tsx` (the development route, behind the flag; WS4 reviews).

- [ ] **Step 1: Graft the mock into C11's paths per spec §1 C11**, wiring the view, the frames and the intents.
  Mechanism: fill_scaffold. Keep the mock's data-testids. Prediction per RULE-10 with S-2's values.
- [ ] **Step 2: Run T-AC-10, then B-AC-1, B-AC-3, B-AC-4, B-AC-8.** Expected: PASS.
- [ ] **Step 3: Commit** `feat(web): C11 steer your colonist on the phone and the laptop (verifies B-AC-1, B-AC-3, B-AC-4, B-AC-8, T-AC-10)`.

### Task 6.4 — B-AC-2: the TV (red first)

**ACs verified:** B-AC-2 **Files:** Modify `apps/web/e2e/store-steps.ts`.

- [ ] **Step 1: Write the failing step `B-AC-2`**: four seats and the TV; the TV draws each colonist where the
  server has it, within one frame. Negative: an away seat's colonist stands still on the TV. Altitude: promise.

### Task 6.5 — C12 and C13: the TV draws everyone live

**Spec sections consumed:** §1 C12, C13 **Files:** Create `apps/web/src/table/TvDevelop.tsx`, the map overlay in
`packages/ui`; named edit in `apps/web/src/table/TableApp.tsx` (the development branch; WS4 reviews).

- [ ] **Step 1: Graft the mock's TV into C12's path, and C13's overlay**, per spec §1 C12, C13 (interpolation per
  RULE-10).
- [ ] **Step 2: Run B-AC-2.** Expected: PASS.
- [ ] **Step 3: Commit** `feat(web): C12 C13 the TV shows every colonist live (verifies B-AC-2)`.

### Task 6.6 — the render gate against the scaffold

- [ ] **Step 1: Run the render gate** on `#arcade-phone`, `#arcade-computer`, `#arcade-tv` against the built
  screens. Expected findings: only the mock's fixture data.

### Task 6.7 — screens.ts

**Files:** Modify `apps/web/e2e/screens.ts`.

- [ ] **Step 1: Add the arcade development screens to the screenshot run** at the flag on.
- [ ] **Step 2: Commit** `test(e2e): the arcade screens in the screenshot run`.

### Task 6.8 — G-1's goal check

- [ ] **Step 1: The PM or Heiko plays a development turn** on a phone against PR-6's head, on a server that PR's
  own command starts with `DEV_STEER.on = true` (never the :8787 rig): UBER-AC-1's loop with no menus, and the TV in
  the room. Their words go in the PR body; not from a green test run.

### PR-6 merge gate

- [ ] B-AC-1, B-AC-2, B-AC-3, B-AC-4, B-AC-8, T-AC-10 green and named, red first in history
- [ ] Front to back: each B-AC step asserts the server's state, not only the page
- [ ] The render gate clean; console errors counted over the whole run: 0
- [ ] typecheck, test, e2e (core and regression) green; WS4 reviewed the ui pieces and both route lines
- [ ] G-1's goal check recorded (Task 6.8); CI green; Heiko's OK via the PM

## PR-7 · The moments' payouts and the re-outfit in the rules (WS3)

### Task 7.0 — `pubPayoutFor`, a pure extract (builds now, merges any time before PR-1 needs it unstubbed)

**Spec sections consumed:** RULE-3 row 13, AM-9 **Files:** Modify `packages/engine/src/game.ts` (WS3's own).

- [ ] **Step 1: Extract `pubPayoutFor(state, id, secondsLeft)` from `visitPub`**, which then calls it; the rules
  tests keep passing unchanged (the pin). A case: the payout equals what visitPub paid before, at three clock values.
  Commit.

### Task 7.1 — C4 (game.ts): pelts, the glint's prize, the bolted MULE

**Depends on:** PR-1 **Spec sections consumed:** §1 C4 (the game.ts MUSTs), HC-7 **Files:** Modify
`packages/engine/src/game.ts`; test `packages/engine/test/rules-arcade.test.ts` (new).

- [ ] **Step 1: Write the failing cases**: pelts sold → money; the glint's prize → stock or money per GLINT.prize;
  a bolted MULE leads again only once caught. Altitude: unit (game rules). Negative: a refused action throws
  RuleError (HC-7).
- [ ] **Step 2: Implement per spec §1 C4.** Run them. Expected: PASS.
- [ ] **Step 3: Commit** `feat(engine): C4 the moments' payouts in the rules`.

### Task 7.2 — AM-2: take a MULE off a plot, re-outfit it

**Spec sections consumed:** AM-2, RULE-3 rows 8a and 11a **Files:** Modify `packages/engine/src/game.ts`; test in
`rules-arcade.test.ts`.

- [ ] **Step 1: Write the failing cases**: TAKE leaves the plot making nothing; RE-OUTFIT charges
  `DEV_STEER.reoutfitCost`; same-good is refused; the clock's end returns a taken MULE to its plot with its old
  outfit. Altitude: unit.
- [ ] **Step 2: Implement per AM-2.** Run them. Expected: PASS.
- [ ] **Step 3: Commit** `feat(engine): take a MULE off a plot and re-outfit it at the store`.

### PR-7 merge gate

- [ ] Its cases green, tests first; `pnpm sim` at the flag off identical to trunk (nothing calls the new rules yet)
- [ ] C4's pin: `packages/engine/test/rules.test.ts` T-AC-23 and `mule-game.test.ts` keep passing
- [ ] typecheck, test, CI green; WS1 reviewed; Heiko's OK via the PM

## PR-8 · The moments on the floor, and the AI in them (WS1)

### Task 8.1 — T-AC-6, T-AC-7, T-AC-8 (red first)

**ACs verified:** T-AC-6, T-AC-7, T-AC-8 **Spec sections consumed:** §2 RULE-4, RULE-5, RULE-6 **Files:** Test
`packages/engine/test/floor-moments.test.ts` (new).

- [ ] **Step 1: Write the failing tests:**
  - `T-AC-6: the rookie wins about 1 in 4 over 60 seeded fights; a forest run escapes about 13 of 20` (engine
    headless).
  - `T-AC-7: glint timing per RULE-5` (none in the first 6 s, 8 s shown, the first onto it wins; negative: a
    non-racing colonist on the tile wins too).
  - `T-AC-8: the scramble per RULE-6, the beats in order, the last sale's single line`.
  Altitude: unit (seeded pure steps). Traps: assert ranges over the 60 seeds (T-AC-6), never one seed's outcome.

### Task 8.2 — C4 (floor) and C3 rows 1–4: the moments

**Depends on:** PR-4, PR-7 **Spec sections consumed:** §1 C4, C3, RULE-3 rows 1–4, RULE-4–6, RULE-8 **Files:**
Create `packages/engine/src/floor/{wolves,glint,scramble}.ts`; modify `floor/reach.ts`, `config.ts`.

- [ ] **Step 1: Implement per spec §1 C4 and RULE-4–6**, calling PR-7's rules for every payout (R-2).
- [ ] **Step 2: Run T-AC-6, T-AC-7, T-AC-8 and T-AC-3 (rows 1–4).** Expected: PASS.
- [ ] **Step 3: Commit** `feat(engine): C4 wolves, the glint and the scramble (verifies T-AC-6, T-AC-7, T-AC-8)`.

### Task 8.3 — C9: the AI in the moments; T-AC-5's glint clause

**Files:** Modify `packages/ai/src/hands/develop.ts`; `packages/ai/test/play-arcade.test.ts`.

- [ ] **Step 1: Add T-AC-5's clause** "a bot races in most glints" (negative: botsSpareTime off, Kai misses turns),
  red first; implement the AI's fight/run/race per spec §1 C9 and RULE-8; run T-AC-5. Expected: PASS.
- [ ] **Step 2: Commit** `feat(ai): C9 the AI plays the moments (verifies T-AC-5)`.

### Task 8.4 — AM-2: the sweep, then rows 8a and 11a

**Spec sections consumed:** AM-2, AM-5

- [ ] **Step 1: Run `pnpm sim --set DEV_STEER.reoutfitCost=…`** over 40 games with the AI allowed to re-outfit;
  report money and production per seat. Send the PM the numbers for Heiko before building the rows.
- [ ] **Step 2: On the PM's word, add T-AC-3 rows 8a and 11a** red first, then the reach rows calling PR-7's take
  and re-outfit; run T-AC-3. Expected: PASS.
- [ ] **Step 3: Commit** `feat(engine): the re-outfit rows in the action button's reach (verifies T-AC-3 rows 8a, 11a)`.

### PR-8 merge gate

- [ ] T-AC-3 (all rows), T-AC-5, T-AC-6, T-AC-7, T-AC-8 green and named; AM-2's sweep sent and ruled
- [ ] `pnpm sim` at the flag off identical to trunk; typecheck, test, CI green; WS3 and WS6 reviewed; Heiko's OK via the PM

## PR-9 · The moments on the phones and the TV (WS6)

### Task 9.1 — B-AC-5, B-AC-6, B-AC-7 (red first)

**ACs verified:** B-AC-5, B-AC-6, B-AC-7 **Files:** Modify `apps/web/e2e/store-steps.ts`.

- [ ] **Step 1: Write the failing steps** (wolves forced by a seeded test option):
  - `B-AC-5`: run or fight; RULE-4's outcomes land: bitten and slowed, got away, pelts sold, or the MULE bolted and
    caught. Negative: no wolves in the hall.
  - `B-AC-6`: a glint shows on every phone and the TV at once; the first onto it gets the prize (server stock).
    Negative: after showSeconds it fades and nobody gets it.
  - `B-AC-7`: 3 MULEs left and 4 seats needing one: the TV and phones call the scramble; the one left out is told,
    with the pub's payout. Negative: no call when no seat needs a MULE.
  Altitude: promise (phones, TV, the server's state).

### Task 9.2 — C11, C12, C13: the moments' layers

**Depends on:** PR-6, PR-8 **Spec sections consumed:** §1 C11 (the moments' layers MUST), C12, C13

- [ ] **Step 1: Graft the mock's WolfLayer, GlintLayer and ScrambleLayer** into the phone and the TV, each covering
  0 px² of the store, own plots and the controls (B-AC-4's measurement extended).
- [ ] **Step 2: Run B-AC-4, B-AC-5, B-AC-6, B-AC-7.** Expected: PASS.
- [ ] **Step 3: Commit** `feat(web): the moments on the phones and the TV (verifies B-AC-5, B-AC-6, B-AC-7)`.

### Task 9.3 — G-3's goal check

- [ ] **Step 1: The PM or Heiko plays a turn with the moments on**, as Task 6.8, and records UBER-AC-3's clause:
  the TV shows a wolf encounter and a glint race with an AI in each.

### PR-9 merge gate

- [ ] B-AC-5, B-AC-6, B-AC-7 green and named, red first; front to back; console errors over the whole run: 0
- [ ] typecheck, test, e2e green; WS4 reviewed; G-3's goal check recorded; CI green; Heiko's OK via the PM

## PR-10 · Every test that walks, walks by steering (C15, one PR per owner)

Each owner moves its own tests to their steering twins (spec §1 C15's migration table); each test keeps its
promise. WS4's part first (harness.ts is shared), then the others at once.

- [ ] **Task 10.1 (WS4): smoke.ts, table-steps.ts, zoom.ts** steer instead of tapping, at the flag on. Run
  `pnpm --filter @mule/web build && pnpm --filter @mule/web exec tsx e2e/smoke.ts`: exit 0. Commit.
- [ ] **Task 10.2 (WS3): the server tests that walk** (`apps/server/test/dev-walking.test.ts` and the C15 list) and
  `apps/web/e2e/auction-steps.ts::goToThePub` steer through `steerTo`. Run the server suite and auction-steps: exit
  0. Commit.
- [ ] **Task 10.3 (WS1): `packages/ai/test/play-walk.test.ts`, `balance.test.ts`** on the floor; T-AC-27 becomes
  the floor's server = sim parity (spec §1 C10's pin). Run `pnpm --filter @mule/ai test`: exit 0. Commit.
- [ ] **Task 10.4 (WS6): `store-steps.ts`'s existing store ACs, `screens.ts`, `shell.ts`** steer. Run shell and
  smoke: exit 0. Commit.
- [ ] **Task 10.5 (WS5): `specials.ts`, `special-steps.ts`** steer where they walk. Run specials: exit 0. Commit.

### PR-10 merge gate (each owner's PR)

- [ ] Every moved test green at the flag on and at the flag off; positive control per owner: break the steering
  helper's arrival, watch one moved test go red, restore
- [ ] typecheck, test, e2e green; the reviewer named in §9 reviewed; CI green; Heiko's OK via the PM

## PR-11 · The switch (WS1, on Heiko's OK)

- [ ] **Task 11.1: Heiko plays the :8787 rig built from trunk with `DEV_STEER.on`** (the PM arranges it, after PR-1
  to PR-10 are on trunk and green): UBER-AC-1, UBER-AC-2, UBER-AC-3 checked by a person. His words go in the PR body.
- [ ] **Task 11.2: On his OK, set `DEV_STEER.on = true`** in `packages/engine/src/config.ts`. Run `pnpm typecheck &&
  pnpm test`, the e2e and `pnpm sim`: exit 0. Commit `feat(engine): arcade walking on`.

### PR-11 merge gate

- [ ] Heiko's OK on the rig recorded; typecheck, test, e2e, sim, CI green; the PM merges with Heiko's OK

## PR-12 · Tap-to-walk removed (C14)

### Task 12.1 — C14: remove the tap walk

**Depends on:** PR-11 **Spec sections consumed:** §1 C14 (pins), §5 (the point of no return)

- [ ] **Step 1 (WS6):** remove `apps/web/src/phone/Develop.tsx` (a named edit, WS4 reviewing), `next-step.ts`,
  `apps/web/test/next-step.test.ts`, and `store-view.test.ts`'s tap cases.
- [ ] **Step 2 (WS1):** remove `packages/engine/src/dev-walk.ts` and `DEV_STEER.on`'s other branch.
- [ ] **Step 3 (WS3):** remove `apps/server/src/dev-walking.ts`, the flag's other branch in mule-game.ts, and
  ColonistView v1's `at`, `walk`, `assayUntil`.
- [ ] **Step 4: Run `pnpm typecheck && pnpm test`, the e2e and `pnpm sim`.** Expected: exit 0; C14's pins (the
  steering twins of PR-10) green. Commit `refactor: C14 tap-to-walk removed`.

### PR-12 merge gate

- [ ] C14's pins green; no import of the removed files left (`git grep dev-walk dev-walking next-step Develop.tsx`
  over apps and packages: none outside history)
- [ ] typecheck, test, e2e, sim, CI green; WS1, WS3, WS4 reviewed their parts; Heiko's OK via the PM

## Execution ledger

| PR | GitHub | Owner | HEAD | State (2026-10-29) |
|---|---|---|---|---|
| PR-0 · the wire's types | #176 | WS3 | `5a7fb2c7` | WS6 OK at 5a7fb2c7 (typecheck 0). **Merged at ddb14a0** |
| S-2 · steering feel | — | WS6 | — | **Done** (`docs/research/2026-10-29-arcade-s2-feel.md`): Heiko "tested phone sterring ok", the hall "3 is fine". Spec AM-7: `steer` carries its `tick`, the server buffers inputs by tick; `floorSeconds` 3. AM-8: the frame goes through WS3's recorder and replay |
| PR-1 · the dev floor | — | WS1 | — | **In build**, with AM-9's rulings applied (every outfit; 8b works by bay; 8c the Green belt; row 10 SWAP; rows 11 ANALYSE, 12 FIT FILTER, 11a TAKE; `pubPayoutFor`; start positions outside the store doors). WS6 reviews on its SHA |

## Risk-mitigation milestones (spec §7)

- **R-1 (the rate limit):** T-AC-9's flood case in PR-3, Task 3.3.
- **R-2 (two copies of the rules):** the floor calls game.ts (Tasks 1.5, 8.2); the boundary test (Task 1.7); every
  floor PR's reviewer checks no money or stock math in floor/.
- **R-3 (Develop.tsx's owner):** closed by the PM's ruling (spec AM-4); PR-12's Step 1.
- **R-4 (SEAMS.md off trunk):** the owner ruling is recorded in the spec's §9 and AM-4.
- **W-1 (the record's size):** PR-3's merge gate.

## Main merges (Heiko's OK each, through the PM)

Every PR merges into trunk on its own, behind the flag. Heiko plays at PR-6 (G-1, G-2), at PR-9 (G-3) and at PR-11
(the switch).

## Pre-implementation checklist

- [ ] Spec approved by Heiko ("Yes, build it", via the PM, 29 Oct); the owner ruling in AM-4
- [ ] AM-3's month-1 clock built on today's walk by its own WS3 PR in the audit build split (AM-6), with WS1's sim
      numbers first
- [ ] WS3's answer on `ctx.frame`; S-1 and S-2 recorded
- [ ] WS4's small-phone PR merged before PR-5 (one writer on Store.tsx)
- [ ] Branch policy confirmed by the PM: each PR from trunk, into trunk, behind the flag
- [ ] Base `feat/strategist` @ `6d30b699` green, measured at ws6-ux's sync 1fe50df0: `pnpm typecheck` exit 0 ·
      `pnpm test` and e2e: CI's run on trunk (not re-run locally) — each owner re-measures at its sub-branch's base
- [ ] Effort: 12 PRs over six waves, plus two half-day spikes
