import type { AiLevelId, AiPersonaId } from '@mule/engine';
import type { SeatSpec } from './play.js';

export const ROTATION: AiPersonaId[] = ['trader', 'aggressive', 'cautious', 'saboteur'];

/** The sim's `--plays`: every seat on its playbook, every seat on today's path, or a pair table (RULE-15). */
export type TablePlays = 'playbook' | 'today' | 'pair';

/**
 * Seats for a simulator game: one level, personas rotating by seat (and by seed, so no persona always sits first).
 * `plays` names each seat's path; under 'pair' the even seats play their playbook and the odd today's (RULE-15). Null
 * names none, so the seats play as the config says (AI_PLANS).
 */
export function simSeats(players: number, level: AiLevelId, seed: number, persona: AiPersonaId | null = null, plays: TablePlays | null = null): SeatSpec[] {
  return Array.from({ length: players }, (_, i) => ({
    level,
    persona: persona ?? ROTATION[(i + seed) % ROTATION.length]!,
    // literal-ok: RULE-15's pairing, even seats and odd, not balance
    ...(plays && { plays: plays === 'pair' ? (i % 2 === 0 ? 'playbook' : 'today') : plays }),
  }));
}
