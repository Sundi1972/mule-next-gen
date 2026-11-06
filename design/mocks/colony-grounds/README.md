# The colony grounds · AM-16 option A (WS6 mock for WS7)

**Heiko ruled option A on 6 Nov:** the colony's buildings never sit on players' plots. The colony has its own grounds,
"a really nice view that we can use … ideally 3D later … showing how wealthy the colony is by showing these colony
buildings". This mock is that showpiece view, for Heiko's review as the binding basis for the build.

## Run it

```bash
./node_modules/.bin/vite --port <free port> --strictPort
```

One page: the decisions, a growth strip (months 1, 4, 8, 12), the TV in planning, the TV at the month end and the
phone's Colony desk. Switch month 1 / 12, the style (A Holo model, B Lit diorama) and Governor or not at the top.
Option-click selects an element for review comments; a plain click uses the prototype.

## Decisions

- **An isometric 2.5D model in SVG** (`src/Scene.tsx`), every colour a theme token. The town hall stands in the
  middle with 8 slots round it (WS7's rules). The slots read 1–8; ColonyView's `slot` is 0–7.
- **It grows richer:** more paving, trees and lamps for every building that stands, colonists out by mood, lit
  windows and the hall's flag by mood, a haze by the air (`gauges.environment`).
- **Every stage:** free (dashed, numbered), site (stakes and the planned outline, SITE), building (the part built,
  scaffold and crane, "2/3"), standing, closed (dark, SHUT), damaged (broken, smoking, HIT).
- **Labels:** over each building, its slot number and stage chip. The TV's legend and the phone's rail give the name
  and the build site's words, because names over adjacent slots collide.
- **The Governor places:** Commission on the Colony desk, then tap a free slot's pad. The AI Governor takes the first
  free slot.
- **3D path:** `src/layout.ts` holds cells, massing and decoration in grid units with no pixels. A react-three-fiber
  (three.js) build reads the same data and swaps each SVG shape for a model.
- **DS-GAP:** the scene's shapes are new drawing (not @mule/ui parts); the build adds them to @mule/ui or replaces
  them with models. @mule/ui has no town-hall glyph.

`src/Grounds.tsx` is the first cut (a flat board of the map's object marks), kept for `slotWords` and the phone's list.
