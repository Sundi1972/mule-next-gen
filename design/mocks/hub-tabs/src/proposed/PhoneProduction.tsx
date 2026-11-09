import { cx, HoloMap, type MapTile } from '@mule/ui';
import { useSyncExternalStore } from 'react';
import { mapTiles } from '../../../../../apps/web/src/game/derive';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { OnlyYou } from '../../../../../apps/web/src/phone/hub/OnlyYou';
import { MapFit, PhoneShell } from '../../../../../apps/web/src/phone/Shell';
import { ordersOf, SHERIFF, showEventsOf, type MockTable } from '../fixture';
import { productionLine } from '../sheriff-words';

/*
 * STAND-IN for apps/web/src/phone/Production.tsx with #750's rail card ("what it did to you"): the phone during
 * production on the Sheriff path, after the show has played. The real screen plays the show on the phone's map and
 * carries the private line in its rail (WS8's S4-PR-7, #750); this draws its end state: the map with the plot's flag
 * (OFF when the power is out; a guarded catch leaves the plot lit), the public line every phone shows, and this seat's
 * own line, "Only you". Not the build's layout: the production screen is not in the hub's tabs.
 */
export function PhoneProduction({ store }: { store: MockTable }) {
  const world = useSyncExternalStore(store.subscribe, store.get);
  const { view, self, slot } = usePhoneGame();
  const events = showEventsOf(world);
  const dark = new Set(events.filter((e) => e.key === 'powerCut' && e.sabotage.worked).map((e) => `${e.origin.x},${e.origin.y}`));
  const tiles: MapTile[] = mapTiles(view).map((t) => (dark.has(`${t.x},${t.y}`) ? { ...t, flag: 'sabotage' } : t));
  const mine = ordersOf(world)
    .filter((o) => o.month === world.month && o.outcome !== 'pending')
    .flatMap((o) => {
      const l = productionLine(o, self.id, SHERIFF);
      return l ? [{ id: o.id, ...l }] : [];
    });
  return (
    <PhoneShell
      phase="Production"
      now={{ title: 'Production', detail: `Month ${view.month}: your plots make their goods.` }}
      foldNow
      fill
      rail={
        <div className="flex flex-col gap-2" data-testid="production-rail">
          {events.map((e) => (
            <p key={e.sabotage.order} className="rounded-control border border-alert bg-alert-bg p-2 text-sm font-semibold text-alert-ink" data-testid={`production-public-${e.sabotage.order}`}>
              {e.line}
            </p>
          ))}
          {mine.map((l) => (
            <section key={l.id} className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-2" data-testid={`production-mine-${l.id}`}>
              <span className="flex items-center justify-between">
                <span className="label-caps text-[10px]!">What it did to you</span>
                <OnlyYou />
              </span>
              <span className={cx('text-sm', l.tone === 'alert' ? 'text-alert' : l.tone === 'ok' ? 'text-ok' : 'text-ink')}>{l.line}</span>
            </section>
          ))}
        </div>
      }
    >
      <div className="relative flex min-h-0 flex-1 flex-col" data-testid="phone-production">
        <MapFit width={view.width} height={view.height}>
          <HoloMap width={view.width} height={view.height} tiles={tiles} focusSlot={slot} density="phone" />
        </MapFit>
      </div>
    </PhoneShell>
  );
}
