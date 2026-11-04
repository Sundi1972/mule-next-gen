import type { MuleView } from '@mule/protocol';
import type { ReactNode } from 'react';
import {
  Creature,
  cx,
  EventBoundary,
  EventLivingMap,
  EventPips,
  EventShow,
  EventSickTag,
  EventTvLog,
  eventSickAt,
  SeatSpeciesProvider,
  SLOT_COLOR,
  useEnclosingEventShow,
  useEventLivingView,
  useSeatSpecies,
  type Slot,
} from '@mule/ui';
import { fmt, PHASE_NAME, seatSpecies, slotOf } from '../game/derive';
import { TvHeader } from '../table/TableApp';
import { useOverlayOn, useOverlayShow } from './overlay';

/**
 * The TV's event layer (C10): the phase screen as it is, and, while the server clock is inside the phase's show, the
 * gallery's TV show over it (TvB: the header's pips, the living map, the log, the colony bar). Never in production,
 * which plays its own. If the show throws it goes away and the screen under it still renders (EventBoundary).
 */
export function TvEventLayer({ game, children }: { game: MuleView; children: ReactNode }) {
  const on = useOverlayOn(game);
  return (
    <div className="relative h-[720px] w-[1280px]">
      {children}
      {on && (
        <EventBoundary>
          <TvEventOverlay game={game} />
        </EventBoundary>
      )}
    </div>
  );
}

/** The show over the phase screen, on the server's clock. */
function TvEventOverlay({ game }: { game: MuleView }) {
  const { show, stage } = useOverlayShow(game);
  if (!show) return null;
  return (
    <SeatSpeciesProvider value={seatSpecies(game)}>
    <div className="absolute inset-0 z-40 flex flex-col gap-4 bg-table px-10 py-6 text-ink" data-testid="tv-event-overlay" data-event-phase={game.phase}>
      <EventShow events={show.events} introMs={show.introMs} t={show.t} mode="tv" {...stage}>
        <TvHeader game={game} title={PHASE_NAME[game.phase]} extra={<EventPips />} />
        <div className="flex min-h-0 flex-1 gap-6 [container-type:size]">
          <div className="shrink-0 self-start" style={{ width: `min(820px, calc(100cqh * ${game.width} / ${game.height}))` }}>
            <EventLivingMap size="tv" className="w-full" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3" data-testid="rail">
            <EventTvLog />
          </div>
        </div>
        <ColonyBar game={game} />
      </EventShow>
    </div>
    </SeatSpeciesProvider>
  );
}

/** The colony bar: each player's slot, glowing while their spotlight plays, with the sick tag once their sickness lands. */
function ColonyBar({ game }: { game: MuleView }) {
  const { player, spot } = useEventLivingView();
  const frame = useEnclosingEventShow();
  const sick = frame ? eventSickAt(frame) : new Set<string>();
  return (
    <div className="grid grid-cols-4 gap-3" data-testid="colony-bar">
      {game.players.map((p) => (
        <PlayerSlot key={p.id} player={p} slot={(slotOf(game, p.id) ?? 0) as Slot} glow={player === p.id && spot > 0.5}>
          {sick.has(p.id) && <EventSickTag className={cx(!frame?.reduced && 'animate-[ev-pop_0.4s_ease-out]')} />}
        </PlayerSlot>
      ))}
    </div>
  );
}

function PlayerSlot({ player, slot, glow, children }: { player: MuleView['players'][number]; slot: Slot; glow: boolean; children?: ReactNode }) {
  const species = useSeatSpecies(slot);
  return (
    <div className={cx('relative flex h-[64px] items-center gap-3 rounded-panel border-2 bg-panel px-3 transition-shadow', glow && 'shadow-glow')} style={{ borderColor: SLOT_COLOR[slot] }} data-testid={`slot-${player.id}`}>
      <Creature species={species} color={SLOT_COLOR[slot]} size={40} />
      <span className="flex shrink-0 flex-col">
        <span className="font-display text-lg font-semibold leading-tight">{player.name}</span>
        <span data-num className="font-mono text-base text-ink-2">
          {fmt(player.money)} cr
        </span>
      </span>
      <span className="ml-auto flex flex-wrap justify-end gap-1">{children}</span>
    </div>
  );
}
