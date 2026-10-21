import { Button, HoloMap, TimeBar, WalkBoard } from '@mule/ui';
import { mapTiles, plotName } from '../../../../../apps/web/src/game/derive';
import { MapFit, PhoneShell } from '../../../../../apps/web/src/phone/Shell';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { VIEW, WALK } from '../fixture';
import { Hold, LeaderBox, LotCard, lotWalkers } from '../parts';

/**
 * VARIANT B · Map beside the board. The plot stays lit on a small map next
 * to a narrower board for the whole walk, so you never lose where it is
 * (and which cluster it would complete). The rail carries less.
 * GRAFT TARGET: new apps/web/src/phone/LandAuction.tsx (walk stage).
 */
export function PhoneWalkB({ lot: live, walk }: { lot: typeof WALK; walk: (d: -1 | 0 | 1) => void }) {
  const { self, slot } = usePhoneGame();
  const view = VIEW;
  const mine = live.walkers.find((w) => w.id === self.id);
  const onBoard = live.stage === 'walk' && mine?.side === 'buyer';
  const at = { x: live.lot.item.x, y: live.lot.item.y };
  const tiles = mapTiles(view).map((t) => (t.x === at.x && t.y === at.y ? { ...t, flag: 'sale' as const } : t));
  return (
    <PhoneShell
      phase={`Land auction · ${live.number} of ${live.count}`}
      fill
      rail={
        <>
          <LeaderBox view={view} lot={live} meId={self.id} />
          <LotCard view={view} lot={live.lot} compact />
        </>
      }
      footer={
        <>
          <div className="grid grid-cols-2 gap-2">
            <Hold label="Up" glyph="▲" disabled={!onBoard} onHold={(on) => walk(on ? 1 : 0)} />
            <Hold label="Down" glyph="▼" disabled={!onBoard} onHold={(on) => walk(on ? -1 : 0)} />
          </div>
          <Button size="md" variant="holo" className="h-10 w-full" data-testid="done">
            Done bidding
          </Button>
        </>
      }
    >
      <TimeBar seconds={live.seconds} total={live.total} className="mb-1.5" />
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex w-1/2 shrink-0 flex-col gap-1" data-testid="lot-map">
          <span className="font-mono text-[10px] text-ink-3">PLOT {plotName(at.x, at.y)} · LIT</span>
          <MapFit width={view.width} height={view.height}>
            <HoloMap width={view.width} height={view.height} tiles={tiles} cursor={at} focusSlot={slot} />
          </MapFit>
        </div>
        <WalkBoard
          lo={live.lo}
          hi={live.hi}
          walkers={lotWalkers(view, live)}
          deals={[]}
          storeBuys={null}
          storeSells={null}
          shipPays={null}
          lines={[{ id: 'min', label: 'MIN', price: live.lot.minimum }]}
          stage="walk"
          meId={self.id}
          {...(onBoard ? { onDir: walk } : {})}
          className="min-h-0 min-w-0 flex-1"
        />
      </div>
    </PhoneShell>
  );
}
