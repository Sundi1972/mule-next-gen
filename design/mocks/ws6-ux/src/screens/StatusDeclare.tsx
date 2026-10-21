import type { AuctionView, MuleView } from '@mule/protocol';
import { cx, GOOD_NAME, GoodTag, PlayerMark, TimeBar } from '@mule/ui';
import { useState } from 'react';
import { StatusTable } from '../../../../../apps/web/src/components/AuctionParts';
import { slotOf } from '../../../../../apps/web/src/game/derive';
import { PhoneShell } from '../../../../../apps/web/src/phone/Shell';
import { TvHeader } from '../../../../../apps/web/src/table/TableApp';
import { MARKET } from '../fixture';

/**
 * R2: the status screen and the declare are one stage, as in the original's
 * production summary. You read everyone's numbers and pick your side on the
 * same screen. Your side starts where the engine's defaultSide puts it (short →
 * Buy, surplus → Sell, even → Pass: spec AM-1); tap to change it.
 */

export type Side = 'buyer' | 'seller' | 'pass';
const SIDE_NAME: Record<Side, string> = { buyer: 'Buy', seller: 'Sell', pass: 'Pass' };

function StoreBox({ good, tv = false }: { good: AuctionView['good']; tv?: boolean }) {
  const row = MARKET.find((r) => r.good === good)!;
  return (
    <dl className={cx('grid grid-cols-3 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line font-mono', tv ? 'text-2xl' : 'text-sm')} data-testid="status-store">
      {[
        ['STORE SELLS', row.storeSells ?? 'out', 'text-rise'],
        ['STORE BUYS', row.storeBuys ?? '—', 'text-fall'],
        ['IN STOCK', row.storeStock, row.storeStock === 0 ? 'text-alert' : 'text-ink'],
      ].map(([label, value, tone]) => (
        <div key={label as string} className={cx('flex flex-col bg-panel', tv ? 'p-3' : 'px-2 py-1')}>
          <dt className={cx('label-caps', tv ? 'text-sm!' : 'text-[9px]!')}>{label}</dt>
          <dd data-num className={cx('font-bold', tone as string)}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function PhoneStatusDeclare({ view, auction, start = 'buyer' }: { view: MuleView; auction: AuctionView; start?: Side }) {
  const [side, setSide] = useState<Side>(start);
  const row = auction.status.find((r) => r.id === 'lena')!;
  const spare = row.now - row.need;
  return (
    <PhoneShell
      phase={`${GOOD_NAME[auction.good]} · buy or sell?`}
      rail={
        <>
          <div className="flex items-center justify-between rounded-control border border-holo-faint bg-panel px-2.5 py-1.5">
            <GoodTag good={auction.good} name />
            <span data-num className={cx('font-mono text-sm font-bold', spare < 0 ? 'text-alert' : spare > 0 ? 'text-ok' : 'text-ink')}>
              {spare < 0 ? `${-spare} SHORT` : spare > 0 ? `+${spare} SPARE` : 'EVEN'}
            </span>
          </div>
          <p className="text-xs leading-snug text-ink-2">
            {spare < 0 ? `You need ${-spare} more ${GOOD_NAME[auction.good]} this month.` : spare > 0 ? `You have ${spare} more than you need.` : 'You have just what you need.'} Pick your side before the bell.
          </p>
        </>
      }
      footer={
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Your side" data-testid="declare">
          <div className="grid grid-cols-2 gap-2">
            {(['buyer', 'seller'] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={side === s}
                disabled={s === 'seller' && row.now === 0}
                onClick={() => setSide(side === s ? 'pass' : s)}
                data-testid={`side-${s}`}
                className={cx(
                  'h-14 rounded-control border-2 font-display text-lg font-semibold disabled:opacity-35',
                  side === s ? (s === 'seller' ? 'border-rise bg-rise text-on-holo' : 'border-fall bg-fall text-on-holo') : s === 'seller' ? 'border-rise/60 text-rise' : 'border-fall/60 text-fall',
                )}
              >
                {SIDE_NAME[s]}
              </button>
            ))}
          </div>
          <span className="text-center font-mono text-[10px] text-ink-3" data-testid="side-now">
            {side === 'pass' ? 'YOU SIT THIS GOOD OUT' : `YOU ${side === 'buyer' ? 'BUY' : 'SELL'} · TAP AGAIN TO PASS`}
          </span>
        </div>
      }
    >
      <TimeBar seconds={auction.seconds} total={auction.total} className="mb-1.5" />
      <div className="flex flex-col gap-2">
        <div className="rounded-panel border border-holo-line bg-panel px-2 py-1.5">
          <StatusTable view={view} auction={auction} meId="lena" />
        </div>
        <StoreBox good={auction.good} />
      </div>
    </PhoneShell>
  );
}

/** Everyone's side, starting from the engine's default: public, as the original's creatures stood at the top or bottom of the board. */
const PICKED: Record<string, Side | null> = { lena: 'buyer', ossa: 'seller', brix: 'seller', kai: 'buyer' };

export function TvStatusDeclare({ view, auction }: { view: MuleView; auction: AuctionView }) {
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-8 text-ink" data-phase="auction">
      <TvHeader game={view} title={`Auction · ${GOOD_NAME[auction.good]}`} />
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <TimeBar size="tv" seconds={auction.seconds} total={auction.total} />
          <div className="rounded-panel border border-holo-line bg-panel px-5 py-4">
            <StatusTable view={view} auction={auction} tv />
          </div>
          <StoreBox good={auction.good} tv />
        </div>
        <div className="flex w-[300px] shrink-0 flex-col gap-4">
          <div className="flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft p-4 shadow-glow">
            <GoodTag good={auction.good} name className="text-2xl" />
            <span className="font-display text-xl font-semibold">Buy or sell?</span>
          </div>
          <ul className="flex flex-col gap-2" data-testid="tv-picked">
            {view.players.map((p) => {
              const s = PICKED[p.id];
              return (
                <li key={p.id} className="flex items-center gap-3">
                  <PlayerMark slot={slotOf(view, p.id) ?? 0} size={22} />
                  <span className="flex-1 truncate font-display text-xl font-semibold">{p.name}</span>
                  <span className={cx('font-mono text-lg font-bold', s === 'seller' ? 'text-rise' : s === 'buyer' ? 'text-fall' : 'text-ink-3')}>
                    {s === null || s === undefined ? '…' : SIDE_NAME[s].toUpperCase()}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-auto text-base leading-snug text-ink-2">Your side is picked for you from what you have and need. Change it on your phone before the bell.</p>
        </div>
      </div>
    </div>
  );
}
