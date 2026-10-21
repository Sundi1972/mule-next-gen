import type { AuctionView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, GoodTag, TimeBar, WalkBoard } from '@mule/ui';
import { useCallback, useEffect, useRef } from 'react';
import { boardWalkers, dealLine, LineReadout, SIDE_WORD, skippedLine, StatusTable, StoreBox, toggleSide } from '../components/AuctionParts';
import { PHASE_NAME } from '../game/derive';
import { useAuctionSound } from '../game/sound';
import { useClient } from '../net/react';
import { usePhoneGame } from './game';
import { PhoneShell } from './Shell';

type Side = AuctionView['walkers'][number]['side'];
const SIDE_NAME: Record<Side, string> = { buyer: 'Buyer', seller: 'Seller', pass: 'Pass' };

/**
 * The goods auction, the original's walk: goods come up one at a time. A
 * status screen shows what everyone has, beside your side, already picked
 * from what you have and need: tap Buy or Sell to change it. Then you hold
 * Up or Down (or drag on the board) to walk your creature. Your height is
 * your bid or your ask; meet someone and units change hands.
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
  const walkers = boardWalkers(view, auction);
  const declare = (side: Side) => client.intent({ type: 'declare', side });

  const doneButton = (
    <Button size="md" variant={done ? 'outline' : 'holo'} className="h-10 w-full" disabled={done} data-testid="done" onClick={() => client.intent({ type: 'ready' })}>
      {done ? 'Done · waiting' : stage === 'status' ? 'Ready' : `Done with ${GOOD_NAME[good]}`}
    </Button>
  );

  if (stage === 'status') {
    const side = mine?.side;
    return (
      <PhoneShell
        phase={`${GOOD_NAME[good]} · buy or sell?`}
        rail={
          <>
            <div className="flex items-center justify-between rounded-control border border-holo-faint bg-panel px-2.5 py-1.5">
              <GoodTag good={good} name />
              <span data-num className={cx('font-mono text-sm font-bold', spare < 0 ? 'text-alert' : spare > 0 ? 'text-ok' : 'text-ink')}>
                {spare < 0 ? `${-spare} SHORT` : spare > 0 ? `+${spare} SPARE` : 'EVEN'}
              </span>
            </div>
            <p className="text-xs leading-snug text-ink-2">
              {spare < 0 ? `You need ${-spare} more ${GOOD_NAME[good]} this month.` : spare > 0 ? `You have ${spare} more than you need.` : 'You have just what you need.'} Pick your side before the bell.
            </p>
          </>
        }
        footer={
          <>
            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Your side" data-testid="declare">
              <div className="grid grid-cols-2 gap-2">
                {(['buyer', 'seller'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={side === s}
                    disabled={s === 'seller' && have === 0}
                    onClick={() => declare(toggleSide(side, s))}
                    data-testid={`side-${s}`}
                    className={cx(
                      'h-14 rounded-control border-2 font-display text-lg font-semibold disabled:opacity-35',
                      side === s ? (s === 'seller' ? 'border-rise bg-rise text-on-holo' : 'border-fall bg-fall text-on-holo') : s === 'seller' ? 'border-rise/60 text-rise' : 'border-fall/60 text-fall',
                    )}
                  >
                    {SIDE_WORD[s]}
                  </button>
                ))}
              </div>
              <span className="text-center font-mono text-[10px] text-ink-3" data-testid="side-now">
                {side === 'buyer' || side === 'seller' ? `YOU ${side === 'buyer' ? 'BUY' : 'SELL'} · TAP AGAIN TO PASS` : 'YOU SIT THIS GOOD OUT'}
              </span>
            </div>
            {doneButton}
          </>
        }
      >
        <TimeBar seconds={auction.seconds} total={auction.total} slowed={auction.slowed} className="mb-1.5" />
        {skipped && (
          <p className="mb-1.5 shrink-0 truncate font-mono text-[11px] text-ink-3" data-testid="skipped">
            {skipped}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <div className="rounded-panel border border-holo-line bg-panel px-2 py-1.5">
            <StatusTable view={view} auction={auction} meId={self.id} />
          </div>
          <StoreBox auction={auction} />
        </div>
      </PhoneShell>
    );
  }

  const sides = (
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
            'h-8 rounded-[8px] font-display text-xs font-semibold disabled:opacity-35',
            mine?.side === s ? (s === 'seller' ? 'bg-rise text-on-holo' : s === 'buyer' ? 'bg-fall text-on-holo' : 'bg-raised text-ink') : 'text-ink-2',
          )}
        >
          {SIDE_NAME[s]}
        </button>
      ))}
    </div>
  );

  const rail = (
    <>
      <div className="flex items-center justify-between gap-2 rounded-control border border-holo-faint bg-panel px-2.5 py-1.5" data-testid="good-row">
        <GoodTag good={good} name />
        <div className="grid grid-cols-3 gap-2.5 font-mono text-[10px] text-ink-3">
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
      <div className={cx('rounded-control border px-2.5 py-1.5 text-xs leading-snug', myDeal ? 'border-holo bg-holo-soft text-ink' : 'border-holo-faint text-ink-2')} data-testid="my-deal">
        {myDeal
          ? dealLine(view, myDeal, me.id)
          : mine?.side === 'pass'
            ? 'You passed on this good.'
            : mine?.side === 'seller'
              ? 'Walk down to meet the highest bid.'
              : 'Walk up to meet the lowest ask.'}
      </div>
      <LineReadout walkers={walkers} trading={auction.deals.length > 0} meId={me.id} />
      {sides}
    </>
  );

  const footer = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Hold label="Up" glyph="▲" disabled={!onBoard} onHold={(on) => walk(on ? 'up' : 'stop')} />
        <Hold label="Down" glyph="▼" disabled={!onBoard} onHold={(on) => walk(on ? 'down' : 'stop')} />
      </div>
      {doneButton}
    </>
  );

  return (
    <PhoneShell phase={`${GOOD_NAME[good]} auction`} fill rail={rail} footer={footer}>
      <TimeBar seconds={auction.seconds} total={auction.total} slowed={auction.slowed} className="mb-1.5" />
      {skipped && (
        <p className="mb-1.5 shrink-0 truncate font-mono text-[11px] text-ink-3" data-testid="skipped">
          {skipped}
        </p>
      )}
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
          walkers={walkers}
          deals={auction.deals}
          storeBuys={auction.storeBuys}
          storeSells={auction.storeSells}
          shipPays={auction.shipPays}
          storeStock={auction.storeForSale}
          marks={{ ask: true, bid: true }}
          stage="walk"
          meId={me.id}
          {...(onBoard ? { onDir: (d: -1 | 0 | 1) => walk(d > 0 ? 'up' : d < 0 ? 'down' : 'stop') } : {})}
          className="min-h-0 flex-1"
        />
      </div>
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
