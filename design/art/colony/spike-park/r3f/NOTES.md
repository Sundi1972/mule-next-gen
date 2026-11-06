# Spike (b): the Park in real time (react-three-fiber)

One Park tile rendered live in the browser at the grounds' isometric angle, with Day and Dusk, and measured.
This is a throwaway app with its own `package.json`. It is not part of the pnpm workspace.

## Run it

```bash
cd design/art/colony/spike-park/r3f
npm install                      # own lockfile; never pnpm here
npm run dev                      # http://127.0.0.1:8820  (vite --port 8820 --strictPort)
node scripts/shoot.mjs           # writes shots/park_day.png, park_dusk.png, park_phone_dusk.png
node scripts/measure.mjs > shots/measure.json                     # Metal GPU, capped and uncapped
GL=swiftshader node scripts/measure.mjs > shots/measure-swiftshader.json   # software GL, a weak-GPU stand-in
npx vite build                   # bundle size
```

`public/park_rt.glb`, `public/park.glb` and `public/sky_2k.hdr` are symlinks into `../out` and `../assets` and are gitignored.
The page loads `park_rt.glb` if it exists and falls back to `park.glb`.

URL switches (each one defaults to on unless noted): `mood=day|dusk`, `ssao`, `bloom`, `smaa`, `shadows`,
`shadowMap=2048`, `lampLights`, `merge`, `post` (the whole composer), `lawnNoise`, `dpr=2` (the DPR cap),
`tm=aces|agx|neutral`, `frame=21` (metres across the view), `orbit` (default off), `transparent` (default off),
`shot` (hides the buttons), and `model=park.glb`. In the page itself: **Day / Dusk / Orbit** buttons and an fps readout.

## What it is

| Part | Choice | Why |
|---|---|---|
| Camera | Orthographic at (20, 16.33, 20) looking at the origin. 21 m fit across the wider side at 4:3. | This is Blender's (60°, 0, 45°) Z-up camera converted to glTF Y-up. Blender +y (north) becomes three −z. The frame matches `../out/park_render.png` and `park_day.png` pixel for pixel in position. |
| Light | Poly Haven `sky_2k.hdr` as environment (IBL), plus one directional sun from the north-west | Day: high, warm white sun, env 0.5. Dusk: sun 10° high and orange, env 0.18, a blue/brown hemisphere fill. |
| Shadows | One 2048² PCF-soft map fitted to ±10 m (the tile plus a tree's throw) | PCSS (`SoftShadows`) looked no better at this zoom and costs a shader rebuild. |
| Lamps | The glb's `lamp_globe` material (emissive) at 0.4 by day and 14 at dusk, plus 4 point lights under the globes at dusk | The emissive value drives bloom. The point lights light the plaza. |
| Post | N8AO (half-res, medium) → Bloom (mipmap, threshold 2.5) → ToneMapping ACES → SMAA, on a HalfFloat buffer, no MSAA | ACES over AgX: AgX washed the lawn out at this exposure. Raising the bloom threshold stops the sunlit white kerb from glowing. |
| Static merge | At load, every mesh is baked into one mesh per material | The measured glb draws 401 calls unmerged and 63 merged; the 21:27 export went from 743 to 65. On a phone CPU, every hundred calls costs whole milliseconds. |
| Lawn | World-space value noise on flat-colour `lawn`/`grass` materials only | Only matters for `park.glb`, whose lawn is flat. `park_rt.glb` has a textured ground, so the noise does not touch it. |
| Foliage | `BLEND` leaves turned into `alphaTest` cutouts | This fixes sorting, and the shadows come out leaf-shaped instead of square. |

**Transparent background:** it only works with `ssao=0`. N8AO writes colour into the cleared pixels, so you get a white halo, or a red smear at dusk. The shots therefore use a plain **#0b1220** background. That is not a problem for real time, because a live grounds view owns its whole canvas. Transparency only matters for the pre-render route.

**Pinned three@0.175.** With three 0.187, N8AO 2.0.1's half-res path (`depthDownsampleTarget`) crashes in `setupRenderTarget`. 0.175 works with everything else here.

## Which model was measured

**`../out/park_rt.glb` was 5,482,532 bytes, sha1 `7632877a…`, exported 21:48 local.** The final shots and every number below come from this file. The sha was checked before and after the runs, and every run reports 132,059 model triangles. The Blender agent was still iterating: a 9.7 MB export landed at 22:09, after the runs had finished, and it is **not** measured here. It is pre-merged (13 nodes) and over the 8 MB budget. Re-run `scripts/measure.mjs` to measure it.

- It draws **132k triangles per pass and 264k per frame** with the shadow pass. Watch out: an earlier export (21:27) had 75k triangles in unique meshes but drew **423k**, because its nodes reused meshes. A budget counted on unique meshes undercounts.
- Textures: 14 images, mostly 1k JPEG. The PNG cut-outs (leaves and shrub) are the largest. KTX2/Basis would cut both download and GPU memory, since JPEG expands to full RGBA8 in VRAM.
- The 21:27 export had decimated tree twigs that rendered as flat bark "planks". The 21:48 export has fixed this (visible in the shots).

## Numbers

Machine: Apple M5 Max. GL renderer: `ANGLE (Apple, ANGLE Metal Renderer: Apple M5 Max, Unspecified Version)`. Headless Chromium (Playwright 1.56.1) with `--use-angle=metal`, so this is real GPU, not software. Scene: Dusk, the heavier mood (4 point lights and strong bloom). Every effect is on, merge is on, and the full DPR is used. Raw data: `shots/measure.json` and `shots/measure-swiftshader.json`.

### FPS (5 s, rAF-counted)

| Viewport | CPU | vsync-capped fps (p95 frame) | uncapped fps (p95) | draw calls | triangles drawn / frame | time to first frame |
|---|---|---|---|---|---|---|
| 1920×1080 @ DPR 1 | 1× | **60** (16.8 ms) | 441 (4.0 ms) | 63 | 264,151 | 1.3 s |
| 1920×1080 @ DPR 1 | 4× throttled | **60** (16.8 ms) | 460 (5.2 ms) | 63 | 264,151 | 2.2 s |
| 390×844 @ DPR 3 (1170×2532 px) | 1× | **60** (16.7 ms) | 442 (4.1 ms) | 63 | 264,151 | 1.1 s |
| 390×844 @ DPR 3 | 4× throttled | **60** (16.8 ms) | 283 (5.6 ms) | 63 | 264,151 | 2.4 s |

"Time to first frame" is measured from navigation start to the first frame drawn with the model, over localhost: JS parse, glb parse, mesh merge, PMREM of the HDR, and shader compile. CPU throttling at 4× doubles it, because it is all main-thread work. On a phone over 4G, add the download: the 5.5 MB glb, the 5.4 MB HDR (a 1k HDR or a prefiltered KTX2 env would be about 1 MB), and the 0.5 MB JS. That is roughly 3–6 s more.

`renderer.info`, summed over all composer passes: **63 draw calls** (unmerged: 401), **264,151 triangles** (132k colour pass plus 132k shadow pass), 25 shader programs.

### What each effect costs

I could **not isolate per-effect GPU cost reliably on this machine.** On Metal, the whole frame is about 2 ms, of which about 1.3 ms is a fixed browser/compositor floor. On top of that, a Cycles render from the Blender agent was running on the same Mac during the runs. Repeat runs of the same configuration varied by ±0.6 ms. The figures below are single runs and show the ordering only.

| Config (phone viewport, uncapped) | Metal ms/frame | SwiftShader ms/frame |
|---|---|---|
| everything on, DPR 3 | 2.3–2.9 (two runs) | 588 |
| SSAO off | 1.86 | 769 (noise) |
| shadows off | 2.10 | 1111 (noise) |
| bloom off | 1.94 | 526 |
| SMAA off | 2.07 | — |
| lamp point lights off | 2.29 | — |
| whole composer off (MSAA instead) | 1.63 | **182** |
| merge off (401 calls instead of 63) | 2.14–2.63 | — |
| DPR 2 | 1.60 | **244** |
| DPR 2 + 1024² shadows + no SSAO | 1.62 | 370 (noise) |
| DPR 1.5 + 1024² shadows + no SSAO | 1.7 (DPR 1.5 alone) | **119** |

Two things hold across every run, on both backends:

1. **Pixel count dominates.** DPR 3 → 1.5 is a 4× pixel cut, and it gives about a 5× speed-up on software GL.
2. **The post stack as a whole (AO, bloom, SMAA and the HalfFloat buffer) is the second-biggest cost**, at about 3× on software GL. Shadows and the four lamp lights are small at this scene size.

### Bundle

`npx vite build`: **1,548 kB JS minified, 501.8 kB gzip**, in one chunk. By source size the biggest parts are three (≈1.9 MB source), r3f with its reconciler, react-dom, postprocessing, three-stdlib (loaders) and N8AO. If the game client already ships React, the extra cost is about 450 kB gzip. Plain three plus postprocessing without React would be about 250 kB gzip.

### Asset bytes

| File | Bytes |
|---|---|
| `park_rt.glb` (measured, 21:48) | 5,482,532 (5.2 MiB) |
| `park_rt.glb` (22:09, not measured) | 9,749,592 |
| `park.glb` (older, unused for the numbers) | 39,015,740 |
| `sky_2k.hdr` | 5,451,493 (3.6 MB gzip) |

## Phone verdict, honestly

**A desktop GPU is not a phone GPU.** The M5 Max saturates vsync with about 7× headroom, and that says almost nothing about a phone. My estimate for a **2022 mid-range Android** (Mali-G68 MP4 or Adreno 642L class, e.g. Galaxy A53 or Pixel 6a):

- That GPU has roughly 1/30–1/50 of the M5 Max's fill rate and ALU, and a frame here is dominated by fill: N8AO, bloom mips and SMAA are each full-screen passes over 3 Mpx at DPR 3. Scaling the ~1 ms of GPU work measured above by 30–50× gives **about 30–50 ms per frame: roughly 20–30 fps with everything on at DPR 3**, and it will drop further as the phone heats up and throttles.
- 63 draw calls and 132k triangles per pass are fine for that class. The merge is what makes the call count fine. Unmerged, the 401 calls would cost several ms of driver time on a phone CPU, far more than on the M5.
- **Phone preset that should hold 30 fps, and maybe 60 on a good day:** DPR capped at 1.5, SSAO off, a 1024² shadow map, bloom kept (it carries the dusk look and is cheap at half-res mips), SMAA kept. That cuts the pixel count to a quarter and drops the most expensive pass.
- **What to drop, in order:** (1) **DPR cap** to 1.5, the biggest single win, since pixel work scales linearly; (2) **SSAO**, which you hardly miss here because the shadow map already grounds objects; (3) **shadow-map resolution** 2048 → 1024; (4) the lamp **point lights**, replaced by baked light-pool decals; (5) **SMAA**, using the DPR as antialiasing. Bloom goes last.
- **Also important:** this game shows the grounds on a **TV**. If the TV is driven by a smart-TV browser or a cheap stick (Chromecast or Fire TV class), that GPU is *weaker* than the phone's and draws 1080p. Measure the actual TV device before committing to the real-time route.

## One more building: what a Hospital costs in this pipeline

Assumptions: same budget as the Park (≤150k triangles **drawn**, ≤8 MB), CC0 parts only (Poly Haven or ambientCG materials, plus CC0 kits for props), modelled in Blender, exported through the same glb path, and lit by this same page.

| Stage | What it takes | Free in real time? |
|---|---|---|
| **Standing** (the hero) | Model the building: massing, windows as an emissive-capable material, roof kit, entrance canopy, red-cross sign, ambulance bay with 1–2 vehicles (CC0 kit or simple model), a few props. **About 2–3 days** for a stylised-real result at this camera distance, plus about ½ day of export and budget passes (texture atlas, KTX2, decimate the props only). | — (this is the modelling) |
| **Site** | The empty slab plus a reusable "site kit" (stakes, tape, cones, a pallet, a portacabin) that **every** building shares. About ½ day **once**, then free per building. | Mostly: it is the kit placed in code. |
| **Under construction** | Reveal the finished building from the bottom up with a **clip plane** (free), wrap it in a **scaffold kit** made once and shared by all buildings (instanced around the bounding box), and add a crane prop. Kit: about 1 day **once**. Per building: free. | **Yes**, given the shared kit. A progress value drives the clip height. |
| **Closed / dark** | Window emissive to 0, lamps off, desaturate the materials slightly, sign off. Optionally boarded-door decals (one texture). | **Yes**: material and light changes only. |
| **Damaged / smoking** | Smoke: GPU sprite particles (one CC0 smoke texture). Fire glow: flickering point light plus emissive. Scorch: 1–2 decals. **All free.** Broken geometry (a holed roof, a fallen sign, rubble) needs **a damaged variant of the roof and sign, about ½–1 day**. Without it, decals plus smoke read as "on fire", not as "broken". | Smoke, glow and scorch are free; **broken geometry needs modelling**. |

**Total for the Hospital:** about **3–4 days**, plus about 1½ days once for the shared site and scaffold kits that every later building reuses. In real time, the light-driven stages (closed, dusk, lamps, smoke) cost nothing extra to produce. In a pre-rendered pipeline each of them would be another render per angle and mood.
