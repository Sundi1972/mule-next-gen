import type { AuctionView, MuleView } from '@mule/protocol';
import { Creature, cx, GOOD_NAME, SLOT_COLOR, useSeatSpecies, type BoardWalker, type Slot } from '@mule/ui';
import { slotOf } from '../game/derive';

/** The auction's walkers as the board draws them, in seat order. */
export function boardWalkers(view: MuleView, auction: AuctionView): BoardWalker[] {
  return auction.walkers.map((w) => ({
    id: w.id,
    name: view.players.find((p) => p.id === w.id)?.name ?? w.id,
    slot: slotOf(view, w.id) ?? 0,
    side: w.side,
    price: w.price,
    at: w.at,
    done: w.done,
  }));
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
