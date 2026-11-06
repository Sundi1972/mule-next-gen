# The colony grounds view, direction C — design (WS10)

Status: §0 for the goal gate (PM, design authority under Heiko's 4 Nov delegation). Builds the screen named in
`docs/specs/2026-10-28-g5-colony.md` §1 C48 `ux` (on `ws7-site-am`: "NEW SCREEN, the colony's grounds … the screen by
the PM's build ruling") in the look Heiko ruled on 6 Nov (direction C). Rules, slots and data are C48/RULE-32's (WS7);
this spec adds nothing to them.

## §0 · Business Goals & Value  [handoff: goal lines and UBER-ACs]

**G-1 · The table sees how the colony is doing from the grounds picture alone.**
- Who benefits: the players at the kitchen table (TV and phones), and Heiko as the game's owner.
- Today: trunk draws no grounds at all (C48's ux is a NEW SCREEN, not built). The colony's state reaches the table as
  numbers: four gauges, the fund, the prestige count. Heiko, 6 Nov: "showing how wealthy the colony is by showing
  these colony buildings". verified_by: read (C48 ux; trunk's `apps/web/src/components/Colony.tsx` draws `ColonyGauges` and `BuildSite`, a list of `ProjectRow`s with 24 px `ObjectGlyph` icons — no picture of the colony).
- Value: the colony becomes a thing you watch grow, which is what makes it "a shared project worth building"
  (Mission G-5). One look answers how rich, how happy, what changed — without reading a number.
- Proof · UBER-AC-1: in a month-12 politics-on game with at least three objects, a player who is not shown the numbers
  says from the TV's grounds alone which buildings stand, which one is being built, which is closed or damaged, and
  whether the colony is lit (rich) or dim (poor). User test, run once with Heiko.

**G-2 · The grounds look "super nice" on the TV and on every phone.**
- Who benefits: Heiko ("This must be a super nice graphic … ideally it looks much, much nicer") and the players.
- Today: WS6's mock draws flat SVG shapes (holo or lit-diorama); Heiko asked for a specialist lane to make it look
  far better, and ruled direction C on 6 Nov after the look page. verified_by: read (mock #504; look page bd4cc1ae).
- Value: the colony's showpiece, at the polish of a city-builder, on hardware the family already has (any phone,
  a cheap TV stick) — the look Heiko picked, without a 3D engine's phone and download cost.
- Proof · UBER-AC-2: every stage of every building a game can reach shows its own rendered picture at its slot (the
  art manifest is complete for config.ts's catalogue), a month-12 colony loads ≤ 1 MB of art on a phone, and Heiko
  passes the look at TV size (one review, the PM asks).

**Non-goals**
- Live 3D on the TV (react-three-fiber): later, from the same models — its own spec when Heiko asks.
- Any rule, number or data change: slots, stages, gauges are C48/RULE-32 and ColonyView as they are.
- Weather from events, seasons, a camera the player moves: later, each its own small spec.
- Paid assets: Heiko's call (the asset-pack answer is a separate note).
- The town hall growing with prestige: needs a rule (tiers) from WS7; until then the hall has one picture.

**Rough cost**
- Chosen (C, per-building pictures + live layer + painted ground): art ≈ 85 pictures from shared kits
  (≈ 2–4 agent-days with look rounds), view ≈ 3 PRs (art manifest + compositor, live layer, screens wiring).
- Thin baseline (WS6's SVG scene, unchanged, with C48's data): ≈ 1 PR — fails G-2 by Heiko's own reaction to it.

§0 CONFIRMED by the PM (design authority) on 6 Nov, as written at c7d38f36.

## §0.1 · Decision Record  [review-only] — approaches, for the PM's pick

**1 · Recommended: pictures + glow + live layer + painted ground (direction C as ruled).** ≈ 3 build PRs + the art.
- Art: `design/art/colony/` scripts → `apps/web/public/art/colony/<kind>/<stage>-<light>@<w>.webp` + `manifest.json`
  (WS10 sole owner, already assigned).
- `ColonyGrounds`: a new `packages/ui/src/grounds/` component, owned by WS10 and reviewed by WS4, like WS6's
  `ProductionMap` (SEAMS 2026-10-21 PM ruling). It draws the painted ground (the map painter, `terrain/landscape.ts`,
  with a grounds palette), then the pictures by slot in painter's order, then the live layer (glow by wealth, colonists by
  mood, smoke, the next place, the slot chips), plus the month-end lean-in. Its scaffold is
  `design/mocks/colony-grounds/src/Scene.tsx` + `src/look/Living.tsx` (approved mock).
- Screens: the TV planning colony panel and month end (WS4), the phone colony desk (its owner by the PM's ruling) each
  mount `<ColonyGrounds colony={…} size=…/>`. Route lines only.

**2 · Middle: pictures + glow + live layer on WS6's flat SVG ground.** ≈ 2–3 PRs. It skips the painter integration
(about ½–1 day). It loses on the ruling itself: Heiko's 6 Nov ruling names "A painter for ground" (SEAMS 14:42Z), and on
the look page the flat ground was the weakest part of every picture.

**3 · Thin baseline: WS6's SVG `Scene` as is, with `art` pictures for standing buildings only.** ≈ 1 PR. It fails
UBER-AC-2's complete manifest (no site, building, closed or damaged pictures) and G-1's "lit or dim" reading, because
there is no glow layer. Checkable: the `art` prop in `Scene.tsx` replaces only `standing`.

**Spec class: Programme** (recommended). It has a new sole owner (`packages/ui/src/grounds/`), a cross-lane contract
(the art manifest read by the component; screens owned by WS4 and WS6), and more than 3 PRs counting the art.

PM rulings, 6 Nov: approach 1; spec class **Programme**; `packages/ui/src/grounds/**` is WS10's (sole owner, WS4
reviews, as WS6's ProductionMap); the phone mount line is WS7's (`apps/web/src/phone/hub/politics/Colony.tsx`), the TV's WS4's.

## §0.2 · Constraints  [handoff]

```
HC-1  The grounds read only MuleView.colony; they compute no rule and change no state.   source: §0 non-goals   breach: fatal
HC-2  A month-12 colony fetches ≤ 1 MB of art on a phone (400 px pictures, lazy per building).   source: UBER-AC-2   breach: fatal
HC-3  A missing or failed picture never blanks a place: fall back to the mock's SVG shape for that kind and stage.   source: G-1   breach: fatal
HC-4  Edit nothing in packages/ui/src/terrain/** (WS4's): reuse noise.ts and PictureCache by import.   source: SEAMS ownership   breach: decision
HC-5  Politics off: no grounds drawn anywhere (C48's pin).   source: G-5 spec HC-22   breach: fatal
```

## §1 · Solution Design  [handoff]

```
C1 · ADDED · the colony's pictures and their manifest
today        none_exists: no apps/web/public/art/; the spike's pictures live in design/ (verified_by: read)
tomorrow     MUST ship every kind × stage × light of design/art/colony/ASSET-LIST.md as WebP at 800 and 400 px
             under apps/web/public/art/colony/<kind>/<stage>-<light>@<w>.webp, with manifest.json (§3) listing each
             picture and the shared frame; MUST be rebuilt by script from design/art/colony/ (no hand-made pictures)
seam         apps/web/public/art/colony/** (WS10, spawn) — static files the web app already serves
senior       junior would: hard-code picture paths in the component · senior does: one manifest the component
             reads, so a new kind or stage is a data change and a missing picture is detectable (HC-3, T-AC-2)
mechanism    sprout
call sites   C2 only
depends_on   —
```

```
C2 · ADDED · ColonyGrounds: the grounds drawn from the colony view
today        none_exists (grep ColonyGrounds|grounds/ in packages, apps: nothing); the approved scaffold is
             design/mocks/colony-grounds/src/Scene.tsx (layout, painter's order, callouts) + src/layout.ts::PLACES
tomorrow     MUST draw, from MuleView.colony: the painted ground (C3), then each project's picture at its slot in
             painter's order (col+row), the town hall at the centre, slot chips over each place, the next free
             place's outline; MUST size the scene to the rings in use (layout.ts::extentOf); MUST draw at size
             'tv' and 'phone'
logic        → §2 RULE-1 (which picture), RULE-4 (extent)
seam         packages/ui/src/grounds/ColonyGrounds.tsx (new, WS10) — packages/ui is where the TV and phone share parts
senior       junior would: a second map with tiles and owners, or an r3f canvas · senior does: one SVG with <image>s
             positioned by the shared camera frame (ART_FRAME), so it costs a phone nothing but pictures, and the
             SVG fallback (HC-3) is the mock's own shapes
mechanism    fill_scaffold (from the mock's Scene.tsx, layout.ts)
ux           design/mocks/colony-grounds · look.html (approved: Heiko's ruling 6 Nov) and index.html (layout,
             callouts, stages) · GRAFT TARGET new: packages/ui/src/grounds/ColonyGrounds.tsx
depends_on   C1 (data, stubbable with the spike's pictures), C6 (contract, stubbable: fixture slots)
```

```
C3 · ADDED · the ground, painted the world map's way
today        packages/ui/src/terrain/landscape.ts paints the map; its palette and worker are closed to callers
             (Palette, LIGHT, DARK module-private; landscape-painter.ts hard-wires its worker) (verified_by: read)
tomorrow     MUST paint the grounds' ground (plaza, paths between places, lawn, room-to-grow places, a terrain skirt
             fading out) with noise.ts's fbm/cells and the map's light model, off the main thread, cached
seam         packages/ui/src/grounds/ground.ts + ground.worker.ts (new) — reusing ../terrain/noise.ts and
             ../terrain/picture-cache.ts::PictureCache by import (HC-4)
senior       junior would: copy landscape.ts or add a palette switch to it · senior does: a small painter for a few
             flat materials on the same noise and cache, so the map stays untouched and the grounds' palette is its own
mechanism    sprout
depends_on   —
```

```
C4 · ADDED · the live layer
today        none_exists in the app; the scaffold is design/mocks/colony-grounds/src/look/Living.tsx
tomorrow     MUST fade each building's glow picture by wealth and stage, put colonists on the paths by mood (none in a
             strike), smoke over a damaged building, a haze by air; MUST respect reduced motion (still frame, no walkers)
logic        → §2 RULE-2 (glow), RULE-3 (colonists)
seam         packages/ui/src/grounds/LiveLayer.tsx (new), inside C2's SVG
mechanism    fill_scaffold (Living.tsx)
depends_on   C2
```

```
C5 · ADDED · the month-end lean-in
today        no per-project "new this month" anywhere: useMonthEndDrift (apps/web/src/components/Colony.tsx) animates
             happiness only (verified_by: read)
tomorrow     MUST, when the phase turns to the month end on the TV, fall to dusk, lean in on the places whose stage
             changed since the last month end, light them, and lean back out (≈ 5 s, once); MUST NOT play on a reload
logic        → §2 RULE-5
seam         packages/ui/src/grounds/useGroundsChange.ts (new): remembers stages per project at each month end
senior       junior would: ask the server for a "changed" list · senior does: diff the two views the screen already
             saw; a reload sees no change and plays nothing — the honest outcome
mechanism    sprout
depends_on   C2
```

```
C6 · MODIFIED · a project's slot reaches the screens
today        packages/engine/src/types.ts carries Project.slot (PR #509, merged); packages/protocol/src/index.ts::
             ColonyProjectView has no slot and apps/server/src/colony-view.ts does not map it (verified_by: read)
tomorrow     MUST add ColonyProjectView.slot: number | null and map it from Project.slot
seam         packages/protocol/src/index.ts::ColonyProjectView + apps/server/src/colony-view.ts — WS3's files; WS7's
             C48 contract. Named edit or WS7's grounds PR, by the PM's ruling
pin          every other ColonyProjectView field unchanged; politics off: no colony in the view (HC-5)
mechanism    in_place
call sites   the server's colony projection only (one mapper)
depends_on   —
atomicity    must land before C7/C8 show real games (C2 renders fixtures until then)
```

```
C7 · MODIFIED · the TV shows the grounds   (WS4's file; mount line)
today        apps/web/src/table/TableApp.tsx::TvMonthEnd shows ColonyGauges + BuildSite (a list); planning shows no
             colony panel (verified_by: read)
tomorrow     MUST mount <ColonyGrounds size="tv"> in the month end beside the BuildSite list, and in planning in the
             colony panel the mock places beside the map (index.html "TV · planning")
seam         TableApp.tsx::TvMonthEnd and ::TvGame — WS4
mechanism    in_place
depends_on   C2, C6
```

```
C8 · MODIFIED · the phone's colony desk shows the grounds   (WS7's file; mount line)
today        apps/web/src/phone/hub/politics/Colony.tsx::ColonyWithFacts renders FundCard, Commission, ColonyDeskCard
             (gauges + BuildSite), ColonyDesk, ColonyFacts (verified_by: read)
tomorrow     MUST mount <ColonyGrounds size="phone"> above ColonyDeskCard, politics on only
seam         ColonyWithFacts — WS7
mechanism    in_place
depends_on   C2, C6
```

## §2 · The Logic  [handoff]

```
RULE-1 · Which picture a place shows                     shape: decision table
inputs   stage (commissioned | building | standing | closed | damaged) · monthsLeft (number | null) · buildMonths (1–3)
         · light (day | dusk) · manifest entry (present | absent)
first match wins
  #  when                                              then
  1  manifest entry absent                             the mock's SVG shape for kind + stage (HC-3)
  2  stage commissioned                                site
  3  stage building, buildMonths ≤ 2                   build1
  4  stage building, monthsLeft > buildMonths / 2      build1   (3-month kinds: first half)
  5  stage building                                    build2
  6  otherwise                                         the stage's own picture (standing | closed | damaged)
unknown  monthsLeft null while building cannot happen (protocol: null unless building); if it does, build1
light    dusk at the month end and in the upkeep phase, day otherwise
examples Stadium building, monthsLeft 3 of 3 → build1 · monthsLeft 1 → build2 · Park building → build1 ·
         Hospital closed → closed · no manifest → SVG
```

```
RULE-2 · How brightly a building's lights show            shape: formula
glow opacity = 0 by day; at dusk = stageFactor × (0.25 + 0.75 × wealthShare)
  stageFactor: standing 1 · building 0.5 (work lights) · damaged 0.6 (ember) · site 0.3 · closed 0
  wealthShare = clamp(gauges.wealth / WEALTH_FULL, 0, 1), WEALTH_FULL a grounds constant (start 4 000, tuned
  on the look page with Heiko; a look value, not a rule — HC-1)
examples dusk, standing, wealth 0 → 0.25 (dim, never dark) · wealth ≥ 4 000 → 1 · closed → 0 · day → 0
```

```
RULE-3 · How many colonists walk                          shape: formula
walkers = strike ? 0 : round(happiness / 100 × min(14, 2 + 2 × standing)); reduced motion → shown still
examples happiness 72, 5 standing → 9 · strike → 0 · nothing standing, happiness 100 → 2
```

```
RULE-4 · How big the scene is: rings = 0 with no project, 1 while the highest slot ≤ 7, else 2 (layout.ts::extentOf by slot)
RULE-5 · What leans in at the month end: the projects whose stage differs from the stage seen at the last month end
         on this screen; none seen before (a reload, a new screen) → no lean-in, the scene just shows
```

## §3 · Contracts & Data Models  [handoff]

- **ColonyProjectView.slot** · ADDED · non-breaking (optional on old clients) · `number | null`, the place in growth
  order (G-5 RULE-32), null for none · produced by C6.
- **apps/web/public/art/colony/manifest.json** · ADDED · produced by C1, read by C2:
  `{ "frame": { "width": 1600, "height": 1600, "place": 1293, "centre": [800, 1000] },
     "pictures": { "<kind>": { "<stage>": { "day": "…@800.webp", "dusk": "…", "glow": "… | null" } } },
     "sizes": [800, 400] }` — kind ∈ hall + PrestigeId; stage per RULE-1.

## §4 · Failure & Ops  [handoff]

| Question | |
|---|---|
| A picture fails or the manifest is missing | RULE-1 row 1: the SVG shape; the scene never blanks (HC-3) |
| The ground painter's worker is unavailable | paint on the main thread once, as the map does; until painted, the mock's flat ground |
| Retry / poison | none: static files; a failed picture is not retried in the session |
| Races | the view updates mid-animation → the lean-in finishes on the newer view; RULE-5 diffs view to view |
| What still works if C2 breaks | the gauges and the BuildSite list stay mounted beside it (C7, C8) |
| How we know it works | the look page and the web tests (§6); the manifest test fails on a missing picture |

## §5 · Delivery

Code-only; no existing state to reach. Pictures are static files shipped with the web app.

## §6 · Acceptance Criteria  [handoff]

| B-AC-1 (G-1) | Given a month-12 colony with a Park standing, a Stadium building (1 of 3 left), a Hospital closed | When the TV shows the month end | Then the grounds show the Park's standing picture, the Stadium's build2 picture, the Hospital's closed picture, each at its slot, with its chip | observed_at the rendered TV screen (web test) | negative: a commissioned project shows site, never standing | C2 C7 |
| B-AC-2 (G-1) | Given the same colony at dusk | When wealth goes from 0 to 4 000 | Then the standing buildings' lights go from dim to full and the closed Hospital stays dark | observed_at the glow images' opacity in the rendered SVG | negative: by day no glow shows | C4 |
| B-AC-3 (G-1) | Given a strike | When the grounds draw | Then no colonist walks | observed_at the rendered SVG | negative: happiness 72, no strike → 9 walkers | C4 |
| B-AC-4 (G-2) | Given any kind and stage the catalogue can reach | When the grounds draw it | Then a rendered picture shows, not the SVG fallback | observed_at manifest.json + the files on disk | negative: a deleted picture → the SVG shape, not a blank | C1 C2 |
| B-AC-5 (G-2) | Given a month-12 colony on a phone | When the colony desk opens | Then ≤ 1 MB of art loads | observed_at the network log of a browser test | negative: — | C1 C8 |
| T-AC-1 (serves B-AC-1) | RULE-1's table, one case per row, on the picker function | C2 |
| T-AC-2 (serves B-AC-4) | every kind in config.ts::PRESTIGE plus hall × every RULE-1 stage × day/dusk has a manifest entry whose file exists | C1 |
| T-AC-3 (serves B-AC-2) | RULE-2's examples | C4 |
| T-AC-4 (serves B-AC-3) | RULE-3's examples | C4 |
| T-AC-5 (serves HC-5) | politics off: no ColonyGrounds in the TV or phone markup | C7 C8 |
| T-AC-6 (serves C6) | the server's colony view carries each project's slot; a project without one carries null | C6 |
| T-AC-7 (serves C5) | RULE-5: a stage change between two month ends leans in on that place; a first view leans in on none | C5 |

Invariant: the grounds never write state (HC-1).

## §7 · Risks & Spikes  [review-only]

- **Slot not on the wire (C6)** blocks real games. Mitigation: C2 builds on fixtures; C6 is a named edit the PM routes now.
- **Phone weight**: 85 pictures. Mitigation: HC-2, 400 px, load per building in view; B-AC-5 measures.
- **Cross-place shadows are lost** (each picture carries only its own place's shadow). Accepted look trade (ART-DIRECTION §2).
- **WS7's pace change (buildMonths → 1)** drops build2. Mitigation: RULE-1 rows 4–5 never fire; the pictures are simply unused.
- **The look still needs Heiko's eye per building** (the spike's lesson: failures show only in the render). Mitigation: a look round per art PR, the PM asks.

## §8 · Amendments  [review-only]

(none yet)

## §9 · Ownership Boundaries  [handoff]

- Sole owner: WS10, for `packages/ui/src/grounds/**`, `apps/web/public/art/colony/**` and `design/art/**`.
- Read contract: `<ColonyGrounds colony size />` from `@mule/ui`; `manifest.json` (§3).
- Write contract: only WS10 writes pictures and the manifest; screens mount the component and never draw buildings.
- Enforcement: the SEAMS row (PM, 6 Nov) plus WS4's review of packages/ui; T-AC-2 fails on any picture that isn't in the manifest.
