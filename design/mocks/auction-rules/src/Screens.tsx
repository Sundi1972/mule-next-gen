import { Button, Creature, cx, GOOD_NAME, GoodIcon, GoodTag, SLOT_COLOR, TimeBar, type Good } from '@mule/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BRIX, ENERGY, FOOD, KAI, LENA, LENA_E, OSSA, REST_AT, saleAt, saleBoard, soldOutAt, walker, type Sale } from './auction';
import { SPEED_STEPS, speedStep, WalkBoard } from './proposed/WalkBoard';

/**
 * Graft targets: apps/web/src/phone/Auction.tsx (the walk's rail and footer: the stop at the need, the shortage act,
 * the switch's words), the proposed WalkBoard (packages/ui: rest bands, KEEPS/SHORT marks, the sold-out line), and the
 * TV's TvAuction (apps/web/src/table/TableApp.tsx: the deal panel's words). The headline is #374's.
 */

/** How selling into a shortage is chosen: A holds ▼ on the walk pad, B taps a card in the rail. */
export type Variant = 'A' | 'B';

// --- Clocks --------------------------------------------------------------------------------------------------------

/** Milliseconds since the scene started, ticking; `replay` starts it again. */
export function useClock() {
  const [start, setStart] = useState(() => performance.now());
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 33);
    return () => clearInterval(id);
  }, []);
  return { t: now - start, now, replay: () => setStart(performance.now()), at: (ms: number) => start + ms };
}

/** B's sale, live: the clock, when Lena chose to sell short and when she tapped ▲. */
export function useSale() {
  const clock = useClock();
  const [unlock, setUnlock] = useState<number | null>(null);
  const [stop, setStop] = useState<number | null>(null);
  const sale = saleAt(clock.t, unlock, stop);
  return {
    sale,
    sellShort: () => setUnlock(clock.t),
    stop: () => (sale.trading ? setStop(clock.t) : undefined),
    replay: () => {
      setUnlock(null);
      setStop(null);
      clock.replay();
    },
  };
}
export type LiveSale = ReturnType<typeof useSale>;

/** Units a second at a deal's speed now: about 1 at first, 5 at the top. */
const perSecond = (speed: number) => Math.round((1000 / (1000 - speed * 800)) * 10) / 10;

// --- The phone's pieces, as built (apps/web/src/phone/Auction.tsx), with the new words ----------------------------

/** #374's headline: the good leads, the clock beside it. */
function Headline({ good, slowed }: { good: Good; slowed: boolean }) {
  return (
    <div className="mb-1.5 flex min-w-0 shrink-0 items-center gap-2" data-testid="auction-headline">
      <span className="flex shrink-0 items-center gap-1.5">
        <GoodIcon good={good} size={22} />
        <span className="font-display text-xl font-semibold leading-none">{GOOD_NAME[good]}</span>
      </span>
      <TimeBar seconds={14} total={20} slowed={slowed} className="min-w-0 flex-1" />
    </div>
  );
}

function GoodRow({ good, have, need }: { good: Good; have: number; need: number }) {
  const spare = have - need;
  return (
    <div className="flex items-center justify-between gap-2 rounded-control border border-holo-faint bg-panel px-2.5 py-1.5" data-testid="good-row">
      <GoodTag good={good} name />
      <div className="grid grid-cols-3 gap-2.5 font-mono text-[10px] text-ink-3">
        <span className="flex flex-col">
          HAVE
          <strong data-num className={cx('text-sm', spare < 0 ? 'text-warn' : 'text-ink')} data-testid="have">
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
  );
}

function Hint({ line, how, tone = 'plain', testid = 'hint' }: { line: string; how?: string | null; tone?: 'plain' | 'lit' | 'warn' | 'ok'; testid?: string }) {
  return (
    <div
      className={cx(
        'rounded-control border px-2.5 py-1.5',
        tone === 'lit' ? 'border-holo bg-holo-soft' : tone === 'warn' ? 'border-warn bg-warn/10' : tone === 'ok' ? 'border-ok/70 bg-ok/10' : 'border-holo-faint bg-panel',
      )}
      data-testid={testid}
    >
      <p className={cx('font-display text-[13px] font-semibold leading-snug', tone === 'warn' && 'text-warn')}>{line}</p>
      {how && <p className="mt-0.5 text-[11px] leading-snug text-ink-2">{how}</p>}
    </div>
  );
}

/** Buy | Sell, all through the walk (C). A switch puts you in your new side's rest band: it never trades by itself. */
function SideSwitch({ side, onPick, have }: { side: 'buyer' | 'seller'; onPick?: (s: 'buyer' | 'seller') => void; have: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="grid grid-cols-2 gap-1 rounded-control border border-holo-line bg-void p-1" role="radiogroup" aria-label="Your side" data-testid="sides">
        {(['buyer', 'seller'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            disabled={s === 'seller' && have === 0}
            onClick={() => onPick?.(s)}
            className={cx('h-8 rounded-[8px] font-display text-xs font-semibold disabled:opacity-35', side === s ? (s === 'seller' ? 'bg-rise text-on-holo' : 'bg-fall text-on-holo') : 'text-ink-2')}
            data-testid={`side-${s}`}
          >
            {s === 'buyer' ? 'Buy' : 'Sell'}
          </button>
        ))}
      </div>
      <span className="text-center text-[10px] leading-tight text-ink-3" data-testid="sides-caption">
        {side === 'buyer' ? 'Sell takes you up to the sellers’ rest band.' : 'Buy takes you down to the buyers’ rest band.'}
      </span>
    </div>
  );
}

/**
 * Hold a button for `ms` to do something on purpose (variant A's shortage act): the button fills as you hold, and
 * letting go early does nothing.
 */
function HoldToConfirm({ ms, onDone, children, className, testid }: { ms: number; onDone: () => void; children: ReactNode; className?: string; testid: string }) {
  const [p, setP] = useState(0);
  const from = useRef<number | null>(null);
  useEffect(() => {
    if (from.current === null) return;
    let raf = 0;
    const tick = () => {
      if (from.current === null) return;
      const f = (performance.now() - from.current) / ms;
      if (f >= 1) {
        from.current = null;
        setP(0);
        onDone();
        return;
      }
      setP(f);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  const down = () => {
    from.current = performance.now();
    setP(0.001);
  };
  const up = () => {
    from.current = null;
    setP(0);
  };
  return (
    <button
      type="button"
      onPointerDown={down}
      onPointerUp={up}
      onPointerLeave={up}
      className={cx('relative h-12 select-none overflow-hidden rounded-control border-2 border-warn bg-void font-display text-sm font-semibold text-warn', className)}
      data-testid={testid}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 bg-warn/30" style={{ width: `${p * 100}%` }} />
      <span className="relative">{children}</span>
    </button>
  );
}

/** The walk pad as built: tap a step, hold to walk. */
function Pad({ down, onUp }: { down?: ReactNode; onUp?: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Button size="lg" variant="outline" className="h-12 flex-col gap-0 leading-none" onClick={onUp} data-testid="up">
        <span className="text-lg">▲</span>
        <span className="text-[10px] font-normal text-ink-3">hold to walk up</span>
      </Button>
      {down ?? (
        <Button size="lg" variant="outline" className="h-12 flex-col gap-0 leading-none" data-testid="down">
          <span className="text-lg">▼</span>
          <span className="text-[10px] font-normal text-ink-3">hold to walk down</span>
        </Button>
      )}
    </div>
  );
}

/** Lena's phone, sideways (844 × 390): the board in the main pane, the rail on the right. */
export function PhoneFrame({ main, rail, footer }: { main: ReactNode; rail: ReactNode; footer: ReactNode }) {
  return (
    <div className="h-[390px] w-[844px] overflow-hidden rounded-sheet border border-holo-line shadow-map" data-testid="phone-frame">
      <div className="flex h-full w-full bg-table text-ink">
        <main className="flex min-w-0 flex-1 flex-col p-2">{main}</main>
        <aside className="flex w-[272px] shrink-0 flex-col gap-1.5 border-l border-holo-line bg-raised p-2" data-testid="rail">
          {rail}
          <div className="mt-auto flex flex-col gap-1.5">{footer}</div>
        </aside>
      </div>
    </div>
  );
}

// --- D: the rest bands, at the start of the walk -------------------------------------------------------------------

export function PhoneRest() {
  const walkers = [walker(LENA, 'seller', 42), walker(OSSA, 'buyer', 21), walker(BRIX, 'buyer', 29.5), walker(KAI, 'buyer', 19.5, KAI.have, { done: true })];
  return (
    <PhoneFrame
      main={
        <>
          <Headline good={FOOD.good} slowed={false} />
          <Board walkers={walkers} />
        </>
      }
      rail={
        <>
          <GoodRow good={FOOD.good} have={LENA.have} need={LENA.need} />
          <Hint line="You’re selling, waiting in the sellers’ band." how="Nothing trades up here. Walk down past the store’s line to sell: to a buyer, or to the store at 27." />
        </>
      }
      footer={
        <>
          <SideSwitch side="seller" have={LENA.have} />
          <Pad />
        </>
      }
    />
  );
}

/** The Food board with the rest bands on, as the phone draws it. */
function Board({ walkers, deals = [] }: { walkers: ReturnType<typeof saleBoard>['walkers']; deals?: ReturnType<typeof saleBoard>['deals'] }) {
  return (
    <WalkBoard
      lo={FOOD.lo}
      hi={FOOD.hi}
      walkers={walkers}
      deals={deals}
      storeBuys={FOOD.storeBuys}
      storeSells={FOOD.storeSells}
      shipPays={null}
      storeStock={FOOD.stock}
      marks={{ ask: true, bid: true }}
      meId={LENA.id}
      rest
      className="min-h-0 flex-1"
    />
  );
}

// --- B: the sale stops at the need; selling short is an act --------------------------------------------------------

function saleWords(s: Sale, variant: Variant): { line: string; how?: string | null; tone: 'plain' | 'lit' | 'warn' | 'ok' } {
  const cr = (n: number) => `${n * FOOD.storeBuys} cr`;
  switch (s.phase) {
    case 'walking':
      return { line: 'You’re selling: walking down to the store’s line.', how: 'At 27 the store buys, by itself.', tone: 'plain' };
    case 'beat':
      return s.sold === 0
        ? { line: 'At the store’s line: 27 cr each.', how: 'Selling starts in a moment.', tone: 'lit' }
        : { line: 'Selling into a shortage.', how: 'Back at the line: it starts slow again.', tone: 'warn' };
    case 'selling':
      return { line: `Selling to the store: ${s.sold} for ${cr(s.sold)}.`, how: `Tap ▲ to stop. It stops by itself at ${LENA.need}, what you need next month.`, tone: 'lit' };
    case 'held':
      return {
        line: `Stopped at ${LENA.need} Food: what you need next month.`,
        how: variant === 'A' ? 'Sold 7 for 189 cr. To sell more, hold ▼: you’d be short next month.' : `Sold 7 for ${cr(7)}.`,
        tone: 'ok',
      };
    case 'returning':
      return { line: 'Selling into a shortage.', how: 'Walking back down to the line.', tone: 'warn' };
    case 'short':
      return { line: `Selling past your need: short ${s.short} next month.`, how: 'Tap ▲ to stop.', tone: 'warn' };
    case 'stopped':
      return { line: `Stopped. Short ${s.short} next month.`, how: `Sold ${s.sold} for ${cr(s.sold)}.`, tone: 'warn' };
    case 'out':
      return { line: 'Sold all your Food.', how: `Short ${LENA.need} next month. Sold ${s.sold} for ${cr(s.sold)}.`, tone: 'warn' };
  }
}

export function PhoneSale({ variant, live }: { variant: Variant; live: LiveSale }) {
  const { sale } = live;
  const { walkers, deals } = saleBoard(sale);
  const have = LENA.have - sale.sold;
  const w = saleWords(sale, variant);
  const held = sale.phase === 'held';
  return (
    <PhoneFrame
      main={
        <>
          <Headline good={FOOD.good} slowed={sale.trading} />
          <Board walkers={walkers} deals={deals} />
        </>
      }
      rail={
        <>
          <GoodRow good={FOOD.good} have={have} need={LENA.need} />
          <Hint line={w.line} how={w.how ?? null} tone={w.tone} />
          {sale.trading && (
            <p className="text-center font-mono text-[11px] text-ink-3" data-testid="pace">
              {perSecond(sale.speed)} a second · rising to 5
            </p>
          )}
          {variant === 'B' && held && (
            <div className="flex flex-col gap-1.5 rounded-control border border-warn/70 bg-void px-2.5 py-2" data-testid="short-card">
              <p className="text-[11px] leading-snug text-ink-2">
                Keep <strong className="text-ink">5</strong> for next month, or sell them too and be short?
              </p>
              <Button size="md" variant="outline" className="w-full border-warn text-warn" onClick={live.sellShort} data-testid="sell-short">
                Sell into a shortage
              </Button>
            </div>
          )}
        </>
      }
      footer={
        <>
          <SideSwitch side="seller" have={have} />
          <Pad
            onUp={live.stop}
            down={
              variant === 'A' && held ? (
                <HoldToConfirm ms={1000} onDone={live.sellShort} testid="sell-short">
                  ▼ Hold: sell short
                </HoldToConfirm>
              ) : undefined
            }
          />
        </>
      }
    />
  );
}

// --- C: switching side during the walk ----------------------------------------------------------------------------

export function useSwitch() {
  const clock = useClock();
  const [side, setSide] = useState<'buyer' | 'seller'>('buyer');
  const [from, setFrom] = useState({ at: 25, t: -10_000 });
  const to = side === 'seller' ? REST_AT.seller : REST_AT.buyer;
  const f = Math.min(1, (clock.t - from.t) / 700);
  const at = from.at + (to - from.at) * f;
  return {
    side,
    at,
    gliding: f < 1,
    pick: (s: 'buyer' | 'seller') => {
      if (s === side) return;
      setFrom({ at, t: clock.t });
      setSide(s);
    },
  };
}

export function PhoneSwitch({ sw }: { sw: ReturnType<typeof useSwitch> }) {
  const walkers = [walker(LENA, sw.side, sw.at), walker(OSSA, 'buyer', 24), walker(BRIX, 'buyer', 29.5), walker(KAI, 'seller', 33.5)];
  return (
    <PhoneFrame
      main={
        <>
          <Headline good={FOOD.good} slowed={false} />
          <Board walkers={walkers} />
        </>
      }
      rail={
        <>
          <GoodRow good={FOOD.good} have={LENA.have} need={LENA.need} />
          {sw.gliding ? (
            <Hint line={sw.side === 'seller' ? 'Now selling: up to the sellers’ band.' : 'Now buying: down to the buyers’ band.'} how="Passing the others trades nothing." tone="lit" />
          ) : (
            <Hint
              line={sw.side === 'seller' ? 'You’re selling, waiting in the sellers’ band.' : 'You’re buying, waiting in the buyers’ band.'}
              how={sw.side === 'seller' ? 'Walk down past the store’s line to sell.' : 'Walk up past the store’s line to bid.'}
            />
          )}
        </>
      }
      footer={
        <>
          <SideSwitch side={sw.side} onPick={sw.pick} have={LENA.have} />
          <Pad />
        </>
      }
    />
  );
}

// --- E: the store sold out ----------------------------------------------------------------------------------------

export function useSoldOut() {
  const clock = useClock();
  return { ...soldOutAt(clock.t), replay: clock.replay };
}

export function PhoneSoldOut({ so }: { so: ReturnType<typeof useSoldOut> }) {
  const have = LENA_E.have + so.bought;
  const line =
    so.phase === 'bidding'
      ? { line: `Bidding ${Math.round(so.walkers[0]!.at)}: past the store’s old 34.`, how: 'The store is sold out. Its line follows the top bid, so a seller has to come down to you.', tone: 'lit' as const }
      : so.phase === 'met'
        ? { line: 'Brix meets your bid at 43.', how: 'Buying starts in a moment.', tone: 'lit' as const }
        : so.phase === 'trading'
          ? { line: `Buying from Brix at 43: ${so.bought} so far.`, how: 'Tap ▼ to stop.', tone: 'lit' as const }
          : { line: `Bought ${so.bought} from Brix for ${so.bought * 43} cr.`, how: 'You have what you need.', tone: 'ok' as const };
  return (
    <PhoneFrame
      main={
        <>
          <Headline good={ENERGY.good} slowed={so.deals.length > 0} />
          <WalkBoard
            lo={ENERGY.lo}
            hi={ENERGY.hi}
            walkers={so.walkers}
            deals={so.deals}
            storeBuys={ENERGY.storeBuys}
            storeSells={null}
            soldOutAt={so.line}
            shipPays={null}
            storeStock={0}
            marks={{ ask: true, bid: true }}
            meId={LENA_E.id}
            rest
            className="min-h-0 flex-1"
          />
        </>
      }
      rail={
        <>
          <GoodRow good={ENERGY.good} have={have} need={LENA_E.need} />
          <Hint line={line.line} how={line.how} tone={line.tone} />
          <p className="rounded-control border border-rise/50 bg-void px-2.5 py-1.5 text-[11px] leading-snug text-ink-2" data-testid="sold-out-note">
            <strong className="text-rise">Store sold out.</strong> Nobody can buy from it; it still buys at {ENERGY.storeBuys}.
          </p>
        </>
      }
      footer={
        <>
          <SideSwitch side="buyer" have={have} />
          <Pad />
        </>
      }
    />
  );
}

// --- The TV ------------------------------------------------------------------------------------------------------

function TvShell({ good, slowed, board, panel }: { good: Good; slowed: boolean; board: ReactNode; panel: ReactNode }) {
  return (
    <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-8 text-ink">
      <header className="flex flex-col gap-1">
        <span className="label-caps text-base!">Month 5 / 12</span>
        <h1 className="flex items-center gap-4 font-display text-5xl font-semibold leading-none" data-testid="tv-phase">
          <GoodIcon good={good} size={52} />
          {GOOD_NAME[good]} auction
        </h1>
      </header>
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <TimeBar size="tv" seconds={14} total={20} slowed={slowed} />
          {board}
        </div>
        <div className="flex w-[300px] shrink-0 flex-col gap-4">{panel}</div>
      </div>
    </div>
  );
}

function Chevrons({ speed, on }: { speed: number; on: boolean }) {
  const steps = on ? speedStep(speed) : 0;
  return (
    <span className="flex items-center gap-2 font-mono text-3xl" aria-label={`speed ${steps} of ${SPEED_STEPS}`}>
      {Array.from({ length: SPEED_STEPS }, (_, k) => (
        <span key={k} className={k < steps ? 'text-holo' : 'text-ink-3/30'}>
          ›
        </span>
      ))}
      {on && <span className="text-lg text-ink-2">{perSecond(speed)} a second</span>}
    </span>
  );
}

export function TvSale({ live }: { live: LiveSale }) {
  const { sale } = live;
  const { walkers, deals } = saleBoard(sale);
  const held = sale.phase === 'held';
  const short = sale.short > 0;
  return (
    <TvShell
      good={FOOD.good}
      slowed={sale.trading}
      board={
        <WalkBoard
          size="tv"
          lo={FOOD.lo}
          hi={FOOD.hi}
          walkers={walkers}
          deals={deals}
          storeBuys={FOOD.storeBuys}
          storeSells={FOOD.storeSells}
          shipPays={null}
          storeStock={FOOD.stock}
          marks={{ ask: true, bid: true }}
          rest
          className="min-h-0 flex-1"
        />
      }
      panel={
        <>
          <div className="flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft p-4 shadow-glow">
            <span className={cx('font-display text-xl font-semibold', sale.trading && 'text-warn')}>{sale.trading ? 'Trading · clock slowed' : 'Walk'}</span>
            <span data-num className="font-mono text-lg text-ink-2">
              {sale.sold} unit{sale.sold === 1 ? '' : 's'} traded
            </span>
          </div>
          {sale.sold > 0 && (
            <div className={cx('flex flex-col gap-2 rounded-panel border bg-panel p-4', short ? 'border-warn' : held ? 'border-ok/70' : 'border-holo-line')} data-testid="tv-deal">
              <span className="flex items-center gap-2 font-display text-2xl font-semibold">
                <Creature species={LENA.species} color={SLOT_COLOR[LENA.slot]} size={32} />
                {held ? 'Lena keeps 5 Food' : short ? 'Lena sells short' : 'Lena sells to the store'}
              </span>
              <span data-num className={cx('font-mono text-xl', short ? 'text-warn' : 'text-ink-2')}>
                {held ? 'what she needs next month' : short ? `×${sale.short} past her need · short ${sale.short}` : `×${sale.sold} at ${FOOD.storeBuys} cr`}
              </span>
              <Chevrons speed={sale.speed} on={sale.trading} />
            </div>
          )}
        </>
      }
    />
  );
}

export function TvSoldOut({ so }: { so: ReturnType<typeof useSoldOut> }) {
  return (
    <TvShell
      good={ENERGY.good}
      slowed={so.deals.length > 0}
      board={
        <WalkBoard
          size="tv"
          lo={ENERGY.lo}
          hi={ENERGY.hi}
          walkers={so.walkers}
          deals={so.deals}
          storeBuys={ENERGY.storeBuys}
          storeSells={null}
          soldOutAt={so.line}
          shipPays={null}
          storeStock={0}
          marks={{ ask: true, bid: true }}
          rest
          className="min-h-0 flex-1"
        />
      }
      panel={
        <>
          <div className="flex flex-col gap-1 rounded-panel border-2 border-rise bg-panel p-4">
            <span className="font-display text-2xl font-semibold text-rise">Store sold out</span>
            <span className="text-lg leading-snug text-ink-2">
              Bids can go past its old {ENERGY.oldSells}. Its line follows the top bid: <strong data-num className="font-mono text-ink">{Math.round(so.line)}</strong>
            </span>
          </div>
          {so.bought > 0 && (
            <div className="flex flex-col gap-2 rounded-panel border border-holo-line bg-panel p-4" data-testid="tv-deal">
              <span className="font-display text-2xl font-semibold">Brix sells to Lena</span>
              <span data-num className="font-mono text-xl text-ink-2">×{so.bought} at 43 cr</span>
              <Chevrons speed={so.deals[0]?.speed ?? 0} on={so.deals.length > 0} />
            </div>
          )}
        </>
      }
    />
  );
}

