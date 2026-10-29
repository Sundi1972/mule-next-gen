import { GAME } from '@mule/engine';
import { Button, cx, HoloMap, PlayerMark, TERRAIN_NAME, ZoomMap } from '@mule/ui';
import { mapTiles, PHASE_NAME, plotName, secondsUntil, TERRAIN_ODDS, tileAt, toSlot } from '../game/derive';
import { SpecialLine } from '../components/SpecialLine';
import { useClient, useServerNow } from '../net/react';
import { GroundCard } from './ground';
import { usePhoneGame } from './game';
import { grantFooter, waitingLine } from './grant-ready';
import { connectedIn, type Seat } from './hub/ready';
import { WaitingFor } from './hub/ReadyBar';
import { MapFit, PhoneShell, useWide } from './Shell';

/** Land grant: free plots light up one by one. Slam CLAIM while the one you want is lit. */
export function LandGrant() {
  const client = useClient();
  const { table, view, me, self, slot } = usePhoneGame();
  const now = useServerNow(200);
  const lit = view.lit;
  const litTile = lit ? tileAt(view, lit.x, lit.y) : undefined;
  const left = me.claimsLeft;
  const canClaim = left > 0 && !!litTile && litTile.owner === null;
  const ground = litTile?.ground;
  const done = grantFooter(view.players, self.id, connectedIn(table.seats));

  return (
    <PhoneShell
      phase={PHASE_NAME.landGrant}
      seconds={secondsUntil(view.phaseEndsAt, now)}
      fill
      rail={
        <>
          <div className="flex flex-col gap-1" data-testid="lit">
            <span className="label-caps">Lit now</span>
            {litTile ? (
              <>
                <span className="font-display text-xl font-semibold leading-tight">
                  {TERRAIN_NAME[litTile.terrain]} <span className="font-mono text-base text-ink-3">{plotName(litTile.x, litTile.y)}</span>
                </span>
                <SpecialLine special={litTile.special} />
                {ground ? (
                  <GroundCard ground={ground} />
                ) : (
                  <span className="text-sm text-ink-2" data-testid="terrain-hint">
                    {TERRAIN_ODDS[litTile.terrain]}
                  </span>
                )}
              </>
            ) : (
              <span className="font-display text-xl font-semibold text-ink-3">No free land left</span>
            )}
          </div>
          <p className="mt-auto font-mono text-xs text-ok">YOUR LAND · {self.plots} PLOT{self.plots === 1 ? '' : 'S'}</p>
        </>
      }
      footer={
        <GrantFooter
          left={left}
          canClaim={canClaim}
          ready={done.ready}
          waiting={done.waiting}
          me={self.id}
          onClaim={() => lit && client.intent({ type: 'claim', x: lit.x, y: lit.y })}
          onReady={() => client.intent({ type: 'ready' })}
        />
      }
    >
      <p className="pb-1.5 font-mono text-[11px] text-ink-3">PLOTS LIGHT UP ROW BY ROW · TAP CLAIM WHEN YOURS IS LIT</p>
      <MapFit width={view.width} height={view.height}>
        <ZoomMap width={view.width} height={view.height} tiles={mapTiles(view)} slot={slot}>
          <HoloMap width={view.width} height={view.height} tiles={mapTiles(view)} cursor={lit} focusSlot={slot} />
        </ZoomMap>
      </MapFit>
    </PhoneShell>
  );
}

interface FooterProps {
  left: number;
  canClaim: boolean;
  ready: boolean;
  waiting: Seat[];
  me: string;
  onClaim: () => void;
  onReady: () => void;
}

/**
 * The land grant's footer: the compact one under the shell's 1100 px (ws6-ux mock GrantFooter, PM ruling option 1),
 * the stacked one from there, where the laptop's rail is 900 px tall. Read inside PhoneShell, so useWide is the shell's.
 */
function GrantFooter(props: FooterProps) {
  return useWide() ? <WideFooter {...props} /> : <CompactFooter {...props} />;
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

/** From 1100 px: CLAIM h-24, then Ready full width, then WaitingFor, stacked. */
function WideFooter({ left, canClaim, ready, waiting, me, onClaim, onReady }: FooterProps) {
  return (
    <>
      <button
        type="button"
        disabled={!canClaim}
        onClick={onClaim}
        className={cx('flex h-24 shrink-0 select-none flex-col items-center justify-center gap-0.5 rounded-sheet font-display transition active:scale-[0.98]', claimLook(left))}
        data-testid="claim"
      >
        <ClaimLabel left={left} compact={false} />
      </button>
      {/* Done with land: Ready, as in planning. The grant ends once every seat has used its claims or is done. */}
      {ready ? (
        <span className="font-display text-base font-semibold text-holo @min-[1100px]/shell:text-xl" data-testid="you-are-ready">
          You're done with land
        </span>
      ) : (
        <Button size="lg" variant="outline" className="w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={onReady} data-testid="ready">
          I'm ready
        </Button>
      )}
      {waiting.length > 0 && <WaitingFor seats={waiting} me={me} />}
    </>
  );
}

/**
 * Who is still choosing, on one line that never wraps: the shorter names first and whole, the last name shown
 * truncating, the rest as "+N". Each with its creature, and AWAY for a dropped phone, as WaitingFor has them.
 */
function WaitingLine({ seats }: { seats: Seat[] }) {
  const { shown, more } = waitingLine(seats);
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
 * Under 1100 px: CLAIM and Ready side by side in one 56 px row, CLAIM the big primary (3/5 of the row, more than half
 * the rail), Ready the narrower outline; then who is still choosing, on one line. One child, so the shell's footer gap
 * does not apply and the row and the line sit 4 px apart.
 */
function CompactFooter({ left, canClaim, ready, waiting, onClaim, onReady }: FooterProps) {
  return (
    <div className="flex flex-col gap-1" data-testid="grant-footer">
      <div className="grid grid-cols-[3fr_2fr] gap-2" data-testid="claim-row">
        <button
          type="button"
          disabled={!canClaim}
          onClick={onClaim}
          className={cx('flex h-14 min-w-0 select-none flex-col items-center justify-center gap-0.5 rounded-sheet font-display transition active:scale-[0.98]', claimLook(left))}
          data-testid="claim"
        >
          <ClaimLabel left={left} compact />
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
          <Button size="lg" variant="outline" className="w-full min-w-0 whitespace-nowrap px-1 text-sm" onClick={onReady} data-testid="ready">
            I'm ready
          </Button>
        )}
      </div>
      {waiting.length > 0 && (
        <div className="min-w-0">
          <WaitingLine seats={waiting} />
        </div>
      )}
    </div>
  );
}
