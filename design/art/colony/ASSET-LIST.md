# The colony grounds — asset list (WS10)

Every picture the grounds view needs, for direction C (`ART-DIRECTION.md`). The catalogue is trunk's
`packages/engine/src/config.ts::PRESTIGE` (5 kinds) plus the town hall. A new catalogue entry adds one row per stage.

## Lights per stage

| Stage | day | dusk | glow (additive) |
|---|---|---|---|
| site | ✓ | ✓ | work lamp on the cabin |
| build1 / build2 | ✓ | ✓ | work lights on the scaffold |
| standing | ✓ | ✓ | windows, lamps, signs — the wealth layer |
| closed | ✓ | ✓ | — (dark is the point) |
| damaged | ✓ | ✓ | ember inside the break (smoke is live) |

## Buildings × stages

`buildMonths` from config.ts: Park 1, Hospital 2, Observatory 2, Stadium 3, Spaceport 3. Under construction is one
picture (build1) for 1–2-month buildings and two (build1 ⅓, build2 ⅔) for 3-month ones. If WS7's pace change sets every
`buildMonths` to 1, build2 is dropped (−4 pictures).

| Kind | Stages | Pictures (day + dusk + glow) | Building-specific work (beyond the shared kits) |
|---|---|---|---|
| Town hall | tier1, tier2, tier3 (grander as prestige rises: tier2 at 5, tier3 at 12 — PM/WS7 to confirm) | 3 × 3 = **9** | portico, flag, clock; tier2 adds a wing, tier3 a tower |
| Park | site, build1, standing, closed, damaged | 5 × 2 + 4 = **14** | done in the spike (`park.py`); closed = gates locked, lawn brown; damaged = fallen tree, scorched lawn |
| Hospital | site, build1, standing, closed, damaged | **14** | done in the spike (`colony.py::hospital`) — needs the polish pass |
| Observatory | site, build1, standing, closed, damaged | **14** | dome with slot + telescope; damaged = cracked dome |
| Stadium | site, build1, build2, standing, closed, damaged | 6 × 2 + 5 = **17** | **2×2 places** (Heiko): a real bowl with stands, pitch, floodlight masts; closed = masts dark, gates shut |
| Spaceport upgrade | site, build1, build2, standing, closed, damaged | **17** | pad, gantry, **a ~36 m rocket, the tallest thing on the grounds** (Heiko 6 Nov), blockhouse, tall frame 1600×3200; build1 = rocket stacking on the pad, build2 = fully stacked in scaffold; closed = rocket shrouded, pad dark; damaged = toppled gantry arm, scorched pad |
| **Total** | | **85 pictures** | |

## Shared pieces (made once)

| Piece | Kind | Used by |
|---|---|---|
| Camera, light rig (day / dusk / glow passes), place slab | Blender lib | every picture |
| Site kit: graded earth, stakes, string, flags, spoil heap, cabin | Blender lib | every `site` |
| Scaffold generator + tower crane | Blender lib | every `build*` |
| Closed kit: site fence, boards, dead-glass + grey-facade material swaps | Blender lib | every `closed` |
| Damage kit: noisy boolean bite, rubble scatter, scorch + ember | Blender lib | every `damaged` |
| Edge props: tree, lamp (day / dusk / glow) | pictures, 6 | the live layer's edge decoration (`layout.ts::edgeDecoration`) |
| Colonist sprites: 4 player colours × walk cycle | page drawing (SVG), no pictures | the live layer |
| Smoke, sparks, rain | page drawing / CSS | the live layer |
| Ground: plaza, lawn, paths, "room to grow", terrain skirt | map painter (`packages/ui/src/terrain`) with a grounds palette | the ground layer |

## Sizes (measured on the spike's WebP)

A place picture at 800 px wide is 50–65 kB (the Spaceport's tall frame ≈ 2×, est. 100–130 kB); 400 px ≈ 20 kB; a glow layer is mostly black, ≈ 10 kB.
85 pictures + 6 props ≈ **4.5 MB at 800 px**, **≈ 1.8 MB at 400 px** — loaded per building as it appears, so a
month-12 colony on a phone fetches ~0.4 MB.

## Effort (direction C, free assets)

| Work | Estimate | Measured in the spike |
|---|---|---|
| Shared lib + kits (camera, light passes, site, scaffold, crane, closed, damage) | 1½–2 days | site/scaffold/crane/closed/damage generators existed within ~20 min of agent time for the Hospital strip |
| Each building, all stages, to the polished bar | 25–35 h (human generalist estimate) | first-pass Hospital, Observatory, Stadium, Spaceport and hall modelled by script in ~15 min of agent time; the gap to "polished" is look review and iteration, not modelling hours |
| Renders | ~25–35 s a picture (Cycles 256 spp, M5 Max) → 85 pictures ≈ 45 min, unattended | measured |

The honest reading: agents script the models fast; what takes time is getting each building to look right at TV
size, which needs a human eye per building (Heiko or the PM) in short rounds.
