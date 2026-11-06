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

- **An isometric 2.5D model in SVG** (`src/Scene.tsx`), every colour a theme token, the town hall in the middle.
- **It grows with the buildings (PM ruling, 6 Nov, after Heiko's read of the first cut):** no fixed square, no picking a
  place. Each building takes the next place in one growth order, ring by ring from the hall, up to 5×5 (24 places,
  `layout.ts::PLACES`); the scene is drawn only as big as it needs (`extentOf`). ColonyView's `slot` is the place in
  that order, 0-based (shown +1).
- **It grows richer:** more paving, trees and lamps for every building that stands, colonists out by mood, lit
  windows and the hall's flag by mood, a haze by the air (`gauges.environment`).
- **Every stage:** a faint "next" where the next one goes, site (stakes and the planned outline, SITE), building (the part built,
  scaffold and crane, "2/3"), standing, closed (dark, SHUT), damaged (broken, smoking, HIT).
- **Labels:** over each building, its slot number and stage chip. The TV's legend and the phone's rail give the name
  and the build site's words, because names over adjacent slots collide.
- **The Governor commissions** on the Colony desk; the site appears at the next place. Nobody taps a place.
- **3D path:** `src/layout.ts` holds cells, massing and decoration in grid units with no pixels. A react-three-fiber
  (three.js) build reads the same data and swaps each SVG shape for a model.
- **DS-GAP:** the scene's shapes are new drawing (not @mule/ui parts); the build adds them to @mule/ui or replaces
  them with models. @mule/ui has no town-hall glyph.

`src/Grounds.tsx` is the first cut (a flat board of the map's object marks), kept for `slotWords` and the phone's list.
