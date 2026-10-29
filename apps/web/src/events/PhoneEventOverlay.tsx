import type { MuleView } from '@mule/protocol';
import { useEffect, useMemo, useState } from 'react';
import {
  EventBoundary,
  EventLivingMap,
  EventShow,
  EventSkipHint,
  EventSoloRail,
  eventStageAt,
  EventTvPhoneRail,
  PlayerMark,
  useEventReducedMotion,
  useEventShow,
  type ShowPlayer,
  type Slot,
} from '@mule/ui';
import { mapTiles, PHASE_NAME, slotOf } from '../game/derive';
import { useServerNow } from '../net/react';
import { usePhoneGame } from '../phone/game';
import { overlayShowAt } from './clock';

/** How often the phone looks at the server clock: between shows only to see one start; while one plays, every frame. */
const IDLE_MS = 200;
const FRAME_MS = 33;
/** How long the phone vibrates as an event is announced, in ms. */
const BUZZ_MS = 200;

/**
 * The phone's event overlay (C10), drawn in the shell's layer over whatever phase screen is up. It plays while the
 * server clock is inside the phase's show, never in production (its screen plays its own). RULE-3: with a TV in the
 * room, the gallery's PhoneShow (its own plots marked, the light card, a buzz); alone, its PhoneSolo: the phone plays the
 * show itself, and a tap on its map skips to the result, then to the next event, then out. Either covers the screen
 * for the whole show: a timed phase's clocks wait for it (RULE-4), so the screen under it has nothing to show yet.
 */
export function PhoneEventOverlay({ view }: { view: MuleView }) {
  const now = useServerNow(IDLE_MS);
  if (overlayShowAt(view, now) === null) return null;
  return (
    <EventBoundary>
      <PhoneEventShow view={view} />
    </EventBoundary>
  );
}

function PhoneEventShow({ view }: { view: MuleView }) {
  const { table, me, self, slot } = usePhoneGame();
  const show = overlayShowAt(view, useServerNow(FRAME_MS));
  const solo = table.boards === 0;
  // A skip is this phone's alone: it moves its show ahead of the server's clock, never the clock. With a TV in the
  // room the phone is back on the TV's clock.
  const [ahead, setAhead] = useState(0);
  // Planning is never held (RULE-4 c): people act while its show plays, so its screen must stay usable. Alone, the
  // gallery's PhoneSolo covers it until the first tap, which collapses the show to the floating light card.
  const [collapsed, setCollapsed] = useState(false);
  const held = view.phase !== 'planning';
  const reduced = useEventReducedMotion();
  const tiles = useMemo(() => mapTiles(view), [view]);
  const players = useMemo<ShowPlayer[]>(() => view.players.map((p) => ({ id: p.id, slot: (slotOf(view, p.id) ?? 0) as Slot, name: p.name })), [view]);
  if (!show) return null;
  const t = solo ? show.t + ahead : show.t;
  // Skipped past the last result: the show is over for this phone.
  if (t >= show.end) return null;
  if (!held && (!solo || collapsed))
    return (
      <EventShow events={show.events} introMs={show.introMs} t={t} mode={solo ? 'solo' : 'tv'} reduced={reduced} width={view.width} height={view.height} tiles={tiles} players={players}>
        {/* The gallery's PhoneShow card, floating left of the rail; taps go through to the planning screen. */}
        <div
          className="pointer-events-none absolute bottom-3 right-[calc(var(--rail)+0.75rem+env(safe-area-inset-right))] z-40 flex w-[268px] flex-col gap-2 rounded-panel border border-holo-line bg-panel/95 p-2.5 text-ink shadow-chip"
          data-testid="phone-event-overlay"
          data-mode="light"
          data-event-phase={view.phase}
        >
          {!solo && <AnnounceBuzz />}
          <EventTvPhoneRail me={me.id} />
        </div>
      </EventShow>
    );
  return (
    <EventShow events={show.events} introMs={show.introMs} t={t} mode={solo ? 'solo' : 'tv'} reduced={reduced} width={view.width} height={view.height} tiles={tiles} players={players}>
      {/* While the server holds the phase, both cover its screen for the whole show: the gallery's PhoneSolo and PhoneShow. */}
      <div className="absolute inset-0 z-40 flex gap-2 bg-table p-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] text-ink" data-testid="phone-event-overlay" data-mode={solo ? 'solo' : 'light'} data-event-phase={view.phase}>
        {!solo && <AnnounceBuzz />}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2 px-1">
            <span className="font-display text-sm font-bold">{PHASE_NAME[view.phase]}</span>
            <span className="label-caps text-[10px]!">Month {view.month}</span>
            <span className="ml-auto flex items-center gap-1 text-xs text-ink-2">
              <PlayerMark slot={slot} size={14} />
              {self.name}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
            <div style={{ width: `min(100cqw, calc(100cqh * ${view.width} / ${view.height}))` }}>
              {/* Alone the map plays the show and is the tap target; with a TV it only marks yours (the light card does the rest). */}
              <EventLivingMap size="phone" focusSlot={slot} light={!solo} {...(solo ? { onSkip: (to: number) => (held ? setAhead((a) => a + to - t) : setCollapsed(true)) } : {})} />
            </div>
          </div>
        </div>
        <aside className="relative flex w-(--rail) shrink-0 flex-col gap-2 rounded-panel border border-holo-line bg-panel p-2.5" data-testid="phone-event-rail">
          {solo ? <EventSoloRail me={me.id} /> : <EventTvPhoneRail me={me.id} />}
          {solo && <EventSkipHint className="mt-auto self-end" />}
        </aside>
      </div>
    </EventShow>
  );
}

/** With a TV in the room, the phone vibrates once as each event is announced, where the device can. */
function AnnounceBuzz() {
  const { s, t } = useEventShow();
  const event = eventStageAt(s, t).seg?.n ?? null;
  useEffect(() => {
    if (event === null || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(BUZZ_MS);
  }, [event]);
  return null;
}
