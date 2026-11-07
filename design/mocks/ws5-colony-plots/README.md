# G-5 · C33 · the colony's objects on their plots (WS5)

**Approved by Heiko, 4 Nov 2026: "apprive variant b"** (seen on localhost:5315). The approved scaffold is the mock as
of **f7fc747d**, with variant A, the object's disc, removed afterwards. It was reviewed by WS8 against C34
(consistent). C33's build grafts this; it doesn't redesign it.

A built park, stadium or spaceport upgrade is drawn on its plot on every map. The TV's map and each phone's are drawn
from the same map tiles, so one mark serves them all. The hospital and the observatory need no plot and aren't drawn.

## Run it

```bash
./node_modules/.bin/vite --port 5315 --strictPort
```

The page shows the TV map and a phone's map, with every stage reachable from the controls.
Option-click selects an element for review comments; a plain click uses the prototype.

## Decisions

- **Glyphs:** WS8's five, verbatim (`src/objects.tsx`, GLYPH and ObjectGlyph).
- **Stage colours:** a reserved site (commissioned, sited) is `holo`, dashed, with the glyph faint. Building is
  `warn`, dashed. Standing is `holo`, the colony's colour. Closed and damaged are `alert`, faded. Building, closed
  and damaged match the build site's list. Standing is `holo`, not the list's `ok`, because on the map `ok`'s green
  next to Kai's Jade plot read as one owner (WS8's review). The list keeps `ok`, since it has no neighbouring plots.
- **Corner chip:** in the map's flag style and size (10 px on a phone, WS6's floor). It carries what colour can't: SITE, a site's months ("1/3"), SHUT or HIT.
- **Screen readers:** they hear the build site's words, for example "Stadium, building: 1 of 3 months" and
  "Park, closed: counts 0".
- **The rest of the plot:** the colony owns it (`tile.owner = 'colony'`, set by C30's site bid; WS7's brief), so it has
  no player's border or tab, and no MULE, since C30 clears the outfit and the plot makes nothing. It keeps its special
  badge.

## The variant

**B · the colony's ground (approved):** the whole plot is the object's, with a stage-coloured inset border, a dark
fill and the glyph large across it. It reads from across a room as "the colony built here", and nothing else on the
map is a dark plot with no owner tab.

A, the object's disc, was not chosen and is removed. Its glyph on a ringed disc at the plot's centre sat where a MULE's
good does, so a built park read as an installed good.

## Settled with WS7 (brief, 4 Nov)

- `Project.plot` is set when C30 wins the site, while the project is still commissioned, and is never cleared. Only
  park, stadium and spaceport have one.
- The tile's owner is `'colony'`, so maps draw no player marks there. "Produces nothing" falls out of C30, with no
  production code.

## Graft target

- `PlotObject`, `ObjectGround` and `objectLabel` are drawn inside HoloMap's plot
  (`packages/ui/src/components/HoloMap.tsx`), in the installed good's slot. This is a named edit for WS4. `MapTile`
  gains `object?: PlotObject`.
- `ObjectGlyph` moves to `packages/ui` beside `SpecialIcon`, a named edit for WS4, with WS8 OKing the glyphs.
- `apps/web/src/game/derive.ts` `mapTiles` fills `object` from `ColonyView.projects[].plot`, a named edit for WS4.
- The mock lays its objects over HoloMap on a grid of the same columns and rows. The build draws them inside the plot.
