import type { ElectionView, MuleIntent, MuleView, PlayerView, TableView } from '@mule/protocol';

/** Planning has no clock: who it still waits for, and what the planning footer shows and sends. */

export type Seat = Pick<PlayerView, 'id' | 'name' | 'isAi' | 'ready' | 'slot'> & { away: boolean };

function seatOf(p: PlayerView, connected: (id: string) => boolean): Seat {
  return { id: p.id, name: p.name, isAi: p.isAi, ready: p.ready, slot: p.slot, away: !connected(p.id) };
}

/**
 * Every person not yet Ready, in seat order. An AI is always ready. A dropped phone is still waited for, marked
 * away: a locked phone drops its socket, and its player must not be skipped.
 */
export function stillPlanning(players: readonly PlayerView[], connected: (id: string) => boolean): Seat[] {
  return players.filter((p) => !p.isAi && !p.ready).map((p) => seatOf(p, connected));
}

/** One line of the TV's ready list: a seat, or the table's AIs folded into one. */
export type ReadyRow = { kind: 'seat'; seat: Seat } | { kind: 'ais'; seats: Seat[] };

/** From this many seats the TV folds its AIs into one row, so the news beside the list keeps its room. */
export const FOLD_AIS_FROM = 5;

/**
 * The TV's ready list, in seat order. Every person keeps a row, so the TV names whoever the table waits for; from
 * FOLD_AIS_FROM seats the AIs, always ready, share one row at the end. The seat count decides, not the space left,
 * so the list doesn't jump as news arrives.
 */
export function readyRows(players: readonly PlayerView[], connected: (id: string) => boolean): ReadyRow[] {
  const seats = players.map((p) => seatOf(p, connected));
  const ais = seats.filter((s) => s.isAi);
  if (seats.length < FOLD_AIS_FROM || ais.length === 0) return seats.map((seat) => ({ kind: 'seat', seat }));
  return [...seats.filter((s) => !s.isAi).map((seat): ReadyRow => ({ kind: 'seat', seat })), { kind: 'ais', seats: ais }];
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

/**
 * The Now card for a Ready player in planning proper, or null to keep the screen's own: while the month's election
 * runs, Ready only means done with this stage, and the election's Now still says what comes next.
 */
export function readyNowIn(view: Pick<MuleView, 'phase' | 'politics'>, ready: boolean, others: readonly Seat[], isHost: boolean): { title: string; detail: string } | null {
  return ready && planningProper(view) ? readyNow(others, isHost) : null;
}

/** Planning with no election running: the time Ready ends planning. */
export function planningProper(view: Pick<MuleView, 'phase' | 'politics'>): boolean {
  const election = view.politics?.election;
  return view.phase === 'planning' && !(election && election.stage !== 'over');
}

/**
 * When the server takes the host's Continue: planning proper, or the election's announce or ballot, never its
 * ceremony; and month 1's development while its clock waits for the first MULEs.
 */
export function hostMayContinue(view: Pick<MuleView, 'phase' | 'politics' | 'clockWaitsFor'>): boolean {
  const stage = view.politics?.election?.stage;
  if (view.phase === 'development') return !!view.clockWaitsFor;
  return planningProper(view) || (view.phase === 'planning' && (stage === 'announce' || stage === 'ballot'));
}

/** The host's confirm before Continue is sent: what it does to the players not yet Ready, at this election stage. */
export function continueQuestion(stage: ElectionView['stage'] | null | undefined, others: readonly Seat[]): string {
  const names = namesOf(others, null);
  const one = others.length === 1;
  if (stage === 'announce') return `Go on without ${names}? The candidates close as they are.`;
  if (stage === 'ballot') return `Go on without ${names}? ${names} ${one ? "doesn't" : "don't"} vote this time.`;
  return `End planning for everyone now? ${names} stop${one ? 's' : ''} where they are, and the land grant starts.`;
}

export interface FooterIn {
  me: string;
  players: readonly PlayerView[];
  hostId: string | null;
  connected: (id: string) => boolean;
  /** hostMayContinue for the view. */
  mayContinue: boolean;
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
export function readyFooter({ me, players, hostId, connected, mayContinue, confirm }: FooterIn): Footer {
  const all = stillPlanning(players, connected);
  const ready = !!players.find((p) => p.id === me)?.ready;
  if (!ready) return { ready, waiting: all, host: 'none' };
  const others = all.filter((s) => s.id !== me);
  const canContinue = me === hostId && mayContinue && others.length > 0;
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
