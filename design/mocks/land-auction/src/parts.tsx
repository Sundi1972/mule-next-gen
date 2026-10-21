import { GOOD_NAME, MuleIcon, PlayerMark, TERRAIN_NAME, cx, type BoardWalker, type Slot } from '@mule/ui';
import { plotName, slotOf, TERRAIN_ODDS, tileAt } from '../../../../apps/web/src/game/derive';
import { GroundCard } from '../../../../apps/web/src/phone/ground';
import type { LandAuctionView, ListingView, LotsView } from './proto';

/*
 * Lot pieces shared by the phone and the big screen.
 * GRAFT TARGET: apps/web/src/components/AuctionParts.tsx (WS3), next to the goods auction's parts.
 */

export function sellerName(view: LotsView, id: string): string {
  return id === 'colony' ? 'The colony' : (view.players.find((p) => p.id === id)?.name ?? id);
}

/** What happens if nobody bids the minimum. A colony plot nobody buys stays free land. */
export function unsoldText(lot: ListingView): string {
  if (lot.seller === 'colony') return 'Stays free land';
  return lot.unsold === 'store' ? `Store pays ${lot.storePays}` : 'Seller keeps it';
}

/** What stands on the lot: "Energy MULE", "no MULE", or for a MULE lot the MULE itself. */
export function lotWhat(view: LotsView, lot: ListingView): string {
  if (lot.item.kind === 'mule') return `${lot.item.outfit === 'greenBelt' ? 'Green belt' : GOOD_NAME[lot.item.outfit]} MULE`;
  const t = tileAt(view, lot.item.x, lot.item.y);
  return t?.outfit ? `with its ${t.outfit === 'greenBelt' ? 'green belt' : `${GOOD_NAME[t.outfit]} MULE`}` : 'no MULE on it';
}

/** The lot's buyers as the walk board draws them. The seller isn't on the board. */
export function lotWalkers(view: LotsView, lot: LandAuctionView): BoardWalker[] {
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
export function LotCard({ view, lot, compact = false }: { view: LotsView; lot: ListingView; compact?: boolean }) {
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
export function leaderLine(view: LotsView, lot: LandAuctionView, meId: string): { text: string; tone: 'lead' | 'behind' | 'none' } {
  const mine = lot.walkers.find((w) => w.id === meId);
  if (lot.lot.seller === meId) return { text: lot.leader ? `${sellerName(view, lot.leader.id)} bids ${lot.leader.bid}. Your plot sells at the bell.` : `No bid at your minimum yet.`, tone: 'none' };
  if (!mine || mine.side === 'pass') return { text: mine && 'aside' in mine && mine.aside === 'mule' ? 'You already lead a MULE: install it first.' : `You can't pay the minimum of ${lot.lot.minimum}.`, tone: 'none' };
  if (!lot.leader) return { text: `Walk up past ${lot.lot.minimum} to bid.`, tone: 'behind' };
  if (lot.leader.id === meId) return { text: `You lead at ${lot.leader.bid}. It's yours at the bell.`, tone: 'lead' };
  return { text: `${sellerName(view, lot.leader.id)} leads at ${lot.leader.bid}. Walk up to outbid.`, tone: 'behind' };
}

export function LeaderBox({ view, lot, meId, className }: { view: LotsView; lot: LandAuctionView; meId: string; className?: string }) {
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

/**
 * A big button you hold: walking while pressed, standing when let go.
 * GRAFT: the same as Hold in apps/web/src/phone/Auction.tsx; export that one rather than copying it.
 */
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
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerLeave={() => onHold(false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span aria-hidden className="text-2xl leading-none">
        {glyph}
      </span>
      {label}
    </button>
  );
}
