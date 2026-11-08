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
- Paid assets: none (Heiko, 6 Nov). Buildings and the rocket are our own Blender builds, dressed with props from the
  free KitBash3D Mission to Minerva kit (AM-5); NASA models only as a reference.
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
             place's outline; MUST size the scene to the rings in use (design/mocks/colony-grounds/src/layout.ts::extentOf); MUST draw at size
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
seam         packages/ui/src/grounds/ground.ts + ground.worker.ts (new) — reusing packages/ui/src/terrain/noise.ts and
             packages/ui/src/terrain/picture-cache.ts::PictureCache by import (HC-4)
senior       junior would: copy landscape.ts or add a palette switch to it · senior does: a small painter for a few
             flat materials on the same noise and cache, so the map stays untouched and the grounds' palette is its own
mechanism    sprout
depends_on   —
```

```
C4 · ADDED · the live layer
today        none_exists in the app; the scaffold is design/mocks/colony-grounds/src/look/Living.tsx
tomorrow     MUST fade each building's glow picture by wealth and stage, put colonists on the paths by mood (none in a
             strike), smoke over a damaged building, a haze by air; MUST respect reduced motion (still frame: walkers shown still, per RULE-3)
logic        → §2 RULE-2 (glow), RULE-3 (colonists)
seam         packages/ui/src/grounds/LiveLayer.tsx (new), inside C2's SVG
mechanism    fill_scaffold (Living.tsx)
depends_on   C2
```

```
C5 · ADDED · the month-end grounds opener (AM-6)
today        no per-project "new this month" anywhere: useMonthEndDrift (apps/web/src/components/Colony.tsx) animates
             happiness only (verified_by: read)
tomorrow     MUST, on the TV at the month end, after the month end's event show (if any), show the grounds FULL-SCREEN
             (1280 × 720 canvas, header "End of month N" + one caption line): dusk falls, the view leans in on the places
             whose stage changed since the last month end, their lights come on, it leans back out (≈ 6 s, RULE-6); in a
             month with no change, or with reduced motion, a 3 s still; then TvMonthEnd, unchanged. MUST NOT hold Ready
             or the phones; MUST NOT play on a reload (RULE-5). Scaffold: design/mocks/colony-grounds/tv-beat.html.
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
C7 · MODIFIED · the TV shows the grounds   (WS4's file; one routing line — AM-6)
today        apps/web/src/table/TableApp.tsx::TvGame routes upkeep to TvMonthEnd (ColonyGauges + BuildSite list);
             planning shows no colony panel (verified_by: read)
tomorrow     MUST, in the upkeep route, show C5's opener after the event show and before TvMonthEnd (RULE-6), politics on
             only. TvMonthEnd and the planning screen stay unchanged (no side panel: WS4 measured 0.662 / 0.593 at six
             seats, under the 0.7 floor)
seam         TableApp.tsx::TvGame upkeep route — WS4
mechanism    in_place
depends_on   C2, C5, C6

C9 · MODIFIED · the gauges count up when the month end comes on screen   (WS4's file; named edit — AM-6)
today        apps/web/src/components/Colony.tsx::useMonthEndDrift starts its count 1.2 s after the phase turns to upkeep
             (verified_by: read, line ~150)
tomorrow     MUST start the count when TvMonthEnd mounts, so the gauges count up to the month's new numbers the
             opener's lights already showed
seam         apps/web/src/components/Colony.tsx::useMonthEndDrift — WS4
mechanism    in_place
pin          the existing drift tests keep passing
depends_on   C7
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
RULE-4 · How big the scene is: rings = 0 with no project, 1 while the highest slot ≤ 7, else 2 (design/mocks/colony-grounds/src/layout.ts::extentOf, by the highest slot)
RULE-6 · The month-end opener's place and length (AM-6, PM ruling with WS6)
order    1 the month end's event show (TvEventLayer, server clock) if any → 2 the opener → 3 TvMonthEnd
length   RULE-5 finds a change (a stage started, stands or is damaged) → full ≈ 6 s; no change, or reduced motion → a
         3 s still; politics off → no opener
always   Ready is never refused during the opener and the phones never wait for it; the phase moving on ends it
examples changed month → 6 s, then the month end · quiet month → 3 s still · reduced motion → 3 s still · everyone
         Ready at 2 s → the planning screen (the opener ends) · reload mid-opener → no opener (RULE-5)
RULE-5 · What leans in at the month end: the projects whose stage differs from the stage seen at the last month end
         on this screen; none seen before (a reload, a new screen) → no lean-in, the scene just shows
RULE-7 · How thick the haze over the grounds is (C4; Task 2.2b)        shape: formula
input    environment · 0–100, higher is dirtier (config.ts POLLUTION.bands: Clean 0, Smoggy 30, Toxic 60, Collapse 80; POLLUTION.airMax 100)
unknown  no environment gauge → 0, as a clean colony: a missing reading never paints murk
haze     environment < 30 → 0 (no haze drawn); else 0.18 + (environment − 30) / (airMax − 30) × (0.65 − 0.18), capped at airMax, the opacity at the far
         (top) edge, thinning to 0.55 × that toward the camera
colour   Smoggy a dusty grey, Toxic ochre, Collapse a brown murk; darker at dusk (packages/ui/src/grounds/live.ts::HAZE)
examples 12 → 0 · 29 → 0 · 30 → 0.18 · 65 → 0.415 · 100 → 0.65
RULE-8 · What smokes (C4; Task 2.2b)                                     shape: decision table
  #  stage              then
  1  damaged            a plume rises from the top of its picture (0.7 of its height); embers warm its base at dusk
                        (the mock's smoke A, light puffs; PM 8 Nov: B, a dark column, read as fire and is not built)
  2  anything else      no smoke (closed is dark and still; a site is bare)
motion   each puff rises, widens, drifts with the wind and fades over its period; reduced motion → the plume shown still
order    the plume is drawn just after its own building (col + row): a building or colonist nearer the camera covers it;
         during the opener's lean-in it fades with its building (T-AC-12)
examples Hospital damaged → one plume over the Hospital · all standing → none · reduced motion → the same plume, not moving
```

## §3 · Contracts & Data Models  [handoff]

- **ColonyProjectView.place** · ADDED · non-breaking (optional on old clients) · `{ x, y, w, h } | null`, the anchor
  and footprint on the 5×5 grounds (RULE-32b: x right, y down; the hall at (2,2)), null for none · produced by WS7's
  engine PR (C6). Supersedes `slot` (AM-3).
- **apps/web/public/art/colony/manifest.json** · ADDED · produced by C1, read by C2:
  `{ "frame": { "width": 1600, "height": 1600, "place": 1293, "centre": [800, 1000] },
     "pictures": { "<kind>": { "<stage>": { "day": "…@800.webp", "dusk": "…", "glow": "… | null" } } },
     "sizes": [800, 400] }` — kind ∈ hall + PrestigeId; stage per RULE-1. A kind may override the frame:
  `"pictures": { "spaceport": { "frame": { "width": 1600, "height": 3200, "place": 1293, "centre": [800, 2600] }, … } }` (AM-1).
  A 2×2 kind's frame is **3200 wide** at the same scale, its centre on the footprint's centre (AM-2); the Spaceport,
  2×2 and tall, carries both. Paths are relative to `/art/colony/`. `sizes` is **[800, 400]** — no @1600 tier
  (ruled 7 Nov; @800 is half the full-res frame, so the TV upscales nothing).
  Top-level `"plate": { "3" | "5": { "day", "dusk", "glow": "… | null", "frame": { "width", "height", "hall": [x, y] } } }`
  (AM-7): one base plate per RULE-4 extent — "3" covers ring 1, "5" the whole 5×5; the hall pixel anchors the layers.
  Each stage entry may carry `"skyline": { "column": 40, "top": [...], "bottom": [...] }` · ADDED · non-breaking: the
  picture's opaque pixels column by column (40 frame px each), top and bottom row as fractions of its height, written by
  `design/art/colony/skyline.py`; the live layer hides a colonist only where it covers the figure (C4, T-AC-13).
  Top-level `"walker"` · ADDED · non-breaking (absent → today's SVG figure) (AM-8):
  `{ "cell": { "width": 320, "height": 256, "feet": [120, 197] }, "px_per_m": 76.19, "frames": 12, "seconds": 1.333,
     "headings": ["+x", "+y", "-x", "-y"], "sheets": { "<suit>-<trim>": { "day": "walker/…@800.webp", "dusk": "…" } },
     "outline": "walker/outline@800.webp" }` — a sheet's rows are the headings top to bottom, its columns the frames;
  `+x` is c rising (screen down-right), `+y` r falling (up-right). suit ∈ p1–p4; trim ∈ white, graphite, sand.
- **Open gap (small):** `ColonyProjectView.place` is on trunk and `plot` was removed (#605); the entry above still
  describes it as WS7's to produce. Reconcile when C6's PR is recorded here.

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
| B-AC-6 (G-1) | Given a month end where the Stadium has just come to stand | When the TV reaches upkeep | Then after the event show the TV shows the grounds full-screen with "New this month", then TvMonthEnd unchanged | observed_at the TV markup over time (browser test) | negative: Ready pressed by all during the opener → planning shows at once | C5 C7 |
| T-AC-8 (serves C5, C7) | RULE-6's examples: order and length | C5 C7 |
| T-AC-9 (serves C9) | the gauges' count starts when TvMonthEnd mounts, not at the phase change | C9 |
| T-AC-7 (serves C5) | RULE-5: a stage change between two month ends leans in on that place; a first view leans in on none | C5 |
| T-AC-10 (serves B-AC-4, AM-7) | the plate fit: on the shipped manifest every place of the plate's extent, and every kind's frame at its place, lies inside the plate's frame | C1 C2 |
| T-AC-11 (serves G-2, AM-7) | the framing: a building's scale is 0.9–1.1× of 17.5 px/m; empty places fill ≤ 1/3 of the view; the view lies inside the plate; it is centred across on the hall, shifted only as much as keeps a building whole | C2 |
| T-AC-13 (serves B-AC-3, G-2) | a colonist standing shallower than a building (col + row) is drawn before it, and where that building's picture covers its figure on screen (by the picture's silhouette, §3 `skyline`) its faint outline is drawn after every building; one in front draws over it with no outline; one behind a building but above its picture on screen has no outline; a site hides a colonist only where its picture's pixels cover the figure (Heiko, 8 Nov: a figure on the Hospital's upper floor) | C4 |
| T-AC-14 (serves C4, AM-8) | a walker is drawn from the `walker` sheet: the row is its route leg's heading, the column advances with the cycle (frame 0 at reduced motion), the suit variant is its owner's colour; behind a building its ghost is the outline sheet faded on the image itself; with no `walker` entry, today's SVG figure | C4 |
| T-AC-12 (serves C5, B-AC-6) | during the opener's lean-in, a building nearer the camera than a place the caption names and across it on screen fades to 1 − ⅔ × lean (a third at full lean); the named place, a level or off-to-the-side building, and a view that leans on nothing do not fade (PM, 8 Nov, from the visibility spike: a new site is up to ⅔ covered) | C5 |

| T-AC-15 (serves C4, PM 8 Nov) | RULE-7's and RULE-8's examples at the rendered SVG: a clean colony (environment < 30) draws no haze; the haze's opacity rises with the gauge; smoke over a damaged place only, drawn just after its building and under nearer ones; at reduced motion the plume stands still | C4 |

Invariant: the grounds never write state (HC-1).

## §7 · Risks & Spikes  [review-only]

- **Slot not on the wire (C6)** blocks real games. Mitigation: C2 builds on fixtures; C6 is a named edit the PM routes now.
- **Phone weight**: 85 pictures. Mitigation: HC-2, 400 px, load per building in view; B-AC-5 measures.
- **Cross-place shadows are lost** (each picture carries only its own place's shadow). Accepted look trade (ART-DIRECTION §2).
- **WS7's pace change (buildMonths → 1)** drops build2. Mitigation: RULE-1 rows 4–5 never fire; the pictures are simply unused.
- **The look still needs Heiko's eye per building** (the spike's lesson: failures show only in the render). Mitigation: a look round per art PR, the PM asks.

## §8 · Amendments  [review-only]

```
AM-1 · 2026-11-06 · lead · after Heiko's look-page feedback
target    §3 manifest frame (one shared frame)
said      every picture shares the 1600×1600 frame
did       a kind may carry its own frame; the Spaceport's is 1600×3200 (centre 800,2600) for a ~36 m rocket
because   Heiko: "an impressive, big rocket, not a toy" — G-2 (UBER-AC-2's TV look review)
goal      G-2 — met more fully; HC-2 holds (one Spaceport ≈ +60 kB at 800 px; ≤ 1 MB per month-12 colony on a phone)
folded    §3 manifest; ART-DIRECTION §2; ASSET-LIST Spaceport row; plan PR-1 Task 1.1 (lib supports a per-kind frame)
```

```
AM-2 · 2026-11-06 · lead · after Heiko: "a Stadium is much bigger than the Hospital"
target    §1 C2 (one place per building), §3 manifest frame
said      every building stands on one place
did       footprint per kind, in proportion to real size: Stadium 2×2 (Heiko); WS10 proposes Spaceport 2×2, the
          rest 1×1. WS7 rules the numbers, how a 2×2 takes places in the growth order, and the view contract.
          A 2×2 kind's frame is drawn at the same scale and anchored on its footprint's centre; per-kind frames (AM-1)
          carry it. PR-1's kinds are all 1×1; the 2×2 kinds land in PR-3 after WS7's contract.
because   G-2: the grounds must look like a real place (Heiko's TV look review)
goal      G-2
folded    ART-DIRECTION §2 "Tall kinds" row widened to "Large kinds"; ASSET-LIST Stadium + Spaceport rows; plan PR-3
```

```
AM-3 · 2026-11-06 · lead · WS7's ruling, docs PR #538 @ 950e3bf0 (AM-18 / RULE-32b)
target    §1 C6, §2 RULE-4, §3 ColonyProjectView.slot
said      ColonyProjectView.slot (growth-order index)
did       ColonyProjectView.place: { x, y, w, h } | null — anchor + footprint on the 5×5 grounds, the hall at (2,2),
          derived by the server (WS7); COLONY.grounds {size 5} replaces groundsSlots. Pictures sit at the footprint's
          centre; RULE-4's extent is the bounding box of the places in use. Sizes: Stadium, Spaceport 2×2; rest 1×1.
because   G-2 (footprints in proportion, Heiko) — WS7 owns placement
goal      G-2
folded    C2 positions by place; C6 produced by WS7's engine PR (after its grounds PR-2); plan Task 1.5 waits for it
```

```
AM-4 · 2026-11-06 · lead · PR-1 build
target    §1 C2 tomorrow ("the next free place's outline")
said      C2 draws the next free place's outline
did       dropped: the grounds cannot know the next place without computing RULE-32b (the mock's order differs);
          it returns only if WS7's view carries the next place
because   HC-1 (the grounds compute no rule) — G-1 holds without it
goal      G-1 — unaffected
folded    C2; PR-1 fix round
```

```
AM-5 · 2026-11-06 · lead · Heiko's ruling (via the PM), after the Mission to Minerva part table
target    §0 non-goal "Paid assets: Heiko's call"
said      no paid assets until Heiko decides
did       Heiko ruled: no purchases. The six buildings and the rocket stay our own Blender builds, dressed with props
          from the free KitBash3D Mission to Minerva kit (Spaceport apron, garden, rooftop dishes, construction
          scaffolding, rubble). The kit has no rocket, observatory, hospital or stadium. NASA models only as a
          reference unless a per-model licence check passes. Raw kit files never enter the repo; the folder path
          comes from the PM. UNTIL Heiko answers the licence question (AI agents rendering), kit props appear in
          local renders only, never in committed art.
because   G-2: city-builder polish; Heiko's call by the non-goal itself
goal      G-2
folded    §0 non-goal; ART-DIRECTION §4; ASSET-LIST Hospital row; plan Task 1.6
addendum  Heiko, later on 6 Nov: kit props as much as they fit at our scale — site, build and damaged stages, the
          Spaceport apron, Park and edge plants, hall dressing; our buildings stay the base. Every picture gets a
          kit-dressed twin rendered to a gitignored tree; the shipped manifest keeps today's pictures until the
          licence answer; the switch is one flag (publish.sh SRC=out/kit). Measured, not used: the kit hospital is
          141 × 104 × 58 m, ~12× too big for a 12 m place. → plan Task 3.4
licence   **Licence confirmed by Heiko, 7 Nov** (relayed by the PM, 17:13Z by date -u): the kit-dressed rendered pictures
          may ship in the game, rendered by our agents. Flip the flag (SRC=out/kit). Raw kit files (USD, textures)
          still never enter the repo or anything published; only our rendered WebP ships. Rebuilding the pictures
          needs Heiko's kit folder (KITS_DIR), so it runs on his Mac, not in CI.
```

```
AM-6 · 2026-11-07 · lead · PM final ruling with WS6 (relayed 23:36Z by date -u)
target    §1 C5, C7; adds C9, RULE-6, B-AC-6, T-AC-8, T-AC-9
said      C7: the grounds beside BuildSite at the month end and as a panel beside the map in planning
did       no TV side panel (WS4 measured six seats: planning 0.662, month end 0.593; floor 0.7; WS10 reproduced
          0.593). The grounds get a full-screen TV moment: the month-end opener — event show → opener → TvMonthEnd
          unchanged; ≈ 6 s only in a month the grounds changed, else a 3 s still (and with reduced motion); Ready
          always wins, the phones never wait; no server timing change. useMonthEndDrift starts on TvMonthEnd's mount
          (C9, WS4's named edit). WS4 measures the opener's canvas with header and caption at ≥ 0.7, six seats.
because   G-1 / G-2: "a really nice view … showing how wealthy the colony is" — a 60–95 px strip defeats it
goal      G-1, G-2
folded    C5, C7, C9, RULE-6, §6; plan PR-5; the phone mount (C8) unchanged
```

```
AM-7 · 2026-11-07 · lead · Heiko's binding target + PM approval (relayed 10:25Z by date -u)
target    §1 C1 (pictures on raised slabs), C2 (SVG ground, cone trees), C3 (the map painter for the ground), the TV framing
said      per-building pictures on their own slabs over a painted (C3) ground; SVG edge trees; the whole 5×5 in frame
did       Heiko: "this is how it should look in the game" — look.html's whole-colony render (one camera, one light, one
          scene) is the bar, by day and at dusk, any buildings and stages. Route: (i) a BASE PLATE rendered in the shared
          camera — ground, grass/dirt, paths, kit vegetation, unbuilt places, vignette — day / dusk / glow; (ii) every
          building × stage re-rendered FLUSH with a Cycles shadow catcher, so each layer carries its own cast shadow and
          composites in depth order (ortho camera + directional sun ⇒ one picture serves every place; shadows onto
          neighbouring buildings dropped, accepted); (iii) dusk and lamps stay rendered passes; (iv) the TV opener frames
          the built area like the look.html camera, @1600 TV variants (nothing upscaled); (v) no chips on the opener.
          Kit vegetation and props for every kind. C3's map painter is superseded for the grounds (kept for the world
          map). Budget ≈ 10–11 MB (< 16 MB); the phone loads @400 per building in view (HC-2) and gets the plate too.
          Gate: a proof (plate + flush Hospital and Park, side by side with look.html) before anything scales.
          Later (7 Nov): no @1600 tier — sizes stay [800, 400]; the dusk pass lights the windows (warm panes, lit
          globes and signs, a ground fill) so dusk reads lit on its own, before the glow layer (PM fix 1).
because   G-2 (city-builder polish): measured causes — 2.8× smaller framing, no shared ground, raised slabs without
          contact shadows, placeholder trees
goal      G-2, G-1
folded    C1, C2, C3; plan PR-3 (re-render), PR-4 (now the plate + compositor), PR-5 (framing)
```

```
AM-8 · 2026-11-08 · lead · Heiko's colonist ruling and pick (relayed by the PM)
target    §1 C4 (colonists on the paths), §3 manifest, §6
said      colonists as small SVG figures in the player colours, walking the gaps between places
did       Heiko: a colonist behind a building is hidden by it, with a faint outline; in front it draws over it (#776,
          plan Task 2.2c). From the walking-colonists spike he picked **Astronaut A** (CC0), option (a): the light suit
          panels carry the player colour, or a palette where there is no player; the helmet and trims vary in place of
          hair; walking pace (1.3 m/s, was 2.9). Rendered as sprite sheets in the shared camera (4 headings × 12 frames),
          tinted offline through a mask; a new top-level manifest `walker` entry (§3). Kenney has no walk; Mixamo not used.
because   G-1/G-2: the figures read as people at the table; Heiko, 8 Nov
goal      G-1, G-2
folded    C4; plan Task 2.2d; §3; T-AC-14
```

## §9 · Ownership Boundaries  [handoff]

- Sole owner: WS10, for `packages/ui/src/grounds/**`, `apps/web/public/art/colony/**` and `design/art/**`.
- Read contract: `<ColonyGrounds colony size />` from `@mule/ui`; `manifest.json` (§3).
- Write contract: only WS10 writes pictures and the manifest; screens mount the component and never draw buildings.
- Enforcement: the SEAMS row (PM, 6 Nov) plus WS4's review of packages/ui; T-AC-2 fails on any picture that isn't in the manifest.

## Self-review record  [review-only]

- anchor-check.sh: PASS (8 seams), after fixing two it caught (a relative path; `layout.ts` resolving to another file).
  Positive control: `ColonyWithFacts` broken to `…Factz` → the pass count fell 6 → 5 and the run FAILed; restored.
- Reuse checks (check 6), each ADDED change against its nearest neighbour:
  C1 — `ls apps/web/public` (no such dir), `grep -rn "manifest" apps/web/src` for art: none; nearest is the spike's
  `publish-look.sh`, which C1 grows into. C2 — `grep -rn "ColonyGrounds\|grounds/" packages apps` and
  `find -iname "*grounds*"`: only `packages/engine/test/colony-grounds.test.ts` (rules, not drawing); nearest is the
  mock's `Scene.tsx`, grafted (fill_scaffold), not rebuilt. C3 — nearest `terrain/landscape.ts`: reuse rejected,
  palette and worker closed (HC-4); its `noise.ts` and `PictureCache` are reused. C4 — nearest `look/Living.tsx`
  (scaffold). C5 — nearest `components/Colony.tsx::useMonthEndDrift`: happiness only, per gauge, not per project.
- Goal alignment: C1–C5, C7, C8 serve G-1/G-2 as stated; C6 is the data G-1 needs in a real game (no orphan).
- Landmines from memory: cross-lane edits go via the PM (C6, C7, C8 are routed, not taken); a build PR flips the
  rulebook's `#colony-grounds-look` to "In the game" in the same PR (plan task).
