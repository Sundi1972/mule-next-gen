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
 * room, the light card over the screen and a buzz, the screen still usable under it; alone, the phone plays the show
 * itself over the screen, and a tap on its map skips to the result, then to the next event, then out.
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
  const reduced = useEventReducedMotion();
  const tiles = useMemo(() => mapTiles(view), [view]);
  const players = useMemo<ShowPlayer[]>(() => view.players.map((p) => ({ id: p.id, slot: (slotOf(view, p.id) ?? 0) as Slot, name: p.name })), [view]);
  if (!show) return null;
  const t = solo ? show.t + ahead : show.t;
  // Skipped past the last result: the show is over for this phone.
  if (t >= show.end) return null;
  return (
    <EventShow events={show.events} introMs={show.introMs} t={t} mode={solo ? 'solo' : 'tv'} reduced={reduced} width={view.width} height={view.height} tiles={tiles} players={players}>
      {solo ? (
        <div className="absolute inset-0 z-40 flex gap-2 bg-table p-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] text-ink" data-testid="phone-event-overlay" data-mode="solo" data-phase={view.phase}>
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
                <EventLivingMap size="phone" focusSlot={slot} onSkip={(to) => setAhead((a) => a + to - t)} />
              </div>
            </div>
          </div>
          <aside className="relative flex w-(--rail) shrink-0 flex-col gap-2 rounded-panel border border-holo-line bg-panel p-2.5" data-testid="phone-event-rail">
            <EventSoloRail me={me.id} />
            <EventSkipHint className="mt-auto self-end" />
          </aside>
        </div>
      ) : (
        <div
          className="pointer-events-none absolute bottom-3 right-[calc(var(--rail)+0.75rem+env(safe-area-inset-right))] z-40 flex w-[268px] flex-col gap-2 rounded-panel border border-holo-line bg-panel/95 p-2.5 text-ink shadow-chip"
          data-testid="phone-event-overlay"
          data-mode="light"
          data-phase={view.phase}
        >
          <AnnounceBuzz />
          <EventTvPhoneRail me={me.id} />
        </div>
      )}
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
