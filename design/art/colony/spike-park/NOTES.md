# Park spike, option (c): Blender Cycles render + real-time glb

Everything is built by `park.py` from `park-spec.json` and the CC0 downloads in `fetch.py`. Nothing was hand-placed.

```
python3 -I fetch.py "$PWD/assets"                                     # downloads, skips files already present
Blender -b -P park.py -- "$PWD" 256 day,dusk 100 1                    # both renders, then the glb  (~3 min)
Blender -b -P rt_preview.py -- "$PWD" day|dusk                        # EEVEE look at the glb
```

## Outputs (`out/`)

| File | What |
|---|---|
| `park_day.png` | 1600×1200, transparent, Cycles at 256 samples, denoised |
| `park_dusk.png` | same camera, dusk |
| `park_rt.glb` | the phone version: **116,853 triangles drawn, 16 draw calls, 13 nodes, 7.55 MB**, no cameras or lights |
| `park_rt_preview_day.png`, `park_rt_preview_dusk.png` | the glb rendered in EEVEE from the same camera, standing in for WebGL. The dusk preview adds one point light per globe, as the page would |

`park.glb` and `park_render.png` are the previous lane's weaker build; this build replaces them.

## What was built

The build follows the current `park-spec.json`: lamps at ±2.2, trees 5.5 m and 4.2 m, a kidney-shaped pond, and the sun from the west-south-west. I changed only materials and light.

- **Slab:** a raised rim of pale sandstone paving (Poly Haven `sandstone_blocks_08`) on 0.6 m stone sides. The rim is cut by the four paths, so the gravel runs out to the tile edge. The lawn sits 5 cm below the rim.
- **Ground:** one 5 cm grid. The shader tells lawn from gravel using the same signed distance as the spec (plaza disc plus the path cross), with a ragged noise edge. The lawn mixes two ambientCG photo lawns by slow noise, with patchy brightness and faint mowing stripes. On top are about 420k short grass-blade strands (6.5 cm), with no grass on gravel. The plaza and paths use pale gravel (`gravel_floor_02`).
- **Pond:** a kidney shape, long axis along NW–SE, with its hollow facing the plaza. The NE lamp stands in the hollow, about 0.45 m clear of the stones. The edge radius is an ellipse (1.9 × 1.4) with a 0.75 m bite on the plaza side. The pond is a bowl with a pebble bed (`clean_pebbles`) under a closed water volume (IOR 1.333, rippled surface, absorption only). The shallow rim reads lighter because it has less water over it. The ring of field stones is spaced by arc length and textured with the meteorite's scan.
- **Monument:** `moon_rock_03` stood on its long axis to 1.4 m and darkened to an iron-black crust, on a 0.7 m × 0.35 m stone plinth.
- **Trees:** `island_tree_01` at 5.5 m and 4.2 m (rotated 2.1 rad). The crown now sits inside the frame, with its top at y = 55 px.
- **Hedge:** `shrub_01` is nine 10–40 cm bushes in one mesh. The script splits them and uses the three full ones, six per spot, scaled to 1.0 m, along the north and west edges with gaps at the paths.
- **Flower bed:** a 14 cm stone kerb, dark soil and 183 gazanias on a 17 cm hex grid at 1.9–2.4× scale, so no soil shows.
- **Benches:** `painted_wooden_bench` is a hall settle (1.17 m long, seat at 0.65 m). It is stretched to 1.8 m and lowered to a 0.49 m seat, and faces the plaza.
- **Lamps:** a 2.4 m slim dark-metal post with a 32 cm globe. By day the globe is milky glass. At dusk it is pure emission plus a 70 W warm point light. As a lit surface, the globe would catch its own light 16 cm away and burn white.
- **Light:**
  - **Day:** the sun is in the west-south-west (compass 250°, the camera's left) at 35°, warm. It lights the near-left faces and throws shadows back-right. The sky HDRI provides fill and is turned 180°, with its own sun clamped out.
  - **Dusk:** the sun is in the same quarter at 5°, orange; the sky is at 9% strength and tinted blue; the lamps are lit.
  - Both use AgX Medium High Contrast.

### Findings worth knowing

1. **The pond cannot mirror the lamps from this camera.** A 2.4 m globe's mirror image lands about 4 m in front of the lamp. The spec now says this is not required.
2. **Never put the sun in the camera's mirror line over water.** A sun from due NW at 30° elevation, the same angle as the camera, whited out the whole pond. The WSW sun is well clear of it.
3. **Two Blender traps the script now guards against:**
   - glTF imports come in with quaternion rotation, so `rotation_euler` is silently ignored. The script sets `rotation_mode` to XYZ on import.
   - Adding a volume scatter to the water silently drops Cycles closures (more than 64). The water uses absorption only.
4. **The `out/*.glb` pattern in `design/art/.gitignore` only matches `design/art/out/`.** The glbs in this folder are therefore not ignored. That file is outside this folder, so I left it.

## Numbers

| | |
|---|---|
| Render time, 256 samples, 1600×1200, M5 Max / Metal, denoised | day **22.2 s**, dusk **23.1 s** |
| Full scene (Cycles), without grass strands | **7.50 M triangles**: tree 1.60 M per instance (2 instances), hedge 3.76 M (90 bushes), flowers 422k (183 plants) |
| Grass strands | about 420k ribbon strands (Cycles only) |
| Real-time glb, drawn triangles (every instance counted) | **116,853**: trees 53,130 (both), flower bed 23,742, hedge 17,940, monument 5,598, lamp posts 4,160, globes 3,840, pond stones 2,800, pond bowl 1,920, benches 1,260, plinth 1,148, rim 912, ground 309, water 94 |
| Draw calls | **16** (13 merged meshes; trees and flower bed have 2–3 materials each) |
| glb size | **7.55 MB**: 0.93 MB textures, 14 maps all at most 512 px (12 JPEG, 2 PNG where the leaf and shrub cutouts need alpha), the rest geometry, no Draco. Draco would cut the geometry roughly 5×, if the page enables the decoder |
| Whole build (both renders, bakes, export) | about 3 min |

## The real-time version: what replaced what

- **Tree: leaf cards around a decimated trunk and main limbs. The photo-scan is not decimated.** Its 44,168 leaves (24 triangles each) are redrawn as alpha-tested cards: 22% of them are kept, and each one's UV-to-3D affine map is fitted so a single quad (2 triangles) covers exactly that leaf's texture region, 1.8× larger to keep coverage. The cards get canopy-shaped normals, blended 65% outward from the crown centre, so the crown shades as one soft mass. The 500k triangles of twigs are **dropped**: they were the flat bark "planks" in the earlier export. The trunk material, which holds the trunk and main limbs, is decimated to 20%. Result: about 26.5k triangles per tree.
- **Hedge:** half the bushes are kept and grown 25%. Each bush is redrawn with the same one-card-per-leaf method (36% of leaves), and the whole hedge is merged into one mesh and one draw call.
- **Flower bed:** a top-down render of the packed bed, lit by a plain white sky (albedo plus soft occlusion, no day or dusk light baked in), sits on the soil disc. The tallest third of the plants stay as 3D, decimated to 15%. Kerb, soil and plants are merged into one mesh.
- **Pond stones, lamps, benches, rim:** each group is merged into one mesh.
- **Ground:** albedo and normals are baked (downscaled to 512). The lawn is tinted to match the grass strands it loses. The flat grid is dissolved to 309 triangles.
- **Water:** a surface only (dark, roughness 0.08, specular 0.3). With an environment map alone, full-strength water reflects white sky, so the page should give it a reflector material.
- **Lamps:** the globes export as emissive (`emissiveStrength` 6, warm), ready for bloom. The page adds point lights at dusk and dims the globes by day.
- **Textures:** roughness and metal maps are dropped in favour of constants, normals are kept only where they carry shape (stone, trunk, ground), and every map is at most 512 px. The scan's unused colour layers and second UV map are stripped; they were 1 MB.

## Assets (all CC0)

| Asset | Source |
|---|---|
| island_tree_01 | https://polyhaven.com/a/island_tree_01 |
| painted_wooden_bench | https://polyhaven.com/a/painted_wooden_bench |
| shrub_01 | https://polyhaven.com/a/shrub_01 |
| moon_rock_03 | https://polyhaven.com/a/moon_rock_03 |
| flower_gazania | https://polyhaven.com/a/flower_gazania |
| sky: kloofendal_48d_partly_cloudy_puresky (2k HDR) | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky |
| gravel_floor_02 (plaza, paths) | https://polyhaven.com/a/gravel_floor_02 |
| sandstone_blocks_08 (rim, slab sides, kerb, plinth) | https://polyhaven.com/a/sandstone_blocks_08 |
| clean_pebbles (pond bed) | https://polyhaven.com/a/clean_pebbles |
| Grass001, Grass004 (lawn; Poly Haven has no mown lawn) | https://ambientcg.com/view?id=Grass001 , https://ambientcg.com/view?id=Grass004 |
| concrete_panels (colony facades; its normal map gives the hospital's panel joints) | https://polyhaven.com/a/concrete_panels |
| white_plaster_02 (fetched; replaced by a clean flat panel material, because its grime read as neglect) | https://polyhaven.com/a/white_plaster_02 |
| metal_plate_02 (rooftop plant) | https://polyhaven.com/a/metal_plate_02 |
| box_profile_metal_sheet (stadium cladding) | https://polyhaven.com/a/box_profile_metal_sheet |
| square_concrete_pavers (forecourts and plaza) | https://polyhaven.com/a/square_concrete_pavers |
| hangar_concrete_floor (launch pad) | https://polyhaven.com/a/hangar_concrete_floor |

`assets/baked/` holds the three maps the script bakes (ground diffuse, ground normal, flower bed). They are regenerated on every run.

## Effort estimate: one more building done this way (for example, a Hospital)

The park needed no modelling, only placement of library assets. A hospital is different: no CC0 library has one, so the standing model is the real cost. The pipeline from this spike carries over unchanged and does not count again: camera, light rig, slab and ground, render, and the real-time export with texture slimming and the preview. That covers both views and the phone glb. The hours below are for a capable 3D generalist, or an agent scripting geometry the way this park was scripted, at the quality bar of these renders.

| Stage | Hours | Derived from the standing model, or its own modelling? |
|---|---|---|
| **Standing** (the base) | **16–24** | Own modelling: massing, facade modules (windows, entrance canopy, ambulance bay), roof plant, signage, CC0 plaster/glass/metal materials, interior glow cards for dusk windows. Real-time LOD and bake take another 2–3 h. |
| **Site with stakes** | **2–3** | Mostly derived: the same slab and ground with an earth/dirt material swap. The small new kit (stakes, string lines, survey flags, a spoil heap) is reusable for every building. |
| **Under construction, scaffold** | **6–10 the first time, 2–3 after** | Partly derived: the standing model cut at a floor height, plus bare concrete and rebar material swaps. The scaffold needs its own work: a procedural tube-and-plank generator wrapped round any footprint, written once and reused for every building. A crane is extra (CC0 crane models are scarce, about 4 h). |
| **Closed / dark** | **1–2** | Derived: lighting and material change (window emission off, boarded-window and shutter swaps, signage off, a weeds and litter scatter). No modelling. |
| **Damaged / smoking** | **4–6** | Derived plus parts: broken-glass and scorch material swaps, a rubble scatter, one collapsed roof corner (a little modelling). Smoke is a Cycles volume in the render; on the phone it is a particle/sprite effect in the page, about 2 h of page work not counted here. |
| **Total for one building, all 5 stages** | **about 30–45 h** the first time; **about 25–35 h** for each later one once the stake kit and scaffold generator exist | |

For comparison, this park (spec to delivered renders, glb and these notes) took one agent session of about an hour of wall-clock time. All of that time went into assembly and look development, with none spent on modelling.

## The whole colony (`colony.py`)

`colony.py` runs `park.py` up to its render step, which gives it the park plus every helper, then builds the rest of the first ring:

```
Blender -b -P colony.py -- "$PWD" 256 day,dusk 100 colony   # out/colony_day.png, out/colony_dusk.png (~1.5 min)
Blender -b -P colony.py -- "$PWD" 256 day 100 stages        # out/hospital_stages.png (~20 s)
Blender -b -P colony.py -- "$PWD" 16 dusk 50 rt             # out/colony_rt.glb (needs out/park_rt.glb)
Blender -b -P rt_preview.py -- "$PWD" day|dusk colony       # EEVEE look at the glb
```

**Layout.** Place (col, row) sits at (12·col, −12·row). The town hall is at (0,0) and the park at (1,0), moved there unchanged. Hospital (0,1), observatory (1,1), stadium (−1,0) and spaceport (0,−1) follow.

- **Places and plaza:** each place sits on a park-style slab (sandstone rim and sides, worn square pavers). The ring stands on a lower plaza apron, 2.5 m wide, also worn paving, with six dark concrete planters holding shrubs.
- **"Room to grow":** the three bare places are rough ground with grass coming through, four orange survey stakes for a future footprint, and loose stones.
- **Lamps:** twelve 3 m lamps stand on the walkways between places, each with a warm point light.
- **Terrain skirt:** the planet's ground (photo lawns, earth and pebbles mixed by noise) runs flat at apron level, then rolls. It fades to transparent in a screen-space ellipse toward the frame edge, with 16 trees and rocks scattered inside the fade.
- **Props:** an ambulance beside the hospital canopy, a six-wheeled rover and crates at the spaceport.
- **Camera and light:** the same angle and centre, with ortho widened to 63 m; output is 1920×1080. The sun is WSW by day.
- **Dusk is a blue hour:** a cool sky fill and a grazing sun, with about 72% of window bays lit warm at varying brightness.

**Shared building kit.** About 200 lines, written once:
- `modern()`: per floor, a solid spandrel band, then a glass band recessed 28 cm with real mullions every 1.4 m and a transom. On top, parapets and a roof membrane.
- `rooftop()`: plant boxes with fans. `canopy()`: an entrance canopy with an accent fascia. `lamp()`.
- A glass shader that lights a random half of the bays warm at dusk, one random draw per bay and floor.

**The buildings** (massing from layout.ts):

| Building | What it is | Accent |
|---|---|---|
| Town hall, 7.4 × 7.4 × 5 m | one tall floor; a deep portico of six columns on its east face (the face the camera sees over the low park), stone steps, a gold plaque, a flag on a 9 m pole | blue |
| Hospital, 7.9 × 7.9 × 7 m | two floors in clean white panels, red crosses on both visible parapets, an entrance canopy with a red fascia, a rooftop helipad | red |
| Observatory, 6.7 × 6.7 × 5.5 m | a drum and a 2.5 m metal dome, with its slot cut by a boolean to face the camera; a telescope tube in the slot; a blue band | blue |
| Stadium, oval 10.3 × 8.2 × 2.6 m | outer wall in box-profile cladding with an orange band; six stepped rings of teal and white stands; a striped pitch with lines and centre circle; four 8 m floodlight masts with real spot lights | teal, orange |
| Spaceport | a 9.6 m launch-concrete pad with lit orange marks and a scorch; a 7.5 m rocket (body, band, interstage, nose, four swept fins, engine bell, four-leg mount); a 10.8 m lattice service tower with X-braces, an access arm and a beacon; a blockhouse | orange |

**Hospital stages** (`hospital_stages.png`, 1920×480): one `hospital(stage=…)` function.

| Stage | What it shows | Derived or its own kit |
|---|---|---|
| Site | graded earth, stakes every 2 m, string outline, survey flags, spoil heaps, a site cabin | own small kit, `site_stakes()`, reusable |
| Building | ground floor glazed, upper floor a bare concrete frame (the `upto` option of `modern()`), a scaffold wrapped round the footprint, a tower crane | own kit, `scaffold()` and `crane()`, reusable for any footprint |
| Standing | the full building | the base |
| Closed | dead glass, greyed facade, faded crosses, a boarded ground floor, a site fence | derived: material swaps plus a few boxes |
| Damaged | a noise-displaced boolean bites the upper south-east corner out of every part it touches; rubble; an ember glow and light inside the break; a volumetric smoke column | derived: one cutter, rubble scatter, a smoke volume |

**Phone version** (`colony_rt.glb`, rebuilt after the polish):
- **Budgets:** 164,797 triangles drawn (budget 300k), 10.06 MB (budget 12 MB), 83 draw calls over 21 meshes.
- **What it contains:** the park's own phone build plus one merged mesh per building, the plaza, the terrain, and the lamp globes. Textures are at most 512 px, plus the 1k baked terrain.
- **What does not carry over:**
  - **Scanned plants and rocks:** the skirt and forecourt trees, the planter shrubs and the loose rocks are left out. They are 1.6M or 5.6k triangles a copy; only the park's two card trees ship.
  - **Terrain fade:** the terrain ships as a coarse grid cut to the fade ellipse, with its ground baked to one map. Its rim is stepped, so the page should fade it with fog or a vignette.
  - **Window lighting is uniform.** The random per-bay lighting is procedural, so `window_glass` ships evenly lit (emissive 0.6, warm), like the signs and globes. The page must set those emissives to 0 by day.
  - **Wear on the paving is dropped**, along with the noise mixes on the bare places.

### Measured effort: the colony

These are wall-clock times from `date -u`, for one agent session working in parallel with nothing else. **These are agent minutes, not human hours.** They are the evidence for "what an agent costs per building", and they measure building this pipeline, not an artist's.

| Step | From → to (UTC, 6 Nov) | Minutes |
|---|---|---|
| Read brief, pick and fetch 6 CC0 textures, hook `park.py` for reuse | 14:20 → 14:22 | 2 |
| Write `colony.py`: shared kit plus all 5 buildings, first render | 14:22 → 14:26 | 4 |
| Two look passes (glass too dark, facades brown, portico onto the visible face, grey pavers, forecourt trees, signal-only glow) | 14:26 → 14:31 | 5 |
| Final day and dusk at 256 samples (2 × 28 s render) | 14:31 → 14:34 | 3 |
| Hospital closed and damaged stages, three fix passes (boolean solver, bound boxes, smoke and embers), final render | 14:34 → 14:41 | 7 |
| Real-time export, two fixes (dome slot cutter, lit windows), previews | 14:41 → 14:43 | 2 |
| **Total: ring of 5 buildings, both renders, 5-stage strip, phone glb** | **14:20 → 14:43** | **23** |
| Polish pass: 12 walkway lamps, worn paving and planters, room-to-grow places, terrain skirt with fade, blue-hour dusk, ambulance, rover and crates; two look passes; final renders | 14:44 → 14:50 | 6 |
| Phone glb rebuilt for the polish (terrain bake, dropping the scanned extras) | 14:50 → 14:51 | 1 |

Per building, as a share of the build, by size of its code:

| | Lines | Share of the ~9 min of building and look passes |
|---|---|---|
| Shared kit (modern block, glass, rooftop, canopy, lamp, slab) | ~200 | ~3 min, paid once |
| Town hall | 34 | ~1 min |
| Hospital, standing | ~45 | ~1 min |
| Observatory | 42 | ~1 min |
| Stadium | 81 | ~1.5 min |
| Spaceport | 82 | ~1.5 min |
| Hospital, 4 extra stages | ~165 (site, scaffold, crane, closed, damaged) | ~7 min including fixes |

**How to read these numbers.**
- **What the speed bought:** clean, readable massing, buildings that read as what they are, real window, parapet and canopy geometry, and convincing dusk lighting. At this camera distance (about 32 px/m) that is what shows.
- **What it did not buy:** hero-art detail up close. There are no interior props behind the glass, no weathering or grime maps, and no signage text. The bench and hedge are still the park's library assets.
- **A human artist modelling the same buildings to the same bar** would take roughly the hours in the estimate above (about 16–24 h for one standing hospital). The agent is fast because every building is composed from the same parametric kit. That is also its limit: the buildings share one architectural language and differ in silhouette and accent, not in hand-made detail.
- **The real cost driver is look review:** each pass costs a render and a human or agent judgement. The stage strip needed three passes for one building, because the boolean and smoke failed silently until they were looked at.
