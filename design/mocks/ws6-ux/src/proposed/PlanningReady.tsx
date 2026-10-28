import type { MuleView, PlayerView } from '@mule/protocol';
import { Button, cx, HoloMap, PlayerMark, type Slot } from '@mule/ui';
import { useState } from 'react';
import { mapTiles } from '../../../../../apps/web/src/game/derive';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { H, W } from '../fixture';

/**
 * Planning without a clock (Heiko, 2026-10-28: "the planning phase should not be time bound"; AM-16). Planning ends
 * when every human is Ready, or when the host continues without the rest (in planning proper only: after the month's
 * election, or with none; the server refuses it during the election). The host's phone or laptop carries the
 * Continue button (Heiko ruled it: not the TV, which has no seat and which anyone with the link could open).
 *
 * Who is still planning comes from what every screen already has: `players[].ready` and `isAi` (the game),
 * `table.hostId` and `table.seats[].connected` (the room). A dropped phone still holds planning: a locked phone drops
 * its socket and its player must not be skipped, so "waiting for" names every human not yet Ready, connected or not,
 * and marks who is away so the host can decide.
 *
 * GRAFT TARGETS, each a named edit in its owner's file: apps/web/src/phone/Planning.tsx's footer (WS3's),
 * apps/web/src/phone/Shell.tsx's header, the ready count where the clock was, and the TV's planning branch in
 * apps/web/src/table/TableApp.tsx::TvGame (both WS4's). The intent is WS3's `{ type: 'continue' }` (a46c9e6),
 * accepted only from `table.hostId` in planning proper; the server then adds a news line, "Lena continued without
 * Brix and Kai". While the host's phone is away, hosting passes to the next connected human, so the button follows
 * whoever `table.hostId` names at that moment.
 */

export type Seat = Pick<PlayerView, 'id' | 'name' | 'isAi' | 'ready' | 'slot'> & { away: boolean };

/** Every human not yet Ready, in seat order. AI seats are always ready. */
export function stillPlanning(players: PlayerView[], connected: (id: string) => boolean): Seat[] {
  return players.filter((p) => !p.isAi && !p.ready).map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, ready: p.ready, slot: p.slot, away: !connected(p.id) }));
}

/** "Brix", "Brix and Kai", "you, Brix and Kai": the viewer is "you" and comes first. */
export function namesOf(seats: Seat[], me: string | null): string {
  const names = [...seats.filter((s) => s.id === me).map(() => 'you'), ...seats.filter((s) => s.id !== me).map((s) => s.name)];
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** Who this screen waits for, with the viewer's own Ready taken from the screen (it may run ahead of the server). */
export function useWaiting(ready: boolean) {
  const { table, view, self } = usePhoneGame();
  const connected = (id: string) => table.seats.find((s) => s.id === id)?.connected ?? true;
  const players = view.players.map((p) => (p.id === self.id ? { ...p, ready } : p));
  const waiting = stillPlanning(players, connected);
  return { players, waiting, others: waiting.filter((s) => s.id !== self.id), isHost: table.hostId === self.id };
}

/** The Now card once you're ready: what is left is waiting, or, for the host, deciding not to. */
export function readyNow(others: Seat[], isHost: boolean): { title: string; detail: string } {
  if (others.length === 0) return { title: 'Everyone is ready', detail: 'The land grant starts.' };
  const who = namesOf(others, null);
  const away = others.filter((s) => s.away).map((s) => s.name);
  const awayLine = away.length > 0 ? ` ${namesOf(others.filter((s) => s.away), null)} ${away.length === 1 ? 'is' : 'are'} away.` : '';
  return isHost
    ? { title: `You're ready. Waiting for ${who}`, detail: `Planning has no clock: it ends when everyone is ready. As the host, you can continue without them.${awayLine}` }
    : { title: `You're ready. Waiting for ${who}`, detail: `Planning has no clock: it ends when everyone is ready, or when the host continues.${awayLine}` };
}

/** The ready count, where the clock used to be: planning has none. */
export function ReadyCount({ players, tv = false }: { players: PlayerView[]; tv?: boolean }) {
  const ready = players.filter((p) => p.isAi || p.ready).length;
  return (
    <span
      className={cx('flex shrink-0 items-center gap-1.5 rounded-chip border border-holo-line bg-holo-soft font-mono font-bold text-holo', tv ? 'h-14 px-5 text-3xl' : 'h-8 px-2.5 text-sm @min-[1100px]/shell:h-11 @min-[1100px]/shell:px-4 @min-[1100px]/shell:text-2xl')}
      data-testid="ready-count"
    >
      {ready} / {players.length} READY
    </span>
  );
}

/** The names still planning, each with its creature, and an away mark for a dropped phone. */
function WaitingFor({ seats, me, tv = false }: { seats: Seat[]; me: string | null; tv?: boolean }) {
  const ordered = [...seats.filter((s) => s.id === me), ...seats.filter((s) => s.id !== me)];
  return (
    <span className={cx('flex flex-wrap items-center gap-x-2 gap-y-1', tv ? 'text-3xl' : 'text-sm @min-[1100px]/shell:text-lg')} data-testid="waiting-for">
      <span className="text-ink-2">Waiting for</span>
      {ordered.map((s) => (
        <span key={s.id} className="flex items-center gap-1 font-semibold" data-testid={`waiting-${s.id}`}>
          <PlayerMark slot={s.slot as Slot} size={tv ? 30 : 14} glow={!s.away} />
          {s.id === me ? 'you' : s.name}
          {s.away && <span className={cx('rounded-chip border border-warn/60 font-mono font-bold text-warn', tv ? 'px-2 text-lg' : 'px-1 text-[10px] @min-[1100px]/shell:text-xs')}>AWAY</span>}
        </span>
      ))}
    </span>
  );
}

/**
 * The planning footer on every phone and laptop. Before you're ready: who is still planning, then I'm ready. Once
 * you are: who you're waiting for. The host, once ready and while anyone is still planning, can continue without
 * them, after one confirming tap.
 */
export function ReadyBar({ ready, onReady, confirm: startConfirm = false, planningProper }: { ready: boolean; onReady: () => void; confirm?: boolean; planningProper: boolean }) {
  const { self } = usePhoneGame();
  const { waiting, others, isHost: host } = useWaiting(ready);
  // The server accepts Continue only from the host and only in planning proper (after the election, or with none).
  const isHost = host && planningProper;
  const [confirm, setConfirm] = useState(startConfirm);

  if (!ready)
    return (
      <>
        {waiting.length > 0 && <WaitingFor seats={waiting} me={self.id} />}
        <Button size="lg" className="w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={onReady} data-testid="ready">
          I'm ready
        </Button>
      </>
    );

  return (
    <>
      <span className="flex items-center gap-1.5 font-display text-base font-semibold text-holo @min-[1100px]/shell:text-xl" data-testid="you-are-ready">
        <svg aria-hidden viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
        You're ready
      </span>
      {others.length > 0 ? <WaitingFor seats={others} me={self.id} /> : <span className="text-sm text-ink-2">Everyone is ready. The land grant starts.</span>}
      {isHost && others.length > 0 && !confirm && (
        <Button size="md" variant="outline" className="w-full" onClick={() => setConfirm(true)} data-testid="continue">
          Continue without {others.length === 1 ? others[0]!.name : 'them'}
        </Button>
      )}
      {isHost && others.length > 0 && confirm && (
        <div className="flex flex-col gap-2 rounded-panel border border-warn/60 bg-panel p-2.5 @min-[1100px]/shell:p-4" role="alertdialog" aria-label="Continue without them?" data-testid="continue-confirm">
          <p className="text-sm @min-[1100px]/shell:text-base">
            End planning for everyone now? {namesOf(others, null)} stop{others.length === 1 ? 's' : ''} where they are, and the land grant starts.
          </p>
          <div className="flex gap-2">
            <Button size="md" className="flex-1" data-testid="continue-now">
              Continue now
            </Button>
            <Button size="md" variant="ghost" className="flex-1" onClick={() => setConfirm(false)} data-testid="keep-waiting">
              Keep waiting
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** The TV in planning: no clock, the ready count instead, and who the table is waiting for, big. */
export function TvPlanning({ view, hostId, away }: { view: MuleView; hostId: string; away: string[] }) {
  const waiting = stillPlanning(view.players, (id) => !away.includes(id));
  const host = view.players.find((p) => p.id === hostId);
  const hostReady = !!host && (host.ready || host.isAi);
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-6 text-ink" data-testid="tv-planning">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <TvHeader game={{ ...view, phase: 'planning' }} title="Planning" />
        </div>
        <ReadyCount players={view.players} tv />
      </div>
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="w-[700px] shrink-0 self-start" data-testid="tv-map">
          <HoloMap width={W} height={H} tiles={mapTiles(view)} density="tv" hideGround className="w-full" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {waiting.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-panel border-2 border-holo bg-holo-soft p-5 shadow-glow" data-testid="tv-waiting">
              <WaitingFor seats={waiting} me={null} tv />
              {host && hostReady && <span className="text-lg text-ink-2">{host.name}, the host, can continue without them.</span>}
            </div>
          ) : (
            <div className="rounded-panel border-2 border-holo bg-holo-soft p-5 font-display text-3xl font-semibold shadow-glow">Everyone is ready</div>
          )}
          {/* The graft keeps today's planning side here: MarketTiles and News (TableApp.tsx), unchanged. */}
          <div className="grid flex-1 place-items-center rounded-panel border border-dashed border-holo-line text-center font-mono text-sm text-ink-3" data-testid="tv-unchanged">
            TODAY'S MARKET TILES AND NEWS
            <br />
            STAY HERE, UNCHANGED
          </div>
          <ul className="flex flex-col gap-2" data-testid="tv-ready-list">
            {view.players.map((p) => {
              const isAway = !p.isAi && away.includes(p.id);
              const state = p.isAi ? 'AI · READY' : p.ready ? 'READY' : isAway ? 'AWAY · PLANNING' : 'PLANNING';
              return (
                <li key={p.id} className={cx('flex items-center gap-3', (p.isAi || p.ready) && 'opacity-60')}>
                  <PlayerMark slot={p.slot as Slot} size={22} glow={!(p.isAi || p.ready)} />
                  <span className="flex-1 truncate font-display text-xl font-semibold">{p.name}</span>
                  <span className={cx('font-mono text-sm', isAway ? 'text-warn' : p.ready || p.isAi ? 'text-ink-3' : 'text-holo')}>{state}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
