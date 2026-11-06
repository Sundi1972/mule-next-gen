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
