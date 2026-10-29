import type { Good } from '@mule/engine';
import type { AuctionView, MuleView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, GoodTag, TimeBar, WalkBoard } from '@mule/ui';
import { BoardKey, boardWalkers, dealLine, Hint, MyStoreLine, shipWants, ShipWants, SIDE_WORD, skippedLine, StatusTable, toggleSide, walkHint } from '../components/AuctionParts';
import { speakerAt } from '../chat/Chat';
import { fmt, PHASE_NAME } from '../game/derive';
import { useAuctionSound } from '../game/sound';
import type { MouseEvent, PointerEvent } from 'react';
import { useClient } from '../net/react';
import { usePhoneGame } from './game';
import { PhoneShell } from './Shell';
import { stepDir, useWalkIntent } from './useWalkIntent';

type Side = AuctionView['walkers'][number]['side'];
const SIDE_NAME: Record<Side, string> = { buyer: 'Buyer', seller: 'Seller', pass: 'Pass' };

/**
 * The goods auction, the original's walk: goods come up one at a time. A
 * status screen shows what everyone has, beside your side, already picked
 * from what you have and need: tap Buy or Sell to change it. Then you hold
 * Up or Down (or drag on the board) to walk your creature. Your height is
 * your bid or your ask; meet someone and units change hands. When the walk
 * ends, the close stage shows your receipt for the good over the still board,
 * and the header carries the month's running total (UX audit G-5).
 */
export function Auction() {
  const client = useClient();
  const { view, me, self } = usePhoneGame();
  const auction = view.auction;
  useAuctionSound(auction);
  const stage = auction?.stage;
  const mine = auction?.walkers.find((w) => w.id === me.id);
  const onBoard = stage === 'walk' && mine !== undefined && mine.side !== 'pass';
  const walk = useWalkIntent(onBoard, auction?.good ?? '');

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

  const closed = stage === 'close';
  const nextWords = auction.upNext ? `Next: ${GOOD_NAME[auction.upNext]}…` : 'The auction is closing…';
  const doneButton = (
    <Button size="md" variant={done ? 'outline' : 'holo'} className="h-10 w-full" disabled={done || closed} data-testid="done" onClick={() => client.intent({ type: 'ready' })}>
      {closed ? nextWords : done ? 'Done · waiting' : stage === 'status' ? 'Ready' : `Done with ${GOOD_NAME[good]}`}
    </Button>
  );

  if (stage === 'status') {
    const side = mine?.side;
    const ship = shipWants(view, auction);
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
            <p className="text-xs leading-snug text-ink-2" data-testid="status-words">
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
          <MyStoreLine auction={auction} />
          {ship && <ShipWants want={ship.first} also={ship.also} have={me.stock[ship.first.good]} />}
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

  const hint = walkHint(view, auction, me.id, have);
  const rail = (
    <>
      <div className="flex items-center justify-between gap-2 rounded-control border border-holo-faint bg-panel px-2.5 py-1.5" data-testid="good-row">
        <GoodTag good={good} name />
        <div className="grid grid-cols-3 gap-2.5 font-mono text-[10px] text-ink-3">
          <span className="flex flex-col">
            HAVE
            <strong data-num className="text-sm text-ink" data-testid="have">
              {have}
            </strong>
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
      {closed ? (
        <Hint line={`${GOOD_NAME[good]} is closed.`} how={auction.upNext ? `Next: ${GOOD_NAME[auction.upNext]}, buy or sell?` : null} />
      ) : myDeal ? (
        <Hint tone="lit" line={dealLine(view, myDeal, me.id)} testid="my-deal" />
      ) : (
        <Hint line={hint.line} how={hint.how} />
      )}
      {!closed && sides}
    </>
  );

  const footer = (
    <>
      <div className="grid grid-cols-2 gap-2">
        <WalkHold dir="up" disabled={!onBoard} onHold={(on) => walk(on ? 'up' : 'stop')} />
        <WalkHold dir="down" disabled={!onBoard} onHold={(on) => walk(on ? 'down' : 'stop')} />
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
      {mine && mine.side !== 'pass' && <BoardKey auction={auction} side={mine.side} />}
      <div className="relative flex min-h-0 flex-1 flex-col gap-1.5" data-testid="board-wrap">
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
          {...(auction.shipPays !== null ? { shipCaption: `The ship buys ${GOOD_NAME[good]} at ${auction.shipPays}` } : {})}
          storeStock={auction.storeForSale}
          marks={{ ask: true, bid: true }}
          meId={me.id}
          wrapCreature={speakerAt}
          {...(onBoard ? { onDir: (d: -1 | 0 | 1) => walk(stepDir(d)) } : {})}
          className={cx('min-h-0 flex-1', closed && 'opacity-40')}
        />
        {closed && auction.receipt && (
          <div className="absolute inset-0 grid place-items-center p-2" data-testid="receipt-layer">
            <ReceiptCard view={view} good={good} receipt={auction.receipt} have={have} need={need} next={auction.upNext} tally={auction.tally ?? 0} />
          </div>
        )}
      </div>
    </PhoneShell>
  );
}

const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');

/**
 * The receipt's last line: the month's running total from the auction (G-5), signed, a gain in ok and a loss in alert.
 * On the card, not in the header, so the player's name keeps its room there (WS6 ruling on #204).
 */
function MonthTally({ total }: { total: number }) {
  return (
    <span className="flex items-baseline gap-1 text-xs text-ink-2 @min-[1100px]/shell:text-lg" data-testid="receipt-tally" aria-label={`This month's auction so far: ${signed(total)} cr`}>
      This month:{' '}
      <strong data-num className={cx('font-mono font-bold', total < 0 ? 'text-alert' : total > 0 ? 'text-ok' : 'text-ink-3')}>
        {signed(total)} cr
      </strong>
    </span>
  );
}

/** Who a counterparty is, in a sentence: "the store", "the ship", or the player's name. */
function who(view: MuleView, id: string): string {
  if (id === 'store') return 'the store';
  if (id === 'ship') return 'the ship';
  return view.players.find((p) => p.id === id)?.name ?? id;
}

/** "Mia", "Mia and the store", "Mia, the store and the ship", as the server's news words a list. */
function andList(names: string[]): string {
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * When a good closes: what you did with it, the tax spelled out on a sale, and where you now stand (G-5), as the
 * #audit-auction-receipt mock draws it. A seat that both bought and sold in one good gets a line for each.
 */
export function ReceiptCard({
  view,
  good,
  receipt,
  have,
  need,
  next,
  tally,
}: {
  view: MuleView;
  good: Good;
  receipt: NonNullable<AuctionView['receipt']>;
  have: number;
  need: number;
  next: Good | null;
  /** The month's running total from the auction, for the card's last line. */
  tally: number;
}) {
  const name = GOOD_NAME[good];
  const sides = (['bought', 'sold'] as const).filter((k) => receipt[k].units > 0);
  const ok = have >= need;
  return (
    <section
      className="relative flex w-[min(100%,320px)] flex-col gap-1.5 rounded-sheet border-2 border-holo bg-panel p-3 shadow-glow @min-[1100px]/shell:w-[460px] @min-[1100px]/shell:gap-3 @min-[1100px]/shell:p-6"
      aria-live="polite"
      data-testid="receipt"
    >
      <span className="label-caps flex items-center gap-1.5 text-[10px]! @min-[1100px]/shell:text-sm!">
        <GoodTag good={good} name className="normal-case" /> · closed
      </span>
      {sides.length === 0 && (
        <h2 className="font-display text-xl font-semibold leading-tight @min-[1100px]/shell:text-4xl" data-testid="receipt-title-none">
          {`${name}: you didn’t trade`}
        </h2>
      )}
      {sides.map((kind) => {
        const r = receipt[kind];
        const net = r.gross - r.tax;
        const each = r.prices.every((p) => p === r.prices[0]) ? `${r.units} × ${r.prices[0]} cr` : r.prices.map((p) => `${p}`).join(' + ') + ' cr';
        return (
          <div key={kind} className="contents">
            <h2 className="font-display text-xl font-semibold leading-tight @min-[1100px]/shell:text-4xl" data-testid={`receipt-title-${kind}`}>
              {`${name}: you ${kind} ${r.units} for ${fmt(kind === 'sold' ? net : r.gross)} cr`}
            </h2>
            <span data-num className="font-mono text-xs text-ink-2 @min-[1100px]/shell:text-lg" data-testid="receipt-each">
              {each} {kind === 'bought' ? 'from' : 'to'} {andList(r.with.map((id) => who(view, id)))}
            </span>
            {kind === 'sold' && (
              <span className="rounded-control border border-holo-line px-2 py-1 text-sm @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-2 @min-[1100px]/shell:text-xl" data-testid="receipt-tax">
                {/* The tax the engine took, rounded unit by unit, so the sentence adds up (a rate would not: 10% of 570 is not 60). */}
                <strong data-num className="font-mono">{fmt(r.gross)} cr</strong>, less {fmt(r.tax)} cr sales tax: <strong data-num className="font-mono">{fmt(net)}</strong>
                <span className="block text-[11px] text-ink-2 @min-[1100px]/shell:text-base">The tax goes to the colony fund.</span>
              </span>
            )}
          </div>
        );
      })}
      <span className={cx('text-xs @min-[1100px]/shell:text-lg', ok ? 'text-ok' : 'text-alert')} data-testid="receipt-stand">
        You have {`${have} ${name}`}
        {need > 0 ? `, you need ${need}` : ''}
        {need > 0 ? (ok ? ' ✓' : `: short ${need - have}`) : ''}
      </span>
      {next && <span className="border-t border-holo-faint pt-1.5 text-xs text-ink-2 @min-[1100px]/shell:pt-3 @min-[1100px]/shell:text-lg">Next: {GOOD_NAME[next]}, buy or sell?</span>}
      <MonthTally total={tally} />
    </section>
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
      {...holdHandlers(onHold)}
    >
      <span aria-hidden className="text-2xl leading-none">
        {glyph}
      </span>
      {label}
    </button>
  );
}

/** The goods walk's Hold: it says so on the button, "Hold ▲ to walk up". */
function WalkHold({ dir, disabled, onHold }: { dir: 'up' | 'down'; disabled: boolean; onHold: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-label={`Hold to walk ${dir}`}
      disabled={disabled}
      data-testid={`hold-${dir}`}
      className="flex h-12 touch-none select-none flex-col items-center justify-center gap-1 rounded-control border-2 border-holo bg-holo-soft font-display text-holo active:bg-holo active:text-on-holo disabled:opacity-35 @min-[1100px]/shell:h-20"
      {...holdHandlers(onHold)}
    >
      <span className="flex items-center gap-1 text-sm font-semibold leading-none @min-[1100px]/shell:text-xl">
        Hold{' '}
        <span aria-hidden className="text-lg leading-none @min-[1100px]/shell:text-2xl">
          {dir === 'up' ? '▲' : '▼'}
        </span>
      </span>
      <span className="text-[11px] font-medium leading-none @min-[1100px]/shell:text-base">to walk {dir}</span>
    </button>
  );
}

/** Walking while pressed, standing when let go, however the press ends. */
function holdHandlers(onHold: (on: boolean) => void) {
  return {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // A synthetic press has no pointer to capture.
      }
      onHold(true);
    },
    onPointerUp: () => onHold(false),
    onPointerCancel: () => onHold(false),
    onLostPointerCapture: () => onHold(false),
    onContextMenu: (e: MouseEvent<HTMLButtonElement>) => e.preventDefault(),
  };
}
