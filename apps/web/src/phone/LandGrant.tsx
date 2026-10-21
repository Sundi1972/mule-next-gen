import { GAME } from '@mule/engine';
import { cx, HoloMap, TERRAIN_NAME } from '@mule/ui';
import { mapTiles, PHASE_NAME, plotName, secondsUntil, TERRAIN_ODDS, tileAt } from '../game/derive';
import { useClient, useServerNow } from '../net/react';
import { GroundCard } from './ground';
import { usePhoneGame } from './game';
import { PhoneShell } from './Shell';

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
    <PhoneShell phase={PHASE_NAME.landGrant} seconds={secondsUntil(view.phaseEndsAt, now)}>
      <div className="flex h-full flex-col gap-4">
        <p className="font-mono text-xs text-ink-3">PLOTS LIGHT UP AT RANDOM · TAP CLAIM WHEN YOURS IS LIT</p>
        <HoloMap width={view.width} height={view.height} tiles={mapTiles(view)} cursor={lit} focusSlot={slot} />
        <div className="flex flex-col gap-1 rounded-panel border border-holo-line bg-panel p-4" data-testid="lit">
          <span className="label-caps">Lit now</span>
          {litTile ? (
            <>
              <span className="font-display text-2xl font-semibold">
                {TERRAIN_NAME[litTile.terrain]} <span className="font-mono text-lg text-ink-3">{plotName(litTile.x, litTile.y)}</span>
              </span>
              {ground ? <GroundCard ground={ground} /> : <span className="text-ink-2">{TERRAIN_ODDS[litTile.terrain]}</span>}
            </>
          ) : (
            <span className="font-display text-2xl font-semibold text-ink-3">No free land left</span>
          )}
        </div>
        <button
          type="button"
          disabled={!canClaim}
          onClick={() => lit && client.intent({ type: 'claim', x: lit.x, y: lit.y })}
          className={cx(
            'mt-auto flex h-36 shrink-0 select-none flex-col items-center justify-center gap-1 rounded-sheet font-display transition active:scale-[0.98]',
            left === 0 ? 'border border-holo-faint bg-panel text-ink-3' : 'bg-holo text-on-holo shadow-glow hover:bg-holo-strong disabled:opacity-60',
          )}
        >
          <span className="text-5xl font-bold tracking-wide">{left === 0 ? 'Done' : 'CLAIM'}</span>
          <span className="font-mono text-sm font-bold">
            {left} OF {GAME.claimsPerGrant} CLAIMS LEFT
          </span>
        </button>
        <p className="font-mono text-sm text-ok">YOUR LAND · {self.plots} PLOT{self.plots === 1 ? '' : 'S'}</p>
      </div>
    </PhoneShell>
  );
}
