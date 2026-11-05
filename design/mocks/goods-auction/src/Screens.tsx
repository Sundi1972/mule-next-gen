import { Button, Creature, cx, GOOD_NAME, GoodTag, SLOT_COLOR, TimeBar } from '@mule/ui';
import { useEffect, useState } from 'react';
import { board, dealAt, dealMs, GOOD, HI, LO, ME, SEATS, STORE_BUYS, STORE_SELLS, STORE_STOCK, TOTAL, type State } from './auction';
import { SPEED_STEPS, speedStep, WalkBoard } from './proposed/WalkBoard';

/**
 * The goods auction under WS3's self-trading rules. Graft targets: apps/web/src/phone/Auction.tsx (rail and footer:
 * the side switch, the hints, no amount stepper, no "Sell N" footer, no confirm), the proposed WalkBoard
 * (packages/ui), and the TV's TvAuction (apps/web/src/table/TableApp.tsx).
 */

/** How the speed-up shows on the phone: A on the board's deal counter, B as a meter in the rail. */
export type Variant = 'A' | 'B';

// --- The deal's clock --------------------------------------------------------------

/** A running deal: starts after a beat, trades on WALK's curve, stops on a tap (stepping off) or when Lena runs out. */
export function useDeal(max: number, on: boolean) {
  const [start, setStart] = useState(() => performance.now() + 900);
  const [stopAt, setStopAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const end = start + dealMs(max) + 50;
  const live = on && stopAt === null && now < end;
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setNow(performance.now()), 30);
    return () => clearInterval(id);
  }, [on]);
  const ms = Math.max(0, (stopAt ?? now) - start);
  const { units, speed } = on ? dealAt(ms, max) : { units: 0, speed: 0 };
  return {
    units,
    speed,
    trading: live && units > 0,
    stopped: stopAt !== null,
    ranOut: units >= max,
    stop: () => setStopAt(performance.now()),
    replay: () => {
      setStopAt(null);
      setStart(performance.now() + 900);
    },
  };
}
export type Deal = ReturnType<typeof useDeal>;

// --- The phone, held sideways ---------------------------------------------------------

export function PhoneAuction({ state, variant, deal }: { state: State; variant: Variant; deal: Deal }) {
  const sold = state === 'store' || state === 'players' ? deal.units : 0;
  const { walkers, deals } = board(state, sold);
  const side = state === 'switched' || state === 'store' || state === 'players' ? 'seller' : 'buyer';
  const have = ME.have - sold;
  const spare = have - ME.need;
  const trading = deal.trading && (state === 'store' || state === 'players');
  // Variant B moves the speed-up off the board into the rail's meter.
  // A deal is drawn only while units move: stepping off or running out ends it at once.
  const live = trading ? deals : [];
  const shown = variant === 'B' ? live.map(({ speed: _s, ...d }) => d) : live.map((d) => ({ ...d, speed: deal.speed }));
  return (
    <div className="flex h-full w-full bg-table text-ink">
      <main className="flex min-w-0 flex-1 flex-col gap-1.5 p-2">
        <div className="flex items-center gap-2">
          <span className="label-caps shrink-0">{state === 'status' ? 'Food: buy or sell?' : `${GOOD_NAME[GOOD]} auction`}</span>
          {state !== 'status' && <TimeBar seconds={14} total={TOTAL} slowed={trading} className="flex-1" />}
        </div>
        {state === 'status' ? (
          <StatusList />
        ) : (
          <WalkBoard
            lo={LO}
            hi={HI}
            walkers={walkers}
            deals={shown}
            storeBuys={STORE_BUYS}
            storeSells={STORE_SELLS}
            shipPays={null}
            storeStock={STORE_STOCK}
            marks={{ ask: true, bid: true }}
            meId={ME.id}
            className="min-h-0 flex-1"
          />
        )}
      </main>
      <aside className="flex w-[var(--rail)] shrink-0 flex-col gap-2 border-l border-holo-line bg-panel p-2.5" data-testid="rail">
        <GoodRow have={have} spare={spare} />
        <Words state={state} variant={variant} deal={deal} have={have} />
        {variant === 'B' && (state === 'store' || state === 'players') && <Meter state={state} deal={deal} />}
        {have < ME.need && (
          <p className="rounded-control border border-warn bg-warn/10 px-2.5 py-1.5 text-xs leading-snug text-warn" data-testid="keep">
            <strong className="font-semibold">You keep {have} of the {ME.need} Food you need</strong> next month.
          </p>
        )}
        <div className="mt-auto flex flex-col gap-1.5">
          <SideSwitch side={side} />
          {state === 'status' ? (
            <Button size="lg" variant="holo" className="w-full" data-testid="ready">
              Ready
            </Button>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button size="md" variant="outline" onClick={deal.stop} data-testid="up">
                  ▲ Up
                </Button>
                <Button size="md" variant="outline" data-testid="down">
                  ▼ Down
                </Button>
              </div>
              <Button size="md" variant="ghost" className="w-full" data-testid="done">
                Done with Food
              </Button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

/** The good's card: what you have, need and can spare, live as units trade. */
function GoodRow({ have, spare }: { have: number; spare: number }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-control border border-holo-faint bg-raised px-2.5 py-1.5" data-testid="good-row">
      <GoodTag good={GOOD} name />
      <div className="grid grid-cols-3 gap-2.5 font-mono text-[10px] text-ink-3">
        <span className="flex flex-col">
          HAVE
          <strong data-num className={cx('text-sm', spare < 0 ? 'text-warn' : 'text-ink')} data-testid="have">
            {have}
          </strong>
        </span>
        <span className="flex flex-col">
          NEED<strong data-num className="text-sm text-ink">{ME.need}</strong>
        </span>
        <span className="flex flex-col">
          {spare < 0 ? 'SHORT' : 'SPARE'}
          <strong data-num className={cx('text-sm', spare < 0 ? 'text-warn' : spare > 0 ? 'text-ok' : 'text-ink')}>
            {spare > 0 ? '+' : ''}
            {spare}
          </strong>
        </span>
      </div>
    </div>
  );
}

/** One plain sentence for where you are, and what to do next. */
function Words({ state, variant, deal, have }: { state: State; variant: Variant; deal: Deal; have: number }) {
  const sold = deal.units;
  const price = state === 'players' ? 31 : STORE_BUYS;
  const to = state === 'players' ? 'Brix' : 'the store';
  const [line, how, lit] = ((): [string, string | null, boolean] => {
    if (state === 'status') return ['Everyone starts as a buyer.', `You have ${ME.have - ME.need} Food spare: tap Sell to sell it.`, false];
    if (state === 'walk') return ['You’re buying.', 'Hold ▲ to bid more. Stay at the bottom to sit Food out.', false];
    if (state === 'switched') return ['You’re selling, from the top.', 'Walk down. Where your line meets a buyer or the store, Food sells by itself.', true];
    if (deal.ranOut) return [`Sold all ${sold} to ${to} for ${sold * price} cr.`, null, false];
    if (deal.stopped) return [`Stopped: sold ${sold} to ${to} for ${sold * price} cr.`, 'Walk back down to sell more.', false];
    if (sold === 0) return [`At ${to === 'Brix' ? 'Brix’s bid' : 'the store’s line'}: ${price} cr each.`, 'Selling starts in a moment.', true];
    if (variant === 'B') return [`Selling to ${to}.`, 'Tap ▲ to stop.', true];
    return [`Selling to ${to} at ${price} cr, faster and faster.`, `Tap ▲ to stop. ${have} left.`, true];
  })();
  return (
    <div className={cx('rounded-control border px-2.5 py-2', lit ? 'border-holo bg-holo-soft' : 'border-holo-faint bg-raised')} data-testid="hint">
      <p className="font-display text-sm font-semibold leading-snug">{line}</p>
      {how && <p className="mt-0.5 text-xs leading-snug text-ink-2">{how}</p>}
    </div>
  );
}

/** Variant B: the deal's count, money in and speed, big, in the rail. */
function Meter({ state, deal }: { state: State; deal: Deal }) {
  const price = state === 'players' ? 31 : STORE_BUYS;
  const lit = deal.units > 0 ? speedStep(deal.speed) : 0;
  return (
    <div className="flex flex-col gap-1.5 rounded-control border border-holo bg-void px-2.5 py-2" data-testid="meter">
      <div className="flex items-baseline justify-between">
        <span data-num className="font-mono text-2xl font-bold text-holo">
          {deal.units} <span className="text-xs font-normal text-ink-3">sold</span>
        </span>
        <span data-num className="font-mono text-sm font-bold text-ok">+{deal.units * price} cr</span>
      </div>
      <div className="flex items-center gap-1" aria-label={`speed ${lit} of ${SPEED_STEPS}`}>
        <span className="font-mono text-[10px] text-ink-3">SLOW</span>
        {Array.from({ length: SPEED_STEPS }, (_, k) => (
          <span key={k} className={cx('h-2 flex-1 rounded-full transition-colors', k < lit ? 'bg-holo shadow-glow' : 'bg-raised')} />
        ))}
        <span className="font-mono text-[10px] text-ink-3">FAST</span>
      </div>
    </div>
  );
}

/** Buy or Sell, nothing else: everyone takes part. A switch puts you at your new side's edge, so it never trades at once. */
function SideSwitch({ side }: { side: 'buyer' | 'seller' }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-2 gap-1 rounded-control border border-holo-line bg-void p-1" role="radiogroup" aria-label="Your side" data-testid="sides">
        {(['buyer', 'seller'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            className={cx('h-9 rounded-[8px] font-display text-sm font-semibold', side === s ? (s === 'seller' ? 'bg-rise text-on-holo' : 'bg-fall text-on-holo') : 'text-ink-2')}
            data-testid={`side-${s}`}
          >
            {s === 'buyer' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>
      <span className="text-center text-[10px] leading-tight text-ink-3">{side === 'buyer' ? 'Sell puts you at the top, asking.' : 'Buy puts you at the bottom, bidding.'}</span>
    </div>
  );
}

/** The status screen's list, today's StatusTable without its Pass: every seat starts as a buyer. */
function StatusList() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5 rounded-panel border border-holo-line bg-panel px-3 py-2" data-testid="status">
      <div className="grid grid-cols-[1fr_repeat(3,3.5rem)_5rem] gap-2 font-mono text-[10px] text-ink-3">
        <span>PLAYER</span>
        <span className="text-right">HAVE</span>
        <span className="text-right">NEED</span>
        <span className="text-right">SPARE</span>
        <span className="text-right">SIDE</span>
      </div>
      {SEATS.map((s) => (
        <div key={s.id} className="grid grid-cols-[1fr_repeat(3,3.5rem)_5rem] items-center gap-2 text-sm">
          <span className="flex items-center gap-1.5 font-display font-semibold">
            <Creature species={s.species} color={SLOT_COLOR[s.slot]} size={18} />
            {s.id === ME.id ? 'You' : s.name}
          </span>
          <span data-num className="text-right font-mono">{s.have}</span>
          <span data-num className="text-right font-mono">{s.need}</span>
          <span data-num className={cx('text-right font-mono', s.have - s.need < 0 ? 'text-alert' : s.have > s.need ? 'text-ok' : 'text-ink-3')}>
            {s.have - s.need > 0 ? '+' : ''}
            {s.have - s.need}
          </span>
          <span className="text-right">
            <span className="rounded-chip bg-fall/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-fall">BUYING</span>
          </span>
        </div>
      ))}
      <p className="mt-auto text-xs text-ink-3">Everyone starts as a buyer. Selling is a tap on Sell; sitting a good out is standing still at the bottom.</p>
    </div>
  );
}

// --- The TV ----------------------------------------------------------------------------

/** The big screen while Lena sells to the store: the deal's speed on the board and in words. */
export function TvAuction({ deal }: { deal: Deal }) {
  const { walkers, deals } = board('store', deal.units);
  const steps = deal.units > 0 ? speedStep(deal.speed) : 0;
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-8 text-ink">
      <header className="flex flex-col gap-1">
        <span className="label-caps text-base!">Month 5 / 12</span>
        <h1 className="font-display text-5xl font-semibold leading-none">Auction · Food</h1>
      </header>
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <TimeBar size="tv" seconds={14} total={TOTAL} slowed={deal.trading} />
          <WalkBoard size="tv" lo={LO} hi={HI} walkers={walkers} deals={deal.trading ? deals.map((d) => ({ ...d, speed: deal.speed })) : []} storeBuys={STORE_BUYS} storeSells={STORE_SELLS} shipPays={null} storeStock={STORE_STOCK} marks={{ ask: true, bid: true }} className="min-h-0 flex-1" />
        </div>
        <div className="flex w-[300px] shrink-0 flex-col gap-4">
          <div className="flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft p-4 shadow-glow">
            <GoodTag good={GOOD} name className="text-2xl" />
            <span className={cx('font-display text-xl font-semibold', deal.trading && 'text-warn')}>{deal.trading ? 'Trading · clock slowed' : 'Walk'}</span>
            <span data-num className="font-mono text-lg text-ink-2">
              {deal.units} unit{deal.units === 1 ? '' : 's'} traded
            </span>
          </div>
          {deal.units > 0 && (
            <div className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4" data-testid="tv-deal">
              <span className="flex items-center gap-2 font-display text-2xl font-semibold">
                <Creature species={ME.species} color={SLOT_COLOR[ME.slot]} size={32} />
                Lena sells to the store
              </span>
              <span data-num className="font-mono text-xl text-ink-2">
                ×{deal.units} at {STORE_BUYS} cr
              </span>
              <span className="flex items-center gap-2 font-mono text-3xl" aria-label={`speed ${steps} of ${SPEED_STEPS}`}>
                {Array.from({ length: SPEED_STEPS }, (_, k) => (
                  <span key={k} className={k < steps ? 'text-holo' : 'text-ink-3/30'}>
                    ›
                  </span>
                ))}
                <span className="text-lg text-ink-2">{deal.trading ? 'faster and faster' : deal.ranOut ? 'sold out' : 'stopped'}</span>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
