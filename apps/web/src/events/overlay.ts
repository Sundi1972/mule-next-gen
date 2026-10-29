import type { MuleView } from '@mule/protocol';
import { useEventReducedMotion, type ShowPlayer, type Slot } from '@mule/ui';
import { useMemo } from 'react';
import { mapTiles, slotOf } from '../game/derive';
import { useServerNow } from '../net/react';
import { overlayShowAt } from './clock';

/** How often an overlay looks at the server clock: between shows only to see one start; while one plays, every frame. */
const IDLE_MS = 200;
const FRAME_MS = 33;

/** Whether the phase's show is on: polled slowly, so a screen with no show pays almost nothing. */
export function useOverlayOn(view: MuleView): boolean {
  return overlayShowAt(view, useServerNow(IDLE_MS)) !== null;
}

/** The phase's show at this frame, and the rest of what <EventShow> takes from the view and the device. */
export function useOverlayShow(view: MuleView) {
  const show = overlayShowAt(view, useServerNow(FRAME_MS));
  const reduced = useEventReducedMotion();
  const tiles = useMemo(() => mapTiles(view), [view]);
  const players = useMemo<ShowPlayer[]>(() => view.players.map((p) => ({ id: p.id, slot: (slotOf(view, p.id) ?? 0) as Slot, name: p.name })), [view]);
  return { show, stage: { reduced, width: view.width, height: view.height, tiles, players } };
}
