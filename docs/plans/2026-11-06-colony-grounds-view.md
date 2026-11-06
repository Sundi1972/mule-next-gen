# The colony grounds view (direction C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use swisper-superpowers:subagent-driven-development (recommended) or swisper-superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec class:** Programme (PM ruling, 6 Nov).

## Goals — lifted from spec §0. Reference, do not restate.

| Goal | Who benefits | Value delivered | Proof | First delivered in |
|------|--------------|-----------------|-------|--------------------|
| G-1 [spec §0] | the players at the table; Heiko | read the colony's state from the grounds picture | UBER-AC-1 | **PR-1** |
| G-2 [spec §0] | Heiko; the players | the grounds at city-builder polish on any phone and TV | UBER-AC-2 | **PR-1** |

**Non-goals (spec §0), lifted verbatim. A task serving one is cut:**
- Live 3D on the TV (react-three-fiber): later, from the same models — its own spec when Heiko asks.
- Any rule, number or data change: slots, stages, gauges are C48/RULE-32 and ColonyView as they are.
- Weather from events, seasons, a camera the player moves: later, each its own small spec.
- Paid assets: none (Heiko, 6 Nov). Buildings and the rocket are our own Blender builds, dressed with props from the
  free KitBash3D Mission to Minerva kit (AM-5); NASA models only as a reference.
- The town hall growing with prestige: needs a rule (tiers) from WS7; until then the hall has one picture.

**Thin baseline (spec §0.1):** WS6's SVG `Scene` with pictures for standing buildings only · ≈ 1 PR · fails UBER-AC-2
(no stage pictures) and G-1 (no lit/dim) — true: `Scene.tsx`'s `art` prop replaces only `standing` (read at plan time).
→ **PR-1 relationship:** the baseline lost for a true reason; PR-1 is the shortest slice through approach 1 that
delivers G-1 and G-2 at the table: the TV month end shows the real pictures at their slots, every stage, with fallback.

**Constraints:** spec §0.2 HC-1 … HC-5 travel with every task.

**Architecture:** WS10 renders every building × stage in Blender to WebP plus a manifest
(`apps/web/public/art/colony/`). `@mule/ui`'s new `ColonyGrounds` draws one SVG: the painted ground, the pictures by
slot in painter's order, a live layer over them. Screens mount it with one line each (WS4 TV, WS7 phone).

**Tech Stack:** Blender 5.2 + Cycles (scripts in `design/art/colony/`), `cwebp`, React 19 + SVG, a Web Worker for the
ground, vitest with `renderToStaticMarkup` (packages/ui, apps/web), Playwright for the browser test.

**Inputs:**
- Spec: `docs/specs/2026-11-06-colony-grounds-view-design.md` @ ab7b027d
- Sections present and consumed: §0, §0.1, §0.2, §1 (C1–C8), §2 (RULE-1–5), §3, §4, §6, §7, §9
- Declared N/A: §5 Delivery ("Code-only; no existing state to reach") — checked: pictures are static files, no stored
  state; true. §8 empty.
- Freeze point: C6, now `ColonyProjectView.place: {x,y,w,h} | null` (spec §3, AM-3) — stubbable; WS7's engine PR lands it.
- Amendments since the plan was written: AM-1 tall frame, AM-2 footprints, AM-3 place, AM-4 no next-place outline, AM-5 KitBash3D for the Hospital.

## PR decomposition

**Feature branch:** `ws10-visual` (WS10's lane branch; PRs into it, the PM batches it to `feat/strategist`).

| PR | Sub-branch | Scope | ACs verified | Contracts produced | Contracts consumed | Frontend? |
|----|------------|-------|--------------|--------------------|--------------------|-----------|
| PR-1 | `ws10-grounds-pr1` (code, PR #542) + art commits on `ws10-visual` | Tasks 1.1–1.7 (C1 Park + hall + Hospital, C2, C7) | B-AC-1, B-AC-4 (for its kinds), T-AC-1, T-AC-2 (its kinds), T-AC-5 (TV) | manifest.json | ColonyProjectView.place (C6, WS7 engine PR) | Yes |
| PR-2 | `ws10-grounds-pr2` | Tasks 2.1–2.4 (C4, C8) | B-AC-2, B-AC-3, B-AC-5, T-AC-3, T-AC-4, T-AC-5 (phone) | — | manifest.json, place | Yes |
| PR-3 | `ws10-grounds-pr3` | Tasks 3.1–3.3 (C1 remaining kinds) | B-AC-4, T-AC-2 (all kinds) | — | manifest.json | No (static art) |
| PR-4 | `ws10-grounds-pr4` | Tasks 4.1–4.3 (C3) | — (look; §4 worker row) | — | — | Yes |
| PR-5 | `ws10-grounds-pr5` | Tasks 5.1–5.5 (C5, C7, C9; AM-6) | T-AC-7, T-AC-8, T-AC-9, B-AC-6 | — | — | Yes |
| WS7 | its engine PR | C6 | T-AC-6 | ColonyProjectView.place | — | No |

### Per-PR authority

| PR | may_edit | may_edit_content | must_not_edit |
|----|----------|------------------|---------------|
| PR-1 | `packages/ui/src/grounds/**`, `packages/ui/test/grounds-*.test.tsx`, `apps/web/public/art/colony/**`, `design/art/colony/**`, one export line in `packages/ui/src/index.ts` | `design/mocks/colony-grounds/src/Scene.tsx`, `layout.ts` (the approved scaffold: graft, don't redesign) | `apps/web/src/table/TableApp.tsx` (WS4: the mount is a named edit, WS4's OK), `packages/protocol/**`, `apps/server/**` (C6 is WS7's), `packages/ui/src/terrain/**` (HC-4) |
| PR-2 | `packages/ui/src/grounds/**`, its tests | `design/mocks/colony-grounds/src/look/Living.tsx` (scaffold) | `apps/web/src/phone/hub/politics/Colony.tsx` (WS7: named edit, WS7's OK), `packages/ui/src/terrain/**` |
| PR-3 | `design/art/colony/**`, `apps/web/public/art/colony/**` | — | `packages/ui/**` |
| PR-4 | `packages/ui/src/grounds/ground*.ts` | — | `packages/ui/src/terrain/**` (import only) |
| PR-5 | `packages/ui/src/grounds/**` (useGroundsChange.ts, opener.ts, GroundsOpener.tsx, ColonyGrounds.tsx), their tests, `apps/web/test/colony-screens.test.ts`, `apps/web/e2e/` (its own test file) | `design/mocks/colony-grounds/tv-beat.html` + `src/look/Living.tsx` (scaffold) | `apps/web/src/table/TableApp.tsx` beyond TvGame's upkeep route, and `apps/web/src/components/Colony.tsx` beyond useMonthEndDrift (WS4: both named edits, WS4's OK); `TvMonthEnd` itself (must stay unchanged); `packages/protocol/**`, `apps/server/**` |

> Naming, internal structure, helper decomposition and test fixtures are yours. Everything else in your payload is specified. If you need to change anything outside it — including because it appears impossible — stop and report to the lead with the element id and the goal it fails. Do not deviate: you can see one task, and the lead can see the whole graph.

### Contention

| path | touched by | resolution |
|---|---|---|
| `packages/ui/src/grounds/ColonyGrounds.tsx` | PR-1, PR-2, PR-4, PR-5 | **serialised**: PR-1 → PR-2 → PR-4 → PR-5, each on the previous |
| `apps/web/public/art/colony/manifest.json` | PR-1, PR-3 | **serialised**: PR-3 after PR-1; the manifest is generated by `design/art/colony/publish.sh`, never hand-edited |

### Waves

- **Wave 1:** PR-1. Safe alone. Consumes C6 as a fixture until WS7's PR lands (freeze point: the §3 shape).
- **Wave 2:** PR-2 and PR-3 together. Disjoint paths: PR-3 touches only art files plus the generated manifest, and PR-2 only `grounds/` code.
- **Wave 3:** PR-4, then PR-5 (they share `ColonyGrounds.tsx`).
- After wave 1, the PM asks Heiko about a `main` merge: G-1 and G-2 are first delivered there.

## File structure

```
design/art/colony/lib/frame.py, light.py, kits.py   camera 1600×1600 (centre 800,1000), day/dusk/glow passes, site/scaffold/closed/damage kits
design/art/colony/<kind>.py                          one per kind + hall: build(stage)
design/art/colony/publish.sh                         renders → WebP 800/400 → manifest.json
apps/web/public/art/colony/<kind>/<stage>-<light>@<w>.webp, manifest.json
packages/ui/src/grounds/ColonyGrounds.tsx            C2: the SVG, painter's order, chips, next place
packages/ui/src/grounds/pick.ts                      RULE-1 (pure)
packages/ui/src/grounds/fallback.tsx                 the mock's SVG shapes per kind + stage (HC-3)
packages/ui/src/grounds/LiveLayer.tsx, live.ts       C4, RULE-2/RULE-3 (pure in live.ts)
packages/ui/src/grounds/ground.ts, ground.worker.ts  C3
packages/ui/src/grounds/useGroundsChange.ts          C5, RULE-5
packages/ui/test/grounds-*.test.tsx                  vitest, renderToStaticMarkup
```

---

## PR-1 — the TV month end shows the colony's real pictures (C1 part, C2, C7)

### Task 1.1: C1 — the shared Blender lib, and the Park, Hospital and hall pictures

**Depends on:** none. **ACs:** T-AC-2 for park, hospital, hall. **Spec:** §1 C1, §3 manifest, ART-DIRECTION §2–§8.
**Files:** create `design/art/colony/lib/*.py`, `design/art/colony/{park,hospital,hall}.py`,
`design/art/colony/publish.sh`, `apps/web/public/art/colony/**`.

- [ ] **Step 1:** Lift camera, light and kits from `design/art/colony/spike-park/{park.py,colony.py}` into `lib/`. Use the frame from ART-DIRECTION §2: 1600×1600, centre (800, 1000), via `shift_y`.
- [ ] **Step 2:** For each of park, hospital and hall, render every RULE-1 stage (hall: one picture) × day/dusk, plus a glow pass (emission alone, on black). Run `blender -b -P design/art/colony/park.py -- <out> 256` and look at every PNG before you go on: the spike's lesson is that booleans and smoke fail silently.
- [ ] **Step 3:** `publish.sh` writes the WebP files at 800 and 400 px and `manifest.json` per spec §3. Run `design/art/colony/publish.sh`. Expected: the manifest lists park, hospital and hall with every stage and light, and every file exists.
- [ ] **Step 4:** Commit: `feat(C1): colony art lib + Park, Hospital, hall pictures and manifest`.

**Status (cb717373): partial.** `lib/` (core, frame, light, kits), the per-kind scripts (park, hall, hospital, observatory,
stadium, spaceport, ring), `publish.sh` and `park-spec.json` are in. Shipped: Park (site, build1, standing, closed,
damaged; closed has glow null) and hall (tier1): 17 pictures, 34 WebP, 0.55 MB, ≤ 57 kB at 800, plus the manifest.
Frame centre measured at exactly (800, 1000). Open:
- The Hospital is **not shipped**: it is redone with KitBash3D kits (Task 1.6). Its 14 first renders stay in the
  gitignored `design/art/colony/out/hospital/`.
- The per-kind frame code is untested until a 2×2 kind renders (Task 1.7, PR-3).
- Look fixes queued: Park damaged (the root ball reads as a boulder, the fallen tree is weak, the scorch barely
  shows); Park closed (the gates read as glass); the hall's glow (110 W washes the slab orange).

### Task 1.2: T-AC-2 (kinds so far) — every manifest entry has its file

**Altitude:** contract (the manifest is the C1 → C2 contract). **Observed at:** `manifest.json` plus the files on disk.
**Negative:** delete one WebP and the test names it. **Files:** `packages/ui/test/grounds-manifest.test.ts`.

Ready now: cb717373's manifest declares park and hall.

- [ ] **Step 1:** Write `T-AC-2: every manifest picture exists` for the kinds the manifest declares. Then positive-control it: delete one file, watch it go red, restore.
- [ ] **Step 2:** `pnpm --filter @mule/ui test -- grounds-manifest` → PASS. Commit: `test(T-AC-2): manifest pictures exist`.

### Task 1.3: T-AC-1 — RULE-1 picks the right picture

**Altitude:** unit (a pure picker with 6 rows; the boundary test in 1.5 covers the promise). **Spec:** §2 RULE-1 and its examples.
**Files:** `packages/ui/test/grounds-pick.test.ts`, `packages/ui/src/grounds/pick.ts`.

- [ ] **Step 1:** Write `T-AC-1: RULE-1 row <n>`, one case per row, using RULE-1's examples. Run it: FAIL (module missing).
- [ ] **Step 2:** Implement RULE-1 in `pick.ts`. Run: PASS. Commit: `feat(C2): RULE-1 picture picker (verifies T-AC-1)`.

### Task 1.4: C2 — ColonyGrounds

**Depends on:** 1.1, 1.3; C6 as a fixture. **Spec:** §1 C2, §2 RULE-4, HC-1, HC-3.

**Status: Tasks 1.3 and 1.4 done** on `ws10-grounds-pr1`: 45cf42c6 → 5241a452 (fix round) → 72f9f93f (review fixes).
`Review: APPROVE at 72f9f93f572d3bdd973102b1b710fa543236ee77`; @mule/ui 187/187, typecheck 0. PR #542 into `ws10-visual`.

Plan-drift corrections (as built):
- The input is a structural subset of ColonyView with an optional `place {x,y,w,h}`, not `slot` (AM-3); `@mule/ui`
  cannot import `@mule/protocol` without a new dependency.
- Kinds use `@mule/ui`'s `ObjectKind`; the engine-imports test (AM-17) forbids `PrestigeId` in ui.
- Position: col = x − 2, row = y − 2 (RULE-32b: x right, y down; the hall at (2,2)). A 2×2 sits on its block's centre.
- New props `manifest` and `light` (default day). Manifest paths are relative to `/art/colony/`; the hall uses
  `pictures.hall.standing`.
- No next-place outline (AM-4). The fallback uses the diorama look.

**Files:** `packages/ui/src/grounds/ColonyGrounds.tsx`, `fallback.tsx`, an export line in `packages/ui/src/index.ts`; scaffold `design/mocks/colony-grounds/src/Scene.tsx` + `layout.ts`.

- [ ] **Step 1:** Write `B-AC-1: month-12 colony shows each stage's picture at its slot` in `packages/ui/test/grounds-render.test.tsx`. Altitude: promise, at the rendered markup (`renderToStaticMarkup`), asserting each `<image href>` and its slot position and chip. The negative case: a commissioned project shows `site`. Use a `ColonyView` fixture with `slot` set (C6 shape). Run it: FAIL.
- [ ] **Step 2:** Write `B-AC-4: a missing picture falls back to the SVG shape` with a manifest stub that lacks one entry. Run it: FAIL.
- [ ] **Step 3:** Graft C2 from the scaffold. Keep the mock's painter's order, `extentOf` (by highest slot, RULE-4), chips and next place. Pictures sit at `ART_FRAME` positions (frame from the manifest). The fallback is the mock's `Building`/`Site`/`Scaffold` shapes. Run: both PASS. Commit: `feat(C2): ColonyGrounds draws the colony's pictures by slot (verifies B-AC-1, B-AC-4)`.

### Task 1.5: C7 — the TV month end mounts the grounds (named edit, WS4)

**Depends on:** 1.4; **waits for WS7's engine PR that puts `place` on ColonyProjectView** (C6, AM-3). **ACs:** B-AC-1 at the TV, T-AC-5 (TV).
**Files:** modify `apps/web/src/table/TableApp.tsx::TvMonthEnd` (one mount line beside `BuildSite`); test `apps/web/test/colony-screens.test.ts` (extend; it already parses `build-site`).

- [ ] **Step 1:** Extend `colony-screens.test.ts` with `B-AC-1 (TV): the month end shows colony-grounds` and `T-AC-5: politics off, no colony-grounds`. Run: FAIL.
- [ ] **Step 2:** Add the mount line. Run: PASS. Commit: `feat(C7): TV month end shows the colony grounds (verifies B-AC-1, T-AC-5)`. Send the SHA to the PM to get WS4's OK on the named edit.
- [ ] **Step 3:** Implement C7's planning mount: in `TableApp.tsx::TvGame` the planning screen gains the colony panel beside the map, as in the mock's `index.html` "TV · planning" (`design/mocks/colony-grounds/src/screens.tsx::TvPlanning`, `may_edit_content`). Extend `colony-screens.test.ts` with `B-AC-1 (TV planning): planning shows colony-grounds, politics on`. FAIL → implement → PASS. Commit. This is a layout change in WS4's file, so send the SHA to the PM for WS4's OK.
- [ ] **Step 4:** Browser test (front to back), also covering review findings: a picture that fails to load shows the SVG shape (B-AC-4's negative case: block one `/art/colony/` URL in the test) and its glow goes with it; the pictures sit in back-to-front order in the DOM; with reduced motion emulated the walkers do not move (PR-2 review at b12f388c: no DOM in @mule/ui tests).
  Original step: browser test (front to back): in `apps/web/e2e/` the test command starts its own stack, plays to the first month end with a Park commissioned and funded, and asserts `[data-testid=colony-grounds] image[href*="park/"]` is visible. It never targets the integration rig.

### Task 1.6: the Hospital, polished, with kit props (AM-5)

**Depends on:** none for the polish; the kit folder path from the PM for the props. **ACs:** T-AC-2 for hospital.
- [ ] Polish our own `design/art/colony/hospital.py` (massing, glass, crosses, ambulance bay) at the shared camera,
  frame and light (ART-DIRECTION §2–§3). Render every RULE-1 stage, look at each one, run `publish.sh`; T-AC-2 covers
  it from the manifest. Commit.
- [ ] Kit props (rooftop dishes, a helipad, scaffolding for build1, rubble for damaged) from Mission to Minerva, loaded
  from outside the repo. Licence confirmed by Heiko, 7 Nov: kit-dressed pictures ship via Task 3.4's flag.

### Task 1.7: the colony ring re-render for Heiko's look review

**Depends on:** none (look only, nothing shipped). Feeds PR-3's Stadium and Spaceport.
- [ ] Re-render `design/art/colony/ring.py` with the 2×2 Stadium and Spaceport and the 37.2 m rocket on its 29 m
  gantry (only a low-spp test so far). Check the 2×2 frame anchor. Put it on the look page; the PM asks Heiko.

### PR-1 merge gate

- [ ] B-AC-1, B-AC-4, T-AC-1, T-AC-2 (its kinds) and T-AC-5 (TV) are green and named after their AC ids; each failing test was committed before its implementation.
- [ ] The manifest contract (C1 → C2) is exercised by the consumer: the T-AC-2 and B-AC-4 tests read the real manifest.
- [ ] The browser test from Task 1.5 is green on a stack the test command owned.
- [ ] `pnpm typecheck && pnpm test` exit 0. No new `@ts-ignore`.
- [ ] Rulebook `colony-and-politics.html#colony-grounds-look` reads "Being built", then "In the game" once the PR merges to trunk; `node docs/rulebook/build-index.mjs` re-run.
- [ ] Heiko's look round on the three kinds at TV size (the PM asks). Spec §7: the look needs his eye.
- [ ] `Review: APPROVE at <sha>` on its own line, from an independent reviewer (code PR rule).

---

## PR-2 — the colony lives: lights by wealth, colonists by mood, the phone (C4, C8)

### Task 2.1: T-AC-3 / T-AC-4 — RULE-2 and RULE-3

**Altitude:** unit (pure formulas). **Files:** `packages/ui/test/grounds-live.test.ts`, `packages/ui/src/grounds/live.ts`.
- [ ] Write `T-AC-3` from RULE-2's examples and `T-AC-4` from RULE-3's examples. Run: FAIL. Implement `live.ts`. Run: PASS. Commit: `feat(C4): glow and walkers rules (verifies T-AC-3, T-AC-4)`.

### Task 2.2: C4 — LiveLayer

**Spec:** §1 C4. **Scaffold:** `design/mocks/colony-grounds/src/look/Living.tsx`. **Files:** `packages/ui/src/grounds/LiveLayer.tsx`, wired into `ColonyGrounds`.
- [ ] Write `B-AC-2: lights dim to full by wealth; closed stays dark; none by day` and `B-AC-3: a strike empties the paths`, at the rendered SVG (glow `<image>` opacity; walker count). Run: FAIL. Implement. Respect `useEventReducedMotion` from `@mule/ui`. Run: PASS. Commit.

### Task 2.2b: C4 — smoke over a damaged building, haze by air

**Plan gap found at PR-2 build:** spec C4 lists smoke and haze; Tasks 2.1–2.2 built glow and walkers only.
**Scaffold:** `Living.tsx` (smoke). **Files:** `packages/ui/src/grounds/LiveLayer.tsx`.
- [ ] Test first at the rendered SVG: smoke drawn over a `damaged` place only; haze opacity rises as `gauges.environment` worsens, none at a clean colony; reduced motion → still. Then implement. Commit.

Built in 2.1–2.2 (ws10-grounds-pr2 @ b12f388c): RULE-2 glow on every stage by its factor (the hall counts as standing), RULE-3 walkers along the gaps between places, a paid strike counts as over (G-5 RULE-26), null mood → 0 walkers.

### Task 2.3: C8 — the phone colony desk mounts the grounds (named edit, WS7)

**Files:** `apps/web/src/phone/hub/politics/Colony.tsx::ColonyWithFacts` (one line above `ColonyDeskCard`); test: extend `apps/web/test/politics-desks.test.ts`.
- [ ] Implement C8 test-first: write `T-AC-5 (phone): colony-grounds is shown politics on, absent politics off`. Run: FAIL. Add the line. Run: PASS. Commit, and send the SHA to the PM for WS7's OK.

### Task 2.4: B-AC-5 — ≤ 1 MB of art on a phone

**Altitude:** promise, in the browser. **Observed at:** the browser test's network log at 390×844 on a month-12 fixture game.
- [ ] Write `B-AC-5: ≤ 1 MB of art on a phone`: a Playwright test that sums `image` responses under `/art/colony/`. It must be ≤ 1 MB, and it uses the 400 px pictures. Run: PASS. Commit.

### PR-2 merge gate

Same lines as PR-1, for B-AC-2, B-AC-3, B-AC-5, T-AC-3, T-AC-4 and T-AC-5 (phone), plus WS7's OK on C8's SHA.

---

## PR-3 — every building, every stage (C1, the remaining kinds)

### Task 3.1: Observatory, Stadium, Spaceport through `lib/`

- [ ] For each kind, write `design/art/colony/<kind>.py` with `build(stage)` covering every RULE-1 stage (build2 for the 3-month kinds). Render, then look at every picture. Run `publish.sh`. Commit per kind.

### Task 3.1b: review nits for the large kinds (PR-1 review at 5241a452)

- [ ] Allow the viewBox headroom for AM-1's tall frame, and place each chip above the picture's footprint height for 2×2 and tall kinds (Spaceport). Test: B-AC-1 with a 2×2 Spaceport at (0,0); the frame top is inside the viewBox and the chip is above the rocket.

### Task 3.2: T-AC-2 across the whole catalogue

- [ ] Extend `grounds-manifest.test.ts` to `T-AC-2: every kind in config.ts::PRESTIGE plus hall × every stage × day/dusk has a picture`, iterating `PRESTIGE` from `@mule/engine` so a new kind fails the test. Run: PASS. Commit.

### Task 3.3: Look round

- [ ] Publish a page from `design/mocks/colony-grounds/look.html` showing all six kinds × stages at TV size. The PM asks Heiko. Record his verdict in the PR body.

### Task 3.4: kit-dressed twins, behind one flag (AM-5 addendum)

**Depends on:** the kit hook (`lib/props.py`, `KITS_DIR`). **ACs:** T-AC-2 on the kit manifest (local run).
- [ ] Each kind script dresses every stage with kit props where they fit at our scale (site/build/damaged gear,
  Spaceport apron, Park and edge plants, hall dressing); renders with `KITS_DIR` set go to `out/kit/` (gitignored).
- [ ] `publish.sh` takes `SRC` (default `out`) and `PUB` (default `apps/web/public/art/colony`). Preview:
  `SRC=out/kit PUB=out/kit-pub publish.sh`; the look page's catalogue switches to it. Ship: `SRC=out/kit publish.sh`,
  then T-AC-2, commit. **Cleared: licence confirmed by Heiko, 7 Nov (AM-5)** — ship each kind once its kit set is
  looked at.
- [ ] Raw kit files never committed or published; only our WebP.

### PR-3 merge gate

- [ ] T-AC-2 across the whole catalogue is green. Heiko's look round is recorded. No code changes (`git diff --stat -- packages apps/web/src` is empty).

---

## PR-4 — the ground, painted the map's way (C3)

### Task 4.1: C3 — ground painter

**Spec:** §1 C3, HC-4, §4 worker row. **Files:** `packages/ui/src/grounds/ground.ts`, `ground.worker.ts`; reuse `packages/ui/src/terrain/noise.ts` and `picture-cache.ts::PictureCache` by import.
- [ ] Implement C3: port the painter from `design/art/colony/spike-park/procedural/park.ts` (lawn, gravel, setts, room-to-grow ground, skirt fade) and use the ART-DIRECTION sun. Paint off the main thread, cached.

### Task 4.2: §4 — the worker is unavailable

- [ ] Write `grounds ground: no Worker → painted once on the main thread; until then the flat ground`. Altitude: unit; the boundary can't remove Worker. Run: FAIL. Implement. Run: PASS. Commit.

### Task 4.3: Wire it into ColonyGrounds and run a look round

- [ ] Mount the painted ground under the pictures. Check the look page at TV and phone sizes. The PM asks Heiko.

### PR-4 merge gate

- [ ] The §4 test is green. `git diff -- packages/ui/src/terrain` is empty (HC-4). The look round is recorded. Typecheck and tests exit 0. Review: APPROVE.

---

## PR-5 — the month-end grounds opener on the TV (C5, C7, C9; spec AM-6)

**Branch:** `ws10-grounds-pr5` off `ws10-visual` once PR-2 (#603) is in. **Scaffold:** `design/mocks/colony-grounds/tv-beat.html`
(the full-screen canvas, header, caption) + `src/look/Living.tsx` (the lean-in). **Named edits:** `TableApp.tsx::TvGame`'s
upkeep route and `components/Colony.tsx::useMonthEndDrift` (WS4's OK by SHA). WS4 measures TV-FIT ≥ 0.7, six seats.

### Task 5.1: T-AC-7 — RULE-5

**Altitude:** unit (hook logic over two views). **Files:** `packages/ui/test/grounds-change.test.ts`, `packages/ui/src/grounds/useGroundsChange.ts`.
- [ ] Implement C5's change detection test-first: write `T-AC-7: a stage change between month ends leans in on that place; a first view leans in on none`. Run: FAIL. Implement. Run: PASS. Commit.

### Task 5.2: T-AC-8 — RULE-6

**Altitude:** unit (pure: change found? reduced motion? politics? → full / still / none, and its length). **Files:** `packages/ui/test/grounds-opener.test.ts`, `packages/ui/src/grounds/opener.ts`.
- [ ] Write `T-AC-8: <example>` per RULE-6 example. FAIL → implement → PASS. Commit.

### Task 5.3: C5 — the opener

**Files:** `packages/ui/src/grounds/GroundsOpener.tsx` (full-screen ColonyGrounds at dusk + header + caption from RULE-5's changes, the lean-in from `Living.tsx`, reduced motion → still).
- [ ] Test at the rendered markup: a changed month carries the caption naming the change and `data-leaning`; a quiet month renders the still with no lean. FAIL → implement → PASS. Commit.

### Task 5.4: C7 + C9 — on the TV (named edits, WS4)

**Files:** `apps/web/src/table/TableApp.tsx::TvGame` (upkeep route: event show → opener → TvMonthEnd), `apps/web/src/components/Colony.tsx::useMonthEndDrift`; tests in `apps/web/test/colony-screens.test.ts`.
- [ ] `T-AC-9: the gauges' count starts when TvMonthEnd mounts`. FAIL → C9 → PASS. Commit.
- [ ] `T-AC-5`: politics off, no opener. Then route the opener; TvMonthEnd unchanged (`git diff` of TvMonthEnd empty). Commit. Send both SHAs to the PM for WS4's OK.

### Task 5.5: B-AC-6 — browser test (front to back)

- [ ] In `apps/web/e2e/`, the test command owns its stack: at the month end after the Park comes to stand, the TV shows `tv-grounds-opener` after the event show, then `tv-monthend`; everyone Ready during the opener → planning at once; reduced motion → the still. Also Task 1.5 Step 4's checks (failed picture → shape and its glow gone; back-to-front order). TV-FIT ≥ 0.7 at six seats on the opener and the month end (`theTvScalesHeld`).

### PR-5 merge gate

- [ ] T-AC-7, T-AC-8, T-AC-9, T-AC-5 and B-AC-6 green and named. WS4's OK on the two named edits by SHA; WS4's TV-FIT measure ≥ 0.7. Typecheck and tests exit 0. Review: APPROVE. Rulebook: WS6's "Designed, not in the game yet, WS10" lines (table-and-phones month end, events "Who waits") moved to built.

---

<!-- plan-check: no-task C48 T-AC-6 — C48 is WS7's G-5 change (this spec builds its ux); C6/T-AC-6 land in WS7's grounds PR by the PM's ruling (option a), consumed here as a freeze point -->

## Pre-implementation checklist

- [x] §0 confirmed by the PM (design authority), 6 Nov. The spec's self-review is the gate (Heiko's standing rule). No changes open.
- [ ] Upstream: C6, now `ColonyProjectView.place` (AM-3), in WS7's engine PR. PR-1's Task 1.5 waits for it; Tasks 1.1–1.4 do not.
- [x] Branch policy: sub-PRs into `ws10-visual`; the PM batches `ws10-visual` into `feat/strategist`; `main` only with Heiko's OK.
- [x] Base `ws10-visual` @ `07dd3c37`→`fcbbad50` (design/ and docs/ only between them) green, measured 6 Nov ≈14:55Z: `pnpm typecheck` 0 · `pnpm test` 0 — engine 674 ✓ (1 skip) · ui 168 ✓ · web 994 ✓ · ai 601 ✓ (11 skip) · server 577 ✓ (91 skip)
- [x] Access: Blender 5.2.3 installed; `cwebp` at /opt/homebrew/bin; no paid assets.
- [x] Spikes: the Park three ways and the colony ring (`design/art/colony/spike-park/NOTES.md`).
- [ ] Effort sent to the PM: art ≈ 2–4 agent-days including look rounds; code PR-1 ≈ 1 day, PR-2 ≈ 1 day, PR-4 ≈ 1 day, PR-5 ≈ ½ day.
