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
| PR-4 | `ws10-grounds-pr4` | Tasks 4.1–4.4 (C1, C2, C3; AM-7) | T-AC-2 (plate) | — | — | Yes |
| PR-5 | `ws10-grounds-pr5` | Tasks 5.1–5.5 (C5, C7, C9; AM-6) | T-AC-7, T-AC-8, T-AC-9, B-AC-6 | — | — | Yes |
| WS7 | its engine PR | C6 | T-AC-6 | ColonyProjectView.place | — | No |

### Per-PR authority

| PR | may_edit | may_edit_content | must_not_edit |
|----|----------|------------------|---------------|
| PR-1 | `packages/ui/src/grounds/**`, `packages/ui/test/grounds-*.test.tsx`, `apps/web/public/art/colony/**`, `design/art/colony/**`, one export line in `packages/ui/src/index.ts` | `design/mocks/colony-grounds/src/Scene.tsx`, `layout.ts` (the approved scaffold: graft, don't redesign) | `apps/web/src/table/TableApp.tsx` (WS4: the mount is a named edit, WS4's OK), `packages/protocol/**`, `apps/server/**` (C6 is WS7's), `packages/ui/src/terrain/**` (HC-4) |
| PR-2 | `packages/ui/src/grounds/**`, its tests | `design/mocks/colony-grounds/src/look/Living.tsx` (scaffold) | `apps/web/src/phone/hub/politics/Colony.tsx` (WS7: named edit, WS7's OK), `packages/ui/src/terrain/**` |
| PR-3 | `design/art/colony/**`, `apps/web/public/art/colony/**` | — | `packages/ui/**` |
| PR-4 | `packages/ui/src/grounds/**`, its tests, `design/art/colony/**`, `apps/web/public/art/colony/**` | `design/mocks/colony-grounds/tv-beat.html` (scaffold) | `packages/ui/src/terrain/**`, `apps/**/src` (no screen changes in PR-4) |
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

**Status: MERGED** (#546, bff3c7b8). Its first run caught the hall keyed `tier1` instead of `standing`; fixed in 4204d80c.

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
**MERGED** (#542, cd837426).

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

**SUPERSEDED by AM-6 — moved to PR-5 (the opener).** The TV side panels (month end and planning) were built, then
removed after WS4's TV-FIT measure (planning 0.662, month end 0.593, floor 0.7; reproduced 0.593 locally); removal
fec2bab9 by PM ruling. `TableApp.tsx` carries no change from this task. Steps below are kept for history only.

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

### Task 2.2c: T-AC-13 — a colonist behind a building is hidden by it, with a faint outline (C4; Heiko, 8 Nov)

**Altitude:** the live layer's rendered markup. **Files:** `packages/ui/test/grounds-occlusion.test.tsx`, `packages/ui/src/grounds/occlusion.ts` (hiddenBy, occluderOf), `LiveLayer.tsx` (occluders, the outline), `ColonyGrounds.tsx` (every picture's silhouette), `design/art/colony/skyline.py` (the manifest's `skyline`, run by publish.sh).
- [x] `T-AC-13: behind the Hospital, the colonist is drawn before it … and its faint outline after it` red c1089146, then green.
- [x] Review round 1 (CHANGES at 422b31e6): a ray test with REACH 3 outlined colonists in plain view (1386 of 2400 sampled
  positions, 528 with no picture over the feet). Now the test is the picture's own silhouette, measured from its opaque
  pixels: hidden only where a picture drawn after the colonist covers its shins, waist or head. Negative cases from the
  review ((-2, -0.5), (-1, -0.5)) and a `ColonyGrounds`-level test; mutants (no wiring; the frame box for the silhouette) each fail one test.

### Task 2.2b: C4 — smoke over a damaged building, haze by air

**Plan gap found at PR-2 build:** spec C4 lists smoke and haze; Tasks 2.1–2.2 built glow and walkers only.
**Correction (8 Nov):** the earlier "Scaffold: `Living.tsx` (smoke)" was false: Living.tsx draws no smoke and no haze.
**Mock first (PM approved, 8 Nov):** `design/mocks/colony-grounds/smoke-haze.html` → `src/smokehaze/` (`air.ts` holds the
rules, `SmokeHaze.tsx` the layer, portalled into ColonyGrounds' SVG), with spec §2 RULE-7 (haze) and RULE-8 (smoke) in the same
push. Mock due 12:00Z; the PM does the look check, Heiko gets the link. Build only after the PM's OK; ready ~16:00Z, next batch.
**PM conditions:** haze on a clean colony is zero, asserted by a test (T-AC-15); prefer zero-download effects (SVG/CSS); if
sprites are used, the phone's heaviest colony measured < 1 MB in the PR body.
**Files:** `packages/ui/src/grounds/live.ts` (air.ts lifted as is), `packages/ui/src/grounds/LiveLayer.tsx`, `ColonyGrounds.tsx`
(passes `gauges.environment`), `packages/ui/test/grounds-air.test.tsx`.
- [x] Mock: smoke A (light puffs) / B (dark column), haze by air band, day/dusk, TV/phone, reduced motion; SVG gradients only.
- [ ] Test first, `T-AC-15`, at the rendered SVG: no haze at a clean colony (environment < 30); haze opacity rises with the
  gauge; smoke over a `damaged` place only; reduced motion → the plume still. Run: FAIL. Implement. Run: PASS. Commit.
- [ ] Shots TV and phone, day and dusk; review; PR into ws10-visual.

**Tasks 2.1–2.2 MERGED** as PR #603 → 71555ddd (`Review: APPROVE` at 5599ad02). Task 2.2b is still open (after Heiko's session).

**Live-layer rAF guard (found on #606's CI, 7 Nov):** `WalkingScene`'s walker clock threw `cancelAnimationFrame is not
defined` on unmount where a test stubs only `requestAnimationFrame` (`apps/web/test/colony-strike-phone.test.ts:28`,
3 of 12 red). Fix: the effect starts the clock only when both frame functions exist, else the walkers stand still.
Built in worktree `ws10-mounts-raf` on top of #606; ships with #606.

Built in 2.1–2.2 (ws10-grounds-pr2 @ b12f388c): RULE-2 glow on every stage by its factor (the hall counts as standing), RULE-3 walkers along the gaps between places, a paid strike counts as over (G-5 RULE-26), null mood → 0 walkers.

### Task 2.2d: T-AC-14 — Astronaut A sprite walkers in the player colours, at walking pace (C4; Heiko, 8 Nov)

**Heiko's pick, from the walking-colonists spike** (`design/mocks/colony-grounds/spike.html`, branch `ws10-spike-colonists` @ 9f823b55): **Astronaut A** (poly.pizza 3hC2i0CTuO, CC0), with
the light suit panels carrying the player colour (a small palette where no player owns the walker), and the helmet and trims
varying in place of hair (option (a), relayed by the PM 8 Nov). Kenney has no walk; Astronaut B (off-tone) and the Quaternius
human are dropped; Mixamo is not used (licence). Builds on Task 2.2c (#776): the outline ghost becomes the sprite's outline.
**Altitude:** the live layer's rendered markup, plus T-AC-2's manifest check for the `walker` entry. **Files:** `design/art/colony/walker/walk.py`
(brought over from `ws10-spike-colonists`; neutral suit and trim, a mask sheet), `walker/tint.py` (tints, outline), `walker/publish.py` (WebP, the manifest's `walker` entry, spec §3), `publish.sh` (keeps that entry),
`apps/web/public/art/colony/walker/**`, `packages/ui/src/grounds/LiveLayer.tsx` (a sprite `Colonist`), `walks.ts` (PACE),
`packages/ui/test/grounds-walker.test.tsx`.
- [x] Render astroA day and dusk (`yaw0 90`, 12 frames, the clip's 1.333 s cycle) with `COLONY_WALK_TINT` neutral, plus the mask sheet (suit red, trim green).
- [x] Offline: tint the suit to p1–p4 (theme.css); trims warm white / graphite / sand (charcoal dropped: speckled the suit, vanished at dusk); an outline sheet (the mask's alpha grown 4 px, minus itself). WebP @800/@400: ~12.5 KB a sheet @400. The unowned palette waits on the PM's ruling (the colony view carries no owner per colonist).
- [x] Test first, `T-AC-14`: a walker is an `<image>` crop of the `walker` sheet whose row is the heading of its route leg and whose column advances with the cycle; its suit variant is its owner's colour; at a still frame (reduced motion) frame 0; behind a building the ghost is the outline sheet, faded on the `<image>` itself (never a group opacity, Task 5.6); no `walker` entry → today's SVG figure. Run: FAIL. Implement. Run: PASS. Red 8ccd83c7 (6 of 7), green c2b7ae46.
- [x] `walks.ts` PACE 2.9 → **1.3 m/s** (walking pace, Heiko). Game shots TV and phone, day and dusk, beside the spike page (`spike.html#in-the-game` @ d0374307); phone dusk 803,769 B. The PM checks side by side before Heiko sees them.
- [x] PM ruling (b): colonists wear only the seated players' colours, the rest colony white/grey (`players` on ColonyGrounds/GroundsOpener; named edits WS4 44448751 and WS7 71ca4a90, both OK'd). Heiko approved the walking astronauts (8 Nov).
- [x] Review round 1 (CHANGES at 71ca4a90): the sprite was √2 too big (METRE/px_per_m, not W/(12√2·px_per_m)), and a 2-unit
  Icosphere helper in the model set the feet 35 px high and the figure 1.24 m. walk.py now bounds the skinned meshes only;
  re-rendered. Placement and per-route heading tests added (red ca60363c, fix 0bfe5d85). Phone dusk 857,549 B.
- [x] Review round 2 (CHANGES at 62bc1071): the phone's day worst case was 1,026,076 B, over 1 MB (`shoot.mjs` had measured
  dusk only). Red 77972c7b, fix f52b7fde: on the phone each suit uses one sheet (`oneTrim`); the @400 sheets are encoded at
  `-alpha_q 50`; `shoot.mjs` measures the heaviest colony (`?worst=1`) by day and by dusk and exits 1 over budget (positive
  control: budget 850,000 → day OVER, exit 1; restored); the walker stands on a solid shadow catcher (a contact shadow).
  Measured: day 894,077 B, dusk 800,423 B. Round 3: `Review: APPROVE at f52b7fde`. **MERGED** #785 → 115bf9bc.
- [x] Follow-up #801, the day shadow: the cell is 320×256, feet at (120,197); edge alpha ≤ 13/255 (was ~159). Phone day
  907,390 B, dusk 807,718 B. Generated art, no review. **MERGED** → aeab42013.
- Trunk: #797 on trunk as 6c0f8cd4 (batch 95); #808 (head 05cef333 = aeab42013 + trunk, CI green) in batch 96, PR #809.

### Task 2.3: C8 — the phone colony desk mounts the grounds (named edit, WS7)

**Files:** `apps/web/src/phone/hub/politics/Colony.tsx::ColonyWithFacts` (one line above `ColonyDeskCard`); test: extend `apps/web/test/politics-desks.test.ts`.
- [x] Implement C8 test-first: write `T-AC-5 (phone): colony-grounds is shown politics on, absent politics off`. Run: FAIL. Add the line. Run: PASS. Commit, and send the SHA to the PM for WS7's OK.

**Status: MERGED** — #606 (cc0a4d69): mount 62d6680f (WS7 OWNER OK), deep manifest loader b9567595, TV side-panel
removal fec2bab9, stronger phone test 21045612, fixtures on the real `place` field 80810ed3 (trunk #605 removed `plot`),
the rAF guard fbc9ceb7. `Review: APPROVE at fbc9ceb7`.

### Task 2.4: B-AC-5 — ≤ 1 MB of art on a phone

**Altitude:** promise, in the browser. **Observed at:** the browser test's network log at 390×844 on a month-12 fixture game.
- [ ] Write `B-AC-5: ≤ 1 MB of art on a phone`: a Playwright test that sums `image` responses under `/art/colony/`. It must be ≤ 1 MB, and it uses the 400 px pictures. Run: PASS. Commit.

### PR-2 merge gate

Same lines as PR-1, for B-AC-2, B-AC-3, B-AC-5, T-AC-3, T-AC-4 and T-AC-5 (phone), plus WS7's OK on C8's SHA.

---

## PR-3 — every building, every stage (C1, the remaining kinds)

### Task 3.1: Observatory, Stadium, Spaceport through `lib/`

- [ ] For each kind, write `design/art/colony/<kind>.py` with `build(stage)` covering every RULE-1 stage (build2 for the 3-month kinds). Render, then look at every picture. Run `publish.sh`. Commit per kind.

**Status:** Stadium and Spaceport (2×2) shipped; 65 pictures, 130 WebP, 2.98 MB in the manifest. `observatory.py` has
all 5 stages (e22e9244) but is **not rendered or published** — it is rendered in the AM-7 run (Task 4.2).

### Task 3.1b: review nits for the large kinds (PR-1 review at 5241a452)

- [ ] Allow the viewBox headroom for AM-1's tall frame, and place each chip above the picture's footprint height for 2×2 and tall kinds (Spaceport). Test: B-AC-1 with a 2×2 Spaceport at (0,0); the frame top is inside the viewBox and the chip is above the rocket.

### Task 3.2: T-AC-2 across the whole catalogue

- [ ] Extend `grounds-manifest.test.ts` to `T-AC-2: every kind in config.ts::PRESTIGE plus hall × every stage × day/dusk has a picture`, iterating `PRESTIGE` from `@mule/engine` so a new kind fails the test. Run: PASS. Commit.

### Task 3.3: Look round

- [x] Publish a page from `design/mocks/colony-grounds/look.html` showing all six kinds × stages at TV size. The PM asks Heiko. Record his verdict in the PR body.

**Status: DONE.** Catalogue ecee202a / 9b00add9 (Day / Dusk / lights on; Ours / With kit props). Heiko: "yes for each
building". Rulebook 68bb0122.

### Task 3.4: kit-dressed twins, behind one flag (AM-5 addendum)

**Depends on:** the kit hook (`lib/props.py`, `KITS_DIR`). **ACs:** T-AC-2 on the kit manifest (local run).
- [ ] Each kind script dresses every stage with kit props where they fit at our scale (site/build/damaged gear,
  Spaceport apron, Park and edge plants, hall dressing); renders with `KITS_DIR` set go to `out/kit/` (gitignored).
- [ ] `publish.sh` takes `SRC` (default `out`) and `PUB` (default `apps/web/public/art/colony`). Preview:
  `SRC=out/kit PUB=out/kit-pub publish.sh`; the look page's catalogue switches to it. Ship: `SRC=out/kit publish.sh`,
  then T-AC-2, commit. **Cleared: licence confirmed by Heiko, 7 Nov (AM-5)** — ship each kind once its kit set is
  looked at.
- [ ] Raw kit files never committed or published; only our WebP.

**Status:** scripts e22e9244 (kit dressing on every kind, `publish.sh` SRC/PUB). The kit-pub preview holds 65 pictures,
3.09 MB, looked at only at 32 spp. **The flag is NOT flipped**: superseded by AM-7 — the kit-dressed pictures ship from
the Task 4.2 re-render, not from these slab pictures.

### PR-3 merge gate

- [ ] T-AC-2 across the whole catalogue is green. Heiko's look round is recorded. No code changes (`git diff --stat -- packages apps/web/src` is empty).

---

## PR-4 — the base plate and the seamless composite (C1, C2, C3; spec AM-7)

**Gate first:** the 13:30Z proof (plate + flush shadow-catcher Hospital and Park, side by side with look.html's render) —
if it does not read the same, stop and re-plan with the PM. Every long render run has a progress check (pictures done /
total) that the lead reads; a 15-min stall is reported to the PM.

**Status (23:05Z, 7 Nov): MERGED.** PR-4 = #678 (cefe46c8; `Review: APPROVE at 4aae0fe7`), with the T-AC-10
plate-fit guard. First art merged via ca076c48 (f595f0e3). Plate frames: plate 3 is 6464×3636 with the hall at
(3232,2350); plate 5 is 10240×5760 with the hall at (5120,3853). Month 12 sits on **plate 5** (a 2×2 kind lies in ring 2).
**Ruling: no @1600 tier** — the shipped sizes are [800, 400]; @800 is half the full-res frame, so nothing is upscaled.
Framing #697 (2b8b8979; `Review: APPROVE at e7bb7442`; T-AC-11, the Stadium at 0.935× of 17.5 px/m) and centring #706
(22b6c0a3; `Review: APPROVE at 43eaa6b9`; the view centred across on the hall with the minimum shift) followed.
Night art (PM fixes 1 and 3: lit windows and warm facades at dusk, greener plates, boxwood) at 25b87a62, fast-forwarded
into `ws10-visual` 23:00Z 7 Nov; generated art, no review (PM ruling); PM passed the dusk read ("Ship #535 on this art").
The 18:45/19:05Z batch was missed; the grounds ride the 8 Nov batch (lane PR #535 green with shots by 05:00Z).

### Task 4.1: C1 — the base plate

- [x] Render the plate in the shared camera (lib/frame scale and sun): ground, grass/dirt, paths, kit vegetation, unbuilt places as graded ground, vignette; day / dusk / glow; plus the hall-centre pixel. Publish to `apps/web/public/art/colony/plate/` and the manifest (`plate`). Look at it beside look.html.

### Task 4.2: C1 — flush layers with shadow catchers, every kind (incl. the Observatory), kit-dressed

- [x] Re-render every kind × stage × light with no raised slab and a shadow-catcher plane; publish @800/@400 (no @1600 tier: ruled, see Status); T-AC-2 green on the new manifest.

### Task 4.3: C2 — the compositor draws the plate and drops the SVG ground

- [x] C3 is superseded by the plate (AM-7): no painter worker is built for the grounds. Test first at the rendered SVG: the plate `<image>` is drawn first and positioned by the hall-centre pixel; no SVG ground polygons or edge trees remain when the manifest has a plate; without a plate, today's shapes (HC-3). Implement. Commit.

### Task 4.4: the measured side-by-side

- [x] Stills of the full month-12 colony, day and dusk, at 1280×720 and 1920×1080, beside look.html's render — to the PM first; then the phone (@400) still. Nothing goes to Heiko before the PM has looked.

### Task 4.5: T-AC-10 — the plate fit (C1, C2)

**Altitude:** the shipped manifest and files. **Files:** `packages/ui/test/grounds-manifest.test.ts`.
- [x] `T-AC-10: every place of the plate's extent and every kind's frame at its place lies inside the plate` — red on the rocket cut, green after the plate frames were widened (#678).

### Task 4.6: T-AC-11 — the framing (C2)

**Altitude:** the rendered view box. **Files:** `packages/ui/test/grounds-framing.test.tsx`, `packages/ui/src/grounds/framing.ts`.
- [x] `T-AC-11: scale 0.9–1.1× of 17.5 px/m, empty places ≤ 1/3, the view inside the plate` (#697), then centred across on the hall with the minimum shift (#706).

### PR-4 merge gate

- [x] T-AC-2 and the Task 4.3 tests green; the side-by-side stills accepted by the PM; typecheck and tests exit 0; Review: APPROVE.

Measured on the night art (game opener shots at 1280, wealth 2000, ours ÷ look.html): hospital panes front 1.01 / side
1.10, hall panes 1.01, mid-faces 0.92 / 1.10, apron 1.37, lamp pool peak 1.45 / mean 0.82, **grass 0.66** (the renderer's
own composite reads grass 1.08, a free place 1.04 — different crops; unresolved, see follow-ups). Phone dusk 673,850 B.

---

## PR-5 — the month-end grounds opener on the TV (C5, C7, C9; spec AM-6)

**Branch:** `ws10-grounds-pr5` off `ws10-visual` once PR-2 (#603) is in. **Scaffold:** `design/mocks/colony-grounds/tv-beat.html`
(the full-screen canvas, header, caption) + `src/look/Living.tsx` (the lean-in). **Named edits:** `TableApp.tsx::TvGame`'s
upkeep route and `components/Colony.tsx::useMonthEndDrift` (WS4's OK by SHA). WS4 measures TV-FIT ≥ 0.7, six seats.

**Status: MERGED** — PR-5 = #664 (1714cdc1; `Review: APPROVE at 729aaf64`). Red before green: 5.1 b7634d51→d927484e,
5.2 befc8a8f→6f3007dd, 5.3 068fca7c→d95cd2a7, 5.4 C7 333c3c81→4670e715, C9 8037c71c→4900f399. WS4 OWNER OK on
4900f399 and on 0e401c62 (the smoke e2e waits with `theTvMonthEnd` in `apps/web/e2e/grounds-opener-steps.ts`). TV-FIT:
the e2e asserts the opener only (PM option A); TvMonthEnd's pre-existing 0.604 went to WS4 and is fixed on trunk.
The plate-404 browser check (`apps/web/e2e/grounds-opener.ts`, 18913ebd, WS4 OK) passes at 25b87a62.

### Task 5.1: T-AC-7 — RULE-5

**Altitude:** unit (hook logic over two views). **Files:** `packages/ui/test/grounds-change.test.ts`, `packages/ui/src/grounds/useGroundsChange.ts`.
- [x] Implement C5's change detection test-first: write `T-AC-7: a stage change between month ends leans in on that place; a first view leans in on none`. Run: FAIL. Implement. Run: PASS. Commit.

### Task 5.2: T-AC-8 — RULE-6

**Altitude:** unit (pure: change found? reduced motion? politics? → full / still / none, and its length). **Files:** `packages/ui/test/grounds-opener.test.ts`, `packages/ui/src/grounds/opener.ts`.
- [x] Write `T-AC-8: <example>` per RULE-6 example. FAIL → implement → PASS. Commit.

### Task 5.3: C5 — the opener

**Files:** `packages/ui/src/grounds/GroundsOpener.tsx` (full-screen ColonyGrounds at dusk + header + caption from RULE-5's changes, the lean-in from `Living.tsx`, reduced motion → still).
- [x] Test at the rendered markup: a changed month carries the caption naming the change and `data-leaning`; a quiet month renders the still with no lean. FAIL → implement → PASS. Commit.

### Task 5.4: C7 + C9 — on the TV (named edits, WS4)

**Files:** `apps/web/src/table/TableApp.tsx::TvGame` (upkeep route: event show → opener → TvMonthEnd), `apps/web/src/components/Colony.tsx::useMonthEndDrift`; tests in `apps/web/test/colony-screens.test.ts`.
- [x] `T-AC-9: the gauges' count starts when TvMonthEnd mounts`. FAIL → C9 → PASS. Commit.
- [x] `T-AC-5`: politics off, no opener. Then route the opener; TvMonthEnd unchanged (`git diff` of TvMonthEnd empty). Commit. Send both SHAs to the PM for WS4's OK.

### Task 5.6: T-AC-12 — the buildings in front of the named place fade during the lean-in (C5; PM, 8 Nov)

**Altitude:** the rendered markup (each building's group opacity). **Files:** `packages/ui/test/grounds-opener-fade.test.tsx`, `packages/ui/src/grounds/framing.ts` (inFrontOf, frontOpacity), `ColonyGrounds.tsx`.
- [x] `T-AC-12: at full lean the Stadium and the hall in front of the new site are at 1/3 …` red c673b989, then green. The visibility spike's worst case (design/mocks/colony-grounds/spike.html) is the fixture.

### Task 5.5: B-AC-6 — browser test (front to back)

- [x] In `apps/web/e2e/`, the test command owns its stack: at the month end after the Park comes to stand, the TV shows `tv-grounds-opener` after the event show, then `tv-monthend`; everyone Ready during the opener → planning at once; reduced motion → the still. Also Task 1.5 Step 4's checks (failed picture → shape and its glow gone; back-to-front order). TV-FIT ≥ 0.7 at six seats on the opener and the month end (`theTvScalesHeld`).

### PR-5 merge gate

- [x] T-AC-7, T-AC-8, T-AC-9, T-AC-5 and B-AC-6 green and named. WS4's OK on the two named edits by SHA; WS4's TV-FIT measure ≥ 0.7. Typecheck and tests exit 0. Review: APPROVE. Rulebook: WS6's "Designed, not in the game yet, WS10" lines (table-and-phones month end, events "Who waits") moved to built.

---

## Done since the 8 Nov play-test prep

- **art3 (PM fixes 1–3), MERGED** #762 → c6f42125 (code 9e94c860, art 6ce8dc28; 35 renders 06:07–06:35Z): warm pools on the lit
  paving round each building in its glow pass (fading 2.5 m out), the dusk grass's hue, the Hospital's windows inset 0.12 m in
  mid-grey frames. Measured on the game's 1920 dusk shot: free grass L 0.1215 → 0.1236; red/green 0.54 → 0.91 and blue/green
  1.01 → 0.82 (look.html 0.77/0.77); the walkway in front of the Stadium 0.09 → 0.16, the Hospital's 0.28 → 0.33; phone dusk
  689,264 B. The grass gap was hue, not brightness (the 0.66 / 1.08 readings were the wrong patches and camera). PM passed.
- **Opener fade (Task 5.6), MERGED** #768 → 4c605e61. Round 1 CHANGES at 33e3d63e: a group opacity isolated the screen-blended
  glow (a dark box), and the `place-hall` testid broke `apps/web/e2e/grounds-opener.ts:183`; fixed at 8a198296, `Review: APPROVE`.
- **Visibility spike** (120 commission orders, `design/mocks/colony-grounds/review-loop/visibility.mjs`): the newest site's
  ground is at most 67 % covered (median 13 %; over half in 21 of 120); chips are never covered by buildings, chip overlap
  ≤ 24 %; worst places (1,2) and (2,1). → Task 5.6.
- **Walking-colonists spike** → Heiko's pick Astronaut A, option (a) → Task 2.2d; occlusion → Task 2.2c.
- **Rulings:** WS6's hub mounts `<Grounds size="phone">`, no @200 tier. Zoom parked as Jira SA-1379; rotation and live 3D
  parked (spec non-goal). WS2's quiet game for Blender runs dropped (Heiko).

## Follow-ups (after the 8 Nov play-test; none blocks #535)

- **Inner lamp heads** (the lamps' heads read unlit close up) and **far-to-near shadows** across neighbouring layers.
- **Task 2.2b** smoke and haze — mock first (above), build after the PM's OK.
- **WS4's SHOULD:** poll for the plate request in `apps/web/e2e/grounds-opener.ts` rather than a fixed wait (WS4's file).
- **WS4:** `apps/web/e2e/colony.ts` takes 364 s against the 360 s watchdog. Checked 8 Nov: the watchdog is CI-only
  (`MULE_E2E_FILE_LIMIT_S` is set only in `.github/workflows/ci.yml` lines 57 and 102, read by `apps/web/e2e/harness.ts:104-114`),
  so it is not a play-test risk; WS4's CI flake. The night-PNG worktree is removed.
- The mock's type errors in `design/mocks/colony-grounds/src/fixture.ts` and `src/Grounds.tsx`.

<!-- plan-check: no-task C48 T-AC-6 — C48 is WS7's G-5 change (this spec builds its ux); C6/T-AC-6 land in WS7's grounds PR by the PM's ruling (option a), consumed here as a freeze point -->

## Pre-implementation checklist

- [x] §0 confirmed by the PM (design authority), 6 Nov. The spec's self-review is the gate (Heiko's standing rule). No changes open.
- [ ] Upstream: C6, now `ColonyProjectView.place` (AM-3), in WS7's engine PR. PR-1's Task 1.5 waits for it; Tasks 1.1–1.4 do not.
- [x] Branch policy: sub-PRs into `ws10-visual`; the PM batches `ws10-visual` into `feat/strategist`; `main` only with Heiko's OK.
- [x] Base `ws10-visual` @ `07dd3c37`→`fcbbad50` (design/ and docs/ only between them) green, measured 6 Nov ≈14:55Z: `pnpm typecheck` 0 · `pnpm test` 0 — engine 674 ✓ (1 skip) · ui 168 ✓ · web 994 ✓ · ai 601 ✓ (11 skip) · server 577 ✓ (91 skip)
- [x] Access: Blender 5.2.3 installed; `cwebp` at /opt/homebrew/bin; no paid assets.
- [x] Spikes: the Park three ways and the colony ring (`design/art/colony/spike-park/NOTES.md`).
- [ ] Effort sent to the PM: art ≈ 2–4 agent-days including look rounds; code PR-1 ≈ 1 day, PR-2 ≈ 1 day, PR-4 ≈ 1 day, PR-5 ≈ ½ day.
