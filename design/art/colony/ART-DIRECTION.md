# The colony grounds — art direction (WS10)

**Status:** Heiko ruled direction **C** on 6 Nov 2026: each building is modelled once in Blender and shown as a
pre-rendered picture, with a live layer drawn over it; the same models become live 3D on the TV later; the world
map's painter draws the ground. Our own builds with free (CC0) assets, dressed with props from the free KitBash3D Mission to Minerva kit (Heiko, 6 Nov, spec AM-5).
Evidence: `design/mocks/colony-grounds/look.html` (the whole colony, the Park three ways, the live layer) and the
spikes in `spike-park/`.

## 1. What the picture must do

The grounds are the colony's portrait. A glance at the TV answers three questions without reading a number:
**how rich are we** (how much stands, how much is lit), **how happy are we** (people out, lights on, flags up), and
**what changed this month** (the month-end move). Every rule below serves one of those three.

## 2. The camera — fixed, shared by every picture

| | |
|---|---|
| Projection | Orthographic, **2:1 dimetric**: 30° elevation (Blender camera rotation 60°, 0, 45°), looking from the south-east |
| Place | One grounds place is a **12 m square**; place (col, row) sits at Blender (x = 12·col, y = −12·row) |
| Frame per place | **1600 × 1600**, ortho scale 21 m, the place's centre at pixel **(800, 1000)** (camera `shift_y`) ⇒ a place is **1293 px** wide and there are 1000 px (≈ 15 m at the centre, ≈ 10 m at the back corner) of height room. Every building picture shares this frame, so pictures composite by position alone. (The spike used 1600 × 1200 centred, which leaves only ≈ 9 m: enough for the Park, not the Spaceport tower.) |
| Shipped size | Rendered at 1600 × 1600; shipped as WebP at 800 wide (the TV, 2× a place's ~400 px) and 400 wide (the phone) |
| Large kinds | **Footprint in proportion to real size** (Heiko, 6 Nov): the Stadium and the Spaceport are **2×2 places** (WS7's ruling, #538 RULE-32b); the rest 1×1. A 2×2 frame is **3200 wide**, same scale, its centre on the footprint's centre. |
| Tall kinds | **The Spaceport's rocket is the colony's dominant vertical (Heiko, 6 Nov: "an impressive, big rocket, not a toy").** About **36 m** (three places tall) on a gantry that reads shorter than it. Its pictures use a tall frame: **1600 × 3200**, the place centre at **(800, 2600)** — same scale, same camera, ≈ 39 m of room. The manifest carries a frame per kind, so the compositor places it like any other. It overlaps the places behind it in painter's order, as a real rocket would. |
| Compositing | Back to front by col + row (painter's order), as `Scene.tsx` does. Shadows a building throws onto a neighbouring place are lost; each place's own slab carries its shadow. Accepted. |

Never change the camera per building. One camera is what lets 70 pictures sit together as one place.

## 3. Light

- **Sun from the west-south-west** — the camera's left: azimuth ≈ 250°, elevation 35° by day. The near-left faces
  are lit, shadows fall back and to the right. (Not the world map's north-west: from this camera that leaves every
  visible face in shade.)
- **Day:** warm sun (≈ 5 500 K), sky HDRI fill (Poly Haven `kloofendal_48d_partly_cloudy_puresky`, its own sun clamped out).
- **Dusk:** the blue hour, not sunset-brown: sun 5° from the same side, orange; sky fill cool and dim; shadows go blue.
  Dusk is where wealth shows, so it is the hero light.
- **Glow layer:** every emissive source (windows, lamps, signs, pad lights, floodlights, embers) is also rendered
  **alone, additive, on black** — the live layer fades it per building by wealth and mood (§7).
- **Dusk base pictures read lit on their own** (AM-7, 7 Nov): every occupied pane glows warm (~2 700 K), lamp
  globes and signs are on, and a warm shadowless fill lifts each layer's own ground; the lamps' light pools and the
  brighter lit share of the windows stay in the glow layer, as wealth's extra. Empty, closed and damaged glass stays
  dark. Calibrated against look.html's colony at the page's glow opacity for wealth 2000 (0.625).
- **Light pools on the paving** (art3, 8 Nov): each layer's glow pass lights the paving round its own base with
  point lights at the footprint's corners (`lib/frame.py` `pools`, `POOL` 70 W, env `COLONY_LAYER_POOL`); for that pass
  the shadow catcher becomes a paving material that fades out 2.5 m beyond the footprint (`paving`, `POOL_REACH`), so a
  pool rises with wealth and never shows a hard edge.
- **Dusk grass is a hue, not a brightness** (art3): the plate's dusk-only tint `COLONY_DUSK_GRASS` "1.9,0.92,0.25"
  (`plate.py`, through `core.DUSK`) takes red/green 0.54 → 0.91 and blue/green 1.01 → 0.82 against look.html's 0.77/0.77.

## 4. Palette and materials

- **Architecture:** near-future frontier civic — board-formed concrete, pale stone cladding, dark glass with real
  mullions, brushed-metal panels, flat roofs with plant. Clean, built, a little weathered; never glossy sci-fi.
- **One accent per building**, used on signage, a canopy edge and a roof element only:

| Building | Accent | Token it echoes |
|---|---|---|
| Town hall | holo cyan banding + the colony flag | `--color-holo` |
| Park | lawn green, warm lamps | `--color-ok` |
| Hospital | red crosses | `--color-g-medicine` |
| Observatory | crystite violet slot light | `--color-g-crystite` |
| Stadium | teal stands, white floodlights | `--color-g-alloy` |
| Spaceport | safety orange gantry | `--color-g-electronics` |

- **Glazing reads as windows, not a sheet** (art3): the Hospital's panes sit 0.12 m inside the facade (`hospital.py`
  `INSET`) in mid-grey frames (`FRAME`, 0.40/0.41/0.42), so each window catches its own reveal shadow by day.
- **Ground:** paving and lawns come from the map painter (§6), so the grounds and the planet map read as one place.
- **Textures:** CC0 (Poly Haven, ambientCG), ≤ 1k in renders' source, ≤ 512 px in the real-time glb.
- **Mission to Minerva props** (Heiko's ruling, 6 Nov): Spaceport apron (landing pads, control tower, cranes, tanks,
  haulers), garden modules, rooftop dishes, construction scaffolding, rubble. Buildings and the rocket stay our own
  builds. The kit stays outside the repo (`KITS_DIR`, Heiko's `/Users/heiko/.kitbash3d/kits`). **Licence confirmed by
  Heiko, 7 Nov:** kit-dressed rendered pictures ship; raw kit files (USD, textures) never enter the repo or anything
  published. Rebuilding the pictures needs that folder. No real-time glb from kit parts without a new licence check.
  No purchases. NASA models only as a reference unless a per-model licence check passes.
  Heiko, later on 6 Nov: **as much kit dressing as fits at our scale**, everywhere (stages, apron, plants, hall). Every
  picture gets a kit-dressed twin in `out/kit/`; shipping them is one flag (`SRC=out/kit publish.sh`), cleared 7 Nov.

## 5. Scale and detail

- A person is **1.7 m**, a bench 1.8 m, a lamp 3 m, a storey 3.5 m. Nothing at the wrong scale — scale errors are
  what make a model read as a toy.
- **Detail lives in silhouettes and edges** (parapets, canopies, rooftop plant, the dome slot, the gantry), not in
  texture noise: at TV size a place is ~300 px wide, so a window frame is 1 px. Readable at 400 px wide or it is cut.
- Every building must be **recognisable by silhouette alone** at the phone's 200 px place width.

## 6. The ground — a rendered base plate (spec AM-7; supersedes the world map's painter)

- The grounds' land is one **base plate** rendered in this same camera and sun: ground, grass and dirt, paths, kit
  vegetation, the unbuilt places as graded ground, a vignette at the edge; day, dusk and glow. No black void, no flat
  brown, no SVG ground or cone trees once a plate is in the manifest.
- Buildings are rendered **flush** (no raised slab) over a Cycles **shadow-catcher** plane, so each layer carries its
  own contact shadow onto the plate; shadows cast onto a neighbouring building are dropped.
- The bar is look.html's whole-colony render, framed as tightly; the TV gets @1600 variants.
- A free place reads as **"room to grow"**: rough graded ground with a few survey stakes — never empty paving.
- No "next place" outline: the grounds cannot know it without computing WS7's rule (spec AM-4).

## 7. The live layer (drawn by the page, over the pictures)

| Signal | Source in `MuleView.colony` | What the layer does |
|---|---|---|
| Wealth | `gauges.wealth` | Glow layer opacity per building: dim when poor, fully lit when rich; lamps along the paths light in growth order |
| Mood | `gauges.happiness` + band | Colonists on the paths (0 at strike, up to ~14); the hall's flag up at ≥ 50 |
| Air | `gauges.environment` | A haze over the grounds as it worsens |
| Stage | `projects[].stage` | Which picture; smoke sprites over `damaged`; sparks and a work light over `building` |
| This month | month-end diff | Dusk falls, the camera leans in on what changed, its lights come on one by one, then back out (~5 s) |
| Weather | events | Rain / dust overlays (later) |

The layer never redraws a building. If something needs a new shape, it is a new picture.

**Colonists are sprite sheets** (Heiko's pick, 8 Nov: Astronaut A, CC0, poly.pizza 3hC2i0CTuO). `spike-colonists/walk.py`
renders a rigged walk in the shared camera and light (§2, §3) on a shadow catcher: 4 headings (+x, +y, −x, −y) × 12
frames, a 192 × 224 cell with the feet at (96, 197), 1.75 m tall. `COLONY_WALK_TINT="<suit>,<trim>"` renders those two
materials neutral grey and adds a mask sheet (suit red, trim green, once with the day light); the player colours (the
suit) and a palette of three (the helmet and trims, in place of hair) are laid through the mask offline, with an outline
sheet (alpha dilated minus alpha) for the ghost behind a building. They walk at 1.3 m/s.

## 8. Stages — one model, derived variants

| Stage | How it is made | Shown when |
|---|---|---|
| Site (`commissioned`) | Shared site kit: graded earth, stakes on a string outline, survey flags, spoil heap, cabin | Funding, not started |
| Under construction (`building`) | The standing model cut at a floor, bare concrete frame, shared scaffold generator + crane | 1 picture; 2 (⅓, ⅔) for 3-month buildings |
| Standing | The model | Standing |
| Closed | Standing + grey facade, dead glass, boarded ground floor, site fence | Upkeep missed |
| Damaged | Standing + bitten corner, scorch, rubble; ember in the glow layer; smoke is live | Event damage, until repaired |

Note: WS7's pace measurement is weighing `buildMonths → 1` (SEAMS 14:07Z). If that lands, every building shows one
under-construction picture for one month; the asset list below already allows for it.

## 9. Real time later (the TV)

The same `.blend` exports a glTF per building × stage: ≤ 150k drawn triangles, ≤ 100 draw calls, ≤ 8 MB, textures
≤ 512 px, emissives as materials. Trees as leaf cards over a decimated trunk (decimating a scanned tree shreds it).
Proven in `spike-park/out/park_rt.glb` (117k / 16 draws / 7.55 MB).

## 10. Files and naming

```
design/art/colony/<kind>/<kind>.py           the building's model + its stages (one function, a stage argument)
design/art/colony/lib/                       camera, light rig, slab, site kit, scaffold + crane generators
apps/web/public/art/colony/<kind>/<stage>-<light>@<w>.webp
    kind  hall | park | hospital | observatory | stadium | spaceport
    stage site | build1 | build2 | standing | closed | damaged      (hall: standing — one picture until WS7 rules tiers;
          the manifest keys only RULE-1 stages, T-AC-2 holds it)
    light day | dusk | glow
    w     800 | 400
apps/web/public/art/colony/manifest.json     every picture, its frame and its anchor — the view reads only this
```
