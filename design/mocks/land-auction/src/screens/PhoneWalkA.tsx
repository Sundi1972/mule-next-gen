import { Button, TimeBar, WalkBoard } from '@mule/ui';
import { PhoneShell } from '../../../../../apps/web/src/phone/Shell';
import { usePhoneGame } from '../../../../../apps/web/src/phone/game';
import { VIEW, WALK } from '../fixture';
import { Hold, LeaderBox, LotCard, lotWalkers } from '../parts';

/**
 * VARIANT A · Board first. The board fills the main area, as at the goods
 * auction; the rail says what is for sale and who would win at the bell.
 * The map was on screen during the lot's intro, so the walk doesn't repeat it.
 * GRAFT TARGET: new apps/web/src/phone/LandAuction.tsx (walk stage).
 */
export function PhoneWalkA({ lot: live, walk }: { lot: typeof WALK; walk: (d: -1 | 0 | 1) => void }) {
  const { self } = usePhoneGame();
  const view = VIEW;
  const mine = live.walkers.find((w) => w.id === self.id);
  const onBoard = live.stage === 'walk' && mine?.side === 'buyer';
  return (
    <PhoneShell
      phase={`Land auction · ${live.number} of ${live.count}`}
      fill
      rail={
        <>
          {/* Who wins at the bell comes first: it must never scroll out of view. */}
          <LeaderBox view={view} lot={live} meId={self.id} />
          <LotCard view={view} lot={live.lot} />
          <span data-num className="font-mono text-[10px] text-ink-3" data-testid="my-bid">
            YOU BID {mine?.side === 'buyer' ? mine.price : '—'} · MAX {self.money}
          </span>
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
        className="min-h-0 flex-1"
      />
    </PhoneShell>
  );
}
