import type { FloorColonist, FloorConfig, GameState } from '@mule/engine';
import type { DevFrame, MuleView, MyView } from '@mule/protocol';

/** The phone's own colonist, predicted ahead of the server (arcade spec RULE-10). Not built yet: T-AC-10 first. */

export interface PredictWorld {
  state: GameState;
  cfg: FloorConfig;
  id: string;
}

export interface Prediction {
  status: 'waiting' | 'live' | 'reconnecting';
  tick: number;
  me: FloorColonist | null;
  stats: { compared: number; corrected: number; snapped: number; worst: number };
}

export interface Shown {
  x: number;
  y: number;
}

const notYet = (): never => {
  throw new Error('RULE-10 prediction: not built yet');
};

export const predictWorld = (_view: Pick<MuleView, 'width' | 'height' | 'tiles'>, _me: Pick<MyView, 'id' | 'carriedMule'>, _cfg: FloorConfig): PredictWorld => notYet();
export const startPrediction = (): Prediction => notYet();
export const phoneTick = (_p: Prediction, _nowMs: number, _rttMs: number, _cfg: FloorConfig): number | null => notYet();
export const advanceTo = (_p: Prediction, _tick: number, _world: PredictWorld): Prediction => notYet();
export const steerFrom = (_p: Prediction, _stick: { x: number; y: number }): Prediction => notYet();
export const receiveFrame = (_p: Prediction, _frame: DevFrame, _nowMs: number, _world: PredictWorld, _base: { pace: number; bitten: boolean; pelts: number }): Prediction => notYet();
export const markStale = (_p: Prediction, _nowMs: number, _cfg: FloorConfig): Prediction => notYet();
export const shownAt = (_p: Prediction, _nowMs: number, _cfg: FloorConfig): Shown | null => notYet();
