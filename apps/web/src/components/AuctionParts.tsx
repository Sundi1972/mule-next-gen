import { COLONY_SELLER, SHIP_ID, STORE_ID, type AuctionRole, type AuctionSide, type Good } from '@mule/engine';
import type { AuctionView, DealView, LandAuctionView, ListingView, MuleView } from '@mule/protocol';
import { Creature, cx, GOOD_NAME, MuleIcon, PlayerMark, SLOT_COLOR, TERRAIN_NAME, useSeatSpecies, type BoardWalker, type Slot } from '@mule/ui';
import type { ReactNode } from 'react';
import { plotName, slotOf, TERRAIN_ODDS, tileAt } from '../game/derive';
import { GroundCard } from '../phone/ground';
import { SpecialLine } from './SpecialLine';

/** The auction's walkers as the board draws them, in seat order, with their units and the surplus over this month's need. */
export function boardWalkers(view: MuleView, auction: AuctionView): BoardWalker[] {
  return auction.walkers.map((w) => {
    const need = auction.status.find((r) => r.id === w.id)?.need;
    return {
      id: w.id,
      name: view.players.find((p) => p.id === w.id)?.name ?? w.id,
      slot: slotOf(view, w.id) ?? 0,
      side: w.side,
      price: w.price,
      at: w.at,
      done: w.done,
      units: w.units,
      ...(need === undefined ? {} : { surplus: w.units - need }),
    };
  });
}

/** Who an id is, in a sentence: "you", "the store", "the ship", or the player's name. */
export function who(view: MuleView, id: string, meId?: string): string {
  if (id === meId) return 'you';
  if (id === STORE_ID) return 'the store';
  if (id === SHIP_ID) return 'the ship';
  return view.players.find((p) => p.id === id)?.name ?? id;
}

interface Offer {
  id: string;
  price: number;
}

/** Every price a walker on `side` could meet, the store and the ship included, best first: the lowest ask, the highest bid. */
function pricesOn(auction: AuctionView, side: 'seller' | 'buyer', without?: string): Offer[] {
  if (side === 'seller') {
    const list: Offer[] = auction.walkers.filter((w) => w.id !== without && w.side === 'seller' && w.units > 0).map((w) => ({ id: w.id, price: w.price }));
    if (auction.storeSells !== null && auction.storeForSale > 0) list.push({ id: STORE_ID, price: auction.storeSells });
    return list.sort((a, b) => a.price - b.price);
  }
  const list: Offer[] = auction.walkers.filter((w) => w.id !== without && w.side === 'buyer').map((w) => ({ id: w.id, price: w.price }));
  // The ship before the store: on a tie the sort keeps it first, and the engine sells to the ship.
  if (auction.shipPays !== null) list.push({ id: SHIP_ID, price: auction.shipPays });
  if (auction.storeBuys !== null) list.push({ id: STORE_ID, price: auction.storeBuys });
  return list.sort((a, b) => b.price - a.price);
}

/** The TV's readout: who holds the lowest ask and the highest bid, the store and the ship counted, and the gap. */
export function TvReadout({ view, auction }: { view: MuleView; auction: AuctionView }) {
  const ask = pricesOn(auction, 'seller')[0];
  const bid = pricesOn(auction, 'buyer')[0];
  const trading = auction.deals.length > 0;
  return (
    <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-1 font-mono text-lg" data-testid="tv-readout">
      <dt className="text-rise">LOWEST ASK</dt>
      <dd data-num className="font-bold text-rise">{ask ? `${ask.price} · ${who(view, ask.id)}` : '—'}</dd>
      <dt className="text-fall">HIGHEST BID</dt>
      <dd data-num className={cx('font-bold', bid?.id === SHIP_ID ? 'text-warn' : 'text-fall')}>{bid ? `${bid.price} · ${who(view, bid.id)}` : '—'}</dd>
      <dt className="text-ink-3">GAP</dt>
      <dd data-num className="font-bold text-ink">{trading ? 'MET: TRADING' : ask && bid ? (ask.price > bid.price ? `${ask.price - bid.price} apart` : 'they meet') : '—'}</dd>
    </dl>
  );
}

const REASON: Record<AuctionView['skipped'][number]['reason'], string> = {
  'nobody has any': 'nobody has any',
  'nobody buys': 'nobody buys',
  'nobody trading': 'nobody trading',
};

/** Goods skipped on the way here, in one line: "Skipped: Crystite, Medicine: nobody trading". */
export function skippedLine(auction: AuctionView): string | null {
  if (auction.skipped.length === 0) return null;
  const reasons = [...new Set(auction.skipped.map((s) => REASON[s.reason]))];
  return `Skipped: ${auction.skipped.map((s) => GOOD_NAME[s.good]).join(', ')}: ${reasons.join(', ')}`;
}

/** A running deal as the TV lists it, under the identity it keeps while it runs. */
export interface DealRow {
  key: string;
  deal: DealView;
}

/** A deal's identity, as the engine keys it: a house's deal stays one deal as it serves whoever is next in line. */
export function dealKey(d: DealView): string {
  const house = (id: string) => id === STORE_ID || id === SHIP_ID;
  return house(d.buyer) ? `${d.buyer}<` : house(d.seller) ? `${d.seller}>` : `${d.buyer}<${d.seller}`;
}

/**
 * The deals now running, newest first: those already in `rows` keep their order (with the latest units),
 * deals that just started go on top in the server's order, and deals that ended drop out.
 */
export function newestFirst(rows: readonly DealRow[], deals: readonly DealView[]): DealRow[] {
  const running = new Map(deals.map((d) => [dealKey(d), d]));
  const kept = rows.filter((r) => running.has(r.key)).map((r) => ({ key: r.key, deal: running.get(r.key)! }));
  const known = new Set(kept.map((r) => r.key));
  const started = [...running].filter(([key]) => !known.has(key)).map(([key, deal]) => ({ key, deal }));
  return [...started, ...kept];
}

/** Who is trading with whom, in words. */
export function dealLine(view: MuleView, d: AuctionView['deals'][number], meId?: string): string {
  const name = (id: string) => (id === meId ? 'You' : id === 'store' ? 'the store' : id === 'ship' ? 'the ship' : (view.players.find((p) => p.id === id)?.name ?? id));
  const seller = name(d.seller);
  return `${seller[0]!.toUpperCase()}${seller.slice(1)} → ${name(d.buyer)} · ${d.units} unit${d.units === 1 ? '' : 's'} @ ${d.price}`;
}

/** A side as the status screen names it, on the phone and the TV. */
export const SIDE_WORD: Record<AuctionSide, string> = { buyer: 'Buy', seller: 'Sell', pass: 'Pass' };

/** Two buttons and no Pass: a second tap on your side is how you sit a good out. */
export function toggleSide(current: AuctionSide | undefined, tapped: AuctionRole): AuctionSide {
  return current === tapped ? 'pass' : tapped;
}

/**
 * On the TV, beside the status table: what the store charges and pays for the good up now, and how many it will sell.
 * Only the TV draws it (a phone says it from your side, MyStoreLine); `tv` is accepted for the audit mock, which passes it.
 */
export function StoreBox({ auction }: { auction: AuctionView; tv?: true }) {
  const stock = auction.storeForSale;
  return (
    <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-panel border border-holo-line bg-holo-line font-mono text-2xl" data-testid="status-store">
      {(
        [
          ['STORE SELLS', auction.storeSells ?? 'out', 'text-rise'],
          ['STORE BUYS', auction.storeBuys ?? '—', 'text-fall'],
          ['IN STOCK', stock, stock === 0 ? 'text-alert' : 'text-ink'],
        ] as const
      ).map(([label, value, tone]) => (
        <div key={label} className="flex flex-col bg-panel p-3">
          <dt className="label-caps text-sm!">{label}</dt>
          <dd data-num className={cx('font-bold', tone)}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** "You can buy from the store at 30 · sell to it at 24", or what is left of it when the store doesn't trade a side. */
export function storeWords(a: Pick<AuctionView, 'storeSells' | 'storeBuys' | 'storeForSale'>): string {
  const sells = a.storeSells !== null && a.storeForSale > 0;
  const buy = sells ? `You can buy from the store at ${a.storeSells}` : 'The store has none to sell';
  const sell = a.storeBuys !== null ? `${sells ? 'sell to it' : 'you can sell to it'} at ${a.storeBuys}` : 'it isn’t buying';
  return `${buy} · ${sell}`;
}

/** On the phone's status screen: the store's prices from your side. The TV keeps the store's side in StoreBox: it has no "you". */
export function MyStoreLine({ auction }: { auction: AuctionView }) {
  return (
    <p className="rounded-panel border border-holo-line bg-panel px-2.5 py-1.5 text-sm @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3 @min-[1100px]/shell:text-lg" data-testid="my-store">
      {storeWords(auction)}
      {auction.storeForSale > 0 && <span className="text-ink-2"> · it has {auction.storeForSale} for sale</span>}
    </p>
  );
}

/** Over the board: the store's prices from your side, then what the line colours mean and what you do with them. */
export function BoardKey({ auction, side }: { auction: AuctionView; side: 'buyer' | 'seller' }) {
  const ship = auction.shipPays !== null;
  const swatch = (tone: string) => <span aria-hidden className={cx('inline-block w-4 shrink-0 border-t-[3px] border-dashed @min-[1100px]/shell:w-6', tone)} />;
  return (
    <div className="mb-1.5 flex shrink-0 flex-col gap-0.5 @min-[1100px]/shell:mb-3 @min-[1100px]/shell:gap-1.5" data-testid="board-key">
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
    </div>
  );
}

/** The hint under your numbers: the price to walk to and who stands there, and how to walk. */
export function walkHint(view: MuleView, auction: AuctionView, meId: string, have: number): { line: string; how: string | null } {
  const side = auction.walkers.find((w) => w.id === meId)?.side ?? 'pass';
  const good = GOOD_NAME[auction.good];
  if (side === 'pass') return { line: `You sit ${good} out.`, how: null };
  if (side === 'seller' && have === 0) return { line: 'You’ve sold all you have.', how: null };
  const how = side === 'buyer' ? 'Hold ▲ to walk up.' : 'Hold ▼ to walk down.';
  const list = pricesOn(auction, side === 'buyer' ? 'seller' : 'buyer', meId);
  const best = list[0];
  if (!best) return { line: side === 'buyer' ? `Nobody is selling ${good} now.` : `Nobody is buying ${good} now.`, how };
  const rest = list.slice(1);
  const name = (o: Offer) => who(view, o.id, meId);
  if (side === 'buyer') {
    if (best.id === STORE_ID) return { line: `Walk up to the store’s line at ${best.price}: ${rest.length === 0 ? 'it’s the only seller' : 'it sells cheapest'}.`, how };
    return { line: `Walk up to ${name(best)}’s ask at ${best.price}${rest[0] ? `: ${name(rest[0])} asks ${rest[0].price}` : ''}.`, how };
  }
  if (best.id === SHIP_ID) {
    const store = list.find((o) => o.id === STORE_ID);
    return { line: `Walk down to the ship’s line at ${best.price}: it pays the most.${store ? ` The store pays ${store.price}.` : ''}`, how };
  }
  if (best.id === STORE_ID && rest.length > 0) return { line: `Walk down: the store pays ${best.price}, ${rest.map((o) => `${name(o)} ${o.id === SHIP_ID ? 'pays' : 'bids'} ${o.price}`).join(', ')}.`, how };
  if (best.id === STORE_ID) return { line: `Walk down to the store’s line at ${best.price}: it’s the only buyer.`, how };
  return { line: `Walk down to ${name(best)}’s bid at ${best.price}.`, how };
}

/** The hint's box: `lit` while your units change hands. */
export function Hint({ line, how, tone = 'quiet', testid = 'hint' }: { line: ReactNode; how?: string | null; tone?: 'quiet' | 'lit'; testid?: string }) {
  return (
    <div
      className={cx(
        'flex flex-col gap-0.5 rounded-control border px-2.5 py-1.5 text-xs leading-snug @min-[1100px]/shell:gap-1 @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3 @min-[1100px]/shell:text-base',
        tone === 'lit' ? 'border-holo bg-holo-soft text-ink' : 'border-holo-faint text-ink',
      )}
      data-testid={testid}
    >
      <span className="font-semibold" data-testid="hint-line">
        {line}
      </span>
      {how && (
        <span className="text-ink-2" data-testid="hint-how">
          {how}
        </span>
      )}
    </div>
  );
}

/** A good the export ship in port still wants, as the status screen says it. */
export interface ShipWant {
  good: Good;
  wants: number;
  /** What the ship pays for its first unit. */
  pays: number;
  /** The good that comes up just before it, or null for the good up now. */
  after: Good | null;
}

/**
 * What the ship in port still wants of the good up now and the goods yet to come, in the order they come up: the first
 * of them, and the rest. Null while it is only announced, or wants none of them. The good up now is priced from the
 * auction, the rest from the market.
 */
export function shipWants(
  view: Pick<MuleView, 'ship' | 'market'>,
  auction: Pick<AuctionView, 'good' | 'next' | 'shipPays'>,
): { first: ShipWant; also: { good: Good; wants: number }[] } | null {
  const wants = view.ship.inPort ? view.ship.wants : null;
  if (!wants) return null;
  const order = [auction.good, ...auction.next];
  const wanted = order.flatMap((good, i) => {
    const n = wants[good] ?? 0;
    const market = view.market.find((r) => r.good === good)?.shipPays ?? null;
    const pays = i === 0 ? (auction.shipPays ?? market) : market;
    return n > 0 ? [{ good, wants: n, pays, after: i === 0 ? null : order[i - 1]! }] : [];
  });
  // The headline needs a price; the rest are named only.
  const first = wanted.find((w): w is ShipWant => w.pays !== null);
  return first ? { first, also: wanted.filter((w) => w !== first).map(({ good, wants: n }) => ({ good, wants: n })) } : null;
}

/** The ship's other wanted goods in one sentence: one with its count, several by name. */
function alsoWords(also: readonly { good: Good; wants: number }[]): string {
  if (also.length === 0) return '';
  if (also.length === 1) return ` It also wants ${also[0]!.wants} ${GOOD_NAME[also[0]!.good]}.`;
  return ` It also wants ${also
    .slice(0, -1)
    .map((a) => GOOD_NAME[a.good])
    .join(', ')} and ${GOOD_NAME[also.at(-1)!.good]}.`;
}

/**
 * One panel however many goods the ship wants, so the store's box and the board keep their room: "The ship wants 24
 * Crystite this month", when that good comes up (or that it is up now), on a phone what you have of it, then the rest.
 */
export function ShipWants({ want, also = [], have, tv = false }: { want: ShipWant; also?: readonly { good: Good; wants: number }[]; have?: number; tv?: boolean }) {
  const name = GOOD_NAME[want.good];
  return (
    <p
      className={cx(
        'flex flex-wrap items-baseline gap-x-1.5 rounded-panel border border-warn/60 bg-panel',
        tv ? 'px-5 py-3 text-2xl' : 'px-2.5 py-1.5 text-xs leading-snug @min-[1100px]/shell:px-4 @min-[1100px]/shell:py-3 @min-[1100px]/shell:text-lg',
      )}
      data-testid="ship-wants"
    >
      <strong className="font-semibold text-warn">
        The ship wants {want.wants} {name} this month{want.after === null ? ':' : '.'}
      </strong>
      <span className="text-ink-2">
        {want.after === null ? 'it pays' : `${name} comes up after ${GOOD_NAME[want.after]}: the ship pays`} {want.pays} cr for the first.{have === undefined ? '' : ` You have ${have}.`}
        {alsoWords(also)}
      </span>
    </p>
  );
}

function Who({ slot, name, size }: { slot: Slot; name: string; size: number }) {
  const species = useSeatSpecies(slot);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Creature species={species} color={SLOT_COLOR[slot]} size={size} />
      <span className="truncate font-display font-semibold">{name}</span>
    </span>
  );
}

/**
 * The original's status screen before each good: for every player, what
 * they had before production, used, made and hold now, what they need for
 * next month, what goes bad, and the spare or shortage that leaves.
 */
export function StatusTable({ view, auction, meId, tv = false }: { view: MuleView; auction: AuctionView; meId?: string; tv?: boolean }) {
  // On a phone the whole table fits the stage of a small landscape phone (667×375), an AI's long name included.
  const cell = tv ? 'px-3 py-2 text-2xl' : 'px-1 py-1 text-sm';
  const head = cx('label-caps text-right font-medium', tv ? 'px-3 pb-2 text-sm!' : 'px-1 pb-1 text-[10px]!');
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
          <th className={head} data-testid="head-spare">
            Spare
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
              <td className={cx(cell, 'text-left')} style={{ maxWidth: tv ? 300 : 110 }}>
                <Who slot={slot} name={name} size={tv ? 34 : 18} />
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

/* The land auction's lot pieces: the phone uses all of them, the big screen only sellerName, lotWhat and lotWalkers. */

export function sellerName(view: MuleView, id: string): string {
  return id === COLONY_SELLER ? 'The colony' : (view.players.find((p) => p.id === id)?.name ?? id);
}

/** What happens if nobody bids the minimum. A colony plot nobody buys stays free land. */
export function unsoldText(lot: ListingView): string {
  if (lot.seller === COLONY_SELLER) return 'Stays free land';
  return lot.unsold === 'store' ? `Store pays ${lot.storePays}` : 'Seller keeps it';
}

/** What stands on the lot: "Energy MULE", "no MULE", or for a MULE lot the MULE itself. */
export function lotWhat(view: MuleView, lot: ListingView): string {
  if (lot.item.kind === 'mule') return `${lot.item.outfit === 'greenBelt' ? 'Green belt' : GOOD_NAME[lot.item.outfit]} MULE`;
  const t = tileAt(view, lot.item.x, lot.item.y);
  return t?.outfit ? `with its ${t.outfit === 'greenBelt' ? 'green belt' : `${GOOD_NAME[t.outfit]} MULE`}` : 'no MULE on it';
}

/** The lot's buyers as the walk board draws them. The seller isn't on the board. */
export function lotWalkers(view: MuleView, lot: LandAuctionView): BoardWalker[] {
  return lot.walkers.map((w) => ({
    id: w.id,
    name: view.players.find((p) => p.id === w.id)?.name ?? w.id,
    slot: (slotOf(view, w.id) ?? 0) as Slot,
    side: w.side,
    price: w.price,
    at: w.at,
    done: w.done,
  }));
}

/** The lot up for sale: what it is, whose, the minimum, and what happens if nobody bids it. */
export function LotCard({ view, lot, compact = false }: { view: MuleView; lot: ListingView; compact?: boolean }) {
  const t = tileAt(view, lot.item.x, lot.item.y);
  const seller = slotOf(view, lot.seller);
  return (
    <div className="flex flex-col gap-1 rounded-control border border-holo-faint bg-panel px-2.5 py-1.5" data-testid="lot-card">
      <span className="label-caps flex items-center justify-between gap-2">
        {lot.item.kind === 'mule' ? 'MULE for sale' : 'Plot for sale'}
        <span className="flex items-center gap-1 normal-case" data-testid="lot-seller">
          {seller !== null && <PlayerMark slot={seller as Slot} size={10} />}
          {sellerName(view, lot.seller)}
        </span>
      </span>
      <span className="flex items-center gap-1.5 font-display text-lg font-semibold leading-tight" data-testid="lot-name">
        {lot.item.kind === 'mule' && <MuleIcon size={20} className="text-holo" />}
        {lot.item.kind === 'mule' ? lotWhat(view, lot) : t ? TERRAIN_NAME[t.terrain] : ''}
        <span className="font-mono text-sm text-ink-3">{plotName(lot.item.x, lot.item.y)}</span>
      </span>
      {!compact && lot.item.kind === 'plot' && <SpecialLine special={t?.special} />}
      {lot.item.kind === 'plot' && <span className="text-xs text-ink-2" data-testid="lot-what">{lotWhat(view, lot)}</span>}
      {!compact &&
        lot.item.kind === 'plot' &&
        t &&
        (t.ground ? (
          <GroundCard ground={t.ground} />
        ) : (
          <span className="text-xs text-ink-3" data-testid="terrain-hint">
            {TERRAIN_ODDS[t.terrain]}
          </span>
        ))}
      <div className="grid grid-cols-2 gap-2 border-t border-holo-faint pt-1 font-mono text-[10px] text-ink-3">
        <span className="flex flex-col" data-testid="lot-minimum">
          MINIMUM<strong data-num className="text-sm text-ink">{lot.minimum} cr</strong>
        </span>
        <span className="flex flex-col" data-testid="lot-unsold">
          IF UNSOLD
          <strong className="text-sm text-ink-2">{unsoldText(lot)}</strong>
        </span>
      </div>
    </div>
  );
}

/** Who wins if the bell rang now, said from this phone's point of view. */
export function leaderLine(view: MuleView, lot: LandAuctionView, meId: string): { text: string; tone: 'lead' | 'behind' | 'none' } {
  const mine = lot.walkers.find((w) => w.id === meId);
  const what = lot.lot.item.kind === 'mule' ? 'MULE' : 'plot';
  if (lot.lot.seller === meId) return { text: lot.leader ? `${sellerName(view, lot.leader.id)} bids ${lot.leader.bid}. Your ${what} sells at the bell.` : `No bid at your minimum yet.`, tone: 'none' };
  if (!mine || mine.side === 'pass') return { text: mine && 'aside' in mine && mine.aside === 'mule' ? 'You already lead a MULE: install it first.' : `You can't pay the minimum of ${lot.lot.minimum}.`, tone: 'none' };
  if (!lot.leader) return { text: `Walk up past ${lot.lot.minimum} to bid.`, tone: 'behind' };
  if (lot.leader.id === meId) return { text: `You lead at ${lot.leader.bid}. It's yours at the bell.`, tone: 'lead' };
  return { text: `${sellerName(view, lot.leader.id)} leads at ${lot.leader.bid}. Walk up to outbid.`, tone: 'behind' };
}

export function LeaderBox({ view, lot, meId, className }: { view: MuleView; lot: LandAuctionView; meId: string; className?: string }) {
  const line = leaderLine(view, lot, meId);
  return (
    <div
      className={cx(
        'rounded-control border px-2.5 py-1.5 text-xs leading-snug',
        line.tone === 'lead' ? 'border-ok bg-holo-soft text-ink' : line.tone === 'behind' ? 'border-holo bg-holo-soft text-ink' : 'border-holo-faint text-ink-2',
        className,
      )}
      data-testid="leader"
      data-tone={line.tone}
    >
      {line.text}
    </div>
  );
}
