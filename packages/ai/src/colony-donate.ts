import type { GameState, PrestigeId } from '@mule/engine';
import type { Mind } from './value.js';

export type Standing = 'leading' | 'trailing';

export function standingOf(obs: GameState, me: string): Standing {
  throw new Error('NotImplemented: standing-of');
}

export function donationFor(obs: GameState, mind: Mind, standing: Standing): { id: PrestigeId; credits: number } | null {
  throw new Error('NotImplemented: donation-for');
}
