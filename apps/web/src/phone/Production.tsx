import type { ProductionView } from '@mule/protocol';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  cx,
  EventBoundary,
  EventShow,
  EventSkipHint,
  EventSoloRail,
  EventTvPhoneRail,
  eventStageAt,
  showTimes,
  frameMs,
  GOOD_NAME,
  GoodIcon,
  harvest,
  landed,
  landing,
  ProductionMap,
  productionShowProps,
  ShowRoot,
  showEnd,
  showTime,
  SLOT_COLOR,
  type Good,
  type ShowData,
  type ShowMode,
  type Slot,
  useEventReducedMotion,
  useEventShow,
} from '@mule/ui';
import { mapTiles, slotOf } from '../game/derive';
import { useClient, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { PhoneShell } from './Shell';

/** How long the phone vibrates as an event is announced, in ms. */
const BUZZ_MS = 200;

const GOODS: Good[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'alloy', 'electronics', 'medicine'];

/**
 * Production on your phone: only your plots fill, and your harvest flies into your private stock strip. With a TV in
 * the room the phone carries the light card for each event (RULE-3 row 1); alone (no board connected), it plays each
 * event on its own map at the solo beat, and a tap on the map skips this phone's show to the result (rows 2-4).
 */
export function Production({ production }: { production: ProductionView }) {
  const client = useClient();
  const { table, view, me, self } = usePhoneGame();
  const show: ShowData = production;
  const serverT = showTime(view.phaseEndsAt, useServerNow(frameMs(production.lengthMs)), production.lengthMs, show);
  const solo = table.boards === 0;
  // A skip is this phone's alone: it moves the phone's show ahead of the server's clock, never the clock itself. With
  // a TV in the room the phone is back on the TV's clock, whatever it skipped while alone. The offset is kept, so a
  // TV that leaves again brings the skip back: RULE-3's "skipped" lasts the phase.
  const [ahead, setAhead] = useState(0);
  const t = solo ? Math.min(showEnd(production), serverT + ahead) : serverT;
  const mode: ShowMode = solo ? 'solo' : 'tv';
  const reduced = useEventReducedMotion();
  const tiles = useMemo(() => mapTiles(view), [view]);
  const slots = Object.fromEntries(view.players.map((p) => [p.id, (slotOf(view, p.id) ?? 0) as Slot]));
  const players = useMemo(() => view.players.map((p) => ({ id: p.id, name: p.name, slot: (slotOf(view, p.id) ?? 0) as Slot })), [view]);
  const mine = harvest(production, me.id);
  const arrived = landed(production, t, me.id);
  const done = t >= showEnd(production);
  // Speed up (B-AC-20): with a TV in the room the rest of the show plays faster once every person has asked; the
  // computer players always agree. A phone alone keeps its tap-the-map skip instead.
  const people = view.players.filter((p) => !p.isAi);
  const asked = new Set(production.hurry?.asked ?? []);

  return (
    // One show for the whole screen: the map, the rail, the skip hint and the buzz read the same script.
    <EventShow {...productionShowProps(production, t, { reduced, mode, players, tiles, width: view.width, height: view.height })}>
      <AnnounceBuzz on={!solo} />
      <PhoneShell
        phase="Production"
        fill
        rail={
          <>
            {production.events.length === 0 ? (
              <span className="label-caps">Your plots are working</span>
            ) : (
              <EventBoundary>{solo ? <EventSoloRail me={me.id} /> : <EventTvPhoneRail me={me.id} />}</EventBoundary>
            )}
            <AfterTheShow solo={solo}>
              <ul className="flex flex-col gap-1" data-testid="harvest">
                {(Object.entries(mine) as [Good, number][]).map(([g, n]) => (
                  <li key={g} className="flex items-center justify-between rounded-control bg-raised px-2 py-1">
                    <span className="flex items-center gap-1.5 text-sm">
                      <GoodIcon good={g} size={14} />
                      {GOOD_NAME[g]}
                    </span>
                    <span data-num className="font-mono text-sm font-bold">
                      +{n}
                      {t >= showTimes(show).flightAt && (arrived[g] ?? 0) < n && <span className="font-normal text-ink-3"> · flying home</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </AfterTheShow>
          </>
        }
        footer={
          <>
            {/* Alone, what a tap on the map does now, by the screen's actions (AM-2: the rail's foot). */}
            {solo && <EventSkipHint className="self-end" />}
            {!solo && !done && (
              <Button
                size="md"
                variant={asked.has(me.id) ? 'outline' : 'ghost'}
                className="w-full"
                disabled={asked.has(me.id)}
                onClick={() => client.intent({ type: 'hurry' })}
                data-testid="speed-up-button"
              >
                {asked.has(me.id) ? `⏩ Asked: ${people.filter((p) => asked.has(p.id)).length} of ${people.length}` : '⏩ Speed up'}
              </Button>
            )}
            {/* Ready waits for the end of the show, so the table always sees its month; ⏩ is the way to shorten it. */}
            <Button
              size="lg"
              variant={done && !self.ready ? 'holo' : 'outline'}
              className="w-full px-2"
              disabled={!done || self.ready}
              onClick={() => client.intent({ type: 'ready' })}
              data-testid="ready"
            >
              {!done ? 'Watching the show' : self.ready ? 'Waiting for the others' : 'Ready for the auction'}
            </Button>
          </>
        }
      >
        <ShowRoot className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
            <div style={{ width: `min(100cqw, calc(100cqh * ${view.width} / ${view.height}))` }}>
              <ProductionMap
                width={view.width}
                height={view.height}
                tiles={tiles}
                production={production}
                t={t}
                slots={slots}
                players={players}
                only={me.id}
                reduced={reduced}
                mode={mode}
                light={!solo}
                {...(solo ? { onSkip: (to: number) => setAhead((a) => a + to - t) } : {})}
              />
            </div>
          </div>
          <div
            data-fly-target={me.id}
            className={cx('mt-1.5 flex h-8 shrink-0 items-center gap-2 rounded-control border-2 bg-panel px-2 transition-shadow', landing(production, t, me.id) && 'shadow-glow')}
            style={{ borderColor: SLOT_COLOR[slots[me.id] ?? 0] }}
            data-testid="stock-strip"
          >
            {/* Your silo (AM-19): everything you hold, this month's harvest counting in as it lands. */}
            <span className="label-caps shrink-0">Your silo</span>
            <span className="flex flex-1 items-center justify-between">
            {GOODS.map((g) => {
              // Your stock already holds this month's harvest; what is still in the air is not shown yet.
              const n = Math.max(0, me.stock[g] - ((mine[g] ?? 0) - (arrived[g] ?? 0)));
              return (
                <span key={g} className="flex items-center gap-0.5" aria-label={`${GOOD_NAME[g]} ${n}`}>
                  <GoodIcon good={g} size={13} />
                  <span data-num data-good={g} className={cx('font-mono text-xs font-bold', (arrived[g] ?? 0) > 0 ? 'text-ok' : 'text-ink')}>
                    {n}
                  </span>
                </span>
              );
            })}
            </span>
          </div>
        </ShowRoot>
      </PhoneShell>
    </EventShow>
  );
}

/** Alone, the rail is the show's while it plays, as the gallery's: the harvest would crowd it out at 667 px. */
function AfterTheShow({ solo, children }: { solo: boolean; children: ReactNode }) {
  const { s, t } = useEventShow();
  return !solo || t >= s.end ? children : null;
}

/** Buzzes once for each event the show announces, while `on`: with a TV in the room. */
function AnnounceBuzz({ on }: { on: boolean }) {
  const { s, t } = useEventShow();
  useBuzz(on ? (eventStageAt(s, t).seg?.n ?? null) : null);
  return null;
}

/** With a TV in the room, the phone vibrates as each event is announced, where the device can. */
function useBuzz(event: number | null) {
  useEffect(() => {
    if (event === null || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(BUZZ_MS);
  }, [event]);
}
