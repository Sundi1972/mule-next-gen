import { GAME } from '@mule/engine';
import { Button, cx, HoloMap, TERRAIN_NAME, ZoomMap } from '@mule/ui';
import { mapTiles, PHASE_NAME, plotName, secondsUntil, TERRAIN_ODDS, tileAt } from '../game/derive';
import { SpecialLine } from '../components/SpecialLine';
import { useClient, useServerNow } from '../net/react';
import { GroundCard } from './ground';
import { usePhoneGame } from './game';
import { grantFooter } from './grant-ready';
import { connectedIn } from './hub/ready';
import { WaitingFor } from './hub/ReadyBar';
import { MapFit, PhoneShell } from './Shell';

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
        <>
          <button
            type="button"
            disabled={!canClaim}
            onClick={() => lit && client.intent({ type: 'claim', x: lit.x, y: lit.y })}
            className={cx(
              'flex h-16 shrink-0 select-none flex-col items-center justify-center gap-0.5 rounded-sheet font-display transition active:scale-[0.98] @min-[1100px]/shell:h-24',
              left === 0 ? 'border border-holo-faint bg-panel text-ink-3' : 'bg-holo text-on-holo shadow-glow hover:bg-holo-strong disabled:opacity-60',
            )}
          >
            <span className="text-4xl font-bold tracking-wide">{left === 0 ? 'Done' : 'CLAIM'}</span>
            <span className="font-mono text-xs font-bold">
              {left} OF {GAME.claimsPerGrant} CLAIMS LEFT
            </span>
          </button>
          {/* Done with land: Ready, as in planning. The grant ends once every seat has used its claims or is done. */}
          {done.ready ? (
            <span className="font-display text-base font-semibold text-holo @min-[1100px]/shell:text-xl" data-testid="you-are-ready">
              You're done with land
            </span>
          ) : (
            <Button size="md" variant="outline" className="w-full @min-[1100px]/shell:h-14 @min-[1100px]/shell:text-lg" onClick={() => client.intent({ type: 'ready' })} data-testid="ready">
              I'm ready
            </Button>
          )}
          {done.waiting.length > 0 && <WaitingFor seats={done.waiting} me={self.id} />}
        </>
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
