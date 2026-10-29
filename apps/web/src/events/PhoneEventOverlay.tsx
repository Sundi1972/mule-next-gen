import type { MuleView } from '@mule/protocol';
import { useEffect, useState } from 'react';
import { EventBoundary, EventLivingMap, EventShow, EventSkipHint, EventSoloRail, eventStageAt, EventTvPhoneRail, PlayerMark, useEventShow } from '@mule/ui';
import { PHASE_NAME } from '../game/derive';
import { usePhoneGame } from '../phone/game';
import { useOverlayOn, useOverlayShow } from './overlay';

/** How long the phone vibrates as an event is announced, in ms. */
const BUZZ_MS = 200;

/**
 * The phone's event overlay (C10), drawn in the shell's layer over whatever phase screen is up while the server clock
 * is inside the phase's show; never in production, whose screen plays its own. RULE-3: with a TV in the room, the
 * gallery's PhoneShow (its own plots marked, the light card, a buzz); alone, its PhoneSolo, which plays the show
 * itself. While the server holds the phase (eventShow.held, RULE-4) the overlay covers the screen until the show ends;
 * a phase it does not hold stays usable, with the light card floating over it.
 */
export function PhoneEventOverlay({ view }: { view: MuleView }) {
  if (!useOverlayOn(view)) return null;
  return (
    <EventBoundary>
      <PhoneEventShow view={view} />
    </EventBoundary>
  );
}

function PhoneEventShow({ view }: { view: MuleView }) {
  const { table, me, self, slot } = usePhoneGame();
  const { show, stage } = useOverlayShow(view);
  const solo = table.boards === 0;
  // A skip is this phone's alone: it moves its show ahead of the server's clock, never the clock.
  const [ahead, setAhead] = useState(0);
  // Alone in a phase that is not held, the first tap collapses the show to the floating light card.
  const [collapsed, setCollapsed] = useState(false);
  if (!show) return null;
  const t = solo ? show.t + ahead : show.t;
  // Alone, the phone plays the show itself: in a held phase until a tap skips past the last result (then the light
  // card covers until the hold ends: the screen under it has no clock yet), otherwise until the first tap.
  const plays = solo && (show.held ? t < show.end : !collapsed);
  const skip = (to: number) => (show.held ? setAhead((a) => a + to - t) : setCollapsed(true));
  return (
    <EventShow events={show.events} introMs={show.introMs} t={t} mode={solo ? 'solo' : 'tv'} {...stage}>
      {show.held || plays ? (
        <div className="absolute inset-0 z-40 flex gap-2 bg-table p-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] text-ink" data-testid="phone-event-overlay" data-mode={plays ? 'solo' : 'light'} data-event-phase={view.phase}>
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
                {/* Playing, the map is the tap target; under the light card it only marks yours. */}
                <EventLivingMap size="phone" focusSlot={slot} light={!plays} {...(plays ? { onSkip: skip } : {})} />
              </div>
            </div>
          </div>
          <aside className="relative flex w-(--rail) shrink-0 flex-col gap-2 rounded-panel border border-holo-line bg-panel p-2.5" data-testid="phone-event-rail">
            {plays ? <EventSoloRail me={me.id} /> : <EventTvPhoneRail me={me.id} />}
            {plays && <EventSkipHint className="mt-auto self-end" />}
          </aside>
        </div>
      ) : (
        // The gallery's PhoneShow card, floating left of the rail; taps go through to the phase screen.
        <div
          className="pointer-events-none absolute bottom-3 right-[calc(var(--rail)+0.75rem+env(safe-area-inset-right))] z-40 flex w-[268px] flex-col gap-2 rounded-panel border border-holo-line bg-panel/95 p-2.5 text-ink shadow-chip"
          data-testid="phone-event-overlay"
          data-mode="light"
          data-event-phase={view.phase}
        >
          {!solo && <AnnounceBuzz />}
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
