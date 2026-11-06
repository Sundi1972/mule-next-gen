# Plot info Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Standard (spec header: Heiko, 5 Nov)

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 [spec §0] scan and see at once | every player in planning | the drone's 60 cr buy an answer that same planning | UBER-AC-1 | **PR-1** (wave 1: PR-1a, PR-1b, PR-1c, batched together) |
| G-2 [spec §0] always see my plots | every player choosing MULEs | the turn's MULEs planned in seconds | UBER-AC-2 | PR-2 |
| G-3 [spec §0] read geology at a glance; specials stand out | every player who paid for geology | geology turns into a decision without arithmetic | UBER-AC-3 | **PR-1** (PR-1a: one 0–3 scale on every screen, C6); the gem in PR-3a (wave 2), the Analyse card in PR-3b |

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- Ratings for other players or the TV: geology stays private (HC-1).
- New production numbers. Heiko's rule 4: the 0–3 scale is the screen's first; the hidden numbers move to 0–3 only if WS1's simulator says they hold, as their own piece.
- New ways to learn ratings beyond the drone and Analyse; a geologist anywhere but on the plot (Heiko's rule 3).
- How the computer players choose plots, beyond getting the drone's results earlier (C1).
- One-tap chat phrases mid-phase (PM backlog, 5 Nov).

**Thin baseline (spec §0.1):** A, the same without My plots · ≈2 PRs · lost because it lists no plots, so UBER-AC-2 fails
(checkable in `tools.tsx::LookPanel`, `arcade/parts.tsx::PlotsLegend`; re-checked on trunk e4e78193: still true).
→ **PR-1 relationship:** the reason is true, so PR-1 is the shortest slice through B that delivers G-1: the dots (C6),
the drone at Scan (C1) and the report (C2). It is also A's first PR; A's second (C5, C7, C8) is this plan's PR-3.

**Constraints:** spec §0.2 HC-1 … HC-4 travel with every task (HC-1 privacy is fatal; HC-2 no production numbers).

**Architecture:** one shared dots module in @mule/ui (`ground-dots.ts`) turns a rating into 0–3 for every screen and
the map; the engine lands the drone's ground at the intent, so the existing private `TileView.ground` carries it and
every screen (report, My plots, map) follows from the view. No new contract (spec §3).

**Tech Stack:** TypeScript monorepo (pnpm): `packages/engine`, `packages/ui` (React, Tailwind tokens), `apps/web`
(phone and TV screens, vitest, Playwright e2e that own their server), `packages/ai` (WS2's action text).

**Inputs:**
- Spec: `docs/specs/2026-11-05-ws6-plot-info.md` (PR #397, approved by Heiko 6 Nov; §8 amended at plan time, f210bd03)
- Binding mock: `design/mocks/plot-info/` at a3f8e3e3, landing on trunk in #505 (every PR with a `ux` block branches from a commit containing it)
- Sections present and consumed: §0, §0.1, §0.2, §1 (C1–C8), §2 (RULE-1..4), §6 (B-AC-1..3, T-AC-1..4), §7 (R-1, R-2), §8, §9
- Sections declared N/A by the spec, with its stated reason: §3 (no contract shape changes; ground arrives earlier), §4 (no external dependency), §5 (code only; a drone ordered before the deploy still lands at the land grant)
- N/A claims I checked: §3 — `TileView.ground`, `MyView.droneOrder`, `droneFound` unchanged in the plan's tasks: holds. §5 — no migration: holds.
- Drift check on trunk e4e78193 (spec §8, 6 Nov): every anchor exists; nothing built yet (`ground-dots.ts`, `groundDots` absent); `groundPips` reaches `components/AuctionParts.tsx` through `GroundCard` (no edit there); `llm/moves-stub.ts` is on trunk; C7's pip moves into PR-1.

---

## PR decomposition

**Integration:** each PR targets `feat/strategist`; the PM batches. Wave 1's three PRs merge in one batch (C1's atomicity
with WS2's text, and C2's need of C1's data).

| PR | Sub-branch | Owner | Scope (tasks / changes) | ACs verified | Contracts produced | Contracts consumed | Frontend touched? |
|----|------------|-------|-------------------------|--------------|--------------------|--------------------|-------------------|
| PR-0 | `ws6-plot-info-mock` (#505) | WS6 | the binding mock on trunk | — | — | — | mock only |
| PR-1a | `ws6-plot-dots` | WS6 (+ WS4 named edits) | Tasks 1.1–1.4 (C6, C7's pip half) | T-AC-2, T-AC-3 (pip part) | `@mule/ui` ground-dots exports | — | Yes |
| PR-1b | `ws3-drone-at-scan` | WS3 (+ WS2 named edits) | Task 1.5 (C1) | T-AC-1 | — | — | No |
| PR-1c | `ws6-drone-report` | WS6 | Tasks 1.6–1.8 (C2) | B-AC-1 | — | ground-dots, C1's view | Yes |
| PR-2 | `ws6-my-plots` | WS6 | Tasks 2.1–2.4 (C3, C4) | B-AC-2 | `plotInfo.tsx::PlotRow` | ground-dots | Yes |
| PR-3a | `ws4-plot-gem` | WS4 | Task 3.1 (C7's gem) | T-AC-3 (gem part) | — | ground-dots `gemsIn` | Yes |
| PR-3b | `ws6-analyse-card` | WS6 | Tasks 3.2–3.5 (C5, C8) | B-AC-3, T-AC-4 | — | ground-dots, PR-3a's gem | Yes |

### Waves and why each is safe

- **Wave 1 (PR-1a ∥ PR-1b, then PR-1c):** PR-1a and PR-1b touch disjoint files (ui/web dots vs engine/ai). PR-1c stacks on both.
- **Wave 2 (PR-2 ∥ PR-3a):** PR-2 is phone files only; PR-3a is `HoloMap.tsx` and its test only. Disjoint.
- **Wave 3 (PR-3b):** after PR-2 (shares `arcade/parts.tsx`, `tools.tsx`) and PR-3a (B-AC-3 asserts the gem).
- No freeze point: no dependency is marked stubbable for the e2e (spec C2). No migration slot (spec §5).

### By-whens (Z, from 6 Nov 12:45Z; the PM routes and may move them)

| PR | Owner | Ready for review by |
|----|-------|---------------------|
| PR-0 #505 | WS6 | done (mock only) |
| PR-1a | WS6, WS4 OK on HoloMap.tsx + index.ts | 6 Nov 16:00Z |
| PR-1b | WS3, WS2 OK on actions.ts + moves-stub.ts; WS1 sim before merge | 6 Nov 16:00Z |
| PR-1c | WS6 | 6 Nov 19:00Z (batch wave 1 with 1a and 1b) |
| PR-2 | WS6 | 7 Nov 01:00Z |
| PR-3a | WS4 | 7 Nov 01:00Z (after PR-1a lands) |
| PR-3b | WS6 | 7 Nov 06:00Z |

### Per-PR authority

Every handoff carries, verbatim:

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

| PR | may_edit | may_edit_content (approved mock) | must_not_edit |
|----|----------|----------------------------------|---------------|
| PR-1a | `packages/ui/src/ground-dots.ts` (new), `apps/web/src/game/derive.ts`, `phone/ground.tsx`, `phone/LandGrant.tsx`, `arcade/plots.ts`, `arcade/parts.tsx` (PlotCard's dots only), their tests; named: `packages/ui/src/index.ts` (one line), `HoloMap.tsx` `Pips` and the `MapTile.ground` doc (WS4) | — | `HoloMap.tsx` beyond Pips (the gem is PR-3a's); engine (PR-1b's) |
| PR-1b | `packages/engine/src/game.ts` (`orderGeoDrone`, the land-grant block), `types.ts` comments, engine tests; named: `packages/ai/src/actions.ts`, `packages/ai/src/llm/moves-stub.ts` (WS2) | — | every `apps/web` and `packages/ui` file (PR-1a/1c) |
| PR-1c | `apps/web/src/phone/plotInfo.tsx` (new), `phone/hub/tools.tsx` (drone tool), `phone/hub/today.tsx` (drone tile line), their tests, `e2e/specials.ts` / a new `e2e/plot-info-steps.ts` | `design/mocks/plot-info` `#scan-a` composition | `ground-dots.ts` (PR-1a's, consumed); engine |
| PR-2 | `phone/plotInfo.tsx` (PlotRow), `phone/hub/tools.tsx` (My plots tool), `phone/hub/today.tsx` (its slot), `arcade/Develop.tsx` (status chip), `arcade/parts.tsx` (PlotsLegend), `arcade/layout.ts` if the chip needs room, tests, e2e | `#plots`, `#dev-plots`, `#store` | `HoloMap.tsx` (PR-3a's in this wave) |
| PR-3a | `packages/ui/src/components/HoloMap.tsx` (the gem), `apps/web/test/holo-map.test.ts` | `#gem` (MapMarks) | every phone file (PR-2's in this wave) |
| PR-3b | `arcade/parts.tsx` (AnalyseCard), `arcade/Develop.tsx` (its layer), `phone/plotInfo.tsx`, `phone/hub/tools.tsx` (LookPanel order), tests, e2e | `#analyse` | `HoloMap.tsx` (PR-3a's, landed) |

### Contention

| path | touched by | resolution |
|---|---|---|
| `packages/ui/src/components/HoloMap.tsx` | PR-1a (Pips), PR-3a (gem) | **serialised** (wave 1, then wave 2) |
| `apps/web/src/phone/hub/tools.tsx` | PR-1c, PR-2, PR-3b | **serialised** (waves 1, 2, 3) |
| `apps/web/src/phone/hub/today.tsx` | PR-1c, PR-2 | **serialised** |
| `apps/web/src/phone/plotInfo.tsx` | PR-1c (creates), PR-2, PR-3b | **serialised** |
| `apps/web/src/phone/arcade/parts.tsx` | PR-1a (PlotCard's dots), PR-2 (PlotsLegend), PR-3b (AnalyseCard) | **serialised** |
| `apps/web/src/phone/arcade/Develop.tsx` | PR-2, PR-3b | **serialised** |

---

## Wave 1 · G-1

### Task 1.1: C6 — RULE-1 and RULE-2 as one shared module (PR-1a)

**Depends on:** none · **ACs verified:** T-AC-2 · **Spec:** §1 C6, §2 RULE-1, RULE-2

**Files:** Create `packages/ui/src/ground-dots.ts` (source: the mock's `src/proposed/dots.ts`); Modify `packages/ui/src/index.ts` (one export line, as `events` is; WS4 named edit); Test `packages/ui/test/ground-dots.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-2: RULE-1, every row, as 0–3 dots`**
  Altitude: unit (a pure decision table with seven rows and two good kinds, R1). Every row of RULE-1, its five examples,
  and the unknown case (no ground → no dots, never 0). In the same file, RULE-2's `bestOf` (Food first on a tie) and
  `gemsIn` (Crystite or Rare earth at 1 or more), with RULE-2's two examples.
- [ ] **Step 2: Run it to verify it fails:** `cd packages/ui && npx vitest run test/ground-dots.test.ts` → FAIL, module not found.
- [ ] **Step 3: Implement C6's module per spec §1 C6 and §2 RULE-1, RULE-2** — `groundDots`, `dotsOf`, `bestOf`, `gemsIn`, exported from `@mule/ui`. Plan-drift: none.
- [ ] **Step 4: Run it to verify it passes** (same command) → PASS; then `pnpm --filter @mule/ui typecheck` → exit 0. The AM-17 guard (`packages/ui/test/engine-imports.test.ts`) passes: the module imports only `Good` types, or the guard names the import for WS6's ruling.
- [ ] **Step 5: Commit** `feat(ui): C6 ground-dots, one 0–3 scale (verifies T-AC-2)`.

### Task 1.2: C6 — every caller reads dots (PR-1a)

**Depends on:** Task 1.1 · **ACs verified:** pins (R-2) · **Spec:** §1 C6 call sites, §7 R-2, §8 (6 Nov)

**Files:** Modify `apps/web/src/game/derive.ts` (`groundPips` removed; `mapTiles` passes dots in `MapTile.ground`), `apps/web/src/phone/ground.tsx` (`GroundCard`, 3 dots), `apps/web/src/phone/LandGrant.tsx` (`droneFoundLine`), `apps/web/src/phone/arcade/plots.ts` (`bestHere`, `suits`, `fit`), `apps/web/src/phone/arcade/parts.tsx` (PlotCard's dots); Tests `apps/web/test/derive.test.ts`, `drone-words.test.ts`, `colony-plots.test.ts`, the arcade-screens and land-grant tests that count dots.

- [ ] **Step 1: Change the pinned counts first (R-2), red:** every test that reads dots asserts the 0–3 count (from /4 to /3) and its "of 3" words; `arcade/plots.ts`'s `suits` keeps "3 or more" (RULE-1 maps the same plots). Run `cd apps/web && npx vitest run` → the changed assertions FAIL on the 0–4 code.
- [ ] **Step 2: Implement C6's call sites per spec §1 C6** (mechanism extract: `derive.ts::groundPips` → `@mule/ui`'s `groundDots`). The land auction's lot card follows `GroundCard` with no edit to `AuctionParts.tsx` (spec §8). Plan-drift: grep `groundPips` → 0 hits after the change.
- [ ] **Step 3: Run** `cd apps/web && npx vitest run` → all green; `pnpm typecheck` → exit 0.
- [ ] **Step 4: Commit** `feat(web): C6 every screen draws 0–3 dots (R-2 counts changed, named)`.

### Task 1.3: C7 (pip half) — the map's pip draws 3 (PR-1a, WS4 named edit)

**Depends on:** Task 1.2 · **ACs verified:** T-AC-3 (pip part) · **Spec:** §1 C7 (tomorrow, the pip), §2 RULE-2 (best), §8 (6 Nov, C7 splits)

**Files:** Modify `packages/ui/src/components/HoloMap.tsx` (`Pips`, the label, `MapTile.ground` doc "0 to 3"); Test `apps/web/test/holo-map.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-3 (pip): an analysed tile draws its best good's 3-dot pip, labelled "of 3"; a tile without ground draws none`**
  Altitude: promise at the rendered map (`renderToStaticMarkup(HoloMap)`); the pip's good comes from `bestOf` (a Food/Water tie gives Food). Negative: the TV's tiles (no ground) draw no pip.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run test/holo-map.test.ts` → FAIL ("of 4").
- [ ] **Step 3: Implement C7's pip per spec §1 C7** — `Pips` draws 3; its good from `bestOf`. Plan-drift: the gem is NOT in this task (PR-3a).
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(ui): C7 the map's pip draws 0–3 from bestOf (verifies T-AC-3 pip; WS4 named edit)`.

### Task 1.4: PR-1a merge gate

- [ ] T-AC-2 and T-AC-3 (pip) green, test-first in history; `pnpm typecheck && pnpm test` green; `node docs/rulebook/build-index.mjs` after the rulebook's 0–3 lines (the scale's chapter) flip from Designed to built; WS4's OK on `index.ts` and `HoloMap.tsx` SHAs via the PM; one independent review once CI is green (`Review: APPROVE at <sha>`).

### Task 1.5: C1 — the drone's ground lands at Scan (PR-1b, WS3; WS2 named edits)

**Depends on:** none · **ACs verified:** T-AC-1 · **Spec:** §1 C1, §2 RULE-4, §7 R-1

**Files:** Modify `packages/engine/src/game.ts` (`orderGeoDrone`; `advancePhase`, the `next === 'landGrant'` block), `packages/engine/src/types.ts` (the `droneOrder` and `droneFound` comments); Test `packages/engine/test/drone-found.test.ts`; WS2 named edits `packages/ai/src/actions.ts::DESCRIBED` (the drone line), `packages/ai/src/llm/moves-stub.ts` (the drone line).

- [ ] **Step 1: Write the failing test `T-AC-1: the drone adds its plots to analysed and droneFound at once, charges once, refuses a second order until the land grant clears droneOrder`**
  Altitude: unit on the engine state (the engine is pure). Negative: an owned unlisted plot is refused with today's words. Pin: the land grant no longer adds to `analysed` or sets `droneFound`, only clears `droneOrder`.
- [ ] **Step 2: Run** `cd packages/engine && npx vitest run test/drone-found.test.ts` → FAIL (analysed empty until the land grant).
- [ ] **Step 3: Implement C1 per spec §1 C1 and §2 RULE-4.** HC-3: fee and plot count from `DEVELOPMENT`. WS2's text says the ground is known at once, in the same PR (atomicity).
- [ ] **Step 4: Run** `pnpm --filter @mule/engine test` and `pnpm --filter @mule/ai test` → green; `apps/web/test/drone-words.test.ts` still finds `droneFound` while a drone plot is lit (spec pin).
- [ ] **Step 5: R-1:** WS1 runs `pnpm sim` on both seed sets at PR-1b's head; the result is byte-identical to trunk (WS1's 5 Nov read). Recorded in the PR body before merge.
- [ ] **Step 6: Commit** `feat(engine): C1 the drone's ground lands at Scan (verifies T-AC-1; WS2 text in the same PR)`.

### Task 1.6: C2 — the browser step first (PR-1c)

**Depends on:** PR-1a, PR-1b (data, not stubbable for the e2e) · **ACs verified:** B-AC-1 · **Spec:** §1 C2, §6 B-AC-1

**Files:** Create `apps/web/e2e/plot-info-steps.ts` (wired into `e2e/smoke.ts` as the other steps are)

- [ ] **Step 1: Write the failing browser step `B-AC-1 (plot info): two free plots picked, Scan, the rail's Drone report shows both with each good's 0–3 dots and "best for", 60 cr gone, before Ready`**
  Altitude: promise, front to back: the phone's `scan-report` in a real browser, and the server's view for that seat holding both plots' ground. Negative: the TV's view and the other seats' views hold no ground for those plots (HC-1); a second Scan this planning is refused. Within 2 s. The smoke owns its server (listen(0)); never the rig.
- [ ] **Step 2: Run** `cd apps/web && npx vite build && npx tsx e2e/smoke.ts` → FAIL at B-AC-1 (no `scan-report`). Keep the full log; never pipe the exit code.

### Task 1.7: C2 — Scan and the report (PR-1c)

**Depends on:** Task 1.6 · **Spec:** §1 C2, §2 RULE-1, RULE-2 · **ux:** `design/mocks/plot-info#scan-a`, states pick, scanning, report

**Files:** Create `apps/web/src/phone/plotInfo.tsx` (ScanReport, GoodDots, Dots, Gem, OnlyYou, grafted from the mock's `proposed/PlotInfo.tsx`); Modify `apps/web/src/phone/hub/tools.tsx` (`DroneSend` "Scan · n of 2 plots · 60 cr", `DronePanel`, `useDrone`), `apps/web/src/phone/hub/today.tsx` (`HUB_SLOTS` drone tile: "used this month"); Tests `apps/web/test/drone-words.test.ts` (the button and tile words), a new `apps/web/test/scan-report.test.ts` only for the report derived from the view (rejoin shows the same report).

- [ ] **Step 1: Implement C2 per spec §1 C2**, grafting `#scan-a` (fill_scaffold: replace `DRONE_PICKS`, `GROUND` fixtures with the view). The report derives from `droneOrder` + the tiles' ground (spec "senior does"), not client state. The scanning second keeps today's SCAN chip (`MapTile.flag 'survey'`). Plan-drift: none.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run` → green, including the specials pin (`e2e/specials.ts` B-AC-9's drone rail line) and the "Pick n more" hint.
- [ ] **Step 3: Run the smoke** (Task 1.6's command) → `e2e smoke: ok`, B-AC-1 printed.
- [ ] **Step 4: Commit** `feat(web): C2 Scan and the Drone report in the rail (verifies B-AC-1)`.

### Task 1.8: Wave 1 merge gate (PR-1c, and the batch)

- [ ] B-AC-1, T-AC-1, T-AC-2, T-AC-3 (pip) green, each test-first; `pnpm typecheck && pnpm test` green; smoke green at the batch head; rulebook: the drone's Designed entry flips to built, `node docs/rulebook/build-index.mjs`; R-1's sim result in PR-1b; one independent review per PR once CI is green; the PM batches PR-1a, PR-1b, PR-1c together. Then Heiko's table check of UBER-AC-1, through the PM.

---

## Wave 2 · G-2 (and G-3's gem in parallel)

### Task 2.1: C3/C4 — the browser step first (PR-2)

**Depends on:** wave 1 landed · **ACs verified:** B-AC-2 · **Spec:** §6 B-AC-2

- [ ] **Step 1: Write the failing browser step `B-AC-2 (plot info): My plots in planning and the Plots chip on the walking screen list every owned plot once, analysed ones with 0–3 dots and the gem, others "Not analysed …"`** in `apps/web/e2e/plot-info-steps.ts`. Altitude: promise, the rows (`plot-row-x-y`) in a real browser against the view's owned tiles. Negative: another player's plot is never listed.
- [ ] **Step 2: Run the smoke** → FAIL at B-AC-2.

### Task 2.2: C3 — My plots, a planning tool (PR-2)

**Depends on:** Task 2.1 · **Spec:** §1 C3 · **ux:** `#plots`

**Files:** Modify `apps/web/src/phone/plotInfo.tsx` (PlotRow, dense), `apps/web/src/phone/hub/tools.tsx` (MyPlotsMap, MyPlotsPanel), `apps/web/src/phone/hub/today.tsx` (`HUB_SLOTS`, the new tool)

- [ ] **Step 1: Implement C3 per spec §1 C3** (sprout), grafting `#plots`. Tapping a row selects the plot; tapping your plot on the map selects its row. Unanalysed: HC-4's hint words per the mock.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run` → green. **Step 3: Commit** `feat(web): C3 My plots in planning`.

### Task 2.3: C4 — the Plots chip and the store's box with dots (PR-2)

**Depends on:** Task 2.2 · **Spec:** §1 C4 · **ux:** `#dev-plots`, `#store`

**Files:** Modify `apps/web/src/phone/arcade/Develop.tsx` (the status: `phone-status-right`), `apps/web/src/phone/arcade/parts.tsx` (`PlotsLegend`), `apps/web/src/phone/arcade/layout.ts` if the chip needs room; Test `apps/web/test/arcade-screens.test.ts` (the hall's 844 and 667 fits, the pin)

- [ ] **Step 1: Implement C4 per spec §1 C4**: the chip opens C3's list over the map's right side; the colonist keeps its place and the clock runs. PlotsLegend rows carry dots; "+n more · Plots ▸ shows all".
- [ ] **Step 2: Run** `cd apps/web && npx vitest run` → green, the hall's fits held (pin); `npx tsx e2e/small-phone.ts` → ok (the walking status at 667). **Step 3: Run the smoke** → B-AC-2 printed. **Step 4: Commit** `feat(web): C4 Plots on the walking screen and dots in the store (verifies B-AC-2)`.

### Task 2.4: PR-2 merge gate

- [ ] B-AC-2 green, test-first; `pnpm typecheck && pnpm test`, smoke and small-phone green; rulebook (My plots) Designed → built, index rebuilt; one independent review once CI is green. Then Heiko's table check of UBER-AC-2.

### Task 3.1: C7 (gem half) — the gem on the map (PR-3a, WS4, parallel with PR-2)

**Depends on:** PR-1a landed (`gemsIn`, dots in `MapTile.ground`) · **ACs verified:** T-AC-3 (gem part) · **Spec:** §1 C7, §2 RULE-2 · **ux:** `#gem`

**Files:** Modify `packages/ui/src/components/HoloMap.tsx`; Test `apps/web/test/holo-map.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-3 (gem): a tile with ground and Crystite or Rare earth at 1 or more draws its gem(s), right of the owner's tab on an owned plot, at left 4% on a free one; with a MULE the gem stays and the pip hides; a tile without ground (the TV) draws none`**. Altitude: the rendered map.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run test/holo-map.test.ts` → FAIL.
- [ ] **Step 3: Implement C7's gem per spec §1 C7** (positions and sizes as the spec and `#gem` give them).
- [ ] **Step 4: Run** → PASS; `pnpm test` green. **Step 5: Commit** `feat(ui): C7 the gem (verifies T-AC-3 gem)`. WS6 checks it against `#gem` (fidelity) before merge.

---

## Wave 3 · G-3

### Task 3.2: C5 — RULE-3 as a pure function (PR-3b)

**Depends on:** PR-2, PR-3a landed · **ACs verified:** T-AC-4 · **Spec:** §2 RULE-3

**Files:** Create the function beside `arcade/parts.tsx`'s card (name is the implementer's); Test `apps/web/test/analyse-card.test.ts`

- [ ] **Step 1: Write the failing test `T-AC-4: RULE-3 over two views, every row`** — not development → no card; a drone plot → no card; the first view since load (rejoin) → no card; otherwise a card, a newer replacing it. Altitude: unit (R1, a per-view decision table).
- [ ] **Step 2: Run** `cd apps/web && npx vitest run test/analyse-card.test.ts` → FAIL. **Step 3: Implement RULE-3.** **Step 4: Run** → PASS. **Step 5: Commit** `feat(web): RULE-3 when the Analyse card shows (verifies T-AC-4)`.

### Task 3.3: C5 — the browser step first (PR-3b)

- [ ] **Step 1: Write the failing browser step `B-AC-3 (plot info): analysing a free plot holding Crystite shows the card with its dots and "best for … · Crystite n" within 1 s of the assay's end, and the map's Crystite gem on it`** in `apps/web/e2e/plot-info-steps.ts` (a seeded plot with Crystite, as `e2e/specials.ts` seeds specials). Negative: the TV's map and another phone show no gem and no dots for it (HC-1).
- [ ] **Step 2: Run the smoke** → FAIL at B-AC-3.

### Task 3.4: C5 and C8 — the Analyse card; Look shows the dots first (PR-3b)

**Spec:** §1 C5, §1 C8 · **ux:** `#analyse`

**Files:** Modify `apps/web/src/phone/arcade/parts.tsx` (AnalyseCard, reusing `plotInfo.tsx`'s GoodDots), `apps/web/src/phone/arcade/Develop.tsx` (its layer beside PlotCard), `apps/web/src/phone/hub/tools.tsx` (`LookPanel`: the ground card right after land and owner)

- [ ] **Step 1: Implement C5 per spec §1 C5** (6 s, one at a time, a tap closes it, ONLY YOU) **and C8 per spec §1 C8**.
- [ ] **Step 2: Run** `cd apps/web && npx vitest run` → green; the smoke → B-AC-3 printed. **Step 3: Commit** `feat(web): C5 Analyse says what it found; C8 Look shows the dots first (verifies B-AC-3)`.

### Task 3.5: PR-3b merge gate

- [ ] B-AC-3 and T-AC-4 green, test-first; `pnpm typecheck && pnpm test`, smoke green; rulebook (Analyse card, gem, 0–3) Designed → built, index rebuilt; open-designs entries dropped by hand (PM named edit); one independent review once CI is green. Then Heiko's table check of UBER-AC-3 (five testers), through the PM.

---

## Pre-implementation checklist

- [x] Spec approved by the user (Heiko, 6 Nov, "Approved: build it"); §8 plan-time amendments recorded (f210bd03)
- [ ] Upstream: #505 (the mock) on trunk before PR-1c and PR-2 branch
- [x] Branch policy: every PR targets `feat/strategist`; the PM batches; wave 1 in one batch
- [x] Base `feat/strategist` @ e4e78193 green: CI check · e2e · e2e-regression · sim all success (gh check-runs, 6 Nov 12:41Z); each PR re-runs the pre-flight on its own base
- [x] Repo access confirmed (WS6 pushes; WS3, WS4, WS2 own their named edits)
- [x] No spikes (spec §7)
- [ ] By-whens sent to the PM for routing (table above)
