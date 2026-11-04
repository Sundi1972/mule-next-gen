import { quantise, type Stick } from './steer';

/**
 * What the keys, the joystick and the mouse hold, written by their handlers and read every animation frame: never React
 * state, so a key press costs no render (the arcade mock's loop.tsx). The stick wins over the keys, the keys over a
 * held mouse.
 */
export interface Controls {
  keys: Set<string>;
  stick: Stick | null;
  /** The mouse held on a spot, in the space's own units. */
  mouse: { x: number; y: number; space: 'map' | 'hall' } | null;
}

export function startControls(): Controls {
  return { keys: new Set(), stick: null, mouse: null };
}

const STEER_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
/** A stick this far from its centre is a thumb resting on it, not a push. */
const DEAD_ZONE = 0.08;
/** The mouse's spot is reached this near, in the space's units (the mock's `toward`). */
const ARRIVED = 0.06;

export interface KeyLike {
  key: string;
  repeat: boolean;
  altKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  preventDefault(): void;
}

/**
 * Arrows steer and SPACE presses the action button, once a press however long it is held. Only those are kept from
 * the page (no scrolling, B-AC-3); every other key, and any with a modifier, goes on as usual.
 */
export function keyDown(c: Controls, e: KeyLike, press: () => void): void {
  if (e.altKey || e.metaKey || e.ctrlKey) return;
  if (STEER_KEYS.has(e.key)) {
    e.preventDefault();
    c.keys.add(e.key);
  } else if (e.key === ' ') {
    e.preventDefault();
    if (!e.repeat) press();
  }
}

export function keyUp(c: Controls, e: { key: string }): void {
  c.keys.delete(e.key);
}

/** The stick on the wire's 1/8 steps: the joystick, else the keys, else toward the held mouse from where you stand. */
export function stickOf(c: Controls, me: { x: number; y: number; space: 'map' | 'hall' } | null): Stick {
  if (c.stick && Math.hypot(c.stick.x, c.stick.y) > DEAD_ZONE) return quantise(c.stick.x, c.stick.y);
  const k = c.keys;
  const x = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
  const y = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
  if (x || y) return quantise(x, y);
  if (!c.mouse || !me || c.mouse.space !== me.space) return { x: 0, y: 0 };
  const dx = c.mouse.x - me.x;
  const dy = c.mouse.y - me.y;
  const d = Math.hypot(dx, dy);
  return d < ARRIVED ? { x: 0, y: 0 } : quantise(dx / d, dy / d);
}
