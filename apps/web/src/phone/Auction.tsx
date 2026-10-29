import type { AuctionView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, GoodTag, TimeBar, WalkBoard } from '@mule/ui';
import {
  BoardKey,
  boardWalkers,
  dealLine,
  Hint,
  LineAction,
  lineAsk,
  lineHint,
  lineLimits,
  lineMoment,
  LineQuestion,
  MyStoreLine,
  SellConfirm,
  sellAsksFirst,
  shipWants,
  ShipWants,
  SIDE_WORD,
  skippedLine,
  startAmount,
  StatusTable,
  toggleSide,
  walkHint,
} from '../components/AuctionParts';
import { speakerAt } from '../chat/Chat';
import { PHASE_NAME } from '../game/derive';
import { useAuctionSound } from '../game/sound';
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
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
 * your bid or your ask; meet someone and units change hands.
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
  // At a house's line (A-6): the amount chosen and whether a sale past your spare is being asked about, for this line only.
  const moment = lineMoment(stage === 'walk' ? mine : undefined);
  const lineKey = `${auction?.good ?? ''}:${moment.kind === 'line' ? moment.house : ''}`;
  const [choice, setChoice] = useState<{ key: string; amount: number | null; confirming: boolean }>({ key: '', amount: null, confirming: false });
  const here = choice.key === lineKey ? choice : { key: lineKey, amount: null, confirming: false };

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

  const atLine = moment.kind === 'line';
  const doneButton = (
    <Button
      size="md"
      variant={done || atLine ? 'outline' : 'holo'}
      className="h-10 w-full"
      disabled={done || moment.kind === 'trading'}
      data-testid="done"
      onClick={() => client.intent({ type: 'ready' })}
    >
      {done ? 'Done · waiting' : stage === 'status' ? 'Ready' : `Done with ${GOOD_NAME[good]}`}
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
  const lineSide = mine?.side === 'seller' ? 'seller' : 'buyer';
  const ask = (() => {
    if (moment.kind !== 'line') return null;
    const { aim, max } = lineLimits(auction, lineSide, moment.house, have, need, self.money);
    return lineAsk(auction, lineSide, moment.house, here.amount ?? startAmount(aim, max), have, need, self.money);
  })();
  const confirming = ask !== null && here.confirming;
  const trade = (units: number) => {
    client.intent({ type: 'lineTrade', units });
    setChoice({ ...here, confirming: false });
  };
  const go = () => {
    if (!ask) return;
    // Selling past your spare asks first (G-1).
    if (sellAsksFirst(ask) && !confirming) setChoice({ ...here, amount: ask.amount, confirming: true });
    else trade(ask.amount);
  };
  const lineRail = (() => {
    if (ask && confirming) return <SellConfirm ask={ask} onYes={() => trade(ask.amount)} onNo={() => setChoice({ ...here, amount: Math.max(1, ask.aim), confirming: false })} />;
    if (ask) return <LineQuestion ask={ask} onAmount={(n) => setChoice({ ...here, amount: n })} />;
    if (moment.kind === 'trading' || moment.kind === 'done') {
      const h = lineHint(moment, lineSide, good, have, need);
      return <Hint tone={moment.kind === 'trading' ? 'lit' : 'ok'} line={h.line} how={h.how} testid="line-hint" />;
    }
    return null;
  })();
  const rail = (
    <>
      {/* At the line the question says what you have and need, so the good's card gives it the room. */}
      {!ask && (
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
      )}
      {lineRail ?? (myDeal ? <Hint tone="lit" line={dealLine(view, myDeal, me.id)} testid="my-deal" /> : <Hint line={hint.line} how={hint.how} />)}
      {sides}
    </>
  );

  // G-2: a tap is one price step; a hold walks until let go.
  const hold = (dir: 'up' | 'down', disabled: boolean) => (
    <WalkHold key={dir} dir={dir} disabled={!onBoard || disabled} onHold={(on) => walk(on ? dir : 'stop')} onStep={() => client.intent({ type: 'walkStep', dir })} />
  );
  const away = lineSide === 'buyer' ? 'down' : 'up';
  const footer = (
    <>
      {ask && !confirming ? (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2" data-testid="line-footer">
          {hold(away, false)}
          <LineAction ask={ask} onGo={go} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {hold('up', confirming && lineSide === 'buyer')}
          {hold('down', confirming && lineSide === 'seller')}
        </div>
      )}
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
          {...(auction.shipPays !== null ? { shipCaption: `The ship buys ${GOOD_NAME[good]} at ${auction.shipPays}` } : {})}
          storeStock={auction.storeForSale}
          marks={{ ask: true, bid: true }}
          meId={me.id}
          wrapCreature={speakerAt}
          {...(onBoard ? { onDir: (d: -1 | 0 | 1) => walk(stepDir(d)) } : {})}
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
      {...holdHandlers(onHold)}
    >
      <span aria-hidden className="text-2xl leading-none">
        {glyph}
      </span>
      {label}
    </button>
  );
}

/** A press shorter than this is a tap, which moves one step; a longer one walks until let go (G-2). */
export const TAP_MS = 180;

/**
 * The goods walk's Hold: it says so on the button, "Hold ▲ to walk up", and a quick tap moves one step (G-2). Tap or
 * hold is judged by the events' own timestamps, not by when they are handled: a busy phone can hand over a quick
 * tap's release late, and that must still be a step.
 */
function WalkHold({ dir, disabled, onHold, onStep }: { dir: 'up' | 'down'; disabled: boolean; onHold: (on: boolean) => void; onStep: () => void }) {
  const timer = useRef<number | null>(null);
  const holding = useRef(false);
  const down = useRef<number | null>(null);
  const release = useRef(onHold);
  release.current = onHold;
  // At a house's line this button gives way to "Buy N for X cr" under the finger: going away while held lets go.
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      if (holding.current) release.current(false);
    },
    [],
  );
  const end = (stamp: number) => {
    if (down.current === null) return;
    const tap = stamp - down.current < TAP_MS;
    down.current = null;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (holding.current) {
      holding.current = false;
      onHold(false);
    }
    if (tap) onStep();
  };
  return (
    <button
      type="button"
      aria-label={`Hold to walk ${dir}; a tap moves one step`}
      disabled={disabled}
      data-testid={`hold-${dir}`}
      className="flex h-12 touch-none select-none flex-col items-center justify-center gap-1 rounded-control border-2 border-holo bg-holo-soft font-display text-holo active:bg-holo active:text-on-holo disabled:opacity-35 @min-[1100px]/shell:h-20"
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // A synthetic press has no pointer to capture.
        }
        holding.current = false;
        down.current = e.timeStamp;
        timer.current = window.setTimeout(() => {
          timer.current = null;
          holding.current = true;
          onHold(true);
        }, TAP_MS);
      }}
      onPointerUp={(e) => end(e.timeStamp)}
      onPointerCancel={(e) => end(e.timeStamp + TAP_MS)}
      onLostPointerCapture={(e) => end(e.timeStamp)}
      onContextMenu={(e) => e.preventDefault()}
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
