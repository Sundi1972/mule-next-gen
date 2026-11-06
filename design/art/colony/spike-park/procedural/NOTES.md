# Option (a): the Park painted the world map's way

Files: `park.ts` (scene + renderer), `png.ts` (a 40-line PNG writer, so nothing is installed),
`park_day.png`, `park_dusk.png` (1600×1200, transparent background, same camera as `../out/park_render.png`).

Run from the worktree root: `node design/art/colony/spike-park/procedural/park.ts [ss]` (Node 24 strips the
types; `ss` = supersampling per axis, default 2).

## Method

What is taken from the map (`packages/ui/src/terrain/landscape.ts`, `noise.ts`), unchanged:

- **The noise.** `noise`, `fbm`, `ridged`, `cells`, `hash2` are imported straight from `noise.ts`.
- **The palette.** LIGHT is copied value for value (it is not exported); DARK is the map's own transform
  (`r×0.34, g×0.4, b×0.48+0.03`, the same water/foam overrides, ambient 0.42 / diffuse 0.62, cyan contour).
  The park adds a few colours the map never needed (bark, painted wood, lamp metal, gazania petals), kept muted.
- **The light.** The map's vector `[-0.62, -0.7, 0.55]` (sun from the north-west, ~30° up) and its
  `ambient + diffuse × lambert` model; the map's clouds by day, its contour lines (every 25 cm here) at night.
- **The materials' recipes.** Lawn = the map's plains patchwork + mown stripes; tree crowns and hedges = the map's
  forest formula `crown = 1 − smooth(0.05, 0.62, cells(…))`, forest→canopy colour by crown; the meteorite =
  `ridged` crests + Worley pits + the crater's purple glints; the pond = the map's shallow/deep mix, ripple,
  sparkle and bright foam edge.

What had to be added, because the map is only ever seen from straight above:

1. **A height field + material per point** on a 12 m grid (1846² at ss 2, ~6.5 mm a cell): slab and rim setts,
   lawn, gravel cross and plaza (pebbles from `cells`), plinth, meteorite, pond and its stone ring, flower bed
   with kerb, hedges, benches, lamp posts, root flares.
2. **An iso camera.** Each grid point is splatted as a vertical column (its top down to its lowest of eight
   neighbours; the slab's edge down to its foot) into a z-buffer — the old voxel-landscape trick. This gives the
   slab its visible thickness and every hedge, bench and post real sides.
3. **Wall shading.** Tops take the height field's gradient as normal; walls take a normal sampled on a ring of 16
   points ~4 cm round them (one-cell stencils show the grid's staircase as stripes), and a colour function of the
   3D point (stone courses, bark, the bench's slats and the dark gap under its seat).
4. **Floating parts.** A height field cannot hold anything with air under it, so tree crowns, lamp globes and caps
   are spheres ray-intersected per pixel, with a 3D Worley relief (`cells` lifted to 3D in this file) moving the
   surface and tilting the normal; trunks and limbs are chains of spheres so they taper and lean.
5. **Cast shadows.** A second splat of everything from the sun (1.4 cm texels), 3×3 soft taps. The map has no cast
   shadows; without them nothing here stands up.
6. **Ambient occlusion** from a blurred top-down "what stands over me" map (land + crown undersides).
7. **Dusk extras.** Warm light pools from the four globes (re-lighting the day colours), a halo round each
   globe, the slab's top edge drawn as a hologram line (as the map rings the store's pad), contours on the
   slab's sides, plinth and meteorite.

## Paint time (Apple M5 Max, one thread, Node 24)

| Image | Warm | First paint (cold JIT) |
|---|---|---|
| 1600×1200, ss 2 (3200×2400 internal) — the delivered PNGs | **≈ 3.8–4.2 s** | 5–10 s |
| 1600×1200, ss 1 (no supersampling; nearly as good) | **≈ 1.7 s** | 2.7 s |

Split at ss 2 (warm): grid 1.0–1.1 s · splat 1.1 s · shadow map 0.35 s · AO 0.1 s · shading 1.2 s.
Some runs were slower (up to 8.9 s) while other spikes were rendering on the same machine; the figures above are the
quiet runs. With the map's own estimate of a phone 4–6× slower: **7–10 s per image at ss 1, 15–25 s at ss 2**.
Cost scales with pixels, so a grounds tile drawn ~400 px wide at 2× density would be ≈ 0.4–0.6 s here, 2–3 s on a
phone — fine for a picture painted once in a worker and cached (as `landscape-painter.ts` does), not for anything
that animates.

## What it does well

- **It looks like the map's hand.** Same greens, same flat-ish ambient-heavy light, same grain, same
  Worley-crown foliage, same cyan contour accent at night. Next to the world map it would not look imported.
- Ground-level things are excellent and cheap: gravel, setts, the lawn's patchwork, the pond and its stone ring,
  the flower bed (full of gazania heads from one `cells` call), the hedge. These are exactly what a height field is.
- The slab reads as a solid object: thickness, stone courses, a crisp lit top edge.
- **Everything is a parameter.** Moving the pond, adding a tree, changing the season (palette), night, damage,
  is code, not a re-render of assets. Day and dusk are the same scene with the map's two palettes.
- Deterministic and asset-free: a few hundred lines, no downloads, no GPU.

## What it does badly

- **Anything with air under it or a thin part.** The trees are the weak point: stylised "cauliflower" crowns made of
  noisy spheres, no visible branches, no light through the canopy (a little faked transmission keeps them from
  going black). Benches are solid boxes with the gap under the seat *painted* on; they read as benches at this size
  but not up close. Lamp posts are fine because they are just thin columns.
- **The sun from the north-west lights the side the camera does not see.** The camera looks from the south-east, so
  every wall, hedge face and crown facing us is in the shade side; the picture leans on ambient. (Note for the
  comparison: `park.py` sets its sun to rotation (50°, 0, 35°), which shines *from the south-east*, so the Blender
  render is front-lit despite the spec's "sun from the north-west" — the two images are not lit alike.)
- No reflections worth the name: from this camera the pond cannot see any of the lamps (they are all south-west of
  it, the reflected view looks north-west), so "the pond reflects them" does not happen; it only darkens and
  ripples. Water is coloured, as on the map, not reflective.
- Silhouettes are aliased unless supersampled (ss 2 doubles to quadruples the time).
- The 7 m tree's crown pokes ~25 px above the top of the 1600×1200 frame. That is the spec's camera (ortho 21 m);
  the Blender render would clip it too.
- Every new kind of object is new code and new artefacts to chase (the column splat left holes in walls on
  staircase edges until the eight-neighbour fix; one-cell normals striped every curved wall). It is a renderer you
  own, not a tool.

## Tall buildings (a Hospital, a Spaceport) — honestly

A multi-storey building is *mostly* a height field: its footprint extruded, a flat or pitched roof, a dome — the
splat draws those with clean walls already (the slab and plinth prove it). What does not fit:

- **Facades are 90% of what you see** in this view, and they are walls, so all their detail must come from a
  painted wall function: storeys, window grids, doors, signage, the red cross, lit windows at night. That is doable
  and stays in the map's flat style, but every facade is hand-written code, not modelling.
- **Overhangs**: eaves, balconies, canopies, the Spaceport's gantry arms, a crane's jib — need floating primitives.
  This file only has spheres; boxes and cylinders (ray-intersected per pixel and splatted into the shadow map) are
  the next step.
- **Lattices** (scaffolding, gantry, radio mast): see-through, so either painted marks on a solid mass or many thin
  primitives. Neither looks good up close.
- **Smoke** is a volume; nothing here is translucent. It needs a separate soft-sprite / alpha layer.
- **Time.** A building fills more of the frame with tall walls; expect the same ~1–2 s per image on this machine,
  5–10 s on a phone, per building × stage × theme — painted once and cached it is fine, animated it is not.

### The five stages

| Stage | With this technique | Fit |
|---|---|---|
| Site | flat ground, staked outline, dirt, a few crates — the map's own territory | easy |
| Under construction | a partial-height mass + painted scaffold marks + a crane (needs box primitives) | hard to make good |
| Standing | massing + roof + painted facades + details | doable, most of the work |
| Closed / dark | the same model, windows unlit or boarded, palette dimmed, no lamp light | easy (a shading switch) |
| Damaged / smoking | noise carving holes and rubble into the height field, scorch colour: easy; smoke: a new translucent layer | medium |

### Effort (hours, one experienced developer who already has this file)

| Work | Hours |
|---|---|
| Renderer generalisation: box / cylinder / cone primitives with shadow-map splat, an along-wall coordinate for facades, a translucent sprite layer for smoke, a worker + cache path like the map's painter | 16–24 |
| Hospital, standing (massing, roof + helipad, facades with windows and signage, entrance canopy) | 10–14 |
| Spaceport, standing (pad, tower, gantry, the ship itself, fuel tanks) | 14–20 |
| Per building, the other four stages (site 2, construction 6–10, closed 2, damaged/smoking 5–8) | 15–22 |
| **Two buildings × five stages, after the renderer work** | **≈ 55–80** |
| **Plus the renderer generalisation** | **≈ 70–105 total** |

Every further building is ~25–40 h for its five stages, and the result is stylised and consistent with the map
rather than detailed. If buildings must look *modelled* (real overhangs, glass, rich facades), this technique
stops paying around the "under construction" stage; it is best kept for the ground layer — grounds, parks, paths,
water, plants, damage scars — with buildings drawn another way and lit with the same palette and light.
