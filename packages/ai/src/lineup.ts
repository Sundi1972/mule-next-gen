import type { AiLevelId, AiPersonaId } from '@mule/engine';
import type { SeatSpec } from './play.js';

export const ROTATION: AiPersonaId[] = ['trader', 'aggressive', 'cautious', 'saboteur'];

/** Seats for a simulator game: one level, personas rotating by seat (and by seed, so no persona always sits first). */
export function simSeats(players: number, level: AiLevelId, seed: number, persona: AiPersonaId | null = null): SeatSpec[] {
  return Array.from({ length: players }, (_, i) => ({ level, persona: persona ?? ROTATION[(i + seed) % ROTATION.length]! }));
}
