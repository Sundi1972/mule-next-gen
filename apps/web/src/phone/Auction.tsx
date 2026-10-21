import type { AuctionView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, GoodTag, TimeBar, WalkBoard } from '@mule/ui';
import { useCallback, useEffect, useRef } from 'react';
import { boardWalkers, dealLine, skippedLine, StatusTable } from '../components/AuctionParts';
import { PHASE_NAME } from '../game/derive';
import { useAuctionSound } from '../game/sound';
import { useClient } from '../net/react';
import { usePhoneGame } from './game';
import { PhoneShell } from './Shell';

type Side = AuctionView['walkers'][number]['side'];
const SIDE_NAME: Record<Side, string> = { buyer: 'Buyer', seller: 'Seller', pass: 'Pass' };

/**
 * The goods auction, the original's walk: goods come up one at a time. A
 * status screen shows what everyone has; you declare Buyer, Seller or Pass;
 * then you hold Up or Down (or drag on the board) to walk your creature.
 * Your height is your bid or your ask; meet someone and units change hands.
 */
export function Auction() {
  const client = useClient();
  const { view, me, self } = usePhoneGame();
  const auction = view.auction;
  useAuctionSound(auction);
  const dir = useRef<'up' | 'down' | 'stop'>('stop');
  const walk = useCallback(
    (next: 'up' | 'down' | 'stop') => {
      if (dir.current === next) return;
      dir.current = next;
      client.intent({ type: 'walk', dir: next });
    },
    [client],
  );
  const stage = auction?.stage;
  const mine = auction?.walkers.find((w) => w.id === me.id);
  const onBoard = stage === 'walk' && mine !== undefined && mine.side !== 'pass';

  // The arrow keys walk too, on a laptop.
  useEffect(() => {
    if (!onBoard) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') walk('up');
      if (e.key === 'ArrowDown') walk('down');
    };
    const up = (e: KeyboardEvent) => (e.key === 'ArrowUp' || e.key === 'ArrowDown') && walk('stop');
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [onBoard, walk]);

  if (!auction) {
    return (
      <PhoneShell phase={PHASE_NAME.auction}>
        <p className="text-ink-2">The auction is closing…</p>
      </PhoneShell>
    );
  }

  const good = auction.good;
  const row = auction.status.find((r) => r.id === me.id);
  const have = me.stock[good];
  const need = row?.need ?? 0;
  const spare = have - need;
  const done = mine?.done ?? false;
  const myDeal = auction.deals.find((d) => d.buyer === me.id || d.seller === me.id);
  const skipped = skippedLine(auction);
  const declare = (side: Side) => client.intent({ type: 'declare', side });

  const sides = (compact: boolean) => (
    <div className={cx('grid grid-cols-3 gap-1 rounded-control border border-holo-line bg-void p-1')} role="radiogroup" aria-label="Your side">
      {(['buyer', 'seller', 'pass'] as const).map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={mine?.side === s}
          disabled={s === 'seller' && have === 0}
          onClick={() => declare(s)}
          className={cx(
            'rounded-[8px] font-display font-semibold disabled:opacity-35',
            compact ? 'h-8 text-xs' : 'h-11 text-sm',
            mine?.side === s ? (s === 'seller' ? 'bg-rise text-on-holo' : s === 'buyer' ? 'bg-fall text-on-holo' : 'bg-raised text-ink') : 'text-ink-2',
          )}
        >
          {SIDE_NAME[s]}
        </button>
      ))}
    </div>
  );

  const doneButton = (
    <Button size="md" variant={done ? 'outline' : 'holo'} className="h-10 w-full" disabled={done} onClick={() => client.intent({ type: 'ready' })}>
      {done ? 'Done · waiting' : stage === 'status' ? 'Ready' : stage === 'declare' ? 'Done choosing' : `Done with ${GOOD_NAME[good]}`}
    </Button>
  );

  const rail = (
    <>
      <div className={cx('flex rounded-control border border-holo-faint bg-panel px-2.5 py-1.5', stage === 'walk' ? 'items-center justify-between gap-2' : 'flex-col gap-1')} data-testid="good-row">
        <GoodTag good={good} name />
        <div className={cx('grid grid-cols-3 font-mono text-[10px] text-ink-3', stage === 'walk' ? 'gap-2.5' : 'gap-1')}>
          <span className="flex flex-col">
            HAVE<strong data-num className="text-sm text-ink">{have}</strong>
          </span>
          <span className="flex flex-col">
            NEED<strong data-num className="text-sm text-ink">{need}</strong>
          </span>
          <span className="flex flex-col">
            {spare < 0 ? 'SHORT' : 'SPARE'}
            <strong data-num className={cx('text-sm', spare < 0 ? 'text-alert' : spare > 0 ? 'text-ok' : 'text-ink')}>
              {spare > 0 ? '+' : ''}
              {spare}
            </strong>
          </span>
        </div>
      </div>
      {stage === 'status' && (
        <p className="text-xs leading-snug text-ink-2">
          Everyone's {GOOD_NAME[good]} before it goes on sale.
          {auction.next.length > 0 && <span className="text-ink-3"> Then {auction.next.map((g) => GOOD_NAME[g]).join(', ')}.</span>}
        </p>
      )}
      {stage === 'declare' && (
        <>
          <span className="label-caps">Buy, sell or pass?</span>
          {sides(false)}
          <p className="text-xs leading-snug text-ink-2">Sellers start at the top and walk down. Buyers start at the bottom and walk up.</p>
        </>
      )}
      {stage === 'walk' && (
        <>
          {sides(true)}
          <div className={cx('rounded-control border px-2.5 py-1.5 text-xs leading-snug', myDeal ? 'border-holo bg-holo-soft text-ink' : 'border-holo-faint text-ink-2')} data-testid="my-deal">
            {myDeal ? dealLine(view, myDeal, me.id) : mine?.side === 'pass' ? 'You passed on this good.' : mine?.side === 'seller' ? 'Walk down to ask less.' : 'Walk up to bid more.'}
          </div>
          <span data-num className="font-mono text-[10px] text-ink-3">
            {auction.units} UNIT{auction.units === 1 ? '' : 'S'} TRADED · YOU {mine?.side === 'seller' ? 'ASK' : 'BID'} {mine && mine.side !== 'pass' ? mine.price : '—'}
          </span>
        </>
      )}
    </>
  );

  const footer =
    stage === 'walk' ? (
      <>
        <div className="grid grid-cols-2 gap-2">
          <Hold label="Up" glyph="▲" disabled={!onBoard} onHold={(on) => walk(on ? 'up' : 'stop')} />
          <Hold label="Down" glyph="▼" disabled={!onBoard} onHold={(on) => walk(on ? 'down' : 'stop')} />
        </div>
        {doneButton}
      </>
    ) : (
      doneButton
    );

  return (
    <PhoneShell phase={`${GOOD_NAME[good]} auction`} fill rail={rail} footer={footer}>
      <TimeBar seconds={auction.seconds} total={auction.total} slowed={auction.slowed} className="mb-1.5" />
      {skipped && (
        <p className="mb-1.5 shrink-0 truncate font-mono text-[11px] text-ink-3" data-testid="skipped">
          {skipped}
        </p>
      )}
      {stage === 'status' ? (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-panel border border-holo-line bg-panel px-2 py-1.5">
          <StatusTable view={view} auction={auction} meId={self.id} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-1.5">
          {auction.deals.some((d) => d !== myDeal) && (
            <div className="flex shrink-0 gap-2 overflow-hidden" data-testid="deals">
              {auction.deals.filter((d) => d !== myDeal).map((d) => (
                <span key={`${d.buyer}-${d.seller}`} className="truncate rounded-chip border border-holo bg-holo-soft px-2 py-0.5 font-mono text-[11px] font-bold text-holo">
                  {dealLine(view, d, me.id)}
                </span>
              ))}
            </div>
          )}
          <WalkBoard
            lo={auction.lo}
            hi={auction.hi}
            walkers={boardWalkers(view, auction)}
            deals={auction.deals}
            storeBuys={auction.storeBuys}
            storeSells={auction.storeSells}
            shipPays={auction.shipPays}
            stage={stage === 'walk' ? 'walk' : 'declare'}
            meId={me.id}
            {...(onBoard ? { onDir: (d: -1 | 0 | 1) => walk(d > 0 ? 'up' : d < 0 ? 'down' : 'stop') } : {})}
            className="min-h-0 flex-1"
          />
        </div>
      )}
    </PhoneShell>
  );
}

/** A big button you hold: walking while pressed, standing when let go. */
export function Hold({ label, glyph, disabled, onHold }: { label: string; glyph: string; disabled: boolean; onHold: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-label={`Hold to walk ${label.toLowerCase()}`}
      disabled={disabled}
      data-testid={`hold-${label.toLowerCase()}`}
      className="flex h-16 touch-none select-none flex-col items-center justify-center rounded-control border-2 border-holo bg-holo-soft font-display text-sm font-semibold text-holo active:bg-holo active:text-on-holo disabled:opacity-35"
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // A synthetic press has no pointer to capture.
        }
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
      onLostPointerCapture={() => onHold(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span aria-hidden className="text-2xl leading-none">
        {glyph}
      </span>
      {label}
    </button>
  );
}
