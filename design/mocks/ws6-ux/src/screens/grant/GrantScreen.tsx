import type { MuleView, PlayerView } from '@mule/protocol';
import { HoloMap, SeatSpeciesProvider, TERRAIN_NAME, ZoomMap, type Slot } from '@mule/ui';
import { useMemo, type ReactNode } from 'react';
import { SpecialLine } from '../../../../../../apps/web/src/components/SpecialLine';
import { mapTiles, PHASE_NAME, plotName, seatSpecies, TERRAIN_ODDS, tileAt } from '../../../../../../apps/web/src/game/derive';
import type { TableClient } from '../../../../../../apps/web/src/net/client';
import { ClientProvider } from '../../../../../../apps/web/src/net/react';
import { GroundCard } from '../../../../../../apps/web/src/phone/ground';
import { PhoneGameProvider, usePhoneGame } from '../../../../../../apps/web/src/phone/game';
import { grantFooter } from '../../../../../../apps/web/src/phone/grant-ready';
import { connectedIn } from '../../../../../../apps/web/src/phone/hub/ready';
import { MapFit } from '../../../../../../apps/web/src/phone/Shell';
import { IntentMarker } from '../../proposed/IntentNote';
import { CHAT, SECONDS } from './fixture';
import { CompactFooter, TodayFooter } from './GrantFooter';
import { GrantShell, useWide } from './GrantShell';
import { GRANT_NOTES } from './notes';

const ME = 'heiko';

/**
 * The real app's providers around one grant view, as Heiko's phone sees it. Its own stand-in client, not the
 * harness's: the table chat reads the players and the lines from the client's state, and the harness's has neither,
 * so its seat row would be empty and the header shorter than the product's.
 */
export function GrantGame({ view, children }: { view: MuleView; children: ReactNode }) {
  const value = useMemo(() => {
    const seats = view.players.map((p) => ({ id: p.id, name: p.name, isAi: p.isAi, connected: true, color: p.slot }));
    const table = { code: 'MULE', status: 'playing' as const, hostId: ME, seats, boards: 1, game: view };
    // One state object per view, never a fresh one per call: the chat reads it through useSyncExternalStore.
    const state = { status: 'open', role: 'player', code: 'MULE', seatId: ME, view: table, chat: CHAT, emotes: [], toasts: [], clockOffset: 0 };
    const client = {
      subscribe: () => () => {},
      getState: () => state,
      serverNow: () => Date.now(),
      intent: (i: unknown) => console.info('intent', i),
    } as unknown as TableClient;
    const self = view.players.find((p) => p.id === ME) as PlayerView;
    const slot = view.players.findIndex((p) => p.id === ME) as Slot;
    return { client, game: { table, view, me: view.me!, self, slot } };
  }, [view]);
  return (
    <ClientProvider client={value.client}>
      <SeatSpeciesProvider value={seatSpecies(view)}>
        <PhoneGameProvider value={value.game}>{children}</PhoneGameProvider>
      </SeatSpeciesProvider>
    </ClientProvider>
  );
}

/** The footer for this shell: compact under 1100 px, today's from there; today's everywhere for the comparison. */
function Footer({ today, marks }: { today: boolean; marks: boolean }) {
  const { table, view, me } = usePhoneGame();
  const wide = useWide();
  const lit = view.lit;
  const litTile = lit ? tileAt(view, lit.x, lit.y) : undefined;
  const left = me.claimsLeft;
  const done = grantFooter(view.players, ME, connectedIn(table.seats));
  const props = { left, canClaim: left > 0 && !!litTile && litTile.owner === null, ready: done.ready, waiting: done.waiting, me: ME };
  return today || wide ? <TodayFooter {...props} /> : <CompactFooter {...props} marks={marks} />;
}

/** The land grant's screen: LandGrant.tsx's stage and rail as they are, with the footer under review. */
export function GrantScreen({ today, marks = true }: { today: boolean; marks?: boolean }) {
  const { view, self, slot } = usePhoneGame();
  const lit = view.lit;
  const litTile = lit ? tileAt(view, lit.x, lit.y) : undefined;
  const ground = litTile?.ground;
  return (
    <GrantShell
      phase={PHASE_NAME.landGrant}
      seconds={SECONDS}
      rail={
        <>
          <div className="relative flex flex-col gap-1" data-testid="lit">
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
            {marks && !today && <IntentMarker note={GRANT_NOTES.G4} at="tr" />}
          </div>
          <p className="mt-auto font-mono text-xs text-ok">YOUR LAND · {self.plots} PLOT{self.plots === 1 ? '' : 'S'}</p>
        </>
      }
      footer={<Footer today={today} marks={marks} />}
    >
      <p className="pb-1.5 font-mono text-[11px] text-ink-3">PLOTS LIGHT UP ROW BY ROW · TAP CLAIM WHEN YOURS IS LIT</p>
      <MapFit width={view.width} height={view.height}>
        <ZoomMap width={view.width} height={view.height} tiles={mapTiles(view)} slot={slot}>
          <HoloMap width={view.width} height={view.height} tiles={mapTiles(view)} {...(lit ? { cursor: lit } : {})} focusSlot={slot} />
        </ZoomMap>
      </MapFit>
    </GrantShell>
  );
}
