/** The stick on the wire (spec §3, HC-5). Not built yet: its C11 tests first. */

export interface Stick {
  x: number;
  y: number;
}

export interface SteerGate {
  sent: Stick | null;
}

const notYet = (): never => {
  throw new Error('the steer gate: not built yet');
};

export const quantise = (_x: number, _y: number): Stick => notYet();
export const startGate = (): SteerGate => notYet();
export const gateSteer = (_gate: SteerGate, _want: Stick, _nowMs: number): { gate: SteerGate; send: Stick | null } => notYet();
