import type { ProductionView } from '@mule/protocol';
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  cx,
  EventShow,
  EventSkipHint,
  EventSoloRail,
  EventTvPhoneRail,
  eventScript,
  eventSkipTo,
  eventStageAt,
  frameMs,
  GOOD_NAME,
  GoodIcon,
  harvest,
  landed,
  landing,
  ProductionMap,
  productionShowProps,
  SHOW,
  ShowRoot,
  showEnd,
  showTime,
  type Good,
  type ShowMode,
  type Slot,
  useEventReducedMotion,
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
  const serverT = showTime(view.phaseEndsAt, useServerNow(frameMs(production.lengthMs)), production.lengthMs, production);
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
  // The same script the map's and the rail's <EventShow> build from productionShowProps: equal by value (eventScript
  // is pure in the same events, intro, start and mode), read here for the skip hint and the buzz.
  const script = useMemo(() => eventScript(production, SHOW.eventAt, mode), [production, mode]);
  const skipTo = solo ? eventSkipTo(script, t) : null;
  const playingNow = eventStageAt(script, t).seg;
  const mine = harvest(production, me.id);
  const arrived = landed(production, t, me.id);
  useBuzz(solo ? null : (playingNow?.n ?? null));

  return (
    <PhoneShell
      phase="Production"
      fill
      rail={
        <>
          {production.events.length === 0 ? (
            <span className="label-caps">Your plots are working</span>
          ) : (
            <EventShow {...productionShowProps(production, t, { reduced, mode, players, tiles, width: view.width, height: view.height })}>
              {solo ? <EventSoloRail me={me.id} /> : <EventTvPhoneRail me={me.id} />}
            </EventShow>
          )}
          <ul className="flex flex-col gap-1" data-testid="harvest">
            {(Object.entries(mine) as [Good, number][]).map(([g, n]) => (
              <li key={g} className="flex items-center justify-between rounded-control bg-raised px-2 py-1">
                <span className="flex items-center gap-1.5 text-sm">
                  <GoodIcon good={g} size={14} />
                  {GOOD_NAME[g]}
                </span>
                <span data-num className="font-mono text-sm font-bold">
                  +{n}
                  {t >= SHOW.flyStart && (arrived[g] ?? 0) < n && <span className="font-normal text-ink-3"> · flying home</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      }
      footer={
        <>
          {/* Alone, what a tap on the map does now, by the screen's actions (AM-2: the rail's foot). */}
          {skipTo !== null && <EventSkipHint playing={skipTo === playingNow?.settleAt} className="self-end" />}
          <Button size="lg" variant={self.ready ? 'outline' : 'holo'} className="w-full px-2" disabled={self.ready} onClick={() => client.intent({ type: 'ready' })}>
            {self.ready ? 'Waiting for the others' : 'On to the auction'}
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
          className={cx('mt-1.5 flex h-8 shrink-0 items-center justify-between rounded-control border border-holo-line bg-panel px-2 transition-shadow', landing(production, t, me.id) && 'shadow-glow')}
          data-testid="stock-strip"
        >
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
        </div>
      </ShowRoot>
    </PhoneShell>
  );
}

/** With a TV in the room, the phone vibrates as each event is announced, where the device can. */
function useBuzz(event: number | null) {
  useEffect(() => {
    if (event === null || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(BUZZ_MS);
  }, [event]);
}
