import { ARCADE_OUTFITS, botGoal, type Colonist, type HallRoom, type P, type Tunables, type World } from './sim';

/**
 * Where you go next, for the phone's ring on the map or in the hall: the loop Heiko walks, store → corral →
 * outfitter → your plot → pub, read from the same goal the bots walk by (sim.ts botGoal), so the phone and the bots
 * never disagree about the next step. Pure.
 */
export type Guide =
  | { space: 'map'; what: 'store' | 'plot' | 'mule'; at: P; label: string }
  | { space: 'hall'; what: 'room' | 'door'; rooms: HallRoom[]; label: string }
  | null;

const ROOM_LABEL: Partial<Record<HallRoom, string>> = { corral: 'CORRAL', pub: 'PUB' };

/** The plot as the game names it: 4·1 is x 3, y 0. */
export const plotName = (p: P) => `${p.x + 1}·${p.y + 1}`;

export function guideOf(w: World, c: Colonist, tun: Tunables): Guide {
  if (w.over || c.done || c.encounter) return null;
  const g = botGoal(w, c, tun);
  switch (g.kind) {
    case 'store': {
      // What waits inside, from the goal the same colonist would have one step in.
      const inside = botGoal(w, { ...c, space: 'hall' }, tun);
      const why = inside.kind === 'room' ? (ROOM_LABEL[inside.room] ?? 'OUTFITTER') : null;
      return { space: 'map', what: 'store', at: { x: w.store.x, y: w.store.y }, label: why ? `STORE · ${why}` : 'STORE' };
    }
    case 'plot':
    case 'shore':
      return { space: 'map', what: 'plot', at: g.at, label: `YOUR PLOT ${plotName(g.at)}` };
    case 'mule':
      return { space: 'map', what: 'mule', at: g.at, label: 'YOUR MULE' };
    case 'door':
      return { space: 'hall', what: 'door', rooms: [g.side === 'L' ? 'doorL' : 'doorR'], label: 'DOOR' };
    case 'room': {
      // An empty MULE: every outfitter you can pay is a next step, not only the one a bot would pick.
      if (c.mule && !c.mule.good && (ARCADE_OUTFITS as readonly string[]).includes(g.room)) {
        const rooms = ARCADE_OUTFITS.filter((o) => tun.outfit[o] <= c.money);
        return { space: 'hall', what: 'room', rooms: rooms.length ? [...rooms] : [g.room], label: 'OUTFITTER' };
      }
      return { space: 'hall', what: 'room', rooms: [g.room], label: ROOM_LABEL[g.room] ?? 'OUTFITTER' };
    }
    default:
      return null;
  }
}
