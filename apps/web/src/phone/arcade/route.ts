import type { MuleView } from '@mule/protocol';

/**
 * The view says the server steers development (spec AM-20): your seat's Reach, or the colonists' places on the floor
 * (ColonistView's x, y and space, which only a steering server fills). The route follows the server, never the
 * bundle's own DEV_STEER.on, so a server with the flag on needs no build with it on, and an ordinary server (the flag
 * off) sends neither and keeps today's screens.
 */
export function steering(view: Pick<MuleView, 'me' | 'players'>): boolean {
  return view.me?.reach !== undefined || view.players.some((p) => p.colonist?.space !== undefined);
}
