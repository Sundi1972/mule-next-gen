import { GAME } from '@mule/engine';
import { cx, HoloMap, TERRAIN_NAME, ZoomMap } from '@mule/ui';
import { mapTiles, PHASE_NAME, plotName, secondsUntil, TERRAIN_ODDS, tileAt } from '../game/derive';
import { useClient, useServerNow } from '../net/react';
import { GroundCard } from './ground';
import { usePhoneGame } from './game';
import { MapFit, PhoneShell } from './Shell';

/** Land grant: free plots light up one by one. Slam CLAIM while the one you want is lit. */
export function LandGrant() {
  const client = useClient();
  const { view, me, self, slot } = usePhoneGame();
  const now = useServerNow(200);
  const lit = view.lit;
  const litTile = lit ? tileAt(view, lit.x, lit.y) : undefined;
  const left = me.claimsLeft;
  const canClaim = left > 0 && !!litTile && litTile.owner === null;
  const ground = litTile?.ground;

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
                {ground ? <GroundCard ground={ground} /> : <span className="text-sm text-ink-2">{TERRAIN_ODDS[litTile.terrain]}</span>}
              </>
            ) : (
              <span className="font-display text-xl font-semibold text-ink-3">No free land left</span>
            )}
          </div>
          <p className="mt-auto font-mono text-xs text-ok">YOUR LAND · {self.plots} PLOT{self.plots === 1 ? '' : 'S'}</p>
        </>
      }
      footer={
        <button
          type="button"
          disabled={!canClaim}
          onClick={() => lit && client.intent({ type: 'claim', x: lit.x, y: lit.y })}
          className={cx(
            'flex h-24 shrink-0 select-none flex-col items-center justify-center gap-0.5 rounded-sheet font-display transition active:scale-[0.98]',
            left === 0 ? 'border border-holo-faint bg-panel text-ink-3' : 'bg-holo text-on-holo shadow-glow hover:bg-holo-strong disabled:opacity-60',
          )}
        >
          <span className="text-4xl font-bold tracking-wide">{left === 0 ? 'Done' : 'CLAIM'}</span>
          <span className="font-mono text-xs font-bold">
            {left} OF {GAME.claimsPerGrant} CLAIMS LEFT
          </span>
        </button>
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
