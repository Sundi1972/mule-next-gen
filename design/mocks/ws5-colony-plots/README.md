# G-5 · C33 · the colony's objects on their plots (WS5)

**Status: for review.** WS8 reviews it against its colony parts (`design/mocks/ws8-colony`, b0f52001), then it goes to
Heiko. Nothing is built until he approves a variant.

A built park, stadium or spaceport upgrade is drawn on its plot on every map. The TV's map and each phone's are drawn
from the same map tiles, so one mark serves them all. The hospital and the observatory need no plot and aren't drawn.

## Run it

```bash
./node_modules/.bin/vite --port 5315 --strictPort
```

The page shows the TV map and a phone's map, with two variants and every stage reachable from the controls.
Option-click selects an element for review comments; a plain click uses the prototype.

## Decisions

- **Glyphs:** WS8's five, verbatim (`src/objects.tsx`, GLYPH and ObjectGlyph).
- **Stage colours:** the build site's own. A reserved site (commissioned, sited) is `holo`, dashed, with the glyph
  faint. Building is `warn`, dashed. Standing is `ok`. Closed and damaged are `alert`, faded. The list and the map
  then agree.
- **Corner chip:** in the map's flag style. It carries what colour can't: SITE, a site's months ("1/3"), SHUT or HIT.
- **Screen readers:** they hear the build site's words, for example "Stadium, building: 1 of 3 months" and
  "Park, closed: counts 0".
- **The rest of the plot:** the colony owns it (`tile.owner = 'colony'`, set by C30's site bid; WS7's brief), so it has
  no player's border or tab, and no MULE, since C30 clears the outfit and the plot makes nothing. It keeps its special
  badge.

## The two variants

| | A · the object's disc | B · the colony's ground |
|---|---|---|
| Mark | the glyph on the map's chip disc at the plot's centre, where a MULE's good disc sits | the whole plot: a stage-coloured inset border, a dark fill, the glyph large across it |
| Reads | quiet, the same weight as a MULE | strong, from across a room: "the colony built here" |
| Risk | can be mistaken for an installed good (a ringed disc) | its border can be mistaken for an owner's plot, especially standing's green |

WS5's recommendation is **B**: the objects are the colony's landmarks, and nothing else on the map is a dark plot with
no owner tab. Review the green.

## Settled with WS7 (brief, 4 Nov)

- `Project.plot` is set when C30 wins the site, while the project is still commissioned, and is never cleared. Only
  park, stadium and spaceport have one.
- The tile's owner is `'colony'`, so maps draw no player marks there. "Produces nothing" falls out of C30, with no
  production code.

## Graft target

- `PlotObject`, `ObjectDisc` or `ObjectGround`, and `objectLabel` are drawn inside HoloMap's plot
  (`packages/ui/src/components/HoloMap.tsx`), in the installed good's slot. This is a named edit for WS4. `MapTile`
  gains `object?: PlotObject`.
- `ObjectGlyph` moves to `packages/ui` beside `SpecialIcon`, a named edit for WS4, with WS8 OKing the glyphs.
- `apps/web/src/game/derive.ts` `mapTiles` fills `object` from `ColonyView.projects[].plot`, a named edit for WS4.
- The mock lays its objects over HoloMap on a grid of the same columns and rows. The build draws them inside the plot.
