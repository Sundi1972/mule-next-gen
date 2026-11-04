import { DEV_STEER } from '@mule/engine';
import { MS_PER_SECOND } from '@mule/engine';

/**
 * The stick on the wire (arcade spec §3, HC-5): each component in steps of 1/8 and the vector never longer than 1, sent
 * on change only and at most DEV_STEER.steerMaxPerSecond, so a socket stays under the server's RATE_LIMIT. Pure: the
 * screen calls gateSteer every frame with what the stick, the keys or the mouse want.
 */

export interface Stick {
  x: number;
  y: number;
}

/** The wire's steps per unit (spec §3: 1/8). */
const STEPS = 8;

const tidy = (v: number) => v || 0; // never -0, so a resting stick reads 0

/** The stick in 1/8 steps: rounded, and when that is longer than 1, scaled to 1 and cut toward zero. */
export function quantise(x: number, y: number): Stick {
  const q = { x: Math.round(x * STEPS) / STEPS, y: Math.round(y * STEPS) / STEPS };
  const length = Math.hypot(q.x, q.y);
  if (length <= 1) return { x: tidy(q.x), y: tidy(q.y) };
  return { x: tidy(Math.trunc((x / Math.hypot(x, y)) * STEPS) / STEPS), y: tidy(Math.trunc((y / Math.hypot(x, y)) * STEPS) / STEPS) };
}

/** What the server has (the stick it was last sent; it starts standing) and when it was sent. */
export interface SteerGate {
  sent: Stick;
  sentAt: number;
}

export function startGate(): SteerGate {
  return { sent: { x: 0, y: 0 }, sentAt: -Infinity };
}

const same = (a: Stick, b: Stick) => a.x === b.x && a.y === b.y;

/**
 * Whether to send `want` now: only when it differs from what the server has, and not sooner than a step of the rate
 * after the last send. A change held back is sent by a later call, since every frame asks again with the stick's
 * latest; so the last change is never lost, and the ones between are skipped.
 */
export function gateSteer(gate: SteerGate, want: Stick, nowMs: number): { gate: SteerGate; send: Stick | null } {
  if (same(want, gate.sent)) return { gate, send: null };
  if (nowMs - gate.sentAt < MS_PER_SECOND / DEV_STEER.steerMaxPerSecond) return { gate, send: null };
  return { gate: { sent: want, sentAt: nowMs }, send: want };
}
