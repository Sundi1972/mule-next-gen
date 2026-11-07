# Grounds compositor: follow-ups (AM-7)

The grounds are one plate per RULE-4 extent (`plate.py`) with flush building layers laid over it far to near
(`composite.py`, the reference for what ColonyGrounds does). Two things the layer model cannot draw yet, both ruled
"note, don't build" (lead, 7 Nov):

## 1. Lamp heads at the inner crossings

Every walkway crossing inside the grounds is the near corner of the place behind it. A lamp head there stands in
front of that place's building, but the building layer is drawn over the plate, so it would cover the head. Today
the plate draws heads and posts only on the outer apron. At the inner crossings it keeps just the warm pool of
light (a head-less light in the dusk and glow passes).

**Follow-up:** a front overlay per row. After the layers of depth `d = col + row` are laid, lay the lamp heads at
the crossings whose depth is `d + 1`: each is the near corner of a depth-`d` place and the back corner of the places
in front of it. That puts each head over the building behind it and under the buildings in front. The heads are a
small transparent sprite set, one per crossing, rendered in the shared camera.

## 2. A far building's shadow on a nearer place

Each layer carries its own cast shadow on a catcher, but a nearer layer's ground cover is opaque, so a shadow
falling from a far building onto a nearer place is painted over. This doesn't happen in the month-12 layout,
because the day sun at 35° from the WSW throws shadows east-north-east, along a row rather than toward the camera.
A taller building beside a lower one, east of it, would hit it.

**Follow-up:** a shadow-only pass. Render each layer's catcher shadow as a separate picture, and multiply it over
the canvas after every ground cover is down but before the buildings stand on it. The alternative is ground covers
that leave their own place transparent, with the plate drawing every place's ground.

## Known, accepted for now

- The catcher lies at the plinth top (z = 0) out to one place beyond the footprint. Off the grounds' outer edge
  the plate's apron is sunk 0.62 m, so a shadow reaching past the edge lands a little off and misses the plinth's
  stone side.
- At dusk the sun grazes at 3°, so shadows run far past the catcher and stop at its edge. They are faint enough
  (sun 0.5) that no edge shows at TV size.
- Dusk facades (check 5) get a warm fill (lib/light.py `DUSK_FILL`): a sun 12° up from the camera's side, shadowless
  (a 12° light's shadow runs ~28 m over a layer's catcher and was painted over the building behind: the Hospital's
  darkened the hall's parapet), light-linked off every mesh under 0.35 m and the terrain, so no ground brightens. The
  plate takes none of it: on the plate it only turned the plinth's stone sides orange.
- look.html's colony still predates the polished Hospital (5f7640c6) and the kit-dressed hall, so check 5 compares
  the same world patches across two model revisions. The numbers are honest for the patch, not for every surface.
