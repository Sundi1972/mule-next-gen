import { useMemo, type ReactNode } from 'react';
import { HoloMap } from '../components/HoloMap';
import { cx, type Slot } from '../components/tokens';
import { useShow } from './frame';
import { livingAt, Marks, Overlays, Shade, Weather } from './living';
import { Stories } from './stories';
import { eventSkipTo } from './timing';
import type { ShowSize } from './types';

export interface EventLivingMapProps {
  size: ShowSize;
  /** Fade the plots that aren't this player's: a phone. */
  focusSlot?: Slot;
  /** Drawn over the weather and under the marks: the production show's bars. */
  bars?: ReactNode;
  /** Drawn over everything on the map, under the cards. */
  over?: ReactNode;
  /**
   * A phone alone: the whole map is the tap target. Called with the show time to jump to: the event's result, or,
   * tapped again, the next event.
   */
  onSkip?: (to: number) => void;
  className?: string;
}

/**
 * Living weather over HoloMap, inside <EventShow>. The map box is a container, so every layer sizes against its
 * width; the camera moves the map inside the box, and the cards sit over the box, outside the camera.
 *
 * A phone at the TV's pace is a phone with a TV in the room (the gallery's PhoneShow): it never plays the event, only
 * marks the player's own hit plots; the light card in its rail does the rest.
 */
export function EventLivingMap({ size, focusSlot, bars, over, onSkip, className }: EventLivingMapProps) {
  const frame = useShow();
  const { tiles, grid, t, reduced, s } = frame;
  const light = size === 'phone' && s.mode === 'tv';
  const living = livingAt(frame);
  const seg = light ? null : living.seg;
  const view = light ? undefined : living.view;
  // The painted map renders once; only the layers redraw as the clock runs.
  const land = useMemo(
    () => <HoloMap width={grid.width} height={grid.height} tiles={tiles} density={size === 'tv' ? 'tv' : 'phone'} hideGround {...(focusSlot !== undefined ? { focusSlot } : {})} className="w-full" />,
    [grid.width, grid.height, tiles, size, focusSlot],
  );
  const playing = seg !== null && t < seg.settleAt - 0.05;
  const skip = () => {
    const to = eventSkipTo(s, t);
    if (to !== null) onSkip?.(to);
  };
  return (
    <div className={cx('relative [container-type:inline-size]', className)} data-testid="event-map-box" data-reduced={reduced}>
      {/* The camera flies in to a story's place; the frame keeps the zoomed map inside the map's own box. */}
      <div className="overflow-hidden rounded-panel">
        <div className="relative" style={{ transform: view }} data-testid="event-map" {...(seg ? { 'data-event': seg.events[0]!.key } : {})}>
          {land}
          {!light && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-panel">
              <Weather size={size} />
              <Shade />
            </div>
          )}
          {bars}
          <div className="pointer-events-none absolute inset-0 rounded-panel">
            {!light && <Stories size={size} />}
            <Marks size={size} {...(light && focusSlot !== undefined ? { slot: focusSlot } : {})} />
            {over}
          </div>
        </div>
      </div>
      {!light && <Overlays size={size} />}
      {seg && onSkip && <button type="button" onClick={skip} className="absolute inset-0 z-30" aria-label={playing ? 'Tap to skip to what it did to you' : 'Tap for the next event'} data-testid="skip" />}
    </div>
  );
}
