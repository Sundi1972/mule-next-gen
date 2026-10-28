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
