import type { AiLevelConfig } from '@mule/engine';
import type { AiAction } from '../actions.js';
import type { MoveTable } from './moves-stub.js';

export type PlaybookField = string;

export interface AdviceLine {
  move: AiAction['type'];
  field: PlaybookField;
  when: () => string;
}

export const ADVICE: readonly AdviceLine[] = [];

export function renderManual(_moves: MoveTable, _advice: readonly AdviceLine[] = ADVICE): string {
  throw new Error('NotImplemented: renderManual');
}

export function defaultManual(_advice: readonly AdviceLine[] = ADVICE): string {
  throw new Error('NotImplemented: defaultManual');
}

export function seatBounds(_level: Pick<AiLevelConfig, 'corners'>): string {
  throw new Error('NotImplemented: seatBounds');
}
