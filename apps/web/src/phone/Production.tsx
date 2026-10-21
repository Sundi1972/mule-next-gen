import type { ProductionView } from '@mule/protocol';
import { Button, cx, EventCard, GOOD_NAME, GoodIcon, harvest, landed, landing, ProductionMap, SHOW, ShowRoot, showTime, type Good, type Slot } from '@mule/ui';
import { mapTiles, slotOf } from '../game/derive';
import { useClient, useServerNow } from '../net/react';
import { usePhoneGame } from './game';
import { PhoneShell } from './Shell';

const FRAME_MS = 40;
const GOODS: Good[] = ['food', 'water', 'energy', 'smithore', 'crystite', 'rareEarth', 'alloy', 'electronics', 'medicine'];

/** Production on your phone: only your plots fill, and your harvest flies into your private stock strip. */
export function Production({ production }: { production: ProductionView }) {
  const client = useClient();
  const { view, me, self } = usePhoneGame();
  const t = showTime(view.phaseEndsAt, useServerNow(FRAME_MS));
  const ev = production.events[0] ?? null;
  const slots = Object.fromEntries(view.players.map((p) => [p.id, (slotOf(view, p.id) ?? 0) as Slot]));
  const mine = harvest(production, me.id);
  const arrived = landed(production, t, me.id);
  const shown = t >= SHOW.cardAt && ev;

  return (
    <PhoneShell
      phase="Production"
      fill
      rail={
        <>
          {shown ? <EventCard ev={ev} t={t} /> : <span className="label-caps">Your plots are working</span>}
          {shown && (
            <p className="text-xs leading-snug text-ink-2" data-testid="hit-me">
              {eventOnYou(production, me.id)}
            </p>
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
          <div style={{ width: `min(100cqw, calc(100cqh * ${view.width} / ${view.height}))` }}>
            <ProductionMap width={view.width} height={view.height} tiles={mapTiles(view)} production={production} t={t} slots={slots} only={me.id} />
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

/** One line on what the month's event did to your plots. */
function eventOnYou(production: ProductionView, id: string): string {
  const hits = new Map(production.events[0]?.hits.map((h) => [`${h.x},${h.y}`, h.delta]));
  const change: Partial<Record<Good, number>> = {};
  for (const l of production.lines) {
    const delta = hits.get(`${l.x},${l.y}`);
    if (l.owner !== id || delta === undefined) continue;
    change[l.good] = (change[l.good] ?? 0) + Math.max(-l.made, delta);
  }
  const parts = (Object.entries(change) as [Good, number][]).filter(([, n]) => n !== 0);
  if (parts.length === 0) return 'Your plots are clear of it.';
  return `It hit your plots: ${parts.map(([g, n]) => `${Math.abs(n)} ${GOOD_NAME[g]} ${n < 0 ? 'lost' : 'more'}`).join(', ')}.`;
}
