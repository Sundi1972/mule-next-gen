import { GAME } from '@mule/engine';
import { Button, cx, PlayerMark } from '@mule/ui';
import { toSlot } from '../../../../../../apps/web/src/game/derive';
import type { Seat } from '../../../../../../apps/web/src/phone/hub/ready';
import { WaitingFor } from '../../../../../../apps/web/src/phone/hub/ReadyBar';
import { IntentMarker } from '../../proposed/IntentNote';
import { GRANT_NOTES } from './notes';

/**
 * The land grant's footer: today's, as apps/web/src/phone/LandGrant.tsx draws it, and the compact one the PM ruled
 * (option 1). GRAFT TARGET: LandGrant.tsx's `footer`, under the shell's 1100 px only; from 1100 px the laptop keeps
 * today's. Drop every IntentMarker.
 */

export interface FooterProps {
  left: number;
  canClaim: boolean;
  ready: boolean;
  waiting: Seat[];
  me: string;
}

/** CLAIM's two lines, the same in both footers. */
function ClaimLabel({ left, compact }: { left: number; compact: boolean }) {
  return (
    <>
      <span className={cx('font-bold tracking-wide', compact ? 'text-3xl leading-none' : 'text-4xl')}>{left === 0 ? 'Done' : 'CLAIM'}</span>
      <span className={cx('font-mono font-bold', compact ? 'text-[10px] leading-tight' : 'text-xs')} data-testid="claims-left">
        {left} OF {GAME.claimsPerGrant} CLAIMS LEFT
      </span>
    </>
  );
}

const claimLook = (left: number) => (left === 0 ? 'border border-holo-faint bg-panel text-ink-3' : 'bg-holo text-on-holo shadow-glow hover:bg-holo-strong disabled:opacity-60');

/** Today's footer, copied from LandGrant.tsx as it is: CLAIM h-24, then Ready full width, then WaitingFor, stacked. */
export function TodayFooter({ left, canClaim, ready, waiting, me }: FooterProps) {
  return (
    <>
      <button
        type="button"
        disabled={!canClaim}
        onClick={() => console.info('intent', { type: 'claim' })}
        className={cx('flex h-24 shrink-0 select-none flex-col items-center justify-center gap-0.5 rounded-sheet font-display transition active:scale-[0.98]', claimLook(left))}
        data-testid="claim"
      >
        <ClaimLabel left={left} compact={false} />
      </button>
      {ready ? (
        <span className="font-display text-base font-semibold text-holo @min-[1100px]/shell:text-xl" data-testid="you-are-ready">
          You're done with land
        </span>
      ) : (
        <Button size="lg" variant="outline" className="w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={() => console.info('intent', { type: 'ready' })} data-testid="ready">
          I'm ready
        </Button>
      )}
      {waiting.length > 0 && <WaitingFor seats={waiting} me={me} />}
    </>
  );
}

/** At most this many names on the one line; the rest are "+N". */
const NAMES_SHOWN = 2;

/**
 * Who is still choosing, on one line that never wraps: the shorter names first and whole, the last name shown
 * truncating, the rest as "+N". Each with its creature, and AWAY for a dropped phone, as WaitingFor has them.
 */
export function WaitingLine({ seats }: { seats: Seat[] }) {
  const byLength = [...seats].sort((a, b) => a.name.length - b.name.length);
  const shown = byLength.slice(0, NAMES_SHOWN);
  const more = seats.length - shown.length;
  return (
    <span className="flex min-w-0 items-center gap-x-1.5 overflow-hidden whitespace-nowrap text-xs leading-4" data-testid="waiting-for" aria-label={`Waiting for ${seats.map((s) => s.name).join(', ')}`}>
      <span className="shrink-0 text-ink-2">Waiting for</span>
      {shown.map((s, i) => {
        const last = i === shown.length - 1;
        return (
          <span key={s.id} className={cx('flex items-center gap-1 font-semibold', last ? 'min-w-0' : 'shrink-0')} data-testid={`waiting-${s.id}`}>
            <PlayerMark slot={toSlot(s.slot)} size={12} glow={!s.away} className="shrink-0" />
            <span className={cx('truncate', !last && 'max-w-24')}>{s.name}</span>
            {s.away && <span className="shrink-0 rounded-chip border border-warn/60 px-1 font-mono text-[9px] font-bold leading-3 text-warn">AWAY</span>}
          </span>
        );
      })}
      {more > 0 && (
        <span className="shrink-0 font-mono text-[11px] font-bold text-ink-2" data-testid="waiting-more">
          +{more}
        </span>
      )}
    </span>
  );
}

/**
 * The compact footer (PM ruling, option 1): CLAIM and Ready side by side in one 56 px row, CLAIM the big primary
 * (3/5 of the row, so more than half the rail), Ready the narrower outline; then who is still choosing, on one line.
 * One child, so the shell's footer gap does not apply and the row and the line sit 4 px apart.
 */
export function CompactFooter({ left, canClaim, ready, waiting, marks = true }: FooterProps & { marks?: boolean }) {
  return (
    <div className="flex flex-col gap-1" data-testid="grant-footer">
      <div className="relative grid grid-cols-[3fr_2fr] gap-2" data-testid="claim-row">
        <button
          type="button"
          disabled={!canClaim}
          onClick={() => console.info('intent', { type: 'claim' })}
          className={cx('relative flex h-14 min-w-0 select-none flex-col items-center justify-center gap-0.5 rounded-sheet font-display transition active:scale-[0.98]', claimLook(left))}
          data-testid="claim"
        >
          <ClaimLabel left={left} compact />
          {marks && <IntentMarker note={GRANT_NOTES.G2} at="tl" />}
        </button>
        {ready ? (
          // Not a button: a state, in Ready's box, so the row does not move. Three short lines at most on a 232 px rail.
          <span className="flex h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-control border border-holo-faint px-1 text-center font-display text-[11px] font-semibold leading-[13px] text-holo text-balance" data-testid="you-are-ready">
            <svg aria-hidden viewBox="0 0 24 24" width={12} height={12} className="shrink-0" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
            You're done with land
          </span>
        ) : (
          <Button size="lg" variant="outline" className="w-full min-w-0 whitespace-nowrap px-1 text-sm" onClick={() => console.info('intent', { type: 'ready' })} data-testid="ready">
            I'm ready
          </Button>
        )}
        {marks && <IntentMarker note={GRANT_NOTES.G1} at="tr" />}
      </div>
      {waiting.length > 0 && (
        <div className="relative min-w-0">
          <WaitingLine seats={waiting} />
          {marks && <IntentMarker note={GRANT_NOTES.G3} at="left" />}
        </div>
      )}
    </div>
  );
}
