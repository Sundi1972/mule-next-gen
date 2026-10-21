import type { AuctionView, LandAuctionView, ListingView, MuleView } from '@mule/protocol';
import { bestPrices, Creature, cx, GOOD_NAME, MuleIcon, PlayerMark, SLOT_COLOR, TERRAIN_NAME, useSeatSpecies, type BoardWalker, type Slot } from '@mule/ui';
import { plotName, slotOf, TERRAIN_ODDS, tileAt } from '../game/derive';
import { GroundCard } from '../phone/ground';

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

/** Who holds each moving line, in words beside the board; the TV adds the gap between them. */
export function LineReadout({ walkers, trading, meId, tv = false }: { walkers: BoardWalker[]; trading: boolean; meId?: string; tv?: boolean }) {
  const { ask, bid } = bestPrices(walkers);
  const who = (w: BoardWalker) => (w.id === meId ? 'You' : w.name);
  const gap = ask && bid ? ask.price - bid.price : null;
  return (
    <dl className={cx('grid grid-cols-[auto_1fr] items-baseline gap-x-2 font-mono', tv ? 'gap-y-1 text-lg' : 'gap-y-0.5 text-[11px]')} data-testid="line-readout">
      <dt className="text-rise">LOWEST ASK</dt>
      <dd data-num className="font-bold text-rise">{ask ? `${ask.price} · ${who(ask)}` : '—'}</dd>
      <dt className="text-fall">HIGHEST BID</dt>
      <dd data-num className="font-bold text-fall">{bid ? `${bid.price} · ${who(bid)}` : '—'}</dd>
      {tv && (
        <>
          <dt className="text-ink-3">GAP</dt>
          <dd data-num className="font-bold text-ink">{trading ? 'MET: TRADING' : gap === null ? '—' : `${gap} apart`}</dd>
        </>
      )}
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

/** Who is trading with whom, in words. */
export function dealLine(view: MuleView, d: AuctionView['deals'][number], meId?: string): string {
  const name = (id: string) => (id === meId ? 'You' : id === 'store' ? 'the store' : id === 'ship' ? 'the ship' : (view.players.find((p) => p.id === id)?.name ?? id));
  const seller = name(d.seller);
  return `${seller[0]!.toUpperCase()}${seller.slice(1)} → ${name(d.buyer)} · ${d.units} unit${d.units === 1 ? '' : 's'} @ ${d.price}`;
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
 * next month, what would spoil, and the surplus or shortage that leaves.
 */
export function StatusTable({ view, auction, meId, tv = false }: { view: MuleView; auction: AuctionView; meId?: string; tv?: boolean }) {
  const cell = tv ? 'px-3 py-2 text-2xl' : 'px-1.5 py-1 text-sm';
  const head = cx('label-caps text-right font-medium', tv ? 'px-3 pb-2 text-sm!' : 'px-1.5 pb-1 text-[10px]!');
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
          <th className={head}>Spoils</th>
          <th className={head}>Surplus</th>
        </tr>
      </thead>
      <tbody data-num className="font-mono">
        {auction.status.map((r) => {
          const slot = slotOf(view, r.id) ?? 0;
          const name = r.id === meId ? 'You' : (view.players.find((p) => p.id === r.id)?.name ?? r.id);
          const surplus = r.now - r.need;
          return (
            <tr key={r.id} className={cx('border-t border-holo-faint', r.id === meId && 'bg-holo-soft')}>
              <td className={cx(cell, 'text-left')} style={{ maxWidth: tv ? 300 : 150 }}>
                <Who slot={slot} name={name} size={tv ? 34 : 18} />
              </td>
              <td className={cx(cell, 'text-right text-ink-2')}>{r.had}</td>
              <td className={cx(cell, 'text-right text-ink-2')}>{r.used ? `−${r.used}` : 0}</td>
              <td className={cx(cell, 'text-right text-ink-2')}>{r.made ? `+${r.made}` : 0}</td>
              <td className={cx(cell, 'text-right font-bold')}>{r.now}</td>
              <td className={cx(cell, 'text-right text-ink-2')}>{r.need}</td>
              <td className={cx(cell, 'text-right', r.spoils > 0 ? 'text-warn' : 'text-ink-3')}>{r.spoils}</td>
              <td className={cx(cell, 'text-right font-bold', surplus < 0 ? 'text-alert' : surplus > 0 ? 'text-ok' : 'text-ink-3')}>
                {surplus > 0 ? `+${surplus}` : surplus < 0 ? `${surplus} short` : '0'}
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
  return id === 'colony' ? 'The colony' : (view.players.find((p) => p.id === id)?.name ?? id);
}

/** What happens if nobody bids the minimum. A colony plot nobody buys stays free land. */
export function unsoldText(lot: ListingView): string {
  if (lot.seller === 'colony') return 'Stays free land';
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
      {lot.item.kind === 'plot' && <span className="text-xs text-ink-2" data-testid="lot-what">{lotWhat(view, lot)}</span>}
      {!compact && lot.item.kind === 'plot' && t && (t.ground ? <GroundCard ground={t.ground} /> : <span className="text-xs text-ink-3">{TERRAIN_ODDS[t.terrain]}</span>)}
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
