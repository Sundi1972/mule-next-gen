import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { cx } from './tokens';

const STICK = 128;
const KNOB = 56;

/** Where the thumb holds the stick: each axis -1 to 1, the vector at most 1 long; null when let go. */
export type StickAt = { x: number; y: number } | null;

/**
 * A thumb joystick (arcade spec C11): drag anywhere on the pad; the further from the centre, the faster, up to full
 * speed at the rim. It says where the thumb is on every move and null on letting go; what that sends is the screen's.
 * The knob follows the thumb directly, never through React state, so a drag costs no render.
 */
export function Joystick({ onStick, className, size = STICK }: { onStick: (at: StickAt) => void; className?: string; size?: number }) {
  const knobSize = Math.round((KNOB * size) / STICK);
  const knob = useRef<HTMLSpanElement>(null);
  const pad = useRef<HTMLDivElement>(null);
  /** The pointer that took the stick: only it steers, and only its lift lets go. */
  const held = useRef<number | null>(null);
  const set = (e: ReactPointerEvent | null) => {
    if (!e) {
      held.current = null;
      onStick(null);
      if (knob.current) knob.current.style.transform = 'translate(-50%, -50%)';
      return;
    }
    const r = pad.current!.getBoundingClientRect();
    // The knob's centre travels to where its edge meets the pad's rim.
    const reach = r.width / 2 - knobSize / 2;
    let x = (e.clientX - (r.left + r.width / 2)) / reach;
    let y = (e.clientY - (r.top + r.height / 2)) / reach;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    onStick({ x, y });
    if (knob.current) knob.current.style.transform = `translate(calc(-50% + ${(x * reach * size) / r.width}px), calc(-50% + ${(y * reach * size) / r.width}px))`;
  };
  return (
    <div
      ref={pad}
      className={cx('relative shrink-0 touch-none select-none rounded-full border-2 border-holo-line bg-holo-soft shadow-map', className)}
      style={{ width: size, height: size }}
      onPointerDown={(e) => {
        if (e.altKey || held.current !== null) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        held.current = e.pointerId;
        set(e);
      }}
      onPointerMove={(e) => held.current === e.pointerId && set(e)}
      onPointerUp={(e) => held.current === e.pointerId && set(null)}
      onPointerCancel={(e) => held.current === e.pointerId && set(null)}
      onLostPointerCapture={(e) => held.current === e.pointerId && set(null)}
      role="application"
      aria-label="Joystick: drag to walk"
      data-testid="joystick"
    >
      {/* The four directions, faint. */}
      {['top-1.5 left-1/2 -translate-x-1/2', 'bottom-1.5 left-1/2 -translate-x-1/2 rotate-180', 'left-1.5 top-1/2 -translate-y-1/2 -rotate-90', 'right-1.5 top-1/2 -translate-y-1/2 rotate-90'].map((p) => (
        <span key={p} aria-hidden className={cx('absolute font-mono text-xs text-holo/60', p)}>
          ▲
        </span>
      ))}
      <span ref={knob} className="absolute left-1/2 top-1/2 rounded-full border-2 border-holo bg-panel shadow-glow" style={{ width: knobSize, height: knobSize, transform: 'translate(-50%, -50%)' }} data-testid="joystick-knob" />
    </div>
  );
}
