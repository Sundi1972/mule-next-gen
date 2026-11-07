import type { GameState, Outfit, PlayerId } from '@mule/engine';
import type { DevLogEntry } from '../hands/develop.js';
import type { AiSeatOptions } from '../seat.js';

/** What a seat's hands did in a development they played on their own (today's path): no route was adopted for it. */
export interface HandsDevelopment {
  month: number;
  /** MULEs bought at the corral. */
  bought: number;
  /** Each MULE installed, on which plot, with the outfit it carries now. */
  installed: { plot: number; outfit: Outfit | null }[];
  /** Each buy refused at the corral, in the brief's words. */
  refused: string[];
}

export function keptDevelopmentPlaysToday(_seat: { options: Pick<AiSeatOptions, 'playbook' | 'decider' | 'ownPhases'> }, _month: number): boolean {
  throw new Error('NotImplemented: keptDevelopmentPlaysToday');
}

export function handsDevelopment(_state: GameState, _me: PlayerId, _log: readonly DevLogEntry[]): HandsDevelopment {
  throw new Error('NotImplemented: handsDevelopment');
}
