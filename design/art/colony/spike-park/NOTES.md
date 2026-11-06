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
