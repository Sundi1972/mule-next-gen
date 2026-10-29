import type { Good } from '@mule/engine';
import type { AuctionView, MuleView } from '@mule/protocol';
import { Button, Creature, cx, GOOD_NAME, GoodIcon, GoodTag, PlayerMark, SLOT_COLOR, useSeatSpecies, type Slot } from '@mule/ui';
import { createContext, useContext, useRef, type ReactNode } from 'react';
import { fmt, slotOf } from '../../../../../../../apps/web/src/game/derive';
import { IntentMarker } from '../../../proposed/IntentNote';
import { AUCTION_NOTES as N } from './notes';

/**
 * The goods auction audit's pieces, one per proposal (G-1…G-8 in notes.ts). Each is drawn from the product's own
 * auction parts (apps/web/src/phone/Auction.tsx and components/AuctionParts.tsx, WS3's screens): forked where a
 * proposal changes them, never redrawn. Every IntentMarker is review furniture: the graft drops them.
 */

/** Which numbers a page shows: only the changes its notes explain (null: all). */
export const Shown = createContext<ReadonlySet<string> | null>(null);

/** An IntentMarker that a page can hide when its notes don't cover that change. */
export function Mark(props: Parameters<typeof IntentMarker>[0]) {
  const shown = useContext(Shown);
  return shown && !shown.has(props.note.id) ? null : <IntentMarker {...props} />;
}

/** Who an id is, in a sentence: "you", "the store", "the ship", or the player's name. */
export function who(view: MuleView, id: string, meId: string): string {
  if (id === meId) return 'you';
  if (id === 'store') return 'the store';
  if (id === 'ship') return 'the ship';
  return view.players.find((p) => p.id === id)?.name ?? id;
}

// --- G-8 · the status table in plain words ----------------------------------------------------------

function Name({ slot, name, size }: { slot: Slot; name: string; size: number }) {
  const species = useSeatSpecies(slot);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Creature species={species} color={SLOT_COLOR[slot]} size={size} />
      <span className="truncate font-display font-semibold">{name}</span>
    </span>
  );
}

/**
 * A fork of AuctionParts' StatusTable with G-8's words: "Goes bad" for Spoils and "Spare" for Surplus, and a short
 * player's spare written "short 2" (it was "-2 short"). Everything else is today's table.
 */
export function PlainStatusTable({ view, auction, meId, tv = false }: { view: MuleView; auction: AuctionView; meId?: string; tv?: boolean }) {
  const cell = tv ? 'px-3 py-2 text-2xl' : 'px-1.5 py-1 text-sm @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-2 @min-[1100px]/shell:text-xl';
  const head = cx('label-caps text-right font-medium', tv ? 'px-3 pb-2 text-sm!' : 'px-1.5 pb-1 text-[10px]! @min-[1100px]/shell:px-3 @min-[1100px]/shell:text-xs!');
  return (
    <table className="w-full" data-testid="status-table">
      <thead>
        <tr>
          <th className={cx(head, 'text-left')}>Player</th>
          <th className={head}>Had</th>
          <th className={head}>Used</th>
          <th className={head}>Made</th>
          <th className={head}>Now</th>
          <th className={head}>Needs</th>
          <th className={cx(head, 'whitespace-nowrap')} data-testid="head-goes-bad">
            Goes bad
          </th>
          <th className={cx(head, 'relative')} data-testid="head-spare">
            Spare
            <Mark note={N.G8} part={tv ? 'tv' : 'head'} at="tl" />
          </th>
        </tr>
      </thead>
      <tbody data-num className="font-mono">
        {auction.status.map((r) => {
          const slot = slotOf(view, r.id) ?? 0;
          const name = r.id === meId ? 'You' : (view.players.find((p) => p.id === r.id)?.name ?? r.id);
          const spare = r.now - r.need;
          return (
            <tr key={r.id} className={cx('border-t border-holo-faint', r.id === meId && 'bg-holo-soft')} data-testid={`status-${r.id}`}>
              <td className={cx(cell, 'text-left')} style={{ maxWidth: tv ? 300 : 150 }}>
                <Name slot={slot} name={name} size={tv ? 34 : 18} />
              </td>
              <td className={cx(cell, 'text-right text-ink-2')}>{r.had}</td>
              <td className={cx(cell, 'text-right text-ink-2')}>{r.used ? `−${r.used}` : 0}</td>
              <td className={cx(cell, 'text-right text-ink-2')}>{r.made ? `+${r.made}` : 0}</td>
              <td className={cx(cell, 'text-right font-bold')}>{r.now}</td>
              <td className={cx(cell, 'text-right text-ink-2')}>{r.need}</td>
              <td className={cx(cell, 'text-right', r.spoils > 0 ? 'text-warn' : 'text-ink-3')} data-testid={`goes-bad-${r.id}`}>
                {r.spoils}
              </td>
              <td className={cx(cell, 'whitespace-nowrap text-right font-bold', spare < 0 ? 'text-alert' : spare > 0 ? 'text-ok' : 'text-ink-3')} data-testid={`spare-${r.id}`}>
                {spare > 0 ? `+${spare}` : spare < 0 ? `short ${-spare}` : '0'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// --- G-4 · the store's prices from your side -----------------------------------------------------------

/** "You can buy from the store at 30 · sell to it at 24", or what is left of it when the store doesn't trade a side. */
export function storeWords(a: Pick<AuctionView, 'storeSells' | 'storeBuys' | 'storeForSale'>): string {
  const buy = a.storeSells !== null && a.storeForSale > 0 ? `You can buy from the store at ${a.storeSells}` : 'The store has none to sell';
  const sell = a.storeBuys !== null ? `${a.storeSells !== null && a.storeForSale > 0 ? 'sell to it' : 'you can sell to it'} at ${a.storeBuys}` : 'it isn’t buying';
  return `${buy} · ${sell}`;
}

/** On the status screen: the store's box, said from your side (the TV keeps the store's side: it has no "you"). */
export function MyStoreLine({ auction }: { auction: AuctionView }) {
  return (
    <p className="relative rounded-panel border border-holo-line bg-panel px-2.5 py-1.5 text-sm @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3 @min-[1100px]/shell:text-lg" data-testid="my-store">
      {storeWords(auction)}
      {auction.storeForSale > 0 && <span className="text-ink-2"> · it has {auction.storeForSale} for sale</span>}
      <Mark note={N.G4} part="status" at="tr" />
    </p>
  );
}

/** Your numbers for the good up now: today's HAVE · NEED · SHORT card, as Auction.tsx draws it. */
export function GoodRow({ good, have, need }: { good: Good; have: number; need: number }) {
  const spare = have - need;
  return (
    <div className="relative flex items-center justify-between gap-2 rounded-control border border-holo-faint bg-panel px-2.5 py-1.5 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3" data-testid="good-row">
      <GoodTag good={good} name className="@min-[1100px]/shell:text-lg" />
      <div className="grid grid-cols-3 gap-2.5 font-mono text-[10px] text-ink-3 @min-[1100px]/shell:gap-4 @min-[1100px]/shell:text-xs">
        <span className="flex flex-col">
          HAVE
          <strong data-num className="text-sm text-ink @min-[1100px]/shell:text-xl" data-testid="have">
            {have}
          </strong>
        </span>
        <span className="flex flex-col">
          NEED
          <strong data-num className="text-sm text-ink @min-[1100px]/shell:text-xl">
            {need}
          </strong>
        </span>
        <span className="flex flex-col">
          {spare < 0 ? 'SHORT' : 'SPARE'}
          <strong data-num className={cx('text-sm @min-[1100px]/shell:text-xl', spare < 0 ? 'text-alert' : spare > 0 ? 'text-ok' : 'text-ink')}>
            {spare > 0 ? '+' : ''}
            {spare}
          </strong>
        </span>
      </div>
    </div>
  );
}

/**
 * Over the board (G-4): the store's prices from your side, then what the line colours mean and what you do with
 * them. Today the phone has neither: the prices are the gutter's codes and only the TV explains the two lines.
 */
export function BoardKey({ auction, side }: { auction: AuctionView; side: 'buyer' | 'seller' }) {
  const ship = auction.shipPays !== null;
  const swatch = (tone: string) => <span aria-hidden className={cx('inline-block w-4 shrink-0 border-t-[3px] border-dashed @min-[1100px]/shell:w-6', tone)} />;
  return (
    <div className="relative mb-1.5 flex shrink-0 flex-col gap-0.5 @min-[1100px]/shell:mb-3 @min-[1100px]/shell:gap-1.5" data-testid="board-key">
      <p className="text-xs font-semibold leading-snug text-ink @min-[1100px]/shell:text-lg" data-testid="store-words">
        {storeWords(auction)}
        {ship && <span className="text-warn"> · the ship buys at {auction.shipPays}</span>}
      </p>
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] leading-snug text-ink-2 @min-[1100px]/shell:gap-x-4 @min-[1100px]/shell:text-base" data-testid="lines-legend">
        <span className="flex items-center gap-1">
          {swatch('border-rise')}
          <strong className="font-semibold text-rise">Red:</strong> what sellers ask
        </span>
        <span className="flex items-center gap-1">
          {swatch('border-fall')}
          <strong className="font-semibold text-fall">Green:</strong> what buyers bid
        </span>
        {ship && (
          <span className="flex items-center gap-1">
            {swatch('border-warn')}
            <strong className="font-semibold text-warn">Amber:</strong> the ship
          </span>
        )}
        <span className="text-ink" data-testid="lines-action">
          {side === 'buyer' ? 'Walk your bid up to a red line and you buy.' : `Walk your ask down to ${ship ? 'the amber or a green' : 'a green'} line and you sell.`}
        </span>
      </p>
      <Mark note={N.G4} part="key" at="tr" />
    </div>
  );
}

// --- G-3 and G-2 · the hint ------------------------------------------------------------------------------

interface Offer {
  id: string;
  price: number;
}

/** Everyone you could trade with now, the store and the ship included, best first. */
export function offers(auction: AuctionView, meId: string): { side: 'buyer' | 'seller' | 'pass'; list: Offer[] } {
  const me = auction.walkers.find((w) => w.id === meId);
  const side = me?.side ?? 'pass';
  if (side === 'buyer') {
    const list: Offer[] = auction.walkers.filter((w) => w.id !== meId && w.side === 'seller' && w.units > 0).map((w) => ({ id: w.id, price: w.price }));
    if (auction.storeSells !== null && auction.storeForSale > 0) list.push({ id: 'store', price: auction.storeSells });
    return { side, list: list.sort((a, b) => a.price - b.price) };
  }
  if (side === 'seller') {
    const list: Offer[] = auction.walkers.filter((w) => w.id !== meId && w.side === 'buyer').map((w) => ({ id: w.id, price: w.price }));
    if (auction.storeBuys !== null) list.push({ id: 'store', price: auction.storeBuys });
    if (auction.shipPays !== null) list.push({ id: 'ship', price: auction.shipPays });
    return { side, list: list.sort((a, b) => b.price - a.price) };
  }
  return { side, list: [] };
}

/** The hint names the price to walk to and who stands there (G-3), and says how to walk (G-2). */
export function walkHint(view: MuleView, auction: AuctionView, meId: string, have: number): { line: string; how: string | null } {
  const { side, list } = offers(auction, meId);
  const good = GOOD_NAME[auction.good];
  if (side === 'pass') return { line: `You sit ${good} out.`, how: null };
  const how = side === 'buyer' ? 'Hold ▲ to walk up; a tap moves 1 cr.' : 'Hold ▼ to walk down; a tap moves 1 cr.';
  if (side === 'seller' && have === 0) return { line: 'You’ve sold all you have.', how: null };
  const best = list[0];
  if (!best) return { line: side === 'buyer' ? `Nobody is selling ${good} now.` : `Nobody is buying ${good} now.`, how };
  const rest = list.slice(1);
  const name = (o: Offer) => who(view, o.id, meId);
  if (side === 'buyer') {
    if (best.id === 'store' && rest.length === 0) return { line: `Walk up to the store’s line at ${best.price}: it’s the only seller.`, how };
    if (best.id === 'store') return { line: `Walk up to the store’s line at ${best.price}: it sells cheapest.`, how };
    return { line: `Walk up to ${name(best)}’s ask at ${best.price}${rest[0] ? `: ${name(rest[0])} asks ${rest[0].price}` : ''}.`, how };
  }
  if (best.id === 'ship') {
    const store = list.find((o) => o.id === 'store');
    return { line: `Walk down to the ship’s line at ${best.price}: it pays the most.${store ? ` The store pays ${store.price}.` : ''}`, how };
  }
  if (best.id === 'store' && rest.length > 0) return { line: `Walk down: the store pays ${best.price}, ${rest.map((o) => `${name(o)} ${o.id === 'ship' ? 'pays' : 'bids'} ${o.price}`).join(', ')}.`, how };
  if (best.id === 'store') return { line: `Walk down to the store’s line at ${best.price}: it’s the only buyer.`, how };
  return { line: `Walk down to ${name(best)}’s bid at ${best.price}.`, how };
}

export function Hint({ line, how, tone = 'quiet', marks = true }: { line: ReactNode; how?: string | null; tone?: 'quiet' | 'lit' | 'ok'; marks?: boolean }) {
  return (
    <div
      className={cx(
        'relative flex flex-col gap-0.5 rounded-control border px-2.5 py-1.5 text-xs leading-snug @min-[1100px]/shell:gap-1 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3 @min-[1100px]/shell:text-base',
        tone === 'lit' ? 'border-holo bg-holo-soft text-ink' : tone === 'ok' ? 'border-ok/60 bg-panel text-ink' : 'border-holo-faint text-ink',
      )}
      data-testid="hint"
    >
      <span className="font-semibold" data-testid="hint-line">
        {line}
      </span>
      {how && (
        <span className="relative text-ink-2" data-testid="hint-how">
          {how}
          {marks && <Mark note={N.G2} part="hint" at="left" />}
        </span>
      )}
      {marks && <Mark note={N.G3} part="hint" at="tl" />}
    </div>
  );
}

// --- G-2 · the walk buttons --------------------------------------------------------------------------------

/** A press shorter than this is a tap, which moves one step; a longer one walks until let go. */
export const TAP_MS = 180;

/**
 * A fork of Auction.tsx's Hold with G-2: it says "Hold ▲ to walk up", and a tap moves one step. Hold walks until you
 * let go, as today. Tap or hold is judged by the events' own timestamps, not by when they are handled: a busy phone
 * can hand over a quick tap's release late, and that must still be a step.
 */
export function StepHold({ dir, disabled, onHold, onStep, mark = true, className }: { dir: 1 | -1; disabled: boolean; onHold: (on: boolean) => void; onStep: () => void; mark?: boolean; className?: string }) {
  const timer = useRef<number | null>(null);
  const holding = useRef(false);
  const down = useRef<number | null>(null);
  const word = dir > 0 ? 'up' : 'down';
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
      aria-label={`Hold to walk ${word}; a tap moves one step`}
      disabled={disabled}
      data-testid={`hold-${word}`}
      className={cx(
        'relative flex h-12 touch-none select-none flex-col items-center justify-center gap-1 rounded-control border-2 border-holo bg-holo-soft font-display text-holo active:bg-holo active:text-on-holo disabled:opacity-35 @min-[1100px]/shell:h-20',
        className,
      )}
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
        Hold <span className="text-lg leading-none @min-[1100px]/shell:text-2xl">{dir > 0 ? '▲' : '▼'}</span>
      </span>
      <span className="text-[11px] font-medium leading-none @min-[1100px]/shell:text-base">to walk {word}</span>
      {mark && <Mark note={N.G2} part={word} at="tl" />}
    </button>
  );
}

// --- G-1 · at a house's line you choose how many ----------------------------------------------------------

export interface LineAsk {
  side: 'buyer' | 'seller';
  /** 'store' or 'ship'. */
  house: string;
  good: Good;
  amount: number;
  /** Buying: what you need. Selling: your spare. */
  aim: number;
  max: number;
  /** The total for `amount` units, before any tax. */
  total: number;
  /** What you hold and need of the good: at the line the question carries them, in place of the good's card. */
  have: number;
  need: number;
}

const unitsOf = (n: number, good: Good) => `${n} ${GOOD_NAME[good]}`;

/** Under the amount: how it stands against what you need, or your spare. */
function aimWords(a: LineAsk): string {
  if (a.side === 'buyer') {
    if (a.amount === a.aim) return 'what you need';
    return a.amount > a.aim ? `${a.amount - a.aim} more than you need` : `${a.aim - a.amount} short of what you need`;
  }
  if (a.aim <= 0) return 'you need all you have';
  if (a.amount === a.aim) return a.aim === 1 ? 'your spare one' : 'your spare';
  return a.amount > a.aim ? `${a.amount - a.aim} more than your spare` : `you keep ${a.aim - a.amount} spare`;
}

/**
 * The question at the line, in the rail; the Buy or Sell button is in the footer, in thumb reach. It carries what you
 * have and need, so the good's card steps aside for it and − and + get full 44 px targets on a phone.
 */
export function LineQuestion({ ask, onAmount }: { ask: LineAsk; onAmount: (n: number) => void }) {
  const step = (d: -1 | 1) => onAmount(Math.min(ask.max, Math.max(1, ask.amount + d)));
  const stepper = 'grid size-11 place-items-center rounded-control border border-holo-line bg-panel font-mono text-xl font-bold text-holo hover:border-holo disabled:opacity-35 @min-[1100px]/shell:size-14 @min-[1100px]/shell:text-3xl';
  const stand = ask.side === 'buyer' ? `you have ${ask.have} of ${ask.need}` : ask.need > 0 ? `you have ${ask.have}, you need ${ask.need}` : `you have ${ask.have}, you need none`;
  return (
    <section className="relative flex flex-col gap-1 rounded-control border-2 border-holo bg-holo-soft px-2.5 py-1.5 @min-[1100px]/shell:gap-2 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3" aria-label={`${ask.side === 'buyer' ? 'Buy' : 'Sell'} how many?`} data-testid="line-question">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-display text-sm font-semibold leading-tight @min-[1100px]/shell:gap-2.5 @min-[1100px]/shell:text-xl">
          <GoodIcon good={ask.good} size={16} />
          {ask.side === 'buyer' ? 'Buy how many?' : `Sell how many to ${ask.house === 'ship' ? 'the ship' : 'the store'}?`}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 @min-[1100px]/shell:gap-2.5">
          <button type="button" className={stepper} onClick={() => step(-1)} disabled={ask.amount <= 1} aria-label="One less" data-testid="amount-less">
            −
          </button>
          <span data-num className="w-6 text-center font-mono text-xl font-bold @min-[1100px]/shell:w-9 @min-[1100px]/shell:text-3xl" data-testid="amount">
            {ask.amount}
          </span>
          <button type="button" className={stepper} onClick={() => step(1)} disabled={ask.amount >= ask.max} aria-label="One more" data-testid="amount-more">
            +
          </button>
        </span>
      </div>
      <span className="text-[11px] leading-snug text-ink-2 @min-[1100px]/shell:text-base" data-testid="amount-aim">
        <strong className="font-semibold text-ink">{ask.amount}</strong> is {aimWords(ask)}: {stand}. Nothing trades until you tap {ask.side === 'buyer' ? 'Buy' : 'Sell'}.
      </span>
      <Mark note={N.G1} part="question" at="tl" />
    </section>
  );
}

/** Selling below your spare asks first (G-1): "This sells Water you need next month". */
export function SellConfirm({ ask, keep, need, onYes, onNo }: { ask: LineAsk; keep: number; need: number; onYes: () => void; onNo: () => void }) {
  return (
    <section className="relative flex flex-col gap-1.5 rounded-control border-2 border-warn bg-warn/10 px-2.5 py-1.5 @min-[1100px]/shell:gap-2.5 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3" role="alertdialog" aria-labelledby="sell-confirm-title" data-testid="sell-confirm">
      <span id="sell-confirm-title" className="font-display text-sm font-semibold leading-tight text-warn @min-[1100px]/shell:text-xl">
        This sells {GOOD_NAME[ask.good]} you need next month
      </span>
      <span className="text-[11px] leading-snug text-ink-2 @min-[1100px]/shell:text-base">
        You’d keep {keep} of the {need} you need.
      </span>
      <span className="grid grid-cols-2 gap-1.5 @min-[1100px]/shell:gap-2.5">
        <button type="button" onClick={onYes} className="h-11 rounded-control border border-warn px-1 font-display text-sm font-semibold text-warn hover:bg-warn/10 @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" data-testid="sell-anyway">
          Sell {ask.amount} anyway
        </button>
        <Button size="md" className="px-1 @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={onNo} data-testid="sell-spare">
          {ask.aim > 0 ? `Sell just ${ask.aim}` : 'Keep them'}
        </Button>
      </span>
      <Mark note={N.G1} part="confirm" at="tl" />
    </section>
  );
}

/** The footer's action at the line: "Buy 2 for 60 cr". */
export function LineAction({ ask, onGo }: { ask: LineAsk; onGo: () => void }) {
  return (
    <Button size="lg" className="relative h-12! w-full whitespace-nowrap px-2 text-base! @min-[1100px]/shell:h-20! @min-[1100px]/shell:text-xl!" onClick={onGo} data-testid="line-go">
      {ask.side === 'buyer' ? 'Buy' : 'Sell'} {ask.amount} for {fmt(ask.total)} cr
      <Mark note={N.G1} part="go" at="tl" />
    </Button>
  );
}

// --- G-5 · the receipt and the month's total -----------------------------------------------------------------

export interface Receipt {
  good: Good;
  kind: 'bought' | 'sold' | 'none';
  units: number;
  /** Before tax. */
  gross: number;
  tax: number;
  house: string;
  /** Per-unit prices, for "2 × 30 cr". */
  prices: number[];
  have: number;
  need: number;
  next: Good;
  /** The sales tax on a sale, 0.1 for 10%. */
  rate: number;
}

const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(-n)}` : '±0');

/** Under the money in the header: the month's running total from the auction. */
export function Tally({ total, mark = false }: { total: number; mark?: boolean }) {
  return (
    <span className="relative flex items-baseline gap-1 text-[10px] leading-tight text-ink-2 @min-[1100px]/shell:text-sm" data-testid="tally" aria-label={`This month's auction so far: ${signed(total)} cr`}>
      this month
      <strong data-num className={cx('font-mono font-bold', total < 0 ? 'text-ink' : total > 0 ? 'text-ok' : 'text-ink-3')}>
        {signed(total)} cr
      </strong>
      {mark && <Mark note={N.G5} part="tally" at="left" />}
    </span>
  );
}

/** When a good closes: what you did with it, the tax spelled out on a sale, and where you now stand. */
export function ReceiptCard({ r, mark = true }: { r: Receipt; mark?: boolean }) {
  const net = r.gross - r.tax;
  const each = r.prices.every((p) => p === r.prices[0]) ? `${r.units} × ${r.prices[0]} cr` : r.prices.map((p) => `${p}`).join(' + ') + ' cr';
  const ok = r.have >= r.need;
  return (
    <section className="relative flex w-[min(100%,320px)] flex-col gap-1.5 rounded-sheet border-2 border-holo bg-panel p-3 shadow-glow @min-[1100px]/shell:w-[460px] @min-[1100px]/shell:gap-3 @min-[1100px]/shell:p-6" aria-live="polite" data-testid="receipt">
      <span className="label-caps flex items-center gap-1.5 text-[10px]! @min-[1100px]/shell:text-sm!">
        <GoodTag good={r.good} name className="normal-case" /> · closed
      </span>
      <h2 className="font-display text-xl font-semibold leading-tight @min-[1100px]/shell:text-4xl" data-testid="receipt-title">
        {r.kind === 'none' ? `${GOOD_NAME[r.good]}: you didn’t trade` : `${GOOD_NAME[r.good]}: you ${r.kind} ${r.units} for ${fmt(r.kind === 'sold' ? net : r.gross)} cr`}
      </h2>
      {r.kind !== 'none' && (
        <span data-num className="font-mono text-xs text-ink-2 @min-[1100px]/shell:text-lg" data-testid="receipt-each">
          {each} {r.kind === 'bought' ? 'from' : 'to'} {r.house === 'ship' ? 'the ship' : 'the store'}
        </span>
      )}
      {r.kind === 'sold' && (
        <span className="rounded-control border border-holo-line px-2 py-1 text-sm @min-[1100px]/shell:px-3 @min-[1100px]/shell:py-2 @min-[1100px]/shell:text-xl" data-testid="receipt-tax">
          <strong data-num className="font-mono">{fmt(r.gross)} cr</strong>, less {Math.round(r.rate * 100)}% sales tax: <strong data-num className="font-mono">{fmt(net)}</strong>
          <span className="block text-[11px] text-ink-2 @min-[1100px]/shell:text-base">The tax goes to the colony fund.</span>
        </span>
      )}
      <span className={cx('text-xs @min-[1100px]/shell:text-lg', ok ? 'text-ok' : 'text-alert')} data-testid="receipt-stand">
        You have {unitsOf(r.have, r.good)}{r.need > 0 ? `, you need ${r.need}` : ''}
        {r.need > 0 ? (ok ? ' ✓' : `: short ${r.need - r.have}`) : ''}
      </span>
      <span className="border-t border-holo-faint pt-1.5 text-xs text-ink-2 @min-[1100px]/shell:pt-3 @min-[1100px]/shell:text-lg">Next: {GOOD_NAME[r.next]}, buy or sell?</span>
      {mark && <Mark note={N.G5} part="receipt" at="tl" />}
    </section>
  );
}

// --- G-6 · the ship ------------------------------------------------------------------------------------------

/** On every status screen while the ship is in port: what it wants, and when that good comes up. */
/** The ship's other wanted goods, in a sentence: one with its count, several by name. */
const alsoWords = (also: readonly { good: Good; wants: number }[]) =>
  also.length === 0
    ? ''
    : also.length === 1
      ? ` It also wants ${also[0]!.wants} ${GOOD_NAME[also[0]!.good]}.`
      : ` It also wants ${also.slice(0, -1).map((a) => GOOD_NAME[a.good]).join(', ')} and ${GOOD_NAME[also[also.length - 1]!.good]}.`;

/**
 * One panel however many goods the ship wants: the first it wants from this good on, and the rest in one sentence, so
 * the store's box and the board keep their room (WS6 ruling on #182, 2026-10-29).
 */
export function ShipWants({ good, wants, pays, have, after, also = [], tv = false }: { good: Good; wants: number; pays: number; have: number; /** The good before it in the auction's order. */ after: Good; /** The other goods the ship wants this month, in the auction's order. */ also?: readonly { good: Good; wants: number }[]; tv?: boolean }) {
  return (
    <p
      className={cx(
        'relative flex flex-wrap items-baseline gap-x-1.5 rounded-panel border border-warn/60 bg-panel',
        tv ? 'px-5 py-3 text-2xl' : 'px-2.5 py-1.5 text-xs leading-snug @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3 @min-[1100px]/shell:text-lg',
      )}
      data-testid="ship-wants"
    >
      <strong className="font-semibold text-warn">
        The ship wants {wants} {GOOD_NAME[good]} this month.
      </strong>
      <span className="text-ink-2">
        {GOOD_NAME[good]} comes up after {GOOD_NAME[after]}: the ship pays {pays} cr for the first.{tv ? '' : ` You have ${have}.`}
        {alsoWords(also)}
      </span>
      <Mark note={N.G6} part={tv ? 'tv-status' : 'status'} at={tv ? 'tr-in' : 'tr'} />
    </p>
  );
}

/**
 * DS-GAP: @mule/ui's WalkBoard names a house line by a code in its right gutter ("SHIP / PAYS 120"); G-6 wants it in
 * words on the line. Proposed for WalkBoard (WS4's file): an optional caption per price line. Drawn here as an
 * overlay at WalkBoard's own geometry (the axis is w-9 / w-16, the price area inset top-6 bottom-14 / top-12 bottom-23,
 * the label gutter 56 / 104 px, inside a 1 px border), so the real board stays untouched underneath.
 */
export function ShipCaption({ good, price, lo, hi, tv = false }: { good: Good; price: number; lo: number; hi: number; tv?: boolean }) {
  const pct = Math.min(100, Math.max(0, ((hi - price) / Math.max(1, hi - lo)) * 100));
  return (
    <div
      aria-hidden
      className={cx(
        'pointer-events-none absolute right-px',
        tv ? 'bottom-[calc(var(--spacing)*23+1px)] left-[calc(var(--spacing)*16+1px)] top-[calc(var(--spacing)*12+1px)]' : 'bottom-[calc(var(--spacing)*14+1px)] left-[calc(var(--spacing)*9+1px)] top-[calc(var(--spacing)*6+1px)]',
      )}
      data-testid="ship-caption-layer"
    >
      <span
        className={cx(
          // Just under the line, against the gutter: sellers walk down from above, so the room under it is the clear side.
          'absolute whitespace-nowrap rounded-chip border border-warn/70 bg-void/90 font-display font-semibold text-warn',
          tv ? 'right-[calc(104px+0.5rem)] mt-1.5 px-2.5 py-0.5 text-xl' : 'right-[calc(56px+0.25rem)] mt-1 px-1.5 text-[11px] @min-[1100px]/shell:text-base',
        )}
        style={{ top: `${pct}%` }}
        data-testid="ship-caption"
      >
        The ship buys {GOOD_NAME[good]} at {price}
        <Mark note={N.G6} part={tv ? 'tv-board' : 'board'} at="bl" />
      </span>
    </div>
  );
}

// --- G-7 · the side-pick waits for everyone -------------------------------------------------------------------

/** Where the clock was: how many have picked a side. The same chip as planning's ready count. */
export function PickedCount({ picked, of, tv = false, mark = true }: { picked: number; of: number; tv?: boolean; mark?: boolean }) {
  return (
    <span
      className={cx(
        'relative flex shrink-0 items-center gap-1.5 rounded-chip border border-holo-line bg-holo-soft font-mono font-bold text-holo',
        tv ? 'h-14 px-5 text-3xl' : 'h-8 px-2.5 text-sm @min-[1100px]/shell:h-11 @min-[1100px]/shell:px-4 @min-[1100px]/shell:text-2xl',
      )}
      data-testid="picked-count"
    >
      {picked} / {of} PICKED
      {mark && <Mark note={N.G7} part={tv ? 'tv-count' : 'count'} at="tl" />}
    </span>
  );
}

export interface PickSeat {
  id: string;
  name: string;
  slot: Slot;
  away: boolean;
}

/** "Waiting for Kai to pick", with each name's creature and an AWAY mark for a dropped phone. */
export function WaitingToPick({ seats, tv = false }: { seats: PickSeat[]; tv?: boolean }) {
  const names = seats.map((s) => s.name);
  return (
    <span className={cx('flex flex-wrap items-center gap-x-1.5 gap-y-1', tv ? 'text-3xl' : 'text-sm @min-[1100px]/shell:text-lg')} data-testid="waiting-to-pick" aria-label={`Waiting for ${names.join(' and ')} to pick`}>
      <span className="text-ink-2">Waiting for</span>
      {seats.map((s) => (
        <span key={s.id} className="flex items-center gap-1 font-semibold" data-testid={`waiting-${s.id}`}>
          <PlayerMark slot={s.slot} size={tv ? 30 : 14} glow={!s.away} />
          {s.name}
          {s.away && <span className={cx('rounded-chip border border-warn/60 font-mono font-bold text-warn', tv ? 'px-2 text-lg' : 'px-1 text-[10px] @min-[1100px]/shell:text-xs')}>AWAY</span>}
        </span>
      ))}
      <span className="text-ink-2">to pick</span>
    </span>
  );
}

/** "Kai sits Food out: 3 of 3, just enough." The side the engine's defaultSide gives an absent player. */
export function defaultSideWords(name: string, good: Good, now: number, need: number): string {
  const g = GOOD_NAME[good];
  if (now < need) return `${name} buys ${g}: ${now} of ${need}, short ${need - now}.`;
  if (now > need) return `${name} sells ${g}: ${now - need} spare.`;
  return `${name} sits ${g} out: ${now} of ${need}, just enough.`;
}
