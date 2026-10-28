import type { MuleIntent, MuleView, PlayerView, TableView } from '@mule/protocol';

/** Planning has no clock: who it still waits for, and what the planning footer shows and sends. */

export type Seat = Pick<PlayerView, 'id' | 'name' | 'isAi' | 'ready' | 'slot'> & { away: boolean };

/**
 * Every person not yet Ready, in seat order. An AI is always ready. A dropped phone is still waited for, marked
 * away: a locked phone drops its socket, and its player must not be skipped.
 */
export function stillPlanning(players: readonly PlayerView[], connected: (id: string) => boolean): Seat[] {
  return players.filter((p) => !p.isAi && !p.ready).map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, ready: p.ready, slot: p.slot, away: !connected(p.id) }));
}

/** Whether a seat's screen is connected, as the room has it; a seat the room doesn't list counts as connected. */
export function connectedIn(seats: TableView<MuleView>['seats']): (id: string) => boolean {
  return (id) => seats.find((s) => s.id === id)?.connected ?? true;
}

/** The viewer's own seat first, the rest in seat order. */
export function viewerFirst(seats: readonly Seat[], me: string | null): Seat[] {
  return [...seats.filter((s) => s.id === me), ...seats.filter((s) => s.id !== me)];
}

/** "Brix", "Brix and Kai", "you, Brix and Kai": the viewer is "you" and comes first. */
export function namesOf(seats: readonly Seat[], me: string | null): string {
  const names = viewerFirst(seats, me).map((s) => (s.id === me ? 'you' : s.name));
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The Now card once you're ready: what is left is waiting, or, for the host, deciding not to. */
export function readyNow(others: readonly Seat[], isHost: boolean): { title: string; detail: string } {
  if (others.length === 0) return { title: 'Everyone is ready', detail: 'The land grant starts.' };
  const who = namesOf(others, null);
  const away = others.filter((s) => s.away);
  const awayLine = away.length > 0 ? ` ${namesOf(away, null)} ${away.length === 1 ? 'is' : 'are'} away.` : '';
  return isHost
    ? { title: `You're ready. Waiting for ${who}`, detail: `Planning has no clock: it ends when everyone is ready. As the host, you can continue without them.${awayLine}` }
    : { title: `You're ready. Waiting for ${who}`, detail: `Planning has no clock: it ends when everyone is ready, or when the host continues.${awayLine}` };
}

/** Planning with no election running: the only time the server accepts the host's Continue. */
export function planningProper(view: Pick<MuleView, 'phase' | 'politics'>): boolean {
  const election = view.politics?.election;
  return view.phase === 'planning' && !(election && election.stage !== 'over');
}

export interface FooterIn {
  me: string;
  players: readonly PlayerView[];
  hostId: string | null;
  connected: (id: string) => boolean;
  planningProper: boolean;
  /** The host has tapped Continue once and is asked to confirm. */
  confirm: boolean;
}

export interface Footer {
  /** The viewer is Ready, as the server has it. */
  ready: boolean;
  /** Before Ready: everyone still planning. Once Ready: everyone else still planning. In seat order. */
  waiting: Seat[];
  /** The host's way to end planning without the rest: none, the Continue button, or its confirmation. */
  host: 'none' | 'continue' | 'confirm';
}

/** What the planning footer shows to `me`. */
export function readyFooter({ me, players, hostId, connected, planningProper, confirm }: FooterIn): Footer {
  const all = stillPlanning(players, connected);
  const ready = !!players.find((p) => p.id === me)?.ready;
  if (!ready) return { ready, waiting: all, host: 'none' };
  const others = all.filter((s) => s.id !== me);
  const canContinue = me === hostId && planningProper && others.length > 0;
  return { ready, waiting: others, host: !canContinue ? 'none' : confirm ? 'confirm' : 'continue' };
}

export type Press = 'ready' | 'continue' | 'continue-now' | 'keep-waiting';

/** A press on the footer: whether the host's confirm is open next, and the intent to send, if any. */
export function press(confirm: boolean, pressed: Press): { confirm: boolean; intent: MuleIntent | null } {
  switch (pressed) {
    case 'ready':
      return { confirm, intent: { type: 'ready' } };
    case 'continue':
      return { confirm: true, intent: null };
    case 'continue-now':
      return { confirm: false, intent: { type: 'continue' } };
    case 'keep-waiting':
      return { confirm: false, intent: null };
  }
}
