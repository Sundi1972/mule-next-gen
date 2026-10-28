import type { ProductionView } from '@mule/protocol';
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  cx,
  EventShow,
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
  SHOW,
  ShowRoot,
  showEnd,
  showTime,
  type Good,
  type ShowMode,
  type Slot,
} from '@mule/ui';
import { mapTiles, slotOf } from '../game/derive';
import { useClient, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { PhoneShell } from './Shell';

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
  // A skip is this phone's alone: it moves the phone's show ahead of the server's clock, never the clock itself.
  const [ahead, setAhead] = useState(0);
  const t = Math.min(showEnd(production), serverT + ahead);
  const solo = table.boards === 0;
  const mode: ShowMode = solo ? 'solo' : 'tv';
  const reduced = useReducedMotion();
  const tiles = useMemo(() => mapTiles(view), [view]);
  const slots = Object.fromEntries(view.players.map((p) => [p.id, (slotOf(view, p.id) ?? 0) as Slot]));
  const players = useMemo(() => view.players.map((p) => ({ id: p.id, name: p.name, slot: (slotOf(view, p.id) ?? 0) as Slot })), [view]);
  const script = useMemo(() => eventScript(production, SHOW.eventAt, mode), [production, mode]);
  const skipTo = solo ? eventSkipTo(script, t) : null;
  const mine = harvest(production, me.id);
  const arrived = landed(production, t, me.id);
  useBuzz(solo ? null : eventStageAt(script, t).seg?.n ?? null);

  return (
    <PhoneShell
      phase="Production"
      fill
      rail={
        <>
          {production.events.length === 0 ? (
            <span className="label-caps">Your plots are working</span>
          ) : (
            <EventShow events={production.events} introMs={production.introMs} t={t} start={SHOW.eventAt} mode={mode} reduced={reduced} width={view.width} height={view.height} tiles={tiles} players={players}>
              {solo ? <EventSoloRail me={me.id} canSkip /> : <EventTvPhoneRail me={me.id} />}
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
        <Button size="lg" variant={self.ready ? 'outline' : 'holo'} className="w-full px-2" disabled={self.ready} onClick={() => client.intent({ type: 'ready' })}>
          {self.ready ? 'Waiting for the others' : 'On to the auction'}
        </Button>
      }
    >
      <ShowRoot className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center [container-type:size]">
          <div className="relative" style={{ width: `min(100cqw, calc(100cqh * ${view.width} / ${view.height}))` }}>
            <ProductionMap width={view.width} height={view.height} tiles={tiles} production={production} t={t} slots={slots} players={players} only={me.id} reduced={reduced} mode={mode} />
            {/* Alone, the whole map is the tap target: to the event's result, tapped again to the next event. */}
            {skipTo !== null && (
              <button
                type="button"
                onClick={() => setAhead((a) => a + skipTo - t)}
                className="absolute inset-0 z-30"
                aria-label={skipTo === eventStageAt(script, t).seg?.settleAt ? 'Tap to skip to what it did to you' : 'Tap for the next event'}
                data-testid="skip"
              />
            )}
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

/** The device's reduced-motion setting: no camera and no shake, every result still shown (HC-6). */
function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const list = matchMedia(query);
    const change = () => setReduced(list.matches);
    list.addEventListener('change', change);
    return () => list.removeEventListener('change', change);
  }, []);
  return reduced;
}

/** With a TV in the room, the phone vibrates as each event is announced, where the device can. */
function useBuzz(event: number | null) {
  useEffect(() => {
    if (event === null || typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    navigator.vibrate(200);
  }, [event]);
}
