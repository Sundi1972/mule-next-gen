import type { PlayerView } from '@mule/protocol';
import type { Seat } from './hub/ready';

/**
 * Done with land: the land grant ends once every seat, AI included, has used its claims or pressed Ready. Unlike
 * planning, an AI is not always ready here, so the grant names it while it still wants land. A dropped phone is
 * still waited for, marked away.
 */
export function grantFooter(players: readonly PlayerView[], me: string, connected: (id: string) => boolean): { ready: boolean; waiting: Seat[] } {
  const waiting = players
    .filter((p) => !p.ready && p.id !== me)
    .map((p): Seat => ({ id: p.id, name: p.name, isAi: p.isAi, ready: p.ready, slot: p.slot, away: !p.isAi && !connected(p.id) }));
  return { ready: !!players.find((p) => p.id === me)?.ready, waiting };
}

/** At most this many names on the compact footer's one waiting line; the rest are "+N". */
export const NAMES_SHOWN = 2;

/**
 * The compact footer's waiting line, which never wraps: the shorter names first and whole, so the most fit, the last
 * one shown truncating, and how many more as "+N" (0: none).
 */
export function waitingLine<S extends { name: string }>(seats: readonly S[], shown = NAMES_SHOWN): { shown: S[]; more: number } {
  const first = [...seats].sort((a, b) => a.name.length - b.name.length).slice(0, shown);
  return { shown: first, more: seats.length - first.length };
}
