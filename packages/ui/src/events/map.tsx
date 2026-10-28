import { useMemo, type ReactNode } from 'react';
import { HoloMap } from '../components/HoloMap';
import { cx, type Slot } from '../components/tokens';
import { useShow } from './frame';
import { livingAt, Marks, Overlays, Shade, Weather } from './living';
import { Stories } from './stories';
import type { ShowSize } from './types';

export interface LivingMapProps {
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
 */
export function LivingMap({ size, focusSlot, bars, over, onSkip, className }: LivingMapProps) {
  const frame = useShow();
  const { tiles, grid, t, reduced } = frame;
  const { seg, view } = livingAt(frame);
  // The painted map renders once; only the layers redraw as the clock runs.
  const land = useMemo(
    () => <HoloMap width={grid.width} height={grid.height} tiles={tiles} density={size === 'tv' ? 'tv' : 'phone'} hideGround {...(focusSlot !== undefined ? { focusSlot } : {})} className="w-full" />,
    [grid.width, grid.height, tiles, size, focusSlot],
  );
  const playing = seg !== null && t < seg.settleAt - 0.05;
  const skip = () => seg && onSkip?.(playing ? seg.settleAt : seg.endAt);
  return (
    <div className={cx('relative [container-type:inline-size]', className)} data-testid="event-map-box" data-reduced={reduced}>
      {/* The camera flies in to a story's place; the frame keeps the zoomed map inside the map's own box. */}
      <div className="overflow-hidden rounded-panel">
        <div className="relative" style={{ transform: view }} data-testid="event-map" {...(seg ? { 'data-event': seg.events[0]!.key } : {})}>
          {land}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-panel">
            <Weather size={size} />
            <Shade />
          </div>
          {bars}
          <div className="pointer-events-none absolute inset-0 rounded-panel">
            <Stories size={size} />
            <Marks size={size} />
            {over}
          </div>
        </div>
      </div>
      <Overlays size={size} />
      {seg && onSkip && <button type="button" onClick={skip} className="absolute inset-0 z-30" aria-label={playing ? 'Tap to skip to what it did to you' : 'Tap for the next event'} data-testid="skip" />}
    </div>
  );
}
