import { WALK, tradeInterval } from '@mule/engine';
import type { AuctionView, DealView, MuleView } from '@mule/protocol';
import { Button, cx, GOOD_NAME, GoodTag, PlayerMark, TimeBar, WalkBoard, type Slot } from '@mule/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { boardWalkers, StoreBox } from '../../../../../../apps/web/src/components/AuctionParts';
import { slotOf } from '../../../../../../apps/web/src/game/derive';
import { TvHeader } from '../../../../../../apps/web/src/table/TableApp';
import { Board, Game, LaptopFrame, PhoneFrame, TABLE, TvFrame } from '../../harness';
import { ChatProvider, useChatSim } from '../../proposed/Chat';
import { IntentNotes, IntentNotesProvider, type IntentNoteData } from '../../proposed/IntentNote';
import { TickerRuleSwitch } from '../../proposed/TickerRule';
import { AuctionShell } from './auction/AuctionShell';
import { auctionOf, AWAY, CRYSTITE, FOOD, HOST, SALES_TAX, SHIP, shipPrice, VIEW2, WATER, type Scenario } from './auction/fixture';

/** In a real game the ship often wants several goods: the status screens show how the rest read (one sentence). */
const SHIP_ALSO = [{ good: 'rareEarth' as const, wants: 6 }];
import { AUCTION_NOTES, type AuctionNoteId } from './auction/notes';
import {
  defaultSideWords,
  GoodRow,
  Hint,
  LineAction,
  LineQuestion,
  BoardKey,
  Mark,
  MyStoreLine,
  PickedCount,
  PlainStatusTable,
  ReceiptCard,
  SellConfirm,
  ShipCaption,
  ShipWants,
  Shown,
  StepHold,
  WaitingToPick,
  walkHint,
  type LineAsk,
  type PickSeat,
  type Receipt,
} from './auction/parts';

/**
 * The goods auction after the UX audit (docs/research/2026-10-28-ws6-ux-audit.md §8, proposals G-1…G-8), for Heiko's
 * approval. Built from the approved auction mocks (#status, #walk, #auction-*) and the product's own parts: the
 * PhoneShell (forked to auction/AuctionShell.tsx for two header slots), @mule/ui's WalkBoard, TimeBar and GoodTag, and
 * AuctionParts' boardWalkers and StoreBox, as they are. Only what a proposal changes is drawn new (auction/parts.tsx),
 * and each change carries a numbered IntentMarker; the review page lists, per number, the intent it serves and why.
 *
 * Month 2, Lena (the host) on her phone; Kai is a person whose phone has dropped; The Accountant is an AI. The walk
 * plays: hold or tap ▲ ▼ (or drag on the board), stop at the store's line, choose how many, buy, Done, the receipt.
 * The clock is frozen so a state holds still while it is read.
 *
 * GRAFT TARGET: apps/web/src/phone/Auction.tsx (the status and walk stages, Hold), apps/web/src/components/
 * AuctionParts.tsx (StatusTable's words, the hint), apps/web/src/table/TableApp.tsx::TvAuction (the TV), all WS3's;
 * apps/web/src/phone/Shell.tsx's header (WS4's) for the count and the tally; @mule/ui WalkBoard (WS4's) for the ship
 * line's caption (a DS-GAP, see ShipCaption). The rules behind G-1, G-5's close stage and G-7 are WS3's engine
 * (packages/engine/src/walk.ts, auction.ts). Drop every IntentMarker.
 */

export { AUCTION_NOTES };
const N = AUCTION_NOTES;

/** The review page's states, in the order a month plays them. */
export const AUCTION_STATES = [
  { id: 'status', title: 'Buy or sell? Plain words, the ship, no clock', marks: ['G4', 'G6', 'G7', 'G8'] },
  { id: 'walk', title: 'The walk: hold, the hint, prices from your side', marks: ['G2', 'G3', 'G4'] },
  { id: 'store-line', title: 'At the store’s line: you choose how many', marks: ['G1'] },
  { id: 'receipt', title: 'When a good closes: the receipt', marks: ['G5'] },
  { id: 'ship', title: 'The ship on the board', marks: ['G3', 'G6'] },
] as const satisfies readonly { id: string; title: string; marks: readonly AuctionNoteId[] }[];

export type AuctionState = (typeof AUCTION_STATES)[number]['id'];

// --- The walk, playable -------------------------------------------------------------------------------------

type Moment = 'walk' | 'line' | 'confirm' | 'trading' | 'done' | 'closed';
export type Start = 'walk' | 'line' | 'confirm' | 'closed';

interface Sim {
  moment: Moment;
  at: number;
  have: number;
  amount: number;
  /** Units moved in this good, their prices, and the tax on them. */
  traded: number;
  prices: number[];
  tax: number;
  money: number;
  tally: number;
}

/** The house line Lena walks to: the store's selling line for a buyer; for a seller the best payer, the ship or the store. */
function lineOf(s: Scenario): { price: number; house: 'store' | 'ship' } | null {
  if (s.side === 'buyer') return s.storeSells !== null && s.storeForSale > 0 ? { price: s.storeSells, house: 'store' } : null;
  const ship = s.shipPays;
  const store = s.storeBuys;
  if (ship !== null && (store === null || ship > store)) return { price: ship, house: 'ship' };
  return store !== null ? { price: store, house: 'store' } : null;
}

/** A unit's price at the line: the ship pays a little less for each further unit, the store the same. */
const unitPrice = (s: Scenario, house: 'store' | 'ship', k: number) => (house === 'ship' ? shipPrice(k) : lineOf(s)!.price);

/** At the line: the amount the rail starts at (what you need, or your spare) and the most you can choose. */
function aimOf(s: Scenario, sim: Pick<Sim, 'have' | 'money'>): { aim: number; max: number } {
  const line = lineOf(s)!;
  if (s.side === 'buyer') return { aim: Math.max(0, s.need - sim.have), max: Math.max(1, Math.min(s.storeForSale, Math.floor(sim.money / line.price))) };
  const max = line.house === 'ship' ? Math.min(sim.have, SHIP.wants) : sim.have;
  return { aim: sim.have - s.need, max: Math.max(1, max) };
}

/** Moves one unit at the line, with its money, tax and running total. */
function tradeOne(s: Scenario, sim: Sim): Sim {
  const line = lineOf(s)!;
  const price = unitPrice(s, line.house, sim.traded);
  if (s.side === 'buyer') return { ...sim, traded: sim.traded + 1, prices: [...sim.prices, price], have: sim.have + 1, money: sim.money - price, tally: sim.tally - price };
  const tax = Math.round(price * SALES_TAX);
  return { ...sim, traded: sim.traded + 1, prices: [...sim.prices, price], tax: sim.tax + tax, have: sim.have - 1, money: sim.money + price - tax, tally: sim.tally + price - tax };
}

function startSim(s: Scenario, start: Start): Sim {
  const base: Sim = { moment: 'walk', at: s.start, have: s.have, amount: 1, traded: 0, prices: [], tax: 0, money: s.money, tally: s.tally };
  if (start === 'walk') return base;
  const line = lineOf(s)!;
  const { aim } = aimOf(s, base);
  const at = { ...base, at: line.price, amount: Math.max(1, aim) };
  if (start === 'line') return { ...at, moment: 'line' };
  if (start === 'confirm') return { ...at, moment: 'confirm', amount: Math.max(1, aim) + 1 };
  let done: Sim = at;
  for (let i = 0; i < at.amount; i++) done = tradeOne(s, done);
  return { ...done, moment: 'closed' };
}

function useWalk(s: Scenario, start: Start) {
  const [sim, setSim] = useState(() => startSim(s, start));
  const dir = useRef<-1 | 0 | 1>(0);
  const last = useRef(performance.now());
  const line = lineOf(s);
  const toward: 1 | -1 = s.side === 'buyer' ? 1 : -1;

  /** One move of `step` cr in `d`: the house line stops the walk and asks how many (G-1); walking away leaves it. */
  const move = (cur: Sim, d: 1 | -1, step: number): Sim => {
    if (cur.moment === 'closed' || cur.moment === 'done') return cur;
    if (cur.moment === 'trading') return { ...cur, moment: 'done' }; // G-1: a press on ▲ ▼ stops any trade
    const next = Math.min(s.hi, Math.max(s.lo, cur.at + d * step));
    if (line && d === toward && (toward > 0 ? next >= line.price : next <= line.price)) {
      if (cur.moment === 'line' || cur.moment === 'confirm') return cur;
      return { ...cur, at: line.price, moment: 'line', amount: Math.max(1, Math.min(aimOf(s, cur).max, aimOf(s, cur).aim)) };
    }
    return { ...cur, at: next, moment: 'walk' };
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      // By the time that has passed, as the server steps it: a late tick walks as far as an on-time one.
      const now = performance.now();
      const dt = Math.min(500, now - last.current);
      last.current = now;
      if (dir.current === 0) return;
      const d = dir.current;
      setSim((cur) => move(cur, d, ((s.hi - s.lo) / WALK.crossSeconds) * (dt / 1000)));
    }, WALK.tickMs);
    return () => window.clearInterval(id);
    // `move` reads only the scenario's numbers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s]);

  // Units move one at a time, faster with each, until the number chosen (G-1: never past it).
  useEffect(() => {
    if (sim.moment !== 'trading') return;
    if (sim.traded >= sim.amount) {
      setSim((cur) => ({ ...cur, moment: 'done' }));
      return;
    }
    const id = window.setTimeout(() => setSim((cur) => (cur.moment === 'trading' ? tradeOne(s, cur) : cur)), tradeInterval(sim.traded));
    return () => window.clearTimeout(id);
  }, [sim.moment, sim.traded, sim.amount, s]);

  return {
    sim,
    line,
    toward,
    hold: (d: 1 | -1) => (on: boolean) => {
      dir.current = on ? d : 0;
      if (on) setSim((cur) => (cur.moment === 'trading' ? { ...cur, moment: 'done' } : cur));
    },
    step: (d: 1 | -1) => () => setSim((cur) => move(cur, d, 1)),
    drag: (d: -1 | 0 | 1) => (dir.current = d),
    amount: (n: number) => setSim((cur) => ({ ...cur, amount: n })),
    go: () =>
      setSim((cur) => {
        const { aim } = aimOf(s, cur);
        // Selling past your spare asks first (G-1).
        if (s.side === 'seller' && cur.moment === 'line' && cur.amount > aim) return { ...cur, moment: 'confirm' };
        return { ...cur, moment: 'trading', traded: 0, prices: [], tax: 0 };
      }),
    confirm: (yes: boolean) => setSim((cur) => (yes ? { ...cur, moment: 'trading', traded: 0, prices: [], tax: 0 } : { ...cur, moment: 'line', amount: Math.max(1, aimOf(s, cur).aim) })),
    close: () => setSim((cur) => ({ ...cur, moment: 'closed' })),
  };
}

function receiptOf(s: Scenario, sim: Sim): Receipt {
  const line = lineOf(s);
  const gross = sim.prices.reduce((a, b) => a + b, 0);
  return {
    good: s.good,
    kind: sim.traded === 0 ? 'none' : s.side === 'buyer' ? 'bought' : 'sold',
    units: sim.traded,
    gross,
    tax: sim.tax,
    house: line?.house ?? 'store',
    prices: sim.prices,
    have: sim.have,
    need: s.need,
    next: s.next,
    rate: SALES_TAX,
  };
}

/** The walk on a phone or a laptop (the shell sizes from its own width). */
export function WalkAudit({ s, start = 'walk' }: { s: Scenario; start?: Start }) {
  const { sim, line, toward, hold, step, drag, amount, go, confirm, close } = useWalk(s, start);
  const view = VIEW2;
  const good = GOOD_NAME[s.good];
  const deals: DealView[] =
    sim.moment === 'trading' && line && sim.traded > 0
      ? [{ buyer: s.side === 'buyer' ? 'lena' : line.house, seller: s.side === 'buyer' ? line.house : 'lena', price: unitPrice(s, line.house, sim.traded - 1), units: sim.traded }]
      : [];
  const auction: AuctionView = auctionOf(s, { stage: 'walk', at: sim.at, have: sim.have, deals });
  const walkers = boardWalkers(view, auction);
  const { aim, max } = line ? aimOf(s, sim) : { aim: 0, max: 1 };
  const ask: LineAsk | null = line
    ? { side: s.side, house: line.house, good: s.good, amount: sim.amount, aim, max, total: Array.from({ length: sim.amount }, (_, k) => unitPrice(s, line.house, k)).reduce((a, b) => a + b, 0), have: sim.have, need: s.need }
    : null;
  const hint = walkHint(view, auction, 'lena', sim.have);
  const closed = sim.moment === 'closed';
  const atLine = sim.moment === 'line' || sim.moment === 'confirm';
  const away: 1 | -1 = toward > 0 ? -1 : 1;
  const r = receiptOf(s, sim);
  const did = s.side === 'buyer' ? 'bought' : 'sold';

  const rail = (
    <>
      {/* At the line the question and the confirm say what you have and need, so the good's card gives them the room. */}
      {!atLine && <GoodRow good={s.good} have={sim.have} need={s.need} />}
      {sim.moment === 'walk' && <Hint line={hint.line} how={hint.how} />}
      {sim.moment === 'line' && ask && <LineQuestion ask={ask} onAmount={amount} />}
      {sim.moment === 'confirm' && ask && <SellConfirm ask={ask} keep={sim.have - sim.amount} need={s.need} onYes={() => confirm(true)} onNo={() => confirm(false)} />}
      {sim.moment === 'trading' && (
        <Hint tone="lit" marks={false} line={`${s.side === 'buyer' ? 'Buying from' : 'Selling to'} ${line?.house === 'ship' ? 'the ship' : 'the store'}: ${sim.traded} of ${sim.amount}…`} how="Press ▲ or ▼ to stop." />
      )}
      {sim.moment === 'done' && (
        <Hint
          tone="ok"
          marks={false}
          line={sim.traded === 0 ? 'Stopped: nothing traded.' : `You ${did} ${sim.traded} ${good} for ${s.side === 'buyer' ? r.gross : r.gross - r.tax} cr.`}
          how={`You have ${sim.have}${s.need > 0 ? ` of the ${s.need} you need` : ''}. Tap Done with ${good} when you’re finished.`}
        />
      )}
      {closed && <Hint marks={false} line={`${good} is closed.`} how={`Next: ${GOOD_NAME[s.next]}, buy or sell?`} />}
    </>
  );

  const holds = (disableToward: boolean) => (
    <div className="grid grid-cols-2 gap-2">
      <StepHold dir={1} disabled={closed || (disableToward && toward > 0)} onHold={hold(1)} onStep={step(1)} />
      <StepHold dir={-1} disabled={closed || (disableToward && toward < 0)} onHold={hold(-1)} onStep={step(-1)} />
    </div>
  );
  const footer = (
    <>
      {sim.moment === 'line' && ask ? (
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
          <StepHold dir={away} disabled={false} onHold={hold(away)} onStep={step(away)} />
          <LineAction ask={ask} onGo={go} />
        </div>
      ) : (
        holds(atLine)
      )}
      <Button
        size="md"
        variant={atLine ? 'outline' : 'holo'}
        className="h-10 w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg"
        disabled={closed || sim.moment === 'trading'}
        onClick={close}
        data-testid="done"
      >
        {closed ? `Next: ${GOOD_NAME[s.next]}…` : `Done with ${good}`}
      </Button>
    </>
  );

  return (
    <AuctionShell phase={`${good} auction`} fill money={sim.money} rail={rail} footer={footer}>
      <TimeBar seconds={s.seconds} total={WALK.goodMs / 1000} slowed={sim.moment === 'trading'} className="mb-1.5 @min-[1100px]/shell:mb-3" />
      <BoardKey auction={auction} side={s.side} />
      <div className="relative flex min-h-0 flex-1 flex-col" data-testid="board-wrap">
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
          meId="lena"
          {...(closed ? {} : { onDir: drag })}
          className={cx('min-h-0 flex-1', closed && 'opacity-40')}
        />
        {s.shipPays !== null && <ShipCaption good={s.good} price={s.shipPays} lo={s.lo} hi={s.hi} />}
        {closed && (
          <div className="absolute inset-0 grid place-items-center p-2" data-testid="receipt-layer">
            <ReceiptCard r={r} tally={sim.tally} />
          </div>
        )}
      </div>
    </AuctionShell>
  );
}

// --- The status screen ("buy or sell?"), untimed ----------------------------------------------------------

/** The seats still to pick, in seat order: every person who hasn't; AI seats pick at once. */
function stillToPick(view: MuleView, picked: Record<string, boolean>): PickSeat[] {
  return view.players.filter((p) => !p.isAi && !picked[p.id]).map((p) => ({ id: p.id, name: p.name, slot: (slotOf(view, p.id) ?? 0) as Slot, away: AWAY.includes(p.id) }));
}

const SIDE_WORD = { buyer: 'Buy', seller: 'Sell', pass: 'Pass' } as const;

/** Food's status screen on Lena's phone or laptop: she has picked Buy; the table waits for Kai, whose phone is away. */
export function StatusAudit({ s }: { s: Scenario }) {
  const view = VIEW2;
  const [side, setSide] = useState<'buyer' | 'seller' | 'pass'>(s.side);
  const [moved, setMoved] = useState(false);
  const [asking, setAsking] = useState(false);
  const picked: Record<string, boolean> = { lena: true, accountant: true, kai: moved };
  const waiting = stillToPick(view, picked);
  const auction = auctionOf(s, { stage: 'status', at: 0, have: s.have, sides: { lena: side } });
  const row = auction.status.find((r) => r.id === 'lena')!;
  const spare = row.now - row.need;
  const kai = auction.status.find((r) => r.id === 'kai')!;
  const isHost = HOST === 'lena';
  const count = view.players.filter((p) => p.isAi || picked[p.id]).length;
  const crystite = WALK.order.indexOf(SHIP.good);

  return (
    <AuctionShell
      phase={`${GOOD_NAME[s.good]} · buy or sell?`}
      money={s.money}
      rail={
        <>
          <div className="flex items-center justify-between rounded-control border border-holo-faint bg-panel px-2.5 py-1.5 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3">
            <GoodTag good={s.good} name className="@min-[1100px]/shell:text-lg" />
            <span data-num className={cx('font-mono text-sm font-bold @min-[1100px]/shell:text-xl', spare < 0 ? 'text-alert' : spare > 0 ? 'text-ok' : 'text-ink')}>
              {spare < 0 ? `${-spare} SHORT` : spare > 0 ? `+${spare} SPARE` : 'EVEN'}
            </span>
          </div>
          <p className="text-xs leading-snug text-ink-2 @min-[1100px]/shell:text-base" data-testid="status-words">
            {spare < 0 ? `You need ${-spare} more ${GOOD_NAME[s.good]} this month.` : spare > 0 ? `You have ${spare} more than you need.` : 'You have just what you need.'} Pick your side; you can change it until everyone has.
          </p>
        </>
      }
      footer={
        <>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Your side" data-testid="declare">
            <div className="grid grid-cols-2 gap-2">
              {(['buyer', 'seller'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={side === k}
                  disabled={k === 'seller' && row.now === 0}
                  onClick={() => setSide(side === k ? 'pass' : k)}
                  data-testid={`side-${k}`}
                  className={cx(
                    'h-12 rounded-control border-2 font-display text-lg font-semibold disabled:opacity-35 @min-[1100px]/shell:h-16 @min-[1100px]/shell:text-2xl',
                    side === k ? (k === 'seller' ? 'border-rise bg-rise text-on-holo' : 'border-fall bg-fall text-on-holo') : k === 'seller' ? 'border-rise/60 text-rise' : 'border-fall/60 text-fall',
                  )}
                >
                  {SIDE_WORD[k]}
                </button>
              ))}
            </div>
            <span className="text-center font-mono text-[10px] text-ink-3 @min-[1100px]/shell:text-sm" data-testid="side-now">
              {side === 'pass' ? '✓ YOU SIT THIS GOOD OUT' : `✓ YOU ${side === 'buyer' ? 'BUY' : 'SELL'} · TAP AGAIN TO PASS`}
            </span>
          </div>
          <div className="relative flex flex-col gap-1.5" data-testid="pick-wait">
            {waiting.length > 0 ? <WaitingToPick seats={waiting} /> : <span className="text-sm font-semibold text-holo @min-[1100px]/shell:text-lg">Everyone has picked: the walk starts.</span>}
            {isHost && waiting.length > 0 && (
              <Button size="md" variant="outline" className="w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={() => setAsking(true)} data-testid="move-on">
                Move on for {waiting.length === 1 ? waiting[0]!.name : 'them'}
              </Button>
            )}
            <Mark note={N.G7} part="wait" at="tr" />
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-2 @min-[1100px]/shell:gap-4">
        {/* Where the time bar was: no clock (G-7), the count of who has picked. */}
        <div className="flex items-center gap-2 @min-[1100px]/shell:gap-4" data-testid="pick-bar">
          <PickedCount picked={count} of={view.players.length} />
          <span className="text-xs leading-snug text-ink-2 @min-[1100px]/shell:text-lg">
            <strong className="font-semibold text-ink">No clock:</strong> the walk starts when everyone has picked.
          </span>
        </div>
        <div className="relative rounded-panel border border-holo-line bg-panel px-2 py-1.5 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3">
          <PlainStatusTable view={view} auction={auction} meId="lena" />
        </div>
        <MyStoreLine auction={auction} />
        <ShipWants good={SHIP.good} wants={SHIP.wants} pays={SHIP.pays} have={VIEW2.me!.stock[SHIP.good]} after={WALK.order[crystite - 1]!} also={SHIP_ALSO} />
      </div>
      {asking && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-void/70 p-3" role="dialog" aria-modal aria-labelledby="move-on-title" data-testid="move-on-dialog">
          <div className="flex w-full max-w-[420px] flex-col gap-2 rounded-sheet border-2 border-warn bg-panel p-3 shadow-glow @min-[1100px]/shell:max-w-[560px] @min-[1100px]/shell:gap-4 @min-[1100px]/shell:p-6">
            <h2 id="move-on-title" className="font-display text-lg font-semibold @min-[1100px]/shell:text-3xl">
              Move on without {waiting.map((w) => w.name).join(' and ')}?
            </h2>
            <p className="text-sm text-ink-2 @min-[1100px]/shell:text-lg">
              {defaultSideWords('Kai', s.good, kai.now, kai.need)} That is the side the numbers give; the walk starts for everyone.
            </p>
            <div className="flex gap-2">
              <Button
                size="md"
                className="flex-1"
                onClick={() => {
                  setMoved(true);
                  setAsking(false);
                }}
                data-testid="move-on-now"
              >
                Move on
              </Button>
              <Button size="md" variant="ghost" className="flex-1" onClick={() => setAsking(false)} data-testid="keep-waiting">
                Keep waiting
              </Button>
            </div>
          </div>
        </div>
      )}
    </AuctionShell>
  );
}

// --- The TV ------------------------------------------------------------------------------------------------

/** The TV's status stage: today's TvAuction status branch, untimed (G-7), in plain words (G-8), with the ship (G-6). */
export function TvStatusAudit({ s }: { s: Scenario }) {
  const view = VIEW2;
  const picked: Record<string, boolean> = { lena: true, accountant: true, kai: false };
  const auction = auctionOf(s, { stage: 'status', at: 0, have: s.have });
  const waiting = stillToPick(view, picked);
  const host = view.players.find((p) => p.id === HOST)!;
  const count = view.players.filter((p) => p.isAi || picked[p.id]).length;
  const crystite = WALK.order.indexOf(SHIP.good);
  return (
    <div className="@container/shell">
      <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-8 text-ink" data-phase="auction" data-testid="tv-status">
        <TvHeader game={view} title={`Auction · ${GOOD_NAME[s.good]}`} />
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-4" data-testid="tv-pick-bar">
              <PickedCount picked={count} of={view.players.length} tv />
              <span className="text-2xl text-ink-2">
                <strong className="font-semibold text-ink">No clock:</strong> the walk starts when everyone has picked.
              </span>
            </div>
            <div className="relative rounded-panel border border-holo-line bg-panel px-5 py-4">
              <PlainStatusTable view={view} auction={auction} tv />
            </div>
            <StoreBox auction={auction} tv />
            <ShipWants good={SHIP.good} wants={SHIP.wants} pays={SHIP.pays} have={0} after={WALK.order[crystite - 1]!} also={SHIP_ALSO} tv />
          </div>
          <div className="flex w-[300px] shrink-0 flex-col gap-4">
            <div className="flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft p-4 shadow-glow">
              <GoodTag good={s.good} name className="text-2xl" />
              <span className="font-display text-xl font-semibold">Buy or sell?</span>
            </div>
            <ul className="flex flex-col gap-2" data-testid="tv-picked">
              {view.players.map((p) => {
                const side = auction.walkers.find((w) => w.id === p.id)?.side;
                const done = p.isAi || picked[p.id];
                const isAway = AWAY.includes(p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3" data-testid={`tv-picked-${p.id}`}>
                    <PlayerMark slot={(slotOf(view, p.id) ?? 0) as Slot} size={22} glow={!done} />
                    <span className="flex-1 truncate font-display text-xl font-semibold">{p.name}</span>
                    <span className={cx('font-mono text-lg font-bold', !done ? (isAway ? 'text-warn' : 'text-holo') : side === 'seller' ? 'text-rise' : side === 'buyer' ? 'text-fall' : 'text-ink-3')}>
                      {!done ? (isAway ? 'AWAY · PICKING' : 'PICKING') : `${SIDE_WORD[side ?? 'pass'].toUpperCase()} ✓`}
                    </span>
                  </li>
                );
              })}
            </ul>
            {waiting.length > 0 && (
              <div className="relative flex flex-col gap-2 rounded-panel border-2 border-holo bg-holo-soft p-4 shadow-glow" data-testid="tv-waiting">
                <WaitingToPick seats={waiting} tv />
                <span className="text-lg text-ink-2">{host.name}, the host, can move on for them.</span>
                <Mark note={N.G7} part="tv-wait" at="tl" />
              </div>
            )}
            <p className="mt-auto text-base leading-snug text-ink-2">Pick your side on your phone. No clock: the walk starts when everyone has picked.</p>
            <span className="truncate font-mono text-sm text-ink-3">
              ROOM {TABLE.code}
              {auction.next.length > 0 ? ` · NEXT ${auction.next.map((g) => GOOD_NAME[g].toUpperCase()).join(', ')}` : ''}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Who holds each moving line, counting the store and the ship (the TV's readout counted players only). */
function TvReadout({ auction }: { auction: AuctionView }) {
  const view = VIEW2;
  const sellers = [
    ...auction.walkers.filter((w) => w.side === 'seller' && w.units > 0).map((w) => ({ id: w.id, price: w.price })),
    ...(auction.storeSells !== null && auction.storeForSale > 0 ? [{ id: 'store', price: auction.storeSells }] : []),
  ].sort((a, b) => a.price - b.price);
  const bids = [
    ...auction.walkers.filter((w) => w.side === 'buyer').map((w) => ({ id: w.id, price: w.price })),
    ...(auction.storeBuys !== null ? [{ id: 'store', price: auction.storeBuys }] : []),
    ...(auction.shipPays !== null ? [{ id: 'ship', price: auction.shipPays }] : []),
  ].sort((a, b) => b.price - a.price);
  const name = (id: string) => (id === 'store' ? 'the store' : id === 'ship' ? 'the ship' : (view.players.find((p) => p.id === id)?.name ?? id));
  const ask = sellers[0];
  const bid = bids[0];
  return (
    <dl className="relative grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-1 font-mono text-lg" data-testid="tv-readout">
      <dt className="text-rise">LOWEST ASK</dt>
      <dd data-num className="font-bold text-rise">{ask ? `${ask.price} · ${name(ask.id)}` : '—'}</dd>
      <dt className="text-fall">HIGHEST BID</dt>
      <dd data-num className={cx('font-bold', bid?.id === 'ship' ? 'text-warn' : 'text-fall')}>{bid ? `${bid.price} · ${name(bid.id)}` : '—'}</dd>
      <dt className="text-ink-3">GAP</dt>
      <dd data-num className="font-bold text-ink">{ask && bid ? (ask.price > bid.price ? `${ask.price - bid.price} apart` : 'they meet') : '—'}</dd>
      <Mark note={N.G6} part="tv-readout" at="tr" />
    </dl>
  );
}

/** The TV's walk with the ship in port: today's TvAuction walk branch, the ship's line in words (G-6). */
export function TvWalkAudit({ s }: { s: Scenario }) {
  const view = VIEW2;
  const auction = auctionOf(s, { stage: 'walk', at: s.start, have: s.have });
  const walkers = boardWalkers(view, auction);
  const stock = auction.storeForSale;
  return (
    <div className="@container/shell">
      <div className="flex h-[720px] w-[1280px] flex-col gap-4 bg-table px-10 py-8 text-ink" data-phase="auction" data-testid="tv-walk">
        <TvHeader game={view} title={`Auction · ${GOOD_NAME[s.good]}`} />
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <TimeBar size="tv" seconds={s.seconds} total={WALK.goodMs / 1000} />
            <div className="relative flex min-h-0 flex-1 flex-col">
              <WalkBoard
                size="tv"
                lo={auction.lo}
                hi={auction.hi}
                walkers={walkers}
                deals={auction.deals}
                storeBuys={auction.storeBuys}
                storeSells={auction.storeSells}
                shipPays={auction.shipPays}
                storeStock={stock}
                marks={{ ask: true, bid: true }}
                className="min-h-0 flex-1"
              />
              {s.shipPays !== null && <ShipCaption good={s.good} price={s.shipPays} lo={s.lo} hi={s.hi} tv />}
            </div>
          </div>
          <div className="flex w-[300px] shrink-0 flex-col gap-4">
            <div className="flex flex-col gap-1 rounded-panel border-2 border-holo bg-holo-soft p-4 shadow-glow">
              <GoodTag good={s.good} name className="text-2xl" />
              <span className="font-display text-xl font-semibold">Walk</span>
              <span data-num className="font-mono text-lg text-ink-2">
                {auction.units} units traded
              </span>
            </div>
            <div className="shrink-0 rounded-panel border border-holo-line bg-panel p-3">
              <TvReadout auction={auction} />
            </div>
            <dl className="grid shrink-0 grid-cols-3 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line font-mono" data-testid="tv-store">
              <div className="flex flex-col bg-panel p-3">
                <dt className="label-caps">Sells</dt>
                <dd data-num className="text-2xl font-bold text-rise">{auction.storeSells ?? 'out'}</dd>
              </div>
              <div className="flex flex-col bg-panel p-3">
                <dt className="label-caps">Buys</dt>
                <dd data-num className="text-2xl font-bold text-fall">{auction.storeBuys ?? '—'}</dd>
              </div>
              <div className="flex flex-col bg-panel p-3">
                <dt className="label-caps">Stock</dt>
                <dd data-num className={cx('text-2xl font-bold', stock === 0 ? 'text-alert' : 'text-ink')}>{stock}</dd>
              </div>
            </dl>
            {auction.shipPays !== null && (
              <p className="relative rounded-control border border-warn/60 px-3 py-2 text-lg leading-snug text-warn" data-testid="tv-ship">
                <strong className="font-semibold">The ship buys {GOOD_NAME[s.good]} at {auction.shipPays}</strong>
                <Mark note={N.G6} part="tv-ship" at="tl" />
              </p>
            )}
            <p className="mt-auto text-base leading-snug text-ink-2">Sellers push the red line down, buyers push the green line up. When the two lines meet, the goods change hands.</p>
            <span className="truncate font-mono text-sm text-ink-3">
              ROOM {TABLE.code} · NEXT {auction.next.map((g) => GOOD_NAME[g].toUpperCase()).join(', ')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- The review page's frames and notes, per state ---------------------------------------------------------------

function Caption({ children }: { children: ReactNode }) {
  return <p className="max-w-[844px] font-mono text-xs text-ink-3">{children}</p>;
}

function Phone({ children }: { children: ReactNode }) {
  return (
    <PhoneFrame>
      <Game view={VIEW2} hostId={HOST} away={AWAY}>
        {children}
      </Game>
    </PhoneFrame>
  );
}

function Laptop({ children }: { children: ReactNode }) {
  return (
    <LaptopFrame>
      <Game view={VIEW2} hostId={HOST} away={AWAY}>
        {children}
      </Game>
    </LaptopFrame>
  );
}

function Tv({ children }: { children: ReactNode }) {
  return (
    <TvFrame>
      <Board view={VIEW2}>{children}</Board>
    </TvFrame>
  );
}

const INTRO: Record<AuctionState, ReactNode> = {
  status: 'Food’s “buy or sell?” screen, month 2. Lena is 2 short and has picked Buy; The Accountant (an AI) has picked; Kai’s phone has dropped, so the table waits for him, and Lena, the host, can move on for him. The phone held sideways (844 × 390) first, then the laptop (1440 × 900), then the TV. Try it: Move on for Kai.',
  walk: 'The walk, playable. Food: Lena is 2 short, the store sells at 30 and is the only seller. Water: she has 1 spare, the store pays 8 and The Accountant bids 6. Tap ▲ for one step, hold it to walk, or drag on the board. Walk to the store’s line and G-1’s question opens (its own page, next).',
  'store-line': 'At a store’s line the walk stops and asks. Food: Lena held ▲ up to the store’s 30 and let go: nothing trades until she taps Buy, and the amount starts at what she needs. Water: she chose 2 at the store’s 8, one more than her spare, so it asks first. Try it: − and +, Buy, then Done.',
  receipt: 'When a good closes, a receipt for a moment before the next good, and the month’s running total under the money. Food: she bought the 2 she needs. Water: she sold her spare one; the tax is spelled out.',
  ship: 'Crystite, with the export ship in port: it wants 24 and pays 120 for the first, more than the store’s 86. Lena has 4 to sell. Phone, laptop and the TV; hold ▼ to walk to the ship’s line.',
};

/** One state of the review page: its intro, the frames, and beside them the notes for the numbers on them. */
export function AuctionAuditBody({ state }: { state: AuctionState }) {
  const def = AUCTION_STATES.find((s) => s.id === state)!;
  const notes: IntentNoteData[] = def.marks.map((m) => N[m]);
  // The table talks on every screen (C20): the seat row and the ticker in the rail's header, as the hub's rail has them.
  const chat = useChatSim(0, 'lena');
  return (
    <ChatProvider value={chat}>
      <p className="max-w-[900px] text-sm text-ink-2" data-testid="audit-intro">
        {INTRO[state]} The table chat runs in the rail’s header, as in the product.
      </p>
      <TickerRuleSwitch />
      <Shown.Provider value={new Set(def.marks)}>
        <IntentNotesProvider>
          <div className="flex flex-wrap items-start gap-6">
            <div className="flex min-w-0 flex-col gap-3" data-testid={`audit-frames-${state}`}>
              <Frames state={state} />
            </div>
            <IntentNotes
              className="w-[420px] max-w-full"
              title={`${notes.length === 1 ? 'One change' : `${['', '', 'Two', 'Three', 'Four'][notes.length] ?? notes.length} changes`} on this page, and why`}
              intro="Hover a card and its numbers light up on every frame. “Serves intent” quotes the player intent from the audit; “Why” is what the audit found."
              notes={notes}
            />
          </div>
        </IntentNotesProvider>
      </Shown.Provider>
    </ChatProvider>
  );
}

function Frames({ state }: { state: AuctionState }) {
  switch (state) {
    case 'status':
      return (
        <>
          <Caption>Phone · Food, buy or sell?</Caption>
          <Phone>
            <StatusAudit key="status-p" s={FOOD} />
          </Phone>
          <Caption>Laptop · the same screen</Caption>
          <Laptop>
            <StatusAudit key="status-l" s={FOOD} />
          </Laptop>
          <Caption>TV · the table, waiting for Kai</Caption>
          <Tv>
            <TvStatusAudit s={FOOD} />
          </Tv>
        </>
      );
    case 'walk':
      return (
        <>
          <Caption>Phone · Food: 2 short, the store is the only seller</Caption>
          <Phone>
            <WalkAudit key="walk-food-p" s={FOOD} />
          </Phone>
          <Caption>Phone · Water: 1 spare, the store pays 8, The Accountant bids 6</Caption>
          <Phone>
            <WalkAudit key="walk-water-p" s={WATER} />
          </Phone>
          <Caption>Laptop · Food</Caption>
          <Laptop>
            <WalkAudit key="walk-food-l" s={FOOD} />
          </Laptop>
        </>
      );
    case 'store-line':
      return (
        <>
          <Caption>Phone · Food: at the store’s line, buy how many?</Caption>
          <Phone>
            <WalkAudit key="line-food-p" s={FOOD} start="line" />
          </Phone>
          <Caption>Phone · Water: 2 chosen, 1 more than her spare</Caption>
          <Phone>
            <WalkAudit key="line-water-p" s={WATER} start="confirm" />
          </Phone>
          <Caption>Laptop · Food</Caption>
          <Laptop>
            <WalkAudit key="line-food-l" s={FOOD} start="line" />
          </Laptop>
        </>
      );
    case 'receipt':
      return (
        <>
          <Caption>Phone · Food closes: she bought 2</Caption>
          <Phone>
            <WalkAudit key="receipt-food-p" s={FOOD} start="closed" />
          </Phone>
          <Caption>Phone · Water closes: she sold 1, the tax spelled out</Caption>
          <Phone>
            <WalkAudit key="receipt-water-p" s={WATER} start="closed" />
          </Phone>
          <Caption>Laptop · Water</Caption>
          <Laptop>
            <WalkAudit key="receipt-water-l" s={WATER} start="closed" />
          </Laptop>
        </>
      );
    case 'ship':
      return (
        <>
          <Caption>Phone · Crystite with the ship in port</Caption>
          <Phone>
            <WalkAudit key="ship-p" s={CRYSTITE} />
          </Phone>
          <Caption>Laptop · the same walk</Caption>
          <Laptop>
            <WalkAudit key="ship-l" s={CRYSTITE} />
          </Laptop>
          <Caption>TV · the ship’s line in words</Caption>
          <Tv>
            <TvWalkAudit s={CRYSTITE} />
          </Tv>
        </>
      );
  }
}
