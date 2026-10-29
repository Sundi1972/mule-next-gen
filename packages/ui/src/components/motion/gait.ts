export type Motion = 'idle' | 'walk' | 'run' | 'fight' | 'hurt';
export type Facing = 'left' | 'right';
export type Encounter = 'choose' | 'chase' | 'fight' | null;

export const GAIT = {} as const;

export interface GaitInput {
  moving: boolean;
  encounter: Encounter;
  pace: number;
  terrain: number;
  lead: boolean;
  limp: boolean;
  leadPace: number;
  bittenPace: number;
}

export function motionOf(_g: Pick<GaitInput, 'moving' | 'encounter' | 'limp'>): Motion {
  throw new Error('NotImplemented: motionOf');
}

export function speedShare(_g: GaitInput): number {
  throw new Error('NotImplemented: speedShare');
}

export function cycleSeconds(_g: GaitInput): number {
  throw new Error('NotImplemented: cycleSeconds');
}

export function limpLatch(_prev: { limp: boolean; encounter: Encounter; speed: number }, _now: { encounter: Encounter; speed: number; healed: boolean }): boolean {
  throw new Error('NotImplemented: limpLatch');
}
