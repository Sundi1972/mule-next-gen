// Copied from apps/web/src/phone/hub/ReadyBar.tsx on origin/ws7-s3-phone-pr at 3bcfdd7c: WaitingFor only (with its `view`
// for the reputation chips), unchanged but for the imports. ReadyCount is trunk's, imported as it is.
import type { MuleView } from '@mule/protocol';
import { cx, PlayerMark } from '@mule/ui';
import { ClaudeCountdown } from '../../../../../../apps/web/src/components/ClaudeSeat';
import { toSlot } from '../../../../../../apps/web/src/game/derive';
import { viewerFirst, type Seat } from '../../../../../../apps/web/src/phone/hub/ready';
import { RepChip } from './RepChip';

/**
 * The names still planning, each with its creature, an away mark for a dropped phone, and off the TV a waited-for
 * Claude seat's countdown. Given `view`, each other name carries its reputation chip, a label: the footer is Ready's room.
 */
export function WaitingFor({ view, seats, me, tv = false, lead = 'Waiting for' }: { view?: Pick<MuleView, 'players'> | undefined; seats: readonly Seat[]; me: string | null; tv?: boolean; lead?: string }) {
  return (
    <span className={cx('flex flex-wrap items-center gap-x-2 gap-y-1', tv ? 'text-3xl' : 'text-sm @min-[1100px]/shell:text-lg')} data-testid="waiting-for">
      <span className="text-ink-2">{lead}</span>
      {viewerFirst(seats, me).map((s) => (
        <span key={s.id} className="flex items-center gap-1 font-semibold" data-testid={`waiting-${s.id}`}>
          <PlayerMark slot={toSlot(s.slot)} size={tv ? 30 : 14} glow={!s.away} />
          <span data-testid="waiting-name">{s.id === me ? 'you' : s.name}</span>
          {view && s.id !== me && <RepChip view={view} id={s.id} tv={tv} testid={`waiting-${s.id}-rep`} />}
          {s.away && <span className={cx('rounded-chip border border-warn/60 font-mono font-bold text-warn', tv ? 'px-2 text-lg' : 'px-1 text-[10px] @min-[1100px]/shell:text-xs')}>AWAY</span>}
          {/* The TV counts down in its picked list, beside this box's narrow column: once is enough there. */}
          {s.until !== undefined && !tv && <ClaudeCountdown until={s.until} status={s.status} testid="waiting-chip" />}
        </span>
      ))}
    </span>
  );
}
