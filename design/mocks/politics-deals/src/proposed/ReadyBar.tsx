import type { MuleView } from '@mule/protocol';
import { cx, PlayerMark } from '@mule/ui';
import { toSlot } from '../../../../../apps/web/src/game/derive';
import { viewerFirst, type Seat } from '../../../../../apps/web/src/phone/hub/ready';
import { RepChip } from './parts';

/*
 * GRAFT TARGET: apps/web/src/phone/hub/ReadyBar.tsx::WaitingFor (WS6), the ready bar's names on the phone and the TV's
 * waiting box. As today, with one change, marked CHANGE: each name carries its chip (`view` is new, for the reputation).
 * "you" carries none: your own number is in the hub's header line. The chip here is a label, not a button: the footer
 * is the Ready button's room, and a stray tap there must not open a sheet.
 */
export function WaitingFor({ view, seats, me, tv = false, lead = 'Waiting for' }: { view: Pick<MuleView, 'players'>; seats: readonly Seat[]; me: string | null; tv?: boolean; lead?: string }) {
  return (
    <span className={cx('flex flex-wrap items-center gap-x-2 gap-y-1', tv ? 'text-3xl' : 'text-sm @min-[1100px]/shell:text-lg')} data-testid="waiting-for">
      <span className="text-ink-2">{lead}</span>
      {viewerFirst(seats, me).map((s) => (
        <span key={s.id} className="flex items-center gap-1 font-semibold" data-testid={`waiting-${s.id}`}>
          <PlayerMark slot={toSlot(s.slot)} size={tv ? 30 : 14} glow={!s.away} />
          {s.id === me ? 'you' : s.name}
          {/* CHANGE */}
          {s.id !== me && <RepChip view={view} id={s.id} tv={tv} testid={`waiting-${s.id}-rep`} />}
          {s.away && <span className={cx('rounded-chip border border-warn/60 font-mono font-bold text-warn', tv ? 'px-2 text-lg' : 'px-1 text-[10px] @min-[1100px]/shell:text-xs')}>AWAY</span>}
        </span>
      ))}
    </span>
  );
}
